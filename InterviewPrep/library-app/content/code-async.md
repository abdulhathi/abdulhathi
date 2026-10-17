---
title: Async JavaScript problems
goal: Implement debounce, throttle, promise combinators, concurrency limits, retries, timeouts and stream parsers from scratch in TypeScript, and test them without flaky timers.
minutes: 75
---

Front-end-heavy interviews love asynchronous problems because they reveal whether you really understand promises, the
event loop and cancellation. "Implement debounce", "write `Promise.all`", "limit these 100 requests to 5 at a time" and
"add retries with backoff" come up again and again. In real products they are not trivia: a streaming chat needs
cancellation and parsing of chunked streams, and an orchestration service needs retries, timeouts and rate limits
against external APIs.

Every solution here runs under Node with asserts. Time-based code is tested with **fake timers**
(`mock.timers` from `node:test`, the same idea as `vi.useFakeTimers()` or `jest.useFakeTimers()`) or with an injected
clock, so the tests are instant and never flaky. Say that out loud in the interview: it is a senior signal.

## The async toolkit

### Promise combinators

| Combinator | Settles when | With an empty array | Typical use |
|---|---|---|---|
| `Promise.all` | all fulfil, or the **first rejection** | fulfils with `[]` | independent calls that all must succeed |
| `Promise.allSettled` | every promise settles | fulfils with `[]` | batch jobs where you report each success or failure |
| `Promise.race` | the **first to settle**, either way | stays pending forever | a timeout race (prefer AbortSignal today) |
| `Promise.any` | the **first fulfilment**, or all reject (`AggregateError`) | rejects with `AggregateError` | try several mirrors or regions, take the fastest success |

None of them cancel the losers. If the other work must stop, pass an `AbortSignal` into it.

### Sequential vs parallel

```ts
import assert from 'node:assert/strict';
import { mock } from 'node:test';

mock.timers.enable({ apis: ['setTimeout', 'Date'] });
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const call = async (name: string, ms: number) => {
  await wait(ms);
  return name;
};
const flush = () => new Promise<void>((resolve) => setImmediate(resolve)); // setImmediate is not faked

// Sequential: the second call starts only after the first finishes. Total = 100 + 100.
const sequential = (async () => [await call('a', 100), await call('b', 100)])();
mock.timers.tick(100);
await flush();
mock.timers.tick(100);
assert.deepEqual(await sequential, ['a', 'b']);
assert.equal(Date.now(), 200);

// Parallel: start both, then await together. Total = max(100, 100).
const start = Date.now();
const parallel = Promise.all([call('a', 100), call('b', 100)]);
mock.timers.tick(100);
assert.deepEqual(await parallel, ['a', 'b']);
assert.equal(Date.now() - start, 100);
mock.timers.reset();
```

### Cancellation with AbortSignal

`AbortController` is the standard cancellation primitive in browsers and Node: `fetch`, Node streams, timers in
`node:timers/promises` and most modern libraries accept a `signal`. Your own async functions should too: check
`signal.aborted` or call `signal.throwIfAborted()` between steps, and listen for the `abort` event to stop waiting.
`AbortSignal.timeout(ms)` gives a signal that aborts after a delay, and `AbortSignal.any([a, b])` combines signals,
for example the user's Stop button and a timeout.

```ts
import assert from 'node:assert/strict';

const user = new AbortController();
const combined = AbortSignal.any([user.signal, AbortSignal.timeout(60_000)]);
assert.equal(combined.aborted, false);
user.abort();
assert.equal(combined.aborted, true);
assert.equal((combined.reason as DOMException).name, 'AbortError');
assert.throws(() => combined.throwIfAborted(), { name: 'AbortError' });
```

## Interview questions

### How do you cancel an in-flight request in the browser? {core}

With an `AbortController`. I create one per request, pass `controller.signal` to `fetch`, and call `abort()` when the
user presses Stop, types a new search term, or the component unmounts. The `fetch` promise rejects with an
`AbortError`, which I treat as a normal outcome rather than an error to show. For a streaming response, aborting also
closes the body stream, so the server sees the disconnect and can stop generating tokens, which saves real money with
LLM calls.

### Compare `Promise.all`, `allSettled`, `race` and `any`. {core}

`all` waits for everything and fails fast on the first rejection. `allSettled` waits for everything and never rejects,
giving a status per item. `race` settles with whichever settles first, success or failure. `any` takes the first
success and rejects with an `AggregateError` only if all fail. The trap is that none of them cancel the remaining
work. If I fail fast with `all`, I also abort a shared controller so the other requests stop.

### What happens to an unhandled promise rejection? {core}

Since Node 15 the default `--unhandled-rejections` mode is `throw`: Node emits `unhandledRejection`, and if nothing
handles that event, the rejection is raised as an uncaught exception and the process exits. On Cloud Run that means a
replaced instance and failed in-flight requests on it. In the browser the `unhandledrejection` event fires and the
error is logged. So every promise needs an owner: await it, return it, or attach a `catch`. Fire-and-forget work inside
a request handler is the usual culprit; I either await it or put it on a real queue. A global `unhandledRejection`
handler is for logging and a clean shutdown, not for carrying on as if nothing happened.

### Debounce vs throttle: when do you use each? {core}

Debounce waits until calls stop for a quiet period, then runs once with the last arguments: search-as-you-type,
auto-save, resize handling. Throttle runs at most once per interval while calls keep coming: scroll position, drag,
or batching streamed tokens into the UI at a steady rate. In a streaming chat I throttle rendering to an animation
frame or about 50 ms, so thousands of tokens do not cause thousands of renders.

### How do you test code that depends on timers?

Either fake timers (`vi.useFakeTimers()`, `jest.useFakeTimers()`, `mock.timers` in `node:test`) and advance time
explicitly, or inject the clock and the sleep function so tests pass a fake. Injection is cleaner for backend code like
retries and rate limiters, because the test can assert the exact delays without waiting. Fake timers suit UI code
written against `setTimeout`. Either way the test runs in milliseconds and never flakes.

### Why is `await` inside `forEach` a bug?

`forEach` ignores the promise each callback returns, so the loop finishes immediately, nothing waits, and rejections
become unhandled. Use `for...of` with `await` for sequential work, `Promise.all(items.map(...))` for parallel work, or a
concurrency limiter in between.

### What is backpressure in async code? {deep}

Backpressure is the consumer telling the producer to slow down, so memory does not grow without bound. Node streams do
it with `write()` returning false and the `drain` event, `pipeline` handles it for you, and async iterators get it for
free because the producer only runs when the consumer asks for the next item. In a browser, a WebSocket's
`bufferedAmount` shows unsent data piling up. A bounded queue, where `push` waits when it is full, is the
general pattern (see the problem below).

### Why add jitter to retries?

Without jitter, every client that failed at the same moment retries at the same moments too, so the recovering service
gets hit by synchronised waves. Random jitter spreads the retries out. AWS's well-known "Exponential Backoff and
Jitter" analysis compared full, equal and decorrelated jitter: equal jitter came out worst, while full jitter (a random
delay between zero and the exponential cap) and decorrelated jitter were close, full jitter doing less total work and
decorrelated finishing slightly sooner. Full jitter is the simplest of the good ones, so it is what I default to.

## Coding problems

### sleep that can be aborted {easy}

Write `sleep(ms, signal?)` that resolves after `ms` milliseconds, rejects immediately with the signal's reason if the
signal is already aborted, and rejects (and clears its timer) as soon as the signal aborts.

#### Hints

1. Wrap `setTimeout` in a `new Promise`.
2. Check `signal.aborted` first; then listen for `abort` with `{ once: true }`.
3. Clean up both ways: clear the timer on abort, and remove the listener when the timer fires.

#### Solution

The cleanup is what interviewers look for: without it, aborted sleeps leave timers running and listeners attached.

```ts
import assert from 'node:assert/strict';
import { mock } from 'node:test';

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

mock.timers.enable({ apis: ['setTimeout'] });
let done = false;
const p = sleep(100).then(() => (done = true));
mock.timers.tick(99);
await Promise.resolve();
assert.equal(done, false);
mock.timers.tick(1);
await p;
assert.equal(done, true);

const controller = new AbortController();
const aborted = sleep(1_000, controller.signal);
controller.abort();
await assert.rejects(aborted, { name: 'AbortError' });

const already = AbortSignal.abort(new Error('stopped'));
await assert.rejects(sleep(10, already), { message: 'stopped' });
mock.timers.reset();
```

Complexity: O(1).

#### Follow-ups

- **What does Node give you built in?** `import { setTimeout as sleep } from 'node:timers/promises'` accepts
  `{ signal }`.

### Debounce with cancel and flush {medium core}

Implement `debounce(fn, wait)`. The returned function delays calling `fn` until `wait` ms have passed without another
call, then calls it once with the latest arguments. Add `cancel()` (drop the pending call) and `flush()` (run the
pending call now).

#### Hints

1. Keep the timer id and the latest arguments in the closure.
2. Every call clears the old timer and starts a new one.
3. `flush` and `cancel` both clear the timer; only `flush` calls `fn`.

#### Solution

The closure holds `timer` and `lastArgs`. Each call resets the timer. Typing it generically with `A extends unknown[]`
keeps the argument types of the original function.

```ts
import assert from 'node:assert/strict';
import { mock } from 'node:test';

function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: A | undefined;

  const run = () => {
    timer = undefined;
    const args = lastArgs;
    lastArgs = undefined;
    if (args) fn(...args);
  };
  const debounced = (...args: A) => {
    lastArgs = args;
    clearTimeout(timer);
    timer = setTimeout(run, wait);
  };
  debounced.cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    lastArgs = undefined;
  };
  debounced.flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    run();
  };
  return debounced;
}

mock.timers.enable({ apis: ['setTimeout'] });
const calls: string[] = [];
const search = debounce((q: string) => calls.push(q), 300);

search('a');
mock.timers.tick(200);
search('ag');
mock.timers.tick(200);
search('age');
assert.deepEqual(calls, []); // still typing
mock.timers.tick(300);
assert.deepEqual(calls, ['age']); // one call, latest arguments

search('x');
search.cancel();
mock.timers.tick(1_000);
assert.deepEqual(calls, ['age']);

search('flushed');
search.flush();
assert.deepEqual(calls, ['age', 'flushed']);
mock.timers.tick(1_000);
assert.equal(calls.length, 2); // flush did not leave a second call behind
mock.timers.reset();
```

Complexity: O(1) per call.

#### Follow-ups

- **Leading edge?** Add `{ leading: true }`: call immediately when no timer is running, then ignore calls until quiet.
- **Debounce an async search and ignore stale results.** Combine with an `AbortController` per request
  (see "latest wins" below).
- **In React?** Keep the debounced function stable with `useMemo` or a ref, and cancel it in the effect cleanup.

### Throttle with leading and trailing calls {medium core}

Implement `throttle(fn, wait)`: the first call runs immediately; further calls within `wait` ms are collapsed, and the
latest of them runs once at the end of the window (trailing call), which starts a new window.

#### Hints

1. State: whether a window is open (a timer), and the latest pending arguments.
2. No window open: call now and open one. Window open: just remember the arguments.
3. When the window closes: if something is pending, call it and open another window; otherwise close.

#### Solution

```ts
import assert from 'node:assert/strict';
import { mock } from 'node:test';

function throttle<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;

  const openWindow = () => {
    timer = setTimeout(() => {
      if (pending) {
        const args = pending;
        pending = undefined;
        fn(...args);
        openWindow();
      } else {
        timer = undefined;
      }
    }, wait);
  };

  return (...args: A) => {
    if (timer === undefined) {
      fn(...args);
      openWindow();
    } else {
      pending = args;
    }
  };
}

mock.timers.enable({ apis: ['setTimeout'] });
const seen: number[] = [];
const onScroll = throttle((y: number) => seen.push(y), 100);

onScroll(0); // leading: runs now
mock.timers.tick(10);
onScroll(10);
mock.timers.tick(40);
onScroll(50); // replaces 10
assert.deepEqual(seen, [0]);
mock.timers.tick(50); // t = 100: trailing call with the latest value
assert.deepEqual(seen, [0, 50]);
mock.timers.tick(100); // t = 200: nothing pending, window closes
onScroll(300);
assert.deepEqual(seen, [0, 50, 300]); // a new leading call
mock.timers.reset();
```

Complexity: O(1) per call; at most one call per `wait` ms plus the trailing call.

#### Follow-ups

- **Throttle rendering of streamed tokens.** Buffer tokens in a ref and flush them with `requestAnimationFrame` or a
  throttled function, so React renders at most about 60 times a second.
- **Make the trailing call optional.** Add `{ trailing: false }` and skip storing `pending`.

### Implement Promise.all {medium core}

Write `promiseAll(values)` with the same behaviour as `Promise.all`: results in input order regardless of finishing
order, plain values allowed, an empty array fulfils with `[]`, and the first rejection rejects the whole thing.

#### Hints

1. Return a new Promise; keep a results array and a counter of outstanding items.
2. `Promise.resolve(v)` normalises plain values and thenables.
3. Write each result at its index; resolve when the counter hits zero.

#### Solution

```ts
import assert from 'node:assert/strict';
import { mock } from 'node:test';

function promiseAll<T>(values: readonly (T | PromiseLike<T>)[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const results = new Array<T>(values.length);
    let remaining = values.length;
    if (remaining === 0) return resolve(results);
    values.forEach((value, i) => {
      Promise.resolve(value).then((v) => {
        results[i] = v;
        if (--remaining === 0) resolve(results);
      }, reject);
    });
  });
}

mock.timers.enable({ apis: ['setTimeout'] });
const later = <T,>(v: T, ms: number) => new Promise<T>((resolve) => setTimeout(() => resolve(v), ms));

const all = promiseAll([later('slow', 50), 'plain', later('fast', 10)]);
mock.timers.tick(50);
assert.deepEqual(await all, ['slow', 'plain', 'fast']); // input order, not finish order

assert.deepEqual(await promiseAll([]), []);
await assert.rejects(promiseAll([Promise.resolve(1), Promise.reject(new Error('boom'))]), { message: 'boom' });
mock.timers.reset();
```

Complexity: O(n) bookkeeping; time is the slowest promise.

#### Follow-ups

- **Why `Promise.resolve(value)` instead of `value.then`?** It handles plain values and foreign thenables uniformly.
- **Make it accept any iterable,** as the real one does: copy with `Array.from(values)` first.

### Implement allSettled, race and any {medium}

Implement `allSettled`, `race` and `any` with the native semantics: `allSettled` never rejects; `race` settles with the
first settlement; `any` fulfils with the first success or rejects with an `AggregateError` of every reason (immediately
for an empty array).

#### Hints

1. `allSettled` maps each promise to a `{ status, value | reason }` object, then waits for all.
2. `race` attaches the outer `resolve` and `reject` to every input.
3. `any` is the mirror image of `all`: count rejections instead of fulfilments.

#### Solution

```ts
import assert from 'node:assert/strict';

function allSettled<T>(values: readonly (T | PromiseLike<T>)[]): Promise<PromiseSettledResult<T>[]> {
  return Promise.all(
    values.map((v) =>
      Promise.resolve(v).then(
        (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
        (reason: unknown): PromiseSettledResult<T> => ({ status: 'rejected', reason }),
      ),
    ),
  );
}

function race<T>(values: readonly (T | PromiseLike<T>)[]): Promise<T> {
  return new Promise((resolve, reject) => {
    for (const v of values) Promise.resolve(v).then(resolve, reject);
  });
}

function any<T>(values: readonly (T | PromiseLike<T>)[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const errors = new Array<unknown>(values.length);
    let remaining = values.length;
    if (remaining === 0) return reject(new AggregateError([], 'All promises were rejected'));
    values.forEach((v, i) => {
      Promise.resolve(v).then(resolve, (err: unknown) => {
        errors[i] = err;
        if (--remaining === 0) reject(new AggregateError(errors, 'All promises were rejected'));
      });
    });
  });
}

const settled = await allSettled([Promise.resolve(1), Promise.reject(new Error('no'))]);
assert.equal(settled[0].status, 'fulfilled');
assert.equal(settled[1].status === 'rejected' && (settled[1].reason as Error).message, 'no');

const slow = new Promise<string>((resolve) => setTimeout(() => resolve('slow'), 20));
assert.equal(await race([slow, Promise.resolve('fast')]), 'fast');
await assert.rejects(race([slow, Promise.reject(new Error('first'))]), { message: 'first' });

assert.equal(await any([Promise.reject(new Error('a')), Promise.resolve('b')]), 'b');
await assert.rejects(any([Promise.reject(new Error('a')), Promise.reject(new Error('c'))]), (err: unknown) => {
  assert.ok(err instanceof AggregateError);
  assert.deepEqual(err.errors.map((e: Error) => e.message), ['a', 'c']);
  return true;
});
await assert.rejects(any([]), AggregateError);
await slow; // let the timer finish so the process exits cleanly
```

Complexity: O(n).

#### Follow-ups

- **Why does `race([])` never settle?** There is nothing to settle it; that is the specified behaviour, and a good
  reason to prefer `AbortSignal.timeout` for timeouts.

### Run async work with a concurrency limit {medium core}

You must call an enterprise API for 500 records, but it allows only 5 requests at a time. Write
`mapLimit(items, limit, fn)` that runs at most `limit` calls at once, returns results in input order, and rejects if any
call fails.

#### Hints

1. `Promise.all(items.map(fn))` starts all 500 at once; that is the bug to avoid.
2. Start `limit` workers. Each worker loops: take the next index, await the call, store the result.
3. A shared `next` counter is safe because JavaScript runs one callback at a time.

#### Solution

The worker-pool pattern: `limit` async loops pulling from a shared index. Because the event loop is single-threaded,
`next++` cannot race. Results go into their original slot, so order is preserved. A `failed` flag stops the other
workers from starting **new** items after the first error; without it, `Promise.all` rejects but the surviving workers
keep calling the API for the rest of the list.

```ts
import assert from 'node:assert/strict';

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError('limit must be a positive integer');
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        failed = true; // no new items start; calls already in flight finish on their own
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
let active = 0;
let peak = 0;
const fakeApi = async (id: number) => {
  active++;
  peak = Math.max(peak, active);
  for (let i = 0; i < (id % 3) + 1; i++) await tick(); // different durations
  active--;
  return `record-${id}`;
};

const ids = Array.from({ length: 20 }, (_, i) => i);
const out = await mapLimit(ids, 5, fakeApi);
assert.equal(peak, 5);
assert.deepEqual(out, ids.map((i) => `record-${i}`));
assert.deepEqual(await mapLimit([], 3, fakeApi), []);
await assert.rejects(
  mapLimit([1, 2, 3], 2, async (n) => {
    if (n === 2) throw new Error('bad record 2');
    return n;
  }),
  { message: 'bad record 2' },
);
await assert.rejects(mapLimit([1], 0, fakeApi), RangeError);

// After the first failure no new items start.
const started: number[] = [];
await assert.rejects(
  mapLimit(Array.from({ length: 10 }, (_, i) => i), 2, async (n) => {
    started.push(n);
    await tick();
    if (n === 1) throw new Error('bad record 1');
    return n;
  }),
  { message: 'bad record 1' },
);
await tick();
await tick();
assert.deepEqual(started, [0, 1, 2]); // item 2 started before item 1 failed; nothing after that
```

Complexity: O(n) scheduling overhead; wall time is roughly total work divided by `limit`.

#### Follow-ups

- **Cancel the calls already in flight too.** The `failed` flag only stops new work. Share an `AbortController`, abort
  it in the `catch`, and pass its signal into `fn` so in-flight requests stop as well.
- **Collect failures instead of failing fast.** Store `{ ok, value | error }` per item, like `allSettled`.
- **Limit by rate as well as concurrency** (e.g. 10 requests per second): combine with the token bucket below.

### Retry with exponential backoff and full jitter {medium core}

Write `retry(fn, options)` that calls `fn`, and on failure waits and tries again, up to `retries` extra attempts. The
delay after failed attempt n (counting from 0) is a random value between 0 and `min(maxMs, baseMs × 2^n)` (full
jitter). Only retry errors that `shouldRetry` accepts, and stop as soon as a signal aborts, including in the middle of a
wait. Make it testable without real waiting.

#### Hints

1. A loop with try/catch is clearer than recursion.
2. Inject `sleep` and `random` with real defaults, so tests can record delays instantly.
3. Rethrow immediately for a non-retryable error or when attempts run out.

#### Solution

Injecting the side effects (sleep, randomness) is the design point: the test asserts the exact delays without waiting.
The default sleep must honour the signal; otherwise a user who presses Stop waits out the whole backoff first.

```ts
import assert from 'node:assert/strict';

type RetryOptions = {
  retries: number;
  baseMs: number;
  maxMs: number;
  shouldRetry?: (err: unknown) => boolean;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
};

// The abortable sleep from the first problem.
const realSleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });

async function retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const { retries, baseMs, maxMs, shouldRetry = () => true, signal, sleep = realSleep, random = Math.random } = options;
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const cap = Math.min(maxMs, baseMs * 2 ** attempt);
      await sleep(Math.floor(random() * cap), signal);
    }
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}
const retryable = (err: unknown) => err instanceof HttpError && (err.status === 429 || err.status >= 500);

// Fails twice with 503, then succeeds.
const delays: number[] = [];
const fakeSleep = async (ms: number) => void delays.push(ms);
let calls = 0;
const result = await retry(
  async () => {
    calls++;
    if (calls < 3) throw new HttpError(503);
    return 'ok';
  },
  { retries: 5, baseMs: 100, maxMs: 1_000, shouldRetry: retryable, sleep: fakeSleep, random: () => 0.5 },
);
assert.equal(result, 'ok');
assert.equal(calls, 3);
assert.deepEqual(delays, [50, 100]); // half of 100, half of 200

// A 400 is not retried.
calls = 0;
await assert.rejects(
  retry(async () => { calls++; throw new HttpError(400); }, { retries: 5, baseMs: 100, maxMs: 1_000, shouldRetry: retryable, sleep: fakeSleep }),
  { message: 'HTTP 400' },
);
assert.equal(calls, 1);

// Gives up after retries + 1 attempts, rethrowing the last error; the cap limits the delay.
delays.length = 0;
calls = 0;
await assert.rejects(
  retry(async () => { calls++; throw new HttpError(500); }, { retries: 4, baseMs: 100, maxMs: 300, sleep: fakeSleep, random: () => 0.999 }),
  { message: 'HTTP 500' },
);
assert.equal(calls, 5);
assert.deepEqual(delays, [99, 199, 299, 299]);

// Aborting during a long backoff stops at once, with the real (default) sleep.
const controller = new AbortController();
calls = 0;
const pending = retry(async () => { calls++; throw new HttpError(503); }, { retries: 3, baseMs: 60_000, maxMs: 60_000, signal: controller.signal, random: () => 0.99 });
await new Promise<void>((resolve) => setImmediate(resolve)); // the first attempt has failed; now sleeping ~59 s
controller.abort();
await assert.rejects(pending, { name: 'AbortError' });
assert.equal(calls, 1);
```

Complexity: O(retries) attempts; the worst-case total delay is bounded by the sum of the caps.

#### Follow-ups

- **The server sends `Retry-After`.** Prefer it over your computed delay (capped), and say that 429 and 503 commonly
  include it.
- **Is retrying a POST safe?** Only if the operation is idempotent, for example with an idempotency key the server
  deduplicates on. See [API design](#/api-design).
- **Many callers retry at once.** Add a retry budget or a circuit breaker so retries do not amplify an outage
  ([microservices](#/microservices)).

### Add a timeout to any async operation {medium}

Write `withTimeout(task, ms)`, where `task` receives an `AbortSignal`. If the task does not finish in `ms`, abort it
(so it really stops) and reject with a `TimeoutError`. Clear the timer when the task finishes first.

#### Hints

1. Racing against a timer is not enough on its own: the slow task keeps running. Abort it through a signal.
2. Create an `AbortController`, start a timer that aborts it, and pass the signal into the task.
3. Use `finally` to clear the timer.

#### Solution

The task gets the signal and is responsible for honouring it, just like `fetch`. The timer aborts with a
`TimeoutError`, so callers can tell a timeout from a user cancellation.

```ts
import assert from 'node:assert/strict';
import { mock } from 'node:test';

async function withTimeout<T>(task: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException(`Timed out after ${ms} ms`, 'TimeoutError')), ms);
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

mock.timers.enable({ apis: ['setTimeout'] });
// A task that honours its signal, like fetch does.
let stoppedEarly = false;
const slowTask = (signal: AbortSignal) =>
  new Promise<string>((resolve) => {
    const t = setTimeout(() => resolve('late'), 5_000);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      stoppedEarly = true;
    });
  });

const timedOut = withTimeout(slowTask, 100);
mock.timers.tick(100);
await assert.rejects(timedOut, { name: 'TimeoutError' });
assert.equal(stoppedEarly, true);

const quick = withTimeout(async () => 'fast', 100);
assert.equal(await quick, 'fast');
mock.timers.reset();
```

Complexity: O(1).

#### Follow-ups

- **Built-in alternative?** `AbortSignal.timeout(ms)`, combined with the caller's signal through
  `AbortSignal.any([callerSignal, AbortSignal.timeout(ms)])`.
- **Timeouts across services.** Propagate a deadline (the remaining time), not a fresh timeout per hop, as gRPC
  deadlines do ([gRPC](#/grpc)).

### Memoize an async function with in-flight deduplication {medium}

Five components ask for the same run's details at the same moment. Write `memoizeAsync(fn)` so that concurrent calls
with the same key share one in-flight request, later calls get the cached result, and a failure is not cached (the next
call tries again).

#### Hints

1. Cache the **promise**, not the value: that is what deduplicates concurrent callers.
2. Key by a string built from the arguments.
3. On rejection, delete the entry so the error is not cached forever.

#### Solution

Storing the promise immediately means the second caller, arriving before the first request finishes, gets the same
promise. This is exactly what TanStack Query does for identical query keys.

```ts
import assert from 'node:assert/strict';

function memoizeAsync<A extends unknown[], R>(fn: (...args: A) => Promise<R>, key: (...args: A) => string = (...args) => JSON.stringify(args)) {
  const cache = new Map<string, Promise<R>>();
  const memoized = (...args: A): Promise<R> => {
    const k = key(...args);
    const hit = cache.get(k);
    if (hit) return hit;
    const p = fn(...args);
    cache.set(k, p);
    p.catch(() => {
      // Only remove our own entry: after clear(), a newer request may own this key.
      if (cache.get(k) === p) cache.delete(k);
    });
    return p;
  };
  memoized.clear = () => cache.clear();
  return memoized;
}

let requests = 0;
let failNext = false;
const getRun = memoizeAsync(async (id: string) => {
  requests++;
  await new Promise<void>((resolve) => setImmediate(resolve));
  if (failNext) {
    failNext = false;
    throw new Error('503');
  }
  return { id, status: 'running' };
});

const [a, b, c] = await Promise.all([getRun('r1'), getRun('r1'), getRun('r1')]);
assert.equal(requests, 1);
assert.equal(a, b);
assert.equal(b, c);
await getRun('r1');
assert.equal(requests, 1); // cached
await getRun('r2');
assert.equal(requests, 2);

failNext = true;
await assert.rejects(getRun('r3'), { message: '503' });
assert.deepEqual(await getRun('r3'), { id: 'r3', status: 'running' }); // retried, not a cached error
assert.equal(requests, 4);

// A stale failure must not evict a newer entry for the same key.
failNext = true;
const doomed = getRun('r4');
getRun.clear();
const fresh = getRun('r4'); // new request, now owns the key
await assert.rejects(doomed, { message: '503' });
await fresh;
await getRun('r4');
assert.equal(requests, 6); // the fresh result stayed cached
```

Complexity: O(1) per call plus the key cost; memory grows with distinct keys.

#### Follow-ups

- **Expire entries.** Store `{ promise, expiresAt }` and treat old entries as misses, or cap the size with an LRU
  ([practical tasks](#/code-practical-ts)).
- **Why can `JSON.stringify` be a poor key?** Object key order changes the string. Use a stable serialiser or an
  explicit key function.

### A typed event emitter {medium core}

Implement an event emitter with `on`, `off`, `once` and `emit`, typed so that `emit('step', payload)` only accepts the
payload type declared for `step`. `on` returns an unsubscribe function. A listener that removes itself during `emit`
must not break the other listeners.

#### Hints

1. Store an array of `{ fn, once }` entries per event name in a `Map`.
2. Type the class with an event map: `Emitter<{ step: { id: string }; done: void }>`.
3. Iterate over a copy of the array in `emit`, so removals during the loop are safe.

#### Solution

```ts
import assert from 'node:assert/strict';

type Listener<T> = (payload: T) => void;
type Entry = { fn: Listener<never>; once: boolean };

class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Entry[]>();

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>, once = false): () => void {
    const entry: Entry = { fn: fn as Listener<never>, once };
    const list = this.listeners.get(event) ?? [];
    list.push(entry);
    this.listeners.set(event, list);
    return () => this.remove(event, entry); // removes exactly this registration
  }

  once<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    return this.on(event, fn, true);
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    const entry = this.listeners.get(event)?.find((e) => e.fn === (fn as Listener<never>));
    if (entry) this.remove(event, entry);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (const entry of [...list]) {
      if (entry.once) this.remove(event, entry);
      (entry.fn as Listener<Events[K]>)(payload);
    }
  }

  private remove(event: keyof Events, entry: Entry): void {
    const list = this.listeners.get(event);
    const i = list?.indexOf(entry) ?? -1;
    if (list && i >= 0) list.splice(i, 1);
  }
}

type RunEvents = { step: { id: string; name: string }; done: { ok: boolean } };
const bus = new Emitter<RunEvents>();
const steps: string[] = [];

const unsubscribe = bus.on('step', (s) => steps.push(s.name));
bus.once('step', (s) => steps.push(`first:${s.name}`));
bus.on('step', function selfRemoving(s) {
  steps.push(`self:${s.name}`);
  bus.off('step', selfRemoving);
});

bus.emit('step', { id: '1', name: 'plan' });
bus.emit('step', { id: '2', name: 'act' });
assert.deepEqual(steps, ['plan', 'first:plan', 'self:plan', 'act']);

unsubscribe();
bus.emit('step', { id: '3', name: 'ignored' });
assert.equal(steps.length, 4);

let finished = false;
bus.on('done', (d) => (finished = d.ok));
bus.emit('done', { ok: true });
assert.equal(finished, true);
// bus.emit('done', { ok: 'yes' }); // compile error: the payload type is checked

// The same function registered with on() and once(): the once entry must go, the permanent one must stay.
const hits: string[] = [];
const log = (d: { ok: boolean }) => hits.push(String(d.ok));
bus.on('done', log);
bus.once('done', log);
bus.emit('done', { ok: true });
bus.emit('done', { ok: false });
assert.deepEqual(hits, ['true', 'true', 'false']);
```

Complexity: `emit` is O(listeners); `off` is O(listeners) because of the search. Removing a `once` entry by
identity, not by function, matters when the same function is registered twice. Like Node's `EventEmitter`, a listener
removed by another listener during an `emit` still runs for that emit, because the loop works on a copy.

#### Follow-ups

- **One listener throws.** Should the rest still run? Wrap each call in try/catch and report the error, or let it
  propagate. Node's `EventEmitter` lets it propagate, and an `'error'` event with no listener throws.
- **Memory leaks.** Components must unsubscribe on unmount. That is why `on` returns an unsubscribe function, which
  fits a React effect cleanup.

### Bounded async queue with backpressure {hard}

Build `AsyncQueue<T>` for a producer/consumer pipeline: `push(item)` returns a promise that waits while the queue is at
capacity; consumers read with `for await (const item of queue)`; `close()` ends iteration once the buffered items are
drained, and pushing after close throws.

#### Hints

1. Keep three things: buffered items, waiting consumers (resolvers), and waiting producers (resolvers).
2. `push`: hand the item straight to a waiting consumer if there is one; otherwise wait while full, then buffer it.
3. `next`: take a buffered item and wake one waiting producer; if empty and closed, return done; otherwise wait.

#### Solution

This is the core of a streaming pipeline: the producer (an LLM token stream, a log tailer) can never run more than
`capacity` items ahead of the consumer (the socket or the UI).

```ts
import assert from 'node:assert/strict';

class AsyncQueue<T> implements AsyncIterable<T> {
  private items: T[] = [];
  private consumers: ((result: IteratorResult<T, undefined>) => void)[] = [];
  private producers: (() => void)[] = [];
  private closed = false;
  private readonly capacity: number;

  constructor(capacity = Infinity) {
    // Capacity 0 would deadlock: a producer waits for a free slot that a waiting consumer never creates.
    if (!(capacity >= 1)) throw new RangeError('capacity must be at least 1');
    this.capacity = capacity;
  }

  async push(item: T): Promise<void> {
    if (this.closed) throw new Error('queue is closed');
    const consumer = this.consumers.shift();
    if (consumer) return consumer({ value: item, done: false });
    while (this.items.length >= this.capacity) {
      await new Promise<void>((resolve) => this.producers.push(resolve));
      if (this.closed) throw new Error('queue is closed');
    }
    this.items.push(item);
  }

  next(): Promise<IteratorResult<T, undefined>> {
    if (this.items.length > 0) {
      const value = this.items.shift() as T;
      this.producers.shift()?.();
      return Promise.resolve({ value, done: false });
    }
    if (this.closed) return Promise.resolve({ value: undefined, done: true });
    return new Promise((resolve) => this.consumers.push(resolve));
  }

  close(): void {
    this.closed = true;
    for (const consumer of this.consumers.splice(0)) consumer({ value: undefined, done: true });
    for (const producer of this.producers.splice(0)) producer();
  }

  get size(): number {
    return this.items.length;
  }

  [Symbol.asyncIterator](): AsyncIterator<T, undefined> {
    return { next: () => this.next() };
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const queue = new AsyncQueue<number>(2);
let maxBuffered = 0;

const producer = (async () => {
  for (let i = 1; i <= 6; i++) {
    await queue.push(i);
    maxBuffered = Math.max(maxBuffered, queue.size);
  }
  queue.close();
})();

const received: number[] = [];
for await (const n of queue) {
  received.push(n);
  await tick(); // a slow consumer
}
await producer;
assert.deepEqual(received, [1, 2, 3, 4, 5, 6]);
assert.ok(maxBuffered <= 2);
await assert.rejects(queue.push(7), { message: 'queue is closed' });

// A consumer waiting on an empty queue is released by close().
const empty = new AsyncQueue<string>();
const waiting = empty.next();
empty.close();
assert.deepEqual(await waiting, { value: undefined, done: true });
assert.throws(() => new AsyncQueue(0), RangeError);

// close() also releases a producer blocked on a full queue.
const full = new AsyncQueue<number>(1);
await full.push(1);
const blocked = full.push(2);
full.close();
await assert.rejects(blocked, { message: 'queue is closed' });
```

Complexity: O(1) per operation, except `Array.shift`, which is O(n) for large buffers; use a ring buffer or two-stack
queue if the buffer can be big.

#### Follow-ups

- **Several consumers?** The design already supports it: each waiting consumer gets the next item (competing consumers).
- **Errors from the producer?** Add `fail(err)`, which rejects waiting consumers and makes later `next()` calls reject.
- **Tidier waiting lists?** `Promise.withResolvers()` (ES2024) returns `{ promise, resolve, reject }`, so you can store
  the resolver without the `new Promise((resolve) => list.push(resolve))` dance.
- **The built-in equivalent?** Node `Readable` streams with `highWaterMark`, or a `ReadableStream` with a queuing
  strategy in the browser.

### Token bucket rate limiter {medium}

An external ERP API allows bursts of 5 requests and 2 requests per second on average. Write a `TokenBucket` with
`tryTake()` (take a token now or return false) and `take()` (wait until a token is available). Make time injectable.

#### Hints

1. Store the token count and the time of the last refill. Refill lazily on every call: `elapsed × rate`, capped at
   capacity.
2. `take()`: if no token, compute how long until one exists, sleep that long, and try again.
3. Inject `now()` and `sleep()` so the test controls time.

#### Solution

Lazy refill means no timers run in the background. The fake clock in the test makes the behaviour exact.

```ts
import assert from 'node:assert/strict';

class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly capacity: number;
  private readonly perSecond: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(capacity: number, perSecond: number, now: () => number = Date.now, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))) {
    this.capacity = capacity;
    this.perSecond = perSecond;
    this.now = now;
    this.sleep = sleep;
    this.tokens = capacity;
    this.last = now();
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.perSecond);
    this.last = t;
  }

  tryTake(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  async take(): Promise<void> {
    while (!this.tryTake()) {
      const waitMs = Math.ceil(((1 - this.tokens) / this.perSecond) * 1000);
      await this.sleep(waitMs);
    }
  }
}

let clock = 0;
const waits: number[] = [];
const bucket = new TokenBucket(5, 2, () => clock, async (ms) => {
  waits.push(ms);
  clock += ms;
});

for (let i = 0; i < 5; i++) assert.equal(bucket.tryTake(), true); // the burst
assert.equal(bucket.tryTake(), false);
clock += 500; // half a second = one token at 2/s
assert.equal(bucket.tryTake(), true);
assert.equal(bucket.tryTake(), false);

await bucket.take(); // must wait 500 ms for the next token
assert.deepEqual(waits, [500]);
clock += 60_000;
for (let i = 0; i < 5; i++) assert.equal(bucket.tryTake(), true); // refills only up to capacity
assert.equal(bucket.tryTake(), false);
```

Complexity: O(1) per call.

#### Follow-ups

- **Several Cloud Run instances share the limit.** An in-memory bucket is per instance. Use Redis (a Lua script that
  refills and takes atomically) or a managed rate-limited queue such as Cloud Tasks ([Redis](#/redis)).
- **Fairness between tenants?** One bucket per tenant, plus a global bucket.

### Parse a Server-Sent Events stream from chunks {medium core}

A `fetch` response body arrives as arbitrary byte chunks. Write an async generator `parseSSE(chunks, state)` that
yields `{ event, data, id }` objects and keeps `state.lastEventId` (what you send as `Last-Event-ID` on reconnect) and
`state.retryMs` up to date. Follow the WHATWG rules: events end at a blank line; lines starting with `:` are comments;
`data:` lines join with `\n`; the event type defaults to `"message"`; one space after the colon is dropped; lines can
end in `\n`, `\r\n` or `\r`; one leading byte-order mark is ignored; an `id` containing NUL is ignored; `retry` is
accepted only if it is all digits; an unfinished event at the end of the stream is discarded. Chunks can split a line,
a `\r\n` pair, or a multi-byte UTF-8 character.

#### Hints

1. Decode with one `TextDecoder` and `{ stream: true }`, so a character split across chunks is held back until complete.
2. Keep a text buffer; process only complete lines, and keep the remainder for the next chunk.
3. A buffer ending in `\r` is ambiguous (a `\n` may follow in the next chunk), so wait before treating it as a line end.
4. An `id:` line only fills a buffer. Commit it as the reconnect id at the blank line, even when the event has no data.

#### Solution

This is the same parser the [SSE chapter](#/sse) and the [streaming chat UI](#/streaming-chat-ui) rely on, and
exactly what you need when you use `fetch` instead of `EventSource` (to send a POST body or an `Authorization` header).
The subtle rule is the **id commit**. The spec keeps a "last event ID buffer" that an `id:` line updates immediately,
but the id used for reconnecting is only set from that buffer when an event is dispatched at the blank line. If the
connection drops in the middle of an event, its id was never committed, so the reconnect asks for it again instead of
silently skipping an event that was never delivered. An id-only event (`id: 42` then a blank line) commits the id
without yielding anything, so the parser must expose the committed id, not just the ids on yielded events.

```ts
import assert from 'node:assert/strict';

type SSEEvent = { event: string; data: string; id: string };
type SSEState = { lastEventId: string; retryMs: number | null };

async function* parseSSE(
  chunks: AsyncIterable<Uint8Array>,
  state: SSEState = { lastEventId: '', retryMs: null },
): AsyncGenerator<SSEEvent> {
  const decoder = new TextDecoder(); // strips one leading BOM, as the spec requires
  let buffer = '';
  let data: string[] = [];
  let event = '';
  let idBuffer = state.lastEventId; // continue from the id a previous connection committed

  function* lines(final: boolean): Generator<string> {
    for (;;) {
      const match = /\r\n|\r|\n/.exec(buffer);
      if (!match) return;
      if (match[0] === '\r' && match.index === buffer.length - 1 && !final) return; // maybe half of \r\n
      yield buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
    }
  }

  function handle(line: string): SSEEvent | null {
    if (line === '') {
      state.lastEventId = idBuffer; // committed at dispatch, even if there is no data
      const ready = data.length > 0 ? { event: event || 'message', data: data.join('\n'), id: idBuffer } : null;
      data = [];
      event = '';
      return ready;
    }
    if (line.startsWith(':')) return null; // comment, often a keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id' && !value.includes('\0')) idBuffer = value;
    else if (field === 'retry' && /^\d+$/.test(value)) state.retryMs = Number(value);
    return null; // unknown fields are ignored
  }

  for await (const chunk of chunks) {
    buffer += decoder.decode(chunk, { stream: true });
    for (const line of lines(false)) {
      const ev = handle(line);
      if (ev) yield ev;
    }
  }
  buffer += decoder.decode();
  for (const line of lines(true)) {
    const ev = handle(line);
    if (ev) yield ev;
  }
  // An event without its closing blank line is discarded, as the spec says.
}

async function* fromStrings(parts: (string | Uint8Array)[]): AsyncGenerator<Uint8Array> {
  const enc = new TextEncoder();
  for (const p of parts) yield typeof p === 'string' ? enc.encode(p) : p;
}
const collect = async (parts: (string | Uint8Array)[], state?: SSEState) => {
  const out: SSEEvent[] = [];
  for await (const ev of parseSSE(fromStrings(parts), state)) out.push(ev);
  return out;
};

// Split mid-line, a comment, multi-line data, a named event and an id.
assert.deepEqual(
  await collect([': keep-alive\n\nda', 'ta: hel', 'lo\ndata: world\n\nevent: step\nid: 7\ndata: {"n":1}\n\n']),
  [
    { event: 'message', data: 'hello\nworld', id: '' },
    { event: 'step', data: '{"n":1}', id: '7' },
  ],
);

// \r\n split across chunks, and a multi-byte character split across chunks.
const tick = new TextEncoder().encode('data: ✓\r\n\r\n');
assert.deepEqual(await collect([tick.slice(0, 7), tick.slice(7, 10), tick.slice(10)]), [
  { event: 'message', data: '✓', id: '' },
]);

// No space after the colon, an id carried forward, and an unterminated final event dropped.
assert.deepEqual(await collect(['id:1\ndata:a\n\ndata:b\n\ndata: lost']), [
  { event: 'message', data: 'a', id: '1' },
  { event: 'message', data: 'b', id: '1' },
]);
assert.deepEqual(await collect([]), []);

// The id is committed only at dispatch: a drop mid-event keeps the previous id, so nothing is skipped on reconnect.
const dropped: SSEState = { lastEventId: '', retryMs: null };
assert.deepEqual(await collect(['id: 1\ndata: a\n\nid: 2\ndata: b'], dropped), [{ event: 'message', data: 'a', id: '1' }]);
assert.equal(dropped.lastEventId, '1');

// An id-only event yields nothing but still commits the id.
const idOnly: SSEState = { lastEventId: '', retryMs: null };
assert.deepEqual(await collect(['id: 42\n\n'], idOnly), []);
assert.equal(idOnly.lastEventId, '42');

// A CR at the end of one chunk and its LF in a later one (with an empty chunk between) is ONE line ending.
assert.deepEqual(await collect(['data: a\r', '', '\ndata: b\r\n\r\n']), [{ event: 'message', data: 'a\nb', id: '' }]);

// One leading BOM is ignored, even split across chunks; a second one is part of the first line.
const withBom = new TextEncoder().encode('\uFEFFdata: x\n\n');
assert.deepEqual(await collect([withBom.slice(0, 2), withBom.slice(2)]), [{ event: 'message', data: 'x', id: '' }]);
assert.deepEqual(await collect(['\uFEFF\uFEFFdata: y\n\n']), []); // field name "\uFEFFdata" is unknown

// An id containing NUL is ignored; retry is accepted only when it is all digits.
const misc: SSEState = { lastEventId: '', retryMs: null };
assert.deepEqual(await collect(['id: 7\ndata: a\n\nid: x\u0000y\nretry: 2500\nretry: 3s\nretry: -1\ndata: b\n\n'], misc), [
  { event: 'message', data: 'a', id: '7' },
  { event: 'message', data: 'b', id: '7' },
]);
assert.equal(misc.retryMs, 2500);
```

Complexity: O(total bytes). The buffer slicing is O(line length) per line, which is fine for typical event sizes.

#### Follow-ups

- **Use it with fetch.** `const res = await fetch(url, { method: 'POST', body, signal })`, then
  `for await (const ev of parseSSE(res.body!, state))`. A `ReadableStream` is async-iterable in Node, Chrome and
  Firefox, but stable Safari has lagged on this, so wrap `getReader()` in a small async generator for portable code.
- **Reconnect where you left off.** Keep one `state` object across connections, send `state.lastEventId` as the
  `Last-Event-ID` header, and wait `state.retryMs` (or your own backoff) before reconnecting.
- **NDJSON instead of SSE?** Same buffering idea: split on `\n` and `JSON.parse` each complete line.

### Latest request wins (cancel stale searches) {medium}

A typeahead fires a request on every keystroke. Responses can arrive out of order, and a slow response for `"ag"` must
never overwrite the results for `"agent"`. Write `latest(fn)`: every new call aborts the previous one, and a superseded
call rejects with an `AbortError` instead of returning stale data.

#### Hints

1. Keep the current `AbortController` in a closure.
2. On each call: abort the previous controller, create a new one, pass its signal to `fn`.
3. After `fn` resolves, check whether your controller was aborted in the meantime.

#### Solution

Aborting cancels the network work; the extra check guards against a function that ignores its signal and resolves
anyway.

```ts
import assert from 'node:assert/strict';
import { mock } from 'node:test';

function latest<A extends unknown[], R>(fn: (signal: AbortSignal, ...args: A) => Promise<R>) {
  let current: AbortController | undefined;
  return async (...args: A): Promise<R> => {
    current?.abort(new DOMException('Superseded by a newer call', 'AbortError'));
    const controller = new AbortController();
    current = controller;
    const result = await fn(controller.signal, ...args);
    controller.signal.throwIfAborted();
    return result;
  };
}

mock.timers.enable({ apis: ['setTimeout'] });
// A fake search that is slow for short queries and ignores its signal.
const search = latest(
  (_signal: AbortSignal, q: string) => new Promise<string[]>((resolve) => setTimeout(() => resolve([`${q}-result`]), q.length < 3 ? 300 : 50)),
);

const first = search('ag');
const second = search('agent');
mock.timers.tick(300);
assert.deepEqual(await second, ['agent-result']);
await assert.rejects(first, { name: 'AbortError' });
mock.timers.reset();
```

Complexity: O(1) per call.

#### Follow-ups

- **Who handles the superseded call's rejection?** The caller: catch it and ignore `AbortError`
  (`if (err instanceof DOMException && err.name === 'AbortError') return`). Otherwise every fast typist produces
  unhandled rejections.
- **In React?** Create the controller inside the effect and abort it in the cleanup; or let TanStack Query handle it,
  since it passes a `signal` to the query function and cancels on key changes.
- **RxJS?** This is `switchMap`.

### Run async tasks in series {easy}

Given an array of functions that return promises, run them one after another (each starts only after the previous
finished) and return all results in order. Then explain why `tasks.map(t => t())` is not the same thing.

#### Hints

1. A `for...of` loop with `await` inside is the clearest version.
2. `tasks.map(t => t())` calls every function immediately, so all tasks start at once.

#### Solution

```ts
import assert from 'node:assert/strict';

async function series<T>(tasks: readonly (() => Promise<T>)[]): Promise<T[]> {
  const results: T[] = [];
  for (const task of tasks) results.push(await task());
  return results;
}

const log: string[] = [];
const make = (name: string) => async () => {
  log.push(`start ${name}`);
  await new Promise<void>((resolve) => setImmediate(resolve));
  log.push(`end ${name}`);
  return name;
};

assert.deepEqual(await series([make('a'), make('b')]), ['a', 'b']);
assert.deepEqual(log, ['start a', 'end a', 'start b', 'end b']);

log.length = 0;
await Promise.all([make('a'), make('b')].map((t) => t()));
assert.deepEqual(log, ['start a', 'start b', 'end a', 'end b']); // parallel: both started first
assert.deepEqual(await series([]), []);
```

Complexity: total time is the sum of the task times.

#### Follow-ups

- **The `reduce` version** chains `.then` calls: `tasks.reduce((p, t) => p.then(acc => t().then(r => [...acc, r])),
  Promise.resolve([]))`. It works, but the loop is easier to read and debug.
- **When do you want series on purpose?** Database migrations, steps that depend on each other, and calls to an API with
  a strict one-at-a-time rule.
