# Streaming agent demo

A small, complete reference app for the hardest part of the role: streaming an agent run from a Python backend to a
React client in real time, with a human-in-the-loop approval in the middle.

- **Tokens and agent events** stream from FastAPI to the browser over **Server-Sent Events**. If the connection drops,
  the client reconnects with `Last-Event-ID` and the server replays only what it missed.
- **Control messages** (approve, reject, cancel) go the other way over a **WebSocket**, which authenticates with its
  first message, keeps a heartbeat, reconnects with backoff and resends unacknowledged requests.
- The fake LLM needs no API key. It streams a plan, calls a fake tool, asks for approval before creating a purchase
  order, then streams an answer.

## Run it

You need two terminals, both starting in the `capgemini-app` folder. The backend uses the lab's Python environment
(`capgemini-app/.venv`).

```bash
# Terminal 1: the backend on http://localhost:8010 (API docs at /docs)
cd projects/streaming-demo/backend
../../../.venv/bin/python -m uvicorn app.main:app --port 8010 --reload

# Terminal 2: the client on http://localhost:5185 (Vite proxies /api, including the WebSocket, to the backend)
cd projects/streaming-demo/client
npm install
npm run dev
```

Open http://localhost:5185, start a run, then try these:

- **Approve** or **Reject** while the agent waits.
- **Reload the page mid-run.** The run id is in the URL, so the page replays the event log and carries on.
- **Stop the backend for a few seconds and start it again.** The client retries with backoff, but runs live in
  memory, so the restarted server answers 404 and the client stops with an error. That is why the production notes
  below move the event log to a shared store.
- Slow it down to watch the tokens: `DEMO_TOKEN_DELAY=0.15 ../../../.venv/bin/python -m uvicorn app.main:app --port 8010`.

Watch it on the wire without the UI (the token is the demo stand-in for a real access token):

```bash
RUN=$(curl -s -X POST localhost:8010/api/runs -H 'Authorization: Bearer demo-token' \
  -H 'Content-Type: application/json' -d '{"prompt":"Order parts"}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["run_id"])')
curl -N localhost:8010/api/runs/$RUN/events -H 'Authorization: Bearer demo-token'
# In another terminal, resume from event 10:
curl -N localhost:8010/api/runs/$RUN/events -H 'Authorization: Bearer demo-token' -H 'Last-Event-ID: 10'
```

The run waits at the approval step (and rejects it automatically after 120 seconds), or cancels itself 15 seconds
after the last watcher leaves.

## Tests

```bash
# From the capgemini-app folder
(cd projects/streaming-demo/backend && ../../../.venv/bin/python -m pytest)   # 18 API tests
(cd projects/streaming-demo/client && npm test)                                # 30 unit tests: parser, reducer, reconnects, socket
(cd projects/streaming-demo/client && npx playwright test)                     # 3 end-to-end tests in your installed Chrome
```

Playwright starts both servers itself (or reuses ones already running) and stops them when it finishes.

## How it fits together

```text
 Browser (React)                                     FastAPI
 ┌──────────────────────────────┐   POST /api/runs   ┌────────────────────────────────────┐
 │ App: start a run             │ ─────────────────► │ RunStore.start → asyncio task      │
 │                              │                    │   agent_script (fake LLM + tools)  │
 │ useRunStream                 │   GET …/events     │        │ emit()                    │
 │  followRun: fetch + SSE      │ ◄───────────────── │        ▼                           │
 │  parser, Last-Event-ID       │   text/event-stream│  Run.events  (append-only log)     │
 │  reconnect, rAF batching     │                    │        ▲ events_after(last_id)     │
 │                              │                    │        │                           │
 │ useControlSocket             │   WS …/control     │  approve → Run.resolve_approval    │
 │  ControlChannel: auth, ping, │ ◄────────────────► │  cancel  → Run.cancel (task.cancel)│
 │  backoff, resend unacked     │                    │                                    │
 └──────────────────────────────┘                    └────────────────────────────────────┘
```

| Endpoint | Purpose |
|---|---|
| `POST /api/runs` | Start a run; returns `run_id`, `events_url`, `control_url` (201) |
| `GET /api/runs/{id}` | Status, last event id, watcher count |
| `GET /api/runs/{id}/events` | SSE stream; send `Last-Event-ID` to resume |
| `DELETE /api/runs/{id}` | Cancel; the REST fallback when the socket is down (202) |
| `WS /api/runs/{id}/control` | First message `{"type":"auth","token":…}`; then `approve`, `cancel`, `ping` |

Event types: `run.started`, `step.started`, `token`, `tool.call`, `tool.result`, `approval.required`,
`approval.resolved`, `step.skipped`, `step.completed`, and one of `run.completed`, `run.cancelled`, `run.failed`.

### Files

| File | What to read it for |
|---|---|
| `backend/app/runs.py` | The event log, resume (`events_after`), the abandoned-run reaper, idempotent approvals, the fake agent |
| `backend/app/main.py` | `EventSourceResponse` streaming, the WebSocket with first-message auth, Pydantic-validated messages |
| `client/src/lib/sse.ts` | A spec-following SSE parser that survives any chunk boundary |
| `client/src/lib/stream.ts` | fetch streaming with reconnects, backoff and `Last-Event-ID` |
| `client/src/lib/events.ts` | Typed events and the reducer that ignores replays |
| `client/src/lib/control.ts` | The WebSocket client: auth, heartbeat, reconnect, request/reply correlation |
| `client/src/hooks/useRunStream.ts` | One render per animation frame instead of per token |
| `client/src/components/Transcript.tsx` | Safe rendering of model text, auto-scroll, why it is not a live region |

## What would change in production

- **Shared event log.** Runs live in one process's memory. With several Cloud Run instances, a reconnect can land on
  a different instance, so the log has to live in a shared store (Redis Streams, Firestore, or Postgres), with
  Pub/Sub or Redis pub/sub to wake up the instance holding each stream. Session affinity helps but is best effort.
- **Durable agent runs.** The agent is an asyncio task in the web process, so a deploy kills it. Move it to a worker
  (Cloud Tasks, Pub/Sub, or a workflow engine) that writes events to the shared log; the web tier only streams.
- **Real identity.** Replace the demo token with OIDC: a BFF session cookie for the SSE stream and a short-lived token
  in the WebSocket's first message, with RBAC on who may approve which action.
- **Timeouts.** Cloud Run ends any request at the service's timeout (60 minutes at most), so long streams must expect a
  reconnect; this client already does. Keep-alive comments every 15 seconds stop idle proxies closing the stream.
- **Limits and cost.** Per-user caps on concurrent runs, a cap on events per run, and cancelling abandoned runs (done
  here) so a closed tab stops spending LLM tokens.
