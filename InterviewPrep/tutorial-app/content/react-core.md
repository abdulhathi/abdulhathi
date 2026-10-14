---
title: React fundamentals and React 19
goal: Explain how React renders and reconciles, why keys and one-way data flow matter, and what React 19 changed, with a working example for each.
minutes: 45
---

React is a mandatory skill for this role, so expect the interviewer to check the fundamentals before anything clever: what happens on a re-render, why keys matter, controlled inputs, and how data flows. Senior candidates are also expected to know what changed in React 19 (released December 2024; 19.2 followed in October 2025).

Focus on explaining the **render → commit** model clearly. Most follow-up questions, such as performance, effects and stale state, are easy once that model is solid.

## The mental model: UI is a function of state

A component is a function that takes props and state and returns a description of the UI. React calls it, compares the new description with the previous one, and changes only the DOM nodes that differ.

| Phase | What happens | Can it be interrupted? |
|---|---|---|
| **Trigger** | `setState`, a parent re-rendering, or a context value changing | — |
| **Render** | React calls your component functions to get new JSX. Must be pure: no DOM writes, no fetches, no subscriptions | Yes (concurrent rendering can pause, restart or throw away a render) |
| **Commit** | React applies the minimal DOM changes, then runs layout effects, then (after paint) effects | No |

Three things re-render a component: **its own state changed**, **its parent re-rendered**, or **a context it reads changed**. "Props changed" is not a separate trigger: props only change because the parent re-rendered.

## Props, state and one-way data flow

Props flow down; events flow up. When two siblings need the same data, move the state to their closest common parent ("lifting state up") and pass a callback down.

```tsx
import { useState } from 'react';

type Patient = { id: string; name: string };

function PatientList({ patients, selectedId, onSelect }: { patients: Patient[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul>
      {patients.map((p) => (
        <li key={p.id}>
          <button aria-pressed={p.id === selectedId} onClick={() => onSelect(p.id)}>
            {p.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

function PatientDetail({ patient }: { patient: Patient | undefined }) {
  return <p>{patient ? `Selected: ${patient.name}` : 'Pick a patient'}</p>;
}

// The parent owns the state; both children read it, only the list changes it.
export function PatientsPage({ patients }: { patients: Patient[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <>
      <PatientList patients={patients} selectedId={selectedId} onSelect={setSelectedId} />
      <PatientDetail patient={patients.find((p) => p.id === selectedId)} />
    </>
  );
}
```

## Lists and keys

A key tells React which item is which between renders. With stable keys, React moves, inserts and removes DOM nodes (and the state inside them) correctly. With array indexes as keys, inserting at the top shifts every index, so React reuses the wrong component instance: typed text and checkbox state end up on the wrong row.

```tsx
import { useState } from 'react';

type Task = { id: number; text: string };

export function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([{ id: 1, text: 'Review claim' }]);
  const addToTop = () => setTasks((t) => [{ id: Date.now(), text: 'New task' }, ...t]);
  return (
    <>
      <button onClick={addToTop}>Add to top</button>
      <ul>
        {/* key={task.id}, never key={index}: each row keeps its own input state when the list changes */}
        {tasks.map((task) => (
          <li key={task.id}>
            {task.text} <input placeholder="note" />
          </li>
        ))}
      </ul>
    </>
  );
}
```

Keys only need to be unique among siblings. Changing a component's key on purpose is a clean way to **reset** its state (for example `<EditForm key={patientId} />`).

## Controlled and uncontrolled inputs

| | Controlled | Uncontrolled |
|---|---|---|
| Source of truth | React state (`value` + `onChange`) | The DOM (`defaultValue`, read with a ref or `FormData`) |
| Good for | Live validation, formatting, dependent fields | Simple forms, file inputs, React 19 form Actions |
| Cost | A re-render per keystroke | Less control while typing |

```tsx
import { useRef, useState, type FormEvent } from 'react';

export function ControlledMemberId() {
  const [memberId, setMemberId] = useState('');
  const valid = /^[A-Z]{2}\d{6}$/.test(memberId);
  return (
    <label>
      Member ID
      <input value={memberId} onChange={(e) => setMemberId(e.target.value.toUpperCase())} aria-invalid={!valid} />
    </label>
  );
}

export function UncontrolledSearch({ onSearch }: { onSearch: (q: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(ref.current?.value ?? '');
  };
  return (
    <form onSubmit={submit}>
      <input ref={ref} defaultValue="" name="q" />
      <button type="submit">Search</button>
    </form>
  );
}
```

## Composition with children

React favours composition over inheritance. A component that does not know its content in advance takes `children` (or named slots as props).

```tsx
import type { ReactNode } from 'react';

export function Card({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      <header>
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function ClaimCard() {
  return (
    <Card title="Claim 1042" actions={<button>Appeal</button>}>
      <p>Status: denied (missing prior authorization)</p>
    </Card>
  );
}
```

## Class lifecycle methods and their hook equivalents

| Class component | Function component |
|---|---|
| `constructor` / `this.state` | `useState`, `useReducer` |
| `componentDidMount` | `useEffect(fn, [])` |
| `componentDidUpdate` | `useEffect(fn, [deps])` |
| `componentWillUnmount` | the cleanup function returned from `useEffect` |
| `shouldComponentUpdate` / `PureComponent` | `React.memo` |
| `getDerivedStateFromError` / `componentDidCatch` | no hook yet: error boundaries are still classes (or the `react-error-boundary` library) |
| `getSnapshotBeforeUpdate` | no direct hook; `useLayoutEffect` covers most cases |

## What changed in React 19

| Feature | What it does | Replaces |
|---|---|---|
| **Actions** | Async functions passed to `startTransition` or `<form action>`; React tracks pending state, errors and optimistic updates | Hand-written `isLoading` / `error` state around submits |
| `useActionState` | `[state, formAction, isPending]` for an action, ideal for forms | `useFormState` from the canary releases |
| `useFormStatus` (react-dom) | A child of a `<form>` reads whether the form is submitting | Prop drilling a `pending` flag |
| `useOptimistic` | Show the expected result immediately, roll back automatically if the action fails | Manual optimistic state + rollback code |
| `use(resource)` | Read a promise (suspends until it resolves) or a context. Unlike hooks, can be called inside `if` and loops | `useContext`, some data-fetching effects |
| `ref` as a prop | Function components receive `ref` like any other prop | `forwardRef` (to be deprecated) |
| `<Context value>` | A context object renders as its own provider | `<Context.Provider value>` |
| Ref cleanup | A ref callback may return a cleanup function | Checking for `null` in ref callbacks |
| Document metadata | `<title>`, `<meta>`, `<link>` inside components are hoisted to `<head>` | `react-helmet` |
| Server Components and Server Functions | Components that render on the server only; `'use server'` functions callable from the client | API routes for simple mutations (framework-dependent) |
| Removed | `propTypes` and `defaultProps` on function components, string refs, legacy context, `ReactDOM.render` | TypeScript, default parameters, `createRoot` |

React 19.2 (October 2025) added `<Activity>` (hide part of the UI while keeping its state) and `useEffectEvent` (covered in the hooks chapter).

A React 19 form with an Action, pending state and a returned error:

```tsx
import { useActionState } from 'react';

type State = { error: string | null; savedName: string | null };

async function savePatient(name: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
  if (name.length < 2) throw new Error('Name must be at least 2 characters');
}

export function NewPatientForm() {
  const [state, formAction, isPending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const name = String(formData.get('name') ?? '').trim();
      try {
        await savePatient(name);
        return { error: null, savedName: name };
      } catch (e) {
        return { error: (e as Error).message, savedName: null };
      }
    },
    { error: null, savedName: null },
  );

  return (
    <form action={formAction}>
      <input name="name" required />
      <button disabled={isPending}>{isPending ? 'Saving…' : 'Save'}</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.savedName && <p>Saved {state.savedName}</p>}
    </form>
  );
}
```

`ref` as a plain prop, and a context used as its own provider:

```tsx
import { createContext, use, type ComponentProps } from 'react';

// React 19: no forwardRef needed.
export function TextField({ label, ref, ...rest }: ComponentProps<'input'> & { label: string }) {
  return (
    <label>
      {label}
      <input ref={ref} {...rest} />
    </label>
  );
}

const RoleContext = createContext<'admin' | 'viewer'>('viewer');

function AdminOnly({ children }: { children: React.ReactNode }) {
  const role = use(RoleContext); // use() may be called conditionally, unlike useContext
  return role === 'admin' ? children : null;
}

export function App() {
  return (
    <RoleContext value="admin">
      <AdminOnly>
        <button>Edit carrier credentials</button>
      </AdminOnly>
    </RoleContext>
  );
}
```

## Interview questions

### Walk me through what happens when you call setState. {core}

Calling the setter **schedules** a re-render; it does not change the variable in the current render. React then re-runs the component function (render phase) to get new JSX, diffs it against the previous output (reconciliation), and applies only the differences to the DOM (commit phase). After the commit, layout effects run, the browser paints, and then regular effects run.

Details worth adding:

- State is a **snapshot** per render. `setCount(count + 1)` three times in one handler adds 1, not 3, because `count` is the same value in all three calls. Use the updater form `setCount((c) => c + 1)` to queue changes based on the latest value.
- Since React 18, updates are **batched automatically** everywhere (event handlers, promises, timeouts), so several `setState` calls cause one re-render.
- If the new value is identical (`Object.is`) to the current one, React can skip re-rendering that component.

### What is the virtual DOM, and is it why React is fast? {core}

The virtual DOM is the tree of plain JavaScript objects your components return (React elements). React compares the new tree with the previous one and computes the minimal set of real DOM operations. It is not "faster than the DOM": it adds work. Its value is that you write declarative code ("this is what the UI should look like") and React does the DOM updates efficiently enough, batching them and avoiding unnecessary changes.

A sharp follow-up answer: performance problems in React apps usually come from rendering too many components too often, not from the diff itself. That is what `memo`, splitting state and the React Compiler address.

### How does reconciliation work, and why do keys matter? {core}

React diffs trees with two heuristics that make it O(n) instead of the O(n³) general tree-diff: (1) elements of a **different type** produce a completely new subtree (the old one is unmounted, state lost); (2) among a list of children, **keys** identify which child is which across renders. With stable keys React can match items that moved, keep their state and DOM nodes, and only insert or remove what changed.

Without keys (or with index keys on a list that reorders), React matches children by position, so state ends up attached to the wrong item.

### Why is using the array index as a key a problem? {core}

The index describes a position, not an item. If you insert, delete or sort, the same index now points to a different item, so React reuses the wrong component instance: uncontrolled input values, focus, animations and local state stay with the position instead of moving with the data. It also causes unnecessary re-renders of every shifted row.

Index keys are acceptable only when the list is static: never reordered, filtered or inserted into. Otherwise use a stable ID from the data (a database ID, `crypto.randomUUID()` assigned when the item is created). Never generate keys during render (`key={Math.random()}`), which remounts every row on every render.

### What is the difference between props and state? {core}

Props are inputs passed by the parent; the component must treat them as read-only. State is data the component owns and can change with its setter, and changing it triggers a re-render. The same value should live in exactly one place: if a parent and child both need it, it belongs in the parent and goes down as a prop.

Common mistake to mention: copying a prop into state (`useState(props.value)`) only uses the initial value, so it silently goes stale when the prop changes. Derive it during render instead, or reset with a `key`.

### What does "one-way data flow" mean, and what is lifting state up?

Data flows down the tree through props; a child cannot change its parent's data directly. It calls a callback the parent passed down, and the parent updates its own state, which flows back down. Lifting state up means moving shared state to the closest common ancestor of the components that need it.

The benefit is predictability: for any piece of UI you can find the single owner of the data. The cost is prop drilling through many layers, which you solve with composition (passing components as `children`), context, or a store, not by giving up the one-way flow.

### Controlled versus uncontrolled components: when do you use each? {core}

A controlled input gets its `value` from React state and reports changes through `onChange`, so React is the source of truth and you can validate, format or disable things on every keystroke. An uncontrolled input keeps its own value in the DOM; you set a `defaultValue` and read it when needed with a ref or `FormData`.

Use controlled inputs when the UI reacts while the user types (live validation, dependent fields, masking a member ID). Use uncontrolled for simple forms, file inputs (always uncontrolled), and React 19 form Actions, which read `FormData` on submit. A classic warning: switching an input from `value={undefined}` to a string flips it from uncontrolled to controlled; initialise with `''`.

### What causes a component to re-render? {core}

Three things: its own state changes, its parent re-renders, or a context it consumes gets a new value. By default, when a parent re-renders, **all** its children re-render too, whether or not their props changed. That is usually fine because rendering is cheap; you add `React.memo` (or rely on the React Compiler) only when profiling shows an expensive subtree.

Re-rendering is not the same as updating the DOM: a re-render whose output is unchanged produces no DOM work.

### Why must state be updated immutably? {core}

React decides whether something changed by comparing references (`Object.is`). If you mutate an array or object and pass the same reference to the setter, React sees "no change" and may skip the re-render; memoized children and effects that depend on it will not update either. Immutable updates (`[...items, newItem]`, `{ ...patient, name }`, `items.map(...)`) create new references, so change detection is a cheap reference check.

It also keeps each render's snapshot consistent, which makes features like transitions and time-travel debugging work. Redux Toolkit and Immer let you write "mutating" code that produces immutable updates under the hood.

### What does JSX compile to? {deep}

JSX is syntax sugar for function calls that create React elements. With the modern automatic runtime, `<Button kind="primary">Save</Button>` compiles to roughly `jsx(Button, { kind: 'primary', children: 'Save' })` imported from `react/jsx-runtime` (older setups compiled to `React.createElement`, which is why files used to need `import React`). The result is a plain object describing the element type, props and key; nothing is rendered until React processes it.

That is also why JSX expressions must be expressions (use a ternary, not an `if` statement), and why you can store JSX in variables and pass it as props.

### What does StrictMode do? {deep}

`<StrictMode>` enables extra development-only checks; it does nothing in production. It renders components twice, runs effects as mount → unmount → mount once on first mount, and (in React 19) runs ref callbacks twice. The goal is to surface impure render logic and effects that do not clean up after themselves, which would break with concurrent rendering, Fast Refresh, or `<Activity>`.

If your effect fetches data twice in development, StrictMode is working: fix it with a cleanup (ignore stale responses or abort the request), not by removing StrictMode.

### How do class lifecycle methods map to hooks?

`componentDidMount` becomes `useEffect(fn, [])`, `componentDidUpdate` becomes an effect with dependencies (which also runs after the first render, unlike `componentDidUpdate`), and `componentWillUnmount` becomes the cleanup function returned from the effect. State moves to `useState` or `useReducer`, and `shouldComponentUpdate` becomes `React.memo`. Error boundaries are the exception: they still need a class with `getDerivedStateFromError` / `componentDidCatch` (or the `react-error-boundary` package).

The deeper point: hooks group code by **concern** (one effect per subscription, with its setup and cleanup together) rather than by lifecycle moment, and custom hooks let you reuse stateful logic, which classes could only do with HOCs or render props.

### What is new in React 19? {core}

The headline is **Actions**: you can pass async functions to `startTransition` or to a form's `action`, and React manages the pending state, errors and optimistic updates for you, through new hooks `useActionState`, `useFormStatus` and `useOptimistic`. There is also the `use()` API for reading promises and context, `ref` as a normal prop (no more `forwardRef`), `<Context>` as its own provider, ref cleanup functions, built-in `<title>`/`<meta>` hoisting, and stable Server Components.

Breaking changes worth knowing: `ReactDOM.render` and `hydrate` are gone (use `createRoot` / `hydrateRoot`), `propTypes` and `defaultProps` are ignored on function components, string refs and legacy context were removed. React 19.2 added `<Activity>` and `useEffectEvent`, and React Compiler 1.0 shipped as a separate build tool in October 2025.

### How does useActionState work? {deep}

`useActionState(action, initialState)` returns `[state, dispatch, isPending]`. The action receives the previous state and a payload (for forms, the `FormData`), and whatever it returns or resolves to becomes the new state. Pass `dispatch` to `<form action={dispatch}>` and React runs it inside a transition, sets `isPending` while it runs, and resets uncontrolled form fields after a successful submission.

It replaces the usual pattern of `const [error, setError] = useState(); const [loading, setLoading] = useState()` around an `onSubmit`. Errors you want to show should be returned as state; thrown errors go to the nearest error boundary.

### What is the use() API, and how is it different from a hook? {deep}

`use(resource)` reads a value from a promise or a context. With a promise, the component suspends (the nearest `<Suspense>` shows its fallback) until it resolves, and a rejection goes to the nearest error boundary. Unlike hooks, `use` can be called inside conditions and loops, but still only inside a component or hook.

The catch: the promise must be **stable**, created outside render (in a Server Component, a loader, a cache, or a parent that stores it). Creating a new `fetch()` promise during render would suspend forever, because each render makes a new promise. For client-side data fetching, a library like TanStack Query is still the usual answer.

### What are React Server Components? {deep}

Server Components run only on the server (at build time or per request). They can read databases or files directly, their code is never sent to the browser, and they render to a serialised description the client merges into the tree. Client Components, marked with `'use client'` at the top of a file, are the ones that ship JavaScript and can use state, effects and browser APIs. Server Functions marked `'use server'` let client code call server-side functions, typically for form submissions.

You use them through a framework such as Next.js (App Router); a plain Vite single-page app does not have them. Trade-offs: smaller bundles and simpler data access, but a new boundary to reason about, and anything interactive must be a Client Component.

### How do you avoid prop drilling? {core}

First try **composition**: pass the already-built child as `children` or a slot prop, so the intermediate layers never see the data. If many distant components need the same data, use **context** (good for rarely changing values such as the current user, theme or permissions). For frequently changing shared client state use a store (Zustand, Redux Toolkit) with selectors, and for server data use TanStack Query, which shares a cache instead of passing data down.

Mention the trade-off: context re-renders every consumer when its value changes, so it is not a free global store.

### Why does React prefer composition over inheritance? {deep}

Components already accept arbitrary props, including other elements and functions, so you can build specialised components by wrapping and configuring general ones (`<Card>` → `<ClaimCard>`) instead of subclassing. Inheritance couples the child to the parent's implementation and does not compose across multiple behaviours, while composition and custom hooks do. The React team has said they have found no use case where inheritance hierarchies are recommended for components.

### How does React handle events? {deep}

React uses **synthetic events**: a cross-browser wrapper around native events with the same interface (`stopPropagation`, `preventDefault`). Since React 17, React attaches its listeners to the **root container** rather than `document`, and dispatches to your handlers by walking the component tree, which is why several React apps (or React mixed with other code) on one page behave correctly.

Practical details: handlers are camelCase props taking a function (`onClick={handleClick}`, not `onClick={handleClick()}`), `onChange` on inputs fires on every keystroke (like native `input`), and returning `false` does not prevent default: call `e.preventDefault()`.

### What is hydration, and what causes a hydration mismatch? {deep}

With server-side rendering, the server sends HTML so the page shows quickly; hydration is React attaching event handlers and state to that existing HTML on the client instead of re-creating it (`hydrateRoot`). A mismatch happens when the first client render produces different output than the server did: using `Date.now()`, `Math.random()`, `window` or locale-specific formatting during render, or invalid HTML nesting such as a `<div>` inside a `<p>`.

Fixes: render client-only values in an effect after hydration, pass the same data to both sides, or use `useId` for IDs. React 19 reports mismatches with a single diff-style error message, which makes them much easier to find.

### What are portals used for? {deep}

`createPortal(children, domNode)` renders children into a different DOM node (for example `document.body`) while keeping them in the same **React** tree. Modals, tooltips and toasts use portals to escape a parent's `overflow: hidden` or stacking context. Context, state and even event bubbling still follow the React tree, so a click inside a portalled modal bubbles to its React parent, not its DOM parent.

### Tell me about a React feature you delivered.

Pick one story and tell it with a problem, your design decisions, and the outcome.

**Your angle:** at The Dot Corp you extended the React **Labels Web** application (FedEx, USPS, UPS and Endicia) with a role-based Admin UI for managing carrier accounts and credentials, and shipped it to production. Be ready to explain the parts you actually built: how admin-only views were gated by role (and why the API must enforce the same rule, since hiding a button is not security), how the credential forms validated input, and how the change was tested. Describe only what you did. At Medidata you worked on **myMedidata** with React, Redux and Hooks, and helped cut initial load time with lazy loading; that story fits performance questions.
