---
title: End-to-end testing with Playwright
goal: Explain how Playwright works, write reliable tests for a streaming, real-time React app (SSE, WebSockets, approvals, auth), and turn your Cypress experience into a confident answer.
minutes: 45
---

Many full-stack roles ask for end-to-end coverage of user journeys with Playwright or Cypress. Your resume has **Cypress with Cucumber** (Medidata), not Playwright, so when a role names Playwright, expect the question "have you used Playwright?". The honest, strong answer is: "My end-to-end experience is Cypress; the concepts map one to one." Add "and I've written Playwright tests for streaming and WebSocket flows while preparing" only after you have actually written and run some, for example the end-to-end test in [the streaming demo](#/streaming-project). This chapter gives you the depth behind either answer.

Every Playwright example in this chapter was run, unchanged, with Playwright 1.64 in Google Chrome against a small stand-in app that has the pages the tests describe. The lab's automatic check only type-checks them, because it has no browser.

## How Playwright works

**Playwright Test** (`@playwright/test`) is a test runner plus a browser-automation library. It drives **Chromium, Firefox and WebKit** from outside the browser, over each engine's automation protocol (the Chrome DevTools Protocol for Chromium, and patched Firefox and WebKit builds). Because it is out of process, it handles multiple tabs, multiple origins, iframes, downloads and file uploads naturally. It has official bindings for TypeScript/JavaScript, Python, Java and .NET.

- **Browser context:** an isolated, incognito-like profile with its own cookies, local storage and cache. Each test gets a **fresh context** in an already-running browser, so tests are isolated without the cost of launching a browser per test. Two contexts in one test can simulate two users (a requester and an approver).
- **Built-in fixtures:** `page`, `context`, `browser`, `browserName`, and `request` (a separate API client for seeding data, with its own cookies). To call the API as the signed-in user, use `page.request`, which shares the page's cookies.
- **Workers:** test files run in parallel worker processes; `fullyParallel: true` also parallelises tests inside a file.
- **Tooling:** UI mode (`npx playwright test --ui`), step debugging (`--debug`), `npx playwright codegen` to record locators, and the **trace viewer** (DOM snapshots, network, console and the action log for every step).

## Locators, auto-waiting and web-first assertions

A **locator** describes how to find an element; it is lazy and re-resolved every time you use it, so it survives re-renders. Locators are **strict**: an action on a locator that matches two elements throws, which catches ambiguous tests early.

Prefer user-facing locators, in this order: `getByRole` (with `name`), `getByLabel`, `getByPlaceholder`, `getByText`, `getByAltText`, `getByTitle`, then `getByTestId` as a fallback. Narrow with `filter({ hasText })` or `filter({ has: locator })`, and chain from a container (`row.getByRole('button', { name: 'Approve' })`).

**Auto-waiting:** before clicking, Playwright waits until the element is **visible, stable (not animating), able to receive events (not covered by another element) and enabled**; `fill` also waits for it to be editable. **Web-first assertions** (`await expect(locator).toHaveText(…)`) retry until they pass or time out (5 seconds by default). Together they remove almost every reason for a sleep.

| Write this | Not this | Why |
|---|---|---|
| `await expect(log).toHaveText('Hello')` | `expect(await log.textContent()).toBe('Hello')` | The first retries; the second reads once, possibly before the stream finished |
| `await expect(toast).toBeVisible()` | `await page.waitForTimeout(2000)` | A fixed sleep is slow when things are fast and flaky when they are slow |
| `await expect.poll(() => calls.length).toBe(1)` | a `while` loop with sleeps | `expect.poll` retries any non-DOM condition |
| `page.getByRole('button', { name: 'Approve' })` | `page.locator('.btn-primary:nth-child(2)')` | Survives styling changes and checks accessibility for free |

```ts typecheck
import { expect, test } from '@playwright/test';

test('approve the waiting run from the dashboard', async ({ page }) => {
  await page.goto('/runs');

  // Find the row by what the user sees, then the button inside that row.
  const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'run-1', exact: true }) });
  await expect(row).toContainText('Waiting for approval');

  await row.getByRole('button', { name: 'Approve' }).click(); // auto-waits until clickable
  await expect(page.getByRole('status')).toHaveText('Approved run-1'); // retries for up to 5 s
});
```

## Fixtures and page objects

A **page object** wraps the locators and actions of one screen in a class, so tests read like the user's intent and a UI change is fixed in one place. A **fixture** (`test.extend`) builds things a test needs, runs teardown after `use`, and composes with other fixtures. Combine them: a fixture that creates the page object (and any network mocks) and hands it to the test.

```ts typecheck
import { test as base, expect, type Locator, type Page } from '@playwright/test';

export class RunsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Agent runs' });
    this.toast = page.getByRole('status');
  }

  async goto() {
    await this.page.goto('/runs');
    await expect(this.heading).toBeVisible();
  }

  row(runId: string) {
    return this.page.getByRole('row').filter({ has: this.page.getByRole('cell', { name: runId, exact: true }) });
  }

  async approve(runId: string) {
    await this.row(runId).getByRole('button', { name: 'Approve' }).click();
  }
}

type Fixtures = { runsPage: RunsPage; approvals: string[] };

export const test = base.extend<Fixtures>({
  // Records approval calls instead of letting them reach the real backend.
  approvals: async ({ page }, use) => {
    const approved: string[] = [];
    await page.route('**/api/runs/*/approve', (route) => {
      approved.push(new URL(route.request().url()).pathname.split('/')[3]);
      return route.fulfill({ json: { ok: true } });
    });
    await use(approved);
  },
  runsPage: async ({ page }, use) => {
    const runsPage = new RunsPage(page);
    await runsPage.goto();
    await use(runsPage);
  },
});

test('an approver approves the waiting run', async ({ runsPage, approvals }) => {
  await expect(runsPage.row('run-1')).toContainText('Waiting for approval');
  await runsPage.approve('run-1');
  await expect(runsPage.toast).toHaveText('Approved run-1');
  expect(approvals).toEqual(['run-1']);
});
```

Keep assertions in tests rather than inside page-object methods, except for "the page is ready" checks like the heading in `goto`.

## Authentication: sign in once, reuse the session

Signing in through the UI in every test is slow and makes every test depend on the login page. The recommended pattern is a **setup project**: it signs in once per role, saves cookies and storage with `storageState`, and the test projects declare it as a dependency and start already signed in.

```ts typecheck
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI, // a stray test.only fails the CI build
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: process.env.CI ? [['blob'], ['github']] : [['html']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    {
      name: 'approver',
      testIgnore: /.*\.viewer\.spec\.ts/, // otherwise the viewer specs would also run signed in as the approver
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/approver.json' },
      dependencies: ['setup'],
    },
    {
      name: 'viewer',
      testMatch: /.*\.viewer\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/viewer.json' },
      dependencies: ['setup'],
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:5173', reuseExistingServer: !process.env.CI },
});
```

```ts typecheck
// e2e/auth.setup.ts
import { expect, test as setup } from '@playwright/test';

const users = [
  { role: 'approver', email: process.env.E2E_APPROVER_EMAIL ?? '', password: process.env.E2E_APPROVER_PASSWORD ?? '' },
  { role: 'viewer', email: process.env.E2E_VIEWER_EMAIL ?? '', password: process.env.E2E_VIEWER_PASSWORD ?? '' },
];

for (const user of users) {
  setup(`sign in as ${user.role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(`Signed in as ${user.role}`)).toBeVisible();
    await page.context().storageState({ path: `playwright/.auth/${user.role}.json` });
  });
}
```

The saved state files contain live session cookies: add `playwright/.auth` to `.gitignore`, and read test credentials from CI secrets, never from the repository.

**Enterprise SSO (SAML or OIDC through the company IdP)** needs a decision, because driving a third-party login page in every run is slow and brittle, and MFA blocks automation by design:

- Use a **dedicated test tenant or test users** in the IdP without MFA, and log in through the real IdP only in the setup project and one smoke test.
- Or log in **programmatically**: get a token or session cookie from a test-only endpoint or the IdP's API (for example an OAuth flow allowed only in non-production), then set it on the context.
- Whatever you choose, keep at least one test that goes through the real redirect flow, because SAML and OIDC misconfigurations (wrong ACS URL, clock skew, missing group claims) only show up there.

Your angle: you implemented SAML with Passport.js at Quantiphi, so you can talk about the redirect, the assertion and the session cookie the tests end up reusing.

## Mocking the network: SSE streams and WebSockets

`page.route(pattern, handler)` intercepts any request the page makes, including `fetch`, XHR and `EventSource`. The handler can `fulfill` with a fake response, `abort` to simulate a network failure, `continue` to let it through (optionally with changed headers), or `route.fetch()` the real response and modify it. `page.routeFromHAR` replays a recorded HAR file.

**Mocking an SSE stream** is a `fulfill` with `content-type: text/event-stream` and the events as the body. Two things interviewers like to hear you know:

- The fulfilled body is delivered **all at once**, so it tests what the UI does with a sequence of events, not how it renders them over time. To test incremental rendering and timing, run the real backend with a **fake, slow model** (a test-only LLM that streams scripted tokens with delays).
- When a mocked stream ends, `EventSource` **reconnects automatically** after its retry delay unless the app closes it. A good client closes the stream on its `done` event; assert the stream was requested exactly once, or you will ship duplicate answers.

**WebSockets:** `page.routeWebSocket(url, handler)` (Playwright 1.48 and later) lets the test play the server: receive what the page sends with `ws.onMessage`, push messages with `ws.send`, or call `ws.connectToServer()` to proxy to the real server and intercept selected messages. To only observe traffic, listen with `page.on('websocket', ws => ws.on('framereceived', …))`.

Here is a complete spec for a streaming agent chat with a human approval step. It uses `page.route` for the SSE stream and `page.routeWebSocket` for the approval channel.

```ts typecheck
import { expect, test } from '@playwright/test';

const sse = (events: { event: string; data: unknown; id?: string }[]) =>
  events.map((e) => `${e.id ? `id: ${e.id}\n` : ''}event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');

test('streams the answer into the log and closes the stream on done', async ({ page }) => {
  let streamRequests = 0;
  await page.route('**/api/runs/*/stream', (route) => {
    streamRequests++;
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: sse([
        { id: '0', event: 'token', data: { token: 'Hel' } },
        { id: '1', event: 'token', data: { token: 'lo' } },
        { event: 'done', data: {} },
      ]),
    });
  });

  await page.goto('/chat');
  await page.getByLabel('Message').fill('Create a purchase order for V-100');
  await page.getByRole('button', { name: 'Send' }).click();

  const log = page.getByRole('log');
  await expect(log).toHaveText('Hello');
  await expect(log).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Done')).toBeVisible();
  expect(streamRequests).toBe(1); // no automatic reconnect after done
});

test('an approver approves a step over the WebSocket', async ({ page }) => {
  const received: unknown[] = [];
  await page.routeWebSocket('**/ws', (ws) => {
    ws.onMessage((message) => {
      const msg = JSON.parse(String(message));
      received.push(msg);
      if (msg.type === 'approve') ws.send(JSON.stringify({ type: 'approved', step: msg.step }));
    });
    // Play the server: ask for approval shortly after the page connects.
    setTimeout(() => ws.send(JSON.stringify({ type: 'approval_needed', step: 'create-po' })), 100);
  });

  await page.goto('/chat');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText('Approved create-po')).toBeVisible();
  expect(received).toEqual([{ type: 'approve', step: 'create-po' }]);
});

test('shows a retry when the stream fails', async ({ page }) => {
  await page.route('**/api/runs/*/stream', (route) => route.abort('connectionreset'));
  await page.goto('/chat');
  await page.getByLabel('Message').fill('hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});
```

Mock at the edges, not everywhere: a suite where every call is mocked is really a component test in a slow browser. Keep a few journeys running against the real backend (with a fake model behind it) so the real serialisation, auth and proxies are exercised.

## Time: clocks, timeouts and long agent runs

- **`page.clock`** controls time inside the page: `install()` before navigation, then `fastForward('16:00')` to jump ahead firing due timers once, `runFor(ms)` to tick through every timer, `pauseAt(date)` and `setFixedTime(date)`. Use it for session-expiry warnings, reconnect backoff ("reconnecting in 30 s"), relative timestamps ("2 minutes ago") and polling intervals.
- **Long-running work:** raise the timeout on the one assertion that waits (`await expect(status).toHaveText('Completed', { timeout: 60_000 })`) or mark a test `test.slow()`, instead of raising the global timeout for every test.
- `test.step('approve the purchase order', async () => …)` groups actions so reports and traces read like the journey.

```ts typecheck
import { expect, test } from '@playwright/test';

test('warns before the session expires', async ({ page }) => {
  await page.clock.install(); // must happen before the page's timers are created
  await page.goto('/chat');
  await page.clock.fastForward('14:00'); // jump 14 minutes ('mm:ss') of page time; due timers fire once
  await expect(page.getByRole('alertdialog', { name: 'Session expiring' })).toBeVisible();
});

test('a long agent run reaches the approval step', async ({ page }) => {
  test.slow(); // triples the timeout for this test only
  await page.goto('/runs/new');
  await test.step('start the run', async () => {
    await page.getByLabel('Task').fill('Reconcile last month invoices');
    await page.getByRole('button', { name: 'Start run' }).click();
  });
  await test.step('wait for the approval request', async () => {
    await expect(page.getByRole('status')).toHaveText('Waiting for approval', { timeout: 60_000 });
  });
});
```

## Accessibility checks

Enterprise and public-facing products often require strict accessibility standards, so show you test for it:

- Role-based locators already fail when a control has no accessible name.
- **axe-core** through `@axe-core/playwright` scans a page or a region against WCAG rules. Automated rules catch only part of WCAG, so keyboard and screen-reader checks are still needed.
- **Keyboard:** drive the page with `page.keyboard.press('Tab')` and assert `toBeFocused()`; test that dialogs trap and return focus.
- **ARIA snapshots** (`toMatchAriaSnapshot`, Playwright 1.49 and later) assert the accessibility tree's structure, which catches a heading or landmark disappearing.

```ts norun
// Needs @axe-core/playwright, which is not installed in this lab.
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('the chat page has no detectable WCAG A/AA violations', async ({ page }) => {
  await page.goto('/chat');
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations).toEqual([]);
});
```

```ts typecheck
import { expect, test } from '@playwright/test';

test('the runs table keeps its structure and is keyboard reachable', async ({ page }) => {
  await page.goto('/runs');
  await expect(page.getByRole('main')).toMatchAriaSnapshot(`
    - heading "Agent runs" [level=1]
    - table:
      - rowgroup:
        - row "Run Agent Status Action"
  `);
  await page.getByLabel('Filter runs').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('row').nth(1).getByRole('button', { name: 'Approve' })).toBeFocused();
});
```

## Running in CI: parallelism, retries, traces and sharding

- **Browsers:** `npx playwright install --with-deps chromium` on the runner, or run inside the official `mcr.microsoft.com/playwright` Docker image pinned to your Playwright version.
- **Speed:** `fullyParallel`, a sensible `workers` count, and **sharding** across machines (`npx playwright test --shard=1/4`); each shard writes a `blob` report and `npx playwright merge-reports` combines them into one HTML report.
- **Diagnosis:** `trace: 'on-first-retry'` records a trace only when a test failed once; open it with `npx playwright show-trace` (or in the HTML report) to see the DOM, network and console at every step. Add screenshots and video on failure.
- **Hygiene:** `forbidOnly` in CI, `retries: 2` in CI only, and watch the "flaky" count in the report (tests that passed on retry).
- **Visual comparisons:** `await expect(page).toHaveScreenshot()` compares with a stored baseline. Baselines differ by OS and browser, so generate them in the same Docker image CI uses; mask dynamic regions (`mask: [locator]`). CSS animations are stopped by default for screenshots. Use sparingly; they are high maintenance.
- **Where E2E runs:** against a preview environment per pull request (for example a Cloud Run revision with a tag URL) or a shared staging environment, with a smoke subset after each production deploy.

## Playwright and Cypress

| | Playwright | Cypress |
|---|---|---|
| Architecture | Drives the browser from outside, over automation protocols | Runs your test code inside the browser next to the app, plus a Node process |
| Browsers | Chromium, Firefox, WebKit | Chrome family, Edge, Firefox; WebKit is experimental and Electron is deprecated |
| Tabs, origins, iframes | Multiple pages, contexts and origins in one test | One tab; cross-origin steps through `cy.origin` |
| Languages | TypeScript/JavaScript, Python, Java, .NET | JavaScript/TypeScript |
| Style | `async`/`await` with auto-waiting and web-first assertions | Chained commands with built-in retry-ability |
| Parallel runs | Built-in workers and sharding, free | One spec at a time per machine; parallelism across machines via Cypress Cloud or third-party services |
| Network | `page.route`, `page.routeWebSocket`, HAR replay | `cy.intercept` for HTTP; WebSocket mocking needs plugins or app-level stubs |
| Debugging | Trace viewer, UI mode, codegen | Interactive runner with time-travel snapshots |
| Component testing | Recent versions dropped the old experimental packages for a built-in `mount` fixture that renders stories from a gallery page on your own dev server | Mature and built into the runner |

How the concepts map, so your Cypress experience counts: `cy.get(…).should(…)` retrying is Playwright's locator plus a web-first assertion; `cy.intercept` is `page.route`; `cy.session` is `storageState`; custom commands become fixtures or page-object methods; Cucumber feature files can sit on top of Playwright with a BDD layer such as playwright-bdd.

## Interview questions

### How does Playwright work, and how is it different from Cypress? {core}

Playwright drives the browser from outside, over each engine's automation protocol, and supports Chromium, Firefox and WebKit. Each test gets a fresh browser context, a cheap isolated profile, so tests are independent and run in parallel workers. Cypress runs the test code inside the browser alongside the app, which gives a great interactive debugger but makes multiple tabs, multiple origins and WebSocket mocking harder, and its parallelism across machines goes through Cypress Cloud or third-party services.

For real-time products with approval flows, Playwright's out-of-process model, `routeWebSocket`, multiple contexts (a requester and an approver in one test) and free sharding are real advantages. My hands-on end-to-end experience is Cypress with Cucumber at Medidata, and the concepts transfer directly.

### What is a browser context, and why does it matter? {deep}

A browser context is an isolated session inside one browser: its own cookies, storage, cache and permissions, like a fresh incognito window. Playwright creates a new context per test, which gives full isolation at almost no cost because the browser process is reused. It also lets one test run two users at once, for example a requester in one context and an approver in another, each with their own `storageState`, which is exactly how I'd test a human-in-the-loop approval end to end.

### What are auto-waiting and web-first assertions? {core}

Before an action, Playwright waits until the element is visible, stable, not covered by something else, and enabled, so `click()` doesn't fire too early. Web-first assertions such as `await expect(locator).toHaveText('Done')` retry until they pass or time out, five seconds by default. Together they replace sleeps: the test waits exactly as long as needed.

The classic mistake is `expect(await locator.textContent()).toBe(…)`, which reads once with no retry and fails if the stream hasn't finished. For non-DOM conditions there's `expect.poll` and `expect(…).toPass()`.

### Which locators do you use, and why? {core}

User-facing ones: `getByRole` with an accessible name first, then `getByLabel`, `getByText` and friends, and `getByTestId` only when nothing user-visible is stable. They survive styling and markup refactors, and they double as an accessibility check, because if I can't find the Approve button by role and name, a screen reader can't either.

Locators are lazy and strict: they re-resolve on every use, and an action fails if more than one element matches, which flags ambiguous tests. I scope them from a container, like a table row filtered by its run id, rather than writing long CSS or XPath chains.

### How do you keep end-to-end tests from being flaky? {core}

No sleeps: rely on auto-waiting and web-first assertions. Isolated tests: a fresh context each time and unique test data created through the API, never shared accounts that tests mutate. Control the non-deterministic parts: mock third-party calls and the LLM at the edge, use `page.clock` for time, and make the app expose clear states (`aria-busy`, a "Done" status) so tests can wait on them.

Then measure: run with retries in CI, but track tests that only pass on retry, and fix the cause using the trace. Fewer, high-value end-to-end tests are also more stable than hundreds of UI tests that belong at the component level.

### How do you handle authentication, including enterprise SSO? {core}

A setup project signs in once per role and saves the session with `storageState`; the test projects depend on it and start signed in, so no test spends time on the login page. Different roles, such as approver and viewer, get separate state files, which is also how I test role-based access: the viewer must not see the Approve button.

For SAML or OIDC through a corporate IdP I'd use a test tenant or test users without MFA, or a programmatic login allowed only in non-production, and keep one smoke test that goes through the full redirect flow, because IdP misconfigurations only show up there. I've built the SAML side with Passport.js, so I know what the session at the end looks like.

### How would you test a chat UI that streams LLM responses end to end? {core}

For behaviour, I route the stream endpoint with `page.route` and fulfil it with a `text/event-stream` body of scripted events, then assert the log text, that `aria-busy` returns to false, and that the stream was requested exactly once, since `EventSource` reconnects by itself if the app doesn't close it on `done`. I add a failure case with `route.abort` to check the Retry path.

A fulfilled body arrives all at once, though, so for timing and incremental rendering I run the real backend with a fake, slow model that streams scripted tokens. That also exercises the real proxy and headers, where buffering problems hide.

### How do you mock or control WebSocket traffic in Playwright?

With `page.routeWebSocket`, available since Playwright 1.48. The handler plays the server: it receives what the page sends through `onMessage` and pushes messages with `send`, so I can script "approval needed", assert the page sends "approve" with the right step, and reply "approved". With `connectToServer()` it can proxy to the real server and intercept only some messages. To observe without changing anything, I listen to `page.on('websocket')` and its frame events.

### How do you test time-dependent behaviour such as session expiry or reconnect backoff? {deep}

With `page.clock`. I install the fake clock before navigation, then `fastForward` to jump ahead, for example 14 minutes to the session-expiry warning, or `runFor` to step through a reconnect backoff schedule and assert the "reconnecting in 4 s" message changes as expected. Without it, these tests either take real minutes or get skipped. For long-running agent runs I raise the timeout on the single assertion that waits, or use `test.slow()`, rather than raising the global timeout.

### Fixtures or page objects?

Both. Page objects keep each screen's locators and actions in one class, so tests read like the journey and a UI change is a one-place fix. Fixtures, through `test.extend`, are how tests receive them, together with setup and teardown like network mocks, seeded data or a signed-in API client. Fixtures compose and only run when a test asks for them. I keep assertions in the tests, apart from "page ready" checks inside page objects.

### How do you run Playwright in CI and keep it fast? {core}

Install only the browsers needed, or use the official Playwright Docker image pinned to our version. Run tests fully parallel with a fixed number of workers, and shard across machines with `--shard`, merging blob reports into one HTML report. Record traces on the first retry, screenshots on failure, fail the build on `test.only`, and allow two retries in CI only.

For speed the biggest win is test design: seed data through the API instead of the UI, reuse auth state, and keep end-to-end tests to the journeys that matter, with a smoke subset after each production deploy.

### How do you debug a test that fails only in CI?

Open the trace from the failed run: it shows the DOM snapshot, the network calls and the console for every step, which usually reveals the cause, such as a slow API, a missing environment variable, or a different viewport. Then reproduce locally with the same conditions: the same Docker image, the CI worker count, `--repeat-each` to surface ordering or timing issues, and CPU throttling if it's a race. Most CI-only failures are timing assumptions or shared state between parallel tests.

### What should, and should not, be an end-to-end test? {core}

End to end: the critical journeys that cross many parts of the system and would hurt most if broken. Signing in through the IdP, starting an agent run and seeing it stream, approving a step, a viewer being denied an action. Not end to end: every validation message, every empty state, every edge case of the parser. Those belong in unit and component tests, where they run in milliseconds and fail precisely. A rule of thumb is a few dozen journeys, not hundreds of UI tests.

### How do you manage test data for end-to-end tests? {deep}

Each test creates what it needs through the API with the `request` fixture (a run, a purchase-order draft), uses unique names so parallel tests never collide, and cleans up in fixture teardown, or relies on an environment that is reset regularly. Never depend on data another test created, or on a shared account whose state changes. For read-only reference data, seed it once per environment with a script. On a per-PR preview environment, a fresh database seeded at deploy makes all of this simpler.

### How do you add accessibility checks to end-to-end tests?

Role-based locators are the first layer. Then `@axe-core/playwright` scans each key page or region for WCAG A and AA violations, and the build fails on new violations. I add keyboard tests (Tab order, focus moving into and back out of dialogs, Escape closing them) with `toBeFocused`, and ARIA snapshots for the structure of important regions. Automated scans only find part of the issues, so they don't replace a manual screen-reader pass on new components.

### What about visual regression testing? {deep}

`toHaveScreenshot` compares the page or an element with a stored baseline image. It catches CSS regressions that functional tests miss, but it is high maintenance: rendering differs between operating systems and browsers, so baselines must be generated in the same Docker image CI uses; dynamic parts such as timestamps, streaming text or charts must be masked; and animations stopped (the default for `toHaveScreenshot`). I'd use it for a few stable, high-value views such as the design-system components or the dashboard shell, not for every page.

### How would you test a long-running agent run with a human approval step end to end? {deep}

Two browser contexts: a requester who starts the run, and an approver signed in with their own storage state. The backend runs with a fake model and a stubbed enterprise API so the run is deterministic and fast. The requester starts the run and sees "Waiting for approval"; the approver's dashboard shows the pending step, the approver approves, and both screens update in real time. Then assert the stubbed external API received exactly one call, which proves the approval was idempotent.

Use `test.step` for each phase, a longer timeout only on the waiting assertion, and add a variant where the approver rejects, checking the compensation path.

### You've used Cypress, not Playwright. How quickly would you be productive? {core}

Quickly, because the concepts are the same: Cypress's retrying `get` and `should` map to locators and web-first assertions, `cy.intercept` to `page.route`, `cy.session` to `storageState`, and custom commands to fixtures and page objects. The main shift is writing `async`/`await` instead of chained commands, and the journeys I covered with Cypress and Cucumber at Medidata translate directly into Playwright specs.

If, and only if, you have written and run Playwright tests while preparing, add: "I've already written Playwright tests for SSE streaming, WebSocket approvals and a fake clock."

### When would you mock with page.route, and when would you use a real backend? {deep}

`page.route` when I'm testing how the UI reacts to specific responses that are hard to produce for real: errors, rate limits, a broken stream, an empty state, an exact event sequence. A real backend, with only the model and third-party APIs faked, for the core journeys, because that's where serialisation, auth, CORS, proxy buffering and real WebSocket behaviour get exercised. If every end-to-end test mocks the API, those tests are really slow component tests, and the integration bugs ship.

## Coding problems

### Test a streaming chat with a mocked SSE route {medium core}

The chat page at `/chat` has a "Message" input, a "Send" button and a `role="log"` region with `aria-busy`. On Send, it opens an `EventSource` to `/api/runs/:id/stream`, appends `token` events to the log and closes the stream on `done`, then shows "Done". Write a Playwright test that mocks the stream and proves the answer renders, the busy flag clears, and the stream is not reopened.

#### Hints

1. Intercept the stream URL with `page.route` and `fulfill` it with `content-type: text/event-stream`.
2. Each SSE event is `event: …` and `data: …` lines followed by a blank line; build the body with a helper.
3. Count how many times the route handler runs, and use web-first assertions for the text and the attribute.

#### Solution

The mocked body arrives in one piece, which is fine for testing the sequence of events. Counting route calls catches the classic bug of not closing the `EventSource` on `done`, which makes the browser reconnect and stream the answer twice.

```ts typecheck
import { expect, test } from '@playwright/test';

type Event = { event: string; data: unknown; id?: string };
const toSSE = (events: Event[]) =>
  events.map((e) => `${e.id ? `id: ${e.id}\n` : ''}event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`).join('');

test('renders the streamed answer and does not reconnect', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/runs/*/stream', (route) => {
    calls++;
    return route.fulfill({
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: toSSE([
        { id: '0', event: 'token', data: { token: 'PO ' } },
        { id: '1', event: 'token', data: { token: 'drafted' } },
        { event: 'done', data: {} },
      ]),
    });
  });

  await page.goto('/chat');
  await page.getByLabel('Message').fill('Draft a PO for V-100');
  await page.getByRole('button', { name: 'Send' }).click();

  const log = page.getByRole('log');
  await expect(log).toHaveText('PO drafted');
  await expect(log).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Done')).toBeVisible();
  expect(calls).toBe(1);
});
```

Complexity: one page load and one mocked request; the test finishes in about a second.

#### Follow-ups

- **How would you test that tokens render incrementally?** Run the real backend with a fake model that streams with delays, and assert an intermediate state (`toHaveText('PO ')`) before the final one.
- **How would you test resume after a dropped connection?** Fail the first request after some events, then check the second request carries `Last-Event-ID` (`route.request().headers()['last-event-id']`) and the text has no duplicates.

### Test a human approval over a WebSocket {medium core}

When a run needs approval, the server sends `{"type":"approval_needed","step":"create-po"}` over the page's WebSocket at `/ws`, and the page shows an "Approve" button. Clicking it sends `{"type":"approve","step":"create-po"}`; when the server replies `{"type":"approved",…}` the page shows "Approved create-po". Write the test without a real server.

#### Hints

1. `page.routeWebSocket` lets the test act as the server for a URL pattern.
2. Push the `approval_needed` message after the page connects, and handle incoming messages with `ws.onMessage`.
3. Record what the page sent and assert on it after the UI updates.

#### Solution

Routing the socket makes the test deterministic: the test decides when the server speaks, and can assert exactly what the client sent. Register the route before `goto`, so the page's connection is intercepted.

```ts typecheck
import { expect, test } from '@playwright/test';

test('approves a pending step over the socket', async ({ page }) => {
  const sent: { type: string; step?: string }[] = [];

  await page.routeWebSocket('**/ws', (ws) => {
    ws.onMessage((message) => {
      const msg = JSON.parse(String(message)) as { type: string; step?: string };
      sent.push(msg);
      if (msg.type === 'approve') ws.send(JSON.stringify({ type: 'approved', step: msg.step }));
    });
    setTimeout(() => ws.send(JSON.stringify({ type: 'approval_needed', step: 'create-po' })), 100);
  });

  await page.goto('/chat');
  const approve = page.getByRole('button', { name: 'Approve' });
  await approve.click(); // waits until the button appears
  await expect(page.getByText('Approved create-po')).toBeVisible();
  await expect(approve).toBeHidden();
  expect(sent).toEqual([{ type: 'approve', step: 'create-po' }]);
});
```

Complexity: constant; one routed socket and a handful of messages.

#### Follow-ups

- **How do you test a reconnect?** Call `ws.close()` from the route handler, then assert the page shows "Reconnecting…", reconnects (the handler runs again) and resubscribes; use `page.clock` to skip the backoff delay.
- **How do you test with the real server but one changed message?** `const server = ws.connectToServer()`, forward everything with `server.onMessage(m => ws.send(m))`, and rewrite only the message you care about.

### Sign in once per role and test role-based access {medium}

The app has two roles: an approver who sees an "Approve" button on waiting runs, and a viewer who must not. Write the Playwright configuration and setup so each role signs in once, then write one test per role on `/runs` without logging in inside the tests.

#### Hints

1. A setup project can sign in and save `storageState` to a file per role.
2. Each test project uses one state file and depends on the setup project.
3. For the negative case, assert the button is absent with `toHaveCount(0)` or `not.toBeVisible()`, and check the server rejects the call too.

#### Solution

The setup project removes the login cost from every test and makes the role explicit in the project name. Testing the denial in the UI is not enough: the API must also refuse, so the viewer test calls the endpoint directly through the context's `request`, which carries the viewer's cookies.

```ts typecheck
import { defineConfig, devices, expect, test } from '@playwright/test';

// playwright.config.ts
export const config = defineConfig({
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'approver', testMatch: /approver\.spec\.ts/, use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/approver.json' }, dependencies: ['setup'] },
    { name: 'viewer', testMatch: /viewer\.spec\.ts/, use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/viewer.json' }, dependencies: ['setup'] },
  ],
});

// auth.setup.ts: one setup test per role
for (const role of ['approver', 'viewer'] as const) {
  test(`sign in as ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(process.env[`E2E_${role.toUpperCase()}_EMAIL`] ?? '');
    await page.getByLabel('Password').fill(process.env[`E2E_${role.toUpperCase()}_PASSWORD`] ?? '');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(`Signed in as ${role}`)).toBeVisible();
    await page.context().storageState({ path: `playwright/.auth/${role}.json` });
  });
}

// approver.spec.ts
test('approver sees the Approve button', async ({ page }) => {
  await page.goto('/runs');
  const row = page.getByRole('row').filter({ hasText: 'run-1' });
  await expect(row.getByRole('button', { name: 'Approve' })).toBeVisible();
});

// viewer.spec.ts
test('viewer cannot approve, in the UI or through the API', async ({ page }) => {
  await page.goto('/runs');
  const row = page.getByRole('row').filter({ hasText: 'run-1' });
  await expect(row).toContainText('Waiting for approval');
  await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);

  const res = await page.request.post('/api/runs/run-1/approve');
  expect(res.status()).toBe(403);
});
```

In a real repository these are three files (`playwright.config.ts` with `export default defineConfig(…)`, `auth.setup.ts`, and the two specs); they are shown together here.

Complexity: one sign-in per role per run, instead of one per test.

#### Follow-ups

- **What if sessions expire during a long run?** Sign in per worker with a worker-scoped fixture instead of one file for the whole run, or extend the test IdP's session length.
- **How does this change with SAML?** The setup project goes through the IdP redirect once with a test user without MFA; the saved state then holds the app's session cookie, so the tests themselves never touch the IdP.
