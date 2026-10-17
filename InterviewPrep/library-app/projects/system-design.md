---
title: "SeatLock: a ticket-booking system design with a load-tested prototype"
summary: A written system design (requirements, estimates, API, data model, architecture, trade-offs and decision records) for selling seats to popular events, plus a FastAPI, PostgreSQL and Redis prototype that a 2,000-user load test proves never double-books a seat.
time: 4–5 days of evenings
---

## What you will build

Design interviews ask you to talk; this project lets you show. The repository has two halves.

**The design** (`design/`): a design document for a Ticketmaster-style booking service where thousands of people try to buy the same seats when sales open. It covers functional and non-functional requirements, capacity estimates, the API, the data model, a diagram, deep dives (seat holds, payments, hot events, caching, failure handling), trade-offs, and short Architecture Decision Records (ADRs) for the big choices.

**The prototype** (`app/`): a FastAPI service with PostgreSQL and Redis that implements the critical path:

- list events and available seats (cached);
- **hold** seats for 5 minutes without ever giving the same seat to two people;
- **confirm** a booking through a fake payment provider with an **idempotency key**, so a retried request never charges or books twice;
- release expired holds with a background sweeper;
- a **virtual waiting room** in Redis that admits buyers for a hot event at a controlled rate;
- an **outbox** table for confirmation emails, so a booking and its email can't get out of step.

A **k6 load test** sends 2,000 virtual users at 500 seats and a check script proves there are zero double bookings, alongside throughput and latency numbers.

## What it proves

- The system design method: requirements → estimates → API → data model → architecture → deep dives → trade-offs
- Concurrency control in a relational database: conditional updates, row locks, `FOR UPDATE SKIP LOCKED`, constraints as the last line of defence
- Idempotency, holds with expiry, the outbox pattern, backpressure with a waiting room, caching
- Writing decisions down: design docs and ADRs, the way senior engineers communicate
- Measuring a design: load tests and failure injection
- Keywords: system design, distributed systems, scalability, concurrency, PostgreSQL, Redis, FastAPI, idempotency, load testing, architecture decision records

## Architecture

```text
 buyers ──► CDN / edge ──► waiting room (Redis: admission tokens per event) ──► API (FastAPI, stateless, N pods)
                                                                                 │
                    ┌──────────────── read path ─────────────┐                  │ write path
                    ▼                                         │                  ▼
         Redis cache: event + seat map (short TTL)            │      PostgreSQL (source of truth)
                                                              │        seats(status, hold_expires_at, version)
                                                              │        holds, bookings(idempotency_key UNIQUE)
                                                              │        outbox(event, payload, sent_at)
                                                              │                  │
                                         hold sweeper (every 10 s) ─────────────┤
                                         outbox relay ──► email provider (fake) ◄┘
                                         payment provider (fake, configurable latency and failures)
```

## Milestones

### Milestone 1: write the design first

In `design/design.md`, write requirements (functional: browse, hold, pay, confirm; non-functional: no double booking, sales-open spikes, 99.9% availability for browsing), back-of-the-envelope estimates (peak requests per second when a big event opens, storage per event), the API, the data model and a diagram (Mermaid or Excalidraw). Write three ADRs: where seat state lives, how holds expire, how hot events are throttled.

**Done when:** someone else could build the prototype from the document, and each ADR states the options, the decision and its consequences.

### Milestone 2: holds that never collide

Implement `POST /events/{id}/holds` with a single conditional update, so the database decides atomically who wins:

```sql
UPDATE seats SET status = 'held', hold_id = $1, hold_expires_at = now() + interval '5 minutes'
WHERE event_id = $2 AND seat_id = ANY($3) AND status = 'available'
RETURNING seat_id;
```

If fewer rows come back than requested, roll back the transaction. Add a "best available" variant that picks seats with `FOR UPDATE SKIP LOCKED` so concurrent buyers take different seats instead of waiting on each other.

**Done when:** a test fires 100 concurrent holds at one seat and exactly one succeeds; a "best available" test gives 50 concurrent buyers 50 different seats.

### Milestone 3: expiry and idempotent confirmation

Add the sweeper that returns expired holds to `available`. Implement `POST /holds/{id}/confirm` with an `Idempotency-Key` header: store the key with a unique constraint and the response, call the fake payment provider, mark seats `booked` and insert an outbox row in the same transaction. A repeated request with the same key returns the stored response.

**Done when:** double-submitting a confirmation gives one booking and one charge, an expired hold cannot be confirmed, and a payment timeout leaves the hold to expire cleanly.

### Milestone 4: the waiting room and caching

For events flagged as hot, buyers get a queue position and are admitted at a configured rate (a token bucket in Redis); only admitted buyers may hold seats. Cache the event page and seat map for a few seconds, and explain why a slightly stale seat map is acceptable when the hold itself is checked in the database.

**Done when:** the load test shows admissions at the configured rate and the database stays below its connection limit while 2,000 users wait.

### Milestone 5: load test and failure injection

Write the k6 scenario (2,000 virtual users, 500 seats, holds then confirms with random retries) and a `check_invariants.py` that asserts every seat has at most one booking and every booking has exactly one charge. Inject failures: kill the API mid-confirm, make payments slow or fail, restart Redis.

**Done when:** the invariants hold in every run, and the README has a results table (throughput, p95 for hold and confirm, double bookings: 0) and a failure table describing what happened in each case.

### Milestone 6: write-up

Finish the design document with what you learned from the numbers, and a "what changes at 100×" section (sharding seats by event, a separate inventory service, multiple regions).

**Done when:** the README reads as a case study: problem, design, evidence, trade-offs.

## Repository layout

```text
seatlock/
├── design/
│   ├── design.md
│   ├── diagrams/
│   └── adr/{0001-seat-state-in-postgres,0002-hold-expiry,0003-waiting-room}.md
├── app/
│   ├── main.py  holds.py  bookings.py  waiting_room.py  outbox.py  sweeper.py
│   └── migrations/
├── fakes/{payments,email}.py
├── loadtest/{booking.js,check_invariants.py}
├── tests/
├── docker-compose.yml
└── README.md
```

## Tests and CI

- **Unit tests:** idempotency handling, waiting-room admission math, sweeper selection.
- **Concurrency tests** against real PostgreSQL: the 100-holds-one-seat test, best-available with `SKIP LOCKED`, double confirmation.
- **GitHub Actions:** PostgreSQL and Redis service containers, migrations, `pytest`, then a short k6 smoke run with the invariant check on every pull request.

## README checklist

- Build badge
- One-paragraph problem statement and the key requirement: never double-book
- The architecture diagram and links to the design doc and ADRs
- The results table and failure table, with how to reproduce them
- Trade-offs you made and the ones you rejected (Redis as the seat store, distributed locks, optimistic vs pessimistic locking)
- "What changes at 100×"

**Local development on this Mac:** Docker Hub pulls currently fail here, so use the local PostgreSQL (version 14 works for everything above), Redis from Homebrew (`brew install redis`) and k6 from Homebrew (`brew install k6`). Readers of the repo can use `docker compose up`.

## Stretch goals

- Optimistic locking with a `version` column, and a comparison of throughput against the conditional update
- Partition seats by event and route hot events to their own database
- Replace the fake payment provider with Stripe's test mode
- A seat-map UI in React that updates live as seats are held

## Talking about it in an interview

**60-second walkthrough:** "SeatLock is a ticket-booking design plus a prototype. The key requirement is never selling a seat twice under a sales-open spike. Seat state lives in PostgreSQL and a hold is one conditional update, `WHERE status = 'available'`, so the database picks exactly one winner without a distributed lock; 'best available' uses SKIP LOCKED so buyers don't queue behind each other. Holds expire after five minutes, confirmation is idempotent with a stored key, and the email goes through an outbox in the same transaction. For hot events, a Redis waiting room admits buyers at a rate the database can handle. A 2,000-user load test against 500 seats showed zero double bookings, and I documented each decision in an ADR."

**Likely follow-ups:**

- *Why not keep seat state in Redis for speed?* Redis would be fast, but the booking must be durable and consistent with payments; making Redis the source of truth adds failover and persistence risks. I use Redis where losing data is acceptable (cache, waiting room) and the database where it isn't.
- *How would you scale beyond one PostgreSQL?* Seat contention is per event, so I'd shard seats by event ID, and isolate the very hottest events on their own shard. Reads scale with caching and replicas.
- *What if payment succeeds but your service crashes before recording it?* The idempotency key lets the client retry safely, and I'd reconcile with the provider's records (webhooks or a periodic job) so a paid booking is never lost.

## LinkedIn post template

> I built SeatLock to practise system design with evidence: a written design (requirements, estimates, API, data model, ADRs) for a ticket-booking service, plus a FastAPI + PostgreSQL + Redis prototype.
> The goal was "never double-book under a spike": a 2,000-user load test against 500 seats recorded zero double bookings, using conditional updates, SKIP LOCKED, idempotency keys and a waiting room.
> Design doc, code and results: <repo link> #SystemDesign #PostgreSQL #DistributedSystems #Python

## Resume bullet

Designed and prototyped SeatLock, an open-source ticket-booking system (FastAPI, PostgreSQL, Redis) with conditional-update seat holds, idempotent payments, an outbox and a waiting room, validated by a 2,000-user load test with zero double bookings. *(Use only after it is built, public and the result is your own.)*
