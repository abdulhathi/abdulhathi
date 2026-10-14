---
title: React hooks in depth
goal: Use every built-in hook correctly, explain dependency arrays, cleanups and stale closures, and write custom hooks on the spot.
minutes: 50
---

Hooks are where React interviews get specific. Expect "what does the dependency array do?", "why does my effect run twice?", "useMemo or useCallback?", and a request to write a custom hook live. Interviewers listen for whether you understand that **every render has its own props, state and functions**: almost every hooks bug (stale values, infinite loops, races) comes from forgetting that.

## Rules of hooks

1. Call hooks **only at the top level** of a component or a custom hook: not inside conditions, loops, nested functions or after an early `return`.
2. Call hooks **only from React functions** (components and custom hooks), never from plain utilities or class components.

Why: React stores hook state in a list per component and matches each call to its slot **by call order**. If a hook is skipped on one render, every later hook reads the wrong slot. The `eslint-plugin-react-hooks` rules (`rules-of-hooks`, `exhaustive-deps`) catch these mistakes; keep them on. The one exception is `use()`, which may be called conditionally.

## useState: snapshots, updaters and lazy init

```tsx
import { useState } from 'react';

function expensiveDefaultFilters() {
  return { status: 'open', payer: 'all' };
}

export function Counter() {
  const [count, setCount] = useState(0);
  // Lazy initial state: pass the function, not its result, so it runs on the first render only.
  const [filters] = useState(expensiveDefaultFilters);

  const addThree = () => {
    // Each call sees the SAME snapshot (count), so this adds 1:
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

An effect connects a component to an **external system**: a network request, a subscription, a timer, the DOM, a browser API. It runs after the commit (after paint, normally), and its cleanup runs before the next run and on unmount.

| Dependency array | Runs |
|---|---|
| none: `useEffect(fn)` | after every render |
| empty: `useEffect(fn, [])` | after the first render (and cleanup on unmount) |
| `[a, b]` | after the first render, then whenever `a` or `b` changed (`Object.is`) |

Fetching with a cleanup that prevents race conditions:

```tsx
import { useEffect, useState } from 'react';

type Claim = { id: string; status: string };

export function ClaimStatus({ claimId }: { claimId: string }) {
  const [claim, setClaim] = useState<Claim | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    fetch(`/api/claims/${claimId}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<Claim>;
      })
      .then(setClaim)
      .catch((e: unknown) => {
        // Aborting rejects with an AbortError: that is our own cleanup, not a failure.
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      });
    // If claimId changes before the response arrives, the old request is cancelled,
    // so a slow old response can never overwrite the new one.
    return () => controller.abort();
  }, [claimId]);

  if (error) return <p role="alert">{error}</p>;
  return <p>{claim ? `${claim.id}: ${claim.status}` : 'Loading…'}</p>;
}
```

### You might not need an effect

| Instead of an effect that… | Do this |
|---|---|
| computes a value from props or state (`setFullName(first + ' ' + last)`) | compute it during render; `useMemo` if it is expensive |
| reacts to a user action (submit, click) | put the logic in the event handler |
| resets state when a prop changes | give the component a `key` |
| fetches server data in every component | a data library (TanStack Query) or a framework loader |
| notifies the parent after state changes | call the parent's callback in the same event handler |

## useLayoutEffect, useRef, useMemo and useCallback

| Hook | Use it for | Watch out for |
|---|---|---|
| `useLayoutEffect` | measuring the DOM and adjusting before the browser paints (tooltips, scroll position) | it blocks paint; prefer `useEffect` |
| `useRef` | a mutable box that survives renders without causing them: DOM nodes, timer IDs, the previous value | changing `ref.current` does not re-render; do not read or write it during render (except lazy init) |
| `useMemo` | caching an expensive calculation, or keeping an object/array reference stable for a memoized child or an effect dependency | it is a performance hint, not a guarantee |
| `useCallback` | keeping a function reference stable for a `memo` child or a dependency | useless unless something compares the reference |

```tsx
import { memo, useCallback, useMemo, useState } from 'react';

type Row = { id: number; payer: string; amount: number };

const ClaimTable = memo(function ClaimTable({ rows, onOpen }: { rows: Row[]; onOpen: (id: number) => void }) {
  return (
    <ul>
      {rows.map((r) => (
        <li key={r.id} onClick={() => onOpen(r.id)}>
          {r.payer}: {r.amount}
        </li>
      ))}
    </ul>
  );
});

export function Claims({ all }: { all: Row[] }) {
  const [payer, setPayer] = useState('all');
  const [note, setNote] = useState('');

  // Typing a note re-renders Claims, but rows and onOpen keep the same references,
  // so the memoized table skips re-rendering.
  const rows = useMemo(() => (payer === 'all' ? all : all.filter((r) => r.payer === payer)), [all, payer]);
  const onOpen = useCallback((id: number) => console.log('open claim', id), []);

  return (
    <>
      <select value={payer} onChange={(e) => setPayer(e.target.value)}>
        <option value="all">All payers</option>
        <option value="Molina">Molina</option>
      </select>
      <input value={note} onChange={(e) => setNote(e.target.value)} />
      <ClaimTable rows={rows} onOpen={onOpen} />
    </>
  );
}
```

With **React Compiler 1.0** (stable since October 2025) enabled in the build, most of this manual memoization is done automatically.

## useReducer and useContext together

For state with several related fields and transitions, a reducer keeps the update rules in one pure, testable function. Pairing it with context gives a small app-wide store without a library.

```tsx
import { createContext, use, useReducer, type Dispatch, type ReactNode } from 'react';

type State = { items: string[]; status: 'idle' | 'saving' | 'error' };
type Action = { type: 'add'; item: string } | { type: 'remove'; index: number } | { type: 'status'; status: State['status'] };

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add':
      return { ...state, items: [...state.items, action.item] };
    case 'remove':
      return { ...state, items: state.items.filter((_, i) => i !== action.index) };
    case 'status':
      return { ...state, status: action.status };
  }
}

const StateContext = createContext<State | null>(null);
const DispatchContext = createContext<Dispatch<Action> | null>(null);

// Two contexts: components that only dispatch do not re-render when state changes.
export function WorklistProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { items: [], status: 'idle' });
  return (
    <StateContext value={state}>
      <DispatchContext value={dispatch}>{children}</DispatchContext>
    </StateContext>
  );
}

export function useWorklist() {
  const state = use(StateContext);
  if (!state) throw new Error('useWorklist must be used inside <WorklistProvider>');
  return state;
}

export function useWorklistDispatch() {
  const dispatch = use(DispatchContext);
  if (!dispatch) throw new Error('useWorklistDispatch must be used inside <WorklistProvider>');
  return dispatch;
}
```

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

/** Subscribe to a browser API the React 18+ way, safe with concurrent rendering. */
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
import { useDeferredValue, useEffect, useEffectEvent, useId, useState, useTransition } from 'react';

function slowFilter(items: string[], q: string) {
  return items.filter((i) => i.toLowerCase().includes(q.toLowerCase()));
}

export function PatientSearch({ names }: { names: string[] }) {
  const [query, setQuery] = useState('');
  // The input stays responsive; the long list re-renders with the deferred value when React has time.
  const deferredQuery = useDeferredValue(query);
  const results = slowFilter(names, deferredQuery);
  const id = useId(); // stable, unique, and identical on server and client

  return (
    <>
      <label htmlFor={id}>Search</label>
      <input id={id} value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul style={{ opacity: query !== deferredQuery ? 0.6 : 1 }}>
        {results.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </>
  );
}

export function Tabs({ onTabChange }: { onTabChange: (t: string) => void }) {
  const [tab, setTab] = useState('summary');
  const [isPending, startTransition] = useTransition();
  return (
    <div>
      {['summary', 'claims', 'documents'].map((t) => (
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

// useEffectEvent (React 19.2): read the latest props inside an effect without making them dependencies.
export function ChatRoom({ roomId, theme }: { roomId: string; theme: 'light' | 'dark' }) {
  const onConnected = useEffectEvent(() => {
    console.log(`connected to ${roomId} with ${theme} theme`); // always the latest theme
  });

  useEffect(() => {
    const t = setTimeout(() => onConnected(), 100); // stands in for a real connection
    return () => clearTimeout(t);
  }, [roomId]); // changing the theme no longer reconnects

  return <p>Room {roomId}</p>;
}
```

## Interview questions

### What are the rules of hooks, and why do they exist? {core}

Call hooks only at the top level of a component or custom hook, never inside conditions, loops or nested functions, and only from React function components or custom hooks. React identifies each hook by the **order** of calls in a render: it keeps a list of hook slots per component, so if a condition skips one hook, every hook after it reads another hook's state.

The ESLint plugin `eslint-plugin-react-hooks` enforces this. If you need conditional behaviour, put the condition **inside** the hook (`useEffect(() => { if (!enabled) return; ... }, [enabled])`). The one API that may be called conditionally is `use()`.

### Why does my state not update immediately after I call setState? {core}

Because state is a snapshot for each render. `setX(5)` asks React to re-render with 5, but the `x` variable in the currently running function is a constant that still holds the old value, so `console.log(x)` right after the setter prints the old one. The new value appears in the next render.

If you need the new value right away, compute it into a local variable first (`const next = x + 1; setX(next); save(next);`), or react to it in the next render. And React batches multiple setter calls into one re-render.

### When do you use the functional updater form of setState?

Whenever the new state depends on the previous state: `setCount((c) => c + 1)`. React queues updater functions and applies each to the latest value, so several updates in one event, or updates from timers and async callbacks, do not overwrite each other with stale values.

It also lets you drop the state variable from effect and callback dependencies, which avoids re-creating intervals or subscriptions. Example: an interval with `setCount((c) => c + 1)` can use `[]` dependencies and still count correctly.

### What is lazy initial state? {deep}

If you pass a **function** to `useState` (`useState(readSavedFilters)`), React calls it only on the first render to compute the initial value. Passing `useState(readSavedFilters())` calls the function on every render and throws the result away after the first, which wastes work when it is expensive (parsing localStorage, building a big structure). The same applies to `useReducer(reducer, arg, init)`.

### Explain the dependency array of useEffect. {core}

The dependency array tells React when to re-run the effect. With no array, it runs after every render; with `[]`, only after mount (and the cleanup on unmount); with `[a, b]`, after mount and whenever `a` or `b` changed, compared with `Object.is`. The array must list **every reactive value the effect reads**: props, state, and anything derived from them during render.

Leaving dependencies out to "run it once" creates stale closures: the effect keeps using values from the first render. If including a dependency causes too many runs, fix the cause: move the object or function inside the effect, use the updater form, use `useEffectEvent` for values you only want to read, or memoize the dependency.

### What is the cleanup function for, and when does it run? {core}

The function you return from an effect undoes what the effect set up: unsubscribe, clear a timer, abort a request, remove a listener. React runs it **before the effect runs again** (with the old values) and when the component **unmounts**. In development StrictMode, React also runs setup → cleanup → setup once on mount to prove the cleanup is correct.

Without a cleanup you get memory leaks, duplicate subscriptions, or a state update from a request that belongs to a previous prop value.

### How do you avoid race conditions when fetching in an effect?

When the dependency changes quickly (typing a search, switching patients), several requests are in flight and they can resolve out of order, so an old response overwrites the new one. Fix it in the cleanup: either abort the previous request with an `AbortController`, or set an `ignore` flag that the `.then` checks before calling `setState`.

```tsx
import { useEffect, useState } from 'react';

export function useSearch(query: string) {
  const [results, setResults] = useState<string[]>([]);
  useEffect(() => {
    let ignore = false;
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
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

In production code, a data library such as TanStack Query handles races, caching, retries and deduplication for you; say so in the interview.

### When should you not use useEffect? {core}

When there is no external system involved. Values computed from props or state should be computed during render (not mirrored into state by an effect, which causes an extra render and can be stale for one frame). Logic caused by a user action belongs in the event handler. Resetting state when a prop changes is done with a `key`. Effects are an escape hatch for synchronising with the outside world: network, subscriptions, timers, imperative DOM or third-party widgets.

A good line: "If I can describe the effect as 'when X changes, set state Y', it is usually derived state and should not be an effect."

### What is the difference between useEffect and useLayoutEffect?

Both run after React updates the DOM. `useLayoutEffect` runs **synchronously before the browser paints**, so you can measure layout (element size, scroll position) and change it without the user seeing a flicker. `useEffect` runs **after paint** and does not block the screen, so it is the default for almost everything: data fetching, subscriptions, logging.

Use `useLayoutEffect` only for measure-then-adjust cases such as positioning a tooltip. It does nothing useful on the server, where there is no layout.

### useRef versus useState: when do you use which? {core}

Both persist across renders. Changing state **triggers a re-render**, so use it for anything the UI shows. A ref is a mutable box (`ref.current`) whose changes do **not** re-render, so use it for values the UI does not display: a DOM node, a timer or interval ID, an `AbortController`, the previous value, a flag like "has this already been sent".

Do not read or write `ref.current` during render (except to lazily initialise it), because render must be pure and the value would not be in sync with what is on screen.

### useMemo versus useCallback: what do they do, and when are they worth it? {core}

`useMemo(fn, deps)` caches the **result** of `fn` until a dependency changes; `useCallback(fn, deps)` caches the **function itself** (it is `useMemo(() => fn, deps)`). Use them for two reasons: an expensive calculation you do not want to repeat on every render, or keeping an object, array or function **reference stable** because a `memo` child, an effect dependency or another hook compares it.

They are not free (extra memory and comparisons, more complex code), so do not wrap everything. Measure with the Profiler first. With React Compiler 1.0 in the build, components and hooks are memoized automatically and manual `useMemo`/`useCallback` is rarely needed.

### What is a stale closure, and how do you fix it? {core}

Every render creates new functions that "close over" that render's props and state. If a function created in an old render is still running later (an interval callback, an effect with missing dependencies, an async handler), it sees the **old** values. Classic example: `setInterval(() => setCount(count + 1), 1000)` inside `useEffect(..., [])` sets the count to 1 forever, because `count` is always the initial 0.

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

Fixes: list the value as a dependency, use the functional updater, keep the latest value in a ref, or use `useEffectEvent` to read the latest props inside an effect.

### When do you choose useReducer over useState?

When the state has several fields that change together, when the next state depends on the previous one in non-trivial ways, or when many event handlers update the same state. A reducer puts all transitions in one pure function `(state, action) => newState`, which is easy to unit test without rendering anything, and the `dispatch` function is stable, so it can be passed down or used in effects without dependency churn.

For a single boolean or a text input, `useState` is simpler. Redux uses the same reducer idea at app scale.

### How does useContext work, and what are its performance pitfalls? {core}

A provider makes a value available to every component below it; `useContext(Ctx)` (or `use(Ctx)` in React 19) reads the value from the nearest provider above. When the provider's `value` changes (by reference), **every** component that reads that context re-renders, even if it only uses one field, and `React.memo` does not stop it.

Mitigations: memoize the value object (`useMemo(() => ({ user, login }), [user])`), split contexts (state vs dispatch, or by concern), keep fast-changing values out of context, or use a store with selectors (Zustand, Redux) when many components read different slices of frequently changing state.

### What makes a good custom hook? Give an example. {core}

A custom hook extracts reusable stateful logic behind a clear name and a small return value, such as `useDebouncedValue(value, 300)`, `useOnlineStatus()`, or `usePatient(id)`. It starts with `use` so the linter can check the rules of hooks inside it, it calls other hooks, and each component that calls it gets its **own** state; hooks share logic, not data.

Good custom hooks are focused on one concern, handle their own cleanup, and hide implementation details (a component calling `useOnlineStatus()` should not care that it uses `useSyncExternalStore`). Avoid "lifecycle" hooks like `useMount` that just wrap `useEffect` without meaning.

### useTransition versus useDeferredValue: what is the difference? {deep}

Both mark work as **non-urgent** so React can keep the UI responsive and interrupt a slow render. `useTransition` gives you `startTransition(() => setState(...))` and an `isPending` flag: use it when **you own the state update** (switching tabs, applying a filter). `useDeferredValue(value)` gives you a lagging copy of a value: use it when you **receive** a value (a prop or a fast-changing input) and want the expensive part of the tree to re-render with it later.

Neither makes the work faster; they let urgent updates like typing go first. In React 19, `startTransition` also accepts async functions (Actions).

### What problem does useId solve? {deep}

`useId()` generates a unique ID that is **stable across renders and identical on the server and the client**, so you can link labels and inputs (`htmlFor`/`id`) or ARIA attributes (`aria-describedby`) without hydration mismatches. Before it, people used counters or `Math.random()`, which differ between server and client. It is not for list keys; keys should come from your data.

### What is useSyncExternalStore for? {deep}

It subscribes a component to a store that lives **outside React** (a browser API like `navigator.onLine`, a third-party state library, a WebSocket cache) in a way that is safe with concurrent rendering: React reads a consistent snapshot so different components never show different versions of the store in the same render ("tearing"). You give it `subscribe`, `getSnapshot` and optionally `getServerSnapshot`. Libraries like Redux and Zustand use it internally.

### What is useEffectEvent? {deep}

`useEffectEvent` (stable since React 19.2) wraps a function so it always sees the **latest** props and state but is **not** a dependency of your effect. It solves the case where an effect should re-run for some values (the room to connect to) but only read others (the theme used in a log message or a notification). Before it, people either added the value to the dependencies (reconnecting needlessly) or suppressed the lint rule (creating stale closures).

Only call the returned function from inside effects, not during render or as an event handler prop.

### Why does my effect run twice in development? {core}

React's StrictMode, in development only, mounts each component, runs its effects, simulates an unmount (running cleanups) and mounts it again. It is checking that your effect is **resilient**: that setup followed by cleanup followed by setup behaves like a single setup. In production it runs once.

The right fix is a correct cleanup (abort the request, unsubscribe, clear the timer), not removing StrictMode or adding a "has run" ref. If you see a visible bug from the double run (two analytics events, two POSTs), the code would also misbehave in real scenarios like fast navigation or `<Activity>`.

### What causes an infinite loop with useEffect?

An effect that sets state which changes one of its own dependencies, so every render triggers another. The usual culprits: no dependency array with a `setState` inside; an object, array or function created during render used as a dependency (a new reference each render, so the effect always re-runs); or derived state mirrored with an effect.

Fixes: add the correct dependencies, move object or function creation inside the effect, memoize them with `useMemo`/`useCallback`, use the functional updater, or remove the effect and compute the value during render.

### Can you write a hook that tracks the previous value of a prop? {deep}

Yes, with a ref that is updated after each render. During render the ref still holds the value from the last commit, so you return it, then an effect stores the current value for next time.

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

Mention the caveat: reading a ref during render is normally discouraged, and React's docs suggest storing the previous value in state and updating it during render when you need it to drive logic. For display or comparison purposes, the ref version is the widely known answer.
