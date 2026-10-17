---
title: "Shortly: a link shortener with click analytics, shipped to Kubernetes the production way"
summary: A three-service app (FastAPI API, Node.js redirector, Python worker, with PostgreSQL and Redis) packaged as small, non-root, scanned images and deployed with a Helm chart that has probes, autoscaling, disruption budgets, network policies and a zero-downtime rollout, all tested in CI on a kind cluster.
time: 4–5 days of evenings
---

## What you will build

The application is small on purpose; the point is everything around it.

- **api** (Python, FastAPI): create short links, list your links, read click statistics.
- **redirect** (Node.js, TypeScript): the hot path. `GET /:code` looks the code up in Redis (falling back to PostgreSQL), answers `302`, and appends a click event to a Redis Stream.
- **worker** (Python): reads the stream in a consumer group and aggregates clicks per link per hour into PostgreSQL.

You then make it production-grade: multi-stage, non-root, minimal images with health checks and a vulnerability scan; a Helm chart with readiness, liveness and startup probes, resource requests and limits, a HorizontalPodAutoscaler for the redirector, a PodDisruptionBudget, config and secrets, network policies and a Gateway API route; graceful shutdown; and a GitHub Actions pipeline that builds, scans, installs the chart on a throwaway kind cluster and runs smoke tests.

## What it proves

- Docker: multi-stage builds, small and secure images (non-root UID, minimal base, pinned versions), layer caching, health checks, SBOMs and image scanning
- Kubernetes workloads: Deployments, StatefulSets, Services, ConfigMaps, Secrets, probes, requests and limits
- Reliability: rolling updates with zero failed requests, graceful shutdown with `preStop`, PodDisruptionBudgets, autoscaling
- Security: `securityContext` (read-only root filesystem, dropped capabilities), default-deny NetworkPolicies
- Packaging and delivery: Helm charts, environment values, CI with kind
- Polyglot services (Python and Node.js) behind one Gateway
- Keywords: Docker, Kubernetes, Helm, Gateway API, HPA, CI/CD, GitHub Actions, AKS, GKE, DevOps, microservices

## Architecture

```text
                       Gateway API (Envoy Gateway or Traefik) — HTTPRoutes
                 /api/*  │                                  │  /{code}
                         ▼                                  ▼
               ┌──────────────────┐               ┌───────────────────────┐
               │ api (FastAPI)    │               │ redirect (Node/TS)    │  HPA: 2–10 pods on CPU
               │ 2 pods, PDB      │               │ ≥2 pods, PDB          │
               └──────┬───────────┘               └───┬───────────┬───────┘
                      │ SQL                  cache GET│           │ XADD clicks
                      ▼                               ▼           ▼
               ┌──────────────┐              ┌──────────────────────────┐
               │ PostgreSQL   │◄─── upsert ──│ worker (consumer group)  │◄── Redis 8 (cache + stream)
               │ StatefulSet  │   hourly     └──────────────────────────┘
               └──────────────┘   counts
   NetworkPolicies: default deny; only api/redirect/worker may reach PostgreSQL and Redis
```

## Milestones

### Milestone 1: the app with docker compose

Write the three services and a `docker compose` file with PostgreSQL and Redis. Keep each service twelve-factor: configuration from environment variables, logs to stdout, a `/healthz` (liveness) and `/readyz` (dependencies reachable) endpoint.

**Done when:** creating a link, following it and seeing the click counted works end to end with one command.

### Milestone 2: production-grade images

Multi-stage Dockerfiles: build dependencies in one stage, copy only what runs into a slim or distroless final stage. Run as a numeric non-root user (`USER 10001`, which Kubernetes can verify against `runAsNonRoot`), add `HEALTHCHECK`s, pin base image versions, use a `.dockerignore`, and order layers so dependency installs cache. Generate an SBOM and scan with Trivy.

**Done when:** both Python images are under ~150 MB and the Node image under ~100 MB, the scan shows no critical vulnerabilities, and a rebuild after a code-only change reuses the dependency layers.

### Milestone 3: Kubernetes with Helm on kind

Create a kind cluster, install a Gateway API controller (Envoy Gateway or Traefik; the community Ingress NGINX controller was retired in March 2026), and write a Helm chart: Deployments with all three probe types, requests and limits, a StatefulSet for PostgreSQL with a PersistentVolumeClaim, Redis, ConfigMaps, Secrets and HTTPRoutes. Add `values-dev.yaml` and `values-prod.yaml`.

**Done when:** `helm install shortly ./chart -f values-dev.yaml` brings every pod to Ready and the app works through the Gateway; `helm lint` and `kubeconform` pass.

### Milestone 4: zero-downtime and scaling

Handle `SIGTERM` in every service (stop accepting, finish in-flight requests, close pools), add a short `preStop` sleep so endpoints are removed before shutdown, set `maxUnavailable: 0` on rolling updates, add PodDisruptionBudgets and an HPA for the redirector.

**Done when:** a load loop (k6 or a shell loop) running during `helm upgrade` records zero failed requests, and the HPA scales the redirector up under load and back down after.

### Milestone 5: security hardening

Set `securityContext` on every container (`runAsNonRoot`, `readOnlyRootFilesystem`, drop `ALL` capabilities, no privilege escalation), add a default-deny NetworkPolicy plus explicit allows, give each workload its own ServiceAccount without an auto-mounted token unless needed.

**Done when:** a debug pod in another namespace cannot reach PostgreSQL, while the app keeps working.

### Milestone 6: CI with kind and the write-up

A GitHub Actions workflow: lint (hadolint, `helm lint`, kubeconform), build images with cache, scan, create a kind cluster in the runner, load the images, `helm install`, wait for rollout, run smoke tests.

**Done when:** every pull request shows a green pipeline that proves the chart installs and the app works, and the README explains each production decision.

## Repository layout

```text
shortly/
├── services/
│   ├── api/          # FastAPI, Dockerfile
│   ├── redirect/     # Node.js + TypeScript, Dockerfile
│   └── worker/       # Python consumer, Dockerfile
├── chart/shortly/
│   ├── Chart.yaml
│   ├── values.yaml  values-dev.yaml  values-prod.yaml
│   └── templates/    # deployments, statefulset, services, httproutes, hpa, pdb, networkpolicies, configmap, secret
├── deploy/kind-config.yaml
├── loadtest/rollout.js
├── docker-compose.yml
├── .github/workflows/ci.yml
└── README.md
```

## Tests and CI

- **Service tests:** unit tests per service (pytest, node:test), plus an end-to-end test against the compose stack.
- **Image checks:** hadolint, Trivy (fail on critical), image size reported in the job summary.
- **Chart checks:** `helm lint`, `helm template | kubeconform`, then a real install on kind in the runner and a smoke test through the Gateway.
- **GitHub Actions outline:** `lint` → `build-and-scan` (matrix over the three services) → `kind-e2e` (create cluster, install controller and chart, run smoke tests, upload logs on failure).

## README checklist

- Pipeline badge
- Architecture diagram and a table of production decisions (what, why, how verified)
- A GIF: `helm upgrade` running while the load test shows zero errors
- Image sizes before and after the multi-stage rewrite
- How to run locally (compose and kind) and how to deploy to a real cluster
- What you would do next (GitOps with Argo CD, KEDA scaling the worker on stream length, managed PostgreSQL)

**Local development on this Mac:** Docker Hub pulls currently fail here ("authentication required"), and kind's node image and most base images come from Docker Hub. Fix it first with `docker logout` and a fresh `docker login` (stale credentials cause that error), or configure a registry mirror such as `mirror.gcr.io` in Docker Desktop's daemon settings. Until then, develop the services against the local PostgreSQL and a Homebrew Redis (`brew install redis`).

## Stretch goals

- Deploy the same chart to **AKS** (you have AKS experience) or **GKE Autopilot**, with a managed database
- **GitOps** with Argo CD: the cluster syncs from the repo
- **KEDA** to scale the worker on Redis Stream lag
- Sealed Secrets or the External Secrets Operator instead of plain Secrets

## Talking about it in an interview

**60-second walkthrough:** "Shortly is a three-service link shortener: a FastAPI API, a Node.js redirector on the hot path and a Python worker that aggregates clicks from a Redis Stream. The interesting part is shipping it: multi-stage, non-root images that are scanned in CI; a Helm chart with startup, readiness and liveness probes, resource limits, an HPA on the redirector, PodDisruptionBudgets and default-deny network policies. I proved zero-downtime deploys by running a load test during `helm upgrade` with no failed requests, thanks to graceful SIGTERM handling, a preStop delay and maxUnavailable zero. Every pull request installs the chart on a kind cluster in GitHub Actions and smoke-tests it."

**Likely follow-ups:**

- *Readiness vs liveness?* Readiness decides whether a pod receives traffic, so it checks dependencies; liveness decides whether to restart it, so it only checks the process is not stuck. Checking the database in liveness would restart every pod during a database blip.
- *Why the `preStop` sleep?* Endpoint removal and SIGTERM happen in parallel, so without a short delay the pod can stop before the load balancer stops sending it traffic, which shows up as failed requests during a rollout.
- *How would you run PostgreSQL in production?* Not in a hand-written StatefulSet: a managed service (Azure Database for PostgreSQL, Cloud SQL) or an operator such as CloudNativePG, for backups, failover and upgrades.

## LinkedIn post template

> I built Shortly to practise shipping services to Kubernetes properly: three services (FastAPI, Node.js, Python worker), small non-root scanned images, and a Helm chart with probes, autoscaling, disruption budgets and network policies.
> Proof it works: a load test during `helm upgrade` recorded zero failed requests, and every PR installs the chart on a kind cluster in CI.
> Code and the production checklist I followed: <repo link> #Kubernetes #Docker #Helm #DevOps

## Resume bullet

Containerised and deployed Shortly, a three-service open-source app, to Kubernetes with Helm (probes, HPA, PDBs, NetworkPolicies, Gateway API), achieving zero failed requests during rolling upgrades and CI-verified installs on kind via GitHub Actions. *(Use only after it is built and public.)*
