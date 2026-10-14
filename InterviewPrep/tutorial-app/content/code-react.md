---
title: Live React coding tasks
goal: Build the React components interviewers ask for live (lists, forms, data fetching, debounced search, tables) in typed, accessible, bug-free TSX.
minutes: 90
---

React is one of the three mandatory skills, so a "build this component" task is likely in a full-stack round, usually in
CodeSandbox, StackBlitz or a shared editor. The task itself is rarely hard. What separates candidates is the details
interviewers watch for: immutable state updates, stable keys, effect cleanup, loading and error states, controlled
inputs, accessibility, and TypeScript types that model the state honestly.

Every solution below is a complete TSX module that type-checks under strict TypeScript with React 19 types. Type them out
once yourself: speed at writing `useState`, `useEffect` and event handlers from memory is what counts tomorrow.

## The checklist interviewers grade against

| Area | What they look for |
|---|---|
| State updates | Never mutate: `[...items, x]`, `items.map(...)`, `items.filter(...)`, `{ ...obj, k: v }` |
| Functional updates | `setCount(c => c + 1)` when the next value depends on the previous one |
| Keys | A stable id from the data, never the array index for lists that reorder or delete |
| Effects | A cleanup for every timer, subscription and fetch (`clearInterval`, `controller.abort()`) |
| Async UI | Explicit loading, error and empty states. Ignore responses that arrive after the component moved on |
| Forms | Controlled inputs, `event.preventDefault()`, trimmed values, validation messages tied to inputs |
| Derived data | Compute filtered or sorted lists during render (`useMemo` if expensive). Don't copy them into state |
| Accessibility | Real `<button>`s, `<label htmlFor>`, `aria-invalid`, `aria-sort`, `aria-selected`, keyboard support |
| TypeScript | Props types, discriminated unions for request state, `unknown` in `catch` |

## Interview questions

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

### When does an effect need a cleanup function? {core}

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

### Fetch a list with loading, error and cancellation {medium core}

Show a page of patients from `GET /api/patients?page=N`. Display "Loading…", an error message with a Retry button, or the
list (with an empty-state message). Changing the page must cancel the previous request, so a slow old response can never
overwrite a newer one.

#### Hints

1. Model the request as a discriminated union: `{ status: 'loading' } | { status: 'error', message } | { status: 'success', data }`.
2. Create an `AbortController` in the effect, pass its `signal` to `fetch`, and abort it in the cleanup.
3. `fetch` doesn't throw on HTTP 404 or 500: check `response.ok` yourself. Ignore the `AbortError` caused by your own cleanup.

#### Solution

The effect depends on `page` and on a `reload` counter (which Retry increments). Its cleanup aborts the in-flight request
whenever either changes or the component unmounts. The union type makes impossible states, such as "loading and errored
with data", impossible to represent.

```tsx
import { useEffect, useState } from 'react';

type Patient = { id: string; name: string; lastVisit: string };
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; data: Patient[] };

export function PatientList({ page }: { page: number }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    fetch(`/api/patients?page=${page}`, { signal: controller.signal, headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server responded ${res.status}`);
        return (await res.json()) as Patient[];
      })
      .then((data) => setState({ status: 'success', data }))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return; // we cancelled it
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Unknown error' });
      });

    return () => controller.abort();
  }, [page, reload]);

  if (state.status === 'loading') return <p role="status">Loading…</p>;
  if (state.status === 'error') {
    return (
      <div role="alert">
        <p>Could not load patients: {state.message}</p>
        <button type="button" onClick={() => setReload((n) => n + 1)}>
          Retry
        </button>
      </div>
    );
  }
  if (state.data.length === 0) return <p>No patients on this page.</p>;
  return (
    <ul>
      {state.data.map((p) => (
        <li key={p.id}>
          {p.name}, last visit {p.lastVisit}
        </li>
      ))}
    </ul>
  );
}
```

There's one request per page change, and the abandoned ones are cancelled on the network.

#### Follow-ups

- **In production?** TanStack Query (`useQuery({ queryKey: ['patients', page], queryFn })`) gives caching, deduplication,
  retries, background refetching and cancellation. It's the honest answer for real apps.
- **React 19?** You can pass a promise to `use()` inside a `<Suspense>` boundary, with an error boundary for failures.
  The promise must come from a cache or the parent, not be created during render.
- **Auth?** Add `Authorization: Bearer <token>` to the headers. On a 401, refresh the token or redirect to login. The
  FastAPI side must allow the origin via CORS.

### Debounced patient search {medium core}

Build a search box that filters a patient list by name, but only after the user has stopped typing for 300 ms. Write the
debounce as a reusable, generic `useDebounce` hook.

#### Hints

1. The hook returns a value that lags behind its input, so it needs a second piece of state of its own.
2. Update that state in a `setTimeout` inside an effect that depends on `value`. The cleanup clears the previous timer,
   which is what makes it a debounce.
3. Derive the filtered list from the debounced text with `useMemo`. Don't store it in state.

#### Solution

Every keystroke updates `query` immediately, so the input stays responsive. `useDebounce` only passes the value on once it
has been stable for `delay` ms. If you replace the local filter with a fetch, the same hook means one request per pause
instead of one per keystroke.

```tsx
import { useEffect, useMemo, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type Patient = { id: string; name: string };

export function PatientSearch({ patients }: { patients: Patient[] }) {
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim().toLowerCase(), 300);

  const matches = useMemo(
    () => (debounced ? patients.filter((p) => p.name.toLowerCase().includes(debounced)) : patients),
    [patients, debounced],
  );

  return (
    <div>
      <label htmlFor="patient-search">Search patients</label>
      <input id="patient-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
      <p aria-live="polite">{matches.length} match{matches.length === 1 ? '' : 'es'}</p>
      <ul>
        {matches.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

Filtering is O(n) per debounced change, not per keystroke.

#### Follow-ups

- **Debounce vs throttle?** Debounce waits for a pause (search boxes, autosave). Throttle runs at most once per interval
  while events keep coming (scroll, resize).
- **Is `useDeferredValue` an alternative?** It keeps typing responsive by rendering the expensive list at a lower
  priority, but it doesn't reduce the number of network requests. Debounce does.
- **Searching the server?** Combine the debounced value with the abort pattern from the previous problem.

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
  submit without manual `isSubmitting` flags.

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
- **Thousands of rows on one page?** Virtualise the list (TanStack Virtual), so only the visible rows are in the DOM.

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

### Stopwatch with start, stop and reset {medium}

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
- **Is it safe to store tokens or PHI here?** No. `localStorage` can be read by any script on the page, so an XSS bug
  steals it. Keep auth in httpOnly cookies, and keep PHI out of browser storage.

### Sortable patient table {medium core}

Render a table of patients with name, age and last visit. Clicking a column header sorts by that column, and clicking it
again reverses the order. Announce the sort with `aria-sort`, and never mutate the `patients` prop.

#### Hints

1. The state is `{ key, direction }`. Derive the sorted rows with `useMemo`.
2. `Array.prototype.sort` sorts in place. Copy first (`[...rows]`), or use `toSorted()`, which needs an ES2023 lib.
3. Compare strings with `localeCompare` and numbers with subtraction. ISO date strings compare correctly as strings.

#### Solution

The sort state is tiny, and the sorted array is derived and memoised. Headers are buttons inside `<th>`, so they are
keyboard accessible, and `aria-sort` tells screen readers the current order.

```tsx
import { useMemo, useState } from 'react';

type Patient = { id: string; name: string; age: number; lastVisit: string }; // lastVisit as YYYY-MM-DD
type SortKey = 'name' | 'age' | 'lastVisit';
type Sort = { key: SortKey; direction: 'asc' | 'desc' };

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'lastVisit', label: 'Last visit' },
];

function compare(a: Patient, b: Patient, key: SortKey): number {
  const x = a[key];
  const y = b[key];
  return typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
}

export function PatientTable({ patients }: { patients: Patient[] }) {
  const [sort, setSort] = useState<Sort>({ key: 'name', direction: 'asc' });

  const rows = useMemo(() => {
    const sign = sort.direction === 'asc' ? 1 : -1;
    return [...patients].sort((a, b) => sign * compare(a, b, sort.key));
  }, [patients, sort]);

  function sortBy(key: SortKey) {
    setSort((s) => ({ key, direction: s.key === key && s.direction === 'asc' ? 'desc' : 'asc' }));
  }

  return (
    <table>
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th key={c.key} aria-sort={sort.key === c.key ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
              <button type="button" onClick={() => sortBy(c.key)}>
                {c.label}
                <span aria-hidden="true">{sort.key === c.key ? (sort.direction === 'asc' ? ' ▲' : ' ▼') : ''}</span>
              </button>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id}>
            <td>{p.name}</td>
            <td>{p.age}</td>
            <td>{p.lastVisit}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

Sorting is O(n log n), and only when the patients or the sort change.

#### Follow-ups

- **Is the sort stable?** Yes. `Array.prototype.sort` is guaranteed stable since ES2019, so rows with equal ages keep
  the order they have in the `patients` prop (each sort starts from a fresh copy of it).
- **Thousands of rows from the server?** Sort on the server (`?sort=age&order=desc`) with an index on the column, and
  paginate. Sorting 50,000 rows in the browser on every click is wasteful.
- **Combine with search?** Filter first (with the debounced text), then sort the filtered rows, in one `useMemo`.
