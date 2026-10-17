---
title: "Runboard: an accessible React dashboard for background jobs"
summary: A React 19 and TypeScript operations dashboard for job runs, with server-state caching, optimistic actions, a virtualised log viewer, URL-driven filters, full keyboard and screen-reader support, and Playwright end-to-end tests.
time: 4–5 days of evenings
---

## What you will build

Runboard is the front end an operations team uses to watch background jobs: a filterable, sortable table of runs; a run detail page with step progress and a log viewer that stays fast with 100,000 lines; and actions (retry, cancel, approve) that update instantly and roll back if the server refuses. All state that should survive a refresh lives in the URL. It meets WCAG 2.2 AA: every action works from the keyboard, live updates are announced politely, and focus is managed in dialogs.

The backend is mocked with MSW in the browser, so the deployed demo works on GitHub Pages with no server, and the same handlers drive the tests. This is different from the streaming demo already in the portfolio: the focus here is state management, caching, performance and accessibility, not streaming.

## What it proves

- React 19 with TypeScript: components, hooks, `useOptimistic`/mutations, Suspense and error boundaries
- Server state with TanStack Query 5: query keys, `staleTime`, invalidation, optimistic updates with rollback, polling while runs are active
- Performance: virtualisation, memoisation where it is measured, code splitting per route
- Accessibility: semantic HTML, roving focus in the toolbar, an accessible data table, live regions, `axe` checks in tests
- Testing: React Testing Library, MSW, Playwright end to end with accessibility scans
- A small component library documented in Storybook
- Keywords: React, TypeScript, TanStack Query, accessibility (WCAG 2.2), Playwright, Storybook, performance, Vite

## Architecture

```text
 Browser
 ├── Router (URL = state: ?status=failed&sort=-startedAt&page=2)
 ├── Pages: RunsPage · RunDetailPage (lazy loaded)
 ├── TanStack Query cache ── queries: ["runs", filters], ["run", id], ["logs", id, cursor]
 │        │                 mutations: retry / cancel / approve (optimistic + rollback)
 │        ▼
 ├── fetch → /api/*  ──►  MSW service worker (mock API + latency + failure injection)
 └── UI kit (Storybook): DataTable, StatusBadge, Toolbar, Dialog, LogViewer (virtualised)
```

## Milestones

### Milestone 1: skeleton, mock API and the runs table

Goal: a Vite + React 19 + TypeScript app showing runs from MSW.

- MSW handlers for `GET /api/runs` with filtering, sorting and cursor pagination, plus realistic latency.
- A semantic `<table>` with sortable column headers (`aria-sort`) and status badges that do not rely on colour alone.
- Filters and sort read from and write to the URL.

Done when: a refresh or a shared link restores the same view; the table is usable with the keyboard alone.

### Milestone 2: server state done properly

- TanStack Query for every request; sensible `staleTime`; poll every 5 s only while some run is `running`.
- Prefetch the detail page on row hover or focus.
- Loading, empty and error states for every query, with a retry button.

Done when: navigating back to the list is instant from cache, and the network tab shows polling stops when nothing is running.

### Milestone 3: optimistic actions

- Retry, cancel and approve as mutations with optimistic updates and rollback on failure; make MSW fail one in five requests on demand.
- An approval dialog using the native `<dialog>`, focus moved in explicitly and returned on close.
- A polite live region announcing "Run 1042 cancelled" (not every poll).

Done when: actions feel instant, failures roll back with a clear message, and a screen reader announces outcomes once.

### Milestone 4: the run detail page and a fast log viewer

- Step progress for the run; logs loaded in pages by cursor.
- A virtualised log viewer (TanStack Virtual or your own windowing) with follow-tail, pause and search.
- Code-split the detail route with `React.lazy`.

Done when: 100,000 log lines scroll smoothly (record the React Profiler numbers before and after virtualisation for the README).

### Milestone 5: component library and Storybook

- Extract `DataTable`, `StatusBadge`, `Toolbar`, `Dialog` and `LogViewer` into `src/ui` with stories and the Storybook accessibility addon.

Done when: every UI component has stories for its states, and the a11y panel shows no violations.

### Milestone 6: tests, deploy and CI

- React Testing Library tests by role for filters, optimistic rollback and the dialog.
- Playwright end-to-end tests for the main journeys, with `@axe-core/playwright` scans.
- Deploy to GitHub Pages from Actions (MSW runs in the browser, so no backend is needed).

Done when: CI is green, the live demo link works, and Lighthouse accessibility is 100.

## Repository layout

```text
runboard/
├── src/
│   ├── app/            # router, providers, error boundary
│   ├── pages/          # RunsPage, RunDetailPage
│   ├── features/runs/  # queries, mutations, hooks
│   ├── ui/             # DataTable, StatusBadge, Toolbar, Dialog, LogViewer (+ stories)
│   ├── mocks/          # MSW handlers and seed data
│   └── lib/            # url state, formatting
├── e2e/                # Playwright tests
├── .storybook/
└── .github/workflows/{ci.yml,deploy.yml}
```

## Tests and CI

- **Component tests:** Vitest + React Testing Library, queried by role and name; MSW for network; `jest-axe` or `vitest-axe` on key components.
- **End to end:** Playwright against the production build (`vite preview`), plus axe scans of each page.
- **Performance budget:** fail CI if the main bundle grows past a set size.

```yaml
# .github/workflows/ci.yml (outline)
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit && npx vitest run
      - run: npx playwright install --with-deps chromium
      - run: npm run build && npx playwright test
```

## README checklist

- Badges: CI, deploy, licence; a link to the live demo on GitHub Pages
- A GIF: filtering, an optimistic cancel with a forced failure rolling back, and the log viewer scrolling 100k lines
- Architecture diagram and the list of features
- Accessibility statement: what was tested (keyboard, VoiceOver/NVDA, axe) and the WCAG 2.2 AA criteria you addressed
- Performance notes with Profiler numbers before and after virtualisation
- Link to the published Storybook
- What you would do next

No Docker or backend is needed: MSW mocks the API in the browser, so local development is just `npm run dev`.

## Stretch goals

- Replace polling with WebSocket or SSE updates written into the query cache with `setQueryData`
- Dark mode with design tokens
- Internationalisation of dates and numbers
- A real backend (FastAPI or Express) behind the same API contract, generated from OpenAPI

## Talking about it in an interview

**60-second walkthrough:** "Runboard is an operations dashboard I built to show production-grade React. All server data goes through TanStack Query: the list polls only while jobs are running, details are prefetched on hover, and retry, cancel and approve are optimistic with rollback, which I tested by making the mock API fail on purpose. The URL is the source of truth for filters, so views are shareable. The log viewer is virtualised and handles a hundred thousand lines; I have the Profiler numbers. Accessibility was a requirement, not an afterthought: keyboard support, a native dialog with managed focus, polite announcements, and axe scans in Playwright."

- **Why TanStack Query instead of Redux?** Most of this state is server state: caching, refetching and invalidation are the hard parts, and that is what TanStack Query is for. Client state is small (UI toggles) and lives in components or the URL.
- **How do you stop a screen reader announcing every poll?** Only announce outcomes of user actions in a polite live region; don't put the polled table inside a live region.
- **When would you reach for `memo`?** When the Profiler shows a component re-rendering expensively with unchanged props; here, the table rows and the log lines.

## LinkedIn post template

> I built Runboard, an accessible React 19 dashboard for background jobs, to put state management, performance and accessibility into one project.
> TanStack Query handles caching, polling and optimistic actions with rollback; a virtualised log viewer scrolls 100,000 lines smoothly; and everything works from the keyboard and with a screen reader.
> Tested with React Testing Library, Playwright and axe. Live demo and code: <link>
> #react #typescript #accessibility #frontend

## Resume bullet

Built Runboard, an open-source React 19/TypeScript dashboard with TanStack Query caching and optimistic updates, a virtualised 100k-line log viewer, WCAG 2.2 AA accessibility, Storybook components and Playwright end-to-end tests with axe scans.
