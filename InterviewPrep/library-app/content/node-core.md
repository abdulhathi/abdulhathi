---
title: Node.js runtime, event loop and async
goal: Explain how Node.js runs your code on one thread, predict the event loop's order, keep it from blocking, and write correct async code with modules, npm, promises, events and cancellation.
minutes: 60
---

Every Node.js interview starts here. The first questions are almost always about the **event loop**: what runs where, in what order, and what blocks it. Then come **modules and npm** (ESM vs CommonJS, semver, lockfiles), **async patterns** (callbacks, promises, `async`/`await`, running work in parallel, unhandled rejections), **EventEmitter**, and **cancellation with `AbortSignal`**. A senior answer explains the mechanism and then the consequence for a real service: why one blocked callback hurts every request, or why an unawaited promise can crash the process.

Every `ts` block in this chapter runs on Node 25 with type stripping. The rest of the Node.js stack builds on this chapter: [Buffers, streams and files](#/node-streams), [HTTP APIs](#/node-apis) and [Node.js in production](#/node-production). For the async coding drills (debounce, promise pools, retries), see [Async JavaScript problems](#/code-async).

## What Node.js is

Node.js is a **JavaScript runtime** for servers and tools. Three parts matter:

- **V8**, Google's JavaScript engine (the same one Chrome uses), compiles and runs your JavaScript and manages the heap.
- **libuv**, a C library, provides the **event loop**, non-blocking I/O on every operating system, and a small **thread pool** for work the OS cannot do asynchronously.
- The **core modules** (`node:fs`, `node:http`, `node:stream`, `node:crypto`, `node:events`, `node:worker_threads`…), plus web-standard globals such as `fetch`, `AbortController`, `URL`, `TextEncoder`, `structuredClone` and a `WebSocket` client.

Your JavaScript runs on **one main thread**. Node is fast for servers not because that thread is fast, but because it never waits: a database query or a socket read is handed to the operating system, and your callback runs when the result is ready. Meanwhile the thread serves other requests. That is why Node suits I/O-heavy work (APIs, gateways, streaming, WebSockets) and suits CPU-heavy work badly unless that work moves off the main thread.

```text
 your JS (one thread) ──► V8 heap and call stack
          │
          ▼
       libuv event loop ──► OS non-blocking I/O (epoll, kqueue, IOCP): sockets, pipes, timers
          │
          └──► libuv thread pool (4 threads by default): most fs calls, dns.lookup, crypto.scrypt/pbkdf2, zlib
```

## The event loop in one picture

libuv runs a loop around your code. Each turn goes through phases, and each phase has a queue of callbacks:

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
After EVERY callback: drain the process.nextTick queue, then the promise microtask queue.
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

A subtle point that impresses interviewers: **at the top level of an ES module, already-queued promise callbacks run before `nextTick` callbacks.** Module evaluation itself runs as part of a promise job, so Node finishes the current microtask queue before it reaches the nextTick queue. In CommonJS the classic order holds. The same five lines printed this on Node 25:

```text
ESM (.ts / .mjs, top level):  [ 'sync', 'promise', 'microtask', 'nextTick' ]
CommonJS (.cjs, top level):   [ 'sync', 'nextTick', 'promise', 'microtask' ]
```

| API | When it runs | Use it for |
|---|---|---|
| `process.nextTick(fn)` | Before promise microtasks, right after the current operation | Rare: deferring an event so a caller can attach listeners first. Recursion starves the loop |
| `queueMicrotask(fn)` / `Promise.resolve().then(fn)` | After the current callback, before any I/O | Small follow-up work; the web-standard choice |
| `setImmediate(fn)` | Check phase of this or the next loop turn | Yielding to I/O between batches of CPU work |
| `setTimeout(fn, ms)` | Timers phase, after at least `ms` (minimum 1 ms) | Delays and timeouts. Not exact: a busy loop makes timers late |

### What actually uses threads

Network I/O does **not** use a thread per request: libuv uses the operating system's non-blocking mechanisms (epoll on Linux, kqueue on macOS, IOCP on Windows). The **libuv thread pool** (default **4** threads, set with `UV_THREADPOOL_SIZE` before the pool is first used, maximum 1024) handles work the OS cannot do asynchronously: most `fs` calls, `dns.lookup`, the async `crypto` functions such as `pbkdf2` and `scrypt`, and `zlib`. If every request hashes a password with `scrypt`, four of them run at once and the rest queue, even though the event loop itself looks idle.

## Blocking the loop, and how to prove it

Anything synchronous and slow stops **every** request on that process: a huge `JSON.parse`, `crypto.pbkdf2Sync`, a regular expression that backtracks catastrophically on user input (ReDoS), sorting a million records, or a tight loop. Timers fire late, sockets are not read, and health checks time out.

```ts
import assert from 'node:assert/strict';
import { monitorEventLoopDelay } from 'node:perf_hooks';

// A 10 ms timer cannot fire while the thread is busy for 60 ms.
const started = performance.now();
const fired = new Promise<number>((resolve) => setTimeout(() => resolve(performance.now() - started), 10));
const until = performance.now() + 60;
while (performance.now() < until) {
  /* simulate a synchronous JSON.parse of a huge payload */
}
const lateness = await fired;
assert.ok(lateness >= 60, `timer fired after ${lateness} ms`);

// The same blocking shows up as event loop delay, the metric to alert on in production.
const histogram = monitorEventLoopDelay({ resolution: 10 });
histogram.enable();
await new Promise((r) => setTimeout(r, 30));
const busyUntil = performance.now() + 80;
while (performance.now() < busyUntil) {
  /* blocked again */
}
await new Promise((r) => setTimeout(r, 30));
histogram.disable();
const maxDelayMs = histogram.max / 1e6; // the histogram records nanoseconds
assert.ok(maxDelayMs >= 50, `max event loop delay ${maxDelayMs} ms`);
console.log(`timer late by ${Math.round(lateness)} ms; max loop delay ${Math.round(maxDelayMs)} ms`);
```

How to find it in production:

- **Event loop delay** as a metric: `perf_hooks.monitorEventLoopDelay()` gives a histogram (p50, p99, max). Alert when p99 climbs.
- **CPU profiles**: run with `--cpu-prof`, or attach Chrome DevTools with `--inspect`, and look for one wide synchronous frame.
- **Flame graphs** under load locally (for example `0x` with `autocannon` generating traffic).

Fixes, in order of preference: do less (stream instead of parsing everything, paginate), use the async API (`crypto.scrypt` instead of `scryptSync`), chunk the work (`setImmediate` between batches), move it to a **worker thread** (see [Buffers, streams and files](#/node-streams)), or move it to a separate service or queue worker.

## Modules: ESM and CommonJS

Node has two module systems. **ES modules** (ESM) use `import`/`export`, load asynchronously, allow top-level `await`, and are the JavaScript standard. **CommonJS** (CJS) uses `require()` and `module.exports` and loads synchronously. New code should be ESM.

| File | Treated as |
|---|---|
| `.mjs`, `.mts` | Always an ES module |
| `.cjs`, `.cts` | Always CommonJS |
| `.js`, `.ts` | Whatever the `"type"` field of the nearest `package.json` says: `"module"` or `"commonjs"` |
| `.js`, `.ts` with no `"type"` | CommonJS, unless the file uses `import`/`export`, in which case Node re-parses it as ESM and warns. Set `"type": "module"` |

Facts worth knowing:

- In ESM there is no `require`, `__dirname` or `__filename`. Use `import.meta.dirname`, `import.meta.filename`, `import.meta.url`, and `createRequire(import.meta.url)` when you must load a CommonJS-only file.
- ESM can `import` CommonJS. Since **Node 22.12 (and 20.19)**, CommonJS can also `require()` an ES module that has no top-level `await`, which removed most of the interop pain.
- Use the `node:` prefix for core modules (`import { readFile } from 'node:fs/promises'`): it is unambiguous and cannot be shadowed by an npm package.
- A package's `"exports"` field defines its public entry points (and separate ESM and CJS builds); files not listed cannot be imported.

```ts
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename } from 'node:path';

// This file is an ES module: no require or __dirname, but import.meta has the equivalents.
assert.equal(typeof require, 'undefined');
assert.ok(basename(import.meta.filename).endsWith('.ts'));
assert.ok(import.meta.url.startsWith('file://'));

// createRequire gives a CommonJS require when you need one.
const requireCjs = createRequire(import.meta.url);
const os = requireCjs('node:os') as typeof import('node:os');
assert.ok(os.cpus().length >= 1);
console.log('modules ok');
```

## npm: dependencies, semver and the lockfile

`package.json` declares the project: `name`, `version`, `"type"`, `scripts`, `engines` (the Node versions you support), and three kinds of dependency:

| Field | Meaning | Example |
|---|---|---|
| `dependencies` | Needed at run time | `express`, `zod`, `pg` |
| `devDependencies` | Only for building and testing; skipped with `npm ci --omit=dev` | `typescript`, `vitest`, `@types/node` |
| `peerDependencies` | "Your app must provide this, at a compatible version" | A React component library declaring `react` |

**Semantic versioning**: `MAJOR.MINOR.PATCH`. Patch fixes bugs, minor adds features without breaking anything, major may break. The prefix in `package.json` is a range:

| Range | Means | Note |
|---|---|---|
| `1.2.3` | Exactly this version | You control every upgrade by hand |
| `~1.2.3` | `>=1.2.3 <1.3.0` | Patches only |
| `^1.2.3` | `>=1.2.3 <2.0.0` | What `npm install` writes by default |
| `^0.2.3` | `>=0.2.3 <0.3.0` | Below 1.0.0 a minor bump may break, so caret allows patches only |
| `^0.0.3` | `>=0.0.3 <0.0.4` | Exactly this patch |

Versions are compared part by part as numbers: `1.10.0` is newer than `1.9.0`, although as strings `'1.10.0' < '1.9.0'`.

**The lockfile** (`package-lock.json`) records the exact version, download URL and integrity hash of every package in the tree, so every install gets the same code. Commit it.

| | `npm install` | `npm ci` |
|---|---|---|
| Reads | `package.json`, using the lockfile as a guide | The lockfile only |
| Changes the lockfile? | It may | Never; fails if it disagrees with `package.json` |
| `node_modules` | Updates what is there | Deletes it and installs from scratch |
| Use it | While developing, to add or change packages | In CI, Docker builds and fresh clones |

```bash
npm install zod            # add a dependency (writes ^x.y.z)
npm install -D typescript  # add a dev dependency
npm ci --omit=dev          # reproducible production install
npm outdated               # what has newer versions; "Wanted" = newest your range allows
npm audit                  # known vulnerabilities in the installed tree
npm run test               # run a script from package.json
npx tsc --noEmit           # run a package's binary from node_modules/.bin
```

Workspaces (`"workspaces": ["packages/*"]`) let one repository hold several packages that depend on each other, with one lockfile. Supply-chain security matters here too: lockfiles, `npm ci`, reviewing new dependencies, and automated update tools; see [Node.js in production](#/node-production).

## Async: callbacks, promises and async/await

Node's original style is the **error-first callback**: the last argument is a function called as `callback(err, result)`. It works, but nested callbacks get hard to read and errors are easy to drop. **Promises** represent a future value and chain with `.then`/`.catch`; **`async`/`await`** is syntax over promises that reads like synchronous code. Modern Node APIs offer promise versions (`node:fs/promises`, `node:timers/promises`, `node:stream/promises`), and `util.promisify` converts a callback API.

The most common async bug in real code is **accidental sequencing**: awaiting inside a loop when the operations are independent.

```ts
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

// Count how many calls are in flight at once.
let inFlight = 0;
let peak = 0;
async function fetchUser(id: number): Promise<string> {
  inFlight++;
  peak = Math.max(peak, inFlight);
  await sleep(10);
  inFlight--;
  return `user-${id}`;
}

// Sequential: each await waits for the previous call. Use it only when calls depend on each other.
peak = 0;
const one: string[] = [];
for (const id of [1, 2, 3]) one.push(await fetchUser(id));
assert.equal(peak, 1);

// Parallel: start them all, then wait for all.
peak = 0;
const all = await Promise.all([1, 2, 3].map(fetchUser));
assert.equal(peak, 3);
assert.deepEqual(all, one);

// allSettled never rejects: one failure does not hide the other results.
const settled = await Promise.allSettled([fetchUser(4), Promise.reject(new Error('down'))]);
assert.deepEqual(settled.map((r) => r.status), ['fulfilled', 'rejected']);

// promisify turns an error-first callback API into a promise API.
function legacyAdd(a: number, b: number, cb: (err: Error | null, sum?: number) => void) {
  setImmediate(() => (Number.isFinite(a + b) ? cb(null, a + b) : cb(new Error('not a number'))));
}
const add = promisify(legacyAdd);
assert.equal(await add(2, 3), 5);
await assert.rejects(add(1, Number.NaN), /not a number/);
console.log('async ok');
```

| Combinator | Resolves when | Rejects when | Use it for |
|---|---|---|---|
| `Promise.all` | All fulfil (results in input order) | The first one rejects (others keep running) | Independent calls that must all succeed |
| `Promise.allSettled` | All settle; never rejects | Never | Fan-out where partial results are useful |
| `Promise.race` | The first one settles | The first one settles with a rejection | A timeout race (prefer `AbortSignal.timeout`) |
| `Promise.any` | The first one fulfils | All reject (`AggregateError`) | Hedged requests to several replicas |

Unbounded `Promise.all` over thousands of items can overwhelm a database or an API: limit concurrency (a promise pool) instead. The [Async JavaScript problems](#/code-async) chapter builds one.

### Errors that nobody handles

A promise that rejects with nobody awaiting it raises `unhandledRejection` on `process`; an exception thrown in a timer callback raises `uncaughtException`. Since **Node 15** an unhandled rejection crashes the process by default, which is the right behaviour: after an unexpected error you no longer know the process's state. Log it, exit with a non-zero code, and let the supervisor (Kubernetes, Cloud Run, Docker, systemd) start a clean process. Do not add a handler that logs and carries on.

```ts
import assert from 'node:assert/strict';

// With a listener registered, Node reports the rejection to it instead of crashing.
const seen: string[] = [];
const onUnhandled = (reason: unknown) => seen.push(String(reason));
process.on('unhandledRejection', onUnhandled);

void Promise.reject(new Error('nobody awaited me')); // the classic bug: a forgotten await or .catch
await new Promise((r) => setTimeout(r, 10));

process.off('unhandledRejection', onUnhandled);
assert.deepEqual(seen, ['Error: nobody awaited me']);
console.log('unhandled rejection observed:', seen[0]);
```

## EventEmitter

`EventEmitter` (from `node:events`) is the observer pattern behind streams, servers and sockets: `on(name, fn)` subscribes, `emit(name, ...args)` calls the listeners synchronously in order, `once` subscribes for one call, `off` unsubscribes.

- The **`'error'` event is special**: emitting it with no listener throws. Always handle `'error'` on streams, sockets and anything else that can fail.
- **Listener leaks**: adding a listener per request without removing it grows memory forever. Node warns (`MaxListenersExceededWarning`) after 10 listeners for one event, as a hint, not a limit.
- `events.once(emitter, name, { signal })` turns an event into a promise (it rejects if `'error'` fires first), and `events.on(emitter, name)` into an async iterator.
- `EventTarget` is the web-standard equivalent; `AbortSignal` is one.

```ts
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';

const jobs = new EventEmitter();
const log: string[] = [];
jobs.on('done', (id: string) => log.push(`done ${id}`));
jobs.once('done', () => log.push('first only'));
jobs.emit('done', 'a');
jobs.emit('done', 'b');
assert.deepEqual(log, ['done a', 'first only', 'done b']);

// 'error' with no listener throws.
assert.throws(() => jobs.emit('error', new Error('boom')), /boom/);

// events.once: an event as a promise; it rejects if 'error' fires first, and cleans up its listeners.
setTimeout(() => jobs.emit('ready', 42), 5);
const [value] = await once(jobs, 'ready');
assert.equal(value, 42);
setTimeout(() => jobs.emit('error', new Error('failed to start')), 5);
await assert.rejects(once(jobs, 'ready'), /failed to start/);
assert.equal(jobs.listenerCount('ready'), 0);
console.log('events ok');
```

## Cancellation with AbortSignal

`AbortController` and `AbortSignal` are the standard way to cancel async work in Node. `fetch`, `stream.pipeline`, `timers/promises`, `events.once`, `child_process` and most libraries accept a `signal`. `AbortSignal.timeout(ms)` gives a deadline, and `AbortSignal.any([a, b])` aborts when either does. Pass the signal down every layer, so cancelling a request cancels its database query and upstream calls too. Deadlines for outbound HTTP calls are covered in [Node.js in production](#/node-production).

```ts
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';

// A deadline: the sleep is cancelled after 20 ms. The rejection is an AbortError whose cause says why.
await assert.rejects(sleep(1_000, undefined, { signal: AbortSignal.timeout(20) }), (err: Error) => {
  assert.equal(err.name, 'AbortError');
  assert.equal((err.cause as Error).name, 'TimeoutError');
  return true;
});

// Whichever comes first: the caller gives up, or the deadline passes.
const caller = new AbortController();
const signal = AbortSignal.any([caller.signal, AbortSignal.timeout(5_000)]);
setTimeout(() => caller.abort(new Error('user pressed Stop')), 10);
await assert.rejects(sleep(1_000, undefined, { signal }), (err: Error) => (err.cause as Error).message === 'user pressed Stop');
console.log('cancellation ok');
```

## Interview questions

### What is Node.js, and why can one thread serve thousands of connections? {core}

Node.js is a JavaScript runtime built on V8, which runs the JavaScript, and libuv, which provides the event loop and non-blocking I/O. My code runs on one main thread, but it never waits for I/O: a socket read or a database call is handed to the operating system (epoll, kqueue, IOCP), and my callback runs when the data is ready. A waiting connection costs a little memory, not a thread, so one process can hold thousands of them.

The trade-off is CPU work: anything synchronous and slow on that thread delays every request, so CPU-heavy work goes to worker threads or another service.

### Explain the Node.js event loop. {core}

libuv runs a loop with phases: timers (`setTimeout`/`setInterval` callbacks that are due), pending callbacks, poll (wait for I/O and run I/O callbacks), check (`setImmediate`), and close callbacks. After every single callback, Node drains the `process.nextTick` queue and then the promise microtask queue before moving on. The loop keeps running while there are pending timers, open handles or requests; when nothing is left, the process exits.

The practical consequence: a callback that runs for 200 ms delays every other callback, timer and request by 200 ms.

### What is the order of `process.nextTick`, promises, `setImmediate` and `setTimeout(fn, 0)`? {core}

Synchronous code first, then microtasks: inside a callback, the `nextTick` queue runs before promise callbacks. Then the loop continues to its phases: `setImmediate` runs in the check phase and `setTimeout` in the timers phase. Inside an I/O callback, `setImmediate` always fires before `setTimeout(fn, 0)`; at the top level of a script their order is not guaranteed.

The senior detail: at the top level of an ES module, already-queued promise callbacks run before `nextTick`, because module evaluation is itself part of a promise job. And recursive `nextTick` can starve the loop, which is why `queueMicrotask` or `setImmediate` are usually better choices.

### What is the libuv thread pool, and when would you change its size? {deep}

It is a pool of worker threads (4 by default, up to 1024 via `UV_THREADPOOL_SIZE`, set before the pool is first used) that runs blocking work behind async APIs: most `fs` operations, `dns.lookup`, `crypto.pbkdf2`/`scrypt`/`randomBytes`, and zlib. Network sockets do not use it. If a service hashes many passwords or reads many files at once, the pool becomes the bottleneck while the event loop looks idle. Raising the size helps up to about the number of cores; beyond that, move the work elsewhere.

### How do you know the event loop is blocked, and how do you fix it? {core}

The symptoms are timers firing late, latency rising for every endpoint at once, and failed health checks while one core sits at 100%. I measure event loop delay with `perf_hooks.monitorEventLoopDelay` as a metric and alert on its p99, then take a CPU profile (`--cpu-prof` or DevTools) to find the wide synchronous frame. Fixes, in order: avoid the work (stream, paginate), use the async API, chunk it with `setImmediate`, or move it to a worker thread or a separate worker service.

Typical culprits: `JSON.parse` or `JSON.stringify` of multi-megabyte payloads, sync crypto, a ReDoS-prone regular expression on user input, or sorting a large array per request.

### When is Node.js a poor fit?

When the work is CPU-bound: video encoding, heavy image processing, large numeric computation or model training. Each of those blocks the one JavaScript thread. Node can still own the API around them, with the heavy part in worker threads, a native module, or a separate service in a language suited to it, behind a queue. Node is a strong fit for I/O-heavy services: APIs, gateways, real-time and streaming servers, BFFs, and tooling.

### What is the difference between `process.nextTick`, `queueMicrotask` and `setImmediate`?

`process.nextTick` runs right after the current operation, before promise callbacks; it is Node-specific and recursive use starves the event loop. `queueMicrotask` queues a promise-style microtask, after the current callback and before any I/O, and is the web-standard choice. `setImmediate` runs in the check phase of the loop, after I/O callbacks, so it lets I/O through. To yield between batches of CPU work, use `setImmediate`; for a tiny follow-up, `queueMicrotask`.

### What is the difference between ES modules and CommonJS, and does it still matter? {core}

ES modules use `import`/`export`, load asynchronously, support top-level `await`, and are the standard; CommonJS uses `require` and `module.exports` and loads synchronously. Node decides per file: `.mjs` is ESM, `.cjs` is CommonJS, and `.js` follows the nearest `package.json`'s `"type"` field. It matters less than it used to: since Node 22.12, `require()` can load ES modules without top-level `await`. In practice I set `"type": "module"`, use `import.meta.dirname` instead of `__dirname`, and check that libraries ship ESM or dual builds.

### What does the `exports` field in `package.json` do? {deep}

It defines a package's public entry points, optionally with conditions such as `"import"` and `"require"` for separate ESM and CommonJS builds, or `"types"` for TypeScript. Anything not listed cannot be imported, so internal files stay private and the package can reorganise them without breaking users. It replaces the older `"main"` field for packages that need more than one entry point.

### Explain semver ranges: what do `^` and `~` mean?

Versions are `MAJOR.MINOR.PATCH`: patch for fixes, minor for compatible features, major for breaking changes. `~1.2.3` accepts patches (`>=1.2.3 <1.3.0`); `^1.2.3`, the npm default, accepts anything below the next major (`>=1.2.3 <2.0.0`). Below 1.0.0 the caret is stricter: `^0.2.3` means `>=0.2.3 <0.3.0`, because a 0.x minor bump may break. Ranges only say what may be installed; the lockfile decides what is installed.

### What is `package-lock.json` for, and what is the difference between `npm install` and `npm ci`? {core}

The lockfile pins the exact version, source URL and integrity hash of every package in the dependency tree, so every developer, CI run and Docker build installs identical code; commit it. `npm install` resolves from `package.json`, may update the lockfile, and is for development. `npm ci` installs exactly what the lockfile says, never changes it, fails if it disagrees with `package.json`, and starts from a clean `node_modules`, so it is the command for CI and Docker builds, usually with `--omit=dev` for production images.

### What is the difference between `dependencies`, `devDependencies` and `peerDependencies`?

`dependencies` are needed at run time and install everywhere. `devDependencies` are for building and testing (TypeScript, test runners, type packages) and are skipped by `npm ci --omit=dev`. `peerDependencies` say "the consuming app must provide this package, at a compatible version": a plugin or a component library declares its host (`react`, `express`) as a peer so the app does not end up with two copies.

### Callbacks, promises or async/await: how have Node's async styles evolved? {core}

Node started with error-first callbacks: `fn(args, (err, result) => …)`. They work but nest badly, and errors are easy to drop. Promises represent a future value, compose with `.then` and combinators like `Promise.all`, and route errors to one `.catch`. `async`/`await` is syntax over promises that reads top to bottom and lets me use `try`/`catch`. Modern Node offers promise APIs (`fs/promises`, `timers/promises`, `stream/promises`), and `util.promisify` wraps older callback APIs.

The bug to watch for with `await` is accidental sequencing: awaiting independent calls one by one in a loop instead of starting them together.

### `Promise.all`, `allSettled`, `race` and `any`: when do you use each? {core}

`Promise.all` waits for all and rejects on the first failure, for independent calls that must all succeed. `allSettled` waits for all and never rejects, for fan-out where partial results are useful. `race` settles with the first to settle, historically used for timeouts, though `AbortSignal.timeout` is better because it also cancels the losing work. `any` resolves with the first success and rejects only if all fail, for hedged requests to replicas.

One caution: `Promise.all` does not cancel the other promises when one rejects; they keep running. Pass an `AbortSignal` if they should stop.

### How do you run many async operations without overwhelming a dependency?

Limit concurrency instead of firing everything at once with an unbounded `Promise.all`. A small promise pool keeps at most N operations in flight and starts the next as one finishes; libraries such as `p-limit` do the same. I pick N from what the dependency tolerates: database pool size, an API's rate limit. For very large batches I stream the input and process it in chunks, so memory stays flat.

### What happens on an unhandled promise rejection, and how should a service handle it? {core}

Since Node 15 the process prints the error and exits with a non-zero code. That is the safe default: an unexpected error may have left a transaction half done or a lock held, so the process state is unknown. The right handling is to log the error at fatal level with context, exit, and let the orchestrator restart a clean instance; with several instances behind a load balancer, users barely notice. The real fix is in the code: await or `.catch` every promise, and lint for floating promises.

Expected failures, such as bad input or a dependency timing out, are a different category: handle them where they happen and map them to responses.

### What is an error-first callback, and how does `util.promisify` work?

An error-first callback is Node's original convention: the callback's first argument is an error or `null`, the rest are results, and it is called exactly once. `util.promisify(fn)` returns a function that calls `fn` with the same arguments plus a callback, and returns a promise that rejects with the error or resolves with the result. Functions can define a custom promisified form with `util.promisify.custom`.

### How does EventEmitter work, and what is special about the `'error'` event? {core}

`EventEmitter` keeps a list of listeners per event name; `emit` calls them synchronously, in registration order, with the given arguments; `once` removes a listener after one call. The `'error'` event is special: if it is emitted with no listener, the emitter throws, which crashes the process if nothing catches it. So every stream, socket or custom emitter that can fail needs an `'error'` listener, or must be used through `pipeline` or `events.once`, which convert errors into rejections.

### What causes a `MaxListenersExceededWarning`, and is it a bug? {deep}

Node warns when more than 10 listeners are added for one event on one emitter. The limit is a leak detector, not a hard cap: the usual cause is adding a listener per request or per retry and never removing it, which grows memory and calls every stale listener on each emit. Fix the leak with `once`, by removing listeners in `finally`, or by using `events.once` with a signal. Raise the limit with `setMaxListeners` only when many listeners are genuinely intended.

### How do you turn an event into a promise or an async iterator? {deep}

`events.once(emitter, 'ready', { signal })` returns a promise for the event's arguments; it rejects if `'error'` is emitted first or the signal aborts, and removes its listeners either way. `events.on(emitter, 'data', { signal })` returns an async iterator, so I can `for await` over events. Both remove the boilerplate of adding and removing listeners by hand and make error handling explicit.

### How do you cancel async work in Node? {core}

With `AbortController` and `AbortSignal`, the same API as in browsers. I create a controller per operation, pass `controller.signal` to everything that supports it (`fetch`, `stream.pipeline`, `timers/promises`, `events.once`, database drivers), and call `abort()` when the user cancels or the request closes. `AbortSignal.timeout(ms)` gives a deadline and `AbortSignal.any` combines the two. Inside my own async functions I check `signal.aborted` or listen for `'abort'` and clean up.

### How do Node.js and browser JavaScript differ?

Both run JavaScript and share web-standard APIs: `fetch`, `URL`, `AbortController`, `TextEncoder`, `structuredClone`, web streams. Node has no DOM or `window`, but it has the file system, network servers, child processes, worker threads, `Buffer`, and `process`, with full OS access subject to the user's permissions. Node's modules come from npm and `node:` core modules, and code runs on a long-lived server process, so memory leaks and blocking matter in ways they rarely do in a page.

**Your angle:** your front-end work (React and TypeScript at Medidata and The Dot Corp) and your Node.js work, such as SAML login with Passport.js at Quantiphi, use the same language on both sides of the wire.

## Coding problems

### Write `promisify` from scratch {easy core}

Write `promisify(fn)` for error-first callback functions: it returns a function that takes the same arguments (without the callback) and returns a promise. It must reject when the callback gets an error, resolve with the result otherwise, keep `this` when called as a method, and settle only once even if a buggy function calls back twice.

Example: `promisify(fs.readFile)('a.txt', 'utf8')` resolves with the file's text.

#### Hints

1. The returned function collects its arguments and calls `fn` with one more argument: a callback you write.
2. Inside that callback, `err` decides between `reject` and `resolve`. A promise already settles only once.
3. Use a regular `function` (not an arrow) for the returned function so it receives the caller's `this`, and call `fn.call(this, …)`.

#### Solution

The promise constructor does most of the work: a promise ignores every resolve or reject after the first, which handles a double callback. A synchronous throw inside `fn` also becomes a rejection, because the executor runs inside the `Promise` constructor.

```ts
import assert from 'node:assert/strict';

type Callback<T> = (err: Error | null | undefined, result?: T) => void;

function promisify<A extends unknown[], T>(fn: (...args: [...A, Callback<T>]) => void) {
  return function (this: unknown, ...args: A): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      fn.call(this, ...args, (err: Error | null | undefined, result?: T) => {
        if (err) reject(err);
        else resolve(result as T);
      });
    });
  };
}

function divide(a: number, b: number, cb: Callback<number>) {
  setImmediate(() => (b === 0 ? cb(new Error('division by zero')) : cb(null, a / b)));
}
const divideAsync = promisify(divide);
assert.equal(await divideAsync(6, 3), 2);
await assert.rejects(divideAsync(1, 0), /division by zero/);

// `this` is preserved when the promisified function is used as a method.
const counter = {
  base: 10,
  addLater(n: number, cb: Callback<number>) {
    setImmediate(() => cb(null, this.base + n));
  },
};
const withMethod = { base: 100, add: promisify(counter.addLater) };
assert.equal(await withMethod.add(5), 105);

// A buggy function that calls back twice still settles once; a synchronous throw becomes a rejection.
const twice = promisify((cb: Callback<string>) => {
  cb(null, 'first');
  cb(new Error('second call ignored'));
});
assert.equal(await twice(), 'first');
const throws = promisify((_cb: Callback<string>) => {
  throw new Error('sync throw');
});
await assert.rejects(throws(), /sync throw/);
console.log('promisify ok');
```

Complexity: O(1) per call.

#### Follow-ups

- **What about callbacks with several results, such as `(err, a, b)`?** Node's `util.promisify` resolves with the first result only, unless the function defines `util.promisify.custom`; you could resolve with an array or object instead.
- **Why is `util.promisify` better in production?** It also honours `util.promisify.custom`, which core functions such as `setTimeout` use to provide a proper promise version.

### `once` with a timeout and a signal {medium core}

Write `waitFor(emitter, event, { timeoutMs, signal })` that resolves with the arguments of the next `event`. It must reject if the emitter emits `'error'` first, if `timeoutMs` passes, or if `signal` aborts, and in every case remove all the listeners and timers it added.

Example: `await waitFor(server, 'listening', { timeoutMs: 1000 })`.

#### Hints

1. Register listeners for `event` and `'error'`, a timer, and an `'abort'` listener on the signal.
2. Write one `cleanup()` that removes all four, and call it before resolving or rejecting.
3. Check `signal.aborted` before you start: an already-aborted signal should reject straight away.

#### Solution

The key is symmetric cleanup: every way out (success, error, timeout, abort) calls the same function, so nothing leaks however the wait ends. That is exactly what `events.once` does internally, plus a timeout.

```ts
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';

function waitFor(
  emitter: EventEmitter,
  event: string,
  { timeoutMs, signal }: { timeoutMs: number; signal?: AbortSignal },
): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onEvent = (...args: unknown[]) => {
      cleanup();
      resolve(args);
    };
    const onError = (err: unknown) => {
      cleanup();
      reject(err);
    };
    const onAbort = () => {
      cleanup();
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${event}`));
    }, timeoutMs);
    function cleanup() {
      clearTimeout(timer);
      emitter.off(event, onEvent);
      emitter.off('error', onError);
      signal?.removeEventListener('abort', onAbort);
    }
    emitter.on(event, onEvent);
    emitter.on('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const listeners = (em: EventEmitter) => em.listenerCount('ready') + em.listenerCount('error');

const em = new EventEmitter();
setTimeout(() => em.emit('ready', 'port', 8080), 5);
assert.deepEqual(await waitFor(em, 'ready', { timeoutMs: 1_000 }), ['port', 8080]);
assert.equal(listeners(em), 0);

setTimeout(() => em.emit('error', new Error('EADDRINUSE')), 5);
await assert.rejects(waitFor(em, 'ready', { timeoutMs: 1_000 }), /EADDRINUSE/);
assert.equal(listeners(em), 0);

await assert.rejects(waitFor(em, 'ready', { timeoutMs: 20 }), /timed out/);
assert.equal(listeners(em), 0);

const controller = new AbortController();
setTimeout(() => controller.abort(new Error('shutting down')), 5);
await assert.rejects(waitFor(em, 'ready', { timeoutMs: 1_000, signal: controller.signal }), /shutting down/);
assert.equal(listeners(em), 0);

await assert.rejects(waitFor(em, 'ready', { timeoutMs: 1_000, signal: AbortSignal.abort(new Error('already')) }), /already/);
console.log('waitFor ok');
```

Complexity: O(1); each wait adds and removes a constant number of listeners.

#### Follow-ups

- **How does this compare with `events.once`?** `events.once(em, 'ready', { signal: AbortSignal.any([signal, AbortSignal.timeout(ms)]) })` gives the same behaviour in one line in modern Node; writing it by hand shows you understand the cleanup.
- **Why `off` instead of `once` for the event listener?** `once` would only clean up the event that fired; the other listeners would still leak.

### Process a large array without blocking the event loop {medium}

You must transform 200,000 records with a synchronous function, inside a server that must stay responsive. Write `processInChunks(items, fn, chunkSize)` that processes the items in chunks and yields to the event loop between chunks, returning all results in order. Prove that a timer set before the work fires before the work finishes.

#### Hints

1. A plain `for` loop over all items never gives the loop a chance to run timers or I/O.
2. Process `chunkSize` items, then `await` something that resolves in a later loop phase.
3. `setImmediate` (from `node:timers/promises`) yields after pending I/O; a resolved promise does not, because microtasks run before the loop moves on.

#### Solution

Awaiting `setImmediate` between chunks hands control back to the event loop, so timers and I/O callbacks run between chunks. `await Promise.resolve()` would not help: it only queues a microtask, which runs before the loop gets to timers.

```ts
import assert from 'node:assert/strict';
import { setImmediate as yieldToLoop } from 'node:timers/promises';

async function processInChunks<T, R>(items: readonly T[], fn: (item: T) => R, chunkSize = 1_000): Promise<R[]> {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new RangeError('chunkSize must be a positive integer');
  const out: R[] = [];
  for (let start = 0; start < items.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, items.length);
    for (let i = start; i < end; i++) out.push(fn(items[i]));
    if (end < items.length) await yieldToLoop(); // let timers and I/O run before the next chunk
  }
  return out;
}

const records = Array.from({ length: 200_000 }, (_, i) => ({ id: i, amount: i % 97 }));
const heavy = (r: { id: number; amount: number }) => {
  let x = r.amount;
  for (let k = 0; k < 50; k++) x = (x * 31 + k) % 1_000_003;
  return x;
};

const events: string[] = [];
setTimeout(() => events.push('timer fired'), 1);
const results = await processInChunks(records, heavy, 2_000);
events.push('work finished');

assert.equal(results.length, records.length);
assert.equal(results[123], heavy(records[123]));
assert.deepEqual(events, ['timer fired', 'work finished']);
assert.deepEqual(await processInChunks([], heavy), []);
await assert.rejects(processInChunks(records, heavy, 0), RangeError);
console.log('chunked processing ok:', events);
```

Complexity: O(n) work in total; the extra cost is one loop turn per chunk.

#### Follow-ups

- **How do you choose the chunk size?** Aim for each chunk to take a few milliseconds: measure, and keep event loop delay low.
- **When is chunking not enough?** When the total CPU time is large, chunking only spreads the pain and slows the work down. Move it to a worker thread or a queue worker.

### Check whether a version satisfies a caret or tilde range {medium}

Write `satisfies(version, range)` for plain `MAJOR.MINOR.PATCH` versions and the ranges npm uses most: an exact version (`1.2.3`), tilde (`~1.2.3`) and caret (`^1.2.3`), including caret's rules below 1.0.0. Ignore pre-release tags. Invalid input should throw.

Examples: `satisfies('1.9.0', '^1.2.3')` is `true`; `satisfies('2.0.0', '^1.2.3')` is `false`; `satisfies('0.3.0', '^0.2.3')` is `false`.

#### Hints

1. Parse each version into three numbers and compare numerically, part by part: never compare version strings as text.
2. Every range is a lower bound (the version itself) and an exclusive upper bound.
3. Tilde bumps the minor. Caret bumps the first non-zero part: `^1.2.3` → `<2.0.0`, `^0.2.3` → `<0.3.0`, `^0.0.3` → `<0.0.4`.

#### Solution

Turn the range into `[lower, upper)` and compare tuples. Caret's rule ("allow changes that do not modify the left-most non-zero part") becomes: bump the first non-zero component, or the patch when all are zero.

```ts
import assert from 'node:assert/strict';

type V = [number, number, number];

function parse(v: string): V {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) throw new Error(`invalid version: ${v}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compare(a: V, b: V): number {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  const op = range.startsWith('^') || range.startsWith('~') ? range[0] : '';
  const lower = parse(range.slice(op.length));
  if (!op) return compare(v, lower) === 0;
  const [major, minor, patch] = lower;
  let upper: V;
  if (op === '~') upper = [major, minor + 1, 0];
  else if (major > 0) upper = [major + 1, 0, 0];
  else if (minor > 0) upper = [0, minor + 1, 0];
  else upper = [0, 0, patch + 1];
  return compare(v, lower) >= 0 && compare(v, upper) < 0;
}

assert.equal(satisfies('1.2.3', '1.2.3'), true);
assert.equal(satisfies('1.2.4', '1.2.3'), false);
assert.equal(satisfies('1.2.9', '~1.2.3'), true);
assert.equal(satisfies('1.3.0', '~1.2.3'), false);
assert.equal(satisfies('1.10.0', '^1.2.3'), true); // numeric, not string, comparison
assert.equal(satisfies('2.0.0', '^1.2.3'), false);
assert.equal(satisfies('1.2.2', '^1.2.3'), false);
assert.equal(satisfies('0.2.9', '^0.2.3'), true);
assert.equal(satisfies('0.3.0', '^0.2.3'), false);
assert.equal(satisfies('0.0.3', '^0.0.3'), true);
assert.equal(satisfies('0.0.4', '^0.0.3'), false);
assert.throws(() => satisfies('1.2', '^1.0.0'), /invalid version/);
assert.throws(() => satisfies('1.2.3', '>=1.0.0'), /invalid version/);
console.log('semver ok');
```

Complexity: O(1).

#### Follow-ups

- **How do pre-releases work?** `1.3.0-beta.1` sorts before `1.3.0`, and by default a range only matches a pre-release of the same `MAJOR.MINOR.PATCH` as its own lower bound. That is why the real `semver` package is worth using.
- **Why does this matter for production?** Caret ranges let a broken minor release in; the lockfile and `npm ci` are what keep deployments reproducible.
