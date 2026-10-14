# Containerize with Docker

AKS runs containers, so the worker needs an image. You'll use a **multi-stage build**: the big SDK image compiles, the small runtime image ships.

## Step 1 — The Dockerfile

Create `Dockerfile` at the **repo root** (one level above `src/`):

```dockerfile
# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

# Restore first so dependency layers are cached between builds
COPY src/OrderProcessor.Worker/OrderProcessor.Worker.csproj OrderProcessor.Worker/
RUN dotnet restore OrderProcessor.Worker/OrderProcessor.Worker.csproj

COPY src/OrderProcessor.Worker/ OrderProcessor.Worker/
RUN dotnet publish OrderProcessor.Worker/OrderProcessor.Worker.csproj \
    -c Release -o /app/publish /p:UseAppHost=false

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/runtime:9.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

# Run as the non-root user built into the .NET images (AKS best practice)
USER app

ENTRYPOINT ["dotnet", "OrderProcessor.Worker.dll"]
```

Three deliberate choices to understand:

| Choice | Why |
|--------|-----|
| Copy `.csproj` + restore **before** copying source | Docker caches layers. Dependencies change rarely, source changes constantly — this ordering means most rebuilds skip the slow restore. |
| `runtime:9.0`, not `aspnet:9.0` or `sdk:9.0` | A worker has no HTTP stack, so the plain runtime image is enough (~80 MB smaller than aspnet, ~700 MB smaller than sdk). |
| `USER app` | .NET images ship a non-root user named `app`. Running as non-root is an AKS security baseline — and Module 4's manifest will *enforce* it with `runAsNonRoot: true`. |

## Step 2 — .dockerignore

Create `.dockerignore` next to the Dockerfile:

```text
**/bin/
**/obj/
**/.vs/
**/*.user
k8s/
README.md
azure-pipelines.yml
```

Without this, your local `bin/`/`obj/` folders leak into the build context — slower builds and occasional cross-platform artifacts.

## Step 3 — Build and run

```bash
docker build -t order-processor .
docker run --rm order-processor
```

Ctrl+C stops it. Note that `docker stop` sends SIGTERM — the same graceful shutdown path you tested in Module 1 works in the container:

```bash
# Terminal 1
docker run --name op order-processor

# Terminal 2
docker stop op        # watch terminal 1 drain and exit cleanly
docker rm op
```

## Step 4 — Env var overrides, container edition

```bash
docker run --rm -e Worker__PollIntervalSeconds=3 -e Worker__BatchSize=2 order-processor
```

Same `__` convention as Module 1 — and **exactly** what a Kubernetes ConfigMap does: it injects environment variables into the container. When you get to Module 4, nothing about the app changes.

## Check the image size

```bash
docker images order-processor
```

Expect roughly ~230 MB. Swap `runtime:9.0` for `runtime-deps:9.0` + self-contained publish, or Alpine/chiseled variants, if you want to chase smaller images later — not needed for this course.

> **Apple Silicon warning.** On an M-series Mac, `docker build` produces an **ARM64** image, but AKS nodes are **AMD64**. A locally built image pushed from your Mac will crash-loop on the cluster with `exec format error`. That's why Module 5 builds the deployed image *in Azure* with `az acr build`, and Module 6 builds it on an AMD64 Ubuntu pipeline agent. Keep local builds for local testing only.

## Checkpoint

- [ ] `docker build` succeeds
- [ ] `docker stop` triggers the graceful drain in the container logs
- [ ] `-e Worker__BatchSize=2` visibly changes behavior
- [ ] Commit the Dockerfile and .dockerignore
