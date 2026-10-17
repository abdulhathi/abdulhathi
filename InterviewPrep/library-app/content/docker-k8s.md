---
title: Docker and Kubernetes (AKS and GKE)
goal: Write a production Dockerfile for a Python or Node.js service, explain the core Kubernetes objects, probes, autoscaling and rollouts, keep long-lived connections healthy through deploys, debug a failing pod, and compare AKS, GKE and serverless containers.
minutes: 60
---

Containers are how almost every backend, front-end server and ML service ships, so expect questions here even in a
"full stack" interview: Docker layers, a good Dockerfile, pods vs Deployments vs Services, probes, requests and limits,
autoscaling, rolling updates, and how you would debug a pod in CrashLoopBackOff. For real-time services add one more:
how WebSocket and SSE connections survive a rollout.

**Your angle, honestly:** you deployed application changes to **Azure Kubernetes Service (AKS)** at The Dot Corp,
working with Docker containers and Kubernetes deployments, and at Quantiphi you built Docker images for the FastAPI
services, pushed them to **Artifact Registry** and deployed them to **Cloud Run** across Dev, SIT and UAT. You have not
run GKE itself. Kubernetes objects, probes and kubectl are the same on every cloud; what changes is identity, load
balancing and the cluster modes. Interviewers trust "here is what I did" more than definitions, so use those examples.

## Docker essentials

| Term | Meaning |
|---|---|
| Image | A read-only, layered template: OS files, runtime, dependencies and your code |
| Container | A running instance of an image: an isolated process with its own filesystem view, network and resource limits |
| Layer | Each `RUN`, `COPY` or `ADD` creates a cached layer; a change rebuilds that layer and every one after it |
| Registry | Stores and serves images: Docker Hub, Azure Container Registry (ACR), Artifact Registry, ECR |
| Tag vs digest | A tag (`:1.4.2`) can be moved; a digest (`@sha256:…`) names exact bytes and is what you deploy |
| Volume | Storage that outlives the container (databases, uploads) |
| Network | Lets containers reach each other by service name (in Compose) |

Containers share the host's kernel, so they start in milliseconds and are much lighter than virtual machines, which
each run a full guest operating system.

### A production Dockerfile for a Python/FastAPI service

```dockerfile
# Stage 1: build the dependencies (compilers and caches stay in this stage)
FROM python:3.12-slim AS builder
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
WORKDIR /app
COPY requirements.txt .
# This layer stays cached until requirements.txt changes
RUN pip install -r requirements.txt

# Stage 2: the small runtime image
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PATH="/opt/venv/bin:$PATH"
RUN useradd --create-home --uid 10001 appuser
WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
# Code changes only invalidate the layers from here down
COPY --chown=10001:10001 app/ ./app/
# Never run as root; a numeric USER lets Kubernetes' runAsNonRoot verify it
USER 10001
EXPOSE 8080
# Cloud Run sets $PORT; exec makes uvicorn PID 1 so it receives SIGTERM and shuts down gracefully
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

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

- **Dependencies before code:** the manifest (`requirements.txt`, or `package.json` plus the lockfile) is copied and
  installed first, so a code change reuses the cached install layer and rebuilds in seconds. `npm ci` installs exactly
  what the lockfile says.
- **BuildKit cache mount:** the package cache persists between builds without ending up in the image.
- **Multi-stage:** compilers, dev dependencies, pip caches and TypeScript sources stay in earlier stages; the final image
  holds only what runs, so it is smaller and has less to attack.
- **Slim base, non-root user:** fewer packages, fewer CVEs, and a compromised process cannot act as root. Set `USER` by
  **number**: with `runAsNonRoot: true`, Kubernetes refuses to start a container whose image user is a name it cannot
  verify (`CreateContainerConfigError`).
- **Logs to stdout:** `PYTHONUNBUFFERED=1` makes Python logs reach stdout immediately, where Docker, Kubernetes and the
  cloud's logging collect them.
- **Exec form and PID 1:** the server becomes PID 1 and receives SIGTERM directly. A Linux PID 1 gets no default signal
  handling, so the app **must** handle SIGTERM itself (uvicorn does; in Node, `process.on('SIGTERM', …)`) or run under a
  tiny init such as `tini`; otherwise it ignores SIGTERM and is killed abruptly when the grace period ends.

A `.dockerignore` keeps the build context small and secrets out of the image:

```text
.git
node_modules
dist
.venv
__pycache__/
*.pyc
.env
*.log
coverage/
tests/
notebooks/
data/
```

### Building and shipping images

```bash
# On an Apple Silicon Mac, build for the x86_64 nodes the cluster (and Cloud Run) uses
docker buildx build --platform linux/amd64 -t us-central1-docker.pkg.dev/my-proj/apps/chat-api:"$GIT_SHA" --push .

# Deploy by digest, which never changes underneath you
docker buildx imagetools inspect us-central1-docker.pkg.dev/my-proj/apps/chat-api:"$GIT_SHA"
```

Scan images in CI (Artifact Registry, ACR and ECR all offer vulnerability scanning), keep base images current, and pin
the base image by digest for reproducible builds.

### Local development with Docker Compose

```yaml
services:
  api:
    build: .
    ports: ["8080:8080"]
    environment:
      DATABASE_URL: postgresql+psycopg://app:app@db:5432/app   # "db" resolves to the database container
    depends_on:
      db:
        condition: service_healthy
  db:
    image: postgres:17
    environment:
      POSTGRES_USER: app
      POSTGRES_PASSWORD: app      # fine for local development only; use a secret store elsewhere
      POSTGRES_DB: app
    volumes: ["pgdata:/var/lib/postgresql/data"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U app"]
      interval: 5s
      retries: 10
volumes:
  pgdata:
```

## Kubernetes core objects

| Object | What it is | Example |
|---|---|---|
| Pod | One or more containers sharing an IP and volumes; disposable | One replica of an API |
| Deployment | Keeps N identical pods running; rolling updates and rollbacks | `chat-gateway` with 3–30 replicas |
| ReplicaSet | Created by a Deployment to hold one version's pods | You rarely touch it directly |
| Service | Stable name and virtual IP that load-balances to ready pods by label | `chat-gateway.platform.svc.cluster.local` |
| Ingress / Gateway | HTTP routing from outside into Services (host and path rules, TLS) | `api.example.com/ws` → chat-gateway |
| ConfigMap / Secret | Configuration and sensitive values injected as env vars or files | Feature flags; a database password |
| HorizontalPodAutoscaler | Scales replicas on CPU, memory, custom or external metrics | 3–30 pods on CPU or open connections |
| PodDisruptionBudget | Limits voluntary evictions (node upgrades, drains) | Keep at least 2 gateway pods |
| StatefulSet | Pods with stable names and their own persistent volumes | Databases, Kafka |
| DaemonSet | One pod per node | Log and metrics agents |
| Job / CronJob | Run-to-completion work, once or on a schedule | Nightly batch scoring, a backfill |
| Namespace | A virtual cluster for isolation, quotas, RBAC and network policies | `dev`, `uat`, `prod` |

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
      serviceAccountName: chat-gateway                      # its cloud access comes from workload identity
      terminationGracePeriodSeconds: 120                    # time to drain long-lived connections (default 30)
      containers:
        - name: gateway
          image: us-central1-docker.pkg.dev/my-proj/apps/chat-gateway@sha256:3f1c...   # deploy by digest, never :latest
          ports: [{ containerPort: 8080, name: http }]
          env:
            - name: REDIS_URL
              valueFrom: { configMapKeyRef: { name: chat-gateway-config, key: redis-url } }
            - name: DATABASE_URL
              valueFrom: { secretKeyRef: { name: chat-gateway-secrets, key: database-url } }
          resources:
            requests: { cpu: 250m, memory: 512Mi }          # what the scheduler reserves; HPA % is relative to this
            limits: { memory: 512Mi }                       # over the memory limit means OOMKilled
          startupProbe:
            httpGet: { path: /healthz, port: http }
            periodSeconds: 2
            failureThreshold: 30                            # up to 60 s to start (e.g. loading a model)
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
            readOnlyRootFilesystem: true                    # mount an emptyDir at /tmp if the app writes temp files
---
apiVersion: v1
kind: Service
metadata: { name: chat-gateway, namespace: platform }
spec:
  type: ClusterIP
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
      resource: { name: cpu, target: { type: Utilization, averageUtilization: 65 } }   # needs CPU requests
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

| Probe | Question it answers | When it fails |
|---|---|---|
| Startup | Has the app finished starting? | Liveness and readiness wait; after the threshold the container is restarted |
| Readiness | Should this pod get new traffic right now? | Removed from the Service's endpoints; **not** restarted |
| Liveness | Is the process stuck beyond repair? | Container is **restarted** |

Keep liveness cheap and local (is the process responsive?). Never make liveness depend on the database or Redis: if a
dependency blips, every pod restarts at once and turns a small outage into a big one. Dependency checks and draining
belong in readiness.

### Graceful shutdown and draining long-lived connections

When a pod is deleted (a rollout, a scale-down, a node upgrade), Kubernetes removes it from Service endpoints and load
balancer backends **asynchronously**, runs the `preStop` hook, then sends SIGTERM. The app stops accepting new work,
finishes in-flight requests and exits before `terminationGracePeriodSeconds` ends, after which it is killed with
SIGKILL. Because endpoint removal can lag, a short `preStop` sleep (or a drain endpoint) avoids dropping requests that
were already routed to the pod. For WebSockets and SSE it looks like this:

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
metric) and workers on **queue depth or the age of the oldest unacknowledged message** (an external metric, for example
Pub/Sub's `num_undelivered_messages` or a Service Bus queue length), through the HPA's custom and external metrics or
KEDA. The HPA's rule is `desired = ceil(current × currentMetric / target)`; a coding problem below implements it. The
**cluster autoscaler** (an AKS node-pool setting; automatic on GKE Autopilot) adds nodes when pods are Pending for lack
of capacity, and the Vertical Pod Autoscaler adjusts requests instead of replicas.

## Managed Kubernetes: AKS and GKE

| Concept | AKS | GKE |
|---|---|---|
| Managed control plane | Yes | Yes (Autopilot also manages the nodes) |
| Workload identity | Microsoft Entra Workload ID | Workload Identity Federation for GKE |
| Registry | Azure Container Registry | Artifact Registry |
| Secrets from a vault | Key Vault via the Secrets Store CSI driver | Secret Manager add-on for GKE (built on the same CSI driver) |
| Ingress | Application Gateway for Containers, or the application routing add-on (Gateway API mode) | Gateway API / Ingress creating Google Cloud load balancers |
| Monitoring | Azure Monitor, Container Insights | Cloud Logging and Cloud Monitoring (Managed Service for Prometheus) |
| Cluster RBAC | Integrated with Microsoft Entra ID groups | Integrated with Google groups and IAM |

### GKE Autopilot or Standard

| | Autopilot | Standard |
|---|---|---|
| Nodes | Google provisions, scales, patches and secures them from your pods' requests | You create and manage node pools |
| Billing | Mostly per pod resource requests (node-based for pods that pick specific hardware) | Per node, used or not |
| Security | Hardened defaults; Workload Identity Federation for GKE always on | You choose the settings |
| Hardware | Compute classes (for example Balanced or Scale-Out) and Spot Pods request what you need | Any machine type per node pool |
| Choose it when | The default: Google recommends Autopilot for most workloads | You need node-level control, custom kernels, or a specific setup |

### Workload identity: no key files in pods

Pods should never use cloud credential files. On **GKE**, with Workload Identity Federation for GKE, a pod's Kubernetes
ServiceAccount is a federated identity: the GKE metadata server exchanges its Kubernetes token for a short-lived Google
Cloud access token, and you grant IAM roles directly to the Kubernetes ServiceAccount's principal:

```bash
gcloud secrets add-iam-policy-binding erp-api-key \
  --role=roles/secretmanager.secretAccessor \
  --member="principal://iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/my-proj.svc.id.goog/subject/ns/platform/sa/chat-gateway"
```

The older pattern, letting the Kubernetes ServiceAccount impersonate an IAM service account, is still available for
services that do not accept federated tokens. On **AKS**, Microsoft Entra Workload ID does the same job: the pod's
ServiceAccount is federated with a managed identity or app registration, which is granted Azure RBAC roles (for example
Key Vault Secrets User).

### Getting traffic in on GKE: Gateway API, load balancers and long-lived connections

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

### Kubernetes or serverless containers

| | Managed Kubernetes (AKS, GKE, EKS) | Serverless containers (Cloud Run, Azure Container Apps) |
|---|---|---|
| What it is | Managed control plane; you run workloads (and on Standard modes, node pools) | You deploy an image; the platform runs and scales it |
| Scaling | HPA for pods, cluster autoscaler for nodes | Automatic per request; scales to zero; min instances avoid cold starts |
| Concurrency | Whatever your pods handle | A configured number of concurrent requests per instance |
| Releases | Deployments, rolling updates, Helm, GitOps | Immutable revisions with percentage traffic splitting |
| Choose it when | Many services, custom networking, sidecars, GPUs, long-running or stateful work, a platform team | Stateless HTTP services and jobs, small team, pay per use, fastest path to production |

The [Cloud Run chapter](#/cloud-run) covers serverless containers in depth.

## Debugging toolkit

| Command | Use |
|---|---|
| `kubectl get pods -o wide` | Status, restarts, node |
| `kubectl describe pod <pod>` | Events: scheduling failures, image pulls, probe failures, OOMKilled |
| `kubectl logs <pod> --previous` | Logs from the container that just crashed |
| `kubectl exec -it <pod> -- sh` | A shell inside the container (if the image has one) |
| `kubectl debug -it <pod> --image=busybox --target=gateway` | An ephemeral debug container for minimal images |
| `kubectl port-forward svc/chat-gateway 8080:80` | Call the service from your laptop |
| `kubectl rollout status / history / undo deploy/chat-gateway` | Watch, inspect and roll back a deployment |
| `kubectl top pods` | CPU and memory use (needs metrics-server) |
| `kubectl get events --sort-by=.lastTimestamp` | Recent cluster events in order |

| Status | Usual cause | First move |
|---|---|---|
| `CrashLoopBackOff` | The app exits on start: bad config, missing env var, exception | `logs --previous`, then `describe` |
| `ImagePullBackOff` | Wrong image name or tag, or the node's identity cannot read the registry | Check the reference and registry permissions (e.g. AKS attached to ACR) |
| `Pending` | No node has enough CPU/memory, or a selector or volume cannot be satisfied | `describe pod` events; check requests, node pools or compute class |
| `OOMKilled` (exit code 137) | Container exceeded its memory limit | Raise the limit or fix the memory use (model size, per-connection buffers) |
| `CreateContainerConfigError` | A referenced ConfigMap or Secret key is missing, or `runAsNonRoot` with an image whose user is a name, not a UID | Create the key, or set a numeric `USER` / `runAsUser` |
| Running but 0/1 Ready | Readiness probe failing | Check the probe path, port and what it depends on |

## Interview questions

### What is the difference between an image and a container? {core}

An image is a read-only, layered package of everything the app needs: base OS files, the runtime, dependencies and
code. A container is a running instance of that image: an isolated process with a thin writable layer on top. One
image can run as many containers. Anything written inside a container is lost when it is removed, unless it goes to a
volume or an external store.

### How do Docker layers and build caching work? {core}

Each instruction that changes the filesystem (`RUN`, `COPY`, `ADD`) creates a layer, cached by the instruction and its
inputs. When an input changes, that layer and every layer after it are rebuilt. So I order the Dockerfile from least to
most frequently changing: base image, system packages, the dependency manifest and install, and only then the source
code. A code change then rebuilds in seconds. BuildKit cache mounts keep package caches between builds without adding
them to the image, and layers are shared between images on the same host and in the registry.

### What makes a good production Dockerfile? {core}

A slim base image pinned by version or digest; a multi-stage build so compilers, dev dependencies and sources stay out
of the final image; dependencies installed before the code is copied, for caching; a non-root user set by UID; logs to
stdout; a `.dockerignore` that keeps `.git`, `.env` and `node_modules` out; no secrets baked in (inject them at
runtime); one process started in exec form that handles SIGTERM; and deployment by digest. In CI I scan the image for
vulnerabilities.

**Your angle:** the Quantiphi FastAPI services followed this path: Docker image, Artifact Registry, Cloud Run.

### What is a multi-stage build and why use it?

A Dockerfile with several `FROM` stages. Early stages do the heavy work (install compilers, build wheels, compile
TypeScript, run a front-end build), and the final stage copies in only the results with `COPY --from=builder`. The final
image is smaller, starts and pulls faster, and contains fewer packages that could have vulnerabilities. For a React +
FastAPI app, one stage can run `npm run build` and the final Python stage copies only the static `dist` folder.

### Why run containers as a non-root user, and why use slim images?

By default a container process runs as root. If an attacker exploits the app, root inside the container makes
escaping or tampering much easier. A dedicated unprivileged user (plus `runAsNonRoot` and
`allowPrivilegeEscalation: false` in Kubernetes) limits the damage; set it by UID so Kubernetes can verify it. Slim or
distroless base images contain fewer packages, so they are smaller and have fewer known vulnerabilities to patch. Both
matter in regulated environments, where security reviews scan every image.

### CMD vs ENTRYPOINT, exec form, and what is special about PID 1? {deep}

`ENTRYPOINT` sets the executable that always runs; `CMD` provides default arguments (or the default command if there is
no entrypoint), and it is easy to override at `docker run`. **Exec form** (`["uvicorn", "app.main:app"]`) runs the
process directly as PID 1, so it receives signals. **Shell form** (`CMD uvicorn app.main:app`) wraps it in `/bin/sh -c`,
which becomes PID 1 and may not forward SIGTERM. And on Linux, PID 1 gets no default signal behaviour: unless the process
installs a SIGTERM handler, the signal is ignored and the container is killed with SIGKILL when the grace period ends,
dropping in-flight requests and sockets. So the service handles SIGTERM itself or runs under an init such as `tini`. If
you need shell variable expansion, use `sh -c "exec ..."`.

### You build on an Apple Silicon Mac. What can go wrong when you deploy? {deep}

The image is built for arm64 by default, and x86_64 nodes or Cloud Run cannot run it: you get an "exec format error".
I build with `docker buildx build --platform linux/amd64`, or produce a multi-architecture image for both, and let CI
build the release images anyway so laptops never ship artefacts.

### How do containers talk to each other, and how do you persist data?

In Docker Compose, services share a network and reach each other by service name (`db:5432`). In Kubernetes, a Service
gives pods a stable DNS name. For data that must survive restarts, use a **volume** (Compose named volumes, Kubernetes
PersistentVolumeClaims), or better for production, a managed database such as Cloud SQL or Azure Database for
PostgreSQL, with the containers kept stateless.

### Containers vs virtual machines?

A VM virtualises hardware and runs a full guest operating system, so it is heavier (gigabytes, boots in minutes) but
strongly isolated. A container shares the host kernel and isolates processes with namespaces and cgroups, so it is
light (megabytes, starts in milliseconds) and many fit on one host. Containers are the unit of deployment; in the cloud
they usually run on VMs underneath, as AKS and GKE nodes do.

### What is Kubernetes and why use it? {core}

Kubernetes is a container orchestrator. You declare the desired state (this image, 3 replicas, these resources, this
config) and its control loops keep reality matching it: scheduling pods onto nodes, restarting failed containers,
replacing lost nodes, load-balancing through Services, rolling out new versions, and autoscaling. It gives a consistent
platform across clouds. The cost is complexity, which is why managed services like AKS, EKS and GKE exist, and why
serverless containers like Cloud Run are often enough.

### Pod vs Deployment vs Service? {core}

A **Pod** is one running instance: one or more tightly coupled containers sharing an IP and volumes. Pods are
disposable and get a new IP when replaced. A **Deployment** keeps a set of identical pods running: it maintains the
replica count, replaces failed pods and performs rolling updates and rollbacks through ReplicaSets. A **Service** gives
those changing pods a stable DNS name and virtual IP and load-balances across the ready ones, selected by labels. So:
the Deployment runs the pods, the Service lets others reach them.

### ClusterIP, NodePort, LoadBalancer and Ingress: what is the difference?

**ClusterIP** (the default) is reachable only inside the cluster, for service-to-service calls. **NodePort** opens the
same port on every node, which is rarely used directly. **LoadBalancer** asks the cloud for an external load balancer
with a public or private IP, one per service. **Ingress** is an HTTP layer-7 router: one entry point with host and path
rules and TLS termination, routing to many ClusterIP services; it needs an ingress controller. The newer Gateway API is
the more expressive successor to Ingress. Worth knowing: the most common controller, Ingress NGINX, was retired by the
Kubernetes project in March 2026 (on AKS, Microsoft's support for the managed NGINX in the application routing add-on
ends in November 2026), which is pushing teams to Gateway API implementations.

### ConfigMap vs Secret, and how should secrets really be managed? {core}

Both inject configuration as environment variables or files. ConfigMaps hold non-sensitive settings. Secrets hold
sensitive values, but by default they are only base64-encoded and readable by anyone with access to them, so you need
encryption at rest (application-layer encryption of Secrets in etcd), tight RBAC, and ideally an external secret store
as the source of truth. On AKS that means Azure Key Vault through the Secrets Store CSI driver with Workload ID; on GKE,
Secret Manager through the Secret Manager add-on or read at runtime with Workload Identity Federation. Never commit
secrets to Git or bake them into images.

### Liveness, readiness and startup probes: what is the difference? {core}

**Readiness** decides whether a pod receives new traffic: when it fails, the pod is taken out of the Service but keeps
running, which is right during warm-up, temporary dependency trouble and draining. **Liveness** decides whether the
container is broken: when it fails, Kubernetes restarts it, so keep it simple and never depend on external systems.
**Startup** protects slow starters, such as a service loading a large ML model: liveness and readiness wait until it
passes.

The classic mistake is a liveness probe that checks the database: one database blip restarts every pod at once.

### Requests vs limits: what happens when a container exceeds them? {core}

**Requests** are what the scheduler reserves: a pod is placed only on a node with that much free CPU and memory, the
HPA's utilisation percentages are relative to requests, and on GKE Autopilot they are also what you pay for. **Limits**
are hard caps. Exceed the **memory** limit and the container is OOMKilled (exit code 137) and restarted. Exceed the
**CPU** limit and it is throttled, not killed, which shows up as latency. A common practice is memory request equal to
the limit, and a CPU request with no CPU limit, so the service can burst without being throttled. Requests and limits
also set the QoS class (Guaranteed, Burstable, BestEffort) used when a node runs out of memory.

### How does autoscaling work in Kubernetes? {core}

The **Horizontal Pod Autoscaler** adds or removes replicas to keep a metric near a target, using
`ceil(current × metric ÷ target)`: 70% of requested CPU, or a custom or external metric like open connections, requests
per second or queue length (KEDA is popular for event-driven scaling). The **cluster autoscaler** adds nodes when pods
are Pending for lack of capacity and removes underused ones; GKE Autopilot provisions capacity from pod requests. The
Vertical Pod Autoscaler adjusts requests instead. For the HPA to work, pods need resource requests and a metrics source.

### How do you autoscale a WebSocket gateway or a queue worker?

CPU works for CPU-bound services, but a gateway is limited by open connections and memory, and a worker by its backlog.
So I export open connections as a custom metric and scale on connections per pod, and scale workers on an external
metric such as the subscription's undelivered message count or the age of the oldest message, through the HPA or KEDA.
I keep a sensible minimum and some headroom, because new pods need time to start and pass readiness.

### How do rolling updates and rollbacks work? {core}

Changing the pod template, usually the image tag or digest, makes the Deployment create a new ReplicaSet and move pods
over gradually: `maxSurge` says how many extra pods may exist, `maxUnavailable` how many may be missing. New pods get
traffic only once their readiness probe passes, so a broken version stalls instead of taking everything down.
`kubectl rollout undo` returns to the previous ReplicaSet, and with immutable tags or digests the rollback is exact.

### How do you keep WebSocket connections from dropping badly during a deployment?

Assume they will drop, and make it graceful. The pod's preStop hook fails readiness and tells clients to reconnect; on
SIGTERM the server closes remaining sockets with close code 1012 (service restart) and exits within a generous
`terminationGracePeriodSeconds`. The load balancer gets a long backend timeout and connection draining. A
PodDisruptionBudget keeps enough replicas during node upgrades. Clients reconnect with jittered exponential backoff,
resubscribe, and resume from their last event id, so the user sees at most a short "reconnecting" state.

### How does graceful shutdown work, and why does it matter? {deep}

When a pod is deleted (during a rollout or scale-down), Kubernetes removes it from Service endpoints and sends SIGTERM
to the container. The app should stop accepting new work, finish in-flight requests, close connections, and exit before
`terminationGracePeriodSeconds` (30 s by default) ends, after which it is killed with SIGKILL. Uvicorn handles SIGTERM
gracefully if it is PID 1 (exec form); a Node server needs its own handler. Because endpoint removal propagates
asynchronously, a short `preStop` sleep helps avoid dropping requests that were already routed to the pod. Without
this, every deployment drops some requests.

### A pod is in CrashLoopBackOff. How do you debug it? {core}

CrashLoopBackOff means the container keeps exiting and Kubernetes is restarting it with growing delays. First
`kubectl logs <pod> --previous` to see why the last run died: usually a stack trace, a missing environment variable, a
bad config or a failed connection at start-up. Then `kubectl describe pod` for events and the exit code: 137 means
OOMKilled, and probe failures appear there too. Common fixes: add the missing Secret or ConfigMap key, raise the memory
limit, give a slow starter a startup probe instead of a liveness probe that kills it, or fix the command. If the logs
are not enough, I run the same image locally with `docker run` and the same environment.

### What are namespaces and RBAC used for?

Namespaces divide one cluster into virtual clusters, for example per team or per environment, with their own resource
quotas, network policies and permissions. RBAC grants who (users, groups or service accounts) can do what (verbs such as
get, create, delete) on which resources, through Roles (one namespace) or ClusterRoles (cluster-wide) bound with
RoleBindings. On AKS, RBAC is typically integrated with Microsoft Entra ID groups; on GKE, with Google groups and IAM.
Workloads should run with their own least-privilege service accounts.

### Why use network policies? {deep}

By default every pod can talk to every pod. Network policies restrict traffic by labels and namespaces, for example only
the gateway may reach the orchestrator, and only the orchestrator may reach the database proxy. It limits the blast
radius if one service is compromised, which matters for services that call external tools or run untrusted input. GKE
enforces them with Dataplane V2 (on by default in Autopilot); AKS uses Cilium (Azure CNI powered by Cilium) or Calico,
and its older Azure Network Policy Manager is being retired (Windows nodes in September 2026, Linux nodes in 2028).

### Deployment vs StatefulSet vs DaemonSet vs Job? {deep}

A **Deployment** runs interchangeable, stateless replicas: APIs and workers. A **StatefulSet** gives each pod a stable
identity (`db-0`, `db-1`), ordered start-up and its own persistent volume, for databases and brokers (though managed
databases are usually better). A **DaemonSet** runs exactly one pod per node, for log shippers and monitoring agents. A
**Job** runs pods to completion, and a **CronJob** runs Jobs on a schedule, ideal for nightly batch scoring or data
pipelines.

### What is a PodDisruptionBudget for? {deep}

It limits voluntary disruptions such as node upgrades, drains and autoscaler scale-downs: "at least two gateway pods
must stay available". Without it, a node upgrade can evict every replica of a service at once. It does not protect
against involuntary failures such as a node crashing, which is why you also spread replicas across zones.

### Helm or Kustomize? {deep}

Helm is a package manager: a **chart** is a set of templated manifests plus a `values.yaml`, so the same chart deploys
to Dev, UAT and Prod with different values. Helm tracks **releases**, so you can upgrade and roll back as a unit, and you
can install third-party software (ingress controllers, monitoring) from published charts. Kustomize is template-free: a
base plus overlays that patch it per environment, built into kubectl. Either works with GitOps tools such as Argo CD,
Flux or Config Sync. I use Helm for third-party charts and either for our own services, as long as each environment's
rendered manifests are reviewed in a pull request.

### Managed Kubernetes or serverless containers such as Cloud Run: how do you choose? {core}

I choose **serverless containers** (Cloud Run, Azure Container Apps) for stateless HTTP services, APIs and batch jobs
when the team wants to ship fast without running a cluster: they scale to zero, bill per use, and revisions with traffic
splitting make canaries trivial. I choose **managed Kubernetes** (AKS, GKE, EKS) when there are many services that need
a shared platform, custom networking, sidecars, GPUs, long-running or stateful workloads, or portability across clouds,
and there is capacity to operate it.

**Your angle:** "I have deployed to both: FastAPI services on Cloud Run across Dev, SIT and UAT at Quantiphi, and
application changes to AKS with Docker at The Dot Corp."

### GKE Autopilot or Standard?

Autopilot by default: Google manages the nodes, sizes capacity from pod requests, applies hardened security defaults
and bills mostly per pod request, so the team operates workloads rather than infrastructure. Standard when we need
node-level control: specific machine types or kernels, DaemonSets with special privileges, or very tight bin-packing to
control cost.

### How does a pod call cloud APIs securely? {core}

With workload identity, never with key files. On GKE, the pod runs as a Kubernetes ServiceAccount; the GKE metadata
server exchanges that account's token for a short-lived Google Cloud token, and I grant IAM roles directly to the
ServiceAccount's principal, for example Secret Manager accessor on one secret. On AKS, Microsoft Entra Workload ID
federates the ServiceAccount with a managed identity that holds Azure RBAC roles. Each workload gets its own identity
with least privilege.

### Ingress or Gateway API on GKE? {deep}

Both make GKE provision a Google Cloud load balancer. Gateway API is the newer, more expressive model: it separates the
platform team's Gateway from application teams' HTTPRoutes, supports traffic splitting and header matching natively,
and on GKE takes policies such as GCPBackendPolicy for timeouts and draining. For a new platform I would use Gateway;
Ingress is fine for existing setups.

### You have used AKS but not GKE. How would you get productive on GKE?

Honestly: I have deployed to AKS with Docker and Kubernetes at The Dot Corp and to Cloud Run on GCP at Quantiphi, but
not GKE. The Kubernetes layer is the same: Deployments, Services, probes, HPA, kubectl debugging. What I would learn
first is the Google-specific part: Workload Identity Federation for GKE, Gateway and load balancer policies, Autopilot's
model, and Cloud Logging and Monitoring. I would read the team's existing manifests and pipelines and ship a small
change in the first week.

### How would you deploy an ML model on Kubernetes? {deep}

Package the model with its serving code in an image, or download it from a registry at start-up. Use a startup probe so
slow model loading is not mistaken for a hang, and a readiness probe that passes only once the model is loaded. Set
memory requests and limits from the measured model footprint (OOMKills are common with large models). Run GPU models
on a dedicated GPU node pool with taints and tolerations, and scale on a metric that reflects load, such as concurrent
requests or queue depth, rather than CPU alone. Roll out new model versions with canaries, and for many models consider
a serving framework (KServe, Triton) or a managed endpoint.

## Coding problems

### Liveness and readiness endpoints for a model service {easy core}

Add two endpoints to a FastAPI service that loads a model at start-up:

- `GET /healthz` (liveness) returns 200 whenever the process is responsive.
- `GET /readyz` (readiness) returns 200 only when the model is loaded and the service is not shutting down; otherwise 503.

Simulate a model that is still loading, then loaded, then a shutdown starting.

#### Hints

1. Keep the readiness state in a small object that start-up and shutdown code can update.
2. Kubernetes treats any status from 200 to 399 as success, so "not ready" needs a 5xx status.
3. Liveness must not check the model or any dependency, only that the process can answer.

#### Solution

Readiness answers "should traffic come here?", so it reflects the model and shutdown state. Liveness answers "should
Kubernetes restart me?", so it stays trivially true while the process can respond.

```python
from dataclasses import dataclass

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

@dataclass
class State:
    model_loaded: bool = False
    shutting_down: bool = False

state = State()
app = FastAPI()

@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "alive"}           # no dependency checks: a DB blip must not restart every pod

@app.get("/readyz")
def readyz() -> JSONResponse:
    if state.model_loaded and not state.shutting_down:
        return JSONResponse({"status": "ready"})
    reason = "shutting down" if state.shutting_down else "model loading"
    return JSONResponse({"status": "not ready", "reason": reason}, status_code=503)

client = TestClient(app)

# While the model loads: alive, but no traffic yet.
assert client.get("/healthz").status_code == 200
assert client.get("/readyz").status_code == 503
assert client.get("/readyz").json()["reason"] == "model loading"

# Model loaded: ready for traffic.
state.model_loaded = True
assert client.get("/readyz").json() == {"status": "ready"}

# SIGTERM received: stop taking new traffic, keep serving in-flight requests.
state.shutting_down = True
assert client.get("/readyz").status_code == 503
assert client.get("/healthz").status_code == 200
```

Complexity: O(1) per probe.

#### Follow-ups

- **Should readiness check the database?** Only if the pod truly cannot serve anything without it, and with a short
  timeout. Never in liveness.
- **What probe settings would you use for a model that takes 45 s to load?** A startup probe with
  `failureThreshold × periodSeconds` comfortably above 45 s, so liveness does not restart it during loading.

### Readiness and draining for a WebSocket gateway pod {medium core}

Build a small FastAPI gateway with `GET /healthz` (always 200 while the process answers), `GET /readyz` (200 normally,
503 once draining), `GET /drain` (called by the pod's preStop hook: start draining) and a WebSocket endpoint `/ws` that
answers `ping` with `pong`. Once draining starts, the next message on an open socket gets `{"type": "reconnect"}` and the
socket is closed with code 1012 (service restart). Track the number of open sockets.

#### Hints

1. Keep the state in one small object: `draining` and `open_sockets`.
2. Readiness returns 503 while draining; liveness must stay 200.
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

### Load configuration from the environment {easy}

Following the twelve-factor approach, a containerised service reads its configuration from environment variables.
Write `load_settings(env)` that returns a frozen settings object with: `database_url` (required), `port` (int, default
8080, must be 1–65535), `log_level` (default `INFO`, one of DEBUG/INFO/WARNING/ERROR), and `allowed_origins` (a
comma-separated list, default empty). Raise one `ValueError` listing every problem.

#### Hints

1. Take the environment as a mapping parameter (default `os.environ`), so tests can pass a plain dict.
2. Collect errors in a list and raise once at the end, so a bad deployment reports everything in one go.

#### Solution

Configuration through environment variables lets the same image run in Dev, UAT and Prod, with values coming from
ConfigMaps, Secrets or Cloud Run settings. Failing fast with a clear message at start-up makes the pod crash with a
readable log line instead of misbehaving later. In a real FastAPI project, `pydantic-settings` does the same job
declaratively.

```python
import os
from collections.abc import Mapping
from dataclasses import dataclass

LEVELS = {"DEBUG", "INFO", "WARNING", "ERROR"}

@dataclass(frozen=True)
class Settings:
    database_url: str
    port: int
    log_level: str
    allowed_origins: tuple[str, ...]

def load_settings(env: Mapping[str, str] = os.environ) -> Settings:
    errors: list[str] = []
    database_url = env.get("DATABASE_URL", "").strip()
    if not database_url:
        errors.append("DATABASE_URL is required")
    port = 8080
    try:
        port = int(env.get("PORT", "8080"))
        if not 1 <= port <= 65535:
            errors.append(f"PORT must be 1-65535, got {port}")
    except ValueError:
        errors.append(f"PORT must be an integer, got {env['PORT']!r}")
    log_level = env.get("LOG_LEVEL", "INFO").upper()
    if log_level not in LEVELS:
        errors.append(f"LOG_LEVEL must be one of {sorted(LEVELS)}, got {log_level!r}")
    origins = tuple(o.strip() for o in env.get("ALLOWED_ORIGINS", "").split(",") if o.strip())
    if errors:
        raise ValueError("; ".join(errors))
    return Settings(database_url, port, log_level, origins)

s = load_settings({"DATABASE_URL": "postgresql://db/app", "ALLOWED_ORIGINS": "https://a.org, https://b.org"})
assert s == Settings("postgresql://db/app", 8080, "INFO", ("https://a.org", "https://b.org"))
assert load_settings({"DATABASE_URL": "x", "PORT": "9000", "LOG_LEVEL": "debug"}).log_level == "DEBUG"

try:
    load_settings({"PORT": "abc", "LOG_LEVEL": "LOUD"})
    raise AssertionError("should have failed")
except ValueError as e:
    message = str(e)
assert "DATABASE_URL is required" in message
assert "PORT must be an integer" in message and "LOG_LEVEL must be one of" in message

try:
    s.port = 1                                   # frozen: settings cannot change at runtime
    raise AssertionError("should be frozen")
except AttributeError:
    pass
```

Complexity: O(k) for k settings.

#### Follow-ups

- **Where would the values come from in Kubernetes?** Non-secret values from a ConfigMap, the database URL from a Secret
  (ideally synced from Key Vault or Secret Manager), both injected with `envFrom` or `valueFrom`.
- **Why not read `os.environ` all over the code?** One typed settings object is validated once, easy to test, and
  documents every setting in one place.

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
- **What would you add next?** Images allowed only from the organisation's registry, required labels for cost
  attribution, and a PodDisruptionBudget for every multi-replica Deployment.
