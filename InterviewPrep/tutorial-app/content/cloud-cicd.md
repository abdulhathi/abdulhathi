---
title: Cloud services and CI/CD
goal: Map core services across AWS, Azure and GCP, explain event-driven and serverless trade-offs, describe a CI/CD pipeline that promotes one image from Dev to Prod, and answer HIPAA-in-the-cloud questions.
minutes: 35
---

CitiusTech works with clients on all three big clouds, so interviewers often ask "which clouds have you used?" and then
probe whether you understand the concepts behind the service names. Your resume covers all three: **Azure** (AKS, App
Service, Functions, Blob Storage), **AWS** (EC2, S3, Lambda, CodePipeline) and **GCP** (Cloud Run, Cloud Functions,
Cloud Storage, Artifact Registry). The winning move is to answer in concepts first, then name the service on each cloud.

CI/CD questions are where your delivery experience shines: **GitHub Actions and AWS CodePipeline** at Medidata, and
**Dev → SIT → UAT** promotion of containerised FastAPI services on Cloud Run at Quantiphi.

## The same building blocks on three clouds

| Need | AWS | Azure | GCP |
|---|---|---|---|
| Virtual machines | EC2 | Virtual Machines | Compute Engine |
| Managed Kubernetes | EKS | AKS | GKE |
| Serverless containers | ECS on Fargate | Container Apps | Cloud Run |
| Functions | Lambda | Azure Functions | Cloud Run functions (formerly Cloud Functions) |
| Object storage | S3 | Blob Storage | Cloud Storage |
| Managed PostgreSQL | RDS / Aurora | Azure Database for PostgreSQL | Cloud SQL / AlloyDB |
| NoSQL | DynamoDB | Cosmos DB | Firestore / Bigtable |
| Data warehouse | Redshift | Synapse / Microsoft Fabric | BigQuery |
| Queues | SQS | Service Bus queues | Pub/Sub, Cloud Tasks |
| Pub/sub and events | SNS, EventBridge | Service Bus topics, Event Grid | Pub/Sub, Eventarc |
| Event streaming | Kinesis, MSK (Kafka) | Event Hubs | Pub/Sub, Managed Service for Apache Kafka |
| Container registry | ECR | Container Registry (ACR) | Artifact Registry |
| Secrets | Secrets Manager | Key Vault | Secret Manager |
| Identity and access | IAM | Microsoft Entra ID + Azure RBAC | Cloud IAM |
| Monitoring | CloudWatch, X-Ray | Azure Monitor, Application Insights | Cloud Monitoring, Logging, Trace |
| ML platform | SageMaker | Azure Machine Learning | Vertex AI |
| Hosted LLMs | Bedrock | Azure OpenAI | Vertex AI (Gemini, Model Garden) |
| FHIR / health data | HealthLake | Azure Health Data Services | Cloud Healthcare API |
| CI/CD (native) | CodePipeline, CodeBuild | Azure DevOps Pipelines | Cloud Build, Cloud Deploy |

### Serverless functions vs containers vs Kubernetes

| | Functions (Lambda, Azure Functions) | Serverless containers (Cloud Run, Container Apps, Fargate) | Kubernetes (AKS, EKS, GKE) |
|---|---|---|---|
| Unit | A function triggered by an event | Any container image serving HTTP or running a job | Pods, with full control |
| Scaling | Per event, to zero | Per request, to zero | HPA and cluster autoscaler, you tune it |
| Limits | Execution time limits (Lambda: 15 min), cold starts, runtime constraints | Request timeouts, mostly stateless | Few; you own the complexity |
| Best for | Glue code, event handlers, light APIs | Most APIs and jobs; the sweet spot for small teams | Many services, custom networking, GPUs, platform teams |
| Ops burden | Lowest | Low | Highest |

### Event-driven architecture

Instead of services calling each other synchronously, producers emit **events** ("document uploaded", "claim
submitted") and consumers react. The classic cloud pattern is a **storage trigger**: a file lands in a bucket, an event
fires, a function or container picks it up, processes it, and publishes the next event.

```text
upload ──► Cloud Storage bucket ──event──► Cloud Run function ──► Pub/Sub topic ──► extraction service
                                                                       │
                                                                       └──► audit / notification consumers
```

**Your angle:** the Document AI platform at Quantiphi ran on GCP with Cloud Storage, Cloud Functions and Cloud Run:
documents land, processing runs, extracted fields pass the Pydantic validation gate, then go to human review.

### Queues, pub/sub and streams

| Kind | Delivery | Example | Use for |
|---|---|---|---|
| Queue | Each message to **one** consumer (competing consumers) | SQS, Service Bus queue, Cloud Tasks | Spreading work: one claim, one worker |
| Pub/sub topic | Each message to **every** subscription | SNS, Service Bus topic, Pub/Sub | Fan-out: one event, many reactions |
| Event stream | Ordered, retained log; consumers track their own offset and can replay | Kafka, Kinesis, Event Hubs | High-volume events, replay, stream processing |

Most cloud messaging delivers **at least once**, so the same message can arrive twice. Consumers must be
**idempotent**, and messages that keep failing go to a **dead-letter queue** after a few attempts instead of blocking
the queue forever. The first coding problem below builds exactly that.

## CI/CD

```text
 commit / PR ──► CI: lint, type-check, unit tests, build image, scan image, push with the commit SHA tag
                         │
 merge to main ──► deploy to Dev ──► integration / smoke tests ──► SIT ──► UAT (sign-off) ──► Prod (approval, canary)
                    same image digest promoted at every step; only configuration changes per environment
```

Principles to say out loud:

- **Build once, promote the same artefact.** The image tested in UAT is byte-for-byte the image in Prod; environments
  differ only in configuration and secrets.
- **Fast feedback:** lint and unit tests on every pull request in minutes; slower suites after merge.
- **Gates:** required reviews and passing checks before merge; manual approval before Prod in regulated work.
- **No long-lived cloud keys in CI:** use OIDC federation (GitHub → GCP Workload Identity Federation, Azure federated
  credentials, AWS IAM roles).
- **Easy rollback:** immutable tags and revisions, so rollback means redeploying the previous version.

### A GitHub Actions workflow: test, build, push, deploy to Cloud Run

```yaml
name: ci-cd
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  id-token: write          # lets jobs request an OIDC token: no service-account key stored in GitHub

env:
  REGION: us-central1
  IMAGE: us-central1-docker.pkg.dev/my-project/apps/doc-api

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -r requirements.txt -r requirements-dev.txt
      - run: ruff check .
      - run: pytest -q --cov=app

  build-and-deploy-dev:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.DEPLOY_SA }}
      - uses: google-github-actions/setup-gcloud@v2
      - run: gcloud auth configure-docker us-central1-docker.pkg.dev --quiet
      - run: |
          docker build -t "$IMAGE:${{ github.sha }}" .
          docker push "$IMAGE:${{ github.sha }}"
      - uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: doc-api-dev
          region: ${{ env.REGION }}
          image: ${{ env.IMAGE }}:${{ github.sha }}

  deploy-prod:
    needs: build-and-deploy-dev
    runs-on: ubuntu-latest
    environment: production   # protection rules: required reviewers must approve before this job runs
    steps:
      - uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ vars.WIF_PROVIDER }}
          service_account: ${{ vars.DEPLOY_SA }}
      - uses: google-github-actions/deploy-cloudrun@v2
        with:
          service: doc-api
          region: ${{ env.REGION }}
          image: ${{ env.IMAGE }}:${{ github.sha }}   # the same image that passed Dev
```

### Release strategies

| Strategy | How | Rollback |
|---|---|---|
| Rolling | Replace instances a few at a time | Roll forward or undo the rollout |
| Blue-green | Stand up the new version beside the old, switch all traffic at once | Switch back instantly |
| Canary | Send a small percentage to the new version, watch metrics, increase | Move the percentage back to 0 |
| Feature flags | Ship code dark, turn features on per user or tenant | Turn the flag off, no deploy |

### Infrastructure as code

**Terraform** describes infrastructure declaratively (`.tf` files); `terraform plan` shows the diff and `terraform apply`
makes it so. It works on all three clouds. Its **state file** maps code to real resources: keep it in a remote backend
with locking (a storage bucket), protect it because it can contain secrets, and never edit cloud resources by hand or
the state drifts. Organise reusable **modules** and one configuration per environment. Native alternatives:
CloudFormation/CDK (AWS), Bicep (Azure).

### Observability

| Signal | Answers | Tools |
|---|---|---|
| Logs | What happened, in detail? (structured JSON, with a request ID) | Cloud Logging, Azure Monitor Logs, CloudWatch Logs |
| Metrics | How much, how fast, how often? (latency, error rate, saturation) | Prometheus, Cloud Monitoring, Azure Monitor |
| Traces | Where did this request spend its time across services? | OpenTelemetry → Cloud Trace, Application Insights, X-Ray |

**OpenTelemetry** is the vendor-neutral standard for emitting all three. Alert on symptoms users feel (error rate,
latency against an SLO), not on every CPU spike. In healthcare, logs must never contain PHI: log IDs, not names or
diagnoses.

### HIPAA in the cloud

AWS, Azure and GCP all sign a **Business Associate Agreement (BAA)**, but it covers only their **HIPAA-eligible
services**, and only when you configure them properly. It is a **shared responsibility** model: the provider secures the
infrastructure; you are responsible for encryption settings, access control (least privilege), audit logging, network
isolation, backups and not putting PHI in services outside the BAA (for example, a third-party logging tool or an LLM
API without a BAA).

## Interview questions

### Which cloud services would you use for a typical Python API with a database, on each cloud? {core}

Concept first: a container platform for the API, a managed PostgreSQL database, object storage for files, a secret
store, a registry for images, and monitoring. On **GCP**: Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact
Registry, Cloud Logging and Monitoring. On **Azure**: AKS or Container Apps, Azure Database for PostgreSQL, Blob Storage,
Key Vault, ACR, Azure Monitor and Application Insights. On **AWS**: ECS on Fargate or EKS, RDS, S3, Secrets Manager, ECR,
CloudWatch.

**Your angle:** "I have deployed on GCP (Cloud Run through Artifact Registry, with Cloud Storage) and Azure (AKS),
and worked with AWS (EC2, S3, Lambda, CodePipeline). The concepts carry over; the names change."

### When would you choose serverless functions, serverless containers or Kubernetes? {core}

Functions for small event handlers and glue code: a file lands, a message arrives, a schedule fires. Serverless
containers such as Cloud Run for most APIs and batch jobs, because I get any language and library in a standard
container, scale to zero and almost no operations. Kubernetes when the system has many services that need a shared
platform, custom networking, sidecars, GPUs or long-running stateful work, and the team can operate it.

The trade-offs of functions to mention: cold starts, execution time limits (15 minutes on Lambda), harder local
testing and more vendor lock-in.

### What is event-driven architecture, and when is it a good fit? {core}

Services communicate by publishing events to a broker instead of calling each other directly. Producers do not know
who consumes the event, so you can add consumers (audit, notifications, analytics) without changing the producer. It
absorbs traffic spikes through queues and isolates failures. It fits workflows that are naturally asynchronous, such as
document processing, claims intake and notifications. The costs are eventual consistency, harder debugging (you need
correlation IDs and tracing), and handling duplicates and ordering.

**Your angle:** document upload to Cloud Storage triggering processing on the Quantiphi Document AI platform.

### Queue vs pub/sub vs event stream: what is the difference?

A **queue** gives each message to one of several competing consumers: use it to distribute work, such as one claim
per worker. A **pub/sub topic** copies each message to every subscription: use it for fan-out, where one "claim
submitted" event feeds validation, audit and notifications. An **event stream** like Kafka keeps an ordered,
replayable log; each consumer group tracks its own position, which suits high-volume event processing and rebuilding
state by replaying history.

### Messages can be delivered more than once. How do you handle that? {core}

Design consumers to be **idempotent**: processing the same message twice has the same effect as once. Give each message
a unique ID and record processed IDs (or use a natural key with an upsert), so a duplicate is acknowledged and skipped.
Acknowledge only after the work is committed. Retry transient failures with backoff, and after a few failed attempts
move the message to a **dead-letter queue** with the error, so one poison message does not block the queue and someone
can inspect and replay it. The coding problem below implements this.

### What does a good CI/CD pipeline look like? {core}

On every pull request: lint, type-check, unit tests and a build, all in a few minutes, plus required code review. On
merge to main: build one container image tagged with the commit SHA, scan it, push it to the registry, deploy it to Dev
and run smoke and integration tests. Then promote the **same image** through SIT and UAT with sign-off, and to Prod
behind a manual approval and a canary or blue-green release, with automatic rollback on bad health metrics. Secrets
come from a vault, and CI authenticates to the cloud with OIDC rather than stored keys.

**Your angle:** "At Medidata I automated pipelines with GitHub Actions and AWS CodePipeline, with Cypress and Cucumber
tests; at Quantiphi our services were promoted through Dev, SIT and UAT on Cloud Run."

### Why "build once, promote everywhere"?

If you rebuild for each environment, the Prod artefact is not the one you tested: a dependency could resolve to a
newer version or a build flag could differ. Building one image, tagged with the commit SHA (or pinned by digest), and
promoting it unchanged from Dev to SIT to UAT to Prod guarantees that what passed testing is what runs in production.
Only configuration and secrets differ per environment, injected at deploy time. It also makes rollback exact.

### Rolling, blue-green, canary or feature flags: when do you use each? {core}

**Rolling** is the default on Kubernetes and fine for low-risk changes. **Blue-green** when you need an instant,
all-at-once switch and instant rollback, for example with a database-compatible release. **Canary** for risky changes:
send 5% of traffic, compare error rate and latency with the old version, then ramp up; Cloud Run revisions and traffic
splitting make this easy. **Feature flags** separate deploying code from releasing a feature, so you can turn a feature
on per tenant or turn it off in seconds without a deploy.

### How should CI authenticate to the cloud? {deep}

Not with long-lived keys stored as CI secrets, which leak and rarely get rotated. Use **OIDC federation**: the CI
provider issues a short-lived signed token for each job, and the cloud trusts tokens from that specific repository and
branch and exchanges them for short-lived credentials. On GCP that is Workload Identity Federation, on Azure federated
credentials on an Entra app or managed identity, on AWS an IAM role assumed with web identity. Scope the deploy identity
to the minimum permissions it needs.

### What is infrastructure as code, and what should you know about Terraform?

Infrastructure as code defines cloud resources in version-controlled files, so environments are reproducible,
reviewed in pull requests and consistent between Dev and Prod. Terraform is declarative and multi-cloud: `plan` shows
what will change and `apply` makes it so. Key points: store state remotely with locking, protect it because it can
contain secrets, use modules for reuse, run `plan` in CI on every change, and avoid manual changes in the console,
which cause drift.

### How do you manage secrets? {core}

Keep them out of code, images and Git. Store them in a managed secret store (Key Vault, Secret Manager, Secrets
Manager), and inject them at runtime as environment variables or mounted files, ideally using workload identity so the
service itself needs no credential to read them. Apply least privilege per service, rotate regularly, audit access,
and scan repositories for leaked secrets in CI. In Kubernetes, sync from the vault (for example the Secrets Store CSI
driver) rather than hand-made Secrets.

### What is the difference between logs, metrics and traces?

**Logs** are detailed event records, best as structured JSON with a request ID so you can follow one request.
**Metrics** are numbers over time (request rate, error rate, latency percentiles, CPU) that are cheap to store and drive
dashboards and alerts. **Traces** follow a single request across services as a tree of timed spans, showing where
latency comes from. OpenTelemetry instruments all three in a vendor-neutral way. You alert on metrics, then use traces
and logs to find the cause.

### What are SLIs, SLOs and error budgets? {deep}

An **SLI** is a measured indicator of user experience, such as the percentage of requests served successfully in under
300 ms. An **SLO** is the target for it, say 99.9% over 30 days. An **SLA** is a contractual promise to customers, usually
looser than the SLO, with penalties. The **error budget** is the allowed failure (0.1% of requests): while budget remains,
teams ship freely; when it is spent, they prioritise reliability work. Alerts should fire on fast budget burn, not on
individual blips.

**Your angle:** the healthcare REST APIs you delivered at Cognizant ran at 99.99% uptime, about 4.3 minutes of downtime
a month.

### Production is failing. Walk me through how you handle it. {core}

First stabilise: confirm the impact from dashboards and alerts, communicate in the incident channel, and mitigate fast,
often by rolling back the last deployment, shifting traffic or scaling up, before hunting the root cause. Then
investigate with metrics to find when and where it started, traces to find the failing dependency, and logs filtered by
request ID for the error. After recovery, write a blameless post-incident review with the timeline, root cause and
follow-up actions such as a new alert, a test or a runbook.

**Your angle:** "At The Dot Corp I assisted with production support and investigation of OrderingStore service
disruptions during an Azure regional outage."

### How do you design for high availability and disaster recovery? {core}

Remove single points of failure: run several instances across **availability zones**, use zone-redundant managed
databases with automatic failover, and keep services stateless behind a load balancer. For disaster recovery, agree
the **RPO** (how much data you can lose) and **RTO** (how long you can be down) with the business, then choose
backups, cross-region replication and a warm-standby or active-active second region to meet them. Test failover
regularly, because an untested DR plan is a hope, not a plan. A regional outage is exactly the case multi-region design
protects against.

### Trunk-based development or GitFlow? Merge or rebase?

**Trunk-based development** means short-lived branches merged to main at least daily, behind feature flags if needed,
with main always deployable. It pairs well with CI/CD and is what most high-performing teams use. **GitFlow** has
long-lived develop and release branches, which suits scheduled releases but causes painful merges. On merging: a
**merge commit** preserves exact history, **rebase** gives a linear history but rewrites commits (never rebase shared
branches), and **squash merge** turns a pull request into one clean commit on main. Whatever the team chooses, protect
main with required reviews and passing checks.

### What does HIPAA mean for cloud architecture? {core}

The cloud provider must sign a **BAA**, and PHI may only go into services the BAA covers (each provider lists its
HIPAA-eligible services). Responsibility is shared: the provider secures the physical infrastructure; we must encrypt
data at rest and in transit, enforce least-privilege access with MFA, keep audit logs of who accessed PHI, isolate
networks (private endpoints, no public buckets), back up data, and keep PHI out of logs, error trackers, non-production
environments and any third-party tool or LLM API without a BAA.

### How do you keep cloud costs under control? {deep}

Visibility first: tag resources by team and environment and review spend per service. Then right-size instances and
requests from real usage, autoscale and scale to zero where possible (Cloud Run, Functions), use committed-use or
reserved pricing for steady load and spot instances for fault-tolerant batch work, set storage lifecycle rules to move
old data to cheaper tiers, shut down idle non-production environments, and set budgets with alerts. Data egress and
always-on databases are frequent surprise costs.

### What does an API gateway do? {deep}

It is a single managed entry point in front of backend services that handles cross-cutting concerns: authentication
(validating JWTs or API keys), rate limiting and quotas, routing and versioning, request transformation, TLS
termination, caching and centralised logging. Examples: Amazon API Gateway, Azure API Management, Google API Gateway or
Apigee. It keeps that logic out of every service, at the cost of an extra hop and another component to operate.

### How do you keep data consistent across services without distributed transactions? {deep}

Avoid two-phase commit across services; use patterns built for eventual consistency. The **outbox pattern**: write the
business change and an "event to publish" row in the same local database transaction, and a relay publishes outbox
rows to the broker, so you never update the database but lose the event. A **saga** splits a business transaction into
local steps, each publishing an event, with compensating actions to undo earlier steps if a later one fails. Consumers
stay idempotent because events may be delivered twice.

## Coding problems

### An idempotent message consumer with retries and a dead-letter queue {medium core}

A queue delivers claim events at least once, so duplicates happen. Write a `Consumer` with a `handle(message)` method
that:

- processes each message ID at most once (duplicates are acknowledged and skipped),
- retries a failing message up to `max_attempts` times in total,
- after the last failed attempt, moves the message to a dead-letter list with the error, and
- returns what happened: `"processed"`, `"duplicate"`, `"retry"` or `"dead-lettered"`.

Messages are dicts like `{"id": "m1", "claim_id": "C1", "amount": 120.0}`.

#### Hints

1. Keep a set of processed IDs, and a dict of attempt counts per message ID.
2. Only record an ID as processed after the work succeeds; if the work raises, count the attempt instead.
3. Returning `"retry"` stands for "do not acknowledge": the broker will redeliver it later.

#### Solution

The processed-ID set makes the consumer idempotent; the attempt counter plus dead-letter list keeps one poison message
from being retried forever. In production the processed IDs live in a database (often a unique constraint written in
the same transaction as the business change) so they survive restarts and are shared by all consumer instances.

```python
from collections.abc import Callable
from dataclasses import dataclass, field

Message = dict[str, object]

@dataclass
class Consumer:
    work: Callable[[Message], None]
    max_attempts: int = 3
    processed: set[str] = field(default_factory=set)
    attempts: dict[str, int] = field(default_factory=dict)
    dead_letters: list[tuple[Message, str]] = field(default_factory=list)

    def handle(self, message: Message) -> str:
        msg_id = str(message["id"])
        if msg_id in self.processed:
            return "duplicate"                    # already done: acknowledge and skip
        try:
            self.work(message)
        except Exception as exc:                  # in real code, catch the specific transient errors
            self.attempts[msg_id] = self.attempts.get(msg_id, 0) + 1
            if self.attempts[msg_id] >= self.max_attempts:
                self.dead_letters.append((message, f"{type(exc).__name__}: {exc}"))
                self.processed.add(msg_id)        # stop redelivery; it now lives in the DLQ
                return "dead-lettered"
            return "retry"                        # not acknowledged: the broker redelivers it
        self.processed.add(msg_id)
        self.attempts.pop(msg_id, None)
        return "processed"

totals: dict[str, float] = {}
flaky_calls = {"m3": 0}

def apply_claim(msg: Message) -> None:
    if msg["amount"] is None:
        raise ValueError("amount missing")
    if msg["id"] == "m3" and flaky_calls["m3"] < 1:   # fails once, then succeeds (a transient error)
        flaky_calls["m3"] += 1
        raise TimeoutError("database timeout")
    claim = str(msg["claim_id"])
    totals[claim] = totals.get(claim, 0.0) + float(msg["amount"])  # not idempotent by itself

consumer = Consumer(apply_claim, max_attempts=3)
m1 = {"id": "m1", "claim_id": "C1", "amount": 120.0}
m2 = {"id": "m2", "claim_id": "C2", "amount": None}
m3 = {"id": "m3", "claim_id": "C1", "amount": 30.0}

assert consumer.handle(m1) == "processed"
assert consumer.handle(m1) == "duplicate"          # redelivered: not counted twice
assert totals == {"C1": 120.0}

assert [consumer.handle(m2) for _ in range(3)] == ["retry", "retry", "dead-lettered"]
assert consumer.dead_letters == [(m2, "ValueError: amount missing")]
assert consumer.handle(m2) == "duplicate"          # no more retries after dead-lettering

assert consumer.handle(m3) == "retry"              # transient failure
assert consumer.handle(m3) == "processed"          # succeeds on redelivery
assert totals == {"C1": 150.0}
```

Complexity: O(1) per message, O(n) memory for processed IDs (in production, expire them after the broker's maximum
redelivery window, or rely on a unique key in the database).

#### Follow-ups

- **What if the process crashes after the work but before recording the ID?** The message is redelivered and processed
  twice. Fix: record the ID in the same database transaction as the business change, or make the change itself
  idempotent (an upsert keyed by message ID).
- **How do real brokers implement the DLQ?** SQS redrive policies (`maxReceiveCount`), Service Bus max delivery count,
  and Pub/Sub dead-letter topics with a maximum number of delivery attempts.
- **Should every error be retried?** No: retry transient errors (timeouts, throttling); send validation errors like a
  missing amount straight to the DLQ.

### Structured JSON logs with a request ID {easy}

Cloud logging tools search and filter JSON logs far better than plain text. Write a `logging.Formatter` that outputs one
JSON object per line with `level`, `logger`, `message`, the current `request_id` (from a `contextvars.ContextVar`, so
each request or task has its own), any extra fields passed as `extra={"fields": {...}}`, and for exceptions an `error`
field with the last line of the traceback.

#### Hints

1. Override `format(record)` and build a dict; `record.getMessage()` applies the `%` arguments.
2. A `ContextVar` holds a value per request (and per asyncio task), unlike a global variable.
3. `record.exc_info` is set when you call `logger.exception(...)`; `self.formatException(record.exc_info)` gives the traceback text.

#### Solution

One JSON object per line is what Cloud Logging, Azure Monitor and CloudWatch parse into searchable fields. The request
ID lets you pull every log line for one request across services. Pass identifiers, never PHI such as names or
diagnoses.

```python
import contextvars
import io
import json
import logging

request_id: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, object] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": request_id.get(),
        }
        payload.update(getattr(record, "fields", {}))
        if record.exc_info:
            payload["error"] = self.formatException(record.exc_info).splitlines()[-1]
        return json.dumps(payload)

stream = io.StringIO()
handler = logging.StreamHandler(stream)
handler.setFormatter(JsonFormatter())
log = logging.getLogger("claims")
log.addHandler(handler)
log.setLevel(logging.INFO)
log.propagate = False

request_id.set("req-42")                     # a middleware would set this per request
log.info("claim scored", extra={"fields": {"claim_id": "C1", "duration_ms": 12}})
try:
    1 / 0
except ZeroDivisionError:
    log.exception("scoring failed")

first, second = (json.loads(line) for line in stream.getvalue().splitlines())
assert first == {"level": "INFO", "logger": "claims", "message": "claim scored",
                 "request_id": "req-42", "claim_id": "C1", "duration_ms": 12}
assert second["level"] == "ERROR" and second["request_id"] == "req-42"
assert second["error"] == "ZeroDivisionError: division by zero"
```

Complexity: O(size of the record) per log line.

#### Follow-ups

- **How does the request ID get set?** A FastAPI middleware reads an incoming `X-Request-ID` header (or generates a
  UUID), sets the `ContextVar`, and adds the ID to the response headers so callers can quote it.
- **How would you stop PHI from reaching logs?** Log only IDs, add a filter that masks known sensitive fields, and test
  it; also restrict who can read production logs.
