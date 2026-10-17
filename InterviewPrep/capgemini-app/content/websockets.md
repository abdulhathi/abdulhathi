---
title: "WebSockets: two-way real-time channels"
goal: Explain the WebSocket protocol, build servers in FastAPI and Node, keep connections alive and secure, reconnect without losing messages, and scale them on Cloud Run and GKE.
minutes: 70
---

SSE covers "the server talks, the browser listens". The JD also asks for **interactive agent workflows**: the user approves a tool call, cancels a run, edits a plan, or answers the agent's question in the middle of a stream. Live dashboards may push many updates per second in both directions. That is what **WebSockets** are for: one TCP connection, upgraded from HTTP, over which both sides send messages whenever they like.

Interviewers probe four areas. The protocol: handshake, frames, close codes. Reliability: heartbeats, reconnects, ordering, resync. Security: Origin checks, authentication. Scale: fan-out across instances, deploys, Cloud Run and load balancer limits. Every server and client below was run, and the reconnect logic is tested with a fake clock.

Your resume shows no WebSocket work yet. Be honest about that, then show you understand the hard parts better than most people who have used Socket.IO. **Your angle:** the agent workflows you built at Quantiphi had HITL checkpoints, and an approval prompt arriving over a live channel is exactly where WebSockets come in.

## The 60-second version

- **What:** a full-duplex, message-based protocol (RFC 6455) over one TCP connection. It starts as an HTTP request that asks to **upgrade**, and after a `101 Switching Protocols` response both sides exchange **frames**.
- **Why:** low latency in both directions, no per-message HTTP overhead, and server push without a request.
- **What you build yourself:** heartbeats, reconnection, resubscription and resync, request/response correlation, authentication of the connection *and* of each action, and fan-out across instances. HTTP gives you much of this for free. WebSockets do not.
- **When to prefer SSE:** the traffic is mostly server to client (token streams, progress). See [SSE](#/sse).

## The handshake

The client sends an ordinary HTTP/1.1 GET:

```http
GET /ws/runs HTTP/1.1
Host: agents.example.com
Upgrade: websocket
Connection: Upgrade
Origin: https://agents.example.com
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13
Sec-WebSocket-Protocol: agent-events.v1
```

The server agrees:

```http
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: agent-events.v1
```

`Sec-WebSocket-Accept` proves the server really speaks WebSocket and is not a confused HTTP cache. It is the base64 SHA-1 of the client's key plus a fixed GUID from the RFC. The key is a random nonce, **not** a security token:

```ts
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const RFC6455_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const acceptFor = (key: string) => createHash('sha1').update(key + RFC6455_GUID).digest('base64');

assert.equal(acceptFor('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo='); // the RFC's own example
```

Everything around the handshake is HTTP, which matters in production. Cookies are sent, the `Origin` header is sent, and the load balancer, proxy and platform must all allow the upgrade and long-lived connections. HTTP/2 and HTTP/3 can also carry WebSockets (RFC 8441 and RFC 9220), but most deployments still upgrade over HTTP/1.1.

## Frames, messages and close codes

After the upgrade, data travels in frames. A message can span several frames (fragmentation), and control frames can be sent in between.

| Opcode | Frame | Notes |
|---|---|---|
| `0x1` | Text | UTF-8 (JSON in practice) |
| `0x2` | Binary | Audio, protobuf, files |
| `0x0` | Continuation | The next fragment of a message |
| `0x8` | Close | Carries a code and a reason |
| `0x9` / `0xA` | Ping / Pong | Liveness checks. The receiver must answer a ping with a pong. |

Client-to-server frames are **masked** with a random key. This stops attackers using a browser to send bytes that look like other protocols to badly written proxies. It is not encryption: use `wss://` (TLS) for that. Control frames carry at most 125 bytes.

| Close code | Meaning | Who uses it |
|---|---|---|
| 1000 | Normal closure | Either side, on purpose |
| 1001 | Going away | Server shutting down, or the browser leaving the page |
| 1006 | Abnormal closure | **Never sent.** It is reported locally when the connection dropped without a close frame. |
| 1008 | Policy violation | For example a bad Origin or a forbidden action |
| 1009 | Message too big | Over the size limit |
| 1011 | Internal error | Server bug |
| 1012 / 1013 | Service restart / try again later | Deploys and overload: the client should reconnect with backoff |
| 4000–4999 | Private use | Your app's codes, for example 4401 "token expired" |

From the browser, `ws.close(code)` accepts only 1000 or 3000–4999.

## The browser API

```ts typecheck
type ServerMessage = { type: 'token'; text: string } | { type: 'approval.required'; stepId: string; summary: string };

export function openRunSocket(runId: string, onMessage: (m: ServerMessage) => void): WebSocket {
  const ws = new WebSocket(`wss://agents.example.com/ws/runs/${encodeURIComponent(runId)}`, ['agent-events.v1']);
  ws.binaryType = 'arraybuffer'; // binary frames arrive as ArrayBuffer instead of Blob
  ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', afterSeq: -1 }));
  ws.onmessage = (e) => onMessage(JSON.parse(e.data as string) as ServerMessage);
  ws.onclose = (e) => console.info('closed', e.code, e.reason, e.wasClean);
  return ws;
}

/** Do not queue unbounded data on a slow connection: bufferedAmount is bytes sent but not yet on the wire. */
export function sendIfNotCongested(ws: WebSocket, payload: string, limitBytes = 1_000_000): boolean {
  if (ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > limitBytes) return false;
  ws.send(payload);
  return true;
}
```

Know the gaps. The constructor **cannot set headers**: no `Authorization`, only the URL, cookies and subprotocols. There is **no ping method**: the browser answers server pings automatically, but to detect a dead connection *from the client* you need an application-level heartbeat. `readyState` runs CONNECTING (0), OPEN (1), CLOSING (2), CLOSED (3). Newer browsers are adding `WebSocketStream`, which brings real backpressure through streams. It is not available everywhere yet, so don't rely on it.

## A FastAPI WebSocket server

This endpoint is a run's control channel. It checks Origin, authenticates with the first message, streams tokens, and listens for `cancel` **at the same time**: one task reads while the main loop writes. The test uses `TestClient.websocket_connect`.

```python
import asyncio

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.testclient import TestClient

app = FastAPI()
ALLOWED_ORIGINS = {"https://agents.example.com"}
WORDS = [f"w{i} " for i in range(1000)]


@app.websocket("/ws/runs")
async def run_socket(ws: WebSocket) -> None:
    # CORS does not cover WebSockets, and browsers always send Origin. Closing before
    # accept() fails the handshake: uvicorn answers HTTP 403, which a browser reports
    # as close code 1006 (TestClient shows the 1008 we passed).
    if ws.headers.get("origin") not in ALLOWED_ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()

    # Browsers cannot send an Authorization header on a WebSocket, so the first message authenticates.
    hello = await ws.receive_json()
    if hello.get("type") != "auth" or hello.get("token") != "good-token":
        await ws.close(code=4401, reason="unauthorized")
        return

    start = await ws.receive_json()  # {"type": "start", "prompt": "..."}
    assert start["type"] == "start"
    cancelled = asyncio.Event()

    async def listen() -> None:
        # One task reads control messages...
        try:
            while True:
                msg = await ws.receive_json()
                if msg.get("type") == "cancel":
                    cancelled.set()
        except WebSocketDisconnect:
            cancelled.set()  # the client went away: stop the run as well

    listener = asyncio.create_task(listen())
    try:
        # ...while this loop streams tokens.
        for seq, word in enumerate(WORDS):
            if cancelled.is_set():
                await ws.send_json({"type": "cancelled", "afterSeq": seq - 1})
                break
            await ws.send_json({"type": "token", "seq": seq, "text": word})
            await asyncio.sleep(0.005)  # a real model is slower than this
        else:
            await ws.send_json({"type": "done"})
    finally:
        listener.cancel()
    await ws.close(code=1000)


client = TestClient(app)

# 1. Wrong Origin: the handshake fails.
try:
    with client.websocket_connect("/ws/runs", headers={"origin": "https://evil.example"}):
        raise AssertionError("should not connect")
except WebSocketDisconnect as exc:
    assert exc.code == 1008

# 2. Bad token: accepted, then closed with an application close code.
with client.websocket_connect("/ws/runs", headers={"origin": "https://agents.example.com"}) as ws:
    ws.send_json({"type": "auth", "token": "stolen"})
    try:
        ws.receive_json()
        raise AssertionError("should be closed")
    except WebSocketDisconnect as exc:
        assert exc.code == 4401

# 3. Start a run, read three tokens, cancel mid-stream.
with client.websocket_connect("/ws/runs", headers={"origin": "https://agents.example.com"}) as ws:
    ws.send_json({"type": "auth", "token": "good-token"})
    ws.send_json({"type": "start", "prompt": "Summarise open incidents"})
    first = [ws.receive_json() for _ in range(3)]
    assert [m["seq"] for m in first] == [0, 1, 2]
    ws.send_json({"type": "cancel"})
    while (msg := ws.receive_json())["type"] == "token":
        pass
    assert msg["type"] == "cancelled" and msg["afterSeq"] < len(WORDS) - 1
```

With several writers (a token loop plus a heartbeat task, say), route every outgoing message through one `asyncio.Queue` and a **single writer task**. Then messages never interleave unpredictably and backpressure lives in one place.

## A Node server with ws

`ws` is the standard Node library. This server authenticates the **upgrade** itself (Origin), then the first message (token). It replays missed events on `subscribe`, and runs the classic heartbeat: ping everyone on an interval, and terminate any socket that did not answer the previous ping. The test covers all four outcomes, including a "zombie" client that never answers pings.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';

type ClientMessage = { type: 'auth'; token: string } | { type: 'subscribe'; runId: string; afterSeq: number };
type ServerMessage =
  | { type: 'ready' }
  | { type: 'run.event'; runId: string; seq: number; status: string }
  | { type: 'error'; message: string };

const ALLOWED_ORIGIN = 'https://agents.example.com';
const HEARTBEAT_MS = 25_000; // 20-30 s in production; the test calls heartbeatTick() itself
const RUN_LOG = ['queued', 'running', 'tool_call', 'awaiting_approval', 'succeeded'];

const server = createServer();
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
const alive = new WeakMap<WebSocket, boolean>();
const send = (ws: WebSocket, msg: ServerMessage) => ws.send(JSON.stringify(msg));

// Check the upgrade request before a socket exists.
server.on('upgrade', (req, socket, head) => {
  if (req.headers.origin !== ALLOWED_ORIGIN) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  alive.set(ws, true);
  ws.on('pong', () => alive.set(ws, true));
  let authed = false;
  ws.on('message', (raw, isBinary) => {
    if (isBinary) return ws.close(1003, 'text frames only');
    const msg = JSON.parse(raw.toString()) as ClientMessage; // validate with zod in real code
    if (!authed) {
      if (msg.type === 'auth' && msg.token === 'good-token') {
        authed = true;
        send(ws, { type: 'ready' });
      } else {
        ws.close(4401, 'unauthorized');
      }
      return;
    }
    if (msg.type === 'subscribe') {
      // Replay what the client missed; a real server then keeps pushing live events.
      RUN_LOG.forEach((status, seq) => {
        if (seq > msg.afterSeq) send(ws, { type: 'run.event', runId: msg.runId, seq, status });
      });
    }
  });
});

// A socket that did not answer the previous ping is dead (closed laptop lid, NAT timeout).
function heartbeatTick() {
  for (const ws of wss.clients) {
    if (!alive.get(ws)) {
      ws.terminate();
      continue;
    }
    alive.set(ws, false);
    ws.ping();
  }
}
const heartbeat = setInterval(heartbeatTick, HEARTBEAT_MS);

await new Promise<void>((resolve) => server.listen(0, resolve));
const url = `ws://localhost:${(server.address() as AddressInfo).port}/ws`;

function connect(origin: string, options: { autoPong?: boolean } = {}) {
  const ws = new WebSocket(url, { origin, ...options });
  const inbox: ServerMessage[] = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString()) as ServerMessage));
  const opened = new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  const closed = new Promise<{ code: number; reason: string }>((resolve) =>
    ws.once('close', (code, reason) => resolve({ code, reason: reason.toString() })),
  );
  return { ws, inbox, opened, closed };
}
const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 500 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(check(), 'timed out');
};

// 1. Wrong Origin: refused during the handshake.
await assert.rejects(connect('https://evil.example').opened, /Unexpected server response: 403/);

// 2. Bad token: accepted, then closed with an application close code.
const intruder = connect(ALLOWED_ORIGIN);
await intruder.opened;
intruder.ws.send(JSON.stringify({ type: 'auth', token: 'stolen' }));
assert.deepEqual(await intruder.closed, { code: 4401, reason: 'unauthorized' });

// 3. Happy path: after a reconnect the client already has seq 0 and 1, so it subscribes after 1.
const client = connect(ALLOWED_ORIGIN);
await client.opened;
client.ws.send(JSON.stringify({ type: 'auth', token: 'good-token' }));
await waitFor(() => client.inbox.length === 1);
client.ws.send(JSON.stringify({ type: 'subscribe', runId: 'run-7', afterSeq: 1 }));
await waitFor(() => client.inbox.length === 4);
assert.deepEqual(
  client.inbox.map((m) => (m.type === 'run.event' ? m.status : m.type)),
  ['ready', 'tool_call', 'awaiting_approval', 'succeeded'],
);

// 4. A client that never answers pings is terminated, and it sees 1006 (no close frame).
// The test drives two heartbeat rounds itself, so timing on a busy machine cannot change the result.
const zombie = connect(ALLOWED_ORIGIN, { autoPong: false });
await zombie.opened;
heartbeatTick(); // round 1: ping everyone
await waitFor(() => [...wss.clients].filter((ws) => alive.get(ws)).length === 1); // only the healthy client ponged
heartbeatTick(); // round 2: the zombie never answered, so it is terminated
assert.equal((await zombie.closed).code, 1006);

// The healthy client survived both rounds.
assert.equal(client.ws.readyState, WebSocket.OPEN);
client.ws.close(1000, 'bye');
assert.equal((await client.closed).code, 1000);

clearInterval(heartbeat);
wss.close();
server.close();
```

## Staying connected: heartbeats, reconnects and resync

Connections die silently. A laptop sleeps, a phone switches networks, a NAT box forgets the mapping. TCP may not notice for minutes. So:

- **Heartbeats in both directions.** The server pings and terminates sockets that do not pong (above). The client sends an app-level `{"type":"ping"}` every N seconds and treats a missing `pong` as a dead connection, because the browser API cannot ping.
- **Reconnect with exponential backoff and full jitter.** Pick a random delay between 0 and `min(cap, base × 2^attempt)`. Jitter matters: after a deploy, ten thousand clients must not all reconnect in the same second. Reset the backoff only after the connection has stayed up a while. Do not retry on auth failures (refresh the token first) or policy violations. The first coding problem builds this, with tests.
- **Resubscribe and resync.** On reconnect, send the subscriptions again with the **last sequence number** you processed. The server replays from its log, or sends a snapshot if the gap is too large. Within one connection TCP keeps order. Across reconnects, sequence numbers and idempotent handlers prevent gaps and duplicates.
- **React to the environment.** Reconnect immediately on the browser's `online` event or when a hidden tab becomes visible. Pause heartbeats in background tabs if battery matters.

## Authentication and security

| Approach | How | Trade-off |
|---|---|---|
| Session cookie | Sent automatically with the upgrade request | Simple and HttpOnly, but you **must** check `Origin` (see CSWSH below) |
| First-message auth | Connect, then send `{type: "auth", token}` within a few seconds | Token never appears in URLs; the server holds unauthenticated sockets briefly |
| One-time ticket in the URL | An authenticated POST returns a short-lived, single-use ticket; connect with `?ticket=` | Works with any proxy; the ticket is useless after one use even if logged |
| Subprotocol header | Smuggle a token in `Sec-WebSocket-Protocol` | A hack; tokens leak into logs. Avoid it |

- **Cross-Site WebSocket Hijacking (CSWSH):** CORS does **not** apply to WebSockets. If you authenticate with cookies and don't check `Origin`, any website the user visits can open a socket to your server with the user's cookies and read the replies. Always allow-list `Origin`.
- **Authorise every action, not just the connection.** "Can this user approve step 3 of run 42?" is checked per message. A connection may outlive a permission change.
- **Token expiry:** close with an app code (4401). The client refreshes its token and reconnects, or you support a `reauth` message.
- **Validate every message** (zod or Pydantic), cap message size (`maxPayload`), rate-limit messages per connection, and use `wss://` only.

## Scaling WebSockets

A WebSocket is **stateful**: a specific server instance holds it. That changes everything about scaling.

- **Fan-out across instances.** The worker that produces an event is rarely the instance holding the user's socket. Publish events to a broker, such as Redis pub/sub or Streams (Memorystore), Pub/Sub, or Firestore real-time listeners. Each instance subscribes and forwards to its own sockets.
- **Sticky sessions:** a raw WebSocket is pinned to one instance once it is upgraded, so you don't need stickiness for the connection itself. You need it if a library falls back to HTTP long polling (Socket.IO), because the polls must reach the same instance. Either way, a **reconnect may land elsewhere**, so per-user state must live outside the instance.
- **Capacity:** each connection costs memory, a file descriptor and heartbeat work. An async server holds thousands. Measure per-connection memory and set instance limits from it.
- **Deploys:** stop accepting on the old instance, then close connections gradually with 1012 (service restart) or 1001. Clients reconnect with jitter to new instances. On Kubernetes, use a `preStop` hook and a `terminationGracePeriodSeconds` long enough to drain.
- **Slow consumers:** give each connection a bounded outbound queue. When it fills, drop intermediate updates (telemetry), or disconnect the client and let it resync. The fourth coding problem builds this.

**Cloud Run** supports WebSockets with no extra configuration, but the platform rules apply:

- The connection is a request, so the **request timeout** (default 5 minutes, maximum 60) ends it, and clients must reconnect.
- Session affinity is **best effort**, so a reconnecting client can reach a different instance.
- Each connection counts against concurrency (up to 1,000 per instance).
- An instance with an open WebSocket counts as active, so open connections cost money even when idle.
- Do **not** enable end-to-end HTTP/2 for a WebSocket service.
- Google suggests Memorystore Redis pub/sub or Firestore real-time updates to sync instances.

**GKE and Google Cloud load balancers:** Application Load Balancers pass the upgrade through, but the **backend service timeout** (30 s by default) treats WebSockets differently by mode. On the **classic** Application Load Balancer, which GKE Ingress provisions, it closes every WebSocket when it expires, active or idle, so raise it with a `BackendConfig`. On the **global external** Application Load Balancer (for example a GKE Gateway), active connections ignore it and only idle ones are closed at the timeout, and every connection is closed after 24 hours regardless. Either way, heartbeats keep connections from looking idle and clients must reconnect.

## Socket.IO vs raw WebSockets

| | Raw WebSocket (`ws`, FastAPI) | Socket.IO |
|---|---|---|
| Protocol | The standard; any client can connect | Its own protocol on top of WebSocket; needs a Socket.IO client |
| Reconnect, heartbeats | You build them | Built in |
| Rooms, broadcast, acknowledgements | You build them | Built in |
| Fallback | None | HTTP long polling when WebSockets are blocked |
| Multi-instance | You add a broker | Redis adapter; sticky sessions needed with polling |
| Weight | Small | Larger client and server |

Raw WebSockets plus a small reconnect layer suit a platform with typed messages and your own broker. Socket.IO is quicker to start with, and useful when users sit behind proxies that block WebSockets.

## Interview questions

### What is a WebSocket, and how is it different from HTTP? {core}

"A WebSocket is a persistent, full-duplex connection between browser and server. It starts as an HTTP request that upgrades to the WebSocket protocol, and after that both sides send messages at any time over the same TCP connection, with a few bytes of framing instead of HTTP headers on every message. HTTP is request/response and stateless. A WebSocket is stateful and long-lived, which is why reconnects, heartbeats and scaling become my problem rather than the platform's."

### Walk me through the WebSocket handshake. {core}

"The client sends an HTTP/1.1 GET with `Upgrade: websocket`, `Connection: Upgrade`, a random `Sec-WebSocket-Key`, `Sec-WebSocket-Version: 13`, and optionally the subprotocols it speaks. The server answers `101 Switching Protocols` with `Sec-WebSocket-Accept`, the base64 SHA-1 of the key plus a fixed GUID, which proves it understood the request. From then on the connection carries WebSocket frames. Because the handshake is HTTP, cookies and Origin travel with it, and that's where I authenticate and check Origin."

### WebSockets or SSE for a streaming LLM chat? {core}

"For the token stream itself I'd pick SSE or fetch streaming. It's one request and one streamed response, it works through every proxy and on Cloud Run, and resume is built in. Actions like cancel and approve are separate POSTs. I'd move to WebSockets when the interaction becomes truly bidirectional and frequent: collaborative editing of an agent's plan, presence, live dashboards with client-side subscriptions changing all the time, or voice. Then one channel beats many requests."

The senior addition: "Either way, the event schema, sequence numbers and resume logic are the same, so the transport is swappable."

### How do you detect a dead WebSocket connection? {core}

"Heartbeats. TCP alone can take minutes to notice a vanished peer. On the server I ping every 20 to 30 seconds and terminate any socket that didn't pong since the last round. The `ws` library's `isAlive` pattern does exactly that. The browser answers pings automatically, but it can't send them, so the client also sends an application-level ping and reconnects if no pong arrives in time. Heartbeats also keep proxies and NAT devices from timing out idle connections."

### How do you design reconnection for a WebSocket client? {core}

"Exponential backoff with full jitter, capped at around 30 seconds, so a deploy doesn't create a reconnect storm. Reset the backoff only after the connection has been stable for a few seconds. Don't retry on close codes that need a fix first, like an expired token (refresh it, then reconnect) or a policy violation. On every reconnect, resubscribe with the last sequence number processed, so the server can replay what was missed or send a snapshot. Reconnect immediately on the browser's `online` and visibility events, and show the user a connection state."

### How do you authenticate a WebSocket connection? {core}

"The browser API can't set an Authorization header, so I use one of three patterns. A session cookie on the upgrade request, plus a strict Origin check. Or a short-lived, single-use ticket from an authenticated REST call, passed in the URL. Or an auth message as the first frame, closing the socket if it doesn't arrive within a few seconds. Then I still authorise every action per message, because the connection can outlive a role change, and I close with an app code like 4401 when the token expires so the client refreshes and reconnects."

### What is Cross-Site WebSocket Hijacking? {deep}

"CORS doesn't apply to WebSockets: any page can open a socket to any server. If my server authenticates by cookie and doesn't check the Origin header, a malicious site the user visits can open a socket to my server, ride the user's cookies, and read everything my server sends. The fix is an Origin allow-list on the upgrade request, and ideally token-based auth for the socket rather than ambient cookies. SameSite cookies help, but I don't rely on them alone."

### How do you scale WebSocket servers horizontally? {core}

"Each connection lives on one instance, but events are produced elsewhere, by workers or other users. So instances subscribe to a broker, Redis pub/sub or Streams, or Google Pub/Sub, and forward messages to the sockets they hold, usually by room or run id. Connection state such as subscriptions and last sequence lives in the broker or a database, so a reconnect can land on any instance. Then I size by open connections and memory per connection, set heartbeats under every idle timeout, and drain gracefully on deploys."

### Do WebSockets need sticky sessions? {deep}

"Not for the connection itself: once upgraded, it's pinned to one instance for its lifetime. You need stickiness if the library falls back to HTTP long polling, as Socket.IO can, because consecutive polls must hit the same instance. And stickiness is never a correctness tool, because reconnects can land anywhere. On Cloud Run, session affinity is best effort. So shared state lives outside the instance."

### How do you deploy WebSocket servers without dropping everyone at once? {deep}

"Drain gradually. The old instance stops accepting new connections, then closes existing ones in batches with 1012 'service restart' or 1001. Clients reconnect with jittered backoff to the new instances and resume from their last sequence number, so users see at most a brief reconnecting state. On Kubernetes that means a preStop hook, a long enough termination grace period, and readiness failing first so the load balancer stops sending new upgrades."

### How does backpressure work with WebSockets? {deep}

"In the browser, `send` never blocks. It queues, and `bufferedAmount` tells you how many bytes are waiting, so I check it before sending large or frequent data. On the server, `ws` exposes `bufferedAmount` too, and in Python `send` awaits. The real design question is the slow consumer: a dashboard client on a bad network can't keep up with telemetry. I give each connection a bounded queue and pick a policy per stream: coalesce to the latest value for telemetry, or disconnect and let the client resync for streams where every message matters."

### How do you guarantee ordering and avoid duplicates over WebSockets? {core}

"Within one connection, TCP keeps order and a single writer per socket keeps my messages from interleaving. The risk is reconnects: messages sent while the client was away, or delivered twice around a reconnect. So every event carries a per-stream sequence number, the client tracks the last one it processed and ignores anything older, and on reconnect it asks for everything after that number. For client-to-server commands I attach a message id and make handlers idempotent, so a retried 'approve' can't approve twice."

### How do you do request/response over a WebSocket?

"Correlation ids. Each request carries a unique id, the server echoes it in the response, and the client keeps a map of id to pending promise with a timeout. Two details people miss: reject all pending requests when the socket closes, or callers hang forever, and make the operations idempotent, because after a reconnect you don't know whether the server processed the request. The second coding problem implements this."

### Which close codes do you use, and why?

"1000 for a normal close, 1001 when a server shuts down, 1008 for policy violations like a bad Origin, 1009 for oversized messages, 1011 for server errors, and 1012 or 1013 when I want clients to come back later with backoff. 1006 is never sent: the client sees it when the connection dropped without a close frame, which is a 'reconnect' signal. App-specific reasons go in 4000 to 4999, for example 4401 'token expired'. The client's reconnect policy reads these codes: retry on 1006, 1001, 1012 and 1013, refresh the token on 4401, give up on 1008."

### Socket.IO or raw WebSockets? {deep}

"Socket.IO gives you reconnects, heartbeats, rooms, acknowledgements and a long-polling fallback out of the box, with a Redis adapter for multiple instances. The cost is its own protocol, so plain WebSocket clients can't connect, a heavier client, and sticky sessions when polling is used. For a platform with typed messages, its own broker and non-browser clients, I'd use raw WebSockets with a small, tested reconnect layer. For a quick product or users behind restrictive proxies, Socket.IO is reasonable."

### How do you run WebSockets on Cloud Run? {core}

"It works with no special configuration, but four things matter. The request timeout, at most 60 minutes, ends every connection, so clients must reconnect and resume. Session affinity is only best effort, so state lives in Memorystore Redis or Firestore and instances fan out through pub/sub. Concurrency counts open sockets, up to 1,000 per instance, so I plan instances by connections. And an instance with open sockets stays active and billed, so idle connections cost money. Also, don't enable end-to-end HTTP/2 for a WebSocket service."

**Your angle:** you know Cloud Run's deployment model from Quantiphi (Artifact Registry, revisions, Dev/SIT/UAT). WebSockets add the timeout, affinity and fan-out planning.

### How do you run WebSockets behind a load balancer on GKE? {deep}

"Google's Application Load Balancer passes the Upgrade through. The trap is its backend service timeout, 30 seconds by default. On the classic load balancer that GKE Ingress creates, it closes WebSockets when it expires, active or not, so I raise it with a BackendConfig. On the global external load balancer, only idle connections are closed at the timeout and active ones last at most 24 hours. So I always run heartbeats and design for reconnects. Inside the cluster, connections are long-lived, so the HPA scales on connections or CPU rather than requests per second, and rolling updates need a preStop drain and a long enough grace period."

### How do you test WebSocket code?

"In FastAPI, `TestClient.websocket_connect` drives the endpoint synchronously: send JSON, receive JSON, assert close codes. In Node, I start a `ws` server on port 0 in the test and connect real clients, including deliberately broken ones, like a client with auto-pong disabled to test the heartbeat. Reconnect logic is a pure state machine tested with a fake clock. End to end, Playwright can observe a page's sockets with `page.on('websocket')` and mock them with `page.routeWebSocket`."

### How would you structure the messages on a socket?

"An envelope with `type`, a message `id`, an optional `replyTo` for responses, a sequence number for server events, a timestamp and a payload. Types form a discriminated union, so the client switch is exhaustive in TypeScript and both sides validate with zod or Pydantic. I version the protocol through the subprotocol name or a version field, and keep messages small: large artifacts go by URL."

### How do you use a WebSocket from React without leaking connections? {deep}

"One connection per app, not per component. I keep it in a small external store or context, and components subscribe to slices with `useSyncExternalStore` or a store library like Zustand, or push updates into TanStack Query's cache with `setQueryData`. If a component does own a socket, the effect must close it in its cleanup. StrictMode's double-run of effects in development catches missing cleanups. Reconnect logic lives in the store, not in components."

## Coding problems

### Write a reconnect policy with backoff and jitter {medium core}

Build a `Reconnector` that keeps one connection alive. When the connection closes, it waits a full-jitter exponential backoff delay and reconnects. It resets the backoff only after the connection has been up for 5 seconds. It never retries on 1000 (we closed it), 1008 (policy) or 4401/4403 (auth). It reports `auth-required` for 4401. Make time and randomness injectable and test it with a fake clock.

#### Hints

1. Full jitter: `delay = random() * min(cap, base * 2 ** attempt)`.
2. Keep the policy separate from the transport: the class receives `onOpen` and `onClose(code)` callbacks from a `connect` function you inject. In the browser, `connect` wraps `new WebSocket(url)`.
3. A fake clock is a list of `{at, fn}` tasks plus `advance(ms)` that runs the tasks that are due.

#### Solution

The state machine has four states: connecting, open, waiting and stopped. All the policy lives in `handleClose`.

```ts
import assert from 'node:assert/strict';

/** Full jitter: a random delay in [0, min(cap, base * 2^attempt)), so a crowd of clients spreads out. */
export function backoffDelay(attempt: number, random: () => number = Math.random, baseMs = 500, capMs = 30_000): number {
  return Math.floor(random() * Math.min(capMs, baseMs * 2 ** attempt));
}

type Handlers = { onOpen: () => void; onClose: (code: number) => void; onMessage: (data: string) => void };
type Connection = { send(data: string): void; close(code?: number, reason?: string): void };
type Clock = { now(): number; setTimeout(fn: () => void, ms: number): number; clearTimeout(id: number): void };

// Close codes after which retrying cannot help: something must change first.
const NO_RETRY = new Set([1000, 1008, 4401, 4403]);
const STABLE_MS = 5_000;

export class Reconnector {
  attempt = 0;
  state: 'connecting' | 'open' | 'waiting' | 'stopped' = 'stopped';
  private conn: Connection | null = null;
  private openedAt = 0;
  private timer: number | null = null;
  private readonly connect: (h: Handlers) => Connection;
  private readonly clock: Clock;
  private readonly random: () => number;
  private readonly onEvent: (event: string) => void;

  constructor(opts: { connect: (h: Handlers) => Connection; clock: Clock; random?: () => number; onEvent?: (event: string) => void }) {
    this.connect = opts.connect;
    this.clock = opts.clock;
    this.random = opts.random ?? Math.random;
    this.onEvent = opts.onEvent ?? (() => {});
  }

  start(): void {
    this.state = 'connecting';
    this.conn = this.connect({
      onOpen: () => {
        this.state = 'open';
        this.openedAt = this.clock.now();
        this.onEvent('open'); // the caller resubscribes here with the last sequence number it processed
      },
      onMessage: (data) => this.onEvent(`message:${data}`),
      onClose: (code) => this.handleClose(code),
    });
  }

  stop(): void {
    if (this.timer !== null) this.clock.clearTimeout(this.timer);
    this.state = 'stopped';
    this.conn?.close(1000, 'client closed');
  }

  private handleClose(code: number): void {
    this.conn = null;
    if (this.state === 'stopped') return;
    if (NO_RETRY.has(code)) {
      this.state = 'stopped';
      this.onEvent(code === 4401 ? 'auth-required' : `gave-up:${code}`);
      return;
    }
    if (this.state === 'open' && this.clock.now() - this.openedAt >= STABLE_MS) this.attempt = 0;
    const delay = backoffDelay(this.attempt++, this.random);
    this.state = 'waiting';
    this.onEvent(`retry-in:${delay}`);
    this.timer = this.clock.setTimeout(() => this.start(), delay);
  }
}

// In the browser, the adapter is a few lines around the native WebSocket.
export const browserConnect = (url: string) => (h: Handlers): Connection => {
  const ws = new WebSocket(url);
  ws.onopen = () => h.onOpen();
  ws.onclose = (e) => h.onClose(e.code);
  ws.onmessage = (e) => h.onMessage(String(e.data));
  return ws;
};

// ---- Tests with a fake clock and fake sockets: no real time passes. ----
class FakeClock implements Clock {
  t = 0;
  private tasks: { at: number; fn: () => void; id: number }[] = [];
  private nextId = 1;
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.tasks.push({ at: this.t + ms, fn, id });
    return id;
  }
  clearTimeout(id: number) {
    this.tasks = this.tasks.filter((x) => x.id !== id);
  }
  advance(ms: number) {
    this.t += ms;
    for (const task of this.tasks.filter((x) => x.at <= this.t)) {
      this.tasks = this.tasks.filter((x) => x !== task);
      task.fn();
    }
  }
}

const clock = new FakeClock();
const sockets: Handlers[] = [];
const events: string[] = [];
const r = new Reconnector({
  clock,
  random: () => 0.5, // deterministic jitter for the test
  connect: (h) => {
    sockets.push(h);
    return { send() {}, close: (code = 1000) => h.onClose(code) };
  },
  onEvent: (e) => events.push(e),
});

r.start();
sockets[0].onOpen();
sockets[0].onClose(1006); // dropped without a close frame
assert.equal(r.state, 'waiting');
clock.advance(250); // 0.5 * 500
assert.equal(sockets.length, 2);
sockets[1].onClose(1006); // failed again immediately: back off further
clock.advance(499);
assert.equal(sockets.length, 2); // not yet: 0.5 * 1000 = 500
clock.advance(1);
assert.equal(sockets.length, 3);
sockets[2].onOpen();
clock.advance(10_000); // stable for 10 s...
sockets[2].onClose(1012); // ...then a server restart: the backoff starts over
assert.equal(events.at(-1), 'retry-in:250');
clock.advance(250);
sockets[3].onClose(4401); // token expired: don't hammer the server
assert.equal(r.state, 'stopped');
assert.equal(events.at(-1), 'auth-required');
assert.deepEqual(events.filter((e) => e.startsWith('retry-in')), ['retry-in:250', 'retry-in:500', 'retry-in:250']);

// stop() closes with 1000 and never reconnects.
const r2 = new Reconnector({ clock, random: () => 0.5, connect: (h) => ({ send() {}, close: (code = 1000) => h.onClose(code) }) });
r2.start();
r2.stop();
clock.advance(60_000);
assert.equal(r2.state, 'stopped');

// The delay is capped, and jitter keeps it below the cap.
assert.equal(backoffDelay(20, () => 0.999), 29_970);
```

Complexity: O(1) per event.

#### Follow-ups

- **Why reset only after 5 stable seconds?** A server that accepts and then immediately drops connections (a crash loop, an auth bug) would otherwise reset the backoff on every attempt and get hammered.
- **Why full jitter rather than "exponential plus a little jitter"?** It spreads synchronised clients across the whole window, which flattens reconnect storms best.
- **What else triggers a reconnect?** The browser's `online` event, a hidden tab becoming visible, and a missed application-level pong.

### Request/response with correlation ids over a socket {medium}

Implement `SocketRpc` on top of any `send(text)` function. `call(method, params)` returns a promise that resolves with the matching response's `result` or rejects with its `error`. Responses may arrive in any order. A call with no response within `timeoutMs` rejects with a timeout. When the connection closes, every pending call rejects at once. Messages without an id are events: pass them to an `onEvent` callback.

#### Hints

1. Keep `Map<id, { resolve, reject, timer }>`. Generate ids with a counter (or `crypto.randomUUID()`).
2. On a response, look up the id, clear its timer, delete the entry, and settle the promise. Ignore unknown ids (late responses after a timeout).
3. `failAll(reason)` iterates over the map, rejects each entry and clears the map.

#### Solution

The pending map is the whole design. The details people miss are cleaning up on timeout and on close.

```ts
import assert from 'node:assert/strict';

type Response = { id: string; result?: unknown; error?: { code: number; message: string } };
type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> };

export class SocketRpc {
  private pending = new Map<string, Pending>();
  private nextId = 1;
  private readonly send: (text: string) => void;
  private readonly timeoutMs: number;
  private readonly onEvent: (event: unknown) => void;

  constructor(send: (text: string) => void, opts: { timeoutMs?: number; onEvent?: (event: unknown) => void } = {}) {
    this.send = send;
    this.timeoutMs = opts.timeoutMs ?? 5_000;
    this.onEvent = opts.onEvent ?? (() => {});
  }

  call(method: string, params: unknown): Promise<unknown> {
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send(JSON.stringify({ id, method, params }));
    });
  }

  handleMessage(text: string): void {
    const msg = JSON.parse(text) as Partial<Response>;
    if (typeof msg.id !== 'string') return this.onEvent(msg); // no id: a server-pushed event
    const entry = this.pending.get(msg.id);
    if (!entry) return; // a late reply to a call that already timed out
    clearTimeout(entry.timer);
    this.pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(`${msg.error.code}: ${msg.error.message}`));
    else entry.resolve(msg.result);
  }

  failAll(reason: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    this.pending.clear();
  }

  get inFlight(): number {
    return this.pending.size;
  }
}

// A fake server that answers out of order.
const sent: { id: string; method: string; params: unknown }[] = [];
const events: unknown[] = [];
const rpc = new SocketRpc((t) => sent.push(JSON.parse(t)), { timeoutMs: 30, onEvent: (e) => events.push(e) });

const approve = rpc.call('approve', { runId: 'r1', stepId: 's3' });
const status = rpc.call('getStatus', { runId: 'r1' });
rpc.handleMessage(JSON.stringify({ id: sent[1].id, result: { status: 'running' } })); // the second call answers first
rpc.handleMessage(JSON.stringify({ type: 'token', text: 'hi' })); // an event mixed into the stream
rpc.handleMessage(JSON.stringify({ id: sent[0].id, error: { code: 403, message: 'approver role required' } }));
assert.deepEqual(await status, { status: 'running' });
await assert.rejects(approve, /403: approver role required/);
assert.deepEqual(events, [{ type: 'token', text: 'hi' }]);

// No reply: the call times out and is removed from the map.
await assert.rejects(rpc.call('slow', {}), /timeout: slow/);
assert.equal(rpc.inFlight, 0);
rpc.handleMessage(JSON.stringify({ id: sent[2].id, result: 'too late' })); // ignored, no crash

// The socket closes: every pending call rejects immediately instead of waiting for its timeout.
const a = rpc.call('a', {});
const b = rpc.call('b', {});
rpc.failAll('connection closed');
await assert.rejects(a, /connection closed/);
await assert.rejects(b, /connection closed/);
assert.equal(rpc.inFlight, 0);
```

Complexity: O(1) per call and response, O(p) for `failAll` with p pending calls.

#### Follow-ups

- **What about retries after a reconnect?** Only for idempotent methods, or send an idempotency key so the server can deduplicate. You don't know whether the server processed a request whose reply was lost.
- **Why not just use HTTP for request/response?** Often you should. Keep the socket for pushes and true streams, and send commands as POSTs. Correlation ids are for when everything must go over one channel.

### Validate and route incoming socket messages {easy}

Write `handleClientMessage(raw, ctx)` for a server. It parses JSON safely, rejects messages over 8 KB, validates the message against a zod discriminated union (`subscribe`, `approve`, `cancel`, `ping`), checks permissions (only users with the `approver` role may approve), and returns the list of messages to send back. Invalid input must never throw. Return an `error` message instead.

#### Hints

1. `z.discriminatedUnion('type', [...])` plus `safeParse` gives you typed data or a list of issues.
2. A `switch` on `msg.type` with a `never` check in the `default` branch makes the compiler tell you when a new message type is not handled.
3. Check the size before parsing, so a huge message costs nothing.

#### Solution

Parse, then validate, then authorise, then act: each step can fail with a clear error, and nothing throws to the socket loop.

```ts
import assert from 'node:assert/strict';
import { z } from 'zod';

const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('subscribe'), runId: z.string().min(1), afterSeq: z.number().int().min(-1) }),
  z.object({ type: z.literal('approve'), runId: z.string().min(1), stepId: z.string().min(1), decision: z.enum(['approve', 'reject']) }),
  z.object({ type: z.literal('cancel'), runId: z.string().min(1) }),
  z.object({ type: z.literal('ping'), t: z.number() }),
]);
type ClientMessage = z.infer<typeof ClientMessage>;

type ServerMessage =
  | { type: 'subscribed'; runId: string; afterSeq: number }
  | { type: 'decision.recorded'; runId: string; stepId: string; decision: 'approve' | 'reject' }
  | { type: 'cancelling'; runId: string }
  | { type: 'pong'; t: number }
  | { type: 'error'; code: 'too_large' | 'bad_json' | 'invalid' | 'forbidden'; detail: string };

type Ctx = { userId: string; roles: Set<string> };
const MAX_BYTES = 8 * 1024;

export function handleClientMessage(raw: string, ctx: Ctx): ServerMessage[] {
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) return [{ type: 'error', code: 'too_large', detail: `max ${MAX_BYTES} bytes` }];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [{ type: 'error', code: 'bad_json', detail: 'message is not JSON' }];
  }
  const parsed = ClientMessage.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'message'}: ${i.message}`).join('; ');
    return [{ type: 'error', code: 'invalid', detail }];
  }
  const msg: ClientMessage = parsed.data;
  switch (msg.type) {
    case 'subscribe':
      return [{ type: 'subscribed', runId: msg.runId, afterSeq: msg.afterSeq }];
    case 'approve':
      if (!ctx.roles.has('approver')) return [{ type: 'error', code: 'forbidden', detail: 'approver role required' }];
      return [{ type: 'decision.recorded', runId: msg.runId, stepId: msg.stepId, decision: msg.decision }];
    case 'cancel':
      return [{ type: 'cancelling', runId: msg.runId }];
    case 'ping':
      return [{ type: 'pong', t: msg.t }];
    default: {
      const unreachable: never = msg; // adding a type to the union without handling it is a compile error
      return unreachable;
    }
  }
}

const viewer: Ctx = { userId: 'u1', roles: new Set(['viewer']) };
const approver: Ctx = { userId: 'u2', roles: new Set(['viewer', 'approver']) };

assert.deepEqual(handleClientMessage('{"type":"ping","t":5}', viewer), [{ type: 'pong', t: 5 }]);
assert.deepEqual(handleClientMessage('{"type":"subscribe","runId":"r1","afterSeq":-1}', viewer), [{ type: 'subscribed', runId: 'r1', afterSeq: -1 }]);
const approve = '{"type":"approve","runId":"r1","stepId":"s3","decision":"approve"}';
assert.equal(handleClientMessage(approve, viewer)[0].type, 'error');
assert.equal(handleClientMessage(approve, approver)[0].type, 'decision.recorded');

const bad = handleClientMessage('{"type":"subscribe","runId":"","afterSeq":1.5}', viewer)[0];
assert.ok(bad.type === 'error' && bad.code === 'invalid' && bad.detail.includes('runId') && bad.detail.includes('afterSeq'));
assert.deepEqual(handleClientMessage('{oops', viewer), [{ type: 'error', code: 'bad_json', detail: 'message is not JSON' }]);
assert.equal(handleClientMessage(JSON.stringify({ type: 'ping', t: 1, pad: 'x'.repeat(9000) }), viewer)[0].type, 'error');
const unknown = handleClientMessage('{"type":"delete_everything"}', approver)[0];
assert.ok(unknown.type === 'error' && unknown.code === 'invalid');
```

Complexity: O(n) in the message size.

#### Follow-ups

- **Should the server close the socket on invalid messages?** Reply with an error for occasional mistakes. Close with 1008 after repeated violations, and rate-limit per connection.
- **How do you share the schema with the client?** Put the zod schemas in a shared package. Both sides infer their TypeScript types from it, which is the same idea as Pydantic models shared between API and docs.

### A broadcast hub that survives slow consumers {medium}

Build an asyncio `Hub` with rooms. `join(room)` returns a `Subscriber` with a bounded queue, `publish(room, msg)` delivers to every subscriber in the room without awaiting, and `leave` removes a subscriber. A subscriber whose queue is full must not slow anyone else down. Support two policies: `"disconnect"` (kick the slow subscriber so it reconnects and resyncs) and `"drop_oldest"` (for telemetry, where only fresh values matter).

#### Hints

1. `publish` must use `put_nowait`. If it awaited a slow queue, one bad client would stall the whole room.
2. For `drop_oldest`, when the queue is full, `get_nowait()` one item, then `put_nowait()` the new one.
3. Mark kicked subscribers closed and remove them from the room, so the WebSocket handler can close the socket with 1013 or 1008.

#### Solution

Each subscriber owns a bounded queue, and its WebSocket handler task drains it with `await queue.get()` and `send_json`. `publish` never awaits, so producers are isolated from consumers.

```python
import asyncio
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Literal

Policy = Literal["disconnect", "drop_oldest"]


@dataclass(eq=False)  # eq=False keeps identity hashing, so subscribers can live in sets
class Subscriber:
    name: str
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=3))
    closed_reason: str | None = None
    dropped: int = 0


class Hub:
    def __init__(self, policy: Policy) -> None:
        self.policy = policy
        self.rooms: dict[str, set[Subscriber]] = defaultdict(set)

    def join(self, room: str, name: str) -> Subscriber:
        sub = Subscriber(name)
        self.rooms[room].add(sub)
        return sub

    def leave(self, room: str, sub: Subscriber) -> None:
        self.rooms[room].discard(sub)
        if not self.rooms[room]:
            del self.rooms[room]

    def publish(self, room: str, message: dict) -> None:
        for sub in list(self.rooms.get(room, ())):
            try:
                sub.queue.put_nowait(message)
            except asyncio.QueueFull:
                if self.policy == "drop_oldest":
                    sub.queue.get_nowait()  # throw away the stalest update
                    sub.queue.put_nowait(message)
                    sub.dropped += 1
                else:
                    sub.closed_reason = "too slow"  # its socket handler closes with 1013 and the client resyncs
                    self.leave(room, sub)


async def drain(sub: Subscriber) -> list[dict]:
    out = []
    while not sub.queue.empty():
        out.append(sub.queue.get_nowait())
    return out


async def main() -> None:
    # Disconnect policy: the fast reader gets everything, the stalled one is removed.
    hub = Hub("disconnect")
    fast, slow = hub.join("run-7", "fast"), hub.join("run-7", "slow")
    received = []
    for seq in range(6):
        hub.publish("run-7", {"seq": seq})
        received += await drain(fast)  # the fast client keeps up; the slow one never reads
    assert [m["seq"] for m in received] == list(range(6))
    assert slow.closed_reason == "too slow" and slow not in hub.rooms["run-7"]

    # Drop-oldest policy: a slow dashboard only sees the latest values.
    hub2 = Hub("drop_oldest")
    dash = hub2.join("telemetry", "dashboard")
    for cpu in range(10):
        hub2.publish("telemetry", {"cpu": cpu})
    assert [m["cpu"] for m in await drain(dash)] == [7, 8, 9]
    assert dash.dropped == 7 and dash.closed_reason is None

    # Rooms are isolated, and empty rooms are cleaned up.
    other = hub2.join("run-9", "viewer")
    hub2.publish("run-9", {"seq": 0})
    assert await drain(other) == [{"seq": 0}] and await drain(dash) == []
    hub2.leave("run-9", other)
    assert "run-9" not in hub2.rooms


asyncio.run(main())
```

Complexity: O(s) per publish for s subscribers in the room.

#### Follow-ups

- **How does this work across instances?** Each instance runs a Hub, and one task per instance subscribes to Redis pub/sub or Pub/Sub and calls `publish` locally. The hub is the last hop.
- **What does the kicked client do?** It reconnects with backoff and resubscribes with its last sequence number. The server replays from the shared log, so it ends up consistent.
- **Why queue size 3 here?** A tiny size makes the test clear. In production, size it to a few seconds of the stream's normal rate.
