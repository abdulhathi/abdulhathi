---
title: FastAPI in depth
goal: Explain exactly what FastAPI does with a request, from validation to dependencies to async and threads, avoid blocking the event loop, use Pydantic models as the API contract, and build tested CRUD, streaming and WebSocket endpoints live.
minutes: 90
---

FastAPI is the most common choice for new Python API services, so expect it in both formats: "explain how X works" in the technical part, and "build a small endpoint" in the coding part. Interviewers check three things: that you understand what the framework does for you (validation, dependency injection, how async and sync code run), that you can write a clean, tested API quickly, and, for senior roles, that you know the concurrency model well enough to avoid blocking the event loop, fan out to slow upstream APIs and stream results to the client.

Every example below is a complete program that runs and tests itself (Python 3.14, FastAPI 0.143, Pydantic 2). Type a few of them out before an interview: muscle memory for `Annotated[..., Depends(...)]` and `model_dump(exclude_unset=True)` pays off in a live round. The asyncio basics (gather, TaskGroup, timeouts, cancellation, semaphores) live in [GIL, threads, processes and asyncio](#/py-concurrency); this chapter applies them to services.

**Your angle:** at Quantiphi you built the Python/FastAPI backend of the Document AI platform, with Pydantic schemas as the data contract for ML-extracted document fields, and deployed it with Docker through Artifact Registry to Cloud Run across Dev, SIT and UAT. Use it as the running example in your answers.

## How a request flows through FastAPI

FastAPI is a thin layer on top of two libraries: **Starlette** (the ASGI web toolkit: routing, middleware, requests, responses) and **Pydantic** (validation and serialisation). An ASGI server such as **Uvicorn** runs it, with one event loop per process.

```text
client ──HTTP──▶ Uvicorn (ASGI server)
                   │
                   ▼
            middleware stack (CORS, logging, timing …)   ← runs for every request
                   │
                   ▼
            router: match method + path → path operation
                   │
                   ▼
            resolve dependencies (Depends), parse + validate
            path / query / header / cookie / body with Pydantic
                   │  invalid → 422 with a list of errors
                   ▼
            your path operation function (def → threadpool, async def → event loop)
                   │
                   ▼
            validate + filter the return value through response_model, serialise to JSON
                   │
                   ▼
            response sent → background tasks run → code after `yield` in dependencies runs
```

Say this flow in an interview and you have answered half the FastAPI questions already.

## Parameters: path, query, body, header

FastAPI reads your function signature to decide where each value comes from:

| You declare | FastAPI reads it from |
|---|---|
| A name that appears in the path, `/patients/{patient_id}` | The path |
| A simple type (`int`, `str`, `bool`, `date`, an Enum) not in the path | The query string |
| A Pydantic model | The JSON body |
| `Annotated[str, Header()]`, `Cookie()`, `Query()`, `Path()`, `Body()` | Wherever you say, with extra constraints |

The type hint is not decoration: `patient_id: int` means FastAPI converts `"42"` to `42` and rejects `"abc"` with a 422.

```python
from datetime import date
from typing import Annotated

from fastapi import FastAPI, Header, Path, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

app = FastAPI()


class EncounterIn(BaseModel):
    reason: str = Field(min_length=3)
    visit_date: date


@app.post("/patients/{patient_id}/encounters", status_code=201)
def add_encounter(
    patient_id: Annotated[int, Path(gt=0)],                # path
    encounter: EncounterIn,                                # JSON body (a Pydantic model)
    notify: bool = False,                                  # query: ?notify=true
    x_request_id: Annotated[str | None, Header()] = None,  # header X-Request-Id
):
    return {"patient_id": patient_id, "reason": encounter.reason, "visit_date": encounter.visit_date,
            "notify": notify, "request_id": x_request_id}


@app.get("/patients")
def list_patients(state: Annotated[str | None, Query(max_length=2)] = None,
                  limit: Annotated[int, Query(ge=1, le=100)] = 20):
    return {"state": state, "limit": limit}


client = TestClient(app)
r = client.post("/patients/7/encounters?notify=true",
                json={"reason": "follow-up", "visit_date": "2026-10-13"},
                headers={"X-Request-Id": "abc-123"})
assert r.status_code == 201
assert r.json() == {"patient_id": 7, "reason": "follow-up", "visit_date": "2026-10-13",
                    "notify": True, "request_id": "abc-123"}

assert client.get("/patients?state=CA").json() == {"state": "CA", "limit": 20}
assert client.get("/patients?limit=500").status_code == 422          # le=100
assert client.post("/patients/0/encounters",
                   json={"reason": "x", "visit_date": "bad"}).status_code == 422
print("parameters ok")
```

Header names are converted automatically: the parameter `x_request_id` reads the header `X-Request-Id`.

## Validation errors: what a 422 looks like

When the request does not match the declared types, FastAPI never calls your function. It returns **422
Unprocessable Content** with one entry per problem, each with a `loc` (where), `msg` (what) and `type` (machine code). FastAPI uses 422 even for malformed JSON (`json_invalid`), so 400 is only what you raise yourself.

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

app = FastAPI()


class Item(BaseModel):
    name: str = Field(min_length=1)
    qty: int = Field(gt=0)


@app.post("/items")
def create(item: Item):
    return item


client = TestClient(app)
r = client.post("/items", json={"name": "", "qty": 0})
assert r.status_code == 422
errors = r.json()["detail"]
assert [(e["loc"], e["type"]) for e in errors] == [
    (["body", "name"], "string_too_short"),
    (["body", "qty"], "greater_than"),
]
broken = client.post("/items", content=b'{"name": ', headers={"Content-Type": "application/json"})
assert broken.status_code == 422 and broken.json()["detail"][0]["type"] == "json_invalid"
print(errors[0]["msg"])
```

```text
String should have at least 1 character
```

All errors come back at once, not just the first, which is what a front end needs to highlight every bad field.

## Pydantic models as the API contract

The model **is** the validation, the documentation (OpenAPI) and the serialiser, which is why "clean API contracts" in Python usually means Pydantic.

- **Separate input and output models** (`RunCreate`, `RunRead`; `PatientCreate`, `PatientUpdate`, `PatientOut`): clients cannot set server-owned fields such as `id` or `status`.
- **The response model is a security feature**: whatever your function returns is filtered through it, so a field that is not in the output model (a password hash, an internal note, an SSN, an internal cost) can never leak, even if the database row contains it.
- **`extra="forbid"`** on inputs turns typos (`"prioirty"`) into a 422 instead of silently ignoring them.
- **Aliases** (`alias_generator=to_camel`, `populate_by_name=True`) let Python use snake_case while the JSON contract is camelCase for a TypeScript client.
- **Discriminated unions** (`Field(discriminator="type")`) model event types cleanly: Pydantic picks the right model from the `type` field and gives a precise error. This is the same shape as a TypeScript discriminated union on the front end.

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

assert client.post("/v1/runs/r1/events", json={"type": "tool_call", "tool": "erp.create_po", "args": {}}).json() == {
    "run_id": "r1", "accepted": "tool_call"}
bad_event = client.post("/v1/runs/r1/events", json={"type": "tool_call", "tool": "x"})
assert bad_event.status_code == 422
assert bad_event.json()["detail"][0]["loc"] == ["body", "tool_call", "args"]  # the discriminator picked the model
print("contract ok")
```

You can set the output model either with the return annotation (`-> PatientOut`) or with `response_model=PatientOut` in the decorator. Use `response_model` when the function returns something whose type differs from the model, such as an ORM object or a dict, and you want type checkers to stay quiet. For the design side of contracts (status codes, pagination, versioning, breaking changes), see [API design](#/api-design); for Pydantic itself, [Type hints and Pydantic](#/py-typing-pydantic).

## Errors: HTTPException and exception handlers

Raise `HTTPException` for expected HTTP errors. For domain errors, raise your own exception and register a handler
once, so route code stays clean and every error has the same shape. A whole API usually returns RFC 9457 problem details (`application/problem+json`) from these handlers; [API design](#/api-design) shows the format.

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

app = FastAPI()


class PatientNotFound(Exception):
    def __init__(self, patient_id: int):
        self.patient_id = patient_id


@app.exception_handler(PatientNotFound)
async def patient_not_found(request: Request, exc: PatientNotFound):
    return JSONResponse(status_code=404, content={"error": "patient_not_found", "patient_id": exc.patient_id})


@app.get("/patients/{patient_id}")
def get_patient(patient_id: int):
    if patient_id == 1:
        return {"id": 1}
    raise PatientNotFound(patient_id)          # domain error, mapped to HTTP in one place


@app.get("/admin")
def admin():
    raise HTTPException(status_code=403, detail="Admins only")


client = TestClient(app)
assert client.get("/patients/1").json() == {"id": 1}
assert client.get("/patients/9").json() == {"error": "patient_not_found", "patient_id": 9}
r = client.get("/admin")
assert (r.status_code, r.json()) == (403, {"detail": "Admins only"})
print("errors ok")
```

## Dependency injection with Depends

A **dependency** is any callable that FastAPI calls for you before your endpoint and passes the result in. Use it for
anything several endpoints share: the database session, the current user, pagination parameters, settings, feature
flags, a rate limiter. Dependencies can depend on other dependencies, and FastAPI builds the graph per request.

Why it matters: it keeps endpoints small, removes copy-paste, and makes testing easy, because a test can replace any
dependency with `app.dependency_overrides`.

```python
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

app = FastAPI()

USERS = {"token-ana": {"name": "ana", "role": "nurse"}, "token-raj": {"name": "raj", "role": "admin"}}


def get_token(authorization: str | None = None) -> str:     # reads ?authorization=… to keep the demo short
    if not authorization:
        raise HTTPException(401, "Missing token")
    return authorization


def get_current_user(token: Annotated[str, Depends(get_token)]) -> dict:   # a sub-dependency
    user = USERS.get(token)
    if user is None:
        raise HTTPException(401, "Invalid token")
    return user


CurrentUser = Annotated[dict, Depends(get_current_user)]    # a reusable alias


def require_role(role: str):
    """A dependency factory: returns a new dependency for each role."""
    def checker(user: CurrentUser) -> dict:
        if user["role"] != role:
            raise HTTPException(403, "Forbidden")
        return user
    return checker


@app.get("/me")
def me(user: CurrentUser):
    return user


@app.get("/audit-log")
def audit_log(user: Annotated[dict, Depends(require_role("admin"))]):
    return {"entries": [], "viewer": user["name"]}


client = TestClient(app)
assert client.get("/me").status_code == 401
assert client.get("/me?authorization=token-ana").json()["role"] == "nurse"
assert client.get("/audit-log?authorization=token-ana").status_code == 403
assert client.get("/audit-log?authorization=token-raj").json() == {"entries": [], "viewer": "raj"}

# In tests, swap the real dependency for a fake one.
app.dependency_overrides[get_current_user] = lambda: {"name": "test", "role": "admin"}
assert client.get("/audit-log").json()["viewer"] == "test"
app.dependency_overrides.clear()
print("dependencies ok")
```

Within one request, a dependency used in several places is called **once** and its result is reused (pass
`use_cache=False` to call it every time). You can also attach dependencies to a whole router or the whole app:
`APIRouter(dependencies=[Depends(verify_api_key)])`. Dependencies follow the same `def`/`async def` rule as endpoints (next section).

### Dependencies with yield: one database session per request

A dependency that `yield`s works like a context manager: code before `yield` runs before the endpoint, code after it
runs afterwards, even when the endpoint raises. This is the standard pattern for a database session or a transaction.

```python
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.testclient import TestClient

events: list[str] = []


class FakeSession:
    def commit(self): events.append("commit")
    def rollback(self): events.append("rollback")
    def close(self): events.append("close")


def get_db():
    db = FakeSession()
    try:
        yield db              # the endpoint runs here
        db.commit()
    except Exception:
        db.rollback()
        raise                 # re-raise so FastAPI still returns the error response
    finally:
        db.close()


DB = Annotated[FakeSession, Depends(get_db)]
app = FastAPI()


@app.post("/ok")
def ok(db: DB):
    return {"saved": True}


@app.post("/fail")
def fail(db: DB):
    raise HTTPException(400, "bad input")


client = TestClient(app)
client.post("/ok")
assert events == ["commit", "close"]
events.clear()
assert client.post("/fail").status_code == 400
assert events == ["rollback", "close"]
print("session per request ok")
```

**When does the teardown run?** By default the code after `yield` runs **after the response has been sent**, even after a streaming response finishes. With `Depends(dep, scope="function")` it runs as soon as the endpoint function returns, before the response is sent. The difference matters for a stream that should not hold a database connection open:

```python
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.responses import StreamingResponse
from fastapi.testclient import TestClient

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


@app.get("/export")
def export(a: Annotated[str, Depends(session_request_scope)],
           b: Annotated[str, Depends(session_function_scope, scope="function")]):
    def rows():
        log.append("streaming")
        yield b"row\n"
    return StreamingResponse(rows())


TestClient(app).get("/export")
assert log == ["open request-scoped", "open function-scoped", "close function-scoped", "streaming",
               "close request-scoped"]
print(log)
```

## How FastAPI runs your code: async def, def and the thread pool

This is the most common FastAPI question, and many candidates get it wrong.

| You write | FastAPI runs it | Use it when |
|---|---|---|
| `async def` | Directly on the event loop | Everything inside is non-blocking: `await httpx.AsyncClient`, async DB drivers (asyncpg, psycopg async, async SQLAlchemy), `asyncio.sleep` |
| `def` | In a worker thread from a thread pool (AnyIO's limiter: 40 threads per process) | You call blocking code: `requests`, a sync DB driver, file I/O, a library without async support |

While an `async def` endpoint `await`s I/O, the loop serves other requests, so one process can hold thousands of waiting requests. A `def` endpoint's blocking code cannot freeze the loop, but at most 40 such calls run at once. The same rule applies to dependencies.

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
3. **CPU-bound** work (model inference, parsing big documents, PDF rendering) needs **processes**, not threads, because of the GIL: a `ProcessPoolExecutor`, or better, a queue and a separate worker service.

## asyncio patterns inside a service

The tools are the standard ones from [GIL, threads, processes and asyncio](#/py-concurrency); what changes in a service is what you use them for:

- **Fan out to upstream APIs**: `asyncio.gather` (results in order; `return_exceptions=True` for partial results) or `asyncio.TaskGroup` (one failure cancels the rest) to call several services at once. Two 0.2 s calls then take about 0.2 s, not 0.4 s.
- **Respect rate limits**: an `asyncio.Semaphore` around each call to a rate-limited API. It is per process, so the real limit is semaphore × processes × instances.
- **Deadlines**: `async with asyncio.timeout(seconds):` around a slow dependency, shorter than your own caller's deadline.
- **Sync-only libraries**: `asyncio.to_thread`, sized with the database or client pool in mind.
- **Cancellation**: timeouts, TaskGroups and client disconnects all deliver `CancelledError` at the current `await`. Clean up in `finally` and re-raise it. Wrap only work that must finish once started, such as committing a transaction, in `asyncio.shield`, and keep it short.

The [fan-out coding problem](#/fastapi/p-fan-out-to-an-external-api-with-bounded-concurrency-and-part) below combines a semaphore, per-call timeouts and partial failures.

## Lifespan: shared clients, pools and models

Create expensive, shared objects **once per process**: an `httpx.AsyncClient` (connection pooling), a database pool, a loaded configuration or ML model. The **lifespan** context manager runs setup before the first request and teardown on shutdown (when the platform sends SIGTERM). Whatever you `yield` as a dict becomes available on `request.state` for every request. It replaces the older `@app.on_event("startup")` hooks.

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

## Middleware, CORS and background tasks

```python
import time
from contextlib import asynccontextmanager

from fastapi import BackgroundTasks, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

audit: list[str] = []
state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    state["model"] = lambda text: text.upper()   # load once at startup: an ML model, a DB pool, a config
    yield
    state.clear()                               # clean up at shutdown


app = FastAPI(lifespan=lifespan)

# CORS: let the React app on another origin call this API from the browser.
app.add_middleware(CORSMiddleware, allow_origins=["https://portal.example.com"],
                   allow_methods=["*"], allow_headers=["*"], allow_credentials=True)


@app.middleware("http")
async def timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)          # everything downstream runs here
    response.headers["X-Process-Time"] = f"{time.perf_counter() - start:.4f}"
    return response


def write_audit(user: str, action: str) -> None:
    audit.append(f"{user}:{action}")


@app.post("/documents/{doc_id}/approve")
def approve(doc_id: int, background: BackgroundTasks):
    background.add_task(write_audit, "reviewer1", f"approve:{doc_id}")   # runs after the response is sent
    return {"doc_id": doc_id, "status": "approved", "label": state["model"]("ok")}


with TestClient(app) as client:                  # `with` runs the lifespan startup and shutdown
    r = client.post("/documents/5/approve")
    assert r.json() == {"doc_id": 5, "status": "approved", "label": "OK"}
    assert "x-process-time" in r.headers
    assert audit == ["reviewer1:approve:5"]

    pre = client.options("/documents/5/approve", headers={
        "Origin": "https://portal.example.com", "Access-Control-Request-Method": "POST"})
    assert pre.headers["access-control-allow-origin"] == "https://portal.example.com"
assert state == {}                                 # shutdown ran
print("lifespan, middleware, CORS and background tasks ok")
```

- **BackgroundTasks** run in the same process after the response. Good for small best-effort work (an audit
  record, a notification email). They are lost if the process dies, they have no retries, and on serverless platforms such as Cloud Run with request-based billing the CPU can be throttled once the response is sent. Durable, slow or important work (a document extraction, an agent run, a call to an ERP) belongs in a real queue: see [Task queues](#/task-queues).
- **Middleware** wraps every request: logging, timing, request IDs, CORS, GZip, security headers. It sees raw requests and responses
  but not your parsed parameters. `@app.middleware("http")` (Starlette's `BaseHTTPMiddleware`) is convenient but wraps the response body and has had limitations with streaming and context variables; prefer **pure ASGI middleware** for anything that touches streaming endpoints (the [request-id middleware problem](#/fastapi/p-request-id-middleware-with-contextvars) builds one).
- **Dependencies** run per route and receive parsed, validated values: use them for auth, DB sessions and anything
  route-specific.

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

**When the client disconnects**, Starlette cancels the generator: your `finally` block runs, so put cleanup there (cancel the upstream LLM call, record token usage, release a lock). If you poll in a loop instead of awaiting, check `await request.is_disconnected()`. Two testing traps: `TestClient` and `httpx.ASGITransport` read the whole body, so an endless stream hangs the test (use a finite stream, a raw ASGI call as in the [disconnect problem](#/fastapi/p-stream-events-and-clean-up-when-the-client-disconnects) below, or a real uvicorn server); and dict data is JSON-encoded with default spacing, so compare parsed JSON rather than strings. The [Server-Sent Events chapter](#/sse) covers the wire format, resuming and proxies in depth.

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

The protocol itself (handshake, heartbeats, reconnects, scaling) is in the [WebSockets chapter](#/websockets).

## Structuring a real project

```text
app/
  main.py            # create FastAPI(), include routers, middleware, lifespan
  core/config.py     # settings (pydantic-settings: values from environment variables)
  core/security.py   # token checks, get_current_user
  db/session.py      # engine, SessionLocal, get_db dependency
  models/            # SQLAlchemy ORM models (tables)
  schemas/           # Pydantic models (request and response shapes)
  routers/patients.py
  routers/documents.py
  services/          # business logic, no HTTP in here
tests/
```

Each router file creates `router = APIRouter(prefix="/patients", tags=["patients"])`, and `main.py` calls
`app.include_router(router, prefix="/api/v1")`. Keep business logic in services so it can be tested without HTTP,
and keep Pydantic schemas separate from ORM models.

## Running in production

- **Uvicorn** is the ASGI server: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` (or `fastapi run`). `--workers N` starts N processes, each with its own event loop, which is how one machine uses several CPU cores.
- In **containers** (Kubernetes, Cloud Run), the usual choice is one Uvicorn process per container and scaling the number of containers, so the platform handles restarts and load balancing; use `--workers` only to use several vCPUs in one container. Gunicorn as a process manager with Uvicorn workers is the classic choice on plain VMs. On Cloud Run, per-instance concurrency (80 requests by default, or 80 per vCPU for services created with gcloud or Terraform; up to 1,000) plus instance autoscaling does the work.
- **Settings** come from environment variables via `pydantic-settings` (`BaseSettings`), with secrets injected from a secret manager as env vars or mounted files, never baked into the image.
- **Behind a load balancer**, Uvicorn reads `X-Forwarded-*` headers but trusts them only from `127.0.0.1` by default: set `--forwarded-allow-ips` (or `FORWARDED_ALLOW_IPS`) so the client IP and scheme are correct, and set `--timeout-graceful-shutdown` below the platform's shutdown window.
- Add a cheap `/health` endpoint for liveness and readiness probes, structured JSON logs with a request ID, and turn
  off the interactive docs (`docs_url=None`) for public production APIs if policy requires.
- Interactive docs come free: Swagger UI at `/docs`, ReDoc at `/redoc`, the schema at `/openapi.json`, all
  generated from your type hints and models.

## Testing FastAPI

- **`TestClient`** (sync, built on httpx) calls the app in-process: no server needed. Use it as a context manager (`with TestClient(app) as client`) so the lifespan runs.
- **`httpx.AsyncClient(transport=httpx.ASGITransport(app=app))`** for async tests, for example when the test itself must `await` other things or run requests concurrently. It does not run the lifespan for you.
- **`app.dependency_overrides`** to replace auth, the database session or external clients with fakes.
- `httpx.MockTransport` to fake upstream HTTP APIs; WebSockets with `client.websocket_connect`; SSE with `client.stream(...)` on a finite stream.
- `TestClient(app, raise_server_exceptions=False)` to assert on a 500 response instead of seeing the raised error.

## Interview questions

### What is FastAPI, and why would you choose it over Flask or Django? {core}

FastAPI is a modern Python web framework for building APIs, built on Starlette for the web layer and Pydantic for
validation. I choose it for APIs because the type hints do real work: they drive request validation, serialisation
and the OpenAPI docs, so I write less code and get fewer bugs. It is ASGI and async-native, which suits I/O-heavy
services, and dependency injection makes the code easy to test.

Flask is minimal and synchronous by default, so you add validation, docs and structure yourself. Django is a full
"batteries included" framework with an ORM, admin and auth, which is great for server-rendered or admin-heavy apps; for APIs you add Django REST Framework. For a JSON API in front of a React app or an ML model, FastAPI is usually the most productive choice.

| | FastAPI | Django (+ DRF) | Flask |
|---|---|---|---|
| Style | API-first, async | Full-stack, batteries included | Micro-framework |
| Validation | Pydantic, from type hints | DRF serializers, forms | Extensions (Marshmallow, Pydantic) |
| Docs | OpenAPI + Swagger UI built in | Via packages (drf-spectacular) | Via extensions |
| ORM | Bring your own (SQLAlchemy, SQLModel) | Django ORM built in | Bring your own |
| Async | Native | Supported (async views, partly async ORM) | Async views possible, but WSGI-based |
| Best fit | Microservices, ML serving, high-concurrency I/O | Admin-heavy business apps | Small services, full control |

**Your angle:** the Document AI backend at Quantiphi was FastAPI with Pydantic schemas that enforced the data contract on ML-extracted fields before human review; say why FastAPI fit that job: typed contracts and validation at the edge.

### What is ASGI, and how is it different from WSGI? {core}

WSGI is the older synchronous interface between Python web servers and apps (Flask, classic Django): one request
occupies one worker thread until it finishes. ASGI is its async successor: the server calls the app as a coroutine,
so one process can interleave thousands of concurrent connections while they wait on I/O, and it supports
WebSockets and long-lived streaming. FastAPI and Starlette are ASGI apps, typically served by Uvicorn.

### How does FastAPI validate a request, and what happens when validation fails? {core}

FastAPI reads the endpoint's signature: each parameter's type and its `Path`, `Query`, `Header` or `Body`
constraints, and any Pydantic model for the body. Before calling my function it parses and validates everything
with Pydantic. If anything fails, my function is never called and the client gets a 422 with a `detail` list: one
entry per error, each with `loc`, `msg` and `type`, so the front end can highlight every bad field at once.

FastAPI returns 422 even for malformed JSON (`json_invalid`), so 400 is only what I raise myself. I can customise the format by registering a handler for `RequestValidationError`, which is how you return an organisation-wide error shape such as RFC 9457 problem details.

### How does FastAPI decide whether a parameter is a path, query or body parameter?

If the name appears in the path template, it is a path parameter. If it is a Pydantic model, it is the JSON body.
Otherwise a simple type such as `int`, `str` or `bool` is a query parameter. I can be explicit with
`Annotated[int, Query(ge=1)]`, `Header()`, `Cookie()` or `Body()`, which also lets me add constraints.

### Why use separate input and output models, and what does the response model do? {core}

Because they are different contracts. The create model contains only fields the client may set, with `extra="forbid"` so typos fail loudly; the read model contains server-owned fields such as `id`, `status` and timestamps. Whatever the endpoint returns is validated and **filtered** through the response model, so a password hash, an SSN or an internal cost field can never reach the client, even if the database row contains it. Both models feed the OpenAPI schema, which can generate a typed TypeScript client.

In practice I keep `PatientCreate`, `PatientUpdate` (every field optional, applied with `model_dump(exclude_unset=True)`) and `PatientOut`. For event payloads, a discriminated union (`Field(discriminator="type")`) validates against exactly one model and gives a precise error ("`tool_call` is missing `args`"), and it matches a TypeScript discriminated union on the front end.

**Your angle:** at Quantiphi the Pydantic schemas were the data contract for ML-extracted fields: the quality gate before human review.

### What is dependency injection in FastAPI, and why is it useful? {core}

A dependency is a function, declared with `Depends`, that FastAPI calls before my endpoint and passes the result in.
Dependencies can have their own dependencies, and FastAPI resolves the whole graph per request; an error raised in a dependency, such as a 401, stops the request early. I use them for the DB session, the current user, role checks, pagination, rate limits and settings.

It removes duplication, keeps endpoints focused on business logic, and makes testing simple, because
`app.dependency_overrides[get_current_user] = fake_user` swaps the real implementation without touching the code. Two senior details: within one request a dependency used in several places is called once and its value reused (`use_cache=False` opts out; nothing is cached across requests); and a `yield` dependency's teardown runs after the response is sent, even after a stream finishes, unless you declare it with `scope="function"`.

### How do you manage a database session per request?

With a `yield` dependency: create the session, `yield` it, commit if the endpoint succeeded, roll back on an
exception, and always close it in `finally`. Endpoints declare `db: Annotated[Session, Depends(get_db)]`, so each
request gets its own session and nothing leaks between requests. In tests I override `get_db` to point at a test
database or an in-memory SQLite. For streaming endpoints, `scope="function"` releases the session before the stream starts.

### What is the difference between `def` and `async def` endpoints? {core}

FastAPI runs `async def` endpoints directly on the event loop, and `def` endpoints in a thread pool (AnyIO's, 40
threads by default) so they cannot block the loop. Use `async def` only when everything inside is non-blocking and
awaited: an async HTTP client, an async database driver. Use plain `def` when calling blocking libraries such as
`requests` or a sync database driver.

The classic bug is a blocking call such as `time.sleep` or `requests.get` inside `async def`: it freezes the event
loop and every concurrent request on that process waits, so five concurrent 0.2-second requests take a full second, health checks fail and streams stall. The fix is the async library, switching the endpoint to `def`, or wrapping the call in `await asyncio.to_thread(...)`. To find it: asyncio debug mode logs slow callbacks (`loop.slow_callback_duration`), and profiling under load shows one long synchronous frame. With a sync-only database library, make those endpoints `def` (or use `to_thread`) and size the database pool to the thread pool.

### How many requests can one FastAPI process handle at once? {deep}

For `async def` endpoints doing awaited I/O, many thousands: each waiting request is just a coroutine, and the limit is memory, file descriptors and downstream capacity. For `def` endpoints, 40 at a time (AnyIO's default thread limiter); more queue for a thread. CPU-bound work is limited to roughly one core per process by the GIL. On Cloud Run the platform also caps concurrent requests per instance (80 by default, or 80 per vCPU for services created with gcloud or Terraform; at most 1,000) and scales instances out.

### What happens if you run CPU-heavy work, like model inference, inside an endpoint? {core}

In `async def` it blocks the event loop; in `def` it ties up a thread-pool thread, and because of the GIL the threads
do not run Python code in parallel, so throughput collapses under load. Options: run several Uvicorn workers
(processes), push short jobs to a `ProcessPoolExecutor`, or move the work out of the request path into a queue with separately sized worker containers, and return a job ID the client can poll or stream. Libraries like NumPy and PyTorch release the GIL inside their native code, which helps, but long jobs should still be asynchronous jobs.

Python 3.14 supports the free-threaded build, but many C extensions and production images still assume the GIL, so I would not depend on it yet.

### How do you limit concurrency to a rate-limited external API?

Wrap each call in an `asyncio.Semaphore` sized to the allowed concurrency, add a per-call timeout and retries with exponential backoff and jitter for 429 and 5xx, and respect `Retry-After`. The semaphore is per process, so with many instances the real limit is semaphore × instances: for a strict global limit, use a shared limiter (a Redis token bucket) or route the calls through a queue such as Cloud Tasks with a dispatch rate.

### How do you add a timeout to a slow dependency call?

Set timeouts at two levels: the client's own timeouts (`httpx.Timeout(10, connect=2)`), and an overall deadline with `async with asyncio.timeout(seconds):` around a group of awaits, which cancels the work inside and raises `TimeoutError`. Map that to a 504 or a retry, and make sure the deadline is shorter than the caller's, so you fail before your client gives up on you.

### What is the lifespan, and how do you load a model or a shared client once? {core}

The lifespan is an async context manager that runs once per process: setup before the first request, teardown at shutdown. I create shared resources there, such as an `httpx.AsyncClient` for connection pooling, the database engine or pool, configuration or an ML model, and yield them as state so handlers read them from `request.state`. Teardown closes them cleanly when the platform sends SIGTERM. It replaced the old `@app.on_event("startup")` hooks.

Request latency is then just the work itself. With several Uvicorn workers each process loads its own copy, which matters for memory sizing; for heavy models I would serve them separately (a model endpoint or a GPU service) and call them from the API.

### When are BackgroundTasks enough, and when do you need a queue? {core}

`BackgroundTasks` run in the same process right after the response is sent: fine for quick, best-effort work such
as writing an audit record or sending a notification email. They have no retries, no persistence and no visibility,
they die with the process, and on serverless platforms the CPU can be throttled after the response. Anything durable, slow or CPU-heavy, such as OCR on an uploaded document, an agent run or a call to an ERP, goes to a real queue (Celery with Redis or RabbitMQ, Cloud Tasks, Pub/Sub, a Postgres-backed queue) with workers, idempotent handlers, retries and a dead-letter queue. The API returns 202 Accepted with a status URL or a stream to follow.

### How do you stream LLM output or events from FastAPI? {core}

Use Server-Sent Events: set `response_class=EventSourceResponse` and `yield` events from an async generator, with `ServerSentEvent(event="token", id=...)` for named events and resumable ids. FastAPI sets no-cache and no-buffering headers and sends keep-alive pings. For non-browser consumers, a generator endpoint streams JSON Lines. The generator awaits the upstream stream token by token, and its `finally` block handles cleanup when the client disconnects.

### How do you stop generating when the client disconnects? {deep}

When the client goes away, Starlette cancels the response's generator, so the `CancelledError` arrives at the generator's current `await`. Put the cleanup in `finally`: cancel the upstream LLM request (closing its stream stops token generation and billing), persist what was produced, record usage. If the loop does not await often, check `await request.is_disconnected()`. For runs that must continue without a viewer, decouple: the work runs in a worker and the stream only follows its event log, so a disconnect stops the stream, not the run.

### How do you return a large file, or accept a large upload? {deep}

Use `StreamingResponse` with a generator (or async generator) so the response is sent in chunks without loading
everything into memory, or `FileResponse` for a file on disk. For very large documents, better still: generate a
short-lived signed URL to object storage (GCS, S3, Azure Blob) and let the client download directly. Uploads use
`UploadFile`, which keeps up to 1 MB in memory and spools anything larger to a temporary file on disk (it needs the
`python-multipart` package); very large uploads also go straight to object storage through a signed upload URL.

**Your angle:** the Document AI platform at Quantiphi gave reviewers secure access to documents through GCS signed URLs.

### How do you implement and secure a WebSocket endpoint in FastAPI?

Declare `@app.websocket(path)`, authenticate before `accept()` (a session cookie, or a short-lived single-use ticket from an authenticated REST call in the query string, because browsers cannot set an Authorization header on a WebSocket), and close if it fails: before `accept()` that becomes an HTTP 403 on the handshake, after it a close frame with 1008. Then loop on `receive_json`, validate every message with a Pydantic model, and handle `WebSocketDisconnect` to clean up subscriptions. Check the `Origin` header to prevent cross-site WebSocket hijacking, and re-check authorisation for each action, not only at connect time.

### How do you add authentication to a FastAPI API? {core}

As a dependency. `OAuth2PasswordBearer(tokenUrl=...)` or `HTTPBearer` extracts the bearer token (and returns 401 when
it is missing); my `get_current_user` dependency verifies the token, typically a JWT: check the signature with the
right key and algorithm, `exp`, issuer and audience, then load the user. Role checks are a dependency factory such as
`require_role("admin")` that returns 403 when the role is missing. Endpoints just declare `user: CurrentUser`.

In enterprise setups the token comes from an identity provider (Entra ID, Okta, Cognito, Identity Platform) via OAuth 2.0/OIDC,
so the API only validates tokens with a maintained library (PyJWT, Authlib) and never handles passwords. The token formats and flows are in [Identity and access](#/auth-identity); the [token and role problem](#/fastapi/p-protect-endpoints-with-a-token-and-a-role-check) below builds the dependency layers.

### What is CORS, and how do you configure it in FastAPI? {core}

CORS is a browser rule: a page on one origin (scheme + host + port) can only read responses from another origin if
that server allows it with `Access-Control-Allow-*` headers. For non-simple requests the browser first sends a
preflight `OPTIONS`. In FastAPI I add `CORSMiddleware` with an explicit list of allowed origins (the React app's
URL), methods and headers. I never combine `allow_origins=["*"]` with credentials. CORS protects users' browsers; it
is not server-side security, since curl ignores it.

### How do you handle errors consistently?

Raise `HTTPException` for simple HTTP errors. For domain errors, define exceptions such as `PatientNotFound` and
register `@app.exception_handler(PatientNotFound)` to map them to a status code and a consistent JSON body, so
services do not need to know about HTTP. I also add handlers for `RequestValidationError`, Starlette's `HTTPException` (so router 404s and 405s match) and a catch-all that logs the stack trace with the request ID and returns a generic 500 without leaking internals or personal data. The usual body format is RFC 9457 problem details.

### Middleware or dependency: when do you use which? {deep}

Middleware wraps every request and response at the ASGI level: request IDs, timing, logging, CORS, GZip, security
headers. It sees the raw request but not parsed parameters, and it runs even for 404s. Dependencies run per route,
receive validated parameters, can be overridden in tests and show up in the OpenAPI docs (for example a security
scheme). So: cross-cutting transport concerns go in middleware; auth, permissions, DB sessions, rate limits and per-route logic go in
dependencies. For streaming endpoints prefer pure ASGI middleware, because `BaseHTTPMiddleware` wraps the response body and has had issues with streaming and context variables.

### How do you propagate a request id or trace through async code? {deep}

With `contextvars`: middleware sets a `ContextVar` at the start of the request, and every coroutine and task created inside inherits a copy, so the logger can read it anywhere. OpenTelemetry's Python context is built on the same mechanism. Forward the id to downstream calls as a header (W3C `traceparent`) so traces span services. The [request-id middleware problem](#/fastapi/p-request-id-middleware-with-contextvars) builds it.

### How do you test a FastAPI application? {core}

With `TestClient`, which calls the app in-process through httpx: no server needed. I test the happy path, validation
errors (422), auth failures (401 and 403) and not-found cases. I replace external dependencies with
`app.dependency_overrides` (a fake current user, a test database session) and fake upstream HTTP APIs with `httpx.MockTransport`. I use `with TestClient(app) as client:` when the app has a lifespan, `httpx.AsyncClient` with `ASGITransport` for async or concurrent tests, `client.stream` for SSE and `websocket_connect` for WebSockets.

Business logic lives in service functions that I unit test without HTTP at all, and integration tests run against a real database in a container.

### How would you structure a large FastAPI codebase?

By feature, with layers: `routers/` (thin HTTP layer using `APIRouter` with a prefix and tags), `schemas/` (Pydantic
request and response models), `services/` (business logic, no HTTP), `models/` and `db/` (ORM and sessions),
`core/` (settings, security). `main.py` creates the app, adds middleware and the lifespan and includes routers under
`/api/v1`. Settings come from environment variables via pydantic-settings. This keeps endpoints short and the logic
unit-testable.

### How do you deploy and scale a FastAPI service?

Package it in a Docker image (slim Python base, dependencies installed in a cached layer, non-root user), run Uvicorn
on `$PORT`, usually one process per container, and deploy to a container platform. Scale horizontally: more containers or pods behind a load balancer, with health checks. Keep the service stateless (sessions in tokens or Redis, files in object storage) so any instance can serve any request.

On Cloud Run, tune per-instance concurrency to the workload (lower it for CPU-heavy requests), set min instances to avoid cold starts on latency-sensitive paths, handle SIGTERM through the lifespan, read secrets from Secret Manager, and size database pools so that instances × pool size stays under the database's connection limit.

**Your angle:** at Quantiphi you containerised the services with Docker and deployed them through Artifact Registry to Cloud Run across Dev, SIT and UAT.

### How do you implement pagination and filtering? {deep}

Accept `limit` and `offset` (or a `cursor`) as validated query parameters, `Query(ge=1, le=100)` so nobody can ask
for a million rows, and return the items plus metadata such as `total` and `next_offset`. Filters are optional query
parameters. A dependency or a Pydantic model for query parameters (`Annotated[Filters, Query()]`) keeps signatures
short and reusable. For large or fast-changing tables, cursor (keyset) pagination on an indexed column is faster and
more stable than OFFSET; [API design](#/api-design) covers the trade-off and an opaque-cursor implementation.

### How does FastAPI produce the OpenAPI documentation? {deep}

From the code: routes, parameter types and constraints, Pydantic models (as JSON Schema), response models, status
codes, tags and security dependencies. It serves the schema at `/openapi.json`, with Swagger UI at `/docs` and ReDoc
at `/redoc`. Front-end teams can generate a typed TypeScript client from the schema, which keeps React and the API
in sync.

### How do you version an API in FastAPI? {deep}

Usually with a URL prefix: one `APIRouter` per version included as `/api/v1` and `/api/v2`, sharing services
underneath. Additive changes (new optional fields, new endpoints) do not need a new version; breaking changes
(removing or renaming fields, changing types) do. Keep old versions running for a published deprecation period
and announce it with `Deprecation` and `Sunset` headers ([API design](#/api-design) has a tested example).

## Coding problems

### Build a patient CRUD API {medium core}

Build an in-memory API for patients with these endpoints, and test it:

- `POST /patients` creates a patient (`name` required, `birth_date` a date, `state` a two-letter code) and returns
  201 with an `id`.
- `GET /patients/{id}` returns the patient or 404.
- `PATCH /patients/{id}` updates only the fields sent.
- `DELETE /patients/{id}` returns 204, then the patient is gone.

#### Hints

1. Think about how many different shapes of "patient" the endpoints accept and return.
2. For PATCH, Pydantic can tell you which fields the client actually sent.
3. Put the "find or 404" logic in one helper so every endpoint uses it.

#### Solution

Separate input, update and output models; an in-memory dict as the store; a helper that raises 404; and PATCH that
merges only the fields that were set. `exclude_unset=True` is the detail interviewers look for: without it, a PATCH
that sends only `state` would overwrite `name` with `None`.

```python
from datetime import date
from itertools import count
from typing import Annotated

from fastapi import FastAPI, HTTPException, Path, status
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field


class PatientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    birth_date: date
    state: str = Field(pattern=r"^[A-Z]{2}$")


class PatientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    birth_date: date | None = None
    state: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")


class Patient(PatientCreate):
    id: int


app = FastAPI()
patients: dict[int, Patient] = {}
ids = count(1)
PatientId = Annotated[int, Path(gt=0)]


def find(patient_id: int) -> Patient:
    patient = patients.get(patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail=f"Patient {patient_id} not found")
    return patient


@app.post("/patients", status_code=status.HTTP_201_CREATED)
def create_patient(body: PatientCreate) -> Patient:
    patient = Patient(id=next(ids), **body.model_dump())
    patients[patient.id] = patient
    return patient


@app.get("/patients/{patient_id}")
def get_patient(patient_id: PatientId) -> Patient:
    return find(patient_id)


@app.patch("/patients/{patient_id}")
def update_patient(patient_id: PatientId, body: PatientUpdate) -> Patient:
    current = find(patient_id)
    changes = body.model_dump(exclude_unset=True)          # only fields the client sent
    updated = current.model_copy(update=changes)
    patients[patient_id] = updated
    return updated


@app.delete("/patients/{patient_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_patient(patient_id: PatientId) -> None:
    find(patient_id)
    del patients[patient_id]


client = TestClient(app)

r = client.post("/patients", json={"name": "Ana Diaz", "birth_date": "1980-02-29", "state": "CA"})
assert r.status_code == 201
assert r.json() == {"name": "Ana Diaz", "birth_date": "1980-02-29", "state": "CA", "id": 1}

assert client.post("/patients", json={"name": "", "birth_date": "1980-01-01", "state": "Calif"}).status_code == 422
assert client.get("/patients/1").json()["name"] == "Ana Diaz"
assert client.get("/patients/99").status_code == 404

r = client.patch("/patients/1", json={"state": "NY"})
assert r.json() == {"name": "Ana Diaz", "birth_date": "1980-02-29", "state": "NY", "id": 1}   # name kept

r = client.delete("/patients/1")
assert r.status_code == 204 and r.content == b""
assert client.get("/patients/1").status_code == 404
assert client.delete("/patients/1").status_code == 404
print("patient CRUD ok")
```

Every operation is O(1) with a dict. In a real service the dict becomes a repository backed by a database session
dependency, and the tests override that dependency.

#### Follow-ups

- **Why not reuse one model for everything?** The output adds `id` and must never echo sensitive input; the update
  model needs every field optional. Separate models make each contract explicit.
- **PUT or PATCH?** PUT replaces the whole resource (all fields required), PATCH applies a partial change.
- **Does `model_copy(update=...)` validate?** No: it trusts the values. They were validated by `PatientUpdate`, but a
  client that sends `"name": null` explicitly counts as "set" and would store `None`. Reject explicit nulls in a
  validator, or rebuild with `Patient.model_validate(current.model_dump() | changes)`.
- **Short on time in a live round?** Write the models, POST and GET first, then PATCH; DELETE is four lines.
- **How do you stop two clients overwriting each other?** Optimistic concurrency: return an `ETag` or `version`,
  require `If-Match` on updates and answer 412 when it no longer matches.
- **How do you make POST safe to retry?** An `Idempotency-Key` header; [API design](#/api-design) builds it, including the in-flight and failure cases.

### Add pagination and filtering to a list endpoint {medium}

Add `GET /claims` that returns claims filtered by an optional `status` and paginated by `limit` (1–100, default 10)
and `offset` (≥ 0). The response must contain `items`, `total` (matching rows before paging) and `next_offset` (or
`null` on the last page).

#### Hints

1. Let FastAPI reject bad paging values for you instead of checking them by hand.
2. Think about the order of filtering, counting and slicing.
3. A small response model documents the page shape in OpenAPI.

#### Solution

Validate paging with `Annotated[int, Query(ge=1, le=100)]`, then filter, count and slice. `next_offset` is `offset + limit` only if there are rows beyond this page.

```python
from typing import Annotated, Literal

from fastapi import FastAPI, Query
from fastapi.testclient import TestClient
from pydantic import BaseModel

Status = Literal["submitted", "paid", "denied"]


class Claim(BaseModel):
    id: int
    status: Status
    amount: float


class ClaimPage(BaseModel):
    items: list[Claim]
    total: int
    next_offset: int | None


CLAIMS = [Claim(id=i, status=("paid", "denied", "submitted")[i % 3], amount=100.0 * i) for i in range(1, 26)]
app = FastAPI()


@app.get("/claims")
def list_claims(
    status: Status | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 10,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ClaimPage:
    rows = [c for c in CLAIMS if status is None or c.status == status]
    page = rows[offset: offset + limit]
    more = offset + limit < len(rows)
    return ClaimPage(items=page, total=len(rows), next_offset=offset + limit if more else None)


client = TestClient(app)
body = client.get("/claims").json()
assert body["total"] == 25 and len(body["items"]) == 10 and body["next_offset"] == 10

body = client.get("/claims?offset=20").json()
assert [c["id"] for c in body["items"]] == [21, 22, 23, 24, 25] and body["next_offset"] is None

body = client.get("/claims?status=denied&limit=3").json()
assert body["total"] == 9 and all(c["status"] == "denied" for c in body["items"])

assert client.get("/claims?limit=0").status_code == 422
assert client.get("/claims?status=lost").status_code == 422          # not one of the Literal values
print("pagination ok")
```

Filtering is O(n) over the in-memory list; in SQL it becomes `WHERE status = :status ORDER BY id LIMIT :limit OFFSET
:offset` plus a `COUNT(*)`.

#### Follow-ups

- **Why can OFFSET be slow?** The database still reads and discards the skipped rows; deep pages get slower. Use
  keyset pagination: `WHERE id > :last_id ORDER BY id LIMIT :limit`.
- **Why always ORDER BY?** Without a stable order, rows can repeat or vanish between pages.

### Protect endpoints with a token and a role check {medium core}

Add authentication to an API: requests send `Authorization: Bearer <token>`. `GET /me` returns the user for any
valid token; `GET /reports` is only for users with the `admin` role. Return 401 when the token is missing or
unknown, 403 when the role is wrong. Show how a test can bypass auth.

#### Hints

1. Read the `Authorization` header as an optional header parameter and check its scheme.
2. Separate "who are you?" from "may you do this?": two layers, each reusable.
3. 401 and 403 mean different things, and 401 comes with a header telling the client how to authenticate.

#### Solution

Two layers of dependencies: one authenticates (401, with `WWW-Authenticate: Bearer`), one authorises (403). The role check is a dependency factory, so each endpoint states its rule in its signature. Tests replace `get_current_user` with `dependency_overrides`, which tests every permission path without real tokens.

```python
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.testclient import TestClient
from pydantic import BaseModel


class User(BaseModel):
    username: str
    roles: set[str]


TOKENS = {"t-nurse": User(username="nina", roles={"nurse"}),
          "t-admin": User(username="raj", roles={"admin", "nurse"})}


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> User:
    unauthorized = HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    if not authorization or not authorization.startswith("Bearer "):
        raise unauthorized
    user = TOKENS.get(authorization.removeprefix("Bearer "))   # real code: verify a JWT here
    if user is None:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(role: str):
    def check(user: CurrentUser) -> User:
        if role not in user.roles:
            raise HTTPException(403, f"Requires role {role!r}")
        return user
    return check


app = FastAPI()


@app.get("/me")
def me(user: CurrentUser) -> User:
    return user


@app.get("/reports")
def reports(user: Annotated[User, Depends(require_role("admin"))]):
    return {"reports": ["denials-by-month"], "for": user.username}


client = TestClient(app)
r = client.get("/me")
assert r.status_code == 401 and r.headers["www-authenticate"] == "Bearer"
assert client.get("/me", headers={"Authorization": "Bearer nope"}).status_code == 401
assert client.get("/me", headers={"Authorization": "Bearer t-nurse"}).json()["username"] == "nina"
assert client.get("/reports", headers={"Authorization": "Bearer t-nurse"}).status_code == 403
assert client.get("/reports", headers={"Authorization": "Bearer t-admin"}).json()["for"] == "raj"

# Tests can skip real authentication entirely:
app.dependency_overrides[get_current_user] = lambda: User(username="test", roles={"admin"})
assert client.get("/reports").status_code == 200
app.dependency_overrides[get_current_user] = lambda: User(username="viewer", roles={"viewer"})
assert client.get("/reports").status_code == 403
app.dependency_overrides.clear()
print("auth ok")
```

Each check is O(1). In production `get_current_user` validates a JWT from the identity provider (signature, expiry,
issuer, audience) instead of looking up a dict.

#### Follow-ups

- **Where do roles come from?** Claims in the token (Entra ID app roles, Okta groups) or a lookup in your database. With SAML or OIDC, IdP groups are mapped to application roles at login; keep the mapping in configuration, not code.
- **How would you restrict data, not just endpoints?** Row-level checks in the service: a provider sees only their
  own patients, an operator only their tenant's runs. That is authorisation on the resource, not the route.

### Write a rate-limiting dependency {medium}

Limit each client (identified by an `X-API-Key` header) to 3 requests per 10 seconds on an endpoint. Over the limit,
return 429 with a `Retry-After` header. Make it testable without sleeping.

#### Hints

1. For each key, remember when its recent requests happened.
2. Before accepting a request, forget the ones that are older than the window.
3. Inject the clock so tests can move time forward instantly.

#### Solution

A sliding-window log: per key, a `deque` of timestamps inside the window; drop old ones, reject if the deque already holds the limit, otherwise append now. The limiter is a class instance whose `__call__` makes it a dependency, and the clock is injected for testing.

```python
import math
from collections import defaultdict, deque
from typing import Annotated, Callable

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.testclient import TestClient


class RateLimiter:
    def __init__(self, limit: int, window: float, clock: Callable[[], float]):
        self.limit, self.window, self.clock = limit, window, clock
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def __call__(self, x_api_key: Annotated[str, Header()]) -> str:
        now = self.clock()
        q = self.hits[x_api_key]
        while q and q[0] <= now - self.window:      # forget requests that left the window
            q.popleft()
        if len(q) >= self.limit:
            retry = math.ceil(q[0] + self.window - now)
            raise HTTPException(429, "Too many requests", headers={"Retry-After": str(retry)})
        q.append(now)
        return x_api_key


fake_now = [1000.0]
limiter = RateLimiter(limit=3, window=10, clock=lambda: fake_now[0])
app = FastAPI()


@app.get("/eligibility")
def eligibility(client_key: Annotated[str, Depends(limiter)]):
    return {"client": client_key, "eligible": True}


client = TestClient(app)
key = {"X-API-Key": "clinic-1"}
assert [client.get("/eligibility", headers=key).status_code for _ in range(3)] == [200, 200, 200]
r = client.get("/eligibility", headers=key)
assert r.status_code == 429 and r.headers["retry-after"] == "10"
assert client.get("/eligibility", headers={"X-API-Key": "clinic-2"}).status_code == 200   # separate budget

fake_now[0] += 10                                     # the window slides past the first three hits
assert client.get("/eligibility", headers=key).status_code == 200
assert client.get("/eligibility").status_code == 422  # header missing
print("rate limiter ok")
```

O(1) amortised per request; memory is O(limit) per active key.

#### Follow-ups

- **Several workers or pods?** An in-process dict is per process. Use a shared store: Redis with an atomic script or
  `INCR` + `EXPIRE` (fixed window), or rate limit at the API gateway. [Redis](#/redis) builds both.
- **Token bucket instead?** It allows short bursts while enforcing an average rate, and needs only two numbers per key.

### Return one consistent error format {medium}

Every error from the API must look like `{"error": {"code": ..., "message": ..., "details": [...]}}`, whether it is a
validation error, an `HTTPException`, a domain error such as "claim already paid", or an unexpected crash (which must
not leak the exception text).

#### Hints

1. FastAPI lets you register a handler per exception type; list the families of errors you need to cover.
2. Router-level 404s and 405s are raised as Starlette's exception, not FastAPI's.
3. A test needs a way to see the 500 response instead of the raised error.

#### Solution

One small function builds the body; one handler per error family uses it: `RequestValidationError`, Starlette's `HTTPException` (so router 404s and 405s get the same format), your domain exception base class, and a catch-all `Exception` that logs and returns a generic 500. `TestClient(app, raise_server_exceptions=False)` lets the test see the 500.

```python
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException


def error(status: int, code: str, message: str, details: list | None = None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message, "details": details or []}})


class DomainError(Exception):
    status, code = 400, "domain_error"

    def __init__(self, message: str):
        self.message = message


class ClaimAlreadyPaid(DomainError):
    status, code = 409, "claim_already_paid"


app = FastAPI()


@app.exception_handler(RequestValidationError)
async def on_validation(request: Request, exc: RequestValidationError):
    details = [{"field": ".".join(str(p) for p in e["loc"][1:]), "issue": e["msg"]} for e in exc.errors()]
    return error(422, "validation_failed", "Request is invalid", details)


@app.exception_handler(StarletteHTTPException)
async def on_http(request: Request, exc: StarletteHTTPException):
    return error(exc.status_code, f"http_{exc.status_code}", str(exc.detail))


@app.exception_handler(DomainError)
async def on_domain(request: Request, exc: DomainError):
    return error(exc.status, exc.code, exc.message)


@app.exception_handler(Exception)
async def on_crash(request: Request, exc: Exception):
    # log the stack trace with a request ID here; never send it to the client
    return error(500, "internal_error", "Something went wrong")


class Payment(BaseModel):
    amount: float = Field(gt=0)


@app.post("/claims/{claim_id}/pay")
def pay(claim_id: int, payment: Payment):
    if claim_id == 1:
        raise ClaimAlreadyPaid(f"Claim {claim_id} is already paid")
    if claim_id == 13:
        raise RuntimeError("db password is hunter2")
    return {"claim_id": claim_id, "paid": payment.amount}


client = TestClient(app, raise_server_exceptions=False)
assert client.post("/claims/2/pay", json={"amount": 50}).json() == {"claim_id": 2, "paid": 50.0}

body = client.post("/claims/2/pay", json={"amount": -5}).json()
assert body["error"]["code"] == "validation_failed"
assert body["error"]["details"][0]["field"] == "amount"

r = client.post("/claims/1/pay", json={"amount": 5})
assert r.status_code == 409 and r.json()["error"]["code"] == "claim_already_paid"

r = client.get("/no-such-route")
assert r.status_code == 404 and r.json()["error"]["code"] == "http_404"

r = client.post("/claims/13/pay", json={"amount": 5})
assert r.status_code == 500 and "hunter2" not in r.text
print("error format ok")
```

#### Follow-ups

- **Is there a standard for this?** RFC 9457 "Problem Details for HTTP APIs" (`type`, `title`, `status`, `detail`,
  `instance`, served as `application/problem+json`); [API design](#/api-design) implements it.
- **What else belongs in an error?** A request or correlation ID that support can search for in the logs.

### Fan out to an external API with bounded concurrency and partial failures {medium core}

A service needs details for many purchase orders from an ERP API that allows at most 3 concurrent calls and sometimes fails or hangs. Write `fetch_all(ids, fetch, limit=3, timeout=0.2)` that calls the async `fetch(id)` for every id with at most `limit` in flight, applies a per-call timeout, and returns `(results, errors)`: a dict of id to result, and a dict of id to the error type name. Results must not depend on completion order.

#### Hints

1. One asyncio primitive caps how many calls are in flight at once.
2. A deadline can wrap a single call, not just the whole batch.
3. One failure must not lose the other results: decide where to catch exceptions.

#### Solution

Wrap each call in a small coroutine that takes an `asyncio.Semaphore(limit)`, applies `asyncio.timeout` per call, and returns a tagged result. `gather` runs them all; because each wrapper catches its own errors, the batch never aborts halfway.

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

### Stream events and clean up when the client disconnects {medium core}

Write an SSE endpoint `GET /runs/{run_id}/events` that streams `step` events (id = step number) from a slow producer, and records `"cleanup"` in a log when the stream ends for any reason, including a client disconnect. Prove with a raw ASGI test that after the client disconnects, the generator stops producing and the cleanup runs.

#### Hints

1. FastAPI has a response class for Server-Sent Events that works with an async generator.
2. Think about what happens to a generator when its consumer goes away, and where cleanup code must live to run anyway.
3. `TestClient` reads the whole body, so to simulate a disconnect you call the ASGI app yourself and control what `receive` returns.

#### Solution

The endpoint uses `response_class=EventSourceResponse` with cleanup in `try/finally`; the interesting part is proving cancellation. Calling the app as `await app(scope, receive, send)` lets the test decide when the client "leaves". After the third event, `receive` returns `http.disconnect`, Starlette cancels the response, the generator gets `CancelledError` at its `await`, and the `finally` block runs.

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
            await asyncio.sleep(0.01)  # stands in for awaiting the next event
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

- **What if the work must continue after the user closes the tab?** Run it in a worker that writes events to a log (Redis Streams, Firestore, Postgres); the SSE endpoint only reads the log from the client's `Last-Event-ID`, so disconnects affect only the viewer.
- **Why might cleanup not run in production?** If the process is killed (SIGKILL after the grace period) `finally` never runs, so durable state must not depend on it.

### Request-id middleware with contextvars {hard}

Write a pure ASGI middleware that reads `x-request-id` from the request (or generates one), stores it in a `ContextVar` for the duration of the request, and adds it to the response headers. A `log()` helper must include the id automatically, even inside tasks created by the handler.

#### Hints

1. A pure ASGI middleware is just a callable that wraps the inner app's `(scope, receive, send)`.
2. To add a response header without buffering the body, intercept the right message on its way out.
3. A context variable must be reset after the request, and tasks copy the current context when they are created.

#### Solution

The middleware sets the context variable before calling the inner app and resets it with the returned token in `finally`, so ids never leak between requests. Wrapping `send` and editing the `http.response.start` message is how pure ASGI middleware edits response headers without buffering the body, which keeps it safe for streaming responses.

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
- **Can you trust the incoming id?** Not blindly: it goes into logs and a response header, so cap its length and allow only safe characters (for example `[A-Za-z0-9-]{1,64}`), otherwise generate a fresh one. That prevents log injection and absurdly large headers.
- **How does this relate to tracing?** Accept and forward W3C `traceparent` instead of (or as well as) a custom id; OpenTelemetry's ASGI instrumentation does this and puts the trace id in the context for logs.
