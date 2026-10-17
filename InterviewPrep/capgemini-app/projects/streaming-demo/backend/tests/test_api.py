"""API tests: the run lifecycle over SSE, resume with Last-Event-ID, approvals and cancellation over the control
socket, auth, and the timeouts. Delays are zero so the whole suite runs in about a second."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import create_app
from app.runs import PLAN, Run, Settings

TOKEN = "test-token"
AUTH = {"Authorization": f"Bearer {TOKEN}"}


def make_client(**overrides: Any) -> TestClient:
    settings = Settings(token_delay=0, tool_delay=0, approval_timeout=5, abandon_grace=5, demo_token=TOKEN)
    for name, value in overrides.items():
        setattr(settings, name, value)
    return TestClient(create_app(settings))


@pytest.fixture
def client() -> Iterator[TestClient]:
    # The "with" keeps one event loop running for the whole test, so runs keep going between requests.
    with make_client() as c:
        yield c


def parse_sse(text: str) -> list[dict[str, Any]]:
    """Turns an event-stream body into [{"id", "event", "data", "comment"}] dicts (data JSON-decoded)."""
    events = []
    for block in text.replace("\r\n", "\n").split("\n\n"):
        if not block.strip():
            continue
        event: dict[str, Any] = {}
        for line in block.split("\n"):
            field, _, value = line.partition(":")
            value = value.removeprefix(" ")
            if field == "":
                event["comment"] = value
            elif field == "data":
                event["data"] = json.loads(value)
            else:
                event[field] = value
        events.append(event)
    return events


def stream(client: TestClient, run_id: str, last_event_id: int | None = None) -> list[dict[str, Any]]:
    headers = dict(AUTH)
    if last_event_id is not None:
        headers["Last-Event-ID"] = str(last_event_id)
    with client.stream("GET", f"/api/runs/{run_id}/events", headers=headers) as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        assert response.headers["cache-control"] == "no-cache"
        return [e for e in parse_sse(response.read().decode()) if "event" in e]


def start(client: TestClient, prompt: str = "Order parts for the open network tickets") -> str:
    response = client.post("/api/runs", json={"prompt": prompt}, headers=AUTH)
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["events_url"] == f"/api/runs/{body['run_id']}/events"
    return body["run_id"]


def wait_for_status(client: TestClient, run_id: str, wanted: str, timeout: float = 5) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        summary = client.get(f"/api/runs/{run_id}", headers=AUTH).json()
        if summary["status"] == wanted:
            return summary
        time.sleep(0.01)
    raise AssertionError(f"run never reached {wanted!r}; last summary {summary}")


def open_control(client: TestClient, run_id: str):
    ws = client.websocket_connect(f"/api/runs/{run_id}/control")
    return ws


def text_of(events: list[dict[str, Any]], step_id: str) -> str:
    return "".join(e["data"]["text"] for e in events if e["event"] == "token" and e["data"]["step_id"] == step_id)


# ---- auth and validation -----------------------------------------------------------------------------------------


def test_requests_need_the_bearer_token(client: TestClient) -> None:
    assert client.post("/api/runs", json={"prompt": "hi"}).status_code == 401
    wrong = client.post("/api/runs", json={"prompt": "hi"}, headers={"Authorization": "Bearer nope"})
    assert wrong.status_code == 401
    assert wrong.headers["www-authenticate"] == "Bearer"


def test_prompt_is_validated(client: TestClient) -> None:
    assert client.post("/api/runs", json={"prompt": ""}, headers=AUTH).status_code == 422
    assert client.post("/api/runs", json={}, headers=AUTH).status_code == 422


def test_unknown_run_is_404_before_any_streaming(client: TestClient) -> None:
    assert client.get("/api/runs/run_missing", headers=AUTH).status_code == 404
    assert client.get("/api/runs/run_missing/events", headers=AUTH).status_code == 404


# ---- the happy path --------------------------------------------------------------------------------------------


def test_approved_run_streams_every_event_in_order(client: TestClient) -> None:
    run_id = start(client)
    wait_for_status(client, run_id, "awaiting_approval")

    with open_control(client, run_id) as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        assert ws.receive_json() == {"type": "ready", "run_id": run_id, "status": "awaiting_approval"}
        ws.send_json({"type": "approve", "request_id": "r1", "step_id": "po", "approved": True})
        assert ws.receive_json() == {"type": "ack", "request_id": "r1", "result": "ok"}
        # A retry of the same decision (say the ack was lost) is harmless...
        ws.send_json({"type": "approve", "request_id": "r1", "step_id": "po", "approved": True})
        assert ws.receive_json() == {"type": "ack", "request_id": "r1", "result": "duplicate"}
        # ...but a contradicting decision is rejected.
        ws.send_json({"type": "approve", "request_id": "r2", "step_id": "po", "approved": False})
        assert ws.receive_json() == {"type": "error", "request_id": "r2", "code": "stale_approval"}

    wait_for_status(client, run_id, "completed")
    events = stream(client, run_id)
    assert [int(e["id"]) for e in events] == list(range(1, len(events) + 1))  # contiguous ids
    types = [e["event"] for e in events]
    assert types[0] == "run.started" and types[-1] == "run.completed"
    assert types.index("approval.required") < types.index("approval.resolved")
    resolved = next(e for e in events if e["event"] == "approval.resolved")
    assert resolved["data"] == {"step_id": "po", "approved": True, "decided_by": "user"}
    results = [e["data"]["result"] for e in events if e["event"] == "tool.result"]
    assert results[-1] == {"po_number": "PO-1001"}
    assert text_of(events, "plan") == PLAN
    assert text_of(events, "answer").startswith("Done. I created purchase order PO-1001")


def test_rejected_run_skips_the_tool_call(client: TestClient) -> None:
    run_id = start(client)
    wait_for_status(client, run_id, "awaiting_approval")
    with open_control(client, run_id) as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        ws.receive_json()
        ws.send_json({"type": "approve", "request_id": "r1", "step_id": "po", "approved": False})
        assert ws.receive_json()["result"] == "ok"
    wait_for_status(client, run_id, "completed")
    events = stream(client, run_id)
    assert any(e["event"] == "step.skipped" for e in events)
    assert "create_purchase_order" not in [e["data"].get("tool") for e in events if e["event"] == "tool.call"]
    assert text_of(events, "answer").startswith("Understood. I did not create")


# ---- resume ----------------------------------------------------------------------------------------------------


def test_last_event_id_resumes_after_that_event(client: TestClient) -> None:
    run_id = start(client)
    wait_for_status(client, run_id, "awaiting_approval")
    client.delete(f"/api/runs/{run_id}", headers=AUTH)
    wait_for_status(client, run_id, "cancelled")
    everything = stream(client, run_id)
    resumed = stream(client, run_id, last_event_id=5)
    assert resumed == everything[5:]
    assert resumed[0]["id"] == "6"
    # Already up to date with a finished run: the stream ends at once, with no events.
    assert stream(client, run_id, last_event_id=len(everything)) == []


def test_invalid_last_event_id_is_rejected(client: TestClient) -> None:
    run_id = start(client)
    bad = client.get(f"/api/runs/{run_id}/events", headers={**AUTH, "Last-Event-ID": "abc"})
    assert bad.status_code == 422
    client.delete(f"/api/runs/{run_id}", headers=AUTH)


def test_events_after_waits_for_new_events_and_stops_at_the_terminal_one() -> None:
    async def scenario() -> list[int]:
        run = Run(id="r", prompt="p", settings=Settings())
        for i in range(3):
            await run.emit("token", text=str(i))
        seen: list[int] = []

        async def reader() -> None:
            async for event in run.events_after(2):
                seen.append(event.id)

        task = asyncio.create_task(reader())
        await asyncio.sleep(0)
        await run.emit("token", text="3")
        await run.finish("completed")
        await asyncio.wait_for(task, 1)
        return seen

    assert asyncio.run(scenario()) == [3, 4, 5]


def test_events_after_an_id_the_log_has_not_reached_yet_waits_for_it() -> None:
    async def scenario() -> list[int]:
        run = Run(id="r", prompt="p", settings=Settings())
        await run.emit("token", text="0")
        seen: list[int] = []

        async def reader() -> None:
            async for event in run.events_after(3):  # e.g. two tabs, one slightly ahead
                seen.append(event.id)

        task = asyncio.create_task(reader())
        for i in range(1, 4):
            await run.emit("token", text=str(i))
        await run.finish("completed")
        await asyncio.wait_for(task, 1)
        return seen

    assert asyncio.run(scenario()) == [4, 5]


# ---- cancellation and timeouts ---------------------------------------------------------------------------------


def test_cancel_over_the_socket(client: TestClient) -> None:
    run_id = start(client)
    wait_for_status(client, run_id, "awaiting_approval")
    with open_control(client, run_id) as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        ws.receive_json()
        ws.send_json({"type": "cancel", "request_id": "c1"})
        assert ws.receive_json() == {"type": "ack", "request_id": "c1", "result": "cancelled"}
        wait_for_status(client, run_id, "cancelled")
        ws.send_json({"type": "cancel", "request_id": "c2"})
        assert ws.receive_json() == {"type": "ack", "request_id": "c2", "result": "already_finished"}
    events = stream(client, run_id)
    assert events[-1]["event"] == "run.cancelled"
    assert events[-1]["data"] == {"reason": "cancelled by user"}


def test_cancel_with_delete(client: TestClient) -> None:
    run_id = start(client)
    response = client.delete(f"/api/runs/{run_id}", headers=AUTH)
    assert response.status_code == 202
    wait_for_status(client, run_id, "cancelled")


def test_approval_carries_an_absolute_deadline_for_replays(client: TestClient) -> None:
    run_id = start(client)
    wait_for_status(client, run_id, "awaiting_approval")
    client.delete(f"/api/runs/{run_id}", headers=AUTH)
    wait_for_status(client, run_id, "cancelled")
    required = next(e for e in stream(client, run_id) if e["event"] == "approval.required")
    # Settings above use a 5 s approval timeout; the deadline is wall-clock milliseconds, so a client replaying the
    # log after a reload shows the time really left instead of a fresh countdown.
    assert required["data"]["timeout_s"] == 5
    assert 0 < required["data"]["expires_at_ms"] - time.time() * 1000 <= 5000


def test_a_decision_in_the_same_tick_as_the_timeout_wins(monkeypatch: pytest.MonkeyPatch) -> None:
    """The approve message and the timeout can land in one event-loop tick: the decision is recorded and acked
    "ok", then the timeout fires. Simulate exactly that ordering; the run must honour the acked decision."""

    async def scenario() -> tuple[bool, dict[str, Any], str]:
        run = Run(id="r", prompt="p", settings=Settings(approval_timeout=1))

        async def decision_then_timeout(future: asyncio.Future[bool], timeout: float) -> bool:
            assert run.resolve_approval("po", True) == "ok"
            raise TimeoutError

        monkeypatch.setattr(asyncio, "wait_for", decision_then_timeout)
        approved = await run.wait_for_approval("po", "create_purchase_order", {})
        return approved, run.events[-1].data, run.resolve_approval("po", True)

    approved, resolved, retry = asyncio.run(scenario())
    assert approved is True
    assert resolved == {"step_id": "po", "approved": True, "decided_by": "user"}
    assert retry == "duplicate"


def test_a_client_disconnect_ends_the_stream_and_starts_the_grace_period() -> None:
    """TestClient reads whole bodies, so drive the ASGI app directly: read the first event, then hang up."""

    async def scenario() -> tuple[int, int, str, str | None]:
        settings = Settings(token_delay=0.01, tool_delay=0, approval_timeout=5, abandon_grace=0.2, demo_token=TOKEN)
        app = create_app(settings)
        run = app.state.store.start("Order parts")
        got_event, hang_up = asyncio.Event(), asyncio.Event()
        requests = [{"type": "http.request", "body": b"", "more_body": False}]

        async def receive() -> dict[str, Any]:
            if requests:
                return requests.pop()
            await hang_up.wait()
            return {"type": "http.disconnect"}

        async def send(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.body" and b"event:" in message.get("body", b""):
                got_event.set()

        path = f"/api/runs/{run.id}/events"
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http",
            "path": path, "raw_path": path.encode(), "query_string": b"", "root_path": "",
            "headers": [(b"authorization", f"Bearer {TOKEN}".encode())],
            "client": ("127.0.0.1", 5000), "server": ("testserver", 80),
        }
        response = asyncio.create_task(app(scope, receive, send))
        await asyncio.wait_for(got_event.wait(), 2)
        watching = run.watchers
        hang_up.set()
        await asyncio.wait_for(response, 2)  # the stream ends instead of waiting for more events
        after = run.watchers
        await asyncio.wait_for(run.task, 2)  # nobody comes back within the grace period
        return watching, after, run.status, run.cancel_reason

    assert asyncio.run(scenario()) == (1, 0, "cancelled", "abandoned")


def test_unanswered_approval_times_out_as_rejected() -> None:
    with make_client(approval_timeout=0.2) as client:
        run_id = start(client)
        wait_for_status(client, run_id, "completed")
        events = stream(client, run_id)
        resolved = next(e for e in events if e["event"] == "approval.resolved")
        assert resolved["data"] == {"step_id": "po", "approved": False, "decided_by": "timeout"}


def test_abandoned_run_is_cancelled_after_the_grace_period() -> None:
    with make_client(abandon_grace=0.2) as client:
        run_id = start(client)  # nobody ever opens the stream or the socket
        wait_for_status(client, run_id, "cancelled")
        assert stream(client, run_id)[-1]["data"] == {"reason": "abandoned"}


# ---- the control socket ----------------------------------------------------------------------------------------


def test_socket_needs_a_valid_auth_message_first(client: TestClient) -> None:
    run_id = start(client)
    for first in ({"type": "auth", "token": "wrong"}, {"type": "ping"}):
        with open_control(client, run_id) as ws:
            ws.send_json(first)
            with pytest.raises(WebSocketDisconnect) as closed:
                ws.receive_json()
            assert closed.value.code == 1008
    with open_control(client, "run_missing") as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 4404
    client.delete(f"/api/runs/{run_id}", headers=AUTH)


def test_ping_pong_and_bad_messages(client: TestClient) -> None:
    run_id = start(client)
    with open_control(client, run_id) as ws:
        ws.send_json({"type": "auth", "token": TOKEN})
        ws.receive_json()
        ws.send_json({"type": "ping", "id": 7})
        assert ws.receive_json() == {"type": "pong", "id": 7}
        ws.send_text("not json")
        assert ws.receive_json()["code"] == "bad_request"
        ws.send_json({"type": "approve", "step_id": "po"})  # missing fields
        assert ws.receive_json()["code"] == "bad_request"
        ws.send_json({"type": "approve", "request_id": "x", "step_id": "nope", "approved": True})
        assert ws.receive_json() == {"type": "error", "request_id": "x", "code": "stale_approval"}
    client.delete(f"/api/runs/{run_id}", headers=AUTH)
