---
title: The GCP services around the platform
goal: Choose and explain the Google Cloud services an agentic platform is built from (Pub/Sub, Cloud Tasks, Secret Manager, IAM, Workflows, Eventarc, Cloud SQL, Memorystore, Cloud Storage, observability and the agent products) with their real limits and trade-offs.
minutes: 45
---

The JD lists Cloud Run, Secret Manager and Cloud Pub/Sub, and the platform's back end will lean on more: task queues,
service accounts, databases, logging. Interviewers rarely ask for a product tour. They ask design questions ("how does a
long agent run report progress?", "how do you call a rate-limited ERP API from workers?") and listen for the right
service, the right setting and the catch. This chapter gives you those, with numbers checked against the current docs.

Your resume shows real GCP work: at Quantiphi, **Cloud Run**, **Artifact Registry**, **Cloud Functions** and **Cloud
Storage** with **signed URLs**; **Firestore** is in your skills. It does not show **Pub/Sub** or **Secret Manager**, so
learn those two best and be honest that they are new to you in production.

## How the pieces fit

```text
            ┌──────────── Identity provider (SAML / OIDC) ───────────┐
browser ──► Load balancer + Cloud Armor ──► Cloud Run: chat / API ──► Cloud SQL (runs, steps, audit)
   ▲                                          │      │                Firestore (live run state)
   │ SSE / WebSocket                          │      └──► Memorystore (cache, fan-out, rate limits)
   │                                          ▼
   └──── progress events ◄── Pub/Sub ◄── workers (Cloud Run / GKE) ──► Cloud Tasks ──► ERP / SAP / external APIs
                               ▲              │
                               │              └──► Gemini Enterprise Agent Platform (model and agent calls)
                     Eventarc, Cloud Scheduler, Workflows        Secret Manager: API keys and credentials
```

| Need | Service | One-line reason |
|---|---|---|
| Fan out events to many consumers | **Pub/Sub** | Publishers do not know subscribers; at-least-once; scales without tuning |
| Call one HTTP endpoint per task at a controlled rate | **Cloud Tasks** | Explicit target, rate limits, scheduling, deduplication by task name |
| Orchestrate steps with retries and waits | **Workflows** | Managed state machine over HTTP calls, with callbacks for long waits |
| Route platform events (uploads, audit logs) to services | **Eventarc** | CloudEvents to Cloud Run from Cloud Storage, Pub/Sub, audit logs and more |
| Run something on a schedule | **Cloud Scheduler** | Managed cron that calls HTTP, Pub/Sub or workflows |
| Store credentials | **Secret Manager** | Versioned secrets, IAM per secret, audit logs |
| Relational data | **Cloud SQL for PostgreSQL** | Managed Postgres with HA, replicas, IAM auth (see [PostgreSQL](#/postgres)) |
| Document data with live listeners | **Firestore** | Real-time updates to clients and services (see [Firestore](#/firestore)) |
| Cache, rate limits, fan-out | **Memorystore** (Redis, Valkey) | Managed in-memory store (see [Redis](#/redis)) |
| Files and documents | **Cloud Storage** | Objects plus signed URLs for direct browser upload and download |
| Images and builds | **Artifact Registry**, **Cloud Build** | Registry with vulnerability scanning; managed builds and triggers |
| Logs, metrics, traces | **Cloud Logging, Monitoring, Trace** | Structured logs, alerting and SLOs, distributed traces |
| Models and agents | **Gemini Enterprise Agent Platform** (formerly Vertex AI) | Gemini models, the Agent Development Kit and a managed agent runtime |

## Pub/Sub

A **topic** receives messages; each **subscription** gets its own copy of every message (fan-out), and within a
subscription each message goes to one of the competing subscribers (load sharing).

| Subscription type | How messages arrive | Use it for |
|---|---|---|
| **Pull** (including StreamingPull) | Your workers pull and acknowledge | High throughput, flow control, exactly-once delivery |
| **Push** | Pub/Sub POSTs each message to an HTTPS endpoint, such as a Cloud Run service | Serverless consumers with no always-on worker |
| **BigQuery / Cloud Storage** | Pub/Sub writes messages into a table or bucket | Analytics and archiving with no code |

### Settings that matter (current limits)

| Setting | Value | What it means for you |
|---|---|---|
| Message size | Up to **10 MB** of data, 100 attributes | Put big payloads in Cloud Storage and send a reference |
| Ack deadline | Default **10 s**, maximum **600 s** | Slow handlers must extend the deadline (client libraries do it) or the message is redelivered |
| Retention of unacked messages | Default **7 days**, 10 minutes to **31 days** | A broken consumer has days, not forever |
| Retry policy | Default: retry **immediately**; or exponential backoff (defaults **10 s** minimum, **600 s** maximum; 600 s is the longest allowed) | Use backoff so a failing message does not spin |
| Dead-letter topic | After **5–100** delivery attempts (default 5) | Poison messages leave the subscription with a delivery count |
| Ordering | Messages with the same **ordering key** in the same region arrive in order, if ordering is enabled on the subscription | Order per agent run, not globally; about 1 MBps per key |
| Exactly-once delivery | **Pull subscriptions only**, within one region | A successful ack means no redelivery; publish-side duplicates can still happen |
| Filters | On **attributes only**; non-matching messages are acked automatically; cannot be changed later | Route by `type=tool_call` without code |
| Push acknowledgement | HTTP **102, 200, 201, 202 or 204** acknowledges; anything else is a negative ack | Return 204 when done, 5xx to retry |
| Push backoff | Separate from the retry policy: 100 ms to 60 s after negative acks, applied to the whole subscription | One bad endpoint slows delivery for everyone on that subscription |

**Delivery semantics to say out loud:** Pub/Sub is at-least-once. Even with exactly-once delivery enabled, the
publisher can publish the same event twice after a retry. So every consumer is **idempotent**, keyed by an id in the
message (a run id plus step number), not by the Pub/Sub message id alone.

### Pub/Sub or Cloud Tasks?

| | Pub/Sub | Cloud Tasks |
|---|---|---|
| Invocation | Implicit: publish an event, any number of subscribers react | Explicit: each task names the HTTP endpoint to call |
| Rate control | Flow control on pull clients; no per-target rate limit | Per-queue dispatch rate and concurrency limits (up to 500 tasks/s per queue) |
| Scheduling | No delayed delivery | Schedule up to 30 days ahead |
| Deduplication | No (exactly-once delivery covers redelivery, not duplicate publishes) | Task names deduplicate |
| Message size | 10 MB | 1 MiB |
| Retention | Up to 31 days | Up to 31 days |
| Handler time | Bounded by the ack deadline you extend, or the push endpoint's timeout | HTTP dispatch deadline 15 s to 30 min (default 10 min) |
| Best for | Events with several consumers, streaming progress, decoupling | Calling a rate-limited ERP or SAP API one task at a time, delayed retries |

## Secret Manager

- A **secret** holds **versions** (payload up to 64 KiB each). Versions are immutable; you add a new version to rotate,
  then disable and destroy old ones.
- Access is controlled by IAM **per secret**: grant `roles/secretmanager.secretAccessor` to the one service account
  that needs it. Every access is in Cloud Audit Logs.
- **Rotation:** Secret Manager can publish rotation notifications to a Pub/Sub topic on a schedule; a function or job
  creates the new credential, adds a version, and the app picks it up.
- **In Cloud Run:** as env vars (resolved at instance start; pin versions) or mounted files (read on access; `latest`
  works). **In GKE:** the Secret Manager add-on or the client library with Workload Identity Federation.
- Clients should cache secrets briefly and, on an authentication failure, refresh once and retry. The coding problem
  builds this.

## IAM in one table

| Concept | Meaning | Practice |
|---|---|---|
| Principal | A user, group, service account, or federated identity (GKE workload, GitHub Actions job) | Humans through groups, workloads through their own service accounts |
| Role | A set of permissions: basic (Owner/Editor/Viewer), predefined, custom | Never basic roles in production; predefined roles on the smallest resource |
| Policy binding | Principal + role on a resource (organisation, folder, project, or one resource) | Bind on the secret, topic or bucket, not the whole project |
| Service account keys | Long-lived JSON keys | Avoid: use attached service accounts, Workload Identity Federation, impersonation |
| Conditions | Bindings that apply only when, for example, a time or resource-name condition holds | Temporary access, prefix-scoped access |

## Workflows, Eventarc and Cloud Scheduler

- **Workflows** runs a YAML/JSON-defined sequence of steps (HTTP calls, Google API connectors, conditions, parallel
  branches) with built-in retries and saved state. **Callbacks** let a workflow pause until an HTTP callback URL is
  called, which suits a human approval step in an agent flow.
- **Eventarc** delivers events (Cloud Storage object finalised, Pub/Sub messages, Cloud Audit Log entries, and others)
  to Cloud Run, GKE or Workflows in CloudEvents format.
- **Cloud Scheduler** is managed cron: it calls an HTTP target (with an OIDC token for Cloud Run), publishes to Pub/Sub,
  or starts a workflow.

## Data, storage and delivery services

- **Cloud SQL for PostgreSQL:** regional high availability with automatic failover, read replicas (also
  cross-region), automated backups and point-in-time recovery, IAM database authentication, private IP. Connect from
  Cloud Run with the built-in connection or the connectors; budget connections.
- **Memorystore:** managed Redis (instance or cluster) and Valkey, reached over private networking. Use it for caches,
  rate limits, session data and fan-out between WebSocket instances.
- **Cloud Storage signed URLs:** a time-limited URL that grants one operation (GET or PUT) on one object without the
  caller having Google credentials. V4 signed URLs last at most 7 days. Browsers upload documents straight to the bucket
  and download results without streaming bytes through your API.
- **Artifact Registry and Cloud Build:** images and packages with vulnerability scanning; builds from triggers (pushes,
  pull requests, webhooks, manual or API calls) using a `cloudbuild.yaml`.

**Your angle:** at Quantiphi you used GCS signed URLs so reviewers could view documents securely without public bucket
access.

## Observability

- **Cloud Logging:** structured JSON from stdout; log-based metrics; log sinks to BigQuery or Cloud Storage for
  retention; field-level redaction is your job.
- **Cloud Monitoring:** metrics from every service, custom metrics (open sockets, queue age, time to first token),
  uptime checks, alerting policies and SLO monitoring with burn-rate alerts.
- **Cloud Trace:** distributed traces, fed by OpenTelemetry; link logs to traces with the trace field.
- **Error Reporting:** groups exceptions from logs that contain stack traces.

## Google's agent stack (renamed in 2026)

In April 2026 Google folded Vertex AI into the **Gemini Enterprise Agent Platform**, so you will hear both old and new
names. The API endpoint is still `aiplatform.googleapis.com`, and SDK code still uses the older module names.

- **Gemini models** served through the Gemini Enterprise Agent Platform (formerly Vertex AI), with streaming, function
  calling and structured output.
- **Agent Development Kit (ADK):** Google's open-source framework for building agents, in Python, Java, Go, TypeScript
  and, most recently, Kotlin.
- **Agent Runtime** (formerly Vertex AI Agent Engine): the managed runtime that deploys agents built with ADK,
  LangGraph, LangChain and other frameworks and adds sessions, a Memory Bank, evaluation and tracing.
- **Gemini Enterprise:** the employee-facing assistant surface (formerly Agentspace).

In the interview, keep it practical: "I would ask which of these the platform uses; the patterns are the same as in
the agentic workflows I built at Quantiphi: tool-use boundaries, validation loops and HITL checkpoints."

## Interview questions

### Which GCP services would you use for the back end of an agentic AI platform? {core}

Cloud Run for the chat and orchestration APIs, with workers on Cloud Run or GKE. Pub/Sub to fan out run events and
progress to every consumer, Cloud Tasks to call rate-limited external systems one task at a time, Workflows where an
orchestration is mostly HTTP steps with waits. Cloud SQL for PostgreSQL as the system of record for runs, steps and
audit; Firestore or Memorystore for live state and fan-out; Secret Manager for credentials; Cloud Storage with signed
URLs for documents; the Gemini Enterprise Agent Platform (formerly Vertex AI) for models. Every service gets its own
service account, and everything is traced through Cloud Trace and Cloud Logging.

### Explain Pub/Sub's model. Push or pull? {core}

A topic receives messages, and each subscription gets a copy of every message, so several systems can react to one
event; within a subscription, each message goes to one subscriber. Pull subscriptions suit long-running workers: high
throughput, flow control and exactly-once delivery. Push subscriptions POST each message to an HTTPS endpoint such as a
Cloud Run service, which scales to zero and needs no always-on worker. I pick push for bursty, quick handlers and pull
for heavy, steady consumers.

### What is the ack deadline, and what happens if a handler is slow?

The ack deadline is how long Pub/Sub waits for an acknowledgement before redelivering: 10 seconds by default, up to 600.
If the handler runs longer, the message is delivered again, possibly to another worker, and you get duplicate work.
Client libraries extend the deadline automatically while a message is being processed, up to a configured maximum. For
work that takes minutes, I acknowledge only after the result is committed, keep the handler idempotent, or hand the
long work to a job and acknowledge quickly.

### Does Pub/Sub deliver exactly once? {core}

By default it is at-least-once, so duplicates are normal. Exactly-once delivery exists for pull subscriptions in a
single region: once an acknowledgement succeeds, that message is not redelivered. It does not remove duplicates created
when a publisher retries and publishes the same event twice, and it adds latency. So consumers stay idempotent anyway,
keyed by a business id, for example the run id and step number with a unique constraint.

### How do you keep an agent run's events in order? {core}

Publish them with the run id as the ordering key and enable message ordering on the subscription. Pub/Sub then
delivers messages with the same key, in the same region, in publish order, while different runs proceed in parallel.
If a message fails, later messages for that key wait, so the handler must not get stuck on a poison message: a
dead-letter topic or a parked state keeps the run from blocking forever. I also put a sequence number in each event, so
consumers can detect gaps and resync.

### How do retries and dead-letter topics work in Pub/Sub?

The subscription's retry policy decides when a negatively acknowledged or expired message comes back: immediately by
default, or with exponential backoff, by default from 10 seconds up to 10 minutes, the longest allowed. A dead-letter topic moves a message out after
a set number of delivery attempts, between 5 and 100, with the attempt count, so one bad message does not spin forever
or block ordered delivery. Someone inspects the dead-letter subscription, fixes the cause and replays.

### Pub/Sub or Cloud Tasks? {core}

Pub/Sub when it is an event that any number of consumers may react to, and the publisher should not know who they are:
"step completed", "run failed". Cloud Tasks when the producer wants a specific endpoint called, at a controlled rate,
possibly later: "create this purchase order in the ERP, at most 5 per second, retry with backoff". Cloud Tasks also
deduplicates by task name and supports scheduling up to 30 days ahead; Pub/Sub carries bigger messages (10 MB versus 1 MiB).

### Pub/Sub or Kafka? {deep}

Pub/Sub is serverless: no partitions or brokers to size, global endpoints, per-message acknowledgement, push delivery.
Kafka (Google offers Managed Service for Apache Kafka) is a partitioned, replayable log with consumer offsets, strong
per-partition ordering and a big ecosystem (Connect, Streams). I choose Pub/Sub for event distribution on GCP and Kafka
when the team needs long replay, stream processing with Kafka tools, or portability. Pub/Sub can also seek a
subscription back to a time or snapshot for replay within retention.

### How do you secure a Pub/Sub push endpoint on Cloud Run? {deep}

Make the Cloud Run service private, configure the push subscription to attach an OIDC token from a dedicated service
account, and grant that service account `roles/run.invoker` on the service. Cloud Run then rejects any request without a
valid token before my code runs. Inside, I still validate the message and stay idempotent, because a valid sender can
still deliver duplicates.

### How do you manage secrets on GCP? {core}

In Secret Manager: each secret has immutable versions, and each service's own service account gets
`roles/secretmanager.secretAccessor` on only the secrets it needs, with access audited. Services read secrets at runtime
(Cloud Run env vars or mounted files, the GKE add-on, or the client library), never from images or Git. I rotate by
adding a version, rolling or refreshing consumers, then disabling the old version, and I can schedule rotation
notifications through Pub/Sub.

### How do you apply least privilege with IAM on GCP?

One service account per workload, predefined roles granted on the smallest resource (this secret, this topic, this
bucket) rather than the project, no basic roles in production, and no service-account keys: workloads use attached
service accounts or Workload Identity Federation, and CI uses federation from GitHub or Cloud Build. Humans get access
through groups, ideally just in time, and I review unused permissions with IAM recommendations.

### When would you use Workflows, Eventarc or Cloud Scheduler? {deep}

Workflows when an orchestration is a sequence of HTTP and Google API calls with retries, branches and waits, including
pausing on a callback for a human approval; it keeps the state for me. Eventarc to route platform events, such as an
object finalised in Cloud Storage or an audit-log entry, to Cloud Run or Workflows. Cloud Scheduler for cron: nightly
clean-ups, periodic sync with the ERP. For complex agent logic with many custom rules I still prefer an orchestrator in
code with explicit state in the database, using these services around it.

### How would a long agent run report progress to the browser on GCP? {core}

The worker that executes the run writes each step to the database (the source of truth) and publishes a progress
event to Pub/Sub with the run id as the ordering key. The streaming gateway on Cloud Run subscribes and fans events out
to the browsers watching that run over SSE or WebSockets, using Memorystore pub/sub or Firestore listeners to reach the
right instance. When a browser reconnects, it sends its last event id and the gateway replays missed events from the
database before continuing live.

### What are signed URLs, and why use them?

A signed URL is a time-limited link that lets whoever holds it perform one operation, such as GET or PUT, on one
Cloud Storage object, without Google credentials. V4 signed URLs last at most seven days, and I keep them to minutes.
The browser uploads or downloads directly from the bucket, so large files never pass through the API, and the bucket
stays private. The API decides who gets a URL, which is where the authorisation check lives.

**Your angle:** reviewers on the Quantiphi Document AI platform viewed documents through GCS signed URLs.

### How do you observe services on GCP?

Structured JSON logs to Cloud Logging with the trace id, so logs and traces link up; OpenTelemetry traces to Cloud
Trace so I can follow one agent run across the gateway, orchestrator, workers and external calls; and metrics in Cloud
Monitoring, including custom ones such as time to first token, open sockets and queue age. I alert on SLO burn rate and
on symptoms users feel, and use Error Reporting to group exceptions.

### How do you choose between Cloud SQL, Firestore and Memorystore?

Cloud SQL for PostgreSQL is the system of record: relational data with constraints and transactions, such as runs,
steps, approvals and audit. Firestore when the access pattern is documents by key with real-time listeners, such as live
run state pushed to clients, and you want serverless scaling. Memorystore for data that can be rebuilt: caches, rate-limit
counters, session data and pub/sub fan-out. Many platforms use all three, each for what it is good at.

### What does Google offer for building and running agents? {core}

Google's AI platform is now the Gemini Enterprise Agent Platform, formerly Vertex AI. It serves Gemini models with
streaming, function calling and structured output; the open-source Agent Development Kit builds agents; and Agent
Runtime, formerly Vertex AI Agent Engine, hosts agents built with ADK, LangGraph or LangChain and adds sessions, memory,
evaluation and tracing. The names changed in 2026, so I would ask which pieces the platform uses.
My experience is agentic AI workflows I built at Quantiphi, with tool-use boundaries, validation loops and HITL
checkpoints, and those patterns carry over.

### How do you keep GCP costs under control on a platform like this? {deep}

Visibility first: labels per team, service and environment, billing export to BigQuery, and budgets with alerts. Then
the usual levers: right-size Cloud Run instances and concurrency, scale to zero where latency allows, min instances only
on the critical path, committed-use discounts for steady load, lifecycle rules on buckets, and log retention and
exclusions for noisy logs. For an AI platform the biggest line is often model usage, so track tokens per run and per
tenant, cache where possible and route simple tasks to cheaper models.

### What does Artifact Registry give you beyond storing images? {deep}

Regional repositories for container images and language packages, IAM per repository, vulnerability scanning through
Artifact Analysis, cleanup policies, and remote and virtual repositories that cache and front public registries. With
Binary Authorization, GKE and Cloud Run can refuse images that are not signed or attested by the pipeline.

## Coding problems

### A Pub/Sub push handler that is idempotent {medium core}

Write a FastAPI endpoint `POST /pubsub/run-events` for a push subscription. The body is
`{"message": {"data": "<base64 JSON>", "attributes": {...}, "messageId": "..."}, "subscription": "...",
"deliveryAttempt": 3}` (`deliveryAttempt` only appears when a dead-letter topic is set). The JSON inside `data` is
`{"run_id": "...", "step": 2, "status": "done"}`.

- Apply each `(run_id, step)` only once and return 204 for duplicates.
- Malformed messages can never succeed: record them in a quarantine list and return 204 so they are not retried.
- A transient failure in the store returns 503 so Pub/Sub redelivers later.

#### Hints

1. Decode with `base64.b64decode`, then `json.loads`, and validate with a Pydantic model.
2. Pub/Sub treats 102, 200, 201, 202 and 204 as acknowledgements; anything else is a negative acknowledgement.
3. The idempotency key is the business key, `(run_id, step)`, not `messageId`, because a publisher retry creates a new message id.

#### Solution

The handler separates three outcomes: done (ack), never-going-to-work (ack and quarantine, or let a dead-letter topic
catch it) and try-again-later (nack). Using the business key protects against both redelivery and duplicate publishes.

```python
import base64
import json
from typing import Literal

from fastapi import FastAPI, Request, Response
from fastapi.testclient import TestClient
from pydantic import BaseModel, ValidationError


class RunEvent(BaseModel):
    run_id: str
    step: int
    status: Literal["started", "done", "failed"]


class StoreUnavailable(Exception):
    pass


class RunStore:
    def __init__(self) -> None:
        self.applied: dict[tuple[str, int], str] = {}
        self.fail_next = False

    def apply(self, event: RunEvent) -> bool:
        """Returns False when the event was already applied."""
        if self.fail_next:
            self.fail_next = False
            raise StoreUnavailable("database failover in progress")
        key = (event.run_id, event.step)
        if key in self.applied:
            return False
        self.applied[key] = event.status        # in Postgres: INSERT ... ON CONFLICT DO NOTHING
        return True


store = RunStore()
quarantine: list[dict[str, object]] = []
app = FastAPI()


@app.post("/pubsub/run-events")
async def run_events(request: Request) -> Response:
    envelope = await request.json()
    message = envelope.get("message", {}) if isinstance(envelope, dict) else {}
    try:
        payload = json.loads(base64.b64decode(message["data"], validate=True))
        event = RunEvent.model_validate(payload)
    # KeyError: no data; TypeError: data is not a string or message is not an object;
    # ValueError covers binascii.Error, JSONDecodeError and Pydantic's ValidationError.
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        quarantine.append({"message_id": message.get("messageId") if isinstance(message, dict) else None,
                           "error": type(exc).__name__})
        return Response(status_code=204)        # ack: retrying cannot fix a malformed message
    try:
        store.apply(event)
    except StoreUnavailable:
        return Response(status_code=503)        # nack: Pub/Sub redelivers with backoff
    return Response(status_code=204)


def push_body(data: object, message_id: str, attempt: int = 1) -> dict[str, object]:
    raw = data if isinstance(data, str) else base64.b64encode(json.dumps(data).encode()).decode()
    return {"message": {"data": raw, "attributes": {"type": "run_event"}, "messageId": message_id},
            "subscription": "projects/p/subscriptions/run-events-push", "deliveryAttempt": attempt}


client = TestClient(app)
event = {"run_id": "run-7", "step": 2, "status": "done"}

assert client.post("/pubsub/run-events", json=push_body(event, "m1")).status_code == 204
assert client.post("/pubsub/run-events", json=push_body(event, "m1", attempt=2)).status_code == 204   # redelivery
assert client.post("/pubsub/run-events", json=push_body(event, "m9")).status_code == 204              # duplicate publish
assert store.applied == {("run-7", 2): "done"}

store.fail_next = True
assert client.post("/pubsub/run-events", json=push_body({**event, "step": 3}, "m2")).status_code == 503
assert client.post("/pubsub/run-events", json=push_body({**event, "step": 3}, "m2", attempt=2)).status_code == 204
assert store.applied[("run-7", 3)] == "done"

assert client.post("/pubsub/run-events", json=push_body("not base64!!", "m3")).status_code == 204
assert client.post("/pubsub/run-events", json=push_body({"run_id": "run-7"}, "m4")).status_code == 204
bad_envelope = {"message": {"data": None, "messageId": "m5"}, "subscription": "projects/p/subscriptions/x"}
assert client.post("/pubsub/run-events", json=bad_envelope).status_code == 204
assert client.post("/pubsub/run-events", json={"message": "not an object"}).status_code == 204
assert [q["message_id"] for q in quarantine] == ["m3", "m4", "m5", None]
assert len(store.applied) == 2
```

Complexity: O(1) per message.

#### Follow-ups

- **Who checks that the request really came from Pub/Sub?** Make the service private and give the push subscription an
  OIDC token from a service account with `roles/run.invoker`; Cloud Run verifies it before the handler runs.
- **Quarantine or dead-letter topic?** A dead-letter topic is the managed version: return a non-2xx for bad messages and
  they move after the maximum delivery attempts. Acking and quarantining avoids wasted retries when you know it is
  hopeless.

### Ordered processing per key {medium}

Simulate how ordering keys behave. Write `process_in_order(messages, handler)` where each message is
`(key, seq, payload)`. Messages of the same key must be handled in `seq` order; different keys are independent. If the
handler raises for a message, stop that key (its later messages must not run before it) and return those messages for
redelivery, while other keys carry on. Return `(handled, redeliver)`.

#### Hints

1. Group messages by key, then sort each group by `seq`.
2. Walk each group; on the first failure, put that message and all later ones of the key into `redeliver`.
3. Keep the handled list in processing order so the test can check it.

#### Solution

This mirrors Pub/Sub with message ordering: a failed message holds back the rest of its key, so ordering is preserved,
and other keys (other agent runs) are not affected. It also shows why a poison message needs a dead-letter path:
otherwise its key is stuck.

```python
from collections import defaultdict
from collections.abc import Callable

Message = tuple[str, int, str]


def process_in_order(messages: list[Message], handler: Callable[[Message], None]) -> tuple[list[Message], list[Message]]:
    by_key: dict[str, list[Message]] = defaultdict(list)
    for message in messages:
        by_key[message[0]].append(message)
    handled: list[Message] = []
    redeliver: list[Message] = []
    for key in sorted(by_key):
        group = sorted(by_key[key], key=lambda m: m[1])
        for i, message in enumerate(group):
            try:
                handler(message)
            except Exception:
                redeliver.extend(group[i:])          # hold back the rest of this key
                break
            handled.append(message)
    return handled, redeliver


def handler(message: Message) -> None:
    if message[2] == "erp-timeout":
        raise TimeoutError("ERP did not answer")


inbox = [("run-b", 2, "tool:done"), ("run-a", 1, "step:start"), ("run-b", 1, "step:start"),
         ("run-a", 2, "erp-timeout"), ("run-a", 3, "step:done"), ("run-b", 3, "step:done")]
handled, redeliver = process_in_order(inbox, handler)
assert handled == [("run-a", 1, "step:start"), ("run-b", 1, "step:start"), ("run-b", 2, "tool:done"), ("run-b", 3, "step:done")]
assert redeliver == [("run-a", 2, "erp-timeout"), ("run-a", 3, "step:done")]   # step 3 never ran before step 2

assert process_in_order([], handler) == ([], [])
```

Complexity: O(n log n) for the sorting, O(n) memory.

#### Follow-ups

- **How do consumers detect a gap?** Each event carries a sequence number; a consumer that receives seq 5 after 3 knows
  it missed 4 and fetches the run's state from the database.
- **Why not order everything globally?** Global order forces one consumer at a time. Ordering per run keeps runs in
  parallel, which is what you need.

### Signed, expiring URLs from scratch {medium core}

Cloud Storage signed URLs are an instance of a general pattern: an HMAC over the request details plus an expiry. Write
`signUrl(secret, method, path, expiresAt)` that returns `path?expires=<unix seconds>&sig=<hex>`, and
`verifyUrl(secret, method, url, now)` that returns `'ok'`, `'expired'`, `'bad-signature'` or `'malformed'`. The
signature covers the method, the path and the expiry. Compare signatures in constant time.

#### Hints

1. Sign the string `${method}\n${path}\n${expires}` with `createHmac('sha256', secret)`.
2. Parse with `new URL(url, 'https://x.invalid')` so relative URLs work, and read `searchParams`.
3. `timingSafeEqual` throws when the buffers differ in length, so check the length first.

#### Solution

Because the method and path are inside the signature, a URL for `GET /a` cannot be reused for `PUT /a` or `GET /b`, and
changing `expires` breaks the signature. Constant-time comparison avoids leaking how many characters matched.

```ts
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';

type Verdict = 'ok' | 'expired' | 'bad-signature' | 'malformed';

function signature(secret: string, method: string, path: string, expires: number): string {
  return createHmac('sha256', secret).update(`${method.toUpperCase()}\n${path}\n${expires}`).digest('hex');
}

export function signUrl(secret: string, method: string, path: string, expiresAt: number): string {
  const expires = Math.floor(expiresAt);
  return `${path}?expires=${expires}&sig=${signature(secret, method, path, expires)}`;
}

export function verifyUrl(secret: string, method: string, url: string, now: number): Verdict {
  const parsed = new URL(url, 'https://x.invalid');
  const rawExpires = parsed.searchParams.get('expires') ?? '';
  const sig = parsed.searchParams.get('sig') ?? '';
  if (!/^\d{1,12}$/.test(rawExpires) || !/^[0-9a-f]{64}$/.test(sig)) return 'malformed';
  const expires = Number(rawExpires);
  const expected = Buffer.from(signature(secret, method, parsed.pathname, expires), 'hex');
  const given = Buffer.from(sig, 'hex');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return 'bad-signature';
  return now <= expires ? 'ok' : 'expired';
}

const secret = 'test-only-signing-key';
const now = 1_760_000_000;
const url = signUrl(secret, 'GET', '/documents/run-7/report.pdf', now + 300);

assert.equal(verifyUrl(secret, 'GET', url, now), 'ok');
assert.equal(verifyUrl(secret, 'GET', url, now + 301), 'expired');
assert.equal(verifyUrl(secret, 'PUT', url, now), 'bad-signature');                                   // other method
assert.equal(verifyUrl(secret, 'GET', url.replace('report', 'secret'), now), 'bad-signature');        // other object
assert.equal(verifyUrl(secret, 'GET', url.replace(/expires=\d+/, `expires=${now + 99999}`), now), 'bad-signature');
assert.equal(verifyUrl('another-key', 'GET', url, now), 'bad-signature');
assert.equal(verifyUrl(secret, 'GET', '/documents/run-7/report.pdf', now), 'malformed');
assert.equal(verifyUrl(secret, 'GET', url.replace(/expires=\d+&/, ''), now), 'malformed');           // no expiry at all
assert.equal(verifyUrl(secret, 'GET', url.replace(/expires=\d+/, 'expires=1e9'), now), 'malformed');
```

Complexity: O(length of the URL).

#### Follow-ups

- **Why check the signature before the expiry?** So an attacker cannot learn anything about valid URLs from the error
  type; both checks are cheap either way.
- **How do real GCS signed URLs differ?** V4 signing covers more (headers, query parameters, a credential scope with the
  date) and is signed with a service account key or the IAM `signBlob` API, so the service never needs a key file.

### Cache secrets and survive a rotation {easy}

Write a `SecretCache` around a fetch function (standing in for Secret Manager's access call). `get(name)` returns a
cached value for `ttl` seconds. `call_with_secret(name, fn)` passes the secret to `fn`; if `fn` raises `AuthError`
(the credential was rotated), it refreshes the secret once and retries; a second `AuthError` propagates. Inject a clock
so the test does not sleep.

#### Hints

1. Store `(value, fetched_at)` per secret name.
2. `refresh=True` bypasses the cache.
3. Retry exactly once, so a truly bad credential does not loop.

#### Solution

Caching avoids calling Secret Manager on every request (its access quota is per project), and the refresh-on-auth-failure
path lets a rotation take effect without a redeploy, even when the old value is still cached.

```python
from collections.abc import Callable
from typing import TypeVar

T = TypeVar("T")


class AuthError(Exception):
    pass


class SecretCache:
    def __init__(self, fetch: Callable[[str], str], ttl: float, clock: Callable[[], float]) -> None:
        self.fetch, self.ttl, self.clock = fetch, ttl, clock
        self.entries: dict[str, tuple[str, float]] = {}

    def get(self, name: str, refresh: bool = False) -> str:
        entry = self.entries.get(name)
        if refresh or entry is None or self.clock() - entry[1] >= self.ttl:
            entry = (self.fetch(name), self.clock())
            self.entries[name] = entry
        return entry[0]

    def call_with_secret(self, name: str, fn: Callable[[str], T]) -> T:
        try:
            return fn(self.get(name))
        except AuthError:
            return fn(self.get(name, refresh=True))   # one retry with a fresh value


versions = {"erp-api-key": "key-v1"}
fetches: list[str] = []
now = [0.0]


def fetch(name: str) -> str:
    fetches.append(name)
    return versions[name]


cache = SecretCache(fetch, ttl=300, clock=lambda: now[0])
assert cache.get("erp-api-key") == "key-v1"
assert cache.get("erp-api-key") == "key-v1" and len(fetches) == 1      # cached
now[0] = 301
assert cache.get("erp-api-key") == "key-v1" and len(fetches) == 2      # TTL expired, refetched

valid = {"key-v2"}


def call_erp(key: str) -> str:
    if key not in valid:
        raise AuthError("401 from ERP")
    return "PO-1001 created"


versions["erp-api-key"] = "key-v2"                                     # rotated; cache still holds v1
assert cache.call_with_secret("erp-api-key", call_erp) == "PO-1001 created"
assert len(fetches) == 3

valid.clear()                                                          # credential revoked everywhere
try:
    cache.call_with_secret("erp-api-key", call_erp)
    raise AssertionError("should propagate")
except AuthError:
    pass
```

Complexity: O(1) per call.

#### Follow-ups

- **Mounted secret files or the API?** On Cloud Run, a mounted secret with `latest` gives a similar effect without
  code; the API gives you control over caching and errors.
- **How do you rotate without downtime?** Create the new credential, add it as a new version, let consumers pick it up
  (cache TTL, refresh on 401, or a new revision), and only then revoke the old credential at the provider.
