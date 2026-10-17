---
title: Worked designs for this platform
goal: Walk through five designs this team is likely to ask about (a streaming agent chat, an agent orchestrator, a live operations dashboard, an SAP integration hub and a multi-tenant RBAC layer) and defend every trade-off.
minutes: 70
---

These are the systems behind the job description: chat interfaces that stream model output, orchestration services
that coordinate agent runs and enterprise APIs, dashboards for pipeline progress and telemetry, connections to systems
such as SAP, and role-based access through enterprise identity providers. If the design round asks for "design X", X is
very likely one of these or a mix of them.

Each case follows the framework from [System design](#/system-design): requirements, estimates, API, data model,
architecture, deep dives and trade-offs. Practise each one out loud in 25 to 30 minutes. Do not memorise the diagrams;
memorise the **decisions** and why you made them, because the interviewer will change a requirement to see whether
you can adapt.

## Case 1: A streaming agent chat platform on GCP

### Requirements

- Enterprise users sign in with their company's SSO and chat with agents. The agent's answer streams token by token.
- Tool calls and agent steps appear inline as they happen. Some steps need the user's approval before they run.
- A refresh, a network drop or a laptop going to sleep must not lose the conversation: the client resumes where it was.
- Transcripts, tool calls and approvals are kept for audit.
- Scale: 100,000 concurrent open chats at peak. Latency: the platform adds well under 200 ms to the model's time to
  first token. Availability: 99.9%.

### Estimates

From the [estimate in System design](#/system-design): about 30,000 streams generating at once, 1.2 million tokens a
second, 300,000 events a second once the server coalesces tokens every 100 ms, roughly 600 Mbit/s of egress and about
400 gateway instances at 250 streams each. Writing every token to PostgreSQL is out; writing one final message per run
(about 1,500 a second) is fine.

### API

```http
POST /v1/conversations/c_123/messages HTTP/1.1
Content-Type: application/json
Idempotency-Key: 3f1d9a52-7c4e-4c8e-9a51-0b6f2d7e8c11

{"text": "Order 20 laptops for the new hires"}

HTTP/1.1 202 Accepted
Content-Type: application/json

{"runId": "run_789", "events": "/v1/runs/run_789/events"}
```

```http
GET /v1/runs/run_789/events HTTP/1.1
Accept: text/event-stream
Last-Event-ID: 1760522400000-4
```

```text
id: 1760522400000-5
event: token
data: {"text": "I found three approved laptop models. "}

id: 1760522400000-6
event: tool_call
data: {"tool": "create_purchase_order_draft", "args": {"quantity": 20}}

id: 1760522400000-7
event: approval_required
data: {"approvalId": "ap_42", "summary": "Create PO for 20 laptops, total 31,800 USD"}

: keep-alive
```

Control actions are ordinary requests: `POST /v1/runs/{id}:cancel` and `POST /v1/approvals/{id}` with
`{"decision": "approved"}`. If the product needs frequent two-way messages on one channel, the same events can be
carried over a WebSocket instead; the rest of the design does not change.

### Data model

- **PostgreSQL:** `tenants`, `users`, `conversations`, `messages` (one row per final message), `runs` (state, model,
  token usage, cost), `tool_calls`, `approvals`. This is the audit record.
- **Redis Streams (Memorystore), one stream per run:** the hot event log the gateway reads from. The Redis entry id
  (for example `1760522400000-5`) doubles as the SSE `id`, so `Last-Event-ID` maps straight to "read after this id".
  Trimmed by length and expired a few minutes after the run ends.
- **Cloud Storage:** large tool outputs and files, referenced by path.

### Architecture

```text
 React SPA ──HTTPS──► Global external Application Load Balancer + Cloud Armor
                          │
          ┌───────────────┴──────────────────┐
          ▼                                  ▼
  API service (Cloud Run)              Stream gateway (Cloud Run, SSE)
  · auth, RBAC, rate limits            · authorises each subscription (user owns the run)
  · create run (202), approvals        · XREAD from the run's stream after Last-Event-ID
  · writes PostgreSQL + outbox         · coalesces tokens, sends keep-alive comments
          │ outbox relay                       ▲
          ▼                                    │ XREAD (blocking)
     Pub/Sub "run-requests"            Redis Streams, sharded by run id
          │                                    ▲ XADD
          ▼                                    │
  Agent workers (Cloud Run or GKE) ────────────┘
  · run the agent loop: model call (streaming) → tool calls → approvals
  · append every event to the run's stream; write final message and state to PostgreSQL
```

### Deep dives

- **Decouple the connection from the run.** The worker owns the run; the gateway only relays the run's event log. A
  dropped connection does not stop the run, a second tab can watch the same run, and any gateway instance can serve
  any run. No sticky sessions, which matters because Cloud Run's session affinity is best effort.
- **Resume.** On reconnect the browser's `EventSource` sends `Last-Event-ID` automatically; a `fetch`-based client sends
  it itself. The gateway reads the stream after that id. If the id is older than what Redis kept, the gateway sends a
  `reset` event and the client reloads the conversation from PostgreSQL, then subscribes from the latest id.
- **Forced reconnects.** Cloud Run treats each stream as a request with a timeout of at most 60 minutes, so long-lived
  chats reconnect regardless. With resume, that is a brief pause, not a lost answer.
- **Backpressure and batching.** Tokens are coalesced every 50 to 100 ms into one event. Because the gateway reads a log
  at its own pace, a slow client simply falls behind; past a limit, the gateway closes the connection and the client
  resumes. Keep-alive comments every 15 to 30 seconds stop proxies from closing idle streams.
- **Cancellation.** "Stop" calls the cancel endpoint, which sets a flag the worker checks between tokens and tool calls,
  and aborts the model request. Closing the tab does not cancel the run unless the product wants that.
- **Auth.** The SPA uses a session cookie from a backend-for-frontend, or a short-lived access token sent on the `fetch`
  stream. Every subscription checks that the user may see that run, not just that they are logged in.
- **Scaling the event layer.** Redis Streams sharded by run id (consistent hashing or Redis Cluster slots), short
  retention, and a fallback to PostgreSQL for anything older. Cloud Run instances run with high concurrency settings,
  because idle streams use little CPU.

### Trade-offs to say out loud

- **SSE versus WebSockets:** SSE for model output because it is plain HTTP, resumes natively and suits one-way streams;
  control goes over POSTs. WebSockets if the client sends a lot on the same channel.
- **Redis Streams versus Pub/Sub for the hot path:** Redis gives reads after an id and very low latency for resume;
  Pub/Sub is the durable bus between services, but it is not designed for "replay this run from event 5" per browser.
- **What I would change at 10×:** more Redis shards, regional deployments behind the global load balancer, and moving
  the gateway to GKE if the per-connection cost on Cloud Run dominates.

**Your angle:** you have not shipped WebSockets or SSE in production, so do not claim it. You can say you engineered the
human-in-the-loop Document AI platform on GCP (FastAPI on Cloud Run, SAML, review checkpoints), and, once you
have run it, that you built the [streaming demo](#/streaming-project) to work through resume and cancellation in practice.

## Case 2: An agent workflow orchestrator

### Requirements

- Run multi-step agent workflows: plan, call tools, wait for approvals, call external enterprise APIs, finish.
- Survive crashes and deployments mid-run. A run waiting for a human may wait hours or days.
- Retry transient failures, time out stuck steps, cancel on request, and never repeat a side effect.
- Respect each external API's rate limit. Show progress to the UI in real time. Keep a full audit trail.
- Running workflows keep the version they started with when a new version is deployed.

### Architecture

```text
 API service ──► PostgreSQL: runs, run_steps, approvals, outbox      (state machine of record)
     │                      ▲               │ outbox relay
     │ start / cancel       │ transitions   ▼
     │                      │          Pub/Sub "step-ready" ──► step workers (Cloud Run / GKE)
     │                      │                                      │ idempotent step execution
     │                      └──────────── result + transition ◄────┤
     │                                                             ├─► LLM and tools
     │                                                             └─► Cloud Tasks queue per external API
 approvals UI ──► POST /approvals/{id} ──► transition awaiting_approval → running   (rate-limited HTTP calls)
 timers: Cloud Tasks scheduled at the step deadline ──► "timeout" transition if the step is still running
 every transition ──► run event stream (for the UI) + audit log
```

### Data model and transitions

The run is an explicit state machine: `queued → running → awaiting_approval → running → succeeded`, with `failed` and
`cancelled` as exits. Every transition is a conditional update on a `version` column, so two workers (or a worker and a
cancel request) cannot both win.

```sql postgres
CREATE TABLE runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  workflow text NOT NULL,
  workflow_version int NOT NULL,
  state text NOT NULL CHECK (state IN ('queued', 'running', 'awaiting_approval', 'succeeded', 'failed', 'cancelled')),
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL
);
CREATE TABLE run_steps (
  run_id text REFERENCES runs (id),
  step_no int,
  name text NOT NULL,
  state text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL UNIQUE,
  PRIMARY KEY (run_id, step_no)
);
CREATE TABLE approvals (
  run_id text,
  step_no int,
  requested_at timestamptz NOT NULL,
  decided_at timestamptz,
  decision text CHECK (decision IN ('approved', 'rejected')),
  decided_by text,
  PRIMARY KEY (run_id, step_no),
  FOREIGN KEY (run_id, step_no) REFERENCES run_steps (run_id, step_no)
);
CREATE INDEX runs_waiting ON runs (tenant_id, updated_at) WHERE state = 'awaiting_approval';

INSERT INTO runs VALUES
  ('r1', 'acme', 'purchase-order', 3, 'awaiting_approval', 3, '2026-10-14 09:00+00'),
  ('r2', 'acme', 'purchase-order', 3, 'awaiting_approval', 5, '2026-10-15 08:30+00'),
  ('r3', 'acme', 'rotate-keys', 1, 'running', 2, '2026-10-15 08:00+00'),
  ('r4', 'globex', 'purchase-order', 2, 'awaiting_approval', 4, '2026-10-13 12:00+00');
INSERT INTO run_steps VALUES
  ('r1', 1, 'draft_po', 'succeeded', 1, 'r1:1'), ('r1', 2, 'approve_po', 'waiting', 0, 'r1:2'),
  ('r2', 1, 'draft_po', 'succeeded', 1, 'r2:1'), ('r2', 2, 'approve_po', 'waiting', 0, 'r2:2'),
  ('r4', 1, 'draft_po', 'succeeded', 2, 'r4:1'), ('r4', 2, 'approve_po', 'waiting', 0, 'r4:2');
INSERT INTO approvals (run_id, step_no, requested_at) VALUES
  ('r1', 2, '2026-10-14 09:00+00'), ('r2', 2, '2026-10-15 08:30+00'), ('r4', 2, '2026-10-13 12:00+00');
```

Approvals for one tenant that have waited more than 24 hours, for an escalation job (with a fixed "now" so the result is
stable):

```sql postgres
SELECT a.run_id, s.name,
       round(extract(epoch FROM (timestamptz '2026-10-15 10:00+00' - a.requested_at)) / 3600) AS hours_waiting
FROM approvals a
JOIN run_steps s USING (run_id, step_no)
JOIN runs r ON r.id = a.run_id
WHERE a.decided_at IS NULL
  AND r.tenant_id = 'acme'
  AND a.requested_at < timestamptz '2026-10-15 10:00+00' - interval '24 hours'
ORDER BY a.requested_at
-- expect: [('r1', 'approve_po', 25)]
```

The approval arrives: move the run on, but only if nobody else changed it first.

```sql postgres
UPDATE runs
SET state = 'running', version = version + 1, updated_at = timestamptz '2026-10-15 10:00+00'
WHERE id = 'r1' AND version = 3 AND state = 'awaiting_approval'
RETURNING id, state, version
-- expect: [('r1', 'running', 4)]
```

A cancel request that read the run earlier, at version 3, now changes nothing. The caller sees zero rows, rereads and
decides again.

```sql postgres
UPDATE runs SET state = 'cancelled', version = version + 1
WHERE id = 'r1' AND version = 3
RETURNING id
-- expect: []
```

### Deep dives

- **No worker waits for a human.** `awaiting_approval` is just a row. The approval endpoint performs the transition and
  publishes "step-ready" through the outbox. A run can wait a week at zero cost.
- **Idempotent steps.** Each step has an idempotency key (`run_id:step_no`). A worker that gets the same message twice
  sees the step already `succeeded` and only republishes the next transition. Keys are passed to external APIs that
  accept them.
- **Ambiguous failures.** A timeout after calling an external API means "maybe it happened". The step checks the
  external system by correlation id before retrying (see the SAP case), instead of blindly calling again.
- **Leases for long steps.** A worker claims a step with a lease (`locked_until`) and extends it while it works; if the
  worker dies, the lease expires and the step is picked up again. In PostgreSQL this is `FOR UPDATE SKIP LOCKED`; with
  Pub/Sub it is the ack deadline (up to 10 minutes, extended by the client library).
- **Rate limits to external systems.** One Cloud Tasks queue per external API with `maxDispatchesPerSecond` and
  `maxConcurrentDispatches`, so a burst of agent runs cannot flood SAP or a ticketing system.
- **Compensation.** Steps that create things have an undo step (cancel the draft PO, delete the ticket). A failed run
  runs the compensations for the steps it completed: a saga.
- **Versioning.** Each run stores `workflow_version`, and workers keep the code for every version that still has
  running instances, or the workflow definition is data the engine interprets.

### Build or use an engine?

| Option | Good when | Cost |
|---|---|---|
| State machine in PostgreSQL + Pub/Sub/Cloud Tasks | Few workflow types, the team knows SQL, need full control and simple operations | You build timers, retries, leases and versioning yourself |
| Temporal | Many complex, long-running workflows; durable execution as plain code with signals for approvals | New infrastructure (or Temporal Cloud) and a programming model to learn |
| Cloud Workflows | Orchestrating GCP services and HTTP APIs with YAML, callbacks for human approval, fully managed | Less expressive for complex agent logic; logic lives in YAML |
| LangGraph with a checkpointer | The agent loop itself: state graph, interrupts for HITL, resume | Covers the agent's reasoning loop, not fleet-wide scheduling, rate limits and SLAs |

A sensible answer: LangGraph (or a custom loop) for reasoning inside a step, and a durable orchestrator (PostgreSQL
state machine, Temporal or Workflows) for the run as a whole.

**Your angle:** on the Document AI platform you built agentic workflows with tool-use boundaries, validation loops and
HITL checkpoints, and at The Dot Corp you analysed Labcorp fulfilment workflows, including orchestration workflows and
background jobs. Both involve the same concerns: explicit states and safe retries, plus, on the Document AI platform, a
human checkpoint before data left the system.

## Case 3: A real-time operations dashboard

### Requirements

- Operators see live agent runs across tenants: a list with status and progress, a DAG view of one run's steps, its
  logs streaming, and telemetry charts (latency, tokens, cost, error rate).
- Filters by tenant, agent and status, respecting the viewer's permissions.
- Freshness within a couple of seconds; 5,000 concurrent viewers; 20,000 runs in progress; seven days of hot history.

### Estimates

The naive design pushes every event to every interested viewer. Coalescing list updates and streaming logs only for the
run a viewer has opened changes the numbers a lot.

```python
runs_live = 20_000
events_per_run_per_sec = 5        # step changes, log lines, metric points
viewers = 5_000
runs_on_screen = 25               # one page of the filtered list
list_updates_per_run_per_sec = 1  # coalesced: only the latest status and progress matter
log_lines_per_sec = 5             # only for the run a viewer has opened

ingest = runs_live * events_per_run_per_sec
naive_fanout = viewers * runs_on_screen * events_per_run_per_sec
designed_fanout = viewers * runs_on_screen * list_updates_per_run_per_sec + viewers * log_lines_per_sec

assert ingest == 100_000
assert naive_fanout == 625_000
assert designed_fanout == 150_000
assert round(naive_fanout / designed_fanout, 1) == 4.2
```

### Architecture

```text
 agent workers ──► OpenTelemetry (traces, metrics) ──► Cloud Trace / Cloud Monitoring
       │
       └── run events (state changes, step progress, log lines) ──► Pub/Sub "run-events" (ordering key = run id)
                                     │
                     ┌───────────────┼──────────────────────────────┐
                     ▼               ▼                              ▼
          projector service    log sink                     BigQuery subscription
          · latest state per   · Cloud Logging              · history, cost and
            run → Redis hash     (+ BigQuery for search)       trend reports
            (or Firestore doc)
          · publishes deltas
            with seq numbers
                     │
                     ▼
          dashboard gateway (SSE / WebSocket): snapshot on subscribe, then deltas;
          per-viewer filters and permission checks; coalesces per run every second
                     │
                     ▼
          React dashboard: TanStack Query cache updated by deltas, virtualised log viewer, downsampled charts
```

### Deep dives

- **Snapshot plus deltas.** On subscribe the client gets the current state of the runs it watches and the sequence
  number it reflects; after that, only deltas. Each delta carries the run's sequence number. A gap (seq 41 after 39)
  means a lost message, so the client refetches that run's snapshot. This is simpler and safer than trying to make the
  stream perfectly reliable.
- **Coalescing and dropping.** Progress 41%, 42%, 43% inside one second becomes "43%". State changes such as `failed`
  are never dropped. The server does this per run, so one chatty run cannot flood a viewer.
- **Logs at scale.** The browser keeps a bounded ring buffer and renders only the visible rows (virtualisation), with a
  follow-tail toggle. Older logs come from a paged query, not from the live stream.
- **Charts.** Metrics come from Cloud Monitoring or pre-aggregated time series; the client downsamples to the chart's
  pixel width. Telemetry charts do not need the same freshness as run status.
- **Permissions.** Filtering happens server-side before fan-out: a viewer never receives deltas for tenants or agents
  they cannot see.
- **Stale data.** Every panel shows "updated 3 s ago" and turns amber when the stream is disconnected, so operators never
  act on frozen data without knowing.

### Firestore listeners or your own push service?

| Option | Strengths | Weaknesses |
|---|---|---|
| Firestore documents per run + `onSnapshot` in the browser | No gateway to run; offline support; security rules enforce per-user access | Per-document write rate limits for very chatty runs; rules must mirror your RBAC and are not filters (each query may only ask for documents the user can read); cost per read at high fan-out |
| Redis + your own SSE/WebSocket gateway | Full control of coalescing, filtering and auth; cheap at high event rates | You run and scale the gateway and the fan-out layer |

For a modest internal dashboard, Firestore listeners are fast to build. For thousands of viewers and chatty runs, a
gateway that coalesces is easier to keep cheap and correct. The [real-time dashboards](#/realtime-dashboards) chapter has
the client-side code.

## Case 4: An integration hub where agents create SAP purchase orders

### Requirements

- A user asks an agent: "Order 20 laptops for the three new hires in Austin." The agent prepares a purchase order.
- Validate against master data (vendor, material, plant, cost centre, budget) before anyone sees it.
- Orders above a threshold need a manager's approval. Nothing reaches SAP without passing validation and, where
  required, approval.
- Never create a duplicate PO, even with retries and timeouts. Survive SAP being slow or down. Audit everything.

### Architecture

```text
 agent (tool: propose_purchase_order) ──► Integration service (Cloud Run)
                                            · canonical PurchaseOrderDraft model (Pydantic / zod)
                                            · validation: schema + master data lookups (cached)
                                            · stores draft in PostgreSQL with a correlation id
                                            · approval policy: amount, cost centre, requester role
                                                  │
                     approval needed? ──► approvals UI / chat approval card ──► approved
                                                  │
                                                  ▼
                              Cloud Tasks queue "sap-po" (rate-limited, retries with backoff)
                                                  │
                                                  ▼
                              SAP adapter (anti-corruption layer)
                              · maps canonical model → SAP fields
                              · OAuth or basic credentials from Secret Manager
                              · fetches a CSRF token, then POSTs the PO
                              · check-before-create by correlation id; circuit breaker
                                                  │
                                                  ▼
                              SAP S/4HANA Purchase Order API (OData)
                                                  │
                     PO number + status ──► PostgreSQL, run event stream, audit log
```

### How an OData write looks

SAP S/4HANA publishes its Purchase Order API on the SAP Business Accelerator Hub: an older OData V2 service
(`API_PURCHASEORDER_PROCESS_SRV`) and an OData V4 successor (`API_PURCHASEORDER_2`). Field names differ between them, so
check which one the client's release supports. Writes are protected by a CSRF token that you fetch first:

```http
GET /sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder?$top=1 HTTP/1.1
Host: s4.example.com
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.example
X-CSRF-Token: Fetch

HTTP/1.1 200 OK
x-csrf-token: 8aZq1Lw4uY0rT2==
set-cookie: SAP_SESSIONID_S4H_100=example; path=/
```

The POST then sends that token and the session cookie back. A `403` with `x-csrf-token: Required` means the token
expired: fetch a new one and retry once.

### Deep dives

- **Anti-corruption layer.** The agent and the rest of the platform speak a clean canonical model. Only the adapter
  knows SAP field names, date formats and codes. Changing from the V2 to the V4 API touches one module.
- **Agents propose, people dispose.** The agent's tool creates a **draft** in our system, never a PO in SAP. Validation and
  approval sit between the draft and SAP. The approval card shows exactly what will be created.
- **No duplicates.** Each draft has a correlation id, written into a reference field on the PO. Before creating, the
  adapter asks SAP whether a PO with that reference exists; after a timeout, the retry finds it instead of creating a
  second one. A nightly reconciliation compares our drafts with SAP's POs.
- **SAP is down.** Tasks stay in the Cloud Tasks queue and retry with backoff; a circuit breaker stops hammering SAP; the
  user sees "approved, waiting for SAP" in the chat. After the retry limit, the task lands in a dead-letter table for a
  person to look at.
- **Secrets and identity.** Credentials live in Secret Manager, the adapter runs as a dedicated service account, and the
  SAP technical user has only the authorisations needed to create POs.
- **Audit.** Who asked, what the agent proposed, who approved, what was sent and what SAP returned, all linked by the
  correlation id.

**Your angle:** no SAP on your resume, so do not claim it. Do claim the pattern: FedEx SOAP-to-REST across about 24
OrderingStore applications plus 10 more, carrier integrations (FedEx, USPS, UPS, Endicia), Labcorp API order processing, and the external
submission APIs at the end of the Document AI pipeline, where Pydantic validation was the gate before data left.

## Case 5: A multi-tenant RBAC layer over SAML and OIDC

### Requirements

- Many enterprise customers (tenants), each with its own identity provider: Okta or Entra ID over OIDC, ADFS over SAML,
  Google Workspace.
- Map each tenant's IdP groups to platform roles: viewer, operator, approver, admin. Some rules depend on attributes,
  such as an approver's limit.
- Enforce permissions in the API, on every stream subscription, and on every agent tool call. An agent never does more
  than the user it acts for.
- Deprovision people quickly when they leave the customer company. Audit every decision.

### Architecture

```text
 user ──► login page: tenant discovery by email domain ──► tenant's IdP (SAML or OIDC)
                                                           │ assertion / ID token with groups
                                                           ▼
          identity layer (Identity Platform multi-tenancy, or your own broker)
          · validates the assertion or token (signature, audience, expiry)
          · JIT-provisions the user; a SCIM endpoint (yours or the broker's) for create, update and deactivate
          · issues the platform session: tenant_id, user_id, session id (short-lived)
                                                           │
                                                           ▼
 API, stream gateway and agent tool router ──► policy check: can(user, action, resource)
          · roles from group mappings (per tenant, stored in PostgreSQL, cached briefly)
          · attribute rules (approval limit, own runs only)
          · tenant isolation also enforced in the database (row-level security)
                                                           │
                                                           ▼
                                               audit log of allow and deny decisions
```

### Defence in depth: row-level security

Application checks are the first line. PostgreSQL row-level security is the second: even a query that forgets its tenant
filter cannot return another tenant's rows. The application sets the tenant for each transaction.

```sql postgres
CREATE TABLE tenant_runs (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  title text NOT NULL
);
INSERT INTO tenant_runs VALUES
  ('r1', 'acme', 'Onboard laptops'), ('r2', 'acme', 'Rotate keys'), ('r3', 'globex', 'Close the quarter');
ALTER TABLE tenant_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenant_runs
  USING (tenant_id = current_setting('app.tenant_id', true));
```

A superuser bypasses row-level security, and so does the table's owner unless the table uses `FORCE ROW LEVEL
SECURITY`. That is why the application must connect as a separate, non-owner role. Connected as the owner, this check
still sees every row:

```sql postgres
SELECT count(*) FROM tenant_runs
-- expect: [(3,)]
```

As an application role, each tenant sees only its own rows, and with no tenant set it sees nothing. The block runs
inside a transaction that rolls back, so the role it creates never persists:

```sql postgres
BEGIN;
CREATE ROLE lab_rls_app NOLOGIN;
GRANT SELECT ON tenant_runs TO lab_rls_app;
SET LOCAL ROLE lab_rls_app;
DO $$ BEGIN
  IF (SELECT count(*) FROM tenant_runs) <> 0 THEN RAISE EXCEPTION 'no tenant set: expected no rows'; END IF;
END $$;
SET LOCAL app.tenant_id = 'acme';
DO $$ BEGIN
  IF (SELECT count(*) FROM tenant_runs) <> 2 THEN RAISE EXCEPTION 'acme should see 2 runs'; END IF;
  IF EXISTS (SELECT 1 FROM tenant_runs WHERE tenant_id = 'globex') THEN RAISE EXCEPTION 'globex row leaked'; END IF;
END $$;
SET LOCAL app.tenant_id = 'globex';
DO $$ BEGIN
  IF (SELECT count(*) FROM tenant_runs) <> 1 THEN RAISE EXCEPTION 'globex should see 1 run'; END IF;
END $$;
ROLLBACK;
```

### Deep dives

- **Tokens stay small; permissions are resolved server-side.** The session carries tenant and user ids. Roles come from
  the group mapping at request time, cached for a minute, so a change in the IdP or in the mapping takes effect quickly
  instead of living in a token for hours.
- **Agents act on behalf of the user.** A tool call carries the user's identity. The effective permission is the
  intersection of what the user may do and what the agent is allowed to do. An agent with a "create purchase order"
  tool, run by a viewer, still cannot create one.
- **Deprovisioning.** SCIM deactivation (or a failed refresh against the IdP) revokes platform sessions at once; open
  streams are closed when the session is revoked, because the gateway rechecks authorisation periodically and on revoke
  events.
- **SAML versus OIDC.** Support both at the identity layer and convert to one internal session format, so the rest of
  the platform never cares which protocol a tenant uses.
- **Audit.** Log denies as well as allows, with the rule that decided, so security teams can answer "why could this
  person approve that?".

**Your angle:** you implemented SAML sign-in with Passport.js on Node.js for the Document AI platform, used JWT and
OAuth2 at Medidata, and added role-based Admin UI functionality to Labels Web for managing carrier accounts and
credentials. See
[Enterprise identity](#/auth-identity) for the protocols in depth.

## Interview questions

### Walk me through how you would design a streaming agent chat platform. {core}

I separate three things: the API that starts a run, the worker that executes the agent, and a stream gateway that
relays events to the browser. Sending a message returns 202 with a run id. A worker runs the agent loop and appends every
token batch, tool call and approval request to a per-run event log in Redis Streams. The gateway holds the SSE
connection, authorises the subscription, and reads the log after the client's `Last-Event-ID`. PostgreSQL keeps the
final messages, approvals and run state for audit.

Then I go deep on resume, backpressure and scale: coalesce tokens every 50 to 100 ms, keep-alive comments, reconnect
transparently when Cloud Run's request timeout ends a stream, and shard the event log by run id.

### Why decouple the agent run from the client's connection?

Because connections are fragile and runs are valuable. If the run lived inside the HTTP request, a network blip, a
refresh or a forced reconnect would kill a half-finished agent run, maybe in the middle of a tool call. With the run in
a worker writing to a log, a dropped connection costs nothing: the client reconnects to any gateway instance and resumes.
It also allows several viewers per run (a second tab, an approver) and removes the need for sticky sessions.

### How does a client resume a stream after a network drop or a timeout? {core}

Every event carries an id; I use the Redis Stream entry id as the SSE `id`. The browser's `EventSource` reconnects
automatically and sends `Last-Event-ID`; a `fetch`-based client keeps the last id and sends it itself. The gateway reads
the run's stream after that id and replays what was missed, then continues live. If the id is older than the stream's
retention, the gateway sends a `reset` event and the client reloads the conversation from the API, then subscribes again
from the latest id. The user sees a short pause, not a lost answer.

### How do you scale to 100,000 concurrent streams, and where is the bottleneck?

The connections themselves are cheap: at a few hundred streams per Cloud Run instance, that is a few hundred instances,
and the gateway is stateless. The pressure points are the event layer (hundreds of thousands of events a second once
tokens are coalesced, so Redis is sharded by run id), the database (write final messages, not tokens), and above all the
LLM capacity and cost behind the runs. So I batch tokens, shard the hot log, keep PostgreSQL for durable records, and put
per-tenant quotas in front of the models.

### How do you design an orchestrator that survives crashes and waits days for approval? {core}

Model each run as an explicit state machine stored in PostgreSQL, with every transition a conditional update on a
version column so concurrent actors cannot both win. Work moves through a queue: a step is published, a worker executes
it idempotently using a step key, records the result and the next transition in one transaction, and an outbox publishes
the next step. Waiting for approval is just a state, so no worker is held. Timers for step deadlines are scheduled tasks,
and leases make sure a crashed worker's step is picked up again.

If the workflows grow complex, a durable execution engine such as Temporal, or Cloud Workflows for GCP-centric flows,
replaces the hand-built timers and retries; the design principles stay the same.

### How do you avoid duplicate side effects on external systems?

Assume every call can be repeated, because retries and redeliveries will happen. Pass an idempotency key when the API
supports one. When it does not, write a correlation id into the external record (a reference field on a purchase order,
a tag on a ticket) and check for it before creating, which turns "did my timed-out call succeed?" into a lookup. Steps are
keyed by run and step number so a duplicate message is a no-op, and a reconciliation job compares both sides.

### Would you build the orchestrator on PostgreSQL, Temporal or Cloud Workflows? {deep}

It depends on how many workflow types there are and how complex they get. A PostgreSQL state machine with Pub/Sub or
Cloud Tasks is enough for a few workflow types and keeps operations simple, but the team owns timers, retries, leases and
versioning. Temporal gives durable execution as normal code, with signals for approvals and built-in retries, at the cost
of new infrastructure or a managed service. Cloud Workflows suits orchestrating GCP services and HTTP APIs, with callbacks
for human approval. I would use LangGraph or a custom loop for the agent's reasoning inside a step either way.

### How would you design a live operations dashboard for agent runs? {core}

Workers publish run events to Pub/Sub keyed by run id. A projector keeps the latest state per run in Redis (or Firestore)
and emits deltas with sequence numbers. The dashboard gateway sends a snapshot when a viewer subscribes, then coalesced
deltas filtered by that viewer's permissions. The client applies deltas to its cache, detects gaps by sequence number and
refetches a snapshot when one appears. Logs stream only for the run a viewer opens, into a virtualised viewer, and charts
come from pre-aggregated metrics. Coalescing turns about 625,000 pushes a second into about 150,000 in my estimate.

### Firestore listeners from the browser or your own WebSocket service? {deep}

Firestore listeners are the fastest to build: no gateway to run, security rules enforce per-user access, and the SDK
handles reconnects and offline caching. They get harder with very chatty data (per-document write limits), complex RBAC
that the rules must mirror (rules are not filters, so every query must be shaped to what the user may read), and read
costs at high fan-out. My own gateway with Redis gives full control over coalescing,
filtering and auth and is cheaper at high event rates, but I have to run and scale it. For an internal dashboard with
modest traffic I would start with Firestore; for thousands of viewers I would build the gateway.

### How would you let agents create SAP purchase orders safely? {core}

The agent never touches SAP directly. Its tool creates a draft in our integration service, validated against a canonical
schema and master data. A policy decides whether approval is needed, and the approval card shows exactly what will be
created. Only then does a rate-limited queue hand the order to an SAP adapter, an anti-corruption layer that maps fields,
fetches the CSRF token, and creates the PO through SAP's OData Purchase Order API. A correlation id written into the PO
makes retries safe through check-before-create, and every step is audited.

**Your angle:** be clear that SAP itself is new to you, and that enterprise integrations are not: FedEx, the carriers,
Labcorp and the external submission APIs at Quantiphi.

### What happens when SAP is down for two hours?

Approved orders wait in the queue; Cloud Tasks retries with exponential backoff, and a circuit breaker stops calls
entirely while SAP is failing, probing again periodically. Nothing is lost, because the drafts and approvals are already
in PostgreSQL. The user sees "approved, waiting for SAP" instead of an error. When SAP returns, the queue drains at the
configured rate, so we do not hit it with a two-hour backlog at once. Tasks that exceed the retry limit go to a
dead-letter table with an alert.

### How do you design multi-tenant RBAC across different enterprise identity providers? {core}

Put an identity layer in front that speaks both SAML and OIDC per tenant (Identity Platform's multi-tenancy, or a broker
such as Auth0 or Keycloak), discovers the tenant from the email domain, validates the IdP's response and issues our own
short-lived session. Each tenant maps its IdP groups to platform roles, stored as data. Every request, stream subscription
and agent tool call goes through one policy check, `can(user, action, resource)`, that combines roles with attribute
rules such as approval limits, and the database enforces tenant isolation again with row-level security. SCIM handles
provisioning and fast deprovisioning, and every decision is audited.

### How do you make sure an agent never does more than the user could? {core}

The agent acts on behalf of a user, so every tool call carries that user's identity and goes through the same policy
check as a direct request. The effective permission is the intersection of the user's permissions and the agent's allowed
tools: a viewer running a procurement agent still cannot create a purchase order. On top of that, high-impact tools only
produce drafts that need approval, tool arguments are validated against schemas, and tool results are treated as
untrusted input, so prompt injection in a document cannot widen what the agent may do.

**Your angle:** this is the "tool-use boundaries and HITL checkpoints" work from the Document AI platform.

### How do you deprovision a user who leaves the customer's company? {deep}

With SCIM, the customer's IdP calls our provisioning endpoint to deactivate the user, and we revoke their sessions
immediately. Because tokens are short-lived and roles are resolved server-side, nothing stale survives for long. Open
SSE or WebSocket connections are closed when the gateway sees the revoke event or rechecks authorisation. Without SCIM, a
short session lifetime plus a silent re-authentication against the IdP limits how long a removed user keeps access.

### How would you handle one tenant consuming all the LLM capacity?

Per-tenant quotas and budgets at the edge: a token bucket on estimated LLM tokens, concurrent-run limits and a daily cost
cap, all keyed by tenant in Redis. Behind that, separate queues or priority lanes so one tenant's backlog does not delay
others, and per-agent step limits so a looping agent stops itself. Dashboards show usage per tenant, and alerts fire when
a tenant approaches its budget, so it becomes a conversation instead of an outage.

### What would you change at ten times the scale? {deep}

Shard more: more Redis shards for event logs, partition the run events table by time, read replicas for dashboards, and
reporting moved fully to BigQuery. Go regional: deploy gateways and workers in several regions behind the global load
balancer, keep each run's work in one region, and keep state replicated for failover. Revisit cost: move the long-lived
connection layer to GKE if it is cheaper than Cloud Run at that volume, and push harder on model routing and caching,
because LLM spend grows faster than infrastructure spend.

## Coding problems

### Build a resumable per-run event log {medium core}

The stream gateway needs a log per run that supports resume. Write a `RunEventLog` with:

- `append(runId, type, data)` returns the new event's id: an increasing integer per run, starting at 1.
- `readAfter(runId, lastId)` returns `{ events }` with every retained event whose id is greater than `lastId`. If
  events after `lastId` were already trimmed away, return `{ reset: true }` instead, so the client reloads its snapshot.
  Also return `{ reset: true }` if `lastId` is newer than anything the log has assigned: the log was lost or restarted.
- Keep at most `maxPerRun` events per run (drop the oldest).

#### Hints

1. Store per run an array of events and the next id to assign.
2. Trimming keeps the newest events. Resume is only possible when `lastId + 1` is still in the array, or the run has no
   newer events at all.
3. Because ids are consecutive, the position of id `n` is `n - firstRetainedId`, so you do not need to search. Compare
   `lastId` with the last id you assigned before anything else.

#### Solution

This is what Redis Streams give you (ids, reads after an id, trimming by length); writing it once makes the resume rules
concrete. There are two cases where replaying would silently lose events, so the honest answer is "reset": the
client's last id is older than the oldest retained event minus one (the gap was trimmed), or it is newer than the last
id the log assigned (the server restarted and ids began again at 1, so the new events would look old).

```ts
import assert from 'node:assert/strict';

type RunEvent = { id: number; type: string; data: unknown };
type ReadResult = { events: RunEvent[] } | { reset: true };

class RunEventLog {
  private readonly runs = new Map<string, { events: RunEvent[]; nextId: number }>();
  private readonly maxPerRun: number;

  constructor(maxPerRun: number) {
    if (!Number.isInteger(maxPerRun) || maxPerRun < 1) throw new RangeError('maxPerRun must be a positive integer');
    this.maxPerRun = maxPerRun;
  }

  append(runId: string, type: string, data: unknown): number {
    const run = this.runs.get(runId) ?? { events: [], nextId: 1 };
    const event = { id: run.nextId++, type, data };
    run.events.push(event);
    if (run.events.length > this.maxPerRun) run.events.splice(0, run.events.length - this.maxPerRun);
    this.runs.set(runId, run);
    return event.id;
  }

  readAfter(runId: string, lastId: number): ReadResult {
    const run = this.runs.get(runId);
    const lastAssigned = run ? run.nextId - 1 : 0;
    if (lastId > lastAssigned) return { reset: true }; // client is ahead: the log was lost or restarted
    if (!run || lastId === lastAssigned) return { events: [] }; // fully caught up
    const first = run.events[0].id;
    if (lastId + 1 < first) return { reset: true }; // events the client missed were trimmed
    return { events: run.events.slice(lastId + 1 - first) };
  }
}

const ids = (result: ReadResult) => ('events' in result ? result.events.map((e) => e.id) : 'reset');

const log = new RunEventLog(3);
assert.equal(log.append('run_1', 'token', 'Hello'), 1);
log.append('run_1', 'token', ' world');
log.append('run_1', 'tool_call', { tool: 'search' });

assert.deepEqual(log.readAfter('run_1', 1), {
  events: [
    { id: 2, type: 'token', data: ' world' },
    { id: 3, type: 'tool_call', data: { tool: 'search' } },
  ],
});
assert.deepEqual(log.readAfter('run_1', 3), { events: [] }); // up to date
assert.deepEqual(ids(log.readAfter('run_1', 0)), [1, 2, 3]); // nothing trimmed yet

log.append('run_1', 'token', '!'); // id 4, trims id 1
log.append('run_1', 'done', null); // id 5, trims id 2
assert.deepEqual(log.readAfter('run_1', 0), { reset: true }); // ids 1 and 2 are gone
assert.deepEqual(log.readAfter('run_1', 1), { reset: true }); // id 2 is gone
assert.deepEqual(ids(log.readAfter('run_1', 2)), [3, 4, 5]); // id 3 is the oldest retained: resume works
assert.deepEqual(log.readAfter('run_1', 5), { events: [] }); // caught up after trimming
assert.deepEqual(log.readAfter('run_1', 9), { reset: true }); // client is ahead of the log
assert.deepEqual(log.readAfter('run_2', 0), { events: [] }); // unknown run, nothing missed
assert.deepEqual(log.readAfter('run_2', 4), { reset: true }); // e.g. the server restarted and lost the log
assert.equal(log.append('run_2', 'token', 'x'), 1); // ids are per run
assert.throws(() => new RunEventLog(0), RangeError);
```

Complexity: `append` is O(1) amortised (the splice removes one element), `readAfter` is O(k) for k returned events.

#### Follow-ups

- **How does this map to Redis?** `XADD run:{id} MAXLEN ~ 1000 * type token data …` to append, `XREAD BLOCK 15000
  STREAMS run:{id} <lastId>` to wait for new events, and an expiry on the key after the run finishes.
- **Why not keep everything forever?** The hot log is for resume over seconds or minutes. The durable record is the final
  message and run history in PostgreSQL; a `reset` sends the client there.
- **What if two workers append to the same run?** Only one worker should own a run at a time (a lease); otherwise ids from
  two writers interleave and the log stops being a faithful history of one run.

### Create an external purchase order exactly once {medium core}

A worker submits approved purchase orders to an ERP. Calls can time out **after** the ERP has created the order. Write
`submit_once(draft, erp)` that creates the order at most once per draft, using the draft's `correlation_id`, and returns
the ERP's PO number. The ERP client offers `find_by_reference(ref)` (returns a PO number or `None`) and
`create(order)` (may raise `TimeoutError`). Retrying `submit_once` after a timeout must never create a second order.

#### Hints

1. The danger is the ambiguous timeout: you do not know whether `create` succeeded.
2. Put the correlation id into the order itself (a reference field), so you can look it up later.
3. Always look up before creating. Then a retry after an ambiguous timeout finds the existing order.

#### Solution

Check-before-create with a correlation id turns "did it happen?" into a query. It still leaves a small race if two
workers submit the same draft at the same moment, which is why the step also holds a lease (only one worker per draft)
and a reconciliation job double-checks.

```python
from dataclasses import dataclass, field


@dataclass
class FakeErp:
    timeout_after_create: int = 0  # the next N creates succeed but then time out
    orders: dict[str, dict] = field(default_factory=dict)
    create_calls: int = 0

    def find_by_reference(self, reference: str) -> str | None:
        return next((po for po, order in self.orders.items() if order["reference"] == reference), None)

    def create(self, order: dict) -> str:
        self.create_calls += 1
        po_number = f"45000{len(self.orders) + 1:05d}"
        self.orders[po_number] = order
        if self.timeout_after_create > 0:
            self.timeout_after_create -= 1
            raise TimeoutError("ERP did not answer in time")
        return po_number


def submit_once(draft: dict, erp: FakeErp) -> str:
    reference = draft["correlation_id"]
    existing = erp.find_by_reference(reference)
    if existing is not None:
        return existing
    order = {"reference": reference, "vendor": draft["vendor"], "items": draft["items"]}
    return erp.create(order)


draft = {"correlation_id": "po-draft-7f3a", "vendor": "V100", "items": [{"material": "LAPTOP-14", "qty": 20}]}

erp = FakeErp()
assert submit_once(draft, erp) == "4500000001"
assert submit_once(draft, erp) == "4500000001"  # a retry returns the same order
assert erp.create_calls == 1 and len(erp.orders) == 1

erp = FakeErp(timeout_after_create=1)
try:
    submit_once(draft, erp)
    raise AssertionError("expected a timeout")
except TimeoutError:
    pass
assert len(erp.orders) == 1  # the order exists even though the call failed
assert submit_once(draft, erp) == "4500000001"  # the retry finds it instead of creating another
assert erp.create_calls == 1

other = {**draft, "correlation_id": "po-draft-9b21"}
assert submit_once(other, erp) == "4500000002"  # a different draft is a different order
```

Complexity: one lookup and at most one create per call; the fake's lookup is O(n), a real ERP query by an indexed
reference field is fast.

#### Follow-ups

- **What if the ERP cannot search by your reference?** Store the request in an outbox with status `sent` before calling,
  and on an ambiguous failure mark it `unknown` for reconciliation against the ERP's export, rather than retrying blindly.
- **What if the API supports idempotency keys?** Use the correlation id as the key and still keep the lookup for
  reconciliation.

### Check permissions for users and the agents acting for them {medium}

Write `can(principal, action, resource, config)` for a multi-tenant platform:

- A principal has `tenant`, `groups` and an optional `agent_tools` list (set when an agent acts for the user).
- `config["group_roles"][tenant]` maps IdP groups to roles; `config["role_permissions"]` maps roles to actions.
- Deny if the resource belongs to another tenant. Allow `approve_po` only when the resource's `amount` is within the
  principal's highest `approval_limit` (from `config["role_limits"]`).
- When `agent_tools` is set, the action must also be one of those tools.

#### Hints

1. Resolve roles from the principal's groups for its own tenant only; unknown groups give no roles.
2. Compute the set of permitted actions as the union over roles, then apply the attribute rule for approvals.
3. Check tenant isolation first, and intersect with the agent's tools last.

#### Solution

The order of checks mirrors the design: tenant isolation, role-based permissions, attribute rules, then the agent
boundary. Each rule can only take permissions away after the role grant, which keeps the policy easy to reason about.

```python
def can(principal: dict, action: str, resource: dict, config: dict) -> bool:
    if resource["tenant"] != principal["tenant"]:
        return False
    group_roles = config["group_roles"].get(principal["tenant"], {})
    roles = {group_roles[g] for g in principal["groups"] if g in group_roles}
    allowed = set().union(*(config["role_permissions"].get(r, set()) for r in roles))
    if action not in allowed:
        return False
    if action == "approve_po":
        limit = max((config["role_limits"].get(r, 0) for r in roles), default=0)
        if resource.get("amount", float("inf")) > limit:
            return False
    tools = principal.get("agent_tools")
    if tools is not None and action not in tools:
        return False
    return True


config = {
    "group_roles": {
        "acme": {"okta-eng": "operator", "okta-finance-managers": "approver", "okta-viewers": "viewer"},
        "globex": {"GX-Admins": "admin"},
    },
    "role_permissions": {
        "viewer": {"view_run"},
        "operator": {"view_run", "start_run", "create_po_draft"},
        "approver": {"view_run", "approve_po"},
        "admin": {"view_run", "start_run", "create_po_draft", "approve_po", "manage_roles"},
    },
    "role_limits": {"approver": 50_000, "admin": 250_000},
}
po = {"tenant": "acme", "amount": 31_800}
big_po = {"tenant": "acme", "amount": 120_000}

operator = {"tenant": "acme", "groups": ["okta-eng"]}
manager = {"tenant": "acme", "groups": ["okta-finance-managers", "okta-eng"]}
viewer = {"tenant": "acme", "groups": ["okta-viewers"]}
outsider = {"tenant": "globex", "groups": ["GX-Admins"]}

assert can(operator, "create_po_draft", po, config)
assert not can(operator, "approve_po", po, config)
assert can(manager, "approve_po", po, config)
assert not can(manager, "approve_po", big_po, config)  # above the approval limit
assert not can(outsider, "view_run", po, config)  # another tenant, even as admin
assert not can({"tenant": "acme", "groups": ["GX-Admins"]}, "view_run", po, config)  # group from another tenant's IdP

agent_for_viewer = {**viewer, "agent_tools": ["create_po_draft", "view_run"]}
assert not can(agent_for_viewer, "create_po_draft", po, config)  # the agent cannot exceed the user
agent_for_operator = {**operator, "agent_tools": ["view_run"]}
assert not can(agent_for_operator, "create_po_draft", po, config)  # nor the agent's own tool list
assert can(agent_for_operator, "view_run", po, config)
```

Complexity: O(groups + roles) per check; in production the resolved roles are cached per session for a short time.

#### Follow-ups

- **Where does this run?** In one shared library or policy service used by the API, the stream gateway and the agent
  tool router, so the rules cannot drift between them. Engines such as OPA or Cedar express the same rules as policy
  files.
- **How do you test it?** A table of principal, action, resource and expected result, including every deny case, run in
  CI whenever roles or mappings change.
