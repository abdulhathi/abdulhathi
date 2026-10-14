# Beyond the Basics: Queues, KEDA, Probes

The simulated queue did its job — you learned the machinery without extra moving parts. This module sketches the four upgrades that turn the learning app into a production-shaped worker, in the order you should tackle them. Each is a mini-project of its own.

## 1. Replace the fake queue with Azure Service Bus

The whole design was built for this swap: only `ProcessBatchAsync`'s "receive" changes, the graceful-shutdown policy stays identical.

```bash
az servicebus namespace create -n sb-aks-learning-<unique> -g $RG --sku Basic
az servicebus queue create -n orders --namespace-name sb-aks-learning-<unique> -g $RG
dotnet add package Azure.Messaging.ServiceBus
```

The worker shape changes from *polling loop* to *processor callbacks*:

```csharp
public class Worker : BackgroundService
{
    private readonly ServiceBusProcessor _processor;

    public Worker(ServiceBusClient client)
    {
        _processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
        {
            MaxConcurrentCalls = 5,
            AutoCompleteMessages = false,
        });
        _processor.ProcessMessageAsync += OnMessageAsync;
        _processor.ProcessErrorAsync += OnErrorAsync;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await _processor.StartProcessingAsync(stoppingToken);
        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { }
        // Graceful drain: stop receiving, let in-flight handlers finish.
        await _processor.StopProcessingAsync(CancellationToken.None);
    }

    private async Task OnMessageAsync(ProcessMessageEventArgs args)
    {
        // ... process ...
        await args.CompleteMessageAsync(args.Message);   // only after success
    }
}
```

`CompleteMessageAsync` after success + `AutoCompleteMessages = false` gives you *at-least-once* delivery for real — the "returned to the queue" log line from Module 1 becomes actual behavior: uncompleted messages reappear after the lock expires.

Put the connection string in a Kubernetes `Secret` (not the ConfigMap), injected the same `envFrom` way — or better, use workload identity (see upgrade 4).

## 2. Autoscale on queue length with KEDA

The canonical AKS worker pattern. The Horizontal Pod Autoscaler scales on CPU — useless for queue workers, which are often idle-CPU but queue-deep. **KEDA** scales on the queue itself and is a built-in AKS add-on:

```bash
az aks update -n $AKS -g $RG --enable-keda
```

Then replace "how many replicas?" with a rule:

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-processor-scaler
  namespace: order-processing
spec:
  scaleTargetRef:
    name: order-processor        # the Deployment
  minReplicaCount: 0             # scale to zero when the queue is empty!
  maxReplicaCount: 10
  triggers:
    - type: azure-servicebus
      metadata:
        queueName: orders
        messageCount: "20"       # target ~20 messages per replica
      authenticationRef:
        name: order-processor-trigger-auth
```

Flood the queue with a few hundred messages and watch `kubectl get pods -w`: pods appear as the backlog grows, drain gracefully (that machinery again) as it empties, and disappear entirely at zero. Delete the `replicas:` field from your Deployment once KEDA owns scaling — and note that graceful shutdown now runs *constantly*, every time KEDA scales in.

## 3. Liveness probes via health checks

If the worker's internal loop deadlocks, the process stays alive and Kubernetes can't tell. Add the health-check package with a tiny HTTP listener (this is the one place a worker grows an HTTP port):

```csharp
builder.Services.AddHealthChecks()
    .AddCheck("worker-heartbeat", () =>
        DateTimeOffset.UtcNow - LastCycleAt < TimeSpan.FromMinutes(2)
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy("worker loop stalled"));
```

Have the worker record `LastCycleAt` each poll cycle, expose `/healthz` on port 8080, then wire the probe:

```yaml
livenessProbe:
  httpGet:
    path: /healthz
    port: 8080
  periodSeconds: 30
  failureThreshold: 3
```

A stalled loop → probe fails 3× → Kubernetes restarts the container automatically.

## 4. Secrets done properly

Config in ConfigMaps was fine because nothing was secret. Connection strings change that. In order of increasing correctness:

1. **Kubernetes `Secret`** — base64, not encrypted at rest by default; fine for learning.
2. **Azure Key Vault + CSI driver** (`az aks enable-addons -a azure-keyvault-secrets-provider`) — secrets live in Key Vault, mounted into the pod.
3. **Workload identity** — no connection string at all: the pod's service account federates to an Entra ID identity, and `ServiceBusClient` uses `DefaultAzureCredential`. This is where real AKS deployments are headed; if you do only one item from this list, do this one.

## 5. Pipeline maturity

- Split `Deploy` into `DeployDev` → `DeployProd` stages targeting two namespaces (or clusters), with an **approval gate** on the prod Environment (Environments → aks-order-processing → Approvals and checks).
- Add a test job before the image build (`dotnet test`).
- Replace raw manifests with **Helm** or **Kustomize** overlays once you have per-environment differences — that's the natural next course.

---

## Clean up your Azure spend

When you're done (or pausing for more than a few days):

```bash
# Deletes cluster, ACR, Service Bus — everything in the group, including
# the hidden MC_* node resource group
az group delete -n rg-aks-learning --yes --no-wait
```

Also:

- Delete the `aks-connection` / `acr-connection` service connections in DevOps (they point at dead resources).
- Disable the pipeline trigger if you keep pushing to the repo.

Recreating everything from scratch takes ~15 minutes with your Module 3 commands — which is itself the final lesson: **infrastructure you can rebuild from a script is infrastructure you can afford to delete.**

## Where you are now

You've taken one application through the full lifecycle: local process → container → registry → cluster → automated pipeline → (sketched) real queue with autoscaling. The same path applies to any .NET workload you'll deploy to AKS — only the app in the middle changes.
