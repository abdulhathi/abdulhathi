# Deploy Manually with kubectl

Before automating anything, deploy by hand **once**. Every step you type here is a step the Module 6 pipeline automates — after this module, the pipeline YAML will read as a transcript of things you've already done, not magic.

## Step 1 — Build the image in the cloud

```bash
cd ~/Developer/Azure/aks-worker-practice

az acr build -r $ACR -t order-processor:manual-1 .
```

`az acr build` uploads your build context and runs the Docker build **inside Azure** on AMD64 machines — which neatly sidesteps the Apple Silicon ARM64 problem from Module 2, and doubles as a preview of what the pipeline agent will do.

Verify the image landed:

```bash
az acr repository show-tags -n $ACR --repository order-processor -o table
```

## Step 2 — Apply namespace and config

```bash
kubectl apply -f k8s/namespace.yaml -f k8s/configmap.yaml
```

## Step 3 — Deploy and set the real image

```bash
kubectl apply -f k8s/deployment.yaml
kubectl -n order-processing set image deployment/order-processor \
  order-processor=$ACR.azurecr.io/order-processor:manual-1
```

The first `apply` creates the Deployment with the placeholder image (those pods will show `ErrImagePull` for a moment); `set image` immediately points it at the real one. The pipeline does both in a single step.

## Step 4 — Watch it come up

```bash
kubectl -n order-processing get pods
```

Success looks like:

```text
NAME                               READY   STATUS    RESTARTS   AGE
order-processor-7d9f8b6c5-8kx2p    1/1     Running   0          40s
order-processor-7d9f8b6c5-tj4wq    1/1     Running   0          40s
```

Stream logs from **both** replicas at once:

```bash
kubectl -n order-processing logs -l app=order-processor -f --prefix
```

Each pod logs its own pod name as `MachineName` (that's `Environment.MachineName` inside a container) and processes its own batches independently.

> **Troubleshooting table**
>
> | Symptom | Likely cause | Fix |
> |---------|-------------|-----|
> | `ImagePullBackOff` | ACR not attached | `az aks update -n $AKS -g $RG --attach-acr $ACR` |
> | `exec format error` / `CrashLoopBackOff` | ARM64 image pushed from a Mac | Rebuild with `az acr build` |
> | `CreateContainerConfigError` | ConfigMap name typo | `kubectl -n order-processing describe pod <pod>` shows the missing ref |
> | Pod `Pending` forever | Node out of allocatable CPU/memory | Lower `resources.requests`, or check `kubectl describe node` |

## Experiments — where the learning actually happens

**1. Config change without a rebuild.** Edit `k8s/configmap.yaml` (say `Worker__BatchSize: "10"`), then:

```bash
kubectl apply -f k8s/configmap.yaml
kubectl -n order-processing rollout restart deployment/order-processor
```

Env vars are injected at container start, so a restart is required — `rollout restart` does it as a rolling update, not an outage.

**2. Watch graceful shutdown in production.** In one terminal:

```bash
kubectl -n order-processing get pods -w
```

In another, trigger any rolling restart and watch a terminating pod's logs:

```bash
kubectl -n order-processing rollout restart deployment/order-processor
kubectl -n order-processing logs -f <terminating-pod-name>
```

You'll see the exact Ctrl+C sequence from Module 1: `Application is shutting down...` → current order finishes → `returned to queue` → `Draining complete`. **This is the payoff of the whole course so far.**

**3. Scale out.**

```bash
kubectl -n order-processing scale deployment/order-processor --replicas=4
kubectl -n order-processing get pods
```

Four workers on one node, all within their resource requests. Scale back to 2 and watch two pods drain gracefully.

**4. Roll back.**

```bash
kubectl -n order-processing rollout history deployment/order-processor
kubectl -n order-processing rollout undo deployment/order-processor
kubectl -n order-processing rollout status deployment/order-processor
```

`undo` is itself a rolling update to the previous pod template — same graceful mechanics.

## Checkpoint

- [ ] Two pods `Running`, each logging its own pod name
- [ ] Changed ConfigMap value visible in logs after `rollout restart`
- [ ] Watched a pod drain gracefully during a rolling restart
- [ ] Scaled to 4 and back to 2; performed a rollback
