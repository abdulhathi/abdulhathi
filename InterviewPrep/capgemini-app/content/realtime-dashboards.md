---
title: Real-time operational dashboards
goal: Design and build dashboards that show live agent-pipeline progress, logs and telemetry without missing updates, freezing the browser or pretending stale data is live.
minutes: 55
---

The JD asks you to "design rich operational dashboards to visualize real-time pipeline progress, execution logs, and
system telemetry." On an agent platform that means: a list of runs with live status, a run detail page with a
pipeline graph of steps, a tailing log viewer, and charts of latency, token usage, errors and queue depth. Interviewers
probe three things: how updates reach the browser without gaps or duplicates, how the UI survives a firehose of
events, and how users can tell whether what they see is current.

Every TypeScript block that is not a component runs under Node with assertions. The streaming transports themselves
are covered in [Server-Sent Events](#/sse) and [WebSockets](#/websockets).

## What the dashboard shows, and the data behind it

| View | Data | Update pattern |
|---|---|---|
| Runs list | `Run { id, status, currentStep, progress, updatedAt }` | Status changes: a few per run per minute |
| Run detail | Steps forming a DAG, each with status, timings, attempts | Step transitions, tool calls |
| Log viewer | Log lines `{ seq, ts, level, step, message, traceId }` | Bursty: hundreds per second during heavy work |
| Telemetry | Time series: latency, tokens/s, error rate, queue depth | Regular samples, for example every 5 s |
| Alerts | Failed runs, stuck approvals, SLO burn | Rare, but must not be missed |

The update patterns differ, so the handling differs: **status** is "latest value wins" and can be coalesced, **logs**
are append-only and need a bounded buffer, **metrics** are sampled and can be downsampled, and **alerts** must be
delivered reliably and announced.

## Push or poll?

| Option | Good for | Watch out for |
|---|---|---|
| Polling (TanStack Query `refetchInterval`) | Low-frequency views, many viewers (cacheable responses), simplest to operate | Wasted requests when nothing changes; latency up to the interval |
| Long polling | Environments where streaming is blocked | Reconnect per message; mostly replaced by SSE |
| SSE (`EventSource`) | One-way server push: run status, logs. Built-in reconnect with `Last-Event-ID` | Read-only. Six connections per origin on HTTP/1.1, so use HTTP/2 |
| WebSocket | Many subscriptions over one connection, client messages (subscribe, pause, filter) | You build reconnect, heartbeats and resubscribe yourself; stateful servers to scale |
| Firestore `onSnapshot` listeners | Live documents without running a socket tier | Cost per document read; you model data around listeners |

A dashboard is mostly server-to-client, so SSE is a strong default. Choose WebSockets when the client must
change subscriptions often (open a run, change a log filter, pause) over one connection. Poll the slow-moving views. Mixing
is normal: the runs list polls every 10 s while an open run detail page streams.

## Snapshot plus deltas, with sequence numbers

The core correctness problem: the client must never **miss** an update and never **apply one twice**. The standard
pattern:

1. **Subscribe first**, and buffer incoming deltas.
2. **Fetch a snapshot** that carries the sequence number it reflects (`seq: 1040`).
3. **Apply buffered deltas** with `seq > 1040` in order, discard the rest, then apply live deltas as they come.
4. A delta with `seq <= current` is a **duplicate** (after a reconnect, for example) and is ignored.
5. A delta with `seq > current + 1` reveals a **gap**: buffer it briefly in case the missing one is just late, and if
   the gap does not fill (or the buffer overflows), **resync** by fetching a fresh snapshot.

The store below also separates *applying* data from *notifying* React: deltas are applied to a Map immediately (cheap),
but subscribers are notified at most once per scheduled flush. That is the throttling layer, covered in the next section.

```ts
import assert from 'node:assert/strict';

export type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'cancelled';
export type Run = { id: string; status: RunStatus; step: string; progress: number };
export type Delta = { seq: number; run: Run }; // the run's new state ("latest value wins")
export type Snapshot = { seq: number; runs: Run[] };
export type ApplyResult = 'applied' | 'duplicate' | 'buffered' | 'resync';

type Options = { maxBuffered?: number; schedule?: (flush: () => void) => void };

export function createRunStore({ maxBuffered = 200, schedule = (f) => setTimeout(f, 100) }: Options = {}) {
  let seq: number | null = null; // null until the first snapshot arrives
  let runs = new Map<string, Run>();
  const pending = new Map<number, Delta>(); // deltas that arrived early or before the snapshot
  const listeners = new Set<() => void>();
  let cached: Run[] | null = null;
  let flushQueued = false;

  const notify = () => {
    cached = null;
    if (flushQueued) return;
    flushQueued = true;
    schedule(() => {
      flushQueued = false;
      listeners.forEach((l) => l());
    });
  };

  const drain = () => {
    while (seq !== null && pending.has(seq + 1)) {
      const next = pending.get(seq + 1)!;
      pending.delete(seq + 1);
      runs.set(next.run.id, next.run);
      seq = next.seq;
    }
  };

  return {
    load(snapshot: Snapshot) {
      seq = snapshot.seq;
      runs = new Map(snapshot.runs.map((r) => [r.id, r]));
      for (const s of [...pending.keys()]) if (s <= snapshot.seq) pending.delete(s);
      drain();
      notify();
    },
    apply(delta: Delta): ApplyResult {
      if (seq !== null && delta.seq <= seq) return 'duplicate';
      if (seq === null || delta.seq > seq + 1) {
        pending.set(delta.seq, delta);
        return pending.size > maxBuffered ? 'resync' : 'buffered';
      }
      runs.set(delta.run.id, delta.run);
      seq = delta.seq;
      drain();
      notify();
      return 'applied';
    },
    hasGap: () => pending.size > 0,
    get seq() {
      return seq;
    },
    // useSyncExternalStore contract: subscribe returns an unsubscribe, getSnapshot returns
    // the SAME array until something changes (a new array every call would re-render forever).
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): Run[] {
      cached ??= [...runs.values()];
      return cached;
    },
  };
}

// --- checks: a manual scheduler stands in for requestAnimationFrame / setTimeout ---
const queue: (() => void)[] = [];
const store = createRunStore({ maxBuffered: 3, schedule: (f) => queue.push(f) });
let renders = 0;
store.subscribe(() => renders++);
const run = (id: string, status: RunStatus, progress = 0): Run => ({ id, status, step: 'plan', progress });

// Deltas that arrive before the snapshot are buffered, then reconciled against it.
assert.equal(store.apply({ seq: 10, run: run('r1', 'running', 10) }), 'buffered'); // already in the snapshot
assert.equal(store.apply({ seq: 11, run: run('r1', 'running', 20) }), 'buffered'); // newer than the snapshot
store.load({ seq: 10, runs: [run('r1', 'running', 10), run('r2', 'queued')] });
assert.equal(store.seq, 11);
assert.equal(store.getSnapshot().find((r) => r.id === 'r1')?.progress, 20);

// In order, duplicate, and out of order.
assert.equal(store.apply({ seq: 12, run: run('r2', 'running') }), 'applied');
assert.equal(store.apply({ seq: 12, run: run('r2', 'running') }), 'duplicate');
assert.equal(store.apply({ seq: 14, run: run('r2', 'succeeded', 100) }), 'buffered'); // 13 is missing
assert.equal(store.hasGap(), true);
assert.equal(store.apply({ seq: 13, run: run('r2', 'running', 90) }), 'applied'); // fills the gap, 14 drains
assert.equal(store.seq, 14);
assert.equal(store.getSnapshot().find((r) => r.id === 'r2')?.status, 'succeeded');
assert.equal(store.hasGap(), false);

// getSnapshot is stable until a change; many changes cause ONE notification per flush.
assert.equal(store.getSnapshot(), store.getSnapshot());
assert.equal(queue.length, 1);
queue.shift()!();
assert.equal(renders, 1);

// A gap that keeps growing asks for a resync.
store.apply({ seq: 20, run: run('r3', 'queued') });
store.apply({ seq: 21, run: run('r3', 'running') });
store.apply({ seq: 22, run: run('r3', 'running', 50) });
assert.equal(store.apply({ seq: 23, run: run('r3', 'running', 60) }), 'resync');
console.log('delta store ok');
```

Two refinements to mention: the server should send **full entity state** in each delta where it can ("run r2 is now
succeeded at 100%") rather than increments ("progress +10"), because full-state deltas are idempotent and can be
coalesced. And the gap timer (resync if a gap is still open after, say, two seconds) belongs in the transport layer,
next to the reconnect logic.

## Throttling, coalescing and backpressure in the browser

An agent run can emit hundreds of events per second. React can render perhaps 60 times a second, and only if each
render is cheap. Strategies:

- **Apply fast, render slow.** Apply every event to a plain data structure as it arrives (Map writes and array pushes
  are microseconds), and notify React on a schedule: once per animation frame, or every 100–250 ms for tables, which
  people cannot read faster anyway.
- **Coalesce by key.** Ten status updates to the same run within one flush render as one.
- **Bound what you keep.** Logs go into a ring buffer with a "N older lines dropped" indicator; metrics keep a fixed
  time window.
- **Degrade on purpose.** When the queue is still growing after a flush, switch to sampling (render every Nth log line
  and show "showing 1 in 10"), or pause rendering and let the user resume.
- **Push back on the server.** The browser cannot slow a socket down, but the protocol can: the client sends "pause",
  "lower the log level" or "metrics every 10 s". Servers should also aggregate before sending (one progress event per
  second per run, not one per token).
- **Hidden tabs.** Browsers stop running `requestAnimationFrame` in hidden tabs and throttle timers. In Chrome, timers
  in a hidden page wake at most once per second; once the page has been hidden for more than 5 minutes, silent for 30
  seconds and not using WebRTC, chained timers (a chain of 5 or more) wake only once per minute. WebSocket and SSE
  messages still arrive, and a tab that the browser later freezes or discards loses its connection altogether. So either
  keep applying events to the store without rendering, or unsubscribe when `visibilityState` becomes hidden and
  **resync from a snapshot** when the tab is visible again. The resync is simpler and cheaper.

```ts
import assert from 'node:assert/strict';

/** Keeps the newest `capacity` items; counts what it had to drop. */
export class RingBuffer<T> {
  private items: (T | undefined)[];
  private start = 0;
  private count = 0;
  private readonly capacity: number;
  dropped = 0;

  constructor(capacity: number) {
    if (capacity < 1) throw new RangeError('capacity must be at least 1');
    this.capacity = capacity;
    this.items = new Array<T | undefined>(capacity);
  }

  push(...values: T[]): void {
    for (const value of values) {
      if (this.count < this.capacity) {
        this.items[(this.start + this.count) % this.capacity] = value;
        this.count++;
      } else {
        this.items[this.start] = value; // overwrite the oldest
        this.start = (this.start + 1) % this.capacity;
        this.dropped++;
      }
    }
  }

  get size(): number {
    return this.count;
  }

  /** Item i, where 0 is the oldest still kept. O(1), which is what a virtualised list needs. */
  at(i: number): T | undefined {
    return i >= 0 && i < this.count ? this.items[(this.start + i) % this.capacity] : undefined;
  }

  toArray(): T[] {
    return Array.from({ length: this.count }, (_, i) => this.at(i) as T);
  }
}

const logs = new RingBuffer<string>(3);
logs.push('a', 'b');
assert.deepEqual(logs.toArray(), ['a', 'b']);
logs.push('c', 'd', 'e');
assert.deepEqual(logs.toArray(), ['c', 'd', 'e']);
assert.equal(logs.dropped, 2);
assert.equal(logs.at(0), 'c');
assert.equal(logs.at(3), undefined);
assert.throws(() => new RingBuffer(0), RangeError);
console.log('ring buffer ok');
```

## Showing 100,000 log lines: virtualisation

Rendering 100,000 DOM rows freezes the page; rendering the 30 that are visible does not. A **virtualised** (windowed)
list renders only the rows in view plus a few above and below (**overscan**), inside a spacer that has the full height,
so the scrollbar still looks right. With a fixed row height the math is four lines.

```ts
import assert from 'node:assert/strict';

type Window = { start: number; end: number; offsetTop: number; totalHeight: number };

/** Rows [start, end) to render for a fixed row height, with `overscan` extra rows on each side. */
export function visibleRange(scrollTop: number, viewportHeight: number, rowHeight: number, total: number, overscan = 5): Window {
  const totalHeight = total * rowHeight;
  if (total === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight };
  const first = Math.floor(scrollTop / rowHeight);
  const last = Math.ceil((scrollTop + viewportHeight) / rowHeight); // exclusive
  const start = Math.max(0, Math.min(first - overscan, total - 1));
  const end = Math.min(total, last + overscan);
  return { start, end, offsetTop: start * rowHeight, totalHeight };
}

/** True when the viewport shows the last row, which is when "follow tail" should stay on. */
export const isAtBottom = (scrollTop: number, viewportHeight: number, totalHeight: number, slack = 4) =>
  totalHeight - (scrollTop + viewportHeight) <= slack;

assert.deepEqual(visibleRange(0, 400, 20, 100_000), { start: 0, end: 25, offsetTop: 0, totalHeight: 2_000_000 });
assert.deepEqual(visibleRange(1000, 400, 20, 100_000), { start: 45, end: 75, offsetTop: 900, totalHeight: 2_000_000 });
assert.deepEqual(visibleRange(1_999_600, 400, 20, 100_000), { start: 99_975, end: 100_000, offsetTop: 1_999_500, totalHeight: 2_000_000 });
assert.deepEqual(visibleRange(0, 400, 20, 0), { start: 0, end: 0, offsetTop: 0, totalHeight: 0 });
assert.equal(isAtBottom(1_999_600, 400, 2_000_000), true);
assert.equal(isAtBottom(1_000_000, 400, 2_000_000), false);
console.log('windowing ok');
```

Variable row heights (wrapped log lines, expanded JSON) need measurement: libraries such as TanStack Virtual estimate a
height, measure rows as they render, and correct the offsets. Two browser limits are worth knowing: elements cannot be
infinitely tall (browsers cap element height at a few million to tens of millions of pixels, depending on the engine), so
for millions of lines you page or scale the scroll position; and **follow tail** only works if new lines scroll into
view without fighting a user who has scrolled up.

The component below ties it together: windowed rows from the ring buffer, follow-tail that turns off when the user
scrolls up, a "N new lines" button, and a Pause control. Pausing matters for accessibility, not just convenience:
WCAG 2.2.2 (Pause, Stop, Hide) asks that auto-updating content can be paused.

```tsx
import { useDeferredValue, useLayoutEffect, useMemo, useRef, useState } from 'react';

type LogLine = { seq: number; ts: string; level: 'debug' | 'info' | 'warn' | 'error'; step: string; message: string };

// From the windowing section above.
declare function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan?: number,
): { start: number; end: number; offsetTop: number; totalHeight: number };

const ROW = 20;
const VIEWPORT = 480;

export function LogViewer({ lines, dropped }: { lines: LogLine[]; dropped: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [follow, setFollow] = useState(true);
  const [frozen, setFrozen] = useState<LogLine[] | null>(null); // the lines captured when the user pressed Pause
  const [filter, setFilter] = useState('');
  const source = frozen ?? lines;

  // useMemo matters here: on a keystroke React first renders with the OLD deferred filter, and the memo lets that
  // urgent render reuse the previous result instead of filtering the whole log again.
  const deferredFilter = useDeferredValue(filter.toLowerCase());
  const shown = useMemo(
    () => (deferredFilter ? source.filter((l) => l.message.toLowerCase().includes(deferredFilter)) : source),
    [source, deferredFilter],
  );
  const { start, end, offsetTop, totalHeight } = visibleRange(scrollTop, VIEWPORT, ROW, shown.length);
  const below = follow ? 0 : Math.max(0, shown.length - Math.ceil((scrollTop + VIEWPORT) / ROW));

  useLayoutEffect(() => {
    if (follow && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [follow, shown.length]);

  return (
    <section aria-label="Run logs">
      <div className="log-toolbar">
        <label htmlFor="log-filter">Filter</label>
        <input id="log-filter" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        {/* The label changes, so no aria-pressed: "Resume, pressed" would be confusing. */}
        <button type="button" onClick={() => setFrozen(frozen ? null : lines)}>
          {frozen ? 'Resume' : 'Pause'}
        </button>
        {dropped > 0 && <span>{dropped.toLocaleString()} older lines not shown</span>}
      </div>
      <div
        ref={ref}
        className="log-viewport"
        style={{ height: VIEWPORT, overflowY: 'auto', fontFamily: 'monospace' }}
        tabIndex={0}
        role="region"
        aria-label="Log lines"
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollTop(el.scrollTop);
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight <= 4);
        }}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <ol style={{ position: 'absolute', top: offsetTop, left: 0, right: 0, margin: 0, padding: 0, listStyle: 'none' }}>
            {shown.slice(start, end).map((l) => (
              <li key={l.seq} style={{ height: ROW, whiteSpace: 'nowrap' }} className={`log-${l.level}`}>
                <time dateTime={l.ts}>{l.ts.slice(11, 23)}</time> <strong>{l.level.toUpperCase()}</strong> [{l.step}] {l.message}
              </li>
            ))}
          </ol>
        </div>
      </div>
      {below > 0 && (
        <button type="button" onClick={() => setFollow(true)}>
          {below} more lines below, jump to latest
        </button>
      )}
    </section>
  );
}
```

The level is written as text (`ERROR`), not only shown as a colour, because colour alone does not reach colour-blind
users or screen readers (WCAG 1.4.1). Keys are the log sequence numbers, which are stable as the window moves.

## Pipeline progress as a graph

An agent run is often a DAG: plan, then three tool calls in parallel, then an approval, then a write to an external
system. The dashboard needs **layers** to draw it (a step sits one column to the right of its deepest dependency), and a
**summary**: what is running, what is ready to start, and what is blocked behind a failure.

```ts
import assert from 'node:assert/strict';

type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';
type Step = { id: string; deps: string[]; status: StepStatus };

/** Kahn's algorithm: steps grouped by depth (column). Throws on a cycle or an unknown dependency. */
export function layers(steps: Step[]): string[][] {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const indegree = new Map(steps.map((s) => [s.id, s.deps.length]));
  const children = new Map<string, string[]>(steps.map((s) => [s.id, []]));
  for (const s of steps) {
    for (const d of s.deps) {
      if (!byId.has(d)) throw new Error(`${s.id} depends on unknown step ${d}`);
      children.get(d)!.push(s.id);
    }
  }
  const depth = new Map<string, number>();
  let frontier = steps.filter((s) => s.deps.length === 0).map((s) => s.id);
  frontier.forEach((id) => depth.set(id, 0));
  let seen = 0;
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      seen++;
      for (const child of children.get(id)!) {
        depth.set(child, Math.max(depth.get(child) ?? 0, depth.get(id)! + 1));
        indegree.set(child, indegree.get(child)! - 1);
        if (indegree.get(child) === 0) next.push(child);
      }
    }
    frontier = next;
  }
  if (seen !== steps.length) throw new Error('the pipeline has a cycle');
  const out: string[][] = [];
  for (const s of steps) (out[depth.get(s.id)!] ??= []).push(s.id);
  return out;
}

/** What the progress panel shows. A step is blocked if any dependency failed or is itself blocked. */
export function summarise(steps: Step[]) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const blocked = new Set<string>();
  for (const id of layers(steps).flat()) {
    const s = byId.get(id)!;
    if (s.status === 'pending' && s.deps.some((d) => byId.get(d)!.status === 'failed' || blocked.has(d))) blocked.add(id);
  }
  const finished = steps.filter((s) => s.status === 'succeeded' || s.status === 'skipped').length;
  return {
    percent: steps.length ? Math.round((finished / steps.length) * 100) : 0, // an empty pipeline is 0%, not NaN
    running: steps.filter((s) => s.status === 'running').map((s) => s.id),
    ready: steps
      .filter((s) => s.status === 'pending' && !blocked.has(s.id) && s.deps.every((d) => ['succeeded', 'skipped'].includes(byId.get(d)!.status)))
      .map((s) => s.id),
    blocked: [...blocked],
    failed: steps.filter((s) => s.status === 'failed').map((s) => s.id),
  };
}

const pipeline: Step[] = [
  { id: 'plan', deps: [], status: 'succeeded' },
  { id: 'search_tickets', deps: ['plan'], status: 'succeeded' },
  { id: 'lookup_po', deps: ['plan'], status: 'failed' },
  { id: 'check_budget', deps: ['plan'], status: 'running' },
  { id: 'approve', deps: ['search_tickets', 'check_budget'], status: 'pending' },
  { id: 'create_po', deps: ['approve', 'lookup_po'], status: 'pending' },
  { id: 'notify', deps: ['create_po'], status: 'pending' },
];
assert.deepEqual(layers(pipeline), [['plan'], ['search_tickets', 'lookup_po', 'check_budget'], ['approve'], ['create_po'], ['notify']]);
assert.deepEqual(summarise(pipeline), {
  percent: 29, // 2 of 7 finished
  running: ['check_budget'],
  ready: [], // approve still waits for check_budget
  blocked: ['create_po', 'notify'], // lookup_po failed
  failed: ['lookup_po'],
});
assert.throws(() => layers([{ id: 'a', deps: ['b'], status: 'pending' }, { id: 'b', deps: ['a'], status: 'pending' }]), /cycle/);
assert.throws(() => layers([{ id: 'a', deps: ['ghost'], status: 'pending' }]), /unknown/);
assert.equal(summarise([]).percent, 0);
console.log('dag ok');
```

Percent complete by step count is honest but crude. If the backend records typical durations per step type, weight the
progress by expected duration, and show an estimate only when you have data for it.

## Telemetry charts

- **Keep a time window**, not an ever-growing array: the last 15 minutes in a ring buffer or a trimmed array.
- **Downsample for display.** A chart 600 pixels wide cannot show 50,000 points. Bucket by pixel and keep the min and
  max of each bucket, so spikes survive (an average would hide the one 9-second latency that matters). LTTB
  (Largest-Triangle-Three-Buckets) is another common choice that preserves the visual shape.
- **Canvas for many points, SVG for few.** SVG is easy to style and accessible, but thousands of DOM nodes are slow;
  canvas draws tens of thousands of points cheaply. Libraries: Recharts or visx (SVG), ECharts or uPlot (canvas).
- **Label honestly**: units on axes, the aggregation used ("p95 per minute"), the time zone, and gaps shown as gaps
  rather than lines drawn through missing data.
- **Give charts a text alternative**: a summary ("p95 latency 1.8 s, up 40% in the last 10 minutes") and a link to the
  data as a table.

```ts
import assert from 'node:assert/strict';

type Point = readonly [t: number, v: number];

/** Keeps the min and max point of each bucket (in time order), so spikes survive downsampling. */
export function downsampleMinMax(points: Point[], buckets: number): Point[] {
  if (!Number.isInteger(buckets) || buckets < 1) throw new RangeError('buckets must be a positive integer');
  if (points.length <= buckets * 2) return points;
  const size = points.length / buckets;
  const out: Point[] = [];
  for (let b = 0; b < buckets; b++) {
    const slice = points.slice(Math.floor(b * size), Math.floor((b + 1) * size));
    if (!slice.length) continue;
    let min = slice[0];
    let max = slice[0];
    for (const p of slice) {
      if (p[1] < min[1]) min = p;
      if (p[1] > max[1]) max = p;
    }
    if (min === max) out.push(min);
    else out.push(...(min[0] < max[0] ? [min, max] : [max, min]));
  }
  return out;
}

/** Drops points older than the window; assumes points are in time order. */
export function trimWindow(points: Point[], now: number, windowMs: number): Point[] {
  const cutoff = now - windowMs;
  const first = points.findIndex(([t]) => t >= cutoff);
  return first === -1 ? [] : points.slice(first);
}

const latency: Point[] = Array.from({ length: 1000 }, (_, i) => [i * 1000, i === 437 ? 9000 : 200 + (i % 7)] as const);
const shown = downsampleMinMax(latency, 50);
assert.ok(shown.length <= 100);
assert.ok(shown.some(([, v]) => v === 9000), 'the spike survives');
assert.ok(shown.every((p, i) => i === 0 || p[0] > shown[i - 1][0]), 'points stay in time order');
assert.equal(downsampleMinMax(latency.slice(0, 10), 50).length, 10); // small series are left alone
assert.throws(() => downsampleMinMax(latency, 0), RangeError);
assert.equal(trimWindow(latency, 999_000, 60_000).length, 61);
assert.deepEqual(trimWindow(latency, 5_000_000, 60_000), []);
console.log('downsampling ok');
```

## Freshness: never show stale data as live

Users make decisions from dashboards ("the run is still going, I'll wait"), so a dead connection that still displays
the last values is a real bug. Rules:

- Show a **connection state**: Live, Reconnecting (with attempt count), Offline, and Stale.
- Judge staleness by **time since the last message received**, measured with the client's own clock, never by comparing
  server timestamps with the client clock (clocks drift). Servers send heartbeats (every 15–30 s), so silence longer
  than two heartbeats means trouble even if the socket looks open.
- When stale, **dim the data and say how old it is** ("Last update 2 min ago"). Do not keep animating spinners as if
  progress were happening.
- After reconnecting, **resync** (snapshot, or replay from the last sequence number) before you show Live again.

```ts
import assert from 'node:assert/strict';

export type Connection = 'live' | 'stale' | 'reconnecting' | 'offline';

export function connectionState(opts: {
  socketOpen: boolean;
  online: boolean; // navigator.onLine: false is reliable, true only means "a network exists"
  lastMessageAt: number | null;
  now: number;
  heartbeatMs: number;
}): Connection {
  if (!opts.online) return 'offline';
  if (!opts.socketOpen) return 'reconnecting';
  if (opts.lastMessageAt === null || opts.now - opts.lastMessageAt > 2 * opts.heartbeatMs) return 'stale';
  return 'live';
}

export function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

const base = { socketOpen: true, online: true, heartbeatMs: 15_000, now: 100_000 };
assert.equal(connectionState({ ...base, lastMessageAt: 95_000 }), 'live');
assert.equal(connectionState({ ...base, lastMessageAt: 60_000 }), 'stale'); // 40 s of silence > 2 heartbeats
assert.equal(connectionState({ ...base, socketOpen: false, lastMessageAt: 95_000 }), 'reconnecting');
assert.equal(connectionState({ ...base, online: false, lastMessageAt: 95_000 }), 'offline');
assert.equal(ago(42_000), '42 s ago');
assert.equal(ago(150_000), '3 min ago');
console.log('freshness ok');
```

## TanStack Query plus a live socket

A clean split: **TanStack Query owns the data** (initial fetch, cache, loading and error states, refetch on reconnect),
and **the socket only edits the cache**. Each event calls `queryClient.setQueryData` with an updater, so every
component reading that query re-renders with the new value, and there is one source of truth. For coarse events ("run
list changed") call `invalidateQueries` and let Query refetch instead. While the socket is healthy, set `staleTime:
Infinity` so Query does not also poll; after a reconnect, invalidate to fill anything missed.

```ts
import assert from 'node:assert/strict';
import { QueryClient } from '@tanstack/react-query';

type Run = { id: string; status: 'running' | 'succeeded' | 'failed'; progress: number };
type RunEvent = { type: 'run.updated'; run: Run } | { type: 'run.created'; run: Run };

const runsKey = ['runs'] as const;

/** What the socket handler does with each event: edit the cache, never keep a second copy. */
export function applyRunEvent(client: QueryClient, event: RunEvent) {
  client.setQueryData<Run[]>(runsKey, (old) => {
    if (!old) return old; // nothing cached yet: the initial fetch will include this run
    switch (event.type) {
      case 'run.created':
        return old.some((r) => r.id === event.run.id) ? old : [event.run, ...old];
      case 'run.updated':
        return old.map((r) => (r.id === event.run.id ? event.run : r));
    }
  });
}

const client = new QueryClient();
applyRunEvent(client, { type: 'run.created', run: { id: 'r0', status: 'running', progress: 0 } });
assert.equal(client.getQueryData(runsKey), undefined); // ignored before the first fetch

client.setQueryData<Run[]>(runsKey, [{ id: 'r1', status: 'running', progress: 40 }]); // as if fetched
applyRunEvent(client, { type: 'run.updated', run: { id: 'r1', status: 'succeeded', progress: 100 } });
applyRunEvent(client, { type: 'run.created', run: { id: 'r2', status: 'running', progress: 0 } });
applyRunEvent(client, { type: 'run.created', run: { id: 'r2', status: 'running', progress: 0 } }); // duplicate
assert.deepEqual(
  client.getQueryData<Run[]>(runsKey)?.map((r) => `${r.id}:${r.status}`),
  ['r2:running', 'r1:succeeded'],
);
client.clear();
console.log('query cache ok');
```

The React side: a `useQuery` for the list, and one effect that owns the socket's lifetime.

```tsx
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

type Run = { id: string; status: 'running' | 'succeeded' | 'failed'; progress: number };
type RunEvent = { type: 'run.updated'; run: Run } | { type: 'run.created'; run: Run };
declare function applyRunEvent(client: QueryClient, event: RunEvent): void; // from the block above

export function useLiveRuns(wsUrl: string) {
  const queryClient = useQueryClient();
  const [connected, setConnected] = useState(false);

  const query = useQuery({
    queryKey: ['runs'],
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/runs', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as Run[];
    },
    staleTime: connected ? Infinity : 10_000, // the socket keeps it fresh; poll only when it is down
    refetchInterval: connected ? false : 10_000,
  });

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      setConnected(true);
      void queryClient.invalidateQueries({ queryKey: ['runs'] }); // fill anything missed while disconnected
    };
    // Validate with zod in production: the socket is a trust boundary.
    ws.onmessage = (e: MessageEvent<string>) => applyRunEvent(queryClient, JSON.parse(e.data) as RunEvent);
    ws.onclose = () => setConnected(false); // reconnect with backoff lives in the transport (see the WebSockets chapter)
    return () => {
      // Detach first: the old socket's close event arrives later and must not mark a newer connection as down.
      ws.onopen = ws.onmessage = ws.onclose = null;
      ws.close();
    };
  }, [wsUrl, queryClient]);

  return { ...query, connected };
}

export function ConnectionBadge({ state, lastUpdate }: { state: 'live' | 'stale' | 'reconnecting' | 'offline'; lastUpdate: string }) {
  const label = { live: 'Live', stale: 'Stale', reconnecting: 'Reconnecting…', offline: 'Offline' }[state];
  // Only the state is in the live region. The age changes every few seconds and would be announced each time.
  return (
    <span className={`badge badge-${state}`}>
      <span aria-hidden="true">{state === 'live' ? '●' : '○'}</span> <span role="status">{label}</span>
      {state === 'stale' && <span>, last update {lastUpdate}</span>}
    </span>
  );
}
```

One race to mention before they find it: a refetch that started before a socket event can finish after it and overwrite
the newer value with an older snapshot. For views where that matters, carry a version or sequence number on each run
and keep the newer one in the updater, or use the snapshot-plus-deltas store from earlier.

## Observability data: OpenTelemetry in one page

**OpenTelemetry (OTel)** is the vendor-neutral standard for traces, metrics and logs. A **trace** is one request or agent
run end to end; it is made of **spans** (one per operation: an LLM call, a tool call, a database query) with timings,
attributes and status. **Metrics** are aggregated numbers (counters, gauges, histograms such as latency). **Logs** become
far more useful when every line carries the **trace id**, because you can jump from a log line to the whole trace.

Context travels between services in the W3C `traceparent` header: `version-traceid-parentid-flags`, for example
`00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`. On the dashboard, show the trace id on a failed run with a
link to the trace viewer (Cloud Trace on GCP), and have the browser start a span and send `traceparent` with its API
calls so front-end and back-end timings join into one trace.

```ts
import assert from 'node:assert/strict';

type TraceContext = { traceId: string; parentId: string; sampled: boolean };

/** Parses a W3C traceparent header (version 00). Returns null for anything invalid. */
export function parseTraceparent(header: string): TraceContext | null {
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(header.trim());
  if (!m) return null;
  const [, traceId, parentId, flags] = m;
  if (/^0+$/.test(traceId) || /^0+$/.test(parentId)) return null; // all-zero ids are invalid
  return { traceId, parentId, sampled: (parseInt(flags, 16) & 1) === 1 };
}

const hex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, '0')).join('');

/** Starts a new trace from the browser (or continues one by reusing traceId). */
export function makeTraceparent(traceId = hex(16), sampled = true): string {
  return `00-${traceId}-${hex(8)}-${sampled ? '01' : '00'}`;
}

assert.deepEqual(parseTraceparent('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'), {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  parentId: '00f067aa0ba902b7',
  sampled: true,
});
assert.equal(parseTraceparent('00-00000000000000000000000000000000-00f067aa0ba902b7-01'), null);
assert.equal(parseTraceparent('00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01'), null); // must be lower-case
assert.equal(parseTraceparent('garbage'), null);
const fresh = parseTraceparent(makeTraceparent());
assert.ok(fresh && fresh.sampled && fresh.traceId.length === 32);
console.log('traceparent ok');
```

**Where the data comes from on GCP.** Workers publish run and step events to Pub/Sub; a small projection service
writes the current state to a read model (Cloud SQL or Firestore) and pushes deltas to the SSE or WebSocket gateway.
Application logs go to Cloud Logging (log sinks can route them to Pub/Sub or BigQuery), metrics to Cloud Monitoring and
traces to Cloud Trace. The browser never queries those APIs directly: a backend endpoint queries them with a service
account, enforces the user's permissions (which tenants and runs they may see), caches, and shapes the data for the UI.

## Interview questions

### How would you design a live dashboard for agent pipeline runs? {core}

I start from what users decide with it: which runs are healthy, which are stuck or waiting for approval, and why one
failed. The UI has a runs list, a run detail with the step graph, a log viewer and telemetry charts. Data flows from
workers as events with sequence numbers into a read model, and the browser gets a snapshot plus live deltas over SSE or
a WebSocket. On the client, events are applied to a store immediately and rendered on a throttle, logs live in a ring
buffer behind a virtualised list, charts are downsampled, and a connection badge makes staleness visible.

Then pick a deep dive they care about: correctness (sequence numbers, resync), performance (throttling, virtualisation),
or freshness. Mention RBAC: users only see runs from tenants they may access.

### Polling, SSE or WebSockets for a dashboard? {core}

It depends on update rate and direction. Polling is fine for slow-moving views and many viewers, because responses are
cacheable and it is trivial to operate. SSE is my default for live views: the traffic is server-to-client, it runs
over plain HTTP, and `EventSource` reconnects with `Last-Event-ID` for free. I choose WebSockets when the client also
talks a lot (subscribing to different runs, changing log filters, pausing) over one connection. Mixing is normal: poll
the runs list every 10 seconds and stream only the run that is open.

### How do you make sure the client never misses or double-applies an update? {core}

Sequence numbers plus a snapshot. The server numbers every change. The client subscribes first and buffers deltas, then
fetches a snapshot that says which sequence number it reflects, applies the buffered deltas newer than that, and from
then on applies deltas in order. Anything with a number at or below the current one is a duplicate and is dropped; a jump
means a gap, so I buffer briefly and resync from a fresh snapshot if it does not fill. Sending full entity state in each
delta, rather than increments, makes applying them idempotent.

### Events arrive faster than the UI can render. What do you do? {core}

Separate applying data from rendering it. Every event goes into a plain store immediately, which costs microseconds,
and React is notified on a schedule: once per frame for the live view, or every 100–250 ms for tables. Status updates
are coalesced by key so ten updates to one run render once. Logs go into a bounded ring buffer and the list is
virtualised. If the backlog still grows, I degrade deliberately (sample, or pause with a "resume" button) and ask the
server to aggregate or lower the detail. I also stop rendering in hidden tabs and resync when the tab becomes visible.

### How do you show 100,000 log lines without freezing the browser? {core}

Virtualisation: render only the rows in the viewport plus a small overscan, inside a spacer element with the full
height so the scrollbar behaves. With a fixed row height the visible range is `scrollTop / rowHeight` to
`(scrollTop + viewportHeight) / rowHeight`. The data sits in a ring buffer with a cap, so memory is bounded, and the UI
says how many older lines were dropped. Filtering uses `useDeferredValue`, or a web worker for very large logs, so typing
stays responsive. Follow-tail keeps the view at the bottom only while the user is there.

### How does a virtualised list work, and what makes it hard?

It renders a window of rows instead of all of them. A tall inner element sets the scroll height, and the visible rows
are absolutely positioned (or translated) at `start × rowHeight`. On scroll, you recompute the window and render the new
slice, keyed by stable ids so React reuses rows. The hard parts are variable row heights (estimate, measure after render,
correct the offsets, which TanStack Virtual handles), keeping the scroll position stable when items are added above,
browser limits on element height for millions of rows, and accessibility, since rows outside the window are not in the
DOM for screen readers or the browser's find-in-page.

### How do you get follow-tail behaviour right in a log viewer?

Follow while the user is at the bottom, stop the moment they scroll up, and offer a way back. I recompute "at bottom"
on every scroll event (`scrollHeight - scrollTop - clientHeight` within a few pixels), scroll to the end in a layout
effect after new lines render when following is on, and when it is off I show "N more lines below, jump to latest". A Pause
button freezes the view entirely, which users need to read a fast log and which WCAG requires for auto-updating content.

### How do you combine TanStack Query with WebSocket updates? {core}

TanStack Query stays the single source of truth and the socket only edits its cache. The list is loaded with `useQuery`;
socket events call `setQueryData` with an updater that patches the right item, so every component reading that key
re-renders and there is no second copy to keep in sync. For coarse events I call `invalidateQueries` and let it refetch.
While the socket is connected I set `staleTime: Infinity` so Query does not also poll, and on reconnect I invalidate to
catch anything missed during the outage.

### How do you show users that data is stale or the connection is down? {core}

A visible connection state (Live, Reconnecting, Offline, Stale) and an honest age on the data. I measure freshness as
time since the last message received, using only the client's clock, and the server sends heartbeats so silence longer
than about two intervals marks the view stale even if the socket looks open. Stale data is dimmed with "last updated 2
minutes ago", and spinners stop pretending progress is happening. After reconnecting I resync before showing Live again.
`navigator.onLine === false` reliably means offline; `true` only means some network exists.

### How would you chart high-frequency telemetry?

Keep a fixed time window, downsample to roughly the chart's pixel width, and pick the rendering technology by point
count. Min/max bucketing preserves spikes, which matter in operations, while averaging hides them; LTTB keeps the visual
shape. Canvas handles tens of thousands of points, SVG a few thousand. I label units, the aggregation (p95 per minute)
and the time zone, show gaps as gaps, throttle chart updates to about once a second, and give every chart a text summary
and a table view for accessibility.

### What happens when the dashboard tab is in the background? {deep}

Browsers pause `requestAnimationFrame` in hidden tabs and throttle timers (in Chrome, to once a second, and to once a
minute for chained timers after five minutes hidden), but WebSocket and SSE messages keep arriving.
If my flush runs on animation frames, the queue grows silently until the user returns and then the page freezes while
it catches up. So I handle `visibilitychange`: when hidden, either keep applying events to the store without rendering,
or unsubscribe entirely; when visible again, resync from a snapshot. Resyncing is usually simpler and cheaper than
replaying everything that happened while nobody was looking.

### How do you visualise a DAG pipeline's progress?

Lay steps out in columns by depth, using a topological sort where each step's column is one more than its deepest
dependency, and colour and label each node by status. Kahn's algorithm gives the order and detects cycles or unknown
dependencies, which I treat as invalid pipeline definitions. The summary panel shows what is running, what is ready, and
what is blocked downstream of a failure, which is what operators actually need. Progress by step count is honest but
crude; weighting by typical step durations gives a better estimate when the data exists.

### What is OpenTelemetry, and how does it show up in a dashboard? {core}

OpenTelemetry is the vendor-neutral standard and SDKs for traces, metrics and logs. A trace follows one request or agent
run across services as a tree of spans (LLM call, tool call, database query) with timings and attributes; metrics are
aggregates such as latency histograms and error counters; logs carry the trace id. In the dashboard that means: a failed
run shows its trace id with a link to Cloud Trace, logs can be filtered by trace id, and the browser sends a
`traceparent` header so front-end and back-end time join into one trace.

### Where does the dashboard's data come from on GCP?

Workers emit run and step events to Pub/Sub. A projection service consumes them, updates a read model in Cloud SQL or
Firestore, and pushes deltas to the streaming gateway on Cloud Run. Logs go to Cloud Logging, metrics to Cloud
Monitoring and traces to Cloud Trace. The browser talks only to our backend, which queries those services with a service
account, enforces per-tenant permissions, caches, and returns UI-shaped data. Querying Cloud Logging directly from the
browser would leak permissions and hit quotas.

### How do you scale a live dashboard to many viewers? {deep}

Separate producing changes from fanning them out. Changes are published once (Pub/Sub, or Redis pub/sub between gateway
instances), and stateless SSE or WebSocket gateways subscribe and forward only the topics each client asked for. Snapshots
come from a cache or read model, not from replaying history. The server aggregates before sending (at most a few
progress updates per second per run), and slow-moving views poll cacheable endpoints that a CDN can absorb. Limit
subscriptions per connection and connections per user, and watch gateway memory, because every open connection costs
some.

### How do you make a live dashboard accessible?

Do not announce every update. Important events (a run failed, an approval is waiting) go to a polite live region, and
everything else is discoverable by navigation. Status uses text and icons as well as colour. Auto-updating content can
be paused. Charts have text summaries and a table alternative. Tables use real table markup with headers, and sort
controls set `aria-sort`. Focus never jumps because data changed, and rows keep stable keys so a focused row is not
replaced under the user.

### How do you test a real-time dashboard?

Most logic is pure, so I unit-test it with awkward inputs: out-of-order, duplicate and missing deltas, buffer overflow,
the windowing maths at the edges, downsampling that must keep spikes. Components get a fake transport injected, so tests
push events synchronously and use fake timers for throttling. MSW 2 can mock WebSocket connections and Playwright can
intercept them with `page.routeWebSocket`, so E2E tests can script a run's events and assert on what the user sees:
final status, a blocked step, the stale badge after the socket goes quiet.

### How do you handle time zones and clock skew in timestamps? {deep}

Order events by server sequence numbers, never by timestamps. Store and transmit UTC ISO-8601 timestamps and format
them in the viewer's time zone with `Intl.DateTimeFormat`, showing the zone on charts. For "how long ago" I avoid
comparing server time with the client clock, which can be minutes off; I either estimate the offset from server time sent
in messages or measure age as time since receipt on the client. Durations (step took 4.2 s) are computed on the server
from its own clock, so they are not distorted.

**Your angle:** at The Dot Corp you analysed the Labcorp fulfilment workflows (orchestration workflows and background
jobs), and you assisted with production support and investigation during an Azure regional outage. Use that experience
when they ask what operators need to see when things go wrong: what failed, since when, what is blocked, and whether
the data is current.
