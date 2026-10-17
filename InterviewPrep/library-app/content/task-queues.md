---
title: Task queues and async workers
goal: Design the queue behind long-running agent runs (delivery guarantees, retries, idempotency, dead letters, ordering, rate limits and progress reporting) and defend every choice.
minutes: 50
---

Platform roles ask for asynchronous task queues and data pipelines that coordinate long-running work, such as autonomous agent workflows and calls to external enterprise APIs. In practice an agent run takes far longer than an HTTP request: it plans, calls tools, waits for approvals and calls slow enterprise APIs. So the API accepts the request, puts work on a queue, and workers do the work and report progress. Interviewers probe the hard parts: **what happens when a worker crashes halfway**, **what happens when a message is delivered twice**, and **how you stop one bad message or one slow API from taking the system down**.

The one sentence to remember: **queues give you at-least-once delivery, so every consumer must be idempotent.** Almost every good answer in this chapter comes back to that.

## Why put a queue between the API and the work

| Without a queue | With a queue |
|---|---|
| The request has to stay open while the agent runs (minutes), and it hits request timeouts | The API returns `202 Accepted` with a run id in milliseconds |
| A spike in traffic hits the LLM and the enterprise APIs directly | The queue absorbs the spike; workers drain it at a rate the APIs can take |
| A crash loses the work in progress | The message is redelivered to another worker |
| Retries are ad hoc, inside request handlers | Retries, backoff and dead-lettering are one policy, in one place |
| Scaling the API and the work are coupled | API instances and worker instances scale independently |

The cost: more moving parts, eventual consistency (the UI must show "queued" and "running"), and the need to design for duplicates.

## How a message moves through a queue

```text
producer ──send──▶ [ queue ] ──deliver (lease)──▶ worker ──ack──▶ message deleted
                       ▲                             │
                       └──── lease expires / nack ───┘   (redelivered, attempt + 1)
                                     │
                       after N attempts ──▶ [ dead-letter queue ] ──▶ alert, inspect, redrive
```

- **Lease, visibility timeout or ack deadline:** when a worker receives a message it becomes invisible to other workers for a period (SQS calls it the visibility timeout, Pub/Sub the ack deadline, Celery on Redis the visibility timeout). If the worker does not acknowledge in time, the message is delivered again.
- **Ack after the work, not before:** acknowledging first gives at-most-once delivery (a crash loses the job). Acknowledging after gives at-least-once (a crash causes a redelivery). Celery acknowledges early by default; `acks_late=True` changes that.
- **Heartbeats:** a job that legitimately runs longer than the lease must extend it (Pub/Sub client libraries extend ack deadlines automatically while you hold a message; BullMQ renews job locks; in your own Postgres queue you update `locked_until`).

## Delivery guarantees

| Guarantee | What it means | How you get it | Risk |
|---|---|---|---|
| At-most-once | Delivered zero or one time | Ack before processing | Lost work on crash |
| At-least-once | Delivered one or more times | Ack after processing, redeliver on timeout | Duplicates |
| Exactly-once | Delivered once | Only inside one system's boundary (Pub/Sub exactly-once on a pull subscription, for example) | Side effects in other systems can still happen twice |

"Exactly-once" in practice means **effectively once: at-least-once delivery plus an idempotent consumer**. Pub/Sub does offer exactly-once delivery, but only for pull subscriptions (including StreamingPull), within one region, and it says nothing about the side effects your handler causes in other systems. If your handler calls an ERP and crashes before acking, the ERP call has still happened.

## Retries: what, how often, and when to stop

Retry **transient** failures: timeouts, connection resets, `429 Too Many Requests`, `502`, `503`, `504`. Do not retry **permanent** failures: `400`, `401`, `403`, `404`, validation errors, a model output that fails the schema for the third time. Retrying those only fills the queue.

Use **exponential backoff with jitter**. Without jitter, every worker that failed at the same moment retries at the same moment and causes the next outage (a thundering herd). "Full jitter" picks a random delay between 0 and the exponential ceiling:

```python
import random


def backoff_delay(attempt: int, base: float = 0.5, cap: float = 30.0, rng: random.Random | None = None) -> float:
    """Full-jitter exponential backoff: a random delay between 0 and min(cap, base * 2**attempt) seconds."""
    rng = rng or random.Random()
    ceiling = min(cap, base * 2**attempt)
    return rng.uniform(0, ceiling)


rng = random.Random(42)
ceilings = [min(30.0, 0.5 * 2**a) for a in range(8)]
delays = [backoff_delay(a, rng=rng) for a in range(8)]
assert ceilings == [0.5, 1.0, 2.0, 4.0, 8.0, 16.0, 30.0, 30.0]
assert all(0 <= d <= c for d, c in zip(delays, ceilings))
```

Also cap the **number of attempts** and the **total retry duration**, honour `Retry-After` when an API sends it, and give up into a dead-letter queue.

### A worker pool with retries and a dead-letter queue

This is the whole pattern in one runnable block: a queue, a pool of workers, a handler that fails in different ways, retries with backoff for transient errors, and a dead-letter list for permanent errors and exhausted retries.

```python
import asyncio
import random
from dataclasses import dataclass, field


class TransientError(Exception):
    """Worth retrying: a timeout, a 429 or a 503 from a tool's API."""


class PermanentError(Exception):
    """Not worth retrying: bad input, a 400, a validation failure."""


@dataclass
class Job:
    id: str
    payload: dict
    attempts: int = 0


@dataclass
class Outcome:
    done: list[str] = field(default_factory=list)
    dead: dict[str, str] = field(default_factory=dict)


async def run_workers(jobs, handler, *, workers=3, max_attempts=4, base_delay=0.001) -> Outcome:
    queue: asyncio.Queue[Job] = asyncio.Queue()
    for job in jobs:
        queue.put_nowait(job)
    outcome = Outcome()
    rng = random.Random(0)

    async def worker() -> None:
        while True:
            job = await queue.get()
            try:
                job.attempts += 1
                await handler(job)
                outcome.done.append(job.id)
            except PermanentError as exc:
                outcome.dead[job.id] = f"PermanentError: {exc}"
            except TransientError as exc:
                if job.attempts >= max_attempts:
                    outcome.dead[job.id] = f"TransientError: {exc}"
                else:
                    # A real broker would hide the message and redeliver it later, freeing the worker.
                    await asyncio.sleep(rng.uniform(0, base_delay * 2**job.attempts))
                    queue.put_nowait(job)  # re-enqueue BEFORE task_done, so join() cannot finish early
            finally:
                queue.task_done()

    tasks = [asyncio.create_task(worker()) for _ in range(workers)]
    await queue.join()
    for t in tasks:
        t.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
    return outcome


calls: dict[str, int] = {}


async def handler(job: Job) -> None:
    calls[job.id] = calls.get(job.id, 0) + 1
    if job.id == "flaky" and calls[job.id] < 3:
        raise TransientError("503 from the ticketing API")
    if job.id == "bad-input":
        raise PermanentError("missing field 'po_number'")
    if job.id == "always-down":
        raise TransientError("timeout")
    await asyncio.sleep(0)


jobs = [Job(i, {}) for i in ["ok-1", "flaky", "bad-input", "always-down", "ok-2"]]
outcome = asyncio.run(run_workers(jobs, handler))
assert sorted(outcome.done) == ["flaky", "ok-1", "ok-2"]
assert outcome.dead == {"bad-input": "PermanentError: missing field 'po_number'", "always-down": "TransientError: timeout"}
assert calls == {"ok-1": 1, "flaky": 3, "bad-input": 1, "always-down": 4, "ok-2": 1}
```

### What a lease looks like inside the broker

A lease-based queue in a few lines, with a fake clock so the test is instant. It shows the three behaviours you will be asked about: a message comes back after a crash, a heartbeat extends the lease, and a message that keeps failing ends up dead-lettered.

```ts
import assert from 'node:assert/strict';

type Message<T> = { id: string; body: T; deliveries: number; invisibleUntil: number };

class LeaseQueue<T> {
  readonly dead: Message<T>[] = [];
  private readonly messages = new Map<string, Message<T>>();
  private seq = 0;
  private readonly now: () => number;
  private readonly visibilityMs: number;
  private readonly maxDeliveries: number;

  constructor(opts: { now: () => number; visibilityMs: number; maxDeliveries: number }) {
    this.now = opts.now;
    this.visibilityMs = opts.visibilityMs;
    this.maxDeliveries = opts.maxDeliveries;
  }

  send(body: T): string {
    const id = `m${++this.seq}`;
    this.messages.set(id, { id, body, deliveries: 0, invisibleUntil: 0 });
    return id;
  }

  /** Lease the oldest visible message. It reappears if it is not acked before the lease ends. */
  receive(): Message<T> | undefined {
    for (const m of this.messages.values()) {
      if (m.invisibleUntil > this.now()) continue;
      if (m.deliveries >= this.maxDeliveries) {
        this.messages.delete(m.id);
        this.dead.push(m);
        continue;
      }
      m.deliveries++;
      m.invisibleUntil = this.now() + this.visibilityMs;
      return m;
    }
    return undefined;
  }

  /** Heartbeat for a long job: push the lease out again. */
  extend(id: string, ms: number): void {
    const m = this.messages.get(id);
    if (m) m.invisibleUntil = this.now() + ms;
  }

  ack(id: string): void {
    this.messages.delete(id);
  }
}

let t = 0;
const q = new LeaseQueue<string>({ now: () => t, visibilityMs: 30_000, maxDeliveries: 3 });

const id = q.send('summarise run-7');
assert.equal(q.receive()?.deliveries, 1);
assert.equal(q.receive(), undefined, 'invisible while leased');
t += 31_000; // the worker crashed and never acked
const again = q.receive();
assert.equal(again?.id, id);
assert.equal(again?.deliveries, 2);
q.extend(id, 60_000); // a long job sends a heartbeat
t += 45_000;
assert.equal(q.receive(), undefined, 'still leased thanks to the heartbeat');
q.ack(id);

q.send('poison');
for (let i = 0; i < 3; i++) {
  assert.ok(q.receive());
  t += 31_000;
}
assert.equal(q.receive(), undefined);
assert.deepEqual(q.dead.map((m) => m.body), ['poison']);
```

## Idempotent consumers

A consumer is idempotent when processing the same message twice has the same effect as processing it once. Ways to get there, from best to weakest:

1. **Naturally idempotent operations:** "set status to approved" or `PUT` with the full state, instead of "increment" or "append".
2. **A dedupe record in the same transaction as the effect:** insert the message id into a table with a primary key, and do the work in the same database transaction. A duplicate fails the insert and skips the work.
3. **Idempotency keys passed downstream:** when the effect is in another system (an ERP, a payment API, a ticketing tool), send a stable key such as `run_id:step_id` in an `Idempotency-Key` header or as the external reference, so the other system can reject the duplicate.
4. **Check-then-act:** look the external state up first ("does a PO with this reference exist?") and create only if it is absent. This is the weakest option: without a lock around the check and the create, two workers can both see "absent" and both create.

```python
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript(
    """
    CREATE TABLE processed_messages (message_id TEXT PRIMARY KEY);
    CREATE TABLE ticket_comments (id INTEGER PRIMARY KEY, ticket_id TEXT NOT NULL, body TEXT NOT NULL);
    """
)


def handle(message_id: str, ticket_id: str, body: str, fail: bool = False) -> bool:
    """Apply the message once. Returns False for a duplicate."""
    with db:  # one transaction: the dedupe row and the effect commit together, or neither does
        cur = db.execute("INSERT OR IGNORE INTO processed_messages (message_id) VALUES (?)", (message_id,))
        if cur.rowcount == 0:
            return False
        db.execute("INSERT INTO ticket_comments (ticket_id, body) VALUES (?, ?)", (ticket_id, body))
        if fail:
            raise RuntimeError("crash after the effect, before commit")
    return True


assert handle("msg-1", "T-100", "Agent reset the VPN profile") is True
assert handle("msg-1", "T-100", "Agent reset the VPN profile") is False  # redelivered: skipped

try:
    handle("msg-2", "T-100", "Agent closed the ticket", fail=True)
except RuntimeError:
    pass
# The failed attempt rolled back the dedupe row too, so the redelivery is processed.
assert handle("msg-2", "T-100", "Agent closed the ticket") is True
assert db.execute("SELECT COUNT(*) FROM ticket_comments").fetchone()[0] == 2
```

## The dual-write problem and the outbox pattern

A classic bug: the API saves the run to Postgres and then publishes "run queued" to Pub/Sub. If the process dies between the two, the database says the run exists but no worker ever hears about it. Publishing first is no better: the worker may pick up a run that was never saved.

The **transactional outbox** fixes it: write the business row **and** an outbox row in the same database transaction. A separate relay reads unpublished outbox rows, publishes them, and marks them published. The relay can crash between publishing and marking, so it may publish twice, which is fine because consumers are idempotent (they dedupe on the event id).

```python
import json
import sqlite3

db = sqlite3.connect(":memory:")
db.executescript(
    """
    CREATE TABLE runs (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      topic TEXT NOT NULL,
      payload TEXT NOT NULL,
      published_at TEXT
    );
    """
)


def start_run(run_id: str, fail_after_insert: bool = False) -> None:
    with db:  # both rows or neither
        db.execute("INSERT INTO runs VALUES (?, 'queued')", (run_id,))
        if fail_after_insert:
            raise RuntimeError("process died mid-request")
        event = {"type": "run.queued", "run_id": run_id}
        db.execute("INSERT INTO outbox (topic, payload) VALUES ('run-events', ?)", (json.dumps(event),))


def relay(publish) -> int:
    rows = db.execute("SELECT id, topic, payload FROM outbox WHERE published_at IS NULL ORDER BY id").fetchall()
    for row_id, topic, payload in rows:
        publish(topic, {"event_id": row_id, **json.loads(payload)})
        with db:
            db.execute("UPDATE outbox SET published_at = CURRENT_TIMESTAMP WHERE id = ?", (row_id,))
    return len(rows)


start_run("run-1")
try:
    start_run("run-2", fail_after_insert=True)
except RuntimeError:
    pass
assert db.execute("SELECT id FROM runs").fetchall() == [("run-1",)]  # no half-written run

sent: list[dict] = []
lost_ack = {"once": True}


def flaky_publish(topic: str, message: dict) -> None:
    sent.append(message)  # the broker received it...
    if lost_ack.pop("once", False):
        raise ConnectionError("...but the ack was lost")


try:
    relay(flaky_publish)
except ConnectionError:
    pass
assert relay(flaky_publish) == 1  # the row was not marked, so it is published again
assert relay(flaky_publish) == 0
assert [m["event_id"] for m in sent] == [1, 1]  # a duplicate: consumers dedupe on event_id
```

Two details interviewers like. Run one relay, or let several relays claim rows with `FOR UPDATE SKIP LOCKED` so they do not publish the same rows at the same time. And select on `published_at IS NULL` rather than paging with `id > last_seen_id`: sequence values can commit out of order, so a high-water mark would skip a row written by a slower transaction.

Alternatives: change data capture (Debezium, or Datastream on GCP) reads the database's write-ahead log instead of an outbox table; "listen to yourself" (publish only, and update your own database from the event).

## PostgreSQL as a queue

For moderate volume you may not need a broker at all. Postgres can be a reliable job queue, with jobs in the same transaction as your data and no extra infrastructure. The key is `FOR UPDATE SKIP LOCKED`: each worker locks the next available row and **skips rows other workers have locked**, so workers never block each other or take the same job.

```sql postgres
CREATE TABLE jobs (
  id           bigserial PRIMARY KEY,
  run_id       text        NOT NULL,
  kind         text        NOT NULL,
  priority     int         NOT NULL DEFAULT 0,
  status       text        NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'dead')),
  attempts     int         NOT NULL DEFAULT 0,
  max_attempts int         NOT NULL DEFAULT 5,
  run_at       timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error   text
);
-- Workers only ever look for queued jobs, so a partial index keeps the claim query fast as done jobs pile up.
CREATE INDEX jobs_ready ON jobs (priority DESC, id) WHERE status = 'queued';

INSERT INTO jobs (run_id, kind, priority) VALUES
  ('run-1', 'call_tool', 0),
  ('run-1', 'summarise', 0),
  ('run-2', 'call_tool', 10),
  ('run-3', 'call_tool', 0);
```

A worker claims the highest-priority due job and takes a five-minute lease on it in one statement:

```sql postgres
WITH next AS (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE jobs
SET status = 'running', attempts = attempts + 1, locked_until = now() + interval '5 minutes'
FROM next
WHERE jobs.id = next.id
RETURNING jobs.id, jobs.run_id, jobs.attempts
-- expect: [(3, 'run-2', 1)]
```

```sql postgres
WITH next AS (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE jobs
SET status = 'running', attempts = attempts + 1, locked_until = now() + interval '5 minutes'
FROM next
WHERE jobs.id = next.id
RETURNING jobs.id, jobs.run_id, jobs.attempts
-- expect: [(1, 'run-1', 1)]
```

Job 1 fails with a transient error. Schedule a retry with exponential backoff, or dead-letter it when attempts run out:

```sql postgres
UPDATE jobs
SET status       = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
    run_at       = now() + interval '1 second' * power(2, attempts),
    locked_until = NULL,
    last_error   = '503 from the tool API'
WHERE id = 1 AND status = 'running' AND attempts = 1  -- 1 = the attempt this worker claimed (see below)
RETURNING id, status, attempts
-- expect: [(1, 'queued', 1)]
```

The next claim skips job 1, because its `run_at` is in the future, and takes job 2:

```sql postgres
WITH next AS (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE jobs
SET status = 'running', attempts = attempts + 1, locked_until = now() + interval '5 minutes'
FROM next
WHERE jobs.id = next.id
RETURNING jobs.id, jobs.run_id
-- expect: [(2, 'run-1')]
```

A worker that crashes never finishes its job. A reaper (or the claim query itself) returns expired leases to the queue:

```sql postgres
-- Simulate the crash: the worker holding job 3 stopped renewing its lease a minute ago.
UPDATE jobs SET locked_until = now() - interval '1 minute' WHERE id = 3;
```

```sql postgres
-- A job that keeps crashing its worker must not loop forever, so the reaper dead-letters it too.
UPDATE jobs
SET status = CASE WHEN attempts >= max_attempts THEN 'dead' ELSE 'queued' END,
    locked_until = NULL
WHERE status = 'running' AND locked_until < now()
RETURNING id
-- expect: [(3,)]
```

Job 3 is back in the queue, so the next claim takes it again, as attempt 2:

```sql postgres
WITH next AS (
  SELECT id FROM jobs
  WHERE status = 'queued' AND run_at <= now()
  ORDER BY priority DESC, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
UPDATE jobs
SET status = 'running', attempts = attempts + 1, locked_until = now() + interval '5 minutes'
FROM next
WHERE jobs.id = next.id
RETURNING jobs.id, jobs.run_id, jobs.attempts
-- expect: [(3, 'run-2', 2)]
```

Now the original worker for job 3 wakes up from a long pause (a GC stall or a network partition: it only *looked* dead) and tries to finish. If its update matched on `id` and `status` alone, it would mark the new worker's attempt as done. The attempt number it claimed acts as a **fencing token**, so the stale update matches nothing and the old worker knows to stop:

```sql postgres
UPDATE jobs SET status = 'done', locked_until = NULL
WHERE id = 3 AND status = 'running' AND attempts = 1
RETURNING id
-- expect: []
```

```sql postgres
UPDATE jobs SET status = 'done', locked_until = NULL WHERE id = 2 AND status = 'running' AND attempts = 1 RETURNING id
-- expect: [(2,)]
```

```sql postgres
SELECT id, status, attempts FROM jobs ORDER BY id
-- expect: [(1, 'queued', 1), (2, 'done', 1), (3, 'running', 2), (4, 'queued', 0)]
```

What happens when two workers claim at the same moment (each claim's row lock is held until its transaction commits):

```text
with SKIP LOCKED:
  worker A: claim → job 1 (row locked until A commits)
  worker B: claim → job 2 immediately (skips the locked job 1)

without SKIP LOCKED (plain FOR UPDATE):
  worker B: claim → waits for A's lock on job 1; when A commits, Postgres re-checks the row,
            sees status = 'running', and moves on → job 2, but only after waiting
```

So plain `FOR UPDATE` is still correct in Postgres, but every worker queues up behind the same row lock and throughput collapses. `SKIP LOCKED` lets them all claim in parallel.

Use `LISTEN`/`NOTIFY` to wake idle workers instead of polling tightly. Libraries exist for this pattern (for example Procrastinate and PGQueuer in Python, Graphile Worker and pg-boss in Node). Outgrow it when the job rate makes the jobs table a hot spot, or when you need fan-out to many independent consumers. That is what Pub/Sub is for.

## Ordering

Strict global ordering kills parallelism, and most systems do not need it. What they need is **ordering per key**: all events for run 42 in order, while runs 42 and 43 proceed in parallel.

- **Pub/Sub ordering keys:** with message ordering enabled on the subscription, messages that share an ordering key (and are published in the same region) are delivered in order.
- **Partitioned logs (Kafka):** order is per partition; partition by run id.
- **Your own workers:** route by key to a single consumer at a time (a per-key lock or a per-key queue).
- **Sequence numbers in the payload:** consumers detect gaps and out-of-order events and either buffer them or resync. You need this anyway on the browser side of a stream.

## Rate limits and concurrency towards external APIs

An enterprise API that allows 5 requests per second does not care how many workers you have. Options:

- **Queue-level dispatch limits:** Cloud Tasks queues have a maximum dispatch rate and a maximum number of concurrent dispatches, so the queue itself paces the calls.
- **Worker-level limits:** BullMQ workers take a `limiter` (`max` jobs per `duration`) and a `concurrency`. In Python, an `asyncio.Semaphore` caps concurrent calls per process.
- **A shared limiter across processes:** a token bucket in Redis (see [Redis](#/redis)), so 20 Cloud Run instances share one budget.
- **Respect 429 and Retry-After:** back off as the API asks, and open a circuit breaker if it keeps failing (see [Microservices](#/microservices)).

```bash
gcloud tasks queues create tool-calls \
  --location=us-central1 \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=10 \
  --max-attempts=5 \
  --min-backoff=1s \
  --max-backoff=60s
```

## Choosing a tool

| Tool | Broker | Good for | Watch out for |
|---|---|---|---|
| Celery | Redis, RabbitMQ, SQS | Mature Python task queue: retries, schedules, chords | Acks early by default (`acks_late=True` changes it); on Redis, a task that runs longer than the visibility timeout (1 hour by default) is redelivered |
| RQ | Redis | Simple synchronous Python jobs | Fewer features; sync only |
| Arq | Redis | asyncio-native Python workers (fits FastAPI code) | Smaller ecosystem |
| Dramatiq | Redis, RabbitMQ | Simpler than Celery with sensible defaults (acks after processing, retries with backoff) | Smaller ecosystem |
| BullMQ | Redis | Node/TypeScript: retries, delays, rate limiting, flows | Redis persistence settings matter |
| Cloud Tasks | Managed | Explicit HTTP calls to a handler (often a Cloud Run service) with per-queue rate limits, scheduled delivery and dedupe by task name | One target per task; handler deadline is 10 minutes by default, 30 at most |
| Pub/Sub | Managed | Fan-out events to many independent subscribers at high throughput; push to Cloud Run or pull | No per-message scheduling; ordering only per key; delivery is at least once unless you enable exactly-once on a pull subscription |
| Cloud Run jobs / Workflows / Temporal | Managed or self-hosted | Long, multi-step orchestration with state (see [State machines](#/state-machines)) | A different abstraction from a queue |

```python norun
# Celery: retry transient errors with exponential backoff and jitter, ack only after the task finishes.
from celery import Celery

app = Celery("agents", broker="redis://localhost:6379/0")


class TransientError(Exception):
    pass


@app.task(
    bind=True,
    autoretry_for=(TransientError,),
    retry_backoff=True,
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=5,
    acks_late=True,
)
def call_tool(self, run_id: str, step_id: str) -> None:
    ...
```

```ts norun
// BullMQ: a stable jobId dedupes enqueues (while that job is still kept in Redis), and the worker caps
// concurrency and rate. Custom job ids must not contain ':'.
import { Queue, Worker } from 'bullmq';

const connection = { host: 'localhost', port: 6379 };
const queue = new Queue('tool-calls', { connection });
await queue.add('call', { runId, stepId }, { jobId: `${runId}-${stepId}`, attempts: 5, backoff: { type: 'exponential', delay: 1000 } });

new Worker('tool-calls', async (job) => callTool(job.data), { connection, concurrency: 10, limiter: { max: 5, duration: 1000 } });
```

## Long-running agent jobs, progress and cancellation

- **Progress:** the worker publishes progress events (step started, tool called, tokens generated, waiting for approval) to a channel keyed by run id: Redis pub/sub, a Pub/Sub topic, or rows in an events table. The API's SSE or WebSocket endpoint subscribes and forwards them to the browser. Persist the events too, with increasing ids, so a reconnecting browser can resume from `Last-Event-ID` (see [Server-Sent Events](#/sse) and [Real-time dashboards](#/realtime-dashboards)).
- **Checkpoints:** save the run's state after each step, so a redelivered job resumes from the last completed step instead of starting over and repeating side effects.
- **Cancellation is cooperative:** the API sets `cancel_requested` on the run, and the worker checks it between steps and aborts in-flight HTTP calls (an `AbortSignal` in Node, task cancellation in asyncio). You cannot kill a queued message from outside; the worker has to notice.
- **Graceful shutdown:** on `SIGTERM`, stop taking new jobs, finish or release the current one within the grace period, and exit. Cloud Run gives a container 10 seconds after `SIGTERM` before `SIGKILL`; GKE's default grace period is 30 seconds. So long jobs must checkpoint and be safe to redeliver.
- **Beyond request timeouts:** a Cloud Run service request (and so a Cloud Tasks or Pub/Sub push delivery) has a time limit; for long work use a pull worker that renews leases (Cloud Run **worker pools**, generally available since April 2026, are built for exactly this: always-on instances with no URL that pull work), a Cloud Run job, or a workflow engine.

## Interview questions

### Why would you put a queue between the API and the agent workers? {core}

Because agent runs are long and unreliable, and HTTP requests are neither. The API validates the request, saves the run, enqueues it and returns `202 Accepted` with a run id straight away. Workers pick it up, and the browser follows progress over SSE or a WebSocket. The queue absorbs bursts so the LLM and enterprise APIs see a steady rate, it redelivers work when a worker crashes, and it lets the API tier and the worker tier scale independently.

The trade-offs to name: eventual consistency (the UI shows queued and running states), duplicate deliveries to design for, and more infrastructure to run and monitor. **Your angle:** on the Document AI platform at Quantiphi, documents went through extraction, validation and human review before submission to external APIs. That is a pipeline with steps that take very different amounts of time, which is exactly where queues help.

### What is the difference between at-most-once, at-least-once and exactly-once delivery? {core}

At-most-once means you acknowledge before processing: nothing is ever processed twice, but a crash loses the message. At-least-once means you acknowledge after processing: nothing is lost, but a crash after the work and before the ack causes a redelivery, so you get duplicates. Exactly-once is what everyone wants, and in a distributed system you get it as at-least-once delivery plus an idempotent consumer.

Follow-up: "Pub/Sub has exactly-once delivery." It does, for pull subscriptions within a region, and it means Pub/Sub will not redeliver a message you successfully acked. It cannot make the side effects of your handler in another system happen once, so you still need idempotency keys for those calls.

### How do you make a consumer idempotent? {core}

First, I prefer operations that are naturally idempotent: setting a status rather than incrementing a counter. Then I record the message id in a dedupe table with a unique constraint **in the same transaction** as the database change, so a duplicate fails the insert and skips the work, and a crash rolls both back. For effects in other systems I pass a stable idempotency key, such as `run_id:step_id`, to the downstream API, so it can reject the repeat.

The key must be derived from the business operation, not generated per attempt, otherwise every retry looks new. Where a downstream system has no idempotency support, I look up by an external reference before creating, under a lock, and accept that this is weaker.

### How do you design retries? {core}

Retry only transient failures (timeouts, 429, 502, 503, 504), never permanent ones such as a 400 or a validation error. Use exponential backoff with jitter so failed workers do not all retry at the same moment, honour `Retry-After`, and cap both the attempts and the total time. After that, the message goes to a dead-letter queue with the error attached.

Two senior points. Retry at **one layer** only: if the client, the gateway and the worker all retry three times, one failure becomes 27 calls. And only retry operations that are safe to repeat; a non-idempotent call that timed out may have succeeded.

### What is a dead-letter queue and how do you handle poison messages? {core}

A poison message is one that fails every time, for example malformed input or a bug triggered by one payload. Without a limit it is redelivered forever, wastes workers and can block an ordered queue. A dead-letter queue is where messages go after N failed attempts: Pub/Sub dead-letter topics take a maximum delivery attempts value between 5 and 100.

Handling it: alert on DLQ depth, store the error and attempt count with the message, give engineers a way to inspect and fix it, then **redrive** (replay) the messages once the bug is fixed. That only works because consumers are idempotent.

### What is a visibility timeout or ack deadline, and what happens when a job runs longer than it? {core}

It is the lease a worker gets on a message: while the lease is active no other worker sees the message, and if the worker does not ack before it expires, the broker assumes it died and redelivers. If a healthy job runs longer than the lease, the broker hands it to a second worker, so two workers do the same job at once.

Fixes: set the lease longer than the normal job time, extend it with heartbeats while working (Pub/Sub's client libraries extend ack deadlines automatically while you hold the message; Celery on Redis has a visibility timeout of one hour by default that must exceed your longest task), split long jobs into steps with checkpoints, and still make the work idempotent for the case where a heartbeat is missed.

### How would you guarantee ordering? {deep}

First I would ask what really needs ordering. It is almost always per entity: the events of one run, one ticket, one purchase order. So I use per-key ordering: Pub/Sub ordering keys, Kafka partitions keyed by run id, or routing all messages for a key to one worker at a time. Different keys still run in parallel.

I also put a sequence number in each event so consumers can detect gaps or reordering, buffer briefly, or resync from the source of truth. The browser side of a stream needs exactly the same idea. Note the cost: with ordering, one stuck message blocks everything behind it with the same key, so ordered queues need a dead-letter policy too.

### What is the dual-write problem, and how does the outbox pattern solve it? {core}

Dual write is writing to two systems without a shared transaction, for example saving a run to Postgres and then publishing an event. A crash between the two leaves them inconsistent: a run no worker hears about, or an event for a run that does not exist.

The outbox pattern writes the business row and an outbox row in the **same** database transaction. A relay process reads unpublished outbox rows, publishes them and marks them published. If it crashes after publishing and before marking, it publishes again, so consumers dedupe on the event id. Change data capture from the database log (Debezium, Datastream) is an alternative to polling the outbox table.

### Can you use PostgreSQL as a job queue? {core}

Yes, up to a moderate volume, and it is often the simplest correct choice: jobs are created in the same transaction as the data, so there is no dual write, and there is no extra infrastructure. Workers claim jobs with `SELECT … FOR UPDATE SKIP LOCKED LIMIT 1`, which locks one available row and skips rows other workers hold, so they never block each other or take the same job.

Around it you add a `locked_until` lease and a reaper for crashed workers, a `run_at` column for delayed retries, an attempts counter and a dead status, a partial index on queued jobs, and `LISTEN`/`NOTIFY` to wake workers. Every update a worker makes after claiming also checks the attempt number it claimed, as a fencing token, so a worker that was presumed dead cannot overwrite a newer claim. I would move to Pub/Sub or a dedicated broker for very high throughput or for fan-out to many independent consumers.

### How do you stop many workers from exceeding an external API's rate limit?

The limit is global, so the limiter must be shared. The simplest option on GCP is to route those calls through a Cloud Tasks queue with a maximum dispatch rate and concurrency, so the queue paces them. In code, a token bucket in Redis shared by all instances works, with an atomic Lua script or a sorted-set sliding window.

Plus: honour `429` and `Retry-After`, back off with jitter, open a circuit breaker when the API is down so workers stop hammering it, and give different tenants separate budgets so one tenant cannot use up everyone's quota.

### When would you use Cloud Tasks and when Pub/Sub? {core}

Cloud Tasks is for **explicit** work: "call this handler with this payload", one target per task, with per-queue rate limits and concurrency, scheduled delivery at a set time, and deduplication by task name. That fits calling a rate-limited enterprise API or a step handler on Cloud Run.

Pub/Sub is for **events**: "this happened", published once and delivered to any number of independent subscribers, at high throughput, push or pull, with ordering keys, dead-letter topics and filtering. It fits "run.completed" going to the dashboard, the audit log and the billing service. Many systems use both.

### How would you choose between Celery, RQ, Arq and BullMQ?

By language and execution model first. In a Node/TypeScript service, BullMQ on Redis is the standard: retries with backoff, delayed jobs, rate limiting, parent-child flows. In Python, Celery is the mature, feature-rich option, but you need to configure late acks and visibility timeouts carefully. Arq is a good fit when the code is already asyncio, as in FastAPI. RQ is the simplest for synchronous jobs.

On GCP I would also ask whether a managed service removes the need: Cloud Tasks or Pub/Sub plus Cloud Run means no Redis broker or worker fleet to run.

### How do you show a job's progress in the UI in real time? {core}

The worker emits progress events at each meaningful step (step started, tool called, waiting for approval, done) to a channel keyed by run id, and also appends them to an events table with increasing ids. The API exposes an SSE endpoint per run that subscribes to the channel and streams events to the browser. On reconnect, the browser sends `Last-Event-ID` and the endpoint replays what it missed from the table before going live.

The channel can be Redis pub/sub (low latency, not durable, which is why the table exists) or Pub/Sub. On the client, TanStack Query's cache can be updated from those events so lists and detail views stay in sync.

### How do you cancel a job that is already running?

Cancellation is cooperative. The API marks the run `cancel_requested`. The worker checks that flag between steps, and in-flight calls take an abort signal (an `AbortSignal` in Node, task cancellation in asyncio) so a long LLM or HTTP call stops promptly. The worker then runs any compensation needed and moves the run to `cancelled`.

A message still waiting in the queue is handled the same way: the worker reads the run's state first and drops it if the run is already cancelled. You cannot reliably delete an in-flight message from outside.

### What happens if producers outpace consumers?

The backlog grows, and so does latency. First, measure it: queue depth and the **age of the oldest unacked message** (Pub/Sub exposes `subscription/oldest_unacked_message_age`), which shows directly how stale the work is. Then scale workers on that signal, but only up to what the downstream APIs can take.

If you still cannot keep up, apply backpressure at the edge: reject or defer new runs with a clear `429` or "queued, starting soon" state, prioritise interactive work over batch work, and shed or batch low-value work. An unbounded queue just hides an overload until it becomes an outage.

### How would you run an agent job that takes longer than a Cloud Run request timeout? {deep}

I would not tie the job to a request. Options: a pull worker that leases messages and renews the lease while it works, on a Cloud Run worker pool (made for pull-based workloads) or on GKE; a Cloud Run job for batch-like work; or a workflow engine (Cloud Workflows or Temporal) that drives the run as steps, each one a short call.

In all cases the job is split into steps with checkpoints, so a restart resumes from the last completed step. And the job is safe to redeliver, because on Cloud Run a container gets only 10 seconds after `SIGTERM` to clean up.

### How do you keep one noisy tenant from starving everyone else? {deep}

Do not put everyone in one FIFO queue. Options: per-tenant queues or partitions served round-robin; a fair scheduler that picks the tenant with the least recent usage; per-tenant concurrency and rate limits; and a priority lane for interactive runs over batch runs.

Then make it visible: per-tenant queue depth and wait time on the dashboard, and alerts when one tenant's backlog dominates. In a Postgres queue you can do this with a `tenant_id` column and a claim query that limits running jobs per tenant.

### What do you monitor on a queue?

Depth (backlog size), the age of the oldest message, throughput in and out, processing time per job (p50, p95, p99), retry rate, error rate by type, DLQ depth and inflow, and worker utilisation. Alert on the age of the oldest message and on DLQ inflow rather than on depth alone, because a deep but fast queue is fine, and an old message is a stuck one.

Add tracing: carry the trace context through the message (as an attribute), so one trace shows the API request, the enqueue, the wait in the queue and the worker's processing.

### How do you run delayed or scheduled jobs?

For a one-off delay (retry in 30 seconds, remind the approver tomorrow): Cloud Tasks takes a schedule time, BullMQ has delayed jobs, and a Postgres queue uses a `run_at` column. Pub/Sub has no per-message delay, so you would combine it with one of those.

For recurring jobs, use Cloud Scheduler (cron) to call an endpoint or publish a message, and make the job idempotent per period ("the 2026-10-15 nightly summary"), because schedulers can fire twice.

### How do workers shut down gracefully? {deep}

On `SIGTERM`: stop accepting new messages, let the current job finish if it can within the grace period, otherwise checkpoint and release it (nack, or let the lease expire) so another worker picks it up, flush logs and metrics, then exit. Cloud Run allows 10 seconds after `SIGTERM`, and Kubernetes pods get `terminationGracePeriodSeconds` (30 by default), so the grace period sets the maximum work you should do in one uninterruptible step.

The test is to kill a worker mid-job in staging and check that the job completes exactly once, from the user's point of view.

### Why not just use FastAPI's BackgroundTasks?

`BackgroundTasks` runs a function in the same process after the response is sent. It is fine for small best-effort work such as sending an email. But nothing persists it: if the instance restarts, scales in or crashes, the work is gone, and there is no retry, no dead-letter queue and no visibility.

On Cloud Run with request-based billing, CPU is only allocated while requests are being handled, so work after the response may barely run. For agent runs and enterprise API calls, which must survive failures, use a real queue.

## Coding problems

### Deduplicate messages with a bounded memory {medium core}

At-least-once delivery means a worker sometimes sees the same message id twice within a short window. Write a `Deduplicator` that returns `True` the first time it sees an id and `False` for a repeat within `ttl` seconds. It must use bounded memory: never store more than `max_ids` ids (drop the oldest), and forget ids older than `ttl`. Take the clock as a parameter so it can be tested.

```text
d = Deduplicator(ttl=60, max_ids=1000, clock=fake_clock)
d.first_time("m1") → True
d.first_time("m1") → False     (same message, 5 s later)
d.first_time("m1") → True      (61 s later: forgotten)
```

#### Hints

1. You need fast lookup by id and fast removal of the oldest entry. One structure does both in Python.
2. An `OrderedDict` keeps insertion order. If you never update an existing entry, insertion order is time order.
3. On each call, pop entries from the front while they are older than `ttl`, then check membership, then insert and trim to `max_ids`.

#### Solution

A plain set grows forever, and scanning a list for old entries is O(n) per call. An `OrderedDict` from id to first-seen time gives O(1) membership checks and O(1) removal of the oldest entry. Because a duplicate does not refresh its timestamp, the dict stays sorted by time, so expiry only needs to look at the front.

```python
from collections import OrderedDict
from collections.abc import Callable


class Deduplicator:
    """Remembers message ids for ttl seconds, holding at most max_ids of them."""

    def __init__(self, ttl: float, max_ids: int, clock: Callable[[], float]):
        self.ttl = ttl
        self.max_ids = max_ids
        self.clock = clock
        self.seen: OrderedDict[str, float] = OrderedDict()

    def first_time(self, message_id: str) -> bool:
        now = self.clock()
        while self.seen and next(iter(self.seen.values())) <= now - self.ttl:
            self.seen.popitem(last=False)  # the oldest entry has expired
        if message_id in self.seen:
            return False
        self.seen[message_id] = now
        if len(self.seen) > self.max_ids:
            self.seen.popitem(last=False)
        return True


t = 0.0
d = Deduplicator(ttl=60, max_ids=3, clock=lambda: t)
assert d.first_time("m1") is True
t = 5
assert d.first_time("m1") is False
t = 61
assert d.first_time("m1") is True  # expired, so it counts as new
assert list(d.seen) == ["m1"]

for i in range(2, 6):  # m2..m5: the oldest ids are evicted to stay within max_ids
    assert d.first_time(f"m{i}") is True
assert list(d.seen) == ["m3", "m4", "m5"]
assert d.first_time("m1") is True  # evicted earlier, so it is accepted again
```

Complexity: amortised O(1) per call (each id is inserted and removed once), O(max_ids) memory.

#### Follow-ups

- **What if there are 20 worker instances?** Process memory is per instance. Use Redis `SET key 1 NX EX 60` (set only if absent, with a TTL) as the shared dedupe check, or a unique constraint in the database inside the work's transaction.
- **What is the weakness of a time window?** A redelivery after the window is processed again. For effects that must never repeat, use a durable dedupe record or an idempotency key on the downstream call.

### Keep per-key order while processing keys in parallel {medium}

You receive a batch of `(run_id, event)` messages. Events for the same run must be handled one at a time, in the order received; different runs should be handled in parallel, with at most `max_parallel` runs active at once. Write `process_ordered(messages, handler, max_parallel)` with asyncio.

```text
[("r1", "a"), ("r2", "x"), ("r1", "b"), ("r2", "y"), ("r1", "c")]
→ r1 handles a, b, c in that order; r2 handles x, y in that order; r1 and r2 overlap in time
```

#### Hints

1. Group the messages by key first, keeping each key's events in their original order.
2. Each key gets one coroutine that handles its events sequentially. That alone preserves order within a key.
3. Run those coroutines concurrently in a `TaskGroup`, and wrap each one in a shared `asyncio.Semaphore` to cap how many run at once.

#### Solution

Handling everything sequentially is correct but slow. Handling everything concurrently is fast but breaks ordering. The middle ground is one sequential "lane" per key, with lanes running in parallel up to a limit.

```python
import asyncio
from collections import defaultdict


async def process_ordered(messages, handler, max_parallel: int = 4) -> None:
    lanes: dict[str, list] = defaultdict(list)
    for key, event in messages:
        lanes[key].append(event)
    limit = asyncio.Semaphore(max_parallel)

    async def drain(key: str, events: list) -> None:
        async with limit:
            for event in events:  # one at a time, in arrival order
                await handler(key, event)

    async with asyncio.TaskGroup() as tg:
        for key, events in lanes.items():
            tg.create_task(drain(key, events))


handled: list[tuple[str, str]] = []
active = 0
peak = 0


async def handler(key: str, event: str) -> None:
    global active, peak
    active += 1
    peak = max(peak, active)
    await asyncio.sleep(0.002 if key == "r1" else 0.001)
    handled.append((key, event))
    active -= 1


msgs = [("r1", "a"), ("r2", "x"), ("r1", "b"), ("r2", "y"), ("r1", "c"), ("r3", "p")]
asyncio.run(process_ordered(msgs, handler, max_parallel=2))
assert [e for k, e in handled if k == "r1"] == ["a", "b", "c"]
assert [e for k, e in handled if k == "r2"] == ["x", "y"]
assert sorted(handled) == sorted(msgs)
assert peak == 2  # parallel across keys, but never more than max_parallel
```

Complexity: O(n) to group; total time is roughly the longest lane when there is enough parallelism.

#### Follow-ups

- **What if messages arrive as a stream, not a batch?** Keep a dict of per-key `asyncio.Queue`s, start a lane task when a key first appears, and let it exit after it has been idle for a while.
- **What if one key's handler keeps failing?** It blocks only its own lane. After a retry limit, dead-letter that event and decide whether the rest of the lane may continue or must wait for a fix.

### Decide whether and when to retry a failed call {easy core}

Write `nextRetry` for a client calling an enterprise API. Given the attempt number, the HTTP status, an optional `Retry-After` header (seconds or an HTTP date), the current time and a deadline, return `{ retry: false }` or `{ retry: true, delayMs }`. Retry only 408, 429, 500, 502, 503 and 504; use full-jitter exponential backoff (base 500 ms, cap 30 s); never wait less than `Retry-After` says; never retry past the deadline.

#### Hints

1. Decide retryability from the status first. Everything else only matters if it is retryable.
2. `Retry-After` is either a number of seconds or a date: try `Number()`, then `Date.parse()`.
3. Take the larger of the backoff delay and the header's delay, then check it against the deadline.

#### Solution

Make the decision a pure function of its inputs, including the random source, so it is easy to test. Waiting less than the server asked guarantees another 429, and retrying past the deadline wastes work the caller has already given up on.

```ts
import assert from 'node:assert/strict';

type RetryDecision = { retry: false } | { retry: true; delayMs: number };

const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

function nextRetry(opts: {
  attempt: number; // 0 for the first retry
  status: number;
  retryAfter?: string;
  now: number;
  deadline: number;
  baseMs?: number;
  capMs?: number;
  random?: () => number;
}): RetryDecision {
  const { attempt, status, retryAfter, now, deadline, baseMs = 500, capMs = 30_000, random = Math.random } = opts;
  if (!RETRYABLE.has(status)) return { retry: false };

  let delayMs = random() * Math.min(capMs, baseMs * 2 ** attempt);
  if (retryAfter) {
    const seconds = Number(retryAfter);
    const headerMs = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
    if (Number.isFinite(headerMs)) delayMs = Math.max(delayMs, headerMs);
  }
  if (now + delayMs > deadline) return { retry: false };
  return { retry: true, delayMs };
}

const now = Date.parse('2026-10-15T07:28:00Z');
const base = { now, deadline: now + 60_000, random: () => 0.5 };

assert.deepEqual(nextRetry({ ...base, attempt: 0, status: 400 }), { retry: false });
assert.deepEqual(nextRetry({ ...base, attempt: 2, status: 503 }), { retry: true, delayMs: 1000 }); // 0.5 × 2000
assert.deepEqual(nextRetry({ ...base, attempt: 0, status: 429, retryAfter: '7' }), { retry: true, delayMs: 7000 });
assert.deepEqual(
  nextRetry({ ...base, attempt: 0, status: 503, retryAfter: 'Thu, 15 Oct 2026 07:28:20 GMT' }),
  { retry: true, delayMs: 20_000 },
);
assert.deepEqual(nextRetry({ ...base, attempt: 0, status: 429, retryAfter: '120' }), { retry: false }); // past the deadline
assert.deepEqual(nextRetry({ ...base, attempt: 10, status: 502 }), { retry: true, delayMs: 15_000 }); // capped at 30 s × 0.5
```

Complexity: O(1).

#### Follow-ups

- **Should a POST that timed out be retried?** Only if it carries an idempotency key the server honours. A timeout is ambiguous: the server may have done the work. A 429 or 503 usually means it did not.
- **Where should this live?** In one shared client wrapper (with the circuit breaker and metrics), so retry policy is not reimplemented in every call site.
