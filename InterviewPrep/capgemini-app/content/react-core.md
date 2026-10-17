---
title: React fundamentals and React 19
goal: Explain how React renders and reconciles, why keys and one-way data flow matter, how Suspense and error boundaries work, and what React 19 changed, with a working example for each.
minutes: 45
---

The JD asks for 8+ years of React and TypeScript single-page apps, so expect the interviewer to test the fundamentals before anything clever: what happens on a re-render, why keys matter, controlled inputs, how data flows, and where Suspense and error boundaries fit. A senior candidate is also expected to know what React 19 changed (React 19 shipped in December 2024, 19.2 in October 2025 and 19.3 in September 2026; this lab runs 19.3).

Anchor every answer in the **render → commit** model. Streaming chat, live dashboards and agent approval flows are all "lots of small state changes arriving fast", so the interviewer will push on exactly these basics: which components re-render, which state survives, and what happens when something throws.

## The mental model: UI is a function of state

A component is a function that takes props and state and returns a description of the UI. React calls it, compares the new description with the previous one, and changes only the DOM nodes that differ.

| Phase | What happens | Can it be interrupted? |
|---|---|---|
| **Trigger** | `setState`, a parent re-rendering, or a context value changing | — |
| **Render** | React calls your component functions to get new JSX. Must be pure: no DOM writes, no fetches, no subscriptions | Yes (concurrent rendering can pause, restart or throw away a render) |
| **Commit** | React applies the minimal DOM changes, then runs layout effects, then (usually after paint) effects | No |

Three things re-render a component: **its own state changed**, **its parent re-rendered**, or **a context it reads changed**. "Props changed" is not a separate trigger: props only change because the parent re-rendered.

## Props, state and one-way data flow

Props flow down; events flow up. When two siblings need the same data, move the state to their closest common parent ("lifting state up") and pass a callback down.

```tsx
import { useState } from 'react';

type Run = { id: string; agent: string; status: 'running' | 'waiting_approval' | 'done' | 'failed' };

function RunList({ runs, selectedId, onSelect }: { runs: Run[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return (
    <ul>
      {runs.map((r) => (
        <li key={r.id}>
          <button aria-pressed={r.id === selectedId} onClick={() => onSelect(r.id)}>
            {r.agent} · {r.status}
          </button>
        </li>
      ))}
    </ul>
  );
}

function RunDetail({ run }: { run: Run | undefined }) {
  return <p>{run ? `Run ${run.id} is ${run.status}` : 'Pick a run'}</p>;
}

// The page owns the selection; both children read it, only the list changes it.
export function RunsPage({ runs }: { runs: Run[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <>
      <RunList runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
      <RunDetail run={runs.find((r) => r.id === selectedId)} />
    </>
  );
}
```

## Lists and keys

A key tells React which item is which between renders. With stable keys, React moves, inserts and removes DOM nodes (and the state inside them) correctly. With array indexes as keys, inserting at the top shifts every index, so React reuses the wrong component instance: typed text, expanded panels and checkbox state end up on the wrong row.

In a chat UI this matters twice: messages need an ID **the moment they are created** (assign one on the client for the optimistic user message and for the assistant message that is about to stream), and the streaming message must keep the same key from its first token to its last, or it remounts on every chunk.

```tsx
import { useState } from 'react';

type Message = { id: string; role: 'user' | 'assistant'; text: string };

export function Thread() {
  const [messages, setMessages] = useState<Message[]>([]);
  const send = (text: string) =>
    setMessages((m) => [
      ...m,
      { id: crypto.randomUUID(), role: 'user', text },
      // The assistant reply gets its ID now, before the first token arrives.
      { id: crypto.randomUUID(), role: 'assistant', text: '' },
    ]);
  return (
    <>
      <button onClick={() => send('Summarise run 42')}>Ask</button>
      <ol>
        {/* key={m.id}, never key={index}: rows keep their own state when messages are inserted or removed */}
        {messages.map((m) => (
          <li key={m.id} data-role={m.role}>
            {m.text || '…'}
          </li>
        ))}
      </ol>
    </>
  );
}
```

Keys only need to be unique among siblings. Changing a component's key on purpose is a clean way to **reset** its state (for example `<RunEditor key={runId} />` starts fresh when the run changes).

## Controlled and uncontrolled inputs

| | Controlled | Uncontrolled |
|---|---|---|
| Source of truth | React state (`value` + `onChange`) | The DOM (`defaultValue`, read with a ref or `FormData`) |
| Good for | Live validation, formatting, dependent fields, character counters | Simple forms, file inputs, React 19 form Actions |
| Cost | A re-render per keystroke | Less control while typing |

```tsx
import { useRef, useState, type FormEvent } from 'react';

const MAX = 4000;

export function PromptBox({ onSend }: { onSend: (prompt: string) => void }) {
  const [prompt, setPrompt] = useState('');
  const tooLong = prompt.length > MAX;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (tooLong || !prompt.trim()) return; // keep the text so the user can fix it
        onSend(prompt);
        setPrompt('');
      }}
    >
      <label>
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          aria-invalid={tooLong}
          aria-describedby="prompt-count"
        />
      </label>
      {/* Described by, not a live region: announcing the count on every keystroke would drown out typing. */}
      <span id="prompt-count">{MAX - prompt.length} characters left</span>
      <button disabled={tooLong}>Send</button>
    </form>
  );
}

export function UncontrolledSearch({ onSearch }: { onSearch: (q: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(ref.current?.value ?? '');
  };
  return (
    <form onSubmit={submit} role="search">
      <input ref={ref} defaultValue="" name="q" aria-label="Search runs" />
      <button type="submit">Search</button>
    </form>
  );
}
```

## Composition with children

React favours composition over inheritance. A component that does not know its content in advance takes `children` (or named slots as props). Composition is also the first fix for prop drilling: the intermediate component renders whatever it is given and never needs to know about the data inside.

```tsx
import type { ReactNode } from 'react';

export function Panel({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="panel">
      <header>
        <h2>{title}</h2>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function ToolCallCard({ tool, args }: { tool: string; args: Record<string, unknown> }) {
  return (
    <Panel title={`Tool call: ${tool}`} actions={<button>Approve</button>}>
      <pre>{JSON.stringify(args, null, 2)}</pre>
    </Panel>
  );
}
```

## Error boundaries

An error boundary catches errors thrown while **rendering** its children (and in their lifecycle methods and constructors) and shows a fallback instead of unmounting the whole app. It is still a class component (or the `react-error-boundary` package, which wraps one with a nicer API). Put boundaries around independent regions, such as each dashboard widget, the chat transcript, and each route, so one bad payload does not blank the page.

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  fallback: (error: Error, reset: () => void) => ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
  children: ReactNode;
};
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error }; // render phase: switch to the fallback
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info); // commit phase: report it (info.componentStack says where)
  }

  reset = () => this.setState({ error: null });

  render() {
    return this.state.error ? this.props.fallback(this.state.error, this.reset) : this.props.children;
  }
}

export function TelemetryWidget({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(error, reset) => (
        <div role="alert">
          <p>This widget failed: {error.message}</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}
      onError={(error) => console.error('widget crashed', error)}
    >
      {children}
    </ErrorBoundary>
  );
}
```

What they do **not** catch: errors in event handlers (use `try/catch` there), in async code outside rendering (a rejected promise in a `setTimeout` or a socket `onmessage`), during server rendering, or in the boundary itself. To route an async failure into a boundary, store it in state and throw it during render, or let a library do it (TanStack Query's `throwOnError`, or `use(promise)` rejecting). React 19 also adds root-level `onCaughtError` and `onUncaughtError` options on `createRoot` for central error reporting.

## Suspense for code and data

`<Suspense fallback={…}>` shows the fallback while anything inside it is **suspended**: a lazily loaded component whose code has not arrived, or a component reading a promise with `use()` (or a Suspense-enabled library such as `useSuspenseQuery`). Boundaries nest, so you decide where the loading states appear: one skeleton for the whole run page, or separate ones for the header and the log panel.

```tsx
import { lazy, Suspense, use } from 'react';

type RunSummary = { id: string; agent: string; steps: number };

// The promise must be created outside render and reused, or every render would suspend again.
const cache = new Map<string, Promise<RunSummary>>();
function loadRun(id: string): Promise<RunSummary> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/runs/${id}`).then((r) => r.json() as Promise<RunSummary>);
    cache.set(id, p);
  }
  return p;
}

function RunHeader({ id }: { id: string }) {
  const run = use(loadRun(id)); // suspends until resolved; a rejection goes to the nearest error boundary
  return (
    <h2>
      {run.agent} · {run.steps} steps
    </h2>
  );
}

// In the app this is: const LogsPanel = lazy(() => import('./LogsPanel'));
const LogsPanel = lazy(() => Promise.resolve({ default: () => <pre>logs…</pre> }));

export function RunPage({ id }: { id: string }) {
  return (
    <>
      <Suspense fallback={<p>Loading run…</p>}>
        <RunHeader id={id} />
      </Suspense>
      <Suspense fallback={<p>Loading logs…</p>}>
        <LogsPanel />
      </Suspense>
    </>
  );
}
```

Two details interviewers like. First, if an update that causes suspension is wrapped in `startTransition`, React keeps showing the **old** content instead of flashing back to the fallback. Second, Suspense handles the waiting and error boundaries handle the failing; you almost always want both around the same region.

## Portals

`createPortal(children, domNode)` renders children into another DOM node (usually `document.body`) while keeping them in the same **React** tree. Dialogs, toasts and tooltips use portals to escape a parent's `overflow: hidden` or stacking context. Context, state and even event bubbling still follow the React tree.

```tsx
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function ApprovalDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal(); // native <dialog>: focus trap, Escape and inert background for free
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return createPortal(
    <dialog ref={ref} onClose={onClose} aria-labelledby="approval-title">
      <h2 id="approval-title">Approve this action?</h2>
      {children}
      {/* Closing the dialog fires its close event, which calls onClose once (Escape takes the same path). */}
      <button onClick={() => ref.current?.close()}>Cancel</button>
    </dialog>,
    document.body,
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
| `getDerivedStateFromError` / `componentDidCatch` | no hook: error boundaries are still classes (or `react-error-boundary`) |
| `getSnapshotBeforeUpdate` | no direct hook; `useLayoutEffect` covers most cases |

## What changed in React 19

| Feature | What it does | Replaces |
|---|---|---|
| **Actions** | Async functions passed to `startTransition` or `<form action>`; React tracks pending state, errors and optimistic updates | Hand-written `isLoading` / `error` state around submits |
| `useActionState` | `[state, formAction, isPending]` for an action, ideal for forms | `useFormState` from the canary releases |
| `useFormStatus` (react-dom) | A child of a `<form>` reads whether the form is submitting | Prop drilling a `pending` flag |
| `useOptimistic` | Show the expected result immediately; it reverts to the real state when the action finishes | Manual optimistic state + rollback code |
| `use(resource)` | Read a promise (suspends until it resolves) or a context. Unlike hooks, can be called inside `if` and loops | `useContext`, some data-fetching effects |
| `ref` as a prop | Function components receive `ref` like any other prop | `forwardRef` (to be deprecated) |
| `<Context value>` | A context object renders as its own provider | `<Context.Provider value>` |
| Ref cleanup | A ref callback may return a cleanup function | Checking for `null` in ref callbacks |
| Document metadata | `<title>`, `<meta>`, `<link>` inside components are hoisted to `<head>` | `react-helmet` |
| Root error options | `createRoot(el, { onCaughtError, onUncaughtError })` | Wrapping everything to log errors |
| Server Components and Server Functions | Components that render on the server only; `'use server'` functions callable from the client | API routes for simple mutations (framework-dependent) |
| Removed | `propTypes` and `defaultProps` on function components, string refs, legacy context, `ReactDOM.render` | TypeScript, default parameters, `createRoot` |

React 19.2 (October 2025) added `<Activity>` (hide part of the UI while keeping its state) and `useEffectEvent` (covered in the hooks chapter). React Compiler 1.0 shipped separately in October 2025 as a build plugin. React 19.3 (September 2026) adds `<ViewTransition>` and `addTransitionType` to the stable package (animating between UI states with the browser's View Transitions API); they were canary-only in 19.2.

A React 19 form with an Action, pending state and a returned error, here a reviewer rejecting an agent's proposed action with a reason. Note the `reason` in the state: React resets uncontrolled fields after every form Action that does not throw, **including one that returns an error**, so without it the reviewer's text would vanish on a validation error.

```tsx
import { useActionState } from 'react';

type State = { error: string | null; done: boolean; reason: string };

async function rejectAction(runId: string, reason: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 300));
  if (reason.length < 10) throw new Error('Give the agent a reason of at least 10 characters');
  console.log('rejected', runId);
}

export function RejectForm({ runId }: { runId: string }) {
  const [state, formAction, isPending] = useActionState(
    async (_prev: State, formData: FormData): Promise<State> => {
      const reason = String(formData.get('reason') ?? '').trim();
      try {
        await rejectAction(runId, reason);
        return { error: null, done: true, reason: '' };
      } catch (e) {
        // Return what was typed: the form reset restores defaultValue, so the text survives the error.
        return { error: (e as Error).message, done: false, reason };
      }
    },
    { error: null, done: false, reason: '' },
  );

  return (
    <form action={formAction}>
      <label>
        Reason
        <textarea name="reason" required defaultValue={state.reason} />
      </label>
      <button disabled={isPending}>{isPending ? 'Sending…' : 'Reject'}</button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.done && <p>Rejected. The agent will re-plan.</p>}
    </form>
  );
}
```

`useOptimistic` for a chat message that should appear the instant the user presses Send:

```tsx
import { startTransition, useOptimistic, useState } from 'react';

type Msg = { id: string; text: string; pending?: boolean };

async function postMessage(text: string): Promise<Msg> {
  await new Promise((r) => setTimeout(r, 400));
  return { id: crypto.randomUUID(), text };
}

export function Composer({ initial }: { initial: Msg[] }) {
  const [messages, setMessages] = useState(initial);
  const [shown, addOptimistic] = useOptimistic(messages, (state: Msg[], text: string) => [
    ...state,
    { id: `pending-${state.length}`, text, pending: true },
  ]);

  async function send(formData: FormData) {
    const text = String(formData.get('text') ?? '');
    addOptimistic(text); // shown at once, inside the form action's transition
    const saved = await postMessage(text);
    // Updates after an await are not automatically part of the transition: wrap them.
    startTransition(() => setMessages((m) => [...m, saved]));
  }

  return (
    <>
      <ul>
        {shown.map((m) => (
          <li key={m.id} style={{ opacity: m.pending ? 0.6 : 1 }}>
            {m.text}
          </li>
        ))}
      </ul>
      <form action={send}>
        <input name="text" aria-label="Message" />
        <button>Send</button>
      </form>
    </>
  );
}
```

If `postMessage` throws, the optimistic message disappears when the action ends (the optimistic state falls back to `messages`), and the error goes to the nearest error boundary unless you catch it and keep it in state.

`ref` as a plain prop, and a context used as its own provider:

```tsx
import { createContext, use, type ComponentProps, type ReactNode } from 'react';

// React 19: no forwardRef needed.
export function TextField({ label, ref, ...rest }: ComponentProps<'input'> & { label: string }) {
  return (
    <label>
      {label}
      <input ref={ref} {...rest} />
    </label>
  );
}

const RoleContext = createContext<'operator' | 'viewer'>('viewer');

function OperatorOnly({ children }: { children: ReactNode }) {
  const role = use(RoleContext); // use() may be called conditionally, unlike useContext
  return role === 'operator' ? children : null;
}

export function App() {
  return (
    <RoleContext value="operator">
      <OperatorOnly>
        <button>Cancel run</button>
      </OperatorOnly>
    </RoleContext>
  );
}
```

## Server Components, and why they may not apply here

Server Components run only on the server, read data directly, and send no JavaScript for themselves. They need a framework with a server (Next.js App Router, or React Router's still-experimental RSC support). An internal enterprise console is often a **Vite SPA** served as static files behind an identity-aware proxy, talking to APIs over REST, gRPC-Web, SSE and WebSockets. In that setup there are no Server Components, and everything interactive (the chat, the dashboards) is client-rendered anyway. Say that plainly if asked; then show you understand the model (the `'use client'` boundary, serialisable props, Server Functions) in case the team does use Next.js.

## Interview questions

### Walk me through what happens when you call setState. {core}

Calling the setter **schedules** a re-render; it does not change the variable in the current render. React then re-runs the component function (render phase) to get new JSX, diffs it against the previous output (reconciliation), and applies only the differences to the DOM (commit phase). After the commit, layout effects run, the browser paints, and then regular effects run.

Details worth adding:

- State is a **snapshot** per render. `setCount(count + 1)` three times in one handler adds 1, not 3, because `count` is the same value in all three calls. Use the updater form `setCount((c) => c + 1)` to queue changes based on the latest value.
- Since React 18, updates are **batched automatically** everywhere (event handlers, promises, timeouts, socket callbacks), so several `setState` calls cause one re-render.
- If the new value is identical (`Object.is`) to the current one, React can skip re-rendering that component.

### What is the virtual DOM, and is it why React is fast?

The virtual DOM is the tree of plain JavaScript objects your components return (React elements). React compares the new tree with the previous one and computes the minimal set of real DOM operations. It is not "faster than the DOM": it adds work. Its value is that you write declarative code ("this is what the UI should look like") and React does the DOM updates efficiently enough, batching them and avoiding unnecessary changes.

The sharp follow-up: performance problems in React apps usually come from rendering too many components too often, not from the diff itself. A chat that appends a token to a 300-message array and re-renders every message on each token is the classic example; the fixes are memoised rows, splitting state, and batching tokens, not a different DOM strategy.

### How does reconciliation work, and why do keys matter? {core}

React diffs trees with two heuristics that make it O(n) instead of the O(n³) general tree diff: (1) elements of a **different type** produce a completely new subtree (the old one is unmounted and its state lost); (2) among a list of children, **keys** identify which child is which across renders. With stable keys React can match items that moved, keep their state and DOM nodes, and only insert or remove what changed.

Without keys (or with index keys on a list that reorders), React matches children by position, so state ends up attached to the wrong item.

### Why is using the array index as a key a problem? {core}

The index describes a position, not an item. If you insert, delete or sort, the same index now points to a different item, so React reuses the wrong component instance: uncontrolled input values, focus, expanded state and animations stay with the position instead of moving with the data. It also re-renders every shifted row.

Index keys are acceptable only for a static list that is never reordered, filtered or inserted into. Otherwise use a stable ID from the data, or assign one when the item is created (`crypto.randomUUID()` for an optimistic chat message). Never generate keys during render (`key={Math.random()}`): that remounts every row on every render.

### Why did my component lose its state? {deep}

Because React thought it was a different component. State belongs to a **position in the tree** plus a type and key. It is reset when the element type at that position changes (for example a ternary that switches between `<RunEditor>` and `<div>`, or a component defined inside another component, which is a new type on every render), when the key changes, or when the parent that holds it unmounts. Conversely, two different conditional branches that render the same component at the same position **share** state, which surprises people.

The fixes: define components at module level, keep the tree shape stable, and use `key` deliberately when you do want a reset.

### What is the difference between props and state? {core}

Props are inputs passed by the parent; the component must treat them as read-only. State is data the component owns and can change with its setter, and changing it triggers a re-render. A value should live in exactly one place: if a parent and child both need it, it belongs in the parent and goes down as a prop.

The common mistake: copying a prop into state (`useState(props.run)`) only uses the initial value, so it silently goes stale when the prop changes. Derive it during render instead, or reset with a `key`.

### What does "one-way data flow" mean, and what is lifting state up?

Data flows down the tree through props; a child cannot change its parent's data directly. It calls a callback the parent passed down, and the parent updates its own state, which flows back down. Lifting state up means moving shared state to the closest common ancestor of the components that need it.

The benefit is predictability: for any piece of UI you can find the single owner of the data. The cost is prop drilling through many layers, which you solve with composition (passing components as `children`), context, or a store, not by giving up the one-way flow.

### Controlled versus uncontrolled components: when do you use each? {core}

A controlled input gets its `value` from React state and reports changes through `onChange`, so React is the source of truth and you can validate, format or count characters on every keystroke. An uncontrolled input keeps its own value in the DOM; you set a `defaultValue` and read it when needed with a ref or `FormData`.

Use controlled inputs when the UI reacts while the user types (a prompt box with a token or character limit, dependent fields). Use uncontrolled for simple forms, file inputs (always uncontrolled), and React 19 form Actions, which read `FormData` on submit. A classic warning: switching an input from `value={undefined}` to a string flips it from uncontrolled to controlled; initialise with `''`.

### What causes a component to re-render? {core}

Three things: its own state changes, its parent re-renders, or a context it consumes gets a new value. By default, when a parent re-renders, **all** its children re-render too, whether or not their props changed. That is usually fine because rendering is cheap; you add `React.memo` (or rely on the React Compiler) only when profiling shows an expensive subtree.

Re-rendering is not the same as updating the DOM: a re-render whose output is unchanged produces no DOM work.

### Why must state be updated immutably? {core}

React decides whether something changed by comparing references (`Object.is`). If you mutate an array or object and pass the same reference to the setter, React sees "no change" and may skip the re-render; memoised children and effects that depend on it will not update either. Immutable updates (`[...messages, msg]`, `{ ...run, status }`, `steps.map(...)`) create new references, so change detection is a cheap reference check.

It also keeps each render's snapshot consistent, which makes transitions and time-travel debugging work. Redux Toolkit and Immer let you write "mutating" code that produces immutable updates under the hood.

### What are error boundaries, and what do they not catch? {core}

An error boundary is a component that catches errors thrown while rendering its children (and in their constructors and lifecycle methods), reports them, and shows a fallback instead of unmounting the whole app. It must be a class with `static getDerivedStateFromError` (to switch to the fallback) and usually `componentDidCatch` (to log), or you use `react-error-boundary`.

They do not catch errors in event handlers, in async callbacks outside rendering (timers, promise callbacks, WebSocket `onmessage`), during server rendering, or inside the boundary itself. Place them around independent regions (each dashboard widget, the transcript, each route) and give the fallback a retry button that resets the boundary. To surface an async error in a boundary, put it in state and throw it during render.

### How does Suspense work? {core}

Suspense lets a component say "I am not ready yet" by suspending, and the nearest `<Suspense>` boundary above it shows its fallback until the component can render. Things that suspend: `React.lazy` components whose code is still loading, `use(promise)` on a pending promise, and Suspense-enabled data libraries (`useSuspenseQuery` in TanStack Query, framework loaders).

Boundaries nest, so you design the loading experience: one boundary per independent region rather than one spinner for the page. Pair each with an error boundary for the failure case. If the update that caused suspension is a transition, React keeps the previous UI on screen instead of flashing the fallback. The promise passed to `use` must be stable (cached outside render), or the component suspends forever.

### What are portals used for? {deep}

`createPortal(children, domNode)` renders children into a different DOM node (for example `document.body`) while keeping them in the same **React** tree. Dialogs, tooltips and toasts use portals to escape a parent's `overflow: hidden` or stacking context. Context, state and event bubbling still follow the React tree, so a click inside a portalled dialog bubbles to its React parent, not its DOM parent.

For dialogs today, prefer the native `<dialog>` element with `showModal()`: it gives you the top layer, focus containment, the Escape key and an inert background, which used to need a portal plus a focus-trap library.

### What does JSX compile to? {deep}

JSX is syntax sugar for function calls that create React elements. With the modern automatic runtime, `<Button kind="primary">Save</Button>` compiles to roughly `jsx(Button, { kind: 'primary', children: 'Save' })` imported from `react/jsx-runtime` (older setups compiled to `React.createElement`, which is why files used to need `import React`). The result is a plain object describing the element type, props and key; nothing is rendered until React processes it.

That is why JSX expressions must be expressions (use a ternary, not an `if` statement), and why you can store JSX in variables and pass it as props.

### What does StrictMode do? {deep}

`<StrictMode>` enables extra development-only checks; it does nothing in production. It renders components twice, runs effects as mount → unmount → mount once on first mount, and (in React 19) runs ref callbacks twice. The goal is to surface impure render logic and effects that do not clean up, which would break with concurrent rendering, Fast Refresh, or `<Activity>`.

If your WebSocket connects twice in development, StrictMode is working: the first socket must be closed in the effect's cleanup. Fix the cleanup; do not remove StrictMode or add a "has connected" ref.

### How do class lifecycle methods map to hooks?

`componentDidMount` becomes `useEffect(fn, [])`, `componentDidUpdate` becomes an effect with dependencies (which also runs after the first render, unlike `componentDidUpdate`), and `componentWillUnmount` becomes the cleanup function returned from the effect. State moves to `useState` or `useReducer`, and `shouldComponentUpdate` becomes `React.memo`. Error boundaries are the exception: they still need a class.

The deeper point: hooks group code by **concern** (one effect per subscription, with its setup and cleanup together) rather than by lifecycle moment, and custom hooks let you reuse stateful logic, which classes could only do with higher-order components or render props.

### What is new in React 19? {core}

The headline is **Actions**: you can pass async functions to `startTransition` or to a form's `action`, and React manages pending state, errors and optimistic updates, through `useActionState`, `useFormStatus` and `useOptimistic`. There is also `use()` for reading promises and context, `ref` as a normal prop (no more `forwardRef`), `<Context>` as its own provider, ref cleanup functions, built-in `<title>`/`<meta>` hoisting, root error callbacks, and stable Server Components.

Breaking changes worth knowing: `ReactDOM.render` and `hydrate` are gone (use `createRoot` / `hydrateRoot`), `propTypes` and `defaultProps` are ignored on function components, string refs and legacy context were removed. React 19.2 added `<Activity>` and `useEffectEvent`, React Compiler 1.0 shipped as a separate build tool in October 2025, and 19.3 made `<ViewTransition>` stable.

### How does useActionState work? {deep}

`useActionState(action, initialState)` returns `[state, dispatch, isPending]`. The action receives the previous state and a payload (for forms, the `FormData`), and whatever it returns or resolves to becomes the new state. Pass `dispatch` to `<form action={dispatch}>` and React runs it inside a transition, sets `isPending` while it runs, and resets the form's uncontrolled fields when the action finishes.

It replaces the usual `useState` pair for `error` and `loading` around an `onSubmit`. Errors you want to show should be returned as state; thrown errors go to the nearest error boundary. The trap: the reset happens whenever the action does not throw, so a returned validation error also clears what the user typed. Return the submitted values in the state and bind them with `defaultValue={state.reason}` (or use controlled inputs) so the text survives.

### How does useOptimistic work, and what happens on failure? {deep}

`useOptimistic(state, updateFn)` returns a value to render and an `addOptimistic` function. Inside an Action (a transition), calling `addOptimistic(x)` immediately renders `updateFn(state, x)`, for example the user's chat message greyed out. When the Action finishes, the optimistic layer is dropped and the component renders the real `state` again. If the server call succeeded you have already put the saved message into real state, so nothing visibly changes; if it failed, the optimistic message simply disappears.

So rollback is automatic, but showing an error is your job: catch the failure and keep it in state (or let it reach an error boundary). One gotcha: state updates after an `await` inside an Action should be wrapped in `startTransition`.

### What is the use() API, and how is it different from a hook? {deep}

`use(resource)` reads a value from a promise or a context. With a promise, the component suspends until it resolves, and a rejection goes to the nearest error boundary. Unlike hooks, `use` can be called inside conditions and loops, but still only inside a component or hook.

The catch: the promise must be **stable**, created outside render (in a cache, a loader, a parent that stores it, or a Server Component). Creating a new `fetch()` promise during render suspends forever, because each render makes a new promise. For client-side data fetching in an SPA, a library such as TanStack Query is still the usual answer.

### What are React Server Components, and would you use them on this platform? {deep}

Server Components run only on the server (at build time or per request). They can read databases directly, their code never reaches the browser, and they render to a serialised description the client merges into the tree. Client Components, marked with `'use client'`, are the ones that ship JavaScript and can use state, effects and browser APIs. Server Functions marked `'use server'` let client code call server-side functions.

They need a framework such as Next.js. An internal agent console is usually a client-heavy SPA (streaming chat, live dashboards, socket-driven state) served statically and calling APIs, so most of it would be Client Components anyway. I would say: "I would use them for content-heavy or SEO pages; for this kind of real-time console a Vite SPA with a good data layer is simpler."

### How do you avoid prop drilling? {core}

First try **composition**: pass the already-built child as `children` or a slot prop, so the intermediate layers never see the data. If many distant components need the same rarely changing value (the current user, permissions, theme), use **context**. For frequently changing shared client state use a store with selectors (Zustand, Redux Toolkit), and for server data use a query cache (TanStack Query, RTK Query), which shares data instead of passing it down.

Mention the trade-off: context re-renders every consumer when its value changes, so it is dependency injection, not a free global store.

### How does React handle events? {deep}

React uses **synthetic events**: a cross-browser wrapper around native events with the same interface (`stopPropagation`, `preventDefault`). Since React 17, React attaches its listeners to the **root container** rather than `document`, and dispatches to your handlers by walking the component tree, so several React roots (or React mixed with other code) on one page behave correctly.

Practical details: handlers are camelCase props taking a function (`onClick={handleClick}`, not `onClick={handleClick()}`), `onChange` on inputs fires on every keystroke (like native `input`), and returning `false` does not prevent default: call `e.preventDefault()`.

### What is hydration, and what causes a hydration mismatch? {deep}

With server rendering, the server sends HTML so the page shows quickly; hydration is React attaching event handlers and state to that HTML on the client instead of re-creating it (`hydrateRoot`). A mismatch happens when the first client render produces different output than the server: `Date.now()`, `Math.random()`, `window`, or locale-specific formatting during render, or invalid nesting such as a `<div>` inside a `<p>`.

Fixes: render client-only values in an effect after hydration, pass the same data to both sides, or use `useId` for IDs. React 19 reports mismatches as one diff-style error, which makes them much easier to find.

### Tell me about a React feature you delivered. {core}

Pick one story and tell it with the problem, your design decisions, and the outcome.

**Your angle:** at The Dot Corp you extended the React **Labels Web** application (FedEx, USPS, UPS and Endicia) with a role-based Admin UI for managing carrier accounts and credentials, and shipped it to production. Explain only the parts you actually built, for example how admin-only views were gated by role (and why the API must enforce the same rule, because hiding a button is not security), and how the change was tested. At Medidata you worked on **myMedidata** with React, Redux, Hooks and TypeScript, and helped cut initial load time with lazy loading and better state management; that story fits performance and state questions. Describe only what you did.
