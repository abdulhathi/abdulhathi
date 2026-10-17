---
title: Docker and Kubernetes on GKE
goal: Write a production Dockerfile for a Node.js or Python service, explain the Kubernetes objects and probes you would use on GKE, keep long-lived WebSocket connections healthy through deploys, and debug a failing pod, bridging from your AKS work.
minutes: 45
---

The JD says "containerize services using Docker and deploy them onto Cloud Run and GKE". Cloud Run has its own
chapter; this one covers the container itself and Kubernetes on Google Kubernetes Engine (GKE). Expect a production
Dockerfile, pods vs Deployments vs Services, probes, resource requests, autoscaling, rolling updates, and how you would
debug a pod in CrashLoopBackOff. For a real-time platform add one more: how WebSocket and SSE connections survive a
rollout.

**Your angle, honestly:** you have deployed to **AKS** (Azure Kubernetes Service) at The Dot Corp, working with Docker
containers and Kubernetes deployments, and you built and deployed Docker images to **Cloud Run** at Quantiphi. You
have not run GKE itself. Kubernetes objects, probes and kubectl are identical across clouds; what changes is identity
(Workload Identity Federation for GKE instead of Entra Workload ID), load balancing (Google Cloud load balancers via
Gateway or Ingress) and the cluster modes (Autopilot vs Standard). Say exactly that.

## Docker essentials

| Term | Meaning |
|---|---|
| Image | Read-only, layered template: OS files, runtime, dependencies, your code |
| Container | A running instance of an image: an isolated process with its own filesystem view, network and resource limits |
| Layer | Each `RUN`, `COPY` or `ADD` creates a cached layer; a change rebuilds that layer and every one after it |
| Registry | Stores images: Artifact Registry on GCP (`us-central1-docker.pkg.dev/<project>/<repo>/<image>`) |
| Tag vs digest | A tag (`:1.4.2`) can be moved; a digest (`@sha256:…`) names exact bytes and is what you deploy |

### A production Dockerfile for a Node.js/TypeScript service

```dockerfile
# syntax=docker/dockerfile:1
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# The image's node user is UID 1000; a numeric USER lets Kubernetes' runAsNonRoot verify it.
USER 1000
EXPOSE 8080
CMD ["node", "dist/server.js"]
```

Why each choice matters:

- **Dependencies before code:** `package.json` and the lockfile are copied and installed first, so a code change reuses
  the cached `npm ci` layer. `npm ci` installs exactly what the lockfile says.
- **BuildKit cache mount:** the npm cache persists between builds without ending up in the image.
- **Multi-stage:** compilers, dev dependencies and the TypeScript sources stay in earlier stages; the final image holds
  only the compiled `dist` and production `node_modules`.
- **Non-root:** the official Node image ships a `node` user (UID 1000); never run the service as root. Set `USER` by
  number: with `runAsNonRoot: true`, Kubernetes refuses to start a container whose image user is a name it cannot
  verify (`CreateContainerConfigError`).
- **Exec-form `CMD`:** Node becomes PID 1 and receives SIGTERM directly. A Linux PID 1 gets no default signal
  handling, so the app **must** handle SIGTERM itself (`process.on('SIGTERM', …)`) or run under a tiny init such as
  `tini`; otherwise it ignores SIGTERM and is killed abruptly when the grace period ends.

The Python/FastAPI equivalent has the same shape: a builder stage that creates a virtualenv from `requirements.txt`,
a slim runtime stage that copies the venv and the code, a non-root user, `PYTHONUNBUFFERED=1`, and
`CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]`.

A `.dockerignore` keeps the build context small and secrets out of the image:

```text
.git
node_modules
dist
.venv
__pycache__/
.env
*.log
coverage/
```

### Building and shipping images

```bash
# On an Apple Silicon Mac, build for the x86_64 nodes the cluster (and Cloud Run) uses
docker buildx build --platform linux/amd64 -t us-central1-docker.pkg.dev/my-proj/apps/chat-api:"$GIT_SHA" --push .

# Deploy by digest, which never changes underneath you
docker buildx imagetools inspect us-central1-docker.pkg.dev/my-proj/apps/chat-api:"$GIT_SHA"
```

Scan images in CI (Artifact Analysis scans Artifact Registry images for known vulnerabilities), keep base images
current, and pin the base image by digest for reproducible builds.

## Kubernetes core objects

| Object | What it is | Example on this platform |
|---|---|---|
| Pod | One or more containers sharing an IP and volumes; disposable | One replica of the WebSocket gateway |
| Deployment | Keeps N identical pods running; rolling updates and rollbacks | `chat-gateway` with 3–30 replicas |
| Service | Stable name and virtual IP that load-balances to ready pods by label | `chat-gateway.platform.svc.cluster.local` |
| Gateway / HTTPRoute | Gateway API: HTTP routing from outside into Services, provisioned as a Google Cloud load balancer | `chat.example.com/ws` → chat-gateway |
| Ingress | The older HTTP routing API; on GKE it also creates a Google Cloud load balancer | Same job, fewer features |
| ConfigMap / Secret | Configuration and sensitive values as env vars or files | Feature flags; an API key |
| HorizontalPodAutoscaler | Scales replicas on CPU, memory, custom or external metrics | 3–30 pods on CPU or open connections |
| PodDisruptionBudget | Limits voluntary evictions (node upgrades, drains) | Keep at least 2 gateway pods |
| Job / CronJob | Run-to-completion work, once or on a schedule | A nightly re-index, a backfill |
| StatefulSet / DaemonSet | Stable identity and storage per pod / one pod per node | Brokers / log agents (mostly managed for you on GKE) |
| Namespace | Isolation for names, quotas, RBAC and network policies | `platform-dev`, `platform-prod` |

### A Deployment, Service, autoscaler and disruption budget

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-gateway
  namespace: platform
spec:
  replicas: 3
  selector:
    matchLabels: { app: chat-gateway }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 25%, maxUnavailable: 0 }    # add new pods before removing old ones
  template:
    metadata:
      labels: { app: chat-gateway }
    spec:
      serviceAccountName: chat-gateway                      # its Google Cloud access comes from Workload Identity Federation
      terminationGracePeriodSeconds: 120                    # time to drain long-lived connections
      containers:
        - name: gateway
          image: us-central1-docker.pkg.dev/my-proj/apps/chat-gateway@sha256:3f1c...   # deploy by digest
          ports: [{ containerPort: 8080, name: http }]
          env:
            - name: REDIS_URL
              valueFrom: { configMapKeyRef: { name: chat-gateway-config, key: redis-url } }
          resources:
            requests: { cpu: 250m, memory: 512Mi }          # what the scheduler reserves; HPA % is relative to this
            limits: { memory: 512Mi }                       # over the memory limit means OOMKilled
          startupProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 2
            failureThreshold: 30                            # up to 60 s to start
          readinessProbe:
            httpGet: { path: /readyz, port: http }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 10
          lifecycle:
            preStop:
              httpGet: { path: /drain, port: http }          # stop taking sockets, ask clients to reconnect
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
---
apiVersion: v1
kind: Service
metadata: { name: chat-gateway, namespace: platform }
spec:
  selector: { app: chat-gateway }
  ports: [{ name: http, port: 80, targetPort: http }]
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata: { name: chat-gateway, namespace: platform }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: chat-gateway }
  minReplicas: 3
  maxReplicas: 30
  metrics:
    - type: Resource
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 65 } }
---
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata: { name: chat-gateway, namespace: platform }
spec:
  minAvailable: 2
  selector:
    matchLabels: { app: chat-gateway }
```

### The three probes

| Probe | Question | When it fails |
|---|---|---|
| Startup | Has the app finished starting? | Liveness and readiness wait; after the threshold the container restarts |
| Readiness | Should this pod get new traffic now? | Removed from the Service endpoints; **not** restarted |
| Liveness | Is the process stuck beyond repair? | Container is **restarted** |

Keep liveness cheap and local. Never make liveness depend on Redis or the database: one blip would restart every pod
at once. Dependency checks and draining belong in readiness.

## GKE specifics

### Autopilot or Standard

| | Autopilot | Standard |
|---|---|---|
| Nodes | Google provisions, scales, patches and secures them from your pods' requests | You create and manage node pools |
| Billing | Mostly per pod resource requests (node-based for pods that pick specific hardware) | Per node, used or not |
| Security | Hardened defaults; Workload Identity Federation for GKE always on | You choose the settings |
| Hardware | Compute classes (for example Balanced or Scale-Out) and Spot Pods request what you need | Any machine type per node pool |
| Choose it when | The default: Google recommends Autopilot for most workloads | You need node-level control, custom kernels, or a specific setup |

### Identity: Workload Identity Federation for GKE

Pods should never use service-account key files. With Workload Identity Federation for GKE, a pod's Kubernetes
ServiceAccount is a federated identity: the GKE metadata server exchanges its Kubernetes token for a short-lived Google
Cloud access token. You grant IAM roles directly to the Kubernetes ServiceAccount's principal:

```bash
gcloud secrets add-iam-policy-binding erp-api-key \
  --role=roles/secretmanager.secretAccessor \
  --member="principal://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/my-proj.svc.id.goog/subject/ns/platform/sa/chat-gateway"
```

The older pattern, letting the Kubernetes ServiceAccount impersonate an IAM service account, is still available for
services that do not accept federated tokens. Secrets can be mounted from Secret Manager with the **Secret Manager
add-on for GKE**, which is built on the Secrets Store CSI driver.

### Getting traffic in: Gateway API, load balancers and long-lived connections

On GKE, a `Gateway` (with a GKE GatewayClass such as `gke-l7-global-external-managed`) or an `Ingress` provisions a
Google Cloud Application Load Balancer. With container-native load balancing, the load balancer sends traffic straight
to pod IPs through network endpoint groups (NEGs), which makes health checks and draining accurate.

For WebSockets and SSE, two load balancer settings matter:

- **Backend service timeout** (default **30 seconds**). For HTTP it caps the whole exchange, from the first request
  byte to the last response byte, so an SSE stream is cut when it expires even while events are flowing. For WebSockets
  it depends on the load balancer: on the global external Application Load Balancer (what
  `gke-l7-global-external-managed` provisions) it is the **idle** timeout, and active sockets are closed after 24 hours at
  most; on the classic Application Load Balancer, sockets close when it expires, idle or not. Raise it for streaming
  backends; the effective maximum is one day.
- **Connection draining** (default 0, which disables it; up to 3,600 seconds): how long existing connections may
  continue after a pod is removed from the backends.

```yaml
apiVersion: networking.gke.io/v1
kind: GCPBackendPolicy
metadata: { name: chat-gateway, namespace: platform }
spec:
  default:
    timeoutSec: 3600                       # long-lived WebSocket and SSE connections
    connectionDraining:
      drainingTimeoutSec: 60
  targetRef: { group: "", kind: Service, name: chat-gateway }
```

Even with a long timeout, connections still drop (deploys, node upgrades, network blips), so clients must reconnect
with backoff and resume.

### Draining WebSocket pods during a rollout

```text
rollout replaces pod A ──► pod A marked Terminating
   ├─► removed from Service endpoints and load balancer backends (asynchronously)
   ├─► preStop: GET /drain  → readiness fails, open sockets get "reconnect", new upgrades refused
   ├─► SIGTERM → app closes remaining sockets with code 1012 (service restart), flushes, exits
   └─► SIGKILL if still running after terminationGracePeriodSeconds (here 120 s)
clients ──► reconnect with jittered backoff ──► land on new pods ──► resubscribe and resume from last event id
```

Jitter matters: if every client on a drained pod reconnects at the same instant, the new pods get a thundering herd.

### Scaling on the right signal

CPU is a poor signal for an I/O-bound gateway or a queue worker. Scale gateways on **open connections** (a custom
metric exported to Cloud Monitoring) and workers on **queue depth or oldest unacked message age** (an external metric,
for example Pub/Sub's `num_undelivered_messages`), through the HPA's custom and external metrics or KEDA. The HPA's
rule is `desired = ceil(current × currentMetric / target)`; the coding problem implements it.

### From AKS to GKE

| Concept | AKS (what you used) | GKE |
|---|---|---|
| Managed control plane | Yes | Yes (Autopilot also manages nodes) |
| Workload identity | Microsoft Entra Workload ID | Workload Identity Federation for GKE |
| Registry | Azure Container Registry | Artifact Registry |
| Secrets from a vault | Key Vault via the Secrets Store CSI driver | Secret Manager add-on for GKE |
| Ingress | Application Gateway for Containers, NGINX | Gateway API / Ingress creating Google Cloud load balancers |
| Monitoring | Azure Monitor, Container Insights | Cloud Logging and Cloud Monitoring (Managed Service for Prometheus) |

## Debugging toolkit

| Command | Use |
|---|---|
| `kubectl get pods -o wide` | Status, restarts, node |
| `kubectl describe pod <pod>` | Events: scheduling, image pulls, probe failures, OOMKilled |
| `kubectl logs <pod> --previous` | Logs from the container that just crashed |
| `kubectl exec -it <pod> -- sh` | A shell inside the container (if the image has one) |
| `kubectl debug -it <pod> --image=busybox --target=gateway` | An ephemeral debug container for minimal images |
| `kubectl port-forward svc/chat-gateway 8080:80` | Call the service from your laptop |
| `kubectl rollout status / history / undo deploy/chat-gateway` | Watch, inspect and roll back |
| `kubectl top pods` | CPU and memory use |
| `kubectl get events --sort-by=.lastTimestamp` | Recent events in order |

| Status | Usual cause | First move |
|---|---|---|
| `CrashLoopBackOff` | The app exits on start: missing env var, bad config, exception | `logs --previous`, then `describe` |
| `ImagePullBackOff` | Wrong image or tag, or the node's identity cannot read Artifact Registry | Check the reference and registry permissions |
| `Pending` | No capacity for the requests, or an unsatisfiable selector or volume | `describe pod` events; requests; node pools or ComputeClass |
| `OOMKilled` (exit 137) | Exceeded the memory limit | Raise the limit or fix the leak (often per-connection buffers) |
| `CreateContainerConfigError` | A referenced ConfigMap or Secret key is missing, or `runAsNonRoot` with an image whose user is a name, not a UID | Create the key, or set `USER 1000` / `runAsUser` |
| Running, 0/1 Ready | Readiness failing | Check the probe path, port and what it depends on |

## Interview questions

### How do Docker layers and build caching work?

Each instruction that changes the filesystem creates a layer, cached by the instruction and its inputs. When an input
changes, that layer and everything after it rebuild. So I order the Dockerfile from least to most frequently changing:
base image, system packages, the dependency manifest and install, then the source code. A code change then rebuilds in
seconds. BuildKit cache mounts keep package caches between builds without adding them to the image.

### What makes a good production Dockerfile? {core}

A slim base image pinned by version or digest; a multi-stage build so compilers, dev dependencies and sources stay out
of the final image; dependencies installed before the code is copied; a non-root user; logs to stdout; a
`.dockerignore` that keeps `.git`, `.env` and `node_modules` out; no secrets baked in; one process started in exec form
that handles SIGTERM; and deployment by digest. In CI I scan the image for vulnerabilities.

### Why does exec form matter, and what is special about PID 1? {deep}

Exec form (`CMD ["node", "dist/server.js"]`) runs the process directly as PID 1, so it receives signals. Shell form
wraps it in `/bin/sh -c`, which may not forward SIGTERM. And on Linux, PID 1 gets no default signal behaviour: unless
the process installs a SIGTERM handler, the signal is ignored and the container is killed with SIGKILL when the grace
period ends, dropping in-flight requests and sockets. So the service handles SIGTERM itself, or runs under an init such
as `tini`.

### You build on an Apple Silicon Mac. What can go wrong when you deploy? {deep}

The image is built for arm64 by default, and x86_64 nodes or Cloud Run cannot run it: you get an "exec format error".
I build with `docker buildx build --platform linux/amd64`, or produce a multi-architecture image for both, and let CI
build the release images anyway so laptops never ship artefacts.

### Pod vs Deployment vs Service? {core}

A Pod is one running instance, one or more containers sharing an IP, and it is disposable. A Deployment keeps a set of
identical pods running, replaces failed ones and does rolling updates and rollbacks through ReplicaSets. A Service gives
those changing pods a stable DNS name and virtual IP and load-balances across the ready ones selected by label. The
Deployment runs the pods; the Service lets others reach them.

### Liveness, readiness and startup probes: what is the difference? {core}

Readiness decides whether a pod gets new traffic: when it fails, the pod leaves the Service endpoints but keeps running,
which is right during warm-up, temporary dependency trouble and draining. Liveness decides whether the container is
broken: when it fails, Kubernetes restarts it, so it must be simple and never depend on external systems. Startup
protects slow starters: the other probes wait until it passes. The classic mistake is a liveness probe that checks the
database, so one database blip restarts every pod.

### Requests vs limits: what happens when a container exceeds them?

Requests are what the scheduler reserves, and HPA utilisation is measured against them; on Autopilot they are also
what you pay for. Limits are caps. Over the memory limit, the container is OOMKilled and restarted; over a CPU limit, it
is throttled, which shows up as latency. A common practice is memory request equal to the limit, and a CPU request with
no CPU limit, so the service can burst without being throttled.

### How do you autoscale a WebSocket gateway or a queue worker on GKE? {core}

The HPA scales replicas to keep a metric at a target, using `ceil(current × metric ÷ target)`. CPU works for
CPU-bound services, but a gateway is limited by open connections and memory, and a worker by its backlog. So I export
open connections as a custom metric and scale on connections per pod, and scale workers on an external metric such as
the subscription's undelivered message count or the age of the oldest message, through the HPA or KEDA. Node capacity
follows: Autopilot provisions it from pod requests, Standard uses the cluster autoscaler.

### How do rolling updates and rollbacks work?

Changing the pod template, usually the image digest, makes the Deployment create a new ReplicaSet and move pods over
gradually: `maxSurge` says how many extra pods may exist, `maxUnavailable` how many may be missing. New pods get traffic
only when they are ready, so a broken version stalls instead of taking everything down. `kubectl rollout undo` returns
to the previous ReplicaSet, and with digests the rollback is exact.

### How do you keep WebSocket connections from dropping badly during a deployment? {core}

Assume they will drop, and make it graceful. The pod's preStop hook fails readiness and tells clients to reconnect;
on SIGTERM the server closes remaining sockets with close code 1012 (service restart) and exits within a generous
`terminationGracePeriodSeconds`. The load balancer gets a long backend timeout and connection draining. A
PodDisruptionBudget keeps enough replicas during node upgrades. Clients reconnect with jittered exponential backoff,
resubscribe, and resume from their last event id, so the user sees at most a short "reconnecting" state.

### A pod is in CrashLoopBackOff. How do you debug it? {core}

CrashLoopBackOff means the container keeps exiting and Kubernetes restarts it with growing delays. First
`kubectl logs <pod> --previous` to see why the last run died; usually a stack trace, a missing environment variable or
a failed connection at start-up. Then `kubectl describe pod` for events and the exit code: 137 means OOMKilled, and
probe failures show there too. Typical fixes: add the missing Secret or ConfigMap key, raise the memory limit, give a
slow starter a startup probe, or fix the command. If logs are not enough, I run the same image locally with the same
environment.

### GKE Autopilot or Standard?

Autopilot by default: Google manages the nodes, sizes capacity from pod requests, applies hardened security defaults
and bills mostly per pod request, so the team operates workloads rather than infrastructure. Standard when we need
node-level control: specific machine types or kernels, DaemonSets with special privileges, or very tight bin-packing to
control cost.

### How does a pod on GKE call Google Cloud APIs securely? {core}

With Workload Identity Federation for GKE, never with key files. The pod runs as a Kubernetes ServiceAccount; the GKE
metadata server exchanges that account's token for a short-lived Google Cloud token, and I grant IAM roles directly to
the ServiceAccount's principal, for example Secret Manager accessor on one secret. Each workload gets its own
ServiceAccount with least privilege. It is always on in Autopilot.

**Your angle:** the same idea as Microsoft Entra Workload ID on AKS.

### Ingress or Gateway API on GKE? {deep}

Both make GKE provision a Google Cloud load balancer. Gateway API is the newer, more expressive model: it separates the
platform team's Gateway from application teams' HTTPRoutes, supports traffic splitting and header matching natively,
and on GKE takes policies such as GCPBackendPolicy for timeouts and draining. For a new platform I would use Gateway;
Ingress is fine for existing setups.

### ConfigMap vs Secret, and how should secrets really be managed on GKE?

ConfigMaps hold non-sensitive configuration; Secrets hold sensitive values, but by default they are only base64-encoded
and readable by anyone with access to them. So I keep the source of truth in Secret Manager, mount it with the Secret
Manager add-on (or read it at runtime through Workload Identity Federation), lock down RBAC, and enable application-layer
encryption of Secrets in etcd if Kubernetes Secrets are used. Never in Git or in images.

### What is a PodDisruptionBudget for? {deep}

It limits voluntary disruptions such as node upgrades, drains and autoscaler scale-downs: "at least two gateway pods
must stay available". Without it, a node upgrade can evict every replica of a service at once. It does not protect
against involuntary failures such as a node crashing, which is why you also spread replicas across zones.

### Helm or Kustomize? {deep}

Helm packages templated manifests as a chart with a `values.yaml` per environment, tracks releases, and installs
third-party software. Kustomize is template-free: a base plus overlays that patch it per environment, built into
kubectl. Either works with GitOps tools such as Argo CD or Config Sync. I use Helm for third-party charts and either for
our own services, as long as each environment's rendered manifests are reviewed in a pull request.

### Your resume shows AKS, not GKE. How would you get productive on GKE? {core}

Honestly: I have deployed to AKS with Docker and Kubernetes at The Dot Corp and to Cloud Run on GCP at Quantiphi, but
not GKE. The Kubernetes layer is the same: Deployments, Services, probes, HPA, kubectl debugging. What I would learn
first is the Google-specific part: Workload Identity Federation for GKE, Gateway and load balancer policies, Autopilot's
model, and Cloud Logging and Monitoring. I would read the platform's existing manifests and pipelines and ship a small
change in the first week.

### Why use network policies? {deep}

By default every pod can talk to every pod. Network policies restrict traffic by labels and namespaces, for example only
the gateway may reach the orchestrator, and only the orchestrator may reach the database proxy. It limits blast radius
if one service is compromised, which matters for agents that call external tools. GKE enforces them with Dataplane V2,
on by default in Autopilot.

## Coding problems

### Readiness and draining for a WebSocket gateway pod {easy core}

Build a small FastAPI gateway with `GET /healthz` (always 200 while the process answers), `GET /readyz` (200 normally,
503 once draining), `GET /drain` (called by the pod's preStop hook: start draining) and a WebSocket endpoint `/ws` that
answers `ping` with `pong`. Once draining starts, the next message on an open socket gets `{"type": "reconnect"}` and the
socket is closed with code 1012 (service restart). Track the number of open sockets.

#### Hints

1. Keep the state in one small object: `draining` and `open_sockets`.
2. Return `JSONResponse(..., status_code=503)` from readiness while draining; liveness must stay 200.
3. Count sockets up after `accept()` and down in a `finally` block, so a client that disappears is also counted.

#### Solution

Readiness answers "should new traffic come here?", so draining flips it to 503 and the load balancer and Service stop
sending new connections. Liveness stays healthy so Kubernetes does not restart a pod that is shutting down cleanly.

```python
from dataclasses import dataclass

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

SERVICE_RESTART = 1012


@dataclass
class GatewayState:
    draining: bool = False
    open_sockets: int = 0


state = GatewayState()
app = FastAPI()


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "alive"}


@app.get("/readyz")
def readyz() -> JSONResponse:
    if state.draining:
        return JSONResponse({"status": "draining", "open_sockets": state.open_sockets}, status_code=503)
    return JSONResponse({"status": "ready", "open_sockets": state.open_sockets})


@app.get("/drain")
def drain() -> dict[str, bool]:
    state.draining = True
    return {"draining": True}


@app.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    if state.draining:
        # Closing before accept() rejects the handshake: a real server answers HTTP 403, so the browser sees a failed
        # upgrade and its reconnect logic retries; TestClient reports it as WebSocketDisconnect with this code.
        await websocket.close(code=SERVICE_RESTART)
        return
    await websocket.accept()
    state.open_sockets += 1
    try:
        while True:
            message = await websocket.receive_text()
            if state.draining:
                await websocket.send_json({"type": "reconnect"})
                await websocket.close(code=SERVICE_RESTART)
                return
            await websocket.send_text("pong" if message == "ping" else message)
    except WebSocketDisconnect:
        pass
    finally:
        state.open_sockets -= 1


client = TestClient(app)
with client.websocket_connect("/ws") as sock:
    sock.send_text("ping")
    assert sock.receive_text() == "pong"
    assert client.get("/readyz").json() == {"status": "ready", "open_sockets": 1}

    assert client.get("/drain").json() == {"draining": True}            # preStop hook
    assert client.get("/readyz").status_code == 503
    assert client.get("/healthz").status_code == 200                    # liveness unaffected

    sock.send_text("ping")
    assert sock.receive_json() == {"type": "reconnect"}
    try:
        sock.receive_text()
        raise AssertionError("socket should be closed")
    except WebSocketDisconnect as closed:
        assert closed.code == SERVICE_RESTART

assert state.open_sockets == 0
try:
    with client.websocket_connect("/ws") as late:
        late.receive_text()
    raise AssertionError("new sockets must be refused while draining")
except WebSocketDisconnect as refused:
    assert refused.code == SERVICE_RESTART
```

Complexity: O(1) per probe and message.

#### Follow-ups

- **Idle sockets never send a message. How do they learn about the drain?** Keep a set of open sockets and broadcast
  the reconnect message from the drain handler (or the SIGTERM hook), instead of waiting for the next client message.
- **How long should `terminationGracePeriodSeconds` be?** Long enough for clients to move: the preStop drain, a few
  seconds of reconnect broadcast with jitter, then exit. Pair it with load balancer connection draining.

### Compute the HPA's desired replica count {medium}

Implement the Horizontal Pod Autoscaler's core rule in TypeScript:
`desired = ceil(currentReplicas × currentMetric / targetMetric)`, skipping any change when the ratio is within the
tolerance (default 0.1, so 0.9–1.1), and clamping to `[minReplicas, maxReplicas]`. Add `replicasForBacklog(backlog,
perPodTarget, min, max)` for an external metric such as undelivered messages, where each pod should handle
`perPodTarget` messages.

#### Hints

1. Compute the ratio first; the tolerance check compares `|ratio - 1|` with the tolerance.
2. Clamp at the end, after rounding up.
3. For the backlog version, the per-pod value is `backlog / replicas`, which simplifies to `ceil(backlog / perPodTarget)`.

#### Solution

Rounding up means the HPA prefers one pod too many over one too few. The tolerance stops it flapping when the metric
hovers near the target. Kubernetes computes with milli-units to avoid floating-point surprises; for interview numbers
plain numbers are fine.

```ts
import assert from 'node:assert/strict';

type HpaInput = { current: number; metric: number; target: number; min: number; max: number; tolerance?: number };

export function desiredReplicas({ current, metric, target, min, max, tolerance = 0.1 }: HpaInput): number {
  if (target <= 0) throw new RangeError('target must be positive');
  if (min < 1 || max < min) throw new RangeError('need 1 <= min <= max');
  const ratio = metric / target;
  const desired = Math.abs(ratio - 1) <= tolerance ? current : Math.ceil(current * ratio);
  return Math.min(max, Math.max(min, desired));
}

export function replicasForBacklog(backlog: number, perPodTarget: number, min: number, max: number): number {
  if (perPodTarget <= 0) throw new RangeError('perPodTarget must be positive');
  return Math.min(max, Math.max(min, Math.ceil(backlog / perPodTarget)));
}

// CPU at 90% against a 60% target: scale 4 → 6
assert.equal(desiredReplicas({ current: 4, metric: 90, target: 60, min: 2, max: 20 }), 6);
// 63% is within 10% of 60%: no change
assert.equal(desiredReplicas({ current: 4, metric: 63, target: 60, min: 2, max: 20 }), 4);
// Quiet period: 10 pods at 20% → ceil(3.33) = 4
assert.equal(desiredReplicas({ current: 10, metric: 20, target: 60, min: 2, max: 20 }), 4);
// Clamped to the bounds
assert.equal(desiredReplicas({ current: 10, metric: 600, target: 60, min: 2, max: 30 }), 30);
assert.equal(desiredReplicas({ current: 3, metric: 1, target: 60, min: 2, max: 30 }), 2);
// Open connections per pod: 3 pods averaging 1,800 connections, target 1,000 → 6
assert.equal(desiredReplicas({ current: 3, metric: 1800, target: 1000, min: 3, max: 30 }), 6);

// Backlog of 4,500 messages, each pod should handle about 500 → 9 workers
assert.equal(replicasForBacklog(4500, 500, 1, 50), 9);
assert.equal(replicasForBacklog(0, 500, 1, 50), 1);
assert.equal(replicasForBacklog(1_000_000, 500, 1, 50), 50);
assert.throws(() => desiredReplicas({ current: 1, metric: 1, target: 0, min: 1, max: 2 }), RangeError);
```

Complexity: O(1).

#### Follow-ups

- **Why can scaling still lag a traffic spike?** Metrics are scraped periodically, new pods need time to start and pass
  readiness, and nodes may need provisioning. Keep headroom (a lower target), fast start-up, and a sensible minimum.
- **How does the HPA avoid flapping on scale-down?** A stabilisation window (5 minutes by default for scale-down) uses
  the highest recommendation in the window, plus the tolerance.

### Lint a Deployment before it ships {medium core}

Platform teams often run a policy check in CI before a manifest reaches the cluster. Write `lintDeployment(d)` that
returns a list of problems for a parsed Deployment:

- an image without a tag or digest, or tagged `latest`;
- a container without CPU and memory requests, or without a memory limit;
- a container without a readiness probe;
- not running as non-root (neither the pod nor the container sets `runAsNonRoot: true`);
- `allowPrivilegeEscalation` not explicitly `false`;
- fewer than 2 replicas when the namespace ends in `-prod`.

Note that a registry host can contain a port (`localhost:5000/app` has no tag).

#### Hints

1. The tag is after the last `:` only if that `:` comes after the last `/`; a digest contains `@sha256:`.
2. Check the container's security context first and fall back to the pod's.
3. Prefix each problem with the container name so the report is easy to act on.

#### Solution

Each rule is a small, independent check that pushes a readable message. Tools such as Kyverno, Gatekeeper or
`conftest` do this in real pipelines; writing it by hand shows you know why each rule exists.

```ts
import assert from 'node:assert/strict';

type Container = {
  name: string;
  image: string;
  resources?: { requests?: Record<string, string>; limits?: Record<string, string> };
  readinessProbe?: object;
  securityContext?: { runAsNonRoot?: boolean; allowPrivilegeEscalation?: boolean };
};
type Deployment = {
  metadata: { name: string; namespace: string };
  spec: { replicas?: number; template: { spec: { securityContext?: { runAsNonRoot?: boolean }; containers: Container[] } } };
};

export function imageProblem(image: string): string | null {
  if (image.includes('@sha256:')) return null;
  const lastSlash = image.lastIndexOf('/');
  const lastColon = image.lastIndexOf(':');
  if (lastColon <= lastSlash) return 'has no tag or digest';
  if (image.slice(lastColon + 1) === 'latest') return 'uses the latest tag';
  return null;
}

export function lintDeployment(d: Deployment): string[] {
  const problems: string[] = [];
  const pod = d.spec.template.spec;
  if (d.metadata.namespace.endsWith('-prod') && (d.spec.replicas ?? 1) < 2) {
    problems.push(`deployment ${d.metadata.name}: needs at least 2 replicas in production`);
  }
  for (const c of pod.containers) {
    const where = `container ${c.name}`;
    const image = imageProblem(c.image);
    if (image) problems.push(`${where}: image ${image}`);
    const requests = c.resources?.requests ?? {};
    if (!requests.cpu || !requests.memory) problems.push(`${where}: missing cpu or memory request`);
    if (!c.resources?.limits?.memory) problems.push(`${where}: missing memory limit`);
    if (!c.readinessProbe) problems.push(`${where}: missing readiness probe`);
    if (!(c.securityContext?.runAsNonRoot ?? pod.securityContext?.runAsNonRoot)) problems.push(`${where}: may run as root`);
    if (c.securityContext?.allowPrivilegeEscalation !== false) problems.push(`${where}: allowPrivilegeEscalation is not false`);
  }
  return problems;
}

const good: Deployment = {
  metadata: { name: 'chat-gateway', namespace: 'platform-prod' },
  spec: {
    replicas: 3,
    template: {
      spec: {
        securityContext: { runAsNonRoot: true },
        containers: [{
          name: 'gateway',
          image: 'us-central1-docker.pkg.dev/proj/apps/chat-gateway@sha256:3f1c9a',
          resources: { requests: { cpu: '250m', memory: '512Mi' }, limits: { memory: '512Mi' } },
          readinessProbe: { httpGet: { path: '/readyz', port: 8080 } },
          securityContext: { allowPrivilegeEscalation: false },
        }],
      },
    },
  },
};
assert.deepEqual(lintDeployment(good), []);

const bad: Deployment = {
  metadata: { name: 'orchestrator', namespace: 'platform-prod' },
  spec: { replicas: 1, template: { spec: { containers: [{ name: 'api', image: 'localhost:5000/orchestrator' }] } } },
};
assert.deepEqual(lintDeployment(bad), [
  'deployment orchestrator: needs at least 2 replicas in production',
  'container api: image has no tag or digest',
  'container api: missing cpu or memory request',
  'container api: missing memory limit',
  'container api: missing readiness probe',
  'container api: may run as root',
  'container api: allowPrivilegeEscalation is not false',
]);

assert.equal(imageProblem('nginx:latest'), 'uses the latest tag');
assert.equal(imageProblem('localhost:5000/app:1.2.0'), null);
assert.equal(imageProblem('gcr.io/proj/app'), 'has no tag or digest');
// A dev namespace may run one replica
assert.equal(lintDeployment({ ...bad, metadata: { name: 'orchestrator', namespace: 'platform-dev' } }).length, 6);
```

Complexity: O(c) for c containers.

#### Follow-ups

- **Where should this run?** In CI on the rendered manifests, and again in the cluster as an admission policy
  (Policy Controller, Kyverno or Gatekeeper), because people can bypass CI.
- **What would you add next?** Image registries allowed only from Artifact Registry, required labels for cost
  attribution, and a PodDisruptionBudget for every multi-replica Deployment.
