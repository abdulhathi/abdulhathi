---
title: Practical TypeScript tasks
goal: Solve the "build a small real thing" problems (caches, queues, state machines, object utilities, routers, pipelines) in clean, typed TypeScript with tests, the way a senior engineer would on the job.
minutes: 90
---

Many full-stack interviews skip textbook algorithms and ask for something you would actually write at work: "build an
LRU cache", "write a small task queue with retries", "diff these two lists", "order these pipeline steps". These tasks
test design as much as code: clear types, sensible names, edge cases handled on purpose, and a quick test that proves
it works. They map directly onto this platform: agent runs are state machines, pipelines are DAGs, workers need retries
and dead-letter queues, and dashboards need diffs and aggregates.

Every solution below is typed, runs under Node, and checks itself with asserts. In the interview, narrate the design
first ("I'll keep a Map because it preserves insertion order, so the oldest key is first"), then code, then test out
loud with one normal case and one edge case.

## How practical rounds are graded

- **Clarify the contract:** inputs, outputs, error behaviour, sizes. "What should happen with a duplicate id?" is a
  question that scores points.
- **Types first:** write the types for the data and the function signature before the body. Discriminated unions for
  states and events make invalid combinations impossible to express.
- **Small pieces:** a helper per idea (parse, validate, transform) beats one long function.
- **Inject time and randomness** (`now()`, `sleep()`) so the code is testable; mention it even if you do not have time
  to write the test.
- **Say the complexity and the production gaps:** "this is per process; across Cloud Run instances I'd use Redis."

## Coding problems

### LRU cache with a TTL {medium core}

Build `LruCache<K, V>` with a capacity and a time-to-live. `get` returns `undefined` for missing or expired keys and
marks a hit as most recently used. `set` inserts or updates, evicting the least recently used entry when over capacity.
Both must be O(1).

#### Hints

1. A JavaScript `Map` iterates in insertion order, so its first key is the oldest.
2. To mark an entry as recently used, delete it and set it again: it moves to the end.
3. Store `{ value, expiresAt }` and inject `now()` so expiry is testable.

#### Solution

The `Map` gives O(1) get, set, delete and "oldest key" via `keys().next()`. Expiry is checked lazily on read, so no
timers run in the background.

```ts
import assert from 'node:assert/strict';

class LruCache<K, V> {
  private entries = new Map<K, { value: V; expiresAt: number }>();
  private readonly capacity: number;
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(capacity: number, ttlMs = Infinity, now: () => number = Date.now) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError('capacity must be a positive integer');
    this.capacity = capacity;
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    if (entry.expiresAt <= this.now()) return undefined; // expired: dropped
    this.entries.set(key, entry); // move to most recently used
    return entry.value;
  }

  set(key: K, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value as K;
      this.entries.delete(oldest);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

let clock = 0;
const cache = new LruCache<string, number>(2, 1_000, () => clock);
cache.set('a', 1);
cache.set('b', 2);
assert.equal(cache.get('a'), 1); // a is now most recent
cache.set('c', 3); // evicts b, the least recently used
assert.equal(cache.get('b'), undefined);
assert.equal(cache.get('a'), 1);
assert.equal(cache.get('c'), 3);

cache.set('a', 10); // update moves it to the end
assert.equal(cache.get('a'), 10);
assert.equal(cache.size, 2);

clock = 1_000; // TTL reached
assert.equal(cache.get('a'), undefined);
assert.equal(cache.size, 1);
assert.throws(() => new LruCache(0), RangeError);
assert.throws(() => new LruCache(Number.NaN), RangeError); // NaN would silently disable eviction
```

Complexity: O(1) per operation; O(capacity) memory.

#### Follow-ups

- **Without a Map's ordering?** A hash map plus a doubly linked list: the map points to list nodes, the list's head is
  the oldest, and you move nodes to the tail on access.
- **Expired entries that are never read waste memory.** Add a periodic sweep, or accept it because the capacity bounds
  the size anyway.
- **Shared across instances?** Use Redis with `EXPIRE` and an eviction policy such as `allkeys-lru` ([Redis](#/redis)).

### In-memory pub/sub with wildcard topics {medium}

Build a `PubSub` where subscribers use topic patterns: `*` matches exactly one dot-separated segment and `#` matches
zero or more segments at the end. `subscribe` returns an unsubscribe function; `publish` returns how many handlers
received the message. Example: `runs.*.status` matches `runs.r1.status`; `runs.#` matches `runs`, `runs.r1` and
`runs.r1.steps.s2`.

#### Hints

1. Split patterns and topics on `.` and compare segment by segment.
2. `#` as the last pattern segment matches whatever remains, including nothing.
3. Store subscriptions in a `Set` of `{ pattern, handler }` objects so unsubscribe is a delete.

#### Solution

A linear scan over subscriptions with a segment matcher is fine for an in-memory bus. Mention the trie for many
subscriptions.

```ts
import assert from 'node:assert/strict';

type Handler<T> = (topic: string, message: T) => void;

function topicMatches(pattern: string, topic: string): boolean {
  const p = pattern.split('.');
  const t = topic.split('.');
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '#') return i === p.length - 1; // '#' only allowed at the end
    if (i >= t.length) return false;
    if (p[i] !== '*' && p[i] !== t[i]) return false;
  }
  return p.length === t.length;
}

class PubSub<T> {
  private subs = new Set<{ pattern: string; handler: Handler<T> }>();

  subscribe(pattern: string, handler: Handler<T>): () => void {
    const sub = { pattern, handler };
    this.subs.add(sub);
    return () => void this.subs.delete(sub);
  }

  publish(topic: string, message: T): number {
    let delivered = 0;
    for (const sub of [...this.subs]) {
      if (topicMatches(sub.pattern, topic)) {
        sub.handler(topic, message);
        delivered++;
      }
    }
    return delivered;
  }
}

assert.equal(topicMatches('runs.*.status', 'runs.r1.status'), true);
assert.equal(topicMatches('runs.*.status', 'runs.r1.steps.status'), false);
assert.equal(topicMatches('runs.#', 'runs'), true);
assert.equal(topicMatches('runs.#', 'runs.r1.steps.s2'), true);
assert.equal(topicMatches('runs.#', 'jobs.r1'), false);
assert.equal(topicMatches('runs', 'runs.r1'), false);

const bus = new PubSub<{ status: string }>();
const seen: string[] = [];
const off = bus.subscribe('runs.*.status', (topic, m) => seen.push(`${topic}=${m.status}`));
bus.subscribe('runs.#', (topic) => seen.push(`audit:${topic}`));

assert.equal(bus.publish('runs.r1.status', { status: 'running' }), 2);
off();
assert.equal(bus.publish('runs.r1.status', { status: 'done' }), 1);
assert.equal(bus.publish('billing.x', { status: 'n/a' }), 0);
assert.deepEqual(seen, ['runs.r1.status=running', 'audit:runs.r1.status', 'audit:runs.r1.status']);
```

Complexity: O(subscriptions × segments) per publish.

#### Follow-ups

- **Thousands of subscriptions?** Index patterns in a trie keyed by segment, with branches for `*` and `#`.
- **Across instances, for WebSocket fan-out?** Redis pub/sub or Pub/Sub topics; each WebSocket server subscribes and
  forwards to its own clients ([WebSockets](#/websockets)).
- **Slow handlers block publishers.** Deliver through a queue per subscriber, or `queueMicrotask` each delivery.

### Task queue with retries and a dead-letter queue {hard core}

Build `TaskQueue<T>` for background jobs: a handler processes each job; at most `concurrency` jobs run at once; a
failed job is retried until `maxAttempts`, then moved to a dead-letter list with its last error; enqueueing an id that
is already known is ignored (idempotency); `onIdle()` resolves when everything has finished.

#### Hints

1. State: a pending array, a running count, a set of known ids, `done` and `dead` lists.
2. A `pump()` method starts jobs while `running < concurrency` and there is pending work; call it after enqueue and
   after every job finishes.
3. In the job's `catch`, either re-queue it (attempts left) or dead-letter it; always decrement `running` in `finally`.

#### Solution

This is the shape of Celery, BullMQ or a Pub/Sub subscriber with a dead-letter topic, reduced to its core. Saying that,
and naming what is missing (persistence, visibility timeouts, backoff), is the senior part of the answer.

```ts
import assert from 'node:assert/strict';

type Job<T> = { id: string; payload: T; attempts: number; lastError?: string };
type QueueOptions = { concurrency: number; maxAttempts: number };

class TaskQueue<T> {
  readonly done: string[] = [];
  readonly dead: Job<T>[] = [];
  private pending: Job<T>[] = [];
  private known = new Set<string>();
  private running = 0;
  private idleWaiters: (() => void)[] = [];
  private readonly handler: (payload: T, attempt: number) => Promise<void>;
  private readonly options: QueueOptions;

  constructor(handler: (payload: T, attempt: number) => Promise<void>, options: QueueOptions) {
    if (!(options.concurrency >= 1) || !(options.maxAttempts >= 1)) throw new RangeError('concurrency and maxAttempts must be at least 1');
    this.handler = handler;
    this.options = options;
  }

  enqueue(id: string, payload: T): boolean {
    if (this.known.has(id)) return false; // duplicate delivery: ignore
    this.known.add(id);
    this.pending.push({ id, payload, attempts: 0 });
    this.pump();
    return true;
  }

  onIdle(): Promise<void> {
    if (this.running === 0 && this.pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(): void {
    while (this.running < this.options.concurrency && this.pending.length > 0) {
      const job = this.pending.shift() as Job<T>;
      this.running++;
      void this.run(job);
    }
    if (this.running === 0 && this.pending.length === 0) {
      for (const resolve of this.idleWaiters.splice(0)) resolve();
    }
  }

  private async run(job: Job<T>): Promise<void> {
    job.attempts++;
    try {
      await this.handler(job.payload, job.attempts);
      this.done.push(job.id);
    } catch (err) {
      job.lastError = err instanceof Error ? err.message : String(err);
      if (job.attempts >= this.options.maxAttempts) this.dead.push(job);
      else this.pending.push(job); // a real queue would add a backoff delay here
    } finally {
      this.running--;
      this.pump();
    }
  }
}

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
let active = 0;
let peak = 0;
const queue = new TaskQueue<{ action: string }>(
  async ({ action }, attempt) => {
    active++;
    peak = Math.max(peak, active);
    await tick();
    active--;
    if (action === 'poison') throw new Error('schema mismatch');
    if (action === 'flaky' && attempt < 3) throw new Error(`timeout on attempt ${attempt}`);
  },
  { concurrency: 2, maxAttempts: 3 },
);

queue.enqueue('j1', { action: 'create-ticket' });
queue.enqueue('j2', { action: 'flaky' });
queue.enqueue('j3', { action: 'poison' });
assert.equal(queue.enqueue('j1', { action: 'create-ticket' }), false); // idempotent
queue.enqueue('j4', { action: 'notify' });
await queue.onIdle();

assert.deepEqual([...queue.done].sort(), ['j1', 'j2', 'j4']);
assert.equal(queue.dead.length, 1);
assert.deepEqual(queue.dead[0], { id: 'j3', payload: { action: 'poison' }, attempts: 3, lastError: 'schema mismatch' });
assert.equal(peak, 2);
await queue.onIdle(); // already idle: resolves immediately
assert.throws(() => new TaskQueue(async () => {}, { concurrency: 0, maxAttempts: 3 }), RangeError); // would never run
```

Complexity: O(1) per state change (ignoring `Array.shift`); memory grows with known ids.

#### Follow-ups

- **The process crashes mid-job.** In-memory state is lost. A durable queue (Pub/Sub, Cloud Tasks, Postgres with
  `SKIP LOCKED`) redelivers jobs whose lease expired, which is why handlers must be idempotent
  ([task queues](#/task-queues)).
- **Add backoff.** Store `notBefore = now + delay` on the job and skip it in `pump` until due, or schedule the re-queue
  with a timer.
- **The `known` set grows forever.** Keep ids for a retention window, or store idempotency keys in the database with a
  unique constraint.

### Agent-run state machine as a reducer {medium core}

Model an agent run's lifecycle: `idle → running → (awaiting_approval ↔ running) → succeeded | failed | cancelled`.
Write `transition(state, event)` as a pure function over discriminated unions. Invalid events (approving a run that
is not waiting, anything after a terminal state) must return an error, not silently change state.

#### Hints

1. Type the states and events as unions with a `type` or `status` tag; carry data only where it belongs (the pending
   approval, the error message).
2. Switch on the current status, then on the event type.
3. Return a result union `{ ok: true, state } | { ok: false, error }` so callers must handle rejection.

#### Solution

Making illegal states unrepresentable is the point: only `awaiting_approval` carries an approval request, and only
`failed` carries an error. The same reducer can drive the UI (with `useReducer`) and the backend.

```ts
import assert from 'node:assert/strict';

type RunState =
  | { status: 'idle' }
  | { status: 'running'; step: number }
  | { status: 'awaiting_approval'; step: number; action: string }
  | { status: 'succeeded'; steps: number }
  | { status: 'failed'; step: number; error: string }
  | { status: 'cancelled' };

type RunEvent =
  | { type: 'START' }
  | { type: 'STEP_DONE' }
  | { type: 'NEED_APPROVAL'; action: string }
  | { type: 'APPROVE' }
  | { type: 'REJECT' }
  | { type: 'FAIL'; error: string }
  | { type: 'FINISH' }
  | { type: 'CANCEL' };

type Result = { ok: true; state: RunState } | { ok: false; error: string };

const TERMINAL = new Set<RunState['status']>(['succeeded', 'failed', 'cancelled']);

function transition(state: RunState, event: RunEvent): Result {
  const ok = (next: RunState): Result => ({ ok: true, state: next });
  const reject = (): Result => ({ ok: false, error: `${event.type} is not allowed in ${state.status}` });
  if (TERMINAL.has(state.status)) return reject();
  if (event.type === 'CANCEL') return ok({ status: 'cancelled' });

  switch (state.status) {
    case 'idle':
      return event.type === 'START' ? ok({ status: 'running', step: 1 }) : reject();
    case 'running':
      switch (event.type) {
        case 'STEP_DONE':
          return ok({ status: 'running', step: state.step + 1 });
        case 'NEED_APPROVAL':
          return ok({ status: 'awaiting_approval', step: state.step, action: event.action });
        case 'FAIL':
          return ok({ status: 'failed', step: state.step, error: event.error });
        case 'FINISH':
          return ok({ status: 'succeeded', steps: state.step });
        default:
          return reject();
      }
    case 'awaiting_approval':
      if (event.type === 'APPROVE') return ok({ status: 'running', step: state.step });
      if (event.type === 'REJECT') return ok({ status: 'failed', step: state.step, error: `approval rejected: ${state.action}` });
      return reject();
    default:
      return reject();
  }
}

function run(events: RunEvent[]): RunState {
  return events.reduce<RunState>((s, e) => {
    const r = transition(s, e);
    if (!r.ok) throw new Error(r.error);
    return r.state;
  }, { status: 'idle' });
}

assert.deepEqual(
  run([{ type: 'START' }, { type: 'STEP_DONE' }, { type: 'NEED_APPROVAL', action: 'create PO' }, { type: 'APPROVE' }, { type: 'FINISH' }]),
  { status: 'succeeded', steps: 2 },
);
assert.deepEqual(run([{ type: 'START' }, { type: 'NEED_APPROVAL', action: 'delete VM' }, { type: 'REJECT' }]), {
  status: 'failed',
  step: 1,
  error: 'approval rejected: delete VM',
});
assert.deepEqual(transition({ status: 'running', step: 3 }, { type: 'APPROVE' }), {
  ok: false,
  error: 'APPROVE is not allowed in running',
});
assert.equal(transition({ status: 'cancelled' }, { type: 'START' }).ok, false);
assert.deepEqual(run([{ type: 'START' }, { type: 'CANCEL' }]), { status: 'cancelled' });
```

Complexity: O(1) per transition.

#### Follow-ups

- **Persist and resume after a crash.** Store the state (or the event log) in Postgres or Firestore after every
  transition; on restart, load it and continue. Replaying an event log gives an audit trail for free
  ([state machines](#/state-machines)).
- **Exhaustiveness.** Add a `default` branch that assigns the value to `never`, so a new status that is not handled
  fails to compile.
- **Two workers send events at once.** Use optimistic concurrency: a version column, and update only if the version
  still matches.

### Deep equality {medium core}

Write `deepEqual(a, b)` for JSON-like data plus `Date`, `Map` and `Set`: primitives compare with `Object.is` semantics
for `NaN` but treat `0` and `-0` as equal; arrays compare element by element; plain objects compare their own keys
regardless of order; `Map` compares keys by identity and values deeply; `Set` compares membership.

#### Hints

1. Handle the cheap cases first: identical references, `NaN`, different types, `null`.
2. Arrays: same length and every index deep-equal. Objects: same key count and every key present and deep-equal.
3. Check `Date`, `Map` and `Set` with `instanceof` before the generic object branch.

#### Solution

```ts
import assert from 'node:assert/strict';

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true; // also 0 === -0
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;

  if (a instanceof Date) return Object.is(a.getTime(), (b as Date).getTime()); // two invalid dates are equal
  if (a instanceof Map) {
    const other = b as Map<unknown, unknown>;
    if (a.size !== other.size) return false;
    for (const [k, v] of a) if (!other.has(k) || !deepEqual(v, other.get(k))) return false;
    return true;
  }
  if (a instanceof Set) {
    const other = b as Set<unknown>;
    if (a.size !== other.size) return false;
    for (const v of a) if (!other.has(v)) return false;
    return true;
  }
  if (Array.isArray(a)) {
    const other = b as unknown[];
    if (a.length !== other.length) return false;
    // A plain loop, not every(): every() skips holes, so [ , 1] would equal [2, 1].
    for (let i = 0; i < a.length; i++) {
      if (i in a !== i in other || !deepEqual(a[i], other[i])) return false;
    }
    return true;
  }
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.hasOwn(b, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

assert.equal(deepEqual({ a: [1, { b: 2 }], c: 'x' }, { c: 'x', a: [1, { b: 2 }] }), true);
assert.equal(deepEqual({ a: 1 }, { a: 1, b: undefined }), false);
assert.equal(deepEqual([1, 2], [2, 1]), false);
assert.equal(deepEqual(NaN, NaN), true);
assert.equal(deepEqual(0, -0), true);
assert.equal(deepEqual(new Date(5), new Date(5)), true);
assert.equal(deepEqual(new Map([['k', { v: 1 }]]), new Map([['k', { v: 1 }]])), true);
assert.equal(deepEqual(new Set([1, 2]), new Set([2, 1])), true);
assert.equal(deepEqual([1], { 0: 1, length: 1 }), false); // different prototypes
assert.equal(deepEqual(null, {}), false);
assert.equal(deepEqual('1', 1), false);
assert.equal(deepEqual([, 1], [2, 1]), false); // a hole is not a value
assert.equal(deepEqual(new Date(Number.NaN), new Date(Number.NaN)), true);
```

Complexity: O(total size of both structures).

#### Follow-ups

- **Cyclic structures?** Track visited pairs in a `WeakMap<object, object>`; if a pair is already being compared,
  return true for that branch.
- **Sets of objects?** Membership by identity is no longer enough; you need an O(n²) deep match or a canonical
  serialisation.
- **Where is this used?** Memo comparisons, test assertions, and change detection before writing to the database.

### Deep merge without prototype pollution {medium}

Write `deepMerge(target, source)` that returns a new object: plain objects merge recursively, arrays and other values
from `source` replace those in `target`, `undefined` in `source` is skipped, and neither input is mutated. Keys like
`__proto__` from untrusted JSON must not pollute `Object.prototype`.

#### Hints

1. Copy `target` first (`{ ...target }`), then walk `source`'s own keys.
2. Recurse only when both sides are plain objects.
3. Skip `__proto__`, `constructor` and `prototype` keys.

#### Solution

Merging configuration (defaults + environment + per-tenant overrides) is the typical use. The pollution guard matters
because merged input often comes from request bodies.

```ts
import assert from 'node:assert/strict';

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;
const UNSAFE = new Set(['__proto__', 'constructor', 'prototype']);

function deepMerge<T extends Plain>(target: T, source: Plain): T {
  const out: Plain = { ...target };
  for (const key of Object.keys(source)) {
    if (UNSAFE.has(key)) continue;
    const next = source[key];
    if (next === undefined) continue;
    const current = out[key];
    out[key] = isPlain(current) && isPlain(next) ? deepMerge(current, next) : next;
  }
  return out as T;
}

const defaults = { model: 'small', limits: { tokens: 1000, tools: ['search'] }, retries: 3 };
const tenant = { limits: { tokens: 4000, tools: ['search', 'erp'] }, retries: undefined };
const merged = deepMerge(defaults, tenant);
assert.deepEqual(merged, { model: 'small', limits: { tokens: 4000, tools: ['search', 'erp'] }, retries: 3 });
assert.equal(defaults.limits.tokens, 1000); // inputs untouched

const evil = JSON.parse('{"__proto__": {"isAdmin": true}, "ok": 1}') as Plain;
const safe = deepMerge({}, evil);
assert.equal(({} as Plain).isAdmin, undefined);
assert.deepEqual(safe, { ok: 1 });
```

Complexity: O(size of `source`) plus the shallow copies along merged paths.

#### Follow-ups

- **Merge arrays instead of replacing?** Make it a strategy parameter: replace, concatenate, or merge by id.
- **Why does `JSON.parse` create an own `__proto__` key?** JSON parsing defines properties directly, so the key exists
  as data. Assigning it with `obj[key] = value` would set the prototype, which is the pollution.

### Flatten and unflatten objects with dotted paths {medium core}

Flatten nested data into dotted keys for a table or a log index, and turn it back. Array indexes become path segments.
Empty objects and arrays stay as values.

```text
{ run: { id: 'r1', tags: ['a', { k: 'v' }] }, meta: {} }
→ { 'run.id': 'r1', 'run.tags.0': 'a', 'run.tags.1.k': 'v', meta: {} }
```

#### Hints

1. Recurse with the current prefix; join with `.`.
2. Treat a value as a leaf if it is not an object, or is an empty object or array.
3. To unflatten, walk each path and create containers on the way: an array if the next segment is a number, otherwise an object.

#### Solution

Flattened keys often arrive from outside (query strings, form fields, CSV headers), so `unflatten` must refuse
`__proto__`, `constructor` and `prototype` segments. Without the guard, the key `__proto__.isAdmin` walks into
`Object.prototype` and sets `isAdmin` on every object in the process: the classic prototype-pollution bug in
query-string parsers.

```ts
import assert from 'node:assert/strict';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function flatten(value: Json, prefix = '', out: Record<string, Json> = {}): Record<string, Json> {
  const isContainer = typeof value === 'object' && value !== null;
  const entries = isContainer ? Object.entries(value) : [];
  if (!isContainer || entries.length === 0) {
    if (prefix) out[prefix] = value;
    return out;
  }
  for (const [k, v] of entries) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function unflatten(flat: Record<string, Json>): Json {
  const root: { [key: string]: Json } = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split('.');
    if (keys.some((k) => UNSAFE_KEYS.has(k))) throw new Error(`unsafe key in path: ${path}`);
    let node: { [key: string]: Json } | Json[] = root;
    keys.forEach((key, i) => {
      const container = node as Record<string, Json>;
      if (i === keys.length - 1) {
        container[key] = value;
        return;
      }
      if (container[key] === undefined) container[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      node = container[key] as { [key: string]: Json } | Json[];
    });
  }
  return root;
}

const doc: Json = { run: { id: 'r1', tags: ['a', { k: 'v' }] }, meta: {}, n: 0, ok: false, none: null };
const flat = flatten(doc);
assert.deepEqual(flat, { 'run.id': 'r1', 'run.tags.0': 'a', 'run.tags.1.k': 'v', meta: {}, n: 0, ok: false, none: null });
assert.deepEqual(unflatten(flat), doc); // round trip
assert.deepEqual(flatten({}), {});
assert.deepEqual(unflatten({ 'a.0.b': 1, 'a.1.b': 2 }), { a: [{ b: 1 }, { b: 2 }] });

// A flattened key from an attacker's request body.
const hostile = JSON.parse('{"__proto__.isAdmin": true}') as Record<string, Json>;
assert.throws(() => unflatten(hostile), /unsafe key/);
assert.equal(({} as Record<string, unknown>).isAdmin, undefined);
```

Complexity: O(total number of values) both ways.

#### Follow-ups

- **Keys that contain dots?** Escape them (`a\.b`) or use a different separator, and document it in the contract.
- **Sparse indexes (`a.5` only)?** The array gets holes; decide whether that is acceptable or compact them.
- **Conflicting keys** such as `a` and `a.b` both present? One of them cannot be represented. Validate up front and
  reject the input with a clear error rather than letting the walk fail on a primitive.

### Get and set values by a path like `steps[0].tool.name` {medium}

Write `getPath(obj, path, fallback)` and `setPath(obj, path, value)` for paths like `steps[0].tool.name` or
`steps.0.tool`. `setPath` creates missing containers (an array when the next segment is an index) and returns the object.

#### Hints

1. Parse the path into segments with one regular expression: names and bracketed numbers.
2. `getPath`: walk while the current value is an object; return the fallback as soon as a segment is missing.
3. `setPath`: walk all but the last segment, creating containers as needed.

#### Solution

```ts
import assert from 'node:assert/strict';

type Segment = string | number;

function parsePath(path: string): Segment[] {
  const out: Segment[] = [];
  for (const m of path.matchAll(/([^.[\]]+)|\[(\d+)\]/g)) {
    if (m[2] !== undefined) out.push(Number(m[2]));
    else out.push(/^\d+$/.test(m[1]) ? Number(m[1]) : m[1]);
  }
  return out;
}

function getPath<T = unknown>(obj: unknown, path: string, fallback?: T): T | undefined {
  let node: unknown = obj;
  for (const seg of parsePath(path)) {
    if (typeof node !== 'object' || node === null || !(seg in node)) return fallback;
    node = (node as Record<Segment, unknown>)[seg];
  }
  return node as T;
}

function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const segs = parsePath(path);
  let node = obj as Record<Segment, unknown>;
  segs.forEach((seg, i) => {
    if (seg === '__proto__' || seg === 'constructor') throw new Error(`unsafe path segment: ${seg}`);
    if (i === segs.length - 1) {
      node[seg] = value;
      return;
    }
    if (typeof node[seg] !== 'object' || node[seg] === null) node[seg] = typeof segs[i + 1] === 'number' ? [] : {};
    node = node[seg] as Record<Segment, unknown>;
  });
  return obj;
}

assert.deepEqual(parsePath('steps[0].tool.name'), ['steps', 0, 'tool', 'name']);
assert.deepEqual(parsePath('steps.0.tool'), ['steps', 0, 'tool']);

const run = { steps: [{ tool: { name: 'search' } }] };
assert.equal(getPath(run, 'steps[0].tool.name'), 'search');
assert.equal(getPath(run, 'steps[3].tool.name', 'none'), 'none');
assert.equal(getPath(run, 'steps[0].tool.name.length'), undefined); // primitives are not walked

const target: Record<string, unknown> = {};
setPath(target, 'steps[1].tool.name', 'erp');
const steps = target.steps as unknown[];
assert.ok(Array.isArray(steps)); // created as an array because the next segment is an index
assert.equal(steps.length, 2);
assert.equal(0 in steps, false); // index 0 is a hole: it was never set
assert.deepEqual(steps[1], { tool: { name: 'erp' } });
assert.equal(getPath(target, 'steps.1.tool.name'), 'erp');
assert.throws(() => setPath({}, '__proto__.polluted', true), /unsafe/);
```

Complexity: O(path length).

#### Follow-ups

- **Immutable set (for React or Redux state)?** Copy each container along the path instead of mutating, so unchanged
  branches keep their identity. Immer does this with proxies.
- **Why is the `in` check needed?** It distinguishes "missing" from "present but undefined" when choosing the fallback.

### Diff two lists of records {medium}

The dashboard polls the run list and must apply only what changed. Given the previous and next arrays of
`{ id, ... }` records, return `added`, `removed` (ids) and `changed` with the fields that differ (`[old, new]` pairs).
Shallow field comparison is enough.

#### Hints

1. Index both lists by id in a `Map`: O(n + m) instead of nested loops.
2. Ids only in `next` are added; only in `prev` are removed; in both, compare fields.
3. Compare the union of both records' keys, so a removed field counts as a change.

#### Solution

```ts
import assert from 'node:assert/strict';

type Rec = { id: string } & Record<string, unknown>;
type Diff = { added: Rec[]; removed: string[]; changed: { id: string; fields: Record<string, [unknown, unknown]> }[] };

function diffRecords(prev: readonly Rec[], next: readonly Rec[]): Diff {
  const before = new Map(prev.map((r) => [r.id, r]));
  const after = new Map(next.map((r) => [r.id, r]));
  const diff: Diff = { added: [], removed: [], changed: [] };

  for (const [id, rec] of after) {
    const old = before.get(id);
    if (!old) {
      diff.added.push(rec);
      continue;
    }
    const fields: Record<string, [unknown, unknown]> = {};
    for (const key of new Set([...Object.keys(old), ...Object.keys(rec)])) {
      if (!Object.is(old[key], rec[key])) fields[key] = [old[key], rec[key]];
    }
    if (Object.keys(fields).length > 0) diff.changed.push({ id, fields });
  }
  for (const id of before.keys()) if (!after.has(id)) diff.removed.push(id);
  return diff;
}

const prev = [
  { id: 'r1', status: 'running', step: 2 },
  { id: 'r2', status: 'queued' },
  { id: 'r3', status: 'done' },
];
const next = [
  { id: 'r1', status: 'running', step: 3 },
  { id: 'r3', status: 'done' },
  { id: 'r4', status: 'queued' },
];
assert.deepEqual(diffRecords(prev, next), {
  added: [{ id: 'r4', status: 'queued' }],
  removed: ['r2'],
  changed: [{ id: 'r1', fields: { step: [2, 3] } }],
});
assert.deepEqual(diffRecords([], []), { added: [], removed: [], changed: [] });
assert.deepEqual(diffRecords([{ id: 'a', x: 1 }], [{ id: 'a' }]).changed, [{ id: 'a', fields: { x: [1, undefined] } }]);
```

Complexity: O(n + m) records times the field count.

#### Follow-ups

- **Better than polling and diffing?** Push deltas with sequence numbers over SSE or WebSockets, and resync with a
  snapshot when a gap is detected ([real-time dashboards](#/realtime-dashboards)).
- **Nested fields?** Use `deepEqual` per field, or flatten records first and diff the dotted keys.

### Aggregate logs: counts per minute and p95 latency {medium}

Parse log lines like `2026-10-14T10:00:03Z level=INFO step=plan ms=120`. Return error and total counts per minute,
and the 95th-percentile latency per step (nearest-rank method). Skip malformed lines and count them.

#### Hints

1. Parse `key=value` pairs after the timestamp into an object; validate the timestamp and `ms`.
2. The minute bucket is the first 16 characters of an ISO timestamp (`2026-10-14T10:00`).
3. Nearest-rank p95: sort the values and take index `ceil(0.95 × n) − 1`.

#### Solution

```ts
import assert from 'node:assert/strict';

type Summary = {
  perMinute: Record<string, { total: number; errors: number }>;
  p95ByStep: Record<string, number>;
  skipped: number;
};

function percentile(values: number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

// Split on the FIRST "=" only: split('=', 2) would silently drop the rest of a value like "q=a=b".
function parsePair(pair: string): [string, string] | null {
  const i = pair.indexOf('=');
  return i > 0 ? [pair.slice(0, i), pair.slice(i + 1)] : null;
}

function summarise(lines: readonly string[]): Summary {
  const perMinute: Summary['perMinute'] = {};
  const latencies = new Map<string, number[]>();
  let skipped = 0;

  for (const line of lines) {
    const [ts, ...pairs] = line.trim().split(/\s+/);
    const fields = Object.fromEntries(pairs.map(parsePair).filter((kv) => kv !== null));
    // A regex, not Number(): Number('') is 0, so "ms=" would count as a 0 ms call.
    const ms = /^\d+(\.\d+)?$/.test(fields.ms ?? '') ? Number(fields.ms) : Number.NaN;
    if (!ts || Number.isNaN(Date.parse(ts)) || !fields.level || !fields.step || Number.isNaN(ms)) {
      skipped++;
      continue;
    }
    const minute = ts.slice(0, 16);
    const bucket = (perMinute[minute] ??= { total: 0, errors: 0 });
    bucket.total++;
    if (fields.level === 'ERROR') bucket.errors++;
    const list = latencies.get(fields.step) ?? [];
    list.push(ms);
    latencies.set(fields.step, list);
  }

  const p95ByStep = Object.fromEntries([...latencies].map(([step, values]) => [step, percentile(values, 95)]));
  return { perMinute, p95ByStep, skipped };
}

const lines = [
  '2026-10-14T10:00:03Z level=INFO step=plan ms=120',
  '2026-10-14T10:00:41Z level=ERROR step=tool ms=3000',
  '2026-10-14T10:01:02Z level=INFO step=tool ms=800',
  ...Array.from({ length: 18 }, (_, i) => `2026-10-14T10:01:${String(10 + i).padStart(2, '0')}Z level=INFO step=plan ms=${100 + i}`),
  'not a log line',
  '2026-10-14T10:02:00Z level=INFO step=plan ms=abc',
  '2026-10-14T10:02:01Z level=INFO step=plan ms=',
];
const s = summarise(lines);
assert.deepEqual(s.perMinute, {
  '2026-10-14T10:00': { total: 2, errors: 1 },
  '2026-10-14T10:01': { total: 19, errors: 0 },
});
assert.equal(s.p95ByStep.tool, 3000);
// plan has 19 values (120 and 100..117): nearest rank ceil(0.95 × 19) = 19, the largest value.
assert.equal(s.p95ByStep.plan, 120);
assert.equal(s.skipped, 3);
assert.deepEqual(parsePair('q=a=b'), ['q', 'a=b']);
```

Work the percentile arithmetic out loud before asserting it; off-by-one ranks are the usual slip. A few unit checks of
the percentile helper on its own:

```ts
import assert from 'node:assert/strict';

function percentile(values: number[], p: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

const plan = [120, ...Array.from({ length: 18 }, (_, i) => 100 + i)];
assert.equal(plan.length, 19);
assert.equal(percentile(plan, 95), 120); // rank 19 of 19
assert.equal(percentile(plan, 50), 109); // rank ceil(9.5) = 10 → the 10th smallest
assert.equal(percentile([5], 95), 5);
assert.equal(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 95), 95);
```

Complexity: O(n) to parse plus O(k log k) per step to sort its k latencies.

#### Follow-ups

- **Millions of lines a minute?** Do not keep every latency: use a histogram with fixed buckets or a sketch (t-digest,
  HDR histogram), which is what Cloud Monitoring distributions do.
- **Time zones?** ISO timestamps with `Z` are UTC; bucket in UTC and convert only for display.

### Route matcher with parameters {medium}

Write a tiny router: register patterns such as `/runs/:runId/steps/:stepId` and `/files/*`, then `match(path)` returns
the first matching route's name and decoded params, ignoring a trailing slash and the query string.
`/runs/r%201/steps/s2?x=1` → `{ name: 'step', params: { runId: 'r 1', stepId: 's2' } }`.

#### Hints

1. Split pattern and path into segments, dropping empty ones (this handles leading and trailing slashes).
2. `:name` captures one segment; `*` captures the rest; anything else must match exactly.
3. Strip `?query` and `#hash` first, and `decodeURIComponent` each captured value.

#### Solution

```ts
import assert from 'node:assert/strict';

type Match = { name: string; params: Record<string, string> };

class Router {
  private routes: { name: string; segments: string[] }[] = [];

  add(name: string, pattern: string): this {
    this.routes.push({ name, segments: pattern.split('/').filter(Boolean) });
    return this;
  }

  match(url: string): Match | null {
    const path = url.split(/[?#]/, 1)[0];
    const parts = path.split('/').filter(Boolean);
    for (const route of this.routes) {
      const params: Record<string, string> = {};
      let matched = true;
      for (let i = 0; i < route.segments.length; i++) {
        const seg = route.segments[i];
        if (seg === '*') {
          params['*'] = parts.slice(i).map(decodeURIComponent).join('/');
          return { name: route.name, params };
        }
        if (i >= parts.length) {
          matched = false;
          break;
        }
        if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) {
          matched = false;
          break;
        }
      }
      if (matched && route.segments.length === parts.length) return { name: route.name, params };
    }
    return null;
  }
}

const router = new Router()
  .add('runs', '/runs')
  .add('run', '/runs/:runId')
  .add('step', '/runs/:runId/steps/:stepId')
  .add('files', '/files/*');

assert.deepEqual(router.match('/runs/r%201/steps/s2?x=1'), { name: 'step', params: { runId: 'r 1', stepId: 's2' } });
assert.deepEqual(router.match('/runs/'), { name: 'runs', params: {} });
assert.deepEqual(router.match('/runs/r9'), { name: 'run', params: { runId: 'r9' } });
assert.deepEqual(router.match('/files/a/b.txt'), { name: 'files', params: { '*': 'a/b.txt' } });
assert.equal(router.match('/runs/r1/logs'), null);
assert.equal(router.match('/'), null);
```

Complexity: O(routes × segments) per match.

#### Follow-ups

- **Specificity instead of registration order?** Rank static segments above params above wildcards, or build a radix
  tree, as `find-my-way` (Fastify) does.
- **Malformed percent-encoding** (`%E0%A4%A`) makes `decodeURIComponent` throw. Catch it and return a 400.

### Render a template safely {easy}

Write `render(template, data)` that replaces `{{ path.to.value }}` with values from `data`, HTML-escaping them by
default. Missing values render as an empty string, or throw when `strict` is set. This is the core of notification
emails and approval prompts.

#### Hints

1. One `replace` with a global regex and a callback; trim the captured path.
2. Look up dotted paths by splitting on `.` and walking the object.
3. Escape `& < > " '` so data cannot inject HTML.

#### Solution

```ts
import assert from 'node:assert/strict';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

// Own properties only, so {{ user.constructor }} cannot reach into the prototype chain.
function lookup(data: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node !== null && typeof node === 'object' && Object.hasOwn(node, key) ? (node as Record<string, unknown>)[key] : undefined), data);
}

function render(template: string, data: Record<string, unknown>, { strict = false } = {}): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path: string) => {
    const value = lookup(data, path);
    if (value === undefined || value === null) {
      if (strict) throw new Error(`missing value for ${path}`);
      return '';
    }
    return escapeHtml(String(value));
  });
}

const data = { user: { name: 'Ana <script>' }, run: { id: 'r1', cost: 0 } };
assert.equal(render('Hi {{ user.name }}, run {{run.id}} cost ${{ run.cost }}', data), 'Hi Ana &lt;script&gt;, run r1 cost $0');
assert.equal(render('Missing: [{{ nope.here }}]', data), 'Missing: []');
assert.throws(() => render('{{ nope }}', data, { strict: true }), /missing value for nope/);
assert.equal(render('no tags', data), 'no tags');
assert.equal(render('[{{ user.constructor }}]', data), '[]'); // no prototype leakage
```

Complexity: O(template length + total path lengths).

#### Follow-ups

- **Why escape by default?** Values often come from users or from an LLM, and an approval email that renders injected
  HTML is a phishing vector. Make "raw" output an explicit opt-in.
- **Plain-text channels** (Slack, SMS) need different escaping than HTML; escape for the output context.

### Order pipeline steps, in parallel stages {medium core}

Each step lists the steps it depends on. Return the steps grouped into stages, where every step in a stage depends only
on earlier stages (so a stage can run in parallel), with names sorted inside each stage. Throw on an unknown dependency
or a cycle, naming the steps involved.

```text
fetch → []      parse → [fetch]   embed → [parse]   classify → [parse]   store → [embed, classify]
→ [['fetch'], ['parse'], ['classify', 'embed'], ['store']]
```

#### Hints

1. Kahn's algorithm: count incoming edges (in-degree) per step and start with every step whose in-degree is 0.
2. Process one whole "ready" layer at a time to get stages: remove the layer, decrement its dependants, collect the next layer.
3. If steps remain but nothing is ready, those steps form or depend on a cycle.

#### Solution

Layer-by-layer Kahn gives both a valid order and the parallel stages a scheduler needs.

```ts
import assert from 'node:assert/strict';

function stages(deps: Record<string, readonly string[]>): string[][] {
  const inDegree = new Map<string, number>();
  const dependants = new Map<string, string[]>();
  for (const step of Object.keys(deps)) {
    inDegree.set(step, inDegree.get(step) ?? 0);
    for (const dep of deps[step]) {
      // Object.hasOwn, not `in`: "toString" in {} is true, which would hide a typo as a fake cycle.
      if (!Object.hasOwn(deps, dep)) throw new Error(`${step} depends on unknown step ${dep}`);
      inDegree.set(step, (inDegree.get(step) ?? 0) + 1);
      const list = dependants.get(dep) ?? [];
      list.push(step);
      dependants.set(dep, list);
    }
  }

  const result: string[][] = [];
  let ready = [...inDegree].filter(([, d]) => d === 0).map(([s]) => s).sort();
  let placed = 0;
  while (ready.length > 0) {
    result.push(ready);
    placed += ready.length;
    const next: string[] = [];
    for (const step of ready) {
      for (const child of dependants.get(step) ?? []) {
        const d = (inDegree.get(child) as number) - 1;
        inDegree.set(child, d);
        if (d === 0) next.push(child);
      }
    }
    ready = next.sort();
  }

  if (placed < inDegree.size) {
    const stuck = [...inDegree].filter(([, d]) => d > 0).map(([s]) => s).sort();
    throw new Error(`cycle involving: ${stuck.join(', ')}`);
  }
  return result;
}

assert.deepEqual(stages({ fetch: [], parse: ['fetch'], embed: ['parse'], classify: ['parse'], store: ['embed', 'classify'] }), [
  ['fetch'],
  ['parse'],
  ['classify', 'embed'],
  ['store'],
]);
assert.deepEqual(stages({}), []);
assert.deepEqual(stages({ b: [], a: [] }), [['a', 'b']]);
assert.throws(() => stages({ a: ['b'], b: ['a'], c: [] }), /cycle involving: a, b/);
assert.throws(() => stages({ a: ['ghost'] }), /unknown step ghost/);
assert.throws(() => stages({ a: ['toString'] }), /unknown step toString/);
```

Complexity: O(V + E) plus sorting each stage.

#### Follow-ups

- **Only one order needed?** Same algorithm with a single queue; or DFS post-order reversed.
- **Steps have durations; what is the earliest finish?** The critical path: the longest path through the DAG, computed
  in topological order.
- **Where does this appear?** Pipeline schedulers (Airflow, Cloud Workflows), build systems, agent plans with dependent
  tool calls, and migrations.

### Merge execution intervals and find idle gaps {medium core}

Given executions as `[start, end]` timestamps (in any order, possibly overlapping), return the merged busy intervals,
the total busy time, and the idle gaps between them. `[[1,3],[2,6],[8,10],[9,12],[15,15]]` → busy
`[[1,6],[8,12],[15,15]]`, total 9, gaps `[[6,8],[12,15]]`.

#### Hints

1. Sort by start time.
2. Walk the sorted list: if an interval starts at or before the current end, extend the end; otherwise close the current
   interval and start a new one.
3. Gaps are the spaces between consecutive merged intervals.

#### Solution

```ts
import assert from 'node:assert/strict';

type Interval = [start: number, end: number];

function mergeIntervals(intervals: readonly Interval[]): { busy: Interval[]; total: number; gaps: Interval[] } {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const busy: Interval[] = [];
  for (const [start, end] of sorted) {
    if (end < start) throw new RangeError(`invalid interval [${start}, ${end}]`);
    const last = busy[busy.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else busy.push([start, end]);
  }
  const total = busy.reduce((sum, [s, e]) => sum + (e - s), 0);
  const gaps: Interval[] = [];
  for (let i = 1; i < busy.length; i++) gaps.push([busy[i - 1][1], busy[i][0]]);
  return { busy, total, gaps };
}

assert.deepEqual(mergeIntervals([[8, 10], [1, 3], [15, 15], [2, 6], [9, 12]]), {
  busy: [[1, 6], [8, 12], [15, 15]],
  total: 9,
  gaps: [[6, 8], [12, 15]],
});
assert.deepEqual(mergeIntervals([[1, 2], [2, 3]]).busy, [[1, 3]]); // touching intervals merge
assert.deepEqual(mergeIntervals([]), { busy: [], total: 0, gaps: [] });
assert.throws(() => mergeIntervals([[5, 1]]), RangeError);
```

Complexity: O(n log n) for the sort, O(n) for the sweep.

#### Follow-ups

- **What is the peak number of concurrent executions?** Sweep line: turn each interval into +1 at start and −1 at end,
  sort the events, and track the running sum.
- **Do touching intervals merge?** Ask. Here `[1,2]` and `[2,3]` merge; change `<=` to `<` if they should not.

### Read every page from a cursor-paginated API {easy}

An enterprise API returns `{ items, nextCursor }` pages. Write an async generator `paginate(fetchPage)` that yields
items one by one across pages, stopping when `nextCursor` is null, and an option to stop after `maxPages` as a safety
limit.

#### Hints

1. An `async function*` lets callers use `for await` and stop early with `break`, which ends the generator.
2. Loop: fetch a page with the current cursor, `yield*` its items, move to the next cursor.
3. Guard against an API that keeps returning the same cursor.

#### Solution

The generator fetches lazily: if the caller stops after 10 items, no further pages are requested.

```ts
import assert from 'node:assert/strict';

type Page<T> = { items: T[]; nextCursor: string | null };

async function* paginate<T>(fetchPage: (cursor: string | null) => Promise<Page<T>>, { maxPages = 1_000 } = {}): AsyncGenerator<T> {
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < maxPages; page++) {
    const { items, nextCursor } = await fetchPage(cursor);
    yield* items;
    if (nextCursor === null) return;
    if (seen.has(nextCursor)) throw new Error(`cursor ${nextCursor} repeated`);
    seen.add(nextCursor);
    cursor = nextCursor;
  }
}

const data = Array.from({ length: 7 }, (_, i) => `po-${i + 1}`);
let requests = 0;
const fakeApi = async (cursor: string | null): Promise<Page<string>> => {
  requests++;
  const start = cursor ? Number(cursor) : 0;
  const end = Math.min(start + 3, data.length);
  return { items: data.slice(start, end), nextCursor: end < data.length ? String(end) : null };
};

const all: string[] = [];
for await (const po of paginate(fakeApi)) all.push(po);
assert.deepEqual(all, data);
assert.equal(requests, 3);

requests = 0;
for await (const po of paginate(fakeApi)) {
  if (po === 'po-2') break; // stop early: only one page fetched
}
assert.equal(requests, 1);

const stuck = async (): Promise<Page<number>> => ({ items: [1], nextCursor: 'same' });
await assert.rejects(async () => {
  for await (const n of paginate(stuck)) void n;
}, /repeated/);
```

Complexity: O(items) time; O(page size) memory, because items stream through.

#### Follow-ups

- **Rate limits?** `await bucket.take()` before each page ([token bucket](#/code-async)).
- **Why cursors rather than offsets?** Offsets skip or repeat items when data changes between pages; a cursor (often an
  encoded last id or timestamp) is stable, and keyset queries make it fast ([PostgreSQL](#/postgres)).
