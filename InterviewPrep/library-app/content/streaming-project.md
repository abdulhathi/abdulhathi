---
title: "Build it: an end-to-end streaming agent chat"
goal: Run, read and defend a working FastAPI + React app that streams agent tokens over SSE, takes approvals over a WebSocket, and survives dropped connections.
minutes: 90
---

Real-time streaming is the biggest gap on your resume for roles that ask for it, so this chapter is hands-on. There is a complete reference project in `InterviewPrep/capgemini-app/projects/streaming-demo/` (from the github-portfolio folder): a FastAPI backend whose fake agent streams tokens, calls tools and pauses for a human approval, and a React client that renders the stream, reconnects without losing a token, and approves or cancels over a WebSocket. It has 18 backend tests, 30 unit tests and 3 Playwright end-to-end tests, and they all pass.

**Run it before you read further.** Then use this chapter to understand every decision well enough to whiteboard it. Only say "I built a streaming demo" in the interview after you have run it, read the code, and changed something yourself (the coding problems at the end are good changes to make).

## Run it first

```bash
# Terminal 1: backend on :8010 (from the github-portfolio folder; it uses the capgemini-app Python env)
cd InterviewPrep/capgemini-app/projects/streaming-demo/backend
../../../.venv/bin/python -m uvicorn app.main:app --port 8010 --reload

# Terminal 2: client on :5185 (also from the github-portfolio folder)
cd InterviewPrep/capgemini-app/projects/streaming-demo/client
npm install
npm run dev
```

Study Hub (http://localhost:5180) can also start both for you. Open http://localhost:5185, start a run, approve it, then start another and **reload the page while the agent waits for approval**: everything comes back and the run carries on. Then try the tests, from the `InterviewPrep/capgemini-app` folder:

```bash
(cd projects/streaming-demo/backend && ../../../.venv/bin/python -m pytest)
(cd projects/streaming-demo/client && npm test && npx playwright test)
```

To see the protocol itself, start a run with curl and watch the raw stream (the README has the full commands). This is real output, trimmed:

```text
: stream open
retry: 2000

event: run.started
data: {"prompt": "Order parts"}
id: 1

event: token
data: {"step_id": "plan", "text": "I'll "}
id: 3

event: approval.required
data: {"step_id": "po", "action": "create_purchase_order", "details": {"vendor": "Acme Supplies", "amount": 1250.0, ...}, "timeout_s": 120.0, "expires_at_ms": 1792046507123}
id: 26

event: run.completed
data: {}
id: 47
```

## The architecture in one picture

```text
 Browser (React)                                     FastAPI
 ┌──────────────────────────────┐   POST /api/runs   ┌────────────────────────────────────┐
 │ start a run                  │ ─────────────────► │ start an asyncio task: the agent   │
 │                              │                    │        │ emit()                    │
 │ useRunStream                 │   GET …/events     │        ▼                           │
 │  fetch + SSE parser          │ ◄───────────────── │  per-run append-only event log     │
 │  Last-Event-ID on reconnect  │  text/event-stream │        ▲ events_after(last_id)     │
 │  one render per frame        │                    │        │                           │
 │ useControlSocket             │   WS …/control     │  approve → resolve the pending step│
 │  auth, ping, backoff, resend │ ◄────────────────► │  cancel  → cancel the agent task   │
 └──────────────────────────────┘                    └────────────────────────────────────┘
```

| Decision | Choice | Why |
|---|---|---|
| Server → browser | SSE over `fetch` | One-way, plain HTTP, resumable with event ids, proxy-friendly |
| Browser → server, mid-run | WebSocket | Low-latency control messages with replies, while the stream keeps flowing |
| Source of truth | Append-only event log per run | Resume, many viewers and slow clients all become "read the log from id N" |
| Resume | `Last-Event-ID` header | The browser's own SSE convention; the server replays only what was missed |
| Duplicates | Reducer ignores ids it has seen | Replays are harmless, so reconnect logic can be simple |
| Rendering | Batch events per animation frame | Hundreds of tokens a second cost one render per frame |
| Abandoned runs | Cancel after a 15 s grace period with no watchers | A flaky network does not kill work; a closed tab stops spending tokens |
| Approvals | Idempotent, with a timeout that rejects | Safe to retry after a lost ack; the agent never waits forever |

## The event log is the design

The agent never writes to a socket. It appends events to its run's log, and every SSE connection reads that log starting after the id it last saw. That one choice gives you resume after a drop (read from `Last-Event-ID`), several tabs watching one run (several readers), slow clients that never slow the agent (each reader keeps its own position), and a page reload that rebuilds the whole UI (read from 0).

Here is the core of it, small enough to write on a whiteboard. It is tested the way the project tests it, with `TestClient`:

```python
import asyncio
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.testclient import TestClient


class Run:
    """One agent run: an append-only event log plus a condition that wakes up waiting readers."""

    def __init__(self) -> None:
        self.events: list[tuple[int, str, dict]] = []  # (id, type, data); ids are 1, 2, 3, ...
        self.finished = False
        self.changed = asyncio.Condition()
        self.task: asyncio.Task[None] | None = None

    async def emit(self, type_: str, data: dict, final: bool = False) -> None:
        async with self.changed:
            self.events.append((len(self.events) + 1, type_, data))
            self.finished = self.finished or final
            self.changed.notify_all()

    async def events_after(self, last_id: int):
        seen = last_id
        while True:
            async with self.changed:
                await self.changed.wait_for(lambda: len(self.events) > seen or self.finished)
                batch = self.events[seen:]
            for event in batch:
                yield event
                seen = event[0]
            if self.finished and seen >= len(self.events):
                return


runs: dict[str, Run] = {}
app = FastAPI()


async def fake_agent(run: Run) -> None:
    for word in ["Checking ", "open ", "tickets."]:
        await asyncio.sleep(0.01)
        await run.emit("token", {"text": word})
    await run.emit("run.completed", {}, final=True)


@app.post("/runs/{run_id}", status_code=201)
async def start(run_id: str) -> dict:
    run = runs[run_id] = Run()
    run.task = asyncio.get_running_loop().create_task(fake_agent(run))  # keep a reference, or it can be collected
    return {"run_id": run_id}


def get_run(run_id: str) -> Run:
    # A dependency runs before the stream starts, so a bad id is a clean 404, not a half-open stream.
    if run_id not in runs:
        raise HTTPException(404, "Run not found")
    return runs[run_id]


@app.get("/runs/{run_id}/events", response_class=EventSourceResponse)
async def stream(run: Annotated[Run, Depends(get_run)], last_event_id: Annotated[int, Header(ge=0)] = 0):
    async for event_id, type_, data in run.events_after(last_event_id):
        yield ServerSentEvent(id=str(event_id), event=type_, data=data)


with TestClient(app) as client:  # "with" keeps one event loop alive, so the agent task runs between requests
    client.post("/runs/r1")
    first = client.get("/runs/r1/events")
    assert first.headers["content-type"].startswith("text/event-stream")
    assert first.headers["cache-control"] == "no-cache"  # FastAPI adds this and X-Accel-Buffering: no
    assert first.text.count("event: token") == 3
    resumed = client.get("/runs/r1/events", headers={"Last-Event-ID": "2"}).text
    assert [line for line in resumed.splitlines() if line.startswith("id:")] == ["id: 3", "id: 4"]
    assert client.get("/runs/missing/events").status_code == 404
```

Things to point out when you explain it:

- **`EventSourceResponse` plus `yield`.** Recent FastAPI (the lab has 0.143) ships `fastapi.sse`. You yield `ServerSentEvent` objects, and FastAPI writes the wire format, sets `Cache-Control: no-cache` and `X-Accel-Buffering: no`, and sends a `: ping` comment whenever the stream has been idle for 15 seconds, so idle proxies do not cut it.
- **Client disconnects cancel the generator.** When the browser goes away, the generator is cancelled at its next `await`, so `finally` blocks and context managers run. The project uses that to count watchers.
- **The agent is not the request.** The agent runs as its own task. The stream only reads, so closing a stream never kills the work.

**Your angle:** this is the same separation you used on the Document AI platform at Quantiphi: processing runs on its own, with HITL checkpoints, and the UI reads and acts on state rather than owning the work.

## The control socket

Approve, reject and cancel need to travel from the browser to the server while the stream keeps flowing, and the browser wants a reply ("did my approval land?"). That is the WebSocket's job. Three details matter:

1. **Auth in the first message.** The browser WebSocket API cannot set an `Authorization` header, and a token in the URL ends up in access logs. So the server accepts the socket, waits up to 5 seconds for `{"type": "auth", "token": …}`, and closes with code **1008** (policy violation) otherwise. An unknown run closes with **4404** (codes 4000–4999 are free for applications).
2. **Validated messages.** Every message is parsed with a Pydantic discriminated union on `type`, so a malformed message gets an error reply instead of crashing the handler.
3. **Idempotent approvals.** If the network drops before the ack arrives, the client resends. The server records each step's decision: the same decision again is acknowledged as `duplicate`, and a contradicting one is rejected as `stale_approval`.

```python
import asyncio
from typing import Annotated, Literal

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, TypeAdapter, ValidationError


class Auth(BaseModel):
    type: Literal["auth"]
    token: str


class Approve(BaseModel):
    type: Literal["approve"]
    request_id: str
    step_id: str
    approved: bool


class Ping(BaseModel):
    type: Literal["ping"]


Message = TypeAdapter(Annotated[Approve | Ping, Field(discriminator="type")])
decisions: dict[str, bool] = {}
app = FastAPI()


@app.websocket("/runs/{run_id}/control")
async def control(ws: WebSocket, run_id: str) -> None:
    await ws.accept()
    try:
        auth = Auth.model_validate_json(await asyncio.wait_for(ws.receive_text(), 5))
    except WebSocketDisconnect:
        return
    except (TimeoutError, ValidationError):
        await ws.close(1008, "auth message required")
        return
    if auth.token != "demo-token":
        await ws.close(1008, "invalid token")
        return
    await ws.send_json({"type": "ready"})
    try:
        while True:
            try:
                msg = Message.validate_json(await ws.receive_text())
            except ValidationError:
                await ws.send_json({"type": "error", "code": "bad_request"})
                continue
            if isinstance(msg, Ping):
                await ws.send_json({"type": "pong"})
                continue
            if msg.step_id not in decisions:  # the first decision for this step wins
                decisions[msg.step_id] = msg.approved
                await ws.send_json({"type": "ack", "request_id": msg.request_id, "result": "ok"})
            elif decisions[msg.step_id] == msg.approved:  # a retry of the same decision
                await ws.send_json({"type": "ack", "request_id": msg.request_id, "result": "duplicate"})
            else:  # contradicts what was already decided
                await ws.send_json({"type": "error", "request_id": msg.request_id, "code": "stale_approval"})
    except WebSocketDisconnect:
        pass


client = TestClient(app)
with client.websocket_connect("/runs/r1/control") as ws:
    ws.send_json({"type": "auth", "token": "wrong"})
    try:
        ws.receive_json()
        raise AssertionError("the server should have closed the socket")
    except WebSocketDisconnect as closed:
        assert closed.code == 1008

with client.websocket_connect("/runs/r1/control") as ws:
    ws.send_json({"type": "auth", "token": "demo-token"})
    assert ws.receive_json() == {"type": "ready"}
    approve = {"type": "approve", "request_id": "a1", "step_id": "po", "approved": True}
    ws.send_json(approve)
    assert ws.receive_json() == {"type": "ack", "request_id": "a1", "result": "ok"}
    ws.send_json(approve)  # a retry after a lost ack
    assert ws.receive_json() == {"type": "ack", "request_id": "a1", "result": "duplicate"}
    ws.send_json({**approve, "request_id": "a2", "approved": False})
    assert ws.receive_json()["code"] == "stale_approval"
    ws.send_text("{not json")
    assert ws.receive_json() == {"type": "error", "code": "bad_request"}
```

In the project, the approval is an `asyncio.Future` that the agent awaits with `asyncio.wait_for(..., approval_timeout)`. Resolving it from the socket handler wakes the agent; a timeout counts as a rejection and is recorded in the log as `decided_by: "timeout"`. Two details came out of testing it:

- **The deadline is absolute.** `approval.required` carries `expires_at_ms` (wall-clock milliseconds) as well as `timeout_s`. A client that replays the log after a reload computes the time really left; with only `timeout_s` it would restart a full countdown while the server is about to reject. The client caps it at one full timeout from its own clock, so a clock running behind never shows extra time.
- **A decision can race the timeout.** If the approve message and the timeout land in the same event-loop tick, the decision has already been recorded and acked `ok` when `wait_for` raises `TimeoutError`. The agent then honours the recorded decision instead of silently turning it into a rejection.

## Reading the stream in the browser

The client uses `fetch` with a streaming body instead of `EventSource`, because `fetch` can send an `Authorization` header, use POST if needed, and leaves reconnect policy to you. The price is that you parse `text/event-stream` yourself, following the WHATWG rules:

- **Chunks are not lines.** A chunk can end in the middle of a field, or between the `\r` and the `\n` of a line break, so a trailing `\r` waits for more input (an empty chunk changes nothing).
- **The last event id is committed at dispatch.** An `id:` line only fills a buffer; the blank line that dispatches the event commits it, even for a block with no data. So a connection that drops mid-event cannot move the resume point past an event that was never delivered.
- **An unfinished event at the end of the stream is discarded**, and one leading byte order mark is ignored.

```ts
import assert from 'node:assert/strict';

type SSEMessage = { event: string; data: string; id: string };

class SSEParser {
  private buffer = '';
  private data: string[] = [];
  private event = '';
  private idBuffer = '';
  private started = false;
  lastEventId = ''; // committed at dispatch: what a reconnect sends as Last-Event-ID
  reconnectMs: number | undefined;

  feed(chunk: string): SSEMessage[] {
    if (!this.started && chunk.length > 0) {
      this.started = true;
      if (chunk.startsWith('\uFEFF')) chunk = chunk.slice(1); // one leading BOM is ignored
    }
    this.buffer += chunk;
    const out: SSEMessage[] = [];
    let start = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch !== '\n' && ch !== '\r') continue;
      if (ch === '\r' && i === this.buffer.length - 1) break; // maybe the first half of \r\n: wait for more
      this.line(this.buffer.slice(start, i), out);
      if (ch === '\r' && this.buffer[i + 1] === '\n') i++;
      start = i + 1;
    }
    this.buffer = this.buffer.slice(start);
    return out;
  }

  /** At the end of the stream: a pending \r is a line break; an event without its blank line is dropped. */
  end(): SSEMessage[] {
    const out: SSEMessage[] = [];
    if (this.buffer.endsWith('\r')) this.line(this.buffer.slice(0, -1), out);
    this.buffer = '';
    this.data = [];
    this.event = '';
    this.idBuffer = this.lastEventId;
    return out;
  }

  private line(line: string, out: SSEMessage[]): void {
    if (line === '') {
      // A blank line dispatches: commit the id (even without data), then emit the event if it has data.
      this.lastEventId = this.idBuffer;
      if (this.data.length) out.push({ event: this.event || 'message', data: this.data.join('\n'), id: this.lastEventId });
      this.data = [];
      this.event = '';
      return;
    }
    if (line.startsWith(':')) return; // a comment, such as the ": ping" keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'data') this.data.push(value);
    else if (field === 'event') this.event = value;
    else if (field === 'id' && !value.includes('\0')) this.idBuffer = value; // not committed until dispatch
    else if (field === 'retry' && /^\d+$/.test(value)) this.reconnectMs = Number(value);
  }
}

const wire =
  ': stream open\nretry: 2000\n\nevent: token\nid: 7\ndata: {"text":"Hel"}\n\nevent: token\nid: 8\ndata: {"text":"lo"}\r\n\r\n';
const whole = new SSEParser().feed(wire);
assert.deepEqual(
  whole.map((m) => [m.event, m.id, JSON.parse(m.data).text]),
  [['token', '7', 'Hel'], ['token', '8', 'lo']],
);

// Every possible two-way split gives the same messages, and so does one character at a time.
for (let cut = 1; cut < wire.length; cut++) {
  const parser = new SSEParser();
  assert.deepEqual([...parser.feed(wire.slice(0, cut)), ...parser.feed(wire.slice(cut))], whole);
}
const slow = new SSEParser();
assert.deepEqual([...wire].flatMap((ch) => slow.feed(ch)), whole);
assert.equal(slow.reconnectMs, 2000);

// The connection drops in the middle of event 9: it is discarded, and the resume point stays at 8.
const dropped = new SSEParser();
dropped.feed('id: 8\ndata: {"text":"a"}\n\nid: 9\ndata: {"text":"b"}\n');
assert.deepEqual(dropped.end(), []);
assert.equal(dropped.lastEventId, '8');

// An empty chunk must not turn a pending \r into a line break, or this event would split in two.
const careful = new SSEParser();
const merged = ['data: a\r', '', '\ndata: b\n\n'].flatMap((c) => careful.feed(c));
assert.deepEqual(merged, [{ event: 'message', data: 'a\nb', id: '' }]);
assert.deepEqual(new SSEParser().feed('\uFEFFdata: x\n\n')[0].data, 'x');
```

Bytes need the same care as lines: decode with `new TextDecoder()` and `decode(chunk, { stream: true })`, or a multi-byte character split across two chunks turns into garbage. The project has a test that splits "é" across chunks.

### Reconnecting without losing or doubling anything

The reconnect loop is short once the event log exists: remember the last id, reconnect with it, skip anything at or below it, and back off with jitter between failures.

```ts
import assert from 'node:assert/strict';

type RunEvent = { id: number; type: string; text?: string };
type Connect = (lastEventId: number) => AsyncIterable<RunEvent>;

/** Follows a run across dropped connections. Resolves when the terminal event arrives, or gives up. */
async function follow(
  connect: Connect,
  onEvent: (event: RunEvent) => void,
  { maxAttempts = 5, delayMs = (attempt: number) => Math.random() * Math.min(10_000, 500 * 2 ** attempt) } = {},
): Promise<'finished' | 'gave_up'> {
  let lastId = 0;
  let attempt = 0;
  for (;;) {
    try {
      for await (const event of connect(lastId)) {
        attempt = 0; // the connection works again
        if (event.id <= lastId) continue; // a replay we already have
        lastId = event.id;
        onEvent(event);
        if (event.type === 'run.completed') return 'finished';
      }
    } catch {
      // a network error: fall through to the retry
    }
    if (attempt >= maxAttempts) return 'gave_up';
    await new Promise((resolve) => setTimeout(resolve, delayMs(attempt++))); // full jitter: random in [0, ceiling)
  }
}

const log: RunEvent[] = [1, 2, 3].map((id) => ({ id, type: 'token', text: `t${id}` }));
log.push({ id: 4, type: 'run.completed' });
const asked: number[] = [];
const flaky: Connect = async function* (lastEventId) {
  asked.push(lastEventId);
  // To be nasty, the server replays one event too many on a resume.
  for (const event of log.filter((e) => e.id >= lastEventId)) {
    if (asked.length === 1 && event.id === 3) throw new Error('connection reset'); // the first connection dies
    yield event;
  }
};
const seen: number[] = [];
assert.equal(await follow(flaky, (e) => seen.push(e.id), { delayMs: () => 0 }), 'finished');
assert.deepEqual(asked, [0, 2]); // reconnected with Last-Event-ID 2
assert.deepEqual(seen, [1, 2, 3, 4]); // nothing lost, nothing doubled

const down: Connect = async function* () {
  throw new Error('ECONNREFUSED');
};
assert.equal(await follow(down, () => {}, { maxAttempts: 2, delayMs: () => 0 }), 'gave_up');
```

The project's version (`client/src/lib/stream.ts`) adds three things: it treats 401, 403 and 404 as fatal (retrying will not help), it honours the server's `retry:` hint, and it takes an `AbortSignal` so Stop and unmount end both the read and any pending reconnect.

## Rendering tokens without freezing the page

A fast model can produce hundreds of tokens per second. Dispatching each one into React state means hundreds of renders per second, and the transcript stutters. The hook queues events and applies them once per animation frame:

```tsx
import { useEffect, useReducer } from 'react';

type RunEvent = { id: number; type: string; data: Record<string, unknown> };
type State = { lastEventId: number; text: string; done: boolean };
type Action = { type: 'reset' } | { type: 'events'; events: RunEvent[] };

// The stream client from the project (client/src/lib/stream.ts), declared here so the hook stays in focus.
declare function followRun(opts: { url: string; signal: AbortSignal; onEvent: (e: RunEvent) => void }): Promise<string>;

const empty: State = { lastEventId: 0, text: '', done: false };

function reducer(state: State, action: Action): State {
  if (action.type === 'reset') return empty;
  let next = state;
  for (const e of action.events) {
    if (e.id <= next.lastEventId) continue; // a replay after a reconnect
    next = {
      lastEventId: e.id,
      text: e.type === 'token' ? next.text + String(e.data.text) : next.text,
      done: next.done || e.type === 'run.completed',
    };
  }
  return next;
}

export function useRunStream(runId: string | null): State {
  const [state, dispatch] = useReducer(reducer, empty);

  useEffect(() => {
    if (!runId) return;
    dispatch({ type: 'reset' });
    const controller = new AbortController();
    const queue: RunEvent[] = [];
    let frame = 0;
    void followRun({
      url: `/api/runs/${runId}/events`,
      signal: controller.signal,
      onEvent: (event) => {
        if (controller.signal.aborted) return; // nothing from an old stream may reach the next run's state
        queue.push(event);
        // One render per frame, however many tokens arrived during it.
        if (!frame) {
          frame = requestAnimationFrame(() => {
            frame = 0;
            dispatch({ type: 'events', events: queue.splice(0) });
          });
        }
      },
    });
    return () => {
      controller.abort(); // stops the read and any reconnect
      cancelAnimationFrame(frame);
    };
  }, [runId]);

  return state;
}
```

The rest of the UI follows from accessibility and safety rules:

- **Model text is rendered as React text**, never through `dangerouslySetInnerHTML`, so output containing `<img onerror=…>` is just characters. If you render Markdown, sanitise the HTML it produces.
- **The transcript is not a live region.** `role="log"` or `aria-live` on it would make a screen reader read every token. A separate visually hidden `role="status"` region announces step-level changes ("Approval needed: create purchase order", "Run completed"), and the transcript gets `aria-busy` while the run is going. The transcript itself is a named, focusable `role="region"`, so keyboard users can scroll it (an `aria-label` on a plain `div` is not allowed).
- **Auto-scroll respects the reader.** It pins to the bottom only if the user was already near the bottom; if they scrolled up to read, it leaves them there.
- **Status is text, not only colour**: steps show "In progress", "Done" or "Skipped".

In development, React's StrictMode mounts effects twice, so you will see the control socket open, close and open again. That double mount is a free test that your cleanup really closes the socket.

## What changes in production

- **Shared event log.** Runs here live in one process's memory. With several Cloud Run instances a reconnect can land on another instance, so the log moves to Redis Streams, Firestore or Postgres, and Pub/Sub or Redis pub/sub wakes the instance holding each stream. Session affinity helps but is best effort. (Problem 5 builds this.)
- **Durable runs.** The agent task dies with a deploy. Move it to a worker (Cloud Tasks, Pub/Sub, or a workflow engine) that writes to the shared log; the web tier only streams and relays control messages.
- **Identity.** Replace the demo token with OIDC: a BFF session cookie for the stream, a short-lived token in the socket's first message, and RBAC on who may approve which action.
- **Timeouts.** Cloud Run ends every request, streams and WebSockets included, at the service's request timeout (default 5 minutes, at most 60). Long runs must expect a reconnect, which this client already handles.
- **Limits and cost.** Cap concurrent runs per user and events per run, and keep cancelling abandoned runs so a closed tab stops spending LLM tokens.

## Interview questions

### Walk me through how you would build a streaming chat for an agent. {core}

The agent runs as its own task and appends every token and step to a per-run, append-only event log. The browser reads that log over Server-Sent Events, resuming with `Last-Event-ID` after a drop, and sends control messages such as approve and cancel over a WebSocket. The UI folds events into state with a reducer that ignores ids it has already seen, and renders at most once per animation frame.

Then walk the picture: `POST /runs` starts the task and returns the run id; `GET /runs/{id}/events` streams `text/event-stream` with numbered events; `WS /runs/{id}/control` carries approve and cancel with request ids and acks. Name the guarantees: nothing is lost on reconnect, nothing is doubled, a slow client never slows the agent, and an abandoned run is cancelled after a grace period. Offer the production step: move the log to Redis Streams or Firestore so any instance can serve any stream.

### Why SSE for tokens and a WebSocket for control, instead of one WebSocket for everything? {core}

The token stream is one-way and needs resume, and SSE gives me both with plain HTTP: numbered events, `Last-Event-ID`, caching headers, and proxies and load balancers that already understand it. Control messages go the other way and need replies, which is what a WebSocket is good at. Splitting them also means a dropped socket never interrupts the stream, and Stop still works through a REST fallback.

One WebSocket for everything is a valid design, but then you rebuild what SSE gives you: message ids, a replay protocol, and reconnect handling on both sides. Where only the server talks (a log tail, a progress bar), SSE alone is enough; where the client sends a lot, such as collaborative editing or voice, a WebSocket alone is better.

### How does resume work after the connection drops? {core}

Every event has an increasing id, and the client remembers the last one it applied. On reconnect it sends that id in the `Last-Event-ID` header, and the server replays the log from the next event, then keeps streaming live. The reducer also skips any id it has already seen, so even a sloppy replay cannot double a token.

`EventSource` does this automatically (it resends the last `id:` it saw as `Last-Event-ID`), and my fetch-based client does the same by hand. Worth mentioning: the server honours an id beyond the current end of the log by waiting, rather than resending, and a page reload resumes from 0 because the run id is in the URL. If the log were capped, a resume from an evicted id would need a `reset` event carrying a snapshot (problem 2).

### Why an append-only event log rather than pushing events straight to the client? {core}

Because it separates producing from delivering. The agent appends at its own pace; each connection reads from its own position. That one structure gives resume, multiple viewers, slow-client isolation and full replay for a page reload, and it doubles as an audit trail of what the agent did and who approved it.

Pushing straight to a socket couples the agent to one connection: if the socket drops or is slow, you either lose events or block the agent. With a log, backpressure is per reader, and the server's memory cost is bounded by the log, which you can cap or move to Redis Streams.

### What happens when the user closes the tab in the middle of a run?

The SSE generator is cancelled, so the run's watcher count drops to zero and a reaper starts a 15-second grace period. If nobody reconnects in that time, the run is cancelled and the log records `run.cancelled` with reason `abandoned`. A reload or a brief network drop reconnects within the grace period and loses nothing.

The trade-off is cost versus resilience. Cancelling immediately wastes work on every network blip; never cancelling keeps spending LLM tokens for nobody. For long background jobs you would invert it: let the run finish and notify the user, and only stop streaming.

### How do you cancel a run end to end?

The Stop button sends `{"type": "cancel"}` on the control socket. The server calls `task.cancel()` on the agent task, which raises `CancelledError` at the agent's current `await`, whether it is mid-token, mid-tool-call or waiting for approval. The agent catches it, appends `run.cancelled` to the log, and ends. The stream delivers that terminal event and closes, and the client's socket closes because the run is over.

If the socket is down, Stop falls back to `DELETE /api/runs/{id}`, so the button always works. On the client, an `AbortController` stops reading the stream on unmount. For real tool calls, cancellation should propagate: pass deadlines to downstream calls, and do not cancel halfway through a non-idempotent external write, or make that write idempotent with a key.

### How do you authenticate the stream and the WebSocket? {core}

The stream uses `fetch`, so it sends a normal `Authorization: Bearer` header, or a session cookie through a BFF. The WebSocket cannot set headers from a browser, so the token goes in the first message, and the server closes with 1008 if no valid auth message arrives within 5 seconds. I avoid tokens in URLs because URLs are logged by proxies and servers.

`EventSource` also cannot set headers, so if you must use it, use a cookie session or a short-lived, single-run signed ticket in the query string (problem 1). Also check the `Origin` header on the WebSocket upgrade to block cross-site socket hijacking when cookies are involved, and re-check authorisation per action: being allowed to watch a run is not the same as being allowed to approve it.

### Why did you use fetch instead of the EventSource API?

`EventSource` is simpler, but it cannot send an `Authorization` header or a POST body, and its reconnect policy is fixed. `fetch` with a streaming body gives me headers, POST if needed, an `AbortSignal`, and my own reconnect and backoff policy. The cost is writing a parser that handles chunk boundaries, which is about 40 lines and well tested.

`EventSource` is still a good choice with cookie auth and simple GET streams: it reconnects and sends `Last-Event-ID` for you. Over HTTP/1.1, either approach uses one connection per stream, and browsers allow about six per host, so several streaming tabs can starve each other. HTTP/2 multiplexes every stream over one connection (servers usually allow at least 100 concurrent streams), so the limit effectively goes away.

### How do you stop a fast token stream from freezing the React UI?

Do not render per token. The stream handler pushes events into a queue and schedules one `requestAnimationFrame`; the frame callback dispatches the whole batch to a reducer. That caps rendering at the display's frame rate, however fast tokens arrive.

Beyond that: keep the message list's items memoised so only the streaming message re-renders, avoid layout-thrashing scroll code (read scroll position once, write once in a layout effect), and virtualise very long transcripts. Note that `requestAnimationFrame` pauses in background tabs, so events queue up and apply in one batch when the tab is visible again, which is exactly what you want.

### How do you handle backpressure in this design?

On the server, the event log is the buffer: the agent appends regardless of readers, and each reader drains at its own pace, so a slow client never blocks the agent. FastAPI's SSE path hands items to the response through one-item buffers, so a stream's generator runs only a couple of events ahead of what has been written to the connection; past that, the server's flow control and TCP buffers apply. In the browser, batching per frame keeps rendering from falling behind the network.

What I would add for scale: a cap on events per run (and a `reset` snapshot for readers who fall off the end), coalescing tokens into larger chunks on the server, and for WebSockets, watching `bufferedAmount` before sending more. Backpressure for the external calls the agent makes is a different layer: concurrency limits and rate limits per tool.

### How would you run this on Cloud Run at scale? {core}

Cloud Run supports streaming responses and WebSockets, but every stream is a request that counts toward the instance's concurrency and ends at the request timeout, which is 60 minutes at most. So I set concurrency high for I/O-bound streaming, plan for reconnects, keep the event log in a shared store so any instance can resume any stream, and run the agents in workers rather than in the web instances.

Details: session affinity keeps a client on one instance but is best effort, so correctness cannot depend on it. Fan-out comes from Redis Streams, Firestore listeners or Pub/Sub. Keep-alive comments stop idle connection drops. Instance-based billing (CPU always allocated) suits long-lived connections. Min instances avoid cold starts on the first token. Graceful shutdown on SIGTERM: stop accepting, let clients reconnect elsewhere.

### How does the human-in-the-loop approval work, and what if nobody answers?

When the agent reaches a risky action, it creates a future, appends `approval.required` with the action's details and a timeout, and awaits the future. The UI shows an approval card from that event; the decision goes over the control socket and resolves the future. If nobody decides in time, `wait_for` times out and the agent treats it as a rejection, logged as `decided_by: "timeout"`.

Because the approval is an event in the log, it survives reloads: a new tab replays the log and shows the same pending card, and because the event carries an absolute `expires_at_ms`, the countdown shows the time really left rather than starting again. In production you would also persist the pending state, so a restarted worker can resume waiting, notify approvers out of band, and check that the approver has the role for that action.

**Your angle:** HITL checkpoints in the agentic workflows at Quantiphi are the same idea: the workflow pauses at a checkpoint until a human validates.

### Why do approvals need to be idempotent?

Because the client cannot tell "my approval was lost" from "the ack was lost". If it resends after a reconnect and the server treated the second message as new, you could approve twice or approve after a rejection. So the server records one decision per step: the same decision again is acknowledged as `duplicate`, a contradicting one is rejected as `stale_approval`. That makes the client's resend-unacknowledged-requests logic safe.

It is the same principle as idempotency keys on payment APIs. When the approved action calls an external system, carry an idempotency key there too, so a retried tool call does not create two purchase orders. One subtle case: a decision that arrives in the same event-loop tick as the approval timeout has already been acked `ok`, so the server must honour it rather than record a timeout rejection.

### How do you detect a dead connection?

A TCP connection can stay half-open for minutes after a laptop sleeps or a network changes, so silence is not proof of life. On the stream, the server sends a keep-alive comment every 15 seconds and the client can treat a longer silence as a stall and reconnect (problem 4). On the socket, the client sends an application ping every 10 seconds and drops the socket if no pong arrives within 5, without waiting for a close event. Keep one ping in flight at a time: if each new ping reset the pong deadline, a dead socket would never be detected whenever the timeout is longer than the interval.

Browsers do not expose WebSocket protocol pings to JavaScript, which is why the client uses app-level ping messages. The server side also sends protocol pings: uvicorn's defaults are a 20-second ping interval and a 20-second timeout.

### How do you make streaming text accessible?

Keep the announcements separate from the text. The transcript is not a live region, or a screen reader would read every token. A visually hidden polite `role="status"` region announces step-level changes, like "Approval needed" and "Run completed", and the transcript has `aria-busy` while streaming. Controls are real buttons with clear labels, focus outlines are visible, and status is shown as text, not colour alone.

When the run finishes, users can read the whole answer at their own pace. For an approval, announce it but do not steal focus mid-sentence; let users reach the card by tab. Test with axe and a real screen reader, and respect `prefers-reduced-motion` for any scroll animation.

### How did you test it? {core}

Three layers. Backend tests use FastAPI's `TestClient` with all delays set to zero: the full lifecycle, resume from a `Last-Event-ID`, approvals including duplicates and stale ones, cancel, timeouts, the abandoned-run reaper and socket auth, in about a second. `TestClient` reads whole bodies, so one test drives the ASGI app directly and hangs up mid-stream, proving that a disconnect ends the stream and starts the grace period. Client unit tests use Vitest with a fake `fetch` and a fake WebSocket: the parser at every chunk boundary, reconnects, giving up, heartbeats and resending unacknowledged requests. Three Playwright tests drive the real app in Chrome, including a reload mid-run.

What made it testable: the timing values are settings, the clock and socket can be injected, and the logic lives in plain modules (parser, reducer, channel) with thin React hooks over them. In Playwright I use web-first assertions such as `toBeVisible`, which retry until streamed text arrives, so there are no sleeps and no flakiness.

### What breaks if a proxy buffers the response, and how do you prevent it? {deep}

Buffering turns a stream into one late response: the user sees nothing until the proxy's buffer fills or the response ends. Prevent it with `Cache-Control: no-cache`, `X-Accel-Buffering: no` for nginx-style proxies, and no response compression on the stream, and keep data flowing with keep-alive comments. FastAPI's SSE response sets the first two headers itself.

Corporate proxies and some antivirus software still buffer, which is a classic "works at home, not at the client" bug. A quick test is `curl -N` through the same path; if events arrive in clumps, something is buffering. Last resort fallbacks are long polling, or WebSockets over TLS, which proxies tend to pass through untouched.

### Where would gRPC streaming fit in this architecture? {deep}

Between services rather than to the browser. If the agent ran in a separate worker service, the web tier could subscribe to it with a server-streaming RPC, getting typed messages, deadlines and HTTP/2 flow control for free. Browsers cannot speak native gRPC, so the browser edge stays SSE or WebSocket, or uses gRPC-Web or Connect through a proxy, which supports server streaming but not client or bidirectional streaming from a browser.

On Cloud Run, a gRPC service is deployed with HTTP/2 end-to-end, so the container itself speaks HTTP/2 (h2c). The same resume rule applies: a stream can break, so the subscriber needs a "from event id N" field in its request.

### Do you have experience with streaming protocols? {core}

Answer honestly, then show depth. For example: "Not in a production browser app. The closest production work is the GCP Document AI platform at Quantiphi: a FastAPI backend with agentic workflows and HITL checkpoints, where the UI acted on workflow state. Because streaming matters for this kind of work, I built a reference app: FastAPI streaming agent events over SSE with resume, a WebSocket for approvals and cancel, and a React client with reconnects and per-frame rendering, tested down to Playwright. Happy to walk through the decisions."

Only say the second half once you have run the project and changed something in it yourself. Then let them pick a thread: resume, backpressure, auth, or scaling on Cloud Run. Each one has a card in this chapter.

## Coding problems

### Let EventSource clients authenticate and resume {medium core}

The team wants a plain `EventSource` fallback client. `EventSource` cannot send an `Authorization` header, and a brand-new `EventSource` (after a page reload) cannot send `Last-Event-ID` either. Add a `POST /runs/{run_id}/stream-ticket` endpoint that requires the bearer token and returns a short-lived ticket scoped to that one run, and let `GET /runs/{run_id}/events` accept either the bearer header or `?ticket=`. Also accept `?after=<id>` for the first connection. Example: with a valid ticket and `after=1`, a run with three events streams ids 2 and 3.

#### Hints

1. Never put the long-lived token in the URL; mint something that is useless outside this run and this minute.
2. An HMAC over a small JSON payload (`run`, `exp`) is a self-contained ticket: no database lookup needed to verify it.
3. Put the "header or ticket" check in one dependency, and resume from `max(Last-Event-ID, after)`.

#### Solution

The ticket is `base64(payload).hmac`, verified with `hmac.compare_digest` to avoid timing leaks, and checked for run scope and expiry. The access dependency accepts the bearer header first and falls back to the ticket.

```python
import base64
import hashlib
import hmac
import json
import time
from typing import Annotated

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.sse import EventSourceResponse, ServerSentEvent
from fastapi.testclient import TestClient

SECRET = b"load-me-from-secret-manager"
TOKEN = "demo-token"
EVENTS = {"run_1": [("token", {"text": "Hi"}), ("token", {"text": " there"}), ("run.completed", {})]}
app = FastAPI()


def sign(payload: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    return f"{body}.{hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()}"


def verify(ticket: str, run_id: str, now: float) -> bool:
    body, _, mac = ticket.rpartition(".")
    expected = hmac.new(SECRET, body.encode(), hashlib.sha256).hexdigest()
    # Compare bytes: compare_digest raises TypeError for non-ASCII str, which would turn junk into a 500.
    if not body or not hmac.compare_digest(mac.encode(), expected.encode()):
        return False
    payload = json.loads(base64.urlsafe_b64decode(body))
    return payload["run"] == run_id and payload["exp"] > now


def require_bearer(authorization: Annotated[str | None, Header()] = None) -> None:
    if authorization != f"Bearer {TOKEN}":
        raise HTTPException(401, "Missing or invalid bearer token")


def stream_access(run_id: str, authorization: Annotated[str | None, Header()] = None, ticket: str | None = None) -> None:
    if authorization == f"Bearer {TOKEN}" or (ticket and verify(ticket, run_id, time.time())):
        return
    raise HTTPException(401, "A bearer token or a valid stream ticket is required")


@app.post("/runs/{run_id}/stream-ticket", dependencies=[Depends(require_bearer)])
def stream_ticket(run_id: str) -> dict:
    return {"ticket": sign({"run": run_id, "exp": time.time() + 60})}


@app.get("/runs/{run_id}/events", response_class=EventSourceResponse, dependencies=[Depends(stream_access)])
async def events(
    run_id: str,
    last_event_id: Annotated[int, Header(ge=0)] = 0,
    after: Annotated[int, Query(ge=0)] = 0,
):
    start = max(last_event_id, after)  # the header on EventSource's own reconnects, ?after= on a fresh one
    for event_id, (type_, data) in enumerate(EVENTS[run_id][start:], start=start + 1):
        yield ServerSentEvent(id=str(event_id), event=type_, data=data)


client = TestClient(app)
assert client.get("/runs/run_1/events").status_code == 401
ticket = client.post("/runs/run_1/stream-ticket", headers={"Authorization": f"Bearer {TOKEN}"}).json()["ticket"]
body = client.get("/runs/run_1/events", params={"ticket": ticket, "after": 1}).text
assert [line for line in body.splitlines() if line.startswith("id:")] == ["id: 2", "id: 3"]
assert client.get("/runs/run_1/events", headers={"Authorization": f"Bearer {TOKEN}"}).status_code == 200
assert not verify(ticket, "run_2", time.time())  # scoped to one run
assert not verify(ticket, "run_1", time.time() + 120)  # expired
tampered = ticket[:-1] + ("0" if ticket[-1] != "0" else "1")
assert not verify(tampered, "run_1", time.time())
assert not verify("é.é", "run_1", time.time())  # junk from the query string is a 401, not a crash
assert client.get("/runs/run_1/events", params={"ticket": "é.é"}).status_code == 401
```

Complexity: O(1) to mint and verify a ticket; no storage.

#### Follow-ups

- **The ticket is still in a URL. Is that a problem?** Less so: it expires in a minute and only opens one run's stream. For stricter needs, make it single-use by storing its id (a `jti`) in Redis with a TTL and rejecting reuse.
- **Why not just use a cookie?** A same-site session cookie through a BFF is often the best answer, and `EventSource` sends cookies (with `withCredentials` for cross-origin). Tickets suit cross-origin setups where cookies are not an option.

### Bound the event log and handle a resume from an evicted id {medium}

Logs cannot grow forever. Write a `BoundedLog` that keeps only the newest `max_events` events, plus a snapshot of the state folded from every event so far (here, the full text). `replay(last_id)` returns the events after `last_id`, or, if some of the events the client needs were already evicted, a single `reset` event carrying the snapshot, with the latest id. Example: with `max_events=3` and five tokens "a b c d e", `replay(2)` returns events 3–5, but `replay(1)` returns `(5, "reset", {"text": "a b c d e"})`.

#### Hints

1. The client needs every event after `last_id`. That is possible only if event `last_id + 1` is still in the log.
2. A `deque` with a manual `popleft` (or `maxlen`) keeps the newest events cheaply.
3. Fold each event into the snapshot as you append it, so a reset never needs the evicted events.

#### Solution

Track the oldest retained id. If `last_id + 1` is older than that, the client has a gap it can never fill, so send the snapshot instead and let it continue from the latest id.

```python
from collections import deque
from dataclasses import dataclass, field


@dataclass
class BoundedLog:
    max_events: int
    events: deque = field(default_factory=deque)  # (id, type, data)
    next_id: int = 1
    snapshot: dict = field(default_factory=lambda: {"text": ""})

    def append(self, type_: str, data: dict) -> None:
        if type_ == "token":
            self.snapshot["text"] += data["text"]
        self.events.append((self.next_id, type_, data))
        self.next_id += 1
        if len(self.events) > self.max_events:
            self.events.popleft()

    def replay(self, last_id: int) -> list[tuple[int, str, dict]]:
        oldest = self.events[0][0] if self.events else self.next_id
        if last_id + 1 < oldest:
            return [(self.next_id - 1, "reset", dict(self.snapshot))]
        return [e for e in self.events if e[0] > last_id]


log = BoundedLog(max_events=3)
for word in ["a ", "b ", "c ", "d ", "e"]:
    log.append("token", {"text": word})
assert [e[0] for e in log.events] == [3, 4, 5]
assert [e[0] for e in log.replay(2)] == [3, 4, 5]  # event 3 is still there: a normal replay
assert log.replay(1) == [(5, "reset", {"text": "a b c d e"})]  # event 2 is gone: reset
assert log.replay(0) == [(5, "reset", {"text": "a b c d e"})]
assert log.replay(5) == []
assert BoundedLog(max_events=3).replay(0) == []  # an empty log has nothing to replay
```

Complexity: O(1) amortised per append; a replay is O(k) for k returned events (the list scan could become an index lookup because ids are contiguous).

#### Follow-ups

- **What does the client do with `reset`?** Replace its state with the snapshot and set its last id to the reset event's id; the reducer then continues normally.
- **What is in a real snapshot?** Whatever the UI needs to render: steps, statuses, the pending approval and the text so far. It is the same reducer as the client's, run on the server.

### Coalesce token events into one update per frame {easy core}

Write `createBatcher<T>(flush, schedule)`. `push(item)` queues the item; the first push after a flush asks `schedule` for one callback, and that callback passes everything queued so far to `flush` in a single call. In the browser you would pass `(run) => requestAnimationFrame(run)`. Example: pushing "Hel", "lo", " wor" before the frame fires calls `flush(["Hel", "lo", " wor"])` once.

#### Hints

1. You need two pieces of state: the queue, and whether a callback is already scheduled.
2. Swap the queue for a new empty array before calling `flush`, so items pushed during `flush` go into the next batch.

#### Solution

The `scheduled` flag guarantees one pending callback at most, however many items arrive.

```ts
import assert from 'node:assert/strict';

type Schedule = (run: () => void) => void;

function createBatcher<T>(flush: (items: T[]) => void, schedule: Schedule) {
  let queue: T[] = [];
  let scheduled = false;
  return {
    push(item: T): void {
      queue.push(item);
      if (scheduled) return;
      scheduled = true;
      schedule(() => {
        scheduled = false;
        const batch = queue;
        queue = [];
        flush(batch);
      });
    },
  };
}

const frames: (() => void)[] = [];
const flushed: string[][] = [];
const batcher = createBatcher<string>((items) => flushed.push(items), (run) => frames.push(run));
for (const token of ['Hel', 'lo', ' wor']) batcher.push(token);
assert.equal(frames.length, 1); // one frame requested for three tokens
frames.shift()!();
batcher.push('ld');
assert.equal(frames.length, 1);
frames.shift()!();
assert.deepEqual(flushed, [['Hel', 'lo', ' wor'], ['ld']]);
```

Complexity: O(1) per push; each flush is O(batch size).

#### Follow-ups

- **What happens in a background tab?** `requestAnimationFrame` stops firing, so the queue grows until the tab is visible and then flushes in one go. That is usually what you want; for very long hidden runs, fall back to a `setTimeout` schedule on `visibilitychange`.
- **How do you clean up?** Return a `cancel` function that cancels the pending frame, and call it in the effect's cleanup so nothing dispatches after unmount.

### Detect a stalled stream and reconnect {medium}

A half-open connection can leave `reader.read()` waiting forever. The server sends a `: ping` comment at least every 15 seconds, so any chunk proves the connection is alive. Write `readWithWatchdog(body, timeoutMs, onChunk)` that reads a `ReadableStream<Uint8Array>`, passes decoded text to `onChunk`, and resolves `'ended'` when the stream ends normally or `'stalled'` if no chunk arrives for `timeoutMs`, cancelling the read so the caller's reconnect loop can take over.

#### Hints

1. Build a small watchdog first: `feed()` restarts a timer; if the timer fires, call `onStall`.
2. `reader.cancel()` makes a pending `read()` resolve with `done: true`, so the loop exits on its own; a flag tells you why it ended.
3. Clear the timer in a `finally`, whatever happens.

#### Solution

Every chunk, comments included, resets the watchdog. A stall cancels the reader and the result says `'stalled'`.

```ts
import assert from 'node:assert/strict';

function createWatchdog(timeoutMs: number, onStall: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const feed = () => {
    clearTimeout(timer);
    timer = setTimeout(onStall, timeoutMs);
  };
  feed();
  return { feed, stop: () => clearTimeout(timer) };
}

async function readWithWatchdog(
  body: ReadableStream<Uint8Array>,
  timeoutMs: number,
  onChunk: (text: string) => void,
): Promise<'ended' | 'stalled'> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let stalled = false;
  const watchdog = createWatchdog(timeoutMs, () => {
    stalled = true;
    void reader.cancel('stalled'); // the pending read() resolves with done: true
  });
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return stalled ? 'stalled' : 'ended';
      watchdog.feed();
      onChunk(decoder.decode(value, { stream: true }));
    }
  } finally {
    watchdog.stop();
  }
}

/** A test stream: each step waits `ms`, then sends `text`; it closes at the end only if `close` is true. */
function source(steps: [number, string][], close: boolean): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const [ms, text] of steps) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        controller.enqueue(new TextEncoder().encode(text));
      }
      if (close) controller.close();
    },
  });
}

const chunks: string[] = [];
const stalled = await readWithWatchdog(source([[5, 'data: a\n\n'], [20, ': ping\n\n']], false), 60, (t) => chunks.push(t));
assert.equal(stalled, 'stalled'); // the ping kept it alive once, then silence
assert.deepEqual(chunks, ['data: a\n\n', ': ping\n\n']);

const ended = await readWithWatchdog(source([[5, 'data: b\n\n']], true), 60, () => {});
assert.equal(ended, 'ended');
```

Complexity: O(1) per chunk.

#### Follow-ups

- **How long should the timeout be?** Comfortably above the server's keep-alive interval, for example 45 seconds against 15-second pings, so one late ping does not cause a reconnect.
- **Where does this plug into `followRun`?** Wrap the body read: on `'stalled'`, abort the fetch and fall into the normal backoff-and-resume path, which already handles everything else.

### Serve any reconnect from any instance with Redis Streams {hard}

With several Cloud Run instances, a reconnect can land on an instance that never saw the run. Move the event log to a Redis Stream: write `RedisEventLog(redis, run_id)` with `append(type, data) -> id` and `after(last_id, block_ms=0)` that returns the events after `last_id` (use `"0"` for all), waiting up to `block_ms` for new ones when there are none. Show that an event appended through one instance's client can be resumed through another's. Note that the SSE event id is now the Redis stream id, a string like `"1792042355384-0"`.

#### Hints

1. `XADD` appends and returns a unique, increasing id; `MAXLEN ~ n` caps the stream cheaply.
2. `XREAD STREAMS key <id>` returns entries strictly after that id, and `BLOCK ms` waits for new ones, which is exactly resume plus live tail.
3. SSE ids are opaque strings to the browser, so it can echo a Redis id back in `Last-Event-ID` without knowing what it means.

#### Solution

Each instance is stateless: any of them can serve any stream by reading the shared stream from the client's last id. Tested with `fakeredis`, with two clients on one fake server standing in for two instances.

```python
import json

import fakeredis


class RedisEventLog:
    """A run's event log in a Redis Stream, so any instance can serve any reconnect."""

    def __init__(self, redis: fakeredis.FakeRedis, run_id: str, max_len: int = 10_000) -> None:
        self.redis = redis
        self.key = f"run:{run_id}:events"
        self.max_len = max_len

    def append(self, type_: str, data: dict) -> str:
        fields = {"type": type_, "data": json.dumps(data)}
        return self.redis.xadd(self.key, fields, maxlen=self.max_len, approximate=True)

    def after(self, last_id: str | None, block_ms: int = 0) -> list[tuple[str, str, dict]]:
        rows = self.redis.xread({self.key: last_id or "0"}, count=500, block=block_ms or None)
        if not rows:
            return []
        _, entries = rows[0]
        return [(entry_id, f["type"], json.loads(f["data"])) for entry_id, f in entries]


server = fakeredis.FakeServer()
instance_a = RedisEventLog(fakeredis.FakeRedis(server=server, decode_responses=True), "run_1")
instance_b = RedisEventLog(fakeredis.FakeRedis(server=server, decode_responses=True), "run_1")

ids = [instance_a.append("token", {"text": word}) for word in ["Hel", "lo", "!"]]
assert ids == sorted(ids) and len(set(ids)) == 3

# The client saw the first event through instance A, then reconnected to instance B.
resumed = instance_b.after(ids[0])
assert [(e[0], e[2]["text"]) for e in resumed] == [(ids[1], "lo"), (ids[2], "!")]
assert [e[2]["text"] for e in instance_b.after(None)] == ["Hel", "lo", "!"]
assert instance_b.after(ids[2], block_ms=20) == []  # nothing new within 20 ms
```

Complexity: `XADD` is O(1); Redis documents `XREAD` as O(k) per stream for k returned entries (O(1) with a fixed `COUNT`).

#### Follow-ups

- **Does every SSE connection hold a blocking Redis connection?** With naive `XREAD BLOCK` per stream, yes, which does not scale to thousands of streams per instance. Use one reader per instance that fans out in-process, or Redis pub/sub or Pub/Sub just to wake the right streams.
- **When does a stream get deleted?** Set an expiry on the key when the run finishes (for example, a day), so reloads and audits work for a while without keeping data forever.
- **What else could hold the log?** Firestore (a subcollection per run, with `onSnapshot` listeners for the live tail) or Postgres (a table plus `LISTEN/NOTIFY`). Choose by what the platform already runs.
