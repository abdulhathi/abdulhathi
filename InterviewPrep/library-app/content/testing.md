---
title: Unit, integration and contract testing across the stack
goal: Explain where each kind of test belongs, and write unit, component, integration and contract tests for React, Node and FastAPI code, including streaming endpoints and hooks.
minutes: 60
---

Senior full-stack roles routinely ask for a track record of unit, integration and end-to-end tests with Jest, Vitest, Playwright or Cypress. Interviewers check three things: your **strategy** (what you test at which level, and why), your **fluency** with the tools (mocking, fake timers, React Testing Library queries), and how you handle the hard cases in modern apps: **streaming responses, WebSockets, async workers and flaky tests**. End-to-end testing with Playwright has its own chapter, [Playwright](#/playwright), and Python specifics (fixtures, parametrisation, `unittest.mock`) are in [Testing with pytest](#/py-testing).

Your resume lists Jest, React Testing Library, Cypress with Cucumber, xUnit, NUnit, integration testing and TDD. Vitest is not listed, but its API is deliberately Jest-compatible, so say exactly that: "I've used Jest; Vitest is the same API on top of Vite." Add that you have used Vitest while preparing only if you actually have.

## What to test where

The classic **test pyramid** says: many fast unit tests, fewer integration tests, very few end-to-end tests. Kent C. Dodds' **testing trophy** shifts the weight to **integration tests** (for a front end, that means rendering components with real children and a mocked network) on top of a wide base of **static checks** (TypeScript, ESLint, mypy). Both agree on the principle that matters: put each check at the cheapest level that can catch the bug, and keep end-to-end tests for the journeys that must never break.

| Level | Tools | What it proves | Example (a streaming agent app) |
|---|---|---|---|
| Static | TypeScript strict, ESLint, mypy, Pydantic/zod schemas | Whole classes of bugs never compile | Discriminated unions for stream events make a missing case a compile error |
| Unit | Vitest/Jest, node:test, pytest | A function or reducer is correct, fast, deterministic | SSE parser, chat reducer, run state machine, retry policy, RBAC rules |
| Component | React Testing Library + MSW | A component works the way a user uses it, with a fake network | The chat box renders streamed tokens; Stop aborts; errors show an alert |
| Integration (service) | FastAPI TestClient, supertest, Testcontainers | Routes, validation, auth and the real database work together | `POST /runs` writes rows; the SSE endpoint emits the right events |
| Contract | Shared schemas, OpenAPI checks, Pact, `buf breaking` | Two services still agree after either one changes | The UI's expected event shapes match what the API emits |
| End to end | Playwright or Cypress | The deployed system works for a real journey | Sign in through the IdP, start a run, approve a step, see it finish |

A good answer names the trade-off: unit tests are fast and pinpoint failures but can pass while the pieces fail to fit together; end-to-end tests catch integration problems but are slow, flakier and vague about the cause.

## Jest, Vitest and the Node test runner

| Task | Jest | Vitest | node:test (built in) |
|---|---|---|---|
| Test function | `test`, `it`, `describe` | same (import from `vitest` or enable globals) | `test`, `describe` from `node:test` |
| Mock function | `jest.fn()` | `vi.fn()` | `mock.fn()` |
| Spy on a method | `jest.spyOn(obj, 'm')` | `vi.spyOn(obj, 'm')` | `mock.method(obj, 'm')` |
| Mock a module | `jest.mock('./x')` | `vi.mock('./x')` | `mock.module()` (behind `--experimental-test-module-mocks`) |
| Fake timers | `jest.useFakeTimers()` | `vi.useFakeTimers()` | `mock.timers.enable()` |
| Advance time | `jest.advanceTimersByTime(ms)` | `vi.advanceTimersByTime(ms)` (and `…Async`) | `mock.timers.tick(ms)` |
| Coverage | built in (Istanbul or V8) | `@vitest/coverage-v8` or `-istanbul` | `--experimental-test-coverage` |

**Why teams move to Vitest:** it reuses the Vite config and transforms, so TypeScript, ESM, path aliases and JSX work with no Babel setup; it is fast in watch mode; and the API is close enough to Jest that most suites migrate by renaming `jest.` to `vi.`. It also has a browser mode that runs component tests in a real browser. **Why Jest is still everywhere:** it is mature, has the largest ecosystem, and is the default in many existing React Native and webpack codebases. Jest's support for native ES modules is still officially experimental (Jest 30 needs Node's `--experimental-vm-modules` flag and a transform setup), which is a common reason for the switch.

**Module mocks are hoisted.** `vi.mock('./api')` (and `jest.mock`) is moved to the top of the file before the imports run, so the factory cannot use variables declared in the test file. Use `vi.hoisted(() => …)` to create values the factory needs, or prefer dependency injection and network-level mocks (MSW) so you mock less.

**Snapshots** are cheap to write and cheap to approve without reading. A 300-line snapshot of a rendered dashboard fails on every harmless markup change and gets updated with `-u` by reflex. Use small inline snapshots for stable serialised output (an error message, a generated SQL string), and explicit assertions for behaviour.

The runnable examples in this lab use the built-in **node:test** runner, so they need nothing installed. The ideas are identical in Vitest. Here is the classic fake-timer test: a debounced search must call the API once, with the last value, only after the user stops typing.

```ts
import assert from 'node:assert/strict';
import { mock, test } from 'node:test';

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

test('calls once, with the last value, after the quiet period', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const search = mock.fn((_query: string) => {});
    const debounced = debounce(search, 300);

    debounced('s');
    debounced('st');
    debounced('str');
    mock.timers.tick(299);
    assert.equal(search.mock.callCount(), 0, 'nothing before the quiet period ends');

    mock.timers.tick(1);
    assert.equal(search.mock.callCount(), 1);
    assert.deepEqual(search.mock.calls[0].arguments, ['str']);
  } finally {
    mock.timers.reset();
  }
});
```

The same test in Vitest replaces `mock.timers.enable` with `vi.useFakeTimers()`, `tick` with `vi.advanceTimersByTime`, and `mock.fn` with `vi.fn`. When the code under test also awaits promises between timers (a retry loop with `await sleep(…)`), use the async variants (`vi.advanceTimersByTimeAsync`) so pending promise callbacks run between timer jumps.

## React Testing Library

React Testing Library (RTL) renders a component into jsdom and gives you queries that find elements **the way a user or screen reader does**, not by implementation details such as class names, state or component names. The guiding rule from its docs: the more your tests resemble the way your software is used, the more confidence they give you.

**Query priority:** `getByRole` (with `{ name }`) first, then `getByLabelText`, `getByPlaceholderText`, `getByText`, `getByDisplayValue`, `getByAltText`, `getByTitle`, and `getByTestId` only as a last resort. A test that cannot find a button by role and name has usually found an accessibility bug.

| Variant | No match | Many matches | Waits? | Use it for |
|---|---|---|---|---|
| `getBy…` | throws | throws | no | Elements that must be there now |
| `queryBy…` | returns `null` | throws | no | Asserting something is **absent** |
| `findBy…` | rejects | rejects | yes (default 1000 ms) | Elements that appear after async work |
| `…AllBy…` | (same rules) | returns an array | (same) | Lists |

- **user-event over fireEvent.** `userEvent.setup()` then `await user.type(…)` and `await user.click(…)` simulate the full sequence a browser fires (pointer events, focus, keydown, input, keyup), so you catch bugs that a single synthetic `fireEvent.change` skips. Call `setup()` before rendering.
- **`waitFor`** retries a callback until it stops throwing. Put only assertions inside it, never side effects such as clicks; prefer `findBy…`, which is `getBy…` plus `waitFor`.
- **The `act(...)` warning** means state changed outside a moment RTL knew about, usually an async update that finished after the test moved on. The fix is almost never to wrap things in `act` by hand: await the thing the user would wait for (`await screen.findByText(…)`), or make sure the test ends after the async work.
- **`renderHook`** tests a custom hook on its own; but if the hook is only used by one component, testing through the component is usually more valuable.
- **Cleanup:** RTL unmounts after each test automatically only when your runner exposes a global `afterEach` (Vitest with `globals: true`, or Jest). Without globals, call `cleanup()` in your own `afterEach`.

**The simplest way to fake the network** is to stub `fetch` for one test with `vi.stubGlobal` and return a real `Response`. It is fine for a component that makes one call; for anything bigger, use MSW (below), which does not care how the component fetches.

```tsx
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

export function MemberLookup() {
  const [id, setId] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lookup = async () => {
    setError(null);
    const res = await fetch(`/api/members/${id}`);
    if (!res.ok) return setError('Member not found');
    const data = (await res.json()) as { name: string };
    setResult(data.name);
  };
  return (
    <div>
      <label>
        Member ID <input value={id} onChange={(e) => setId(e.target.value)} />
      </label>
      <button onClick={lookup}>Look up</button>
      {result && <p>Found {result}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('shows the member name after a successful lookup', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ name: 'Ana Ruiz' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const user = userEvent.setup();
  render(<MemberLookup />);

  await user.type(screen.getByLabelText('Member ID'), 'MD123456');
  await user.click(screen.getByRole('button', { name: 'Look up' }));

  expect(await screen.findByText('Found Ana Ruiz')).toBeInTheDocument(); // findBy waits for the async update
  expect(fetchMock).toHaveBeenCalledWith('/api/members/MD123456');
});

it('shows an error when the member does not exist', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
  const user = userEvent.setup();
  render(<MemberLookup />);
  await user.click(screen.getByRole('button', { name: 'Look up' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Member not found');
  expect(screen.queryByText(/Found/)).not.toBeInTheDocument(); // queryBy returns null instead of throwing
});
```

Whatever you use to fake the network, cover the states a user can see: **loading, success, empty, server error and validation error**. Interviewers notice when only the happy path is tested.

Here is a complete component test for a streaming chat box: the network is mocked with MSW and the response arrives in chunks, exactly like a token stream.

```tsx
import { useEffect, useRef, useState } from 'react';
import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

type Status = 'idle' | 'streaming' | 'done' | 'error';

export function ChatStream() {
  const [answer, setAnswer] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const abortRef = useRef<AbortController | null>(null);

  // Abort the in-flight stream on unmount, so nothing updates a component that is gone.
  useEffect(() => () => abortRef.current?.abort(), []);

  async function send(prompt: string) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnswer('');
    setStatus('streaming');
    try {
      const res = await fetch(new URL('/api/chat', window.location.origin), {
        method: 'POST',
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done || controller.signal.aborted) break;
        setAnswer((text) => text + value);
      }
      if (!controller.signal.aborted) setStatus('done');
    } catch {
      // A newer send aborted this request: it must not overwrite the new stream's status.
      if (abortRef.current === controller) setStatus(controller.signal.aborted ? 'idle' : 'error');
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send(String(new FormData(e.currentTarget).get('prompt') ?? ''));
      }}
    >
      <label htmlFor="prompt">Message</label>
      <input id="prompt" name="prompt" />
      <button type="submit">Send</button>
      <button type="button" onClick={() => abortRef.current?.abort()} disabled={status !== 'streaming'}>
        Stop
      </button>
      <div role="log" aria-live="polite" aria-busy={status === 'streaming'}>
        {answer}
      </div>
      {status === 'error' && <p role="alert">Something went wrong. Try again.</p>}
    </form>
  );
}

// ---- the tests ----
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function chunked(chunks: string[], gapMs = 5) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, gapMs));
      }
      controller.close();
    },
  });
}

test('renders the answer as it streams in', async () => {
  server.use(http.post('*/api/chat', () => new HttpResponse(chunked(['Hel', 'lo, ', 'world']))));
  const user = userEvent.setup();
  render(<ChatStream />);

  await user.type(screen.getByLabelText('Message'), 'hi');
  await user.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByText('Hello, world')).toBeInTheDocument();
  // The last chunk renders before the stream closes, so wait for the busy flag as well.
  await waitFor(() => expect(screen.getByRole('log')).toHaveAttribute('aria-busy', 'false'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('shows an alert when the API rejects the request', async () => {
  server.use(http.post('*/api/chat', () => HttpResponse.json({ error: 'rate limited' }, { status: 429 })));
  const user = userEvent.setup();
  render(<ChatStream />);

  await user.type(screen.getByLabelText('Message'), 'hi');
  await user.click(screen.getByRole('button', { name: 'Send' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
});
```

Two details in the component are interview points in their own right. Each send aborts the previous one, and the old request's `catch` checks `abortRef.current === controller` before touching state, so a stale stream can never overwrite the new one's status. And the effect cleanup aborts the stream on unmount.

Notice what the test does **not** do: it never reads component state, never mocks `fetch` directly, and never checks how many times something rendered. It types, clicks and looks at the screen, so a refactor from `useState` to `useReducer` or to TanStack Query keeps it green.

## Mocking the network with MSW

**Mock Service Worker** intercepts requests at the network layer: a Service Worker in the browser, and request interceptors in Node. Your code calls the real `fetch` or Axios, so the test exercises your real request-building and response-parsing code. The same handlers can drive unit tests, Storybook and local development before the backend exists.

- `setupServer(...handlers)` from `msw/node` for Node test runners; `setupWorker` from `msw/browser` for the browser.
- `server.listen({ onUnhandledRequest: 'error' })` makes any request you forgot to mock fail loudly instead of hitting the internet.
- `server.use(handler)` overrides a handler **for one test** (the error case), and `server.resetHandlers()` in `afterEach` removes those overrides.
- `HttpResponse.json(body, { status })`, `HttpResponse.error()` (a network failure), and `delay(ms)` cover most cases.
- **Streaming:** return a `ReadableStream` as the response body, as in the test above. MSW 2 also ships an `sse()` handler for Server-Sent Events and a `ws` API for WebSockets. The `sse()` handler needs the `EventSource` API in the environment: browsers have it; Node 25 only behind `--experimental-eventsource`, which is why the runnable example below streams a plain body.

This example runs under Node: the mocked endpoint splits SSE events across chunk boundaries (as real networks do), and the test proves the consumer still gets whole events.

```ts
import assert from 'node:assert/strict';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

type SSEEvent = { event: string; data: string; id?: string };

/** Reads a fetch Response as Server-Sent Events, however the bytes are chunked. */
async function* readSSE(res: Response): AsyncGenerator<SSEEvent> {
  if (!res.body) return;
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    // Normalise CRLF and CR to LF, but hold back a trailing \r: its \n may arrive in the next chunk.
    buffer += value;
    const heldCR = buffer.endsWith('\r');
    buffer = (heldCR ? buffer.slice(0, -1) : buffer).replace(/\r\n?/g, '\n') + (heldCR ? '\r' : '');
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const ev: SSEEvent = { event: 'message', data: '' };
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (!line || line.startsWith(':')) continue;
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const val = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'data') data.push(val);
        else if (field === 'event') ev.event = val || 'message'; // an empty event field means the default type
        else if (field === 'id') ev.id = val;
      }
      if (data.length) yield { ...ev, data: data.join('\n') };
    }
  }
}

// The wire bytes for three events (the first with CRLF line endings), cut at awkward places:
// mid-field, between a \r and its \n, and between the two line breaks that end an event.
const wire = 'id: 1\r\nevent: token\r\ndata: {"t":"Hel"}\r\n\r\nid: 2\nevent: token\ndata: {"t":"lo"}\n\n: keep-alive\n\nevent: done\ndata: {}\n\n';
const crlfEnd = wire.indexOf('\r\n\r\n');
const cuts = [7, crlfEnd + 1, crlfEnd + 3, wire.indexOf('\n\n', crlfEnd + 4) + 1, wire.length];
assert.deepEqual(cuts, cuts.toSorted((a, b) => a - b), 'cut positions must increase');

const server = setupServer(
  http.get('https://api.test/runs/:id/events', () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let from = 0;
        for (const to of cuts) {
          controller.enqueue(encoder.encode(wire.slice(from, to)));
          from = to;
          await new Promise((resolve) => setTimeout(resolve, 2));
        }
        controller.close();
      },
    });
    return new HttpResponse(stream, { headers: { 'Content-Type': 'text/event-stream' } });
  }),
);
server.listen({ onUnhandledRequest: 'error' });

try {
  const events: SSEEvent[] = [];
  for await (const ev of readSSE(await fetch('https://api.test/runs/r1/events'))) events.push(ev);
  assert.deepEqual(
    events.map((e) => [e.event, e.id ?? null, e.data]),
    [
      ['token', '1', '{"t":"Hel"}'],
      ['token', '2', '{"t":"lo"}'],
      ['done', null, '{}'],
    ],
  );
  await assert.rejects(fetch('https://api.test/unmocked'), 'unhandled requests fail instead of leaving the machine');
} finally {
  server.close();
}
```

## Testing streaming code

Streaming UIs are hard to test only when everything lives in one big hook. Split them into layers, and test each layer where it is cheapest:

1. **The parser** (bytes to events): pure, unit-tested against every chunk boundary (see the coding problems).
2. **The reducer** (events to UI state): pure, unit-tested with event sequences, including duplicates and errors.
3. **The hook or component** (wiring, abort, cleanup): a few component tests with MSW streams, like the chat box above.
4. **The real transport** (proxies, buffering, reconnects): one or two end-to-end or real-server tests.

The reducer is where most product rules live, so it deserves the most cases:

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

type Message = { id: string; role: 'user' | 'assistant'; text: string; status: 'streaming' | 'done' | 'error'; error?: string };
type StreamEvent =
  | { type: 'user'; id: string; text: string }
  | { type: 'token'; id: string; token: string }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; message: string };

function chatReducer(messages: Message[], e: StreamEvent): Message[] {
  switch (e.type) {
    case 'user':
      return [...messages, { id: e.id, role: 'user', text: e.text, status: 'done' }];
    case 'token': {
      const existing = messages.find((m) => m.id === e.id);
      if (!existing) return [...messages, { id: e.id, role: 'assistant', text: e.token, status: 'streaming' }];
      if (existing.status !== 'streaming') return messages; // late or duplicate token after done: ignore
      return messages.map((m) => (m.id === e.id ? { ...m, text: m.text + e.token } : m));
    }
    case 'done':
      return messages.map((m) => (m.id === e.id && m.status === 'streaming' ? { ...m, status: 'done' } : m));
    case 'error':
      return messages.map((m) => (m.id === e.id ? { ...m, status: 'error', error: e.message } : m));
  }
}

const run = (events: StreamEvent[]) => events.reduce(chatReducer, [] as Message[]);

test('tokens build up one assistant message', () => {
  const state = run([
    { type: 'user', id: 'u1', text: 'Create the PO' },
    { type: 'token', id: 'a1', token: 'Draft' },
    { type: 'token', id: 'a1', token: 'ing…' },
    { type: 'done', id: 'a1' },
  ]);
  assert.deepEqual(state.map((m) => [m.role, m.text, m.status]), [
    ['user', 'Create the PO', 'done'],
    ['assistant', 'Drafting…', 'done'],
  ]);
});

test('a token that arrives after done is ignored', () => {
  const state = run([
    { type: 'token', id: 'a1', token: 'OK' },
    { type: 'done', id: 'a1' },
    { type: 'token', id: 'a1', token: ' (dup)' },
  ]);
  assert.equal(state[0].text, 'OK');
});

test('an error keeps the partial text so the user sees what arrived', () => {
  const state = run([
    { type: 'token', id: 'a1', token: 'Half an ans' },
    { type: 'error', id: 'a1', message: 'stream interrupted' },
  ]);
  assert.deepEqual([state[0].text, state[0].status, state[0].error], ['Half an ans', 'error', 'stream interrupted']);
});

test('the reducer never mutates the previous state', () => {
  const before: Message[] = [{ id: 'a1', role: 'assistant', text: 'Hi', status: 'streaming' }];
  const frozen = structuredClone(before);
  chatReducer(before, { type: 'token', id: 'a1', token: '!' });
  assert.deepEqual(before, frozen);
});
```

What to assert for any stream: events arrive **in order**; partial chunks are reassembled; **abort** stops the request and causes no state update after unmount; an **error mid-stream** keeps the partial result and shows a retry; a **reconnect** resumes from `Last-Event-ID` without duplicating tokens.

## Python services: pytest

Python services are tested with pytest, and [Testing with pytest](#/py-testing) covers it in depth: fixtures with `yield` and scopes, `conftest.py`, parametrisation, `monkeypatch` and `unittest.mock` (patch where the name is looked up, autospec), async tests with `@pytest.mark.anyio` (AnyIO's plugin ships with FastAPI), and FastAPI's `TestClient` with `dependency_overrides`. The next section builds on that for the part specific to streaming: SSE and WebSocket endpoints.

## Testing FastAPI, SSE and WebSocket endpoints

`TestClient` runs the app in-process, and `app.dependency_overrides` swaps the real LLM client, database session or auth check for a fake (the basics are in [Testing with pytest](#/py-testing)). Two things to know for streaming:

- `client.stream("GET", url)` lets you read an SSE response line by line, and `client.websocket_connect(url)` gives you a socket to `send_json` and `receive_json`.
- **TestClient waits for the whole response body before giving it to you** (so does `httpx.ASGITransport`). That is fine for a finite stream that ends with a `done` event, but an endless stream (a live run, keep-alive pings) makes the test hang. Make streams finite in tests through a dependency (a fake LLM that ends), and test endless-stream behaviour against a real server, shown after this example.

```python
import json
from collections.abc import AsyncIterator
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.testclient import TestClient

app = FastAPI()


class LLM:
    async def stream(self, prompt: str) -> AsyncIterator[str]:
        raise NotImplementedError("the real client calls a model API")
        yield ""


def get_llm() -> LLM:
    return LLM()


@app.get("/chat", response_class=EventSourceResponse)
async def chat(prompt: str, llm: Annotated[LLM, Depends(get_llm)]) -> AsyncIterator[ServerSentEvent]:
    n = 0
    async for token in llm.stream(prompt):
        yield ServerSentEvent(data={"token": token}, event="token", id=str(n))
        n += 1
    yield ServerSentEvent(data={"tokens": n}, event="done")


@app.websocket("/runs/{run_id}/control")
async def control(websocket: WebSocket, run_id: str) -> None:
    await websocket.accept()
    try:
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "approve":
                await websocket.send_json({"type": "approved", "run": run_id, "step": msg["step"]})
            else:
                await websocket.close(code=4400, reason="unknown message type")
                return
    except WebSocketDisconnect:
        pass


class FakeLLM(LLM):
    def __init__(self, tokens: list[str]) -> None:
        self.tokens = tokens
        self.prompts: list[str] = []

    async def stream(self, prompt: str) -> AsyncIterator[str]:
        self.prompts.append(prompt)
        for token in self.tokens:
            yield token


def parse_sse(body: str) -> list[dict[str, str]]:
    events = []
    for block in body.strip().split("\n\n"):
        fields = {}
        for line in block.splitlines():
            if line and not line.startswith(":"):
                key, _, value = line.partition(": ")
                fields[key] = value
        events.append(fields)
    return events


@pytest.fixture
def fake_llm():
    llm = FakeLLM(["Hel", "lo"])
    app.dependency_overrides[get_llm] = lambda: llm
    yield llm
    app.dependency_overrides.clear()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_sse_stream_emits_tokens_then_done(client, fake_llm):
    with client.stream("GET", "/chat", params={"prompt": "hi"}) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        events = parse_sse(res.read().decode())
    assert [e["event"] for e in events] == ["token", "token", "done"]
    assert [e.get("id") for e in events] == ["0", "1", None]
    assert json.loads(events[-1]["data"]) == {"tokens": 2}
    assert fake_llm.prompts == ["hi"]


def test_websocket_approves_a_step(client):
    with client.websocket_connect("/runs/r1/control") as ws:
        ws.send_json({"type": "approve", "step": "create-po"})
        assert ws.receive_json() == {"type": "approved", "run": "r1", "step": "create-po"}


def test_websocket_rejects_unknown_messages(client):
    with client.websocket_connect("/runs/r1/control") as ws:
        ws.send_json({"type": "delete-everything"})
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
    assert closed.value.code == 4400


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

For the endless case, start uvicorn on a free port in a background thread and read the stream with a real HTTP client. This also proves something TestClient cannot: when the client disconnects, the server's generator is cancelled and its `finally` block runs, so a stopped chat does not keep burning model tokens.

```python
import asyncio
import threading
import time

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.sse import EventSourceResponse, ServerSentEvent

app = FastAPI()
cleaned_up = threading.Event()


@app.get("/runs/{run_id}/events", response_class=EventSourceResponse)
async def events(run_id: str):
    try:
        n = 0
        while True:  # an endless stream, like a live run
            yield ServerSentEvent(data={"n": n}, event="tick", id=str(n))
            n += 1
            await asyncio.sleep(0.05)
    finally:
        cleaned_up.set()  # runs when the client disconnects


server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="warning"))
thread = threading.Thread(target=server.run, daemon=True)
thread.start()
while not server.started:
    time.sleep(0.01)
port = server.servers[0].sockets[0].getsockname()[1]

try:
    ids: list[str] = []
    with httpx.stream("GET", f"http://127.0.0.1:{port}/runs/r1/events", timeout=5) as res:
        for line in res.iter_lines():
            if line.startswith("id: "):
                ids.append(line.removeprefix("id: "))
            if len(ids) == 3:
                break  # leaving the block closes the connection
    assert ids == ["0", "1", "2"]
    assert cleaned_up.wait(5), "the generator should be cancelled when the client goes away"
finally:
    server.should_exit = True
    thread.join(5)
```

## Integration tests with real dependencies

A fake is fine for logic, but some bugs only exist in the real thing: a Postgres unique-constraint race, JSONB operators, `SKIP LOCKED` semantics, Redis key expiry, a migration that fails on real data. SQLite is not Postgres; it accepts SQL that Postgres rejects and the other way round.

- **Testcontainers** starts a throwaway Docker container per test session (Postgres, Redis, Pub/Sub emulator) and gives you its connection string. It works the same on a laptop and in CI.
- Keep tests independent: run each test inside a transaction you roll back, or truncate tables between tests. Never depend on test order.
- Apply the **real migrations** to the test database, so the migrations are tested too.
- For GCP services, use the official emulators (Firestore, Pub/Sub) in CI, and keep a small smoke suite that runs against a real dev project after deploy.

```python norun
# Needs Docker and the testcontainers package (not installed in this lab).
import psycopg
from testcontainers.postgres import PostgresContainer


def test_claim_next_job_skips_locked_rows():
    with PostgresContainer("postgres:16-alpine") as pg:
        url = pg.get_connection_url(driver=None)
        with psycopg.connect(url, autocommit=True) as setup:
            setup.execute("CREATE TABLE jobs (id int PRIMARY KEY, status text NOT NULL)")
            setup.execute("INSERT INTO jobs VALUES (1, 'queued'), (2, 'queued')")
        with psycopg.connect(url) as a, psycopg.connect(url) as b:
            claim = "SELECT id FROM jobs WHERE status = 'queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED"
            first = a.execute(claim).fetchone()
            second = b.execute(claim).fetchone()
            assert (first[0], second[0]) == (1, 2)  # worker B skips the row worker A holds
```

```ts norun
// Needs Docker and @testcontainers/postgresql (not installed in this lab).
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, expect, test } from 'vitest';

let container: Awaited<ReturnType<PostgreSqlContainer['start']>>;
beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = container.getConnectionUri();
}, 60_000);
afterAll(async () => {
  await container.stop();
});

test('the runs repository saves and loads a run', async () => {
  const { createRun, getRun } = await import('./runs-repository');
  const id = await createRun({ agent: 'procurement', input: 'Create a PO' });
  expect(await getRun(id)).toMatchObject({ agent: 'procurement', status: 'queued' });
});
```

## Contract tests

When the UI team and the API team (or two microservices) deploy independently, the riskiest bug is a silent disagreement about a payload: a renamed field, a new event type the client does not handle, a number that became a string. Contract tests catch that before deploy.

- **Shared schema checks:** the API publishes its contract (OpenAPI, JSON Schema, protobuf), and both sides test against it. In a TypeScript monorepo, a shared zod schema is the contract: the server validates what it emits, the client parses what it receives, and a test runs recorded real payloads through the schema.
- **Consumer-driven contracts (Pact):** each consumer records the interactions it relies on; the provider's CI replays them against the real provider; a broker answers "can I deploy this version?".
- **Protobuf and gRPC:** `buf breaking` compares the new `.proto` files with the last release and fails on breaking changes such as a changed field number or type.
- **OpenAPI diff** tools do the same for REST.

A schema contract test for stream events, runnable:

```ts
import assert from 'node:assert/strict';
import { z } from 'zod';

// The contract both sides import.
const RunEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('token'), runId: z.string(), seq: z.number().int().nonnegative(), text: z.string() }),
  z.object({ type: z.literal('tool_call'), runId: z.string(), seq: z.number().int(), tool: z.string(), args: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal('approval_needed'), runId: z.string(), seq: z.number().int(), step: z.string() }),
  z.object({ type: z.literal('done'), runId: z.string(), seq: z.number().int() }),
]);
type RunEvent = z.infer<typeof RunEvent>;

// Payloads recorded from the real API in a previous run (a fixture file in a real project).
const recorded: unknown[] = [
  { type: 'token', runId: 'r1', seq: 0, text: 'Checking budget' },
  { type: 'tool_call', runId: 'r1', seq: 1, tool: 'sap.create_po', args: { vendor: 'V-100', amount: 1200 } },
  { type: 'approval_needed', runId: 'r1', seq: 2, step: 'create-po' },
  { type: 'done', runId: 'r1', seq: 3 },
];

const parsed: RunEvent[] = recorded.map((payload) => RunEvent.parse(payload));
assert.deepEqual(parsed.map((e) => e.type), ['token', 'tool_call', 'approval_needed', 'done']);
assert.deepEqual(parsed.map((e) => e.seq), [0, 1, 2, 3], 'sequence numbers are contiguous');

// A breaking change on the server must fail the contract, not the user's screen.
const renamed = RunEvent.safeParse({ type: 'token', runId: 'r1', seq: 4, content: 'oops' });
assert.equal(renamed.success, false);
const unknownType = RunEvent.safeParse({ type: 'thinking', runId: 'r1', seq: 5 });
assert.equal(unknownType.success, false);
```

## Flaky tests

A flaky test passes and fails on the same code. It is worse than no test, because people learn to re-run and ignore red builds. Treat each flake as a bug: quarantine it (skip with a ticket) so the build stays trustworthy, then fix the cause.

| Cause | Symptom | Fix |
|---|---|---|
| Fixed sleeps (`sleep(500)`) | Fails on a slow CI machine | Wait for a condition: `findBy…`, `expect.poll`, Playwright's auto-waiting |
| Real time and dates | Fails at midnight, month end, DST | Fake timers, inject a clock, freeze time |
| Shared state between tests | Fails only in a certain order or in parallel | Fresh fixtures, reset mocks and handlers, unique ids per test |
| Real network | Fails when a third party is slow | MSW or a stub server; `onUnhandledRequest: 'error'` |
| Randomness | Fails one run in 50 | Seed the generator; log the seed on failure |
| Async work left running | "act" warnings, errors after the test ends | Await the final UI state; clean up subscriptions, timers and sockets |
| Order of concurrent results | Assertions on the order of parallel results | Sort before comparing, or assert on sets |

Measure it: CI systems and Playwright report tests that only passed on retry. Retries hide flakes; use them to keep the pipeline moving, never as the fix.

## Coverage and confidence

Coverage tells you what was **executed**, not what was **checked**: a test with no assertions can reach 100%. Use it to find untested areas (an error branch nobody exercises), not as a target to game. A sensible stance: high coverage on pure logic (parsers, reducers, state machines, permission rules), behaviour-focused tests on UI, a handful of end-to-end journeys, and a rule that every bug fix comes with a test that would have caught it. Some teams enforce a floor (for example 80% on changed lines) to stop decline; that is fine as long as nobody writes assertion-free tests to meet it.

## Interview questions

### How do you decide what to test at each level? {core}

I put each check at the cheapest level that can catch the bug. Pure logic such as parsers, reducers, state machines and permission rules gets fast unit tests with many cases. Components get React Testing Library tests with the network mocked by MSW, because that is where most UI bugs live. Services get integration tests with the real database. And I keep a small set of end-to-end tests for the journeys that must never break, such as signing in and running an agent to completion.

Then I add the levels between teams: contract tests when the UI and API deploy separately, and static checks (strict TypeScript, Pydantic or zod schemas) underneath everything. The follow-up is usually "what would you not test?" Framework behaviour, trivial getters, and implementation details such as which hook a component uses.

### What is the difference between the test pyramid and the testing trophy?

The pyramid says most tests should be unit tests, fewer integration tests and very few end-to-end tests, because lower levels are faster and more precise. The trophy, from Kent C. Dodds, puts static analysis at the base and makes integration tests the biggest layer, because for front ends a component rendered with its real children and a fake network gives far more confidence per test than isolated unit tests with everything mocked.

They agree on the important part: few end-to-end tests, lots of fast feedback. I use the pyramid language for backend logic and the trophy for React code.

### Jest or Vitest: which would you pick for a new React and TypeScript project? {core}

Vitest, if the app is built with Vite: it reuses the same config and transforms, so TypeScript, ES modules, JSX and path aliases work without a Babel setup, and it is fast in watch mode. The API is almost identical to Jest's (`vi.fn` instead of `jest.fn`), so the team's Jest knowledge carries straight over, and so does React Testing Library.

I would keep Jest in an existing codebase that runs well on it, or where a tool in the stack only supports Jest. My own background is Jest and React Testing Library, plus Cypress and Cucumber at Medidata; moving to Vitest is a rename, not a relearn.

### How does module mocking work, and what does hoisting mean? {deep}

`vi.mock('./api', factory)` (and `jest.mock`) replaces a module for the whole test file. The call is hoisted above the imports, so by the time your code imports `./api` it gets the mock. Because of hoisting, the factory runs before the rest of the file, so it cannot reference variables declared in the test. Either create shared values with `vi.hoisted`, or have the factory return `vi.fn()`s, import the mocked module in the test and configure them there (`vi.mocked(api.fetchRuns).mockResolvedValue(…)`).

I use module mocks sparingly. They couple tests to file structure. For network calls I prefer MSW, and for things like a clock or an LLM client I prefer dependency injection, which keeps tests readable and survives refactors.

### How do you test code that uses timers, such as debounce, retries or heartbeats? {core}

With fake timers. I enable them (`vi.useFakeTimers()` or `mock.timers.enable()`), trigger the code, then move time forward explicitly with `advanceTimersByTime` and assert at each point: nothing before 299 ms, exactly one call at 300. The test runs in milliseconds and never flakes.

When the code awaits promises between timers, like a retry loop with `await sleep(delay)`, I use the async variant (`advanceTimersByTimeAsync`) so promise callbacks run between timer jumps. Another option is to inject the sleep function and the random source, which makes the backoff schedule a plain assertion. With user-event and fake timers together, pass `advanceTimers: vi.advanceTimersByTime` to `userEvent.setup`.

### What is React Testing Library's philosophy, and which queries do you use? {core}

Test the component the way a user uses it: find elements by what users perceive, interact with real events, and assert on what is on the screen. Don't test state, props or which hooks are called. That way a refactor doesn't break tests, and a broken feature does.

The query priority follows that: `getByRole` with an accessible name first, then `getByLabelText`, placeholder, text, and `getByTestId` only as a last resort. A nice side effect is that role-based queries double as an accessibility check: if I cannot find the Send button by role and name, a screen-reader user cannot either.

### What is the difference between getBy, queryBy and findBy?

`getBy` returns the element or throws immediately, so I use it for things that must be there now. `queryBy` returns `null` instead of throwing, so it is the one for asserting absence: `expect(screen.queryByRole('alert')).not.toBeInTheDocument()`. `findBy` returns a promise and retries until the element appears or a timeout (1 second by default), so it is for anything that shows up after async work, like a streamed answer.

All three throw if more than one element matches; the `AllBy` variants return arrays.

### Why use user-event instead of fireEvent?

`fireEvent.change` dispatches one synthetic event. A real user typing fires focus, keydown, keypress, input and keyup for every character, plus pointer events for clicks. `userEvent.setup()` then `await user.type(…)` simulates that full sequence, so it catches bugs like a handler on `onKeyDown`, a disabled button that still received `change`, an input's `maxLength` being ignored, or focus not moving. It is also async, which matches how React applies updates.

### What does the "not wrapped in act(...)" warning mean, and how do you fix it? {deep}

It means React state updated at a moment the test did not wait for, usually an async update (a fetch resolving, a timer firing) that happened after the test's last assertion, or while it was not awaiting anything. The update is real, so the test may be asserting on a stale screen.

The fix is almost never to sprinkle `act()` by hand, because RTL already wraps render and user-event in it. Instead, wait for what the user would wait for: `await screen.findByText(…)` for the final state, or make sure timers, subscriptions and pending requests are finished or cleaned up before the test ends.

### How do you test a custom hook?

If the hook is used by one component, I test it through that component, which is closer to real use. For a reusable hook, such as `useWebSocket` or `useDebouncedValue`, I use `renderHook` from React Testing Library: it renders the hook in a tiny test component and returns `result.current`. I trigger updates inside `act` or through the hook's returned functions, and use `rerender` with new props to test dependency changes. A wrapper option provides context such as a `QueryClientProvider`.

I also move as much logic as possible out of the hook into pure functions, like a reducer, and unit test those directly.

### How do you mock network calls in front-end tests, and why MSW? {core}

I use Mock Service Worker. It intercepts at the network level, so the component calls the real `fetch` or Axios and my real request and parsing code runs. I define handlers per endpoint, override one per test with `server.use` for the error cases, and start the server with `onUnhandledRequest: 'error'` so a forgotten mock fails loudly.

There is a ladder of options: stub `fetch` for one test with `vi.stubGlobal`, mock my API module with `vi.mock('./api')`, or MSW. The first two are fine for a single call, but MSW tests survive switching HTTP libraries or moving to TanStack Query, and the same handlers serve Storybook and local development. For streaming I return a `ReadableStream` body with chunks; MSW 2 also has `sse` and `ws` helpers. Whatever the tool, I cover loading, success, empty, server error and validation error.

### How would you test a chat component that streams an LLM response? {core}

In layers. The parser that turns bytes into events gets unit tests, including events split across every possible chunk boundary. The reducer that turns events into messages gets unit tests for ordering, duplicates, errors and done. Then a few component tests with MSW returning a chunked stream: type a prompt, click Send, `findByText` the full answer, check `aria-busy` goes back to false, check Stop aborts, and check a 429 shows an alert.

Finally one end-to-end test against a real or routed stream, because proxies and buffering only show up there. The key design point is keeping the hook thin, so the hard logic is pure and fast to test.

### How do you test SSE or WebSocket endpoints in FastAPI? {core}

With `TestClient`: `client.stream()` to read an SSE response and `client.websocket_connect()` to exchange JSON messages, with `dependency_overrides` swapping the real model client for a fake that yields known tokens. I assert the content type, the order of events, their ids, and the final `done` event; for sockets, the replies and the close code for bad messages.

The catch is that TestClient collects the whole response before returning it, so an endless stream hangs the test. I make streams finite in tests through the fake, and for endless-stream behaviour and disconnect handling I start uvicorn on a free port in a thread and read it with a real HTTP client. That's also how I prove the generator's `finally` runs when the client disconnects.

### What is the difference between a mock, a stub, a fake and a spy?

A **stub** returns canned answers ("the LLM returns these three tokens"). A **mock** also verifies how it was called ("`create_po` was called once with this vendor"). A **spy** wraps a real function and records calls while keeping the real behaviour. A **fake** is a working lightweight implementation: an in-memory repository, fakeredis, an LLM fake that streams scripted tokens.

I prefer fakes and stubs for state and assert on outcomes; mocks with call assertions are for side effects that are the point of the test, like "the audit log was written" or "the external API was not called twice". In JavaScript these are `vi.fn` and `vi.spyOn`; Python's `unittest.mock` details (where to patch, `return_value` versus `side_effect`, autospec) are in [Testing with pytest](#/py-testing).

### How do you run integration tests against a real Postgres or Redis? {core}

With Testcontainers: the test session starts a throwaway Postgres or Redis container, applies the real migrations, and hands its URL to the app. Each test runs in a transaction that's rolled back, or tables are truncated between tests, so tests stay independent and can run in parallel. The same setup runs locally and in CI, and it catches things a fake never will: constraint races, JSONB queries, `SKIP LOCKED`, key expiry.

For GCP services I use the official emulators (Firestore, Pub/Sub) and keep a small smoke suite that runs against a real dev environment after each deploy.

### What is contract testing, and when is it worth it? {deep}

It checks that a consumer and a provider still agree on an interface when they're developed and deployed separately. With consumer-driven contracts (Pact), the consumer records the requests it makes and the responses it relies on, the provider's CI replays them, and a broker answers "can I deploy?". A lighter version is a shared schema (OpenAPI, protobuf, zod) that both sides test against, plus tools like `buf breaking` for protobuf.

It's worth it when teams deploy independently and breaking changes have hurt you. In a monorepo with one deploy and end-to-end tests over the same journeys, a shared typed schema usually gives most of the value for less effort.

### How do you deal with flaky tests? {core}

I treat a flake as a bug with a deadline. First quarantine it, so the main build stays trustworthy, with a ticket so it doesn't stay skipped. Then find the cause: almost always a fixed sleep instead of waiting for a condition, real time or dates, shared state between tests, a real network call, unseeded randomness, or async work still running when the test ends.

The fixes match: wait on conditions (`findBy`, Playwright auto-waiting), fake timers or an injected clock, fresh fixtures and unique data per test, MSW, seeded random, and cleanup. I track pass-on-retry rates in CI, because retries keep the pipeline moving but hide flakes if nobody looks.

### What test coverage do you aim for?

I don't chase a number. Coverage shows what code ran, not whether anything was checked. I want very high coverage on pure logic (parsers, reducers, state machines, permission rules), behaviour tests on UI, a few end-to-end journeys, and a test with every bug fix. A floor on changed lines, say 80%, is a reasonable guardrail against decline, as long as nobody writes assertion-free tests to hit it. I would rather review whether the important failure paths are tested.

### How do you test async workers and task queues? {deep}

Separate the handler from the transport. The job handler is a plain function that takes a message and dependencies, so I unit test it with fakes: success, a retryable error, a permanent error that goes to the dead-letter queue, and running the same message twice to prove it's idempotent. The retry policy is a pure function, tested with a fake clock.

Then an integration test runs a real worker against the real queue (a Postgres `SKIP LOCKED` table or the Pub/Sub emulator) to prove acknowledgement, visibility timeouts and concurrency behave. For progress events to the UI, I assert the sequence of events the worker publishes.

### How do you test code that calls an LLM? {deep}

I keep the model out of unit tests. A fake model streams scripted tokens and tool calls, so the orchestration, validation and retry logic are deterministic and fast. I unit test the structured-output validation: valid JSON passes, malformed or schema-violating output triggers the repair or retry path, and nothing invalid reaches the downstream API. At Quantiphi, Pydantic schemas were exactly that gate: they enforced the data contract on extracted fields before human review.

Model quality itself is an evaluation problem, not a unit test: a golden set of inputs with expected outputs or rubric scores, run on prompt or model changes and nightly, with thresholds, kept separate from the CI unit suite so a non-deterministic model never makes the build flaky.

### Are snapshot tests good or bad?

Good for small, stable outputs: a serialised error, a generated query, a short inline snapshot. Bad as a substitute for assertions on big component trees. Large snapshots break on every harmless markup change, and reviewers approve the update without reading it, so they stop catching real bugs. If I use them, they are small, inline and reviewed like code.

### Tell me about your testing practice on a recent project. {core}

At Medidata, on myMedidata, I automated CI/CD pipelines with GitHub Actions and AWS CodePipeline, with test coverage through NUnit, Cypress and Cucumber. I've used Jest and React Testing Library for React components, and xUnit, NUnit and integration tests on the .NET side. At Quantiphi the Pydantic schemas worked as executable contracts on the AI-extracted fields, checked before anything reached human review.

Then connect it to the role you are interviewing for, for example: "For streaming and agent workflows I'd keep the same pyramid, with the parser and state-machine logic unit tested, MSW streams for components, a real-server test for disconnect handling, and Playwright for the journey." Only claim what you've actually done; Vitest and Playwright you can describe as prepared, not used in production.

## Coding problems

### Test a debounced search with fake timers {easy core}

A search box calls `onSearch(query)` through `debounce(fn, 300)`. Write tests that prove: no call while the user is typing, exactly one call 300 ms after the last keystroke with the last value, and a new call after another pause. The tests must run in milliseconds.

#### Hints

1. Real waiting makes the test slow and flaky. What can replace the clock?
2. Enable fake timers, call the debounced function several times, then advance time to 1 ms before and exactly at the deadline.
3. Use a mock function to record calls and their arguments.

#### Solution

Fake timers let the test control time. Assert at the boundary (299 ms and 300 ms), because off-by-one timer bugs live there, and include the "second burst" case to prove the timer resets.

```ts
import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

test('no call while typing, one call after the pause', () => {
  const onSearch = mock.fn((_q: string) => {});
  const search = debounce(onSearch, 300);
  for (const q of ['p', 'pu', 'pur', 'purc']) {
    search(q);
    mock.timers.tick(100); // typing faster than the debounce window
  }
  assert.equal(onSearch.mock.callCount(), 0);
  mock.timers.tick(199); // 299 ms since the last keystroke
  assert.equal(onSearch.mock.callCount(), 0);
  mock.timers.tick(1);
  assert.equal(onSearch.mock.callCount(), 1);
  assert.deepEqual(onSearch.mock.calls[0].arguments, ['purc']);
});

test('a second burst produces a second call', () => {
  const onSearch = mock.fn((_q: string) => {});
  const search = debounce(onSearch, 300);
  search('po');
  mock.timers.tick(300);
  search('po-1');
  mock.timers.tick(300);
  assert.deepEqual(onSearch.mock.calls.map((c) => c.arguments[0]), ['po', 'po-1']);
});
```

Complexity: each test runs in constant time regardless of the debounce delay.

#### Follow-ups

- **How would you test the debounced search in a React component?** `vi.useFakeTimers()`, `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, type into the box, advance time, and assert MSW received one request.
- **What about cancelling the in-flight request when a new query fires?** Assert the first request's `AbortSignal` is aborted, and that a late response for the old query never replaces the newer results.

### Prove an SSE parser handles every chunk boundary {medium core}

Networks split data wherever they like: in the middle of a field name, between `\r` and `\n`, or exactly between the two newlines that end an event. You have an incremental SSE parser with `feed(chunk)` and `end()`. Write a test that proves it produces the same events however the input is split.

#### Hints

1. You can't guess every bad split, but you can try all of them for a small input.
2. For every index `i`, feed `wire.slice(0, i)` and `wire.slice(i)` as two chunks; then also feed one character at a time.
3. Compare against the events from feeding the whole string at once, and against an expected list written by hand. Include CRLF line endings and a comment line.

#### Solution

An exhaustive split test is cheap (the input is small) and catches the classic bug of parsing per chunk instead of buffering until a blank line. Testing CRLF matters because the spec allows `\r\n`, `\r` or `\n`, and a CRLF can itself be split across chunks.

```ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

type SSEEvent = { event: string; data: string; id?: string };

function createParser(onEvent: (e: SSEEvent) => void) {
  let buffer = '';
  let pendingCR = false;
  let data: string[] = [];
  let event = '';
  let id: string | undefined;

  function line(text: string) {
    if (text === '') {
      if (data.length) onEvent({ event: event || 'message', data: data.join('\n'), ...(id !== undefined ? { id } : {}) });
      data = [];
      event = '';
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    const value = colon === -1 ? '' : text.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
    else if (field === 'id') id = value;
  }

  return {
    feed(chunk: string) {
      for (const ch of chunk) {
        if (pendingCR) {
          pendingCR = false;
          if (ch === '\n') continue; // second half of a CRLF split across chunks
        }
        if (ch === '\r') {
          line(buffer);
          buffer = '';
          pendingCR = true;
        } else if (ch === '\n') {
          line(buffer);
          buffer = '';
        } else {
          buffer += ch;
        }
      }
    },
    end() {
      buffer = ''; // an unterminated event at the end of the stream is dropped, as the spec says
    },
  };
}

function parseInChunks(chunks: string[]): SSEEvent[] {
  const out: SSEEvent[] = [];
  const parser = createParser((e) => out.push(e));
  for (const c of chunks) parser.feed(c);
  parser.end();
  return out;
}

const wire = 'id: 7\r\nevent: token\r\ndata: {"t":"Hel"}\r\n\r\n: ping\n\ndata: line one\ndata: line two\n\nevent: done\ndata: {}\n\n';
const expected: SSEEvent[] = [
  { event: 'token', data: '{"t":"Hel"}', id: '7' },
  { event: 'message', data: 'line one\nline two', id: '7' },
  { event: 'done', data: '{}', id: '7' },
];

test('whole input parses to the expected events', () => {
  assert.deepEqual(parseInChunks([wire]), expected);
});

test('every two-chunk split gives the same events', () => {
  for (let i = 0; i <= wire.length; i++) {
    assert.deepEqual(parseInChunks([wire.slice(0, i), wire.slice(i)]), expected, `split at ${i}`);
  }
});

test('one character at a time gives the same events', () => {
  assert.deepEqual(parseInChunks([...wire]), expected);
});

test('an unterminated final event is not emitted', () => {
  assert.deepEqual(parseInChunks(['data: partial']), []);
});
```

Complexity: O(n²) characters processed for the split test (n splits of an n-character input), which is trivial for a few hundred bytes.

#### Follow-ups

- **Why does the id carry over to later events?** In the SSE spec the last event ID persists until changed; it is what the browser sends as `Last-Event-ID` when reconnecting.
- **How would you go further?** Property-based testing (fast-check or Hypothesis): generate random events, serialise them, split randomly, and assert the round trip.

### Test retry with backoff without sleeping {medium core}

`call_with_retry(fn, attempts, sleep, rand)` calls `fn`, retries on `TransientError` with exponential backoff and full jitter (`rand() * min(cap, base * 2**i)`), and re-raises immediately on any other error. Write pytest tests that run instantly and prove the schedule, the give-up behaviour and the no-retry case.

#### Hints

1. If the function calls `time.sleep` directly, the test must wait. What if `sleep` and `rand` were parameters?
2. Record the delays passed to a fake `sleep`; make `rand` return 1.0 so the jitter is predictable.
3. Use a fake `fn` that fails a set number of times, and parametrize the cases.

#### Solution

Injecting `sleep` and `rand` turns timing into data you can assert on. Parametrize the scenarios, and check the call count as well as the result, because "retried the wrong number of times" is the classic bug.

```python
import pytest


class TransientError(Exception):
    pass


def call_with_retry(fn, attempts, sleep, rand, base=0.5, cap=8.0):
    for i in range(attempts):
        try:
            return fn()
        except TransientError:
            if i == attempts - 1:
                raise
            sleep(rand() * min(cap, base * 2**i))


class Flaky:
    def __init__(self, failures: int, error: type[Exception] = TransientError) -> None:
        self.failures, self.error, self.calls = failures, error, 0

    def __call__(self) -> str:
        self.calls += 1
        if self.calls <= self.failures:
            raise self.error("boom")
        return "ok"


@pytest.fixture
def sleeps():
    return []


@pytest.mark.parametrize(
    ("failures", "expected_delays"),
    [(0, []), (1, [0.5]), (3, [0.5, 1.0, 2.0])],
    ids=["first-try", "one-retry", "three-retries"],
)
def test_succeeds_after_transient_failures(sleeps, failures, expected_delays):
    fn = Flaky(failures)
    assert call_with_retry(fn, attempts=5, sleep=sleeps.append, rand=lambda: 1.0) == "ok"
    assert sleeps == expected_delays
    assert fn.calls == failures + 1


def test_gives_up_after_the_last_attempt(sleeps):
    fn = Flaky(failures=10)
    with pytest.raises(TransientError):
        call_with_retry(fn, attempts=3, sleep=sleeps.append, rand=lambda: 1.0)
    assert fn.calls == 3
    assert sleeps == [0.5, 1.0]  # no sleep after the final failure


def test_does_not_retry_permanent_errors(sleeps):
    fn = Flaky(failures=1, error=ValueError)
    with pytest.raises(ValueError):
        call_with_retry(fn, attempts=5, sleep=sleeps.append, rand=lambda: 1.0)
    assert fn.calls == 1
    assert sleeps == []


def test_jitter_and_cap(sleeps):
    call_with_retry(Flaky(6), attempts=7, sleep=sleeps.append, rand=lambda: 0.5)
    assert sleeps == [0.25, 0.5, 1.0, 2.0, 4.0, 4.0]  # half of 0.5, 1, 2, 4, 8, 8 (capped)


if __name__ == "__main__":
    assert pytest.main([__file__, "-q", "-p", "no:cacheprovider"]) == 0
```

Complexity: each test is O(attempts) and takes microseconds.

#### Follow-ups

- **How would you test the same thing if the code called `time.sleep` directly?** `monkeypatch.setattr(time, "sleep", sleeps.append)`, which works but couples the test to the implementation; injection is cleaner.
- **What about async code?** Inject an async sleep (`async def fake_sleep(d): delays.append(d)`) and run the test with `@pytest.mark.anyio`.

### Test a consumer that must survive an error mid-stream {medium}

`collectAnswer(url)` fetches a streaming endpoint and concatenates text chunks. If the stream breaks halfway, it must return the partial text with `complete: false` instead of throwing. Use MSW to simulate a stream that sends two chunks and then errors, and a normal stream, and test both.

#### Hints

1. A `ReadableStream` can fail after enqueuing data: call `controller.error(new Error(...))`.
2. The consumer's read loop throws when the stream errors; catch it and keep what you have.
3. Override the handler per case, or use two URLs, and assert both the text and the flag.

#### Solution

The point of the test is the failure path, which is the one a real network will eventually take. MSW lets you produce it deterministically.

```ts
import assert from 'node:assert/strict';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

async function collectAnswer(url: string): Promise<{ text: string; complete: boolean }> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let text = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return { text, complete: true };
      text += value;
    }
  } catch {
    return { text, complete: false };
  }
}

function stream(chunks: string[], failAfter?: number) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [i, chunk] of chunks.entries()) {
        if (i === failAfter) {
          controller.error(new Error('connection reset'));
          return;
        }
        controller.enqueue(encoder.encode(chunk));
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      controller.close();
    },
  });
}

const server = setupServer(
  http.get('https://api.test/ok', () => new HttpResponse(stream(['The PO ', 'was created.']))),
  http.get('https://api.test/broken', () => new HttpResponse(stream(['The PO ', 'was ', 'never sent'], 2))),
  http.get('https://api.test/limited', () => HttpResponse.json({ error: 'rate limited' }, { status: 429 })),
);
server.listen({ onUnhandledRequest: 'error' });

try {
  assert.deepEqual(await collectAnswer('https://api.test/ok'), { text: 'The PO was created.', complete: true });
  assert.deepEqual(await collectAnswer('https://api.test/broken'), { text: 'The PO was ', complete: false });
  await assert.rejects(collectAnswer('https://api.test/limited'), /HTTP 429/);
} finally {
  server.close();
}
```

Complexity: O(total bytes) for the consumer; the test runs in a few milliseconds.

#### Follow-ups

- **What should the UI do with `complete: false`?** Keep the partial answer visible, mark it interrupted, and offer Retry; with SSE ids, resume from the last event instead of starting over.
- **How would you test the retry?** A handler that fails the first call and succeeds the second (track calls in a closure), asserting the user sees one complete answer with no duplicated text.
