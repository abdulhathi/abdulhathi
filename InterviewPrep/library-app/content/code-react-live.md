---
title: Live React coding tasks
goal: Build the React components interviewers ask for live, from counters, forms and tables to streaming chat, polling and reconnecting sockets, in typed, accessible, bug-free TSX.
minutes: 150
---

A "build this component" task is common in front-end and full-stack rounds, usually in CodeSandbox, StackBlitz or a
shared editor that may not run your code. The task itself is rarely hard. What separates candidates is the detail
interviewers watch for: immutable state updates, stable keys, effect cleanups, cancelled requests, loading and error
states, controlled inputs, accessible markup, and TypeScript types that model the state honestly.

The problems run from warm-ups (a counter, a task list, tabs) through data fetching, forms and tables, to the real-time
components AI products need: streaming chat, polling, a reconnecting socket and a virtualised log. Every solution is a
complete TSX module that type-checks under strict TypeScript with React 19 types. Write each one yourself at least once,
out loud, without looking: speed with `useState`, `useEffect`, `useRef` and event types is what counts on the day.

## The checklist interviewers grade against

| Area | What they look for |
|---|---|
| State updates | Never mutate: `[...items, x]`, `items.map(...)`, `items.filter(...)`, `{ ...obj, k: v }`. Functional updates (`setCount(c => c + 1)`) when the next value depends on the previous one |
| Keys | A stable id from the data, never the array index for lists that reorder, insert or delete |
| Effects | A cleanup for every timer, listener, socket and fetch (`clearInterval`, `removeEventListener`, `ws.close()`, `controller.abort()`) |
| Async UI | Explicit loading, error and empty states. Late responses are aborted or ignored |
| Forms | Controlled inputs (or React 19 actions), `event.preventDefault()`, trimmed values, validation messages tied to inputs |
| Derived data | Filtered or sorted lists are computed during render (`useMemo` if expensive), not copied into state |
| Accessibility | Real `<button>`s, `<label htmlFor>`, `aria-invalid`, `aria-sort`, `aria-selected`, `aria-busy`, keyboard support, focus management |
| TypeScript | Typed props, discriminated unions for request state, `unknown` in `catch`, generics where they remove duplication |

## Interview questions

### How do you approach a live React coding task? {core}

I restate the requirements and ask about the edge cases first: empty data, errors, slow networks, keyboard use. Then I
sketch the state (what is the minimum state, and what can be derived?) and the component boundaries before typing. I
build the happy path first, then loading and error states, then cleanup and accessibility, narrating each decision.
I finish by walking through an edge case out loud, such as "what if the user types quickly" or "what if the component
unmounts mid-request", and say what I would add with more time: tests, memoisation, a library such as TanStack Query.

### Which bugs do interviewers look for first in a React task? {core}

Missing effect cleanups (duplicate intervals, leaked sockets), race conditions where an old response overwrites a newer
one, stale closures in intervals and socket handlers, mutating state, index keys on lists that change, derived data kept
in state and drifting out of sync, and no loading or error state. Accessibility gaps come next: clickable `div`s, inputs
without labels, focus lost after a dialog closes. I check those deliberately before saying I am done.

### Why must React state be updated immutably? {core}

React decides whether to re-render by comparing the old and new state **by reference** (`Object.is`). If you `push` into
the existing array and call `setItems(items)`, the reference hasn't changed, so React may skip the render, and memoised
children never see the change. Create a new array or object (`[...items, x]`, `items.map(...)`) so the change is
visible, and so earlier renders keep their own snapshot.

### Why not use the array index as a key? {core}

A key tells React which item is which between renders. If you delete or reorder items, an index key now points at a
different item. React then reuses the wrong component instance, and local state (such as a checkbox or an input's text)
sticks to the wrong row. Use a stable id from the data. An index is acceptable only for a static list that never
reorders, inserts or deletes.

### When does an effect need a cleanup function?

Whenever it starts something that outlives the render: timers (`setInterval`), subscriptions, event listeners, sockets
and in-flight fetches. React runs the cleanup before re-running the effect and on unmount. Without it you get leaks,
duplicate intervals, and stale responses updating state after the component has moved on. In development, StrictMode deliberately mounts,
unmounts and remounts each component to expose missing cleanups.

### How do you avoid a race condition when fetching in useEffect? {core}

When the input changes quickly (page 1, then page 2), an older response can arrive after a newer one and overwrite it. Fix
it with an `AbortController` aborted in the cleanup, which cancels the request, or with an `ignore` flag set in the
cleanup and checked before calling `setState`. In production, TanStack Query or a framework loader handles this, plus
caching and retries.

### Should a filtered list live in state? {deep}

No. Store the source data and the filter text, and **derive** the filtered list during render. Copying derived data into
state creates two sources of truth that drift apart, and needs effects to keep them in sync. If the computation is
expensive, wrap it in `useMemo`.

### The shared editor cannot run your code. How do you still show it works?

I trace it out loud with a concrete scenario: "the user types `run`, the effect schedules a timer, they type `s`, the
cleanup clears the timer..." I keep functions small so each can be checked by reading, I write the types first so the
editor's type checker catches mistakes even without running, and I point out the risky lines myself (cleanups, the
dependency array, the abort branch). Catching my own bug before the interviewer does is a strong signal.

### When do you write it yourself, and when do you say "I would use a library"?

In the interview I write it myself unless told otherwise, because that is what is being assessed, but I name the
library I would use in production and why: TanStack Query for fetching and caching, TanStack Virtual for long lists, a
headless component library (Radix, React Aria) for dialogs and comboboxes, React Hook Form with zod for big forms. Saying
"in production I would not hand-roll a combobox, accessibility is hard to get fully right" shows judgement, not weakness.

### How do you keep a live-coded component testable?

Separate logic from rendering: pure functions for validation, sorting and parsing, custom hooks for effects, and
presentational components that take data and callbacks as props. I inject dependencies such as `fetch` or a socket URL
through props or a hook argument, so a test can pass a fake. And I use roles and labels in the markup, which is exactly
what React Testing Library queries by (`getByRole('button', { name: 'Stop' })`).

## Coding problems

### Counter with bounds {easy core}

Build a counter with − and + buttons and a Reset button. It must stay between `min` and `max` (props, defaults 0 and 10),
with the buttons disabled at the limits.

#### Hints

1. Use one `useState` for the count.
2. Use the functional form `setCount(c => ...)` so rapid clicks never read a stale value.
3. Clamp the new value with `Math.min(max, Math.max(min, value))`.

#### Solution

This one is about getting the small things right: the functional update, clamping, disabled buttons, `type="button"`, and
a label for screen readers on buttons that only show a symbol.

```tsx
import { useState } from 'react';

type CounterProps = { min?: number; max?: number; step?: number; initial?: number };

export function Counter({ min = 0, max = 10, step = 1, initial = min }: CounterProps) {
  const [count, setCount] = useState(initial);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));

  return (
    <div className="counter">
      <button type="button" aria-label="Decrease" disabled={count <= min} onClick={() => setCount((c) => clamp(c - step))}>
        −
      </button>
      <output aria-live="polite">{count}</output>
      <button type="button" aria-label="Increase" disabled={count >= max} onClick={() => setCount((c) => clamp(c + step))}>
        +
      </button>
      <button type="button" onClick={() => setCount(initial)}>
        Reset
      </button>
    </div>
  );
}
```

Each click is O(1). There's one piece of state.

#### Follow-ups

- **Why the functional update?** `setCount(count + 1)` called twice in one event uses the same `count` both times. The
  functional form chains correctly.
- **The parent needs the value?** Lift the state up: accept `value` and `onChange` props (a controlled component).

### Task list: add, toggle, delete {easy core}

Build a task list: an input and an Add button (Enter also adds), a checkbox per item to mark it done, a Delete button per
item, and a count of remaining items. Ignore blank input.

#### Hints

1. Store an array of `{ id, text, done }`. Generate ids with a counter in `useRef`, not the array index.
2. Wrap the input in a `<form>` and handle `onSubmit`, which gives Enter-to-add for free. Call `preventDefault()`.
3. Use `map` to toggle, `filter` to delete, and a spread to add. Never mutate.

#### Solution

The form element handles both the button click and the Enter key. Each update returns a new array. The remaining count is
derived during render, not stored.

```tsx
import { useRef, useState, type FormEvent } from 'react';

type Task = { id: number; text: string; done: boolean };

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(1);

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const id = nextId.current++; // outside the updater: updaters must be pure (StrictMode calls them twice)
    setTasks((list) => [...list, { id, text, done: false }]);
    setDraft('');
  }

  const toggle = (id: number) => setTasks((list) => list.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  const remove = (id: number) => setTasks((list) => list.filter((t) => t.id !== id));
  const remaining = tasks.filter((t) => !t.done).length;

  return (
    <section>
      <form onSubmit={add}>
        <label htmlFor="new-task">New task</label>
        <input id="new-task" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Call patient back" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {tasks.map((t) => (
          <li key={t.id}>
            <label>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} />
              <span style={{ textDecoration: t.done ? 'line-through' : 'none' }}>{t.text}</span>
            </label>
            <button type="button" aria-label={`Delete ${t.text}`} onClick={() => remove(t.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <p>{tasks.length === 0 ? 'Nothing to do.' : `${remaining} of ${tasks.length} remaining`}</p>
    </section>
  );
}
```

Complexity: add is O(n) (the array is copied), and toggle and delete are O(n). That's fine for UI-sized lists.

#### Follow-ups

- **Keep the tasks across reloads?** Use the `useLocalStorage` hook from the problem below in place of `useState`.
- **The list gets complex (edit, filter, clear completed)?** Move to `useReducer`, with actions like `{ type: 'toggle', id }`.
  Reducers are pure and easy to unit test.

### useFetch with a typed request state {easy core}

Write a `useFetch<T>(url)` hook that returns the request state as a discriminated union (`loading`, `error`, `success`)
plus a `reload()` function. Changing the URL must cancel the previous request. Then use it to render a list of agent
runs.

#### Hints

1. Model the state as a union, so `data` only exists when `status === 'success'`. That removes a class of bugs.
2. Create an `AbortController` inside the effect and abort it in the cleanup. In `catch`, ignore errors when the signal
   was aborted.
3. For `reload`, keep an attempt counter in state and add it to the effect's dependencies.

#### Solution

The union makes impossible states (data and error at the same time) impossible to write. Aborting in the cleanup fixes
the race where a slow response for an old URL overwrites the new one, and it also stops wasted work on unmount.

```tsx
import { useEffect, useState } from 'react';

export type FetchState<T> = { status: 'loading' } | { status: 'error'; error: string } | { status: 'success'; data: T };

export function useFetch<T>(url: string): FetchState<T> & { reload: () => void } {
  const [state, setState] = useState<FetchState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as T; // validate with zod at a real boundary
      })
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return; // a newer request (or unmount) replaced this one
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [url, attempt]);

  return { ...state, reload: () => setAttempt((a) => a + 1) };
}

type Run = { id: string; agent: string; status: 'running' | 'succeeded' | 'failed' };

export function RunList({ agent }: { agent: string }) {
  const result = useFetch<Run[]>(`/api/runs?agent=${encodeURIComponent(agent)}`);
  switch (result.status) {
    case 'loading':
      return <p aria-busy="true">Loading runs…</p>;
    case 'error':
      return (
        <p role="alert">
          Could not load runs ({result.error}).{' '}
          <button type="button" onClick={result.reload}>
            Retry
          </button>
        </p>
      );
    case 'success':
      return result.data.length === 0 ? (
        <p>No runs yet.</p>
      ) : (
        <ul>
          {result.data.map((r) => (
            <li key={r.id}>
              {r.id}: {r.status}
            </li>
          ))}
        </ul>
      );
  }
}
```

One request per URL change. The `switch` is exhaustive, so adding a new status is a compile error until it is handled.

#### Follow-ups

- **Caching, retries, deduplication?** That is what TanStack Query does: `useQuery({ queryKey: ['runs', agent], queryFn })`.
- **Auth?** Add `Authorization: Bearer <token>` to the headers. On a 401, refresh the token or redirect to login. The
  backend must allow the origin via CORS.
- **Suspense?** React 19's `use(promise)` with a cached promise lets a Suspense boundary show the loading state, but the
  promise must be cached outside render (a library or a cache map), or it is recreated on every render.

### Accessible tabs {easy}

Build a Tabs component for a patient chart (Summary, Medications, Allergies). Clicking a tab shows its panel, and the Left
and Right arrow keys move between tabs. Use the right ARIA roles.

#### Hints

1. The roles are `tablist`, `tab` (with `aria-selected` and `aria-controls`) and `tabpanel` (with `aria-labelledby`).
2. Keep only the active index in state.
3. Arrow keys: `(index + 1) % n` and `(index - 1 + n) % n`. Move focus to the newly selected tab with a ref array.

#### Solution

This follows the WAI-ARIA tabs pattern: only the active tab is in the tab order (`tabIndex` 0 versus -1), and the
arrow keys move both selection and focus.

```tsx
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type Tab = { id: string; label: string; content: ReactNode };

export function Tabs({ tabs }: { tabs: Tab[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const n = tabs.length;
    const next = e.key === 'ArrowRight' ? (active + 1) % n : e.key === 'ArrowLeft' ? (active - 1 + n) % n : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Patient chart">
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={i === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            onKeyDown={onKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab, i) => (
        <div key={tab.id} role="tabpanel" id={`panel-${tab.id}`} aria-labelledby={`tab-${tab.id}`} hidden={i !== active}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}

export function PatientChart() {
  return (
    <Tabs
      tabs={[
        { id: 'summary', label: 'Summary', content: <p>Type 2 diabetes, well controlled.</p> },
        { id: 'meds', label: 'Medications', content: <p>Metformin 500 mg twice daily.</p> },
        { id: 'allergies', label: 'Allergies', content: <p>Penicillin.</p> },
      ]}
    />
  );
}
```

Each key press costs O(1).

#### Follow-ups

- **Why `hidden` instead of rendering only the active panel?** Hidden panels keep their state (form inputs, scroll
  position). If the panels are expensive, render only the active one.
- **The URL should reflect the tab?** Store the active tab in the query string or route, so it survives reloads and can
  be linked.

### Theme toggle with context and the system preference {easy}

Build a `ThemeProvider` with three choices (light, dark, system), a `useTheme()` hook that throws when used outside the
provider, the resolved theme following the operating system live when "system" is chosen, the choice saved across
visits, and the theme applied as `data-theme` on the `<html>` element.

#### Hints

1. `window.matchMedia('(prefers-color-scheme: dark)')` tells you the system theme, and its `change` event tells you when
   it changes. That is an external store, so read it with `useSyncExternalStore`.
2. `localStorage` can throw (private windows, blocked storage): wrap reads and writes in `try`/`catch`.
3. Create the context with `null` as the default, and throw a clear error in `useTheme` when it is `null`.

#### Solution

`useSyncExternalStore` subscribes to the media query correctly (no tearing, no missed changes between render and
subscribe). The context value is memoised, so consumers re-render only when the theme actually changes.

```tsx
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';

type Choice = 'light' | 'dark' | 'system';
type ThemeContextValue = { choice: Choice; resolved: 'light' | 'dark'; setChoice: (c: Choice) => void };

const ThemeContext = createContext<ThemeContextValue | null>(null);
const QUERY = '(prefers-color-scheme: dark)';
const KEY = 'theme';

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(QUERY);
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}
const systemPrefersDark = () => window.matchMedia(QUERY).matches;

function readChoice(): Choice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
  } catch {
    return 'system';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Choice>(readChoice);
  const prefersDark = useSyncExternalStore(subscribe, systemPrefersDark, () => false); // false during SSR
  const resolved = choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    try {
      localStorage.setItem(KEY, choice);
    } catch {
      // the choice lasts for this visit only
    }
  }, [choice, resolved]);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}

export function ThemePicker() {
  const { choice, setChoice } = useTheme();
  return (
    <fieldset>
      <legend>Theme</legend>
      {(['light', 'dark', 'system'] as const).map((c) => (
        <label key={c}>
          <input type="radio" name="theme" value={c} checked={choice === c} onChange={() => setChoice(c)} /> {c}
        </label>
      ))}
    </fieldset>
  );
}
```

#### Follow-ups

- **Flash of the wrong theme on load?** Set `data-theme` from a tiny inline script in `index.html` before React loads.
- **React 19 shorthand?** `<ThemeContext value={value}>` works as a provider in React 19, so `.Provider` is optional.
- **Why not put the media query result in state with an effect?** It works, but `useSyncExternalStore` is the hook made
  for subscribing to external sources, and it avoids a render with a stale value.

### useLocalStorage hook {medium}

Write `useLocalStorage<T>(key, initialValue)`, which works like `useState` but persists to `localStorage` as JSON. It must
survive corrupt JSON and a `localStorage` that throws (private mode, blocked storage), and work during server-side
rendering, where `window` doesn't exist.

#### Hints

1. Use lazy initial state (`useState(() => read())`) so `localStorage` is read once, not on every render.
2. Write in an effect whenever the key or value changes.
3. Wrap both the read and the write in `try`/`catch`, and check `typeof window` for SSR.

#### Solution

The hook returns exactly what `useState` returns, so callers can use functional updates. All storage access is defensive,
because storage failures must never crash the UI.

```tsx
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback; // corrupt JSON or storage blocked
  }
}

export function useLocalStorage<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, initialValue));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // quota exceeded or storage blocked: keep working in memory
    }
  }, [key, value]);

  return [value, setValue];
}

// Usage
export function ThemePicker() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark'>('theme', 'light');
  return (
    <button type="button" onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
      Theme: {theme}
    </button>
  );
}
```

Reading costs O(size of the stored value) once. Each change costs one write.

#### Follow-ups

- **Sync across browser tabs?** Listen for the `storage` event on `window` (it fires in other tabs) and update the state.
  Remove the listener in the cleanup.
- **What if the `key` prop changes?** This version keeps the old key's value in state, and the effect then writes it
  under the new key, overwriting what was stored there. Store the key next to the value
  (`useState(() => ({ key, value: read(key, initialValue) }))`) and re-read during render when `key` differs, or have the
  parent remount the component with `key={storageKey}`.
- **Is it safe to store tokens or PHI here?** No. `localStorage` can be read by any script on the page, so an XSS bug
  steals it. Keep auth in httpOnly cookies, and keep PHI out of browser storage.

### Typeahead search with debounce, abort and keyboard support {medium core}

Build a "Find a tool" search box for an agent builder. It queries `/api/tools?q=` after the user stops typing for 250
ms, cancels outdated requests, shows a results list that works with the mouse and with Arrow Up, Arrow Down, Enter and
Escape, and announces the result count to screen readers.

#### Hints

1. Debounce the *value* with a small `useDebounced(value, ms)` hook, and fetch in an effect that depends on the debounced
   value.
2. Abort the previous request in the effect cleanup, so results for "ru" never overwrite results for "run".
3. Follow the ARIA combobox pattern: the input has `role="combobox"`, `aria-expanded`, `aria-controls` and
   `aria-activedescendant`, and the list is a `listbox` of `option`s with `aria-selected`.
4. Use `onMouseDown={e => e.preventDefault()}` on options so clicking one does not blur the input first.

#### Solution

Debounce reduces requests; abort fixes ordering; the combobox pattern makes it usable without a mouse. Focus stays in
the input the whole time, and `aria-activedescendant` tells assistive technology which option is highlighted.

```tsx
import { useEffect, useId, useState, type KeyboardEvent } from 'react';

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

type Tool = { id: string; name: string; description: string };

export function ToolSearch({ onSelect }: { onSelect: (tool: Tool) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Tool[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const term = useDebounced(query.trim(), 250);
  const id = useId();
  const listId = `${id}-list`;

  useEffect(() => {
    if (!term) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    fetch(`/api/tools?q=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Tool[]>;
      })
      .then((tools) => {
        setResults(tools);
        setActive(-1);
        setStatus('idle');
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('error');
      });
    return () => controller.abort();
  }, [term]);

  const expanded = open && results.length > 0;

  function choose(tool: Tool) {
    onSelect(tool);
    setQuery(tool.name);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown' && !open && results.length > 0) {
      e.preventDefault();
      return setOpen(true); // the combobox pattern: Arrow Down reopens a closed list
    }
    if (!expanded) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      choose(results[active]);
    }
  }

  const announcement = status === 'loading' ? 'Searching…' : status === 'error' ? 'Search failed' : term ? `${results.length} results` : '';

  return (
    <div className="combobox">
      <label htmlFor={`${id}-input`}>Find a tool</label>
      <input
        id={`${id}-input`}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${id}-opt-${results[active].id}` : undefined}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      <p role="status" className="visually-hidden">
        {announcement}
      </p>
      <ul id={listId} role="listbox" hidden={!expanded}>
        {results.map((tool, i) => (
          <li
            key={tool.id}
            id={`${id}-opt-${tool.id}`}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(tool)}
          >
            {tool.name} <small>{tool.description}</small>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

At most one request per pause in typing, and at most one in flight. Rendering is O(results).

#### Follow-ups

- **Debounce vs throttle?** Debounce waits for a pause (search boxes, autosave). Throttle runs at most once per interval
  while events keep coming (scroll, resize).
- **Debounce or `useDeferredValue`?** `useDeferredValue` keeps typing responsive while rendering a big list, but does not
  reduce network requests. Debounce does. Use both when filtering a large local list.
- **Caching repeated queries?** Keep a `Map<string, Tool[]>` or use TanStack Query with the term in the query key, so
  backspacing to an earlier term is instant.
- **Production?** Use a tested combobox (React Aria, Downshift, Radix-based). Comboboxes are one of the hardest widgets
  to get fully accessible.

### Controlled form with validation {medium core}

Build a patient registration form with name, email and date of birth. Show errors after a field loses focus, or after a
submit attempt: name is required, the email must look like an email, and the date of birth can't be in the future. On a
valid submit, call `onSubmit` with trimmed values.

#### Hints

1. Keep the values in one state object, and update it with `setValues(v => ({ ...v, [name]: value }))`.
2. Write `validate(values)` as a pure function that returns an errors object. Compute it during render.
3. Track which fields were "touched" (blurred) so errors don't shout at someone who hasn't typed yet.

#### Solution

Validation is a pure function of the values, so it's derived, not stored, and can be unit-tested without React. Errors
show for touched fields, or for every field after a submit attempt. Each input links to its message with
`aria-describedby` and sets `aria-invalid`.

```tsx
import { useState, type ChangeEvent, type FormEvent } from 'react';

type Values = { name: string; email: string; dob: string };
type Errors = Partial<Record<keyof Values, string>>;

// 'en-CA' formats as YYYY-MM-DD in local time; toISOString() would give the UTC date, a day ahead on US evenings.
export function validate(v: Values, today = new Date().toLocaleDateString('en-CA')): Errors {
  const errors: Errors = {};
  if (!v.name.trim()) errors.name = 'Name is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = 'Enter a valid email';
  if (!v.dob) errors.dob = 'Date of birth is required';
  else if (v.dob > today) errors.dob = 'Date of birth cannot be in the future';
  return errors;
}

const FIELDS: { name: keyof Values; label: string; type: string }[] = [
  { name: 'name', label: 'Full name', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'dob', label: 'Date of birth', type: 'date' },
];

export function RegistrationForm({ onSubmit }: { onSubmit: (values: Values) => void }) {
  const [values, setValues] = useState<Values>({ name: '', email: '', dob: '' });
  const [touched, setTouched] = useState<Partial<Record<keyof Values, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const errors = validate(values);

  function change(e: ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setValues((v) => ({ ...v, [name]: value }));
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    onSubmit({ name: values.name.trim(), email: values.email.trim(), dob: values.dob });
  }

  return (
    <form onSubmit={submit} noValidate>
      {FIELDS.map(({ name, label, type }) => {
        const error = (touched[name] || submitted) && errors[name];
        return (
          <div key={name}>
            <label htmlFor={name}>{label}</label>
            <input
              id={name}
              name={name}
              type={type}
              value={values[name]}
              onChange={change}
              onBlur={() => setTouched((t) => ({ ...t, [name]: true }))}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${name}-error` : undefined}
            />
            {error && <p id={`${name}-error`}>{error}</p>}
          </div>
        );
      })}
      <button type="submit">Register</button>
    </form>
  );
}
```

Validation is O(fields) per render.

#### Follow-ups

- **Bigger forms?** React Hook Form with a Zod schema. It uses uncontrolled inputs (fewer re-renders), and the schema can
  be shared with the backend's types.
- **Server-side errors (email already registered)?** Merge the API's field errors (FastAPI returns 422 with `loc` and `msg`)
  into the errors you display.
- **React 19 Actions?** `<form action={fn}>` with `useActionState` handles pending state and the result of an async
  submit without manual `isSubmitting` flags. The next problem builds one.

### Connector form with validation and an async submit (React 19 actions) {medium}

Build a form that registers an external API connector for agents: a name (required, at most 40 characters), a base
URL (must be `https://`), and a timeout in seconds (a whole number from 1 to 120). Validate on submit, show errors next
to the fields, show server-side field errors (for example "name already taken"), keep the user's input when there are
errors, and disable the button while saving.

#### Hints

1. React 19's `useActionState(action, initialState)` gives you `[state, formAction, isPending]`. Pass `formAction` to
   `<form action={...}>` and read the fields from `FormData`.
2. Write validation as a pure function of the values, so it is testable without React.
3. React resets an uncontrolled form after an action runs, even when you return errors. Return the submitted values in
   the state and render them as `defaultValue`, so they survive the reset.
4. Link each error to its input with `aria-describedby` and set `aria-invalid`.

#### Solution

The action is the single place that validates, calls the server and decides the next state. `isPending` replaces the
manual `isSubmitting` flag.

```tsx
import { useActionState } from 'react';

type Values = { name: string; baseUrl: string; timeout: string };
type Errors = Partial<Record<keyof Values | 'form', string>>;
type State = { values: Values; errors: Errors; saved: boolean };
type Connector = { name: string; baseUrl: string; timeoutSeconds: number };
type SaveResult = { fieldErrors?: Partial<Record<keyof Values, string>> };

const EMPTY: Values = { name: '', baseUrl: '', timeout: '30' };

export function validateConnector(v: Values): Errors {
  const errors: Errors = {};
  if (!v.name) errors.name = 'Name is required';
  else if (v.name.length > 40) errors.name = 'Use 40 characters or fewer';
  try {
    if (new URL(v.baseUrl).protocol !== 'https:') errors.baseUrl = 'The URL must start with https://';
  } catch {
    errors.baseUrl = 'Enter a full URL, for example https://api.example.com';
  }
  const t = Number(v.timeout);
  if (!Number.isInteger(t) || t < 1 || t > 120) errors.timeout = 'Enter a whole number from 1 to 120';
  return errors;
}

export function ConnectorForm({ save }: { save: (c: Connector) => Promise<SaveResult> }) {
  const [state, formAction, isPending] = useActionState(
    async (_previous: State, data: FormData): Promise<State> => {
      const values: Values = {
        name: String(data.get('name') ?? '').trim(),
        baseUrl: String(data.get('baseUrl') ?? '').trim(),
        timeout: String(data.get('timeout') ?? '').trim(),
      };
      const errors = validateConnector(values);
      if (Object.keys(errors).length) return { values, errors, saved: false };
      try {
        const result = await save({ name: values.name, baseUrl: values.baseUrl, timeoutSeconds: Number(values.timeout) });
        if (result.fieldErrors) return { values, errors: result.fieldErrors, saved: false };
        return { values: EMPTY, errors: {}, saved: true };
      } catch {
        return { values, errors: { form: 'Could not save the connector. Try again.' }, saved: false };
      }
    },
    { values: EMPTY, errors: {}, saved: false },
  );

  const field = (name: keyof Values, label: string, type = 'text') => {
    const error = state.errors[name];
    return (
      <div className="field">
        <label htmlFor={`connector-${name}`}>{label}</label>
        <input
          id={`connector-${name}`}
          name={name}
          type={type}
          defaultValue={state.values[name]}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `connector-${name}-error` : undefined}
        />
        {error && <p id={`connector-${name}-error`}>{error}</p>}
      </div>
    );
  };

  return (
    <form action={formAction} noValidate>
      {field('name', 'Connector name')}
      {field('baseUrl', 'Base URL', 'url')}
      {field('timeout', 'Timeout (seconds)', 'number')}
      {state.errors.form && <p role="alert">{state.errors.form}</p>}
      {state.saved && <p role="status">Connector saved.</p>}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Saving…' : 'Save connector'}
      </button>
    </form>
  );
}
```

Validation is O(fields). The server must validate again: client validation is for the user, not for security.

#### Follow-ups

- **Validation on blur?** Track touched fields and validate on `onBlur`, or use React Hook Form with a zod schema
  (`zodResolver`). The same zod schema can validate on the Node backend.
- **Errors from FastAPI?** A 422 response has `detail: [{ loc: ['body', 'name'], msg }]`; map `loc` to field names.
- **Before React 19?** A controlled form with `useState` for values and a `submitting` flag does the same job: that is
  the previous problem.

### Sortable, filterable runs table {medium core}

Render a table of agent runs (id, agent, status, started at, duration). Add a text filter on id and agent, a status
filter, and sortable columns: clicking a header sorts by it, clicking again reverses. Show an empty state, and make
sorting accessible.

#### Hints

1. Keep only the inputs in state: the filter text, the status, the sort key and direction. Derive the visible rows during
   render with `useMemo`.
2. Copy before sorting (`[...rows].sort(...)` or `toSorted`): `sort` mutates in place.
3. Put a `<button>` inside each sortable `<th>`, and set `aria-sort="ascending" | "descending"` on the sorted header only.

#### Solution

Derived rows mean there is one source of truth, and no effect to keep a "sorted copy" in sync. Each comparator handles
its own type: `localeCompare` for text, subtraction for numbers and timestamps.

```tsx
import { useMemo, useState } from 'react';

type Status = 'running' | 'succeeded' | 'failed';
type Run = { id: string; agent: string; status: Status; startedAt: string; durationMs: number };
type SortKey = 'id' | 'agent' | 'status' | 'startedAt' | 'durationMs';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'id', label: 'Run' },
  { key: 'agent', label: 'Agent' },
  { key: 'status', label: 'Status' },
  { key: 'startedAt', label: 'Started' },
  { key: 'durationMs', label: 'Duration' },
];

function compare(a: Run, b: Run, key: SortKey): number {
  switch (key) {
    case 'durationMs':
      return a.durationMs - b.durationMs;
    case 'startedAt':
      return Date.parse(a.startedAt) - Date.parse(b.startedAt);
    default:
      return a[key].localeCompare(b[key], undefined, { numeric: true }); // run-9 before run-10
  }
}

export function RunsTable({ runs }: { runs: Run[] }) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<Status | 'all'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'startedAt', dir: 'desc' });

  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    const filtered = runs.filter(
      (r) => (status === 'all' || r.status === status) && (!q || r.id.toLowerCase().includes(q) || r.agent.toLowerCase().includes(q)),
    );
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => sign * compare(a, b, sort.key)); // a stable sort, on a copy
  }, [runs, text, status, sort]);

  const toggle = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  return (
    <div>
      <label htmlFor="runs-filter">Filter</label>
      <input id="runs-filter" type="search" value={text} onChange={(e) => setText(e.target.value)} />
      <label htmlFor="runs-status">Status</label>
      <select id="runs-status" value={status} onChange={(e) => setStatus(e.target.value as Status | 'all')}>
        <option value="all">All</option>
        <option value="running">Running</option>
        <option value="succeeded">Succeeded</option>
        <option value="failed">Failed</option>
      </select>
      <table>
        <caption>
          Agent runs, sorted by {COLUMNS.find((c) => c.key === sort.key)?.label.toLowerCase()} ({sort.dir === 'asc' ? 'ascending' : 'descending'})
        </caption>
        <thead>
          <tr>
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                <button type="button" onClick={() => toggle(c.key)}>
                  {c.label}
                  <span aria-hidden="true">{sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length}>No runs match these filters.</td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.agent}</td>
                <td>{r.status}</td>
                <td>
                  <time dateTime={r.startedAt}>{new Date(r.startedAt).toLocaleString()}</time>
                </td>
                <td>{(r.durationMs / 1000).toFixed(1)} s</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
```

O(n log n) per change of inputs, and nothing per unrelated re-render thanks to `useMemo`.

#### Follow-ups

- **Is the sort stable?** Yes. `Array.prototype.sort` is guaranteed stable since ES2019, so rows with equal values keep
  their input order (each sort starts from a fresh copy of the filtered rows).
- **10,000 rows?** Sort and filter on the server with pagination, or virtualise the table body. Debounce the text filter.
- **Keep the sort in the URL?** Store it in query parameters so a shared link opens the same view.
- **Headless table libraries?** TanStack Table handles sorting, filtering, column visibility and pagination without
  dictating markup.

### Generic pagination component {medium}

Build a `Paginated<T>` component that takes `items`, a `pageSize` and a `renderItem` function, and shows one page with
Previous and Next buttons and "Page X of Y". If the list shrinks (a filter is applied), the current page must stay valid.

#### Hints

1. Store only the page number. Compute the slice and the total pages during render.
2. Clamp the page during render: `Math.min(page, totalPages)`, so a shrinking list never shows an empty page.
3. Generic function components are written `function Paginated<T>(props: Props<T>)`.

#### Solution

Only the page number is state. Everything else is derived. Clamping during render, instead of "fixing" the page in an
effect, avoids an extra render and a flash of an empty page.

```tsx
import { useState, type ReactNode } from 'react';

type Props<T> = {
  items: T[];
  pageSize?: number;
  renderItem: (item: T) => ReactNode;
  getKey: (item: T) => string | number;
};

export function Paginated<T>({ items, pageSize = 10, renderItem, getKey }: Props<T>) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = items.slice((current - 1) * pageSize, current * pageSize);

  return (
    <div>
      <ul>
        {visible.map((item) => (
          <li key={getKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      <nav aria-label="Pagination">
        <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>
          Previous
        </button>
        <span aria-live="polite">
          Page {current} of {totalPages}
        </span>
        <button type="button" disabled={current === totalPages} onClick={() => setPage(current + 1)}>
          Next
        </button>
      </nav>
    </div>
  );
}

// Usage: the item type is inferred from `items`.
type Claim = { id: string; amount: number };
export function ClaimsPage({ claims }: { claims: Claim[] }) {
  return <Paginated items={claims} pageSize={5} getKey={(c) => c.id} renderItem={(c) => `${c.id}: $${c.amount.toFixed(2)}`} />;
}
```

Each render costs O(pageSize) for the slice.

#### Follow-ups

- **Server-side pagination?** Make the page part of the request (`?page=&size=`, or a cursor) and keep the total count
  from the response. Cursor pagination stays correct while rows are being inserted.
- **Thousands of rows on one page?** Virtualise the list (TanStack Virtual, or by hand as in the log-tail problem
  below), so only the visible rows are in the DOM.

### Infinite scroll with cursor pagination {medium}

Show a list of past runs that loads the next page from `/api/runs?cursor=` when the user scrolls near the end. The
response is `{ items, nextCursor }`, and `nextCursor` is `null` on the last page. Avoid duplicate requests and
duplicate items, show loading and error states, and keep it usable without a mouse.

#### Hints

1. An `IntersectionObserver` on a sentinel element at the end of the list triggers loading, with a `rootMargin` so it
   fires before the user reaches the very bottom.
2. Guard with a ref (`loadingRef.current`), not only state, because the observer can fire twice before a re-render.
3. Deduplicate by id when appending: a cursor page can overlap if items were inserted.
4. Also render a "Load more" button: keyboard and screen reader users, and the error retry, need it.

#### Solution

The ref guard prevents double fetches, the cursor ref always holds the latest cursor for the observer callback, and the
button is the accessible fallback that also doubles as Retry.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

type Run = { id: string; title: string };
type Page = { items: Run[]; nextCursor: string | null };

export function RunHistory({ pageSize = 25 }: { pageSize?: number }) {
  const [items, setItems] = useState<Run[]>([]);
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const cursorRef = useRef<string | null>(null);
  const loadingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || done) return;
    loadingRef.current = true;
    setStatus('loading');
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (cursorRef.current) params.set('cursor', cursorRef.current);
      const res = await fetch(`/api/runs?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as Page;
      setItems((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.items.filter((r) => !seen.has(r.id))];
      });
      cursorRef.current = page.nextCursor;
      if (page.nextCursor === null) setDone(true);
      setStatus('idle');
    } catch {
      if (!controller.signal.aborted) setStatus('error');
    } finally {
      loadingRef.current = false;
    }
  }, [done, pageSize]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || done || status === 'error') return; // after an error, wait for the Retry button
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore();
    }, { rootMargin: '400px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, done, status]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return (
    <section aria-label="Run history" aria-busy={status === 'loading'}>
      <ul>
        {items.map((r) => (
          <li key={r.id}>{r.title}</li>
        ))}
        <li ref={sentinelRef} aria-hidden="true" />
      </ul>
      {status === 'error' && <p role="alert">Could not load more runs.</p>}
      {!done ? (
        <button type="button" onClick={() => void loadMore()} disabled={status === 'loading'}>
          {status === 'error' ? 'Retry' : status === 'loading' ? 'Loading…' : 'Load more'}
        </button>
      ) : (
        <p>That is everything.</p>
      )}
    </section>
  );
}
```

Each page costs O(pageSize + n) for deduplication; fine for a few thousand items, and virtualise beyond that.

#### Follow-ups

- **With TanStack Query?** `useInfiniteQuery` with `getNextPageParam: (last) => last.nextCursor ?? undefined` handles
  caching, deduplication of requests and refetching.
- **Why a cursor, not page numbers?** Offsets shift when new runs are inserted (duplicates or skipped items); a cursor
  (for example the last `(started_at, id)`) is stable and uses an index efficiently.
- **Restoring scroll position on Back?** Cache the loaded pages and the scroll offset, or use the router's scroll restoration.

### Stopwatch with start, stop and reset {medium core}

Build a stopwatch that shows `mm:ss.t`, with Start/Stop and Reset buttons. It must not drift, and it must not leave an
interval running after it stops or unmounts.

#### Hints

1. Don't add 100 ms per tick: intervals drift and pause in background tabs. Store the start time and compute `Date.now() - start`.
2. Run `setInterval` in an effect only while `running` is true, and clear it in the cleanup.
3. Keep the time accumulated before the last Start, so Stop then Start resumes correctly.

#### Solution

The interval only triggers re-renders. The displayed time is always computed from timestamps, so a delayed tick can't
make it wrong. The effect depends on `running`: starting sets up one interval, and stopping (or unmounting) clears it.

```tsx
import { useEffect, useState } from 'react';

function format(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

export function Stopwatch() {
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(0); // Date.now() when the current run started
  const [banked, setBanked] = useState(0); // ms from earlier runs
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  const elapsed = banked + (running ? now - startedAt : 0);

  function toggle() {
    const t = Date.now();
    if (running) {
      setBanked((b) => b + (t - startedAt));
    } else {
      setStartedAt(t);
      setNow(t);
    }
    setRunning((r) => !r);
  }

  function reset() {
    setRunning(false);
    setBanked(0);
  }

  return (
    <div>
      <time aria-live="off">{format(elapsed)}</time>
      <button type="button" onClick={toggle}>
        {running ? 'Stop' : 'Start'}
      </button>
      <button type="button" onClick={reset} disabled={running || elapsed === 0}>
        Reset
      </button>
    </div>
  );
}
```

There's one interval while running and none otherwise. The display is accurate to the last tick.

#### Follow-ups

- **Why not `useRef` for `startedAt`?** You could. Refs suit values that don't affect rendering. `startedAt` does affect
  `elapsed`, so state keeps the render pure and predictable.
- **Smoother display?** `requestAnimationFrame` instead of `setInterval`, cancelled with `cancelAnimationFrame` in the cleanup.
- **The system clock changes mid-run?** `Date.now()` is wall-clock time and can jump. `performance.now()` is monotonic,
  so it is the safer source for elapsed time.

### Retry-After countdown after a 429 {easy}

When the API returns `429 Too Many Requests` with a `Retry-After` header, show "Try again in N s", counting down
every second, then call `onReady()` exactly once. The header can be a number of seconds or an HTTP date. The countdown
must not drift, and must clean up if the component unmounts.

#### Hints

1. Parse the header once into an absolute end time (`Date.now() + ms`).
2. Each tick computes the remaining time from the end time, instead of decrementing a counter, so slow or throttled
   timers cannot make it drift.
3. Keep `onReady` in a ref so a new callback from the parent does not restart the timer.

#### Solution

Deriving the remaining time from an end timestamp makes the countdown correct even when the browser delays timers (for
example in a background tab).

```tsx
import { useEffect, useRef, useState } from 'react';

/** Retry-After is either delay-seconds or an HTTP date. Returns milliseconds to wait (never negative). */
export function parseRetryAfter(header: string | null, now = Date.now()): number {
  if (!header) return 0;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? 0 : Math.max(0, date - now);
}

export function RetryCountdown({ retryAfter, onReady }: { retryAfter: string | null; onReady: () => void }) {
  const [endAt] = useState(() => Date.now() + parseRetryAfter(retryAfter));
  const [remaining, setRemaining] = useState(() => Math.ceil((endAt - Date.now()) / 1000));
  const onReadyRef = useRef(onReady);
  const fired = useRef(false); // refs survive StrictMode's simulated remount, so this stays "exactly once"
  useEffect(() => {
    onReadyRef.current = onReady;
  });

  useEffect(() => {
    const tick = () => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clearInterval(id);
        if (!fired.current) {
          fired.current = true;
          onReadyRef.current();
        }
      }
    };
    const id = setInterval(tick, 250); // a few ticks per second keep the display accurate
    tick();
    return () => clearInterval(id);
  }, [endAt]);

  return remaining > 0 ? <p>Too many requests. Try again in {remaining} s.</p> : null;
}
```

`tick()` also runs once straight away, so `Retry-After: 0` calls `onReady` without waiting for the first interval. It
is safe to call `clearInterval(id)` inside `tick` because `setInterval` has already returned by the time `tick` first
runs.

#### Follow-ups

- **Why `useState(() => ...)` for the end time?** The initialiser runs once; recomputing `Date.now() + ms` on every
  render would push the deadline forward forever.
- **Automatic retry?** Fine for background requests (with a cap and jitter), but for user actions let the user decide.

### Optimistic enable/disable toggle with rollback {medium}

Each agent has an Enabled switch. Clicking it should flip immediately (optimistic UI), call `PATCH /api/agents/:id`,
and roll back with an error message if the call fails. The switch must be accessible and must not send overlapping
requests.

#### Hints

1. React 19's `useOptimistic(value)` returns a temporary value that is used while a transition is pending and falls back
   to the real value when it ends: success updates the real value, failure simply reverts.
2. Run the request inside `startTransition(async () => { ... })` from `useTransition`, and use `isPending` to block
   double clicks.
3. Use `<button role="switch" aria-checked={...}>` so screen readers announce it as on or off.

#### Solution

The optimistic value is display-only. The source of truth (`enabled`, owned by the parent or a query cache) changes only
when the server confirms, so a failure needs no manual rollback code.

```tsx
import { useOptimistic, useState, useTransition } from 'react';

type Props = { agentId: string; name: string; enabled: boolean; onSaved: (enabled: boolean) => void };

export function AgentToggle({ agentId, name, enabled, onSaved }: Props) {
  const [optimistic, setOptimistic] = useOptimistic(enabled);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    const next = !enabled;
    setError(null);
    startTransition(async () => {
      setOptimistic(next); // shown immediately, reverted automatically if we never confirm
      try {
        const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Updates after an await are not part of the transition any more, so wrap them again (a documented React 19 rule).
        startTransition(() => onSaved(next)); // the real value changes only on success
      } catch {
        setError(`Could not ${next ? 'enable' : 'disable'} ${name}. Please try again.`);
      }
    });
  }

  return (
    <div className="agent-toggle">
      <button type="button" role="switch" aria-checked={optimistic} aria-label={`Enable ${name}`} disabled={isPending} onClick={toggle}>
        {optimistic ? 'On' : 'Off'}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

#### Follow-ups

- **Without `useOptimistic`?** Keep `pending: boolean | null`, render `pending ?? enabled`, and clear it on success or
  failure. Use a request counter so a slow earlier response cannot overwrite a later one.
- **With TanStack Query?** `useMutation` with `onMutate` (snapshot the cache and write the optimistic value),
  `onError` (restore the snapshot) and `onSettled` (invalidate).
- **When is optimistic UI wrong?** When failure is likely or costly to show late, such as payments or irreversible agent
  actions. Those get a pending state and explicit confirmation.

### Accessible approval dialog for an agent action {medium core}

An agent wants to perform a risky action ("Create purchase order PO-1042 for $18,400"). Show a modal dialog with the
details and Approve and Reject buttons. Focus must move into the dialog, stay there, start on the least destructive
button, return to the triggering button on close, and Escape must cancel. Show an error if the decision fails to save,
and prevent double submission.

#### Hints

1. The native `<dialog>` element with `showModal()` gives you a focus trap, Escape handling, the backdrop and inert
   background content for free.
2. Drive it from an `open` prop in an effect: call `showModal()` or `close()`. Handle the `cancel` event (Escape) by
   telling the parent to close.
3. Focus Reject yourself after `showModal()` (React's `autoFocus` only runs on mount). Current browsers return focus to
   the previously focused element when a modal dialog closes, as the HTML spec now requires.
4. Disable both buttons while the decision is being saved.

#### Solution

Using the browser's native dialog avoids most of the subtle bugs of hand-rolled modals (focus escaping behind the overlay,
background scrolling, screen readers reading the page behind). The parent stays in control through `open`.

```tsx
import { useEffect, useId, useRef, useState } from 'react';

type Decision = 'approved' | 'rejected';
type Props = {
  open: boolean;
  action: string;
  details: string;
  onDecide: (decision: Decision) => Promise<void>;
  onClose: () => void;
};

export function ApprovalDialog({ open, action, details, onDecide, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rejectRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setError(null);
      dialog.showModal();
      rejectRef.current?.focus(); // start on the least destructive choice
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  async function decide(decision: Decision) {
    setBusy(true);
    setError(null);
    try {
      await onDecide(decision);
      onClose();
    } catch {
      setError('Your decision was not saved. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descId}
      onCancel={(e) => {
        e.preventDefault(); // the parent decides; Escape is ignored while saving
        if (!busy) onClose();
      }}
      // If the dialog closes by any other route (a form with method="dialog", or the browser closing it on a repeated
      // Escape), tell the parent, or `open` stays true and the dialog can never be reopened.
      onClose={() => {
        if (open) onClose();
      }}
    >
      <h2 id={titleId}>Approve this action?</h2>
      <p id={descId}>
        The agent wants to <strong>{action}</strong>. {details}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className="dialog-actions">
        <button ref={rejectRef} type="button" disabled={busy} onClick={() => decide('rejected')}>
          Reject
        </button>
        <button type="button" disabled={busy} onClick={() => decide('approved')}>
          {busy ? 'Saving…' : 'Approve'}
        </button>
      </div>
    </dialog>
  );
}

export function PendingApproval() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Review pending action
      </button>
      <ApprovalDialog
        open={open}
        action="create purchase order PO-1042 for $18,400"
        details="Vendor: Acme Industrial. Requested by the procurement agent for ticket OPS-311."
        onDecide={async (decision) => {
          const res = await fetch('/api/approvals/ap-77', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
```

#### Follow-ups

- **Why not a `div` with `role="dialog"`?** You would have to build the focus trap, Escape, inert background and
  focus return yourself. The native element does it, and it is supported in all current browsers.
- **The trigger button is gone when the dialog closes** (the row was removed)? Focus would fall back to the page body.
  Move it somewhere sensible yourself, such as the list heading.
- **Two people approve the same action?** The server must make decisions idempotent and reject a second decision with a
  409 that the UI explains ("Already approved by Priya").
- **Destructive actions?** Consider typing the PO number to confirm, and always log who approved what and when.

### Run progress panel that polls until the run finishes {medium}

Show the progress of an agent run by polling `GET /api/runs/:id` every 2 seconds. Stop polling once the run succeeds
or fails, never have two requests in flight, back off when requests fail, pause while the tab is hidden, and clean
everything up on unmount. Render an accessible progress bar and the list of steps.

#### Hints

1. Use a `setTimeout` chain (schedule the next poll after the current one finishes), not `setInterval`, so slow
   responses cannot overlap.
2. Keep the loop's bookkeeping (timer, controller, failure count, in-flight flag) in local variables inside the effect,
   and tear them down in the cleanup.
3. Listen to `visibilitychange`: skip polls while hidden, and poll immediately when the tab becomes visible.
4. Back off with `interval × 2^failures`, capped at, say, 30 seconds.

#### Solution

All loop state lives inside one effect run, so a new `runId` starts a fresh loop and the cleanup kills the old one
completely. The in-flight flag prevents the visibility handler from starting a second loop.

```tsx
import { useEffect, useState } from 'react';

type Step = { name: string; status: 'pending' | 'running' | 'succeeded' | 'failed' };
type Run = { id: string; status: 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed'; progress: number; steps: Step[] };

const TERMINAL: ReadonlySet<Run['status']> = new Set(['succeeded', 'failed']);

export function useRunPolling(runId: string, intervalMs = 2000) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | null = null;
    let failures = 0;
    let inFlight = false;
    let finished = false;
    let disposed = false;

    async function poll() {
      if (disposed || finished || inFlight || document.visibilityState === 'hidden') return;
      inFlight = true;
      controller = new AbortController();
      try {
        const res = await fetch(`/api/runs/${encodeURIComponent(runId)}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const next = (await res.json()) as Run;
        failures = 0;
        finished = TERMINAL.has(next.status);
        setRun(next);
        setError(null);
      } catch (err) {
        if (disposed) return;
        failures++;
        setError(err instanceof Error ? err.message : 'Request failed');
      } finally {
        inFlight = false;
      }
      if (!disposed && !finished) timer = setTimeout(poll, Math.min(intervalMs * 2 ** failures, 30_000));
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        clearTimeout(timer);
        void poll();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [runId, intervalMs]);

  return { run, error };
}

export function RunProgress({ runId }: { runId: string }) {
  const { run, error } = useRunPolling(runId);
  if (!run) return error ? <p role="alert">Could not load run: {error}</p> : <p aria-busy="true">Loading run…</p>;
  return (
    <section aria-labelledby="run-title">
      <h2 id="run-title">Run {run.id}</h2>
      <div role="progressbar" aria-label="Run progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={run.progress}>
        <div style={{ width: `${run.progress}%` }} className="bar" />
      </div>
      <p>
        Status: {run.status.replace('_', ' ')}
        {error && ` (connection problem, retrying: ${error})`}
      </p>
      <ol>
        {run.steps.map((s) => (
          <li key={s.name}>
            {s.name}: {s.status}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

One request at a time, at the polling interval while healthy, slower while failing, and none while hidden or finished.

#### Follow-ups

- **With TanStack Query?** `refetchInterval: (query) => (query.state.data && TERMINAL.has(query.state.data.status) ? false : 2000)`,
  and it already pauses polling in background tabs by default (`refetchIntervalInBackground: false`).
- **The run id changes?** The hook starts a new loop, but `run` still holds the old run until the first response.
  Render `<RunProgress key={runId} runId={runId} />` so React resets the state for the new run.
- **Thousands of users watching runs?** Switch to server push (SSE) so the server sends changes instead of answering
  "nothing new" thousands of times a second.

### Streaming chat box with a Stop button {medium core}

Build a chat box that POSTs `{ message }` to `/api/chat`. The response body is plain text streamed as the model
generates it. Show the reply growing as chunks arrive, provide a Stop button that cancels the stream (keeping the partial
text), prevent sending while a reply is streaming, and cancel the request if the component unmounts.

#### Hints

1. `res.body.getReader()` gives chunks of bytes. Decode with one `TextDecoder` and `decode(chunk, { stream: true })`, so
   characters split across chunks are not garbled.
2. Append with a functional update that targets the assistant message by id: `setMessages(ms => ms.map(...))`.
3. One `AbortController` per send, kept in a ref. Stop calls `abort()`; the pending `read()` rejects, and in `catch` you
   check `signal.aborted` to mark the reply "stopped" instead of failed.

#### Solution

The message id is created before any state update, so even if React calls an updater twice in StrictMode, ids stay
stable. The `finally` only resets the streaming flag if this request is still the current one.

```tsx
import { useEffect, useRef, useState, type FormEvent } from 'react';

type Msg = { id: number; role: 'user' | 'assistant'; text: string; state: 'streaming' | 'done' | 'stopped' | 'error' };

export function StreamingChat({ endpoint = '/api/chat' }: { endpoint?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const patch = (id: number, fn: (m: Msg) => Msg) => setMessages((ms) => ms.map((m) => (m.id === id ? fn(m) : m)));

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || streaming) return;
    const userId = nextId.current++;
    const botId = nextId.current++;
    const controller = new AbortController();
    controllerRef.current = controller;
    setDraft('');
    setStreaming(true);
    setMessages((ms) => [...ms, { id: userId, role: 'user', text, state: 'done' }, { id: botId, role: 'assistant', text: '', state: 'streaming' }]);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        patch(botId, (m) => ({ ...m, text: m.text + chunk }));
      }
      const rest = decoder.decode(); // flush any bytes held back
      patch(botId, (m) => ({ ...m, text: m.text + rest, state: 'done' }));
    } catch {
      patch(botId, (m) => ({ ...m, state: controller.signal.aborted ? 'stopped' : 'error' }));
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setStreaming(false);
      }
    }
  }

  return (
    <section aria-label="Chat">
      <ol className="messages">
        {messages.map((m) => (
          <li key={m.id} className={m.role} aria-busy={m.state === 'streaming'}>
            <strong>{m.role === 'user' ? 'You' : 'Assistant'}:</strong> {m.text}
            {m.state === 'stopped' && <em> (stopped)</em>}
            {m.state === 'error' && <em role="alert"> Something went wrong. Try again.</em>}
          </li>
        ))}
      </ol>
      <form onSubmit={send}>
        <label htmlFor="chat-draft">Message</label>
        <input id="chat-draft" value={draft} onChange={(e) => setDraft(e.target.value)} autoComplete="off" />
        {streaming ? (
          <button type="button" onClick={() => controllerRef.current?.abort()}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!draft.trim()}>
            Send
          </button>
        )}
      </form>
    </section>
  );
}
```

Each chunk is one state update and one render of the list. For long conversations, see the batching and memoisation
techniques in [Building a streaming chat UI](#/streaming-chat-ui).

#### Follow-ups

- **The server streams SSE instead of plain text?** Buffer the decoded text and split on blank lines; see the parser in
  the [Server-Sent Events](#/sse) chapter.
- **Too many renders?** Collect chunks in a ref and flush once per `requestAnimationFrame`; wrap past messages in `React.memo`.
- **Does Stop stop the model?** Only if the server notices the closed connection and cancels the model call. Say so.

### useWebSocket hook with reconnect, backoff and a heartbeat {hard}

Write a `useWebSocket(url, options)` hook for live run events. It must report its status, reconnect with exponential
backoff and jitter after a drop, detect a dead connection when no message (including the server's `ping`) arrives in
time, let the caller resubscribe after every (re)connect, expose a `send` function, and close cleanly on unmount
without reconnecting.

#### Hints

1. Put the whole connection lifecycle inside one effect: `connect()`, the handlers, the timers, and a `disposed` flag set
   by the cleanup, so an intentional close never triggers a reconnect.
2. Keep the callbacks (`onMessage`, `onOpen`) in a ref updated after every render (in an effect, not during render), so
   the socket does not reconnect when the parent passes a new arrow function.
3. Backoff: `min(max, base × 2^attempt)`, then randomise (jitter) so a thousand clients do not reconnect in the same
   millisecond after an outage. Reset the attempt count when a connection opens.
4. A watchdog timer reset on every message closes the socket if the server goes silent. Treat that socket as closed at
   once, rather than waiting for a close handshake that may never complete.

#### Solution

The `closed` flag per socket makes "handle closed" idempotent: the watchdog and the `close` event can both fire and only
one reconnect is scheduled. `onOpen` is where the caller resubscribes, which a reconnect needs because the new connection
knows nothing about the old subscriptions.

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

type Options<In> = {
  onMessage: (message: In) => void;
  onOpen?: (send: (message: unknown) => void) => void; // resubscribe here
  heartbeatMs?: number; // the server sends something at least this often
  maxDelayMs?: number;
};

/** Exponential backoff with "equal jitter": half fixed, half random. */
export function backoffDelay(attempt: number, maxDelayMs: number, random: () => number = Math.random): number {
  const ceiling = Math.min(maxDelayMs, 500 * 2 ** attempt);
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

export function useWebSocket<In>(url: string | null, { onMessage, onOpen, heartbeatMs = 30_000, maxDelayMs = 30_000 }: Options<In>) {
  const [status, setStatus] = useState<SocketStatus>(url ? 'connecting' : 'closed');
  const socketRef = useRef<WebSocket | null>(null);
  const handlers = useRef({ onMessage, onOpen });
  useEffect(() => {
    handlers.current = { onMessage, onOpen };
  });

  const send = useCallback((message: unknown): boolean => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => {
    if (!url) {
      setStatus('closed');
      return;
    }
    let attempt = 0;
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let stopWatchdog = () => {};

    const connect = () => {
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      const ws = new WebSocket(url);
      socketRef.current = ws;
      let closed = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      stopWatchdog = () => clearTimeout(watchdog);

      const handleClosed = () => {
        if (closed) return;
        closed = true;
        clearTimeout(watchdog);
        if (socketRef.current === ws) socketRef.current = null;
        if (disposed) return;
        setStatus('reconnecting');
        retry = setTimeout(connect, backoffDelay(attempt++, maxDelayMs));
      };
      const resetWatchdog = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          ws.close(4000, 'heartbeat timeout'); // 4000–4999 are free for applications
          handleClosed(); // do not wait for a close handshake from a dead peer
        }, heartbeatMs * 2);
      };

      ws.onopen = () => {
        attempt = 0;
        setStatus('open');
        resetWatchdog();
        handlers.current.onOpen?.(send);
      };
      ws.onmessage = (event: MessageEvent<string>) => {
        resetWatchdog();
        if (event.data === 'ping') return; // the server's heartbeat
        try {
          handlers.current.onMessage(JSON.parse(event.data) as In);
        } catch {
          // A malformed message must not kill the connection; report it to monitoring instead.
        }
      };
      ws.onclose = handleClosed; // onerror is always followed by onclose
    };

    connect();
    return () => {
      disposed = true;
      clearTimeout(retry);
      stopWatchdog();
      socketRef.current?.close(1000, 'client closed');
      socketRef.current = null;
      setStatus('closed');
    };
  }, [url, heartbeatMs, maxDelayMs, send]);

  return { status, send };
}

// Usage: subscribe to one run, and resubscribe automatically after every reconnect.
type RunEvent = { type: 'step'; step: string; status: string } | { type: 'log'; line: string };

export function RunEvents({ runId }: { runId: string }) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const { status } = useWebSocket<RunEvent>('wss://example.invalid/ws', {
    onOpen: (send) => send({ type: 'subscribe', runId }),
    onMessage: (e) => setEvents((list) => [...list.slice(-499), e]), // keep the last 500
  });
  return (
    <section aria-label="Live events">
      <p role="status">Connection: {status}</p>
      <ol>
        {events.map((e, i) => (
          <li key={i}>{e.type === 'step' ? `${e.step} → ${e.status}` : e.line}</li>
        ))}
      </ol>
    </section>
  );
}
```

Memory is bounded by the 500-event cap. Index keys are acceptable there because the list is append-only and items never
reorder (say so if asked). In production, use sequence ids from the server.

#### Follow-ups

- **`runId` changes?** `onOpen` is read from a ref, so the next reconnect subscribes to the new run. For an immediate
  switch, send unsubscribe and subscribe messages in an effect that depends on `runId`, or include `runId` in the URL.
- **Messages sent while disconnected?** Queue them (bounded) and flush in `onopen`, or reject with a visible error. Only
  queue idempotent messages.
- **Missed events during the outage?** Track the last sequence number and send it with the subscribe message so the
  server can replay, or refetch a snapshot after reconnecting.
- **Auth?** Browsers cannot set headers on WebSocket connections: use a session cookie (and check `Origin` on the
  server), or a short-lived ticket in the URL or the first message.
- **React 19.2 and later?** `useEffectEvent` replaces the handlers ref: wrap `onMessage` in it and call it from the
  socket handler, and it always sees the latest props without being an effect dependency.

### Virtualised list of 50,000 log lines that follows the tail {hard}

Render a scrollable panel of log lines with a fixed row height of 20 px. Only the visible rows (plus a few extra) may be
in the DOM, the scrollbar must reflect the full list, and while the user is at the bottom new lines keep the view pinned
to the end. If they scroll up, stop following and show a "Jump to latest" button.

#### Hints

1. An inner spacer `div` of height `total × rowHeight` makes the scrollbar right. Rows go inside an absolutely
   positioned container at `top = start × rowHeight`.
2. `start = floor(scrollTop / rowHeight) - overscan`, `end = ceil((scrollTop + viewport) / rowHeight) + overscan`,
   clamped to `[0, total]`.
3. On scroll, record `scrollTop` and whether you are within a few pixels of the bottom. After new lines render, scroll to
   the end in a `useLayoutEffect` only if following.

#### Solution

The DOM size stays constant (about 35 rows) whether there are 50 lines or 50,000. Scrolling in a layout effect runs
before paint, so there is no flicker.

```tsx
import { useLayoutEffect, useRef, useState } from 'react';

type Line = { seq: number; text: string };
const ROW = 20;
const OVERSCAN = 6;

export function LogTail({ lines, height = 400 }: { lines: Line[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [follow, setFollow] = useState(true);

  const start = Math.max(0, Math.floor(scrollTop / ROW) - OVERSCAN);
  const end = Math.min(lines.length, Math.ceil((scrollTop + height) / ROW) + OVERSCAN);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && follow) el.scrollTop = el.scrollHeight;
  }, [lines.length, follow]);

  return (
    <div>
      <div
        ref={ref}
        role="region"
        aria-label="Run output"
        tabIndex={0}
        style={{ height, overflowY: 'auto', fontFamily: 'monospace' }}
        onScroll={(e) => {
          const el = e.currentTarget;
          setScrollTop(el.scrollTop);
          setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 4);
        }}
      >
        <div style={{ height: lines.length * ROW, position: 'relative' }}>
          <div style={{ position: 'absolute', top: start * ROW, left: 0, right: 0 }}>
            {lines.slice(start, end).map((line) => (
              <div key={line.seq} style={{ height: ROW, whiteSpace: 'pre' }}>
                {line.text}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!follow && (
        <button type="button" onClick={() => setFollow(true)}>
          Jump to latest
        </button>
      )}
    </div>
  );
}
```

O(visible rows) per render. The container is a named, focusable `region` (so keyboard users can scroll it), not
`role="log"`: a log is a live region, and in a virtualised list rows also enter the DOM when the user scrolls back up,
so a screen reader would read old lines out as new. Announce summaries ("12 new errors") in a separate status region
instead.

#### Follow-ups

- **Variable row heights?** Measure rendered rows and keep a prefix-sum of heights (TanStack Virtual does this), then
  binary-search the first visible row.
- **Millions of lines?** Browsers cap element height, so page the data or scale scroll positions, and keep the source in
  a ring buffer so memory stays bounded.
- **Find in page?** Rows outside the window are not in the DOM, so provide your own search box.
