---
title: Microservices and resilience
goal: Explain where to draw service boundaries, how services talk, and how you keep calls between them from cascading into an outage (timeouts, retries, circuit breakers, bulkheads, sagas and tracing), with your own migrations as evidence.
minutes: 40
---

The JD asks for "6+ years architecting microservices, asynchronous workers, and backend services" with "modular architecture and clean API contracts". Interviewers rarely want a definition of microservices. They want to know whether you can tell when they help, where you would split a system, and what you do about the network failing between services, because on an agent platform a single run touches the LLM, tool services, enterprise APIs, the database and the streaming gateway.

**Your angle:** at Cognizant you led the migration of monolithic healthcare applications to cloud-based microservices on Azure, which significantly reduced infrastructure costs, and you delivered mission-critical REST APIs at 99.99% uptime. (Keep those two facts separate: the resume does not tie the uptime figure to the migration.) At The Dot Corp you migrated FedEx integrations from SOAP to REST across about 24 OrderingStore applications plus 10 more, application by application. Those are your two stories for "tell me about a migration".

## When microservices help, and when they do not

| Microservices help when | A modular monolith is better when |
|---|---|
| Teams need to deploy independently without coordinating releases | One team owns the whole product |
| Parts have very different scaling or runtime needs (a streaming gateway, GPU-bound inference, a CPU-light API) | Load is modest and uniform |
| Parts need different failure isolation (a flaky ERP integration must not take down chat) | The domain is still changing fast and the boundaries are unclear |
| The domain has clear, stable boundaries | You cannot yet afford the operational cost: CI/CD per service, tracing, on-call |

The cost is real: network calls fail and add latency, data is split across databases, transactions become sagas, and debugging needs distributed tracing. A **distributed monolith** (services that must be deployed together and call each other synchronously for everything) has all of those costs and none of the benefits.

## Finding service boundaries

- **Bounded contexts (DDD):** split where the language and the rules change. "Run" means something different to the orchestration service (a state machine) than to billing (tokens and cost).
- **Own the data:** each service owns its tables and nobody else reads them directly. Other services ask through an API or listen to its events.
- **High cohesion, low coupling:** things that change together live together. If every feature touches three services, the boundaries are wrong.
- **Team ownership (Conway's law):** a service should be owned by one team end to end.

A plausible split for this platform: a **chat/streaming gateway** (long-lived connections), **run orchestration** (state machines and queues), **tool services** (one per integration family, such as ERP or ticketing), **identity and access**, **telemetry ingestion**, and the **web front end** with a BFF.

## How services talk

| | Synchronous (REST, gRPC) | Asynchronous (events, commands on a queue) |
|---|---|---|
| Use for | Queries and commands that need an answer now | Work that can happen later; notifying many consumers |
| Coupling | Temporal: the callee must be up right now | Callee can be down; the broker buffers |
| Failure mode | Cascading timeouts | Backlogs and duplicates |
| Consistency | Immediate, for that call | Eventual |
| Examples | The UI loads a run's details; the orchestrator calls a tool with a deadline | `run.completed` updates the dashboard, audit log and billing |

Around them:

- **API gateway:** one entry point for authentication, rate limiting, routing and TLS (Apigee, API Gateway, a load balancer with Cloud Armor).
- **BFF (backend for frontend):** a thin service shaped for one client, which aggregates calls and holds the session, so the SPA does not orchestrate five services itself.
- **Service discovery:** Kubernetes DNS (`orchestrator.runs.svc.cluster.local`) on GKE; stable HTTPS URLs on Cloud Run, called with an ID token for that service's audience.
- **Service mesh:** sidecars or proxyless clients that add mTLS, retries, timeouts, traffic splitting and telemetry without code changes (Istio; on GCP, Cloud Service Mesh).

## Resilience patterns

Every remote call can be slow, fail, or succeed without you hearing about it. The standard patterns, in the order you apply them:

1. **Timeouts on every call**, derived from an end-to-end **deadline** that is propagated downstream (gRPC does this natively), so a service does not keep working on a request the user has already abandoned.
2. **Retries** only for transient errors and only for idempotent operations, with exponential backoff and jitter, at one layer, under a **retry budget**.
3. **Circuit breakers**: after repeated failures, stop calling the dependency for a while and fail fast, then let a trial request through to see if it has recovered.
4. **Bulkheads**: separate pools (connections, threads, concurrency limits) per dependency, so a slow ERP cannot use up the capacity that chat needs.
5. **Fallbacks and graceful degradation**: cached data, a default, or a partial page with a clear message.
6. **Load shedding and backpressure**: reject early with `429` or `503` when overloaded, instead of queuing until everything times out.

### A circuit breaker

```python
import time
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


class CircuitOpen(Exception):
    """Raised instead of calling a dependency that is known to be failing."""


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 3, reset_timeout: float = 30.0, clock: Callable[[], float] = time.monotonic):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.clock = clock
        self.state = "closed"
        self.failures = 0
        self.opened_at = 0.0

    def call(self, fn: Callable[[], T]) -> T:
        if self.state == "open":
            if self.clock() - self.opened_at < self.reset_timeout:
                raise CircuitOpen("failing fast: the dependency is down")
            self.state = "half_open"  # trial request (single-threaded here; see the note below)
        try:
            result = fn()
        except Exception:
            self._record_failure()
            raise
        self.state, self.failures = "closed", 0
        return result

    def _record_failure(self) -> None:
        self.failures += 1
        if self.state == "half_open" or self.failures >= self.failure_threshold:
            self.state, self.opened_at = "open", self.clock()


now = 0.0
breaker = CircuitBreaker(failure_threshold=3, reset_timeout=30, clock=lambda: now)
calls = 0


def erp_down() -> str:
    global calls
    calls += 1
    raise ConnectionError("ERP timeout")


def erp_up() -> str:
    global calls
    calls += 1
    return "PO-4501"


for _ in range(3):
    try:
        breaker.call(erp_down)
    except ConnectionError:
        pass
assert breaker.state == "open" and calls == 3

try:
    breaker.call(erp_up)  # within the reset timeout: not even attempted
except CircuitOpen:
    pass
assert calls == 3

now = 31
try:
    breaker.call(erp_down)  # the half-open trial fails, so the circuit opens again
except ConnectionError:
    pass
assert breaker.state == "open" and calls == 4

now = 62
assert breaker.call(erp_up) == "PO-4501"  # the trial succeeds and the circuit closes
assert breaker.state == "closed" and breaker.failures == 0
```

This version counts consecutive failures of any kind and assumes one caller at a time. Under concurrency, every request that arrives while the circuit is half-open would pass the check, so a real breaker lets only a limited number of trial requests through and counts only real failures (timeouts, 5xx), not client errors. In production, use a library or the mesh rather than your own (for example `pybreaker` in Python, `opossum` in Node, or Envoy's outlier detection), and decide whether breaker state is per instance (usually fine) or shared.

### Retries that respect idempotency and a time budget

```ts
import assert from 'node:assert/strict';

class HttpError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

const TRANSIENT = new Set([429, 502, 503, 504]);

async function callWithRetry<T>(
  fn: () => Promise<T>,
  opts: { idempotent: boolean; maxAttempts: number; budgetMs: number; now: () => number; sleep: (ms: number) => Promise<void> },
): Promise<T> {
  const start = opts.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 0;
      // A 429 means the server refused the request without processing it, so even a non-idempotent call is
      // normally safe to repeat. (Production code also adds jitter; it is left out so the test is deterministic.)
      const retryable = TRANSIENT.has(status) && (opts.idempotent || status === 429);
      const delay = 100 * 2 ** (attempt - 1);
      const overBudget = opts.now() - start + delay > opts.budgetMs;
      if (!retryable || attempt >= opts.maxAttempts || overBudget) throw err;
      await opts.sleep(delay);
    }
  }
}

// A fake clock: sleeping just moves time forward, so the test is instant.
let t = 0;
const clock = { now: () => t, sleep: async (ms: number) => void (t += ms) };
function failThen(statuses: number[], value = 'ok') {
  let calls = 0;
  const fn = async () => {
    const status = statuses[calls++];
    if (status !== undefined) throw new HttpError(status);
    return value;
  };
  return { fn, calls: () => calls };
}

let s = failThen([503, 503]);
assert.equal(await callWithRetry(s.fn, { idempotent: true, maxAttempts: 4, budgetMs: 10_000, ...clock }), 'ok');
assert.equal(s.calls(), 3);
assert.equal(t, 300); // waited 100 + 200 ms

s = failThen([503]);
await assert.rejects(callWithRetry(s.fn, { idempotent: false, maxAttempts: 4, budgetMs: 10_000, ...clock }), /503/);
assert.equal(s.calls(), 1); // a POST that may have been processed is not repeated

s = failThen([429]);
assert.equal(await callWithRetry(s.fn, { idempotent: false, maxAttempts: 4, budgetMs: 10_000, ...clock }), 'ok');

s = failThen([400]);
await assert.rejects(callWithRetry(s.fn, { idempotent: true, maxAttempts: 4, budgetMs: 10_000, ...clock }), /400/);
assert.equal(s.calls(), 1); // a client error is never retried

t = 0;
s = failThen([503, 503, 503]);
await assert.rejects(callWithRetry(s.fn, { idempotent: true, maxAttempts: 10, budgetMs: 250, ...clock }), /503/);
assert.equal(s.calls(), 2); // the next 200 ms wait would break the 250 ms budget
```

### A bulkhead that sheds load

```python
import asyncio


class BulkheadFull(Exception):
    pass


class Bulkhead:
    """At most max_concurrent calls run at once and at most max_waiting wait; the rest are rejected immediately."""

    def __init__(self, max_concurrent: int, max_waiting: int):
        self._slots = asyncio.Semaphore(max_concurrent)
        self._waiting = 0
        self._max_waiting = max_waiting

    async def run(self, fn):
        if self._slots.locked() and self._waiting >= self._max_waiting:
            raise BulkheadFull("dependency saturated, shedding load")
        self._waiting += 1
        try:
            await self._slots.acquire()
        finally:
            self._waiting -= 1
        try:
            return await fn()
        finally:
            self._slots.release()


async def main() -> list:
    erp = Bulkhead(max_concurrent=2, max_waiting=1)
    gate = asyncio.Event()

    async def slow_erp_call() -> str:
        await gate.wait()
        return "done"

    tasks = [asyncio.create_task(erp.run(slow_erp_call)) for _ in range(5)]
    await asyncio.sleep(0)  # let every task reach the bulkhead
    gate.set()
    return await asyncio.gather(*tasks, return_exceptions=True)


results = asyncio.run(main())
assert results.count("done") == 3  # two running and one waiting
assert sum(isinstance(r, BulkheadFull) for r in results) == 2  # rejected at once instead of piling up
```

## Data and transactions across services

- **Database per service:** each service owns its data. Joins across services become **API composition** (a BFF calls several services and merges the results) or **read models** built from events (CQRS), such as a dashboard table fed by run events.
- **No distributed transactions in practice:** two-phase commit across services couples them and blocks on failure. Use **sagas** with compensating actions (see [State machines](#/state-machines)) and the **outbox pattern** to publish events reliably (see [Task queues](#/task-queues)).
- **Eventual consistency in the UI:** show pending states, use read-your-writes (return the updated resource from the write call, or optimistic updates in TanStack Query), and push updates over SSE when the background work completes.

## Observability across services

A request that crosses six services is undebuggable without three things:

- **Correlation:** every log line carries the trace id and the run id, as structured JSON (Cloud Logging picks up the trace field and links logs to traces).
- **Distributed tracing:** OpenTelemetry instruments HTTP, gRPC and database clients, and propagates context in the W3C `traceparent` header (and in message attributes across queues). Export to Cloud Trace or any OTLP backend.
- **Metrics:** RED per service (rate, errors, duration) and USE per resource (utilisation, saturation, errors), with SLOs and burn-rate alerts.

```ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

// W3C Trace Context: traceparent = version-traceid-parentid-flags
const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

type SpanContext = { traceId: string; parentId: string; sampled: boolean };

function parseTraceparent(header: string | undefined): SpanContext | null {
  const m = header?.trim().match(TRACEPARENT); // the spec allows lowercase hex only, so no toLowerCase()
  if (!m) return null;
  const [, traceId, parentId, flags] = m;
  if (/^0+$/.test(traceId) || /^0+$/.test(parentId)) return null; // all-zero ids are invalid
  return { traceId, parentId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

/** The header to send downstream: same trace, our new span as the parent. */
function childTraceparent(incoming: SpanContext | null): string {
  const traceId = incoming?.traceId ?? randomBytes(16).toString('hex'); // no context: start a new trace
  const spanId = randomBytes(8).toString('hex');
  const flags = incoming === null || incoming.sampled ? '01' : '00';
  return `00-${traceId}-${spanId}-${flags}`;
}

const incoming = parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
assert.deepEqual(incoming, { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', parentId: '00f067aa0ba902b7', sampled: true });

const outgoing = childTraceparent(incoming);
const parsedOut = parseTraceparent(outgoing);
assert.equal(parsedOut?.traceId, incoming?.traceId); // same trace across the hop
assert.notEqual(parsedOut?.parentId, incoming?.parentId); // a new span id

assert.equal(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'), null);
assert.equal(parseTraceparent('garbage'), null);
assert.equal(parseTraceparent('00-4BF92F3577B34DA6A3CE929D0E0E4736-00F067AA0BA902B7-01'), null); // uppercase is invalid
assert.equal(parseTraceparent(undefined), null);
assert.match(childTraceparent(null), TRACEPARENT);
```

## Evolving APIs without breaking consumers

- **Additive changes only** within a version: add optional fields, never rename or remove; consumers must ignore unknown fields (the **tolerant reader**).
- **Expand and contract:** add the new field or endpoint, migrate consumers, then remove the old one once nobody calls it (you know because you measure it).
- **Versioning** for breaking changes (`/v2`, a new gRPC package, or a new event type), with a deprecation window.
- **Contract tests** (consumer-driven, such as Pact, or schema checks against OpenAPI and protobuf) in CI, so a provider cannot ship a change that breaks a known consumer.

## Migrating a monolith: the strangler fig

Put a routing layer in front of the monolith, move one capability at a time to a new service, and route that capability's traffic to it, gradually, while the rest still goes to the monolith. An **anti-corruption layer** translates between the old model and the new one, so legacy concepts do not leak into the new service.

```python
import hashlib


def in_rollout(key: str, percent: int) -> bool:
    """Stable bucketing: the same user always lands in the same bucket, so they do not flip between systems."""
    bucket = int(hashlib.sha256(key.encode()).hexdigest(), 16) % 100
    return bucket < percent


# Prefix → (new service, share of users routed to it). Everything else stays on the monolith.
ROUTES = [("/api/orders", "orders-service", 100), ("/api/labels", "labels-service", 25)]


def route(path: str, user_id: str) -> str:
    for prefix, service, percent in ROUTES:
        if path.startswith(prefix) and in_rollout(user_id, percent):
            return service
    return "legacy-monolith"


users = [f"user-{i}" for i in range(10_000)]
assert all(route("/api/orders/42", u) == "orders-service" for u in users[:100])
share = sum(route("/api/labels", u) == "labels-service" for u in users) / len(users)
assert 0.22 < share < 0.28  # about a quarter of users
assert route("/api/labels", "user-7") == route("/api/labels", "user-7")  # stable per user
assert route("/api/invoices", "user-7") == "legacy-monolith"
```

The same idea, with traffic splitting at the platform level, is a Cloud Run revision tag or a mesh routing rule.

## Interview questions

### When would you choose microservices, and when would you not? {core}

I choose them when independent deployment, independent scaling or failure isolation is worth the operational cost: several teams shipping on their own schedules, parts with very different load profiles (a streaming gateway holding thousands of connections versus a CPU-light CRUD API), or a risky integration that must not take the core product down. Otherwise I start with a modular monolith with clear internal boundaries, and split along those boundaries when there is a concrete reason.

The cost to name: every call becomes a network call that can fail, transactions become sagas, and you need CI/CD, tracing and on-call per service. **Your angle:** the Azure migration at Cognizant reduced infrastructure costs, because services could be scaled and hosted independently.

### How do you decide where to draw service boundaries? {core}

Around business capabilities, using DDD's bounded contexts: where the vocabulary and the rules change, there is probably a boundary. Each service owns its data, and nobody else reads its tables. I check the split against change patterns: if a typical feature touches three services, they belong together. And each service should be owned by one team.

For this platform I would expect a streaming gateway, run orchestration, tool and integration services, identity, telemetry ingestion and a BFF, because they differ in scaling, failure modes and ownership.

### When do services call each other synchronously, and when through events? {core}

Synchronously (REST or gRPC) when the caller needs the answer to continue: the UI loading a run's details, or the orchestrator calling a tool within a deadline. Asynchronously when the work can happen later or many parties care: `run.completed` going to the dashboard, the audit log and billing through Pub/Sub.

The trade-off is temporal coupling versus eventual consistency. A chain of synchronous calls means every service must be up for any request to succeed, and latencies add up; events decouple availability, but you must handle duplicates, ordering and a UI that shows pending states.

### How do you stop one failing service from taking down the others? {core}

Layered defences. A timeout on every call, derived from a propagated deadline. Retries only for transient errors on idempotent operations, with backoff, jitter and a retry budget. A circuit breaker that fails fast once a dependency keeps failing. Bulkheads, meaning separate connection pools and concurrency limits per dependency, so a slow ERP cannot exhaust the capacity chat needs. And fallbacks or degraded responses where possible.

At the edge, load shedding: return `429` or `503` early when saturated, rather than queuing requests until they all time out.

### Explain how a circuit breaker works. {core}

It wraps calls to a dependency and has three states. **Closed**: calls go through and failures are counted. When failures cross a threshold, it goes **open**: calls fail immediately without touching the dependency, which protects both sides and gives the dependency time to recover. After a cool-down it goes **half-open** and lets a trial request through: success closes the circuit, failure opens it again.

Points worth adding: count failures over a rolling window or as an error rate, not a lifetime count; only count real failures (timeouts, 5xx), not client errors such as a 404; limit the number of half-open trial requests; and expose the breaker state as a metric. A mesh such as Envoy offers this as outlier detection.

### Why can retries make an outage worse? {deep}

Because they multiply load exactly when a dependency is struggling. If each of three layers retries three times, one failing request becomes up to 27 calls to the bottom service, and synchronised retries arrive in waves. That is a retry storm: the dependency could have recovered but cannot, because of the extra traffic.

The fixes: retry at one layer only, use exponential backoff with jitter, cap attempts, and use a **retry budget**, so retries may not exceed a fraction (for example 10%) of normal requests. Google's SRE book describes exactly this: a per-request limit of three attempts, plus a per-client budget that allows retries only while they are below about 10% of requests. Combine this with circuit breakers, and honour `Retry-After`.

### How do you handle a business transaction that spans several services? {core}

With a saga rather than a distributed transaction. Each service does its local transaction and publishes an event or returns to an orchestrator, which triggers the next step. If a step fails, compensating actions undo the earlier steps, in reverse order. For an agent creating a purchase order, that means: reserve budget, create the PO in SAP, attach the approval record; and if the last step fails, cancel the PO and release the budget.

To publish each step's events reliably, I use the outbox pattern, and every step is idempotent because events can be delivered twice. Two-phase commit would couple the services' availability and block on failure, so I avoid it.

### Each service has its own database. How do you build a page that needs data from three of them?

Two options. **API composition**: a BFF calls the three services in parallel, each with a timeout, and merges the results, returning a partial page if a non-critical one fails. That is simple and always current, but it is only as fast as the slowest call. **A read model (CQRS)**: a service listens to the other services' events and maintains a denormalised table shaped for that page. That is fast and resilient, but eventually consistent and more to build.

For a run details page I would compose; for a dashboard listing thousands of runs with filters, I would build a read model.

### How do you trace a request across services? {core}

With distributed tracing through OpenTelemetry. Each service creates spans for incoming requests and outgoing calls, and propagates the trace context in the W3C `traceparent` header for HTTP and gRPC, and in message attributes for Pub/Sub or queues, so even asynchronous hops join the same trace. Spans are exported to Cloud Trace or another OTLP backend.

Then every structured log line includes the trace id and business ids such as the run id, so you can jump from a trace to its logs and back. I would also show the trace id in the UI's error states, so support can find the exact request.

### What is the difference between an API gateway, a BFF and a service mesh?

An **API gateway** is the single entry point for outside traffic: authentication, rate limits, routing, TLS, request validation. A **BFF** is an application service built for one client (the web app) that aggregates and reshapes calls to internal services and often holds the user session, so the SPA stays simple. A **service mesh** handles service-to-service traffic inside the platform: mTLS, retries, timeouts, traffic splitting and telemetry, through sidecar proxies or proxyless clients, with no application code changes.

They complement each other: gateway at the edge, BFF for the front end, mesh between internal services.

### How do you evolve an API without breaking its consumers? {core}

Within a version I make only backward-compatible changes: add optional fields and new endpoints, never rename, remove or change the meaning of a field, and require consumers to ignore unknown fields. For a real breaking change I use expand and contract: add the new shape alongside the old, migrate consumers, measure until nobody uses the old one, then remove it. If that is not possible, a new version with a deprecation window.

Contract tests in CI enforce it: consumer-driven contracts such as Pact, or compatibility checks on the OpenAPI document and protobuf files. In protobuf specifically, never reuse or renumber field numbers.

### Tell me how you would migrate a monolith to services. {core}

Incrementally, with the strangler fig pattern. Put a routing layer in front of the monolith, pick one capability with a clear boundary and real value, build it as a service with its own data, and shift traffic to it gradually (a small percentage of users first), with an anti-corruption layer translating between the old and new models. Then repeat. Keep the old path available for rollback until the new one is proven.

**Your angle:** the FedEx SOAP-to-REST migration at The Dot Corp is the same discipline at the integration level: inventory every application (about 24 OrderingStore applications plus 10 more), analyse dependencies, implement, and validate application by application rather than in a big-bang switch, because shipping and labelling cannot break. At Cognizant I led the migration of monolithic applications to microservices on Azure, which significantly reduced infrastructure costs.

### How does service discovery work on GKE and on Cloud Run?

On GKE, a Kubernetes Service gets a stable virtual IP and a DNS name (`name.namespace.svc.cluster.local`), and kube-proxy or the dataplane load-balances across the ready pods behind it. So services call each other by name, and readiness probes decide which pods receive traffic.

On Cloud Run, each service has a stable HTTPS URL. Service-to-service calls use that URL with a Google-signed ID token whose audience is the receiving service, and the receiver allows only specific service accounts as invokers. You can restrict ingress to internal traffic and route through a VPC.

### How do you deal with eventual consistency in the user interface?

Be honest in the UI and close the gaps where users notice them. After a write, return the updated resource and use it directly (read-your-writes), or apply an optimistic update and roll back on error. Show intermediate states explicitly ("approval sent", "creating purchase order…") instead of pretending the work is done. Push the final result over SSE or a WebSocket so the user does not have to refresh.

For lists built from read models, show "updated a few seconds ago" where staleness matters, and route the user's own just-written item through the source of truth.

### What is a distributed monolith, and how do you recognise one?

It is a system split into services that still behave like one program: they must be deployed together, a change usually touches several of them, they share a database, and requests go through long synchronous call chains. You pay for the network and the operational complexity, and get none of the independence.

Symptoms: coordinated releases, a "release train" for services, shared libraries containing domain models, and an outage in one service taking down most features. The fixes are to merge services that always change together, give each service its own data, and replace synchronous chains with events where the caller does not need an immediate answer.

### What should liveness and readiness checks test? {deep}

**Liveness** answers "is this process stuck and in need of a restart?", so it should check only the process itself, never downstream dependencies. If liveness checked the database, a database blip would make Kubernetes restart every pod at once and turn a small incident into a big one. **Readiness** answers "should this instance receive traffic right now?": it can fail during startup, warm-up or shutdown, and can reflect a critical dependency, so the load balancer routes around the instance.

Add a startup probe for slow-starting services, and on `SIGTERM` fail readiness first, then drain existing connections, which matters for long-lived SSE and WebSocket connections.

### How do you test a system of microservices?

Mostly at the service level: unit tests, and integration tests of each service against its real database (Testcontainers) with its dependencies faked at the network boundary. Contract tests check that each provider still satisfies what its consumers expect, without starting the whole system. Then a small number of end-to-end tests cover critical journeys in a deployed environment, plus synthetic monitoring in production.

The anti-pattern is relying on a big shared end-to-end environment for confidence: it is slow and flaky, and it does not tell you which service broke the contract.

### How do you protect a service from overload? {deep}

Bound everything: concurrency per instance (Cloud Run's per-instance concurrency setting, or a semaphore), queue lengths, and connection pools. When a bound is hit, reject fast with `429` or `503` and a `Retry-After`, rather than queue requests that will time out anyway. Prioritise: interactive chat over batch work, and authenticated customers over anonymous traffic.

Upstream, callers need retry budgets and circuit breakers so they back off when told to. Autoscaling helps with gradual growth, but it takes time to add instances, so load shedding is what protects you during a spike.

## Coding problems

### Implement a retry budget {medium}

Retries amplify outages. Implement a `RetryBudget` that each client consults before retrying: retries are allowed only while the number of retries in the last `window` seconds stays below `min_retries + ratio × requests in the window`. Provide `record_request()` and `try_retry() -> bool`, and take a clock for testing.

```text
budget = RetryBudget(ratio=0.1, window=10, min_retries=3)
100 requests in the window → up to 13 retries allowed, the 14th refused
10 seconds later           → the budget refills
```

#### Hints

1. You need counts of requests and retries over a sliding time window.
2. A `deque` of timestamps per kind lets you drop expired entries from the left in amortised O(1).
3. In `try_retry`, trim both deques first, compute the allowance, and record the retry only if it is allowed.

#### Solution

A fixed counter that resets every 10 seconds lets bursts through at the boundary; a sliding window of timestamps does not. The floor (`min_retries`) keeps a low-traffic client from being unable to retry at all.

```python
from collections import deque
from collections.abc import Callable


class RetryBudget:
    def __init__(self, ratio: float, window: float, min_retries: int, clock: Callable[[], float]):
        self.ratio = ratio
        self.window = window
        self.min_retries = min_retries
        self.clock = clock
        self.requests: deque[float] = deque()
        self.retries: deque[float] = deque()

    def _trim(self, now: float) -> None:
        for times in (self.requests, self.retries):
            while times and times[0] <= now - self.window:
                times.popleft()

    def record_request(self) -> None:
        now = self.clock()
        self._trim(now)
        self.requests.append(now)

    def try_retry(self) -> bool:
        now = self.clock()
        self._trim(now)
        if len(self.retries) < self.min_retries + self.ratio * len(self.requests):
            self.retries.append(now)
            return True
        return False


t = 0.0
budget = RetryBudget(ratio=0.1, window=10, min_retries=3, clock=lambda: t)
for _ in range(100):
    budget.record_request()
allowed = sum(budget.try_retry() for _ in range(20))
assert allowed == 13  # 3 + 10% of 100

t = 10.5  # the window has moved past every recorded request and retry
assert budget.try_retry() is True

quiet = RetryBudget(ratio=0.1, window=10, min_retries=3, clock=lambda: t)
assert [quiet.try_retry() for _ in range(4)] == [True, True, True, False]  # the floor still allows a few
```

Complexity: amortised O(1) per call; memory O(requests in one window).

#### Follow-ups

- **Should retries count as requests?** No, or the budget grows as retries grow, which defeats it. Count first attempts only.
- **Where should the budget live?** Per client process per dependency is usually enough. Many clients each holding 10% still caps the total amplification at about 10%.

### Compose a page from three services with timeouts {medium core}

The run details page needs data from three services: `run` (required), `users` and `billing` (optional). Write `run_details(run_id, services, timeout)` with asyncio. It calls all three in parallel, each with its own timeout, and returns the data it got plus an `errors` map for the optional services that failed or timed out. If the required `run` service fails, raise `LookupError`. The whole call must take about one timeout, not the sum of them.

#### Hints

1. `asyncio.gather` runs the calls concurrently, so total time is the slowest call, not the sum.
2. Wrap each call with `asyncio.wait_for` and catch its exceptions inside the wrapper, so one failure does not cancel or hide the others.
3. Return `(name, value, error)` tuples from the wrapper and split them afterwards.

#### Solution

Calling sequentially makes the page as slow as the sum of the services, and a single `gather` without per-call handling lets one exception fail the whole page. Wrapping each call gives per-service timeouts and turns failures into data, so the page degrades instead of breaking.

```python
import asyncio
import time


async def call(name: str, coro, timeout: float) -> tuple[str, object, str | None]:
    try:
        return name, await asyncio.wait_for(coro, timeout), None
    except TimeoutError:
        return name, None, "timeout"
    except Exception as exc:
        return name, None, type(exc).__name__


async def run_details(run_id: str, services: dict, timeout: float = 0.05) -> dict:
    results = await asyncio.gather(*(call(name, fetch(run_id), timeout) for name, fetch in services.items()))
    data = {name: value for name, value, error in results if error is None}
    errors = {name: error for name, _, error in results if error is not None}
    if "run" not in data:
        raise LookupError(f"run {run_id} unavailable: {errors.get('run')}")
    return {**data, "errors": errors}


async def run_service(run_id: str) -> dict:
    await asyncio.sleep(0.01)
    return {"id": run_id, "state": "completed"}


async def users_slow(run_id: str) -> dict:
    await asyncio.sleep(1)  # far beyond the timeout
    return {"owner": "alice"}


async def billing_down(run_id: str) -> dict:
    raise ConnectionError("billing unreachable")


start = time.perf_counter()
page = asyncio.run(run_details("run-7", {"run": run_service, "users": users_slow, "billing": billing_down}))
elapsed = time.perf_counter() - start
assert page == {"run": {"id": "run-7", "state": "completed"}, "errors": {"users": "timeout", "billing": "ConnectionError"}}
assert elapsed < 0.5  # bounded by one timeout, not the slow service


async def run_down(run_id: str) -> dict:
    raise ConnectionError("orchestrator unreachable")


try:
    asyncio.run(run_details("run-8", {"run": run_down, "users": run_service}))
    raise AssertionError("expected LookupError")
except LookupError as exc:
    assert "ConnectionError" in str(exc)
```

Complexity: wall time is about max(slowest call, timeout); O(k) work for k services.

#### Follow-ups

- **Should the optional calls get a shorter timeout?** Yes: give each its own budget from the overall deadline, so a non-critical service never delays the critical one.
- **How does the UI show partial data?** Render what arrived, show a small "billing unavailable" state, and let the client retry just that panel. TanStack Query's per-query error states fit this well.
