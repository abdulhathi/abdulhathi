---
title: Python services with FastAPI and asyncio
goal: Explain exactly how FastAPI runs async and sync code, avoid blocking the event loop, use Pydantic models as the API contract, and build streaming, WebSocket and well-tested endpoints.
minutes: 50
---

You built the Document AI platform's backend in FastAPI with Pydantic, so this is home ground. For this role the interviewer will push past CRUD into the **concurrency model**: what `async def` actually buys you, what happens when someone calls a blocking library inside it, how to fan out to rate-limited external APIs, and how to **stream** agent events and stop work when the client leaves. Expect "Pydantic as the contract" questions too, since the JD stresses clean API contracts.

All Python here runs on Python 3.14 with FastAPI 0.143 and Pydantic 2.

## How FastAPI runs your code

FastAPI is an **ASGI** framework on Starlette. A server such as **uvicorn** runs one **event loop per process** and calls your app for every request.

- An **`async def`** endpoint (or dependency) runs **on the event loop**. While it `await`s I/O, the loop serves other requests. One process can hold thousands of waiting requests.
- A plain **`def`** endpoint runs in a **thread pool** (AnyIO's default limiter: **40 threads** per process), so blocking code in it does not freeze the loop, but at most 40 such calls run at once.
- The same rule applies to dependencies.

```python
import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


@app.get("/async")
async def on_loop() -> dict[str, str]:
    return {"thread": threading.current_thread().name}


@app.get("/sync")
def in_threadpool() -> dict[str, str]:
    return {"thread": threading.current_thread().name}


with TestClient(app) as client:
    loop_thread = client.get("/async").json()["thread"]
    pool_thread = client.get("/sync").json()["thread"]

assert pool_thread == "AnyIO worker thread"
assert loop_thread != pool_thread
print(loop_thread, "|", pool_thread)
```

## The one mistake that sinks async services: blocking the loop

`async def` is a promise to the event loop: "I will not block." Break it with `time.sleep`, `requests.get`, a synchronous database driver or heavy CPU work, and **every** request on that process waits. The test below sends five concurrent requests to three endpoints that each wait 0.2 s.

```python
import asyncio
import time

import httpx
from fastapi import FastAPI

app = FastAPI()


@app.get("/async-await")
async def good() -> dict:
    await asyncio.sleep(0.2)  # yields to the loop
    return {}


@app.get("/async-blocking")
async def bad() -> dict:
    time.sleep(0.2)  # blocks the loop: requests run one after another
    return {}


@app.get("/sync-blocking")
def fine() -> dict:
    time.sleep(0.2)  # blocking, but in the thread pool
    return {}


async def five_at_once(path: str) -> float:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        start = time.perf_counter()
        await asyncio.gather(*(client.get(path) for _ in range(5)))
        return time.perf_counter() - start


good_s = asyncio.run(five_at_once("/async-await"))
bad_s = asyncio.run(five_at_once("/async-blocking"))
fine_s = asyncio.run(five_at_once("/sync-blocking"))
assert good_s < 0.7 and fine_s < 0.7, (good_s, fine_s)
assert bad_s >= 0.95, bad_s  # 5 × 0.2 s, serialised
print(f"await: {good_s:.2f}s  blocking in async def: {bad_s:.2f}s  blocking in def: {fine_s:.2f}s")
```

How to fix blocking code, in order:

1. Use an **async library**: `httpx.AsyncClient` instead of `requests`, `asyncpg`/`psycopg` async or SQLAlchemy's async engine, `redis.asyncio`, the async variants of provider SDKs.
2. If a library is only synchronous, call it with **`await asyncio.to_thread(fn, ...)`** (or Starlette's `run_in_threadpool`), or make the endpoint plain `def`.
3. **CPU-bound** work (parsing big documents, embeddings on CPU) needs **processes**, not threads, because of the GIL: a `ProcessPoolExecutor`, or better, a queue and a separate worker service.

## asyncio essentials for backend work

| Tool | Use it for | Note |
|---|---|---|
| `asyncio.create_task` | Start work now, await later | Keep a reference, or the task can be garbage-collected |
| `asyncio.gather` | Await several things, collect results in order | With `return_exceptions=True` you get errors as values; without it, other tasks keep running after the first error |
| `asyncio.TaskGroup` (3.11+) | Structured concurrency | The first failure cancels the siblings; errors surface as an `ExceptionGroup` |
| `asyncio.timeout` (3.11+) | A deadline around a block | Raises `TimeoutError` and cancels the work inside |
| `asyncio.Semaphore` | Limit concurrency (e.g. 5 calls at once to a rate-limited API) | `async with sem:` around each call |
| `asyncio.to_thread` | Run a blocking function without blocking the loop | Uses the default thread pool |
| `asyncio.Queue` | Producer/consumer inside a process | `maxsize` gives backpressure |

```python
import asyncio


async def call_tool(name: str, delay: float, fail: bool = False) -> str:
    await asyncio.sleep(delay)
    if fail:
        raise RuntimeError(f"{name} failed")
    return name


async def main() -> None:
    # gather: results come back in argument order, not completion order.
    assert await asyncio.gather(call_tool("slow", 0.03), call_tool("fast", 0.01)) == ["slow", "fast"]

    # gather with return_exceptions: partial results plus errors as values.
    results = await asyncio.gather(call_tool("ok", 0.01), call_tool("bad", 0.01, fail=True), return_exceptions=True)
    assert results[0] == "ok" and isinstance(results[1], RuntimeError)

    # TaskGroup: one failure cancels the siblings.
    cancelled: list[str] = []

    async def long_running() -> None:
        try:
            await asyncio.sleep(10)
        except asyncio.CancelledError:
            cancelled.append("long_running")
            raise  # always re-raise CancelledError

    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(long_running())
            tg.create_task(call_tool("bad", 0.01, fail=True))
    except* RuntimeError as eg:
        assert str(eg.exceptions[0]) == "bad failed"
    assert cancelled == ["long_running"]

    # timeout: a deadline around any block of awaits.
    try:
        async with asyncio.timeout(0.05):
            await call_tool("very slow", 1)
        raise AssertionError("should have timed out")
    except TimeoutError:
        pass

    # Semaphore: never more than 3 calls in flight.
    sem = asyncio.Semaphore(3)
    in_flight = peak = 0

    async def limited(i: int) -> int:
        nonlocal in_flight, peak
        async with sem:
            in_flight += 1
            peak = max(peak, in_flight)
            await asyncio.sleep(0.01)
            in_flight -= 1
            return i

    assert await asyncio.gather(*(limited(i) for i in range(10))) == list(range(10))
    assert peak == 3

    # to_thread: a blocking call without blocking the loop.
    import time

    assert await asyncio.to_thread(lambda: (time.sleep(0.01), "done")[1]) == "done"


asyncio.run(main())
print("asyncio ok")
```

**Cancellation** is how asyncio stops work: the task gets a `CancelledError` at its current `await`. Use `try/finally` (or `async with`) for cleanup and **re-raise** it; swallowing it breaks timeouts and TaskGroups. For debugging, Python 3.14 adds `python -m asyncio ps <pid>` and `pstree` to inspect the running tasks of a live process.

## Pydantic models as the API contract

The JD's "clean API contracts" maps directly to Pydantic: the model **is** the validation, the documentation (OpenAPI) and the serialiser.

- **Separate input and output models** (`RunCreate`, `RunRead`): clients cannot set server-owned fields such as `id` or `status`, and internal fields never leak.
- **`extra="forbid"`** on inputs turns typos (`"prioirty"`) into a 422 instead of silently ignoring them.
- **Aliases** (`alias_generator=to_camel`, `populate_by_name=True`) let Python use snake_case while the JSON contract is camelCase for the TypeScript client.
- **Discriminated unions** (`Field(discriminator="type")`) model event types cleanly: Pydantic picks the right model from the `type` field and gives a precise error. This is the same shape as a TypeScript discriminated union on the front end.
- **`response_model`** (or the return annotation) filters the output to the declared fields.

```python
from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import FastAPI, status
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class RunCreate(ApiModel):
    model_config = ConfigDict(extra="forbid")
    agent_id: str = Field(min_length=1)
    input: str = Field(min_length=1, max_length=10_000)
    max_steps: int = Field(default=10, ge=1, le=50)


class RunRead(ApiModel):
    id: str
    agent_id: str
    status: Literal["queued", "running", "waiting_approval", "succeeded", "failed"]
    created_at: datetime


class TokenEvent(BaseModel):
    type: Literal["token"]
    text: str


class ToolCallEvent(BaseModel):
    type: Literal["tool_call"]
    tool: str
    args: dict[str, object]


class ApprovalEvent(BaseModel):
    type: Literal["approval_required"]
    action: str


AgentEvent = Annotated[TokenEvent | ToolCallEvent | ApprovalEvent, Field(discriminator="type")]

app = FastAPI()
RUNS: dict[str, dict] = {}


@app.post("/v1/runs", status_code=status.HTTP_202_ACCEPTED, response_model=RunRead, response_model_by_alias=True)
def create_run(body: RunCreate) -> dict:
    run = {"id": str(uuid4()), "agent_id": body.agent_id, "status": "queued", "created_at": datetime.now(UTC),
           "internal_cost_cents": 0}  # never leaves the server: not in RunRead
    RUNS[run["id"]] = run
    return run


@app.post("/v1/runs/{run_id}/events")
def add_event(run_id: str, event: AgentEvent) -> dict:
    return {"run_id": run_id, "accepted": event.type}


client = TestClient(app)
r = client.post("/v1/runs", json={"agentId": "a1", "input": "reconcile invoices"})
assert r.status_code == 202
assert set(r.json()) == {"id", "agentId", "status", "createdAt"}  # camelCase out, internal field filtered

typo = client.post("/v1/runs", json={"agentId": "a1", "input": "x", "maxStepz": 5})
assert typo.status_code == 422
assert typo.json()["detail"][0]["type"] == "extra_forbidden"

assert client.post("/v1/runs/r1/events", json={"type": "tool_call", "tool": "sap.create_po", "args": {}}).json() == {
    "run_id": "r1", "accepted": "tool_call"}
bad_event = client.post("/v1/runs/r1/events", json={"type": "tool_call", "tool": "x"})
assert bad_event.status_code == 422
assert bad_event.json()["detail"][0]["loc"] == ["body", "tool_call", "args"]  # the discriminator picked the model
print("contract ok")
```

## Dependencies: Depends, yield and overrides

Dependencies are functions FastAPI calls before your endpoint: authentication, a database session, settings, a rate limiter. They compose (a dependency can depend on others), are cached per request, and can be **overridden in tests**.

- Write reusable aliases with `Annotated`: `CurrentUser = Annotated[User, Depends(get_current_user)]`.
- A **dependency factory** (`require_role("approver")`) returns a dependency configured with arguments.
- A dependency with **`yield`** gives setup and teardown, such as one database session per request. By default its teardown runs **after the response has been sent**, even after a streaming response finishes. With `Depends(dep, scope="function")` the teardown runs as soon as the endpoint function returns, before the response is sent.

```python
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel


class User(BaseModel):
    id: str
    roles: set[str]


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> User:
    # Real code verifies a JWT or session here (see the auth-identity chapter).
    if authorization != "Bearer valid":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    return User(id="u1", roles={"viewer"})


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(role: str):
    def check(user: CurrentUser) -> User:
        if role not in user.roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role {role!r}")
        return user

    return check


log: list[str] = []


def session_request_scope():
    log.append("open request-scoped")
    yield "db"
    log.append("close request-scoped")


def session_function_scope():
    log.append("open function-scoped")
    yield "db"
    log.append("close function-scoped")


app = FastAPI()


@app.get("/runs")
def list_runs(user: CurrentUser) -> dict:
    return {"user": user.id}


@app.post("/runs/{run_id}/approve")
def approve(run_id: str, user: Annotated[User, Depends(require_role("approver"))]) -> dict:
    return {"run_id": run_id, "approved_by": user.id}


@app.get("/export")
def export(a: Annotated[str, Depends(session_request_scope)],
           b: Annotated[str, Depends(session_function_scope, scope="function")]):
    def rows():
        log.append("streaming")
        yield b"row\n"
    return StreamingResponse(rows())


client = TestClient(app)
assert client.get("/runs").status_code == 401
assert client.get("/runs", headers={"Authorization": "Bearer valid"}).json() == {"user": "u1"}
assert client.post("/runs/r1/approve", headers={"Authorization": "Bearer valid"}).status_code == 403

# In tests, swap the real dependency for a fake user.
app.dependency_overrides[get_current_user] = lambda: User(id="tester", roles={"approver"})
assert client.post("/runs/r1/approve").json() == {"run_id": "r1", "approved_by": "tester"}
app.dependency_overrides.clear()

client.get("/export")
assert log == ["open request-scoped", "open function-scoped", "close function-scoped", "streaming",
               "close request-scoped"]
print("dependencies ok")
```

## Lifespan: shared clients and pools

Create expensive, shared objects **once per process**: an `httpx.AsyncClient` (connection pooling), a database pool, a loaded configuration. The **lifespan** context manager runs setup before the first request and teardown on shutdown. Whatever you `yield` as a dict becomes available on `request.state` for every request.

```python
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import TypedDict

import httpx
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient


def fake_upstream(request: httpx.Request) -> httpx.Response:
    return httpx.Response(200, json={"po": request.url.path.rsplit("/", 1)[-1], "status": "approved"})


class State(TypedDict):
    erp: httpx.AsyncClient


events: list[str] = []


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[State]:
    # Real code: httpx.AsyncClient(base_url=settings.erp_url, timeout=httpx.Timeout(10, connect=2))
    async with httpx.AsyncClient(base_url="https://erp.example", transport=httpx.MockTransport(fake_upstream)) as erp:
        events.append("client opened")
        yield {"erp": erp}
    events.append("client closed")


app = FastAPI(lifespan=lifespan)


@app.get("/purchase-orders/{po_id}")
async def get_po(po_id: str, request: Request) -> dict:
    erp: httpx.AsyncClient = request.state.erp
    response = await erp.get(f"/po/{po_id}")
    response.raise_for_status()
    return response.json()


with TestClient(app) as client:  # the with block runs the lifespan
    assert client.get("/purchase-orders/4500001").json() == {"po": "4500001", "status": "approved"}
assert events == ["client opened", "client closed"]
print("lifespan ok")
```

## Background work: BackgroundTasks or a real queue

`BackgroundTasks` runs a function **after the response is sent, in the same process**. It is fine for small, best-effort work: sending a notification email, writing an audit record. It is the wrong tool for agent runs: if the instance scales down, restarts or crashes, the work is lost, there are no retries, and on Cloud Run with request-based billing the CPU can be throttled once the response is sent. Long or important work goes to a **queue** (Cloud Tasks, Pub/Sub, Celery, a Postgres-backed queue) processed by workers, with the API returning `202 Accepted` and a status resource. See [Task queues](#/task-queues).

## Streaming responses: StreamingResponse, SSE and JSON Lines

FastAPI 0.143 has three ways to stream:

- **`StreamingResponse(generator)`**: raw bytes, any media type (files, CSV export, your own framing).
- **Server-Sent Events**: declare `response_class=EventSourceResponse` and `yield` from the endpoint. Plain objects and Pydantic models are JSON-encoded into `data:`; yield `ServerSentEvent(data=..., event=..., id=..., retry=...)` for named events and ids (which the browser sends back as `Last-Event-ID` on reconnect). FastAPI sets `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and sends a `: ping` keep-alive comment when the generator is idle for 15 seconds.
- **JSON Lines**: a generator endpoint with no special response class streams one JSON object per line as `application/jsonl`, validated against the `AsyncIterable[Item]` return type.

```python
from collections.abc import AsyncIterable

from fastapi import FastAPI
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.testclient import TestClient
from pydantic import BaseModel


class Token(BaseModel):
    text: str


app = FastAPI()


@app.get("/runs/{run_id}/events", response_class=EventSourceResponse)
async def run_events(run_id: str) -> AsyncIterable[Token | ServerSentEvent]:
    for i, word in enumerate(["Checking", " the", " invoice"]):
        yield ServerSentEvent(data=Token(text=word), event="token", id=f"{run_id}:{i}")
    yield ServerSentEvent(data={"status": "succeeded"}, event="done", id=f"{run_id}:3")


@app.get("/runs/{run_id}/tokens.jsonl")
async def run_tokens(run_id: str) -> AsyncIterable[Token]:
    for word in ["a", "b"]:
        yield Token(text=word)


client = TestClient(app)
with client.stream("GET", "/runs/r1/events") as response:
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["cache-control"] == "no-cache"
    body = response.read().decode()
frames = [f for f in body.split("\n\n") if f]
assert frames[0] == 'event: token\ndata: {"text":"Checking"}\nid: r1:0'
assert frames[-1] == 'event: done\ndata: {"status": "succeeded"}\nid: r1:3'

jsonl = client.get("/runs/r1/tokens.jsonl")
assert jsonl.headers["content-type"] == "application/jsonl"
assert jsonl.text == '{"text":"a"}\n{"text":"b"}\n'
print(body)
```

**When the client disconnects**, Starlette cancels the generator: your `finally` block runs, so put cleanup there (cancel the upstream LLM call, record token usage, release a lock). If you poll in a loop instead of awaiting, check `await request.is_disconnected()`. The coding problem below proves the cancellation with a raw ASGI test. The [SSE chapter](#/sse) covers the wire format, resuming and proxies in depth.

## WebSockets in FastAPI

A WebSocket endpoint receives a `WebSocket`, must `accept()` it, then loops over `receive_*` and `send_*`. A client disconnect surfaces as `WebSocketDisconnect`. Authenticate **before** accepting: read a cookie or a short-lived token, and if it is invalid, `close(code=1008)` (policy violation) without accepting. One subtlety: closing before `accept()` makes the server reject the handshake with **HTTP 403**, so a browser sees a failed connection (close code 1006), not 1008. `TestClient` reports the 1008 below, but if the client must see a reason, accept first and then close with 1008.

```python
from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect, status
from fastapi.testclient import TestClient
import pytest

app = FastAPI()
closed: list[str] = []


@app.websocket("/ws/runs/{run_id}")
async def run_socket(websocket: WebSocket, run_id: str, token: str | None = Query(default=None)) -> None:
    if token != "valid-ticket":  # e.g. a short-lived ticket issued by an authenticated REST call
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") == "approve":
                await websocket.send_json({"type": "approved", "runId": run_id})
            else:
                await websocket.send_json({"type": "error", "reason": "unknown message"})
    except WebSocketDisconnect:
        closed.append(run_id)  # clean up subscriptions here


client = TestClient(app)
with pytest.raises(WebSocketDisconnect) as rejected:
    with client.websocket_connect("/ws/runs/r1?token=nope") as ws:
        ws.receive_json()
assert rejected.value.code == 1008

with client.websocket_connect("/ws/runs/r1?token=valid-ticket") as ws:
    ws.send_json({"type": "approve"})
    assert ws.receive_json() == {"type": "approved", "runId": "r1"}
assert closed == ["r1"]
print("websocket ok")
```

## Errors, middleware and production settings

- **Exception handlers** give one error format for the whole API: register handlers for `HTTPException`, `RequestValidationError` and your domain exceptions, and return RFC 9457 problem details (`application/problem+json`). See [API design](#/api-design).
- **Middleware** wraps every request: request ids, timing, security headers. Prefer **pure ASGI middleware** for anything on streaming endpoints; `BaseHTTPMiddleware` (`@app.middleware("http")`) is convenient but wraps the response body and has had limitations with streaming and background tasks. Use a dependency instead when the logic is per-route or needs the parsed request.
- **Settings** come from environment variables via `pydantic-settings` (`BaseSettings`), with secrets injected from Secret Manager as env vars or mounted files, never baked into the image.
- **Running it**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (or `fastapi run`). On Cloud Run, keep **one process per container** for a small instance and let Cloud Run's concurrency (80 requests per instance by default, or 80 per vCPU for services created with gcloud or Terraform; up to 1,000) and instance autoscaling do the work; use `--workers N` only to use several vCPUs in one container. uvicorn reads `X-Forwarded-*` headers but trusts them only from `127.0.0.1` by default, so behind a load balancer set `--forwarded-allow-ips` (or `FORWARDED_ALLOW_IPS`) so client IP and scheme are correct, and set `--timeout-graceful-shutdown` below the platform's shutdown window.

## Testing FastAPI

- **`TestClient`** (sync, built on httpx): the simplest. Use it as a context manager (`with TestClient(app) as client`) so the lifespan runs.
- **`httpx.AsyncClient(transport=httpx.ASGITransport(app=app))`** for async tests, for example when the test itself must `await` other things or run requests concurrently. It does not run the lifespan for you.
- **`app.dependency_overrides`** to replace auth, the database session or external clients with fakes.
- `httpx.MockTransport` to fake upstream HTTP APIs; WebSockets with `client.websocket_connect`; SSE with `client.stream(...)`.

## Interview questions

### What is the difference between `async def` and `def` endpoints in FastAPI? {core}

`async def` endpoints run directly on the event loop, so they must only `await` non-blocking I/O; while they wait, the same process serves other requests. Plain `def` endpoints run in a thread pool (40 threads by default), so blocking libraries are safe there but concurrency is capped by the pool. I use `async def` with async clients for I/O-heavy endpoints, and `def` when I have to call a synchronous library.

The trap is the middle case: `async def` plus a blocking call (`requests`, `time.sleep`, a sync DB driver). That freezes the whole process. The same rule applies to dependencies.

### What happens if you call a blocking function inside an `async def` endpoint? {core}

The event loop thread is stuck until the call returns, so every other request on that process waits: latency spikes across all endpoints, health checks fail, and streams stall. In a test, five concurrent requests that each block for 0.2 seconds take a full second instead of 0.2. The fix is an async library, `await asyncio.to_thread(...)`, or making the endpoint plain `def`; CPU-heavy work goes to a process pool or a separate worker.

To find it: asyncio debug mode logs slow callbacks (`loop.slow_callback_duration`), and profiling under load shows one long synchronous frame.

### How many requests can one FastAPI process handle at once? {deep}

For `async def` endpoints doing awaited I/O, many thousands: each waiting request is just a coroutine, and the limit is memory, file descriptors and downstream capacity. For `def` endpoints, 40 at a time (AnyIO's default thread limiter); more queue for a thread. CPU-bound work is limited to roughly one core per process by the GIL. On Cloud Run the platform also caps concurrent requests per instance (80 by default, or 80 per vCPU for services created with gcloud or Terraform; at most 1,000) and scales instances out.

### `asyncio.gather` or `TaskGroup`? {core}

Both run awaitables concurrently. `gather` returns results in order; on the first exception it propagates that error but leaves the other tasks running, unless you pass `return_exceptions=True` to collect errors as values, which is good for "best effort, partial results". `TaskGroup` (Python 3.11+) is structured concurrency: if one task fails, the others are cancelled and you get an `ExceptionGroup`, so no orphaned tasks. I use `TaskGroup` when the results only make sense together, and `gather(return_exceptions=True)` for independent tool calls.

### How do you limit concurrency to a rate-limited external API? {core}

Wrap each call in an `asyncio.Semaphore` sized to the allowed concurrency, add a per-call timeout and retries with exponential backoff and jitter for 429 and 5xx, and respect `Retry-After`. The semaphore is per process, so with many instances the real limit is semaphore × instances: for a strict global limit, use a shared limiter (Redis token bucket) or route calls through a queue such as Cloud Tasks with a dispatch rate.

### How does cancellation work in asyncio, and what are the pitfalls? {deep}

`task.cancel()` raises `CancelledError` inside the task at its current `await`. Timeouts, TaskGroups and client disconnects all use it. Cleanup belongs in `finally` or `async with`, and the error must be re-raised. Since Python 3.8 `CancelledError` derives from `BaseException`, so `except Exception` no longer swallows it, but a bare `except:` or `except BaseException` still does. Use `asyncio.shield` only for work that must finish, such as committing a transaction, and keep it short.

### How do you add a timeout to a slow dependency call?

Set timeouts at two levels: the client's own timeouts (`httpx.Timeout(10, connect=2)`), and an overall deadline with `async with asyncio.timeout(seconds):` around a group of awaits, which cancels the work inside and raises `TimeoutError`. Map that to a 504 or a retry, and make sure the deadline is shorter than the caller's, so you fail before your client gives up on you.

### Why use separate Pydantic models for input and output? {core}

Because they are different contracts. The create model contains only fields the client may set, with `extra="forbid"` so typos fail loudly; the read model contains server-owned fields such as `id`, `status` and timestamps, and leaves out internal ones such as costs or credentials. The response model filters the output, so adding an internal column can never leak it. Both feed the OpenAPI schema, which generates the TypeScript client.

**Your angle:** at Quantiphi the Pydantic schemas were the data contract for ML-extracted fields: the quality gate before human review.

### What is a discriminated union in Pydantic, and why use it for events? {deep}

A union of models that share a literal field, such as `type`, marked with `Field(discriminator="type")`. Pydantic reads the discriminator and validates against exactly one model, which is faster and gives a precise error ("`tool_call` is missing `args`") instead of a list of failures from every member. It is the natural model for agent events (token, tool call, approval required, error), and it matches a TypeScript discriminated union on the front end, so both sides switch on `type`.

### How does dependency injection work in FastAPI? {core}

You declare what an endpoint needs with `Depends`, and FastAPI resolves the graph per request: dependencies can depend on others, results are cached within a request, and errors raised in a dependency (such as a 401) stop the request early. It keeps cross-cutting concerns (auth, sessions, settings, rate limits) out of the handler, and `app.dependency_overrides` swaps them for fakes in tests.

A senior detail: dependencies with `yield` give setup and teardown; by default the teardown runs after the response is sent (even after a stream finishes), and `scope="function"` makes it run before the response.

### How do you test FastAPI endpoints?

`TestClient` for most tests, used as a context manager so the lifespan runs; `dependency_overrides` to fake auth and external clients; `httpx.MockTransport` for upstream APIs. For async tests or concurrency, `httpx.AsyncClient` with `ASGITransport`. Streaming with `client.stream`, WebSockets with `websocket_connect`. Integration tests run against a real Postgres in a container, and a few end-to-end tests cover the deployed service.

### What is the lifespan, and what do you put in it?

The lifespan is an async context manager that runs once per process: setup before the first request, teardown at shutdown. I create shared resources there, such as an `httpx.AsyncClient` for connection pooling, the database engine or pool, and loaded configuration, and yield them as state so handlers read them from `request.state`. Teardown closes them cleanly when the platform sends SIGTERM. It replaced the old `@app.on_event("startup")` hooks.

### When are BackgroundTasks enough, and when do you need a queue? {core}

`BackgroundTasks` run in the same process after the response, with no retries and no durability, so they suit small best-effort jobs like a notification. Anything long, important or retryable, such as an agent run, a document extraction or a call to an ERP, goes to a durable queue with workers, idempotent handlers and a dead-letter queue. The API returns 202 with a status URL or a stream to follow. On Cloud Run, background work after the response can also be CPU-throttled under request-based billing.

### How do you stream LLM output or agent events from FastAPI? {core}

Use Server-Sent Events: set `response_class=EventSourceResponse` and `yield` events from an async generator, with `ServerSentEvent(event="token", id=...)` for named events and resumable ids. FastAPI sets no-cache and no-buffering headers and sends keep-alive pings. For non-browser consumers, a generator endpoint streams JSON Lines. The generator awaits the upstream stream token by token, and its `finally` block handles cleanup when the client disconnects.

### How do you stop generating when the client disconnects? {core}

When the client goes away, Starlette cancels the response's generator, so the `CancelledError` arrives at the generator's current `await`. Put the cleanup in `finally`: cancel the upstream LLM request (closing its stream stops token generation and billing), persist what was produced, record usage. If the loop does not await often, check `await request.is_disconnected()`. For runs that must continue without a viewer, decouple: the agent runs in a worker and the stream only follows its event log, so a disconnect stops the stream, not the run.

### How do you implement and secure a WebSocket endpoint in FastAPI?

Declare `@app.websocket(path)`, authenticate before `accept()` (a session cookie, or a short-lived single-use ticket from an authenticated REST call in the query string, because browsers cannot set an Authorization header on WebSocket), and close if it fails: before `accept()` that becomes an HTTP 403 on the handshake, after it a close frame with 1008. Then loop on `receive_json`, validate every message with a Pydantic model, and handle `WebSocketDisconnect` to clean up subscriptions. Check the `Origin` header to prevent cross-site WebSocket hijacking, and re-check authorisation for each action, not only at connect time.

### Middleware or dependency: which one when? {deep}

Middleware wraps every request and response, so it fits truly global concerns: request ids, timing, security headers, CORS. Dependencies are per route, run after routing with access to the parsed parameters, and show up in OpenAPI, so they fit auth, permissions and rate limits. For streaming endpoints prefer pure ASGI middleware, because `BaseHTTPMiddleware` wraps the response body and has had issues with streaming and context variables.

### How do you deploy and scale FastAPI on Cloud Run?

A slim container running uvicorn on `$PORT`, usually one process per instance, with Cloud Run's per-instance concurrency (80 by default, or 80 per vCPU when the service is created with gcloud or Terraform; up to 1,000) and autoscaling providing the scale. Tune concurrency to the workload: lower it if requests are CPU-heavy. Set min instances to avoid cold starts on latency-sensitive paths, handle SIGTERM through the lifespan, read secrets from Secret Manager, and size database pools so that instances × pool size stays under the database's connection limit.

**Your angle:** Docker → Artifact Registry → Cloud Run across Dev, SIT and UAT at Quantiphi.

### How do you handle CPU-bound work in an async Python service? {deep}

Not on the event loop, and threads do not help much because of the GIL. Options: a `ProcessPoolExecutor` via `loop.run_in_executor` for short jobs, or better, a queue with separate worker containers sized for CPU, so the API stays responsive and scales independently. Python 3.14 supports the free-threaded build, but most C extensions and production images still assume the GIL, so I would not depend on it yet.

### How do you use a synchronous database library in an async app? {deep}

Prefer an async driver (asyncpg, psycopg 3 async, SQLAlchemy's async engine). If the library is sync-only, make those endpoints plain `def` so they run in the thread pool, or wrap calls in `asyncio.to_thread`; size the database pool to the thread pool. Mixing a sync driver inside `async def` without a thread is the classic way to serialise a whole service.

### How do you propagate a request id or trace through async code? {deep}

With `contextvars`: middleware sets a `ContextVar` at the start of the request, and every coroutine and task created inside inherits a copy, so the logger can read it anywhere. OpenTelemetry's Python context is built on the same mechanism. Forward the id to downstream calls as a header (`traceparent`) so traces span services.

## Coding problems

### Fan out to an external API with bounded concurrency and partial failures {medium core}

An agent needs details for many purchase orders from an ERP API that allows at most 3 concurrent calls and sometimes fails or hangs. Write `fetch_all(ids, fetch, limit=3, timeout=0.2)` that calls the async `fetch(id)` for every id with at most `limit` in flight, applies a per-call timeout, and returns `(results, errors)`: a dict of id to result, and a dict of id to the error type name. Results must not depend on completion order.

#### Hints

1. An `asyncio.Semaphore(limit)` around each call caps concurrency.
2. `async with asyncio.timeout(timeout):` around the call gives a per-call deadline.
3. Catch exceptions per call and return them as values, so one failure does not lose the others.

#### Solution

Wrap each call in a small coroutine that takes the semaphore, applies the timeout, and returns a tagged result. `gather` runs them all; because each wrapper catches its own errors, the batch never aborts halfway.

```python
import asyncio
from collections.abc import Awaitable, Callable


async def fetch_all(
    ids: list[str],
    fetch: Callable[[str], Awaitable[dict]],
    limit: int = 3,
    timeout: float = 0.2,
) -> tuple[dict[str, dict], dict[str, str]]:
    if limit < 1:
        raise ValueError("limit must be at least 1")  # Semaphore(0) would wait forever
    sem = asyncio.Semaphore(limit)

    async def one(item_id: str) -> tuple[str, dict | None, str | None]:
        async with sem:
            try:
                async with asyncio.timeout(timeout):
                    return item_id, await fetch(item_id), None
            except Exception as exc:  # CancelledError is not an Exception, so cancellation still propagates
                return item_id, None, type(exc).__name__

    results: dict[str, dict] = {}
    errors: dict[str, str] = {}
    for item_id, value, error in await asyncio.gather(*(one(i) for i in ids)):
        if error is None:
            results[item_id] = value
        else:
            errors[item_id] = error
    return results, errors


async def main() -> None:
    in_flight = peak = 0

    async def fake_erp(po: str) -> dict:
        nonlocal in_flight, peak
        in_flight += 1
        peak = max(peak, in_flight)
        try:
            if po == "hang":
                await asyncio.sleep(5)
            await asyncio.sleep(0.01)
            if po == "boom":
                raise ConnectionError("ERP unavailable")
            return {"po": po, "status": "open"}
        finally:
            in_flight -= 1

    ids = [f"po{i}" for i in range(8)] + ["boom", "hang"]
    results, errors = await fetch_all(ids, fake_erp, limit=3, timeout=0.2)
    assert len(results) == 8 and results["po3"] == {"po": "po3", "status": "open"}
    assert errors == {"boom": "ConnectionError", "hang": "TimeoutError"}
    assert peak <= 3
    assert await fetch_all([], fake_erp) == ({}, {})
    try:
        await fetch_all(["po1"], fake_erp, limit=0)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


asyncio.run(main())
print("fan-out ok")
```

Complexity: O(n) calls; wall time is about n / limit × call latency, bounded by the timeout for slow calls.

#### Follow-ups

- **Add retries?** Retry only retryable errors (timeouts, 429, 5xx) with exponential backoff plus jitter, respect `Retry-After`, and cap attempts; never retry a non-idempotent call without an idempotency key.
- **The limit is global across 20 instances?** A per-process semaphore is not enough; use a shared token bucket in Redis or push the calls through Cloud Tasks with a max dispatch rate.

### Stream agent events and clean up when the client disconnects {medium core}

Write an SSE endpoint `GET /runs/{run_id}/events` that streams `step` events (id = step number) from a slow producer, and records `"cleanup"` in a log when the stream ends for any reason, including a client disconnect. Prove with a raw ASGI test that after the client disconnects, the generator stops producing and the cleanup runs.

#### Hints

1. `response_class=EventSourceResponse` plus an async generator that yields `ServerSentEvent(...)`.
2. Cleanup goes in `try/finally` inside the generator: a disconnect cancels the generator.
3. To simulate a disconnect, call the ASGI app yourself with a `receive` function that returns `{"type": "http.disconnect"}` after a few body messages have been sent.

#### Solution

The endpoint itself is short; the interesting part is proving cancellation. Calling the app as `await app(scope, receive, send)` lets the test decide when the client "leaves". After the third event, `receive` returns `http.disconnect`, Starlette cancels the response, the generator gets `CancelledError` at its `await`, and the `finally` block runs.

```python
import asyncio
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.sse import EventSourceResponse, ServerSentEvent

log: list[object] = []
app = FastAPI()


@app.get("/runs/{run_id}/events", response_class=EventSourceResponse)
async def run_events(run_id: str) -> AsyncIterator[ServerSentEvent]:
    try:
        for step in range(1_000):
            await asyncio.sleep(0.01)  # stands in for awaiting the next agent event
            log.append(step)
            yield ServerSentEvent(data={"run": run_id, "step": step}, event="step", id=str(step))
    finally:
        log.append("cleanup")  # cancel the upstream call, persist progress, record usage


async def call_and_disconnect(after_events: int) -> list[bytes]:
    bodies: list[bytes] = []
    enough = asyncio.Event()
    first = True

    async def receive() -> dict:
        nonlocal first
        if first:
            first = False
            return {"type": "http.request", "body": b"", "more_body": False}
        await enough.wait()
        return {"type": "http.disconnect"}

    async def send(message: dict) -> None:
        if message["type"] == "http.response.body" and message.get("body"):
            bodies.append(message["body"])
            if len(bodies) >= after_events:
                enough.set()

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": "GET", "scheme": "http",
        "path": "/runs/r7/events", "raw_path": b"/runs/r7/events", "query_string": b"", "root_path": "",
        "headers": [], "server": ("test", 80), "client": ("test", 1),
    }
    await asyncio.wait_for(app(scope, receive, send), timeout=5)
    return bodies


bodies = asyncio.run(call_and_disconnect(after_events=3))
assert bodies[0] == b'event: step\ndata: {"run": "r7", "step": 0}\nid: 0\n\n'
assert log[-1] == "cleanup"
assert len([x for x in log if isinstance(x, int)]) < 10  # stopped long before 1,000 steps
print("disconnect ok:", log)
```

Complexity: O(1) memory per stream; the producer stops within one step of the disconnect.

#### Follow-ups

- **What if the run must continue after the user closes the tab?** Run the agent in a worker that writes events to a log (Redis Streams, Firestore, Postgres); the SSE endpoint only reads the log from the client's `Last-Event-ID`, so disconnects affect only the viewer.
- **Why might cleanup not run in production?** If the process is killed (SIGKILL after the grace period) `finally` never runs, so durable state must not depend on it.

### A role-checking dependency, tested with overrides {medium}

Write `require_role(role)` that returns a FastAPI dependency. It reads the current user from another dependency and raises 403 if the user lacks the role. Protect `POST /runs/{id}/cancel` with `require_role("operator")`. Test it without real tokens by overriding the user dependency.

#### Hints

1. The factory returns an inner function whose parameter is `Annotated[User, Depends(get_current_user)]`.
2. Raise `HTTPException(403)` from the inner function.
3. `app.dependency_overrides[get_current_user] = lambda: User(...)` replaces the user source in tests.

#### Solution

A factory produces one dependency per role, and because it depends on `get_current_user`, overriding that single function is enough to test every permission path.

```python
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.testclient import TestClient
from pydantic import BaseModel


class User(BaseModel):
    id: str
    roles: frozenset[str] = frozenset()


def get_current_user() -> User:
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")  # real code: verify a token


def require_role(role: str):
    def dependency(user: Annotated[User, Depends(get_current_user)]) -> User:
        if role not in user.roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Missing role: {role}")
        return user

    return dependency


app = FastAPI()


@app.post("/runs/{run_id}/cancel")
def cancel_run(run_id: str, user: Annotated[User, Depends(require_role("operator"))]) -> dict:
    return {"run_id": run_id, "cancelled_by": user.id}


client = TestClient(app)
assert client.post("/runs/r1/cancel").status_code == 401

app.dependency_overrides[get_current_user] = lambda: User(id="viewer-1", roles=frozenset({"viewer"}))
denied = client.post("/runs/r1/cancel")
assert denied.status_code == 403 and denied.json() == {"detail": "Missing role: operator"}

app.dependency_overrides[get_current_user] = lambda: User(id="op-1", roles=frozenset({"operator"}))
assert client.post("/runs/r1/cancel").json() == {"run_id": "r1", "cancelled_by": "op-1"}
app.dependency_overrides.clear()
print("rbac ok")
```

Complexity: O(1) per request.

#### Follow-ups

- **Where do roles come from with SAML or OIDC?** From IdP group claims mapped to application roles at login; keep the mapping in configuration, not code.
- **Resource-level checks?** Roles answer "may operators cancel runs?"; also check "may this user cancel this tenant's run?" inside the handler or a policy layer.

### Request-id middleware with contextvars {hard}

Write a pure ASGI middleware that reads `x-request-id` from the request (or generates one), stores it in a `ContextVar` for the duration of the request, and adds it to the response headers. A `log()` helper must include the id automatically, even inside tasks created by the handler.

#### Hints

1. A pure ASGI middleware is a class with `__init__(self, app)` and `async __call__(self, scope, receive, send)`.
2. Wrap `send` so that when the `http.response.start` message passes through, you append the header.
3. `var.set(value)` returns a token; reset it with `var.reset(token)` in `finally`. Tasks copy the current context when they are created.

#### Solution

The middleware sets the context variable before calling the inner app and resets it afterwards, so ids never leak between requests. Wrapping `send` is how pure ASGI middleware edits response headers without buffering the body, which keeps it safe for streaming responses.

```python
import asyncio
import contextvars
import uuid

from fastapi import FastAPI
from fastapi.testclient import TestClient

request_id: contextvars.ContextVar[str | None] = contextvars.ContextVar("request_id", default=None)
lines: list[dict] = []


def log(message: str) -> None:
    lines.append({"message": message, "request_id": request_id.get()})


class RequestIdMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = dict(scope["headers"])
        rid = headers.get(b"x-request-id", b"").decode() or uuid.uuid4().hex
        token = request_id.set(rid)

        async def send_with_id(message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] = [*message.get("headers", []), (b"x-request-id", rid.encode())]
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        finally:
            request_id.reset(token)


app = FastAPI()
app.add_middleware(RequestIdMiddleware)


@app.get("/runs")
async def list_runs() -> dict:
    log("handler start")

    async def child() -> None:
        await asyncio.sleep(0)
        log("child task")

    await asyncio.create_task(child())  # the task inherits a copy of the context
    return {"ok": True}


client = TestClient(app)
response = client.get("/runs", headers={"x-request-id": "req-42"})
assert response.headers["x-request-id"] == "req-42"
generated = client.get("/runs").headers["x-request-id"]
assert len(generated) == 32

log("outside any request")
assert [l["request_id"] for l in lines] == ["req-42", "req-42", generated, generated, None]
print(lines)
```

Complexity: O(h) per request to scan h headers.

#### Follow-ups

- **Why not `@app.middleware("http")`?** `BaseHTTPMiddleware` works, but pure ASGI middleware does not wrap the body, so it is safe for SSE and large streams and has less overhead.
- **How does this relate to tracing?** Accept and forward W3C `traceparent` instead of (or as well as) a custom id; OpenTelemetry's ASGI instrumentation does this and puts the trace id in the context for logs.
