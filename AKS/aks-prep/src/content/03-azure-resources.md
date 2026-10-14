# Create the Azure Resources (ACR + AKS)

Three resources: a **resource group** (the container for everything, and the thing you delete at the end), an **Azure Container Registry** (where images live), and the **AKS cluster** itself.

## Step 1 — Set your variables

Run these in your shell — the rest of the course reuses them:

```bash
az login

RG=rg-aks-learning
LOCATION=eastus
ACR=<globally-unique-acr-name>     # lowercase letters/numbers only, e.g. abdulaksacr123
AKS=aks-learning
```

> ACR names are **globally unique across all of Azure** (they become `<name>.azurecr.io`), lowercase alphanumeric only. Pick something personal and add digits if taken.

## Step 2 — Resource group + registry

```bash
az group create -n $RG -l $LOCATION
az acr create -n $ACR -g $RG --sku Basic
```

Basic tier is enough: 10 GB storage, unlimited pulls from your cluster.

## Step 3 — The cluster

```bash
az aks create -n $AKS -g $RG \
  --node-count 1 \
  --node-vm-size Standard_B2s \
  --attach-acr $ACR \
  --generate-ssh-keys
```

This takes ~5 minutes. The choices:

| Flag | Why |
|------|-----|
| `--node-count 1` | One node is plenty for a learning workload; you can still run multiple replicas on it. |
| `--node-vm-size Standard_B2s` | Cheapest practical size (2 vCPU / 4 GB burstable). Roughly $1–2/day. |
| `--attach-acr $ACR` | **The flag most tutorials skip.** Grants the cluster's managed identity `AcrPull` on your registry, so pods can pull images without you creating image-pull secrets. Without it, your first deployment fails with `ImagePullBackOff`. |

> Already created the cluster and forgot the flag? Fix it any time:
> ```bash
> az aks update -n $AKS -g $RG --attach-acr $ACR
> ```

## Step 4 — Connect kubectl

```bash
az aks get-credentials -n $AKS -g $RG
kubectl get nodes
```

Expected:

```text
NAME                                STATUS   ROLES    AGE   VERSION
aks-nodepool1-12345678-vmss000000   Ready    <none>   2m    v1.32.x
```

`get-credentials` merged a new **context** into `~/.kube/config`. If you work with multiple clusters, these commands keep you oriented:

```bash
kubectl config get-contexts     # list all known clusters
kubectl config current-context  # which one kubectl talks to now
kubectl config use-context aks-learning
```

## What actually got created

Peek at the hidden second resource group:

```bash
az group list -o table | grep -i aks
```

You'll see `MC_rg-aks-learning_aks-learning_eastus` — the **node resource group** where AKS puts the VM scale set, disks, and networking it manages for you. You never touch it directly; deleting your main resource group cleans it up automatically.

> **Cost reminder.** The meter is now running (~$1–2/day). If you're pausing the course for a few days:
> ```bash
> az aks stop -n $AKS -g $RG    # deallocates the node VMs
> az aks start -n $AKS -g $RG   # resume later (~3 min)
> ```

## Checkpoint

- [ ] `az acr list -g $RG -o table` shows your registry
- [ ] `kubectl get nodes` shows one `Ready` node
- [ ] You know what `--attach-acr` prevented (`ImagePullBackOff`)
- [ ] You know the cleanup command exists (Module 7 runs it)
