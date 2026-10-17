---
title: "Streamline: a clickstream analytics pipeline on Apache Kafka"
summary: A Python event pipeline on Kafka 4 (KRaft) that ingests click events, builds user sessions in a scalable consumer group, counts page views with exactly-once transactions, routes bad events to a dead-letter topic and can replay history, with a consumer-lag view.
time: 4–5 days of evenings
---

## What you will build

Streamline ingests website click events through a small HTTP API, puts them on Kafka keyed by user, and processes them three ways:

- a **sessionizer** consumer group that groups each user's clicks into sessions (30 minutes of inactivity closes one) and can scale from one to three instances while you watch partitions rebalance;
- an **aggregator** that counts page views per page per minute with Kafka **transactions** (consume, transform and produce exactly once) into a **compacted** topic;
- a **sink** that writes closed sessions to PostgreSQL idempotently.

Invalid events go to a **dead-letter topic** with the error in a header. A **replay** command resets the sessionizer to a timestamp and rebuilds history, and a **lag** endpoint shows how far behind each consumer group is.

It deliberately shows what makes Kafka different from a queue such as RabbitMQ: keyed partitions and per-key ordering, consumer groups that scale by partition, retention and replay, compaction, and exactly-once processing inside Kafka. It is a different domain from the portfolio's RabbitMQ ShopFlow order pipeline.

## What it proves

- Kafka fundamentals: topics, partitions, keys and ordering, replication settings (`acks=all`, `min.insync.replicas`)
- Producers: idempotence, batching, compression, delivery callbacks
- Consumers and consumer groups: rebalancing, manual offset commits, at-least-once with idempotent sinks
- Exactly-once processing with transactions and `read_committed`
- Log compaction, retention and replay by timestamp
- Error handling with dead-letter topics; monitoring consumer lag
- Keywords: Apache Kafka, KRaft, event streaming, event-driven architecture, Python, confluent-kafka, FastAPI, PostgreSQL, exactly-once, data pipelines

## Architecture

```text
 load generator / clients
          │  POST /events  (JSON, validated with Pydantic)
          ▼
   ingest API (FastAPI) ── idempotent producer, key = user_id ──► clicks.raw  (6 partitions, 7-day retention)
          │                                                         │
          └── invalid ──► clicks.dlt (error in headers)             ├──► sessionizer group (1–3 instances)
                                                                    │        └─► sessions.closed ──► sink ──► PostgreSQL (upsert by session_id)
                                                                    │
                                                                    └──► aggregator (transactional, read_committed)
                                                                             └─► page.counts  (compacted, key = page|minute)

   lag endpoint: AdminClient → committed offsets vs high watermarks per group/partition
   replay:       reset sessionizer group offsets to a timestamp, then restart
```

## Milestones

### Milestone 1: a KRaft broker, topics and a keyed producer

Run Kafka 4.x in KRaft mode (no ZooKeeper), create the topics from a script (partitions, retention, `cleanup.policy=compact` for `page.counts`), and build the ingest API. The producer uses `enable.idempotence=true`, `acks=all`, a little `linger.ms` and compression, and keys every event by `user_id`.

**Done when:** `kafka-console-consumer --property print.key=true --property print.partition=true` shows that every event for one user lands on the same partition, and the producer's delivery callback logs failures.

### Milestone 2: the sessionizer consumer group

Consume `clicks.raw` with `enable.auto.commit=false`. Keep per-user session state for the partitions you own; when a session closes, produce it to `sessions.closed`, then commit. Handle `on_assign`/`on_revoke` so state is flushed or dropped when partitions move. Start a second and third instance and watch the rebalance in the logs.

**Done when:** sessions are correct for a scripted click sequence, and killing an instance mid-stream causes no lost sessions (duplicates are allowed here; the sink handles them).

### Milestone 3: dead-letter topic and the idempotent sink

Validate events in the API and again in consumers (schema drift happens); send failures to `clicks.dlt` with `error` and `source-offset` headers and keep consuming. Write the sink with `INSERT … ON CONFLICT (session_id) DO NOTHING` so redelivered sessions are harmless.

**Done when:** a test sends malformed events, they appear in the DLT with readable errors, and replaying the same sessions twice leaves PostgreSQL unchanged.

### Milestone 4: exactly-once aggregation with transactions

The aggregator uses a `transactional.id`, `isolation.level=read_committed` on its input, and per batch: `begin_transaction`, produce the counts, `send_offsets_to_transaction`, `commit_transaction`. Output goes to the compacted `page.counts` topic.

**Done when:** you `kill -9` the aggregator mid-run, restart it, and the final counts match a straight count of the input (no double counting).

```python
producer.begin_transaction()
for key, count in batch_counts.items():
    producer.produce("page.counts", key=key, value=str(count))
producer.send_offsets_to_transaction(consumer.position(consumer.assignment()),
                                     consumer.consumer_group_metadata())
producer.commit_transaction()
```

### Milestone 5: replay and lag

Add a `replay --to 2026-10-01T09:00` command that stops the sessionizer group, resets its offsets to that timestamp (`offsets_for_times`) and restarts it. Add `GET /lag` that compares each group's committed offsets with the partitions' high watermarks.

**Done when:** a replay rebuilds a day of sessions, and `/lag` shows lag rising under load and falling back to zero.

### Milestone 6: load test and write-up

Generate tens of thousands of events per minute with a load script, scale the sessionizer from one to three instances, and record throughput and lag.

**Done when:** the README has a results table (events per second, end-to-end delay, peak lag with one vs three consumers) from your own runs, plus a screenshot of the lag view.

## Repository layout

```text
streamline/
├── ingest/api.py              # FastAPI + producer
├── consumers/
│   ├── sessionizer.py
│   ├── aggregator.py          # transactional
│   └── sink.py                # PostgreSQL upserts
├── streamline/
│   ├── events.py              # Pydantic models, shared by all
│   ├── sessions.py            # pure session logic (unit-tested)
│   └── kafka_config.py
├── tools/{create_topics,replay,loadgen}.py
├── tests/                     # unit + integration
├── docker-compose.yml
├── pyproject.toml
└── README.md
```

## Tests and CI

- **Unit tests** for the pure parts: session boundaries, minute bucketing, event validation. Keep Kafka out of these.
- **Integration tests** against a real broker: produce a known sequence, run the consumers, assert the sessions in PostgreSQL and the counts in `page.counts`; the DLT test; the crash-and-restart test for the aggregator.
- **GitHub Actions:** start a single-node KRaft broker from the official `apache/kafka` image and a PostgreSQL service container, create topics, then `pytest`. Add `ruff` and `mypy`.

## README checklist

- Build badge, Python and Kafka versions
- Architecture diagram and a topic table (partitions, retention, cleanup policy, keys)
- A GIF of scaling the sessionizer from one to three instances with the lag view
- How to run (compose, and the local alternative below)
- Results table and how to reproduce it
- Design decisions: why key by user, partition count, at-least-once plus idempotent sink vs transactions, what exactly-once does and does not cover
- What you would do next (Schema Registry with Avro or Protobuf, Kafka Connect sink, Flink or Kafka Streams)

**Local development on this Mac:** Docker Hub pulls currently fail here, so install Kafka with Homebrew (`brew install kafka`, then `brew services start kafka`; recent versions run in KRaft mode) and use the local PostgreSQL. Readers of the repo can use `docker compose up`. Use `confluent-kafka` (2.16 at the time of writing) as the Python client.

## Stretch goals

- Schema Registry with Protobuf or Avro schemas and a compatibility mode
- A Kafka Connect JDBC sink instead of the hand-written sink
- Try the new consumer group protocol (KIP-848) and compare rebalance times
- Deploy to a managed Kafka (Confluent Cloud free trial or Google Cloud Managed Service for Apache Kafka)

## Talking about it in an interview

**60-second walkthrough:** "Streamline ingests click events and keys them by user ID, so each user's events stay in order on one partition. A consumer group builds sessions and scales by partition: going from one to three instances cut lag at peak load, and I handled rebalances by flushing state on revoke. The sink is idempotent, so at-least-once delivery is safe. For page counts I used Kafka transactions: the produced counts and the consumed offsets commit atomically, so a crash can't double-count. Bad events go to a dead-letter topic, and because Kafka retains the log I can replay any day by resetting offsets to a timestamp."

**Likely follow-ups:**

- *How did you choose six partitions?* Partitions cap consumer parallelism and are hard to reduce later, so I sized for the most consumers I expect (three, with headroom) and the target throughput per partition. Too many partitions add overhead and slower failover.
- *Is your pipeline exactly-once end to end?* Only inside Kafka: the aggregator's read-process-write is transactional. Writes to PostgreSQL are made safe differently, with an idempotent upsert on a natural key.
- *What if one user generates most of the traffic?* That key becomes a hot partition. I'd detect it with per-partition lag, and either add a salt to the key for that traffic (losing strict ordering for it) or handle heavy hitters separately.

## LinkedIn post template

> I built Streamline to learn Apache Kafka properly: a clickstream pipeline on Kafka 4 (KRaft) with keyed partitions, a scalable consumer group, exactly-once aggregation with transactions, a dead-letter topic and replay by timestamp.
> Biggest lesson: exactly-once is a Kafka-internal guarantee; anything outside Kafka still needs idempotent writes.
> Code, design notes and load-test numbers: <repo link> #ApacheKafka #EventStreaming #Python #DataEngineering

## Resume bullet

Built Streamline, an open-source Kafka 4 (KRaft) clickstream pipeline in Python with keyed partitioning, a horizontally scaled consumer group, exactly-once aggregation via transactions, dead-letter handling and timestamp replay. *(Use only after it is built and public.)*
