---
title: "Relay: a real-time collaborative board with WebSockets, SSE and gRPC streaming"
summary: A multi-user live board where edits sync in real time over WebSockets across several server instances (Redis pub/sub fan-out), a public activity feed streams over SSE with resume, and an internal gRPC stream feeds events between services.
time: 4–5 days of evenings
---

## What you will build

Relay is a small collaborative board: several people open the same board, add and move cards, and see each other's changes and cursors (presence) instantly. It is built to show you understand real-time systems end to end, not just "open a socket":

- **WebSockets** for the two-way editing channel: authentication, heartbeats, reconnect with backoff, and resync after a drop using sequence numbers.
- **Horizontal scaling:** two or more gateway instances behind a load balancer; Redis pub/sub fans every change out to the instances that hold subscribers.
- **SSE** for a read-only public activity feed, resumable with `Last-Event-ID`.
- **gRPC server streaming** between an internal "events" service and the gateways, with deadlines and cancellation.

This is a different shape from the streaming agent demo already in the portfolio (one user, tokens from a model); Relay is many users editing shared state across servers.

## What it proves

- WebSocket protocol knowledge: handshake, ping/pong, close codes, backpressure (`bufferedAmount`), reconnect and resync
- Scaling WebSockets: stateless gateways, pub/sub fan-out, sticky sessions vs not, connection limits
- SSE with resume and keep-alives; when to choose SSE over WebSockets
- gRPC: protobuf contracts, server streaming, deadlines, cancellation, status codes
- Ordering and consistency: per-board sequence numbers, idempotent operations, gap detection
- Keywords: WebSockets, Server-Sent Events, gRPC, Protocol Buffers, Redis pub/sub, Node.js, TypeScript, React, real-time, distributed systems

## Architecture

```text
 Browser A ─┐ WebSocket (edit ops, presence)          Browser C ── SSE /feed (Last-Event-ID resume)
 Browser B ─┤                                                        │
            ▼                                                        ▼
     ┌─────────────┐   ┌─────────────┐                        ┌─────────────┐
     │ gateway #1  │   │ gateway #2  │   (Node.js, ws)        │ feed (SSE)  │
     └──────┬──────┘   └──────┬──────┘                        └──────┬──────┘
            │ publish/subscribe board:<id>                          │
            └──────────────┬──────────────────────────────┬─────────┘
                           ▼                              │
                    Redis pub/sub  ◄── persists ops ──►  PostgreSQL or Redis Streams (ops log, seq per board)
                           ▲
                           │ gRPC server stream: SubscribeEvents(board) → stream Event
                    events service (Node.js or Python, @grpc/grpc-js / grpcio)
```

## Milestones

### Milestone 1: one gateway, one board

Goal: two browsers editing the same board through one WebSocket server.

- Node.js 24 + TypeScript + `ws`; a tiny React client (Vite).
- Message types as a discriminated union validated with zod: `join`, `op` (add/move/delete card), `presence`, `ack`, `error`.
- Server assigns a per-board sequence number to every op and broadcasts it.

Done when: two tabs see each other's edits instantly, and invalid messages get an `error` message, not a crash.

### Milestone 2: staying connected

- Authenticate the socket with a short-lived ticket fetched over HTTPS, checked on upgrade; check the `Origin` header.
- Heartbeats with ping/pong; terminate dead connections; client reconnect with exponential backoff and jitter.
- Resync: the client sends its last sequence number on reconnect and receives missed ops (or a snapshot if too far behind).

Done when: killing the network for 20 seconds and restoring it loses no edits, and the README explains the resync protocol.

### Milestone 3: scale out with Redis

- Run two gateway instances on different ports; publish every op to `board:<id>` in Redis and broadcast what arrives from Redis.
- Store ops in an ordered log (Redis Streams or PostgreSQL) so resync works whichever instance a client lands on.
- Presence with expiring keys.

Done when: a client on instance 1 and a client on instance 2 edit the same board in real time, and restarting one instance does not lose data.

### Milestone 4: the SSE activity feed

- `GET /feed?board=<id>` returns `text/event-stream` with `id:` set to the sequence number, keep-alive comments every 15 seconds, and replay from `Last-Event-ID`.
- Show it in a read-only "activity" panel using `EventSource`.

Done when: reloading the feed page resumes exactly after the last event received, with no duplicates.

### Milestone 5: gRPC event stream between services

- `events.proto` with `rpc SubscribeEvents(SubscribeRequest) returns (stream Event)`.
- The events service streams ops for a board; gateways or the feed consume it with a deadline and cancel the stream when the last subscriber leaves.

Done when: stopping the events service makes consumers retry with backoff and resume; the README shows the `.proto` file.

### Milestone 6: tests, load and CI

- Unit tests for the op reducer and resync logic; integration tests that start a gateway on port 0 and connect two `ws` clients.
- A load script (for example k6 with WebSockets, or a Node script) opening 1,000 connections; record message latency.
- Docker Compose for Redis, two gateways and the events service.

Done when: CI runs unit and integration tests against a Redis service container, and the README shows latency at 1,000 connections.

## Repository layout

```text
relay/
├── apps/
│   ├── gateway/         # ws server, auth, heartbeats, Redis fan-out
│   ├── feed/            # SSE endpoint
│   ├── events/          # gRPC server
│   └── web/             # React client
├── packages/protocol/   # zod message schemas, shared types, events.proto
├── test/                # integration tests
├── load/                # load test scripts
├── compose.yaml
└── .github/workflows/ci.yml
```

## Tests and CI

- **Unit:** op ordering, gap detection, backoff schedule (fake timers).
- **Integration:** two clients on two gateway instances with a real Redis; reconnect and resync; SSE resume.
- **Contract:** the protobuf file compiles in CI and a test calls the streaming RPC with a deadline.

```yaml
# .github/workflows/ci.yml (outline)
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:8
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit -p .
      - run: npm test
        env: { REDIS_URL: redis://localhost:6379 }
```

## README checklist

- Badges: CI, licence; a GIF of two browsers editing while one instance is restarted
- The architecture diagram, and a "why each protocol" table (WebSocket for edits, SSE for the feed, gRPC between services)
- The resync protocol in five lines; how auth works on the socket
- Load-test numbers: connections, messages per second, p95 latency
- How to run with Docker Compose, or locally with Homebrew Redis
- What you would do next

Local development note: Docker Hub pulls currently fail on this Mac, so run Redis with Homebrew (`brew install redis` and `brew services start redis`) and start the services with `npm run dev`. Keep `compose.yaml` for readers of the repository.

## Stretch goals

- Conflict handling for concurrent moves with a CRDT library such as Yjs
- A gRPC-Web or Connect client so the browser can call the events service
- Deploy the gateways to Cloud Run with session affinity, or to Kubernetes, and document the timeouts
- OpenTelemetry tracing across gateway, Redis and the events service

## Talking about it in an interview

**60-second walkthrough:** "Relay is a collaborative board I built to show real-time systems end to end. Edits go over WebSockets: the socket is authenticated with a short-lived ticket, kept alive with ping/pong, and every op gets a per-board sequence number, so a client that reconnects asks for what it missed. To scale, gateways are stateless and fan out through Redis pub/sub, and the op log lives outside the gateways so any instance can resync a client. A public activity feed uses SSE because it's one-way and resumes with Last-Event-ID, and an internal events service streams to consumers over gRPC with deadlines. I load-tested a thousand connections and documented the latency."

- **Why not sticky sessions instead of Redis?** Sticky sessions keep a client on one instance but don't let users on different instances see each other's edits; you still need fan-out. They also make deploys and failover harder.
- **What if a client is offline for an hour?** If its last sequence is older than the retained log, send a snapshot of the board instead of replaying ops.
- **How do you handle a slow client?** Watch `bufferedAmount` on the server; drop presence updates first, and disconnect clients that fall too far behind so they resync.

## LinkedIn post template

> I built Relay, a real-time collaborative board, to learn real-time systems properly rather than just "open a socket".
> Edits sync over WebSockets with auth, heartbeats and sequence-numbered resync after a dropped connection; gateways scale out with Redis pub/sub; a public feed uses SSE with Last-Event-ID resume; and services talk over gRPC streaming.
> Load-tested at 1,000 connections. Code and write-up: <GitHub link>
> #websockets #grpc #realtime #nodejs

## Resume bullet

Built Relay, an open-source real-time collaborative board: WebSocket gateways with authentication, heartbeats and sequence-based resync, horizontal scaling through Redis pub/sub, an SSE activity feed with Last-Event-ID resume, and gRPC server streaming between services (Node.js, TypeScript, React).
