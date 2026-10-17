---
title: Cloud Run in depth
goal: Explain how Cloud Run runs, scales, bills and secures a container, what it means for streaming (SSE, WebSockets, gRPC), and how you ship and operate services on it, using your own Dev/SIT/UAT deployments as the example.
minutes: 45
---

Cloud Run is Google Cloud's default home for stateless APIs, chat backends and orchestration services, so any role on
GCP will ask about it. Expect questions on how it scales (concurrency, instances, cold starts), how long a
request can live (which decides how you stream LLM tokens), how services authenticate to each other, and how you
release safely with revisions and traffic splitting.

This is home ground. At Quantiphi you containerised the Document AI platform's services with **Docker** and deployed them
through **Artifact Registry** to **Cloud Run** across **Dev, SIT and UAT** releases. Lead with that, then show you know the
parts that matter for a real-time platform: request timeouts, WebSocket behaviour, session affinity and HTTP/2.

## Cloud Run at a glance

| Resource | What it runs | Triggered by | Typical use |
|---|---|---|---|
| **Service** | A container that serves HTTP, gRPC or WebSocket requests on `$PORT` | Requests (public URL, load balancer, Pub/Sub push, Eventarc) | Chat API, SSE/WebSocket gateway, orchestration API, webhooks |
| **Job** | A container that runs tasks to completion, optionally many in parallel | `gcloud run jobs execute`, Cloud Scheduler, Workflows, API | Long agent runs, batch backfills, migrations, nightly reports |
| **Worker pool** | Always-on instances with no request endpoint (generally available since April 2026) | Nothing: the code pulls its own work | Pull-based consumers (for example a Pub/Sub pull subscriber) |
| **Function** | Cloud Run functions (formerly Cloud Functions 2nd gen): source code built into a Cloud Run service for you | HTTP or events | Small glue: a GCS upload handler, a webhook adapter |

### The container contract

- Listen on **`0.0.0.0:$PORT`** (8080 by default), never `127.0.0.1`. The ingress container gets `PORT`, `K_SERVICE`,
  `K_REVISION` and `K_CONFIGURATION`.
- **Start listening within 4 minutes.** The default startup probe is a TCP check on the port.
- **Stateless:** the filesystem is in memory and counts against the memory limit; nothing written there survives the
  instance. State goes to Cloud SQL, Firestore, Memorystore or Cloud Storage.
- **Shutdown:** Cloud Run sends **SIGTERM** and then **SIGKILL 10 seconds later**. Idle instances are shut down after
  at most 15 minutes unless minimum instances keep them.
- Images run on **64-bit Linux (x86_64)**, so build with `--platform linux/amd64` on an Apple Silicon Mac.

### Numbers worth knowing (checked against the current docs)

| Setting | Value |
|---|---|
| Request timeout (services) | Default **5 minutes**, maximum **60 minutes** |
| Concurrency per instance | Default **80** in the console; **80 × vCPUs** for new services deployed with gcloud or Terraform; maximum **1,000** |
| Maximum instances | Default **100 per revision**; also bounded by regional quota |
| Size per instance | Up to **8 vCPU** and **32 GiB** memory; GPUs are available |
| Request and response size | **32 MiB** on HTTP/1 unless the response is streamed; no request limit with HTTP/2 end-to-end |
| HTTP/2 | Up to **100 concurrent streams** per client connection |
| Job task timeout | Up to **168 hours** (7 days), 1 hour with GPUs; up to 10,000 tasks per execution |
| Session affinity cookie | TTL **30 days**, best effort |
| Cloud SQL | An instance may hold at most **100 connections** to a Cloud SQL database |

## How Cloud Run scales and bills

Cloud Run adds instances as requests arrive. **Concurrency** is the maximum number of requests one instance handles
at the same time, so the instance count is roughly `in-flight requests ÷ concurrency`, adjusted for CPU: a busy instance
gets fewer new requests, and sustained high CPU makes the service scale out.

- **Concurrency 80+ for async I/O-bound services** (FastAPI with `async def`, Node). Most of their time is spent
  waiting on the LLM, the database or another API.
- **Low concurrency (even 1)** only when a request needs the whole CPU or the code is not safe to run in parallel. It
  multiplies cold starts during spikes.
- **Max instances** protects downstream systems (a database with 500 connections, an external API with a rate limit)
  and your budget. When every instance is full and the revision is at its maximum, excess requests fail with HTTP 429
  ("no available container instances") rather than queueing indefinitely.
- **Min instances** keeps warm instances to remove cold starts on the critical path. You pay for them while idle.

### Billing settings

| | Request-based billing (default) | Instance-based billing |
|---|---|---|
| Old name | "CPU only allocated during request processing" | "CPU always allocated" |
| You pay for | Time spent processing requests, starting and shutting down | The whole instance lifetime, even with no requests |
| CPU outside requests | None, so background work after the response stalls | Available, so background threads and tasks keep running |
| Use it for | Classic request/response APIs | Services that finish work after responding, or keep caches warm |

An instance with an **open WebSocket** counts as active the whole time the socket is open, even if no messages flow,
so it is billed for that time. Jobs always use instance-based billing.

### Cold starts

A cold start is container start plus your app's start-up: image pull, runtime boot, imports, connecting to the
database, loading configuration. Reduce it with **min instances** on latency-sensitive services, **startup CPU boost**
(extra CPU while the instance starts), a small image, lazy imports of heavy libraries, and doing work in the
lifespan/start-up hook rather than on the first request. Keep the process alive and reuse clients and pools across
requests: that is where Cloud Run beats per-invocation functions.

## Streaming on Cloud Run

```text
browser ──HTTPS (HTTP/1.1 or HTTP/2)──► Google front end ──► Cloud Run instance
             │                                                   │
             │  SSE: one long response, server → client          │  each stream or socket is one "request":
             │  WebSocket: one long upgraded request, both ways  │  counts towards concurrency, ends at the
             │  gRPC streaming: needs HTTP/2 end-to-end          │  request timeout (max 60 min)
```

| Concern | What Cloud Run does | What you do |
|---|---|---|
| **SSE / HTTP streaming** | Supports server streaming; streamed responses are not bound by the 32 MiB response limit | Send `Content-Type: text/event-stream`, flush per event, send keep-alive comments, give every event an `id` |
| **Stream length** | Each stream is a request, so it ends at the request timeout | Set the timeout to the longest stream you need (up to 60 min) and make clients reconnect with `Last-Event-ID` |
| **WebSockets** | Supported with no extra configuration; a socket is a long request subject to the timeout | Raise the timeout, keep end-to-end HTTP/2 off for that service, reconnect with backoff |
| **Many sockets per instance** | Concurrency counts open connections, up to 1,000 per instance | Raise concurrency for I/O-bound gateways; watch memory per connection |
| **Instances do not share memory** | A reconnect can land on a different instance | Keep state outside: Memorystore (Redis pub/sub) to fan out, Firestore listeners, or a database |
| **Session affinity** | Optional cookie-based, **best effort** | Use it as an optimisation only; it breaks when an instance is busy, full or replaced |
| **gRPC** | All gRPC types work, but by default Cloud Run downgrades requests to HTTP/1 before they reach the container; streaming and metadata need **end-to-end HTTP/2** | Serve h2c (cleartext HTTP/2) and deploy with `--use-http2` (port named `h2c`) |

**The rule to say out loud:** treat every connection as temporary. Streams end at the timeout, during deploys and
when instances scale in, so the protocol has to resume: event ids plus a replay log on the server, reconnect with
backoff on the client, and idempotent handlers.

## Revisions, traffic splitting and tags

Every deploy or configuration change creates an **immutable revision**. Traffic is split between revisions by
percentage, and a **tag** gives a revision its own URL without sending it public traffic.

```bash
# Deploy the new image as a revision that receives no traffic, reachable at https://canary---chat-api-<hash>.a.run.app
gcloud run deploy chat-api --image="$IMAGE@$DIGEST" --region=us-central1 --no-traffic --tag=canary

# Run the E2E suite against the tagged URL, then send it 10% of real traffic
gcloud run services update-traffic chat-api --region=us-central1 --to-tags=canary=10

# Promote, or roll back instantly by moving traffic back to the previous revision
gcloud run services update-traffic chat-api --region=us-central1 --to-latest
gcloud run services update-traffic chat-api --region=us-central1 --to-revisions=chat-api-00041-abc=100
```

Rollback is a traffic change, not a rebuild, so it takes seconds. When session affinity is on, it takes precedence over
the traffic split for clients that already have the cookie.

## Security and identity

- **Service identity:** give each service its **own service account** with only the roles it needs (for example
  `roles/secretmanager.secretAccessor` on two secrets and `roles/cloudsql.client`), not the default Compute Engine
  account.
- **Who may call it:** private services require the caller to present a Google-signed **ID token** whose audience is
  the service URL and to hold **`roles/run.invoker`**. Cloud Run checks this before your code runs. Pub/Sub push,
  Cloud Tasks, Cloud Scheduler and Workflows can all attach such tokens.
- **Ingress setting:** `all`, `internal`, or `internal-and-cloud-load-balancing`. Public apps usually sit behind a
  global external Application Load Balancer with **Cloud Armor** (WAF, rate limiting), and use **IAP** (which can now
  also be enabled directly on a Cloud Run service) or app-level SSO.
- **Secrets:** from **Secret Manager**, as environment variables (resolved once at instance start, so pin a version)
  or as mounted files (read from Secret Manager on each access, so `latest` works well with rotation).
- **Supply chain:** deploy by image digest from Artifact Registry, scan images, optionally enforce Binary Authorization.

## Networking and data

- **Reaching private resources** (Cloud SQL private IP, Memorystore, internal services): **Direct VPC egress**, which
  needs no connector and whose network cost scales to zero with the service, or a **Serverless VPC Access connector**.
- **Cloud SQL:** the built-in connection (a Unix socket at `/cloudsql/PROJECT:REGION:INSTANCE`), the language
  **Cloud SQL connectors** (encryption and IAM database authentication), or private IP over the VPC. The service account
  needs `roles/cloudsql.client`.
- **Connection budget:** `max instances × pool size per instance` must fit under the database's `max_connections`,
  with room for migrations, admin sessions and a second revision during a deploy. Each instance may open at most 100
  connections to Cloud SQL. The coding problem below does this sum.

## Health checks, logging and tracing

- **Startup probe:** TCP by default (240-second timeout); configure HTTP or gRPC startup probes for slow starters.
- **Liveness probe** (HTTP or gRPC): failure kills the instance with SIGKILL, in-flight requests get 503, and a new
  instance replaces it.
- **Readiness probe** (HTTP or gRPC, the newest of the three and still in Preview at the time of writing): failure stops
  new requests being routed to the instance without killing it. With session affinity on, a client's requests still go
  to its instance even while that instance fails readiness.
- **Logs:** write one JSON object per line to stdout. Cloud Logging reads `severity` and `message` and links the entry to
  the request trace through `logging.googleapis.com/trace`.
- **Traces:** Cloud Run forwards the incoming trace context (`traceparent` or `X-Cloud-Trace-Context`); with
  OpenTelemetry you export spans to Cloud Trace and see one agent run across services.

## Cloud Run or GKE?

| | Cloud Run | GKE |
|---|---|---|
| You manage | Container, settings, IAM | Cluster, node pools (Standard) or just workloads (Autopilot), manifests |
| Scaling | Per request, to zero, fast | HPA and cluster autoscaler; scale to zero needs extra work |
| Long-lived connections | Up to 60 minutes per request; reconnect required | No platform timeout of its own; load balancer timeouts and draining still apply |
| Background and stateful work | Jobs, worker pools, instance-based billing | Anything: StatefulSets, DaemonSets, sidecars |
| Networking and extras | Simple; VPC egress, load balancer in front | Service mesh, network policies, GPUs and custom node types |
| Choose it when | Stateless APIs, gateways, jobs; small team; fastest path | Many services sharing a platform, long-lived processes, special hardware or networking |

**Your angle:** "At Quantiphi I containerised our services with Docker and deployed them through Artifact Registry to
Cloud Run across Dev, SIT and UAT releases. At The Dot Corp the applications run on AKS. For a real-time AI product
I'd put the chat API and orchestration endpoints on Cloud Run and only move a workload to GKE if it needs hours-long
connections or special hardware."

## Interview questions

### What is Cloud Run, and when would you choose it? {core}

Cloud Run is Google's serverless container platform: I give it a container image, and it runs it behind HTTPS, scales
it with traffic (to zero when idle), and bills only for what runs. I choose it for stateless HTTP and gRPC APIs,
streaming gateways and batch jobs, when the team wants to ship without operating a cluster. The trade-offs are the
request timeout (60 minutes at most), statelessness, and less control over networking and hardware than GKE.

**Your angle:** our Document AI services at Quantiphi ran on Cloud Run across Dev, SIT and UAT.

### What does a container need to do to run well on Cloud Run?

Listen on `0.0.0.0` on the `PORT` environment variable, start listening within four minutes, keep no state on local
disk because the filesystem is in memory and disappears with the instance, log to stdout, and handle SIGTERM because
Cloud Run gives you only ten seconds before SIGKILL. Configuration and secrets come from environment variables or
mounted secrets, so the same image runs in every environment.

### How does Cloud Run scale, and how do you choose the concurrency setting? {core}

Cloud Run starts instances as requests arrive, and concurrency caps how many requests one instance serves at once.
For an async, I/O-bound service such as a FastAPI or Node chat API, I keep concurrency high (80 or more), because each
request mostly waits on the LLM or the database. I lower it only when a request needs the whole CPU or the code is not
safe in parallel. I set max instances to protect the database and external APIs, and min instances on the latency-
critical path.

Follow-up: the database pool per instance should not exceed the concurrency, and `max instances × pool size` must fit
the database's connection limit.

### What is a cold start, and how do you reduce it? {core}

A cold start is the delay when Cloud Run has to start a new instance before it can serve a request: pulling the image,
booting the runtime, importing code and opening connections. I reduce it with min instances on the critical services,
startup CPU boost, a small image, lazy imports of heavy libraries, and doing initialisation once in the start-up hook
and reusing clients across requests. For a chat UI, a cold start shows up as extra time to first token, so I measure it.

### What is the difference between request-based and instance-based billing?

With request-based billing, the default, an instance gets CPU and is billed only while it is processing requests,
starting or shutting down. Work you leave running after the response, such as a background thread or an un-awaited
task, gets no CPU and stalls. With instance-based billing, formerly "CPU always allocated", the instance is billed for
its whole life and background work keeps running. For real background processing I still prefer a queue and a worker
(Cloud Tasks, Pub/Sub, a job) over hidden work inside an API instance.

### Can you stream LLM tokens to the browser with SSE from Cloud Run? What limits apply? {core}

Yes. Cloud Run supports HTTP response streaming, so an SSE endpoint that flushes each event works, and streamed
responses are not held to the 32 MiB response limit. The limit that matters is time: each stream is one request, so it
ends at the request timeout, which defaults to 5 minutes and can be raised to 60. So I set the timeout for the longest
expected run, send keep-alive comments so idle proxies do not cut the connection, give every event an id, and have the
client reconnect with `Last-Event-ID` so the server replays from its event log.

Follow-up: if a run can take longer than the timeout, the run itself must live outside the request (a job or a queue
worker) and the stream is just a view of its progress that can reconnect at any time.

### How do WebSockets behave on Cloud Run, and how would you scale a WebSocket gateway? {core}

WebSockets work on Cloud Run with no special setup, but each socket is a long request: it counts towards the instance's
concurrency and is closed at the request timeout, at most 60 minutes. While a socket is open the instance is active and
billed. Instances do not share memory and a reconnect can land on another instance, so I keep state outside: each
instance subscribes to a Redis pub/sub channel on Memorystore (or uses Firestore listeners) to fan messages out to its
own sockets. Clients reconnect with backoff and resubscribe. I raise concurrency for the gateway because it is
I/O-bound, and watch memory per connection.

### What do you need to run gRPC, especially streaming gRPC, on Cloud Run? {deep}

gRPC runs over HTTP/2. By default Cloud Run accepts HTTP/2 from clients but downgrades requests to HTTP/1 before they
reach the container. Some simple gRPC calls survive that, but streaming and metadata need HTTP/2, and Google's gRPC
guide says to configure HTTP/2 for streaming gRPC. So I enable end-to-end HTTP/2 (`--use-http2`, port named `h2c`),
and the server must speak cleartext HTTP/2 (h2c), because Google's front end terminates TLS. All four RPC types, unary
and streaming, then work. Streams still end at the request timeout, and browsers cannot speak native gRPC, so a
browser-facing API uses gRPC-Web, Connect or a REST/SSE gateway.

### What is session affinity on Cloud Run, and should you rely on it? {deep}

Session affinity makes Cloud Run send a client's requests to the same instance using a cookie with a 30-day TTL. It is
best effort: it breaks when the instance is shut down, reaches its maximum concurrency or is CPU-saturated. So I use it
as an optimisation, for example to keep a reconnecting WebSocket client near its warm cache, but the system must be
correct without it: all durable state lives outside the instance.

### How would you do a canary release on Cloud Run? {core}

Deploy the new image as a revision with no traffic and a tag, which gives it its own URL. Run smoke and E2E tests
against that URL. Then shift a small percentage of traffic to the tag, compare its error rate and latency with the old
revision, and step up to 100%. If it misbehaves, move traffic back to the previous revision, which takes seconds because
revisions are immutable and the old one is still there. In a pipeline this is `--no-traffic --tag`, then
`update-traffic --to-tags`, ideally automated through Cloud Deploy or the CI job.

### How do services authenticate to each other on Cloud Run? {core}

Each service runs as its own service account. A private service requires callers to send a Google-signed ID token
whose audience is the target service's URL and to have the `roles/run.invoker` role on it; Cloud Run verifies the token
before my code runs. The caller gets the token from the metadata server, or the Google auth library does it for it.
Pub/Sub push, Cloud Tasks, Cloud Scheduler and Workflows can attach these tokens too. On top of that, the application
still checks the end user's identity and roles, which travel separately, for example as a JWT from the identity provider.

### How do you give a Cloud Run service its secrets?

From Secret Manager, never baked into the image or committed. I grant the service's own service account
`roles/secretmanager.secretAccessor` on just the secrets it needs. As environment variables, values are resolved once
when the instance starts, so I pin a version and roll a new revision to rotate. As mounted files, Cloud Run reads the
secret when the file is read, so `latest` picks up rotations without a redeploy.

### How do you connect Cloud Run to Cloud SQL, and how do you size the connection pool? {core}

Use the built-in Cloud SQL connection (a Unix socket), the Cloud SQL language connectors, or private IP through Direct
VPC egress; the service account needs `roles/cloudsql.client`. For the pool, the budget is the database's
`max_connections` minus reserved and admin connections, divided by the maximum number of instances, with room for a
second revision during deploys. Each instance can open at most 100 connections to Cloud SQL, and a pool larger than the
concurrency is wasted. If the numbers do not fit, I cap max instances or add a pooler such as managed connection pooling
or PgBouncer.

**Your angle:** PostgreSQL query and data-access optimisation for clinical trial workflows at Medidata.

### What happens when Cloud Run shuts an instance down, and how do you handle it? {deep}

Cloud Run sends SIGTERM and kills the container with SIGKILL ten seconds later. So on SIGTERM I stop accepting new
work, tell streaming clients to reconnect (an SSE `reconnect` event or a WebSocket close with code 1012), flush logs and
traces, and close database pools. Anything that cannot finish in ten seconds should not be in an API instance at all:
it belongs in a queue-driven worker that can resume from a checkpoint.

### How do health checks work on Cloud Run? {deep}

There are startup, liveness and readiness probes. The startup probe defaults to TCP on the port; I switch it to HTTP for
services that need warm-up. A failing liveness probe kills the instance, so it must check only that the process is
responsive, never a dependency such as the database. A failing readiness probe just stops new requests being routed to
the instance, which suits temporary problems and draining. Readiness probes are the newest of the three and were still
in Preview when I last checked, so I would confirm their status before relying on them in production.

### How does a Cloud Run service reach private resources such as Memorystore or a private Cloud SQL IP? {deep}

Through the VPC, using either Direct VPC egress or a Serverless VPC Access connector. Direct VPC egress needs no
connector instances to run and its network cost scales to zero with the service; it uses IP addresses from a subnet
you give it, so that subnet must be large enough. Connectors are the older option and still fit some setups, for
example with Cloud NAT. Either way, I keep the service's egress limited to what it needs.

### Your agent run can take two hours. How do you run it on Cloud Run? {core}

Not inside one HTTP request, because the maximum request timeout is 60 minutes and connections drop anyway. The API
accepts the request, writes the run to the database and enqueues it (Pub/Sub or Cloud Tasks), and returns a run id
straight away, or the run is a Cloud Run job, whose tasks can run for days. The worker checkpoints each step so it can
resume after a crash or a deploy, and publishes progress events. The browser follows progress over SSE or WebSockets,
reconnecting as often as needed, because the stream is only a view of the run.

### How would you make a Cloud Run application multi-region? {deep}

Deploy the same service to two or more regions and put a global external Application Load Balancer in front with
serverless network endpoint groups, so users reach the nearest healthy region. The data tier has to follow: a regional
Cloud SQL instance with cross-region replicas and a failover plan, or a multi-region database such as Firestore in a
multi-region location. Streaming clients reconnect to whichever region serves them, which is another reason to keep
resumable streams and state outside the instance.

### How do you get useful logs and traces from Cloud Run?

Write structured JSON to stdout: Cloud Logging reads `severity` and `message`, and the `logging.googleapis.com/trace`
field links the entry to the request's trace, so all logs of one request or agent run line up in Logs Explorer and
Cloud Trace. I propagate the trace context to downstream calls with OpenTelemetry, include the run id and step in every
log line, and alert on symptoms (error rate, latency, time to first token) rather than on CPU.

### When would you move a workload from Cloud Run to GKE?

When the workload needs things Cloud Run does not give: connections or processes that live for hours, sidecars, a
service mesh, GPUs or node types beyond what Cloud Run offers, very fine control over networking, or many services that
justify a shared platform team. Otherwise Cloud Run's simplicity wins. Both run the same container, so the move is about
the platform, not the code.

**Your angle:** you have deployed to both kinds of platform: Cloud Run at Quantiphi and AKS at The Dot Corp.

## Coding problems

### Structured logs that Cloud Logging links to the trace {medium core}

Write a `logging.Formatter` for a Cloud Run service that prints one JSON object per line with `severity`, `message`,
`logger`, any extra fields passed as `extra={"fields": {...}}`, and, when the current request has a trace, the special
fields `logging.googleapis.com/trace` (`projects/<project>/traces/<trace id>`), `logging.googleapis.com/spanId` and
`logging.googleapis.com/trace_sampled`. Also write `parse_trace(headers)` that reads the W3C `traceparent` header first
and falls back to `X-Cloud-Trace-Context` (`TRACE_ID/SPAN_ID;o=1`, where the span id is decimal).

#### Hints

1. Keep the current request's trace in a `contextvars.ContextVar`, set by middleware, so concurrent requests do not mix.
2. `traceparent` is `00-<32 hex trace id>-<16 hex span id>-<2 hex flags>`; bit 0 of the flags means sampled.
3. Cloud Logging wants the span id as 16 hex characters, so convert the decimal span id from `X-Cloud-Trace-Context`.

#### Solution

Two regular expressions parse the two header formats; an all-zero id or upper-case hex is invalid in W3C trace context,
so such a header is ignored. The formatter builds a dict and adds the trace fields only when a trace is present. Python's level names
(DEBUG, INFO, WARNING, ERROR, CRITICAL) are valid Cloud Logging severities as they are.

```python
import contextvars
import io
import json
import logging
import re

TRACEPARENT = re.compile(r"^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$")
CLOUD_TRACE = re.compile(r"^([0-9a-f]{32})/(\d+)(?:;o=([01]))?$")
Trace = tuple[str, str, bool]  # trace id, span id (16 hex), sampled

current_trace: contextvars.ContextVar[Trace | None] = contextvars.ContextVar("current_trace", default=None)


def parse_trace(headers: dict[str, str]) -> Trace | None:
    """Headers with lower-case names, as ASGI frameworks provide them."""
    if m := TRACEPARENT.match(headers.get("traceparent", "").strip()):   # W3C: lower-case hex only
        trace_id, span_id, flags = m.groups()
        if trace_id != "0" * 32 and span_id != "0" * 16:
            return trace_id, span_id, int(flags, 16) & 1 == 1
    if m := CLOUD_TRACE.match(headers.get("x-cloud-trace-context", "").strip().lower()):
        trace_id, span_decimal, sampled = m.groups()
        return trace_id, format(int(span_decimal), "016x"), sampled == "1"
    return None


class CloudLoggingFormatter(logging.Formatter):
    def __init__(self, project_id: str) -> None:
        super().__init__()
        self.project_id = project_id

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "severity": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }
        if record.exc_info:
            # The stack trace in the message lets Error Reporting group the error.
            entry["message"] = f"{entry['message']}\n{self.formatException(record.exc_info)}"
        entry.update(getattr(record, "fields", {}))
        if trace := current_trace.get():
            trace_id, span_id, sampled = trace
            entry["logging.googleapis.com/trace"] = f"projects/{self.project_id}/traces/{trace_id}"
            entry["logging.googleapis.com/spanId"] = span_id
            entry["logging.googleapis.com/trace_sampled"] = sampled
        return json.dumps(entry)


# Header parsing
w3c = {"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"}
assert parse_trace(w3c) == ("4bf92f3577b34da6a3ce929d0e0e4736", "00f067aa0ba902b7", True)
legacy = {"x-cloud-trace-context": "105445aa7843bc8bf206b12000100000/1;o=0"}
assert parse_trace(legacy) == ("105445aa7843bc8bf206b12000100000", "0000000000000001", False)
assert parse_trace({"traceparent": "00-" + "0" * 32 + "-00f067aa0ba902b7-01"}) is None   # invalid id, no fallback
assert parse_trace({}) is None
assert parse_trace({"traceparent": "garbage", **legacy})[1] == "0000000000000001"         # falls back
assert parse_trace({"traceparent": w3c["traceparent"].upper()}) is None                  # upper case is invalid

# Formatting
stream = io.StringIO()
handler = logging.StreamHandler(stream)
handler.setFormatter(CloudLoggingFormatter("agent-platform-dev"))
log = logging.getLogger("orchestrator")
log.handlers = [handler]
log.setLevel(logging.INFO)
log.propagate = False

log.info("service started")                                  # no request, so no trace fields
token = current_trace.set(parse_trace(w3c))                   # middleware does this per request
log.warning("tool call slow", extra={"fields": {"run_id": "run-42", "tool": "sap.create_po", "ms": 4120}})
try:
    raise TimeoutError("ERP did not answer")
except TimeoutError:
    log.exception("tool call failed")
current_trace.reset(token)

started, slow, failed = (json.loads(line) for line in stream.getvalue().splitlines())
assert started == {"severity": "INFO", "message": "service started", "logger": "orchestrator"}
assert slow["severity"] == "WARNING" and slow["run_id"] == "run-42" and slow["ms"] == 4120
assert slow["logging.googleapis.com/trace"] == "projects/agent-platform-dev/traces/4bf92f3577b34da6a3ce929d0e0e4736"
assert slow["logging.googleapis.com/spanId"] == "00f067aa0ba902b7" and slow["logging.googleapis.com/trace_sampled"] is True
assert failed["severity"] == "ERROR" and "TimeoutError: ERP did not answer" in failed["message"]
```

Complexity: O(size of the record) per line.

#### Follow-ups

- **Where is `current_trace` set?** In an ASGI middleware that parses the request headers, sets the variable and resets
  it in a `finally`. With OpenTelemetry instrumentation you read the active span instead of parsing headers yourself.
- **Why not log the user's prompt?** Prompts and tool results can contain personal or confidential data. Log ids,
  sizes and timings; keep content in a store with access control if you need it for evaluation.

### Size the database connection pool for a Cloud Run service {easy}

Write `pool_size_per_instance(db_max_connections, reserved, max_instances, concurrency, other_clients=0)` that returns
how many connections each instance's pool may hold. The usable budget is `db_max_connections - reserved -
other_clients`; split it across `max_instances`; never exceed the request concurrency (extra connections would sit idle)
or the 100-connection cap per Cloud Run instance. Raise `ValueError` when not even one connection per instance fits.

#### Hints

1. Integer division gives the fair share per instance.
2. The answer is the minimum of three limits: fair share, concurrency, and 100.
3. During a deploy two revisions can run at once; you can model that by passing a doubled `max_instances`.

#### Solution

The function is a few lines, but the reasoning is what interviewers want: every instance can open its whole pool at the
same time, so the worst case is `max_instances × pool size`, and that must fit the database.

```python
CLOUD_RUN_CLOUD_SQL_CAP = 100


def pool_size_per_instance(db_max_connections: int, reserved: int, max_instances: int,
                           concurrency: int, other_clients: int = 0) -> int:
    if max_instances < 1 or concurrency < 1:
        raise ValueError("max_instances and concurrency must be at least 1")
    budget = db_max_connections - reserved - other_clients
    share = budget // max_instances
    if share < 1:
        raise ValueError(f"{budget} usable connections cannot serve {max_instances} instances; "
                         "lower max instances or add a connection pooler")
    return min(share, concurrency, CLOUD_RUN_CLOUD_SQL_CAP)


assert pool_size_per_instance(500, reserved=20, max_instances=40, concurrency=80) == 12     # 480 // 40
assert pool_size_per_instance(500, reserved=20, max_instances=4, concurrency=10) == 10      # capped by concurrency
assert pool_size_per_instance(2000, reserved=0, max_instances=2, concurrency=1000) == 100   # Cloud Run cap
assert pool_size_per_instance(500, reserved=20, max_instances=2 * 40, concurrency=80) == 6  # two revisions during a deploy
assert pool_size_per_instance(100, reserved=10, max_instances=10, concurrency=80, other_clients=30) == 6

for bad in [dict(db_max_connections=100, reserved=10, max_instances=200, concurrency=80),
            dict(db_max_connections=100, reserved=0, max_instances=0, concurrency=80)]:
    try:
        pool_size_per_instance(**bad)
        raise AssertionError("should have raised")
    except ValueError:
        pass
```

Complexity: O(1).

#### Follow-ups

- **The numbers do not fit. What now?** Cap max instances, put a pooler (managed connection pooling, PgBouncer) in
  front of the database, move read traffic to replicas, or cache hot reads in Redis.
- **Why not one connection per request?** Opening a PostgreSQL connection costs a TLS handshake and a backend process;
  under load it adds latency and can exhaust the server.

### An SSE stream that keeps alive and drains on shutdown {medium core}

Write an async generator `sse_events(queue, shutdown, heartbeat)` for a Cloud Run streaming endpoint. It reads tokens
from an `asyncio.Queue` (`None` means the run finished) and yields SSE frames:

- each token as `id: <n>` plus `data: {"token": ...}`, with ids counting up from `start_id + 1`;
- a comment line `: keep-alive` whenever no token arrives for `heartbeat` seconds, so proxies keep the connection open;
- `event: done` when the run finishes;
- when `shutdown` is set (SIGTERM), an `event: reconnect` frame with `retry: 1000` and the last id sent, then stop.

#### Hints

1. Race `queue.get()` against `shutdown.wait()` with `asyncio.wait(..., timeout=heartbeat, return_when=FIRST_COMPLETED)`.
2. Nothing finished before the timeout means it is time for a keep-alive comment.
3. Cancel the task that lost the race (in a `finally`, so a disconnect cleans up too), and check `shutdown` at the top of the loop so a token that arrived first is still delivered.

#### Solution

Each loop iteration waits for whichever comes first: a token, the shutdown signal or the heartbeat timeout. Every
frame ends with a blank line, as the SSE format requires. The reconnect frame tells the client which id it has, and the
`retry` field sets how long the browser's `EventSource` waits before reconnecting, so a new instance can resume the
stream from the event log.

```python
import asyncio
import json
from collections.abc import AsyncIterator


async def sse_events(queue: "asyncio.Queue[str | None]", shutdown: asyncio.Event,
                     heartbeat: float = 15.0, start_id: int = 0) -> AsyncIterator[str]:
    last_id = start_id
    while True:
        if shutdown.is_set():
            yield f"event: reconnect\nretry: 1000\ndata: {json.dumps({'last_id': last_id})}\n\n"
            return
        get = asyncio.create_task(queue.get())
        stop = asyncio.create_task(shutdown.wait())
        try:
            done, _ = await asyncio.wait({get, stop}, timeout=heartbeat, return_when=asyncio.FIRST_COMPLETED)
        finally:
            # No-op for a finished task; otherwise stops it, including when the client disconnects mid-wait.
            get.cancel()
            stop.cancel()
        if get in done:
            token = get.result()
            if token is None:
                yield "event: done\ndata: {}\n\n"
                return
            last_id += 1
            yield f"id: {last_id}\ndata: {json.dumps({'token': token})}\n\n"
        elif not done:
            yield ": keep-alive\n\n"
        # else: shutdown won the race; the top of the loop sends the reconnect frame


async def collect(producer, **kwargs) -> list[str]:
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    shutdown = asyncio.Event()
    feeder = asyncio.create_task(producer(queue, shutdown))
    frames = [frame async for frame in sse_events(queue, shutdown, **kwargs)]
    await feeder
    return frames


async def finishes(queue, shutdown):
    for token in ["Hel", "lo"]:
        await queue.put(token)
    await asyncio.sleep(0.12)              # the model pauses: keep-alives go out meanwhile
    await queue.put("!")
    await queue.put(None)


async def interrupted(queue, shutdown):
    await queue.put("Draft")
    await asyncio.sleep(0.03)
    shutdown.set()                         # SIGTERM arrives mid-run


frames = asyncio.run(collect(finishes, heartbeat=0.05))
data = [f for f in frames if f.startswith("id:")]
assert data == ['id: 1\ndata: {"token": "Hel"}\n\n', 'id: 2\ndata: {"token": "lo"}\n\n', 'id: 3\ndata: {"token": "!"}\n\n']
assert frames.count(": keep-alive\n\n") >= 1
assert frames[-1] == "event: done\ndata: {}\n\n"
assert all(f.endswith("\n\n") for f in frames)

frames = asyncio.run(collect(interrupted, heartbeat=1.0, start_id=41))
assert frames == ['id: 42\ndata: {"token": "Draft"}\n\n',
                  'event: reconnect\nretry: 1000\ndata: {"last_id": 42}\n\n']


async def client_disconnects() -> int:
    queue: asyncio.Queue[str | None] = asyncio.Queue()
    stream = sse_events(queue, asyncio.Event(), heartbeat=10)
    try:
        await asyncio.wait_for(anext(stream), timeout=0.05)   # Starlette cancels the stream like this
    except TimeoutError:
        pass
    await asyncio.sleep(0)                                     # let the cancelled tasks finish
    return len(asyncio.all_tasks())


assert asyncio.run(client_disconnects()) == 1                  # only the main task: nothing leaked
```

Complexity: O(1) work per frame; one pending task pair per loop iteration.

#### Follow-ups

- **How do you wire this into FastAPI?** Return `StreamingResponse(sse_events(...), media_type="text/event-stream")`
  with `Cache-Control: no-cache`, or use FastAPI's built-in SSE response class. Set the `shutdown` event from a SIGTERM
  hook, not from the lifespan shutdown: uvicorn runs lifespan shutdown only after open connections close, which a long
  stream would delay until Cloud Run's SIGKILL.
- **How does the new instance resume?** The client reconnects with `Last-Event-ID: 42`; the server replays events after
  42 from a shared event log (Redis Streams, Firestore or Postgres) and then continues live.
- **What if the client disconnects?** Starlette cancels the generator; stop generating, and decide whether the agent
  run continues in the background (it usually should, if it runs in a worker).
