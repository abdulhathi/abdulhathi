---
title: React performance
goal: Explain why React components re-render, measure before fixing, and make slow screens fast with the right tool, from moving state and code splitting to memoization, transitions, Activity, virtualisation and web workers.
minutes: 55
---

"This screen is slow, how would you fix it?" comes up in almost every senior React interview. In content and form-heavy apps the problem is usually the first load or laggy typing; in real-time products it is constant: a chat that appends a token every few milliseconds, a log viewer with tens of thousands of lines, dashboards that receive socket updates all day. Strong answers start with **measuring**, explain **why** components render, use the **cheapest fix first** (move state, split components), and only then reach for memoization, transitions, virtualisation or workers.

Where each piece of state should live, and the libraries for it, are covered in [State management and client-side caching](#/react-state). This chapter is about speed.

**Your angle:** at Medidata you worked with the team to optimise the myMedidata React app with **lazy loading and improved state management, reducing initial load times**. Use it as your concrete example for loading performance. For runtime performance (streaming and dashboards), the resume has no direct story, so explain the approach clearly and point to the [streaming demo](#/streaming-project) if you have built it.

## Why components re-render

A component renders when **its state changes**, when **its parent renders**, or when a **context it reads changes**. Props changing is not a trigger by itself: by default a child re-renders whenever its parent does, even with identical props. Rendering means calling the component function and diffing the result; React then **commits** only the DOM changes that are actually needed. So a render is not automatically slow, but many renders of a big tree on every keystroke or token are.

`React.memo`, `useMemo`, `useCallback`, dependency arrays and `useSyncExternalStore` all compare with **`Object.is`**, and for props `React.memo` does it one property at a time (a shallow comparison). A new object, array or function created during render is a different reference every time, so it defeats that comparison:

```ts
import assert from 'node:assert/strict';

// What React.memo does by default: compare each prop with Object.is.
function shallowEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is(a[k], b[k]));
}

const onRetry = () => {};
const style = { color: 'red' };

// Same references: memo would skip the render.
assert.ok(shallowEqual({ id: 'm1', onRetry, style }, { id: 'm1', onRetry, style }));

// Inline objects and functions are new on every render: memo re-renders anyway.
assert.ok(!shallowEqual({ id: 'm1', style: { color: 'red' } }, { id: 'm1', style: { color: 'red' } }));
assert.ok(!shallowEqual({ onRetry: () => {} }, { onRetry: () => {} }));

// Object.is differs from === in two corners, both irrelevant for props but good trivia.
const notANumber = Number('not a number');
assert.ok(Object.is(notANumber, notANumber) && notANumber !== notANumber);
assert.ok(!Object.is(0, -0) && 0 === -0);
```

## Measure before you optimise

| Tool | What it tells you |
|---|---|
| React DevTools **Profiler** | Which components rendered in each commit, how long they took, and why ("props changed", "hook 2 changed", "parent rendered") |
| DevTools "Highlight updates when components render" | A quick visual of what re-renders while you type, scroll or stream |
| Chrome **Performance** panel | Long tasks (over 50 ms), scripting vs layout vs paint; since React 19.2 it also shows React's own **Performance Tracks** (scheduler priorities and component renders) |
| `<Profiler id onRender>` | Render timings in code, for logging in a staging build or a performance test |
| Chrome **Memory** panel | Heap snapshots to find leaks: compare two snapshots and look for retained detached DOM nodes or growing arrays |
| Bundle analyser (`rollup-plugin-visualizer`, `vite-bundle-visualizer`) | Which modules make the JavaScript large |
| **Core Web Vitals** from real users (`web-vitals` library, CrUX) | LCP, INP and CLS as users actually experience them |

```tsx
import { Profiler, type ProfilerOnRenderCallback, type ReactNode } from 'react';

// Log commits slower than one frame (about 16 ms) for one region of the app.
const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration, baseDuration) => {
  if (actualDuration > 16) {
    console.warn(`[profiler] ${id} ${phase} took ${actualDuration.toFixed(1)} ms (without memo: ${baseDuration.toFixed(1)} ms)`);
  }
};

export function ProfiledRegion({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Profiler id={id} onRender={onRender}>
      {children}
    </Profiler>
  );
}
```

`actualDuration` is the time spent rendering this commit; `baseDuration` estimates the cost of re-rendering the whole subtree without any memoization. A big gap between them means memoization is doing its job.

## The fixes, cheapest first

| Problem | Fix |
|---|---|
| Typing in one field re-renders the whole page | **Move state down** into the component that uses it |
| A stateful wrapper re-renders the heavy content it only wraps | **Lift content up**: pass the heavy part as `children` (elements created by the parent are not re-created) |
| A pure, expensive child re-renders with the same props | `React.memo` plus stable props (`useMemo`/`useCallback`), or let **React Compiler** do it |
| Every context consumer re-renders on any change | Split the context, memoize its value, or use a store with **selectors** |
| A list with thousands of rows | **Virtualise** it, or use CSS `content-visibility: auto` for long static content |
| Streaming tokens re-render the whole conversation | Keep the in-progress message in **its own component**, memoize finished messages, **batch** token updates per frame |
| Typing or filtering feels laggy because the result is expensive | `useDeferredValue` / `useTransition`, or debounce |
| The first load is slow | **Code-split** routes and heavy widgets with `lazy` + `Suspense`; trim the bundle |
| A heavy computation blocks the main thread | Move it to a **web worker** |
| Memory grows the longer the dashboard is open | Clean up subscriptions; **cap** in-memory logs (ring buffer); virtualise |
| The same data is fetched again and again | A server-state cache such as TanStack Query or RTK Query (see [State and client caching](#/react-state)) |

### Move state down, lift content up

The two cheapest fixes need no memoization at all:

```tsx
import { useState, type ReactNode } from 'react';

function ExpensiveChart() {
  // Imagine heavy rendering here.
  return <svg width={400} height={200} role="img" aria-label="Monthly totals" />;
}

// Before: the page held `note` state, so every keystroke re-rendered ExpensiveChart.
// After: the state lives in the small component that needs it.
function NoteField() {
  const [note, setNote] = useState('');
  return <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />;
}

// When a wrapper must own state (here, whether a panel is open), pass the heavy part as children:
// the <ExpensiveChart /> element is created by the page, so the wrapper's state changes do not re-create it.
function CollapsiblePanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide' : 'Show'}
      </button>
      <div hidden={!open}>{children}</div>
    </section>
  );
}

export function DashboardPage() {
  return (
    <>
      <NoteField />
      <CollapsiblePanel>
        <ExpensiveChart />
      </CollapsiblePanel>
    </>
  );
}
```

## memo, useMemo and useCallback, used correctly

The streaming chat is the textbook case. Finished messages never change, so they should not re-render when a new token arrives. Only the message being streamed should.

```tsx
import { memo, useCallback } from 'react';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

// Finished messages: memoized, so a new token does not re-render them.
const MessageItem = memo(function MessageItem({ message, onRetry }: { message: Message; onRetry: (id: string) => void }) {
  return (
    <li>
      <p>{message.text}</p>
      {message.role === 'assistant' && <button onClick={() => onRetry(message.id)}>Retry</button>}
    </li>
  );
});

// The in-progress answer lives in its own component, so token updates stay inside it.
function StreamingMessage({ text }: { text: string }) {
  return (
    <li aria-busy="true">
      <p>{text}</p>
    </li>
  );
}

type ConversationProps = {
  conversationId: string;
  messages: Message[];
  streamingText: string | null;
  retry: (conversationId: string, messageId: string) => void;
};

export function Conversation({ conversationId, messages, streamingText, retry }: ConversationProps) {
  // Stable identity: without useCallback, every render (every token!) creates a new function and defeats memo above.
  const onRetry = useCallback((messageId: string) => retry(conversationId, messageId), [conversationId, retry]);

  return (
    <section aria-label="Conversation">
      <ol>
        {messages.map((m) => (
          <MessageItem key={m.id} message={m} onRetry={onRetry} />
        ))}
        {streamingText !== null && <StreamingMessage text={streamingText} />}
      </ol>
    </section>
  );
}
```

Guidelines that sound senior:

- `useMemo` caches a **value**, `useCallback` caches a **function**. Both are worth it only when the reference is passed to a memoized child, used in a dependency array, or the computation is genuinely expensive.
- Do not wrap everything: memoization has a cost (comparisons, memory, harder-to-read code), and for cheap components it is a net loss.
- The **message list must be immutable**. If you push into the same array, `memo` and React's state comparison cannot see the change.
- Stable, unique **keys** (`message.id`, never the array index for lists that change) let React keep each item's DOM and state.

### Batch high-frequency updates

An LLM can send dozens of tokens per second, and each `setState` per token schedules work. React 18+ batches updates inside the same task automatically, but tokens arrive in separate network chunks. The common fix is to buffer tokens in a ref and flush **once per animation frame**:

```ts
import assert from 'node:assert/strict';

// Collects tokens and delivers them in one call per frame. `schedule` is requestAnimationFrame in the browser;
// it is injected so the logic can be tested without a browser.
export function createTokenBatcher(flush: (text: string) => void, schedule: (cb: () => void) => void) {
  let buffer = '';
  let scheduled = false;
  return {
    push(token: string) {
      buffer += token;
      if (scheduled) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        const text = buffer;
        buffer = '';
        if (text) flush(text);
      });
    },
  };
}

// A fake frame scheduler: callbacks run when we call frame().
const queue: (() => void)[] = [];
const frame = () => queue.splice(0).forEach((cb) => cb());

const flushed: string[] = [];
const batcher = createTokenBatcher((t) => flushed.push(t), (cb) => queue.push(cb));

for (const t of ['The ', 'order ', 'is ', 'approved']) batcher.push(t);
frame(); // one state update for four tokens
batcher.push('.');
frame();

assert.deepEqual(flushed, ['The order is approved', '.']);
```

In the component, `flush` calls `setStreamingText((prev) => prev + text)`. At 60 frames per second that caps renders at 60 per second, however fast tokens arrive. The [streaming chat UI](#/streaming-chat-ui) chapter builds the full hook.

## React Compiler

**React Compiler 1.0** (stable since October 2025) is a build-time tool, shipped as `babel-plugin-react-compiler`, that analyses components and hooks and inserts memoization automatically, at a finer grain than hand-written `useMemo`, `useCallback` and `memo`. It relies on code following the **Rules of React** (pure render, no mutation of props or state during render, hooks rules) and skips anything it cannot prove safe. Its diagnostics ship as rules in `eslint-plugin-react-hooks`, which is useful even before you enable the compiler. You can opt a component out with the `"use no memo"` directive while you fix it.

What it does not fix: state living in the wrong place, network waterfalls, a huge bundle, or a list of 50,000 DOM nodes.

## Concurrent rendering: transitions and deferred values

React can render an update **in the background at low priority** and abandon it if something more urgent (a keystroke) comes in. You opt in by marking work as non-urgent:

- **`useTransition` / `startTransition`**: you own the state update. Wrap the expensive update; `isPending` lets you show a subtle indicator.
- **`useDeferredValue(value)`**: you receive a value (for example a prop) and want an expensive part of the UI to lag behind it. React 19 adds an optional `initialValue` for the first render.

```tsx
import { memo, useDeferredValue, useMemo, useState, useTransition } from 'react';

type LogLine = { id: number; level: 'info' | 'warn' | 'error'; text: string };

// Expensive: filters and renders thousands of lines. memo lets React skip it while the deferred query is unchanged.
const LogResults = memo(function LogResults({ lines, query }: { lines: LogLine[]; query: string }) {
  const q = query.toLowerCase();
  const visible = lines.filter((l) => l.text.toLowerCase().includes(q)).slice(0, 2_000);
  return (
    <ul>
      {visible.map((l) => (
        <li key={l.id} className={l.level}>
          {l.text}
        </li>
      ))}
    </ul>
  );
});

export function LogSearch({ lines }: { lines: LogLine[] }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query); // the input updates now, the results catch up
  const [level, setLevel] = useState<'all' | LogLine['level']>('all');
  const [isPending, startTransition] = useTransition();
  // useMemo matters here: a new array on every keystroke would defeat LogResults' memo, and the deferred
  // query would no longer keep typing fast.
  const filtered = useMemo(() => (level === 'all' ? lines : lines.filter((l) => l.level === level)), [lines, level]);

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search logs" />
      <select
        value={level}
        aria-label="Level"
        onChange={(e) => {
          const next = e.target.value as typeof level;
          startTransition(() => setLevel(next)); // switching filters must not block the UI
        }}
      >
        <option value="all">All</option>
        <option value="info">Info</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>
      <div style={{ opacity: isPending || query !== deferredQuery ? 0.6 : 1 }}>
        <LogResults lines={filtered} query={deferredQuery} />
      </div>
    </div>
  );
}
```

Transitions make expensive renders **interruptible**; they do not make them cheaper. A list of 50,000 rows still needs virtualisation. Debouncing is different: it reduces how often work starts (for example API calls), while transitions keep the UI responsive while it runs.

## Activity: hide without losing state (React 19.2)

Unmounting a hidden tab or panel throws away its state; hiding it with CSS keeps its effects running. `<Activity mode="hidden">` does neither: React keeps the state and DOM, cleans up the hidden part's effects, and gives its updates low priority. It is also a way to **pre-render** a screen the user is likely to open next.

```tsx
import { Activity, useState } from 'react';

function DraftNote() {
  const [text, setText] = useState('');
  return <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="Draft note" />;
}

export function SidePanel() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Toggle notes
      </button>
      {/* Hidden: effects are cleaned up and updates are deferred, but the typed draft is kept. */}
      <Activity mode={open ? 'visible' : 'hidden'}>
        <DraftNote />
      </Activity>
    </>
  );
}
```

## Code splitting and bundle size

```tsx
import { lazy, Suspense, useState } from 'react';

// Each import() becomes its own chunk, fetched the first time the component renders.
// Inlined here to stay self-contained; in an app: lazy(() => import('./RunDashboard')).
const loadDashboard = async () => ({ default: () => <h1>Run dashboard</h1> });
const loadAdmin = async () => ({ default: () => <h1>Tenant admin</h1> });
const RunDashboard = lazy(loadDashboard);
const TenantAdmin = lazy(loadAdmin);

export function App() {
  const [page, setPage] = useState<'chat' | 'dashboard' | 'admin'>('chat');
  return (
    <>
      <nav>
        <button onClick={() => setPage('chat')}>Chat</button>
        {/* Start downloading the chunk on hover or focus, before the click. */}
        <button onMouseEnter={loadDashboard} onFocus={loadDashboard} onClick={() => setPage('dashboard')}>
          Dashboard
        </button>
        <button onClick={() => setPage('admin')}>Admin</button>
      </nav>
      <Suspense fallback={<p role="status">Loading…</p>}>
        {page === 'chat' && <h1>Chat</h1>}
        {page === 'dashboard' && <RunDashboard />}
        {page === 'admin' && <TenantAdmin />}
      </Suspense>
    </>
  );
}
```

- Split at **route** boundaries first, then **heavy widgets**: charting, Markdown and syntax highlighting, code editors, PDF viewers.
- Wrap lazy content in an **error boundary** (see [React fundamentals](#/react-core)): a chunk can fail to download, typically right after a deploy removed the old file.
- Find what is large with a bundle analyser. Usual culprits: a whole icon set, a date or utility library imported in full, moment-style locale bundles, duplicate copies of a dependency.
- Prefer ES-module packages and named imports so tree-shaking works; avoid barrel files that pull in a whole folder.
- Long-lived cache headers on content-hashed assets make repeat visits nearly free.

## Virtualisation and long content

**Virtualisation** (windowing) renders only the rows in the viewport plus a small overscan, so a 50,000-line log keeps around 50 rows in the DOM. Use **TanStack Virtual** or **react-window**; the [real-time dashboards](#/realtime-dashboards) chapter shows the windowing maths and a follow-the-tail log viewer. The trade-offs: rows need fixed or measured heights, the browser's find-in-page cannot see unrendered rows (provide your own search), and screen readers see only part of the list (expose the total count and keep focus stable).

For long content that is mostly static, such as a long chat history, the CSS property **`content-visibility: auto`** (with `contain-intrinsic-size` to reserve space) lets the browser skip layout and paint for off-screen sections, with no JavaScript.

## Web workers for heavy work

JavaScript runs on one main thread, which also handles input and painting. Parsing a 20 MB log export, diffing large JSON or computing chart aggregates there freezes the page. A **web worker** runs code on another thread and talks to the page by messages (structured clone, or zero-copy **transferable** `ArrayBuffer`s).

```tsx
import { useEffect, useRef, useState } from 'react';

// The message protocol is a discriminated union, so both sides are type-checked.
type ToWorker = { type: 'parse'; requestId: number; text: string };
type FromWorker = { type: 'parsed'; requestId: number; errors: number; warnings: number } | { type: 'failed'; requestId: number; message: string };

export function useLogStats(text: string) {
  const workerRef = useRef<Worker | null>(null);
  const [stats, setStats] = useState<{ errors: number; warnings: number } | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    // Vite bundles the worker file as its own chunk when written this way.
    const worker = new Worker(new URL('./log-parser.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      if (e.data.requestId !== latest.current) return; // ignore answers to stale requests
      if (e.data.type === 'parsed') setStats({ errors: e.data.errors, warnings: e.data.warnings });
    };
    workerRef.current = worker;
    return () => worker.terminate(); // no leaked threads when the component unmounts
  }, []);

  useEffect(() => {
    const message: ToWorker = { type: 'parse', requestId: ++latest.current, text };
    workerRef.current?.postMessage(message);
  }, [text]);

  return stats;
}
```

Workers have no DOM access, and copying huge strings across has its own cost, so they pay off for CPU-bound work of tens of milliseconds or more. Libraries such as Comlink wrap the messaging in a promise-based API.

## Memory leaks from subscriptions

Long-lived dashboards expose leaks that a page you leave after a minute never shows. Typical causes:

- An effect that subscribes (WebSocket, `EventSource`, `setInterval`, `addEventListener`, `ResizeObserver`) with **no cleanup**, so every remount adds another subscription.
- **Unbounded state**: appending every log line or telemetry point to an array forever. Cap it with a ring buffer and keep history on the server.
- Closures that keep large objects alive (a handler capturing a big array), or caches that never evict.
- Detached DOM nodes held by a reference after their component unmounted.

```tsx
import { useEffect, useSyncExternalStore } from 'react';

type RunStatus = { runId: string; status: 'running' | 'succeeded' | 'failed'; progress: number };

// One shared store for socket updates, outside React. Components subscribe through useSyncExternalStore,
// which handles subscribe/unsubscribe correctly and avoids tearing in concurrent rendering.
function createRunStore() {
  let snapshot: Record<string, RunStatus> = {};
  const listeners = new Set<() => void>();
  return {
    update(next: RunStatus) {
      snapshot = { ...snapshot, [next.runId]: next }; // new reference, so React sees the change
      listeners.forEach((l) => l());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener); // cleanup: no leaked listeners
    },
    getSnapshot: () => snapshot,
  };
}

export const runStore = createRunStore();

export function RunProgress({ runId }: { runId: string }) {
  const run = useSyncExternalStore(runStore.subscribe, () => runStore.getSnapshot()[runId]);
  return <progress max={100} value={run?.progress ?? 0} aria-label={`Run ${runId} progress`} />;
}

export function useStatusFeed(url: string) {
  useEffect(() => {
    const source = new EventSource(url);
    source.addEventListener('status', (e) => runStore.update(JSON.parse((e as MessageEvent<string>).data) as RunStatus));
    const timer = setInterval(() => console.debug('feed alive', source.readyState), 30_000);
    return () => {
      source.close(); // without this, every remount opens another connection
      clearInterval(timer);
    };
  }, [url]);
}
```

To find a leak: open the screen, take a heap snapshot, use the screen for a while (or mount and unmount it ten times), take another, and compare. Look for growing counts of your objects, listeners or "Detached" DOM nodes. StrictMode's double-invoked effects in development surface missing cleanups early.

## Core Web Vitals

| Metric | Measures | Good (75th percentile of real users) | Common React causes |
|---|---|---|---|
| **LCP**, Largest Contentful Paint | loading: when the main content appears | ≤ 2.5 s | big bundles, client-side data waterfalls, a lazy-loaded hero image |
| **INP**, Interaction to Next Paint | responsiveness: delay from input to the next frame, across the visit | ≤ 200 ms | long renders on input, heavy event handlers, main-thread parsing |
| **CLS**, Cumulative Layout Shift | visual stability | ≤ 0.1 | images without dimensions, content injected above what the user reads, late-loading fonts |

INP replaced First Input Delay as a Core Web Vital in March 2024. Measure with the `web-vitals` library (`onLCP`, `onINP`, `onCLS`) and send the values to your analytics, because lab tools like Lighthouse cannot measure INP from real interactions. Behind a login, as in most enterprise apps, the public Chrome UX Report does not see your pages, so your own real-user monitoring is the only source.

```ts typecheck
// Without a library: observe the LCP candidate in the browser and report the final value when the page is hidden.
let lcp = 0;
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) lcp = entry.startTime;
}).observe({ type: 'largest-contentful-paint', buffered: true });

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    navigator.sendBeacon('/rum', JSON.stringify({ metric: 'LCP', value: Math.round(lcp), page: location.pathname }));
  }
});
```

## Images, fonts and layout thrash

- **Images:** always set `width` and `height` (or `aspect-ratio`) so space is reserved; `loading="lazy"` below the fold, but **never** on the LCP image, which should get `fetchpriority="high"`; responsive `srcset` and `sizes`; AVIF or WebP.
- **Fonts:** self-host or preconnect, preload the one critical font, subset it, and use `font-display: swap` (or `optional` to avoid a late swap shifting layout).
- **Layout thrash:** reading layout (`offsetHeight`, `getBoundingClientRect`, `scrollTop`) right after writing styles forces the browser to recalculate layout synchronously. Doing that in a loop multiplies the cost. Batch all reads, then all writes, ideally inside `requestAnimationFrame`, and animate only `transform` and `opacity`, which skip layout.

```ts typecheck
// Bad: read, write, read, write... forces a synchronous layout on every iteration.
export function equaliseHeightsSlow(cards: HTMLElement[]) {
  for (const card of cards) {
    card.style.height = 'auto';
    card.style.height = `${card.offsetHeight + 8}px`;
  }
}

// Good: one write pass, one read pass, then one write pass in the next frame.
export function equaliseHeights(cards: HTMLElement[]) {
  cards.forEach((c) => (c.style.height = 'auto'));
  const heights = cards.map((c) => c.offsetHeight); // all reads together
  requestAnimationFrame(() => cards.forEach((c, i) => (c.style.height = `${heights[i] + 8}px`)));
}
```

## Interview questions

### A React screen feels slow. How do you find and fix the problem? {core}

I measure first: record the slow interaction with the React DevTools Profiler to see which components rendered, how long they took and why, and use the Chrome Performance panel to see long tasks and whether the time goes to scripting, layout or the network. Then I apply the cheapest fix: move state down to where it is used, pass heavy subtrees as `children`, split contexts. Only then do I add `React.memo` with stable props. For long lists I virtualise, for laggy filtering I use `useDeferredValue` or a transition, for heavy computation a web worker, and for slow first loads code splitting.

Finish with verification: profile again, and watch real-user INP and LCP after release. Many "slow pages" are actually network waterfalls, which a query cache and parallel requests fix, not memoization.

### Why does a React component re-render? {core}

Three triggers: its own state changed (`useState`, `useReducer`, an external store via `useSyncExternalStore`), its parent rendered, or a context it reads got a new value. By default a child re-renders whenever its parent does, even with identical props, unless it is wrapped in `React.memo`, the React Compiler memoizes it, or it was passed in as `children` from a component that did not re-render. A render is calling the function and diffing the result; the DOM is touched only where output changed.

### What does React.memo do, and when does it not help? {core}

It makes React skip re-rendering a component when every prop is `Object.is`-equal to the previous render's. It helps for components that are expensive and often receive the same props while their parent re-renders, like finished messages in a chat while a new one streams in.

It does not help when props are new references every render (inline objects, arrays, arrow functions) unless you stabilise them with `useMemo`/`useCallback`; it does not stop re-renders from the component's own state or from a context it reads; and for cheap components the comparison can cost more than the render.

### Why can an inline function or object prop break memoization?

Every render creates a new function or object, so its reference is different even if its content is the same. `React.memo` and dependency arrays compare by reference, so they see a "changed" prop every time and re-render or re-run anyway. Wrap the function in `useCallback` and the object in `useMemo` (or hoist constants outside the component) so the reference stays the same between renders. React Compiler does this automatically.

### When are useMemo and useCallback worth it? {core}

When the cached reference matters: it is passed to a memoized child, used in a dependency array of an effect or another memo, or it is the value of a context provider. Or when the computation itself is expensive (filtering or sorting thousands of items on every render). They are not free: they add comparisons, memory and noise. Wrapping every value by reflex is a code smell, and with React Compiler enabled most of them become unnecessary.

### How would you keep a streaming chat smooth while tokens arrive? {core}

Three things. First, isolate the moving part: the in-progress message is its own component with its own state, and finished messages are memoized with stable keys and callbacks, so a token re-renders one small component, not the conversation. Second, batch: buffer tokens in a ref and flush once per animation frame, which caps renders at the frame rate however fast tokens arrive. Third, keep rendering cheap: render Markdown incrementally or only for completed blocks, and do heavy work like syntax highlighting after the message completes or in a worker.

Then I check the Profiler during a long answer, and watch INP so typing the next prompt stays responsive while a stream is running. See [Streaming chat UI](#/streaming-chat-ui).

### What is the React Compiler, and does it make memo obsolete?

React Compiler, stable at 1.0 since October 2025, is a Babel plugin that memoizes components and hooks automatically at build time, at a finer grain than hand-written hooks: it caches JSX, values and callbacks only when their inputs change. It assumes the Rules of React (pure render, no mutation of props or state) and skips code it cannot prove safe; its checks also ship as `eslint-plugin-react-hooks` rules. With it enabled, most manual `useMemo`, `useCallback` and `memo` can go, but it does not fix state in the wrong place, network waterfalls, huge bundles or unvirtualised lists.

### What is the difference between useTransition and useDeferredValue?

Both mark rendering work as low priority and interruptible, so urgent updates like typing are not blocked. `useTransition` is for when **you** make the state update: wrap it in `startTransition` and use `isPending` for a subtle loading indicator. `useDeferredValue` is for when you **receive** a value (often a prop or a search string) and want an expensive part of the tree to render with a slightly older value while the input stays responsive. Neither makes the render itself faster; for very large lists you still virtualise.

### Debounce, throttle or a transition: how do you choose? {core}

Debounce waits until events **stop** for a set time and then runs once: a search box that calls the API 300 ms after the last keystroke, which reduces the number of expensive operations. Throttle runs at most once per interval **while events continue**: scroll position, resize or telemetry redraws every 100 ms. A transition is different again: it keeps the UI responsive while an expensive render runs, but does not reduce how often it starts. For a search box over a server API, I debounce the request and cancel stale ones with `AbortController`; for client-side filtering of a big list, I use `useDeferredValue`.

In React, debounce with a timeout in an effect plus cleanup (a `useDebouncedValue` hook). The [async JavaScript](#/code-async) chapter writes debounce and throttle from scratch.

### How do code splitting, React.lazy and Suspense work? {core}

Code splitting breaks the bundle into chunks loaded on demand. `lazy(() => import('./RunDashboard'))` creates a component whose code is fetched the first time it renders; while it loads, it **suspends** and the nearest `<Suspense fallback>` shows the fallback. I split at routes first, then heavy widgets (charts, Markdown and highlighting, editors), preload likely next chunks on hover or focus, and wrap lazy regions in an error boundary because a chunk can fail to download after a deploy.

### How would you reduce a React app's initial load time? {core}

Ship less JavaScript first: route-level code splitting, lazy-loading heavy libraries, removing or replacing large dependencies found with the bundle analyser, and checking that tree-shaking works. Load data in parallel instead of in waterfalls (start fetching at the route level, not deep in the tree after each parent renders), cache it, and show skeletons that reserve space. Optimise the LCP element: no lazy loading on it, `fetchpriority="high"`, proper sizes. Serve hashed assets from a CDN with long cache lifetimes. For public content pages, server rendering also helps; for an authenticated SPA, the bundle and data loading matter most.

**Your angle:** this is what you did on myMedidata with the team: lazy loading and better state management reduced the initial load time. Explain what was lazy-loaded only as you remember it (route-level screens and heavy components are the usual candidates). Describe how it was measured only if you remember it, and do not quote numbers you cannot back up.

### What is list virtualisation, and how would you render 100,000 log lines? {core}

Virtualisation (windowing) renders only the rows visible in the viewport plus a small overscan, so the DOM holds dozens of rows instead of 100,000. TanStack Virtual and react-window are the usual libraries. For a live log I also keep the data bounded in the browser (a ring buffer of the most recent lines, with older pages fetched from the server on demand), batch incoming lines per frame, and keep the "follow the tail" logic separate from user scrolling.

The trade-offs to mention: rows need fixed or measured heights; the browser's find-in-page cannot see unrendered rows, so provide your own search; and screen readers see only part of the list, so expose the total count and keep focus stable. Pagination or infinite loading is the alternative when users do not need the whole list at once.

### What is the Activity component? {deep}

`<Activity mode="visible" | "hidden">`, added in React 19.2, hides part of the UI while **preserving its state and DOM**. When hidden, React cleans up its effects and gives its updates low priority, and when shown again it restores the state instantly. Use it for tabs, side panels or pre-rendering a screen the user is likely to open next. Before it, you either unmounted (losing state) or hid with CSS (effects kept running).

### What are Core Web Vitals, and which ones does React affect most?

Google's three real-user metrics, judged at the 75th percentile: **LCP** (loading, good is 2.5 s or less), **INP** (responsiveness, good is 200 ms or less; it replaced First Input Delay in March 2024) and **CLS** (visual stability, good is 0.1 or less). React apps most often hurt INP through long renders on input and heavy handlers, LCP through big bundles and client-side data waterfalls, and CLS through content without reserved space. On an internal enterprise app, collect them yourself with the `web-vitals` library, because public field data does not cover pages behind a login.

### When would you use a web worker in a React app? {deep}

For CPU-heavy work that would block the main thread for tens of milliseconds or more: parsing a large log export or CSV, diffing big JSON documents, computing chart aggregates or downsampling telemetry, or syntax-highlighting long code. The worker gets messages and posts results; the component sends requests, ignores answers to stale requests, and terminates the worker on unmount. Workers have no DOM access and copying large data has a cost, so I use transferable buffers for big binary data and keep small, cheap work on the main thread.

### How do memory leaks happen in React apps, and how do you find them? {deep}

Usually through subscriptions without cleanup (sockets, `EventSource`, intervals, global listeners, observers), unbounded arrays in state (every log line forever), closures holding large data, or caches that never evict. In React, every effect that subscribes must return a cleanup, and external stores should be read with `useSyncExternalStore`. To find a leak, take heap snapshots in Chrome before and after repeating an action (mount and unmount a screen ten times) and compare: growing object counts or "Detached" DOM nodes show what is retained and by whom.

### Why can a context provider cause the whole tree to re-render? {deep}

Every component that reads a context re-renders when the provider's `value` changes by `Object.is`. If the provider creates a new object every render (`value={{ user, setUser }}`), every consumer re-renders whenever the provider's parent does. Fixes: memoize the value with `useMemo`, split one big context into several (state and dispatch separately, or by concern), or move frequently changing data (like live run statuses) into an external store with selectors, so each component subscribes only to the slice it needs.

### What is layout thrashing, and how do you avoid it? {deep}

Forcing the browser to recalculate layout repeatedly within one frame by interleaving style writes with layout reads (`offsetHeight`, `getBoundingClientRect`, `scrollTop`). Each read after a write triggers a synchronous layout, so a loop over 500 elements does 500 layouts. Avoid it by batching reads before writes, doing writes inside `requestAnimationFrame`, using `ResizeObserver` instead of polling sizes, and animating only `transform` and `opacity`. In React, measuring belongs in `useLayoutEffect` (before paint) or in a ref callback, not in render.

### Why do stable keys matter for performance and correctness?

Keys tell React which item is which between renders. With stable keys (`message.id`), React reuses each item's DOM and state when the list changes and moves only what moved. With array indexes, inserting at the top shifts every key: React re-renders and patches every row, and state such as an expanded panel or an input value attaches to the wrong item. With random keys generated during render, React destroys and recreates every row on every render.

### How do you keep a real-time dashboard responsive when updates arrive every few milliseconds? {core}

Decouple the arrival rate from the render rate. Put socket messages into an external store or buffer outside React, coalesce them (keep only the latest status per run, aggregate metrics per interval), and flush to React at most once per frame or every few hundred milliseconds. Components subscribe with selectors so a change to one run re-renders only that row. Charts redraw from a downsampled buffer, logs are virtualised and capped, and anything expensive runs in a worker. The [real-time dashboards](#/realtime-dashboards) chapter goes deeper.
