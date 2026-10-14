# CI/CD with Azure DevOps

Everything you typed in Module 5, automated: push to `main` → image built and pushed to ACR → rolled out to AKS. Two stages, one YAML file.

## Step 1 — Push the code to a repo

In your `aks-learning` DevOps project, create a repo (or use the default one) and push:

```bash
cd ~/Developer/Azure/aks-worker-practice
git remote add origin https://dev.azure.com/<your-org>/aks-learning/_git/aks-worker-practice
git push -u origin main
```

(GitHub works too — Azure Pipelines connects to either.)

## Step 2 — Create two service connections

Service connections are how the pipeline authenticates to Azure resources. In **Project Settings → Service connections → New service connection**:

| Type | Points at | Name it exactly |
|------|-----------|-----------------|
| **Docker Registry** → Azure Container Registry | your ACR | `acr-connection` |
| **Kubernetes** → Azure Subscription | your AKS cluster, namespace `order-processing` | `aks-connection` |

The names matter: the pipeline YAML references them as strings.

## Step 3 — The pipeline

Create `azure-pipelines.yml` at the repo root:

```yaml
trigger:
  branches:
    include:
      - main

variables:
  acrName: "<your-acr-name>"                      # e.g. abdulaksacr123
  imageRepository: "order-processor"
  dockerRegistryServiceConnection: "acr-connection"
  kubernetesServiceConnection: "aks-connection"
  tag: "$(Build.BuildId)"
  vmImageName: "ubuntu-latest"

stages:
  - stage: Build
    displayName: Build and push image
    jobs:
      - job: Build
        pool:
          vmImage: $(vmImageName)
        steps:
          - task: Docker@2
            displayName: Build and push to ACR
            inputs:
              command: buildAndPush
              repository: $(imageRepository)
              dockerfile: "$(Build.SourcesDirectory)/Dockerfile"
              containerRegistry: $(dockerRegistryServiceConnection)
              tags: |
                $(tag)
                latest

          - publish: "$(Build.SourcesDirectory)/k8s"
            artifact: manifests
            displayName: Publish k8s manifests

  - stage: Deploy
    displayName: Deploy to AKS
    dependsOn: Build
    condition: succeeded()
    jobs:
      - deployment: Deploy
        pool:
          vmImage: $(vmImageName)
        environment: "aks-order-processing"
        strategy:
          runOnce:
            deploy:
              steps:
                - download: current
                  artifact: manifests

                - task: KubernetesManifest@1
                  displayName: Apply namespace and config
                  inputs:
                    action: deploy
                    kubernetesServiceConnection: $(kubernetesServiceConnection)
                    namespace: order-processing
                    manifests: |
                      $(Pipeline.Workspace)/manifests/namespace.yaml
                      $(Pipeline.Workspace)/manifests/configmap.yaml

                - task: KubernetesManifest@1
                  displayName: Deploy worker
                  inputs:
                    action: deploy
                    kubernetesServiceConnection: $(kubernetesServiceConnection)
                    namespace: order-processing
                    manifests: |
                      $(Pipeline.Workspace)/manifests/deployment.yaml
                    containers: |
                      $(acrName).azurecr.io/$(imageRepository):$(tag)
```

Set `acrName`, commit, push.

## Reading the YAML — the parts that matter

**Two stages, one artifact.** `Build` produces two things: an image in ACR tagged with the build ID, and the `k8s/` folder published as a pipeline artifact named `manifests`. `Deploy` downloads that artifact — stages run on *different agents* with fresh filesystems, so nothing carries over implicitly.

**`tag: $(Build.BuildId)`** — every run gets a unique, monotonically increasing image tag. Never deploy `:latest`: with a unique tag, `kubectl rollout undo` and the deployment history actually mean something, and Kubernetes reliably detects that the pod template changed.

**`deployment` job + `environment`** — a `deployment` job (vs a plain `job`) registers each run against a DevOps **Environment** (`aks-order-processing`, auto-created on first run). That gives you per-environment deployment history and — later — approval gates before production.

**The `containers:` input is the magic.** The `KubernetesManifest@1` task scans `deployment.yaml`, finds the container whose image name matches `order-processor`, and **rewrites** it to `<acr>.azurecr.io/order-processor:<buildId>` before applying. This is why the manifest ships a placeholder image and why you needed `set image` manually in Module 5 — the task replaces that step.

**Mapping to Module 5:** `Docker@2 buildAndPush` = `az acr build`, first `KubernetesManifest` = `kubectl apply -f namespace,configmap`, second = `kubectl apply -f deployment.yaml` + `set image`, fused.

## Step 4 — Create and run the pipeline

**Pipelines → New pipeline → Azure Repos Git → your repo → Existing Azure Pipelines YAML file → `/azure-pipelines.yml` → Run.**

On the first run, DevOps asks you to **permit** access to each service connection and the new environment — click through the permission prompts on the run page.

Then verify from your terminal:

```bash
kubectl -n order-processing rollout status deployment/order-processor
kubectl -n order-processing get pods \
  -o jsonpath='{.items[*].spec.containers[*].image}'
```

The image tag should equal the build number in the DevOps UI.

## Step 5 — Close the loop

Change one log message in `Worker.cs`, commit, push to `main`. Watch:

1. The pipeline trigger fires and both stages run.
2. `kubectl -n order-processing get pods -w` shows the rolling update.
3. Old pods drain gracefully (Module 1's code, again).
4. New pods log your changed message.

That end-to-end flow — *edit code, push, watch it roll out with zero abandoned work* — is the entire point of the course.

> **First-run gotchas**
>
> | Error | Cause | Fix |
> |-------|-------|-----|
> | "No hosted parallelism has been purchased or granted" | New org, no free agents yet | The form from Module 0: [aka.ms/azpipelines-parallelism-request](https://aka.ms/azpipelines-parallelism-request) |
> | "The pipeline is not valid… service connection could not be found" | Connection name mismatch | Names in YAML must match Project Settings exactly |
> | Deploy stage: forbidden / cannot get resource | K8s connection scoped to wrong namespace | Recreate `aks-connection` with namespace `order-processing` |
> | `ImagePullBackOff` after pipeline deploy | ACR still not attached to cluster | `az aks update -n $AKS -g $RG --attach-acr $ACR` |

## Checkpoint

- [ ] Pipeline green end to end
- [ ] Deployed image tag == build ID
- [ ] A one-line code change reached the cluster with no manual steps
- [ ] You can explain what the `containers:` input rewrites and why
