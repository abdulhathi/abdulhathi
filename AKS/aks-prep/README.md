# AKS Worker Academy

A personal learning app: build **one .NET 9 Worker Service** and take it all the way to production infrastructure — Docker → Azure Container Registry → Azure Kubernetes Service → Azure DevOps CI/CD pipeline. The app stays tiny on purpose; the learning is in the deployment machinery.

Companion to [API Architecture Academy](../../../DotNet/api-architecture-academy/).

## Run the learning app

```bash
npm install
npm run dev
# open http://localhost:5177
```

## Curriculum

| # | Module | Level |
|---|--------|-------|
| 0 | Getting Started: Tools + Azure Setup | Setup |
| 1 | Build the Worker Service | Beginner |
| 2 | Containerize with Docker | Beginner |
| 3 | Create the Azure Resources (ACR + AKS) | Intermediate |
| 4 | Kubernetes Manifests for a Worker | Intermediate |
| 5 | Deploy Manually with kubectl | Intermediate |
| 6 | CI/CD with Azure DevOps | Advanced |
| 7 | Beyond the Basics: Queues, KEDA, Probes | Advanced |

The practice project goes in `~/Developer/Azure/aks-worker-practice/` (the app walks you through creating it).

Progress checkboxes and saved notes are stored in your browser's localStorage.

## Ask-Claude popup

Select any text in a lesson to ask a question about it. Requires `ANTHROPIC_API_KEY` in your shell env or a `.env.local` file in this folder; answers are fetched server-side by the Vite dev server so the key never reaches the browser.

## Cost warning

Modules 3–7 create real Azure resources (~$1–2/day for the cluster). Module 7 ends with the cleanup commands — run them when you finish.
