---
title: State management and client-side caching
goal: Decide where every kind of state belongs, and use Context, Redux Toolkit (with RTK Query), Zustand and TanStack Query correctly, including caching, invalidation, optimistic updates and pushing socket events into the cache.
minutes: 55
---

"Deep familiarity with state management and client-side caching" is written into the JD's first required qualification. Expect two kinds of question: **design** ("where would this state live, and why?") and **mechanics** ("what is the difference between `staleTime` and `gcTime`?", "how do you roll back an optimistic update?", "how do WebSocket events get into the cache?").

The strongest answers start by classifying the state, because the right tool follows from the kind of state. An agent console has all of them at once: server data (runs, agents, approvals), fast-changing pushed data (run status, streaming tokens), UI state (open panels, the selected run), URL state (filters) and form state (the prompt being typed).

## Kinds of state, and where each belongs

| Kind | Example on this platform | Best home |
|---|---|---|
| Local UI state | an expanded tool call, a hover card | `useState` / `useReducer` in the component |
| Shared client state | current user and roles, theme, which run is selected, a multi-step wizard | Context (rarely changing) or a store: Zustand, Redux Toolkit |
| **Server state** | runs, agents, approvals, audit history | a query cache: TanStack Query or RTK Query, not a hand-synced store |
| **Pushed state** | run status, step events, telemetry over SSE or WebSocket | written into the query cache (`setQueryData`, `updateCachedData`) or an external store |
| Streaming text | tokens of the assistant reply | a ref or a small external store, flushed to React at frame rate; never one store action per token |
| URL state | filters, page, selected tab, run ID | the URL (path and search params), so it survives reloads and can be shared |
| Form state | the prompt being typed, field errors | local state, React 19 form Actions, or react-hook-form for complex forms |

## Choosing a tool

| | Context | Redux Toolkit | Zustand | TanStack Query | RTK Query |
|---|---|---|---|---|---|
| Purpose | Dependency injection of a value | Predictable global client state | Lightweight global client state | Server-state cache | Server-state cache inside Redux |
| Re-renders | every consumer on any change | only components whose selected slice changed | only components whose selected slice changed | per query observer | per selected endpoint result |
| Boilerplate | very low | moderate (slices, store, provider) | very low | low | moderate (an API definition) |
| Devtools | none | excellent, with time travel | via middleware | its own devtools | Redux DevTools |
| Async | DIY | `createAsyncThunk` | DIY in actions | built in: caching, dedupe, retries, invalidation | built in, with tags |
| Pick it when | values change rarely | large team, complex shared logic, auditability, already on Redux | small or medium apps, simple global state, stores used outside React | any app that talks to APIs | the app already uses Redux |

A typical modern stack: **TanStack Query for server state, Zustand or a little Context for client state, the URL for filters**. In a codebase already on Redux, RTK Query plays the TanStack role.

## Context done right

Context is for values read widely that change rarely. Split state from actions so components that only act do not re-render, and memoise the value object.

```tsx
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

type Session = { user: string; roles: readonly string[] };
type SessionActions = { signOut: () => void; switchTenant: (tenant: string) => void };

const SessionContext = createContext<Session | null>(null);
const SessionActionsContext = createContext<SessionActions | null>(null);

export function SessionProvider({ initial, children }: { initial: Session; children: ReactNode }) {
  const [session, setSession] = useState(initial);
  // Stable actions object: consumers of actions never re-render because the session changed.
  const actions = useMemo<SessionActions>(
    () => ({
      signOut: () => setSession({ user: 'anonymous', roles: [] }),
      switchTenant: (tenant) => setSession((s) => ({ ...s, roles: s.roles.filter((r) => r.startsWith(tenant)) })),
    }),
    [],
  );
  return (
    <SessionContext value={session}>
      <SessionActionsContext value={actions}>{children}</SessionActionsContext>
    </SessionContext>
  );
}

export function useHasRole(role: string): boolean {
  const session = use(SessionContext);
  if (!session) throw new Error('useHasRole needs <SessionProvider>');
  return session.roles.includes(role);
}

export function SignOutButton() {
  const actions = use(SessionActionsContext);
  return <button onClick={actions?.signOut}>Sign out</button>;
}
```

## Redux Toolkit

Redux Toolkit (RTK) is the official way to write Redux. `configureStore` sets up DevTools, thunks and development checks; `createSlice` generates the reducer and action creators together; Immer lets reducers write "mutating" code that produces immutable updates; `createEntityAdapter` keeps collections **normalised** (`ids` plus `entities` by ID) with ready-made CRUD reducers and selectors; `createSelector` memoises derived data.

```ts
import assert from 'node:assert/strict';
import {
  configureStore,
  createAsyncThunk,
  createEntityAdapter,
  createSelector,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';

type RunStatus = 'queued' | 'running' | 'waiting_approval' | 'done' | 'failed';
type Run = { id: string; agent: string; status: RunStatus };

// A fake API so the example runs without a server.
const db: Run[] = [
  { id: 'r1', agent: 'triage', status: 'running' },
  { id: 'r2', agent: 'procurement', status: 'waiting_approval' },
  { id: 'r3', agent: 'triage', status: 'done' },
];
export const fetchRuns = createAsyncThunk('runs/fetchAll', async () => {
  await new Promise((r) => setTimeout(r, 5));
  return structuredClone(db);
});

const runsAdapter = createEntityAdapter<Run>();

const runsSlice = createSlice({
  name: 'runs',
  initialState: runsAdapter.getInitialState({ loading: 'idle' as 'idle' | 'pending' | 'failed', error: null as string | null }),
  reducers: {
    runUpserted: runsAdapter.upsertOne, // a socket "run updated" message lands here
    statusChanged(state, action: PayloadAction<{ id: string; status: RunStatus }>) {
      const run = state.entities[action.payload.id];
      if (run) run.status = action.payload.status; // Immer: reads like mutation, produces a new state
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRuns.pending, (state) => {
        state.loading = 'pending';
      })
      .addCase(fetchRuns.fulfilled, (state, action) => {
        state.loading = 'idle';
        runsAdapter.setAll(state, action.payload);
      })
      .addCase(fetchRuns.rejected, (state, action) => {
        state.loading = 'failed';
        state.error = action.error.message ?? 'Request failed';
      });
  },
});

export const { runUpserted, statusChanged } = runsSlice.actions;
export const store = configureStore({ reducer: { runs: runsSlice.reducer } });
type RootState = ReturnType<typeof store.getState>;

const runSelectors = runsAdapter.getSelectors((s: RootState) => s.runs);
// Memoised: returns the SAME array until the runs actually change, so useSelector does not re-render needlessly.
export const selectActiveRuns = createSelector([runSelectors.selectAll], (runs) =>
  runs.filter((r) => r.status !== 'done' && r.status !== 'failed'),
);

await store.dispatch(fetchRuns());
assert.equal(store.getState().runs.loading, 'idle');
assert.deepEqual(store.getState().runs.ids, ['r1', 'r2', 'r3']);

const active1 = selectActiveRuns(store.getState());
assert.deepEqual(active1.map((r) => r.id), ['r1', 'r2']);
assert.equal(selectActiveRuns(store.getState()), active1); // same reference: nothing changed

store.dispatch(statusChanged({ id: 'r1', status: 'done' }));
store.dispatch(runUpserted({ id: 'r4', agent: 'billing', status: 'queued' }));
const active2 = selectActiveRuns(store.getState());
assert.notEqual(active2, active1);
assert.deepEqual(active2.map((r) => r.id), ['r2', 'r4']);
assert.equal(runSelectors.selectById(store.getState(), 'r1')?.status, 'done');
```

In components, use typed hooks so every `useSelector` knows the state shape:

```tsx
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { Provider, useDispatch, useSelector } from 'react-redux';

const ui = createSlice({
  name: 'ui',
  initialState: { selectedRunId: null as string | null, logsOpen: false },
  reducers: {
    runSelected(state, action: PayloadAction<string>) {
      state.selectedRunId = action.payload;
    },
    logsToggled(state) {
      state.logsOpen = !state.logsOpen;
    },
  },
});

const store = configureStore({ reducer: { ui: ui.reducer } });
type RootState = ReturnType<typeof store.getState>;
type AppDispatch = typeof store.dispatch;

// react-redux 9.1+: typed hooks without hand-written wrappers.
const useAppSelector = useSelector.withTypes<RootState>();
const useAppDispatch = useDispatch.withTypes<AppDispatch>();

function LogsToggle() {
  const open = useAppSelector((s) => s.ui.logsOpen); // re-renders only when this boolean changes
  const dispatch = useAppDispatch();
  return (
    <button aria-expanded={open} onClick={() => dispatch(ui.actions.logsToggled())}>
      Logs
    </button>
  );
}

export function App() {
  return (
    <Provider store={store}>
      <LogsToggle />
    </Provider>
  );
}
```

### RTK Query: server state inside Redux

RTK Query generates hooks and cache logic from an endpoint definition. Queries **provide** tags, mutations **invalidate** them, and invalidated queries with active subscribers refetch. Optimistic updates use `onQueryStarted`: patch the cached data, and undo the patch if the request fails. This example uses a `queryFn` against an in-memory fake so it runs without a server; in an app you would use `fetchBaseQuery({ baseUrl: '/api' })`.

```ts
import assert from 'node:assert/strict';
import { configureStore } from '@reduxjs/toolkit';
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query';

type Run = { id: string; status: 'running' | 'cancelled' | 'done' };
const db = new Map<string, Run>([
  ['r1', { id: 'r1', status: 'running' }],
  ['r2', { id: 'r2', status: 'done' }],
]);

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fakeBaseQuery<{ message: string }>(),
  tagTypes: ['Run'],
  keepUnusedDataFor: 0, // drop unused cache entries at once (the default is 60 seconds)
  endpoints: (build) => ({
    getRuns: build.query<Run[], void>({
      queryFn: async () => ({ data: [...db.values()].map((r) => ({ ...r })) }),
      providesTags: (result = []) => [...result.map((r) => ({ type: 'Run' as const, id: r.id })), { type: 'Run', id: 'LIST' }],
    }),
    cancelRun: build.mutation<Run, string>({
      queryFn: async (id) => {
        const run = db.get(id);
        if (!run || run.status !== 'running') return { error: { message: `Run ${id} is not running` } };
        run.status = 'cancelled';
        return { data: { ...run } };
      },
      // Optimistic update: show "cancelled" at once, undo if the server says no.
      async onQueryStarted(id, { dispatch, queryFulfilled }) {
        const patch = dispatch(
          api.util.updateQueryData('getRuns', undefined, (draft) => {
            const run = draft.find((r) => r.id === id);
            if (run) run.status = 'cancelled';
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      // Invalidate only on success: a refetch triggered by a failed write can land after the next
      // optimistic patch and overwrite it.
      invalidatesTags: (_result, error, id) => (error ? [] : [{ type: 'Run', id }]),
    }),
  }),
});

const store = configureStore({
  reducer: { [api.reducerPath]: api.reducer },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});
const cached = () => api.endpoints.getRuns.select()(store.getState()).data;

const sub = store.dispatch(api.endpoints.getRuns.initiate());
await sub;
assert.deepEqual(cached()?.map((r) => r.status), ['running', 'done']);

// r2 is already done: the server rejects, and the optimistic patch is rolled back.
const failed = await store.dispatch(api.endpoints.cancelRun.initiate('r2'));
assert.ok('error' in failed);
assert.equal(cached()?.find((r) => r.id === 'r2')?.status, 'done');

// r1 succeeds: the patch stays, and the invalidated tag triggers a refetch that confirms it.
await store.dispatch(api.endpoints.cancelRun.initiate('r1'));
assert.equal(cached()?.find((r) => r.id === 'r1')?.status, 'cancelled');
await Promise.all(store.dispatch(api.util.getRunningQueriesThunk()));
assert.equal(cached()?.find((r) => r.id === 'r1')?.status, 'cancelled');

sub.unsubscribe();
store.dispatch(api.util.resetApiState());
```

For **pushed** data, RTK Query has `onCacheEntryAdded`: open a WebSocket when the first component subscribes to a cache entry, patch the entry as messages arrive, and close the socket when the last subscriber leaves.

```tsx
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

type Step = { seq: number; runId: string; text: string };

export const runsApi = createApi({
  baseQuery: fetchBaseQuery({ baseUrl: '/api' }),
  endpoints: (build) => ({
    getSteps: build.query<Step[], string>({
      query: (runId) => `runs/${runId}/steps`,
      async onCacheEntryAdded(runId, { updateCachedData, cacheDataLoaded, cacheEntryRemoved }) {
        const ws = new WebSocket(`wss://example.invalid/runs/${runId}/events`);
        try {
          await cacheDataLoaded; // apply live events on top of the initial snapshot
          ws.addEventListener('message', (e: MessageEvent<string>) => {
            const step = JSON.parse(e.data) as Step;
            updateCachedData((draft) => {
              if (!draft.some((s) => s.seq === step.seq)) draft.push(step); // ignore duplicates after a reconnect
            });
          });
        } catch {
          // the entry was removed before the first fetch finished
        }
        await cacheEntryRemoved; // last subscriber unmounted
        ws.close();
      },
    }),
  }),
});

export const { useGetStepsQuery } = runsApi;

export function StepList({ runId }: { runId: string }) {
  const { data = [], isLoading } = useGetStepsQuery(runId);
  if (isLoading) return <p>Loading steps…</p>;
  return (
    <ol>
      {data.map((s) => (
        <li key={s.seq}>{s.text}</li>
      ))}
    </ol>
  );
}
```

## Zustand

Zustand is a tiny store built on the same idea as `useSyncExternalStore`: state plus actions in a closure, subscribed to with **selectors**. Its vanilla store works outside React, which is handy when a socket client, not a component, is the one writing updates.

```ts
import assert from 'node:assert/strict';
import { createStore } from 'zustand/vanilla';

type Status = 'connecting' | 'open' | 'reconnecting' | 'closed';
type LiveState = {
  connection: Status;
  lastSeq: number;
  statusByRun: Record<string, string>;
  setConnection: (s: Status) => void;
  applyEvent: (e: { seq: number; runId: string; status: string }) => void;
};

export const liveStore = createStore<LiveState>()((set) => ({
  connection: 'connecting',
  lastSeq: 0,
  statusByRun: {},
  setConnection: (connection) => set({ connection }), // shallow merge, like setState in classes
  applyEvent: (e) =>
    set((s) =>
      e.seq <= s.lastSeq
        ? s // duplicate or old event: return the same state, so nobody is notified
        : { lastSeq: e.seq, statusByRun: { ...s.statusByRun, [e.runId]: e.status } },
    ),
}));

const seen: string[] = [];
const unsubscribe = liveStore.subscribe((state, prev) => {
  if (state.connection !== prev.connection) seen.push(state.connection);
});

// A socket client (not React) drives the store.
liveStore.getState().setConnection('open');
liveStore.getState().applyEvent({ seq: 1, runId: 'r1', status: 'running' });
liveStore.getState().applyEvent({ seq: 1, runId: 'r1', status: 'running' }); // replayed after reconnect
liveStore.getState().applyEvent({ seq: 2, runId: 'r1', status: 'waiting_approval' });
unsubscribe();

assert.deepEqual(seen, ['open']);
assert.equal(liveStore.getState().lastSeq, 2);
assert.deepEqual(liveStore.getState().statusByRun, { r1: 'waiting_approval' });
```

In React, `create` returns a hook. Select the smallest value you need; when a selector returns a new object or array, wrap it in `useShallow` (Zustand 5 compares selector results with `Object.is`, so an unwrapped object selector re-renders on every store change and can even loop).

```tsx
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

type Panels = {
  selectedRunId: string | null;
  logsOpen: boolean;
  telemetryOpen: boolean;
  select: (id: string) => void;
  toggleLogs: () => void;
};

export const usePanels = create<Panels>()((set) => ({
  selectedRunId: null,
  logsOpen: false,
  telemetryOpen: true,
  select: (selectedRunId) => set({ selectedRunId }),
  toggleLogs: () => set((s) => ({ logsOpen: !s.logsOpen })),
}));

export function SelectedRun() {
  const id = usePanels((s) => s.selectedRunId); // a primitive: re-renders only when it changes
  return <p>{id ?? 'No run selected'}</p>;
}

export function PanelToggles() {
  // Two fields at once: useShallow compares the object's fields instead of its reference.
  const { logsOpen, toggleLogs } = usePanels(useShallow((s) => ({ logsOpen: s.logsOpen, toggleLogs: s.toggleLogs })));
  return (
    <button aria-pressed={logsOpen} onClick={toggleLogs}>
      Logs
    </button>
  );
}
```

Middleware worth naming: `persist` (save to localStorage), `devtools` (Redux DevTools), `immer` (mutating syntax), `subscribeWithSelector` (subscribe to one slice outside React).

## TanStack Query 5

TanStack Query treats server data as a **cache of something you do not own**: each entry is keyed by a `queryKey`, has freshness rules, and is shared by every component that asks for the same key.

| Concept | What it means | Default |
|---|---|---|
| `queryKey` | the cache key, an array; hierarchical so `['runs']` matches `['runs', 'r1']` when invalidating | — |
| `staleTime` | how long data counts as fresh; fresh data is served without refetching | `0` (immediately stale); `'static'` means never stale |
| `gcTime` | how long an **unused** entry stays in memory after its last observer unmounts | 5 minutes in the browser, `Infinity` on the server |
| refetch triggers | a new observer mounts, the window regains focus, the network reconnects (for stale data) | all on |
| `retry` | failed queries retry with exponential backoff | 3 in the browser, 0 on the server |
| `isPending` / `isFetching` | `isPending`: no data yet; `isFetching`: a request is in flight (also during background refetches) | — |
| `placeholderData: keepPreviousData` | keep showing the previous page while the next one loads | — |

The cache itself is plain TypeScript, so its behaviour can be shown in Node: deduplication, staleness, prefix invalidation, pushed updates and an optimistic mutation with rollback. The example uses `queryClient.query()`, which recent 5.x releases (5.104 here) introduced to replace the now-deprecated `fetchQuery`, `prefetchQuery` and `ensureQueryData`; the old names still work and you will see them in most codebases.

```ts
import assert from 'node:assert/strict';
import { MutationObserver, QueryClient } from '@tanstack/react-query';

type Run = { id: string; status: string };

// A key factory keeps keys consistent across the app.
const runKeys = {
  all: ['runs'] as const,
  detail: (id: string) => ['runs', 'detail', id] as const,
};

let calls = 0;
const server: Record<string, Run> = { r1: { id: 'r1', status: 'running' } };
const fetchRun = async (id: string): Promise<Run> => {
  calls++;
  await new Promise((r) => setTimeout(r, 5));
  return { ...server[id] };
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// 1. Deduplication: two callers at the same time share one request.
const [a, b] = await Promise.all([
  queryClient.query({ queryKey: runKeys.detail('r1'), queryFn: () => fetchRun('r1') }),
  queryClient.query({ queryKey: runKeys.detail('r1'), queryFn: () => fetchRun('r1') }),
]);
assert.equal(calls, 1);
assert.deepEqual(a, b);

// 2. Freshness: within staleTime the cache answers; with the default staleTime of 0 it refetches.
await queryClient.query({ queryKey: runKeys.detail('r1'), queryFn: () => fetchRun('r1'), staleTime: 60_000 });
assert.equal(calls, 1);
await queryClient.query({ queryKey: runKeys.detail('r1'), queryFn: () => fetchRun('r1') });
assert.equal(calls, 2);

// 3. A pushed event (from SSE or a WebSocket) updates the cache directly: no refetch needed.
queryClient.setQueryData<Run>(runKeys.detail('r1'), (old) => (old ? { ...old, status: 'waiting_approval' } : old));
assert.equal(queryClient.getQueryData<Run>(runKeys.detail('r1'))?.status, 'waiting_approval');

// 4. Invalidation matches by prefix: ['runs'] marks every run query stale.
await queryClient.invalidateQueries({ queryKey: runKeys.all });
assert.equal(queryClient.getQueryState(runKeys.detail('r1'))?.isInvalidated, true);

// 5. Optimistic update with rollback.
const cancel = new MutationObserver(queryClient, {
  mutationFn: async (id: string) => {
    await new Promise((r) => setTimeout(r, 5));
    throw new Error(`Run ${id} already finished`); // the server refuses
  },
  onMutate: async (id: string) => {
    await queryClient.cancelQueries({ queryKey: runKeys.detail(id) }); // a late refetch must not overwrite us
    const previous = queryClient.getQueryData<Run>(runKeys.detail(id));
    queryClient.setQueryData<Run>(runKeys.detail(id), (old) => (old ? { ...old, status: 'cancelled' } : old));
    return { previous };
  },
  onError: (_error, id, context) => {
    queryClient.setQueryData(runKeys.detail(id), context?.previous); // roll back
  },
});
await cancel.mutate('r1').catch(() => undefined);
assert.equal(queryClient.getQueryData<Run>(runKeys.detail('r1'))?.status, 'waiting_approval');

queryClient.clear();
```

The same ideas in components: `queryOptions` keeps the key and fetcher together and typed, `useMutation` handles writes, and an effect bridges a WebSocket into the cache.

```tsx
import {
  QueryClient,
  QueryClientProvider,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Suspense, useEffect } from 'react';

type Run = { id: string; agent: string; status: string };

const runQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', 'detail', id],
    queryFn: async ({ signal }): Promise<Run> => {
      const res = await fetch(`/api/runs/${id}`, { signal }); // aborted automatically if no longer needed
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 10_000,
  });

function useRunEvents(id: string) {
  const queryClient = useQueryClient();
  useEffect(() => {
    const source = new EventSource(`/api/runs/${id}/events`);
    source.addEventListener('status', (e: MessageEvent<string>) => {
      const { status } = JSON.parse(e.data) as { status: string };
      queryClient.setQueryData(runQuery(id).queryKey, (old) => (old ? { ...old, status } : old)); // typed by queryOptions
    });
    return () => source.close();
  }, [id, queryClient]);
}

function RunCard({ id }: { id: string }) {
  const { data, isPending, error } = useQuery(runQuery(id));
  useRunEvents(id);
  const queryClient = useQueryClient();
  const approve = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/runs/${id}/approve`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`); // fetch resolves on 4xx/5xx: make it a mutation error
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['runs'] }), // resync after the write
  });

  if (isPending) return <p>Loading…</p>;
  if (error) return <p role="alert">{error.message}</p>;
  return (
    <article>
      <h3>
        {data.agent}: {data.status}
      </h3>
      {data.status === 'waiting_approval' && (
        <button onClick={() => approve.mutate()} disabled={approve.isPending}>
          {approve.isPending ? 'Approving…' : 'Approve'}
        </button>
      )}
    </article>
  );
}

// Suspense mode: data is always defined; loading goes to <Suspense>, errors to an error boundary.
function RunTitle({ id }: { id: string }) {
  const { data } = useSuspenseQuery(runQuery(id));
  return <h2>{data.agent}</h2>;
}

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={<p>Loading title…</p>}>
        <RunTitle id="r1" />
      </Suspense>
      <RunCard id="r1" />
    </QueryClientProvider>
  );
}
```

## URL state

Filters, the selected tab and pagination belong in the URL: they survive a reload, work with the back button, and can be pasted into a ticket. Parse and serialise them in one place, and validate what you read, because users edit URLs.

```ts
import assert from 'node:assert/strict';

type Filters = { status: 'all' | 'running' | 'failed'; agent?: string; page: number };
const STATUSES = ['all', 'running', 'failed'] as const;

export function parseFilters(search: string): Filters {
  const p = new URLSearchParams(search);
  const status = (STATUSES as readonly string[]).includes(p.get('status') ?? '') ? (p.get('status') as Filters['status']) : 'all';
  const page = Math.max(1, Number.parseInt(p.get('page') ?? '1', 10) || 1);
  const agent = p.get('agent') || undefined;
  return { status, page, ...(agent ? { agent } : {}) };
}

export function toSearch(f: Filters): string {
  const p = new URLSearchParams();
  if (f.status !== 'all') p.set('status', f.status); // omit defaults: shorter, canonical URLs
  if (f.agent) p.set('agent', f.agent);
  if (f.page > 1) p.set('page', String(f.page));
  const s = p.toString();
  return s ? `?${s}` : '';
}

assert.deepEqual(parseFilters('?status=failed&page=3&agent=triage'), { status: 'failed', page: 3, agent: 'triage' });
assert.deepEqual(parseFilters('?status=bogus&page=-2'), { status: 'all', page: 1 }); // hostile input falls back
assert.equal(toSearch({ status: 'all', page: 1 }), '');
assert.equal(toSearch(parseFilters('?page=2&status=running')), '?status=running&page=2');
```

## Interview questions

### How do you decide where a piece of state should live? {core}

I classify it first. Local UI state (an open menu, an expanded tool call) stays in the component. State shared by a few nearby components is lifted to their common parent. App-wide client state that changes rarely (current user, roles, theme) goes in context; app-wide state that changes often or has complex rules goes in a store such as Zustand or Redux Toolkit. **Server data** goes in a query cache (TanStack Query or RTK Query), not a hand-synced global store. Filters and pagination go in the URL.

The test I apply: who owns the truth? If the server owns it, the client holds a cache with freshness rules. If the user owns it for this session, it is client state. If it must survive a reload or be shareable, it is URL state.

### What is the difference between server state and client state, and why does it matter? {core}

Client state is owned by the browser session: which panel is open, the selected run, a draft prompt. It is synchronous and always up to date. Server state is owned elsewhere and the client only has a **snapshot** that can go stale: other users change it, background jobs change it, agents change it. It needs caching, deduplication, refetching, invalidation after writes, retries, and loading and error states.

Putting server data in Redux or Context by hand means reimplementing all of that badly, which is the main reason TanStack Query and RTK Query exist. Once server state moves to a query cache, the remaining global client state is usually small.

### When would you choose Redux Toolkit, Zustand or plain Context? {core}

Context for values that change rarely and are read widely (session, theme, feature flags); it is dependency injection, not an optimised store, because every consumer re-renders on change. Zustand for simple global client state with minimal boilerplate and selector-based subscriptions, especially when code outside React (a socket client) must read or write it. Redux Toolkit for large apps and teams that benefit from strict conventions, middleware, excellent DevTools and RTK Query, or when the codebase is already on Redux.

**Your angle:** your resume lists Redux, Zustand and TanStack Query; at Medidata you used React with Redux and Hooks on myMedidata, and worked with the team on lazy loading and improved state management that reduced initial load times. Pick by the size of the shared state and the team, and say what you would put in each.

### Explain the Redux data flow. {core}

The UI dispatches an **action**, a plain object describing what happened (`{ type: 'runs/statusChanged', payload: … }`). The store passes the current state and the action to the root **reducer**, a pure function that returns the next state without mutating the old one. The store saves the new state and notifies subscribers; components using `useSelector` re-run their selectors and re-render only if the selected value changed. Side effects such as API calls live in thunks, listeners or RTK Query, never in reducers.

The benefits are predictable, testable updates, a single place to see every change, and time-travel debugging. The cost is ceremony, which is why not everything belongs in Redux.

### What does Redux Toolkit fix compared with classic Redux?

Classic Redux needed hand-written action types, action creators, switch reducers, careful immutable spreads, and manual store setup. Redux Toolkit is now the official way to write Redux: `configureStore` sets up DevTools, thunks and checks for accidental mutation and non-serialisable values; `createSlice` generates actions and reducers together; Immer lets reducers write mutating code safely; `createAsyncThunk` handles pending/fulfilled/rejected; `createEntityAdapter` normalises collections; and RTK Query adds a full caching layer. RTK 2 also removed the object form of `extraReducers` in favour of the builder callback.

### What is TanStack Query, and why use it instead of fetching in useEffect? {core}

TanStack Query is a server-state library: it fetches, caches and synchronises API data keyed by a `queryKey`. Compared with `useEffect` plus `useState`, it gives you caching and deduplication (ten components asking for the same run make one request), background refetching, retries with backoff, stale-while-revalidate behaviour, request cancellation through `signal`, pagination and infinite queries, mutations with invalidation and optimistic updates, and consistent loading and error states without race conditions.

The idea behind it: server data is a cache of something you do not own, so it needs freshness rules, not a store you keep in sync manually.

### What is the difference between staleTime and gcTime? {core}

`staleTime` is how long fetched data counts as **fresh**. While fresh, it is served from the cache with no request. The default is 0, so data is stale immediately and refetched in the background when a new observer mounts, the window regains focus, or the network reconnects. `gcTime` (called `cacheTime` before v5) is how long **unused** data stays in memory after the last observer unmounts: 5 minutes by default in the browser, then it is garbage-collected.

Tune `staleTime` per query: an agent catalogue can be fresh for minutes, a run's status might be kept fresh by pushed events instead of refetches. If `gcTime` is shorter than you expect, navigating back shows a spinner instead of cached data.

### How do you handle mutations, invalidation and optimistic updates in TanStack Query? {core}

Use `useMutation` for writes. In `onSuccess` or `onSettled`, call `invalidateQueries` with a key prefix so affected queries refetch, or write the server's response straight into the cache with `setQueryData`. For an optimistic update: in `onMutate`, cancel in-flight queries for that key (so a late response cannot overwrite you), snapshot the current data, write the expected result, and return the snapshot as context; in `onError`, restore the snapshot; in `onSettled`, invalidate to resync with the server.

For simple cases, v5 also lets you render the pending mutation's `variables` in the UI instead of touching the cache. React 19's `useOptimistic` covers the same idea for Actions without a library.

### How do WebSocket or SSE events get into the query cache? {core}

Keep one connection per stream (in a hook, a provider, or RTK Query's `onCacheEntryAdded`), and translate each message into a cache write. Small, self-contained events patch the cached entity with `setQueryData` (or `updateCachedData` in RTK Query); events that are hard to apply locally, or that affect many queries, call `invalidateQueries` so the cache refetches. Apply events in order using a sequence number, ignore duplicates after a reconnect, and refetch a fresh snapshot if you detect a gap.

This keeps one source of truth: components keep using `useQuery`, and pushed updates and refetches land in the same place. Set a longer `staleTime` for queries that are kept fresh by pushes, so focus refetches do not fight the stream.

### Where would you keep the streaming tokens of an LLM reply? {deep}

Not in Redux or a query cache, one action per token. Tokens arrive tens of times a second; dispatching each one floods DevTools, runs every selector and re-renders more than needed. I buffer incoming text in a ref (or a tiny external store), flush it into component state on `requestAnimationFrame` or every few dozen milliseconds, and render only the message that is streaming, so the other messages, memoised by ID, do not re-render. When the stream ends, I write the final message into the conversation cache once.

That keeps the UI smooth and the global state meaningful: the store records that a message was completed, not every intermediate token.

### What is normalisation, and when is it worth it? {deep}

Normalisation stores each entity once, by ID (`{ ids: [...], entities: { r1: {...} } }`), and other data refers to it by ID, like tables in a database. Then an update to run `r1`, from a socket event for example, changes one place and every list showing it stays consistent, and lookups by ID are O(1). Redux Toolkit's `createEntityAdapter` gives you this shape with CRUD reducers and selectors.

It is worth it when the same entity appears in several places or updates arrive individually. A query cache keyed by request is usually enough when each screen shows its own data; RTK Query and TanStack Query deliberately cache by request rather than normalising.

### What is a memoised selector, and why does it matter? {core}

A selector derives data from the store (`state => state.runs.filter(r => r.status === 'failed')`). If it returns a new array on every call, `useSelector` sees a new reference after every store update and re-renders the component even when nothing relevant changed. A memoised selector (`createSelector`, which Redux Toolkit re-exports from Reselect) recomputes only when its inputs change and otherwise returns the same reference.

Selecting primitives or existing objects has the same effect. In Zustand 5, use `useShallow` when a selector returns a new object or array.

### Why can a Zustand selector cause an infinite render loop? {deep}

Zustand 5's hook is built on `useSyncExternalStore` and compares selector results with `Object.is`. A selector like `(s) => ({ a: s.a, b: s.b })` or `(s) => s.items.filter(...)` returns a new reference on every call, so React thinks the snapshot changed every time it checks, re-renders, and can end in "Maximum update depth exceeded". Fix it with `useShallow` (which compares the fields), by selecting primitives separately, or by keeping derived data in the store or memoising it outside the selector.

### Is Context a state-management solution?

Not by itself. Context is a way to **pass** a value down the tree without props; the state still lives in a `useState` or `useReducer` in the provider. That combination works well for small amounts of rarely changing global state. Context has no selectors, so any change re-renders every consumer, and no devtools, middleware or caching. For frequently updated global state use a store; for server data use a query cache.

### How do query keys work, and why use a key factory? {deep}

A query key is an array that identifies a cache entry; the query function should depend only on what is in the key. Keys are hashed deterministically (object key order does not matter), and matching for invalidation is by **prefix** by default, so `invalidateQueries({ queryKey: ['runs'] })` hits `['runs', 'detail', 'r1']` and `['runs', 'list', { status: 'failed' }]` (add `exact: true` for one entry). A key factory, an object with functions such as `runKeys.detail(id)`, keeps keys consistent across the app, so invalidations do not miss because of a typo. `queryOptions` goes one step further and carries the key, fetcher and types together.

### How do you handle pagination and infinite scrolling with TanStack Query? {deep}

For classic pages, put the page or cursor in the key (`['runs', { page }]`) and use `placeholderData: keepPreviousData` so the old page stays visible while the next loads. For infinite lists such as a run's log history, `useInfiniteQuery` takes `initialPageParam` (required in v5) and `getNextPageParam` (return `undefined` when there are no more pages), and stores `data.pages`; call `fetchNextPage` when a sentinel element scrolls into view. Prefer cursor (keyset) pagination on the server, because offsets skip or repeat rows while new log lines are being inserted.

### What does RTK Query offer, and how do tags work? {deep}

RTK Query is Redux Toolkit's data-fetching layer: you declare endpoints in `createApi` and it generates hooks (`useGetRunsQuery`), a cache in the Redux store keyed by endpoint and arguments (not normalised), deduplication, polling, `keepUnusedDataFor` (60 seconds by default), and cache lifecycle hooks. Tags connect reads and writes: a query **provides** tags such as `{ type: 'Run', id: 'r1' }`, a mutation **invalidates** tags, and any active query providing an invalidated tag refetches. Optimistic updates use `onQueryStarted` with `updateQueryData` and `patch.undo()`, and streaming updates use `onCacheEntryAdded`.

One trap worth mentioning: `invalidatesTags` also runs when the mutation **fails with a returned error** (an HTTP error from `fetchBaseQuery`, or `{ error }` from a `queryFn`), unless the function form returns `[]` on error. The refetch it triggers can arrive after the user's next optimistic patch and overwrite it: a real race, reproduced while testing this chapter's example, which is why it limits invalidation to successful writes.

Choose it when the app already uses Redux; otherwise TanStack Query is the more common choice.

### How do you prefetch data, and why? {deep}

Prefetching loads data before the user needs it, so the next screen renders instantly from the cache. With TanStack Query, call `queryClient.prefetchQuery(runQuery(id))` (in the newest 5.x releases, `queryClient.query(runQuery(id)).catch(() => {})`, since `prefetchQuery` is deprecated there) on hover or focus of a link, in a route loader, or right after a list loads for the first few items. It respects `staleTime`, so it does nothing if fresh data is already cached. Combine it with code splitting: preload the lazy component's chunk and its data together.

### How would you test code that uses these libraries? {deep}

Test reducers, selectors and stores as plain functions: dispatch actions and assert on state, no React needed, as in this chapter's examples. For components using TanStack Query, render them inside a fresh `QueryClient` per test with `retry: false`, and mock the network with MSW so the real fetch logic runs. For Redux, create a real store per test (with preloaded state) rather than mocking `useSelector`. For socket-fed caches, push fake messages into the bridge and assert on the rendered output.

## Coding problems

### Normalise a nested API response {easy core}

The API returns runs with their steps nested inside. Convert it to a normalised shape: `{ runs: { ids, entities }, steps: { ids, entities } }`, where each run keeps `stepIds` instead of the step objects. Duplicate steps (same ID) must appear once.

```text
input:  [{ id: 'r1', agent: 'triage', steps: [{ id: 's1', tool: 'search' }, { id: 's2', tool: 'email' }] }]
output: runs.entities.r1 = { id: 'r1', agent: 'triage', stepIds: ['s1', 's2'] }
        steps.entities.s1 = { id: 's1', tool: 'search', runId: 'r1' }
```

#### Hints

1. Walk the runs once; for each run, walk its steps.
2. Build `entities` as a record keyed by ID and push to `ids` only the first time you see an ID.
3. Store the parent's ID on each step so you can go both ways.

#### Solution

One pass over runs and their steps, with a check before pushing each ID so duplicates are stored once. The run object is rebuilt without its nested steps.

```ts
import assert from 'node:assert/strict';

type ApiStep = { id: string; tool: string };
type ApiRun = { id: string; agent: string; steps: ApiStep[] };
type Table<T> = { ids: string[]; entities: Record<string, T> };
type Normalised = {
  runs: Table<{ id: string; agent: string; stepIds: string[] }>;
  steps: Table<ApiStep & { runId: string }>;
};

export function normalise(runs: ApiRun[]): Normalised {
  const out: Normalised = { runs: { ids: [], entities: {} }, steps: { ids: [], entities: {} } };
  for (const { steps, ...run } of runs) {
    const stepIds: string[] = [];
    for (const step of steps) {
      if (!(step.id in out.steps.entities)) out.steps.ids.push(step.id);
      out.steps.entities[step.id] = { ...step, runId: run.id };
      if (!stepIds.includes(step.id)) stepIds.push(step.id);
    }
    if (!(run.id in out.runs.entities)) out.runs.ids.push(run.id);
    out.runs.entities[run.id] = { ...run, stepIds };
  }
  return out;
}

const n = normalise([
  { id: 'r1', agent: 'triage', steps: [{ id: 's1', tool: 'search' }, { id: 's2', tool: 'email' }, { id: 's1', tool: 'search' }] },
  { id: 'r2', agent: 'billing', steps: [] },
]);
assert.deepEqual(n.runs.ids, ['r1', 'r2']);
assert.deepEqual(n.runs.entities['r1'], { id: 'r1', agent: 'triage', stepIds: ['s1', 's2'] });
assert.deepEqual(n.steps.ids, ['s1', 's2']);
assert.deepEqual(n.steps.entities['s2'], { id: 's2', tool: 'email', runId: 'r1' });
assert.deepEqual(normalise([]), { runs: { ids: [], entities: {} }, steps: { ids: [], entities: {} } });
```

Complexity: O(R + S·k) time, where k is steps per run (the `includes` check); use a `Set` per run if runs have many steps. O(R + S) space.

#### Follow-ups

- **Why normalise at all?** An update to one step (from a socket event) then changes one entity, and every view that shows it stays consistent.
- **Which library does this for you?** `createEntityAdapter` in Redux Toolkit for the tables; the `normalizr` library for nested schemas.

### Build a small query cache with deduplication and staleTime {medium core}

Write `createQueryCache()` with `fetch(key, fn, { staleTime })`. Concurrent calls for the same key must share one in-flight request; a successful result is reused while younger than `staleTime`; a failed request must not be cached (the next call retries); and `invalidate(prefix)` marks every key starting with that prefix as stale. Keys are arrays of strings.

#### Hints

1. Store per key: the data, when it was fetched, an in-flight promise, and an invalidated flag. Hash the key with `JSON.stringify`.
2. If there is an in-flight promise, return it. If there is fresh data, return it. Otherwise start the request and store the promise.
3. Clear the in-flight promise in `finally`, and only write data on success.

#### Solution

This is the core of TanStack Query in miniature. Deduplication comes from storing the promise itself, not just the result. Invalidation compares key prefixes element by element.

```ts
import assert from 'node:assert/strict';

type Key = readonly string[];
type Entry = { data?: unknown; updatedAt: number; inFlight?: Promise<unknown>; invalidated: boolean };

export function createQueryCache(now: () => number = Date.now) {
  const entries = new Map<string, { key: Key; entry: Entry }>();
  const hash = (key: Key) => JSON.stringify(key);

  return {
    async fetch<T>(key: Key, fn: () => Promise<T>, { staleTime = 0 } = {}): Promise<T> {
      const h = hash(key);
      const slot = entries.get(h) ?? { key, entry: { updatedAt: 0, invalidated: false } };
      entries.set(h, slot);
      const { entry } = slot;
      if (entry.inFlight) return entry.inFlight as Promise<T>;
      const fresh = 'data' in entry && !entry.invalidated && now() - entry.updatedAt < staleTime;
      if (fresh) return entry.data as T;
      const request = fn()
        .then((data) => {
          entry.data = data;
          entry.updatedAt = now();
          entry.invalidated = false;
          return data;
        })
        .finally(() => {
          entry.inFlight = undefined; // failures are not cached: the next call starts a new request
        });
      entry.inFlight = request;
      return request;
    },
    invalidate(prefix: Key) {
      for (const { key, entry } of entries.values()) {
        if (prefix.every((part, i) => key[i] === part)) entry.invalidated = true;
      }
    },
    peek: (key: Key) => entries.get(hash(key))?.entry.data,
  };
}

let clock = 1_000;
const cache = createQueryCache(() => clock);
let calls = 0;
const loadRun = async () => {
  calls++;
  await new Promise((r) => setTimeout(r, 5));
  return { status: 'running' };
};

await Promise.all([cache.fetch(['runs', 'r1'], loadRun), cache.fetch(['runs', 'r1'], loadRun)]);
assert.equal(calls, 1); // deduplicated

await cache.fetch(['runs', 'r1'], loadRun, { staleTime: 5_000 });
assert.equal(calls, 1); // fresh
clock += 6_000;
await cache.fetch(['runs', 'r1'], loadRun, { staleTime: 5_000 });
assert.equal(calls, 2); // stale, refetched

cache.invalidate(['runs']);
await cache.fetch(['runs', 'r1'], loadRun, { staleTime: 60_000 });
assert.equal(calls, 3); // invalidated by prefix

let attempts = 0;
const flaky = async () => {
  attempts++;
  if (attempts === 1) throw new Error('503');
  return 'ok';
};
await assert.rejects(cache.fetch(['agents'], flaky), /503/);
assert.equal(await cache.fetch(['agents'], flaky), 'ok'); // the failure was not cached
assert.equal(cache.peek(['agents']), 'ok');
```

Complexity: O(1) per `fetch` (plus key hashing); `invalidate` is O(entries × prefix length).

#### Follow-ups

- **What is missing compared with TanStack Query?** Observers and re-render notifications, garbage collection after `gcTime`, retries with backoff, cancellation via `AbortSignal`, refetch on focus and reconnect, and structural sharing of results.
- **What if an invalidation happens while a request is in flight?** The in-flight response may be older than the invalidation. TanStack Query cancels and refetches; here you would record an invalidation counter and refetch if it changed during the request.

### Optimistic toggle with rollback when requests overlap {medium}

A run can be "pinned". Clicking pin/unpin updates the UI instantly and sends a request. Requests can overlap (the user clicks twice quickly) and finish in any order. Write a pure state module: `toggle(state, id)` returns the new state and a request token, `confirm(state, token)` and `fail(state, token)` apply the outcome. A failure must roll back **only if no newer toggle happened** for that run; otherwise the newer optimistic value stands.

#### Hints

1. Keep the last server-confirmed value and the optimistic value separately per run.
2. Give each toggle an increasing version number per run, and remember which version is the latest.
3. On failure of version v: if v is the latest, revert to the confirmed value; if not, ignore it. On success of v, update the confirmed value, but never with a version older than one already confirmed.

#### Solution

The trick is versioning. The UI always shows the optimistic value; the confirmed value is what we fall back to. Old responses can never undo a newer click, which is exactly the bug naive rollback code has.

```ts
import assert from 'node:assert/strict';

type PinState = {
  shown: Record<string, boolean>; // what the UI renders
  confirmed: Record<string, boolean>; // what the server last accepted
  confirmedVersion: Record<string, number>; // version of that accepted value
  latest: Record<string, number>; // newest version per run
};
type Token = { id: string; version: number; value: boolean };

export function toggle(state: PinState, id: string): [PinState, Token] {
  const value = !(state.shown[id] ?? false);
  const version = (state.latest[id] ?? 0) + 1;
  return [
    { ...state, shown: { ...state.shown, [id]: value }, latest: { ...state.latest, [id]: version } },
    { id, version, value },
  ];
}

export function confirm(state: PinState, t: Token): PinState {
  // An older success arriving after a newer one must not move the confirmed value backwards.
  // (This assumes the server applies writes in version order: send the version so it can reject stale ones.)
  if ((state.confirmedVersion[t.id] ?? 0) > t.version) return state;
  // The server accepted this value. If a newer click is pending, the UI keeps showing it.
  return {
    ...state,
    confirmed: { ...state.confirmed, [t.id]: t.value },
    confirmedVersion: { ...state.confirmedVersion, [t.id]: t.version },
  };
}

export function fail(state: PinState, t: Token): PinState {
  if (state.latest[t.id] !== t.version) return state; // a newer toggle exists: do not roll it back
  return { ...state, shown: { ...state.shown, [t.id]: state.confirmed[t.id] ?? false } };
}

const empty: PinState = { shown: {}, confirmed: {}, confirmedVersion: {}, latest: {} };

// Single click that fails: rolled back.
let [s, t1] = toggle(empty, 'r1');
assert.equal(s.shown['r1'], true);
s = fail(s, t1);
assert.equal(s.shown['r1'], false);

// Two fast clicks; the FIRST request fails after the second was sent: the newer value stands.
let t2: Token;
let t3: Token;
[s, t2] = toggle(empty, 'r1'); // pin
[s, t3] = toggle(s, 'r1'); // unpin
s = fail(s, t2);
assert.equal(s.shown['r1'], false); // still the newer optimistic value
s = confirm(s, t3);
assert.equal(s.confirmed['r1'], false);

// The latest request fails after an earlier one succeeded: revert to the confirmed value.
[s, t2] = toggle(empty, 'r2'); // pin
s = confirm(s, t2); // server says pinned
[s, t3] = toggle(s, 'r2'); // unpin
s = fail(s, t3);
assert.equal(s.shown['r2'], true);

// Successes arrive out of order: the newer confirmation wins, then a later failure reverts to it.
let t4: Token;
[s, t2] = toggle(empty, 'r3'); // pin (v1)
[s, t3] = toggle(s, 'r3'); // unpin (v2)
s = confirm(s, t3); // v2 confirmed first
s = confirm(s, t2); // stale v1 confirmation is ignored
assert.equal(s.confirmed['r3'], false);
[s, t4] = toggle(s, 'r3'); // pin (v3)
s = fail(s, t4);
assert.equal(s.shown['r3'], false);
```

Complexity: O(1) per operation (plus the object copies).

#### Follow-ups

- **How does TanStack Query handle this?** `cancelQueries` in `onMutate` stops refetches from overwriting the optimistic value, and `onSettled` invalidation resyncs with the server once everything settles; mutation `scope` can make mutations for the same resource run in series instead of overlapping.
- **When is serialising the requests better?** When order matters on the server (pin then unpin must not arrive reversed): queue requests per resource, or send the desired final state with a version number so the server can reject stale writes.

### Write a memoised selector from scratch {medium}

Write `createSelector(inputSelectors, combiner)` like Reselect's: it calls the input selectors on the state, and calls `combiner` only when any input result changed (by `Object.is`) since the last call; otherwise it returns the previous result. Show that a filtered list keeps its reference when unrelated state changes.

#### Hints

1. Keep the last input results and the last output in the closure.
2. On each call, compute the inputs, compare them element by element with the last ones.
3. Only call the combiner on the first call or when something differs.

#### Solution

Memoisation by input identity is enough because state is immutable: if the `runs` reference did not change, the filtered result cannot have changed either.

```ts
import assert from 'node:assert/strict';

export function createSelector<S, I extends unknown[], R>(
  inputs: { [K in keyof I]: (state: S) => I[K] },
  combiner: (...args: I) => R,
): (state: S) => R {
  let lastArgs: I | null = null;
  let lastResult!: R;
  return (state: S) => {
    const args = inputs.map((select) => select(state)) as I;
    const changed = lastArgs === null || args.some((a, i) => !Object.is(a, lastArgs![i]));
    if (changed) {
      lastResult = combiner(...args);
      lastArgs = args;
    }
    return lastResult;
  };
}

type Run = { id: string; status: string };
type State = { runs: Run[]; filter: string; theme: 'light' | 'dark' };

let combinerCalls = 0;
const selectVisible = createSelector<State, [Run[], string], Run[]>(
  [(s) => s.runs, (s) => s.filter],
  (runs, filter) => {
    combinerCalls++;
    return runs.filter((r) => filter === 'all' || r.status === filter);
  },
);

const runs: Run[] = [
  { id: 'r1', status: 'failed' },
  { id: 'r2', status: 'done' },
];
const s1: State = { runs, filter: 'failed', theme: 'light' };
const v1 = selectVisible(s1);
const v2 = selectVisible({ ...s1, theme: 'dark' }); // unrelated change
assert.equal(v2, v1); // same reference
assert.equal(combinerCalls, 1);

const v3 = selectVisible({ ...s1, filter: 'all' });
assert.deepEqual(v3.map((r) => r.id), ['r1', 'r2']);
assert.equal(combinerCalls, 2);
```

Complexity: O(k) comparisons per call for k inputs, plus the combiner when inputs change.

#### Follow-ups

- **Why does a cache size of one cause problems?** If two components call the same selector with different arguments (for example a run ID), they evict each other's result on every render. Create one selector instance per component (`useMemo(() => makeSelectRun(), [])`) or use a selector with a larger cache.
- **Does React Compiler make this unnecessary?** It memoises inside components, but `useSelector` compares what the selector returns, so selectors that return new references still need memoisation.
