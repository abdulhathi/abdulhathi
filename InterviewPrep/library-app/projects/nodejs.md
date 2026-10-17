---
title: "Pulse: a log ingestion and alerting service in Node.js"
summary: A TypeScript Node.js service that streams in large log files and HTTP log batches, aggregates them without running out of memory, and raises alerts, with tests, metrics and graceful shutdown.
time: 4–5 days of evenings
---

## What you will build

Pulse accepts application logs two ways: an HTTP endpoint that takes newline-delimited JSON (NDJSON) batches, and a CLI that imports a log file of any size. It parses each line with a stream pipeline, keeps per-minute counts by service and level, stores them in PostgreSQL, and evaluates simple alert rules ("more than 50 errors a minute for `payments`"). A small REST API serves the aggregates and the alert history. CPU-heavy work (regex rules over large batches) runs in a worker thread pool, so the event loop stays responsive.

It is deliberately the kind of service a Node.js interviewer asks about: streams and backpressure, the event loop, worker threads, Express 5 error handling, graceful shutdown and observability. It is different from the Node.js Lab's tasks API: there is no CRUD, the hard part is throughput and memory.

## What it proves

- Node.js streams, `pipeline`, backpressure and processing data bigger than memory
- The event loop: keeping it free, measuring event-loop delay, offloading CPU work to `worker_threads`
- Express 5 REST API with zod validation and one error handler
- PostgreSQL batching and idempotent writes (upserts)
- Testing with `node:test`, fake timers and a server on port 0
- Production habits: config validation, structured logs, health checks, graceful shutdown on SIGTERM, Docker
- Keywords: Node.js, TypeScript, Express, streams, worker threads, PostgreSQL, REST API, observability, CI/CD

## Architecture

```text
 log files ──► pulse import <file>  ─┐
                                      │  Readable → split lines → parse (Transform) → batch (Transform)
 HTTP POST /v1/logs (NDJSON) ─────────┤                                   │
                                      ▼                                   ▼
                              rules worker pool  ◄──── batches ────  aggregator (per-minute counters)
                              (worker_threads)                            │ flush every 5 s
                                      │ alerts                            ▼
                                      └────────────────────────────► PostgreSQL (counts, alerts)
                                                                          ▲
 GET /v1/stats?service=…&from=…   GET /v1/alerts   GET /healthz  ─────────┘   (Express 5 API)
```

## Milestones

### Milestone 1: project skeleton and configuration

Goal: a TypeScript project that starts, validates its config and shuts down cleanly.

- Node.js 24 LTS (or Node.js 26, which becomes LTS on 28 October 2026), TypeScript, ESM. Run TypeScript with `node --watch src/index.ts` (type stripping) in development, and `tsc` for type-checking in CI.
- Validate environment variables with zod at startup (`DATABASE_URL`, `PORT`, `FLUSH_INTERVAL_MS`); exit with a clear message if invalid.
- Express 5 app with `/healthz`; structured JSON logs (pino) with a request id.
- Graceful shutdown: on SIGTERM stop accepting requests, flush aggregates, close the pool, then exit.

Done when: `npm start` serves `/healthz`; a bad `PORT` exits with a readable error; `kill -TERM` logs "flushed, bye" and exits with code 0.

### Milestone 2: the streaming import

Goal: import a 2 GB log file with flat memory use.

- `pulse import <file>`: `fs.createReadStream` → line splitter → JSON parse Transform (skip and count bad lines) → batcher (500 records or 200 ms) → writer.
- Use `stream/promises` `pipeline` so errors and cancellation (Ctrl-C) clean up every stage.
- Write a generator script that produces a large sample file.

Done when: importing a 2 GB file keeps resident memory under about 150 MB (log `process.memoryUsage().rss` every few seconds), bad lines are counted, and Ctrl-C stops cleanly.

### Milestone 3: aggregation and PostgreSQL

Goal: correct per-minute counts, stored idempotently.

- In-memory counters keyed by `(service, level, minute)`; flush on an interval and on shutdown.
- Upsert with `INSERT … ON CONFLICT (service, level, minute) DO UPDATE SET count = log_counts.count + EXCLUDED.count`.
- Migrations as plain SQL files run at startup.

Done when: importing the same file twice doubles the counts (and an import id makes a re-run a no-op, if you add that), and the totals match a `wc -l`-style check.

### Milestone 4: the HTTP ingest API

Goal: accept NDJSON batches over HTTP without buffering the whole body.

- `POST /v1/logs` reads `req` as a stream through the same Transforms; reject bodies over a limit with 413.
- `GET /v1/stats` and `GET /v1/alerts` with zod-validated query parameters and RFC 9457 problem-details errors.
- Rate limit ingestion per API key.

Done when: a 50 MB NDJSON POST is processed with flat memory, and invalid queries return 400 with a problem-details body.

### Milestone 5: alert rules in a worker pool

Goal: CPU-heavy rule checks don't block the event loop.

- A small worker pool (`worker_threads`) that receives batches and returns matches; rules are regex or threshold rules from a JSON file.
- Measure event-loop delay with `perf_hooks.monitorEventLoopDelay()` and expose it on `/metrics` (Prometheus text format).

Done when: under load, the p99 event-loop delay stays low with the pool and is visibly worse with the rules on the main thread (put both numbers in the README).

### Milestone 6: tests, Docker and CI

- Unit tests for the Transforms (split lines across chunks, bad JSON, empty input) and the aggregator (fake timers).
- An integration test that starts the server on port 0 and posts a batch.
- Multi-stage Dockerfile running as a non-root user; `docker compose` with PostgreSQL.

Done when: CI is green on every push and the README shows the memory and event-loop numbers.

## Repository layout

```text
pulse/
├── src/
│   ├── index.ts            # startup, config, shutdown
│   ├── config.ts           # zod-validated env
│   ├── api/                # Express app, routes, error handler
│   ├── pipeline/           # splitLines, parseJson, batch Transforms
│   ├── aggregate/          # counters and flush
│   ├── rules/              # worker pool and rule engine
│   ├── db/                 # pool, migrations, queries
│   └── cli/import.ts       # pulse import <file>
├── test/                   # node:test unit and integration tests
├── scripts/make-sample.ts  # large sample log generator
├── migrations/*.sql
├── Dockerfile
├── compose.yaml
└── .github/workflows/ci.yml
```

## Tests and CI

- **Unit:** each Transform with chunk boundaries in awkward places; the aggregator with fake timers; rule matching.
- **Integration:** real PostgreSQL in CI as a service container; POST a batch, then read `/v1/stats`.
- **Load check (manual):** autocannon against `POST /v1/logs`, recording throughput and event-loop delay in the README.

```yaml
# .github/workflows/ci.yml (outline)
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_PASSWORD: postgres }
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - run: npx tsc --noEmit
      - run: npm test
        env: { DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres }
```

## README checklist

- Badges: CI status, Node.js version, licence
- One-paragraph pitch and the architecture diagram as an image
- A demo GIF: importing a big file while `htop` shows flat memory
- How to run: `docker compose up`, or locally with PostgreSQL
- Design decisions: why streams and `pipeline`, why a worker pool, why upserts, how shutdown works
- The numbers: memory during a 2 GB import, event-loop p99 with and without workers
- What you would do next

Local development note: Docker Hub pulls currently fail on this Mac, so run PostgreSQL with Homebrew (it is already on port 5432) and point `DATABASE_URL` at it. Keep `compose.yaml` for readers of the repository.

## Stretch goals

- Server-sent events endpoint that pushes new alerts to a dashboard
- OpenTelemetry traces for each request and batch
- Retention: drop counts older than 30 days with a partitioned table
- Publish the CLI to npm

## Talking about it in an interview

**60-second walkthrough:** "Pulse ingests logs from files and HTTP, so I built everything around streams. A file goes through a pipeline of Transforms that split lines, parse JSON and batch records, and `pipeline` gives me backpressure and cleanup for free, so a 2 GB import stays around a hundred megabytes. Counts are aggregated in memory and flushed to Postgres with upserts. Rule checks are CPU-heavy, so they run in a worker pool; I measured event-loop delay to prove it helps. The service validates config at startup, logs JSON with request ids, and drains on SIGTERM."

- **Why not read the whole file and split it?** Memory grows with the file. Streams process a chunk at a time and backpressure pauses the reader when the database is slower than the disk.
- **Why worker threads and not cluster?** Cluster adds processes for more requests; the problem here was CPU work blocking one process's event loop. Workers move that work off the loop.
- **What happens if the process crashes between flushes?** Up to one flush interval of counts is lost. To avoid that I would write raw batches to a queue or a write-ahead table and aggregate from there.

## LinkedIn post template

> I built Pulse, a log ingestion service in Node.js and TypeScript, to go deep on streams and the event loop.
> It imports multi-gigabyte log files with flat memory using stream pipelines and backpressure, aggregates counts into PostgreSQL, and runs alert rules in a worker-thread pool.
> I measured the difference: event-loop delay drops sharply when CPU work leaves the main thread.
> Code, numbers and design notes: <GitHub link>
> #nodejs #typescript #backend

## Resume bullet

Built Pulse, an open-source Node.js/TypeScript log ingestion service that streams multi-gigabyte files with flat memory (stream pipelines, backpressure), aggregates into PostgreSQL with idempotent upserts, and offloads rule evaluation to a worker-thread pool.
