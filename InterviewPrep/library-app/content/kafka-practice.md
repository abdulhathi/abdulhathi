---
title: "Kafka in practice: schemas, Connect, Streams and operations"
goal: Design a production Kafka pipeline end to end, with data contracts, integration, stream processing, exactly-once, retries and operations, and compare managed options and alternatives with confidence.
minutes: 80
---

Knowing partitions and consumer groups gets you through the first ten minutes of a Kafka interview. The rest is about running Kafka for real: how producers and consumers agree on the shape of data (a **schema registry**), how data gets in and out without custom code (**Kafka Connect** and change data capture), how you compute over streams (**Kafka Streams**, Flink, ksqlDB), what **exactly-once** really covers, how you avoid the **dual-write** problem (the outbox pattern), how you **retry** without blocking a partition, and what you **monitor**. Expect at least one design question that pulls these together.

Read [Apache Kafka fundamentals](#/kafka-core) first: this chapter assumes offsets, groups, `acks` and the idempotent producer.

**Your angle:** you have no production Kafka work to cite. Two resume facts do transfer: at Quantiphi you designed schema-based structured-output validation with Pydantic as the data contract and quality gate before human review, which is the same idea a schema registry enforces between producers and consumers; and your integration work (FedEx SOAP-to-REST across about 24 OrderingStore applications plus 10 more, external submission APIs) is the kind of system where the retry and idempotency patterns below matter. Say that, and be clear that Kafka itself is studied, not shipped.

## Data contracts with a schema registry

A topic's bytes mean nothing without an agreed format, and producers and consumers are deployed independently. A **schema registry** (Confluent Schema Registry, Apicurio, or a cloud provider's equivalent) stores versioned schemas per **subject** (usually `<topic>-value`) in **Avro**, **Protobuf** or **JSON Schema**, and checks every new version against a **compatibility mode** before it can be registered. Serializers then put a small header on each message: a magic byte `0` and a 4-byte **schema id**, so a consumer fetches the exact writer schema (and caches it) instead of every message carrying its schema. (Protobuf payloads also carry a short list of message indexes after the id, naming the message type within the schema.)

```text
[0x00][ schema id: 4 bytes, big-endian ][ Avro / Protobuf / JSON payload ]
```

| Mode | New schema must be able to… | Typical safe change | Deploy first |
|---|---|---|---|
| `BACKWARD` (default) | read data written with the previous version | Add a field **with a default**; remove a field | **Consumers** |
| `FORWARD` | be read by consumers on the previous version | Add a field; remove a field that **had a default** | **Producers** |
| `FULL` | both | Add or remove fields that have defaults | Either, independently |
| `*_TRANSITIVE` | as above, against **all** earlier versions, not just the last | | |
| `NONE` | no check | | Carefully |

Renaming a field or changing its type breaks every mode; do it as add-new-field, migrate, then remove-old-field over several releases.

```python
import struct


def frame(schema_id: int, payload: bytes) -> bytes:
    """The schema-registry wire format: magic byte 0, 4-byte big-endian schema id, then the payload."""
    return b"\x00" + struct.pack(">I", schema_id) + payload


def unframe(message: bytes) -> tuple[int, bytes]:
    if len(message) < 5 or message[0] != 0:
        raise ValueError("not a schema-registry framed message")
    return struct.unpack(">I", message[1:5])[0], message[5:]


msg = frame(42, b'{"order_id":"o-1"}')
assert msg[:5] == b"\x00\x00\x00\x00\x2a"
assert unframe(msg) == (42, b'{"order_id":"o-1"}')
try:
    unframe(b"plain json")
    raise AssertionError("expected ValueError")
except ValueError:
    pass
```

## Kafka Connect and change data capture

**Kafka Connect** moves data between Kafka and other systems with configuration instead of code. You run a cluster of Connect **workers** (distributed mode); each **connector** (a source or a sink) is split into **tasks** that run on the workers; **converters** turn records into bytes (Avro, Protobuf, JSON); **single message transforms** (SMTs) make small per-record changes such as renaming a field or routing to another topic. Connect stores its own configs, offsets and status in Kafka topics, so a worker can die and another picks up its tasks.

**Change data capture (CDC)** turns every insert, update and delete in a database into an event. **Debezium**, the common open-source CDC connector, reads the database's own change log (PostgreSQL's write-ahead log through logical replication, MySQL's binlog) rather than polling tables, so it captures every change, in commit order, including deletes, with little load on the database.

```json
{
  "name": "shop-postgres-cdc",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "database.hostname": "orders-db",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "${file:/secrets/db.properties:password}",
    "database.dbname": "shop",
    "plugin.name": "pgoutput",
    "topic.prefix": "shop",
    "table.include.list": "public.outbox",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter"
  }
}
```

This connector reads only an `outbox` table and routes each row to a topic with Debezium's outbox event router: the cleanest way to publish events from a service without a dual write (see the outbox section below). Secrets come from a file provider, never inline.

## Stream processing: Kafka Streams, Flink and ksqlDB

Stream processing computes over records as they arrive: filtering, enriching, joining, aggregating. Two abstractions matter:

| | **KStream** | **KTable** |
|---|---|---|
| Represents | Every event, an unbounded sequence | The latest value per key (a changelog) |
| A new record for a key… | is another event | replaces the previous value |
| Example | Page views, payments | Current customer profile, account balance |

Stateful operations (counts, joins, windows) keep **state stores** locally (RocksDB in Kafka Streams), backed by a compacted **changelog topic** so state can be rebuilt on another instance after a failure. **Windows** group events by time: **tumbling** (fixed, non-overlapping: per minute), **hopping** (fixed size, overlapping), **session** (bounded by inactivity gaps). Events can arrive late; a **grace period** keeps a window open for late records, after which they are dropped (or sent to a dead-letter path).

| | Kafka Streams | Apache Flink | ksqlDB |
|---|---|---|---|
| What it is | A Java library inside your service | A separate distributed processing engine | SQL over Kafka, built on Kafka Streams |
| Deploy | Like any app, scale by running more instances | A Flink cluster (or managed Flink) | A ksqlDB server cluster |
| Best for | Kafka-to-Kafka processing owned by a service team | Large, complex, multi-source pipelines, batch and streaming | Simple transformations in SQL |

Confluent's managed stream-processing offering now centres on Flink, so check ksqlDB's status before starting new work on it. Kafka 4.2 also made a broker-side **Streams rebalance protocol** generally available (with a limited feature set) and added dead-letter-queue support to Kafka Streams' exception handlers.

```python
from collections import defaultdict


def tumbling_counts(events, window_ms: int, grace_ms: int):
    """Count events per (key, window) the way a windowed aggregation does. A record is dropped once stream time
    (the highest timestamp seen so far) has reached its window's end plus the grace period, as Kafka Streams does."""
    counts: dict[tuple[str, int], int] = defaultdict(int)
    dropped = []
    stream_time = 0
    for key, ts in events:
        stream_time = max(stream_time, ts)
        window_start = ts - ts % window_ms
        if stream_time >= window_start + window_ms + grace_ms:
            dropped.append((key, ts))  # too late: the window has closed
            continue
        counts[(key, window_start)] += 1
    return dict(counts), dropped


events = [("checkout", 1_000), ("checkout", 59_000), ("checkout", 61_000), ("checkout", 30_000), ("checkout", 200_000), ("checkout", 50_000)]
counts, dropped = tumbling_counts(events, window_ms=60_000, grace_ms=10_000)
assert counts == {("checkout", 0): 3, ("checkout", 60_000): 1, ("checkout", 180_000): 1}
assert dropped == [("checkout", 50_000)]  # arrived after stream time passed 0 + 60 s + 10 s grace
```

## Exactly-once processing

"Exactly once" in Kafka means: when you **read from Kafka, process, and write to Kafka**, each input record's effect appears in the output exactly once, even across crashes and retries. It combines three pieces:

1. The **idempotent producer** (no duplicates from retries).
2. **Transactions**: a producer with a stable `transactional.id` writes its output records **and** the consumer group's input offsets (`sendOffsetsToTransaction`) in one atomic transaction, then commits or aborts.
3. Downstream consumers read with **`isolation.level=read_committed`**, so they never see records from aborted or open transactions.

The `transactional.id` also gives **zombie fencing**: each new producer instance with that id bumps an **epoch**, and the broker rejects writes from an older instance that comes back from a long pause, so a "zombie" can't commit duplicate output. Kafka Streams wraps all of this in one setting, `processing.guarantee=exactly_once_v2`.

The scope matters: transactions cover Kafka-to-Kafka. The moment the processing writes to a database or calls an API, you're back to at-least-once plus **idempotent** side effects (an upsert keyed by event id, an idempotency key on the API call), or the outbox pattern.

```python
class Log:
    """One partition with transaction markers: read_committed readers skip aborted and open transactions."""

    def __init__(self):
        self.records = []           # (txn id or None, value)
        self.state: dict[str, str] = {}  # txn id -> "open" | "committed" | "aborted"

    def begin(self, txn: str):
        self.state[txn] = "open"

    def write(self, value: str, txn: str | None = None):
        self.records.append((txn, value))

    def end(self, txn: str, commit: bool):
        self.state[txn] = "committed" if commit else "aborted"

    def read(self, isolation: str) -> list[str]:
        if isolation == "read_uncommitted":
            return [v for _, v in self.records]
        return [v for t, v in self.records if t is None or self.state[t] == "committed"]


out = Log()
out.begin("t1"); out.write("enriched-1", "t1"); out.end("t1", commit=True)
out.begin("t2"); out.write("enriched-2", "t2"); out.end("t2", commit=False)  # crashed mid-transaction, aborted
out.begin("t3"); out.write("enriched-2", "t3")                               # retry, still open
assert out.read("read_committed") == ["enriched-1"]
out.end("t3", commit=True)
assert out.read("read_committed") == ["enriched-1", "enriched-2"]           # exactly once
assert out.read("read_uncommitted") == ["enriched-1", "enriched-2", "enriched-2"]
```

A read-process-write loop with a transactional producer (KafkaJS API):

```ts typecheck
import { Kafka } from 'kafkajs';

const kafka = new Kafka({ clientId: 'enricher', brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'enricher', readUncommitted: false }); // read_committed (KafkaJS's default)
const producer = kafka.producer({ transactionalId: 'enricher-1', idempotent: true, maxInFlightRequests: 1 });

await Promise.all([consumer.connect(), producer.connect()]);
await consumer.subscribe({ topics: ['orders'] });
await consumer.run({
  autoCommit: false,
  eachMessage: async ({ topic, partition, message }) => {
    const transaction = await producer.transaction();
    try {
      await transaction.send({ topic: 'orders-enriched', messages: [{ key: message.key, value: message.value }] });
      // The input offset is committed inside the same transaction as the output record.
      await transaction.sendOffsets({
        consumerGroupId: 'enricher',
        topics: [{ topic, partitions: [{ partition, offset: (BigInt(message.offset) + 1n).toString() }] }],
      });
      await transaction.commit();
    } catch (error) {
      await transaction.abort();
      throw error; // the record is redelivered and reprocessed in a new transaction
    }
  },
});
```

## The outbox pattern

A service that saves an order to its database **and** publishes `OrderPlaced` to Kafka has a **dual-write problem**: if it crashes between the two, the database and the event stream disagree, and no distributed transaction spans both. The **outbox pattern** fixes it: in the **same database transaction** as the business change, insert the event into an `outbox` table. A separate relay (a poller, or CDC such as Debezium's outbox router) publishes outbox rows to Kafka and marks them sent. Publishing can still happen twice (crash after publish, before marking), so consumers must be idempotent; but an event is never lost and never published for a change that rolled back.

```python
import json
import sqlite3

db = sqlite3.connect(":memory:", isolation_level=None)
db.executescript("""
CREATE TABLE orders (id TEXT PRIMARY KEY, total REAL NOT NULL);
CREATE TABLE outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, topic TEXT, key TEXT, payload TEXT, published INTEGER DEFAULT 0);
""")


def place_order(order_id: str, total: float, fail: bool = False) -> None:
    db.execute("BEGIN")
    try:
        db.execute("INSERT INTO orders VALUES (?, ?)", (order_id, total))
        db.execute("INSERT INTO outbox (topic, key, payload) VALUES ('orders', ?, ?)",
                   (order_id, json.dumps({"type": "OrderPlaced", "total": total})))
        if fail:
            raise RuntimeError("crash before commit")
        db.execute("COMMIT")
    except RuntimeError:
        db.execute("ROLLBACK")


published: list[tuple[str, str]] = []


def relay(crash_before_mark: bool = False) -> None:
    rows = db.execute("SELECT id, key, payload FROM outbox WHERE published = 0 ORDER BY id").fetchall()
    for row_id, key, payload in rows:
        published.append((key, payload))          # send to Kafka
        if crash_before_mark:
            return                                 # crashed: the row will be published again
        db.execute("UPDATE outbox SET published = 1 WHERE id = ?", (row_id,))


place_order("o-1", 120.0)
place_order("o-2", 80.0, fail=True)              # rolled back: no order, and no event
relay(crash_before_mark=True)
relay()
assert db.execute("SELECT id FROM orders").fetchall() == [("o-1",)]
assert [k for k, _ in published] == ["o-1", "o-1"]  # never lost, possibly duplicated
assert db.execute("SELECT COUNT(*) FROM outbox WHERE published = 0").fetchone() == (0,)
```

## Retries, dead-letter topics and poison messages

A record that fails processing blocks its partition if you retry it in place forever, because the consumer can't move past it without skipping it. The options:

- **Retry in place, briefly**, for transient errors (a timeout): a few attempts with backoff, then fall through.
- **Retry topics** for longer delays: publish the failed record to `orders.retry.1`, consumed after a delay (for example 1 minute), then `orders.retry.2` (10 minutes), then the **dead-letter topic** `orders.dlq`. The main partition keeps flowing. The trade-off: per-key **ordering is lost** for retried records, so this suits independent events, not a sequence of updates to one entity (for those, pause the key or the partition instead).
- **Dead-letter topic**: records that will never succeed (bad schema, a business rule violation) go straight there with headers describing the failure: original topic, partition, offset, error class and message, attempt count, timestamps. An alert fires, and a tool lets someone fix and replay them.

Never retry non-retryable errors (validation failures): they only waste attempts. The coding problems build a retry router.

## Sizing and operating a cluster

**Partition count** is driven by throughput and consumer parallelism: at least `target throughput / per-partition throughput` (measure your own producers and consumers; tens of MB/s per partition is typical for producers, consumers are often the bottleneck), and at least the number of consumers you want in the largest group, with headroom because adding partitions later remaps keys. Too many partitions cost memory, file handles, and longer recovery; KRaft raised the practical ceiling a lot.

**Replication factor 3** with `min.insync.replicas=2`, replicas spread across racks or availability zones (`broker.rack`), so a zone outage keeps every partition writable.

What to watch:

| Metric | Why |
|---|---|
| Under-replicated partitions / ISR shrinks | A broker is slow or down; durability is reduced |
| Offline partitions | No leader: writes and reads fail for those partitions |
| Request latency (produce, fetch), request queue time | Broker saturation |
| Consumer lag per group and partition | Consumers falling behind (see the fundamentals chapter) |
| Disk usage and retention | Running out of disk stops a broker |
| Active controller count | Exactly one KRaft controller should be active |

**Security:** TLS for traffic, SASL for authentication (SCRAM, OAUTHBEARER for OAuth/OIDC, mTLS certificates), ACLs per principal, topic and group, and quotas so one client can't starve others. **Tiered storage** (production-ready since Kafka 3.9) offloads older log segments to object storage, so retention can be long without large broker disks; it doesn't support compacted topics. For disaster recovery across clusters, **MirrorMaker 2** (MirrorMaker 1 was removed in 4.0) or a vendor's cluster linking replicates topics and consumer offsets. Upgrades are rolling, one broker at a time.

## Managed Kafka

| Service | Notes |
|---|---|
| **Confluent Cloud** | From Kafka's original creators: managed Kafka, Schema Registry, connectors, Flink |
| **Amazon MSK** | Provisioned (standard or Express brokers) and Serverless; Express brokers added Kafka 4.2 support in 2026 |
| **Azure Event Hubs** (Kafka endpoint) | Not Kafka, but speaks the Kafka protocol (Standard tier and up). Kafka Streams and transactions are in public preview on Premium and Dedicated; compression is gzip only, on Premium and Dedicated |
| **Google Cloud Managed Service for Apache Kafka** | Generally available since November 2024; managed Kafka Connect since October 2025 |

Choosing: Confluent for the broadest feature set and ecosystem; the cloud provider's service for simpler billing, identity (IAM) and networking inside one cloud; check compatibility limits for Kafka-protocol services like Event Hubs before relying on transactions, compaction or Streams. Kafka-API-compatible systems such as Redpanda also exist; the same compatibility check applies.

## Kafka, RabbitMQ and cloud pub/sub

| Need | Kafka | RabbitMQ | Cloud pub/sub (Google Pub/Sub, SNS+SQS, Service Bus) |
|---|---|---|---|
| Very high throughput event streams | Strongest | Good | Good, managed |
| Many independent consumers of the same events | Built in (consumer groups) | Fan-out exchanges, a queue per consumer | Subscriptions |
| Replay history | Yes, within retention | Only with streams | Limited (seek, snapshots) |
| Flexible routing (patterns, headers) | Topic choice only | Exchanges and bindings | Filters on attributes |
| Per-message acks, delays, priorities | Share groups (acks), no native delay/priority | Yes | Yes (delays, dead-letter) |
| Ordering | Per partition | Per queue | Ordering keys (optional) |
| Ops burden | High self-hosted | Moderate | None |

Rule of thumb: an **event log** that several teams read, replay and process as streams points to Kafka; **task queues and routing** point to RabbitMQ or a cloud queue; a small team with no appetite for operating brokers points to the cloud service. See [RabbitMQ fundamentals](#/rabbitmq-core) for the other side.

## Client libraries

The Java client is the reference implementation (Spring for Apache Kafka wraps it for Spring apps). Most other languages use **librdkafka** underneath: `confluent-kafka` for Python, `confluent-kafka-go`, and **`@confluentinc/kafka-javascript`** for Node.js (version 1.11 in October 2026), which offers a KafkaJS-compatible API to ease migration. **KafkaJS** itself has had no release since 2.2.4 in February 2023. For a new Node.js service, choose the Confluent client.

## Interview questions

### Why use a schema registry, and what are compatibility modes? {core}

Producers and consumers deploy independently, so they need an enforced contract for the bytes on a topic. A schema registry stores versioned Avro, Protobuf or JSON schemas per subject and rejects a new version that breaks the configured compatibility mode, so a producer can't ship a change that breaks consumers. Messages carry a small schema id instead of the whole schema. Backward compatibility, the default, means the new schema can read old data, like adding a field with a default; forward means old consumers can read new data; full means both; transitive variants check against every earlier version.

**Your angle:** at Quantiphi you used Pydantic schemas as the data contract and quality gate on extracted fields, the same principle applied at a different boundary.

### In what order do you deploy producers and consumers when a schema changes? {core}

It follows from the compatibility mode. With backward compatibility, the new schema can read old data, so you upgrade consumers first, then producers start writing the new version. With forward compatibility, old consumers can read new data, so producers go first. With full compatibility the order doesn't matter. For a breaking change, like a rename or type change, you don't do it in one step: add the new field, migrate producers and consumers, then remove the old field in a later version, or move to a new topic.

### What is Kafka Connect?

A framework, part of Apache Kafka, for moving data between Kafka and other systems through configuration rather than custom code. Source connectors bring data in, from databases, files or SaaS APIs; sink connectors push it out, to warehouses, search indexes or object storage. You run a cluster of Connect workers; connectors are split into tasks spread across workers, converters handle serialization, and single message transforms do light per-record changes. It stores its configs and offsets in Kafka topics, so it is fault-tolerant without extra infrastructure.

### What is change data capture, and how does Debezium work? {core}

Change data capture turns every row-level change in a database (insert, update, delete) into an event. Debezium is an open-source set of Kafka Connect source connectors that read the database's own change log, for example PostgreSQL's write-ahead log through logical replication, instead of polling tables. That captures every change in commit order, including deletes, with low load on the database. Typical uses: streaming a service's data to other services or a warehouse, keeping caches and search indexes in sync, and publishing events through an outbox table.

### What is the difference between a KStream and a KTable? {deep}

A KStream is an unbounded sequence of independent events: each record is a new fact, like a payment. A KTable is a changelog interpreted as current state: each record for a key replaces the previous value, like a customer's latest address, and a null value deletes the key. You join a stream of orders with a table of customers to enrich each order with the customer's current data, and aggregating a stream, for example counting per key, produces a table. KTables are backed by compacted topics and local state stores.

### How do windowed aggregations handle late events? {deep}

Each record carries an event timestamp and falls into a window, say a one-minute tumbling window. Because records can arrive out of order, the processor tracks stream time, the highest timestamp seen, and keeps each window open for a grace period after its end. A late record within the grace period still updates its window and the result is re-emitted; one that arrives after the window closed is dropped or routed to a dead-letter path. Choosing the grace period trades completeness against latency and state size.

### Kafka Streams, Flink or ksqlDB: how do you choose? {deep}

Kafka Streams is a Java library that runs inside your own service, so it suits Kafka-to-Kafka processing owned by one team, deployed and scaled like any app. Flink is a separate distributed engine: more operational weight, but stronger for large, complex pipelines, many sources and sinks, and unified batch and streaming; managed Flink removes much of the burden. ksqlDB gives SQL over Kafka for simple transformations, but Confluent's managed offering now centres on Flink, so for new work I'd look at Flink SQL first.

### How does exactly-once processing work in Kafka? {core}

For read-process-write between Kafka topics, three pieces combine. The idempotent producer removes duplicates caused by retries. Transactions let a producer with a stable transactional id write its output records and the consumer's input offsets atomically, committing or aborting together. And downstream consumers read with `isolation.level=read_committed`, so aborted or open transactions are invisible. Kafka Streams enables it with `processing.guarantee=exactly_once_v2`. It covers Kafka-to-Kafka only: external side effects like database writes still need idempotency or the outbox pattern.

### What is zombie fencing? {deep}

A zombie is a producer instance that paused, for example in a long GC pause or a network partition, while a replacement took over its work, and then wakes up and tries to keep writing. With transactions, each producer registers its transactional id and the broker bumps an epoch for that id whenever a new instance initialises. Writes or commits from an instance with an older epoch are rejected, so the zombie can't commit duplicate output alongside its replacement.

### What is the dual-write problem, and how does the outbox pattern solve it? {core}

When a service updates its database and publishes an event as two separate operations, a crash between them leaves them inconsistent: an order saved without its event, or an event for an order that rolled back. There is no transaction spanning a database and Kafka. The outbox pattern writes the event into an outbox table in the same database transaction as the business change; a relay, either a poller or CDC like Debezium's outbox router, then publishes outbox rows to Kafka. Events are never lost or published for rolled-back changes, though they can be published twice, so consumers must be idempotent.

### How do you implement retries without blocking a partition? {core}

Retry transient errors in place a few times with exponential backoff and jitter. Beyond that, publish the failed record to a retry topic with a delay, for example a one-minute and then a ten-minute topic consumed by the same logic, so the main partition keeps flowing. After the last attempt, or immediately for non-retryable errors like a validation failure, send it to a dead-letter topic with headers describing the failure, and alert. The trade-off is that retried records leave their partition, so per-key ordering is lost; for ordered streams, pause processing of that key or partition instead.

### What goes in a dead-letter topic message?

The original key, value and headers unchanged, plus headers that make it actionable: the original topic, partition and offset, the consumer group, the error class and message, the attempt count, and first-failure and last-failure timestamps. That lets someone find the cause, fix it, and replay the record to the original topic with a tool, and lets monitoring group DLQ records by error. Don't put secrets or full stack traces with personal data into headers.

### How do you choose the number of partitions for a topic? {core}

From two numbers: throughput and parallelism. Divide the target throughput by what one partition sustains for your producers and, more often the limit, your consumers, measured in your environment; and make sure the count is at least the number of consumers you want in the biggest group. Then add headroom, because adding partitions later changes key-to-partition mapping and can reorder events per key. Very high counts cost broker memory and file handles and slow recovery, though KRaft raised the practical limit a lot.

### What would you monitor on a Kafka cluster? {core}

Under-replicated partitions and ISR shrinks, which mean durability is reduced. Offline partitions, which mean an outage for those partitions. Produce and fetch request latency and request queue time, for broker saturation. Disk usage against retention, because a full disk stops a broker. Exactly one active controller. And per-group, per-partition consumer lag, ideally as time behind rather than record count, with alerts on lag growing. I'd add producer error rates and DLQ volume from the applications.

### How do you secure Kafka?

Encrypt traffic with TLS, between clients and brokers and between brokers. Authenticate clients with SASL, using SCRAM, OAUTHBEARER against your identity provider, or mutual TLS certificates. Authorize with ACLs per principal on topics, consumer groups and transactional ids, granting each service only what it needs. Add quotas so one client can't starve others. Keep credentials in a secret manager, and audit admin operations. On managed services, use the cloud's identity integration, such as IAM on MSK or Entra ID on Event Hubs.

### What is tiered storage? {deep}

Tiered storage, from KIP-405 and production-ready since Kafka 3.9, keeps recent log segments on broker disks and offloads older segments to a remote store such as object storage. Consumers read old data transparently, slightly slower. It decouples retention from broker disk size, so you can keep months of data cheaply, and makes rebalancing and recovery faster because less data lives on brokers. It doesn't support compacted topics.

### Which managed Kafka service would you choose, and why? {deep}

It depends on what you need beyond brokers and where you already run. Confluent Cloud has the broadest ecosystem: Schema Registry, managed connectors and Flink. Amazon MSK or Google Cloud's Managed Service for Apache Kafka fit teams that want IAM, networking and billing inside one cloud. Azure Event Hubs exposes a Kafka-compatible endpoint rather than real Kafka, so I'd check its limits first; Kafka Streams and transactions are still in preview on Premium and Dedicated. I'd also confirm the Kafka version supported, since features like share groups need 4.2+.

### When would you choose Kafka over RabbitMQ, and the reverse? {core}

Kafka when the data is an event stream that several independent consumers read, possibly replay, and process as streams at high throughput, such as order events feeding billing, analytics and search. RabbitMQ when the need is task distribution and routing: work queues, topic or header-based routing, per-message acknowledgements, priorities, delayed retries and request/reply, at moderate volume with simpler operations. If the team doesn't want to run brokers at all, a cloud queue or pub/sub service often wins.

### How would you reprocess history after fixing a bug in a consumer? {deep}

If the data is still within retention, stop the consumer group and reset its offsets, with the consumer-groups tool's `--reset-offsets` to earliest, to a timestamp, or by a number of records, then restart. The handlers must be idempotent, because they will see records they already processed. If the reprocessing must not disturb the live consumer, run a new consumer group with a new id over the same topic and write to a separate output, then switch over. For data past retention, you need a compacted topic, tiered storage, or an archive to replay from.

### Walk me through designing an event-driven order pipeline on Kafka. {core}

The order service writes the order and an outbox row in one transaction; Debezium or a relay publishes `OrderPlaced` to an `orders` topic keyed by order id, so each order's events stay ordered, with Avro schemas under backward compatibility in a schema registry. Billing, inventory and notification services each consume in their own consumer group, processing at least once with idempotent handlers keyed by event id, retry topics for transient failures and a dead-letter topic with alerts. Analytics streams the same topic to the warehouse through a sink connector. Topics use replication factor 3, `min.insync.replicas=2` and `acks=all`; I'd monitor lag, DLQ volume and under-replicated partitions.

## Coding problems

### Route failed records through retry topics to a dead-letter topic {medium core}

Consumers of `orders` sometimes fail. Write `route(record, error, retryable)` that returns where the record goes next and the headers to attach. Rules: a retryable error moves the record to the next retry topic (`orders.retry.1`, then `orders.retry.2`), carrying an increasing `x-attempt` header and the delay before it may be processed (1 minute, then 10 minutes); after the last retry, or immediately for a non-retryable error, it goes to `orders.dlq` with the error recorded. Original topic, partition and offset are kept from the first failure.

Example: a first retryable failure on `orders` partition 3 offset 42 routes to `orders.retry.1` with `x-attempt: 1`, delay 60 s, and `x-original-offset: 42`.

#### Hints

1. Read the current attempt number from the record's headers (missing means 0).
2. Keep a list of retry tiers; the attempt number picks the next tier, and running off the end means the dead-letter topic.
3. Only set the "original" headers if they aren't already there, so they keep pointing at the first failure.

#### Solution

The record's headers carry its history. Compute the next attempt, pick the matching tier, and copy the original coordinates only once.

```python
RETRY_TIERS = [("orders.retry.1", 60), ("orders.retry.2", 600)]
DLQ = "orders.dlq"


def route(record: dict, error: Exception, retryable: bool) -> dict:
    headers = dict(record.get("headers", {}))
    attempt = int(headers.get("x-attempt", 0)) + 1
    headers.setdefault("x-original-topic", record["topic"])
    headers.setdefault("x-original-partition", str(record["partition"]))
    headers.setdefault("x-original-offset", str(record["offset"]))
    headers["x-attempt"] = str(attempt)
    headers["x-error"] = f"{type(error).__name__}: {error}"
    if retryable and attempt <= len(RETRY_TIERS):
        topic, delay = RETRY_TIERS[attempt - 1]
        return {"topic": topic, "delay_s": delay, "key": record["key"], "value": record["value"], "headers": headers}
    return {"topic": DLQ, "delay_s": 0, "key": record["key"], "value": record["value"], "headers": headers}


first = {"topic": "orders", "partition": 3, "offset": 42, "key": "o-7", "value": "{}", "headers": {}}
r1 = route(first, TimeoutError("inventory timed out"), retryable=True)
assert (r1["topic"], r1["delay_s"], r1["headers"]["x-attempt"]) == ("orders.retry.1", 60, "1")
assert r1["headers"]["x-original-offset"] == "42"

second = {"topic": "orders.retry.1", "partition": 0, "offset": 5, "key": "o-7", "value": "{}", "headers": r1["headers"]}
r2 = route(second, TimeoutError("again"), retryable=True)
assert (r2["topic"], r2["delay_s"], r2["headers"]["x-attempt"]) == ("orders.retry.2", 600, "2")
assert r2["headers"]["x-original-topic"] == "orders" and r2["headers"]["x-original-offset"] == "42"

third = {"topic": "orders.retry.2", "partition": 0, "offset": 9, "key": "o-7", "value": "{}", "headers": r2["headers"]}
assert route(third, TimeoutError("still down"), retryable=True)["topic"] == DLQ

bad = route(first, ValueError("total is negative"), retryable=False)
assert bad["topic"] == DLQ and bad["headers"]["x-attempt"] == "1" and "ValueError" in bad["headers"]["x-error"]
assert first["headers"] == {}  # the input record is not mutated
```

Complexity: O(h) per call for h headers.

#### Follow-ups

- **How does a retry consumer honour the delay?** Compare the record's timestamp plus the delay with now; if it's early, pause that partition and resume when due (don't sleep while holding the poll loop past `max.poll.interval.ms`).
- **How do you replay from the DLQ?** A tool reads selected DLQ records, strips the retry headers, and republishes to the original topic once the cause is fixed.

### Count events in tumbling windows with a grace period {medium}

Given `(key, timestamp_ms)` events in arrival order (not necessarily time order), count events per key per tumbling window of `window_ms`, keeping each window open for `grace_ms` after its end, measured against the highest timestamp seen so far ("stream time"). Return the counts and the list of events dropped as too late.

Example: with one-minute windows and 10 s grace, an event at 50 s arriving after one at 200 s is dropped.

#### Hints

1. A record's window starts at `ts - ts % window_ms`.
2. Track stream time as the maximum timestamp seen so far, updated before deciding about each record.
3. A record is too late when stream time has reached its window's end plus the grace period (Kafka Streams closes the window at exactly that point).

#### Solution

Advance stream time, compute the window, and either count the record or drop it.

```python
from collections import defaultdict


def tumbling_counts(events: list[tuple[str, int]], window_ms: int, grace_ms: int):
    counts: dict[tuple[str, int], int] = defaultdict(int)
    dropped: list[tuple[str, int]] = []
    stream_time = 0
    for key, ts in events:
        stream_time = max(stream_time, ts)
        start = ts - ts % window_ms
        if stream_time >= start + window_ms + grace_ms:
            dropped.append((key, ts))
        else:
            counts[(key, start)] += 1
    return dict(counts), dropped


counts, dropped = tumbling_counts(
    [("a", 1_000), ("b", 5_000), ("a", 59_999), ("a", 60_000), ("a", 65_000), ("a", 30_000), ("a", 200_000), ("a", 50_000)],
    window_ms=60_000,
    grace_ms=10_000,
)
assert counts == {("a", 0): 3, ("b", 0): 1, ("a", 60_000): 2, ("a", 180_000): 1}
assert dropped == [("a", 50_000)]
assert tumbling_counts([], 60_000, 0) == ({}, [])
# The boundary: once stream time reaches window end + grace (60 s + 10 s), window 0 is closed.
assert tumbling_counts([("a", 70_000), ("a", 5_000)], 60_000, 10_000)[1] == [("a", 5_000)]
assert tumbling_counts([("a", 69_999), ("a", 5_000)], 60_000, 10_000)[1] == []
```

Complexity: O(n) time, O(w) space for w live (key, window) pairs.

#### Follow-ups

- **When would you emit results?** Either on every update (results revised as late records arrive) or once per window after it closes (suppression), which is cleaner for downstream consumers.
- **How would hopping windows change this?** Each record belongs to several overlapping windows, so you increment `window_ms / advance_ms` counters per record.

### Check backward and forward schema compatibility {medium}

Schemas are simplified to `{field_name: {"type": str, "default": optional}}` (a field has a default if the key `"default"` is present). Write `backward_compatible(old, new)` (a reader on the new schema can read data written with the old one) and `forward_compatible(old, new)` (a reader on the old schema can read data written with the new one), using these rules: a reader can ignore fields it doesn't know; a field the reader expects but the data lacks needs a default in the reader's schema; a field present in both must keep its type.

Example: adding `"coupon": {"type": "string", "default": ""}` is backward and forward compatible; adding a required field without a default is only forward compatible.

#### Hints

1. Both checks are the same function with the roles swapped: `compatible(reader, writer)`.
2. For every field in the reader: if the writer has it, the types must match; if not, the reader needs a default.
3. Fields only in the writer are fine: the reader ignores them.

#### Solution

Write one `can_read(reader, writer)` check and express both modes with it.

```python
def can_read(reader: dict, writer: dict) -> bool:
    for name, spec in reader.items():
        if name in writer:
            if writer[name]["type"] != spec["type"]:
                return False
        elif "default" not in spec:
            return False
    return True


def backward_compatible(old: dict, new: dict) -> bool:
    return can_read(reader=new, writer=old)


def forward_compatible(old: dict, new: dict) -> bool:
    return can_read(reader=old, writer=new)


v1 = {"order_id": {"type": "string"}, "total": {"type": "double"}}
optional_added = {**v1, "coupon": {"type": "string", "default": ""}}
required_added = {**v1, "channel": {"type": "string"}}
type_changed = {"order_id": {"type": "string"}, "total": {"type": "string"}}
total_removed = {"order_id": {"type": "string"}}

assert backward_compatible(v1, optional_added) and forward_compatible(v1, optional_added)
assert not backward_compatible(v1, required_added) and forward_compatible(v1, required_added)
assert not backward_compatible(v1, type_changed) and not forward_compatible(v1, type_changed)
# Removing a field: new readers ignore it in old data, but old readers need a default for it.
assert backward_compatible(v1, total_removed) and not forward_compatible(v1, total_removed)
v1_with_default = {"order_id": {"type": "string"}, "total": {"type": "double", "default": 0.0}}
assert forward_compatible(v1_with_default, total_removed)
```

Complexity: O(f) for f fields in the reader schema.

#### Follow-ups

- **What does "transitive" add?** Run the check against every earlier version, not just the latest, so a consumer on any old version stays safe.
- **How does Protobuf differ?** Fields are identified by number, not name: never reuse or change a field number's type; mark removed numbers `reserved`.

### Estimate the partitions a topic needs {easy}

Write `partitions_needed(target_mb_s, producer_mb_s_per_partition, consumer_mb_s_per_partition, max_consumers, headroom=1.5)`. It returns the number of partitions required so that both producers and consumers can sustain the target throughput, with at least one partition per consumer in the largest group, multiplied by the headroom factor and rounded up.

Example: 100 MB/s target, 25 MB/s per partition for producers, 10 MB/s for consumers, 6 consumers, headroom 1.5: consumers need 10 partitions, so 15.

#### Hints

1. Producers need `ceil(target / producer rate)` partitions; consumers need `ceil(target / consumer rate)`.
2. Take the maximum of those two and the consumer count.
3. Apply the headroom at the end and round up.

#### Solution

The bottleneck side decides; parallelism sets a floor; headroom covers growth because adding partitions later is disruptive.

```python
import math


def partitions_needed(target_mb_s: float, producer_mb_s_per_partition: float, consumer_mb_s_per_partition: float,
                      max_consumers: int, headroom: float = 1.5) -> int:
    if min(producer_mb_s_per_partition, consumer_mb_s_per_partition) <= 0 or headroom < 1:
        raise ValueError("rates must be positive and headroom at least 1")
    base = max(
        math.ceil(target_mb_s / producer_mb_s_per_partition),
        math.ceil(target_mb_s / consumer_mb_s_per_partition),
        max_consumers,
        1,
    )
    return math.ceil(base * headroom)


assert partitions_needed(100, 25, 10, 6) == 15
assert partitions_needed(5, 25, 10, 12) == 18      # parallelism, not throughput, decides
assert partitions_needed(1, 25, 25, 1, headroom=1.0) == 1
try:
    partitions_needed(10, 0, 10, 1)
    raise AssertionError("expected ValueError")
except ValueError:
    pass
```

Complexity: O(1).

#### Follow-ups

- **Why not just create 1,000 partitions to be safe?** Each partition costs broker memory and file handles, more leaders to elect on failure, and more open batches for producers; and consumers pay per-partition overhead too.
- **Where do the per-partition rates come from?** A load test with your real message sizes, compression, `acks` setting and consumer processing, not a blog post.
