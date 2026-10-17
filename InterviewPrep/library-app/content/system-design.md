---
title: "System design: framework and building blocks"
goal: Run the design round with a clear framework, size a system with quick numbers, pick building blocks with their trade-offs, and handle the cross-cutting concerns most designs need (real-time paths, idempotency, multi-tenancy, regulated data, reliability and cost).
minutes: 65
---

For a senior full-stack or AI engineer, the technical round often includes "design X" or "how would this scale?".
Interviewers are not looking for one correct diagram. They score whether you clarify requirements, make decisions from
numbers, name trade-offs out loud, and go deep on the hard part: usually the bottleneck, the real-time path, or what
happens when a dependency fails.

This chapter is the toolkit: the framework, estimates, building blocks, and the questions that come up in any design.
Two chapters apply it end to end: [worked designs for agent platforms](#/design-cases) (a streaming agent chat, an
orchestrator, a live dashboard, an SAP integration hub, multi-tenant RBAC) and
[worked designs for healthcare AI](#/design-cases-healthcare) (a Document AI pipeline, a readmission-risk service, a
claims-status API, a RAG assistant over clinical policies).

Anchor your answers in what you have built: the GCP Document AI platform with human-in-the-loop review on Cloud Run,
healthcare REST APIs at 99.99% uptime at Cognizant, the monolith-to-microservices migration on Azure, and AKS
deployments at The Dot Corp.

## A framework for the interview

Use the same steps every time and say them out loud, so the interviewer can follow and steer.

| Step | Time (of 45 min) | What you do |
|---|---|---|
| 1. Requirements | 5 min | Functional: what users do. Non-functional: scale, latency, availability, consistency, security, compliance, cost. Ask, do not assume. |
| 2. Estimates | 3 min | Requests or events per second (average and peak), concurrent connections, storage per year, and the expensive resource: LLM tokens, GPUs, human reviewers, a partner API's rate limit. |
| 3. API | 4 min | The main endpoints, streams and events, with request and response shapes. Sync, async or streaming? |
| 4. Data model | 4 min | Main entities, keys, access patterns, and which store fits each. |
| 5. High-level design | 10 min | Boxes and arrows for the main flow, end to end. Simple first. |
| 6. Deep dives | 15 min | Two or three hard parts: the bottleneck, failure handling, security, the streaming path, the ML piece. |
| 7. Wrap-up | 4 min | What you chose and why, what changes at 10× scale, how you would monitor it. |

Two habits that score well: draw the simple version before optimising, and when you make a choice, say what you gave
up ("SSE instead of WebSockets: simpler and works through every proxy, but client-to-server messages go over normal
POSTs").

## Requirements worth asking about

- **Users and tenancy:** internal employees only, or many customers? Which identity providers (SAML, OIDC)? Which roles
  exist (viewer, operator, approver, admin)?
- **Scale:** requests per second, concurrent users or connections at peak, data growth per year. For long-running work,
  how long does one job last: seconds, minutes, or days while it waits for a human?
- **Latency:** the p95 target, or for AI products the time to first token and how much overhead the platform may add.
- **Durability and audit:** what must be kept, for how long, and who must be able to prove what happened?
- **Side effects:** does the system only read and answer, or does it act on real systems (submit a claim, create a
  purchase order, run Terraform)? Acting on real systems raises the bar for idempotency, approvals and audit.
- **Compliance:** personal or health data (HIPAA, GDPR), data residency, which cloud services are allowed.
- **Availability and regions:** the SLO, single region or multi-region.
- **Cost:** what dominates (LLM tokens, GPUs, egress, storage) and whether there is a budget per tenant.

## Back-of-envelope estimates

Numbers turn opinions into decisions. A quick calculation often shows that the real bottleneck is not the servers.

**A streaming chat at 100,000 open connections.** It shows two things: you must batch tokens, and you must not write
every token to the database.

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

So: coalesce tokens on the server, keep the hot event stream in a fast log with short retention (Redis Streams, sharded
by run), persist one final message per run to PostgreSQL, and plan for hundreds of gateway instances. The connections
are cheap; the LLM calls behind them are the real cost.

**A document-processing pipeline with human review.** Here the limit is people, not machines.

```python
docs_per_day = 20_000
pages_per_doc = 4
mb_per_page = 0.3
review_rate = 0.15          # share of documents that fail validation or have low confidence
minutes_per_review = 3
reviewer_hours_per_day = 8
peak_factor = 5             # uploads cluster in business hours

avg_docs_per_sec = docs_per_day / 86_400
peak_docs_per_sec = avg_docs_per_sec * peak_factor
storage_tb_per_year = docs_per_day * pages_per_doc * mb_per_page * 365 / 1_000_000
review_hours = docs_per_day * review_rate * minutes_per_review / 60
reviewers_needed = review_hours / reviewer_hours_per_day

assert round(avg_docs_per_sec, 2) == 0.23 and round(peak_docs_per_sec, 1) == 1.2
assert round(storage_tb_per_year, 2) == 8.76
assert round(review_hours) == 150 and round(reviewers_needed) == 19

# Cutting the review rate from 15% to 8% saves about 9 reviewers: the human queue is the bottleneck,
# so investing in extraction quality and validation beats adding servers.
assert round(reviewers_needed - docs_per_day * 0.08 * minutes_per_review / 60 / reviewer_hours_per_day) == 9
```

About one document per second at peak is easy for any stateless service; the design effort belongs in extraction
quality, the review queue and reliable integration.

## Building blocks

| Block | Use it for | Trade-off to mention |
|---|---|---|
| Load balancer / API gateway (+ WAF such as Cloud Armor) | Spread traffic, TLS termination, auth, rate limits, routing, one global IP across regions | Another hop that must itself be highly available; timeouts must suit long-lived streams |
| Stateless service (Cloud Run, GKE, AKS, ECS) | Scale horizontally; any instance serves any request | State must live elsewhere: database, cache, log or object storage |
| Relational database (PostgreSQL / Cloud SQL, SQL Server) | System of record: transactions, constraints, joins, reporting, `SKIP LOCKED` work queues | Write scaling needs partitioning or sharding; plan connection pools with many instances |
| Document / key-value store (Firestore, DynamoDB, MongoDB) | Flexible schemas, key-based access at huge scale, real-time listeners (Firestore) | Queries must follow indexes and access patterns; weaker joins and ad-hoc reporting |
| Cache and fast data (Redis / Memorystore) | Hot reads, sessions, rate-limit counters, pub/sub fan-out, short-lived event logs (Streams) | Memory-bound; replication is asynchronous, so a failover can lose recent writes; never the only copy |
| Queue / log (Pub/Sub, SQS, Service Bus, Kafka) | Decouple producers and consumers, fan out events, absorb spikes, retries | At-least-once delivery, so consumers must be idempotent; ordering only per key |
| Rate-controlled dispatch (Cloud Tasks) | Call an HTTP handler at a controlled rate, schedule work for later | Per-task model, not a broadcast bus |
| Workflow engine (Temporal, Cloud Workflows) or a state machine in PostgreSQL | Long-running, multi-step jobs that must survive crashes and wait for humans | Engine: powerful but new infrastructure; DIY: simple, but you own retries and timers |
| Object storage (Cloud Storage, S3, Blob) | Documents, images, model artefacts, exports; signed URLs for direct upload and download | Not a database: no queries, no transactions across objects |
| Search / vector index | Full-text, hybrid and semantic retrieval | Another copy of the data to keep in sync and secure |
| Workers / batch jobs | OCR, ML inference, ETL, report generation, agent runs | Need job status, retries and dead-letter handling |
| Analytics warehouse (BigQuery) | Analytics over events, costs and telemetry | Not for low-latency serving |
| Observability (logs, metrics, traces, OpenTelemetry) | Debugging, alerts, SLOs, audit | Log volume costs money; keep secrets and personal data out |

## Choosing a data store

| Need | Good fit | Why |
|---|---|---|
| Core business records: users, tenants, orders, claims, runs, approvals, billing | PostgreSQL | Transactions, constraints, joins, reporting |
| Live state many browsers watch (status, progress) | Firestore, or Redis plus your own push | Firestore listeners push changes to clients; Redis pub/sub feeds your WebSocket or SSE gateway |
| Hot stream of recent events for resume | Redis Streams | Append-only log with ids, fast reads from an id, trimming by length |
| Caches, sessions, rate limits | Redis | Sub-millisecond reads, TTLs, atomic counters |
| Key-value access at very high scale with simple, known queries | DynamoDB, Firestore, Bigtable | Predictable latency at any scale; design around access patterns |
| Large blobs (documents, model outputs, exports) | Object storage | Cheap and durable; keep only the path in the database |
| Analytics and cost reports | A columnar warehouse such as BigQuery | Scans over billions of rows |

The usual answer is "a relational system of record, plus specialised stores for the hot paths". Say why each extra store
earns its place, because every store is another thing to secure, back up and keep consistent.

## Delivery guarantees and idempotency

Almost every queue, webhook and retry gives **at-least-once** delivery: a message can arrive twice or out of order. So:

- **Make consumers idempotent:** key the work by a business id (claim id, run id + step id), and upsert with a version
  so an old or duplicate message cannot overwrite newer state.
- **Use idempotency keys** on POST endpoints, and pass your own key to external APIs that support one.
- **Publish events reliably with an outbox:** write the state change and an `outbox` row in one transaction; a relay
  publishes outbox rows to the bus. You never get "saved but not published" or "published but not saved".
- **Order only where it matters:** an ordering key (for example the run or claim id) or a sequence number per entity,
  and consumers that detect gaps.
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

- **Decouple the connection from the work.** The job runs in a worker and appends events to a log. The gateway that
  holds the browser connection only reads that log. A dropped connection does not kill the work, and any gateway
  instance can serve any job, so you do not need sticky sessions.
- **Resume, do not restart.** Every event has a sequence id. A reconnecting client sends the last id it saw
  (`Last-Event-ID` for SSE, a resume message for WebSockets) and the gateway replays from the log.
- **Plan for forced reconnects.** Cloud Run treats each stream as a request, and the request timeout is at most 60
  minutes (default 5), so long sessions must reconnect anyway. Make reconnect invisible.
- **Fan out through a shared bus.** With many instances, an event produced on one must reach clients on the others:
  Redis pub/sub on Memorystore, Pub/Sub, or Firestore listeners. Google's Cloud Run WebSocket guide recommends
  Memorystore for Redis or Firestore for sharing state between instances.
- **Handle slow consumers.** Coalesce small updates, cap per-connection buffers, drop or summarise intermediate states
  (progress 41%, 42%… only the latest matters), and disconnect clients that fall too far behind so they resync.

The real-time chapters go deeper: [SSE](#/sse), [WebSockets](#/websockets) and [gRPC](#/grpc).

## Multi-tenancy and access control

Put the tenant id and user id in the session, enforce them in middleware for every request **and every stream
subscription**, and add a second line of defence in the data layer (a mandatory tenant filter or PostgreSQL row-level
security). Map identity-provider groups to roles per tenant. Anything that acts **on behalf of** a user, an AI agent
included, must never have more permission than that user. Rate-limit and budget per tenant so one customer cannot use
all the capacity. The [RBAC design](#/design-cases) goes deeper, and [Enterprise identity](#/auth-identity) covers SAML
and OIDC.

## Regulated and sensitive data

Healthcare is the strictest common case; raise these early whenever a design touches personal or health data.

- **PHI protection:** encryption in transit (TLS) and at rest (managed keys), least-privilege and role-based access, and
  the minimum necessary data in every service, log and prompt.
- **Audit:** who viewed or changed which record and when, in an append-only audit log, kept for the required retention.
- **BAAs:** every cloud service and vendor that touches PHI must be covered by a business associate agreement and be
  HIPAA-eligible. LLM providers included.
- **Integration:** HL7 v2 feeds, FHIR APIs, X12 EDI through clearinghouses, SFTP batch files and legacy SOAP services are
  normal. Design adapters, and expect partner systems to be slow or down.
- **Humans in the loop:** clinical, eligibility and other high-impact decisions need review paths, explanations and
  override records.
- **Environments:** de-identified or synthetic data in non-production; promotion through Dev, SIT, UAT and production.

More in [HIPAA, PHI and security engineering](#/hipaa).

## Reliability, SLOs and cost

- **Timeouts on every call**, retries only for transient errors with exponential backoff and jitter, circuit breakers
  around flaky dependencies (LLM providers, partner and enterprise APIs), and bulkheads so one slow dependency cannot
  exhaust every worker.
- **Load shedding:** when overloaded, reject new work early with 429 or 503 and `Retry-After` rather than slowing
  everyone down.
- **SLIs that users feel:** request latency and success rate; for streaming AI products, time to first token, stream
  completion rate (streams that end with `done`, not an error), run success rate, approval latency, dashboard freshness.
- **Cost:** LLM tokens first where they exist (cache, route simple requests to smaller models, cap steps per run); then
  always-on instances (an open WebSocket keeps a Cloud Run instance active and billed), min instances, cross-region
  egress, and log volume.

## A reference architecture: streaming agent platform on GCP

A composition of the blocks above that many AI-product designs start from. The worked designs show how to arrive at it
from requirements.

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
an internal tool for 200 operators and a public API at 50,000 requests a second are different systems.

Throughout, I name the trade-off with each choice ("PostgreSQL over DynamoDB, because approvals and audit need
transactions and ad-hoc reporting"), raise compliance early when the data is sensitive, and keep coming back to failure:
what happens when the model, the network or a partner API is slow or down.

### What do you clarify first when asked to design a system? {core}

Who the users and tenants are and how they sign in; the scale at peak (requests, concurrent connections, how long a job
runs); the latency target; whether the system only answers or also acts on real systems; what must be kept for audit;
any compliance rules for the data; and the availability, region and cost constraints. The "does it act on real systems"
question changes the most: once a workflow or an AI agent can submit a claim or create a purchase order, idempotency,
approvals and audit become the core of the design.

### How would you estimate capacity for 100,000 concurrent streaming chats? {core}

Split connections from work. Of 100,000 open streams, maybe 30% are generating at any moment: 30,000 active streams at
about 40 tokens a second is 1.2 million tokens a second. Sending one event per token is too chatty, so the gateway
coalesces every 100 ms, which gives about 300,000 events a second and roughly 600 Mbit/s of egress. At 250 streams per
Cloud Run instance that is about 400 instances. Runs finishing at around 1,500 a second means 1,500 final message writes a
second, which PostgreSQL handles, while writing every token would not.

Then state the conclusion: the expensive part is the LLM calls and the event fan-out, not the connections. The numbers
are assumptions, so say them out loud and invite the interviewer to change them. The same habit finds non-technical
bottlenecks: in a document pipeline with human review, the reviewer queue limits throughput long before the servers do.

### SSE, WebSockets, gRPC streaming or polling: how do you choose? {core}

By direction and by who the client is. For streaming model output or progress to a browser, I default to SSE: it is
plain HTTP, works through proxies and load balancers, reconnects with `Last-Event-ID`, and the client's messages (send,
cancel, approve) go over normal POSTs. I choose WebSockets when the client sends frequent messages on the same channel,
such as interactive control of a running job, collaboration or presence. gRPC streaming fits service-to-service streams
with typed contracts; browsers need gRPC-Web or Connect for it. Polling is fine for rare updates.

The deeper point: the transport matters less than decoupling the connection from the work and making resume work. See
[SSE](#/sse), [WebSockets](#/websockets) and [gRPC](#/grpc).

### How do you scale WebSocket or SSE connections across many instances?

Keep the gateway stateless about the work: the job writes events to a shared log or bus, and whichever gateway instance
holds the user's connection subscribes to that job's events. With Redis pub/sub or Streams on Memorystore (or Pub/Sub,
or Firestore listeners), an event produced anywhere reaches clients on every instance, so I do not depend on sticky
sessions; Cloud Run's session affinity is best effort anyway. Each connection is authorised when it subscribes, the
client resumes from its last event id after a reconnect, and instances are sized for many idle connections: Cloud Run's
default is 80 concurrent requests per instance, so a stream gateway raises it, up to the maximum of 1,000.

Follow-up to expect: "what about the 60-minute request timeout?" Clients reconnect and resume, so a forced disconnect
looks like a short pause, not a lost conversation.

### SQL, NoSQL or a cache: how do you choose a data store? {core}

Start from the access patterns and consistency needs. A relational database is my default system of record for anything
with relationships, transactions and reporting: users, tenants, claims, orders, runs, approvals, audit. PostgreSQL scales
a long way with indexes, read replicas and partitioning. I choose a document or key-value store when access is by key at
very high scale with simple, known queries, when the schema is truly variable, or for per-document state that many
clients watch in real time (Firestore listeners), accepting weaker joins and reporting. Redis is for hot, short-lived or
derived data: caches, sessions, rate-limit counters, pub/sub fan-out and short-retention event logs; it is never the
only copy of anything important. Many systems use all three.

**Your angle:** you managed and optimised PostgreSQL at Medidata and used Firestore on GCP. Redis is not on your resume,
so describe how you would use it and keep claims to design, not production history.

### How do you use caching, and how do you keep it correct?

I cache data that is read far more than written and tolerates brief staleness, usually with **cache-aside**: read the
cache, on a miss read the database and fill the cache with a TTL. **Write-through** updates the cache on every write
(fresher, slower writes); **write-behind** writes the cache first and the database later (fast, but can lose data).
Correctness comes from short TTLs, invalidating or updating keys when change events arrive, versioned keys, and stampede
protection: one request rebuilds a missing key while others wait or get the stale value.

Two caveats interviewers like: scope every key by tenant (and by user where results depend on permissions), so one
user's cached response can never be served to another; and cached personal data is still personal data, so encrypt it
and give it a short TTL.

### Why put a queue between services, and what delivery guarantees do you get? {core}

A queue decouples producers from consumers: it absorbs spikes, lets workers scale and fail independently, and makes
retries natural. Most queues, Pub/Sub, SQS and Service Bus included, give **at-least-once** delivery, so a message can
arrive twice or out of order. Consumers must be idempotent (deduplicate by a business id, upsert by version), and
messages that keep failing go to a dead-letter queue with alerting. Ordering is only guaranteed per key or partition, so
I choose the key deliberately, usually the entity id such as the claim or run id.

### How do you get exactly-once effects? {deep}

You cannot get exactly-once delivery across a network, so you build exactly-once **effects** from at-least-once delivery
plus idempotency. For your own state: process each message inside a transaction that also records the message id or step
id as done, so a duplicate is a no-op. For events: the transactional outbox, so state and the event to publish commit
together. For external systems: pass an idempotency key if the API supports one, otherwise write a correlation id into
the external record and check for it before creating, plus a reconciliation job that compares both sides.

### Explain CAP and PACELC. {deep}

During a network partition a distributed system must choose between **consistency** (every read sees the latest write)
and **availability** (every request gets an answer); you cannot have both while the partition lasts. PACELC adds that
**else**, without a partition, you still trade **latency** against consistency. I decide per operation: an eligibility
check, a payment or approving a purchase order needs strong consistency, while a dashboard counter or a "typing…"
indicator can be eventually consistent. Many databases let you tune this, for example with quorum reads and writes.

### How do you scale a relational database?

In order of effort: fix queries and add the right indexes; pool connections (many Cloud Run instances × pool size can
exhaust the database's connection limit, so keep pools small or use a pooler); cache hot reads; add read replicas for
read-heavy traffic and accept replication lag; partition big tables by date or key, such as append-only event tables by
time; archive old data; scale the instance up; and only then shard writes by a key such as tenant or member id, which
complicates cross-shard queries and transactions. Reporting moves to a warehouse instead of running on the primary.

**Your angle:** at Medidata you managed and optimised PostgreSQL databases, writing efficient queries and improving data
access for clinical-trial workflows. Use it to show the order you work in: measure, fix queries and indexes, and only then
re-architect.

### How do you design for reliability? {core}

Assume every dependency fails. Timeouts on every call; retries only for transient errors, with exponential backoff and
jitter, and only for idempotent operations; circuit breakers so a failing partner API or LLM provider is not hammered;
bulkheads so one slow dependency cannot use up every worker; graceful degradation (serve cached data, queue the action
and show a clear status, fall back to another model); dead-letter queues; deployments across zones with health checks
and canary releases; and SLOs with alerts on error-budget burn. Then test it with failover drills.

**Your angle:** at Cognizant you delivered mission-critical healthcare REST APIs at 99.99% uptime, and at The Dot Corp
you assisted with production support and investigation of OrderingStore disruptions during an Azure regional outage.

### Producers are faster than consumers. What do you do? {deep}

That is backpressure, and the answer depends on whether intermediate data matters. For token or event streams, a log
between the producer and the gateway absorbs bursts, and each connection reads at its own pace; if a client falls too
far behind, disconnect it and let it resume from its last id. For progress and status updates, only the latest value
matters, so coalesce and drop intermediate states. For work queues, the queue grows and autoscaling adds workers, with a
cap so you do not overload a downstream API; beyond that, shed load at the edge with 429 and `Retry-After`.

### Monolith or microservices? {core}

Start with a well-structured modular monolith unless there is a clear reason not to: it is simpler to build, test, deploy
and debug. Split out services when teams need to deploy independently, parts have very different scaling needs (a
stream gateway holding 100,000 idle connections versus workers burning CPU and LLM tokens), or a boundary is stable and
clear. The cost is real: network failures, distributed data and transactions, tracing and more operations. Migrate with
the strangler-fig pattern, routing one capability at a time to a new service.

**Your angle:** at Cognizant you spearheaded the migration of monolithic applications to cloud-based microservices on
Azure, which significantly reduced infrastructure costs, and at The Dot Corp you modernised FedEx SOAP integrations to
REST across about 24 OrderingStore applications plus 10 more.

### How do you handle long-running work behind an API? {core}

Never hold a request open while the work runs. Validate, create a job record, enqueue the work, and return **202
Accepted** with the job id and a status URL. Google's API guidelines (AIP-151) express the same idea as a long-running
operation: the call returns an Operation resource that the client polls until it is done. Clients follow progress by
polling the status resource, by a webhook, or by subscribing to the job's event stream. Workers process idempotently,
update the job's state, and send failures to a dead-letter queue. OCR, ML batch scoring, report generation and agent runs
all fit; a run that waits hours for a human approval simply sits in an "awaiting approval" state without holding a worker.

### How do you design observability and SLOs?

Three signals: structured **logs** with a trace id and business id (run, claim, request) on every line and no personal
data; **metrics** (rate, errors, duration per endpoint, queue depth, saturation, open connections, tokens and cost per
tenant); and distributed **traces** with OpenTelemetry that follow one request from the browser through every service.
SLOs are what users feel: "99.9% of claim lookups succeed in under 300 ms over 30 days", or for a streaming product "95%
of runs show the first token within 2 seconds" and "99.5% of streams end with a done event, not an error". Alert on
error-budget burn rate, not on every spike. Keep a separate, append-only **audit log** for data access and approvals; it
is a compliance record, not a debugging log.

### How do you design a multi-tenant system? {deep}

Pick the isolation level per need: a shared database with a tenant id on every row (cheapest; enforce it in a data-access
layer and with PostgreSQL row-level security), a schema or database per tenant (stronger isolation, per-tenant backups
and keys, more operations), or separate deployments for tenants with strict contractual or regulatory needs. Tenant
context comes from the session and is enforced in middleware, on every stream subscription and on every background or
agent action. Configuration per tenant lives in data, not in code branches, and per-tenant quotas stop noisy neighbours.

**Your angle:** at The Dot Corp you investigated and enhanced the React-based LINE multi-tenant platform, an initiative to
consolidate customer-specific OrderingStore implementations into one centralised architecture.

### How do you design rate limiting?

Limit per client identity (API key, OAuth client, tenant or user) at the edge, with a **token bucket** (allows short
bursts up to a capacity, refills at a steady rate) or a **sliding window** counter. Keep the counters in a shared store
like Redis so every instance sees the same counts, return **429** with `Retry-After`, and set different tiers per
partner. Limit what costs money, not just requests: for an LLM platform, a token bucket whose cost per request is the
estimated tokens, so one huge prompt counts more than ten small ones. Add separate limits towards each external
dependency (a provider's quota, a partner API's rate limit) with a rate-controlled queue such as Cloud Tasks, and daily
budgets per tenant so a runaway agent loop does not become a surprise bill.

### How do you plan for disaster recovery? {deep}

Start from the business targets: **RTO** (how long you can be down) and **RPO** (how much data you can lose). Then choose:
backups with tested restores (cheap, slow), a warm standby in a second region with replicated databases and storage, or
active-active behind a global load balancer (fastest recovery, most complex and costly). Keep infrastructure as code so
the environment can be rebuilt, and run failover drills, because an untested plan is not a plan. Streaming clients that
already reconnect and resume make a regional failover look like one long reconnect.

**Your angle:** at The Dot Corp you assisted with production support and investigation of OrderingStore service
disruptions during an Azure regional outage: a concrete example of why multi-region design and runbooks matter.

### How do you keep cloud costs under control?

Measure first: cost per tenant, per feature and per request. Where LLMs are involved, tokens dominate, so cache repeated
work, route simple requests to cheaper models, cap steps, tool calls and budget per run, and stop runaway loops. On the
platform side: scale to zero for bursty services (but an open WebSocket keeps a Cloud Run instance billed, so size the
stream gateway for many connections per instance), use min instances only where cold starts hurt, avoid cross-region
egress, move cold data to cheaper storage, and sample or filter logs, which are a surprisingly large bill at high event
rates.

### How do you make a design HIPAA-compliant? {core}

HIPAA is a set of safeguards, not a product, so I build them into the design: encryption in transit and at rest;
authentication with SSO and MFA, and role-based, least-privilege access; the minimum necessary data in every service;
append-only audit logs of PHI access; only HIPAA-eligible cloud services covered by a BAA; PHI kept out of logs, error
messages, analytics and LLM prompts unless those are covered too; de-identified data in non-production; backups and
disaster recovery; and documented risk assessments. The Security Rule's technical safeguards (access control, audit
controls, integrity, authentication and transmission security) map directly onto those choices.

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

### Route keys to shards with consistent hashing {medium}

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

### Make a POST endpoint idempotent, including concurrent retries {medium core}

Clients retry when a request times out, so "submit claim" or "start agent run" can arrive twice. Write
`IdempotencyStore` with `execute(key, payload, work)`. The first call with a key runs `work` and stores the result. A
retry with the **same key and same payload** returns the stored result without running the work again. The **same key
with a different payload** raises `ValueError`. A retry that arrives while the first call is **still running** raises
`InProgressError` (an API would return 409 Conflict).

#### Hints

1. Store per key: a fingerprint of the payload, a status (`in_progress` or `done`) and the result.
2. A stable fingerprint is a hash of the JSON with sorted keys.
3. Record `in_progress` before calling `work`, and remove the record if `work` fails so the client can retry.

#### Solution

Idempotency keys are how payment, healthcare and other APIs make retries safe. Store the payload's fingerprint with the
response: an identical retry gets the original response, and a key reused for a different request is rejected, because
silently returning the old response would hide a client bug. Saving the key **before** doing the work closes the race
where two identical requests both see "no key" and both run. In a real service the claim is an `INSERT` into a table
with a unique constraint on the key (or Redis `SET NX` with a TTL), so only one request wins.

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

- **How long do you keep keys?** Longer than any client retry window, often 24 hours, with a TTL so the store does not
  grow forever.
- **Which status codes?** The IETF Idempotency-Key header draft (draft-07, still a draft, not an RFC) says 409 while the
  original is still processing, 422 when a key is reused with a different payload, and 400 when a required key is
  missing.
- **What if the process crashes mid-work?** The `in_progress` record needs an expiry (a lease), after which a retry may
  claim the key again; the work itself must then be idempotent too.

### Decide when to page on SLO burn rate {easy}

Your SLO is 99.9% of requests (or streams) completing successfully over 30 days. Write `burn_rate(errors, total, slo)`
and `should_page(long_window, short_window, slo, threshold=14.4)`, where each window is `(errors, total)`. Page only when
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
- **Which SLIs would you pick for a streaming AI product?** Time to first token, stream completion rate, run success rate
  and dashboard freshness.
