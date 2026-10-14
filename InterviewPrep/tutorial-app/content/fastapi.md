---
title: FastAPI in depth
goal: Explain exactly what FastAPI does with a request, from validation to dependencies to the response, and build a tested CRUD API live without looking anything up.
minutes: 75
---

FastAPI is your main Python backend and one of the three mandatory skills, so expect questions on it in both formats:
"explain how X works" in the technical part, and "build a small endpoint" in the coding part. Interviewers use it to
check two things: that you understand what the framework does for you (validation, dependency injection, async), and
that you can write a clean, tested API quickly.

Every example below is a complete program that runs and tests itself with `TestClient`. Type a few of them out
tonight; muscle memory for `Annotated[..., Depends(...)]` and `model_dump(exclude_unset=True)` pays off in a live round.

**Your angle:** at Quantiphi you built the FastAPI + Pydantic backend of the LDH Medicaid Document AI platform,
containerised it and shipped it to Cloud Run across Dev, SIT and UAT. Use it as the running example in your answers.

## How a request flows through FastAPI

FastAPI is a thin layer on top of two libraries: **Starlette** (the ASGI web toolkit: routing, middleware, requests,
responses) and **Pydantic** (validation and serialisation). An ASGI server such as **Uvicorn** runs it.

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
Unprocessable Content** with one entry per problem, each with a `loc` (where), `msg` (what) and `type` (machine code):

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


r = TestClient(app).post("/items", json={"name": "", "qty": 0})
assert r.status_code == 422
errors = r.json()["detail"]
assert [(e["loc"], e["type"]) for e in errors] == [
    (["body", "name"], "string_too_short"),
    (["body", "qty"], "greater_than"),
]
print(errors[0]["msg"])
```

```text
String should have at least 1 character
```

All errors come back at once, not just the first, which is what a front end needs to highlight every bad field.

## Request and response models

Use **separate models** for what comes in and what goes out. The response model is a security feature: whatever your
function returns is filtered through it, so a field that is not in the output model (a password hash, an internal
note, an SSN) can never leak, even if the database row contains it.

```python
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

app = FastAPI()


class PatientIn(BaseModel):
    name: str
    ssn: str              # accepted on input …


class PatientOut(BaseModel):
    id: int
    name: str             # … but never returned


DB: dict[int, dict] = {}


@app.post("/patients", status_code=201)
def create_patient(patient: PatientIn) -> PatientOut:   # the return annotation acts as response_model
    row = {"id": len(DB) + 1, **patient.model_dump(), "internal_note": "VIP"}
    DB[row["id"]] = row
    return row          # a dict with extra keys; FastAPI validates and filters it through PatientOut


r = TestClient(app).post("/patients", json={"name": "Ana", "ssn": "123-45-6789"})
assert r.status_code == 201
assert r.json() == {"id": 1, "name": "Ana"}   # no ssn, no internal_note
print("response filtered")
```

You can set the model either with the return annotation (`-> PatientOut`) or with `response_model=PatientOut` in the
decorator. Use `response_model` when the function returns something whose type differs from the model, such as an
ORM object or a dict, and you want type checkers to stay quiet.

## Errors: HTTPException and exception handlers

Raise `HTTPException` for expected HTTP errors. For domain errors, raise your own exception and register a handler
once, so route code stays clean and every error has the same shape.

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
flags. Dependencies can depend on other dependencies, and FastAPI builds the graph per request.

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
`APIRouter(dependencies=[Depends(verify_api_key)])`.

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

By default the code after `yield` runs **after the response has been sent** (and after background tasks). Current
FastAPI versions let you choose with `Depends(get_db, scope="function")`, which closes the dependency as soon as the
endpoint returns, before the response is sent.

## def or async def?

This is the most common FastAPI question, and many candidates get it wrong.

| You write | FastAPI runs it | Use it when |
|---|---|---|
| `async def` | Directly on the event loop | Everything inside is non-blocking: `await httpx.AsyncClient`, async DB drivers (asyncpg, async SQLAlchemy), `asyncio.sleep` |
| `def` | In a worker thread from a threadpool (AnyIO's, 40 threads by default) | You call blocking code: `requests`, a sync DB driver, file I/O, a CPU-light library without async support |

The trap: a blocking call **inside `async def`** (for example `time.sleep(2)` or `requests.get`) blocks the whole
event loop, so every other request on that worker waits. Either make the call async, use `def` so it runs in the
threadpool, or offload it with `await asyncio.to_thread(func)` / `run_in_threadpool`.

CPU-heavy work (a big model inference, PDF rendering) does not belong in either: the GIL means threads do not run
Python code in parallel. Push it to a process pool, a task queue (Celery, Cloud Tasks, Pub/Sub) or a separate service.

```python
import asyncio
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient

app = FastAPI()


async def fetch_eligibility(member_id: str) -> dict:
    await asyncio.sleep(0.2)                 # stands in for an awaited HTTP call
    return {"member": member_id, "eligible": True}


async def fetch_claims(member_id: str) -> list:
    await asyncio.sleep(0.2)
    return [{"claim": "C1"}]


@app.get("/members/{member_id}/summary")
async def summary(member_id: str):
    # Both calls wait at the same time: about 0.2 s in total, not 0.4 s.
    eligibility, claims = await asyncio.gather(fetch_eligibility(member_id), fetch_claims(member_id))
    return {"eligibility": eligibility, "claims": claims}


start = time.perf_counter()
r = TestClient(app).get("/members/M1/summary")
elapsed = time.perf_counter() - start
assert r.json()["claims"] == [{"claim": "C1"}]
assert elapsed < 0.35, elapsed
print(f"took {elapsed:.2f}s")
```

## Background tasks, middleware, CORS and lifespan

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

- **BackgroundTasks** run in the same process after the response. Good for small fire-and-forget work (an audit
  record, an email). They are lost if the process dies and they have no retries, so durable or heavy work belongs in
  a real queue (Celery + Redis, Cloud Tasks, Pub/Sub, Azure Service Bus).
- **Middleware** wraps every request: logging, timing, request IDs, CORS, GZip. It sees raw requests and responses
  but not your parsed parameters.
- **Dependencies** run per route and receive parsed, validated values: use them for auth, DB sessions and anything
  route-specific.
- **Lifespan** replaces the older `@app.on_event("startup")` hooks.

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

- **Uvicorn** is the ASGI server: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4`. Each worker is a
  separate process with its own event loop, which is how you use several CPU cores.
- In **containers** (Kubernetes, Cloud Run), the usual choice is one Uvicorn process per container and scaling the
  number of containers, so the platform handles restarts and load balancing. Gunicorn as a process manager with
  Uvicorn workers is the classic choice on plain VMs.
- Add a cheap `/health` endpoint for liveness and readiness probes, structured JSON logs with a request ID, and turn
  off the interactive docs (`docs_url=None`) for public production APIs if policy requires.
- Interactive docs come free: Swagger UI at `/docs`, ReDoc at `/redoc`, the schema at `/openapi.json`, all
  generated from your type hints and models.

## Interview questions

### What is FastAPI, and why would you choose it over Flask or Django? {core}

FastAPI is a modern Python web framework for building APIs, built on Starlette for the web layer and Pydantic for
validation. I choose it for APIs because the type hints do real work: they drive request validation, serialisation
and the OpenAPI docs, so I write less code and get fewer bugs. It is ASGI and async-native, which suits I/O-heavy
services, and dependency injection makes the code easy to test.

Flask is minimal and synchronous by default, so you add validation, docs and structure yourself. Django is a full
"batteries included" framework with an ORM, admin and auth, which is great for server-rendered apps or when you
want the admin; for APIs you add Django REST Framework. For a JSON API in front of a React app or an ML model,
FastAPI is usually the most productive choice.

**Your angle:** the Document AI backend at Quantiphi: FastAPI + Pydantic schemas enforced the data contract on
ML-extracted fields before human review.

### How does FastAPI validate a request, and what happens when validation fails? {core}

FastAPI reads the endpoint's signature: each parameter's type and its `Path`, `Query`, `Header` or `Body`
constraints, and any Pydantic model for the body. Before calling my function it parses and validates everything
with Pydantic. If anything fails, my function is never called and the client gets a 422 with a `detail` list: one
entry per error, each with `loc`, `msg` and `type`, so the front end can highlight every bad field at once.

I can customise the format by registering a handler for `RequestValidationError`, which is how you return an
organisation-wide error shape.

### How does FastAPI decide whether a parameter is a path, query or body parameter?

If the name appears in the path template, it is a path parameter. If it is a Pydantic model, it is the JSON body.
Otherwise a simple type such as `int`, `str` or `bool` is a query parameter. I can be explicit with
`Annotated[int, Query(ge=1)]`, `Header()`, `Cookie()` or `Body()`, which also lets me add constraints.

### What is dependency injection in FastAPI, and why is it useful? {core}

A dependency is a function, declared with `Depends`, that FastAPI calls before my endpoint and passes the result in.
Dependencies can have their own dependencies, and FastAPI resolves the whole graph per request, caching each result
within the request. I use them for the DB session, the current user, role checks, pagination and settings.

It removes duplication, keeps endpoints focused on business logic, and makes testing simple, because
`app.dependency_overrides[get_current_user] = fake_user` swaps the real implementation without touching the code.

### How do you manage a database session per request?

With a `yield` dependency: create the session, `yield` it, commit if the endpoint succeeded, roll back on an
exception, and always close it in `finally`. Endpoints declare `db: Annotated[Session, Depends(get_db)]`, so each
request gets its own session and nothing leaks between requests. In tests I override `get_db` to point at a test
database or an in-memory SQLite.

### What is the difference between `def` and `async def` endpoints? {core}

FastAPI runs `async def` endpoints directly on the event loop, and `def` endpoints in a threadpool (AnyIO's, 40
threads by default) so they cannot block the loop. Use `async def` only when everything inside is non-blocking and
awaited: an async HTTP client, an async database driver. Use plain `def` when calling blocking libraries such as
`requests` or a sync database driver.

The classic bug is a blocking call such as `time.sleep` or `requests.get` inside `async def`: it freezes the event
loop and every concurrent request on that worker waits. The fix is to use the async library, switch the endpoint
to `def`, or wrap the call in `await asyncio.to_thread(...)`.

### What happens if you run CPU-heavy work, like model inference, inside an endpoint? {core}

In `async def` it blocks the event loop; in `def` it ties up a threadpool thread, and because of the GIL the threads
do not run Python code in parallel, so throughput collapses under load. Options: run several Uvicorn workers
(processes), push the work to a `ProcessPoolExecutor`, or move it out of the request path into a queue with workers
(Celery, Cloud Tasks, Pub/Sub) and return a job ID the client can poll. Libraries like NumPy and PyTorch release the
GIL inside their native code, which helps, but long jobs should still be asynchronous jobs.

### Why use a response model? {core}

It validates and **filters** the output. Whatever the function returns is passed through the response model, so
fields not declared there, such as password hashes, SSNs or internal notes, never reach the client even if the
database row contains them. It also documents the response in OpenAPI and converts types like `datetime` to JSON.
I keep separate `PatientCreate`, `PatientUpdate` and `PatientOut` models for this reason.

### How do you test a FastAPI application? {core}

With `TestClient`, which calls the app in-process through httpx: no server needed. I test the happy path, validation
errors (422), auth failures (401 and 403) and not-found cases. I replace external dependencies with
`app.dependency_overrides`: a fake current user, a test database session, a stub for an external API. I use
`with TestClient(app) as client:` when the app has a lifespan, so startup and shutdown run. Business logic lives in
service functions that I unit test without HTTP at all.

### How do you handle errors consistently?

Raise `HTTPException` for simple HTTP errors. For domain errors, define exceptions such as `PatientNotFound` and
register `@app.exception_handler(PatientNotFound)` to map them to a status code and a consistent JSON body, so
services do not need to know about HTTP. I also add handlers for `RequestValidationError` and a catch-all that logs
the stack trace with the request ID and returns a generic 500 without leaking internals or PHI.

### Middleware or dependency: when do you use which? {deep}

Middleware wraps every request and response at the ASGI level: request IDs, timing, logging, CORS, GZip, security
headers. It sees the raw request but not parsed parameters, and it runs even for 404s. Dependencies run per route,
receive validated parameters, can be overridden in tests and show up in the OpenAPI docs (for example a security
scheme). So: cross-cutting transport concerns go in middleware; auth, DB sessions and per-route logic go in
dependencies.

### When are BackgroundTasks enough, and when do you need a queue? {core}

`BackgroundTasks` run in the same process right after the response is sent: fine for quick, non-critical work such
as writing an audit record or sending a notification email. They have no retries, no persistence and no visibility,
and they die with the process. For anything durable, slow or CPU-heavy, such as OCR on an uploaded document or a
batch of model predictions, I use a real queue (Celery with Redis or RabbitMQ, Cloud Tasks, Pub/Sub, Azure Service
Bus) with workers, retries and a dead-letter queue, and return 202 Accepted with a job ID.

**Your angle:** in the Document AI platform, ingestion was event-driven (a storage upload triggers processing)
rather than done inside the request.

### How do you add authentication to a FastAPI API? {core}

As a dependency. `OAuth2PasswordBearer(tokenUrl=...)` or `HTTPBearer` extracts the bearer token (and returns 401 when
it is missing); my `get_current_user` dependency verifies the token, typically a JWT: check the signature with the
right key and algorithm, `exp`, issuer and audience, then load the user. Role checks are a dependency factory such as
`require_role("admin")` that returns 403 when the role is missing. Endpoints just declare `user: CurrentUser`.
In enterprise setups the token comes from an identity provider (Azure AD/Entra ID, Okta, Cognito) via OAuth2/OIDC,
so the API only validates tokens and never handles passwords.

```python norun
# Typical JWT dependency (needs the PyJWT package, which is not installed in this lab).
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")
# PUBLIC_KEY and ISSUER come from settings: the identity provider's signing key (via its JWKS URL) and issuer URL.

def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        claims = jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"], audience="patient-api", issuer=ISSUER)
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid token", headers={"WWW-Authenticate": "Bearer"})
    return {"id": claims["sub"], "roles": claims.get("roles", [])}
```

### What is CORS, and how do you configure it in FastAPI? {core}

CORS is a browser rule: a page on one origin (scheme + host + port) can only read responses from another origin if
that server allows it with `Access-Control-Allow-*` headers. For non-simple requests the browser first sends a
preflight `OPTIONS`. In FastAPI I add `CORSMiddleware` with an explicit list of allowed origins (the React app's
URL), methods and headers. I never combine `allow_origins=["*"]` with credentials. CORS protects users' browsers; it
is not server-side security, since curl ignores it.

### What is ASGI, and how is it different from WSGI? {core}

WSGI is the older synchronous interface between Python web servers and apps (Flask, classic Django): one request
occupies one worker thread until it finishes. ASGI is its async successor: the server calls the app as a coroutine,
so one process can interleave thousands of concurrent connections while they wait on I/O, and it supports
WebSockets and long-lived streaming. FastAPI and Starlette are ASGI apps, typically served by Uvicorn.

### How do you load an ML model once instead of on every request? {core}

In the `lifespan` handler: load the model at startup, store it on `app.state` or in a module-level holder, and
release resources after the `yield` at shutdown. Endpoints then reuse the in-memory model, so request latency is
just inference. With several Uvicorn workers each process loads its own copy, which matters for memory sizing.
For heavy models I would serve them separately (Vertex AI endpoint, a GPU service) and call them from the API.

### How would you structure a large FastAPI codebase?

By feature, with layers: `routers/` (thin HTTP layer using `APIRouter` with a prefix and tags), `schemas/` (Pydantic
request and response models), `services/` (business logic, no HTTP), `models/` and `db/` (ORM and sessions),
`core/` (settings, security). `main.py` creates the app, adds middleware and the lifespan and includes routers under
`/api/v1`. Settings come from environment variables via pydantic-settings. This keeps endpoints short and the logic
unit-testable.

### How do you deploy and scale a FastAPI service?

Package it in a Docker image (slim Python base, dependencies installed in a cached layer, non-root user), run Uvicorn
inside, and deploy to a container platform. Scale horizontally: more containers or pods behind a load balancer, with
health checks. Keep the service stateless (sessions in tokens or Redis, files in object storage) so any instance can
serve any request. Watch the database connection pool: instances × pool size must fit the database's limits.

**Your angle:** at Quantiphi you built the image, pushed it to Artifact Registry and deployed to Cloud Run across
Dev, SIT and UAT; Cloud Run scales containers on request concurrency.

### How do you implement pagination and filtering? {deep}

Accept `limit` and `offset` (or a `cursor`) as validated query parameters, `Query(ge=1, le=100)` so nobody can ask
for a million rows, and return the items plus metadata such as `total` and `next_offset`. Filters are optional query
parameters. A dependency or a Pydantic model for query parameters (`Annotated[Filters, Query()]`) keeps signatures
short and reusable. For large or fast-changing tables, cursor (keyset) pagination on an indexed column is faster and
more stable than OFFSET.

### How does FastAPI produce the OpenAPI documentation? {deep}

From the code: routes, parameter types and constraints, Pydantic models (as JSON Schema), response models, status
codes, tags and security dependencies. It serves the schema at `/openapi.json`, with Swagger UI at `/docs` and ReDoc
at `/redoc`. Front-end teams can generate a typed TypeScript client from the schema, which keeps React and the API
in sync.

### How do you return a large file or a stream? {deep}

Use `StreamingResponse` with a generator (or async generator) so the response is sent in chunks without loading
everything into memory, or `FileResponse` for a file on disk. For very large documents, better still: generate a
short-lived signed URL to object storage (GCS, S3, Azure Blob) and let the client download directly. Uploads use
`UploadFile`, which keeps up to 1 MB in memory and spools anything larger to a temporary file on disk (it needs the
`python-multipart` package).

**Your angle:** the Document AI front end rendered documents through GCS signed URLs rather than streaming them
through the API.

### How do you version an API in FastAPI? {deep}

Usually with a URL prefix: one `APIRouter` per version included as `/api/v1` and `/api/v2`, sharing services
underneath. Additive changes (new optional fields, new endpoints) do not need a new version; breaking changes
(removing or renaming fields, changing types) do. Keep old versions running for a published deprecation period
and announce it with a `Deprecation` or `Sunset` header.

### What does `Depends` caching mean? {deep}

Within a single request, if the same dependency appears several times in the graph (for example `get_db` used by
the endpoint and by `get_current_user`), FastAPI calls it once and reuses the value, so both get the same DB
session. `Depends(dep, use_cache=False)` forces a fresh call. Nothing is cached across requests.

## Coding problems

### Build a patient CRUD API {medium core}

Build an in-memory API for patients with these endpoints, and test it:

- `POST /patients` creates a patient (`name` required, `birth_date` a date, `state` a two-letter code) and returns
  201 with an `id`.
- `GET /patients/{id}` returns the patient or 404.
- `PATCH /patients/{id}` updates only the fields sent.
- `DELETE /patients/{id}` returns 204, then the patient is gone.

#### Hints

1. Use three models: `PatientCreate` (input), `PatientUpdate` (all fields optional) and `Patient` (output with `id`).
2. For PATCH, `update.model_dump(exclude_unset=True)` gives only the fields the client actually sent.
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

### Add pagination and filtering to a list endpoint {medium}

Add `GET /claims` that returns claims filtered by an optional `status` and paginated by `limit` (1–100, default 10)
and `offset` (≥ 0). The response must contain `items`, `total` (matching rows before paging) and `next_offset` (or
`null` on the last page).

#### Hints

1. Validate paging with `Annotated[int, Query(ge=1, le=100)]` so bad values are rejected with 422 automatically.
2. Filter first, count, then slice: `rows[offset: offset + limit]`.
3. A generic response model `Page` with `items: list[Claim]` documents the shape in OpenAPI.

#### Solution

Filter, then count, then slice. `next_offset` is `offset + limit` only if there are rows beyond this page.

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

1. Read the header with `Annotated[str | None, Header()] = None` and split off the `Bearer ` prefix.
2. Write `get_current_user` as a dependency, then `require_role(role)` as a function that returns a dependency.
3. 401 means "who are you?" (send `WWW-Authenticate: Bearer`); 403 means "I know who you are, and no".

#### Solution

Two layers of dependencies: one authenticates (401), one authorises (403). The role check is a dependency factory,
so each endpoint states its rule in its signature. Tests replace `get_current_user` with `dependency_overrides`.

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
app.dependency_overrides.clear()
print("auth ok")
```

Each check is O(1). In production `get_current_user` validates a JWT from the identity provider (signature, expiry,
issuer, audience) instead of looking up a dict.

#### Follow-ups

- **Where do roles come from?** Claims in the token (Entra ID app roles, Okta groups) or a lookup in your database.
- **How would you restrict data, not just endpoints?** Row-level checks in the service: a provider sees only their
  own patients. That is authorisation on the resource, not the route.

### Write a rate-limiting dependency {medium}

Limit each client (identified by an `X-API-Key` header) to 3 requests per 10 seconds on an endpoint. Over the limit,
return 429 with a `Retry-After` header. Make it testable without sleeping.

#### Hints

1. Keep a `deque` of request timestamps per key; drop timestamps older than the window.
2. If the deque already holds the limit, reject; otherwise append now.
3. Inject the clock (a function returning the time) so tests can move time forward instantly.

#### Solution

A sliding-window log: per key, a deque of timestamps inside the window. The limiter is a class instance whose
`__call__` makes it a dependency, and the clock is injected for testing.

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
  `INCR` + `EXPIRE` (fixed window), or rate limit at the API gateway.
- **Token bucket instead?** It allows short bursts while enforcing an average rate, and needs only two numbers per key.

### Return one consistent error format {medium}

Every error from the API must look like `{"error": {"code": ..., "message": ..., "details": [...]}}`, whether it is a
validation error, an `HTTPException`, a domain error such as "claim already paid", or an unexpected crash (which must
not leak the exception text).

#### Hints

1. Register handlers with `@app.exception_handler(...)` for `RequestValidationError`, Starlette's `HTTPException`
   and your domain exception base class.
2. Add a handler for `Exception` that logs and returns a generic 500.
3. `TestClient(app, raise_server_exceptions=False)` lets a test see the 500 response instead of the raised error.

#### Solution

One small function builds the body; one handler per error family uses it. Register the handler on Starlette's
`HTTPException` so router 404s and 405s get the same format.

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
  `instance`, served as `application/problem+json`).
- **What else belongs in an error?** A request or correlation ID that support can search for in the logs.

### Make a POST idempotent with an Idempotency-Key header {hard}

Clients may retry `POST /payments` after a timeout, which must not charge twice. Support an `Idempotency-Key`
header: the first request with a key is processed; a retry with the same key and the same body returns the original
response without processing again; the same key with a different body returns 422.

#### Hints

1. Store, per key, a fingerprint of the request body and the response you returned.
2. On a repeat key, compare fingerprints: same → replay the stored response; different → reject.
3. A stable fingerprint: hash `json.dumps(body, sort_keys=True)`.

#### Solution

Keep a map from key to (fingerprint, status, response). Process only when the key is new. Count side effects in the
test to prove the retry did not charge again.

```python
import hashlib
import json
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field


class PaymentIn(BaseModel):
    claim_id: int
    amount: float = Field(gt=0)


app = FastAPI()
processed: dict[str, tuple[str, int, dict]] = {}
charges: list[PaymentIn] = []


def fingerprint(model: BaseModel) -> str:
    return hashlib.sha256(json.dumps(model.model_dump(), sort_keys=True).encode()).hexdigest()


@app.post("/payments", status_code=201)
def create_payment(payment: PaymentIn, idempotency_key: Annotated[str, Header(min_length=8)]):
    fp = fingerprint(payment)
    if idempotency_key in processed:
        saved_fp, status, body = processed[idempotency_key]
        if saved_fp != fp:
            raise HTTPException(422, "Idempotency-Key reused with a different request")
        return JSONResponse(status_code=status, content=body, headers={"Idempotent-Replay": "true"})

    charges.append(payment)                                   # the side effect, done once
    body = {"payment_id": len(charges), **payment.model_dump()}
    processed[idempotency_key] = (fp, 201, body)
    return body


client = TestClient(app)
headers = {"Idempotency-Key": "a1b2c3d4e5"}
first = client.post("/payments", json={"claim_id": 7, "amount": 120.5}, headers=headers)
retry = client.post("/payments", json={"amount": 120.5, "claim_id": 7}, headers=headers)   # same body, keys reordered
assert first.status_code == retry.status_code == 201
assert first.json() == retry.json() == {"payment_id": 1, "claim_id": 7, "amount": 120.5}
assert retry.headers.get("idempotent-replay") == "true"
assert len(charges) == 1                                      # charged once

clash = client.post("/payments", json={"claim_id": 7, "amount": 999}, headers=headers)
assert clash.status_code == 422
assert client.post("/payments", json={"claim_id": 7, "amount": 1}).status_code == 422   # header required
print("idempotency ok")
```

#### Follow-ups

- **Production storage?** A database table or Redis with a TTL (say 24 hours), written in the same transaction as the
  payment, with a unique constraint on the key.
- **Two identical requests arrive at the same moment?** Insert the key first with status "in progress" under a unique
  constraint; the loser of the race gets 409 and retries later.
