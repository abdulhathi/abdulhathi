# Getting Started: Tools + Azure Setup

You will build **one small background worker** and take it all the way to production infrastructure: local code → Docker container → Azure Kubernetes Service → automated Azure DevOps pipeline. The app stays deliberately tiny so every hour goes into learning the *deployment machinery*, not the app.

## The app: an Order Processor

A .NET 9 **Worker Service** that simulates picking up batches of orders from a queue and processing them. No HTTP endpoints, no database — which makes it the perfect first AKS workload. Despite its size it exercises every concept that matters for real background services:

| Concept | Where you'll meet it |
|---------|---------------------|
| `BackgroundService` pattern | Module 1 |
| Graceful shutdown on SIGTERM | Modules 1, 4, 5 |
| Config layering: appsettings → env vars → ConfigMap | Modules 1, 2, 4 |
| Multi-stage Docker builds, non-root containers | Module 2 |
| ACR, AKS, `--attach-acr` | Module 3 |
| Deployments, ConfigMaps, resource limits | Module 4 |
| kubectl workflows: logs, scale, rollout, undo | Module 5 |
| CI/CD: build → push → deploy on every commit | Module 6 |
| Real queues + autoscaling (KEDA) | Module 7 |

## The target architecture

```
 ┌──────────────┐    push     ┌───────────────────┐
 │  Git repo    │ ──────────► │  Azure DevOps      │
 │  (main)      │             │  Pipeline          │
 └──────────────┘             │  1. docker build   │
                              │  2. push image     │
                              │  3. kubectl deploy │
                              └───────┬───────────┘
                                      │
                    ┌─────────────────┼──────────────────┐
                    ▼                                     ▼
          ┌──────────────────┐              ┌──────────────────────────┐
          │ Azure Container  │   image pull │  AKS cluster             │
          │ Registry (ACR)   │ ◄────────────│  namespace:              │
          │ order-processor  │              │   order-processing       │
          │  :buildId        │              │  ┌────────┐ ┌────────┐   │
          └──────────────────┘              │  │ pod 1  │ │ pod 2  │   │
                                            │  └────────┘ └────────┘   │
                                            │  ConfigMap → env vars    │
                                            └──────────────────────────┘
```

## Step 1 — Verify your toolchain

| Tool | Check with | Install |
|------|-----------|---------|
| .NET SDK 9 | `dotnet --list-sdks` | [dotnet.microsoft.com](https://dotnet.microsoft.com/download) |
| Docker | `docker --version` | Docker Desktop |
| Azure CLI | `az --version` | `brew install azure-cli` |
| kubectl | `kubectl version --client` | `az aks install-cli` |

All four should print a version without errors before you continue.

## Step 2 — Azure subscription + login

```bash
az login
az account show --query "{name:name, id:id}" -o table
```

If you have multiple subscriptions, pick the one you want to spend from:

```bash
az account list -o table
az account set --subscription "<subscription-name-or-id>"
```

> **Cost expectations.** The cluster you'll create in Module 3 (one `Standard_B2s` node) costs roughly **$1–2/day**, plus a small Basic-tier ACR fee. That's fine for a week of learning — but Module 7 ends with the cleanup commands. Don't skip them.

## Step 3 — Azure DevOps organization

Module 6 needs an Azure DevOps organization and project:

1. Go to [dev.azure.com](https://dev.azure.com) and sign in with the same account as your Azure subscription.
2. Create an organization (if you don't have one) and a project, e.g. `aks-learning`.

> **Do this today, not in Module 6:** new Azure DevOps organizations have **no build agents** until Microsoft grants free hosted parallelism. Submit the request now at [aka.ms/azpipelines-parallelism-request](https://aka.ms/azpipelines-parallelism-request) — it can take 1–2 business days, and you want it approved by the time you reach the pipeline module.

## Step 4 — Create the practice folder

The practice project lives outside this academy folder:

```bash
mkdir -p ~/Developer/Azure/aks-worker-practice
cd ~/Developer/Azure/aks-worker-practice
git init
```

Everything you build in Modules 1–6 goes in there — the academy walks you through creating each file.

## Checkpoint

- [ ] `dotnet`, `docker`, `az`, `kubectl` all print versions
- [ ] `az account show` shows the subscription you intend to use
- [ ] Azure DevOps org + project created, parallelism request submitted
- [ ] `~/Developer/Azure/aks-worker-practice` exists and is a git repo
