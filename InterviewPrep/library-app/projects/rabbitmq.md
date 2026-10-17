---
title: "Courier: a reliable multi-channel notification service on RabbitMQ"
summary: A Python notification service on RabbitMQ 4 that routes email, SMS and push messages by channel and priority, confirms every publish, retries failures with tiered delays, parks poison messages, never sends a duplicate, and proves it with a chaos test.
time: 3–4 days of evenings
---

## What you will build

Courier accepts notification requests over HTTP (`POST /notifications` with channel, recipient, template and priority) and delivers them through fake email, SMS and push providers that you can make slow or flaky on purpose. Behind the API:

- a **topic exchange** routes `email.high`, `sms.normal`, … to **quorum queues** per channel and priority, with an **alternate exchange** catching anything unroutable;
- the API waits for **publisher confirms**, so a `202 Accepted` means the broker has the message;
- channel workers use **manual acknowledgements** and a tuned **prefetch**;
- failures go through **tiered retry queues** (5 s, 30 s, 5 min) built from dead-letter exchanges and TTLs, and after the last attempt land in a **parking-lot** queue with the reason, from where you can replay them;
- a notifications table makes delivery **idempotent**: a redelivered message is never sent twice;
- a small **dashboard** reads queue depths and rates from the management API, and a **chaos script** kills workers mid-delivery to show nothing is lost.

This builds on, but does not repeat, the portfolio's ShopFlow project (Node.js and amqplib: exchanges, work queues and a dead-letter queue). Courier is in Python and adds publisher confirms, alternate exchanges, priority routing, tiered delayed retries, idempotency, observability and failure testing.

## What it proves

- AMQP 0-9-1 modelling: exchanges, bindings, routing keys, queue types (quorum queues by default)
- Reliability end to end: publisher confirms, durable messages, manual acks, prefetch, redelivery
- Retry design with dead-letter exchanges and TTLs; poison-message handling; replay
- Idempotent consumers and exactly-once effects on top of at-least-once delivery
- Operating RabbitMQ: management API, Prometheus metrics, failure testing
- Async Python with FastAPI and aio-pika
- Keywords: RabbitMQ, AMQP, message queues, event-driven architecture, microservices, Python, FastAPI, aio-pika, reliability, observability

## Architecture

```text
 client ──POST /notifications──► API (FastAPI) ── publish + confirm ──► exchange "notify" (topic)
                                     │                                     │  alternate-exchange → "unrouted" queue
                                     │  INSERT status=queued               ├── email.high   ─► q.email.high   ┐
                                     ▼                                     ├── email.normal ─► q.email.normal │  quorum queues
                               PostgreSQL (notifications)                  ├── sms.*        ─► q.sms.*        │  (rejects dead-letter → q.parking)
                                     ▲                                     └── push.*       ─► q.push.*       ┘
                                     │ UPDATE status (idempotent)                │
                               channel workers (aio-pika, manual ack, prefetch) ◄┘
                                     │ provider error: republish (confirmed) with attempt+1, then ack the original
                                     ▼
            exchange "retry" (headers: x-retry-tier) ─► retry.5s / retry.30s / retry.5m
                     (TTL, dead-letter to "notify" keeping the ORIGINAL routing key → back to its queue)
                                     └─ after 4 attempts ─► q.parking  (reason in headers; replay endpoint)
```

## Milestones

### Milestone 1: topology as code and confirmed publishing

On start-up, declare every exchange, queue and binding idempotently (`x-queue-type: quorum`, dead-letter arguments, the alternate exchange). The API inserts a `queued` row, publishes with `delivery_mode=persistent` and `mandatory=True`, and awaits the publisher confirm before returning `202`.

**Done when:** the management UI shows the topology after one start-up, a publish with an unknown channel ends up in the `unrouted` queue, and a test proves the API only answers after the confirm.

### Milestone 2: workers, acks and prefetch

Write one worker per channel with manual acks: ack after the provider call succeeds. A message the worker cannot even parse is rejected without requeue and dead-letters straight to the parking lot. Make the fake providers' latency and failure rate configurable. Measure throughput with `prefetch_count` 1, 10 and 50.

**Done when:** you can show throughput for each prefetch value and explain the trade-off (throughput vs fairness and memory) in the README.

### Milestone 3: tiered retries and the parking lot

On a provider error, the worker republishes the message to a `retry` **headers** exchange with its **original** routing key, an `x-attempt` header incremented by one, and an `x-retry-tier` header (`5s`, `30s`, `5m`) chosen from the attempt count; it waits for the confirm, then acks the original. Each retry queue binds to `retry` on its tier, has `x-message-ttl`, and dead-letters to `notify` without overriding the routing key, so an expired message routes back to the queue it came from. After the fourth failure, publish to `q.parking` with the error instead. Add `POST /admin/parking/replay`.

**Done when:** a provider that fails three times delivers on the fourth try, one that always fails ends in the parking lot with its reason, and replay sends it again.

### Milestone 4: idempotency and status

Before calling a provider, claim the notification with `UPDATE … SET status='sending' WHERE id=$1 AND status IN ('queued','retrying')`; skip it if no row changed. Mark `sent` after success. Add `GET /notifications/{id}` for status and attempt history.

**Done when:** publishing the same message twice, or redelivering it after a crash, results in exactly one "sent" call to the provider (assert on the fake provider's log).

### Milestone 5: observability and chaos

Enable the `rabbitmq_prometheus` plugin, expose your own metrics (sent, failed, retried, parked, latency), and build a small dashboard page from the management HTTP API (queue depth, publish and ack rates, unacked counts). Write `chaos.py` that sends 5,000 notifications while killing and restarting workers at random.

**Done when:** after the chaos run, every notification is either `sent` or in the parking lot, none was sent twice, and the README shows the counts.

### Milestone 6: write-up

Document the topology, the failure-mode table (broker restart, worker crash, provider outage, poison message, unroutable message) and what happens in each, and the measured numbers.

**Done when:** a reader can run it, break it on purpose and see the behaviour you describe.

## Repository layout

```text
courier/
├── api/main.py              # FastAPI, confirmed publishing
├── courier/
│   ├── topology.py          # exchanges, queues, bindings (idempotent)
│   ├── retry.py             # attempt counting and delay tiers (unit-tested)
│   ├── store.py             # PostgreSQL status, idempotent claims
│   └── providers.py         # fake email/SMS/push with failure injection
├── workers/channel_worker.py
├── tools/{chaos,dashboard}.py
├── tests/
├── docker-compose.yml
├── pyproject.toml
└── README.md
```

## Tests and CI

- **Unit tests:** routing-key building, retry tier selection, idempotent claim logic (against PostgreSQL), provider fakes.
- **Integration tests** against a real broker: confirm before `202`, unroutable to the alternate exchange, the retry-then-succeed path, the parking-lot path, the duplicate-delivery test.
- **GitHub Actions:** `rabbitmq:4-management` and `postgres` service containers, then `ruff`, `mypy`, `pytest`.

## README checklist

- Build badge and versions (RabbitMQ 4.3, Python 3.12+, aio-pika 10)
- Topology diagram and a table of exchanges, queues, arguments and why
- A GIF of the chaos run with the dashboard
- How to run, and the local alternative below
- The failure-mode table and the measured prefetch numbers
- Design decisions: quorum queues, confirms, why TTL retry queues instead of requeueing, idempotency
- What you would do next (streams for an audit log, federation across regions, per-tenant limits)

**Local development on this Mac:** Docker Hub pulls currently fail here, so install the broker with Homebrew (`brew install rabbitmq`, `brew services start rabbitmq`, then `rabbitmq-plugins enable rabbitmq_management rabbitmq_prometheus`) and use the local PostgreSQL. Readers of the repo can use `docker compose up`.

## Stretch goals

- A RabbitMQ **stream** as an append-only audit log of every delivery attempt
- Per-tenant fairness: a queue per tenant with consumer priorities or a token bucket in the worker
- A three-node cluster with quorum queues and a broker-kill test
- The same worker in Node.js with amqplib, to show the protocol is language-neutral

## Talking about it in an interview

**60-second walkthrough:** "Courier is a notification service on RabbitMQ. The API only returns 202 after a publisher confirm, so accepted means persisted. A topic exchange routes by channel and priority to quorum queues, and an alternate exchange catches anything unroutable. Workers ack manually after the provider succeeds. Failures dead-letter into retry queues with 5-second, 30-second and 5-minute TTLs, and after four attempts go to a parking lot I can replay. Because delivery is at-least-once, each send claims its row in PostgreSQL first, so duplicates are skipped. I ran a chaos test killing workers during 5,000 sends: nothing lost, nothing sent twice."

**Likely follow-ups:**

- *Why not just `nack` with requeue on failure?* A requeued message is redelivered almost immediately, so a failing message spins in a hot loop, hammers the provider and burns CPU. TTL retry queues add a growing delay and a bounded number of attempts. (Quorum queues also cap redeliveries with a delivery limit, which is a safety net, not a retry policy.)
- *Why quorum queues?* They replicate with Raft across nodes and are the RabbitMQ default for data you can't lose; classic mirrored queues were removed in RabbitMQ 4.0.
- *RabbitMQ or Kafka for this?* RabbitMQ: per-message routing, retries, priorities and acks are exactly what a work-dispatch system needs, and nobody needs to replay notifications from last week. I'd pick Kafka for high-volume event streams that several consumers read and replay.

## LinkedIn post template

> I built Courier, a notification service on RabbitMQ 4, to practise reliable messaging in Python: publisher confirms, quorum queues, an alternate exchange, tiered retries with dead-letter exchanges, a parking lot, and idempotent workers.
> I then ran a chaos test that kills workers mid-delivery: 5,000 messages, none lost, none sent twice.
> Code and failure-mode write-up: <repo link> #RabbitMQ #Python #Microservices #BackendEngineering

## Resume bullet

Built Courier, an open-source Python notification service on RabbitMQ 4 with publisher confirms, quorum queues, tiered DLX/TTL retries, a replayable parking lot and idempotent consumers, verified by a chaos test with no lost or duplicate deliveries. *(Use only after it is built, public and the chaos result is your own.)*
