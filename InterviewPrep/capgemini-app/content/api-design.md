---
title: API design and clean contracts
goal: Design resource APIs with the right methods, status codes, errors, pagination, idempotency, long-running operations and versioning, and keep the contract in sync between Python, Node and the TypeScript front end.
minutes: 45
---

"Strong focus on modular architecture and clean API contracts" is in the JD's required qualifications, and the platform's front end, orchestration services and agents all talk through APIs. Interviewers test this with design questions ("design the API for starting and following an agent run") and with sharp detail questions: PUT vs PATCH, 400 vs 422, offset vs cursor pagination, how to make POST safe to retry, what counts as a breaking change. Because the platform runs on Google Cloud, it helps to know that Google publishes its own API design rules, the **API Improvement Proposals (AIPs)**, and to borrow their vocabulary.

## What a clean contract means

A contract is clean when a client can rely on it without reading your code:

- **Explicit and machine-readable**: an OpenAPI (REST) or `.proto` (gRPC) schema that generates docs, clients and validators.
- **Validated at the edge**: requests are checked against the schema (Pydantic, zod, JSON Schema); unknown fields are rejected or ignored by a deliberate rule.
- **Consistent**: the same naming, pagination, error format and timestamp format (RFC 3339, UTC) everywhere.
- **Predictable under failure**: documented status codes, idempotent retries, clear error bodies.
- **Evolvable**: additive changes only within a version, with a deprecation policy for the rest.

## Resources and URLs

Model **nouns** (resources) and use HTTP methods as the verbs. Nest when one resource belongs to another, and keep URLs shallow.

```text
POST   /v1/agents/{agentId}/runs            start a run (returns 202 + the run)
GET    /v1/runs/{runId}                     one run
GET    /v1/runs?agentId=a1&status=failed    list with filters, paginated
GET    /v1/runs/{runId}/steps               the steps of a run
GET    /v1/runs/{runId}/events              stream of events (SSE)
POST   /v1/runs/{runId}:cancel              a custom method (AIP-136 style)
POST   /v1/runs/{runId}/approvals           record a human approval
PATCH  /v1/agents/{agentId}                 partial update of configuration
```

Google's AIPs formalise this: **resource names** like `projects/p1/agents/a1/runs/r9` (AIP-122), five **standard methods** Get, List, Create, Update, Delete (AIP-131 to 135), and **custom methods** for actions that do not fit, written `POST .../runs/r9:cancel` (AIP-136). Using these terms when designing for a GCP platform shows you know the house style.

## Methods, idempotency and status codes

| Method | Safe | Idempotent | Typical use | Success code |
|---|---|---|---|---|
| GET | Yes | Yes | Read | 200 (304 if not modified) |
| POST | No | **No** (make it so with an idempotency key) | Create, actions | 201 + `Location`, or 202 for async work |
| PUT | No | Yes | Replace the whole resource (or create at a known URL) | 200 / 204 (201 if created) |
| PATCH | No | Not guaranteed | Partial update | 200 / 204 |
| DELETE | No | Yes | Remove | 204 (or 202) |

**Idempotent** means doing it twice has the same effect on the server as doing it once (the response can differ: a second DELETE may return 404). That property is what makes automatic retries safe.

| Code | Meaning | When |
|---|---|---|
| 400 | Bad Request | Malformed syntax, unparseable JSON, missing required header |
| 401 | Unauthorized | Not authenticated (no or invalid credentials); include `WWW-Authenticate` |
| 403 | Forbidden | Authenticated but not allowed |
| 404 | Not Found | Does not exist, **or** exists but the caller may not know (to avoid leaking existence) |
| 409 | Conflict | State conflict: duplicate, wrong state ("run already finished"), concurrent request in flight |
| 412 | Precondition Failed | `If-Match` ETag did not match (someone else changed it) |
| 415 / 406 | Unsupported Media Type / Not Acceptable | Wrong `Content-Type` / cannot satisfy `Accept` |
| 422 | Unprocessable Content | Well-formed JSON that fails validation (FastAPI's default) |
| 428 | Precondition Required | The server requires `If-Match` and the client sent none |
| 429 | Too Many Requests | Rate limited; send `Retry-After` |
| 500 | Internal Server Error | A bug |
| 502 / 503 / 504 | Bad Gateway / Unavailable / Gateway Timeout | Upstream failure / overloaded or in maintenance / upstream too slow |

**400 vs 422** is a convention more than a rule; RFC 9110 now defines 422 in core HTTP. A common split: 400 when the request cannot be parsed, 422 when it parses but breaks the schema or a business rule. Pick one and be consistent.

## Errors: one format everywhere (RFC 9457)

**RFC 9457, Problem Details for HTTP APIs** (it replaced RFC 7807), defines a JSON error body with media type `application/problem+json`: `type` (a URI identifying the error kind, `about:blank` by default), `title`, `status`, `detail`, `instance`, plus any extension members such as a list of field errors or a trace id. Clients can branch on `type` without parsing English. Google's APIs use their own model (`google.rpc.Status` with `code`, `message` and typed `details` such as `ErrorInfo`, AIP-193); the idea is the same.

```python
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field

PROBLEM = "application/problem+json"


class RunNotCancellable(Exception):
    def __init__(self, run_id: str, status: str) -> None:
        self.run_id, self.status = run_id, status


def problem(status: int, title: str, request: Request, type_: str = "about:blank", **extra) -> JSONResponse:
    body = {"type": type_, "title": title, "status": status, "instance": request.url.path, **extra}
    return JSONResponse(body, status_code=status, media_type=PROBLEM)


app = FastAPI()


@app.exception_handler(HTTPException)
async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
    return problem(exc.status_code, str(exc.detail), request)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
    errors = [{"field": ".".join(str(p) for p in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]
    return problem(422, "Request validation failed", request, "https://api.example.com/problems/validation", errors=errors)


@app.exception_handler(RunNotCancellable)
async def not_cancellable(request: Request, exc: RunNotCancellable) -> JSONResponse:
    return problem(409, "Run cannot be cancelled", request, "https://api.example.com/problems/run-not-cancellable",
                   detail=f"Run {exc.run_id} is already {exc.status}.", runStatus=exc.status)


class StartRun(BaseModel):
    input: str = Field(min_length=1)
    max_steps: int = Field(default=10, ge=1, le=50)


@app.post("/v1/agents/{agent_id}/runs", status_code=202)
def start(agent_id: str, body: StartRun) -> dict:
    if agent_id != "a1":
        raise HTTPException(404, "Agent not found")
    return {"id": "r1", "status": "queued"}


@app.post("/v1/runs/{run_id}:cancel")
def cancel(run_id: str) -> dict:
    raise RunNotCancellable(run_id, "succeeded")


client = TestClient(app)
bad = client.post("/v1/agents/a1/runs", json={"input": "", "max_steps": 99})
assert bad.status_code == 422 and bad.headers["content-type"] == PROBLEM
assert [e["field"] for e in bad.json()["errors"]] == ["input", "max_steps"]

missing = client.post("/v1/agents/zz/runs", json={"input": "go"})
assert missing.json() == {"type": "about:blank", "title": "Agent not found", "status": 404, "instance": "/v1/agents/zz/runs"}

conflict = client.post("/v1/runs/r1:cancel")
assert conflict.status_code == 409 and conflict.json()["runStatus"] == "succeeded"
print(conflict.json())
```

## Pagination, filtering and partial responses

**Offset pagination** (`?offset=40&limit=20`) is simple and allows jumping to page N, but the database still reads and discards the skipped rows (slow deep pages), and rows inserted or deleted between requests shift the pages, so clients see **duplicates or gaps**. **Cursor (keyset) pagination** remembers the last row's sort key and asks for rows after it: constant cost per page and stable under inserts. The sort must be unique, so add the id as a tie-breaker, and the cursor should be **opaque** (base64 of the key) so you can change it later. Google's AIP-158 uses `page_size`, `page_token` and `next_page_token`.

```sql postgres
CREATE TABLE runs (
  id text PRIMARY KEY,
  agent_id text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);
-- 25 runs; pairs share a timestamp, so the id must break ties.
INSERT INTO runs
SELECT 'r' || lpad(g::text, 3, '0'), 'a' || (g % 3), CASE WHEN g % 4 = 0 THEN 'failed' ELSE 'succeeded' END,
       timestamptz '2026-10-01 00:00:00+00' + (g / 2) * interval '1 minute'
FROM generate_series(1, 25) AS g;
CREATE INDEX runs_newest_first ON runs (created_at DESC, id DESC);
```

```sql postgres
-- Page 1, newest first. The client keeps the last row's (created_at, id) as the cursor: (00:11, r023).
SELECT id FROM runs ORDER BY created_at DESC, id DESC LIMIT 3
-- expect: [('r025',), ('r024',), ('r023',)]
```

```sql postgres
-- Page 2 by offset, before anything changes.
SELECT id FROM runs ORDER BY created_at DESC, id DESC OFFSET 3 LIMIT 3
-- expect: [('r022',), ('r021',), ('r020',)]
```

```sql postgres
-- A new run arrives while the user is reading page 1...
INSERT INTO runs VALUES ('r026', 'a1', 'running', timestamptz '2026-10-01 00:13:00+00');
```

```sql postgres
-- ...so the same offset request now repeats r023, which the user already saw.
SELECT id FROM runs ORDER BY created_at DESC, id DESC OFFSET 3 LIMIT 3
-- expect: [('r023',), ('r022',), ('r021',)]
```

```sql postgres
-- Keyset: "rows after the cursor" is unaffected by the insert, and uses the index instead of skipping rows.
SELECT id FROM runs
WHERE (created_at, id) < (timestamptz '2026-10-01 00:11:00+00', 'r023')
ORDER BY created_at DESC, id DESC
LIMIT 3
-- expect: [('r022',), ('r021',), ('r020',)]
```

Related patterns:

- **Filtering**: simple query parameters (`?status=failed&agentId=a1`) for common cases; a filter expression language (AIP-160 style `filter=status="failed" AND createTime>"2026-10-01"`) when clients need more. Whitelist filterable fields so every filter has an index.
- **Sorting**: `?orderBy=createTime desc`; the cursor must encode the sort, and changing the sort with an old cursor is an error.
- **Partial responses and updates**: a read mask (AIP-157 partial responses, using the field-mask syntax of AIP-161; `?fields=id,status`) to trim payloads, and `PATCH` with an `update_mask` (AIP-134) so a client only changes the fields it names. Without a mask, PATCH with JSON Merge Patch (RFC 7396) treats `null` as "delete this field".

## Making POST safe to retry: idempotency keys

Networks fail after the server has done the work but before the client gets the response. If the client retries "start run" or "create purchase order", you get two runs or two orders. The fix is an **`Idempotency-Key`** header (a UUID chosen by the client per logical operation), as Stripe popularised and an IETF HTTPAPI draft describes (an Internet-Draft, not an RFC, so treat its status codes as the emerging convention):

1. On the first request, store the key (scoped to the client), a hash of the request body, and a "processing" marker, then do the work and store the response.
2. A retry with the same key and the same body gets the **stored response** replayed; the work is not repeated.
3. The same key with a **different body** is a client bug: the draft says reply **422**.
4. A retry while the first request is **still processing**: reply **409** (or wait briefly and replay).
5. If the endpoint requires a key and none is sent: **400**.
6. Keys expire after a documented window (24 hours is common).

The store must be atomic: an `INSERT ... ON CONFLICT DO NOTHING` in Postgres or `SET key value NX EX 86400` in Redis decides which request "owns" the key. Google's APIs express the same idea as a `request_id` field (AIP-155). For agent tools that act on external systems, idempotency is not optional: an agent loop *will* retry.

## Long-running operations

Starting an agent run, provisioning infrastructure or a bulk import takes longer than a request should stay open. Return **`202 Accepted`** immediately with a resource the client can follow:

```http
POST /v1/agents/a1/runs HTTP/1.1
Content-Type: application/json
Idempotency-Key: 7c1f6a1e-2f0b-4c55-9a52-3f1f0d9b6c11

{"input": "Reconcile September invoices"}

HTTP/1.1 202 Accepted
Location: /v1/operations/op-123
Content-Type: application/json

{"name": "operations/op-123", "done": false, "metadata": {"runId": "r9", "progress": 0}}
```

Google's **AIP-151** standardises the body as an `Operation` with a `name`, `done`, `metadata` (progress), and on completion either `response` (the result) or `error` (a status). One difference from the generic pattern: a Google API method returns the `Operation` itself as its normal response (HTTP 200 over REST), rather than 202 plus a `Location` header; the client then polls the operation by name. Either way, clients:

- **poll** `GET /v1/operations/op-123` (with `Retry-After` hints and backoff), or
- **stream** progress over SSE or a WebSocket (`GET /v1/runs/r9/events`), which is what a chat UI wants, or
- receive a **webhook** callback (server-to-server).

Errors that stop the operation from starting (validation, permissions) are returned as normal errors on the POST; failures during execution go in the operation's `error`.

## Optimistic concurrency with ETags

Two operators edit the same agent configuration; the second save silently overwrites the first (a **lost update**). With **optimistic concurrency**, `GET` returns an `ETag` (a version or hash of the resource); the client sends it back in **`If-Match`** on `PUT`/`PATCH`; if the resource changed in between, the server returns **412 Precondition Failed** and the client reloads and merges. Servers can require it (428 when missing). The same header in reverse, `If-None-Match`, gives cheap caching: **304 Not Modified** when nothing changed. AIP-154 puts the etag in the resource body for the same purpose.

## Versioning and evolution

- **Where the version lives**: in the path (`/v1/`), which Google uses (major version only); in a header or media type (`Accept: application/vnd.example.v2+json`); or as a date-based version header (Stripe style). The path is the most visible and the easiest to route.
- **Non-breaking (allowed within v1)**: adding an endpoint, adding an **optional** request field, adding a response field, adding a new error `type`, relaxing a validation rule.
- **Breaking (needs v2 or a migration)**: removing or renaming a field, changing a type or format, making an optional request field required, adding a required field, tightening validation, changing defaults or semantics, removing an enum value clients send, changing status codes or pagination behaviour. Adding an enum value to a response breaks clients that switch exhaustively, so document that enums may grow.
- **Tolerant reader**: clients ignore unknown fields and handle unknown enum values; servers are strict about what they accept.
- **Deprecation**: announce it in docs and with headers. **RFC 9745** defines `Deprecation` (a date, e.g. `Deprecation: @1798761600`, which is 1 January 2027) and the `deprecation` link relation; **RFC 8594** defines `Sunset` (when it stops working). Measure who still calls the old version before turning it off.

```python
from datetime import UTC, datetime
from email.utils import format_datetime

from fastapi import APIRouter, FastAPI, Response
from fastapi.testclient import TestClient

DEPRECATED_AT = datetime(2026, 9, 1, tzinfo=UTC)
SUNSET_AT = datetime(2027, 3, 1, tzinfo=UTC)

v1 = APIRouter(prefix="/v1")
v2 = APIRouter(prefix="/v2")


@v1.get("/runs/{run_id}")
def get_run_v1(run_id: str, response: Response) -> dict:
    response.headers["Deprecation"] = f"@{int(DEPRECATED_AT.timestamp())}"  # RFC 9745 structured date
    response.headers["Sunset"] = format_datetime(SUNSET_AT, usegmt=True)  # RFC 8594 HTTP-date
    response.headers["Link"] = f'</v2/runs/{run_id}>; rel="successor-version"'
    return {"id": run_id, "state": "done"}  # v1 used a free-text state


@v2.get("/runs/{run_id}")
def get_run_v2(run_id: str) -> dict:
    return {"id": run_id, "status": "succeeded", "createTime": "2026-10-01T00:00:00Z"}


app = FastAPI()
app.include_router(v1)
app.include_router(v2)
client = TestClient(app)

old = client.get("/v1/runs/r1")
assert old.headers["deprecation"] == "@1788220800"
assert old.headers["sunset"] == "Mon, 01 Mar 2027 00:00:00 GMT"
assert "successor-version" in old.headers["link"]
assert "deprecation" not in client.get("/v2/runs/r1").headers
print(dict(old.headers))
```

## Contract-first or code-first, and keeping clients in sync

- **Code-first**: write Pydantic models or zod schemas and generate the OpenAPI document from code (FastAPI does this automatically; Fastify from JSON Schema; NestJS from decorators). Fast to start, and the spec can never drift from the implementation.
- **Contract-first**: write the OpenAPI or `.proto` file first, review it like code, and generate server stubs and clients. Better when several teams or languages share an API, or when the API is a product.
- Either way, **generate the TypeScript client and types** from the spec (openapi-typescript, Orval, or the gRPC/Connect code generators) instead of hand-writing interfaces, and **diff the spec in CI** (oasdiff, buf breaking for protobuf) so a breaking change fails the build.
- **Contract tests**: consumer-driven contracts (Pact) let the front end publish what it relies on and the provider verify it; property-based tests from the schema (Schemathesis) fuzz the API against its own OpenAPI.

```python
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class RunRead(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: str
    agent_id: str
    status: Literal["queued", "running", "succeeded", "failed"]
    error_message: str | None = None


app = FastAPI(title="Agent Runs API", version="1.4.0")


@app.get("/v1/runs/{run_id}", response_model=RunRead)
def get_run(run_id: str) -> RunRead:
    return RunRead(id=run_id, agent_id="a1", status="running")


spec = app.openapi()  # the document a TypeScript client generator consumes
schema = spec["components"]["schemas"]["RunRead"]
assert spec["openapi"].startswith("3.1")
assert set(schema["properties"]) == {"id", "agentId", "status", "errorMessage"}
assert schema["required"] == ["id", "agentId", "status"]
assert schema["properties"]["status"]["enum"] == ["queued", "running", "succeeded", "failed"]
print(spec["paths"]["/v1/runs/{run_id}"]["get"]["responses"]["200"])
```

On the TypeScript side, the generated (or shared) schema validates what actually arrives, because a type annotation alone proves nothing at runtime:

```ts
import assert from 'node:assert/strict';
import { z } from 'zod';

// Mirrors RunRead from the OpenAPI document. In a real project this is generated, not hand-written.
const RunRead = z.object({
  id: z.string(),
  agentId: z.string(),
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  errorMessage: z.string().nullable().optional(),
});
type RunRead = z.infer<typeof RunRead>;

function parseRun(json: unknown): RunRead {
  const result = RunRead.safeParse(json);
  if (!result.success) throw new Error(`Contract violation: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  return result.data;
}

const run = parseRun({ id: 'r1', agentId: 'a1', status: 'running', extraFieldFromNewerServer: true });
assert.equal(run.status, 'running'); // unknown fields are stripped: a tolerant reader
assert.throws(() => parseRun({ id: 'r1', agentId: 'a1', status: 'paused' }), /status/);
console.log('client contract ok', run);
```

## Choosing how clients get updates

| Pattern | Direction | Good for | Costs |
|---|---|---|---|
| Polling | Client asks repeatedly | Simple status checks, LRO status | Wasted requests, latency = poll interval |
| Long polling | Server holds the request until there is news | Legacy environments | Holding connections, awkward |
| **SSE** | Server → client stream over HTTP | Token streaming, run progress, logs in a browser | One-way; needs proxies that do not buffer |
| **WebSocket** | Both ways, persistent | Interactive control (approve, cancel mid-run), collaboration | Stateful connections, scaling and auth work |
| **gRPC streaming** | Server, client or both, over HTTP/2 | Service-to-service streams | Browsers need gRPC-Web or Connect |
| **Webhooks** | Server → another server | Notifying external systems when a run finishes | Receiver must verify signatures, handle retries and duplicates |

## Rate limiting and quotas

Return **429 Too Many Requests** with **`Retry-After`** (seconds or a date) when a client exceeds its limit; many APIs also send the remaining quota (`X-RateLimit-Remaining`, or the newer IETF draft `RateLimit` fields). Limit per API key, user or tenant, with separate budgets for expensive endpoints (starting an agent run costs far more than reading one). Clients retry with exponential backoff and jitter. Implementations live in [Redis](#/redis) (token bucket, sliding window) or at the gateway (Apigee, API Gateway, Cloud Armor rate rules).

## REST, gRPC or GraphQL

| | REST + JSON | gRPC + Protobuf | GraphQL |
|---|---|---|---|
| Contract | OpenAPI | `.proto` (strict, code-generated) | Schema (SDL) |
| Transport | HTTP/1.1 or 2 | HTTP/2 | HTTP, usually POST to one endpoint |
| Payload | Text, readable | Binary, compact, fast | JSON, client picks fields |
| Streaming | SSE, WebSockets alongside | Built in: server, client, bidirectional | Subscriptions (usually over WebSockets) |
| Browsers | Native | Needs gRPC-Web, Connect or a REST gateway | Native |
| Caching | HTTP caching works | No HTTP caching | Hard (POST, per-query) |
| Best for | Public and front-end APIs | Internal service-to-service, high throughput, polyglot | Many clients with different data needs |

On this platform a natural split is gRPC between internal services (orchestrator, agent runtime, tool services) and REST plus SSE for the browser, with the gateway transcoding where needed. See [gRPC](#/grpc).

## Designing APIs that agents call

Tools an agent invokes are APIs with an unusually unforgiving client: it retries, it improvises arguments, and it can be manipulated by text it read. Design them with strict schemas (enums, ranges, required fields, `additionalProperties: false`) and descriptive field names and docs, because the model reads them; **idempotency keys** on every side-effecting call; **dry-run or preview** modes ("what would this purchase order look like?") so a human can approve before the real call; small, single-purpose operations instead of "do anything" endpoints; scoped credentials per tool; and structured errors the agent can act on ("`quantity` must be ≤ 1000") rather than stack traces.

**Your angle:** the Pydantic schemas at Quantiphi were exactly this kind of contract: they enforced the data contract on ML-extracted document fields as the quality gate before human review.

## Interview questions

### What makes an API contract "clean"? {core}

It is explicit, validated and stable. Explicit means a machine-readable schema (OpenAPI or protobuf) that generates documentation and clients. Validated means requests are checked at the edge against that schema and responses match it. Stable means consistent conventions (naming, errors, pagination, timestamps), documented failure behaviour, and only additive changes within a version. The test is whether a client team can build against it from the spec alone.

I also keep transport concerns out of the domain: handlers translate between the contract models and the internal ones, so refactoring internals never changes the API.

### How would you design the API to start and follow an agent run? {core}

`POST /v1/agents/{agentId}/runs` with the input and an `Idempotency-Key`, returning `202 Accepted`, a `Location` header and the run resource with `status: queued`. The client follows it with `GET /v1/runs/{id}/events` as Server-Sent Events, with event ids so it can resume, or polls `GET /v1/runs/{id}`. Actions are custom methods such as `POST /v1/runs/{id}:cancel`, and approvals are a sub-resource. Lists are cursor-paginated and filterable by agent and status.

Then I would cover errors (problem details, 409 for an invalid state change), auth (scopes per action), and limits (a per-tenant quota on starting runs).

### What is the difference between PUT, PATCH and POST?

PUT replaces the whole resource at a known URL and is idempotent: sending it twice leaves the same state. PATCH applies a partial change; it is not guaranteed idempotent (an "increment" patch is not), though a JSON Merge Patch that sets fields usually is. POST creates a resource in a collection or triggers an action, and is not idempotent, so retrying it needs an idempotency key.

A practical detail: with PATCH, define how `null` and missing fields differ (Merge Patch treats `null` as delete), or use an explicit update mask as Google's AIP-134 does.

### Which status codes do you use, and how do you decide between 400 and 422, or 401 and 403? {core}

401 means "I don't know who you are" (missing or invalid credentials, with `WWW-Authenticate`); 403 means "I know who you are and you may not do this". For input, I use 400 when the request cannot be parsed and 422 when it parses but fails validation, which is FastAPI's default; the key is consistency. 409 is for state conflicts (the run already finished), 412 for a failed `If-Match`, 429 with `Retry-After` for rate limits, and 404 instead of 403 when revealing that a resource exists would leak information.

On the server-error side, 502 is a bad response from an upstream, 503 is "overloaded or down, retry later", and 504 is an upstream timeout.

### How do you make a POST endpoint safe to retry? {core}

Require an `Idempotency-Key` header, a client-generated UUID per logical operation. The server atomically records the key with a hash of the body and a processing state, does the work, and stores the response. A retry with the same key and body replays the stored response; the same key with a different body gets 422, a retry while the first is still running gets 409, and keys expire after a documented window. The atomic claim is a unique insert in Postgres or `SET NX` in Redis.

This matters doubly for agents: their loops retry, and the downstream systems (an ERP, a ticketing system) may not be idempotent themselves.

### Offset or cursor pagination? {core}

Cursor (keyset) pagination for anything large or changing: the client sends an opaque token encoding the last row's sort key, and the query asks for rows after it using an index, so every page costs the same and inserts do not cause duplicates or gaps. Offset is fine for small, stable, admin-style lists where users want to jump to page 7, but deep offsets scan and discard rows, and concurrent inserts shift the pages.

Details that show experience: make the sort unique by adding the id, keep the token opaque (base64 of the key) so the implementation can change, and reject a token used with different filters or sort.

### What error format do you use? {core}

RFC 9457 problem details with `application/problem+json`: a `type` URI that clients can branch on, a `title`, the `status`, a human `detail`, the `instance`, and extensions such as a list of field errors and a trace id for support. One exception handler produces it for every error, including framework validation errors, so the front end needs a single error parser. On a gRPC surface I use the `google.rpc.Status` model with typed details instead.

### How do you version an API, and what counts as a breaking change? {core}

I put the major version in the path (`/v1`), as Google does, and allow only additive changes inside it: new endpoints, new optional request fields, new response fields. Breaking changes include removing or renaming a field, changing a type or format, making a field required, tightening validation, changing defaults or semantics, and changing status codes. Those wait for v2, with both versions running during a migration window, `Deprecation` and `Sunset` headers on the old one, and usage metrics to know when it is safe to switch off.

Clients should be tolerant readers: ignore unknown fields and handle unknown enum values.

### How do you keep TypeScript types on the front end in sync with the backend?

Generate them from the contract rather than writing them by hand: FastAPI produces OpenAPI from the Pydantic models, and a generator (openapi-typescript, Orval) produces TypeScript types and a typed client in CI. Responses are still validated at runtime at the boundary (zod) because a stale deployment can send something different. A spec diff in CI fails the build on breaking changes. In an all-TypeScript stack, a shared zod schema package does the same job.

### Contract-first or code-first? {deep}

Code-first (generate the spec from Pydantic, zod or decorators) is fastest and cannot drift, and it suits a single team owning both sides. Contract-first (write and review the OpenAPI or `.proto`, then generate stubs and clients) is better when several teams or languages depend on the API, or when it is a public product, because the design is reviewed before anyone builds it. gRPC is contract-first by nature. Either way the spec is versioned in Git and diffed in CI.

### How do you design a long-running operation? {core}

Return `202 Accepted` with a `Location` pointing to an operation (or the run resource) that has a status, progress metadata, and on completion either the result or an error. Google's AIP-151 uses the same `Operation` shape but returns it directly as the method's response, and the client polls it by name. Clients poll with backoff, stream progress over SSE, or get a webhook. Validation and permission errors are returned synchronously on the POST; failures during execution go in the operation. Operations need an expiry and a cancel method.

### Webhooks, polling or streaming: how do you choose?

By the consumer. A browser following an agent run wants a stream: SSE for server-to-client tokens and progress, a WebSocket if it also sends control messages mid-run. Another backend system that just needs to know when something finished wants a webhook, with HMAC signatures, retries and idempotent handling on its side. Polling is the fallback that always works, good for occasional status checks and environments where long connections are unreliable.

### How do you prevent lost updates when two users edit the same resource? {deep}

Optimistic concurrency with ETags. `GET` returns an `ETag` (a version number or hash); updates must send `If-Match` with it; if the stored version changed, the server returns 412 and the client reloads and reapplies or shows a merge. The server can require it, answering 428 when it is missing. In the database it is a conditional update: `UPDATE ... WHERE id = $1 AND version = $2` and check the row count.

### How should an API respond when a client is rate limited? {deep}

With 429 Too Many Requests and a `Retry-After` header, ideally plus remaining-quota headers so well-behaved clients slow down before hitting the wall. Limits are per key, user or tenant, with tighter budgets on expensive operations such as starting agent runs. Clients back off exponentially with jitter. I would enforce it at the gateway for coarse limits and in the service (a Redis token bucket) for business-specific ones.

### How do you design bulk or batch operations? {deep}

A batch endpoint (`POST /v1/runs:batchCreate`) with a size limit, per-item results in the response so partial failures are explicit, and either all-or-nothing semantics (documented, in one transaction) or independent items each with its own status. Each item can carry its own idempotency key. Large batches become a long-running operation that reports progress. I avoid 207 Multi-Status; a 200 with per-item status is easier for clients.

### REST, gRPC or GraphQL for this platform? {core}

REST plus SSE for the browser-facing API, because browsers speak it natively, HTTP caching and tooling work, and SSE covers token streaming. gRPC between internal services (orchestrator, agent runtime, tool services), for strict protobuf contracts, generated clients in Python and TypeScript, HTTP/2 streaming and lower overhead. GraphQL fits when many different clients need different shapes of the same data, which is not this platform's main problem.

### What are Google's AIPs, and which would you mention? {deep}

API Improvement Proposals are Google's public API design guidelines. The useful ones: AIP-122 resource names, AIP-131 to 135 standard methods, AIP-136 custom methods (`:cancel`), AIP-151 long-running operations, AIP-154 etags, AIP-155 request ids for idempotency, AIP-157 partial responses, AIP-158 pagination with page tokens, AIP-160 filtering, AIP-161 field masks, AIP-180 backward compatibility and AIP-193 errors. They are a ready-made style guide for a GCP platform.

### How do you test that an API still honours its contract? {deep}

At three levels: schema checks (responses validated against the OpenAPI schema in integration tests, Schemathesis fuzzing the API from its own spec), consumer-driven contract tests (Pact: consumers publish expectations, the provider verifies them in CI), and a spec diff on every pull request that fails on breaking changes. Plus a few end-to-end tests of the critical journeys.

### How do you design an API that an AI agent will call as a tool? {deep}

Treat the agent as an unreliable, retrying, possibly manipulated client. Strict, well-described schemas with enums and ranges; idempotency keys on everything with side effects; dry-run or preview modes so a human can approve the exact payload; narrow operations with least-privilege credentials per tool; structured, actionable errors; and audit logs of who (which run, on whose behalf) did what. Large or dangerous actions go through an approval step in the workflow, not just a prompt instruction.

### How do you return partial data or update only some fields? {deep}

Field masks: `?fields=id,status` (or `$select` in OData) to return only what the client needs, and an `update_mask` on PATCH listing the fields to change, so absent fields are clearly untouched and `null` can mean "clear". It reduces payloads for list views and removes the ambiguity of partial updates. Google's AIP-157 (partial responses), AIP-161 (field masks) and AIP-134 (update) describe it.

## Coding problems

### Keyset pagination with an opaque cursor {medium core}

Implement `list_runs(runs, page_size, page_token=None, status=None)` over an in-memory list of run dicts (`id`, `created_at` ISO string, `status`), newest first, ties broken by id descending. It returns `(items, next_page_token)` where the token is opaque (URL-safe base64 of JSON) and `None` on the last page. A token must only be accepted with the same filter it was created with; otherwise raise `ValueError`.

#### Hints

1. Sort by the tuple `(created_at, id)` in descending order; the cursor is the last item's tuple.
2. The next page is every item whose key is strictly less than the cursor's key.
3. Put the filter in the token too, and compare it when the token comes back.

#### Solution

The cursor stores the sort key of the last returned row and the filter it belongs to. Fetching `page_size + 1` items tells us whether another page exists without a count query. In a database the "strictly less than" becomes `WHERE (created_at, id) < (...)` on an index, as in the SQL above.

```python
import base64
import json


def _encode(payload: dict) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode().rstrip("=")


def _decode(token: str) -> dict:
    try:
        return json.loads(base64.urlsafe_b64decode(token + "=" * (-len(token) % 4)))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("invalid page_token") from exc


def list_runs(runs: list[dict], page_size: int, page_token: str | None = None,
              status: str | None = None) -> tuple[list[dict], str | None]:
    if not 1 <= page_size <= 100:
        raise ValueError("page_size must be between 1 and 100")
    key = lambda r: (r["created_at"], r["id"])
    rows = sorted((r for r in runs if status is None or r["status"] == status), key=key, reverse=True)
    if page_token:
        cursor = _decode(page_token)
        if cursor.get("status") != status:
            raise ValueError("page_token was created with a different filter")
        after = (cursor["created_at"], cursor["id"])
        rows = [r for r in rows if key(r) < after]
    page = rows[: page_size + 1]
    items, more = page[:page_size], len(page) > page_size
    next_token = _encode({"created_at": items[-1]["created_at"], "id": items[-1]["id"], "status": status}) if more else None
    return items, next_token


runs = [{"id": f"r{i:03}", "created_at": f"2026-10-01T00:{i // 2:02}:00Z", "status": "failed" if i % 4 == 0 else "ok"}
        for i in range(1, 26)]

page1, token = list_runs(runs, 3)
assert [r["id"] for r in page1] == ["r025", "r024", "r023"]
runs.append({"id": "r026", "created_at": "2026-10-01T00:13:00Z", "status": "ok"})  # inserted mid-browse
page2, token2 = list_runs(runs, 3, token)
assert [r["id"] for r in page2] == ["r022", "r021", "r020"]  # no duplicate despite the insert

seen, tok = [], None
while True:
    items, tok = list_runs(runs, 4, tok, status="failed")
    seen += [r["id"] for r in items]
    if tok is None:
        break
assert seen == ["r024", "r020", "r016", "r012", "r008", "r004"]

try:
    list_runs(runs, 3, token, status="failed")
    raise AssertionError("expected ValueError")
except ValueError as e:
    assert "different filter" in str(e)
assert list_runs([], 5) == ([], None)
print("pagination ok")
```

Complexity: O(n log n) here for the in-memory sort; with a database index each page is O(log n + page_size).

#### Follow-ups

- **Should the token be signed or encrypted?** If it carries anything sensitive or you must stop clients from crafting tokens, sign it (HMAC) or encrypt it; at minimum validate everything you decode.
- **How does the client know the total?** Counting is expensive on big tables; offer an estimate or a separate count endpoint rather than counting on every page.

### Idempotent "start run" with an Idempotency-Key {medium core}

Build `POST /v1/runs` in FastAPI that requires an `Idempotency-Key` header. The first request creates a run and stores the response. A retry with the same key and body returns the same response (same run id) with header `Idempotent-Replayed: true`, without creating a new run. The same key with a different body returns 422. A missing key returns 400. Assume a key is scoped per client (use an `X-Client-Id` header).

#### Hints

1. Store `(client_id, key) -> (body_hash, status_code, response_body)`.
2. Hash a canonical form of the body (`json.dumps(..., sort_keys=True)`), so key order does not matter.
3. Claim the key before doing the work; in production that claim must be atomic (unique insert or `SET NX`).

#### Solution

The handler hashes the canonical body, looks up the key, and either replays, rejects, or claims and executes. If the work raises, it releases the claim, so a retry can succeed instead of hitting 409 forever. The in-memory dict stands in for Postgres or Redis; the comment shows where atomicity matters.

```python
import hashlib
import json
import uuid
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Request, Response
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field


class StartRun(BaseModel):
    agent_id: str = Field(min_length=1)
    input: str = Field(min_length=1)


IDEMPOTENCY: dict[tuple[str, str], dict] = {}  # production: a table with a unique (client_id, key) and an expiry
RUNS: dict[str, dict] = {}
app = FastAPI()


@app.post("/v1/runs", status_code=202)
async def start_run(
    body: StartRun,
    request: Request,
    response: Response,
    idempotency_key: Annotated[str | None, Header()] = None,
    x_client_id: Annotated[str, Header()] = "anonymous",
) -> dict:
    if not idempotency_key:
        raise HTTPException(400, "Idempotency-Key header is required")
    body_hash = hashlib.sha256(json.dumps(body.model_dump(), sort_keys=True).encode()).hexdigest()
    slot = (x_client_id, idempotency_key)

    if (stored := IDEMPOTENCY.get(slot)) is not None:
        if stored["hash"] != body_hash:
            raise HTTPException(422, "Idempotency-Key was already used with a different request body")
        if stored["state"] == "processing":
            raise HTTPException(409, "A request with this Idempotency-Key is still being processed")
        response.status_code = stored["status"]
        response.headers["Idempotent-Replayed"] = "true"
        return stored["body"]

    IDEMPOTENCY[slot] = {"hash": body_hash, "state": "processing"}  # the atomic claim in a real store
    try:
        run = create_run(body)
    except Exception:
        del IDEMPOTENCY[slot]  # release the claim, so the client's retry can succeed
        raise
    IDEMPOTENCY[slot] = {"hash": body_hash, "state": "done", "status": 202, "body": run}
    return run


FAIL_NEXT: set[str] = set()  # test hook: agent ids whose next start fails, like a database blip


def create_run(body: StartRun) -> dict:
    if body.agent_id in FAIL_NEXT:
        FAIL_NEXT.discard(body.agent_id)
        raise RuntimeError("database unavailable")
    run = {"id": str(uuid.uuid4()), "agentId": body.agent_id, "status": "queued"}
    RUNS[run["id"]] = run
    return run


client = TestClient(app)
headers = {"Idempotency-Key": "k-1", "X-Client-Id": "web"}
first = client.post("/v1/runs", json={"agent_id": "a1", "input": "go"}, headers=headers)
retry = client.post("/v1/runs", json={"input": "go", "agent_id": "a1"}, headers=headers)  # same body, other key order
assert first.status_code == retry.status_code == 202
assert retry.json()["id"] == first.json()["id"] and retry.headers["idempotent-replayed"] == "true"
assert len(RUNS) == 1

assert client.post("/v1/runs", json={"agent_id": "a1", "input": "different"}, headers=headers).status_code == 422
assert client.post("/v1/runs", json={"agent_id": "a1", "input": "go"}).status_code == 400
other_client = client.post("/v1/runs", json={"agent_id": "a1", "input": "go"}, headers={"Idempotency-Key": "k-1", "X-Client-Id": "cli"})
assert other_client.json()["id"] != first.json()["id"]  # keys are scoped per client
assert len(RUNS) == 2

# A failure while processing releases the key: the retry runs the work instead of getting 409 forever.
FAIL_NEXT.add("a2")
flaky = {"Idempotency-Key": "k-2", "X-Client-Id": "web"}
crashed = TestClient(app, raise_server_exceptions=False).post("/v1/runs", json={"agent_id": "a2", "input": "go"}, headers=flaky)
assert crashed.status_code == 500 and ("web", "k-2") not in IDEMPOTENCY
assert client.post("/v1/runs", json={"agent_id": "a2", "input": "go"}, headers=flaky).status_code == 202

# A retry that arrives while the first request still holds the claim gets 409.
IDEMPOTENCY[("web", "k-3")] = {"hash": IDEMPOTENCY[("web", "k-1")]["hash"], "state": "processing"}
in_flight = client.post("/v1/runs", json={"agent_id": "a1", "input": "go"}, headers={"Idempotency-Key": "k-3", "X-Client-Id": "web"})
assert in_flight.status_code == 409
print("idempotency ok")
```

Complexity: O(b) per request to hash a body of size b.

#### Follow-ups

- **The process crashes while "processing"?** Store a lease expiry with the claim; after it passes, a retry may take over. Keep the side effect itself idempotent too (pass the key downstream).
- **Should errors be stored?** Store final 4xx responses (they will fail again) but not 5xx or timeouts, so the client's retry can succeed.

### A long-running operation with polling {medium}

Implement `POST /v1/imports` that returns `202` with `Location: /v1/operations/{id}` and an operation body `{name, done: false, metadata: {progress: 0}}`, and `GET /v1/operations/{id}` that returns the current state. Simulate the work with a `advance(op_id)` helper that moves progress by 50% per call; when it reaches 100, the operation is `done` with a `response`. An unknown operation returns 404.

#### Hints

1. Store operations in a dict keyed by id, shaped like AIP-151: `name`, `done`, `metadata`, and later `response` or `error`.
2. Set the `Location` header on the 202 response.
3. The worker (here, `advance`) is the only thing that changes the operation; the API just reads it.

#### Solution

The POST creates the operation and would enqueue the job; the GET is a plain read. Keeping `done` plus exactly one of `response` or `error` makes the client logic trivial.

```python
import uuid

from fastapi import FastAPI, HTTPException, Response
from fastapi.testclient import TestClient

OPERATIONS: dict[str, dict] = {}
app = FastAPI()


@app.post("/v1/imports", status_code=202)
def start_import(response: Response) -> dict:
    op_id = uuid.uuid4().hex[:8]
    OPERATIONS[op_id] = {"name": f"operations/{op_id}", "done": False, "metadata": {"progress": 0}}
    response.headers["Location"] = f"/v1/operations/{op_id}"
    response.headers["Retry-After"] = "2"
    # Real code: enqueue the job (Cloud Tasks, Pub/Sub) with op_id; a worker updates the operation.
    return OPERATIONS[op_id]


@app.get("/v1/operations/{op_id}")
def get_operation(op_id: str) -> dict:
    if op_id not in OPERATIONS:
        raise HTTPException(404, "Operation not found")
    return OPERATIONS[op_id]


def advance(op_id: str) -> None:  # stands in for the worker
    op = OPERATIONS[op_id]
    op["metadata"]["progress"] = min(100, op["metadata"]["progress"] + 50)
    if op["metadata"]["progress"] == 100:
        op["done"] = True
        op["response"] = {"importedRows": 1200}


client = TestClient(app)
started = client.post("/v1/imports")
assert started.status_code == 202
location = started.headers["location"]
op_id = location.rsplit("/", 1)[-1]
assert client.get(location).json() == {"name": f"operations/{op_id}", "done": False, "metadata": {"progress": 0}}

polls = []
while not (state := client.get(location).json())["done"]:
    polls.append(state["metadata"]["progress"])
    advance(op_id)
assert polls == [0, 50]
assert state["response"] == {"importedRows": 1200} and "error" not in state
assert client.get("/v1/operations/missing").status_code == 404
print("lro ok")
```

Complexity: O(1) per call.

#### Follow-ups

- **How do you cancel?** `POST /v1/operations/{id}:cancel` sets a flag the worker checks between steps; the operation ends `done` with a cancelled error.
- **Polling is wasteful for a UI.** Offer `GET /v1/operations/{id}/events` as SSE alongside polling, and a webhook for server-to-server callers.

### Optimistic concurrency with ETag and If-Match {medium}

Build `GET /v1/agents/{id}` that returns the agent config with an `ETag` header (a version counter), and supports `If-None-Match` returning 304. Build `PUT /v1/agents/{id}` that requires `If-Match` (428 if missing), returns 412 if the ETag is stale, and otherwise saves, bumps the version and returns the new `ETag`.

#### Hints

1. Store a `version` integer with each agent; the ETag is `"v<version>"` (quoted, as HTTP requires).
2. Compare the request's `If-Match` value with the current ETag before writing.
3. In a database the check and the write must be one statement: `UPDATE ... WHERE id = ? AND version = ?`.

#### Solution

The ETag reflects the stored version. Every write is conditional on the version the client last saw, so the second of two concurrent editors gets 412 instead of overwriting the first.

```python
from typing import Annotated

from fastapi import FastAPI, Header, HTTPException, Response
from fastapi.testclient import TestClient
from pydantic import BaseModel

AGENTS: dict[str, dict] = {"a1": {"config": {"model": "fast", "max_steps": 10}, "version": 1}}
app = FastAPI()


class AgentConfig(BaseModel):
    model: str
    max_steps: int


def etag(agent_id: str) -> str:
    return f'"v{AGENTS[agent_id]["version"]}"'


@app.get("/v1/agents/{agent_id}")
def get_agent(agent_id: str, response: Response, if_none_match: Annotated[str | None, Header()] = None):
    if agent_id not in AGENTS:
        raise HTTPException(404, "Agent not found")
    if if_none_match == etag(agent_id):
        return Response(status_code=304, headers={"ETag": etag(agent_id)})
    response.headers["ETag"] = etag(agent_id)
    return AGENTS[agent_id]["config"]


@app.put("/v1/agents/{agent_id}")
def put_agent(agent_id: str, body: AgentConfig, response: Response, if_match: Annotated[str | None, Header()] = None):
    if agent_id not in AGENTS:
        raise HTTPException(404, "Agent not found")
    if if_match is None:
        raise HTTPException(428, "If-Match header is required")
    if if_match != etag(agent_id):  # SQL: UPDATE agents SET ... WHERE id = :id AND version = :v (check rowcount)
        raise HTTPException(412, "The agent was modified by someone else; reload and retry")
    AGENTS[agent_id] = {"config": body.model_dump(), "version": AGENTS[agent_id]["version"] + 1}
    response.headers["ETag"] = etag(agent_id)
    return AGENTS[agent_id]["config"]


client = TestClient(app)
alice = client.get("/v1/agents/a1")
bob = client.get("/v1/agents/a1")
assert alice.headers["etag"] == '"v1"'
assert client.get("/v1/agents/a1", headers={"If-None-Match": '"v1"'}).status_code == 304

saved = client.put("/v1/agents/a1", json={"model": "fast", "max_steps": 20}, headers={"If-Match": alice.headers["etag"]})
assert saved.status_code == 200 and saved.headers["etag"] == '"v2"'
lost = client.put("/v1/agents/a1", json={"model": "smart", "max_steps": 10}, headers={"If-Match": bob.headers["etag"]})
assert lost.status_code == 412  # Bob's stale write is rejected instead of erasing Alice's change
assert client.put("/v1/agents/a1", json={"model": "smart", "max_steps": 10}).status_code == 428
assert client.get("/v1/agents/a1").json() == {"model": "fast", "max_steps": 20}
print("etag ok")
```

Complexity: O(1) per request.

#### Follow-ups

- **Strong or weak ETags?** Strong (`"v2"`) for byte-identical representations and conditional writes; weak (`W/"v2"`) only for caching semantically equal content.
- **What does the client do on 412?** Re-fetch, re-apply the user's change (or show a diff), and retry with the new ETag.

### Detect breaking changes between two versions of a model {hard}

Write `breaking_changes(old_model, new_model, direction)` that compares the JSON Schemas of two Pydantic models and returns a list of breaking changes. `direction` is `"request"` (clients send it) or `"response"` (clients read it). Report: a removed field (both directions); a changed type (both); a new required field or a field that became required (request); a field that is no longer required (response, because clients assume it is present); enum values removed (request) or added (response, risky for exhaustive switches).

#### Hints

1. `Model.model_json_schema()` gives `properties` and `required`.
2. Normalise a property's type: use `type` if present, the sorted list of `anyOf` types for optional fields, and keep `enum` separately.
3. Walk the union of property names and apply the rules per direction.

#### Solution

Generate both schemas, normalise each property to a comparable type and enum set, then apply the rules. This is the core of what tools like oasdiff (OpenAPI) and buf breaking (protobuf) do in CI.

```python
from typing import Literal

from pydantic import BaseModel


def _type_of(prop: dict) -> str:
    if "anyOf" in prop:
        return "|".join(sorted(_type_of(p) for p in prop["anyOf"]))
    return prop.get("type", prop.get("$ref", "object"))


def breaking_changes(old: type[BaseModel], new: type[BaseModel], direction: Literal["request", "response"]) -> list[str]:
    a, b = old.model_json_schema(), new.model_json_schema()
    a_props, b_props = a.get("properties", {}), b.get("properties", {})
    a_req, b_req = set(a.get("required", [])), set(b.get("required", []))
    problems: list[str] = []
    for name in sorted(a_props.keys() | b_props.keys()):
        if name not in b_props:
            problems.append(f"{name}: removed")
            continue
        if name not in a_props:
            if direction == "request" and name in b_req:
                problems.append(f"{name}: new required field")
            continue
        if _type_of(a_props[name]) != _type_of(b_props[name]):
            problems.append(f"{name}: type changed {_type_of(a_props[name])} -> {_type_of(b_props[name])}")
        if direction == "request" and name in b_req and name not in a_req:
            problems.append(f"{name}: became required")
        if direction == "response" and name in a_req and name not in b_req:
            problems.append(f"{name}: no longer guaranteed")
        old_enum, new_enum = set(a_props[name].get("enum", [])), set(b_props[name].get("enum", []))
        if old_enum and new_enum:
            if direction == "request" and old_enum - new_enum:
                problems.append(f"{name}: enum values removed {sorted(old_enum - new_enum)}")
            if direction == "response" and new_enum - old_enum:
                problems.append(f"{name}: enum values added {sorted(new_enum - old_enum)}")
    return problems


class RunV1(BaseModel):
    id: str
    status: Literal["queued", "running", "done"]
    cost_cents: int
    note: str


class RunV2(BaseModel):
    id: str
    status: Literal["queued", "running", "done", "waiting_approval"]
    cost_cents: float  # type change
    note: str | None = None  # no longer guaranteed
    tags: list[str] = []  # additive: fine


assert breaking_changes(RunV1, RunV2, "response") == [
    "cost_cents: type changed integer -> number",
    "note: type changed string -> null|string",
    "note: no longer guaranteed",
    "status: enum values added ['waiting_approval']",
]


class StartV1(BaseModel):
    input: str
    priority: Literal["low", "normal", "high"] = "normal"
    dry_run: bool = False


class StartV2(BaseModel):
    input: str
    priority: Literal["normal", "high"] = "normal"
    tenant_id: str  # new required field
    labels: dict[str, str] = {}


assert breaking_changes(StartV1, StartV2, "request") == [
    "dry_run: removed",
    "priority: enum values removed ['low']",
    "tenant_id: new required field",
]
assert breaking_changes(StartV1, StartV1, "request") == []
print("breaking-change detector ok")
```

Complexity: O(f) for f fields across both schemas.

#### Follow-ups

- **Isn't every type change breaking?** No: this version is deliberately strict. Widening a request field (`str` to `str | None`) is safe for existing clients, and narrowing a response field is safe too; a fuller tool compares types by direction.
- **Nested models?** Recurse into `$defs` referenced by `$ref`, applying the same rules with the field path as a prefix.
- **How do you use it in CI?** Generate the OpenAPI document on the main branch and on the pull request, diff them (oasdiff does this for real specs), and fail the build on breaking changes unless the version is bumped.
