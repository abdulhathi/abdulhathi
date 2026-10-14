# Kubernetes Manifests for a Worker

Three YAML files in a `k8s/` folder at your repo root. Notice what's **absent**: a worker receives no traffic, so there is no `Service`, no `Ingress`, no port anywhere. Most tutorials never show you this shape because they all deploy web apps.

## k8s/namespace.yaml

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: order-processing
```

Namespaces group related resources and give you a blast radius: `kubectl delete namespace order-processing` removes everything the app owns.

## k8s/configmap.yaml

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: order-processor-config
  namespace: order-processing
data:
  # .NET maps "Worker__BatchSize" to configuration key "Worker:BatchSize",
  # overriding appsettings.json. Change a value here, re-apply, restart the
  # deployment — no image rebuild needed.
  Worker__PollIntervalSeconds: "5"
  Worker__BatchSize: "3"
  Worker__ProcessingTimeMs: "750"
  DOTNET_ENVIRONMENT: "Production"
```

This is the payoff for Module 1's options pattern: the ConfigMap holds plain env vars, .NET's `__` convention maps them onto `Worker:*` config keys, and they override `appsettings.json`. Ops can retune the worker without touching the image.

> **ConfigMap values are always strings** — hence `"5"` in quotes. .NET parses them into the typed `WorkerOptions` properties on startup.

## k8s/deployment.yaml

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-processor
  namespace: order-processing
  labels:
    app: order-processor
spec:
  replicas: 2
  selector:
    matchLabels:
      app: order-processor
  template:
    metadata:
      labels:
        app: order-processor
    spec:
      # Give the worker time to finish in-flight orders after SIGTERM.
      # Must be longer than the .NET host shutdown timeout (default 30s is fine).
      terminationGracePeriodSeconds: 30
      containers:
        - name: order-processor
          # The pipeline replaces this with <acr>.azurecr.io/order-processor:<build-id>.
          # For a manual first deploy, set it yourself before applying.
          image: order-processor
          envFrom:
            - configMapRef:
                name: order-processor-config
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 250m
              memory: 256Mi
          securityContext:
            allowPrivilegeEscalation: false
            runAsNonRoot: true
```

## The deployment, line by line

**`replicas: 2`** — two identical pods on your one node. Each runs its own independent worker; in Module 5 you'll watch them process separate batches. For a queue-driven worker, replicas = consumers.

**`selector` / `labels`** — the Deployment finds "its" pods by label match. The two `app: order-processor` blocks must agree, or the apply is rejected.

**`terminationGracePeriodSeconds: 30`** — the heart of graceful shutdown. When Kubernetes terminates a pod it: (1) sends SIGTERM, (2) waits up to this many seconds, (3) sends SIGKILL. Your worker drains within seconds, so 30 is generous — but if you ever set `ProcessingTimeMs` high, remember this ceiling. The .NET host's own shutdown timeout (`HostOptions.ShutdownTimeout`, default 30s) should be ≤ this value.

**`envFrom.configMapRef`** — injects *every* key of the ConfigMap as an env var. The alternative, `env` + `valueFrom`, cherry-picks individual keys.

**`resources.requests`** — what the scheduler *reserves* for the pod (used for bin-packing decisions). **`limits`** — the hard cap: exceed the CPU limit and you get throttled; exceed the memory limit and you get OOM-killed. Workers should always declare both, because they share nodes with other workloads.

**`securityContext`** — enforces at the cluster level what the Dockerfile's `USER app` promised: if someone later ships an image running as root, the pod is refused, not silently run.

**`image: order-processor`** — deliberately a placeholder. In Module 5 you'll point it at the real ACR image by hand; in Module 6 the pipeline's `KubernetesManifest` task rewrites it to `<acr>.azurecr.io/order-processor:<buildId>` on every deploy.

## How a rolling update will behave

With defaults (`maxUnavailable: 25%`, `maxSurge: 25%`), a new image rolls out one pod at a time: new pod starts → becomes ready → old pod gets SIGTERM → drains (your Module 1 code!) → next pod. Zero abandoned orders, zero downtime — this is the whole reason graceful shutdown mattered.

## Checkpoint

- [ ] `k8s/` folder with the three files, committed
- [ ] You can explain why there's no Service or Ingress
- [ ] You can trace `Worker__BatchSize: "3"` → `WorkerOptions.BatchSize == 3`
- [ ] You know what happens 30 seconds after SIGTERM
