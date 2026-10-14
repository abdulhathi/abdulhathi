---
title: Docker and Kubernetes
goal: Write a production Dockerfile for a FastAPI service, explain the core Kubernetes objects and probes, and debug a failing pod, with AKS and Cloud Run examples from your own work.
minutes: 40
---

Containers are how every Python and ML service in this role will ship, so expect a few questions here even in a
"full stack" interview: Docker layers, a good Dockerfile, pods vs deployments, probes, and how you would debug a pod in
CrashLoopBackOff.

This is home ground for you. You deployed changes to **Azure Kubernetes Service (AKS)** at The Dot Corp, and at
Quantiphi you built Docker images for the FastAPI services, pushed them to **Artifact Registry** and deployed them to
**Cloud Run** across Dev, SIT and UAT. Use those as your examples; interviewers trust "here is what I did" more than
definitions.

## Docker in one table

| Term | Meaning |
|---|---|
| Image | A read-only, layered template: OS files, Python, your dependencies and code |
| Container | A running instance of an image: an isolated process with its own filesystem, network and limits |
| Layer | Each Dockerfile instruction that changes files creates a cached layer; unchanged layers are reused |
| Registry | Stores and serves images: Docker Hub, Azure Container Registry (ACR), Artifact Registry, ECR |
| Volume | Storage that outlives the container (databases, uploads) |
| Network | Lets containers reach each other by service name (in Compose) |

Containers share the host's kernel, so they start in milliseconds and are much lighter than virtual machines, which
each run a full guest operating system.

### A production Dockerfile for FastAPI

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
COPY --chown=appuser:appuser app/ ./app/
# Never run as root
USER appuser
EXPOSE 8080
# Cloud Run sets $PORT; exec makes uvicorn PID 1 so it receives SIGTERM and shuts down gracefully
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
```

Why each choice matters:

- **Copy `requirements.txt` before the code:** dependencies install in a cached layer, so a code change rebuilds in
  seconds instead of reinstalling everything.
- **Multi-stage:** build tools and pip caches never reach the final image, which is smaller and has less to attack.
- **Slim base, non-root user:** smaller image, fewer CVEs, and a compromised process cannot act as root.
- **`PYTHONUNBUFFERED=1`:** logs reach `stdout` immediately, where Docker, Kubernetes and Cloud Logging collect them.
- **`exec` in the command:** the server becomes PID 1 and receives the SIGTERM that orchestrators send before
  stopping a container.

A `.dockerignore` keeps the build context small and secrets out of the image:

```text
.git
.venv
__pycache__/
*.pyc
.env
tests/
notebooks/
data/
```

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
| Pod | Smallest unit: one or more containers sharing a network namespace and volumes | One replica of the API |
| Deployment | Keeps N identical pods running; handles rolling updates and rollbacks | The API with 3 replicas |
| ReplicaSet | Created by a Deployment to hold one version's pods | You rarely touch it directly |
| Service | Stable virtual IP and DNS name that load-balances to matching pods | `risk-api.default.svc.cluster.local` |
| Ingress / Gateway | HTTP routing from outside to services (host and path rules, TLS) | `api.example.com/risk` → risk-api |
| ConfigMap / Secret | Configuration and sensitive values injected as env vars or files | Feature flags; DB password |
| HorizontalPodAutoscaler | Scales replicas on CPU, memory or custom metrics | 3–20 pods at 70% CPU |
| StatefulSet | Pods with stable names and their own persistent volumes | Databases, Kafka |
| DaemonSet | One pod per node | Log and metrics agents |
| Job / CronJob | Run-to-completion work, once or on a schedule | Nightly batch scoring |
| Namespace | A virtual cluster for isolation, quotas and RBAC | `dev`, `uat`, `prod` |

### A Deployment, Service and autoscaler

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: risk-api
spec:
  replicas: 3
  selector:
    matchLabels: { app: risk-api }
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }   # add a new pod before removing an old one
  template:
    metadata:
      labels: { app: risk-api }
    spec:
      terminationGracePeriodSeconds: 30
      containers:
        - name: api
          image: myregistry.azurecr.io/risk-api:1.4.2       # an immutable tag (or digest), never :latest
          ports: [{ containerPort: 8080 }]
          envFrom:
            - configMapRef: { name: risk-api-config }
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef: { name: risk-api-secrets, key: database-url }
          resources:
            requests: { cpu: 250m, memory: 256Mi }           # what the scheduler reserves
            limits: { memory: 512Mi }                        # exceeding memory gets the container OOMKilled
          startupProbe:
            httpGet: { path: /healthz, port: 8080 }
            failureThreshold: 30
            periodSeconds: 2                                  # allows up to 60 s to start (e.g. loading a model)
          readinessProbe:
            httpGet: { path: /readyz, port: 8080 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /healthz, port: 8080 }
            periodSeconds: 10
          securityContext:
            runAsNonRoot: true
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true                     # mount an emptyDir at /tmp if the app writes temp files
---
apiVersion: v1
kind: Service
metadata:
  name: risk-api
spec:
  type: ClusterIP
  selector: { app: risk-api }
  ports: [{ port: 80, targetPort: 8080 }]
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: risk-api
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: risk-api }
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target: { type: Utilization, averageUtilization: 70 }   # needs CPU requests to be set
```

### The three probes

| Probe | Question it answers | When it fails |
|---|---|---|
| Startup | Has the app finished starting? | Liveness and readiness wait; after the threshold the container is restarted |
| Readiness | Can this pod take traffic right now? | Pod is removed from the Service's endpoints; **not** restarted |
| Liveness | Is the process stuck beyond repair? | Container is **restarted** |

Keep liveness cheap and local (is the process responsive?). Never make liveness depend on the database: if the
database blips, every pod restarts at once and turns a small outage into a big one. Put dependency checks in readiness.

### Debugging toolkit

| Command | Use |
|---|---|
| `kubectl get pods -o wide` | Status, restarts, node |
| `kubectl describe pod <pod>` | Events: scheduling failures, image pulls, probe failures, OOMKilled |
| `kubectl logs <pod> --previous` | Logs from the container that just crashed |
| `kubectl exec -it <pod> -- sh` | A shell inside the container |
| `kubectl port-forward svc/risk-api 8080:80` | Call the service from your laptop |
| `kubectl rollout status / history / undo deploy/risk-api` | Watch, inspect and roll back a deployment |
| `kubectl top pods` | CPU and memory use (needs metrics-server) |
| `kubectl get events --sort-by=.lastTimestamp` | Recent cluster events in order |

| Status | Usual cause | First move |
|---|---|---|
| `CrashLoopBackOff` | The app exits on start: bad config, missing env var, exception | `logs --previous`, then `describe` |
| `ImagePullBackOff` | Wrong image name or tag, or no permission to the registry | Check the tag; registry access (e.g. AKS attached to ACR) |
| `Pending` | No node has enough CPU/memory, or a selector/volume cannot be satisfied | `describe pod` events; check requests and node pools |
| `OOMKilled` (exit code 137) | Container exceeded its memory limit | Raise the limit or fix the memory use; check model size |
| `CreateContainerConfigError` | A referenced ConfigMap or Secret is missing | Create it or fix the key name |
| Running but 0/1 Ready | Readiness probe failing | Check the probe path, port and what it depends on |

### AKS and Cloud Run

| | Azure Kubernetes Service (AKS) | Google Cloud Run |
|---|---|---|
| What it is | Managed Kubernetes: Azure runs the control plane, you manage node pools and workloads | Serverless containers: you deploy an image, Google runs and scales it |
| Scaling | HPA for pods, cluster autoscaler for nodes | Automatic per request; scales to zero; min instances avoid cold starts |
| Concurrency | Whatever your pods handle | Up to a set number of concurrent requests per instance (default 80) |
| Releases | Deployments, rolling updates, Helm | Immutable revisions with percentage traffic splitting |
| Identity and secrets | Microsoft Entra Workload ID; Key Vault via the Secrets Store CSI driver | Per-service service account; Secret Manager as env vars or files |
| Choose it when | Many services, custom networking, sidecars, GPUs, long-running or stateful work, platform team available | Stateless HTTP services and jobs, small team, pay per use, fastest path to production |

**Your angle:** "At Quantiphi our FastAPI services ran on Cloud Run: build the image, push to Artifact Registry,
deploy a new revision per environment. At The Dot Corp the applications ran on AKS, where I modified application
logic and deployed it to the cluster. I would pick Cloud Run for stateless APIs and AKS when we need Kubernetes-level
control."

## Interview questions

### What is the difference between an image and a container? {core}

An image is a read-only, layered package of everything the app needs: base OS files, the Python runtime, dependencies
and code. A container is a running instance of that image: an isolated process with a thin writable layer on top. One
image can run as many containers. Anything written inside a container is lost when it is removed, unless it goes to a
volume or an external store.

### How do Docker layers and build caching work? {core}

Each instruction that changes the filesystem (`RUN`, `COPY`, `ADD`) creates a layer, and Docker caches it keyed on the
instruction and its inputs. When an instruction's inputs change, that layer and every layer after it are rebuilt. So
order the Dockerfile from least to most frequently changing: base image, system packages, `COPY requirements.txt` and
`pip install`, and only then `COPY` the source code. A code change then rebuilds in seconds. Layers are also shared
between images on the same host and in the registry.

### What makes a good production Dockerfile for a Python service? {core}

A slim, pinned base image; a multi-stage build so compilers and caches stay out of the runtime image; dependencies
installed before the code is copied, for caching; a non-root user; `PYTHONUNBUFFERED` so logs stream; a
`.dockerignore` to keep `.git`, `.env` and data out; no secrets baked in (inject them at runtime); one process per
container started in exec form; and an immutable version tag. I also scan the image for vulnerabilities in CI.

**Your angle:** the Quantiphi FastAPI services followed this path: Docker image, Artifact Registry, Cloud Run.

### What is a multi-stage build and why use it?

A Dockerfile with several `FROM` stages. Early stages do the heavy work (install compilers, build wheels, run a
frontend build), and the final stage copies in only the results with `COPY --from=builder`. The final image is smaller,
starts and pulls faster, and contains fewer packages that could have vulnerabilities. For a React + FastAPI app, one
stage can run `npm run build` and the final Python stage copies only the static `dist` folder.

### Why run containers as a non-root user, and why use slim images?

By default a container process runs as root. If an attacker exploits the app, root inside the container makes
escaping or tampering much easier. A dedicated unprivileged user (plus `runAsNonRoot` and
`allowPrivilegeEscalation: false` in Kubernetes) limits the damage. Slim or distroless base images contain fewer
packages, so they are smaller and have fewer known vulnerabilities to patch. Both matter in healthcare, where security
reviews will scan your images.

### CMD vs ENTRYPOINT, and why does exec form matter? {deep}

`ENTRYPOINT` sets the executable that always runs; `CMD` provides default arguments (or the default command if there is
no entrypoint), and it is easy to override at `docker run`. **Exec form** (`["uvicorn", "app.main:app"]`) runs the
process directly as PID 1, so it receives signals. **Shell form** (`CMD uvicorn app.main:app`) wraps it in `/bin/sh -c`,
which becomes PID 1 and may not forward SIGTERM, so the app is killed abruptly after the grace period instead of
finishing in-flight requests. If you need shell variable expansion, use `sh -c "exec ..."`.

### How do containers talk to each other, and how do you persist data?

In Docker Compose, services share a network and reach each other by service name (`db:5432`). In Kubernetes, a Service
gives pods a stable DNS name. For data that must survive restarts, use a **volume** (Compose named volumes, Kubernetes
PersistentVolumeClaims), or better for production, a managed database such as Cloud SQL or Azure Database for
PostgreSQL, with the containers kept stateless.

### Containers vs virtual machines?

A VM virtualises hardware and runs a full guest operating system, so it is heavier (gigabytes, boots in minutes) but
strongly isolated. A container shares the host kernel and isolates processes with namespaces and cgroups, so it is
light (megabytes, starts in milliseconds) and many fit on one host. Containers are the unit of deployment; in the cloud
they usually run on VMs underneath, as AKS nodes do.

### What is Kubernetes and why use it? {core}

Kubernetes is a container orchestrator. You declare the desired state (this image, 3 replicas, these resources, this
config) and its control loops keep reality matching it: scheduling pods onto nodes, restarting failed containers,
replacing lost nodes, load-balancing through Services, rolling out new versions, and autoscaling. It gives a consistent
platform across clouds. The cost is complexity, which is why managed services like AKS, EKS and GKE exist, and why
serverless containers like Cloud Run are often enough.

### Pod vs Deployment vs Service? {core}

A **Pod** is one running instance: one or more tightly coupled containers sharing an IP and volumes. Pods are
disposable and get a new IP when replaced. A **Deployment** manages a set of identical pods: it keeps the replica count,
replaces failed pods and performs rolling updates and rollbacks. A **Service** gives those changing pods a stable name
and virtual IP and load-balances across the ready ones, selected by labels. So: the Deployment runs the pods, the
Service lets others reach them.

### ClusterIP, NodePort, LoadBalancer and Ingress: what is the difference?

**ClusterIP** (the default) is reachable only inside the cluster, for service-to-service calls. **NodePort** opens the
same port on every node, which is rarely used directly. **LoadBalancer** asks the cloud for an external load balancer
with a public or private IP, one per service. **Ingress** is an HTTP layer-7 router: one entry point with host and path
rules and TLS termination, routing to many ClusterIP services; it needs an ingress controller. The newer Gateway API is
the more expressive successor to Ingress.

### ConfigMap vs Secret, and how should secrets really be managed? {core}

Both inject configuration as environment variables or files. ConfigMaps hold non-sensitive settings. Secrets hold
sensitive values, but by default they are only base64-encoded, not encrypted, so you need encryption at rest, tight
RBAC, and ideally an external secret store. On AKS that means Azure Key Vault through the Secrets Store CSI driver with
Workload Identity; on GCP, Secret Manager (Cloud Run can mount secrets directly). Never commit secrets to Git or bake
them into images.

### Liveness, readiness and startup probes: what is the difference? {core}

**Readiness** decides whether a pod receives traffic: when it fails, the pod is taken out of the Service but keeps
running, which is right during warm-up or a temporary dependency problem. **Liveness** decides whether the container is
broken: when it fails, Kubernetes restarts it, so keep it simple and never depend on external systems. **Startup**
protects slow starters, such as a service loading a large ML model: liveness and readiness wait until it passes.

The classic mistake is a liveness probe that checks the database: one database blip restarts every pod at once.

### Requests vs limits: what happens when a container exceeds them? {core}

**Requests** are what the scheduler reserves: a pod is placed only on a node with that much free CPU and memory, and
the HPA's utilisation percentages are relative to requests. **Limits** are hard caps. Exceed the **memory** limit and
the container is OOMKilled (exit code 137) and restarted. Exceed the **CPU** limit and it is throttled, not killed, which
shows up as latency. A common practice is to set memory requests and limits, and CPU requests but no CPU limit to avoid
throttling. Requests and limits also determine the QoS class (Guaranteed, Burstable, BestEffort) used when a node
runs out of memory.

### How does autoscaling work in Kubernetes?

The **Horizontal Pod Autoscaler** adds or removes pod replicas to keep a metric near a target, such as 70% of requested
CPU, or a custom metric like queue length or requests per second (KEDA is popular for event-driven scaling). The
**cluster autoscaler** (on AKS, a node-pool setting) adds nodes when pods are Pending for lack of capacity and removes
underused nodes. The Vertical Pod Autoscaler adjusts requests instead. For HPA to work, pods need resource requests and
the metrics server.

### How do rolling updates and rollbacks work?

Changing the pod template (usually the image tag) makes the Deployment create a new ReplicaSet and shift pods over
gradually: `maxSurge` controls how many extra pods may be created, `maxUnavailable` how many may be down. New pods only
receive traffic once their readiness probe passes, so a bad version stalls instead of taking everything down.
`kubectl rollout undo deployment/risk-api` returns to the previous ReplicaSet. With immutable image tags, a rollback is
exact and fast.

### A pod is in CrashLoopBackOff. How do you debug it? {core}

CrashLoopBackOff means the container keeps exiting and Kubernetes is restarting it with growing delays. First
`kubectl logs <pod> --previous` to see why the last run died: usually a stack trace, a missing environment variable, a
bad config or a failed connection at start-up. Then `kubectl describe pod` for events and the exit code: 137 means
OOMKilled, and probe failures appear there too. Common fixes: add the missing Secret or ConfigMap key, raise the memory
limit, relax a liveness probe that kills a slow-starting app, or fix the entrypoint. I reproduce it locally with
`docker run` and the same environment when the logs are not enough.

### What are namespaces and RBAC used for?

Namespaces divide one cluster into virtual clusters, for example per team or per environment, with their own resource
quotas, network policies and permissions. RBAC grants who (users, groups or service accounts) can do what (verbs such as
get, create, delete) on which resources, through Roles (one namespace) or ClusterRoles (cluster-wide) bound with
RoleBindings. On AKS, RBAC is typically integrated with Microsoft Entra ID groups. Workloads should run with
their own least-privilege service accounts.

### What is Helm? {deep}

Helm is a package manager for Kubernetes. A **chart** is a set of templated manifests plus a `values.yaml`, so the same
chart deploys to Dev, UAT and Prod with different values (replicas, image tag, resources). Helm tracks **releases**, so
you can upgrade and roll back as a unit, and you can install third-party software (ingress controllers, monitoring) from
published charts. Kustomize is the template-free alternative built into kubectl; GitOps tools such as Argo CD or Flux
apply either from Git.

### Deployment vs StatefulSet vs DaemonSet vs Job? {deep}

A **Deployment** runs interchangeable, stateless replicas: APIs and workers. A **StatefulSet** gives each pod a stable
identity (`db-0`, `db-1`), ordered start-up and its own persistent volume, for databases and brokers (though managed
databases are usually better). A **DaemonSet** runs exactly one pod per node, for log shippers and monitoring agents. A
**Job** runs pods to completion, and a **CronJob** runs Jobs on a schedule, ideal for nightly batch scoring or data
pipelines.

### AKS or Cloud Run: how do you choose? {core}

I choose **Cloud Run** for stateless HTTP services, APIs and batch jobs when the team wants to ship fast without
running a cluster: it scales to zero, bills per use, and revisions with traffic splitting make canaries trivial. I
choose **AKS** (or another managed Kubernetes) when there are many services that need a shared platform, custom
networking, sidecars, GPUs, long-running or stateful workloads, or portability across clouds, and there is capacity to
operate it.

**Your angle:** "I have deployed to both: FastAPI services on Cloud Run across Dev, SIT and UAT at Quantiphi, and
application changes to AKS with Docker at The Dot Corp."

### How does graceful shutdown work, and why does it matter? {deep}

When a pod is deleted (during a rollout or scale-down), Kubernetes removes it from Service endpoints and sends SIGTERM
to the container. The app should stop accepting new work, finish in-flight requests, close connections, and exit
before `terminationGracePeriodSeconds` (30 s by default) ends, after which it is killed with SIGKILL. Uvicorn handles
SIGTERM gracefully if it is PID 1 (exec form). Because endpoint removal propagates asynchronously, a short `preStop`
sleep helps avoid dropping requests that were already routed to the pod. Without this, every deployment drops some
requests.

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
2. Return `JSONResponse(status_code=503, ...)` for not ready: Kubernetes treats any status from 200 to 399 as success.
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
