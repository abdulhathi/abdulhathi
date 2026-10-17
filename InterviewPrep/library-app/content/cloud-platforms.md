---
title: "Cloud platforms: AWS, Azure and GCP"
goal: Map the core services across AWS, Azure and GCP, explain serverless, event-driven and messaging trade-offs, and answer observability, reliability, compliance and cost questions in concepts first, then service names.
minutes: 35
---

Many teams work across more than one cloud, so interviewers often ask "which clouds have you used?" and then probe
whether you understand the concepts behind the service names. The winning move is to answer in concepts first (a
container platform, a managed PostgreSQL, a queue, a secret store), then name the service on each cloud.

**Your angle:** your resume covers all three. **Azure:** AKS, App Service, Functions, Blob Storage. **AWS:** EC2, S3,
Lambda, VPC, Route 53, CodePipeline. **GCP:** Cloud Run, Cloud Functions, Cloud Storage, Artifact Registry. Deployment
pipelines are covered in [CI/CD and Terraform](#/cicd-terraform), containers in
[Docker and Kubernetes](#/docker-k8s), and GCP in depth in [Cloud Run](#/cloud-run) and [GCP services](#/gcp-services).

## The same building blocks on three clouds

| Need | AWS | Azure | GCP |
|---|---|---|---|
| Virtual machines | EC2 | Virtual Machines | Compute Engine |
| Managed Kubernetes | EKS | AKS | GKE |
| Serverless containers | ECS on Fargate (ECS Express Mode for the simplest path) | Container Apps | Cloud Run |
| Functions | Lambda | Azure Functions | Cloud Run functions (formerly Cloud Functions) |
| Object storage | S3 | Blob Storage | Cloud Storage |
| Managed PostgreSQL | RDS / Aurora | Azure Database for PostgreSQL | Cloud SQL / AlloyDB |
| NoSQL | DynamoDB | Cosmos DB | Firestore / Bigtable |
| In-memory cache | ElastiCache | Azure Managed Redis | Memorystore (Redis, Valkey) |
| Data warehouse | Redshift | Microsoft Fabric (Synapse Analytics for existing workloads) | BigQuery |
| Queues | SQS | Service Bus queues | Pub/Sub, Cloud Tasks |
| Pub/sub and events | SNS, EventBridge | Service Bus topics, Event Grid | Pub/Sub, Eventarc |
| Event streaming | Kinesis, MSK (Kafka) | Event Hubs | Pub/Sub, Managed Service for Apache Kafka |
| API gateway | Amazon API Gateway | API Management | API Gateway, Apigee |
| Container registry | ECR | Container Registry (ACR) | Artifact Registry |
| Secrets | Secrets Manager | Key Vault | Secret Manager |
| Identity and access | IAM | Microsoft Entra ID + Azure RBAC | Cloud IAM |
| Monitoring | CloudWatch, X-Ray | Azure Monitor, Application Insights | Cloud Monitoring, Logging, Trace |
| ML and hosted LLMs | SageMaker AI, Bedrock | Azure Machine Learning, Microsoft Foundry (Azure OpenAI models) | Gemini Enterprise Agent Platform (formerly Vertex AI) |
| FHIR / health data | HealthLake | Azure Health Data Services | Cloud Healthcare API |
| CI/CD (native) | CodePipeline, CodeBuild | Azure DevOps Pipelines | Cloud Build, Cloud Deploy |
| Infrastructure as code (native) | CloudFormation, CDK | Bicep / ARM | Infrastructure Manager (runs Terraform) |

Service names move, so expect to hear old ones in interviews: Cloud Functions became Cloud Run functions (2024), Amazon
SageMaker became SageMaker AI (December 2024), Azure AI Foundry became Microsoft Foundry (November 2025), Vertex AI
became part of the Gemini Enterprise Agent Platform (April 2026). Some services are winding down: Azure Cache for Redis
accepts no new caches and retires in 2027–2028 in favour of Azure Managed Redis, and AWS App Runner closed to new
customers in April 2026 (AWS points to ECS Express Mode). The concept matters more than the current name, but knowing
the change shows you keep up.

## Serverless functions vs serverless containers vs Kubernetes

| | Functions (Lambda, Azure Functions) | Serverless containers (Cloud Run, Container Apps, Fargate) | Kubernetes (AKS, EKS, GKE) |
|---|---|---|---|
| Unit | A function triggered by an event | Any container image serving HTTP or running a job | Pods, with full control |
| Scaling | Per event, to zero | Per request, to zero | HPA and cluster autoscaler, you tune it |
| Limits | Execution time limits (Lambda: 15 min), cold starts, runtime constraints | Request timeouts, mostly stateless | Few; you own the complexity |
| Best for | Glue code, event handlers, light APIs | Most APIs and jobs; the sweet spot for small teams | Many services, custom networking, GPUs, platform teams |
| Ops burden | Lowest | Low | Highest |

## Event-driven architecture

Instead of services calling each other synchronously, producers emit **events** ("document uploaded", "order
placed", "claim submitted") and consumers react. The classic cloud pattern is a **storage trigger**: a file lands in a
bucket, an event fires, a function or container picks it up, processes it, and publishes the next event.

```text
upload ──► Cloud Storage bucket ──event──► Cloud Run function ──► Pub/Sub topic ──► extraction service
                                                                       │
                                                                       └──► audit / notification consumers
```

The same shape on AWS is S3 → EventBridge or SQS → Lambda → SNS, and on Azure Blob Storage → Event Grid → Functions →
Service Bus.

**Your angle:** the Document AI platform at Quantiphi ran on GCP, with Cloud Run services, Cloud Functions, and Cloud
Storage with signed URLs for documents. Describe the event flow only as far as you actually built it.

### Queues, pub/sub and streams

| Kind | Delivery | Example | Use for |
|---|---|---|---|
| Queue | Each message to **one** consumer (competing consumers) | SQS, Service Bus queue, Cloud Tasks | Spreading work: one job, one worker |
| Pub/sub topic | Each message to **every** subscription | SNS, Service Bus topic, Pub/Sub | Fan-out: one event, many reactions |
| Event stream | Ordered, retained log; consumers track their own offset and can replay | Kafka, Kinesis, Event Hubs | High-volume events, replay, stream processing |

Most cloud messaging delivers **at least once**, so the same message can arrive twice: consumers must be idempotent, and
messages that keep failing go to a dead-letter queue instead of blocking the queue. [Task queues](#/task-queues) covers
idempotent consumers, retries, dead-lettering and the outbox pattern in depth, and [Microservices](#/microservices)
covers sagas and API gateways.

## Observability

| Signal | Answers | Tools |
|---|---|---|
| Logs | What happened, in detail? (structured JSON, with a request ID) | Cloud Logging, Azure Monitor Logs, CloudWatch Logs |
| Metrics | How much, how fast, how often? (latency, error rate, saturation) | Prometheus, Cloud Monitoring, Azure Monitor |
| Traces | Where did this request spend its time across services? | OpenTelemetry → Cloud Trace, Application Insights, X-Ray |

**OpenTelemetry** is the vendor-neutral standard for emitting all three. Alert on symptoms users feel (error rate,
latency against an SLO), not on every CPU spike. Logs must never contain sensitive data such as passwords, tokens or
personal health information: log identifiers, not names or diagnoses.

## Compliance in the cloud

Cloud providers certify their infrastructure (SOC 2, ISO 27001, FedRAMP and others) and, for US healthcare, AWS, Azure
and GCP all sign a **Business Associate Agreement (BAA)** under HIPAA. A BAA covers only the provider's listed
**eligible services**, and only when you configure them properly. It is a **shared responsibility** model: the provider
secures the physical infrastructure; you are responsible for encryption settings, access control (least privilege),
audit logging, network isolation, backups, and not putting regulated data into services outside the agreement (for
example, a third-party logging tool or an LLM API without a BAA). [HIPAA, PHI and security engineering](#/hipaa) goes
deeper.

## Interview questions

### Which cloud services would you use for a typical API with a database, on each cloud? {core}

Concept first: a container platform for the API, a managed PostgreSQL database, object storage for files, a secret
store, a registry for images, and monitoring. On **GCP**: Cloud Run, Cloud SQL, Cloud Storage, Secret Manager, Artifact
Registry, Cloud Logging and Monitoring. On **Azure**: AKS or Container Apps, Azure Database for PostgreSQL, Blob Storage,
Key Vault, ACR, Azure Monitor and Application Insights. On **AWS**: ECS on Fargate or EKS, RDS, S3, Secrets Manager, ECR,
CloudWatch.

**Your angle:** "I have deployed on GCP (Docker images through Artifact Registry to Cloud Run) and Azure (AKS), and
worked with AWS (EC2, S3, Lambda, CodePipeline). The concepts carry over; the names change."

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
document processing, order fulfilment and notifications. The costs are eventual consistency, harder debugging (you need
correlation IDs and tracing), and handling duplicates and ordering.

### Queue vs pub/sub vs event stream: what is the difference?

A **queue** gives each message to one of several competing consumers: use it to distribute work, such as one job per
worker. A **pub/sub topic** copies each message to every subscription: use it for fan-out, where one "order placed"
event feeds billing, audit and notifications. An **event stream** like Kafka keeps an ordered, replayable log; each
consumer group tracks its own position, which suits high-volume event processing and rebuilding state by replaying
history.

### How do you manage secrets in the cloud? {core}

Keep them out of code, images and Git. Store them in the cloud's secret store (Key Vault, Secret Manager, Secrets
Manager), and inject them at runtime as environment variables or mounted files, using workload identity so the service
itself needs no credential to read them. Apply least privilege per service, rotate regularly, audit access, and scan
repositories for leaked secrets in CI. In Kubernetes, sync from the vault (for example the Secrets Store CSI driver)
rather than hand-made Secrets.

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

**Your angle:** the REST APIs you delivered at Cognizant achieved 99.99% uptime, about 4.3 minutes of downtime a month.

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

### What does compliance, such as HIPAA, mean for cloud architecture?

The provider must sign the relevant agreement (a **BAA** for HIPAA), and regulated data may only go into services the
agreement covers (each provider lists its eligible services). Responsibility is shared: the provider secures the
physical infrastructure; we must encrypt data at rest and in transit, enforce least-privilege access with MFA, keep
audit logs of who accessed the data, isolate networks (private endpoints, no public buckets), back up data, and keep
regulated data out of logs, error trackers, non-production environments and any third-party tool or LLM API without an
agreement.

### How do you keep cloud costs under control? {deep}

Visibility first: tag resources by team and environment and review spend per service. Then right-size instances and
requests from real usage, autoscale and scale to zero where possible (Cloud Run, Functions), use committed-use or
reserved pricing for steady load and spot instances for fault-tolerant batch work, set storage lifecycle rules to move
old data to cheaper tiers, shut down idle non-production environments, and set budgets with alerts. Data egress and
always-on databases are frequent surprise costs.

### Would you build for several clouds at once? {deep}

Usually not on day one. Running the same system on two clouds doubles the operational surface and pushes you to the
lowest common denominator of each provider's services. I keep the system portable where it is cheap (containers,
PostgreSQL, OpenTelemetry, Terraform, a thin adapter around messaging and storage) and use one cloud's managed services
well. Real multi-cloud makes sense for regulatory or customer requirements, or when an acquisition brings a second
cloud; even then, split by workload rather than running everything everywhere.

## Coding problems

### Structured JSON logs with a request ID {easy}

Cloud logging tools search and filter JSON logs far better than plain text. Write a `logging.Formatter` that outputs one
JSON object per line with `level`, `logger`, `message`, the current `request_id` (from a `contextvars.ContextVar`, so
each request or task has its own), any extra fields passed as `extra={"fields": {...}}`, and for exceptions an `error`
field with the last line of the traceback.

#### Hints

1. Override `format(record)` and build a dict; `record.getMessage()` applies the `%` arguments.
2. A `ContextVar` holds a value per request (and per asyncio task), unlike a global variable.
3. Look at what `record.exc_info` holds when you call `logger.exception(...)`, and which `Formatter` method turns it into text.

#### Solution

One JSON object per line is what Cloud Logging, Azure Monitor and CloudWatch parse into searchable fields. The request
ID lets you pull every log line for one request across services. Pass identifiers, never sensitive data such as names,
tokens or diagnoses. (The [Cloud Run chapter](#/cloud-run) adds the GCP-specific fields that link a log line to its
trace.)

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
log = logging.getLogger("orders")
log.addHandler(handler)
log.setLevel(logging.INFO)
log.propagate = False

request_id.set("req-42")                     # a middleware would set this per request
log.info("order scored", extra={"fields": {"order_id": "O1", "duration_ms": 12}})
try:
    1 / 0
except ZeroDivisionError:
    log.exception("scoring failed")

first, second = (json.loads(line) for line in stream.getvalue().splitlines())
assert first == {"level": "INFO", "logger": "orders", "message": "order scored",
                 "request_id": "req-42", "order_id": "O1", "duration_ms": 12}
assert second["level"] == "ERROR" and second["request_id"] == "req-42"
assert second["error"] == "ZeroDivisionError: division by zero"
```

Complexity: O(size of the record) per log line.

#### Follow-ups

- **How does the request ID get set?** A middleware reads an incoming `X-Request-ID` header (or generates a UUID), sets
  the `ContextVar`, and adds the ID to the response headers so callers can quote it.
- **How would you stop sensitive data from reaching logs?** Log only IDs, add a filter that masks known sensitive
  fields, and test it; also restrict who can read production logs.
