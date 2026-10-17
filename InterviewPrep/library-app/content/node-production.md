---
title: Node.js in production
goal: Run a Node.js service safely in production: validated configuration, health checks, graceful shutdown, timeouts, scaling, performance and memory diagnosis, security, container images, observability and the right Node version.
minutes: 55
---

Senior Node.js interviews always include "how would you run this in production?" The interviewer wants to hear that you own the operational side: **configuration** validated at startup, **liveness and readiness** done right, **graceful shutdown** when the platform sends `SIGTERM`, **deadlines** on every outbound call, how you **scale** across cores and instances, how you find a **performance problem** or a **memory leak**, how you keep the **supply chain** and the container secure, what you **log and measure**, and which **Node version** you run.

Every `ts` block runs on Node 25. The building blocks are in [Node.js runtime, event loop and async](#/node-core), [Buffers, streams and files](#/node-streams) and [HTTP APIs with Node.js](#/node-apis); container and Kubernetes details in [Docker and Kubernetes](#/docker-k8s).

## Configuration from the environment

Configuration that changes between environments (ports, URLs, credentials, feature switches) comes from **environment variables**, not code, and is **validated once at startup**: if a required variable is missing or malformed, the process should refuse to start with a clear message, not fail on the first request an hour later.

- In development, Node loads a `.env` file itself: `node --env-file=.env app.js` (fails if the file is missing), `--env-file-if-exists=.env`, or `process.loadEnvFile()` from code. A variable already set in the real environment wins over the file. Commit a `.env.example`; never commit `.env`.
- In production the platform injects variables, and secrets come from a secret manager (Secret Manager, Key Vault, AWS Secrets Manager), mounted as variables or files.
- Parse once into a typed, frozen config object and pass it around; do not read `process.env` all over the code.

```ts
import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const Config = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  DATABASE_URL: z.url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});
type Config = z.infer<typeof Config>;

function loadConfig(env: Record<string, string | undefined>): Readonly<Config> {
  const result = Config.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }
  return Object.freeze(result.data);
}

// util.parseEnv reads .env syntax; in a real app process.env holds these.
const fromFile = parseEnv('PORT=4000\nDATABASE_URL="postgres://app@localhost:5432/tasks"\n');
const config = loadConfig({ ...fromFile, NODE_ENV: 'production' });
assert.deepEqual(config, { NODE_ENV: 'production', PORT: 4000, DATABASE_URL: 'postgres://app@localhost:5432/tasks', LOG_LEVEL: 'info' });
assert.throws(() => loadConfig({ PORT: 'eighty' }), /PORT: .*number.*; DATABASE_URL/s);
assert.throws(() => {
  (config as { PORT: number }).PORT = 1;
}, TypeError);
console.log('config ok');
```

## Liveness and readiness

Platforms probe your service to decide two different things, so expose two endpoints:

| | Liveness (`/healthz`) | Readiness (`/readyz`) |
|---|---|---|
| Question | Is the process alive and responsive? | Should traffic be sent here right now? |
| Checks | Nothing but itself | Dependencies answer within a short timeout; not shutting down |
| When it fails, the platform | Restarts the instance | Stops routing requests to it, without restarting it |

Do **not** check the database in the liveness probe: a short database outage would fail every instance's liveness at once, the platform would restart them all, and a blip becomes a full outage with cold starts. Dependency checks belong in readiness. Cloud Run uses startup and liveness probes (readiness probes are newer there); Kubernetes uses all three.

## Graceful shutdown

Cloud Run and Kubernetes stop a container by sending **`SIGTERM`**, waiting, then sending `SIGKILL`. Cloud Run gives about **10 seconds**; Kubernetes uses `terminationGracePeriodSeconds` (30 s by default). In that window a good service:

1. Fails readiness so the load balancer stops sending traffic, and stops accepting new connections (`server.close()`). On GKE, endpoint removal happens in parallel with `SIGTERM`, so a few requests can still arrive just after it: a short `preStop` sleep (or a few seconds of serving before `close()`) avoids failing them.
2. Lets in-flight requests finish, closes idle keep-alive sockets (`server.closeIdleConnections()`), and tells long streams to wrap up (a final SSE event, WebSocket close code 1001 "going away").
3. Flushes logs and telemetry, closes database pools and queue consumers.
4. Exits, with a hard timeout so a stuck connection cannot keep it alive past the deadline.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const server = createServer((_req, res) => setTimeout(() => res.end('done'), 100));
await new Promise<void>((r) => server.listen(0, r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

let shuttingDown = false;
const cleanups: string[] = [];

function shutdown(graceMs: number): Promise<void> {
  shuttingDown = true; // a /readyz handler would now return 503
  const force = setTimeout(() => server.closeAllConnections(), graceMs);
  // Keep-alive sockets that finish their last request during the drain become idle later: sweep them.
  const sweep = setInterval(() => server.closeIdleConnections(), 25);
  return new Promise((resolve) => {
    server.close(() => {
      clearTimeout(force);
      clearInterval(sweep);
      cleanups.push('db pool closed', 'logs flushed');
      resolve();
    });
  });
}

const t0 = performance.now();
const stopped = new Promise<void>((resolve) => {
  process.once('SIGTERM', () => void shutdown(8_000).then(resolve));
});

const inFlight = fetch(url).then((r) => r.text()); // started before the signal
await new Promise((r) => setTimeout(r, 20));
process.kill(process.pid, 'SIGTERM'); // what the platform does

assert.equal(await inFlight, 'done'); // the in-flight request still completes
await stopped;
assert.ok(performance.now() - t0 < 2_000, 'drained well before the 8 s force timeout');
assert.ok(shuttingDown);
assert.deepEqual(cleanups, ['db pool closed', 'logs flushed']);
console.log('graceful shutdown ok');
```

**Signals in containers:** the process that starts first in a container is PID 1, and Linux does not apply default signal handling to PID 1, so a Node process with no `SIGTERM` handler ignores it and is killed only when the grace period ends. Start Node directly (`CMD ["node", "dist/server.js"]`, not `npm start`, which adds a process in between), handle `SIGTERM` explicitly as above, or run with an init process (`docker run --init`, or tini) that forwards signals.

## Deadlines and cancellation on outbound calls

Every call that leaves the process needs a deadline, or one slow dependency ties up connections until the whole service stalls. Use `AbortSignal.timeout(ms)` for the deadline, combine it with the request's own signal (aborted when the client disconnects) using `AbortSignal.any`, and pass the result down to `fetch`, database drivers and streams.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

// A dependency that takes 500 ms to answer.
const slow = createServer((_req, res) => setTimeout(() => res.end('late'), 500));
await new Promise<void>((r) => slow.listen(0, r));
const url = `http://127.0.0.1:${(slow.address() as AddressInfo).port}`;

// 1. A deadline.
await assert.rejects(fetch(url, { signal: AbortSignal.timeout(50) }), { name: 'TimeoutError' });

// 2. Whichever comes first: the caller cancels, or the deadline passes.
const caller = new AbortController();
setTimeout(() => caller.abort(new Error('client went away')), 20);
const signal = AbortSignal.any([caller.signal, AbortSignal.timeout(1_000)]);
await assert.rejects(fetch(url, { signal }), { message: 'client went away' });

slow.closeAllConnections();
slow.close();
console.log('deadlines ok');
```

Retries go with deadlines: retry only idempotent operations, with exponential backoff and jitter, and within an overall time budget (see [Async JavaScript problems](#/code-async) and [Microservices](#/microservices)).

## Connection pools and keep-alive

- **HTTP clients** reuse sockets: since Node 19 the global `http.Agent` keeps connections alive, and `fetch` (undici) pools connections per origin. Creating a new client per request wastes TLS handshakes.
- **Database pools** (`pg.Pool`, Prisma) hold a fixed number of connections per process. The classic bug is pool arithmetic: instances × pool size can exceed the database's `max_connections`. With Cloud Run, size the pool to the instance's concurrency, cap the maximum number of instances, and put a pooler (PgBouncer, Cloud SQL's managed pooling) in front when you need more clients than connections.
- **Server keep-alive**: set `server.keepAliveTimeout` longer than the load balancer's idle timeout, or the balancer reuses sockets Node has just closed and returns 502s.

## Scaling: instances, cluster and workers

With containers, run **one Node process per container** and let the platform add containers (Cloud Run autoscaling, a Kubernetes HorizontalPodAutoscaler) for more CPU. Node's `cluster` module and PM2's cluster mode solve the same problem on a single VM; doing both at once just makes failures harder to understand. CPU-heavy work goes to **worker threads** or a separate worker service behind a queue (see [Buffers, streams and files](#/node-streams)). Keep instances stateless: sessions, caches shared across instances and rate-limit counters live in Redis or a database.

## Performance: measure first

Performance work is a loop: measure under realistic load, profile, change one thing, measure again.

| Metric | Tells you | Tool |
|---|---|---|
| Latency percentiles (p50, p99) | How long requests take for most users and for the unlucky 1% | A load generator such as autocannon or k6; your metrics |
| Throughput | Requests per second at that latency | The same load test |
| Event loop delay | Whether something blocks the thread | `perf_hooks.monitorEventLoopDelay` |
| CPU profile | Which functions use the CPU | `--cpu-prof`, `--inspect` with Chrome DevTools, flame graphs |
| Memory (`rss`, `heapUsed`) | Whether memory stays flat or keeps climbing | `process.memoryUsage()`, heap snapshots |

Common wins: avoid repeated `JSON.stringify` of large objects, cache expensive results (with a bound and a TTL), stream large responses, batch database calls (the N+1 problem), reuse connections, and move CPU work off the main thread. Most latency in real services is waiting on the database or other services, so look there before micro-optimising JavaScript.

## Memory and leaks

JavaScript objects live in the V8 heap, and the garbage collector frees what is no longer **reachable**. A leak in Node is therefore not a forgotten `free()`: it is objects that stay reachable although the program will never use them again.

| Leak | Why it stays reachable | Fix |
|---|---|---|
| Unbounded cache or `Map` | A module-level variable holds every key ever added | Bound it (LRU) and add a TTL |
| Event listeners added per request | The emitter holds each listener (and its closure) | Remove listeners; use `once` or `events.once` with a signal |
| Timers never cleared | An active interval keeps its closure alive | `clearInterval`/`clearTimeout` in cleanup |
| Closures capturing large objects | A long-lived callback references a big buffer | Capture only what you need |
| Ignored backpressure | Data buffers in streams faster than it drains | `pipeline`, respect `write()` returning `false` |

Diagnose by watching `heapUsed` under steady load: a sawtooth that returns to the same level is normal; a rising floor is a leak. Take two **heap snapshots** minutes apart (`--inspect` and DevTools, `--heapsnapshot-signal=SIGUSR2`, or `--heapsnapshot-near-heap-limit`) and compare what grew and what retains it. In containers, `rss` is what the memory limit counts; set the heap limit below the container limit (`--max-old-space-size` in MB, or, in recent Node versions, `--max-old-space-size-percentage`), leaving room for buffers and native memory, so V8 collects garbage before the platform kills the container.

## Security

- **Input**: validate every request at the edge (schemas), limit body sizes, and never build SQL, shell commands or file paths from raw input. See [Web security](#/web-security).
- **Headers and limits**: security headers (for example with `helmet`), CORS with an allow-list, rate limiting, and timeouts on the server.
- **Secrets**: from a secret manager or the environment, never in code, git or container images; redact them from logs.
- **Dependencies and supply chain**: commit the lockfile and install with `npm ci`; review new dependencies (maintenance, downloads, install scripts); run `npm audit` and automated update tools in CI; pin GitHub Actions; consider `--ignore-scripts` where install scripts are not needed. npm packages have been hijacked to publish malware (the 2025 compromises of widely used packages are the usual examples), so treat updates as code changes.
- **Least privilege**: run as a non-root user, give the service account only the permissions it needs, and consider Node's permission model (`--permission` with `--allow-fs-read`, `--allow-fs-write` and others; no longer behind an experimental flag in current Node) to restrict what the process can touch. Anything not allowed fails with `ERR_ACCESS_DENIED`.

## A production container for Node

```dockerfile
# Build stage: dev dependencies and the TypeScript compiler live only here.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# Runtime stage: production dependencies and compiled JavaScript only.
FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# The official image's "node" user has UID 1000; a numeric UID lets Kubernetes verify runAsNonRoot.
USER 1000
EXPOSE 8080
CMD ["node", "--enable-source-maps", "dist/server.js"]
```

Use a `.dockerignore` (exclude `node_modules`, `.env`, `.git`), pin the base image to an LTS line, keep the image small (slim or distroless), and scan it for vulnerabilities in CI.

## Logs, metrics and traces

- **Logs**: JSON lines to stdout with a level, message, request id and trace id (pino); the platform collects them. On GCP, Cloud Logging maps `severity` and `message`, and `logging.googleapis.com/trace` links a line to its trace.
- **Metrics**: request rate, error rate and latency per route (the RED method), plus Node-specific ones: event loop delay, heap used, active handles, GC pauses. Alert on symptoms users feel (error rate, p99 latency) against SLOs.
- **Traces**: OpenTelemetry's Node SDK with auto-instrumentation for HTTP, Express, database clients and gRPC creates spans with almost no code; export to Cloud Trace, Jaeger or a vendor. Trace context propagates in the `traceparent` header and, inside the process, through `AsyncLocalStorage`.
- **Crashes**: log at fatal level with the stack, exit non-zero, and let the supervisor restart; Node's diagnostic reports (`--report-on-fatalerror`) capture extra detail.

## Node.js versions and running TypeScript

Run an **LTS** line in production. As of October 2026: **Node 24** is Active LTS (moving to maintenance in late October 2026, supported until April 2028), **Node 26** is Current and is scheduled to become LTS at the end of October 2026, and **Node 22** is in maintenance until April 2027. From **Node 27** the project moves to one major release a year, and every major becomes LTS. Check the Node.js release schedule before upgrading; dates can change.

Running TypeScript has three options: compile with `tsc` or a bundler and run JavaScript, still the most common production setup; run directly with **tsx** in development; or use Node's built-in **type stripping** (on by default since Node 23.6 and 22.18, stable in Node 25.2 and 24.12), which deletes the types and runs the code. Type stripping never type-checks and accepts only erasable syntax (no `enum`, `namespace` or constructor parameter properties), so type-checking stays a CI step with `tsc --noEmit`.

| | Run `.ts` directly (type stripping) | Compile to `dist/` |
|---|---|---|
| Build step | None | `tsc` or a bundler |
| Stack traces | Point at your `.ts` lines | Need `--enable-source-maps` and `.map` files |
| Syntax | Erasable TypeScript only | Any TypeScript |
| Cold start | Slightly slower (stripping at load) | Slightly faster |

## Interview questions

### How do you configure a Node.js service across environments? {core}

From environment variables, following twelve-factor: the same image runs everywhere, and only the environment differs. At startup I parse `process.env` with a schema (zod), coerce types, apply defaults, and refuse to start with a clear message if anything required is missing or invalid; the result is one frozen, typed config object passed to the rest of the code. Locally, Node loads `.env` with `--env-file`; in production, the platform injects variables and secrets come from a secret manager.

### What is the difference between liveness and readiness probes? {core}

Liveness asks "is this process alive?"; if it fails, the platform restarts the instance, so it should check only the process itself. Readiness asks "should this instance get traffic now?"; if it fails, the platform stops routing to it without restarting, so it is where dependency checks and the shutting-down flag belong. Putting a database check in liveness is a classic mistake: a short database outage restarts every instance at once and turns a blip into an outage.

### How do you shut a Node.js service down gracefully on Cloud Run or Kubernetes? {core}

Handle `SIGTERM`: mark the service not ready, call `server.close()` to stop accepting connections, close idle keep-alive sockets, let in-flight requests finish, end long-lived streams cleanly (a final SSE event, WebSocket close code 1001), then close database pools and flush logs, and exit. Always add a hard timeout below the platform's grace period: about 10 seconds on Cloud Run, 30 seconds by default on Kubernetes.

A Kubernetes detail: endpoints are removed asynchronously, so services often wait a few seconds (a `preStop` sleep) before closing, to avoid errors on requests already routed to the pod.

### Why might a Node container ignore `SIGTERM`? {deep}

Because it runs as PID 1. Linux does not apply default signal behaviour to PID 1, so unless the process installs a `SIGTERM` handler, the signal does nothing and the container is killed with `SIGKILL` at the end of the grace period, dropping in-flight requests. Starting the app through `npm start` adds another process that may not forward signals. The fix: `CMD ["node", "server.js"]`, an explicit `SIGTERM` handler, or an init process such as tini (`docker run --init`).

### How do you scale a Node.js API? {core}

Horizontally: one stateless Node process per container, more containers as load grows, with the platform's autoscaler (Cloud Run, a Kubernetes HPA) and a load balancer in front. State that must be shared, such as sessions, caches and rate-limit counters, goes to Redis or a database. CPU-heavy work moves to worker threads or a queue-driven worker service. `cluster` or PM2 cluster mode is for a single VM without an orchestrator; inside containers it only adds a second layer of process management.

### How do you implement timeouts and cancellation for outbound calls? {core}

With `AbortSignal` throughout. Each outbound call gets a deadline with `AbortSignal.timeout`; I combine it with the request's own signal, aborted when the client disconnects, using `AbortSignal.any`, and pass the result down to `fetch`, database drivers and streams. When a user cancels, the abort propagates to upstream calls so we stop paying for work nobody will see. Retries are limited to idempotent operations, with backoff, jitter and an overall time budget.

### How do you find a performance problem in a Node service? {core}

Measure before guessing. I reproduce under realistic load with a load generator, watch latency percentiles, throughput and event loop delay, then profile: a CPU profile (`--cpu-prof` or DevTools) shows hot synchronous code, and a flame graph makes it obvious. High latency with an idle CPU usually means waiting on a dependency, so I check database query times, connection pool waits and upstream latency with traces. Then I change one thing and measure again.

### What causes memory leaks in Node, and how do you find them? {core}

Objects that stay reachable: unbounded caches or maps, event listeners added per request and never removed, timers never cleared, closures holding large objects, and data piling up because backpressure is ignored. I confirm with a heap that keeps a rising floor under steady load, then compare two heap snapshots taken minutes apart (DevTools, `--heapsnapshot-signal`) to see what grew and who retains it. The fix is usually bounding a cache or removing a listener.

### How should you set Node's heap size in a container? {deep}

Set it explicitly below the container's memory limit with `--max-old-space-size` (in megabytes), or `--max-old-space-size-percentage` in recent versions, leaving headroom for buffers, native memory and the stack, because the container limit counts the whole `rss`, not just the heap. Then V8 collects garbage aggressively near the limit instead of the platform killing the container (OOMKilled) without warning. Watch `rss` and `heapUsed` metrics to tune it.

### How does connection pooling work in Node, and what goes wrong? {deep}

HTTP clients keep sockets open for reuse: since Node 19 the global agent has keep-alive on, and `fetch` (undici) pools connections per origin. Database drivers such as `pg.Pool` keep a fixed number of connections per process. The classic bug is pool arithmetic: each instance holds its own pool, so 50 instances with 10 connections each can exceed the database's `max_connections`. Size pools to each instance's concurrency, cap instances, or put PgBouncer or the cloud provider's pooler in front.

The other bug is a keep-alive mismatch with the load balancer, which shows up as intermittent 502s.

### What is your security checklist for a Node.js API? {core}

Validate all input with schemas and cap body sizes; parameterised queries, no shell strings, safe file paths. Authentication and per-resource authorisation on every route; CORS with an allow-list; security headers; rate limiting; timeouts. Secrets from a secret manager, never in code, images or logs. Dependencies: lockfile, `npm ci`, `npm audit`, update automation and review of new packages. Run as non-root with least-privilege credentials, keep Node on a supported LTS, and log security-relevant events.

### How do you protect a Node project against supply-chain attacks?

Treat dependencies as code. Commit the lockfile and install with `npm ci`, so builds use exactly the reviewed versions; review new dependencies and their install scripts; keep the dependency count down; run `npm audit` and an update tool in CI so fixes arrive quickly but deliberately; pin CI actions by commit; and use registry and organisation controls such as two-factor authentication and provenance where available. Widely used npm packages have been hijacked to ship malware, which is why automatic, unreviewed upgrades are risky.

### How do you run TypeScript in production?

Usually compile with `tsc` or esbuild in the Docker build stage and run plain JavaScript in a slim runtime image, with `--enable-source-maps` for readable stack traces; type-check in CI with `tsc --noEmit`. Node can now run `.ts` files directly by stripping types, which is great for scripts and small services, but it never type-checks and does not support enums, namespaces or parameter properties, so the code base has to stay within erasable syntax.

### Which Node.js version should you run in production?

An LTS line, upgraded deliberately. In October 2026 that means Node 24 (Active LTS, moving to maintenance at the end of the month) or Node 26 once it enters LTS at the end of October; Node 22 is in maintenance until April 2027. Odd-numbered releases were never meant for production, and from Node 27 the project ships one major a year, each becoming LTS. I pin the version in `engines`, `.node-version` and the base image, and test upgrades in CI before rolling out.

### How do you build a good Docker image for a Node service? {core}

A multi-stage build: install all dependencies and compile in the build stage, then copy only the compiled output and production dependencies (`npm ci --omit=dev`) into a slim or distroless runtime image pinned to an LTS version. Run as a non-root user (a numeric UID so Kubernetes can verify `runAsNonRoot`), start with `node` directly so signals arrive, add a `.dockerignore`, and scan the image in CI. Layer order matters: copy `package.json` and the lockfile before the source so dependency layers are cached.

### PM2, systemd or Kubernetes: who should supervise a Node process? {deep}

Something must restart the process when it crashes and run several instances. On a single VM, PM2 (with cluster mode) or systemd does it. With containers, the orchestrator does: Docker's restart policy for a small host, Kubernetes or a managed platform such as Cloud Run for anything larger, with health probes and rolling deploys. Running PM2 inside a container under Kubernetes duplicates supervision and hides crashes from the platform, so I avoid it.

### What do you log in production, and how?

Structured JSON to stdout, one line per event, with level, message, request id and trace id, through pino; the platform ships the lines to a log store. Per request: method, route, status and duration. Errors with stack traces and context. Never secrets, tokens or personal data: the logger redacts them. Log levels are configurable without a redeploy, and logs work alongside metrics and traces rather than replacing them.

### Which metrics matter most for a Node service? {deep}

The RED metrics per endpoint (rate, errors, duration as percentiles) for what users feel, and Node-specific health signals: event loop delay, heap used and `rss`, garbage-collection pauses, active handles, and connection pool usage. Alerts go on symptoms against SLOs, such as p99 latency and error rate, while the Node metrics explain causes: event loop delay rising with CPU points to blocking code, a climbing heap floor to a leak.

### How do you add distributed tracing to Node services? {deep}

With OpenTelemetry: install the Node SDK and auto-instrumentations for HTTP, Express or Fastify, database clients and gRPC, configure an exporter (Cloud Trace, Jaeger, a vendor), and load it before the app starts. Each request gets a trace; spans for outbound calls carry the `traceparent` header to the next service, and inside the process context flows through `AsyncLocalStorage`. I add the trace id to log lines, so a slow request in a trace links straight to its logs.

### How should a Node service behave when it hits an unexpected error? {core}

Crash, cleanly. For a programmer error, an uncaught exception or an unhandled rejection, I log it at fatal level with the stack and context, try a short graceful shutdown, and exit with a non-zero code; the supervisor starts a fresh instance, and other instances keep serving. Continuing after an unknown error risks corrupt state. Expected operational errors are handled in place and turned into proper responses, and alerts fire on crash loops.

### Why Node.js or Python for a backend service? {deep}

Both work; the choice is about the team and the workload. Node shines for I/O-heavy services with many concurrent connections, such as streaming gateways and WebSocket servers, and lets one language and one set of types span front end and back end. Python has the stronger AI and data ecosystem and FastAPI with Pydantic for contracts. A common split is Python for model and agent work and Node or Python for the streaming gateway, with a typed contract between them.

**Your angle:** at Quantiphi the platform combined a Python/FastAPI backend with SAML authentication handled by Passport.js on Node.js.

### How do you deploy a Node service without downtime? {deep}

Rolling or canary deploys on a platform that understands health: new instances must pass startup and readiness probes before receiving traffic, old ones get `SIGTERM` and drain gracefully, and a canary slice (Cloud Run traffic splitting, Kubernetes progressive delivery) catches problems before everyone sees them. Database migrations stay backward compatible across the two versions (expand, then contract). A fast rollback path, the previous image and a traffic switch, is part of the plan.

## Coding problems

### Load and validate configuration at startup {easy core}

Write `loadConfig(env)` that turns an environment object into a typed, frozen config: `PORT` (integer 1–65535, default 8080), `DATABASE_URL` (required, a URL), `REQUEST_TIMEOUT_MS` (positive integer, default 5000) and `FEATURE_FLAGS` (comma-separated list, default empty). On invalid input it must throw one error that lists every problem, so the process fails at startup with a useful message.

#### Hints

1. A schema library (zod) can coerce strings to numbers and apply defaults in one place.
2. Use `safeParse` and build one message from all the issues, instead of failing on the first.
3. `z.string().transform(...)` turns `"a, b"` into `['a', 'b']`; `Object.freeze` stops accidental writes later.

#### Solution

Environment variables are always strings, so coercion is part of validation. Collecting every issue in one message saves a deploy-fix-deploy loop. Freezing the result makes the config read-only.

```ts
import assert from 'node:assert/strict';
import { z } from 'zod';

const Schema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(8080),
  DATABASE_URL: z.url(),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  FEATURE_FLAGS: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((f) => f.trim()).filter(Boolean)),
});
type Config = Readonly<z.infer<typeof Schema>>;

function loadConfig(env: Record<string, string | undefined>): Config {
  const result = Schema.safeParse(env);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return Object.freeze(result.data);
}

const config = loadConfig({ DATABASE_URL: 'postgres://localhost:5432/app', FEATURE_FLAGS: 'beta-ui, fast-path,,' });
assert.deepEqual(config, { PORT: 8080, DATABASE_URL: 'postgres://localhost:5432/app', REQUEST_TIMEOUT_MS: 5_000, FEATURE_FLAGS: ['beta-ui', 'fast-path'] });
assert.ok(Object.isFrozen(config));

assert.equal(loadConfig({ DATABASE_URL: 'postgres://db/app', PORT: '3000' }).PORT, 3000);
try {
  loadConfig({ PORT: '70000', REQUEST_TIMEOUT_MS: '-5' });
  assert.fail('should have thrown');
} catch (err) {
  const message = (err as Error).message;
  for (const field of ['PORT', 'DATABASE_URL', 'REQUEST_TIMEOUT_MS']) assert.match(message, new RegExp(`${field}:`));
}
console.log('loadConfig ok');
```

Complexity: O(number of variables).

#### Follow-ups

- **Where do secrets go?** Same schema, but the values come from a secret manager mounted as variables or files; mark them so the logger never prints the config object as is.
- **Should config be reloaded at runtime?** Usually not: restart with new config through a deploy. Feature flags that must change live come from a flag service.

### Graceful shutdown helper {medium core}

Write `gracefulShutdown(server, { graceMs, onClose })` returning a function that, when called: stops accepting connections, closes idle keep-alive sockets, waits for in-flight requests, runs the async `onClose` hooks (closing pools, flushing logs), and resolves with `{ forced }`. If requests are still running after `graceMs`, it force-closes them. Calling it twice must not run the hooks twice.

#### Hints

1. `server.close(callback)` stops new connections and calls back when all connections have ended.
2. `server.closeIdleConnections()` ends sockets that are only being kept alive, but a socket serving a request becomes idle only when that request ends. `server.closeAllConnections()` is the force option.
3. Memoise the promise so a second call returns the first one.

#### Solution

The shutdown is a promise created once. `server.close()` alone would wait for keep-alive sockets that clients keep open after their last request, so a short interval sweeps idle connections until the server has closed. A timer forces closure if the grace period runs out, and is cleared if the server closes in time.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

function gracefulShutdown(server: Server, opts: { graceMs: number; onClose: (() => Promise<void>)[] }) {
  let done: Promise<{ forced: boolean }> | undefined;
  return () =>
    (done ??= new Promise((resolve) => {
      let forced = false;
      const timer = setTimeout(() => {
        forced = true;
        server.closeAllConnections();
      }, opts.graceMs);
      // A keep-alive socket becomes idle only after its in-flight request ends, so sweep repeatedly.
      const sweep = setInterval(() => server.closeIdleConnections(), 25);
      server.close(async () => {
        clearTimeout(timer);
        clearInterval(sweep);
        for (const hook of opts.onClose) await hook();
        resolve({ forced });
      });
    }));
}

async function scenario(handlerMs: number, graceMs: number) {
  const server = createServer((_req, res) => {
    const work = setTimeout(() => res.end('ok'), handlerMs);
    res.on('close', () => clearTimeout(work)); // a force-closed request must not leave its timer running
  });
  await new Promise<void>((r) => server.listen(0, r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const hooks: string[] = [];
  const stop = gracefulShutdown(server, { graceMs, onClose: [async () => void hooks.push('pool'), async () => void hooks.push('logs')] });
  const request = fetch(url).then((r) => r.text(), () => 'aborted');
  await new Promise((r) => setTimeout(r, 10));
  const [a, b] = [stop(), stop()];
  assert.equal(a, b); // the same promise: hooks run once
  const result = await a;
  return { result, hooks, response: await request };
}

const graceful = await scenario(50, 1_000);
assert.deepEqual(graceful, { result: { forced: false }, hooks: ['pool', 'logs'], response: 'ok' });

const forced = await scenario(5_000, 50);
assert.equal(forced.result.forced, true);
assert.equal(forced.response, 'aborted');
assert.deepEqual(forced.hooks, ['pool', 'logs']);
console.log('graceful shutdown helper ok');
```

Complexity: O(1) work; the time is bounded by `graceMs`.

#### Follow-ups

- **How do you drain WebSocket or SSE clients?** Keep a set of open streams; on shutdown send a final event (or close code 1001) so clients reconnect to another instance, then end them.
- **Why fail readiness first?** So the load balancer stops routing new requests during the drain window.

### Liveness and readiness endpoints {medium}

Write `createHealth({ pingDb, timeoutMs })` that returns an HTTP handler for `/healthz` and `/readyz` and a `startShutdown()` function. `/healthz` returns 200 as long as the process can answer. `/readyz` returns 200 only if the database ping succeeds within `timeoutMs` and shutdown has not started; otherwise 503 with the reason. A hanging database must not hang the probe.

#### Hints

1. Race the ping against a timer; a hung dependency is as bad as a down one.
2. Unref or clear the timer so it cannot keep the process alive.
3. Liveness must not call the database at all.

#### Solution

Readiness combines the shutdown flag with a time-boxed dependency check, and reports why it failed, which makes probe failures easy to diagnose. Liveness stays trivial on purpose.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

function createHealth({ pingDb, timeoutMs }: { pingDb: () => Promise<void>; timeoutMs: number }) {
  let shuttingDown = false;

  async function dbReady(): Promise<string | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<string>((resolve) => {
      timer = setTimeout(() => resolve(`database did not answer within ${timeoutMs} ms`), timeoutMs);
    });
    try {
      return await Promise.race([pingDb().then(() => null, (err: Error) => `database error: ${err.message}`), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function handler(req: IncomingMessage, res: ServerResponse) {
    const send = (status: number, body: object) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
    if (req.url === '/healthz') return send(200, { status: 'ok' });
    if (req.url === '/readyz') {
      if (shuttingDown) return send(503, { status: 'unavailable', reason: 'shutting down' });
      const problem = await dbReady();
      return problem ? send(503, { status: 'unavailable', reason: problem }) : send(200, { status: 'ready' });
    }
    send(404, { error: 'not found' });
  }

  return { handler, startShutdown: () => void (shuttingDown = true) };
}

let db: 'up' | 'down' | 'hung' = 'up';
const pingDb = () =>
  db === 'up' ? Promise.resolve() : db === 'down' ? Promise.reject(new Error('connection refused')) : new Promise<void>(() => {});
const health = createHealth({ pingDb, timeoutMs: 100 });
const server = createServer((req, res) => void health.handler(req, res));
await new Promise<void>((r) => server.listen(0, r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const probe = async (path: string) => {
  const res = await fetch(base + path);
  return [res.status, ((await res.json()) as { reason?: string }).reason ?? 'ok'];
};

assert.deepEqual(await probe('/readyz'), [200, 'ok']);
db = 'down';
assert.deepEqual(await probe('/readyz'), [503, 'database error: connection refused']);
assert.deepEqual(await probe('/healthz'), [200, 'ok']); // liveness does not care about the database
db = 'hung';
const started = performance.now();
assert.deepEqual(await probe('/readyz'), [503, 'database did not answer within 100 ms']);
assert.ok(performance.now() - started < 1_000);
db = 'up';
health.startShutdown();
assert.deepEqual(await probe('/readyz'), [503, 'shutting down']);
server.close();
console.log('health endpoints ok');
```

Complexity: O(1) per probe, bounded by `timeoutMs`.

#### Follow-ups

- **Should readiness check every dependency?** Only the ones the instance cannot serve any useful traffic without; checking an optional dependency can take the whole fleet out of rotation for a partial outage.
- **What about a startup probe?** It gives a slow-starting app time to warm up (load models, run migrations) before liveness checks begin.

### Flip readiness when the event loop is overloaded {medium}

Write `loopWatchdog({ thresholdMs, windowMs })` that samples event loop delay with `monitorEventLoopDelay` and exposes `status()`: `'ok'` while the p99 delay over the last window is below `thresholdMs`, and `'overloaded'` otherwise, so readiness can shed load from an instance that is blocked. Provide `stop()`. Prove it reports `'overloaded'` after the thread is blocked and recovers afterwards.

#### Hints

1. `monitorEventLoopDelay({ resolution })` returns a histogram in nanoseconds; call `enable()` to start.
2. On an interval of `windowMs`, read `percentile(99)`, store the status, then `reset()` the histogram for the next window.
3. `unref()` the interval so the watchdog never keeps the process alive.

#### Solution

Resetting the histogram each window makes the status reflect recent behaviour, so an instance recovers once the blocking stops. Exposing it to readiness means the load balancer stops sending traffic to a stuck instance instead of piling more requests onto it.

```ts
import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';

function loopWatchdog({ thresholdMs, windowMs }: { thresholdMs: number; windowMs: number }) {
  const histogram = monitorEventLoopDelay({ resolution: 10 });
  histogram.enable();
  let current: 'ok' | 'overloaded' = 'ok';
  let lastP99Ms = 0;
  const timer = setInterval(() => {
    lastP99Ms = histogram.percentile(99) / 1e6;
    current = lastP99Ms >= thresholdMs ? 'overloaded' : 'ok';
    histogram.reset();
  }, windowMs);
  timer.unref();
  return {
    status: () => current,
    lastP99Ms: () => lastP99Ms,
    stop() {
      clearInterval(timer);
      histogram.disable();
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const block = (ms: number) => {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    /* a synchronous hot loop */
  }
};

const watchdog = loopWatchdog({ thresholdMs: 70, windowMs: 200 });
await sleep(450);
assert.equal(watchdog.status(), 'ok');

// Keep the thread mostly blocked for several windows. The status reflects the latest full window,
// so check it while the overload is still going on.
const busyUntil = performance.now() + 700;
while (performance.now() < busyUntil) {
  block(120);
  await sleep(1);
}
assert.equal(watchdog.status(), 'overloaded', `p99 was ${watchdog.lastP99Ms()} ms`);

// After a quiet window it recovers.
await sleep(500);
assert.equal(watchdog.status(), 'ok', `p99 was ${watchdog.lastP99Ms()} ms`);
watchdog.stop();
console.log('watchdog ok');
```

Complexity: O(1) per sample.

#### Follow-ups

- **Is shedding load the right response?** It buys time, but the cause still needs fixing: find the blocking code with a CPU profile.
- **Why not put this in liveness?** A busy-but-recovering instance would be restarted, losing its in-flight work and adding cold starts; readiness takes it out of rotation without killing it.
