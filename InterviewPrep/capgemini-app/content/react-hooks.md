---
title: React hooks in depth
goal: Use every built-in hook correctly, explain dependency arrays, cleanups and stale closures (including in socket handlers), subscribe to external stores safely, and write custom hooks on the spot.
minutes: 55
---

Hooks are where React interviews get specific. Expect "what does the dependency array do?", "why does my effect run twice?", "useMemo or useCallback?", and a request to write a custom hook live. For a platform that streams agent output and pushes live run status, expect the same questions in a real-time setting: a WebSocket handler that reads stale state, an interval that never sees the latest value, a store outside React that components must subscribe to without tearing.

Interviewers listen for one idea: **every render has its own props, state and functions**. Almost every hooks bug (stale values, infinite loops, races, duplicate subscriptions) comes from forgetting that.

## Rules of hooks

1. Call hooks **only at the top level** of a component or a custom hook: not inside conditions, loops, nested functions or after an early `return`.
2. Call hooks **only from React functions** (components and custom hooks), never from plain utilities or class components.

Why: React stores hook state in a list per component and matches each call to its slot **by call order**. If a hook is skipped on one render, every later hook reads the wrong slot. The `eslint-plugin-react-hooks` rules (`rules-of-hooks`, `exhaustive-deps`) catch these mistakes; keep them on. The one exception is `use()`, which may be called conditionally.

## useState: snapshots, updaters and lazy init

```tsx
import { useState } from 'react';

function readSavedFilters() {
  // Imagine parsing localStorage here: worth doing only once.
  return { status: 'running', agent: 'all' };
}

export function Counter() {
  const [count, setCount] = useState(0);
  // Lazy initial state: pass the function, not its result, so it runs on the first render only.
  const [filters] = useState(readSavedFilters);

  const addThree = () => {
    // Each call sees the SAME snapshot (count), so this would add 1:
    //   setCount(count + 1); setCount(count + 1); setCount(count + 1);
    // The updater form queues functions that receive the latest value, so this adds 3:
    setCount((c) => c + 1);
    setCount((c) => c + 1);
    setCount((c) => c + 1);
  };

  return (
    <button onClick={addThree}>
      {count} ({filters.status})
    </button>
  );
}
```

## useEffect: synchronise with something outside React

An effect connects a component to an **external system**: a network request, a WebSocket or EventSource, a timer, the DOM, a browser API. It runs after the commit (normally after paint), and its cleanup runs before the next run and on unmount.

| Dependency array | Runs |
|---|---|
| none: `useEffect(fn)` | after every render |
| empty: `useEffect(fn, [])` | after the first render (and cleanup on unmount) |
| `[a, b]` | after the first render, then whenever `a` or `b` changed (`Object.is`) |

Fetching with a cleanup that prevents race conditions:

```tsx
import { useEffect, useState } from 'react';

type Run = { id: string; status: string };

// Render it as <RunStatus key={runId} runId={runId} />: the key gives each run fresh state,
// so there is no "reset the old data" setState at the top of the effect.
export function RunStatus({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/runs/${runId}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Run>;
      })
      .then(setRun)
      .catch((e: unknown) => {
        // Aborting rejects with an AbortError: that is our own cleanup, not a failure.
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      });
    // If runId changes before the response arrives, the old request is cancelled,
    // so a slow old response can never overwrite the new one.
    return () => controller.abort();
  }, [runId]);

  if (error) return <p role="alert">{error}</p>;
  return <p>{run ? `${run.id}: ${run.status}` : 'Loading…'}</p>;
}
```

A subscription has the same shape: open in the effect, close in the cleanup, and depend on whatever identifies the connection.

```tsx
import { useEffect, useState } from 'react';

// Also rendered with key={runId}, so a new run starts with an empty list.
export function RunEvents({ runId }: { runId: string }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = (e: MessageEvent<string>) => setLines((l) => [...l.slice(-499), e.data]); // updater: never stale
    return () => source.close(); // switching runs or unmounting closes the old stream
  }, [runId]);
  return <pre>{lines.join('\n')}</pre>;
}
```

### You might not need an effect

| Instead of an effect that… | Do this |
|---|---|
| computes a value from props or state (`setVisible(runs.filter(...))`) | compute it during render; `useMemo` if it is expensive |
| reacts to a user action (submit, click, approve) | put the logic in the event handler |
| resets state when a prop changes | give the component a `key` |
| fetches server data in every component | a data library (TanStack Query) or a framework loader |
| notifies the parent after state changes | call the parent's callback in the same event handler |

## useLayoutEffect, useRef, useMemo and useCallback

| Hook | Use it for | Watch out for |
|---|---|---|
| `useLayoutEffect` | measuring the DOM and adjusting before the browser paints (tooltips, keeping a chat scrolled to the bottom) | it blocks paint; prefer `useEffect` |
| `useRef` | a mutable box that survives renders without causing them: DOM nodes, timer IDs, the socket, the previous value | changing `ref.current` does not re-render; do not read or write it during render (except lazy init) |
| `useMemo` | caching an expensive calculation, or keeping an object/array reference stable for a memoised child or an effect dependency | a performance hint, not a guarantee |
| `useCallback` | keeping a function reference stable for a `memo` child or a dependency | useless unless something compares the reference |

```tsx
import { memo, useCallback, useMemo, useState } from 'react';

type Step = { id: number; tool: string; ms: number };

const StepTable = memo(function StepTable({ steps, onOpen }: { steps: Step[]; onOpen: (id: number) => void }) {
  return (
    <ul>
      {steps.map((s) => (
        <li key={s.id}>
          <button onClick={() => onOpen(s.id)}>
            {s.tool}: {s.ms} ms
          </button>
        </li>
      ))}
    </ul>
  );
});

export function Steps({ all }: { all: Step[] }) {
  const [tool, setTool] = useState('all');
  const [note, setNote] = useState('');

  // Typing a note re-renders Steps, but steps and onOpen keep the same references,
  // so the memoised table skips re-rendering.
  const steps = useMemo(() => (tool === 'all' ? all : all.filter((s) => s.tool === tool)), [all, tool]);
  const onOpen = useCallback((id: number) => console.log('open step', id), []);

  return (
    <>
      <select value={tool} onChange={(e) => setTool(e.target.value)} aria-label="Tool">
        <option value="all">All tools</option>
        <option value="search">search</option>
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" />
      <StepTable steps={steps} onOpen={onOpen} />
    </>
  );
}
```

With **React Compiler 1.0** (stable since October 2025) enabled in the build, most of this manual memoisation is done automatically.

## useReducer and context together

For state with several related fields and transitions, a reducer keeps the update rules in one pure, testable function. Pairing it with context gives a small app-wide store without a library.

```tsx
import { createContext, use, useReducer, type Dispatch, type ReactNode } from 'react';

type State = { pendingApprovals: string[]; status: 'idle' | 'submitting' | 'error' };
type Action =
  | { type: 'approval_requested'; runId: string }
  | { type: 'approval_resolved'; runId: string }
  | { type: 'status'; status: State['status'] };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'approval_requested':
      return state.pendingApprovals.includes(action.runId)
        ? state
        : { ...state, pendingApprovals: [...state.pendingApprovals, action.runId] };
    case 'approval_resolved':
      return { ...state, pendingApprovals: state.pendingApprovals.filter((id) => id !== action.runId) };
    case 'status':
      return { ...state, status: action.status };
  }
}

const StateContext = createContext<State | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

// Two contexts: components that only dispatch do not re-render when state changes.
export function ApprovalsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { pendingApprovals: [], status: 'idle' });
  return (
    <StateContext value={state}>
      <DispatchContext value={dispatch}>{children}</DispatchContext>
    </StateContext>
  );
}

export function useApprovals() {
  const state = use(StateContext);
  if (!state) throw new Error('useApprovals must be used inside <ApprovalsProvider>');
  return state;
}

export function useApprovalsDispatch() {
  const dispatch = use(DispatchContext);
  if (!dispatch) throw new Error('useApprovalsDispatch must be used inside <ApprovalsProvider>');
  return dispatch;
}
```

## useSyncExternalStore: subscribing to a store outside React

Live data often arrives outside React: a WebSocket pushes run updates into a small store, and many components read slices of it. `useSyncExternalStore(subscribe, getSnapshot)` is the safe way to read such a store under concurrent rendering: every component sees the same snapshot in a render (no "tearing"), and a component re-renders only when **its** snapshot changes by `Object.is`. Redux and Zustand use it internally.

The store itself is plain TypeScript, so it can be tested without React:

```ts
import assert from 'node:assert/strict';

type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'done' | 'failed';
type RunEvent = { type: 'status'; runId: string; status: RunStatus } | { type: 'step'; runId: string; step: string };
type RunView = { readonly status: RunStatus; readonly steps: readonly string[] };
type Snapshot = Readonly<Record<string, RunView>>;

export function createRunStore() {
  let snapshot: Snapshot = {};
  const listeners = new Set<() => void>();
  return {
    // Defined once, so the reference is stable: React will not resubscribe on every render.
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: (): Snapshot => snapshot,
    apply(event: RunEvent) {
      const prev = snapshot[event.runId] ?? { status: 'queued', steps: [] };
      const next: RunView =
        event.type === 'status' ? { ...prev, status: event.status } : { ...prev, steps: [...prev.steps, event.step] };
      // Copy only what changed: other runs keep their references, so their components do not re-render.
      snapshot = { ...snapshot, [event.runId]: next };
      for (const listener of listeners) listener();
    },
  };
}

const store = createRunStore();
let notifications = 0;
const unsubscribe = store.subscribe(() => notifications++);

store.apply({ type: 'status', runId: 'r1', status: 'running' });
const r2Before = store.getSnapshot()['r2'];
const r1Before = store.getSnapshot()['r1'];
store.apply({ type: 'step', runId: 'r1', step: 'search_tickets' });
store.apply({ type: 'status', runId: 'r2', status: 'queued' });

assert.equal(notifications, 3);
assert.deepEqual(store.getSnapshot()['r1'], { status: 'running', steps: ['search_tickets'] });
assert.notEqual(store.getSnapshot()['r1'], r1Before); // r1 changed: new reference
assert.equal(r2Before, undefined);
const r1Now = store.getSnapshot()['r1'];
store.apply({ type: 'status', runId: 'r2', status: 'running' });
assert.equal(store.getSnapshot()['r1'], r1Now); // r1 untouched: same reference, its component skips re-rendering

unsubscribe();
store.apply({ type: 'status', runId: 'r1', status: 'done' });
assert.equal(notifications, 4); // the unsubscribed listener saw nothing new
```

The React side is a few lines. `getSnapshot` must return a **cached** value (the same reference when nothing changed); returning a fresh object every call (`() => ({ ...store.getSnapshot()[id] })`) makes React re-render forever and it warns that "the result of getSnapshot should be cached".

```tsx
import { useEffect, useSyncExternalStore } from 'react';

type RunView = { status: string; steps: readonly string[] };
type RunStore = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => Readonly<Record<string, RunView>>;
  apply: (event: { type: 'status'; runId: string; status: string } | { type: 'step'; runId: string; step: string }) => void;
};

export function useRun(store: RunStore, runId: string): RunView | undefined {
  return useSyncExternalStore(store.subscribe, () => store.getSnapshot()[runId]);
}

// One connection feeds the store; any number of components read slices of it.
export function useRunSocket(store: RunStore, url: string) {
  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onmessage = (e: MessageEvent<string>) => store.apply(JSON.parse(e.data));
    return () => ws.close();
  }, [store, url]);
}

export function RunBadge({ store, runId }: { store: RunStore; runId: string }) {
  const run = useRun(store, runId);
  return <span>{run ? `${run.status} · ${run.steps.length} steps` : 'unknown'}</span>;
}
```

## Stale closures in timers and socket handlers

A callback created in an old render keeps that render's values. With timers and sockets the callback lives much longer than the render, so it is the most common hooks bug in real-time UIs.

```tsx
import { useEffect, useEffectEvent, useState } from 'react';

export function LiveLog({ url }: { url: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);

  // Bug version: ws.onmessage = (e) => { if (!paused) setLines([...lines, e.data]); }
  // - `paused` and `lines` are frozen at the values from the render that opened the socket;
  // - adding them to the dependencies "fixes" it by reconnecting on every message and every toggle.

  // Fix: an Effect Event always sees the latest props and state, but is not a dependency.
  const onLine = useEffectEvent((line: string) => {
    if (!paused) setLines((l) => [...l.slice(-999), line]); // updater: no need to read `lines`
  });

  useEffect(() => {
    const ws = new WebSocket(url);
    ws.onmessage = (e: MessageEvent<string>) => onLine(e.data);
    return () => ws.close();
  }, [url]); // reconnect only when the URL changes

  return (
    <>
      <button onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
        {paused ? 'Resume' : 'Pause'}
      </button>
      <pre>{lines.join('\n')}</pre>
    </>
  );
}
```

Before React 19.2, the standard fix was a "latest ref": `const pausedRef = useRef(paused)`, updated after each commit with `useEffect(() => { pausedRef.current = paused; })` (not assigned during render, which must stay pure), and read as `pausedRef.current` inside the handler. Both fixes keep the connection stable while reading current values.

## Custom hooks

A custom hook is a function whose name starts with `use` and which calls other hooks. It shares **logic**, not state: every component that calls it gets its own independent state.

```tsx
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

/** The value, but only after it has stopped changing for `delay` ms. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** The value from the previous render. */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

/** Subscribe to a browser API the concurrent-safe way. */
function subscribe(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}
```

## Concurrent hooks, useId and useEffectEvent

```tsx
import { memo, useDeferredValue, useId, useState, useTransition } from 'react';

// memo is what makes the deferred value pay off: during the urgent render (the keystroke) the list
// receives the same old query, so React skips it entirely and only the input updates.
const LogResults = memo(function LogResults({ lines, query }: { lines: string[]; query: string }) {
  const q = query.toLowerCase();
  const results = lines.filter((l) => l.toLowerCase().includes(q));
  return (
    <ul>
      {results.slice(0, 200).map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
});

export function LogSearch({ lines }: { lines: string[] }) {
  const [query, setQuery] = useState('');
  // The input stays responsive; the long list re-renders with the deferred value when React has time.
  const deferredQuery = useDeferredValue(query);
  const id = useId(); // stable, unique, and identical on server and client

  return (
    <>
      <label htmlFor={id}>Filter logs</label>
      <input id={id} value={query} onChange={(e) => setQuery(e.target.value)} />
      <div style={{ opacity: query !== deferredQuery ? 0.6 : 1 }}>
        <LogResults lines={lines} query={deferredQuery} />
      </div>
    </>
  );
}

export function RunTabs({ onTabChange }: { onTabChange: (t: string) => void }) {
  const [tab, setTab] = useState('timeline');
  const [isPending, startTransition] = useTransition();
  return (
    <div>
      {['timeline', 'logs', 'telemetry'].map((t) => (
        <button
          key={t}
          onClick={() => {
            // The click is urgent; rendering the heavy tab is not, so it can be interrupted.
            startTransition(() => setTab(t));
            onTabChange(t);
          }}
        >
          {t}
        </button>
      ))}
      {isPending ? <p>Loading tab…</p> : <p>Showing {tab}</p>}
    </div>
  );
}
```

The log rows above use index keys on purpose: the filtered list is rebuilt from scratch and rows hold no state, which is the one case where an index key is acceptable.

## Interview questions

### What are the rules of hooks, and why do they exist? {core}

Call hooks only at the top level of a component or custom hook, never inside conditions, loops or nested functions, and only from React function components or custom hooks. React identifies each hook by the **order** of calls in a render: it keeps a list of hook slots per component, so if a condition skips one hook, every hook after it reads another hook's state.

The ESLint plugin `eslint-plugin-react-hooks` enforces this. If you need conditional behaviour, put the condition **inside** the hook (`useEffect(() => { if (!enabled) return; ... }, [enabled])`). The one API that may be called conditionally is `use()`.

### Why does my state not update immediately after I call setState?

Because state is a snapshot for each render. `setX(5)` asks React to re-render with 5, but the `x` variable in the currently running function is a constant that still holds the old value, so `console.log(x)` right after the setter prints the old one. The new value appears in the next render.

If you need the new value right away, compute it into a local variable first (`const next = x + 1; setX(next); save(next);`). And React batches multiple setter calls into one re-render.

### When do you use the functional updater form of setState?

Whenever the new state depends on the previous state: `setLines((l) => [...l, line])`. React queues updater functions and applies each to the latest value, so several updates in one event, or updates from timers, sockets and async callbacks, do not overwrite each other with stale values.

It also lets you drop the state variable from effect dependencies, which avoids re-creating intervals or reconnecting sockets. A socket `onmessage` that appends with an updater can live in an effect that depends only on the URL.

### What is lazy initial state? {deep}

If you pass a **function** to `useState` (`useState(readSavedFilters)`), React calls it only on the first render. Passing `useState(readSavedFilters())` calls the function on every render and throws the result away after the first, which wastes work when it is expensive (parsing localStorage, building a big structure). The same applies to `useReducer(reducer, arg, init)` and to `useRef` when you initialise it lazily yourself.

### Explain the dependency array of useEffect. {core}

The dependency array tells React when to re-run the effect. With no array, it runs after every render; with `[]`, only after mount (and the cleanup on unmount); with `[a, b]`, after mount and whenever `a` or `b` changed, compared with `Object.is`. The array must list **every reactive value the effect reads**: props, state, and anything derived from them during render.

Leaving dependencies out to "run it once" creates stale closures. If including a dependency causes too many runs, fix the cause: move the object or function inside the effect, use the updater form, use `useEffectEvent` for values you only read, or memoise the dependency.

### What is the cleanup function for, and when does it run? {core}

The function you return from an effect undoes what the effect set up: close the WebSocket or EventSource, clear a timer, abort a request, remove a listener. React runs it **before the effect runs again** (with the old values) and when the component **unmounts**. In development StrictMode, React also runs setup → cleanup → setup once on mount to prove the cleanup is correct.

Without a cleanup you get leaks, duplicate subscriptions (two sockets, every message handled twice), or a state update from a request that belongs to a previous prop value.

### How do you avoid race conditions when fetching in an effect?

When the dependency changes quickly (typing a search, switching runs), several requests are in flight and they can resolve out of order, so an old response overwrites the new one. Fix it in the cleanup: either abort the previous request with an `AbortController`, or set an `ignore` flag that the `.then` checks before calling `setState`.

```tsx
import { useEffect, useState } from 'react';

export function useRunSearch(query: string) {
  const [results, setResults] = useState<string[]>([]);
  useEffect(() => {
    let ignore = false;
    fetch(`/api/runs?q=${encodeURIComponent(query)}`)
      .then((r) => r.json() as Promise<string[]>)
      .then((data) => {
        if (!ignore) setResults(data); // a response for an old query is dropped
      });
    return () => {
      ignore = true;
    };
  }, [query]);
  return results;
}
```

In production code, a data library such as TanStack Query handles races, caching, retries and deduplication; say so in the interview.

### When should you not use useEffect? {core}

When there is no external system involved. Values computed from props or state should be computed during render (not mirrored into state by an effect, which causes an extra render and is stale for one frame). Logic caused by a user action belongs in the event handler. Resetting state when a prop changes is done with a `key`. Effects are an escape hatch for synchronising with the outside world: network, sockets, timers, imperative DOM or third-party widgets.

A good line: "If I can describe the effect as 'when X changes, set state Y', it is usually derived state and should not be an effect."

### What is the difference between useEffect and useLayoutEffect?

Both run after React updates the DOM. `useLayoutEffect` runs **synchronously before the browser paints**, so you can measure layout and adjust it without a visible flicker (positioning a tooltip, keeping a chat pinned to the bottom after a new message). `useEffect` usually runs **after paint** and does not block the screen, so it is the default for almost everything: data fetching, subscriptions, logging. (When an update comes from a discrete interaction such as a click, React may flush effects before the paint, so never rely on `useEffect` for flicker-free layout.)

`useLayoutEffect` does nothing useful on the server, where there is no layout.

### useRef versus useState: when do you use which?

Both persist across renders. Changing state **triggers a re-render**, so use it for anything the UI shows. A ref is a mutable box (`ref.current`) whose changes do **not** re-render, so use it for values the UI does not display: a DOM node, a timer ID, the WebSocket instance, an `AbortController`, a token buffer you flush on the next animation frame, a "latest value" for a long-lived callback.

Do not read or write `ref.current` during render (except to lazily initialise it), because render must be pure and the value would not match what is on screen.

### useMemo versus useCallback: what do they do, and when are they worth it? {core}

`useMemo(fn, deps)` caches the **result** of `fn` until a dependency changes; `useCallback(fn, deps)` caches the **function itself** (it is `useMemo(() => fn, deps)`). Use them for two reasons: an expensive calculation you do not want to repeat on every render, or keeping an object, array or function **reference stable** because a `memo` child, an effect dependency or another hook compares it.

They are not free (memory, comparisons, harder code), so do not wrap everything; measure with the Profiler first. With React Compiler 1.0 in the build, components and hooks are memoised automatically and manual `useMemo`/`useCallback` is rarely needed.

### What is a stale closure, and how do you fix it? {core}

Every render creates new functions that "close over" that render's props and state. If a function created in an old render is still running later (an interval callback, a WebSocket `onmessage`, an effect with missing dependencies, an async handler), it sees the **old** values. Classic example: `setInterval(() => setCount(count + 1), 1000)` inside `useEffect(..., [])` sets the count to 1 forever, because `count` is always the initial 0.

```tsx
import { useEffect, useState } from 'react';

export function Ticker() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // Bug version: setCount(count + 1) would always compute 0 + 1.
    const id = setInterval(() => setCount((c) => c + 1), 1000); // fixed: the updater reads the latest value
    return () => clearInterval(id);
  }, []);
  return <p>{count}</p>;
}
```

Fixes: list the value as a dependency (if re-subscribing is acceptable), use the functional updater, keep the latest value in a ref, or use `useEffectEvent` to read the latest props inside a long-lived callback.

### A WebSocket handler in your component keeps reading old state. How do you fix it without reconnecting on every change? {core}

The handler was created in the render that opened the socket, so it closed over that render's state. Adding the state to the effect's dependencies does make it current, but it tears down and reopens the socket on every change, which loses messages and hammers the server.

Keep the connection effect depending only on what identifies the connection (the URL or run ID), and read changing values another way: use updater functions for state you are appending to, wrap the handler logic in `useEffectEvent` (React 19.2) so it always sees the latest props and state, or keep the value in a ref that you update after each render. For larger apps, push messages into an external store and let components read slices with `useSyncExternalStore`.

### When do you choose useReducer over useState?

When the state has several fields that change together, when the next state depends on the previous one in non-trivial ways, or when many handlers update the same state, such as a run moving through queued, running, waiting for approval and done. A reducer puts all transitions in one pure function `(state, action) => newState`, easy to unit test without rendering, and `dispatch` is stable, so it can be passed down or used in effects without dependency churn.

For a single boolean or a text input, `useState` is simpler. Redux uses the same reducer idea at app scale, and a socket message can map directly to a dispatched action.

### How does useContext work, and what are its performance pitfalls? {core}

A provider makes a value available to every component below it; `useContext(Ctx)` (or `use(Ctx)` in React 19) reads the value from the nearest provider above. When the provider's `value` changes (by reference), **every** component that reads that context re-renders, even if it only uses one field, and `React.memo` does not stop it.

Mitigations: memoise the value object (`useMemo(() => ({ user, signOut }), [user])`), split contexts (state vs dispatch, or by concern), keep fast-changing values such as streaming tokens out of context, or use a store with selectors (Zustand, Redux, `useSyncExternalStore`) when many components read different slices of frequently changing state.

### What is useSyncExternalStore for? {core}

It subscribes a component to a store that lives **outside React** (a WebSocket-fed cache, a browser API like `navigator.onLine`, a state library) in a way that is safe with concurrent rendering: React reads one consistent snapshot per render, so two components never show different versions of the store at once ("tearing"). You give it `subscribe`, `getSnapshot`, and optionally `getServerSnapshot`. Redux and Zustand use it internally.

The two rules: `subscribe` should be a stable function (or React resubscribes on every render), and `getSnapshot` must return the same reference when nothing changed, so select an existing object from an immutable store rather than building a new one each call.

### What makes a good custom hook? Give an example. {core}

A custom hook extracts reusable stateful logic behind a clear name and a small return value: `useDebouncedValue(value, 300)`, `useOnlineStatus()`, `useRun(store, id)`, `useChatStream(url)`. It starts with `use` so the linter checks the rules of hooks inside it, it calls other hooks, and each component that calls it gets its **own** state; hooks share logic, not data.

Good custom hooks focus on one concern, handle their own cleanup (close the socket, abort the request), and hide implementation details. Avoid "lifecycle" hooks like `useMount` that just wrap `useEffect` without meaning.

### useTransition versus useDeferredValue: what is the difference? {deep}

Both mark work as **non-urgent** so React can keep the UI responsive and interrupt a slow render. `useTransition` gives you `startTransition(() => setState(...))` and an `isPending` flag: use it when **you own the state update** (switching tabs, applying a filter). `useDeferredValue(value)` gives you a lagging copy of a value: use it when you **receive** a value (a prop or a fast-changing input) and want the expensive part of the tree to re-render with it later.

Neither makes the work faster; they let urgent updates such as typing go first. A common mistake with `useDeferredValue`: computing the slow part inline in the same component, so it still runs in every urgent render. Put the slow list in a `memo` child (or a `useMemo`) that receives the deferred value. In React 19, `startTransition` also accepts async functions (Actions).

### What problem does useId solve? {deep}

`useId()` generates a unique ID that is **stable across renders and identical on the server and the client**, so you can link labels and inputs (`htmlFor`/`id`) or ARIA attributes (`aria-describedby`) without hydration mismatches. It is not for list keys; keys should come from your data.

### What is useEffectEvent? {deep}

`useEffectEvent` (stable since React 19.2) wraps a function so it always sees the **latest** props and state but is **not** a dependency of your effect. It solves the case where an effect should re-run for some values (the socket URL) but only read others (a paused flag, the current filter, the theme in a log line). Before it, people either added the value to the dependencies (reconnecting needlessly) or suppressed the lint rule (creating stale closures).

Only call the returned function from inside effects or callbacks they set up, not during render, and do not pass it to child components as an event handler.

### Why does my effect run twice in development? {core}

React's StrictMode, in development only, mounts each component, runs its effects, simulates an unmount (running cleanups) and mounts it again. It is checking that your effect is **resilient**: setup followed by cleanup followed by setup must behave like a single setup. In production it runs once.

The right fix is a correct cleanup (close the socket, abort the request, clear the timer), not removing StrictMode or adding a "has run" ref. If the double run causes a visible bug (two sockets, two POSTs), the code would also misbehave in real cases like fast navigation or `<Activity>`.

### What causes an infinite loop with useEffect?

An effect that sets state which changes one of its own dependencies, so every render triggers another. The usual culprits: no dependency array with a `setState` inside; an object, array or function created during render used as a dependency (a new reference each render, so the effect always re-runs); or derived state mirrored with an effect.

Fixes: correct dependencies, move object or function creation inside the effect, memoise them, use the functional updater, or remove the effect and compute the value during render.

### Can you write a hook that tracks the previous value of a prop? {deep}

Yes, with a ref updated after each render. During render the ref still holds the value from the last commit, so you return it, then an effect stores the current value for next time.

```tsx
import { useEffect, useRef } from 'react';

export function usePreviousValue<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
```

The caveat: reading a ref during render is discouraged, and React Compiler's lint rules flag it. React's docs suggest keeping the previous value in state and updating it during render; note that this version tracks the previous *different* value, which is usually what you want:

```tsx
import { useState } from 'react';

export function usePreviousDistinct<T>(value: T): T | undefined {
  const [current, setCurrent] = useState(value);
  const [previous, setPrevious] = useState<T | undefined>(undefined);
  if (!Object.is(value, current)) {
    // Setting state during render is allowed for this pattern: React re-runs the component at once.
    setPrevious(current);
    setCurrent(value);
  }
  return previous;
}
```

Mention both: the ref version is the widely known answer, the state version is the one that stays correct under the compiler and concurrent rendering.

## Coding problems

### Write a useInterval hook {medium core}

Write `useInterval(callback, delay)`. It calls the **latest** `callback` every `delay` milliseconds. Changing the callback must not restart the timer; changing `delay` restarts it; `delay === null` pauses it. Show it driving a "poll the run status every 2 seconds until it finishes" component.

#### Hints

1. The naive version puts `callback` in the effect's dependencies, so the timer restarts on every render, because a new callback is created each time.
2. Keep the latest callback somewhere the interval can read without being a dependency.
3. A ref updated in an effect after each render works; so does `useEffectEvent`.

#### Solution

The interval depends only on `delay`. The callback is stored in a ref that is refreshed after every render, and the interval calls `savedCallback.current()`, so it always runs the newest function without being restarted. `null` skips creating the interval, which is a clean way to pause.

```tsx
import { useEffect, useRef, useState } from 'react';

export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef(callback);

  // After every render, remember the latest callback (it closes over the latest state).
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (delay === null) return; // paused
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

type Status = 'queued' | 'running' | 'done' | 'failed';

export function RunPoller({ runId, fetchStatus }: { runId: string; fetchStatus: (id: string) => Promise<Status> }) {
  const [status, setStatus] = useState<Status>('queued');
  const finished = status === 'done' || status === 'failed';
  useInterval(
    () => {
      fetchStatus(runId).then(setStatus);
    },
    finished ? null : 2000, // stop polling once the run is terminal
  );
  return <p aria-live="polite">Run {runId}: {status}</p>;
}
```

Complexity: O(1) work per tick. With React 19.2 you can replace the ref with `const onTick = useEffectEvent(callback)` and call `onTick()` inside the interval.

#### Follow-ups

- **What if a poll takes longer than the interval?** Responses can overlap and arrive out of order. Use a recursive `setTimeout` that schedules the next poll after the current one settles, and abort the in-flight request on cleanup.
- **How would you add backoff?** Keep the delay in state and multiply it (with a cap and jitter) after each unchanged or failed response; reset it when something changes.
- **Would you poll at all?** For live runs, prefer pushing updates over SSE or WebSockets; polling is the fallback when a stream is unavailable.

### Write a useChatSocket hook {medium core}

Write `useChatSocket(url)` that opens a WebSocket, collects incoming messages into state, exposes `send(text)` and the connection status, and closes the socket when the URL changes or the component unmounts. Messages that arrive while the user has "muted" the feed (a prop) must be dropped, without reconnecting when `muted` changes.

#### Hints

1. Open the socket in an effect that depends only on `url`, and close it in the cleanup.
2. Keep the socket in a ref so `send` can use it without being recreated on every render.
3. `muted` changes often: read it through `useEffectEvent` (or a latest ref) instead of making it a dependency.

#### Solution

The effect owns the connection's lifetime. Messages are appended with an updater so the handler never reads stale state, and the muted check goes through an Effect Event so it always sees the current prop. The cleanup detaches the handlers before closing, because a closing socket still fires `close` asynchronously and would otherwise report "closed" while the new connection is open. `send` refuses to write when the socket is not open instead of throwing.

```tsx
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

type Status = 'connecting' | 'open' | 'closed';

export function useChatSocket(url: string, muted: boolean) {
  const [messages, setMessages] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>('connecting');
  const socketRef = useRef<WebSocket | null>(null);

  const onMessage = useEffectEvent((text: string) => {
    if (!muted) setMessages((m) => [...m, text]);
  });

  useEffect(() => {
    setStatus('connecting');
    const ws = new WebSocket(url);
    socketRef.current = ws;
    ws.onopen = () => setStatus('open');
    ws.onclose = () => setStatus('closed');
    ws.onmessage = (e: MessageEvent<string>) => onMessage(e.data);
    return () => {
      // Detach first: the old socket's close event arrives later, possibly after the new socket
      // opened, and would otherwise set the status to 'closed' for the wrong connection.
      ws.onopen = ws.onclose = ws.onmessage = null;
      ws.close();
      if (socketRef.current === ws) socketRef.current = null;
    };
  }, [url]);

  const send = useCallback((text: string): boolean => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(text);
    return true;
  }, []);

  return { messages, status, send };
}

export function ChatPanel({ url }: { url: string }) {
  const [muted, setMuted] = useState(false);
  const { messages, status, send } = useChatSocket(url, muted);
  return (
    <section aria-label="Chat">
      <p>Status: {status}</p>
      <button onClick={() => setMuted((m) => !m)} aria-pressed={muted}>
        {muted ? 'Unmute' : 'Mute'}
      </button>
      <ul>
        {messages.map((m, i) => (
          <li key={i}>{m}</li>
        ))}
      </ul>
      <button onClick={() => send('ping')} disabled={status !== 'open'}>
        Ping
      </button>
    </section>
  );
}
```

Complexity: O(1) per message plus the array copy for the new state (cap the array for long sessions).

#### Follow-ups

- **How do you reconnect?** On an unexpected close, schedule a reconnect with exponential backoff and jitter, reset the delay after a successful open, and resubscribe or resync from the last message ID the client saw.
- **Why might index keys be wrong here?** If messages can be removed or reordered (edits, server corrections), use a server-assigned message ID as the key.
- **How would you test it?** Render the hook against a mock WebSocket server (for example MSW's WebSocket support or a fake `WebSocket` class), push messages, and assert on the rendered list and on `send`.

### Build a tiny store that works with useSyncExternalStore {medium}

Write `createStore(initial)` returning `getState`, `setState(updater)` and `subscribe(listener)`. Listeners must only be notified when the state actually changes. Then write a `useStore(store, selector)` hook. Explain why a selector that returns a new object each time is a problem.

#### Hints

1. `subscribe` adds the listener to a `Set` and returns a function that removes it.
2. In `setState`, compute the next state and compare it with `Object.is` before notifying.
3. In the hook, `useSyncExternalStore(store.subscribe, () => selector(store.getState()))`; think about what happens when the selector builds a new array.

#### Solution

The store is a closure over the current state and a set of listeners, so it can be tested without React. It notifies only on a real change, which keeps components quiet when an update is a no-op.

```ts
import assert from 'node:assert/strict';

export function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getState: () => state,
    setState(updater: (prev: T) => T) {
      const next = updater(state);
      if (Object.is(next, state)) return; // no change, no notifications
      state = next;
      for (const l of listeners) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

type Approvals = { pending: readonly string[]; muted: boolean };
const store = createStore<Approvals>({ pending: [], muted: false });

let calls = 0;
const off = store.subscribe(() => calls++);
store.setState((s) => ({ ...s, pending: [...s.pending, 'run-7'] }));
store.setState((s) => s); // a no-op updater
store.setState((s) => (s.muted ? s : { ...s, muted: true }));
off();
store.setState((s) => ({ ...s, pending: [] }));

assert.equal(calls, 2);
assert.deepEqual(store.getState(), { pending: [], muted: true });
```

The React hook is one line. A selector must return a value that is stable when nothing relevant changed: select primitives or existing objects, never `s.pending.filter(...)` inline, which returns a new array on every call and makes React re-render in a loop.

```tsx
import { useSyncExternalStore } from 'react';

type Store<T> = { getState: () => T; subscribe: (listener: () => void) => () => void };

export function useStore<T, S>(store: Store<T>, selector: (state: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

export function PendingCount({ store }: { store: Store<{ pending: readonly string[]; muted: boolean }> }) {
  const count = useStore(store, (s) => s.pending.length); // a number: stable when unchanged
  return <span aria-label="Pending approvals">{count}</span>;
}
```

Complexity: `setState` is O(listeners); each subscribed component runs its selector and compares one value.

#### Follow-ups

- **How do you select several fields?** Return a tuple or object and compare it shallowly before deciding to re-render (Zustand's `useShallow`, react-redux's `shallowEqual`), or memoise the derived value with a memoised selector.
- **How is this different from Zustand?** Barely: Zustand's vanilla store is this pattern plus middleware (persist, devtools, immer) and a hook that wraps `useSyncExternalStore`.
- **What about server rendering?** Pass a third argument, `getServerSnapshot`, so the server and the first client render agree.
