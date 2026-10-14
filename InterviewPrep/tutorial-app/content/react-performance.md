---
title: React performance and state management
goal: Diagnose and fix slow React screens, and choose between local state, Context, Redux Toolkit, Zustand and TanStack Query with clear reasons.
minutes: 45
---

Two questions come up in almost every senior React interview: "how would you make this page faster?" and "how do you manage state in a large app?" Strong answers start with **measuring**, use the cheapest fix first (move state, split components), and treat server data as a different kind of state from UI state.

**Your angle:** at Medidata you worked on improving the myMedidata React app with **lazy loading and improved state management, reducing initial load times**. Use it as your concrete example for both topics.

## Measure before you optimise

| Tool | What it tells you |
|---|---|
| React DevTools **Profiler** | Which components rendered in each commit, how long each took, and *why* it rendered ("props changed", "hook changed", "parent rendered") |
| DevTools "Highlight updates when components render" | A quick visual of what re-renders while you type or scroll |
| `<Profiler id onRender>` | Render timings in code, for logging in a test or a staging build |
| Chrome Performance panel | Long tasks, layout and paint cost; React 19.2 adds React-specific tracks here |
| Bundle analyser (e.g. `rollup-plugin-visualizer` for Vite) | What makes the JavaScript bundle large |
| Core Web Vitals (LCP, INP, CLS) | Real-user loading, responsiveness and layout stability. INP replaced FID as a Core Web Vital in March 2024 |

## The fixes, cheapest first

| Problem | Fix |
|---|---|
| Typing in one field re-renders a whole page | **Move state down** into the component that uses it |
| A parent with state re-renders expensive children it only wraps | **Lift content up**: pass the children as `children` (elements created by the grandparent are not re-created) |
| A pure, expensive child re-renders with the same props | `React.memo`, plus stable props (`useMemo`/`useCallback`), or let React Compiler do it |
| A list with thousands of rows | **Virtualise** it (TanStack Virtual, react-window): render only the visible rows |
| A large bundle slows the first load | **Code-split** routes and heavy widgets with `React.lazy` + `<Suspense>` |
| Expensive re-render makes typing feel laggy | `useDeferredValue` / `useTransition`, or debounce the input |
| Every context consumer re-renders on any change | Memoize the value, split the context, or use a store with selectors |
| Repeated fetching of the same data | A server-state cache (TanStack Query, RTK Query) |

Moving state down and lifting content up, without any memoization:

```tsx
import { useState, type ReactNode } from 'react';

function ExpensiveChart() {
  // Imagine heavy rendering here.
  return <svg width={400} height={200} aria-label="claims by month" />;
}

// Before: the page held `note` state, so every keystroke re-rendered ExpensiveChart.
// After: the state lives in the small component that needs it.
function NoteField() {
  const [note, setNote] = useState('');
  return <input value={note} onChange={(e) => setNote(e.target.value)} />;
}

// When a wrapper must own state (here, whether a panel is open), pass the heavy part as children:
// the <ExpensiveChart /> element is created by the page, so the wrapper's state changes do not re-create it.
function CollapsiblePanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <button onClick={() => setOpen((o) => !o)}>{open ? 'Hide' : 'Show'}</button>
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

## Code splitting with lazy and Suspense

```tsx
import { lazy, Suspense, useState } from 'react';

// Each lazy() call becomes its own chunk, downloaded the first time it renders.
// (The modules are inlined here so the example is self-contained; normally: lazy(() => import('./ReportsPage')).)
const ReportsPage = lazy(async () => ({ default: () => <h1>Reports</h1> }));
const AdminPage = lazy(async () => ({ default: () => <h1>Carrier admin</h1> }));

export function App() {
  const [page, setPage] = useState<'home' | 'reports' | 'admin'>('home');
  return (
    <>
      <nav>
        <button onClick={() => setPage('home')}>Home</button>
        <button onClick={() => setPage('reports')}>Reports</button>
        <button onClick={() => setPage('admin')}>Admin</button>
      </nav>
      <Suspense fallback={<p>Loading…</p>}>
        {page === 'reports' && <ReportsPage />}
        {page === 'admin' && <AdminPage />}
        {page === 'home' && <h1>Home</h1>}
      </Suspense>
    </>
  );
}
```

## Error boundaries

An error during rendering unmounts the whole tree unless an error boundary catches it. Error boundaries are still class components.

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { fallback: ReactNode; children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true }; // render the fallback on the next render
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Report to monitoring; never include PHI in the payload.
    console.error('UI error', error.message, info.componentStack);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
```

Error boundaries do **not** catch errors in event handlers, in async code (timers, promises) outside rendering, during server rendering, or in the boundary itself. Use try/catch in handlers; React 19 Actions route errors thrown in transitions to the nearest boundary.

## Activity: hide without losing state (React 19.2)

```tsx
import { Activity, useState } from 'react';

function DraftNote() {
  const [text, setText] = useState('');
  return <textarea value={text} onChange={(e) => setText(e.target.value)} />;
}

export function SidePanel() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen((o) => !o)}>Toggle notes</button>
      {/* Hidden: effects are cleaned up and updates are deferred, but the typed draft is kept. */}
      <Activity mode={open ? 'visible' : 'hidden'}>
        <DraftNote />
      </Activity>
    </>
  );
}
```

## React Compiler

React Compiler (1.0, stable since October 2025) is a build-time tool (a Babel plugin, usable from Vite, Next.js and others) that analyses components and hooks and inserts memoization automatically, at a finer grain than hand-written `useMemo`/`useCallback`/`memo`. It relies on your code following the Rules of React (pure render, no mutation of props or state, hooks rules); code it cannot prove safe is skipped. You can opt a component out with the `"use no memo"` directive. It does not replace good structure: state still belongs where it is used.

## Kinds of state, and where each belongs

| Kind | Example | Best home |
|---|---|---|
| Local UI state | an open dropdown, a text input | `useState` / `useReducer` in the component |
| Shared client state | the current user, theme, a multi-step form, a cart | Context (rarely changing) or a store: Zustand, Redux Toolkit |
| **Server state** | patients, claims, anything fetched from an API | TanStack Query or RTK Query: a cache with refetching, not a store |
| URL state | filters, page number, selected tab | the URL (search params) so it survives reloads and can be shared |
| Form state | field values, touched, errors | React 19 form Actions, or react-hook-form for complex forms |

| | Context | Redux Toolkit | Zustand | TanStack Query |
|---|---|---|---|---|
| Purpose | Dependency injection of a value | Predictable global client state | Lightweight global client state | Server-state cache |
| Re-renders | every consumer on any change | only components whose selected slice changed | only components whose selected slice changed | per query |
| Boilerplate | very low | moderate (slices, store, provider) | very low | low |
| Devtools / time travel | no | excellent (Redux DevTools) | via middleware | own Devtools |
| Async | DIY | `createAsyncThunk`, RTK Query | DIY in actions | built in: caching, retries, dedupe, invalidation |
| Pick it when | values change rarely | large team, complex shared logic, auditability | small/medium app, simple global state | any app that talks to an API |

Redux Toolkit (the library is not installed in this lab, so the block is not type-checked):

```tsx norun
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { Provider, useDispatch, useSelector } from 'react-redux';

type WorklistState = { claimIds: string[]; filter: 'all' | 'denied' };

const worklist = createSlice({
  name: 'worklist',
  initialState: { claimIds: [], filter: 'all' } as WorklistState,
  reducers: {
    // Immer lets reducers "mutate" a draft; RTK turns it into an immutable update.
    added(state, action: PayloadAction<string>) {
      state.claimIds.push(action.payload);
    },
    filterChanged(state, action: PayloadAction<WorklistState['filter']>) {
      state.filter = action.payload;
    },
  },
});

export const store = configureStore({ reducer: { worklist: worklist.reducer } });
type RootState = ReturnType<typeof store.getState>;

function Count() {
  // Re-renders only when this selected value changes.
  const n = useSelector((s: RootState) => s.worklist.claimIds.length);
  const dispatch = useDispatch();
  return <button onClick={() => dispatch(worklist.actions.added(crypto.randomUUID()))}>{n} claims</button>;
}

export const App = () => (
  <Provider store={store}>
    <Count />
  </Provider>
);
```

TanStack Query v5 (not installed in this lab, so not type-checked):

```tsx norun
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type Patient = { id: string; name: string };
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } });

function Patients() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: ['patients'],
    queryFn: async (): Promise<Patient[]> => (await fetch('/api/patients')).json(),
  });
  const addPatient = useMutation({
    mutationFn: (name: string) => fetch('/api/patients', { method: 'POST', body: JSON.stringify({ name }) }),
    // After a successful write, mark the list stale so it refetches.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patients'] }),
  });

  if (isPending) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return (
    <>
      <ul>{data.map((p) => <li key={p.id}>{p.name}</li>)}</ul>
      <button onClick={() => addPatient.mutate('New patient')} disabled={addPatient.isPending}>Add</button>
    </>
  );
}

export const App = () => (
  <QueryClientProvider client={queryClient}>
    <Patients />
  </QueryClientProvider>
);
```

Zustand (not installed, not type-checked):

```tsx norun
import { create } from 'zustand';

type SessionStore = { role: 'admin' | 'viewer'; setRole: (r: SessionStore['role']) => void };

export const useSession = create<SessionStore>()((set) => ({
  role: 'viewer',
  setRole: (role) => set({ role }),
}));

export function RoleBadge() {
  const role = useSession((s) => s.role); // selector: re-renders only when role changes
  return <span>{role}</span>;
}
```

## Interview questions

### A React page feels slow. How do you find and fix the problem? {core}

I measure first. I open the React DevTools Profiler, record the slow interaction, and look at which components rendered, how long each took, and why they rendered. Then I apply the cheapest fix: move state down closer to where it is used, pass expensive subtrees as `children`, and only then add `React.memo` with stable props. For long lists I virtualise; for slow first loads I code-split and check the bundle analyser; for laggy typing I use `useDeferredValue` or debounce.

Close with verification: profile again, and watch real-user metrics like INP and LCP. Mention that many slow pages are actually slow network waterfalls, which a query cache and parallel requests fix, not memoization.

### What does React.memo do, and when does it not help? {core}

`React.memo(Component)` makes React skip re-rendering the component when its props are shallowly equal (`Object.is` per prop) to last time. It helps for components that are expensive to render and often receive the same props while their parent re-renders.

It does not help when props change every render anyway: inline objects (`style={{...}}`), arrays, or arrow functions create new references each time, so you need `useMemo`/`useCallback` for those props. It also does not stop re-renders caused by the component's own state or by a context it reads. And for cheap components the comparison can cost more than the render.

### Why can an inline function or object prop break memoization?

Every render creates a new function or object, so its reference is different even if its content is the same. `React.memo` and dependency arrays compare by reference, so they see a "changed" prop every time and re-render or re-run anyway. Wrap the function in `useCallback` and the object in `useMemo` (or hoist constants outside the component) so the reference stays the same between renders. React Compiler does this automatically.

### What is code splitting, and how do React.lazy and Suspense work? {core}

Code splitting breaks the JavaScript bundle into chunks that load on demand, so users download only the code for the screen they visit. `React.lazy(() => import('./Reports'))` returns a component whose code is fetched the first time it renders; while it loads, the component **suspends** and the nearest `<Suspense fallback>` shows its fallback. Split at route boundaries first, then heavy widgets (charts, editors, PDF viewers).

Add an error boundary around lazy content (a chunk can fail to download, for example after a deploy), and consider preloading likely next routes on hover.

### What is list virtualisation?

Rendering only the rows visible in the scroll viewport (plus a small buffer) instead of all of them. A 10,000-row claims table then has only around 30 DOM rows at a time, so initial render, memory and scroll performance stay good. Libraries: TanStack Virtual, react-window. Trade-offs: rows need known or measured heights, browser find-in-page cannot see unrendered rows, and accessibility needs care. Pagination or infinite loading is the alternative when users do not need the whole list at once.

### What is the React Compiler?

React Compiler is a build-time tool, stable at 1.0 since October 2025, that automatically memoizes components and hooks. It analyses your code and caches values, JSX and callbacks only when their inputs change, which removes most of the need for hand-written `useMemo`, `useCallback` and `React.memo`. It assumes the Rules of React (pure render, no mutating props or state), skips code it cannot prove safe, and supports an opt-out directive (`"use no memo"`).

What it does not do: fix bad state placement, network waterfalls or huge bundles.

### How do you decide where a piece of state should live? {core}

I classify it first. Local UI state (an open menu, an input value) stays in the component with `useState`. State shared by a few nearby components is lifted to their common parent. App-wide client state that changes rarely (current user, permissions, theme) goes in context; app-wide state that changes often or has complex rules goes in a store such as Zustand or Redux Toolkit. **Server data** goes in a query cache (TanStack Query or RTK Query), not in a global store. Filters and pagination go in the URL.

The guiding rule: keep state as close as possible to where it is used, and have exactly one source of truth for each piece of data.

### What problems does Redux Toolkit solve compared with classic Redux?

Classic Redux needed a lot of hand-written boilerplate (action types, action creators, switch reducers, immutable spread updates, store setup with middleware). Redux Toolkit is now the official way to write Redux: `configureStore` sets up the store with good defaults (thunk middleware, DevTools, checks for mutation and non-serialisable values), `createSlice` generates action creators and reducers together, Immer lets reducers write "mutating" code safely, `createAsyncThunk` handles async request lifecycles, and **RTK Query** adds a full data-fetching and caching layer.

### Explain the Redux data flow. {core}

There is one store holding the state tree. The UI **dispatches** an action (a plain object describing what happened, like `{ type: 'claims/added', payload }`). The store passes the current state and the action to the **reducer**, a pure function that returns the next state. Subscribed components re-render if the slice they select with `useSelector` changed. Side effects (API calls) live in middleware such as thunks or listeners, never in reducers.

Benefits: predictable, testable updates and time-travel debugging. Cost: more ceremony than local state, which is why not everything should go in Redux.

### When would you choose Redux Toolkit, Zustand or plain Context? {core}

Context for values that change rarely and are read widely (auth user, theme, feature flags); it is dependency injection, not an optimised store, because every consumer re-renders on change. Zustand for simple global client state with minimal boilerplate and selector-based subscriptions. Redux Toolkit for large apps and teams that benefit from strict conventions, middleware, excellent DevTools and RTK Query. For server data, none of these: use TanStack Query or RTK Query.

**Your angle:** your resume lists Redux, Zustand and TanStack Query, so you can say you have used each and pick by the size of the shared state and the team.

### What is TanStack Query, and why use it instead of fetching in useEffect? {core}

TanStack Query is a server-state library: it fetches, caches and synchronises data from an API, keyed by a `queryKey`. Compared with `useEffect` + `useState` fetching, it gives you caching and deduplication (ten components asking for the same patient make one request), background refetching, retries, stale-while-revalidate behaviour, pagination and infinite queries, mutation helpers with cache invalidation and optimistic updates, and it handles race conditions and loading/error states consistently.

The underlying idea: server data is a cache of something you do not own, so it needs freshness rules, not a global store you manually keep in sync.

### What is the difference between staleTime and gcTime in TanStack Query? {deep}

`staleTime` is how long fetched data counts as **fresh**; while fresh, it is served from the cache without refetching. The default is 0, so data is immediately stale and is refetched in the background on triggers like a new component mounting, window refocus or reconnect. `gcTime` (called `cacheTime` before v5) is how long **unused** data stays in memory after the last component using it unmounts; the default is 5 minutes, then it is garbage-collected.

Tune `staleTime` per query: reference data like a payer list can be fresh for minutes; a claim status might need a short staleTime or polling.

### How do you handle mutations, cache invalidation and optimistic updates? {deep}

Use `useMutation` for writes. In `onSuccess`, call `queryClient.invalidateQueries({ queryKey: ['patients'] })` so affected queries refetch, or update the cache directly with `setQueryData` when the response contains the new data. For optimistic updates, in `onMutate` cancel outgoing refetches, snapshot the current cache, write the expected result, and return the snapshot; in `onError` restore it; in `onSettled` invalidate to resync with the server. React 19's `useOptimistic` covers the same idea for Actions without a library.

### What are error boundaries, and what do they not catch? {core}

An error boundary is a component that catches errors thrown while rendering its children (and in their lifecycle methods and constructors), logs them, and shows a fallback instead of unmounting the whole app. It must be a class with `static getDerivedStateFromError` and/or `componentDidCatch`, or you use the `react-error-boundary` package.

They do not catch errors in event handlers, in asynchronous code like `setTimeout` or promise callbacks outside rendering, during server-side rendering, or inside the boundary itself. Place boundaries around independent regions (a widget, a route) so one failure does not blank the page.

### What is the Activity component? {deep}

`<Activity mode="visible" | "hidden">`, added in React 19.2, hides part of the UI while **preserving its state and DOM**. When hidden, React cleans up its effects and gives its updates low priority, and when shown again it restores the state instantly. Use it for tabs, side panels or pre-rendering a screen the user is likely to open next. Before it, you either unmounted (losing state) or hid with CSS (effects kept running).

### How would you improve the initial load time of a React app? {core}

Ship less JavaScript first: code-split by route with `React.lazy` and `Suspense`, lazy-load heavy libraries, remove unused dependencies (check the bundle analyser), and make sure the production build is minified with tree-shaking. Load data in parallel rather than in waterfalls, cache it, and show skeletons. Optimise images (modern formats, correct sizes, lazy loading below the fold), use a CDN with long-lived cache headers for hashed assets, and consider server rendering for content pages.

**Your angle:** on myMedidata you and your team used lazy loading and better state management to reduce initial load times. Explain what you lazy-loaded (route-level screens and heavy components) and how you verified the improvement.

### Debounce versus throttle: what is the difference? {core}

Debounce waits until events **stop** for a set time and then runs once: a search box that queries the API 300 ms after the user stops typing. Throttle runs at most once per interval **while events continue**: tracking scroll position or window resize every 100 ms. In React, implement debounce with a timeout in an effect plus cleanup (a `useDebouncedValue` hook), or use `useDeferredValue` when the goal is keeping rendering responsive rather than reducing network calls.

### What are Core Web Vitals? {deep}

Google's three user-experience metrics measured from real users: **LCP** (Largest Contentful Paint, loading: under 2.5 s is good), **INP** (Interaction to Next Paint, responsiveness: under 200 ms is good; it replaced First Input Delay in March 2024), and **CLS** (Cumulative Layout Shift, visual stability: under 0.1 is good). In React apps, INP suffers from long renders on input (fix with smaller re-renders and transitions), LCP from large bundles and late data, and CLS from content without reserved space.

### What is a memoized selector, and why does it matter? {deep}

A selector derives data from the store (`state => state.claims.filter(c => c.denied)`). If it returns a new array every time, `useSelector` sees a new reference on every store update and re-renders the component even when nothing relevant changed. A memoized selector (Reselect's `createSelector`, re-exported by Redux Toolkit) recomputes only when its inputs change and otherwise returns the same reference. Selecting primitive values or small slices has the same effect.

### Is Context a state-management solution?

Not by itself. Context is a way to **pass** a value down the tree without props; the state still lives in a `useState` or `useReducer` in the provider. Combined that way it works well for small amounts of rarely changing global state. It lacks selectors, so any change re-renders every consumer, and it has no built-in devtools, middleware or caching. For frequently updated global state use a store; for server data use a query cache.
