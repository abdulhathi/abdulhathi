---
title: "Test Pyramid Lab: a full test strategy for a small full-stack app"
summary: A small booking app (FastAPI + React) used to show a complete, fast and reliable test strategy: pytest unit and integration tests, React Testing Library with MSW, contract checks, and Playwright end-to-end tests with page objects, network mocking, accessibility checks, sharding and published reports.
time: 4 days of evenings
---

## What you will build

The application is deliberately small, so the tests are the star: "SlotBook", where users see available time slots, book one, and cancel it, with a FastAPI backend, PostgreSQL and a React front end. You build the app quickly in Milestone 1 (or reuse your DocIntake API from the FastAPI path), then build the test suite a senior engineer would put around it, and publish the reports.

The repository's README starts with the test strategy, not the app: what each layer tests, why, how long it takes, and how flakiness is prevented.

## What it proves

- Test strategy: the pyramid (or trophy), what belongs at each level, and why
- pytest: fixtures and scopes, parametrisation, factories, testing FastAPI with `httpx.AsyncClient`, integration tests against real PostgreSQL
- Front-end testing: React Testing Library queries by role, `user-event`, MSW for network mocking, testing loading, error and empty states
- Contract testing: the front end's API client checked against the backend's OpenAPI schema
- Playwright: page objects or fixtures, web-first assertions, auth state reuse, network interception, accessibility scans with axe, visual comparisons, traces, sharding in CI
- CI/CD: parallel jobs, caching, artefacts, HTML reports published to GitHub Pages
- Keywords: test automation, pytest, Playwright, React Testing Library, MSW, contract testing, CI/CD, quality engineering

## Architecture

```text
               ┌────────────── Playwright E2E (few, critical journeys) ──────────────┐
               │   book a slot · cancel · double-booking blocked · a11y scan         │
               ├────── contract tests: client ↔ OpenAPI schema ──────────────────────┤
               ├── RTL + MSW component tests (many)  │  pytest API integration tests │
               ├── unit tests: React hooks/utils      │  pytest unit: domain rules    │
               └──────────────────────────────────────┴────────────────────────────────┘
SlotBook:  React (Vite) ──HTTP──► FastAPI ──► PostgreSQL
CI:  lint → unit (py, ts) → integration (py + Postgres service) → contract → E2E (4 shards) → reports → Pages
```

## Milestones

### Milestone 1: the app, minimal

- FastAPI: `GET /slots`, `POST /bookings` (409 if taken), `DELETE /bookings/{id}`, simple token auth.
- React: slot list, a booking dialog, a "my bookings" page with cancel.
- PostgreSQL with a unique constraint that prevents double booking.

Done when: you can book and cancel in the browser. Keep it under a day: the tests are the project.

### Milestone 2: backend tests

- Unit tests for booking rules; integration tests with `httpx.AsyncClient`, a test database per session and a transaction rolled back per test.
- A concurrency test: two simultaneous bookings for one slot, exactly one succeeds.
- Testcontainers needs Docker (pulls currently fail on this Mac), so locally use your Homebrew PostgreSQL with a throwaway database; CI uses a PostgreSQL service container.

Done when: backend coverage is above 90% and the suite runs in under 10 seconds.

### Milestone 3: front-end component tests

- Vitest + React Testing Library + MSW: loading, success, empty, server error and 409 conflict states for the booking flow.
- Accessible queries only (`getByRole`, `getByLabelText`); no test IDs unless there is no accessible alternative.

Done when: every state of the booking dialog has a test, and a broken API response shows a helpful error.

### Milestone 4: Playwright end-to-end

- Three critical journeys with page objects or fixtures; a setup project that logs in once and saves `storageState`.
- One test that mocks the API with `page.route` to force an error state, and one with `page.clock` for a time-based banner.
- `@axe-core/playwright` scan on each page; one visual comparison on the slot grid.
- Traces on first retry, HTML report as an artefact.

Done when: the E2E suite passes ten times in a row locally (`--repeat-each=10`) with no flakes.

### Milestone 5: CI, contract checks and reports

- Generate the TypeScript API client from the FastAPI OpenAPI schema, and fail CI when the schema changes without regenerating the client.
- Shard Playwright across 4 jobs, merge the blob reports, and publish the HTML report and coverage to GitHub Pages.
- Write `TESTING.md`: the strategy, timings per layer, the flaky-test policy (quarantine, fix within a week, never just add retries).

Done when: the README links the latest published test report.

## Repository layout

```text
test-pyramid-lab/
├─ api/            FastAPI app + tests/{unit,integration}
├─ web/            React app + src/**/*.test.tsx (RTL + MSW)
├─ e2e/            Playwright: pages/, fixtures.ts, tests/*.spec.ts, playwright.config.ts
├─ contracts/      generated client + schema check script
├─ TESTING.md
└─ .github/workflows/{ci.yml,pages.yml}
```

## Tests and CI

- Fast layers on every push: Python unit and integration tests (with a PostgreSQL service), Vitest component tests, type checks.
- Contract check: regenerate the client from `/openapi.json` and `git diff --exit-code`.
- E2E: start the API and the built front end, run Playwright with 4 shards, upload blob reports, merge them, and publish to GitHub Pages from the main branch.
- Timing budget per layer in `TESTING.md`, and CI fails if the unit stage exceeds it.

## README checklist

- The test strategy diagram first, with the number of tests and runtime per layer
- Badges: CI, coverage, latest Playwright report
- A GIF of the Playwright UI Mode or trace viewer
- How to run each layer locally
- The flaky-test policy and what you did to make E2E reliable (web-first assertions, no fixed waits, isolated data)
- What you would do next (mutation testing, load tests)

## Stretch goals

- Mutation testing (`mutmut` for Python or Stryker for TypeScript) to measure test quality, not just coverage
- A k6 load test for the booking endpoint
- Pact consumer-driven contract tests instead of the schema diff

## Talking about it in an interview

**60-second walkthrough:** "Test Pyramid Lab is a small booking app I built to show how I structure tests. Most tests are fast: pytest unit and integration tests against a real PostgreSQL, and React Testing Library tests with MSW covering every UI state. A contract check keeps the front-end client in sync with the OpenAPI schema. On top there are just three Playwright journeys with page objects, saved login state, network mocking, accessibility scans and traces, sharded four ways in CI with the merged report published to GitHub Pages. The suite passes ten runs in a row with no flakes."

- **How do you prevent flaky end-to-end tests?** Web-first assertions instead of sleeps, isolated test data per test, mocking third parties at the network layer, traces on retry, and a quarantine-and-fix policy instead of blanket retries.
- **What belongs in E2E versus component tests?** E2E for a few critical user journeys across real services; component tests for states and edge cases, which are faster and more precise.
- **Playwright or Cypress?** I have used Cypress with Cucumber; Playwright runs out of process with multiple browser contexts and tabs, has auto-waiting and parallelism built in, and supports three browser engines, which suits larger suites.

## LinkedIn post template

> New project: Test Pyramid Lab, a small full-stack app built to show a complete test strategy.
> pytest and React Testing Library cover the details fast; three Playwright journeys cover what matters end to end, with accessibility scans, network mocking and sharding in CI.
> The latest test report is published on every push: <repo link> #TestAutomation #Playwright #pytest

## Resume bullet

Built Test Pyramid Lab, a full-stack test strategy showcase: pytest integration tests on PostgreSQL, React Testing Library with MSW, OpenAPI contract checks, and sharded Playwright E2E with accessibility scans and published reports in GitHub Actions.
