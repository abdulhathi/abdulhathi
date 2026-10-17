"""HTTP and WebSocket API for the streaming agent demo.

    POST   /api/runs                    start a run                       → 201 {run_id, events_url, control_url}
    GET    /api/runs/{id}               status and last event id
    GET    /api/runs/{id}/events        SSE stream; send Last-Event-ID to resume after a drop
    DELETE /api/runs/{id}               cancel (REST fallback when the socket is down)
    WS     /api/runs/{id}/control       approve or cancel mid-run; app-level ping/pong

Run it:  uvicorn app.main:app --port 8010   (from the backend folder)
"""

# No "from __future__ import annotations" here: FastAPI must evaluate Annotated[Run, Depends(get_run)], and
# get_run is local to create_app, so string annotations would silently turn `run` into a query parameter.
import asyncio
from collections.abc import AsyncIterator
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel, Field, TypeAdapter, ValidationError

from .runs import Run, RunStore, Settings, Status


class StartRun(BaseModel):
    prompt: str = Field(min_length=1, max_length=2000)


class RunCreated(BaseModel):
    run_id: str
    status: Status
    events_url: str
    control_url: str


class RunSummary(BaseModel):
    run_id: str
    status: Status
    last_event_id: int
    watchers: int


# Messages the browser sends on the control socket. The "type" field picks the model.
class Auth(BaseModel):
    type: Literal["auth"]
    token: str


class Ping(BaseModel):
    type: Literal["ping"]
    id: int = 0


class Approve(BaseModel):
    type: Literal["approve"]
    request_id: str
    step_id: str
    approved: bool


class Cancel(BaseModel):
    type: Literal["cancel"]
    request_id: str


ControlMessage = TypeAdapter(Annotated[Ping | Approve | Cancel, Field(discriminator="type")])
AUTH_TIMEOUT_S = 5.0
CLOSE_POLICY_VIOLATION = 1008  # standard close code for "you are not allowed"
CLOSE_NOT_FOUND = 4404  # 4000-4999 are free for applications


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    store = RunStore(settings)
    app = FastAPI(title="Streaming agent demo")
    app.state.store = store

    def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
        if authorization != f"Bearer {settings.demo_token}":
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED, "Missing or invalid bearer token", headers={"WWW-Authenticate": "Bearer"}
            )

    def get_run(run_id: str) -> Run:
        # Resolved before streaming starts, so an unknown id is a clean 404 rather than a broken stream.
        run = store.get(run_id)
        if run is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Run not found")
        return run

    authed = [Depends(require_token)]

    @app.post("/api/runs", status_code=status.HTTP_201_CREATED, dependencies=authed)
    async def start_run(body: StartRun) -> RunCreated:
        run = store.start(body.prompt)
        return RunCreated(
            run_id=run.id,
            status=run.status,
            events_url=f"/api/runs/{run.id}/events",
            control_url=f"/api/runs/{run.id}/control",
        )

    @app.get("/api/runs/{run_id}", dependencies=authed)
    async def run_summary(run: Annotated[Run, Depends(get_run)]) -> RunSummary:
        return RunSummary(run_id=run.id, status=run.status, last_event_id=run.last_event_id, watchers=run.watchers)

    @app.get("/api/runs/{run_id}/events", response_class=EventSourceResponse, dependencies=authed)
    async def run_events(
        run: Annotated[Run, Depends(get_run)],
        last_event_id: Annotated[int, Header(ge=0)] = 0,  # the Last-Event-ID header
    ) -> AsyncIterator[ServerSentEvent]:
        with run.watching():
            # A comment confirms the stream is open; retry tells an EventSource client how long to wait to reconnect.
            yield ServerSentEvent(comment="stream open", retry=2000)
            async for event in run.events_after(last_event_id):
                yield ServerSentEvent(id=str(event.id), event=event.type, data=event.data)
        # FastAPI sends ": ping" keep-alive comments by itself when the stream is idle for 15 s.

    @app.delete("/api/runs/{run_id}", status_code=status.HTTP_202_ACCEPTED, dependencies=authed)
    async def cancel_run(run: Annotated[Run, Depends(get_run)]) -> RunSummary:
        run.cancel("cancelled by user")
        return RunSummary(run_id=run.id, status=run.status, last_event_id=run.last_event_id, watchers=run.watchers)

    @app.websocket("/api/runs/{run_id}/control")
    async def control(ws: WebSocket, run_id: str) -> None:
        await ws.accept()
        # Browsers cannot set headers on a WebSocket, so the token comes in the first message, never in the URL
        # (URLs end up in logs). No valid auth message within 5 seconds closes the socket.
        try:
            auth = Auth.model_validate_json(await asyncio.wait_for(ws.receive_text(), AUTH_TIMEOUT_S))
        except WebSocketDisconnect:
            return
        except (TimeoutError, ValidationError):
            await ws.close(CLOSE_POLICY_VIOLATION, "auth message required")
            return
        if auth.token != settings.demo_token:
            await ws.close(CLOSE_POLICY_VIOLATION, "invalid token")
            return
        run = store.get(run_id)
        if run is None:
            await ws.close(CLOSE_NOT_FOUND, "run not found")
            return

        await ws.send_json({"type": "ready", "run_id": run.id, "status": run.status})
        with run.watching():
            try:
                while True:
                    raw = await ws.receive_text()
                    try:
                        msg = ControlMessage.validate_json(raw)
                    except ValidationError as exc:
                        await ws.send_json({"type": "error", "code": "bad_request", "detail": exc.errors()[0]["msg"]})
                        continue
                    match msg:
                        case Ping():
                            await ws.send_json({"type": "pong", "id": msg.id})
                        case Approve():
                            result = run.resolve_approval(msg.step_id, msg.approved)
                            if result == "stale":
                                await ws.send_json(
                                    {"type": "error", "request_id": msg.request_id, "code": "stale_approval"}
                                )
                            else:
                                await ws.send_json({"type": "ack", "request_id": msg.request_id, "result": result})
                        case Cancel():
                            result = "cancelled" if run.cancel("cancelled by user") else "already_finished"
                            await ws.send_json({"type": "ack", "request_id": msg.request_id, "result": result})
            except WebSocketDisconnect:
                pass

    return app


app = create_app()
