"""Agent runs kept in memory: an append-only event log per run, a fake LLM, and the agent's script.

The event log is the heart of the design. The agent task appends events; every SSE connection reads the log from
the id it last saw. So a client that drops and reconnects with Last-Event-ID misses nothing, a slow client never
slows the agent down, and two tabs watching the same run see the same events in the same order.
"""

from __future__ import annotations

import asyncio
import os
import re
import time
import uuid
from collections.abc import AsyncIterator, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any, Literal

Status = Literal["running", "awaiting_approval", "completed", "cancelled", "failed"]
FINISHED: set[Status] = {"completed", "cancelled", "failed"}
TERMINAL_EVENTS = {"run.completed", "run.cancelled", "run.failed"}
ApprovalResult = Literal["ok", "duplicate", "stale"]


@dataclass
class Settings:
    token_delay: float = 0.03  # seconds between fake LLM tokens
    tool_delay: float = 0.4  # how long a fake tool call takes
    approval_timeout: float = 120.0  # a pending approval is rejected after this long
    abandon_grace: float = 15.0  # a run nobody watches for this long is cancelled
    max_runs: int = 200
    demo_token: str = "demo-token"  # stands in for a real OIDC access token

    @classmethod
    def from_env(cls) -> Settings:
        def num(name: str, default: float) -> float:
            return float(os.environ.get(name, default))

        return cls(
            token_delay=num("DEMO_TOKEN_DELAY", cls.token_delay),
            tool_delay=num("DEMO_TOOL_DELAY", cls.tool_delay),
            approval_timeout=num("DEMO_APPROVAL_TIMEOUT", cls.approval_timeout),
            abandon_grace=num("DEMO_ABANDON_GRACE", cls.abandon_grace),
            demo_token=os.environ.get("DEMO_AUTH_TOKEN", cls.demo_token),
        )


@dataclass(frozen=True)
class Event:
    id: int  # 1, 2, 3, ... per run, so "resume after id N" is a list slice
    type: str
    data: dict[str, Any]


@dataclass
class PendingApproval:
    step_id: str
    future: asyncio.Future[bool]


@dataclass
class Run:
    id: str
    prompt: str
    settings: Settings
    status: Status = "running"
    events: list[Event] = field(default_factory=list)
    watchers: int = 0
    cancel_reason: str | None = None
    task: asyncio.Task[None] | None = None
    _pending: PendingApproval | None = None
    _decisions: dict[str, bool] = field(default_factory=dict)
    _reaper: asyncio.Task[None] | None = None
    _changed: asyncio.Condition = field(default_factory=asyncio.Condition)

    @property
    def finished(self) -> bool:
        return self.status in FINISHED

    @property
    def last_event_id(self) -> int:
        return len(self.events)

    # ---- the event log -------------------------------------------------------------------------------------------

    async def emit(self, type: str, **data: Any) -> Event:
        async with self._changed:
            event = Event(len(self.events) + 1, type, data)
            self.events.append(event)
            self._changed.notify_all()
        return event

    async def events_after(self, last_id: int) -> AsyncIterator[Event]:
        """Every event with id > last_id: first the backlog, then new ones as they arrive, ending after the
        terminal event. A finished run with nothing newer ends at once."""
        seen = max(0, last_id)  # trust the client's id: it never gets events it says it already has
        while True:
            async with self._changed:
                await self._changed.wait_for(lambda: len(self.events) > seen or self.finished)
                batch = self.events[seen:]
            if not batch:
                return
            for event in batch:
                yield event
                seen = event.id
                if event.type in TERMINAL_EVENTS:
                    return

    async def finish(self, status: Status, **data: Any) -> None:
        if self.finished:
            return
        self.status = status
        await self.emit(f"run.{status}", **data)

    # ---- watchers and abandoned runs -------------------------------------------------------------------------------

    @contextmanager
    def watching(self) -> Iterator[None]:
        """Count an open SSE stream or control socket. When the last one closes, give the client a grace period
        to reconnect before cancelling the run, so a flaky network does not kill work but an abandoned run does
        not keep spending tokens."""
        self.watchers += 1
        if self._reaper:
            self._reaper.cancel()
            self._reaper = None
        try:
            yield
        finally:
            self.watchers -= 1
            if self.watchers == 0:
                self.schedule_reaper()

    def schedule_reaper(self) -> None:
        if self.finished or self._reaper:
            return

        async def reap() -> None:
            await asyncio.sleep(self.settings.abandon_grace)
            self._reaper = None
            if self.watchers == 0:
                self.cancel("abandoned")

        self._reaper = asyncio.get_running_loop().create_task(reap())

    def cancel(self, reason: str) -> bool:
        if self.finished or not self.task or self.task.done():
            return False
        self.cancel_reason = reason
        self.task.cancel()
        return True

    # ---- human-in-the-loop approval ----------------------------------------------------------------------------

    async def wait_for_approval(self, step_id: str, action: str, details: dict[str, Any]) -> bool:
        future: asyncio.Future[bool] = asyncio.get_running_loop().create_future()
        self._pending = PendingApproval(step_id, future)
        self.status = "awaiting_approval"
        await self.emit(
            "approval.required",
            step_id=step_id,
            action=action,
            details=details,
            timeout_s=self.settings.approval_timeout,
            # An absolute deadline, so a client replaying the log after a reload shows the real time left
            # instead of restarting the countdown.
            expires_at_ms=round((time.time() + self.settings.approval_timeout) * 1000),
        )
        decided_by = "user"
        try:
            approved = await asyncio.wait_for(future, self.settings.approval_timeout)
        except TimeoutError:
            if step_id in self._decisions:
                # The decision arrived in the same event-loop tick as the timeout. The client has already been
                # told "ok", so the decision wins rather than being silently turned into a rejection.
                approved = self._decisions[step_id]
            else:
                approved, decided_by = False, "timeout"
                self._decisions[step_id] = False
        finally:
            self._pending = None
        self.status = "running"
        await self.emit("approval.resolved", step_id=step_id, approved=approved, decided_by=decided_by)
        return approved

    def resolve_approval(self, step_id: str, approved: bool) -> ApprovalResult:
        """Idempotent: repeating the same decision (a retry after a dropped ack) is "duplicate", not an error.
        A decision for a step that is not waiting, or that contradicts the recorded one, is "stale"."""
        if step_id in self._decisions:
            return "duplicate" if self._decisions[step_id] == approved else "stale"
        pending = self._pending
        if pending is None or pending.step_id != step_id or pending.future.done():
            return "stale"
        self._decisions[step_id] = approved
        pending.future.set_result(approved)
        return "ok"


# ---- the fake LLM and the agent's script -----------------------------------------------------------------------

PLAN = "I'll look up the open tickets for this vendor, then draft a purchase order for your approval."


async def fake_llm(text: str, delay: float) -> AsyncIterator[str]:
    """Streams a reply word by word (with its trailing space), like an LLM streaming tokens."""
    for token in re.findall(r"\S+\s*", text):
        await asyncio.sleep(delay)
        yield token


async def stream_text(run: Run, step_id: str, text: str) -> None:
    async for token in fake_llm(text, run.settings.token_delay):
        await run.emit("token", step_id=step_id, text=token)


async def agent_script(run: Run) -> None:
    s = run.settings
    try:
        await run.emit("run.started", prompt=run.prompt)

        await run.emit("step.started", step_id="plan", title="Plan")
        await stream_text(run, "plan", PLAN)
        await run.emit("step.completed", step_id="plan")

        await run.emit("step.started", step_id="lookup", title="Look up open tickets")
        await run.emit("tool.call", step_id="lookup", tool="search_tickets", args={"query": run.prompt[:80]})
        await asyncio.sleep(s.tool_delay)
        tickets = [{"id": "INC-2041", "summary": "Replace failed switch"}, {"id": "INC-2047", "summary": "Rack PDU"}]
        await run.emit("tool.result", step_id="lookup", tool="search_tickets", result={"tickets": tickets})
        await run.emit("step.completed", step_id="lookup")

        await run.emit("step.started", step_id="po", title="Create purchase order")
        order = {"vendor": "Acme Supplies", "amount": 1250.00, "currency": "USD", "tickets": ["INC-2041", "INC-2047"]}
        if await run.wait_for_approval("po", action="create_purchase_order", details=order):
            await run.emit("tool.call", step_id="po", tool="create_purchase_order", args=order)
            await asyncio.sleep(s.tool_delay)
            await run.emit("tool.result", step_id="po", tool="create_purchase_order", result={"po_number": "PO-1001"})
            answer = "Done. I created purchase order PO-1001 for $1,250.00 with Acme Supplies, covering both tickets."
        else:
            await run.emit("step.skipped", step_id="po", reason="not approved")
            answer = "Understood. I did not create the purchase order. The two open tickets are still unassigned."
        await run.emit("step.completed", step_id="po")

        await run.emit("step.started", step_id="answer", title="Answer")
        await stream_text(run, "answer", answer)
        await run.emit("step.completed", step_id="answer")
        await run.finish("completed")
    except asyncio.CancelledError:
        # Record why the run stopped, then let the task end. The cancellation came from Run.cancel.
        await run.finish("cancelled", reason=run.cancel_reason or "cancelled")
    except Exception as exc:  # a real agent would also log and trace this
        await run.finish("failed", error=str(exc))


class RunStore:
    """All runs in this process. In production the event log lives in a shared store (Redis Streams, Firestore or
    Postgres) so any instance can serve any stream; see the README."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.runs: dict[str, Run] = {}

    def get(self, run_id: str) -> Run | None:
        return self.runs.get(run_id)

    def start(self, prompt: str) -> Run:
        self._prune()
        run = Run(id=f"run_{uuid.uuid4().hex[:12]}", prompt=prompt, settings=self.settings)
        self.runs[run.id] = run
        run.task = asyncio.get_running_loop().create_task(agent_script(run))
        run.schedule_reaper()  # cancelled if nobody ever connects
        return run

    def _prune(self) -> None:
        finished = [r for r in self.runs.values() if r.finished]
        for run in finished[: max(0, len(self.runs) - self.settings.max_runs + 1)]:
            del self.runs[run.id]
