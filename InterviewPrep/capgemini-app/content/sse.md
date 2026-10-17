---
title: "Server-Sent Events: streaming tokens to the browser"
goal: Explain, build and defend an SSE stream end to end, from the wire format and browser clients to FastAPI and Node servers, resume after a drop, proxies and Cloud Run.
minutes: 70
---

The JD asks for "proven experience with client-server streaming protocols" and for chat interfaces that stream LLM responses over WebSockets or **Server-Sent Events**. SSE is how OpenAI, Anthropic and Gemini stream tokens. It is also the simplest correct choice for most "server pushes, browser watches" features on an agent platform: token streams, run progress and log tails. Expect questions at three levels. What is it? How do you build it in FastAPI or Node? What breaks in production (buffering, reconnects, timeouts, auth)?

Your resume does not show SSE yet, so this chapter takes you from zero to "can build and defend it". Every server and client here was run. The [streaming project](#/streaming-project) puts the pieces together into an app you can run and talk about.

## The 60-second version

- **What it is:** one long-lived HTTP response with `Content-Type: text/event-stream`. The server keeps the response open and writes small text events into it whenever it has something new.
- **Direction:** server to client only. The client talks back with ordinary HTTP requests (start a run, cancel it, approve a tool call).
- **Why it fits LLM tokens:** it is plain HTTP, so it passes through load balancers, proxies, auth middleware and Cloud Run without special handling. The browser's `EventSource` reconnects by itself and tells the server the last event it received, which gives you resume almost for free.
- **When not to use it:** you need a high-rate, low-latency channel from client to server on the same connection (collaborative cursors, voice, games), or you need binary frames. Then use WebSockets (see [WebSockets](#/websockets)).

## The wire format

An SSE stream is UTF-8 text made of **events separated by a blank line**. Each line is `field: value`.

```text
: connected                      ← a comment (starts with a colon); clients ignore it, proxies see traffic
retry: 3000                      ← reconnect delay in milliseconds

event: token
id: 17
data: {"text":"Hel"}

event: token
id: 18
data: {"text":"lo"}

data: first line
data: second line                ← two data lines become "first line\nsecond line"

```

| Field | Meaning |
|---|---|
| `data` | The payload. Several `data` lines in one event are joined with `\n`. An event with no `data` is not dispatched. |
| `event` | The event type. The browser dispatches it to `addEventListener('<type>')`. Without it, the type is `message`. |
| `id` | Sets the **last event ID**, committed when the event completes. The browser sends it back in a `Last-Event-ID` header when it reconnects. It persists until another `id` line changes it; an empty `id:` resets it, and then no header is sent. |
| `retry` | Reconnect delay in milliseconds (digits only). |
| `:` comment | Ignored by the client. Used for keep-alive pings so idle proxies do not close the connection. |

Details interviewers like:

- **Line endings** can be `\n`, `\r\n` or `\r`. Exactly **one** space after the colon is stripped (`data:  x` keeps one space). Unknown field names are ignored.
- The format is **text only**. Binary must be base64-encoded, which usually means you wanted WebSockets.
- A payload is normally one line of JSON. If your data can contain newlines, the server must split it into several `data:` lines. Otherwise an attacker-controlled string like `"hi\n\nevent: admin"` could forge a whole new event. This is SSE injection, and the third coding problem below is about it.

## Browser client 1: EventSource

`EventSource` is the built-in client: a GET request, a parser, named events and automatic reconnection.

```ts typecheck
type Token = { text: string };

/** Subscribe to a run's events. Returns a function that stops the stream. */
export function watchRun(runId: string, handlers: { onToken: (text: string) => void; onDone: () => void; onFatal: () => void }) {
  // withCredentials sends cookies cross-origin. The server must then answer with
  // Access-Control-Allow-Origin set to the exact origin and Access-Control-Allow-Credentials: true.
  const source = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`, { withCredentials: true });

  source.addEventListener('token', (e) => handlers.onToken((JSON.parse(e.data) as Token).text));
  source.addEventListener('done', () => {
    // Close explicitly: when the server ends the response, EventSource treats it as a
    // dropped connection and reconnects after the retry delay.
    source.close();
    handlers.onDone();
  });
  source.onerror = () => {
    // readyState CONNECTING (0) means the browser is already retrying, which is normal after a drop.
    // CLOSED (2) means it gave up: a non-200 status, a wrong Content-Type, or HTTP 204.
    if (source.readyState === EventSource.CLOSED) handlers.onFatal();
  };
  return () => source.close();
}
```

What `EventSource` does for you, and what it cannot do:

| It does | It cannot |
|---|---|
| Parse the stream and dispatch named events | Send custom headers such as `Authorization` |
| Reconnect after a drop, waiting `retry` ms | Use POST or send a request body |
| Send `Last-Event-ID` on reconnect | Send `Last-Event-ID` on the very first connect (for example after a page reload) |
| Stop for good on HTTP 204, non-200 or a wrong Content-Type | Expose the HTTP status code of a failure |

## Browser client 2: fetch and a ReadableStream

For a chat UI you usually want to **POST** the prompt, send an **Authorization** header, and stop on a **Stop button**. `fetch` gives you all three: `response.body` is a `ReadableStream` of bytes, and `AbortController` cancels it. The cost is that you parse the stream yourself and handle reconnects yourself. Libraries such as Microsoft's `@microsoft/fetch-event-source` do this for you.

The classic bug is decoding each chunk separately. A network chunk can end in the middle of a multi-byte UTF-8 character. Each chunk must go through **one** `TextDecoder` with `{ stream: true }`, or through `TextDecoderStream`, which does the same thing:

```ts
import assert from 'node:assert/strict';

const bytes = new TextEncoder().encode('data: {"text":"héllo 👋"}\n\n');
const cut = bytes.length - 5; // the cut lands inside the 4-byte emoji

// Wrong: a fresh decoder per chunk turns the split character into U+FFFD replacement characters.
const wrong = new TextDecoder().decode(bytes.slice(0, cut)) + new TextDecoder().decode(bytes.slice(cut));
assert.ok(wrong.includes('\uFFFD'));

// Right: one decoder, stream: true keeps the incomplete bytes until the next chunk arrives.
const decoder = new TextDecoder();
const right = decoder.decode(bytes.slice(0, cut), { stream: true }) + decoder.decode(bytes.slice(cut));
assert.equal(right, 'data: {"text":"héllo 👋"}\n\n');
```

After decoding, the text can still split anywhere: mid-line, mid-field, even between `\r` and `\n`. The first coding problem below builds a parser that handles every split point, and its test proves it.

## Server 1: FastAPI

Recent FastAPI versions include SSE support in `fastapi.sse` (checked on the installed 0.143). Set `response_class=EventSourceResponse` and make the path operation a generator. Yield `ServerSentEvent` objects for full control, or plain objects, which are sent as JSON in `data`. FastAPI sets `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and it sends a `: ping` comment when the generator has been quiet for 15 seconds.

```python
import asyncio
from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import FastAPI, Header
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.testclient import TestClient
from pydantic import BaseModel

app = FastAPI()

# An append-only event log per run. Ids are positions in the log, which is what makes resume possible.
RUNS: dict[str, list[dict]] = {
    "run-1": [{"type": "token", "text": t} for t in ["Hel", "lo", " wor", "ld"]] + [{"type": "done"}],
}


class Token(BaseModel):
    text: str


@app.get("/runs/{run_id}/events", response_class=EventSourceResponse)
async def stream_run(
    run_id: str,
    last_event_id: Annotated[int | None, Header()] = None,  # the browser sends Last-Event-ID on reconnect
) -> AsyncIterator[ServerSentEvent]:
    start = 0 if last_event_id is None else last_event_id + 1
    yield ServerSentEvent(retry=2000, comment="stream open")
    for seq, event in enumerate(RUNS[run_id][start:], start=start):
        await asyncio.sleep(0)  # a real producer awaits the model here
        if event["type"] == "token":
            yield ServerSentEvent(data=Token(text=event["text"]), event="token", id=str(seq))
        else:
            yield ServerSentEvent(data={"status": "done"}, event="done", id=str(seq))


client = TestClient(app)
with client.stream("GET", "/runs/run-1/events") as r:
    assert r.headers["content-type"].startswith("text/event-stream")
    assert r.headers["cache-control"] == "no-cache"
    assert r.headers["x-accel-buffering"] == "no"
    body = "".join(r.iter_text())
assert body.startswith(": stream open\nretry: 2000\n\n")
assert 'event: token\ndata: {"text":"Hel"}\nid: 0\n\n' in body
assert body.endswith('event: done\ndata: {"status": "done"}\nid: 4\n\n')

# Reconnect after event 2: only the rest of the run is replayed.
with client.stream("GET", "/runs/run-1/events", headers={"Last-Event-ID": "2"}) as r:
    resumed = "".join(r.iter_text())
assert "id: 2\n" not in resumed and 'data: {"text":"ld"}\nid: 3' in resumed
```

**Validate the input before the first byte.** Once the response has started, the status code (200) and headers are already sent, so you can no longer return a 422 or a 404. The catch: a generator's body, **including the code before its first `yield`**, only runs after the response has started. So put the request body in a Pydantic parameter and do checks such as "does this run exist, may this user see it" in a **dependency**. FastAPI resolves both before streaming begins, so they can still return a 4xx. An error that happens later has to travel as an event (`event: error`) inside the stream. For the same reason, `await request.json()` inside the generator fails: the body is no longer available.

**Stop the work when the client leaves.** When the user closes the tab, FastAPI cancels the generator. Put cleanup in `finally`, and close the upstream model stream there so you stop paying for tokens nobody will read. TestClient cannot simulate a disconnect, so this test runs a real uvicorn server on a free port:

```python
import asyncio
import socket
import threading
import time
from collections.abc import AsyncIterator

import httpx
import uvicorn
from fastapi import FastAPI
from fastapi.sse import EventSourceResponse, ServerSentEvent
from pydantic import BaseModel

app = FastAPI()
stats = {"produced": 0, "cleaned_up": 0}


class ChatRequest(BaseModel):
    prompt: str  # validated before streaming starts


async def fake_llm(prompt: str) -> AsyncIterator[str]:
    """Stands in for a model SDK's streaming call: an endless trickle of tokens."""
    n = 0
    while True:
        await asyncio.sleep(0.01)
        n += 1
        yield f"tok{n} "


@app.post("/chat", response_class=EventSourceResponse)
async def chat(req: ChatRequest) -> AsyncIterator[ServerSentEvent]:
    seq = 0
    try:
        async for token in fake_llm(req.prompt):
            stats["produced"] += 1
            yield ServerSentEvent(data={"text": token}, event="token", id=str(seq))
            seq += 1
    finally:
        # Runs when the client disconnects, because FastAPI cancels the generator.
        stats["cleaned_up"] += 1


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


port = free_port()
server = uvicorn.Server(uvicorn.Config(app, port=port, log_level="warning"))
thread = threading.Thread(target=server.run, daemon=True)
thread.start()
for _ in range(1000):
    if server.started:
        break
    time.sleep(0.01)
assert server.started, "uvicorn did not start"

tokens = []
with httpx.stream("POST", f"http://127.0.0.1:{port}/chat", json={"prompt": "hi"}, timeout=5) as r:
    for line in r.iter_lines():
        if line.startswith("data: "):
            tokens.append(line)
        if len(tokens) == 3:
            break  # leaving the with-block closes the connection, like a closed tab

for _ in range(500):  # poll: the server notices the disconnect asynchronously
    if stats["cleaned_up"]:
        break
    time.sleep(0.02)
produced_at_disconnect = stats["produced"]
time.sleep(0.1)
assert stats["cleaned_up"] == 1
assert stats["produced"] == produced_at_disconnect, "the generator kept running after the client left"
server.should_exit = True
thread.join(5)
```

On older FastAPI versions, the same thing is done with a plain `StreamingResponse(gen(), media_type="text/event-stream")`, where `gen()` yields pre-formatted strings, or with the `sse-starlette` package.

## Server 2: Node.js

In Node (plain `http` or Express, whose `res` is the same object) you write the headers, then call `res.write()` once per event. The key points are in the comments: flush the headers early, send heartbeats, honour `Last-Event-ID`, and stop on `res.on('close')`. The test reads the stream with `fetch`, resumes it, and presses "Stop" halfway.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const WORDS = ['Streaming', ' tokens', ' from', ' Node', '.'];
let stoppedEarly = 0;

const server = createServer((req, res) => {
  if (req.url !== '/runs/42/events') {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no', // tell nginx-style proxies not to buffer
  });
  res.flushHeaders(); // send headers now, before the first token exists
  res.write('retry: 3000\n\n');

  // Resume: start after the last id the client saw (EventSource sends it on reconnect).
  let seq = Number(req.headers['last-event-id'] ?? -1) + 1;
  const timer = setInterval(() => {
    if (seq < WORDS.length) {
      res.write(`id: ${seq}\nevent: token\ndata: ${JSON.stringify({ text: WORDS[seq] })}\n\n`);
      seq++;
    } else {
      res.write('event: done\ndata: {}\n\n');
      res.end();
    }
  }, 5);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);

  // 'close' fires when the response ends OR the client goes away: stop the work either way.
  res.on('close', () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    if (!res.writableFinished) stoppedEarly++;
  });
});

await new Promise<void>((resolve) => server.listen(0, resolve));
const base = `http://localhost:${(server.address() as AddressInfo).port}`;

/** Read the stream with fetch; stop after `limit` tokens, like a Stop button. */
async function readTokens(lastEventId?: string, limit = Infinity): Promise<string[]> {
  const controller = new AbortController();
  const res = await fetch(`${base}/runs/42/events`, {
    headers: lastEventId ? { 'Last-Event-ID': lastEventId } : {},
    signal: controller.signal,
  });
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  const tokens: string[] = [];
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return tokens;
      buffer += value;
      let end: number;
      // A minimal parser: this server only sends \n line endings and one-line data.
      // A general client needs the full parser from the coding problems.
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const fields = Object.fromEntries(block.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 2)]));
        if (fields.event === 'token') tokens.push(JSON.parse(fields.data).text);
        if (fields.event === 'done') return tokens;
        if (tokens.length >= limit) {
          controller.abort();
          return tokens;
        }
      }
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') return tokens;
    throw err;
  }
}

assert.equal((await readTokens()).join(''), 'Streaming tokens from Node.');
assert.deepEqual(await readTokens('2'), [' Node', '.']); // resumed after id 2
assert.deepEqual(await readTokens(undefined, 2), ['Streaming', ' tokens']);
// The server notices the abort asynchronously: poll rather than sleep a fixed time.
for (let i = 0; i < 500 && stoppedEarly === 0; i++) await new Promise((r) => setTimeout(r, 10));
assert.equal(stoppedEarly, 1); // the server noticed the abort and stopped producing

server.closeAllConnections();
await new Promise<void>((resolve) => server.close(() => resolve()));
```

Two Express traps: the `compression` middleware buffers output, so skip it for `text/event-stream` or call `res.flush()`. And never block the event loop while a stream is open, because every other stream on that process stalls too.

## Resume and replay

Resume is what makes SSE robust. It is also how you survive Cloud Run's request timeout and rolling deploys.

1. Give every event a **monotonically increasing sequence number** per run and send it as `id`.
2. Keep the run's events in an **append-only log**: an in-memory ring buffer for a single instance, or a Redis Stream, a Postgres table or Firestore when there are several instances. The reconnect will usually land on a **different instance**.
3. On connect, read `Last-Event-ID` (on a first load or a page refresh the browser cannot send it, so also accept a `?lastEventId=` query parameter). Replay every event after it, then switch to live events.
4. To avoid a gap between "replay finished" and "live started", **subscribe to live events first, then read the history**, and drop live events whose sequence number you have already sent.
5. If the client is further behind than the log keeps, send an `event: reset` with a fresh **snapshot** of the run, then continue live.

## Proxies, buffering, HTTP/2 and Cloud Run

| Problem | Symptom | Fix |
|---|---|---|
| A proxy or middleware buffers the response | All tokens arrive at once at the end | `X-Accel-Buffering: no`, `proxy_buffering off` in nginx, no gzip on the stream, flush after each write |
| An idle timeout on a proxy or load balancer | The stream dies after 30–60 s of model "thinking" | `: ping` comments every 15–30 s |
| Six connections per origin on HTTP/1.1 | The seventh tab's stream hangs | Serve over HTTP/2, where streams share one connection (servers usually allow about 100), or share one stream across tabs with a `BroadcastChannel` |
| Cloud Run request timeout | The stream ends after 5 minutes (the default; the maximum is 60) | Raise the timeout to the longest stream you need, and let the client reconnect with `Last-Event-ID` |
| Load balancer backend timeout | Streams cut at 30 s on a Google Cloud Application Load Balancer or GKE Ingress: for HTTP, the backend service timeout covers the **whole response**, not idle time | Raise the backend service timeout (on GKE Ingress with a `BackendConfig`, on GKE Gateway with a `GCPBackendPolicy`). Behind a serverless NEG (Cloud Run behind a load balancer) it is fixed at 60 minutes, and Cloud Run's own request timeout applies |

Cloud Run facts worth knowing: it supports streaming responses, and the 32 MiB HTTP/1 response limit does not apply to streamed or chunked responses. Each open stream counts as one request against the container's concurrency setting (up to 1,000 per instance), so size instances for open connections, not requests per second. An async server (uvicorn, Node) can hold hundreds of idle streams per instance. A thread-per-request server cannot.

## SSE vs WebSockets vs long polling vs gRPC streaming

| | SSE | WebSockets | Long polling | gRPC streaming |
|---|---|---|---|---|
| Direction | Server → client | Both ways | Server → client (one response per poll) | Server, client or both |
| Transport | Plain HTTP response | HTTP Upgrade to its own protocol | Repeated HTTP requests | HTTP/2 |
| Browser support | `EventSource` or `fetch` | `WebSocket` | `fetch` | Not native; needs gRPC-Web or Connect |
| Reconnect and resume | Built in (`retry`, `Last-Event-ID`) | You build it | Natural | You build it |
| Binary | No | Yes | Yes | Yes (protobuf) |
| Proxies and load balancers | Work like any HTTP response | Need Upgrade support and longer timeouts | Work | Need end-to-end HTTP/2 |
| Best for | Token streams, progress, log tails, notifications | Chat with presence, collaboration, interactive control at high rate | Fallback, very low update rates | Service-to-service streams |

A good default for an agent chat: **SSE (or fetch streaming) for the token and event stream, plain POSTs for actions** (send, cancel, approve). Switch to WebSockets when the client must send a stream of messages too.

## How LLM APIs stream

Your backend usually **consumes** a provider's stream and **re-emits** your own event schema to the browser.

- **OpenAI Chat Completions:** `data: {...}` lines, each a JSON chunk whose `choices[0].delta.content` holds new text. The stream ends with `data: [DONE]`.
- **OpenAI Responses API:** typed events with names such as `response.output_text.delta` and `response.completed`.
- **Anthropic Messages:** named events: `message_start`, `content_block_start`, `content_block_delta` (text deltas, or partial JSON for tool inputs), `content_block_stop`, `message_delta`, `message_stop`, plus `ping` and `error`.
- **Gemini:** `streamGenerateContent` with `alt=sse` returns SSE whose events are partial response objects.

Why not pass the provider stream straight through? The browser must never hold the API key. You need one schema whatever the provider (you can switch models without touching the UI). The backend is also where you log, redact, enforce guardrails, count tokens and interleave agent events (tool calls, approvals) with the text.

## Interview questions

### What are Server-Sent Events, and when would you use them? {core}

"SSE is a standard way for a server to push events to a browser over one long-lived HTTP response with the `text/event-stream` content type. It only goes server to client. The client sends anything back with normal HTTP requests. I use it when the server produces a stream and the browser mostly watches: LLM tokens, agent run progress, log tails, notifications. Because it is plain HTTP, it works through proxies, load balancers, auth middleware and Cloud Run without special configuration, and the browser's EventSource reconnects and resumes on its own."

Follow-up: "And when not?" When the client must also stream messages at high rate on the same channel, or you need binary frames. Then use WebSockets.

### Walk me through the text/event-stream format. {core}

"It's UTF-8 text. Events are separated by a blank line, and each line is a field: `data` for the payload, `event` for the type, `id` for the event's id, and `retry` for the reconnect delay in milliseconds. Lines starting with a colon are comments, which I use as keep-alive pings. Several `data` lines in one event are joined with newlines, and an event without data isn't dispatched."

Then mention the subtle bits: three possible line endings, only one leading space stripped after the colon, the `id` persisting across events, and the injection risk if you write user-controlled text with embedded newlines into a `data` line.

### Why do LLM APIs and chat UIs usually use SSE instead of WebSockets? {core}

"Token streaming is one-directional: the client sends one request with the prompt and gets a stream back. SSE is exactly that shape, and it's just an HTTP response. Rate limiting, auth headers, logging, load balancers and serverless platforms all work unchanged, and every HTTP client can consume it. WebSockets would give you a bidirectional channel you don't need, plus your own reconnect logic, heartbeats and a different scaling model. OpenAI, Anthropic and Gemini all stream over SSE."

A strong addition: "In our design the browser POSTs the message and reads the response as a stream. Cancel and approve are separate POSTs, keyed by run id."

### How does reconnection and resume work with SSE? {core}

"If the connection drops, EventSource waits for the `retry` delay and reconnects by itself. If the server gave events an `id`, the browser sends the last one back in a `Last-Event-ID` header, and the server replays everything after it from an event log. So the server design is: a sequence number per event, an append-only log per run in shared storage, and replay-then-live on connect."

Edge cases to mention unprompted. The first connection cannot send the header, so accept a query parameter too. Subscribe to live events before reading history, to avoid a gap. Send a snapshot when the client is too far behind. And close the EventSource on your `done` event, because a server that simply ends the response triggers a reconnect.

### EventSource cannot send headers. How do you authenticate an SSE stream? {core}

"Three options. Best for a browser app is a session cookie: HttpOnly, Secure, SameSite. EventSource sends cookies, with `withCredentials` for cross-origin, and that fits a backend-for-frontend design anyway. Second, a short-lived, single-use ticket in the query string, obtained from an authenticated POST, because URLs end up in logs. Third, skip EventSource and use fetch streaming, which can send an `Authorization: Bearer` header. For a chat that POSTs the prompt, that's what I'd do."

Also: check authorisation for the specific run (can this user see run 42?), not just authentication. And re-check it when the stream reconnects.

### When would you use fetch streaming instead of EventSource?

"When I need POST with a body, custom headers like Authorization, or precise control over cancellation and retries. A chat 'send message' is the typical case: POST the prompt, read the response body as a ReadableStream, and abort it with an AbortController when the user hits Stop. The trade-off is that I parse the stream and implement reconnection myself, or use a small library like fetch-event-source."

Watch-outs: decode with one `TextDecoder` and `{ stream: true }`, and buffer partial lines across chunks.

### How do you implement an SSE endpoint in FastAPI? {core}

"In current FastAPI, I set `response_class=EventSourceResponse` from `fastapi.sse` and write the path operation as an async generator that yields `ServerSentEvent` objects with data, event and id. FastAPI encodes them, sets `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and sends keep-alive pings when the generator is idle. I validate the request with a Pydantic body and do lookups and permission checks in dependencies, because those run before the response starts. Code inside the generator, even before its first yield, runs only after the 200 is sent. I read `Last-Event-ID` with a Header parameter for resume, and put cleanup in a `finally` block because the generator is cancelled when the client disconnects."

On older versions: `StreamingResponse` with `media_type="text/event-stream"`, or the `sse-starlette` package. Mention testing with `TestClient.stream` and `iter_text`.

### How do you implement SSE in Node or Express?

"Write a 200 with `Content-Type: text/event-stream`, `Cache-Control: no-cache` and `X-Accel-Buffering: no`, flush the headers, then `res.write` one event at a time, each ending with a blank line. Heartbeat comments go out on an interval, and on `res.on('close')` I clear the timers and cancel the upstream work. Watch out for compression middleware buffering the stream, and never block the event loop, because one CPU-heavy request freezes every open stream on that process."

### What happens on the server when the user closes the tab, and how do you stop the work? {core}

"The TCP connection closes. In FastAPI, the framework sees the disconnect and cancels the generator, so a `finally` block runs where I close the model stream and mark the run as abandoned or keep it running, whichever the product wants. In Node, `res.on('close')` fires before the response finished. The important part is propagating the cancellation upstream: if you don't, you keep paying for tokens and holding a model slot for nobody."

Product nuance: for an agent doing real work, closing the tab often should **not** cancel the run. The run continues in a worker, and reopening the page resumes the stream from the log. Then disconnect only detaches the viewer.

### Why might tokens arrive in one burst at the end instead of streaming? {core}

"Something between the generator and the browser is buffering. The usual suspects: a reverse proxy like nginx (fixed with `X-Accel-Buffering: no` or `proxy_buffering off`), gzip or compression middleware, a CDN, or a framework that collects the response before sending, such as Express with compression or a misconfigured WSGI server. It can also be the client: `await response.text()` instead of reading the stream, or a test client that buffers. I debug it with `curl -N` against each hop to see where the stream stops being incremental."

### What is the HTTP/1.1 connection limit problem, and how does HTTP/2 change it? {deep}

"Over HTTP/1.1, browsers allow about six connections per origin, shared across all tabs. Every open SSE stream holds one, so the seventh tab, or the app's normal API calls, can stall. HTTP/2 multiplexes many streams over one connection, typically up to about 100 concurrent streams per connection, so the problem mostly disappears. Other fixes: one stream per app shared across tabs with a BroadcastChannel or SharedWorker, or a separate subdomain for streams."

### How do you run SSE on Cloud Run, and which limits matter? {core}

"Cloud Run supports streaming responses, and the 32 MiB response limit doesn't apply to streamed responses. What matters: the request timeout, 5 minutes by default and 60 at most, ends any stream, so the client must reconnect, which SSE's resume makes painless. Each open stream counts against container concurrency, up to 1,000 per instance, so you plan instances by open connections. Reconnects can land on another instance, so the event log must live in shared storage. And keep-alive pings stop load balancers from closing idle streams."

**Your angle:** you deployed FastAPI services to Cloud Run across Dev, SIT and UAT at Quantiphi, so you know the platform. Streaming adds concurrency, timeout and shared-state planning on top of that.

### How do you handle an error that happens in the middle of a stream?

"By then the 200 and the headers are already sent, so I can't change the status code. I send a typed error event, for example `event: error` with a code, a retryable flag and a correlation id, then end the stream cleanly. The client shows the error inline, keeps the partial text, and offers retry. Errors before the first byte, like validation or a missing run, still return normal 4xx responses, which is why validation and lookups go in FastAPI dependencies, which run before streaming starts."

Also: log the server-side error with the run id, and send a final `done` or `error` event so the client never waits forever.

### How do you scale SSE to many concurrent clients? {deep}

"Three things. First, an async server, because connections are mostly idle: uvicorn or Node can hold thousands per instance. Thread-per-request servers can't. Second, fan-out: events are produced by workers, not by the web instance holding the connection, so instances subscribe to a broker, Redis pub/sub or Streams, or Pub/Sub, and forward to their own clients. Third, the platform: raise concurrency and timeouts, set heartbeats under every idle timeout, and use HTTP/2 to the browser. Then protect against slow clients with bounded per-connection buffers."

### How do you handle backpressure when a client reads slowly? {deep}

"Every connection gets a bounded buffer. A fast producer writing into a slow socket will otherwise grow memory without limit. In Node, `res.write` returns false when the buffer is full, so I wait for `drain`. In Python, ASGI's send awaits, and FastAPI's SSE producer uses a buffer of one item. Policy depends on the stream: for tokens, coalesce several tokens into one event. For progress or telemetry, drop intermediate updates and keep the latest. If a client falls too far behind, disconnect it and let it resume from the log."

### How do you parse an SSE stream correctly on the client? {deep}

"Decode bytes with a single TextDecoder in streaming mode so multi-byte characters survive chunk splits. Then keep a text buffer and only process complete lines, accepting `\n`, `\r\n` and `\r`, and holding a trailing `\r` until the next chunk because it might be half of a `\r\n`. Accumulate data lines, dispatch on a blank line, ignore comments and unknown fields, and discard an incomplete event at end of stream. The id from an `id:` line only becomes the reconnect id when its event completes, so a drop mid-event doesn't skip that event. And I test it by feeding the same stream split at every position."

### How do you test an SSE endpoint?

"Unit level: `TestClient.stream` in FastAPI and assert on the event text, including ids and the final done event. TestClient buffers the whole response, so the stream under test must end; an endless stream would hang the test. For disconnect handling I start a real server on a free port and close the client mid-stream, then assert the generator's cleanup ran. On the client, test the parser with every split point, and test the hook against a mocked stream: MSW or Playwright's `page.route` can return a `text/event-stream` body. End to end, Playwright checks that tokens appear incrementally and that Stop works."

### How would you design the event schema for an agent run stream? {core}

"A small discriminated union, versioned, with a sequence id on every event: `run.started`, `token` with text, `step.started` and `step.finished`, `tool_call` with name and arguments, `approval.required` with what needs approving, `error` with code and retryable flag, and `done` with usage. Each carries the run id and a timestamp. In TypeScript that's a union on `type` with an exhaustive switch, validated with zod at the boundary. The id makes resume and deduplication work."

Design point: the `event:` field can carry the type (so `EventSource` listeners work), but keep the type inside the JSON as well, so fetch-based clients and logs are self-describing.

### Should the browser call the LLM provider's streaming API directly? {deep}

"No. The API key would be exposed, and I'd lose the backend's job: authorising the user, enforcing guardrails and budgets, redacting sensitive data, logging, and interleaving agent events like tool calls and approvals with the tokens. The backend consumes the provider's SSE and re-emits our own schema, which also means switching providers or models doesn't touch the UI."

### How does SSE compare with long polling? {deep}

"Long polling holds a request open until there's news, returns it, and the client immediately asks again. It works everywhere but costs a request per batch of messages, adds latency between batches, and makes ordering and gaps your problem. SSE keeps one response open, so latency is lower and overhead smaller, and ids give you resume. I'd keep long polling only as a fallback for a hostile network environment."

### Can you send binary data over SSE? {deep}

"Not directly. The stream is UTF-8 text, so binary has to be base64-encoded, which adds about a third in size. For audio, images or anything high-volume and binary, I'd use WebSockets, or send a URL in the event and fetch the binary separately, for example a signed Cloud Storage URL."

## Coding problems

### Write an SSE parser that survives any chunk boundary {medium core}

Write a class `SseParser` with a `feed(chunk: string)` method that receives already-decoded text in arbitrary chunks and calls a callback with `{ type, data, lastEventId }` for each complete event. Follow the spec: `\n`, `\r\n` or `\r` line endings, comments, multi-line `data`, the `retry` field, events without data not dispatched. Expose the **last event ID to use when reconnecting**. It must give identical results however the input is split.

#### Hints

1. Keep a text buffer and only process **complete lines**. The remainder stays in the buffer for the next chunk.
2. A chunk ending in `\r` is ambiguous: it may be half of `\r\n`. Hold it back.
3. Per event, collect `data` lines in an array and join them with `\n` when a blank line arrives. `id` is not reset between events.
4. An `id:` line only fills a buffer. The spec **commits** it as the reconnect id at the blank line, even for an event with no data. If the connection drops halfway through an event, reconnecting with that event's id would skip it.

#### Solution

The parser is a small state machine: a buffer of unprocessed text, the data lines collected so far, the current event type, an id buffer, and the committed last event id. Lines are processed only when their terminator has arrived. The test feeds the same stream split at every position and one character at a time, and checks the spec's edge cases.

```ts
import assert from 'node:assert/strict';

export type SseEvent = { type: string; data: string; lastEventId: string };

/** Incremental text/event-stream parser, following the WHATWG HTML parsing rules. */
export class SseParser {
  reconnectMs: number | undefined;
  /** The id to send as Last-Event-ID when reconnecting. Committed only when an event completes. */
  lastEventId = '';
  private buffer = '';
  private dataLines: string[] = [];
  private eventType = '';
  private idBuffer = '';
  private started = false;
  private readonly onEvent: (event: SseEvent) => void;

  constructor(onEvent: (event: SseEvent) => void) {
    this.onEvent = onEvent;
  }

  feed(chunk: string): void {
    if (!this.started && chunk !== '') {
      this.started = true;
      if (chunk.startsWith('\uFEFF')) chunk = chunk.slice(1); // one leading byte-order mark is ignored
    }
    this.buffer += chunk;
    let lineStart = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch !== '\n' && ch !== '\r') continue;
      if (ch === '\r' && i === this.buffer.length - 1) break; // maybe the first half of \r\n: wait
      this.processLine(this.buffer.slice(lineStart, i));
      if (ch === '\r' && this.buffer[i + 1] === '\n') i++;
      lineStart = i + 1;
    }
    this.buffer = this.buffer.slice(lineStart);
  }

  private processLine(line: string): void {
    if (line === '') return this.dispatch(); // a blank line ends the event
    if (line.startsWith(':')) return; // comment, usually a keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1); // only ONE leading space is stripped
    if (field === 'data') this.dataLines.push(value);
    else if (field === 'event') this.eventType = value;
    else if (field === 'id' && !value.includes('\0')) this.idBuffer = value; // committed at dispatch
    else if (field === 'retry' && /^\d+$/.test(value)) this.reconnectMs = Number(value);
    // any other field name is ignored
  }

  private dispatch(): void {
    this.lastEventId = this.idBuffer; // committed even when the event has no data
    if (this.dataLines.length > 0) {
      this.onEvent({ type: this.eventType || 'message', data: this.dataLines.join('\n'), lastEventId: this.lastEventId });
    }
    this.dataLines = [];
    this.eventType = '';
  }
}

const stream =
  ': connected\n' +
  'retry: 2500\n\n' +
  'event: token\nid: 1\ndata: {"text":"Hel"}\n\n' +
  'event: token\r\nid: 2\r\ndata: {"text":"lo"}\r\n\r\n' +
  'data: line one\ndata: line two\n\n' +
  'data:  two spaces keeps one\n\n' +
  'event: ignored-without-data\n\n' +
  'data: half an event at the end is discarded';

const parseAll = (chunks: string[]) => {
  const events: SseEvent[] = [];
  const parser = new SseParser((e) => events.push(e));
  for (const c of chunks) parser.feed(c);
  return { events, parser };
};

const whole = parseAll([stream]);
assert.deepEqual(whole.events, [
  { type: 'token', data: '{"text":"Hel"}', lastEventId: '1' },
  { type: 'token', data: '{"text":"lo"}', lastEventId: '2' },
  { type: 'message', data: 'line one\nline two', lastEventId: '2' },
  { type: 'message', data: ' two spaces keeps one', lastEventId: '2' },
]);
assert.equal(whole.parser.reconnectMs, 2500);

// Split at every possible position, and one character at a time: always the same events.
for (let i = 0; i <= stream.length; i++) {
  assert.deepEqual(parseAll([stream.slice(0, i), stream.slice(i)]).events, whole.events, `split at ${i}`);
}
assert.deepEqual(parseAll([...stream]).events, whole.events);

// The reconnect id is committed at the blank line: a drop in the middle of event 2 must resume after 1.
const dropped = parseAll(['id: 1\ndata: a\n\nid: 2\ndata: b']);
assert.equal(dropped.events.length, 1);
assert.equal(dropped.parser.lastEventId, '1');
// An event with an id but no data still commits the id, without dispatching anything.
const idOnly = parseAll(['id: 7\n\n']);
assert.deepEqual(idOnly.events, []);
assert.equal(idOnly.parser.lastEventId, '7');
// An id containing NUL is ignored; retry accepts digits only.
const odd = parseAll(['id: 3\ndata: x\n\nid: 4\0\nretry: 1s\ndata: y\n\n']);
assert.deepEqual(odd.events.map((e) => e.lastEventId), ['3', '3']);
assert.equal(odd.parser.reconnectMs, undefined);
// An empty chunk between \r and \n changes nothing, and one leading BOM is ignored even after an empty chunk.
assert.deepEqual(parseAll(['', '\uFEFFdata: a\r', '', '\n\r\n']).events, [{ type: 'message', data: 'a', lastEventId: '' }]);
```

Complexity: O(n) over the input. The buffer only holds the current incomplete line, but note that `this.buffer += chunk` followed by a slice copies the unprocessed tail each time, which is fine for small lines.

#### Follow-ups

- **How would you use it with fetch?** `response.body.pipeThrough(new TextDecoderStream())`, then `parser.feed(value)` for each chunk read, with an AbortController for Stop.
- **How do you reconnect?** On a network error or end of stream without a `done` event, wait `reconnectMs` (with jitter) and re-issue the request with `Last-Event-ID` set to `parser.lastEventId`, the id committed by the last completed event.
- **What about very long lines?** Cap the buffer size and fail the stream, so a broken or malicious server cannot exhaust memory.

### Add resume to an SSE endpoint {medium core}

Build a FastAPI endpoint `GET /runs/{run_id}/events` that streams a run's events as SSE with sequence ids. A client that reconnects with `Last-Event-ID` (or `?lastEventId=` on first load) receives only events after that id. The server keeps only the last `N` events per run, so a client that is too far behind first receives an `event: reset` with a snapshot of the run's status and then the retained events. A client that sends an id the server never issued (the log was reset, for example by a restart with an in-memory log) gets the same reset instead of silently missing events.

#### Hints

1. A `collections.deque(maxlen=N)` of `(seq, event)` pairs is a ring buffer: old events fall off by themselves.
2. Read the id from a `Header()` parameter and a `Query()` parameter, and prefer the header.
3. The client is "too far behind" if the id it sent is older than the oldest retained sequence number minus one. An id at or beyond the next sequence number was never issued by this log.
4. Look the run up in a dependency: an `HTTPException` raised inside the generator comes too late to become a 404.

#### Solution

The run log assigns sequence numbers and keeps the tail. A dependency finds the run (and would check permissions), so a missing run is a real 404. The endpoint decides where to start: from the beginning, right after the client's id, or with a reset when the gap cannot be filled.

```python
from collections import deque
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.testclient import TestClient


@dataclass
class RunLog:
    capacity: int
    status: str = "running"
    next_seq: int = 0
    events: deque = field(init=False)

    def __post_init__(self) -> None:
        self.events = deque(maxlen=self.capacity)  # oldest events drop off automatically

    def append(self, kind: str, data: dict) -> None:
        self.events.append((self.next_seq, kind, data))
        self.next_seq += 1


app = FastAPI()
LOGS: dict[str, RunLog] = {}


def get_run_log(run_id: str) -> RunLog:
    # Dependencies run before the response starts, so this can still become a 404.
    # The same check inside the generator would run after the 200 had been sent.
    log = LOGS.get(run_id)
    if log is None:
        raise HTTPException(404, "run not found")
    return log


@app.get("/runs/{run_id}/events", response_class=EventSourceResponse)
async def run_events(
    log: Annotated[RunLog, Depends(get_run_log)],
    last_event_id: Annotated[int | None, Header()] = None,
    last_event_id_query: Annotated[int | None, Query(alias="lastEventId")] = None,
) -> AsyncIterator[ServerSentEvent]:
    after = last_event_id if last_event_id is not None else last_event_id_query
    oldest = log.events[0][0] if log.events else log.next_seq
    if after is not None and (after < oldest - 1 or after >= log.next_seq):
        # The gap cannot be replayed, or the id comes from a log that no longer exists
        # (a restart reset the sequence): send the current state, then everything retained.
        yield ServerSentEvent(event="reset", data={"status": log.status})
        after = None
    for seq, kind, data in list(log.events):
        if after is None or seq > after:
            yield ServerSentEvent(event=kind, data=data, id=str(seq))


log = RunLog(capacity=3, status="succeeded")
for i in range(5):  # seq 0..4; only 2, 3, 4 are retained
    log.append("token", {"text": f"t{i}"})
LOGS["run-9"] = log

client = TestClient(app)


def ids_and_kinds(response_text: str) -> list[tuple[str | None, str]]:
    out = []
    for block in filter(None, response_text.strip().split("\n\n")):
        fields = dict(line.split(": ", 1) for line in block.split("\n"))
        out.append((fields.get("id"), fields["event"]))
    return out


assert client.get("/runs/missing/events").status_code == 404
assert ids_and_kinds(client.get("/runs/run-9/events").text) == [("2", "token"), ("3", "token"), ("4", "token")]
assert ids_and_kinds(client.get("/runs/run-9/events", headers={"Last-Event-ID": "3"}).text) == [("4", "token")]
assert ids_and_kinds(client.get("/runs/run-9/events?lastEventId=2").text) == [("3", "token"), ("4", "token")]
# Header wins over the query parameter.
assert ids_and_kinds(client.get("/runs/run-9/events?lastEventId=0", headers={"Last-Event-ID": "4"}).text) == []
# Id 1 is still contiguous with the retained events (next is 2): no reset needed.
assert ids_and_kinds(client.get("/runs/run-9/events?lastEventId=1").text)[0] == ("2", "token")
# Id 0 is too old: event 1 is lost, so the client gets a reset first.
assert ids_and_kinds(client.get("/runs/run-9/events?lastEventId=0").text) == [(None, "reset"), ("2", "token"), ("3", "token"), ("4", "token")]
# Id 7 was never issued (the client saw an older incarnation of the log): reset, not silence.
assert ids_and_kinds(client.get("/runs/run-9/events", headers={"Last-Event-ID": "7"}).text)[0] == (None, "reset")
```

Complexity: O(N) per connection for the replay.

#### Follow-ups

- **What about events that arrive while you replay?** Subscribe to the live feed first and buffer it, replay history, then drain the buffer, dropping sequence numbers already sent.
- **Several instances?** Move the log to a Redis Stream (`XADD` with `MAXLEN`, `XRANGE` from the last id) or a Postgres table, so whichever instance gets the reconnect can replay.
- **Why not let the browser's id be any string?** Ids are client input. Parse them strictly (here FastAPI enforces an int), or a crafted id could break your query.

### Format events safely on the server {easy}

Write `format_event(data, *, event=None, id=None) -> str` that produces one SSE event. Data containing newlines (from user or model text) must become several `data:` lines, so it can never end the event early or inject a new one. `event` and `id` must be single-line, and `id` must not contain a NUL character. Raise `ValueError` otherwise.

#### Hints

1. Normalise `\r\n` and `\r` to `\n`, then emit one `data:` line per line of the payload.
2. The output ends with exactly one blank line, and nowhere else contains one.

#### Solution

Splitting data into lines is the whole defence: a line break inside the payload becomes "next data line of the same event" instead of "end of event".

```python
def format_event(data: str, *, event: str | None = None, id: str | None = None) -> str:
    for name, value in (("event", event), ("id", id)):
        if value is not None and ("\n" in value or "\r" in value):
            raise ValueError(f"SSE {name} must be a single line")
    if id is not None and "\0" in id:
        raise ValueError("SSE id must not contain NUL")
    lines = []
    if event is not None:
        lines.append(f"event: {event}")
    if id is not None:
        lines.append(f"id: {id}")
    for line in data.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        lines.append(f"data: {line}")
    return "\n".join(lines) + "\n\n"


def parse_data(event_text: str) -> str:
    """What a client reconstructs: data lines joined with newlines."""
    return "\n".join(line[6:] for line in event_text.split("\n") if line.startswith("data: "))


assert format_event('{"text":"hi"}', event="token", id="7") == 'event: token\nid: 7\ndata: {"text":"hi"}\n\n'

attack = "harmless\n\nevent: admin\ndata: drop tables"
out = format_event(attack, event="token")
assert out.count("\n\n") == 1 and out.endswith("\n\n")  # still exactly one event
assert parse_data(out) == attack  # and the client sees the original text, newlines included
assert format_event("a\r\nb\rc") == "data: a\ndata: b\ndata: c\n\n"
assert format_event("") == "data: \n\n"  # an empty payload is still dispatched

for bad in [{"event": "token\ndata: x"}, {"id": "1\r"}, {"id": "1\x00"}]:
    try:
        format_event("x", **bad)
        raise AssertionError(f"accepted {bad}")
    except ValueError:
        pass
```

Complexity: O(n) in the payload size.

#### Follow-ups

- **Why not just JSON-encode everything?** JSON escapes newlines inside strings, so one-line JSON is safe too. That is why `data: <json>` is the common pattern, and why FastAPI's `ServerSentEvent` JSON-encodes `data` by default. `format_event` matters as soon as anyone writes raw text.
- **Where else does this bug appear?** Anywhere text is framed by delimiters: log injection, CSV injection, HTTP header splitting.

### Interleave keep-alive pings with a slow token stream {medium}

Write an async generator `with_heartbeats(source, interval)` that yields every item of the async iterator `source`, and also yields the comment `": ping\n\n"` whenever `interval` seconds pass without an item. It must not cancel or restart the source while waiting, and it must clean up its pending read when the consumer stops early.

#### Hints

1. `asyncio.wait_for(anext(source), timeout)` is a trap: on timeout it **cancels** the read, which finalises an async generator source.
2. Instead, keep one pending task for "the next item" and `asyncio.wait({task}, timeout=interval)`. If it is not done, yield a ping and wait again on the same task.
3. Use `try/finally` to cancel the pending task when the consumer closes the generator.

#### Solution

The pending task survives across timeouts, so the source is never interrupted. FastAPI's own SSE keep-alive solves the same problem in a similar way: a separate producer task feeds a one-item memory stream, so its timeout never wraps the generator's `__anext__`.

```python
import asyncio
from collections.abc import AsyncIterator

PING = ": ping\n\n"


async def with_heartbeats(source: AsyncIterator[str], interval: float) -> AsyncIterator[str]:
    pending: asyncio.Task[str] = asyncio.ensure_future(anext(source))
    try:
        while True:
            done, _ = await asyncio.wait({pending}, timeout=interval)
            if not done:
                yield PING  # the source is still working: keep the connection warm
                continue
            try:
                item = pending.result()
            except StopAsyncIteration:
                return
            yield item
            pending = asyncio.ensure_future(anext(source))
    finally:
        pending.cancel()


async def slow_model() -> AsyncIterator[str]:
    yield "data: first\n\n"
    await asyncio.sleep(0.12)  # "thinking" longer than the heartbeat interval
    yield "data: second\n\n"


async def main() -> None:
    out = [chunk async for chunk in with_heartbeats(slow_model(), interval=0.05)]
    assert out[0] == "data: first\n\n" and out[-1] == "data: second\n\n"
    assert 1 <= out.count(PING) <= 3  # pings filled the silence, and no item was lost

    # A fast source never needs a ping.
    async def fast() -> AsyncIterator[str]:
        for i in range(3):
            yield f"data: {i}\n\n"

    assert [c async for c in with_heartbeats(fast(), interval=1)] == ["data: 0\n\n", "data: 1\n\n", "data: 2\n\n"]

    # A consumer that stops early leaves no pending task behind.
    async def endless() -> AsyncIterator[str]:
        while True:
            await asyncio.sleep(0.01)
            yield "data: x\n\n"

    gen = with_heartbeats(endless(), interval=1)
    assert await anext(gen) == "data: x\n\n"
    await gen.aclose()
    leftovers = [t for t in asyncio.all_tasks() if t is not asyncio.current_task()]
    await asyncio.sleep(0)
    assert all(t.done() for t in leftovers)


asyncio.run(main())
```

Complexity: O(1) extra work per item or ping.

#### Follow-ups

- **What interval?** Below the shortest idle timeout on the path. 15–30 s is typical, since many proxies time out at 60 s.
- **How would you add a maximum stream duration?** Track the start time. Before the platform's timeout, send an `event: reconnect` (or just end the stream) and let the client resume with `Last-Event-ID`. A planned reconnect is better than a 504.
