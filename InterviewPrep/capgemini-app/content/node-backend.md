---
title: Node.js and TypeScript services
goal: Explain how Node runs your code, keep the event loop healthy, stream with backpressure, and build an Express or Fastify service that validates, logs, times out and shuts down cleanly.
minutes: 50
---

The JD asks for "high-throughput REST and gRPC APIs in Python or Node.js (TypeScript)" and "asynchronous workers". In a Node interview the questions almost always start at the **event loop**: what runs where, what blocks it, and how you find out. Then they move to **streams and backpressure** (central to streaming LLM tokens), **scaling CPU work**, **framework choice**, and the operational basics a senior is expected to own: validation at the edge, structured logs, timeouts with `AbortSignal`, and graceful shutdown when Cloud Run or GKE sends `SIGTERM`.

Every `ts` block in this chapter runs on Node 25 with type stripping. Your separate Node.js Lab has the full course; this chapter is the interview cut.

## The event loop in one picture

Node runs your JavaScript on **one thread**. libuv runs an event loop around it. Each turn of the loop goes through phases, and each phase has a queue of callbacks:

```text
   ┌──────────────────────────┐
┌─>│ timers                   │  setTimeout / setInterval callbacks whose time has come
│  ├──────────────────────────┤
│  │ pending callbacks        │  some deferred system callbacks (e.g. TCP errors)
│  ├──────────────────────────┤
│  │ poll                     │  wait for I/O; run I/O callbacks (sockets, files)
│  ├──────────────────────────┤
│  │ check                    │  setImmediate callbacks
│  ├──────────────────────────┤
└──┤ close callbacks          │  'close' events (socket.on('close'))
   └──────────────────────────┘
After EVERY callback: drain process.nextTick queue, then the promise microtask queue.
```

Two rules answer most quiz questions:

- **Microtasks run between callbacks**, not between phases. After any callback finishes, Node drains the `process.nextTick` queue, then promise microtasks (`.then`, `await` continuations, `queueMicrotask`), and repeats until both are empty.
- **`setImmediate` runs in the check phase, right after poll.** Inside an I/O callback, `setImmediate` always fires before a `setTimeout(fn, 0)`. At the top level of a script the order of those two is not guaranteed.

```ts
import assert from 'node:assert/strict';
import { readFile } from 'node:fs';

// Inside a callback, nextTick beats promise microtasks.
const inTimer: string[] = [];
await new Promise<void>((done) => {
  setTimeout(() => {
    Promise.resolve().then(() => inTimer.push('promise'));
    process.nextTick(() => inTimer.push('nextTick'));
    inTimer.push('sync');
    setTimeout(done, 5);
  }, 0);
});
assert.deepEqual(inTimer, ['sync', 'nextTick', 'promise']);

// Inside an I/O callback, setImmediate (check phase) beats setTimeout 0 (next timers phase).
const inIo: string[] = [];
await new Promise<void>((done) => {
  readFile(import.meta.filename, () => {
    setTimeout(() => inIo.push('timeout'), 0);
    setImmediate(() => inIo.push('immediate'));
    setTimeout(done, 20);
  });
});
assert.deepEqual(inIo, ['immediate', 'timeout']);
console.log({ inTimer, inIo });
```

A subtle one that impresses interviewers: **at the top level of an ES module, already-queued promise callbacks run before `nextTick` callbacks.** Module evaluation itself runs as part of a promise job, so Node finishes the current microtask queue before it gets to the nextTick queue. In CommonJS the classic order holds. The same five lines printed this on Node 25:

```text
ESM (.ts / .mjs, top level):  [ 'sync', 'promise', 'microtask', 'nextTick' ]
CommonJS (.cjs, top level):   [ 'sync', 'nextTick', 'promise', 'microtask' ]
```

### What actually uses threads

Network I/O does **not** use a thread per request: libuv uses the operating system's non-blocking mechanisms (epoll, kqueue, IOCP). The **libuv thread pool** (default **4** threads, set with `UV_THREADPOOL_SIZE`, maximum 1024) handles work the OS cannot do asynchronously: most `fs` calls, `dns.lookup`, the async `crypto` functions such as `pbkdf2` and `scrypt`, and `zlib`. If every request hashes a password with `scrypt`, four of them run at once and the rest queue, even though the loop itself is idle.

## Blocking the loop, and how to prove it

Anything synchronous and slow stops **every** request on that process: a huge `JSON.parse`, `crypto.pbkdf2Sync`, a regular expression that backtracks catastrophically (ReDoS), sorting a million records, or a tight loop. Timers fire late, sockets are not read, health checks time out.

```ts
import assert from 'node:assert/strict';

// A 10 ms timer cannot fire while the thread is busy for 60 ms.
const started = performance.now();
const fired = new Promise<number>((resolve) => setTimeout(() => resolve(performance.now() - started), 10));
const until = performance.now() + 60;
while (performance.now() < until) {
  /* simulate a synchronous JSON.parse of a huge payload */
}
const lateness = await fired;
assert.ok(lateness >= 60, `timer fired after ${lateness} ms`);
console.log(`10 ms timer fired after ${Math.round(lateness)} ms`);
```

How to find it in production:

- **Event loop delay** as a metric: `perf_hooks.monitorEventLoopDelay()` gives a histogram (p50, p99, max). Alert when p99 climbs.
- **CPU profiles**: run with `--cpu-prof`, or attach Chrome DevTools with `--inspect`, and look for one wide synchronous frame.
- **Clinic.js / 0x** flame graphs locally under load (`autocannon`).

Fixes, in order of preference: do less (stream instead of parse-everything, paginate), make it async (`crypto.scrypt` instead of `scryptSync`), chunk it (`setImmediate` between batches), move it to a **worker thread**, or move it to a separate service or queue worker.

## Streams and backpressure

A stream moves data in chunks instead of buffering everything. There are four kinds: `Readable`, `Writable`, `Duplex` (both, like a socket) and `Transform` (a Duplex that changes data, like gzip).

**Backpressure** is how a slow consumer tells a fast producer to wait. Every stream has a buffer limit (`highWaterMark`: 64 KiB for byte streams since Node 22, 16 KiB before that; 16 objects in object mode). `writable.write(chunk)` returns `false` once the buffer is over the limit; a well-behaved producer stops and waits for the `'drain'` event. `pipe()` and `pipeline()` do this for you. Ignoring the `false` is how a Node service runs out of memory when the client reads slowly, for example a browser on a bad network receiving an LLM stream.

```ts
import assert from 'node:assert/strict';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// write() returns false once the buffer passes highWaterMark: that is the backpressure signal.
const slow = new Writable({
  highWaterMark: 2,
  objectMode: true,
  write(_chunk, _enc, cb) {
    setTimeout(cb, 1);
  },
});
const accepted = [slow.write('a'), slow.write('b'), slow.write('c')];
assert.deepEqual(accepted, [true, false, false]);
await new Promise((r) => slow.once('drain', r));

// pipeline() wires backpressure, propagates errors and destroys every stream on failure.
const tokens = Readable.from(['Hel', 'lo', ' wor', 'ld']);
const upper = new Transform({
  objectMode: true,
  transform(chunk: string, _enc, cb) {
    cb(null, chunk.toUpperCase());
  },
});
const out: string[] = [];
await pipeline(
  tokens,
  upper,
  new Writable({
    objectMode: true,
    write(chunk: string, _enc, cb) {
      out.push(chunk);
      cb();
    },
  }),
);
assert.equal(out.join(''), 'HELLO WORLD');

// Readable streams are async iterables, which is often the simplest way to consume them.
let total = 0;
for await (const n of Readable.from([1, 2, 3])) total += n as number;
assert.equal(total, 6);
console.log('streams ok');
```

Prefer `pipeline` from `node:stream/promises` over `.pipe()`: `pipe` does not forward errors, so a failed upstream leaves the downstream open and leaks file descriptors or sockets.

## Using more than one core

| Option | What it is | Use it for | Watch out for |
|---|---|---|---|
| **More instances** (Cloud Run instances, GKE replicas) | Separate processes behind a load balancer | The default way to scale a stateless API | Nothing shared in memory; state goes to Redis or a database |
| **`cluster`** | One primary forks N workers sharing a port | Using all cores of one VM without an orchestrator | Mostly unnecessary in containers: run one process per container and let the platform scale |
| **`worker_threads`** | Threads with their own V8 isolate and event loop in one process | CPU-heavy work that must stay in-process: parsing, image or PDF work, compression | Data is copied (structured clone) unless you transfer `ArrayBuffer`s or use `SharedArrayBuffer`; use a pool such as Piscina |
| **`child_process`** | A separate OS process | Running another program (a CLI such as Terraform) | Spawn cost; handle stdout, stderr and exit codes |

```ts
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';

// CPU work on another thread: the main event loop stays responsive.
const code = `
  const { parentPort, workerData } = require('node:worker_threads');
  const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
  parentPort.postMessage(fib(workerData));
`;
const result = await new Promise<number>((resolve, reject) => {
  const worker = new Worker(code, { eval: true, workerData: 25 });
  worker.once('message', resolve);
  worker.once('error', reject);
});
assert.equal(result, 75025);
console.log('fib(25) from a worker thread =', result);
```

## Frameworks: Express 5, Fastify, NestJS

| | Express 5 | Fastify | NestJS |
|---|---|---|---|
| Style | Minimal, middleware chain | Plugins with encapsulation, lifecycle hooks | Opinionated: modules, controllers, providers, DI, decorators |
| Validation | Bring your own (zod, express-validator) | Built in: JSON Schema per route (Ajv) | Pipes with class-validator, or zod |
| Serialisation | `res.json` (JSON.stringify) | Schema-based, faster (fast-json-stringify) | Depends on adapter |
| Logging | Bring your own (pino) | pino built in | Built-in logger, pino via module |
| Performance | Fine for most services | Noticeably higher throughput | Runs on Express or Fastify underneath |
| Choose when | Small service, team knows it, huge ecosystem | High-throughput APIs, schema-first contracts | Large teams wanting structure and consistency (Angular-like) |

**What changed in Express 5** (5.0 released in September 2024; the npm default since 5.1 in March 2025): rejected promises from `async` handlers now go to your error middleware automatically (no more `express-async-errors`); route paths use path-to-regexp 8, so wildcards must be named (`/*splat`, or `/{*splat}` to also match the root) and optional parts use braces (`/runs{/:id}`); `req.body` is `undefined` unless a body parser ran; `req.query` is a read-only getter; `express.urlencoded` defaults to `extended: false`; Node 18+ is required.

## A service done right: validation, errors, request ids

The edge of the service is where you turn untrusted JSON into typed data. With **zod** the schema is both the runtime validator and the TypeScript type, so they cannot drift apart. Errors go out in one consistent format (RFC 9457 problem details, see [API design](#/api-design)).

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const StartRun = z.object({
  agentId: z.string().min(1),
  input: z.string().min(1).max(10_000),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
type StartRun = z.infer<typeof StartRun>;

class HttpError extends Error {
  readonly status: number;
  readonly title: string;
  readonly extra: Record<string, unknown>;
  constructor(status: number, title: string, extra: Record<string, unknown> = {}) {
    super(title);
    this.status = status;
    this.title = title;
    this.extra = extra;
  }
}

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  const id = req.get('x-request-id') ?? randomUUID();
  res.locals.requestId = id;
  res.set('x-request-id', id);
  next();
});

app.post('/v1/runs', async (req, res) => {
  const parsed = StartRun.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(422, 'Invalid request body', {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const run: StartRun & { id: string; status: string } = { ...parsed.data, id: randomUUID(), status: 'queued' };
  res.status(202).location(`/v1/runs/${run.id}`).json(run);
});

app.get('/v1/runs/:id', async (req) => {
  // Express 5 forwards this rejection to the error middleware below.
  throw new HttpError(404, 'Run not found', { runId: req.params.id });
});

// Error middleware has four parameters. One place decides the error format.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const e = err instanceof HttpError ? err : new HttpError(500, 'Internal Server Error');
  if (e.status >= 500) console.error({ requestId: res.locals.requestId, err });
  res
    .status(e.status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title: e.title, status: e.status, instance: req.originalUrl, requestId: res.locals.requestId, ...e.extra });
});

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

const ok = await fetch(`${base}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: 'a1', input: 'hi' }) });
assert.equal(ok.status, 202);
const body = (await ok.json()) as { priority: string; id: string };
assert.equal(body.priority, 'normal');
assert.equal(ok.headers.get('location'), `/v1/runs/${body.id}`);

const bad = await fetch(`${base}/v1/runs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: '' }) });
assert.equal(bad.status, 422);
assert.equal(bad.headers.get('content-type'), 'application/problem+json; charset=utf-8');
const problem = (await bad.json()) as { errors: { path: string }[] };
assert.deepEqual(problem.errors.map((x) => x.path).sort(), ['agentId', 'input']);

const missing = await fetch(`${base}/v1/runs/r9`, { headers: { 'x-request-id': 'req-1' } });
assert.equal(missing.status, 404);
assert.equal(((await missing.json()) as { requestId: string }).requestId, 'req-1');

server.close();
console.log('express service ok');
```

## Timeouts and cancellation with AbortSignal

Every call that leaves the process needs a deadline, or one slow dependency ties up connections until the whole service stalls. In modern Node the tool is **`AbortSignal`**: `fetch`, `stream.pipeline`, `timers/promises`, `events.once`, `child_process` and most libraries accept a `signal`.

- `AbortSignal.timeout(ms)` gives a signal that aborts after a deadline (with a `TimeoutError`).
- `AbortSignal.any([a, b])` combines signals: abort when the client disconnects **or** the deadline passes.
- Pass the signal **down** every layer, so cancelling the request cancels the upstream LLM call and the database query too.

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
console.log('timeouts ok');
```

## Graceful shutdown

Cloud Run and Kubernetes stop a container by sending **`SIGTERM`**, waiting, then sending `SIGKILL`. Cloud Run gives about **10 seconds**; Kubernetes uses `terminationGracePeriodSeconds` (30 s by default). In that window a good service:

1. Stops accepting new connections (`server.close()`), and fails readiness checks so the load balancer stops sending traffic. On GKE, endpoint removal happens in parallel with `SIGTERM`, so a few requests can still arrive just after it: a short `preStop` sleep (or a few seconds of serving before `close()`) avoids failing them.
2. Lets in-flight requests finish, closes idle keep-alive sockets (`server.closeIdleConnections()`), and tells long streams to wrap up (send a final SSE event, close WebSockets with code 1001 "going away").
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

## Logging, context and observability

- Log **JSON to stdout**, one line per event, with a level and a request id. On GCP, Cloud Logging reads structured JSON lines from stdout and maps `severity` and `message`; adding `logging.googleapis.com/trace` (`projects/PROJECT_ID/traces/TRACE_ID`) links the log line to the request's trace.
- **pino** is the usual logger: fast, JSON by default, child loggers per request.
- **`AsyncLocalStorage`** (from `node:async_hooks`) carries request context (request id, user, tenant) through every `await` without passing it as an argument. OpenTelemetry uses the same mechanism for the active span.
- **OpenTelemetry** auto-instrumentation for http, express, pg and gRPC gives traces with almost no code; export to Cloud Trace.

```ts
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

type Ctx = { requestId: string; tenant: string };
const context = new AsyncLocalStorage<Ctx>();
const lines: string[] = [];

function log(severity: 'INFO' | 'ERROR', message: string, fields: Record<string, unknown> = {}) {
  const ctx = context.getStore();
  lines.push(JSON.stringify({ severity, message, ...ctx, ...fields }));
}

async function loadRun(id: string) {
  await new Promise((r) => setTimeout(r, Math.random() * 10));
  log('INFO', 'run loaded', { runId: id }); // no request id passed in, yet it appears
}

// Two concurrent "requests" interleave, but each keeps its own context.
await Promise.all([
  context.run({ requestId: 'req-a', tenant: 't1' }, () => loadRun('r1')),
  context.run({ requestId: 'req-b', tenant: 't2' }, () => loadRun('r2')),
]);
const parsed = lines.map((l) => JSON.parse(l) as { requestId: string; runId: string; severity: string });
assert.equal(parsed.find((p) => p.runId === 'r1')?.requestId, 'req-a');
assert.equal(parsed.find((p) => p.runId === 'r2')?.requestId, 'req-b');
assert.ok(parsed.every((p) => p.severity === 'INFO'));
console.log(lines.join('\n'));
```

## Modules and running TypeScript

- **ESM vs CommonJS.** `"type": "module"` in package.json makes `.js` files ES modules (`import`/`export`, top-level `await`, `import.meta.dirname`). CommonJS uses `require`. Since Node 22.12 (and 20.19), `require()` can load ES modules that have no top-level `await`, which removed most of the interop pain.
- **Running TypeScript.** Three options: compile with `tsc` (or a bundler such as esbuild) and run the JavaScript, which is still the most common production setup; run directly with **tsx** in development; or use Node's built-in **type stripping** (on by default since Node 23.6 and 22.18), which deletes the types and runs the code. Type stripping never type-checks, and it only accepts erasable syntax: no `enum`, `namespace` or constructor parameter properties. Type-checking stays a CI step with `tsc --noEmit`; TypeScript 7, the native compiler, makes that step much faster.
- **Pick an LTS line** (even-numbered: Node 24 today) for production images.

## Interview questions

### Explain the Node.js event loop. {core}

Node runs JavaScript on a single thread, and libuv runs an event loop around it. Each turn goes through phases: timers, pending callbacks, poll (wait for and run I/O callbacks), check (`setImmediate`), and close callbacks. After every callback Node drains the `process.nextTick` queue and then the promise microtask queue. Concurrency comes from never blocking: I/O is handed to the operating system or the libuv thread pool, and your callback runs when the result is ready.

The follow-up is usually "so how does one thread serve thousands of connections?" Network sockets are non-blocking (epoll, kqueue, IOCP), so a waiting request costs a little memory, not a thread. The thread pool (4 threads by default) is only for work the OS cannot do asynchronously: most file system calls, `dns.lookup`, async crypto and zlib.

### What is the order of `process.nextTick`, promises, `setImmediate` and `setTimeout(fn, 0)`? {core}

Synchronous code first. Then microtasks: inside a callback, the `nextTick` queue runs before promise callbacks. Then the loop continues to its phases: `setImmediate` runs in the check phase and `setTimeout` in the timers phase. Inside an I/O callback, `setImmediate` always fires before `setTimeout(fn, 0)`; at the top level of a script their order is not guaranteed.

The senior detail: at the top level of an ES module, promise callbacks already queued run before `nextTick`, because module evaluation is itself part of a promise job. And `nextTick` can starve the loop if it schedules itself recursively, which is why `queueMicrotask` or `setImmediate` are usually better choices.

### How do you know the event loop is blocked, and how do you fix it? {core}

Symptoms are timers firing late, rising latency for every endpoint at once, and failed health checks while CPU sits at 100% on one core. I measure event loop delay with `perf_hooks.monitorEventLoopDelay` as a metric and alert on its p99, then take a CPU profile (`--cpu-prof` or DevTools) to find the wide synchronous frame. Fixes, in order: avoid the work (stream, paginate), use the async API, chunk it with `setImmediate`, or move it to a worker thread or a separate worker service.

Typical culprits: `JSON.parse` or `JSON.stringify` of multi-megabyte payloads, sync crypto (`pbkdf2Sync`), a ReDoS-prone regular expression on user input, or sorting a large array per request.

### What is backpressure, and how do Node streams handle it? {core}

Backpressure is the slow consumer telling the fast producer to wait, so data does not pile up in memory. In Node, `write()` returns `false` when the writable's buffer passes its `highWaterMark`; the producer should stop and resume on `'drain'`. `pipe()` and `stream.pipeline()` do this automatically, and `pipeline` also propagates errors and destroys every stream on failure.

It matters directly for this role: if a Node service relays LLM tokens to a browser on a slow connection and ignores `res.write()` returning `false`, the tokens buffer in memory per connection. With thousands of streams that is an out-of-memory crash.

### When would you use worker threads, cluster, or just more instances?

For a stateless API in containers, scale with more instances: one Node process per container and let Cloud Run or a Kubernetes HPA add replicas. Use `worker_threads` when a request needs CPU-heavy work in-process, such as parsing a large document, so the main loop stays responsive; use a pool (Piscina) and transfer buffers instead of copying. `cluster` mostly made sense on bare VMs before containers.

If the CPU work is long or bursty, I would rather put it on a queue and a separate worker deployment, so it can scale and fail independently of the API.

### Express, Fastify or NestJS: how do you choose? {core}

Express is minimal with the biggest ecosystem; Express 5 finally forwards async errors to error middleware. Fastify gives higher throughput, JSON-schema validation and serialisation per route, built-in pino logging and plugin encapsulation, which suits a high-throughput, contract-first API. NestJS adds structure (modules, dependency injection, decorators) on top of either, which helps large teams stay consistent.

For a new high-throughput service on this platform I would lean towards Fastify, or NestJS on the Fastify adapter if several teams share the codebase. I would not rewrite a working Express service just for speed: the database and upstream APIs usually dominate latency.

### What changed in Express 5? {deep}

The headline is that errors thrown or rejected inside `async` handlers now reach the error-handling middleware automatically. Route matching moved to path-to-regexp 8: wildcards must be named (`/*splat`, `/{*splat}` to include the root) and optional segments use braces. `req.body` is `undefined` unless a body parser ran, `req.query` is read-only, `express.urlencoded` defaults to `extended: false`, some deprecated signatures were removed, and Node 18+ is required.

### How do you handle errors in a Node service?

Separate **operational errors** (bad input, a dependency timing out: expected, handled, mapped to a status code) from **programmer errors** (a bug: log it and let the process crash and restart). In Express or Fastify, throw typed errors from handlers and convert them in one error middleware into a consistent response format, such as RFC 9457 problem details, logging 5xx with the request id.

For the process level: an unhandled promise rejection crashes Node by default since v15, which is the right behaviour; register `process.on('uncaughtException')` only to log and exit, never to keep running in an unknown state. The orchestrator restarts the container.

### How do you shut a Node service down gracefully on Cloud Run or GKE? {core}

Handle `SIGTERM`: mark the service not ready, call `server.close()` to stop accepting connections, close idle keep-alive sockets, let in-flight requests finish, end long-lived streams cleanly (a final SSE event, WebSocket close code 1001), then close database pools and flush logs, and exit. Always add a hard timeout below the platform's grace period: about 10 seconds on Cloud Run, 30 seconds by default on Kubernetes.

A Kubernetes detail: endpoints are removed asynchronously, so some services also wait a few seconds (a `preStop` sleep) before closing, to avoid errors from requests already routed to the pod.

### How do you implement timeouts and cancellation? {core}

With `AbortSignal` throughout. Each outbound call gets a deadline with `AbortSignal.timeout`; I combine it with the request's own signal (aborted when the client disconnects) using `AbortSignal.any`, and pass the result down to `fetch`, database drivers and streams. When the user presses Stop in the chat, the browser aborts its fetch, the server sees the connection close, and the abort propagates to the upstream LLM call so we stop paying for tokens.

Also set server-side limits: `server.requestTimeout`, `headersTimeout`, and a keep-alive timeout longer than the load balancer's idle timeout to avoid 502s from connections closed under it.

### How do you validate input and keep the API contract in TypeScript? {core}

Validate at the edge with a runtime schema, because TypeScript types disappear at runtime. With zod, the schema is the validator and `z.infer` gives the type, so they cannot drift. Fastify does the same with JSON Schema (and TypeBox for types). The same schemas can generate OpenAPI, and the front end can share them or a generated client.

I return a 422 (or 400, by team convention) with a field-level error list, and I validate responses from upstream services too, because an LLM or a third-party API can return anything.

### How do you carry a request id through async code? {deep}

With `AsyncLocalStorage` from `node:async_hooks`. Middleware starts `storage.run({ requestId }, next)` and anything awaited inside, however deep, can read `storage.getStore()`. The logger adds it to every line, and outbound calls forward it as a header. OpenTelemetry uses the same mechanism to keep the active span, so logs and traces correlate.

### What causes memory leaks in Node, and how do you find them? {deep}

Common causes: unbounded in-memory caches or maps keyed by request or user, event listeners added per request and never removed (Node warns with `MaxListenersExceededWarning`), closures that keep large objects alive, intervals never cleared, and buffers piling up because backpressure is ignored. I confirm with memory metrics that only go up, then compare two heap snapshots (`--inspect`, or `--heapsnapshot-signal`) taken minutes apart and look at what grew and who retains it.

In containers, also set `--max-old-space-size` below the container's memory limit so V8 collects garbage before the platform kills the container for using too much memory.

### How does connection pooling work in Node, and what goes wrong? {deep}

HTTP clients keep sockets open for reuse: since Node 19 the global `http.Agent` has keep-alive on, and `fetch` (undici) pools connections per origin. Database drivers such as `pg.Pool` keep a fixed number of connections. The classic production bug is pool math: a Cloud Run instance can take dozens of concurrent requests (the default concurrency is 80, or 80 per vCPU for services created with gcloud or Terraform), each instance holds its own pool of, say, 10 connections, and 50 instances times 10 connections can exceed the database's `max_connections`. Size pools per instance, cap instances, or put PgBouncer or the Cloud SQL connector in front.

The other bug is a keep-alive timeout mismatch: if the server closes idle sockets sooner than the load balancer does, the balancer reuses a dead socket and returns a 502.

### What is the difference between ESM and CommonJS, and does it still matter? {deep}

ES modules use `import`/`export`, load asynchronously, support top-level `await`, and are the standard; CommonJS uses `require` and loads synchronously. It matters less than it used to: since Node 22.12, `require()` can load ES modules that have no top-level `await`. In practice I set `"type": "module"`, use `.js` extensions or a bundler, and check libraries for dual packages.

### How do you run TypeScript in production?

Usually compile with `tsc` or esbuild in the Docker build stage and run plain JavaScript in a slim runtime image; type-check in CI with `tsc --noEmit`. Node can now run `.ts` files directly by stripping types, which is great for scripts and small services, but it never type-checks and does not support enums, namespaces or parameter properties, so the code base has to stay within erasable syntax.

### Why Node.js or Python for the orchestration service?

Both work; the choice is about the team and the workload. Node shines for I/O-heavy services with many concurrent connections, such as streaming gateways and WebSocket servers, and lets one language and one set of types (zod schemas, generated clients) span front end and back end. Python has the stronger AI ecosystem (LangGraph, provider SDKs, evaluation tools) and FastAPI with Pydantic for contracts. A common split is Python for the agent runtime and Node or Python for the streaming gateway, with a typed contract between them.

**Your angle:** you have used both on one platform: a Python/FastAPI backend with SAML handled by Passport.js on Node at Quantiphi.

### How would you relay an upstream LLM stream to the browser through a Node service? {core}

Call the upstream with `fetch` and a signal, then pipe its body to the response with `pipeline` (convert the web stream with `Readable.fromWeb`) so backpressure flows from the browser to the upstream. Set `Content-Type: text/event-stream`, `Cache-Control: no-cache`, and flush headers immediately. On `res.on('close')` before the end, abort the controller so the upstream stops generating, and record usage. Add a keep-alive comment every 15 seconds or so, so idle proxies do not cut the connection.

The coding problem below builds exactly this.

### What is the libuv thread pool, and when would you change its size? {deep}

It is a pool of worker threads (4 by default, up to 1024 via `UV_THREADPOOL_SIZE`, set before the pool is first used) that runs blocking work for async APIs: most `fs` operations, `dns.lookup`, `crypto.pbkdf2`/`scrypt`/`randomBytes`, and zlib. If a service does many concurrent password hashes or file reads, the pool becomes the bottleneck while the event loop looks idle. Raising it helps up to the number of cores; beyond that, move the work elsewhere.

## Coding problems

### Parse NDJSON from a stream whose chunks split lines {medium core}

An upstream service streams newline-delimited JSON (one event per line), but network chunks arrive at arbitrary boundaries: a line can be split across chunks, and one chunk can hold several lines. Write a `Transform` stream that takes strings and emits one parsed object per complete line. Ignore blank lines, handle a final line without a trailing newline, and fail the stream on invalid JSON.

Example: chunks `'{"a":1}\n{"b"'`, `':2}\n\n{"c":3}'` produce `{a:1}`, `{b:2}`, `{c:3}`.

#### Hints

1. Keep a buffer string across `transform` calls.
2. Split the buffer on `\n`; every piece except the last is a complete line. Keep the last piece as the new buffer.
3. Use `flush` for the leftover line when the input ends, and pass an error to the callback for bad JSON.

#### Solution

A naive `chunk.split('\n')` breaks when a line is split. Keep the unfinished tail between calls; only parse complete lines; flush the tail at the end. Each line is handled once, so it is linear in the input size.

```ts
import assert from 'node:assert/strict';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function ndjson(): Transform {
  let buffer = '';
  const parse = (line: string, push: (v: unknown) => void) => {
    if (line.trim()) push(JSON.parse(line));
  };
  return new Transform({
    readableObjectMode: true,
    transform(chunk: Buffer | string, _enc, cb) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      try {
        for (const line of lines) parse(line, (v) => this.push(v));
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb) {
      try {
        parse(buffer, (v) => this.push(v));
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}

async function collect(chunks: string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  await pipeline(
    Readable.from(chunks),
    ndjson(),
    new Writable({
      objectMode: true,
      write(v, _e, cb) {
        out.push(v);
        cb();
      },
    }),
  );
  return out;
}

assert.deepEqual(await collect(['{"a":1}\n{"b"', ':2}\n\n{"c":3}']), [{ a: 1 }, { b: 2 }, { c: 3 }]);
assert.deepEqual(await collect(['{"t":"x', 'y"}\n']), [{ t: 'xy' }]);
assert.deepEqual(await collect(['', '\n\n']), []);
await assert.rejects(collect(['{"ok":true}\n{bad json}\n']), SyntaxError);
console.log('ndjson ok');
```

Complexity: O(n) time over the total input, and memory bounded by the longest line.

#### Follow-ups

- **What about multi-byte characters split across byte chunks?** Decode with a `TextDecoder` in streaming mode (`decode(chunk, { stream: true })`) or `setEncoding('utf8')` on the source; `chunk.toString()` on a raw `Buffer` can corrupt a split character.
- **How do you protect against a never-ending line?** Cap the buffer length and fail the stream when it is exceeded.

### Validation middleware with zod and problem details {medium core}

Write `validateBody(schema)`, an Express middleware factory that parses `req.body` with a zod schema. On success it replaces `req.body` with the parsed (defaulted, typed) data and calls `next()`. On failure it responds `422` with `application/problem+json` and a list of `{ path, message }` errors. Show it working on a `POST /v1/approvals` route.

#### Hints

1. The factory returns `(req, res, next) => { ... }`.
2. Use `schema.safeParse(req.body)` so you never throw for bad input.
3. Map `error.issues` to `{ path: issue.path.join('.'), message: issue.message }`.

#### Solution

The middleware is generic over the schema, so the handler sees clean data. Responding in the middleware keeps every route's error format identical.

```ts
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';

function validateBody(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (result.success) {
      req.body = result.data;
      return next();
    }
    res
      .status(422)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: 'Invalid request body',
        status: 422,
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
  };
}

const Approval = z.object({
  runId: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  comment: z.string().max(500).optional(),
});

const app = express();
app.use(express.json());
app.post('/v1/approvals', validateBody(Approval), (req, res) => {
  const body = req.body as z.infer<typeof Approval>;
  res.status(201).json({ ...body, recordedBy: 'u1' });
});

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/approvals`;
const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const ok = await post({ runId: 'r1', decision: 'approve' });
assert.equal(ok.status, 201);
assert.equal(((await ok.json()) as { decision: string }).decision, 'approve');

const bad = await post({ runId: 'r1', decision: 'maybe' });
assert.equal(bad.status, 422);
const problem = (await bad.json()) as { errors: { path: string }[] };
assert.deepEqual(problem.errors.map((e) => e.path), ['decision']);

server.close();
console.log('validateBody ok');
```

Complexity: linear in the size of the body for parsing.

#### Follow-ups

- **How would you validate query strings and params?** The same factory for `req.query` and `req.params`, with `z.coerce.number()` for numeric strings. In Express 5 `req.query` is read-only, so store the parsed result in `res.locals` instead of overwriting it.
- **How do you share the schema with the front end?** Put schemas in a shared package (or generate OpenAPI from them), so the client's types and the server's validation come from one source.

### Graceful shutdown helper {medium}

Write `gracefulShutdown(server, { graceMs, onClose })` returning a function that, when called: stops accepting connections, closes idle keep-alive sockets, waits for in-flight requests, runs the async `onClose` hooks (closing pools, flushing logs), and resolves. If requests are still running after `graceMs`, it force-closes them. Calling it twice must not run the hooks twice.

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
  const server = createServer((_req, res) => setTimeout(() => res.end('ok'), handlerMs));
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

### Request-scoped context for logs {medium}

Build a tiny `withRequestContext(requestId, fn)` and a `logger.info(message, fields)` that automatically includes the request id of whichever request is running, even across `await`s and when requests interleave. Outside any request, the log line has no request id.

#### Hints

1. `AsyncLocalStorage` keeps a value per asynchronous call chain.
2. `storage.run(value, fn)` sets it for `fn` and everything it awaits.
3. `storage.getStore()` returns `undefined` outside a `run`.

#### Solution

The store follows the async chain, so concurrent requests never see each other's ids, and no function needs an extra parameter.

```ts
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ requestId: string }>();
const sink: Record<string, unknown>[] = [];

const logger = {
  info(message: string, fields: Record<string, unknown> = {}) {
    sink.push({ severity: 'INFO', message, ...storage.getStore(), ...fields });
  },
};

function withRequestContext<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ requestId }, fn);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function handle(step: string, delay: number) {
  await sleep(delay);
  logger.info('step done', { step });
}

await Promise.all([withRequestContext('a', () => handle('one', 15)), withRequestContext('b', () => handle('two', 5))]);
logger.info('background tick');

assert.deepEqual(sink, [
  { severity: 'INFO', message: 'step done', requestId: 'b', step: 'two' },
  { severity: 'INFO', message: 'step done', requestId: 'a', step: 'one' },
  { severity: 'INFO', message: 'background tick' },
]);
console.log('context ok');
```

Complexity: O(1) per log call.

#### Follow-ups

- **How does this connect to tracing?** OpenTelemetry's context manager in Node is built on `AsyncLocalStorage`; put the trace id in the store (or read it from the active span) and add it to logs for correlation.
- **Any cost?** A small overhead per async operation; acceptable for request context, but do not store large objects in it.

### Relay an upstream event stream and cancel it on disconnect {hard}

Write a Node `http` endpoint `GET /relay` that opens a streaming request to an upstream server, sets SSE headers, and pipes the upstream body to the client with backpressure. When the client disconnects early, abort the upstream request so it stops producing. Prove both: a full relay delivers every event, and an early disconnect aborts the upstream.

#### Hints

1. `fetch(upstreamUrl, { signal })` gives a web `ReadableStream` in `response.body`; `Readable.fromWeb` turns it into a Node stream.
2. `pipeline(source, res, { signal })` handles backpressure and errors.
3. Listen to `res.on('close')`: if `res.writableEnded` is false, the client left early, so call `controller.abort()`.

#### Solution

The relay owns one `AbortController` per client. Piping through `pipeline` means a slow client slows down the reads from the upstream rather than buffering in memory. When the client goes away, `close` fires before the response ended, and aborting the controller tears down the upstream fetch, which the upstream sees as its own `close` event.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Upstream: emits one SSE event every 10 ms, up to `count`, and records whether its client went away.
let upstreamAborted = false;
const upstream = createServer((req, res) => {
  const count = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('count'));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  let i = 0;
  const timer = setInterval(() => {
    res.write(`data: token ${i}\n\n`);
    if (++i === count) {
      clearInterval(timer);
      res.end();
    }
  }, 10);
  res.on('close', () => {
    clearInterval(timer);
    if (!res.writableEnded) upstreamAborted = true;
  });
});
await new Promise<void>((r) => upstream.listen(0, r));
const upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

const relay = createServer(async (req, res) => {
  const count = new URL(req.url ?? '/', 'http://x').searchParams.get('count') ?? '3';
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const up = await fetch(`${upstreamUrl}/?count=${count}`, { signal: controller.signal });
    if (!up.ok || !up.body) throw new Error(`upstream ${up.status}`);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
    await pipeline(Readable.fromWeb(up.body as import('node:stream/web').ReadableStream<Uint8Array>), res, { signal: controller.signal });
  } catch {
    if (!res.headersSent) res.writeHead(502).end();
    else res.destroy();
  }
});
await new Promise<void>((r) => relay.listen(0, r));
const relayUrl = `http://127.0.0.1:${(relay.address() as AddressInfo).port}/relay`;

// 1. Full relay: every event arrives.
const full = await (await fetch(`${relayUrl}?count=3`)).text();
assert.equal(full, 'data: token 0\n\ndata: token 1\n\ndata: token 2\n\n');
assert.equal(upstreamAborted, false);

// 2. The client stops after the first chunk: the upstream must be aborted.
const client = new AbortController();
const res = await fetch(`${relayUrl}?count=1000`, { signal: client.signal });
const reader = res.body!.getReader();
await reader.read();
client.abort();
await new Promise((r) => setTimeout(r, 100));
assert.equal(upstreamAborted, true);

relay.close();
upstream.close();
console.log('relay ok');
```

Complexity: O(n) in bytes relayed, O(1) extra memory per connection thanks to backpressure.

#### Follow-ups

- **How do you keep idle proxies from closing the stream?** Write a comment line (`: ping\n\n`) every 15 seconds or so while waiting for the upstream.
- **How do you record token usage if the client leaves?** Count events as they pass through and log usage in the `close` handler, whichever way the stream ended.
- **What about many concurrent streams per instance?** Each stream is a socket and some buffers; set Cloud Run concurrency and memory accordingly, and watch event loop delay.
