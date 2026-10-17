---
title: System design for real-time agent platforms
goal: Run the design round with a clear framework, size a system with quick numbers, pick building blocks with their trade-offs, and handle the real-time, multi-tenant and agent-specific parts that this platform needs.
minutes: 50
---

For a senior full-stack role, the design round is usually "design X" or "how would this scale?". For this platform, X
is almost certainly something like a streaming chat for agents, an orchestrator for agent runs, or a live operations
dashboard. Interviewers are not looking for one correct diagram. They score whether you clarify requirements, make
decisions from numbers, name trade-offs out loud, and go deep on the hard part, which here is nearly always the
real-time path and what happens when things fail.

This chapter is the toolkit: the framework, estimates, building blocks, and the questions that come up in any design.
The [worked designs](#/design-cases) apply it to five systems this team is likely to build. Anchor your answers in what
you have shipped: the GCP Document AI platform with human-in-the-loop review on Cloud Run, healthcare APIs at 99.99%
uptime, the monolith-to-microservices migration on Azure, and AKS deployments.

## A framework for the interview

Use the same steps every time and say them out loud, so the interviewer can follow and steer.

| Step | Time (of 45 min) | What you do |
|---|---|---|
| 1. Requirements | 5 min | Functional: what users do. Non-functional: scale, latency, availability, consistency, security, cost. Ask, do not assume. |
| 2. Estimates | 3 min | Concurrent connections, events per second, storage per day, and the expensive resource (LLM tokens, an external API's rate limit, human approvers). |
| 3. API | 4 min | The main endpoints, streams and events, with request and response shapes. Sync, async or streaming? |
| 4. Data model | 4 min | Main entities, keys, access patterns, and which store fits each. |
| 5. High-level design | 10 min | Boxes and arrows for the main flow, end to end. Simple first. |
| 6. Deep dives | 15 min | Two or three hard parts: the bottleneck, failure handling, security, the streaming path. |
| 7. Wrap-up | 4 min | What you chose and why, what changes at 10× scale, how you would monitor it. |

Two habits that score well: draw the simple version before optimising, and when you make a choice, say what you gave
up ("SSE instead of WebSockets: simpler and works through every proxy, but client-to-server messages go over normal
POSTs").

## Requirements to ask about on this platform

- **Users and tenancy:** internal employees only, or many enterprise customers? Which identity providers (SAML, OIDC)?
  Which roles exist (viewer, operator, approver, admin)?
- **Scale:** how many concurrent chats or agent runs at peak? How long does a run last: seconds, minutes, or days when
  it waits for a human approval?
- **Latency:** the target time to first token, and how much overhead the platform may add on top of the model.
- **Durability:** must transcripts, tool calls and approvals be kept for audit? For how long?
- **Side effects:** do agents only answer questions, or do they act on real systems (create tickets, purchase orders,
  run Terraform)? Acting on real systems raises the bar for idempotency, approvals and audit.
- **Availability and regions:** the SLO, single region or multi-region, data residency.
- **Cost:** LLM tokens usually dominate. Is there a per-tenant budget?

## Back-of-envelope estimates

Numbers turn opinions into decisions. Here is the estimate for a streaming chat at 100,000 open connections. It shows
two things: you must batch tokens, and you must not write every token to the database.

```python
open_streams = 100_000
active_pct = 30                 # share of open streams generating tokens at any moment
tokens_per_sec = 40             # model output speed per active stream
flush_ms = 100                  # the gateway coalesces tokens into one event every 100 ms
bytes_per_event = 250           # small JSON envelope plus a few tokens
run_seconds = 20                # average length of one agent run
streams_per_instance = 250      # long-lived streams per Cloud Run instance (the setting allows up to 1,000)

active = open_streams * active_pct // 100
token_events_if_unbatched = active * tokens_per_sec
events_per_sec = active * 1000 // flush_ms
egress_mbit_per_sec = events_per_sec * bytes_per_event * 8 // 1_000_000
instances = open_streams // streams_per_instance
runs_finishing_per_sec = active // run_seconds

assert active == 30_000
assert token_events_if_unbatched == 1_200_000   # one event per token: far too chatty
assert events_per_sec == 300_000                # batching every 100 ms cuts it by 4x
assert egress_mbit_per_sec == 600
assert instances == 400
assert runs_finishing_per_sec == 1_500          # one final message row per run: fine for Cloud SQL
```

So: coalesce tokens on the server, keep the hot event stream in a fast log with a short retention (Redis Streams,
sharded by run), persist one final message per run to PostgreSQL, and plan for hundreds of gateway instances. The
connections are cheap; the LLM calls behind them are the real cost.

## Building blocks

| Block | Use it for | Trade-off to mention |
|---|---|---|
| Global load balancer + Cloud Armor | One anycast IP, TLS, WAF rules, routing to Cloud Run or GKE in several regions | Another component to configure; timeouts must match long-lived streams |
| Stateless service (Cloud Run, GKE) | Scale horizontally; any instance serves any request | State must live elsewhere: database, cache, log or object storage |
| PostgreSQL / Cloud SQL | System of record: runs, steps, approvals, users, tenants; transactions and constraints | Vertical write scaling; plan connection pools carefully with many instances |
| Firestore | Per-document state with real-time listeners, flexible schema, serverless scale | Queries must follow indexes; per-document write rate limits; no joins |
| Redis / Memorystore | Hot state, caches, rate-limit counters, pub/sub fan-out, short-lived event logs (Streams) | Memory-bound; replication is asynchronous, so a failover can lose recent writes; never the only copy |
| Pub/Sub | Decouple services, fan out events, absorb spikes | At-least-once delivery; ordering only per ordering key |
| Cloud Tasks | Dispatch HTTP work at a controlled rate, schedule work for later | Per-task model; not a broadcast bus |
| Workflow engine (Temporal, Cloud Workflows) or a state machine in PostgreSQL | Long-running, multi-step runs that must survive crashes and wait for humans | Engine: powerful but new infrastructure; DIY: simple but you own retries and timers |
| Cloud Storage | Large artifacts, files, exports; signed URLs for direct upload and download | Not a database: no queries, no transactions across objects |
| BigQuery | Analytics over runs, costs and telemetry | Not for low-latency serving |
| Observability (Cloud Logging, Monitoring, Trace, OpenTelemetry) | Logs, metrics, traces, alerts, audit | Log volume costs money; keep secrets and personal data out |

## Choosing a data store

| Need | Good fit | Why |
|---|---|---|
| Runs, steps, approvals, tenants, billing | PostgreSQL | Transactions, constraints, joins, reporting, `SKIP LOCKED` work queues |
| Live state many browsers watch (run status, progress) | Firestore or Redis + your own push | Firestore listeners push changes to clients; Redis pub/sub feeds your WebSocket or SSE gateway |
| Hot stream of events for resume (last few minutes) | Redis Streams | Append-only log with ids, fast reads from an id, trimming by length |
| Caches, sessions, rate limits | Redis | Sub-millisecond reads, TTLs, atomic counters |
| Large blobs (documents, model outputs, exports) | Cloud Storage | Cheap and durable; keep only the path in the database |
| Analytics and cost reports | BigQuery | Columnar scans over billions of rows |

The usual answer is "PostgreSQL as the system of record, plus specialised stores for hot paths". Say why each extra
store earns its place, because every store is another thing to secure, back up and keep consistent.

## Delivery guarantees and idempotency

Almost every queue, webhook and retry gives **at-least-once** delivery: a message can arrive twice or out of order. So:

- **Make consumers idempotent:** key the work by a business id (run id + step id), and upsert with a version so an old
  or duplicate message cannot overwrite newer state.
- **Use idempotency keys** on POST endpoints and pass your own key to external APIs that support one.
- **Publish events reliably with an outbox:** write the state change and an `outbox` row in one transaction; a relay
  publishes outbox rows to Pub/Sub. You never get "saved but not published" or "published but not saved".
- **Order only where it matters:** Pub/Sub ordering keys (for example the run id) or a sequence number per run, and
  consumers that detect gaps.
- **Send failures somewhere:** a dead-letter topic or table with alerting and a way to replay.

"Exactly once" in practice means at-least-once delivery plus idempotent processing. Pub/Sub's exactly-once delivery
option prevents redelivery of an acknowledged message, but a publisher that publishes twice still creates two messages,
so you still need idempotent handlers.

## The real-time path

| Transport | Direction | Best for | Watch out for |
|---|---|---|---|
| SSE | Server → client | Token streams, progress, notifications | Text only; browser `EventSource` cannot send custom headers; HTTP/1.1 limits connections per origin |
| WebSockets | Both ways | Interactive control (cancel, approve), collaboration, presence | Stateful connections, own reconnect and heartbeat logic, harder through some proxies |
| gRPC streaming | Both ways (service to service) | High-throughput internal streams with typed contracts | Browsers need gRPC-Web or Connect; HTTP/2 end to end |
| Polling | Client pulls | Rare updates, simple clients | Latency versus wasted requests |

The design moves that matter more than the transport:

- **Decouple the connection from the work.** The agent run executes in a worker and appends events to a log. The
  gateway that holds the browser connection only reads that log. A dropped connection does not kill the run, and any
  gateway instance can serve any run, so you do not need sticky sessions.
- **Resume, do not restart.** Every event has a sequence id. A reconnecting client sends the last id it saw
  (`Last-Event-ID` for SSE, a resume message for WebSockets) and the gateway replays from the log.
- **Plan for forced reconnects.** Cloud Run treats each stream as a request, and the request timeout is at most 60
  minutes (default 5), so long sessions must reconnect anyway. Make reconnect invisible.
- **Fan out through a shared bus.** With many instances, an event produced on one must reach clients on the others:
  Redis pub/sub on Memorystore, Pub/Sub, or Firestore listeners. Google's Cloud Run WebSocket guide recommends
  Memorystore for Redis or Firestore for sharing state between instances.
- **Handle slow consumers.** Coalesce small updates, cap per-connection buffers, drop or summarise intermediate states
  (progress 41%, 42%… only the latest matters), and disconnect clients that fall too far behind so they resync.

## Multi-tenancy and access control

Put the tenant id and user id in the session, enforce them in middleware for every request **and every stream
subscription**, and add a second line of defence in the data layer (a mandatory tenant filter or PostgreSQL row-level
security). Map identity-provider groups to roles per tenant. Agents act **on behalf of** a user and must never have more
permission than that user. Rate-limit and budget per tenant so one customer cannot use all the LLM capacity. The
[RBAC design](#/design-cases) goes deeper, and [Enterprise identity](#/auth-identity) covers SAML and OIDC.

## Reliability, SLOs and cost

- **Timeouts on every call**, retries only for transient errors with exponential backoff and jitter, circuit breakers
  around flaky dependencies (LLM providers, enterprise APIs), and bulkheads so one slow tool cannot exhaust every worker.
- **Load shedding:** when overloaded, reject new runs early with 429 or 503 and `Retry-After` rather than slowing
  everyone down.
- **SLIs that users feel:** time to first token, stream completion rate (streams that end with `done`, not an error),
  run success rate, approval latency, dashboard freshness.
- **Cost on GCP:** LLM tokens first (cache, route simple requests to smaller models, cap steps per run); then
  always-on instances (an open WebSocket keeps a Cloud Run instance active and billed), min instances, cross-region
  egress, and log volume.

## A reference architecture for this platform

```text
 Browser (React SPA)
   │  HTTPS: REST + SSE / WebSocket                  SSO: SAML / OIDC via the identity layer
   ▼
 Global external Application Load Balancer + Cloud Armor
   │
   ├─► API service (Cloud Run): conversations, runs, approvals, RBAC ──► PostgreSQL / Cloud SQL (system of record)
   │         │ outbox ──► Pub/Sub "run-requests"
   │
   ├─► Stream gateway (Cloud Run): SSE / WebSocket, auth per subscription, resume from Last-Event-ID
   │         ▲ reads
   │         │
   │   Redis Streams / pub-sub (Memorystore): per-run event log with short retention, fan-out between instances
   │         ▲ appends
   │         │
   └── Agent workers (Cloud Run or GKE) ◄── Pub/Sub / Cloud Tasks
             │ LLM calls (Gemini on Google Cloud, or other models) · tools · enterprise APIs (SAP, ITSM, Terraform runner)
             └─► run state machine in PostgreSQL · artifacts in Cloud Storage · traces and metrics (OpenTelemetry)
```

## Interview questions

### How do you approach a system design interview? {core}

I follow a fixed structure and say it out loud: clarify functional and non-functional requirements, do quick estimates,
sketch the API and data model, draw a simple end-to-end design, then go deep on the two or three hardest parts and
finish with trade-offs and monitoring. I ask questions before drawing anything, because requirements decide the design:
an internal tool for 200 operators and a customer-facing chat for 100,000 concurrent users are different systems.

Throughout, I name the trade-off with each choice ("PostgreSQL over Firestore for runs, because approvals and audit need
transactions and reporting") and I come back to failure: what happens when the model, the network or an enterprise API
is slow or down.

### What do you clarify first when asked to design an agent platform? {core}

Who the users and tenants are and how they sign in; how many concurrent chats or runs at peak and how long a run lasts;
the latency target, usually time to first token; whether agents only answer or also act on real systems; what must be
kept for audit; and the availability, region and cost constraints. The "do agents act on real systems" question changes
the most: once an agent can create a purchase order or run Terraform, idempotency, approvals and audit become the core
of the design.

### How would you estimate capacity for 100,000 concurrent streaming chats? {core}

Split connections from work. Of 100,000 open streams, maybe 30% are generating at any moment: 30,000 active streams at
about 40 tokens a second is 1.2 million tokens a second. Sending one event per token is too chatty, so the gateway
coalesces every 100 ms, which gives about 300,000 events a second and roughly 600 Mbit/s of egress. At 250 streams per
Cloud Run instance that is about 400 instances. Runs finishing at around 1,500 a second means 1,500 final message writes a
second, which PostgreSQL handles, while writing every token would not.

Then state the conclusion: the expensive part is the LLM calls and the event fan-out, not the connections. The numbers
are assumptions, so say them out loud and invite the interviewer to change them.

### SSE, WebSockets, gRPC streaming or polling: how do you choose? {core}

By direction and by who the client is. For streaming model output to a browser, I default to SSE: it is plain HTTP, works
through proxies and load balancers, reconnects with `Last-Event-ID`, and the client's messages (send, cancel, approve) go
over normal POSTs. I choose WebSockets when the client sends frequent messages on the same channel, such as interactive
control of a running agent, collaboration or presence. gRPC streaming fits service-to-service streams with typed
contracts; browsers need gRPC-Web or Connect for it. Polling is fine for rare updates.

The deeper point: the transport matters less than decoupling the connection from the run and making resume work. See
[SSE](#/sse), [WebSockets](#/websockets) and [gRPC](#/grpc).

### How do you scale WebSocket or SSE connections across many instances? {core}

Keep the gateway stateless about the work: the agent run writes events to a shared log or bus, and whichever gateway
instance holds the user's connection subscribes to that run's events. With Redis pub/sub or Streams on Memorystore (or
Pub/Sub, or Firestore listeners), an event produced anywhere reaches clients on every instance, so I do not depend on
sticky sessions; Cloud Run's session affinity is best effort anyway. Each connection is authorised when it subscribes,
the client resumes from its last event id after a reconnect, and instances are sized for many idle connections: Cloud
Run's default is 80 concurrent requests per instance, so a stream gateway raises it, up to the maximum of 1,000.

Follow-up to expect: "what about the 60-minute request timeout?" Clients reconnect and resume, so a forced disconnect
looks like a short pause, not a lost conversation.

### How do you choose between PostgreSQL, Firestore and Redis? {core}

By access pattern and consistency. PostgreSQL is the system of record for anything with relationships, transactions and
reporting: tenants, users, runs, steps, approvals, audit. Firestore fits per-document state that many clients watch in
real time, with a flexible schema, as long as I can model data around its queries and stay within per-document write
limits. Redis is for hot, short-lived or derived data: caches, sessions, rate-limit counters, pub/sub fan-out and
short-retention event logs. It is never the only copy of anything important.

**Your angle:** you have used PostgreSQL (query tuning at Medidata) and Firestore (on GCP). Redis is not on your resume, so
describe how you would use it and keep claims to design, not production history.

### How do you use caching, and how do you keep it correct?

I cache data that is read far more than written and tolerates brief staleness, usually with **cache-aside**: read the
cache, on a miss read the database and fill the cache with a TTL. **Write-through** updates the cache on every write
(fresher, slower writes); **write-behind** writes the cache first and the database later (fast, but can lose data).
Correctness comes from short TTLs, invalidating or updating keys when change events arrive, versioned keys, and stampede
protection: one request rebuilds a missing key while others wait or get the stale value.

Tenant caveat: scope every key by tenant (and user where results depend on permissions), so one user's cached response
can never be served to another.

### Why put a queue between services, and what guarantees do you get? {core}

A queue decouples producers from consumers: it absorbs spikes, lets workers scale and fail independently, and makes
retries natural. Most queues, Pub/Sub included, give **at-least-once** delivery, so a message can arrive twice or out of
order. Consumers must be idempotent (deduplicate by a business id, upsert by version), and messages that keep failing go
to a dead-letter topic with alerting. Ordering is only guaranteed per key, such as a Pub/Sub ordering key, so I choose
the key deliberately, usually the run id.

### How do you get exactly-once effects? {deep}

You cannot get exactly-once delivery across a network, so you build exactly-once **effects** from at-least-once delivery
plus idempotency. For my own state: process each message inside a transaction that also records the message id or step
id as done, so a duplicate is a no-op. For events: the transactional outbox, so state and the event to publish commit
together. For external systems: pass an idempotency key if the API supports one, otherwise write a correlation id into
the external record and check for it before creating, plus a reconciliation job that compares both sides.

### Explain CAP and PACELC. {deep}

During a network partition a distributed system must choose between **consistency** (every read sees the latest write)
and **availability** (every request gets an answer). PACELC adds that **else**, without a partition, you still trade
**latency** against consistency. I decide per operation: approving a purchase order or charging a budget needs strong
consistency, while a dashboard counter or a "typing…" indicator can be eventually consistent.

### How do you scale PostgreSQL on Cloud SQL?

In order of effort: fix queries and indexes; pool connections (many Cloud Run instances × pool size can exhaust the
database's connection limit, so keep pools small or use a pooler); cache hot reads; add read replicas for read-heavy
traffic and accept replication lag; partition big append-only tables such as run events by time; archive old data to
Cloud Storage or BigQuery; scale the instance up; and only then shard by tenant. Reporting moves to BigQuery instead of
running on the primary.

**Your angle:** at Medidata you managed and optimised PostgreSQL databases, writing efficient queries and improving data
access for clinical-trial workflows. Use it to show the order you work in: measure, fix queries and indexes, and only then
re-architect.

### How do you design for reliability? {core}

Assume every dependency fails. Timeouts on every call; retries only for transient errors, with exponential backoff and
jitter, and only for idempotent operations; circuit breakers so a failing LLM provider or enterprise API is not
hammered; bulkheads so one slow tool cannot use up every worker; graceful degradation (queue the action, show a clear
status, fall back to another model); dead-letter queues; deployments across zones with health checks and canary
releases; and SLOs with alerts on error-budget burn. Then test it with failure drills.

**Your angle:** at Cognizant you delivered healthcare REST APIs at 99.99% uptime, and at The Dot Corp you assisted with
production support and investigation of OrderingStore disruptions during an Azure regional outage.

### Producers are faster than consumers. What do you do? {deep}

That is backpressure, and the answer depends on whether intermediate data matters. For token streams, a log between the
worker and the gateway absorbs bursts, and each connection reads at its own pace; if a client falls too far behind, I
disconnect it and let it resume from its last id. For progress and status updates, only the latest value matters, so I
coalesce and drop intermediate states. For work queues, the queue grows and autoscaling adds workers, with a cap so we do
not overload a downstream API; beyond that, shed load at the edge with 429 and `Retry-After`.

### Monolith or microservices?

Start with a well-structured modular monolith unless there is a clear reason not to: it is simpler to build, test, deploy
and debug. Split out services when teams need to deploy independently, parts have very different scaling needs (the
stream gateway holds 100,000 idle connections; the agent workers burn CPU and LLM tokens), or a boundary is stable and
clear. The cost is real: network failures, distributed data, tracing and more operations. Migrate with the strangler-fig
pattern, one capability at a time.

**Your angle:** you led monolith-to-microservices work on Azure at Cognizant, and modernised FedEx SOAP integrations to
REST across about 24 OrderingStore applications plus 10 more at The Dot Corp.

### How do you handle long-running work behind an API? {core}

Never hold a request open while the work runs. Validate, create a run record, enqueue the work, and return **202
Accepted** with the run id and a status URL. Google's API guidelines (AIP-151) express the same idea as a long-running
operation: the call returns an Operation resource that the client polls until it is done. The client then
follows progress by polling the status resource or, better for this platform, by subscribing to the run's event stream.
Workers process idempotently, update the run's state machine, and send failures to a dead-letter queue. Agent runs that
wait hours for a human approval simply sit in an "awaiting approval" state without holding any worker.

### How do you design observability and SLOs for a streaming product?

Structured logs with a trace id and run id on every line, metrics (request rate, errors, latency, open connections, queue
depth, tokens and cost per tenant), and distributed traces with OpenTelemetry that follow one run from the browser through
the gateway, the worker, the model and each tool call. The SLOs are what users feel: "95% of runs show the first token
within 2 seconds" and "99.5% of streams end with a done event, not an error". Alert on error-budget burn rate, not on
every spike, and keep a separate append-only audit log for who approved what.

### How do you design a multi-tenant system? {deep}

Pick the isolation level per need: a shared database with a tenant id on every row (cheapest; enforce it in a data-access
layer and with PostgreSQL row-level security), a schema or database per tenant (stronger isolation and per-tenant keys,
more operations), or separate deployments for tenants with strict contracts. Tenant context comes from the session and
is enforced in middleware, on every stream subscription and on every agent tool call. Configuration per tenant lives in
data, not in code branches, and per-tenant quotas stop noisy neighbours.

**Your angle:** at The Dot Corp you investigated and enhanced the React-based LINE multi-tenant platform, an initiative
to consolidate customer-specific OrderingStore implementations into one architecture.

### How do you design rate limiting for an LLM platform?

Limit per tenant and per user at the edge, and limit what costs money, not just requests: a token bucket whose cost per
request is the estimated LLM tokens, so one huge prompt counts more than ten small ones. Keep the counters in Redis so
every instance shares them, return **429** with `Retry-After`, and add separate limits towards each external dependency
(the model provider's quota, an enterprise API's rate limit) using a rate-controlled queue such as Cloud Tasks. Budgets
per tenant per day stop runaway agent loops from becoming a surprise bill.

### How do you plan for disaster recovery? {deep}

Start from the business targets: **RTO** (how long we can be down) and **RPO** (how much data we can lose). Then choose:
backups with tested restores (cheap, slow), a warm standby in a second region with replicated Cloud SQL and dual-region
storage, or active-active behind the global load balancer (fastest recovery, most complex). Keep infrastructure as code so
the environment can be rebuilt, and run failover drills, because an untested plan is not a plan. For streams, clients
already reconnect and resume, so a regional failover looks like one long reconnect.

### How do you keep costs under control on GCP for an agent platform?

LLM tokens dominate, so I measure tokens and cost per tenant, per agent and per run; cache repeated work; route simple
requests to cheaper models; cap steps, tool calls and budget per run; and stop runaway loops. On the platform side:
Cloud Run scales to zero for bursty services but an open WebSocket keeps an instance billed, so the stream gateway is sized
for many connections per instance; min instances only where cold starts hurt; avoid cross-region egress; and sample or
filter logs, which are a surprisingly large bill at high event rates.

## Coding problems

### Rate-limit LLM usage per tenant with a token bucket {medium core}

Write a `TokenBucketLimiter` that limits each tenant to a budget of LLM tokens. Each tenant's bucket has a `capacity`
and refills at `refillPerSec` tokens per second. `tryConsume(tenant, cost, nowMs)` returns `true` and deducts `cost` if
the bucket has enough, otherwise `false`. A request costing more than the capacity can never succeed. Take the time as a
parameter so the limiter is easy to test.

Example: capacity 1,000, refill 100 per second. At t = 0 a 600-token request succeeds, a second 600-token request fails
(400 left). Two seconds later the bucket holds 600 again, so it succeeds.

#### Hints

1. Store, per tenant, the current number of tokens and the time you last updated it.
2. Refill lazily: on each call, add `elapsedSeconds × refillPerSec`, capped at the capacity, before checking.
3. A new tenant starts with a full bucket.

#### Solution

Lazy refill means no timers: each call first tops up the bucket for the time that passed, then checks the cost. That
makes it O(1) per call and easy to move into Redis later, where the same logic runs as one Lua script so concurrent
instances cannot race.

```ts
import assert from 'node:assert/strict';

type Bucket = { tokens: number; updatedMs: number };

class TokenBucketLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerSec: number;

  constructor(capacity: number, refillPerSec: number) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
  }

  tryConsume(tenant: string, cost: number, nowMs: number): boolean {
    if (cost > this.capacity) return false;
    const bucket = this.buckets.get(tenant) ?? { tokens: this.capacity, updatedMs: nowMs };
    const elapsedSec = Math.max(0, nowMs - bucket.updatedMs) / 1000;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
    bucket.updatedMs = Math.max(bucket.updatedMs, nowMs);
    this.buckets.set(tenant, bucket);
    if (bucket.tokens < cost) return false;
    bucket.tokens -= cost;
    return true;
  }
}

const limiter = new TokenBucketLimiter(1000, 100);
assert.equal(limiter.tryConsume('acme', 600, 0), true);
assert.equal(limiter.tryConsume('acme', 600, 0), false); // 400 left
assert.equal(limiter.tryConsume('globex', 600, 0), true); // tenants are independent
assert.equal(limiter.tryConsume('acme', 600, 2000), true); // 400 + 2 s × 100 = 600
assert.equal(limiter.tryConsume('acme', 1, 2000), false); // empty again
assert.equal(limiter.tryConsume('acme', 1000, 60_000), true); // refill is capped at capacity
assert.equal(limiter.tryConsume('acme', 1001, 120_000), false); // larger than capacity: never
assert.equal(limiter.tryConsume('acme', 10, 1000), false); // a clock going backwards adds nothing
assert.equal(limiter.tryConsume('acme', 100, 61_000), true); // and does not reset the refill clock
assert.equal(limiter.tryConsume('acme', 1, 61_000), false);
```

Complexity: O(1) time per call, O(number of tenants) memory.

#### Follow-ups

- **How do you share this across 400 instances?** Keep each bucket in Redis and run the refill-and-consume logic as a
  Lua script (atomic), keyed by tenant, with a TTL so idle tenants expire.
- **You do not know the real token count until the response ends.** Reserve an estimate up front, then reconcile with the
  actual usage when the stream finishes (refund or charge the difference).
- **What do you return to the client?** 429 with `Retry-After`, computed from how long the bucket needs to refill `cost`.

### Route runs to shards with consistent hashing {medium}

You run several Redis shards for per-run event logs. Write a `HashRing` that maps a key (a run id) to a shard name, using
consistent hashing with virtual nodes. Adding a shard should move only a small share of keys, unlike `hash(key) % n`,
which moves most of them.

#### Hints

1. Hash each shard many times (`"shard-a#0"`, `"shard-a#1"`, …) onto a sorted ring of integers.
2. A key belongs to the first virtual node clockwise from the key's hash; use `bisect` to find it, wrapping to the start.
3. Use a stable hash such as SHA-256 or MD5, not Python's `hash()`, which is randomised per process for strings.

#### Solution

Each shard owns many small arcs of the ring, so load spreads evenly, and adding a shard steals only the arcs next to its
new points: roughly 1/(n+1) of the keys move. The modulo approach changes the owner of almost every key when n changes,
which would empty every cache at once.

```python
import bisect
import hashlib


def stable_hash(value: str) -> int:
    return int.from_bytes(hashlib.sha256(value.encode()).digest()[:8], "big")


class HashRing:
    def __init__(self, shards: list[str], vnodes: int = 100):
        self.vnodes = vnodes
        self.ring: list[tuple[int, str]] = []
        for shard in shards:
            self.add(shard)

    def add(self, shard: str) -> None:
        for i in range(self.vnodes):
            bisect.insort(self.ring, (stable_hash(f"{shard}#{i}"), shard))

    def remove(self, shard: str) -> None:
        self.ring = [(h, s) for h, s in self.ring if s != shard]

    def shard_for(self, key: str) -> str:
        if not self.ring:
            raise LookupError("no shards")
        i = bisect.bisect(self.ring, (stable_hash(key), ""))
        return self.ring[i % len(self.ring)][1]


keys = [f"run-{n}" for n in range(10_000)]
ring = HashRing(["redis-a", "redis-b", "redis-c", "redis-d"])
before = {k: ring.shard_for(k) for k in keys}

counts = {s: list(before.values()).count(s) for s in ["redis-a", "redis-b", "redis-c", "redis-d"]}
assert all(1_800 < c < 3_200 for c in counts.values()), counts  # roughly a quarter each

ring.add("redis-e")
after = {k: ring.shard_for(k) for k in keys}
moved = sum(before[k] != after[k] for k in keys)
assert 1_200 < moved < 3_000, moved  # about 1/5 of keys move...
assert all(after[k] == "redis-e" for k in keys if before[k] != after[k])  # ...and only to the new shard

modulo_moved = sum(stable_hash(k) % 4 != stable_hash(k) % 5 for k in keys)
assert modulo_moved > 7_000  # hash % n moves about 80%

ring.remove("redis-e")
assert {k: ring.shard_for(k) for k in keys} == before  # removing it restores the old mapping
assert HashRing(["only"]).shard_for("anything") == "only"
```

Complexity: O(log V) per lookup with V virtual nodes; adding a shard costs O(vnodes × V) here because of `insort` on a
list, which is fine for a handful of shards.

#### Follow-ups

- **Why virtual nodes?** With one point per shard the arcs are uneven and one shard can own far more keys; many points
  average that out, and you can give a bigger shard more points.
- **Where is this used in practice?** Cache clusters, Redis Cluster's hash slots (16,384 fixed slots, a related idea),
  Cassandra and DynamoDB partitioning, and sticky routing in load balancers.

### Make a POST endpoint idempotent, including concurrent retries {medium}

Clients retry when a request times out, so "start agent run" can arrive twice. Write `IdempotencyStore` with
`execute(key, payload, work)`. The first call with a key runs `work` and stores the result. A retry with the **same key
and same payload** returns the stored result without running the work again. The **same key with a different payload**
raises `ValueError`. A retry that arrives while the first call is **still running** raises `InProgressError` (an API
would return 409 Conflict).

#### Hints

1. Store per key: a fingerprint of the payload, a status (`in_progress` or `done`) and the result.
2. A stable fingerprint is a hash of the JSON with sorted keys.
3. Record `in_progress` before calling `work`, and remove the record if `work` fails so the client can retry.

#### Solution

Saving the key **before** doing the work closes the race where two identical requests both see "no key" and both run.
In a real service the claim is an `INSERT` into a table with a unique constraint on the key (or Redis `SET NX` with a
TTL), so only one request wins.

```python
import hashlib
import json
from typing import Any, Callable


class InProgressError(Exception):
    pass


class IdempotencyStore:
    def __init__(self) -> None:
        self.records: dict[str, dict[str, Any]] = {}

    @staticmethod
    def fingerprint(payload: dict) -> str:
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    def execute(self, key: str, payload: dict, work: Callable[[dict], Any]) -> Any:
        fp = self.fingerprint(payload)
        record = self.records.get(key)
        if record:
            if record["fingerprint"] != fp:
                raise ValueError("idempotency key reused with a different payload")
            if record["status"] == "in_progress":
                raise InProgressError(key)
            return record["result"]
        self.records[key] = {"fingerprint": fp, "status": "in_progress", "result": None}
        try:
            result = work(payload)
        except Exception:
            del self.records[key]  # let the client retry a failed attempt
            raise
        self.records[key].update(status="done", result=result)
        return result


store = IdempotencyStore()
started: list[dict] = []


def start_run(payload: dict) -> dict:
    started.append(payload)
    return {"run_id": f"run-{len(started)}", "status": "queued"}


first = store.execute("k1", {"agent": "procurement", "input": "20 laptops"}, start_run)
retry = store.execute("k1", {"input": "20 laptops", "agent": "procurement"}, start_run)
assert first == retry == {"run_id": "run-1", "status": "queued"} and len(started) == 1

try:
    store.execute("k1", {"agent": "procurement", "input": "50 laptops"}, start_run)
    raise AssertionError("expected ValueError")
except ValueError:
    pass


def reentrant(payload: dict) -> dict:
    # A duplicate arrives while the first request is still running.
    try:
        store.execute("k2", payload, start_run)
        raise AssertionError("expected InProgressError")
    except InProgressError:
        pass
    return start_run(payload)


assert store.execute("k2", {"agent": "x"}, reentrant)["run_id"] == "run-2"


def flaky(payload: dict) -> dict:
    raise TimeoutError("downstream timed out")


try:
    store.execute("k3", {"agent": "y"}, flaky)
except TimeoutError:
    pass
assert "k3" not in store.records  # a failed attempt can be retried
assert store.execute("k3", {"agent": "y"}, start_run)["run_id"] == "run-3"
```

Complexity: O(size of payload) to fingerprint, O(1) for the store.

#### Follow-ups

- **How long do you keep keys?** Longer than any client retry window, often 24 hours, with a TTL.
- **Which status codes?** The IETF Idempotency-Key header draft (draft-07, still a draft, not an RFC) says 409 while the
  original is still processing, 422 when a key is reused with a different payload, and 400 when a required key is
  missing.
- **What if the process crashes mid-work?** The `in_progress` record needs an expiry (a lease), after which a retry may
  claim the key again; the work itself must then be idempotent too.

### Decide when to page on SLO burn rate {easy}

Your SLO is 99.9% of streams completing successfully over 30 days. Write `burn_rate(errors, total, slo)` and
`should_page(long_window, short_window, slo, threshold=14.4)`, where each window is `(errors, total)`. Page only when
**both** the 1-hour and the 5-minute windows burn faster than the threshold, which is the multi-window rule from Google's
SRE workbook: a burn rate of 14.4 for an hour spends 2% of a 30-day error budget.

#### Hints

1. The error budget is `1 - slo` (0.1% here). Burn rate is the observed error rate divided by that budget.
2. A burn rate of 1 spends the budget exactly over the full 30 days.
3. The short window stops paging soon after the problem is fixed; the long window stops a brief spike from paging.

#### Solution

Alerting on burn rate instead of raw error counts ties pages to user impact: a 2% error rate is a disaster for a 99.9%
SLO and noise for a 90% one.

```python
def burn_rate(errors: int, total: int, slo: float) -> float:
    if total == 0:
        return 0.0
    return (errors / total) / (1 - slo)


def should_page(long_window: tuple[int, int], short_window: tuple[int, int], slo: float, threshold: float = 14.4) -> bool:
    return burn_rate(*long_window, slo) > threshold and burn_rate(*short_window, slo) > threshold


SLO = 0.999
assert round(burn_rate(1, 1000, SLO), 6) == 1.0  # exactly on budget
assert round(burn_rate(20, 1000, SLO), 6) == 20.0
assert burn_rate(0, 0, SLO) == 0.0
assert round(14.4 * (1 - SLO) * 100, 2) == 1.44  # 1.44% errors sustained for an hour pages

assert should_page((300, 10_000), (40, 800), SLO)  # 3% and 5%: page
assert not should_page((300, 10_000), (0, 800), SLO)  # already recovered: no page
assert not should_page((50, 10_000), (40, 800), SLO)  # brief spike, the hour is fine: no page
assert round(1 / 30 / 24 * 14.4, 3) == 0.02  # an hour at 14.4x spends 2% of a 30-day budget
```

Complexity: O(1).

#### Follow-ups

- **What other windows does the workbook suggest?** A slower page at a burn rate of 6 over 6 hours (with a 30-minute
  short window) and a ticket at a burn rate of 1 over 3 days (with a 6-hour short window).
- **Which SLIs would you pick for this platform?** Time to first token, stream completion rate, run success rate and
  dashboard freshness.
