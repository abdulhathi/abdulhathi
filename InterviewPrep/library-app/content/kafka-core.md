---
title: Apache Kafka fundamentals
goal: Explain how Kafka stores, replicates and delivers events, and answer the partition, consumer-group, ordering and delivery-guarantee questions every Kafka interview asks.
minutes: 85
---

Apache Kafka is a distributed, replicated, append-only **log**. Producers append records to the end; consumers read at their own position and Kafka keeps the records for a configured time, whether anyone has read them or not. That one design decision explains most of what interviewers ask: why ordering is per partition, why you can replay history, why many teams can read the same events independently, and why "exactly once" needs care.

Expect questions on partitions and keys, consumer groups and rebalances, offsets and delivery guarantees, replication settings (`acks`, ISR, `min.insync.replicas`), retention versus compaction, and when Kafka is the wrong tool. Current Kafka is the 4.x line (as of October 2026 the newest release is 4.3.1, with 4.2.2 and 4.1.2 also supported): it runs **only in KRaft mode** (ZooKeeper was removed in 4.0), the **new consumer group protocol** is generally available, and **share groups** ("Queues for Kafka") became production-ready in 4.2.

**Your angle:** Kafka is not on your resume. What you can say honestly: you have designed event-driven and background-processing systems (event-driven architecture is a listed skill; you analysed Labcorp orchestration workflows and background jobs; you spearheaded a monolith-to-microservices migration on Azure), you have been studying message brokers hands-on with RabbitMQ, and you understand Kafka's model in depth. Do not claim production Kafka work; say what you would do and why.

## The mental model: a replicated log

```text
topic "orders" (3 partitions, replication factor 3)

partition 0:  [0][1][2][3][4][5][6]           ← producers append at the end
partition 1:  [0][1][2][3][4]
partition 2:  [0][1][2][3][4][5][6][7][8]
                       ▲              ▲
     group "billing" at offset 2      group "analytics" at offset 8
     (each group tracks its own position; reading deletes nothing)
```

| Term | Meaning |
|---|---|
| **Record** | One event: optional **key**, **value** (bytes), **headers**, **timestamp** |
| **Topic** | A named stream of records, split into partitions |
| **Partition** | An ordered, append-only log; the unit of ordering, parallelism and replication |
| **Offset** | A record's position in its partition (0, 1, 2, …), never reused |
| **Segment** | The files a partition is stored in; retention deletes whole segments |
| **Broker** | A server that stores partition replicas and serves clients |
| **Controller** | KRaft nodes (a Raft quorum) that hold cluster metadata and elect partition leaders |
| **Leader / follower** | Each partition has one leader replica handling writes; followers copy it |
| **ISR** | In-sync replicas: the leader plus followers that are caught up |
| **Consumer group** | Consumers sharing the work of reading a topic; each partition goes to one member |
| **Committed offset** | The next offset a group will read from, stored in the `__consumer_offsets` topic |
| **Lag** | Log end offset (strictly, the high watermark) minus committed offset: how far behind a group is |

Two things differ from a classic queue. Consumption does not delete anything: records expire by **retention** (time or size) or are kept forever with **compaction**. And many independent consumer groups can read the same records at their own pace, so adding a new consumer of an event stream costs the producer nothing.

## Partitions, keys and ordering

Kafka guarantees order **only within a partition**. To keep all events for one entity in order (all updates for order 42), give them the same **key**: the default partitioner hashes the key with **murmur2** and takes it modulo the partition count, so the same key always lands in the same partition, as long as the partition count does not change. A record with no key goes to a **sticky** partition: the producer fills a batch for one partition, then moves on, which gives good batching without hot-spotting a single partition.

```python
def murmur2(data: bytes) -> int:
    """Kafka's murmur2 (org.apache.kafka.common.utils.Utils.murmur2), returning a signed 32-bit int."""
    length = len(data)
    m, r = 0x5BD1E995, 24
    h = (0x9747B28C ^ length) & 0xFFFFFFFF
    for i in range(length // 4):
        j = i * 4
        k = data[j] | (data[j + 1] << 8) | (data[j + 2] << 16) | (data[j + 3] << 24)
        k = (k * m) & 0xFFFFFFFF
        k ^= k >> r
        k = (k * m) & 0xFFFFFFFF
        h = ((h * m) & 0xFFFFFFFF) ^ k
    tail, rem = length & ~3, length % 4
    if rem == 3:
        h ^= data[tail + 2] << 16
    if rem >= 2:
        h ^= data[tail + 1] << 8
    if rem >= 1:
        h ^= data[tail]
        h = (h * m) & 0xFFFFFFFF
    h ^= h >> 13
    h = (h * m) & 0xFFFFFFFF
    h ^= h >> 15
    return h - (1 << 32) if h >= 1 << 31 else h


def partition_for(key: bytes, num_partitions: int) -> int:
    # toPositive(murmur2(key)) % numPartitions, exactly as the Java producer does it
    return (murmur2(key) & 0x7FFFFFFF) % num_partitions


# Test vectors from Kafka's own unit tests: this is byte-for-byte the producer's hash.
assert murmur2(b"21") == -973932308
assert murmur2(b"foobar") == -790332482
assert murmur2(b"abc") == 479470107

# The same key always maps to the same partition...
assert partition_for(b"order-42", 6) == partition_for(b"order-42", 6)

# ...until the partition count changes: then most keys move.
keys = [f"order-{i}".encode() for i in range(1000)]
moved = sum(partition_for(k, 6) != partition_for(k, 8) for k in keys)
assert 650 < moved < 850, moved
print(f"{moved} of 1000 keys change partition when a topic grows from 6 to 8 partitions")
```

```text
746 of 1000 keys change partition when a topic grows from 6 to 8 partitions
```

That last result is why **adding partitions is not free**: existing records stay where they are, new records for the same key may go to a different partition, and a consumer can briefly see key 42's newer event (new partition) before an older one still waiting in the old partition. Choose a partition count with headroom up front, or plan the change (pause producers per key, or accept reordering for keys in flight).

Pick keys by **what must stay ordered**: an order id, an account id, a device id. A skewed key (one giant tenant) makes a **hot partition**: one consumer does most of the work while others idle. Fixes: a finer key (tenant + order id), or a salted key when order across the tenant does not matter.

## Brokers, KRaft and replication

A cluster is a set of **brokers** that store partition replicas, plus **KRaft controllers**: a small Raft quorum (usually three) that holds the metadata (topics, partitions, leaders, ISR, configs) in an internal log and elects partition leaders. Before 4.0, ZooKeeper held that metadata; KRaft removed the second system to operate, made metadata changes faster, and lets clusters hold far more partitions. A ZooKeeper-mode cluster must be **migrated to KRaft on a 3.x release first** (3.9, the last 3.x line, is the usual bridge) before it can be upgraded to 4.x.

Each partition has a **replication factor** (typically 3). One replica is the **leader**; producers write to it and, by default, consumers read from it. **Followers** fetch from the leader. A follower that keeps up stays in the **ISR**; one that falls behind is dropped from it.

```text
partition orders-0, replication factor 3, min.insync.replicas = 2

broker 1 (leader)   [0][1][2][3][4][5]    log end offset = 6
broker 2 (ISR)      [0][1][2][3][4][5]
broker 3 (ISR)      [0][1][2][3][4]       ← high watermark = 5: consumers can read offsets 0–4
```

The **high watermark** is the smallest log end offset among the in-sync replicas: every record below it is on all of them. Consumers only read records below it, so a consumer never reads a record that could disappear if the leader died.

The producer's **`acks`** setting says when a write counts as done:

| `acks` | The producer is told "success" when… | Risk |
|---|---|---|
| `0` | it sent the request | Lost on any failure |
| `1` | the leader wrote it | Lost if the leader dies before a follower copies it |
| `all` (`-1`) | every replica in the ISR has it | Safe while at least `min.insync.replicas` replicas are in sync |

`min.insync.replicas` (a topic or broker setting, default 1) is the floor: with `acks=all` and `min.insync.replicas=2`, a write is **rejected** (`NotEnoughReplicas`) when fewer than 2 replicas are in sync, instead of silently being stored on one disk. The standard durable setup is **replication factor 3, `min.insync.replicas=2`, `acks=all`**: it survives one broker failure while staying writable. `unclean.leader.election.enable` (default `false`) decides whether an out-of-sync replica may become leader when no in-sync one is left: `true` restores availability at the cost of losing the records it never received. Since Kafka 4.1, new clusters also enable **Eligible Leader Replicas** (KIP-966): replicas that dropped out of the ISR but are known to hold every committed record stay electable, which removes most situations where an unclean election was the only way back.

```python
class NotEnoughReplicas(Exception):
    pass


class Partition:
    """A tiny model of one partition: a leader, followers, the ISR and the acks rules."""

    def __init__(self, brokers: list[str], min_insync: int = 2):
        self.logs = {b: [] for b in brokers}
        self.leader = brokers[0]
        self.isr = set(brokers)
        self.min_insync = min_insync

    def produce(self, record: str, acks: str) -> None:
        if acks == "all" and len(self.isr) < self.min_insync:
            raise NotEnoughReplicas(f"ISR has {len(self.isr)} replicas, need {self.min_insync}")
        self.logs[self.leader].append(record)
        if acks == "all":
            # The leader only acknowledges once every in-sync follower has fetched the record.
            for broker in self.isr - {self.leader}:
                self.logs[broker].append(record)
        # acks=1: acknowledged now; followers copy it on their next fetch.

    def replicate(self) -> None:
        for broker in self.isr - {self.leader}:
            self.logs[broker] = list(self.logs[self.leader])

    def fail_leader(self) -> None:
        old = self.leader
        self.isr.discard(old)
        self.leader = sorted(self.isr)[0]          # a clean election picks an in-sync replica
        self.logs[old] = list(self.logs[self.leader])  # the old leader truncates when it returns


# acks=1: the leader acknowledges, then dies before replicating. The acknowledged record is gone.
p = Partition(["b1", "b2", "b3"])
p.produce("payment-1", acks="1")
p.fail_leader()
assert "payment-1" not in p.logs[p.leader]

# acks=all: the record is on every in-sync replica before the producer hears "success".
p = Partition(["b1", "b2", "b3"])
p.produce("payment-2", acks="all")
p.fail_leader()
assert "payment-2" in p.logs[p.leader]

# With only one replica left in sync, acks=all refuses the write rather than risk it.
p = Partition(["b1", "b2", "b3"])
p.isr = {"b1"}
try:
    p.produce("payment-3", acks="all")
    raise AssertionError("expected NotEnoughReplicas")
except NotEnoughReplicas as e:
    print("rejected:", e)
```

## Producers

A producer serialises the key and value, picks a partition, and adds the record to a **batch** for that partition. A batch is sent when it reaches `batch.size` or after waiting `linger.ms`; batches are compressed (`compression.type`) and several can be in flight per connection. Failed sends are retried until `delivery.timeout.ms` expires.

| Producer setting | Default (Kafka 4.x) | What it does |
|---|---|---|
| `acks` | `all` | Durability, see above |
| `enable.idempotence` | `true` | No duplicates or reordering from retries |
| `retries` | `2147483647` | Retry until `delivery.timeout.ms` |
| `delivery.timeout.ms` | `120000` (2 min) | Upper bound on reporting success or failure |
| `linger.ms` | `5` (was 0 before 4.0) | Wait up to 5 ms to fill a batch |
| `batch.size` | `16384` bytes | Batch size per partition |
| `max.in.flight.requests.per.connection` | `5` | Pipelining; idempotence keeps order up to 5 |
| `compression.type` | `none` | `lz4` or `zstd` usually pay for themselves |

**The idempotent producer** gets a producer id from the broker and numbers every record per partition. If a retry re-sends a batch the broker already wrote (the acknowledgement was lost, not the write), the broker sees a sequence number it has already stored and discards the duplicate. That gives exactly-once *writes per partition per producer session*, and preserves order even with up to five requests in flight. It does not dedupe two separate `send()` calls of the same business event; that is the application's job (a stable key plus an idempotent consumer).

**Throughput versus latency:** raise `linger.ms` (10–50 ms) and `batch.size`, enable `lz4`/`zstd`, and keep `acks=all`. For lowest latency keep `linger.ms` small. Throughput comes from batching and compression, not from weakening `acks`.

In Node.js, **KafkaJS** is the best-known pure-JavaScript client, but its last release (2.2.4) was in February 2023 and it is no longer actively developed. Confluent's **`@confluentinc/kafka-javascript`** (built on librdkafka, with a KafkaJS-style API to ease migration) is the maintained choice for new code. The KafkaJS API is still the clearest to read:

```ts typecheck
import { Kafka, logLevel } from 'kafkajs';

const kafka = new Kafka({ clientId: 'orders-service', brokers: ['localhost:9092'], logLevel: logLevel.WARN });

// Idempotent producer: the broker discards duplicates caused by retries. KafkaJS documents idempotence as
// experimental and requires acks -1; one request in flight per broker keeps per-partition order strict.
const producer = kafka.producer({ idempotent: true, maxInFlightRequests: 1 });
await producer.connect();

// The key decides the partition, so every event for order 42 stays in order.
await producer.send({
  topic: 'orders',
  acks: -1, // all in-sync replicas
  messages: [
    { key: 'order-42', value: JSON.stringify({ type: 'OrderPlaced', total: 120.5 }), headers: { 'event-version': '1' } },
    { key: 'order-42', value: JSON.stringify({ type: 'OrderPaid' }) },
  ],
});

await producer.disconnect();
```

The same producer in Python with Confluent's client (`confluent-kafka`, also librdkafka-based):

```python norun
from confluent_kafka import Producer

producer = Producer({
    "bootstrap.servers": "localhost:9092",
    "enable.idempotence": True,   # implies acks=all
    "linger.ms": 10,
    "compression.type": "zstd",
})

def on_delivery(err, msg):
    if err is not None:
        print("delivery failed:", err)
    else:
        print(f"stored at {msg.topic()}[{msg.partition()}] offset {msg.offset()}")

producer.produce("orders", key="order-42", value=b'{"type":"OrderPlaced"}', on_delivery=on_delivery)
producer.flush(10)  # wait for outstanding deliveries before exiting
```

## Consumers and consumer groups

A consumer runs a **poll loop**: fetch a batch of records, process them, commit progress, repeat. Consumers with the same `group.id` form a **consumer group**: each partition is assigned to exactly one member, so a group processes a topic in parallel without two members handling the same partition. The **maximum parallelism of a group is the number of partitions**; extra consumers sit idle. Different groups are independent: billing and analytics each get every record.

A **rebalance** reassigns partitions when a member joins, leaves, crashes, or the topic's partitions change. How disruptive it is depends on the protocol:

| Protocol | How a rebalance works | Notes |
|---|---|---|
| Classic, eager (`RangeAssignor`, `RoundRobinAssignor`) | Every member gives up all partitions, then the group reassigns | Stop-the-world pause for the whole group |
| Classic, cooperative (`CooperativeStickyAssignor`) | Only the partitions that must move are revoked, over two rounds | Others keep processing. The Java client's default list is `[Range, CooperativeSticky]`, so Range is used until you drop it (a rolling switch) |
| **New consumer protocol** (KIP-848, `group.protocol=consumer`) | The **broker** computes assignments (`uniform` or `range` assignor) and moves partitions incrementally; no global sync barrier | GA in Kafka 4.0; servers enable it, clients opt in |

**Static membership** (`group.instance.id`) gives a consumer a fixed identity, so a quick restart (a rolling deploy) does not trigger a rebalance as long as it rejoins within the session timeout.

Liveness has two clocks. **Heartbeats** prove the process is alive: miss them for `session.timeout.ms` (45 s) and the member is removed. **`max.poll.interval.ms`** (5 min) proves it is making progress: if processing one poll's records takes longer, the consumer is considered stuck, leaves the group, and its partitions move. The fix for "my consumer keeps getting kicked out" is fewer records per poll (`max.poll.records`, default 500), faster processing, or handing slow work off with care.

```python
def range_assign(partitions: int, consumers: list[str]) -> dict[str, list[int]]:
    """Kafka's RangeAssignor for one topic: contiguous ranges, the first members take the remainder."""
    members = sorted(consumers)
    per, extra = divmod(partitions, len(members))
    out, start = {}, 0
    for i, member in enumerate(members):
        count = per + (1 if i < extra else 0)
        out[member] = list(range(start, start + count))
        start += count
    return out


def sticky_join(current: dict[str, list[int]], new_member: str) -> dict[str, list[int]]:
    """Cooperative/sticky idea: keep everyone's partitions, move only enough to balance."""
    members = {m: list(ps) for m, ps in current.items()}
    members[new_member] = []
    total = sum(len(ps) for ps in members.values())
    target = total // len(members)
    for member in sorted(members, key=lambda m: -len(members[m])):
        while len(members[member]) > target + (1 if total % len(members) else 0) and len(members[new_member]) < target:
            members[new_member].append(members[member].pop())
    return members


def moved(before: dict[str, list[int]], after: dict[str, list[int]]) -> int:
    owner = {p: m for m, ps in before.items() for p in ps}
    return sum(1 for m, ps in after.items() for p in ps if owner.get(p) != m)


before = range_assign(12, ["c1", "c2", "c3"])
assert before == {"c1": [0, 1, 2, 3], "c2": [4, 5, 6, 7], "c3": [8, 9, 10, 11]}

eager = range_assign(12, ["c1", "c2", "c3", "c4"])
sticky = sticky_join(before, "c4")
assert sorted(len(ps) for ps in sticky.values()) == [3, 3, 3, 3]
print("partitions that change owner when c4 joins: range", moved(before, eager), "| sticky", moved(before, sticky))
assert moved(before, sticky) == 3 < moved(before, eager)
```

```text
partitions that change owner when c4 joins: range 6 | sticky 3
```

A consumer with **manual commits**, committing the next offset only after the record is processed:

```ts typecheck
import { Kafka } from 'kafkajs';

const kafka = new Kafka({ clientId: 'billing', brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'billing', sessionTimeout: 45_000 });

async function charge(orderId: string): Promise<void> {
  // An idempotent side effect: charging the same order twice must be a no-op (see the coding problems).
  void orderId;
}

await consumer.connect();
await consumer.subscribe({ topics: ['orders'], fromBeginning: true });
await consumer.run({
  autoCommit: false,
  eachMessage: async ({ topic, partition, message }) => {
    const event = JSON.parse(message.value?.toString() ?? '{}') as { type: string };
    if (event.type === 'OrderPlaced') await charge(message.key?.toString() ?? '');
    // Commit the NEXT offset to read, only after processing succeeded: at-least-once.
    await consumer.commitOffsets([{ topic, partition, offset: (BigInt(message.offset) + 1n).toString() }]);
  },
});
```

## Offsets and delivery guarantees

A group's **committed offset** for a partition is the offset of the **next** record to read. It is stored in the compacted `__consumer_offsets` topic. When a consumer starts with no committed offset, `auto.offset.reset` decides where it begins: `latest` (the default: only new records), `earliest` (from the beginning), or `none` (fail).

Where you commit relative to processing decides the guarantee:

| Guarantee | How | On a crash |
|---|---|---|
| **At most once** | Commit, then process | Records committed but not processed are lost |
| **At least once** | Process, then commit | Records processed but not committed are processed again |
| **Exactly once** (Kafka to Kafka) | Transactions: write outputs and the input offsets atomically, consumers read `read_committed` | Nothing lost, nothing duplicated inside Kafka |
| **Effectively once** (external side effects) | At least once **plus** an idempotent consumer (dedupe key, upsert, idempotency key) | Duplicates arrive but have no effect |

**Auto commit** (`enable.auto.commit=true`, every 5 s) commits the offsets returned by the previous poll when you call `poll()` again. If you finish processing a batch before polling again, that behaves as at least once; if you hand records to another thread and poll on, a crash can commit records that were never processed. For anything that matters: manual commits after processing, and idempotent handlers.

```python
def consume(log: list[str], committed: int, crash_at: int | None = None, commit_first: bool = False):
    """Process from the committed offset. If crash_at is set, crash at that offset between the two steps."""
    processed = []
    for offset in range(committed, len(log)):
        if commit_first:
            committed = offset + 1           # step 1: commit
            if offset == crash_at:
                return processed, committed  # crash before processing
            processed.append(log[offset])    # step 2: process
        else:
            processed.append(log[offset])    # step 1: process
            if offset == crash_at:
                return processed, committed  # crash before committing
            committed = offset + 1           # step 2: commit
    return processed, committed


log = [f"order-{i}" for i in range(6)]

# At least once: process, then commit. A crash after processing order-2 means it is processed again.
first, committed = consume(log, 0, crash_at=2)
second, _ = consume(log, committed)
assert first + second == ["order-0", "order-1", "order-2", "order-2", "order-3", "order-4", "order-5"]

# At most once: commit, then process. The same crash loses order-2 instead.
first, committed = consume(log, 0, crash_at=2, commit_first=True)
second, _ = consume(log, committed, commit_first=True)
assert first + second == ["order-0", "order-1", "order-3", "order-4", "order-5"]
print("at least once duplicates; at most once loses")
```

## Retention and compaction

Each topic has a `cleanup.policy`:

- **`delete`** (default): records older than `retention.ms` (default 7 days) or beyond `retention.bytes` (default unlimited) are removed, a whole **segment** (default 1 GiB) at a time. Use it for event streams you replay for a window.
- **`compact`**: Kafka keeps at least the **latest record for every key** and removes older ones in the background. A record with a key and a **null value** is a **tombstone**: it deletes the key, and the tombstone itself is removed after `delete.retention.ms` (default 1 day), so consumers that read slowly still see the delete. Use it for "current state" streams: a customer's latest profile, a changelog for a cache or a state store, CDC tables. `__consumer_offsets` is compacted.
- `compact,delete`: compacted, and old keys still expire after the retention time.

```python
def compact(records: list[tuple[str, str | None]]) -> list[tuple[int, str, str | None]]:
    """What a fully cleaned compacted log keeps: the latest record per key, with its original offset.
    Keys whose latest record is a tombstone disappear once delete.retention.ms has passed."""
    latest: dict[str, int] = {}
    for offset, (key, _) in enumerate(records):
        latest[key] = offset
    return [(o, k, v) for o, (k, v) in enumerate(records) if latest[k] == o and v is not None]


changes = [("cust-1", "Ann, NY"), ("cust-2", "Bo, LA"), ("cust-1", "Ann, SF"), ("cust-3", "Cy, TX"), ("cust-2", None)]
assert compact(changes) == [(2, "cust-1", "Ann, SF"), (3, "cust-3", "Cy, TX")]
# Offsets are kept: compaction removes records, it never renumbers the survivors.
```

## Kafka, queues and when not to use Kafka

| | Kafka | RabbitMQ | Cloud pub/sub (Pub/Sub, SNS+SQS) |
|---|---|---|---|
| Model | Replicated log, consumers track offsets | Broker routes messages to queues, deletes on ack | Managed topics and subscriptions |
| Ordering | Per partition | Per queue (with one consumer) | Optional ordering keys |
| Replay | Yes, within retention | No (streams excepted) | Limited (seek/snapshot features) |
| Strength | High-throughput event streams, many readers, replay, stream processing | Flexible routing, per-message acks, task queues, RPC | No servers to run, auto-scaling |

**Share groups** ("Queues for Kafka", KIP-932, production-ready in Kafka 4.2) add queue semantics on top of the log: members of a **share group** can consume the **same partition concurrently**, each record is acknowledged individually, a record is locked to one consumer while it works (`group.share.record.lock.duration.ms`, default 30 s) and is redelivered if not acknowledged, up to a delivery count (`group.share.delivery.count.limit`, default 5). You give up per-partition ordering in exchange for scaling consumers beyond the partition count, which suits job queues.

Kafka is the wrong tool for a low-volume task queue that needs per-message routing, priorities or delayed delivery (RabbitMQ fits better), for request/response, or for a small team that does not want to run or pay for a cluster. The deeper comparison, plus schemas, Connect, stream processing and operations, is in [Kafka in practice](#/kafka-practice).

## Interview questions

### What is Kafka, and how is it different from a traditional message queue? {core}

Kafka is a distributed, replicated, append-only log. Producers append records to topics, Kafka keeps them for a retention period whether or not they have been read, and each consumer group tracks its own offset. A traditional queue deletes a message once it is acknowledged and hands each message to one consumer. Because Kafka keeps the log, many independent services can read the same events, you can replay history after a bug fix, and throughput is very high because it is sequential disk I/O and batching.

The follow-up is usually "so when would you still use a queue?": per-message routing, priorities, delays, or a simple task queue at modest volume, where RabbitMQ or a cloud queue is simpler. Kafka 4.2's share groups narrow the gap for job queues.

### What is a partition, and why does Kafka have them? {core}

A partition is an ordered, append-only log; a topic is split into partitions spread across brokers. Partitions are how Kafka scales: writes spread over brokers, and a consumer group can have one active consumer per partition, so the partition count is the ceiling on a group's parallelism. They are also the unit of ordering and of replication, since each partition has its own leader and followers.

### How does Kafka decide which partition a record goes to?

If the producer names a partition, that one. Otherwise, if the record has a key, the default partitioner hashes the key with murmur2 and takes it modulo the partition count, so a key always maps to the same partition while the count is unchanged. If there is no key, the producer uses a sticky partition: it fills a batch for one partition, then switches, which batches well without overloading one partition. You can plug in a custom partitioner, for example to isolate a very large tenant.

### What ordering guarantees does Kafka give? {core}

Order is guaranteed only within a partition: records are stored and delivered in the order the leader appended them. There is no order across partitions. So you key records by whatever must stay ordered, such as an order id. The producer keeps that order even with retries because idempotence is on by default and allows up to five in-flight requests per connection. On the consumer side, order holds as long as one thread processes a partition sequentially; parallelising inside a partition gives it up unless you shard by key.

### What happens if you add partitions to an existing topic?

Existing data stays where it is, but the key-to-partition mapping changes, so new records for a key may land in a different partition than its older records. Consumers can then see a newer event for a key before an older one still queued in the old partition, and compacted topics end up with a key in two partitions. You cannot reduce partitions at all. So you size partitions with headroom up front; if you must grow, you plan it: accept brief reordering, drain per key, or create a new topic and migrate.

### Explain consumer groups. {core}

Consumers that share a `group.id` split a topic's partitions between them: each partition is read by exactly one member of the group at a time, so the group processes in parallel without duplicating work. Different groups are independent and each sees every record. If a member fails, its partitions are reassigned in a rebalance. More consumers than partitions leaves the extras idle, which is why the partition count limits parallelism.

### What triggers a rebalance, and how do you reduce its impact? {core}

A member joining or leaving, a member missing heartbeats for `session.timeout.ms`, a member exceeding `max.poll.interval.ms` between polls, or the subscribed partitions changing. To reduce the impact: use cooperative rebalancing or the new consumer protocol so only the partitions that must move are revoked; use static membership (`group.instance.id`) so rolling restarts don't trigger rebalances; keep processing per poll well inside `max.poll.interval.ms`; and commit offsets on revocation so the next owner doesn't redo work.

### What is the new consumer group protocol (KIP-848)? {deep}

It moves group coordination to the broker. Instead of every client stopping, sending its subscription to a group leader and waiting for a global sync, each consumer heartbeats its subscription to the group coordinator, which computes assignments with a server-side assignor (`uniform` or `range`) and moves partitions incrementally. Rebalances become faster and no longer stop the whole group. It is generally available since Kafka 4.0; servers enable it, and clients opt in with `group.protocol=consumer`. Client-side assignors and some classic settings don't apply to it.

### Explain offsets and committing. When would you disable auto commit? {core}

An offset is a record's position in a partition. A group commits, per partition, the offset of the next record it will read, and Kafka stores that in `__consumer_offsets`, so a restarted or reassigned consumer resumes there. Auto commit commits every five seconds the offsets returned by the previous poll, which is convenient but can commit records you haven't finished if processing happens off the poll thread. I disable it whenever processing has side effects that matter, and commit manually after processing succeeds, usually synchronously on shutdown or partition revocation and asynchronously in the loop.

### At-most-once, at-least-once, exactly-once: how do you get each? {core}

At most once: commit before processing; a crash loses records. At least once: process, then commit; a crash means some records are processed again, so handlers must be idempotent. Exactly once inside Kafka: the idempotent producer plus transactions, writing output records and the consumed offsets in one transaction, with downstream consumers on `isolation.level=read_committed`; Kafka Streams turns this on with `processing.guarantee=exactly_once_v2`. For effects outside Kafka, such as a database write or a payment call, you get effectively once with at-least-once delivery and an idempotent consumer, or the outbox pattern.

### What does `acks=all` mean, and how does it relate to `min.insync.replicas`? {core}

`acks=all` means the leader acknowledges a write only after every replica currently in the in-sync set has it. On its own, that set could shrink to just the leader, so `min.insync.replicas` sets the floor: with `min.insync.replicas=2`, a write is rejected with NotEnoughReplicas when fewer than two replicas are in sync. Replication factor 3, `min.insync.replicas=2` and `acks=all` is the standard durable setup: no acknowledged write is lost if one broker fails, and the partition stays writable. Since Kafka 3.0 the producer defaults are `acks=all` and idempotence on.

### What is the ISR, and what is unclean leader election? {deep}

The ISR is the set of replicas fully caught up with the leader: the leader plus followers that have fetched recently enough (governed by `replica.lag.time.max.ms`). Only ISR members are eligible to become leader in a clean election, which is why `acks=all` writes survive a leader failure. If every in-sync replica is lost, unclean leader election would let an out-of-sync replica take over: the partition becomes available again but loses the records that replica never received. It is off by default, choosing consistency over availability.

A deeper point: since Kafka 4.1, new clusters enable Eligible Leader Replicas (KIP-966). A replica that left the ISR but is known to hold every committed record stays electable, so a cluster that loses its last ISR member can often recover cleanly instead of choosing between downtime and data loss.

### What is the high watermark? {deep}

The high watermark is the offset just past the last record that every in-sync replica has: the smallest log end offset in the ISR. Consumers can only read below it. That protects them from reading a record that could vanish if the leader failed before followers copied it. The gap between the leader's log end offset and the high watermark is records written but not yet fully replicated.

### How does the idempotent producer work? {core}

The broker gives the producer a producer id, and the producer numbers every batch per partition with a sequence number. If a retry re-sends a batch the broker already stored, because the acknowledgement was lost rather than the write, the broker recognises the sequence number and drops the duplicate; a gap in the sequence is rejected so order is preserved. It is on by default and supports up to five in-flight requests per connection. Its scope is one producer session's retries: it doesn't stop your application from sending the same business event twice; transactions and idempotent consumers handle that.

### How do you tune a producer for throughput versus latency? {deep}

Throughput comes from batching and compression: raise `linger.ms` to 10–50 ms so batches fill, raise `batch.size`, enable `lz4` or `zstd`, and keep `acks=all`. For low latency, keep `linger.ms` small (the default became 5 ms in Kafka 4.0) and avoid huge batches. I wouldn't weaken `acks` to buy throughput: batching gives far more, and lost data is expensive. I'd measure with the producer's own metrics, such as batch size average, record queue time and request latency.

### What is KRaft, and why was ZooKeeper removed?

KRaft is Kafka's built-in metadata quorum: a small set of controller nodes running the Raft consensus protocol store cluster metadata, such as topics, partitions, leaders and configs, in an internal log and elect partition leaders. Previously that lived in ZooKeeper, a separate system to deploy, secure and scale, and metadata changes on failover were slow for clusters with many partitions. KRaft has been production-ready since 3.3, and Kafka 4.0 removed ZooKeeper entirely; a ZooKeeper cluster must migrate to KRaft on a 3.x release, usually 3.9, before upgrading to 4.x.

### Retention versus log compaction: when do you use each? {core}

Delete retention removes records after a time or size limit, a segment at a time; I use it for event streams that consumers process and maybe replay for a window, like clickstream or order events. Compaction keeps at least the latest record per key and deletes older versions; I use it when the topic represents current state, like a customer profile changelog, a cache feed or a Kafka Streams state store, so a new consumer can rebuild state by reading the topic from the start without replaying all history. You can combine them with `cleanup.policy=compact,delete`.

### What is a tombstone? {deep}

A record with a key and a null value on a compacted topic. It tells consumers the key was deleted, and compaction eventually removes earlier records for that key. The tombstone itself is kept for `delete.retention.ms`, one day by default, so slow consumers still see the delete before it disappears. If consumers rebuild state from the topic, they must treat a null value as "remove this key".

### Why does my consumer keep getting kicked out of its group?

Usually because processing one poll's worth of records takes longer than `max.poll.interval.ms`, five minutes by default: the consumer is treated as stuck, leaves the group, its partitions move, and the work it was doing gets redone by someone else. Fixes: lower `max.poll.records` so each poll is smaller, speed up processing or make external calls concurrent within the batch, or raise the interval if the work is legitimately slow. If heartbeats are the problem instead, look at long GC pauses or network issues against `session.timeout.ms`.

### What is consumer lag, and how do you monitor it? {core}

Lag is, per partition, the log end offset (strictly, the high watermark) minus the group's committed offset: how many records the group still has to process. Total lag and, more usefully, how long the oldest unprocessed record has waited tell you whether consumers keep up. I'd export it with a lag exporter or the cloud provider's metrics, alert on lag growing over time rather than on a fixed number, and look at per-partition lag to spot a hot partition or a stuck consumer.

### How is Kafka so fast?

It writes sequentially to an append-only log, which disks and SSDs handle very well, and leans on the operating system's page cache instead of its own cache. Producers and consumers batch records and compress whole batches. Brokers can send data from the page cache straight to the network socket without copying it through the application (zero-copy), when TLS isn't in the way. And partitions spread the load across brokers and consumers in parallel.

### What are share groups (Queues for Kafka)? {deep}

Share groups, from KIP-932 and production-ready in Kafka 4.2, give Kafka queue semantics. Members of a share group can consume the same partition concurrently; each record is locked to one consumer while it is being processed, acknowledged individually, and redelivered if the lock times out or the consumer releases it, up to a maximum delivery count. That lets you scale consumers beyond the partition count for job-style workloads. The trade-off is that you lose per-partition ordering.

### When would you not use Kafka?

When the workload is a modest task queue that needs per-message routing, priorities, delayed or scheduled delivery, or request/response: RabbitMQ or a cloud queue is simpler. When volume is small and the team doesn't want to operate or pay for a cluster: a managed queue or even a database table with SKIP LOCKED may be enough. And when you need strict global ordering across all events at high throughput, since Kafka orders per partition only. Kafka shines for high-volume event streams with many independent consumers, replay and stream processing.

## Coding problems

### Route records to partitions and prove per-key ordering {easy core}

Write `partition_for(key, num_partitions)` using any stable hash, then write `deliver(events, num_partitions)` that returns, per partition, the list of events in the order they were produced. Show that for every key, the order of its events is preserved.

Example: events `[("a", 1), ("b", 1), ("a", 2), ("b", 2), ("a", 3)]` with 2 partitions: every key's values come out as `1, 2, 3` within its partition.

#### Hints

1. A stable hash means the same key gives the same number in every run, so don't use Python's built-in `hash()` on strings (it is salted per process).
2. Each partition is just an append-only list; appending in production order is enough to preserve per-key order.
3. To check ordering, group each partition's events by key and compare with the original order for that key.

#### Solution

Use a deterministic hash (here CRC32; Kafka uses murmur2) and append each event to its partition's list. Order within a key is preserved because all of a key's events go to one partition and partitions are append-only.

```python
import zlib
from collections import defaultdict


def partition_for(key: str, num_partitions: int) -> int:
    return zlib.crc32(key.encode()) % num_partitions


def deliver(events: list[tuple[str, int]], num_partitions: int) -> dict[int, list[tuple[str, int]]]:
    partitions: dict[int, list[tuple[str, int]]] = defaultdict(list)
    for key, value in events:
        partitions[partition_for(key, num_partitions)].append((key, value))
    return dict(partitions)


def per_key_order_preserved(events, partitions) -> bool:
    expected = defaultdict(list)
    for key, value in events:
        expected[key].append(value)
    seen = defaultdict(list)
    for records in partitions.values():
        for key, value in records:
            seen[key].append(value)
    return all(seen[k] == expected[k] for k in expected)


events = [("a", 1), ("b", 1), ("a", 2), ("b", 2), ("a", 3)]
parts = deliver(events, 2)
assert per_key_order_preserved(events, parts)
# Each key lives in exactly one partition.
owners = defaultdict(set)
for p, records in parts.items():
    for key, _ in records:
        owners[key].add(p)
assert all(len(ps) == 1 for ps in owners.values())
assert deliver([], 3) == {}
```

Complexity: O(n) time and space for n events.

#### Follow-ups

- **What breaks if `num_partitions` changes from 2 to 3 mid-stream?** Keys can move, so a key's later events may sit in another partition and be consumed before earlier ones.
- **How do you handle one key that gets most of the traffic?** Split it with a finer key if its events don't all need mutual ordering, or give it a dedicated topic or partition with a custom partitioner.

### Make an at-least-once consumer idempotent {medium core}

Payments arrive from a Kafka topic with at-least-once delivery, so the same event can be delivered more than once (after a crash or a rebalance). Each event has an `event_id`, an `account` and an `amount`. Write a handler that applies each event's amount to the account balance **exactly once**, no matter how many times it is delivered, and that records which events it has applied in the same "transaction" as the balance change.

Example: delivering `e1 (+100)`, `e2 (-30)`, then `e1` again leaves the balance at 70.

#### Hints

1. You need to remember which event ids have already been applied.
2. If you update the balance and the "seen" set in two separate steps, a crash between them breaks the guarantee. Make them one atomic step.
3. With a real database, that is one transaction: insert the event id into a table with a unique constraint, and update the balance; a duplicate insert fails and rolls back.

#### Solution

Store processed event ids alongside the balances and update both atomically. With SQLite, a primary key on `event_id` turns a duplicate into an `IntegrityError`, and the transaction ensures the balance change and the id insert commit together or not at all.

```python
import sqlite3


def connect() -> sqlite3.Connection:
    db = sqlite3.connect(":memory:", isolation_level=None)
    db.execute("CREATE TABLE balances (account TEXT PRIMARY KEY, balance INTEGER NOT NULL)")
    db.execute("CREATE TABLE processed (event_id TEXT PRIMARY KEY)")
    return db


def handle(db: sqlite3.Connection, event: dict) -> bool:
    """Apply the event once. Returns True if applied, False if it was a duplicate."""
    try:
        db.execute("BEGIN")
        db.execute("INSERT INTO processed (event_id) VALUES (?)", (event["event_id"],))
        db.execute(
            "INSERT INTO balances (account, balance) VALUES (?, ?) "
            "ON CONFLICT(account) DO UPDATE SET balance = balance + excluded.balance",
            (event["account"], event["amount"]),
        )
        db.execute("COMMIT")
        return True
    except sqlite3.IntegrityError:
        db.execute("ROLLBACK")
        return False


db = connect()
deliveries = [
    {"event_id": "e1", "account": "acc-1", "amount": 100},
    {"event_id": "e2", "account": "acc-1", "amount": -30},
    {"event_id": "e1", "account": "acc-1", "amount": 100},  # redelivered after a rebalance
]
results = [handle(db, e) for e in deliveries]
assert results == [True, True, False]
assert db.execute("SELECT balance FROM balances WHERE account = 'acc-1'").fetchone() == (70,)
assert db.execute("SELECT COUNT(*) FROM processed").fetchone() == (2,)
```

Complexity: O(1) per event (indexed lookups); the processed table grows with events, so in production you would expire ids older than the redelivery window or key them by `(partition, offset)` per consumer group.

#### Follow-ups

- **Why not just dedupe in memory?** The set is lost on restart or when the partition moves to another consumer, which is exactly when redeliveries happen.
- **What if the side effect is a call to an external payment API?** Pass the event id as the API's idempotency key, so the provider dedupes retries.
- **Could you use `(partition, offset)` instead of an event id?** Yes for redeliveries of the same record, but not if the producer sent the same business event twice as two records.

### Report consumer lag per partition {easy}

Given a topic's log end offsets per partition and a consumer group's committed offsets, return the lag per partition and the total. A partition with no committed offset has lag equal to its whole log under `auto.offset.reset=earliest`. Write it in TypeScript.

Example: end offsets `{0: 120, 1: 80, 2: 50}`, committed `{0: 100, 1: 80}` gives lag `{0: 20, 1: 0, 2: 50}` and total 70.

#### Hints

1. Lag for one partition is end offset minus committed offset.
2. A missing committed offset means the group starts at offset 0 under `earliest`.
3. Guard against a committed offset larger than the end offset (stale metadata): clamp at 0.

#### Solution

Iterate over the partitions in the end-offset map, subtract the committed offset (or 0), clamp at zero, and sum.

```ts
import assert from 'node:assert/strict';

type Offsets = Record<number, number>;

function consumerLag(endOffsets: Offsets, committed: Offsets): { perPartition: Offsets; total: number } {
  const perPartition: Offsets = {};
  let total = 0;
  for (const [partition, end] of Object.entries(endOffsets)) {
    const p = Number(partition);
    const lag = Math.max(0, end - (committed[p] ?? 0));
    perPartition[p] = lag;
    total += lag;
  }
  return { perPartition, total };
}

assert.deepEqual(consumerLag({ 0: 120, 1: 80, 2: 50 }, { 0: 100, 1: 80 }), { perPartition: { 0: 20, 1: 0, 2: 50 }, total: 70 });
assert.deepEqual(consumerLag({ 0: 10 }, { 0: 12 }), { perPartition: { 0: 0 }, total: 0 });
assert.deepEqual(consumerLag({}, {}), { perPartition: {}, total: 0 });
```

Complexity: O(p) for p partitions.

#### Follow-ups

- **Why is "records behind" not enough for alerting?** A busy partition can be 10,000 records behind and catch up in a second; alert on lag trending up, or on the age of the oldest unprocessed record.
- **Where do these numbers come from?** End offsets from the admin client's list-offsets call, committed offsets from the group's offsets in `__consumer_offsets` (an admin "list consumer group offsets" call).

### Implement the range assignor for several topics {medium}

Kafka's `RangeAssignor` assigns each topic independently: sort the consumers subscribed to the topic, give each a contiguous range of `partitions // consumers` partitions, and give the first `partitions % consumers` consumers one extra. Write `assign(subscriptions, partitions_per_topic)` returning, per consumer, a sorted list of `(topic, partition)` pairs.

Example: consumers `c1` and `c2` both subscribe to `t1` (3 partitions) and `t2` (3 partitions): `c1` gets `t1-0, t1-1, t2-0, t2-1`; `c2` gets `t1-2, t2-2`.

#### Hints

1. Work topic by topic: find which consumers subscribe to it, then sort them.
2. `divmod(partitions, len(consumers))` gives the base size and how many members get an extra one.
3. Notice the imbalance in the example: the first consumer gets the extra partition of every topic. That is a known weakness of range assignment with many topics.

#### Solution

For each topic, take the sorted list of subscribed consumers and walk through the partitions, handing out contiguous ranges.

```python
from collections import defaultdict


def assign(subscriptions: dict[str, set[str]], partitions_per_topic: dict[str, int]) -> dict[str, list[tuple[str, int]]]:
    result: dict[str, list[tuple[str, int]]] = {c: [] for c in subscriptions}
    by_topic: dict[str, list[str]] = defaultdict(list)
    for consumer, topics in subscriptions.items():
        for topic in topics:
            by_topic[topic].append(consumer)
    for topic, consumers in by_topic.items():
        members = sorted(consumers)
        per, extra = divmod(partitions_per_topic.get(topic, 0), len(members))
        start = 0
        for i, member in enumerate(members):
            count = per + (1 if i < extra else 0)
            result[member].extend((topic, p) for p in range(start, start + count))
            start += count
    return {c: sorted(ps) for c, ps in result.items()}


subs = {"c1": {"t1", "t2"}, "c2": {"t1", "t2"}}
out = assign(subs, {"t1": 3, "t2": 3})
assert out == {"c1": [("t1", 0), ("t1", 1), ("t2", 0), ("t2", 1)], "c2": [("t1", 2), ("t2", 2)]}

# A consumer only gets partitions of topics it subscribes to.
out = assign({"c1": {"t1"}, "c2": {"t1", "t2"}}, {"t1": 2, "t2": 2})
assert out == {"c1": [("t1", 0)], "c2": [("t1", 1), ("t2", 0), ("t2", 1)]}

# More consumers than partitions: someone gets nothing.
assert assign({"a": {"t"}, "b": {"t"}, "c": {"t"}}, {"t": 2}) == {"a": [("t", 0)], "b": [("t", 1)], "c": []}
```

Complexity: O(total partitions + consumers × topics), plus sorting.

#### Follow-ups

- **How does round-robin assignment differ?** It lays out all partitions of all topics and deals them out one by one, which balances better across many topics when subscriptions are the same.
- **Why did Kafka add sticky and cooperative assignors?** To keep most partitions where they are during a rebalance, so consumers keep their caches and local state and the group doesn't stop entirely.

### Compact a changelog {medium}

Given a list of `(key, value)` records in offset order, where `value is None` is a tombstone, return what a compacted topic would retain after cleaning: the latest record per key, with its original offset, and no tombstones older than `tombstone_retention` records before the end of the log. Tombstones newer than that are kept so slow consumers still see the delete.

Example: `[("a", "1"), ("b", "1"), ("a", "2"), ("b", None)]` with a large retention keeps `(2, "a", "2")` and `(3, "b", None)`.

#### Hints

1. One pass to find the latest offset for each key.
2. A second pass keeps a record only if it is that key's latest.
3. For tombstones, also check their age: `len(records) - 1 - offset` compared with the retention.

#### Solution

Record the last offset of every key, then keep each key's latest record. Drop a tombstone only when it is older than the retention window, measured here in records from the end of the log (Kafka measures `delete.retention.ms` in time).

```python
def compact(records: list[tuple[str, str | None]], tombstone_retention: int) -> list[tuple[int, str, str | None]]:
    latest = {key: offset for offset, (key, _) in enumerate(records)}
    end = len(records) - 1
    kept = []
    for offset, (key, value) in enumerate(records):
        if latest[key] != offset:
            continue
        if value is None and end - offset > tombstone_retention:
            continue
        kept.append((offset, key, value))
    return kept


log = [("a", "1"), ("b", "1"), ("a", "2"), ("b", None)]
assert compact(log, tombstone_retention=10) == [(2, "a", "2"), (3, "b", None)]
assert compact(log, tombstone_retention=0) == [(2, "a", "2"), (3, "b", None)]  # the newest record is never "old"
older = log + [("c", "1"), ("c", "2")]
assert compact(older, tombstone_retention=1) == [(2, "a", "2"), (5, "c", "2")]  # b's tombstone aged out
assert compact([], 5) == []
```

Complexity: O(n) time, O(k) extra space for k distinct keys.

#### Follow-ups

- **Does compaction guarantee only one record per key at any moment?** No. It runs in the background on closed segments, so consumers can still see older values for a key that hasn't been cleaned yet; they must handle seeing several.
- **Why keep offsets instead of renumbering?** Offsets are positions consumers commit; renumbering would break every committed position.
