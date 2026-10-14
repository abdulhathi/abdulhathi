---
title: System design for healthcare AI
goal: Run a system design discussion with a clear framework, use the standard building blocks with their trade-offs, and walk through four healthcare designs, including your own Document AI pipeline.
minutes: 55
---

For a senior full-stack or AI engineer, the technical round often includes "design X" or "how would you scale this?".
Interviewers are not looking for one correct diagram. They want to see you clarify requirements, make numbers-based
decisions, name trade-offs, and handle the constraints that make healthcare different: PHI, auditability, integration
with old systems, and humans in the loop.

Your strongest move is to anchor designs in what you have built: the LDH Medicaid Document AI platform on GCP,
healthcare REST APIs with 99.99% uptime at Cognizant, the monolith-to-microservices migration on Azure, and AKS and
Cloud Run deployments.

## A framework for the interview

Use the same steps every time and say them out loud, so the interviewer can follow and steer.

| Step | Time (of 45 min) | What you do |
|---|---|---|
| 1. Requirements | 5 min | Functional: what users do. Non-functional: scale, latency, availability, consistency, compliance. Ask, do not assume. |
| 2. Estimates | 3 min | Requests per second (average and peak), data size per year, the expensive resource (GPU, reviewers, a partner API). |
| 3. API | 4 min | The main endpoints or events, with request and response shapes. Sync or async? |
| 4. Data model | 4 min | Main entities, keys, access patterns, which store fits each. |
| 5. High-level design | 10 min | Boxes and arrows for the main flow, end to end. Keep it simple first. |
| 6. Deep dives | 15 min | Two or three hard parts: the bottleneck, failure handling, security, the ML piece. |
| 7. Trade-offs and wrap-up | 4 min | What you chose and why, what you would change at 10× scale, how you would monitor it. |

## Building blocks

| Block | Use it for | Trade-off to mention |
|---|---|---|
| Load balancer / API gateway | Spread traffic, TLS termination, auth, rate limits, routing | Another hop; must itself be highly available |
| Stateless service | Scale horizontally behind the balancer (containers on AKS, Cloud Run, ECS) | State must live elsewhere (DB, cache, object storage) |
| Relational DB (PostgreSQL, SQL Server) | Transactions, joins, constraints, reporting | Write scaling needs partitioning or sharding |
| Document / key-value store (MongoDB, DynamoDB, Firestore) | Flexible schemas, huge key-based scale | Weaker joins and ad-hoc queries; design around access patterns |
| Cache (Redis) | Hot reads, sessions, rate-limit counters | Staleness and invalidation; never the only copy of the data |
| Queue / log (SQS, Pub/Sub, Service Bus, Kafka) | Decouple producers and consumers, absorb spikes, retries | At-least-once delivery, so consumers must be idempotent |
| Object storage (GCS, S3, Blob) | Documents, images, model artefacts, data lake | Not a database; use signed URLs for controlled access |
| Search / vector index | Full-text, hybrid and semantic retrieval | Another copy of the data to keep in sync and secure |
| Workers / batch jobs | OCR, ML inference, ETL, report generation | Need job status, retries and dead-letter handling |
| Observability | Logs, metrics, traces, audit logs, alerts | PHI must not leak into logs |

## Healthcare constraints to raise in every design

- **PHI protection:** encryption in transit (TLS) and at rest (managed keys), least-privilege access, role-based access,
  and the minimum necessary data in every service, log and prompt.
- **Audit:** who viewed or changed which record and when, in an append-only audit log, kept for the required retention.
- **BAAs:** every cloud service and vendor that touches PHI must be covered by a business associate agreement and be
  HIPAA-eligible.
- **Integration:** HL7 v2 feeds, FHIR APIs, X12 EDI through clearinghouses, SFTP batch files and legacy SOAP services
  are normal. Design adapters and expect partner systems to be slow or down.
- **Humans in the loop:** clinical and eligibility decisions need review paths, explanations and override records.
- **Environments:** de-identified or synthetic data in non-production; promotion through Dev, SIT, UAT and production.

## Back-of-envelope estimates

Numbers turn opinions into decisions. A quick calculation often shows the real bottleneck is not the servers.

```python
# A Medicaid document-processing pipeline: what actually limits it?
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

## Worked design 1: Document AI pipeline with human review

**Requirements.** Caseworkers or applicants upload documents (Medicaid application forms, paystubs). The system
classifies each document, extracts fields, validates them, sends uncertain items to human review, and submits approved
data to a downstream eligibility system. Non-functional: PHI-grade security, full audit trail, no lost documents,
throughput of about 20,000 documents a day, results within minutes for clean documents.

```text
 Browser (SSO / SAML)
     │  1. request upload URL                       6. review UI: document + extracted fields
     ▼                                                     ▲
 API service (FastAPI on Cloud Run) ──────────────► review queue (DB table: status, assignee, SLA)
     │  2. signed URL                                      ▲
     ▼                                                     │ 5. invalid or low confidence
 Object storage (encrypted bucket) ─3. upload event─► processing workers
                                                        │  OCR + layout → classify → extract
                                                        │  4. validate (Pydantic schema + business rules)
                                                        ▼
                                              valid & confident ──► submission service ──► downstream API
                                                                       (idempotent, retries, DLQ)
 Every step writes: status table (document state machine) + audit log
```

**Key decisions.**

- **Direct upload with signed URLs:** large files go straight to object storage, not through the API, and access is
  time-limited and scoped to one object.
- **Event-driven processing:** the storage event (or a queue message) triggers workers, so spikes queue up instead of
  timing out. Workers are stateless and autoscale.
- **A document state machine** (`uploaded → extracted → validated → in_review → approved → submitted`, plus `failed`)
  stored in the database: every transition is recorded, which gives the audit trail and makes reprocessing safe.
- **The validation gate:** Pydantic schemas enforce types and formats, business rules check cross-field logic, and a
  confidence threshold decides straight-through processing versus human review.
- **Human review UI:** shows the document image next to the extracted fields, highlights failing fields, records every
  correction (who, what, when). Corrections become labelled data for evaluation.
- **Submission:** idempotent calls with an idempotency key per document, retries with exponential backoff, and a
  dead-letter queue for items that keep failing, with alerting.

**Deep dives to offer.** Exactly-once effects with at-least-once events (idempotent workers keyed by document ID and
version); reprocessing when the extraction model changes; measuring straight-through rate and field-level accuracy;
security (SSO, role-based access to review queues, no PHI in logs).

**Your angle:** this is the LDH Medicaid Document AI platform you built at Quantiphi: an Angular SSR front end and a
Python/FastAPI backend on GCP, SAML authentication, GCS signed URLs for document rendering, Pydantic schema validation as
the quality gate on ML-extracted fields from MAGI and Non-MAGI forms and paystubs, human-in-the-loop review and editing,
external API submission, and Docker images deployed through Artifact Registry to Cloud Run across Dev, SIT and UAT.

## Worked design 2: Readmission-risk prediction service

**Requirements.** Predict each inpatient's risk of an unplanned readmission within 30 days of discharge, so care
managers can prioritise follow-up calls. Hospitals care because CMS's Hospital Readmissions Reduction Program reduces
payments for excess readmissions on selected conditions. Scores are needed daily for all current inpatients and on
demand at discharge, with the top contributing factors shown, and fair performance across patient groups.

```text
 EHR (FHIR API, HL7 ADT feed) + claims history
        │ ingestion (batch + ADT events)
        ▼
 data warehouse / lake ──► feature pipeline ──► feature store (offline for training, online for serving)
                                │                         │
                                ▼                         ▼
                      training pipeline            scoring service (FastAPI)
                      (patient-level, time-based      ├─ daily batch job: score all inpatients
                       validation; gradient boosting) └─ on discharge event: score one patient
                                │                         │
                                ▼                         ▼
                      model registry (MLflow) ──► risk scores + top factors ──► care-management worklist
                                                          │
                     monitoring: drift, calibration, outcomes 30 days later, subgroup performance ──► retrain
```

**Deep dives to offer.**

- **Label definition:** unplanned readmission within 30 days; exclude planned readmissions, transfers and deaths. A
  wrong label makes everything downstream wrong.
- **Leakage:** every feature must be available at prediction time. Nothing recorded after discharge, and split by
  patient and by time so the same patient never appears in both training and test data.
- **Features:** prior admissions in the last year, length of stay, diagnoses and comorbidity burden, abnormal labs,
  number of medications, discharge disposition, whether follow-up is scheduled.
- **Metric tied to capacity:** if care managers can call 50 patients a day, optimise precision among the top 50 and
  recall overall, report PR-AUC, and make sure the probabilities are calibrated.
- **Explainability and fairness:** per-patient top factors (for example SHAP values) on the worklist; check
  sensitivity and calibration per age, sex, race and payer group.
- **Training–serving consistency:** the same feature code for training and serving (a feature store or shared
  library), versioned with the model.

## Worked design 3: Claims status API at scale

**Requirements.** Providers and partner portals look up claim status by claim number, or list a member's claims in a
date range. Read-heavy: say 50 million lookups a day, about 580 requests per second on average and perhaps 1,700 at
peak. p95 latency under 300 ms, 99.9% or better availability. Status changes come from the adjudication system. Partners
also send X12 276 claim status inquiries through a clearinghouse and expect 277 responses.

```text
 partners / portal ──► API gateway (OAuth2 client credentials, per-partner rate limits, WAF)
                            │
                            ▼
                 claims status service (stateless, autoscaled, multi-zone)
                    │ cache-aside (Redis, short TTL)
                    ▼
              read model: claim_status table (denormalised, indexed by claim_id and member_id + date)
                    ▲            on read replicas
                    │ projector (idempotent upserts by claim_id + version)
 adjudication system ──► status-change events (Kafka / Service Bus) ──► also invalidates cache keys
 clearinghouse X12 276 ──► EDI translator ──► same service ──► X12 277 response
 every lookup ──► audit log (who accessed which member's claim)
```

**Key decisions.** Separate the read model from the system of record (CQRS), so heavy reads never load the
adjudication system; update it from events and make the projector idempotent with version checks, so out-of-order or
duplicate events are harmless; cache hot claims briefly and invalidate on change; use cursor pagination for claim
lists; enforce that a partner sees only claims for its own providers; and audit every PHI access.

**Your angle:** at Cognizant you delivered mission-critical healthcare REST APIs in C# and .NET Core with 99.99% uptime,
and integrated Availity multi-payer appeals with Molina Healthcare: real experience of partner integration, uptime and
claims workflows.

## Worked design 4: RAG assistant over clinical policy documents

**Requirements.** Utilisation-management nurses ask questions about medical policies and coverage criteria ("What are
the criteria for outpatient MRI of the lumbar spine?") and get answers with citations, using only the version in effect
for the member's plan and state. Answers in a few seconds. Refuse rather than guess.

```text
 policy PDFs (document management) ──► parse (layout, tables) ──► structure-aware chunks
        ──► embed ──► hybrid index (vectors + BM25) with metadata: plan, state, line of business,
                       effective_from / effective_to, version, access labels

 nurse ──► API (SSO) ──► redact PHI from the question ──► rewrite query
       ──► hybrid search filtered by plan, state, date and access ──► rerank top 50 → 5
       ──► prompt with numbered sources ──► LLM (under BAA) ──► verify citations ──► stream answer
       ──► feedback buttons ──► evaluation set; traces (no PHI) ──► dashboards
```

**Deep dives to offer.** Versioning (filter on effective dates so retired criteria never appear); tables of criteria
kept intact as chunks; evaluation with a nurse-labelled question set (recall@k for retrieval, faithfulness for
answers); "not found in policy" as a valid answer; guardrails against off-topic and injected instructions; cost control
with caching of common questions per plan and version.

## Interview questions

### How do you approach a system design interview? {core}

I follow a fixed structure and say it out loud: clarify functional and non-functional requirements, do quick estimates,
sketch the API and data model, draw a simple end-to-end design, then go deep on the two or three hardest parts and
finish with trade-offs and monitoring. I ask questions before drawing anything, because the requirements decide the
design: a 100-user internal tool and a 50,000-request-per-second public API are different systems.

Throughout, I name trade-offs explicitly ("I am choosing PostgreSQL over DynamoDB because we need transactions and
ad-hoc reporting") and raise healthcare constraints early: PHI, audit and BAAs.

### How would you design a Document AI pipeline with human review? {core}

Direct uploads to an encrypted bucket with signed URLs; an upload event triggers stateless workers that run OCR,
classify, extract and validate; a document state machine in the database tracks every step; documents that fail
validation or have low confidence go to a review queue with a UI that shows the image next to the fields; approved data
is submitted downstream with idempotent calls, retries and a dead-letter queue; and every step is audited. The worked
design above has the diagram.

**Your angle:** say plainly that you built this on GCP for LDH Medicaid: FastAPI and Pydantic validation, HITL review,
signed URLs, SAML, Cloud Run. Then offer the deep dives: idempotency, reprocessing and measuring straight-through rate.

### How would you design a readmission-risk prediction service? {core}

Define the label carefully (unplanned readmission within 30 days, with exclusions), build features only from data
available at prediction time, train a gradient-boosting model with patient-level, time-based validation, register it,
and serve scores both as a daily batch over current inpatients and on demand from discharge events. Show top factors to
care managers, choose the operating point from their call capacity, check calibration and fairness by subgroup, and
monitor drift and real outcomes 30 days later to trigger retraining.

### How would you design a claims status API for heavy read traffic? {core}

Put a gateway in front for OAuth2, rate limits and a WAF; run stateless, autoscaled services across zones; serve reads
from a denormalised read model on replicas plus a short-TTL cache, never from the adjudication system directly; keep the
read model current with status-change events processed by an idempotent, version-aware projector; support X12 276/277
through an EDI translator onto the same service; and audit every access to member data. At 10× scale, partition the read
model by claim ID and add regional deployments.

### How would you design a RAG assistant over clinical policies?

Ingest policy documents with layout-aware parsing, structure-aware chunks and rich metadata (plan, state, effective
dates, access labels); search with hybrid retrieval filtered by that metadata, then rerank; prompt with numbered sources
and instructions to answer only from them; verify citations; stream the answer; collect feedback into an evaluation set.
Redact PHI from questions, run the model under a BAA, and refuse when the policies do not answer the question.

### How do you make a design HIPAA-compliant? {core}

HIPAA is a set of safeguards, not a product, so I build them into the design: encryption in transit and at rest;
authentication with SSO and MFA, and role-based, least-privilege access; minimum necessary data in every service;
append-only audit logs of PHI access; only HIPAA-eligible cloud services covered by a BAA; PHI kept out of logs, error
messages, analytics and LLM prompts unless those are covered too; de-identified data in non-production; backups and
disaster recovery; and documented risk assessments. Technically the Security Rule asks for access control, audit
controls, integrity, authentication and transmission security, which map directly onto those design choices.

### SQL or NoSQL: how do you choose?

Start from the access patterns and consistency needs. A relational database is my default for healthcare data:
transactions, constraints, joins and ad-hoc reporting matter, and PostgreSQL scales a long way with indexes, read
replicas and partitioning. I choose a key-value or document store when access is by key at very high scale with
simple, known queries (sessions, event logs, device data), when the schema is truly variable, or when I need
single-digit-millisecond reads at massive scale, accepting weaker joins and reporting. Many systems use both: a
relational system of record plus specialised stores for cache, search or events.

### How do you use caching, and how do you keep it correct? {core}

I cache data that is read far more than written and tolerates brief staleness, usually with **cache-aside**: read from
the cache, on a miss read the database and fill the cache with a TTL. **Write-through** updates the cache on every write
(fresher, slower writes); **write-behind** writes to the cache first and the database later (fast, but risks losing data).
Correctness comes from short TTLs, invalidating or updating keys when change events arrive, versioned keys, and
protecting against stampedes (request coalescing or locks on a miss).

Healthcare caveat: cached PHI is still PHI, so encrypt it, scope keys by user or tenant, and never let one user's
cached response serve another.

### Why put a queue between services, and what delivery guarantees do you get? {core}

A queue decouples the producer from the consumer: it absorbs spikes, lets consumers scale and fail independently, and
makes retries natural. Most queues give **at-least-once** delivery, so messages can arrive twice or out of order. That
means consumers must be **idempotent** (deduplicate by message or business ID, upsert by version) and messages that keep
failing go to a **dead-letter queue** with alerting. "Exactly once" in practice means at-least-once delivery plus
idempotent processing. Ordering is only guaranteed within a partition or session key, so choose that key carefully, for
example the claim ID.

### Explain the CAP theorem. {deep}

When a network partition splits a distributed system, it must choose between **consistency** (every read sees the
latest write) and **availability** (every request gets a response). You cannot have both during the partition. PACELC
extends it: **else**, when there is no partition, you trade **latency** against consistency. In practice I decide per
operation: eligibility checks or payments need strong consistency, while a dashboard count can be eventually
consistent. Many databases let you tune this, for example with quorum reads and writes.

### How do you scale a database?

In order of effort: fix queries and add the right indexes; use connection pooling; cache hot reads; add **read
replicas** for read-heavy traffic (accepting replication lag); **partition** big tables by date or key; archive old data;
scale vertically; and finally **shard** writes across databases by a key such as tenant or member ID, which complicates
cross-shard queries and transactions. For analytics, move reporting to a warehouse instead of querying production.

**Your angle:** at Medidata you optimised PostgreSQL queries and data access for clinical-trial workflows: start with
measuring and indexing before re-architecting.

### How do you design for reliability? {core}

Assume every dependency fails. Set **timeouts** on every call; **retry** only transient failures, with exponential
backoff and jitter, and only for idempotent operations; use **circuit breakers** to stop hammering a failing partner;
isolate resources with **bulkheads** so one slow dependency cannot exhaust all threads; degrade gracefully (serve cached
data, queue work for later); use dead-letter queues; deploy across zones with health checks and rolling or canary
releases; and define SLOs with alerts on error budget burn. Then test it: failover drills and chaos experiments.

### Monolith or microservices? {core}

Start with a well-structured, modular monolith unless there is a clear reason not to: it is simpler to build, test,
deploy and debug. Move to microservices when teams need to deploy independently, parts have very different scaling or
reliability needs, or the domain boundaries are stable and clear. The cost is real: network failures, distributed data
and transactions, observability and operational overhead. Migrate incrementally with the strangler-fig pattern, routing
one capability at a time to a new service.

**Your angle:** at Cognizant you led the migration of monolithic applications to microservices on Azure, which reduced
infrastructure costs, and at The Dot Corp you modernised FedEx SOAP integrations to REST across about 24 legacy
OrderingStore applications.

### How do you handle long-running work in an API?

Do not hold an HTTP request open for minutes. Accept the request, validate it, create a job record, put a message on a
queue, and return **202 Accepted** with a job ID and a status URL. Clients poll the status endpoint, or you notify them
with a webhook, a WebSocket or server-sent events when the job completes. Workers process jobs idempotently, update the
status, and send failures to a dead-letter queue. OCR, ML batch scoring and report generation all fit this pattern.

### How do you design observability and SLOs?

Three signals: structured **logs** (with correlation IDs, no PHI), **metrics** (rate, errors, duration per endpoint;
queue depth; saturation), and distributed **traces** across services, for example with OpenTelemetry. Define SLOs from
the user's point of view, such as "99.9% of claim lookups succeed in under 300 ms over 30 days", and alert on error-budget
burn rather than on every spike. Keep a separate, append-only **audit log** for PHI access; it is a compliance record,
not a debugging log.

### How do you design a multi-tenant system? {deep}

Choose an isolation level per need: **shared everything** with a tenant ID on every row (cheapest; enforce isolation with
row-level security or a mandatory tenant filter in the data layer), **schema or database per tenant** (stronger isolation,
per-tenant backups and keys, more operational work), or **separate deployments** for tenants with strict contractual or
regulatory needs. Put tenant context in the auth token, enforce it in middleware, keep tenant-specific configuration in
data rather than in code branches, and watch for noisy neighbours with per-tenant rate limits and quotas.

**Your angle:** at The Dot Corp you worked on the React-based LINE multi-tenant platform, which consolidates multiple
customer-specific legacy OrderingStore implementations into one centralised architecture.

### How do you design rate limiting?

Limit per client identity (API key, OAuth client or user) at the gateway, with algorithms such as **token bucket** (allows
short bursts up to a capacity, refills at a steady rate) or **sliding window** counters. In a scaled-out service, keep the
counters in a shared store like Redis so every instance sees the same counts. Return **429 Too Many Requests** with a
`Retry-After` header, set different tiers per partner, and also limit expensive operations separately, such as LLM calls
or document uploads, since cost matters as much as request count.

### How do you plan for disaster recovery? {deep}

Start from the business targets: **RTO** (how long you can be down) and **RPO** (how much data you can lose). Then pick
the strategy: backups with tested restores (cheap, slow recovery), a warm standby in another region with replicated data,
or active-active (fastest, most complex and costly). Replicate databases and object storage across regions, keep
infrastructure as code so the environment can be rebuilt, and run regular failover drills, because an untested DR plan
does not exist.

**Your angle:** at The Dot Corp you helped investigate OrderingStore service disruptions during an Azure regional outage:
a concrete example of why multi-region design and runbooks matter.

## Coding problems

### Make a POST endpoint idempotent {medium}

Clients retry requests when a network call times out, so a "submit claim" request can arrive twice. Write a class
`IdempotentHandler` with `handle(key, payload)`, which wraps a function that performs the real work. The first request
with a key runs the work and stores the result. A repeat with the **same key and same payload** returns the stored
result without running the work again. A repeat with the **same key but a different payload** raises `ValueError` (an
API would return an error status).

#### Hints

1. Store, per key, a fingerprint of the payload and the response.
2. A stable fingerprint: serialise the payload as JSON with sorted keys, then hash it.
3. Check the store before doing any work; only call the real function on a new key.

#### Solution

Idempotency keys are how payment and healthcare APIs make retries safe. Store the payload's fingerprint with the
response: an identical retry gets the original response, and a key reused for a different request is rejected, because
silently returning the old response would hide a client bug. In production the store is a database table or Redis with a
unique constraint on the key and an expiry, and a key that is still in progress should get a "try again" response.

```python
import hashlib
import json
from typing import Any, Callable

class IdempotentHandler:
    def __init__(self, work: Callable[[dict], Any]):
        self.work = work
        self.store: dict[str, tuple[str, Any]] = {}

    @staticmethod
    def fingerprint(payload: dict) -> str:
        return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()

    def handle(self, key: str, payload: dict) -> Any:
        fp = self.fingerprint(payload)
        if key in self.store:
            stored_fp, response = self.store[key]
            if stored_fp != fp:
                raise ValueError("idempotency key reused with a different payload")
            return response
        response = self.work(payload)
        self.store[key] = (fp, response)
        return response

created: list[dict] = []
def submit_claim(payload: dict) -> dict:
    created.append(payload)
    return {"claim_id": f"CLM-{len(created):06d}", "status": "received"}

api = IdempotentHandler(submit_claim)
first = api.handle("key-1", {"member": "M1", "amount": 120.0})
retry = api.handle("key-1", {"amount": 120.0, "member": "M1"})  # same content, different key order
assert first == retry == {"claim_id": "CLM-000001", "status": "received"}
assert len(created) == 1  # the work ran once

api.handle("key-2", {"member": "M1", "amount": 120.0})
assert len(created) == 2  # a new key is a new request

try:
    api.handle("key-1", {"member": "M1", "amount": 999.0})
except ValueError:
    pass
else:
    raise AssertionError("expected ValueError for a reused key")
```

Complexity: O(size of payload) per request to fingerprint it, O(1) for the store lookup.

#### Follow-ups

- **What if two identical requests arrive at the same time?** Insert the key with an "in progress" status inside a
  transaction or with a unique constraint before doing the work; the second request sees the key and gets a conflict
  ("still processing, retry") instead of running the work twice.
- **How long do you keep keys?** Long enough to cover client retry windows, often 24 hours or more, with a TTL so the
  store does not grow forever.
- **Which status codes?** The IETF Idempotency-Key draft suggests 422 for a reused key with a different payload and 409
  while the first request is still being processed.
