---
title: "RabbitMQ in practice: patterns, reliability and operations"
goal: Design real systems on RabbitMQ (work queues, pub/sub, RPC, delayed retries, ordering), make them reliable end to end, and run and monitor a cluster with confidence.
minutes: 65
---

Knowing the AMQP model is half the interview; the other half is **using it well**. Expect design questions ("how would you build an order pipeline on RabbitMQ?"), failure questions ("a consumer crashes halfway, a message always fails, the broker runs out of disk") and comparison questions ("why RabbitMQ and not Kafka?"). Strong answers name the pattern, the failure mode it handles and the setting that makes it work.

The thread that runs through this chapter: **RabbitMQ gives you at-least-once delivery, so design every consumer to be idempotent, every retry to be delayed and bounded, and every failure to end somewhere a person can see it.**

Read [RabbitMQ fundamentals](#/rabbitmq-core) first. The portfolio's **RabbitMQ tutorial** (in Study Hub) builds these patterns into ShopFlow, a small order pipeline you can run.

## The patterns at a glance

| Pattern | Topology | Use it for |
|---|---|---|
| **Work queue** | One queue, several competing consumers | Spreading slow jobs (resize images, charge cards) across workers |
| **Publish/subscribe** | Fanout or topic exchange, one queue per subscribing service | Every interested service reacts to the same event |
| **Routing** | Direct or topic exchange, bindings by key or pattern | Sending each message only to the services or regions that handle it |
| **RPC** | Request queue plus a reply queue, `reply_to` and `correlation_id` | A load-balanced service that must answer (quotes, pricing) |
| **Event-driven choreography** | Services publish facts ("order placed"), others react and publish their own | Long workflows without a central coordinator |
| **Delayed retry and parking lot** | Dead-letter exchange plus TTL retry queues, and a final dead queue | Failures that might succeed later, and failures that never will |

```text
 order API ──"order.created.eu"──▶ [shop: topic] ──order.created.*──▶ [payments]  ──▶ payment workers ×3
                                         ├────────order.#──────────▶ [notifications] ──▶ email service
                                         └────────#.eu─────────────▶ [eu-warehouse]  ──▶ fulfilment (EU)
 payment worker ──"payment.failed"──▶ [shop]   … and every failed message ends in [*.dead] via a DLX
```

## Work queues: competing consumers done right

- **Scale by adding consumers.** Each message goes to exactly one consumer, so throughput grows with consumers until the downstream (a database, a payment gateway) becomes the bottleneck. On Kubernetes, scale workers on queue depth (for example with KEDA's RabbitMQ scaler).
- **Manual acks after the work**, so a crash redelivers instead of losing.
- **Prefetch** sized to the job: low (1–10) for slow or uneven jobs so one worker can't hoard them, higher for fast uniform jobs.
- **Quorum queue** for anything important, with a delivery limit and a dead-letter exchange.
- **Order is not preserved** across competing consumers: two messages for the same order can be processed at the same time by different workers. If that matters, see Ordering below.

## Publish/subscribe and routing

Each subscribing **service** gets its own durable, named queue bound to the exchange (`notifications`, `analytics`). Several instances of the same service then share that queue as competing consumers, so each event is handled once per service, not once per instance. A per-instance live feed (a dashboard tab, a WebSocket server) instead uses an **exclusive, server-named** queue that disappears when the instance does.

**Topology as code:** declare exchanges, queues and bindings on startup in every service that uses them (declaring is idempotent), or load them from a definitions file at broker boot. Set operational arguments such as dead-lettering, length limits and delivery limits by **policy** rather than hard-coding them in queue arguments, because policies can be changed later without deleting the queue. Name things predictably: `domain.event.region` routing keys, `service.purpose` queue names, `.dlx` and `.dead` suffixes.

## RPC over RabbitMQ

The client sends a request with two properties: **`reply_to`**, the queue the answer should go to, and **`correlation_id`**, a unique id the server copies into the reply so the client can match answers to questions. Several server instances consume the request queue as competing consumers, so RPC load-balances for free.

- **Always time out.** If no server is running, the request just waits in the queue. Give up after a deadline and set the request's `expiration` so the broker drops stale requests nobody will wait for.
- **Direct reply-to:** instead of declaring a reply queue, consume from the pseudo-queue `amq.rabbitmq.reply-to` in **no-ack** mode and publish the request on the same channel with `reply_to` set to it. It's cheaper, but replies are at-most-once: if the client disconnects, the reply is dropped, so the client must time out and retry.
- **Use it sparingly.** RPC over a broker adds latency and couples the caller to an answer. For workflows ("order placed → packed → shipped"), publish events and let services react.

## Reliability end to end

A message crosses three handoffs, and each needs its own safeguard:

| Handoff | What can go wrong | Safeguard |
|---|---|---|
| Producer → broker | Network drop, broker crash before storing, no queue matches | Publisher confirms; `mandatory` with a return handler or an alternate exchange; retry unconfirmed publishes |
| Inside the broker | Restart, lost disk or node | Durable queue + persistent message; quorum queues replicate across nodes |
| Broker → consumer | Consumer crashes mid-processing | Manual ack after the work; idempotent processing because redelivery happens |

Two problems remain after that:

- **Duplicates.** Retried publishes and redeliveries mean a consumer can see a message twice. Make the effect idempotent: record the `message_id` in the same database transaction as the side effect, with a unique constraint, and skip ids already recorded.
- **The dual write.** A service that writes to its database and then publishes can crash in between, losing the event, or publish and then fail to commit. The fix is the **transactional outbox**: write the event to an outbox table in the same transaction as the data, and let a relay publish from the outbox with confirms. See [the outbox pattern](#/task-queues/s-the-dual-write-problem-and-the-outbox-pattern).

## Retries, delays and poison messages

Not every failure is the same. A declined card will never succeed; a gateway timeout might succeed in a few seconds. Treat them differently:

- **Never requeue immediately in a loop.** `nack` with requeue redelivers at once, so a message that always fails becomes a hot loop that burns CPU and blocks the queue. Quorum queues stop this with the **delivery limit** (20 by default): after that the message is dead-lettered. Since 4.3 the limit counts only failed deliveries (a `basic.reject` with requeue, or a consumer crash); a `basic.nack` with requeue no longer counts, so use `reject` for failures you want the limit to catch.
- **Delayed retry with TTL queues** (works on every version): the worker publishes a copy of the failed message, with its own attempt counter in a header, to a retry queue that has a queue-level TTL and a dead-letter exchange pointing back at the main queue, and acks the original only after the broker confirms the copy. When the TTL expires the message flows back. Use one retry queue per delay (`retry.5s`, `retry.30s`, `retry.2m`) so every message in a queue expires in arrival order.
- **Built-in delayed retry** (RabbitMQ 4.3, quorum queues): `x-delayed-retry-type` (`failed`, `returned` or `all`) with `x-delayed-retry-min` and `x-delayed-retry-max` in milliseconds (or the matching policy keys) makes the queue hold a returned message aside and redeliver it after a delay that grows linearly with the delivery count, `min × delivery count`, capped at `max`, with no extra queues.
- **Parking lot:** permanent failures and exhausted retries go to a `.dead` queue that someone looks at, with an alert on its depth. Fix the cause, then **redrive** the messages (a shovel or a small script moves them back).
- The community **delayed-message-exchange plugin** is deprecated and archived; don't build new designs on it.

```text
 [payments] ──consumer fails, transient──▶ publish copy (x-retry: 1) ──▶ [payments.retry.5s]  (TTL 5s, no consumer)
     ▲                                                                        │ expires → DLX
     └────────────────────────────────────────────────────────────────────────┘
 [payments] ──permanent failure, or retries used up──▶ nack(requeue=false) ──DLX──▶ [payments.dead]
```

```ts typecheck
import { connect, type Channel, type ConfirmChannel, type ConsumeMessage } from 'amqplib';

const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];

const conn = await connect(process.env.AMQP_URL ?? 'amqp://localhost');
const pub = await conn.createConfirmChannel(); // retry copies are published (and confirmed) here…
const sub = await conn.createChannel(); // …and work is consumed here

await pub.assertExchange('payments.dlx', 'direct', { durable: true });
await pub.assertQueue('payments', {
  durable: true,
  deadLetterExchange: 'payments.dlx',
  deadLetterRoutingKey: 'dead',
  arguments: { 'x-queue-type': 'quorum' },
});
await pub.assertQueue('payments.dead', { durable: true, arguments: { 'x-queue-type': 'quorum' } });
await pub.bindQueue('payments.dead', 'payments.dlx', 'dead');
for (const ms of RETRY_DELAYS_MS) {
  // No consumers: messages wait here, then dead-letter back into "payments" via the default exchange ('').
  await pub.assertQueue(`payments.retry.${ms}`, {
    durable: true,
    messageTtl: ms,
    deadLetterExchange: '',
    deadLetterRoutingKey: 'payments',
    arguments: { 'x-queue-type': 'quorum' },
  });
}

class PermanentError extends Error {}

/** Publish on a confirm channel and resolve once the broker has taken responsibility for the message. */
function publishConfirmed(channel: ConfirmChannel, queue: string, msg: ConsumeMessage, headers: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    channel.sendToQueue(queue, msg.content, { persistent: true, messageId: msg.properties.messageId, headers }, (err) =>
      err ? reject(err) : resolve(),
    );
  });
}

async function handle(channel: Channel, confirms: ConfirmChannel, msg: ConsumeMessage, work: (body: unknown) => Promise<void>) {
  const attempt = Number(msg.properties.headers?.['x-retry'] ?? 0);
  try {
    await work(JSON.parse(msg.content.toString()));
    channel.ack(msg);
  } catch (err) {
    // Malformed JSON will never parse, so it is a permanent failure too.
    if (err instanceof PermanentError || err instanceof SyntaxError || attempt >= RETRY_DELAYS_MS.length) {
      channel.nack(msg, false, false); // to payments.dead through the DLX
      return;
    }
    try {
      const retryQueue = `payments.retry.${RETRY_DELAYS_MS[attempt]}`;
      await publishConfirmed(confirms, retryQueue, msg, { ...msg.properties.headers, 'x-retry': attempt + 1 });
      channel.ack(msg); // only now: acking before the confirm could lose the message in a crash
    } catch {
      channel.nack(msg, false, true); // the copy wasn't confirmed: give the original back
    }
  }
}

await sub.prefetch(10);
await sub.consume('payments', (msg) => {
  if (msg) void handle(sub, pub, msg, async () => {});
});
```

## Ordering

A single queue is FIFO: messages published on one channel are delivered in that order. Order breaks when there are **competing consumers** (two workers process neighbouring messages at once), on **requeue** (a redelivered message comes back after newer ones were already handled), with **priorities**, and with **several publishers** (there's no global order between them).

When per-entity order matters (all events for one order in sequence), options are:

1. **Single active consumer** on the queue: one consumer at a time, automatic failover. Simple, but one consumer's throughput.
2. **Partition by key:** N queues, each with a single active consumer, and route each entity's messages to the same queue by hashing its id. The consistent-hash exchange plugin does the hashing in the broker (its ring lives in memory, so a key can map to a different queue after a node restart); or the producer picks the queue deterministically.
3. **Streams**, with single active consumer or super streams (partitioned streams), when you also want replay.

And design consumers to tolerate reordering where possible: carry a version or sequence number and ignore events older than what you already applied.

## Clusters, high availability and multiple sites

- **Clustering:** nodes share metadata (exchanges, queues, bindings, users). Since 4.2 new clusters store it in **Khepri**, a Raft-based store, and from 4.3 Khepri is the only option, which replaced the old partition-handling modes.
- **Quorum queues** replicate each queue's messages across 3 nodes by default (5 tolerates two failures; more than 7 isn't recommended). Each queue has a leader that handles its traffic, so spread leaders across nodes.
- **Clients connect to any node,** usually through a load balancer, and must reconnect and re-declare their topology and consumers after a failover.
- **Across data centres:** don't stretch one cluster over a WAN. Link separate clusters with **federation** (an exchange or queue in one cluster receives messages from another, asynchronously, tolerant of slow links) or **shovels** (a client inside the broker that moves messages from a source to a destination, used for migrations and redrives as well).
- **Upgrades:** rolling upgrades between adjacent versions, enabling feature flags when done; for big jumps, a blue/green deployment with a second cluster and a shovel or federation draining the old one.

## Monitoring and operations

| Watch | Why | Alert when |
|---|---|---|
| Queue depth (ready) | Backlog: consumers can't keep up | It grows for minutes, or a `.dead` queue has anything in it |
| Unacked messages | Work in progress | It sits at `consumers × prefetch` for long: consumers are stuck or slow |
| Publish, deliver and ack rates | Throughput and lag | Publish rate exceeds ack rate for a sustained period |
| Redelivery rate | Failing or crashing consumers | A rising share of deliveries are redeliveries |
| Consumers per queue | Nobody listening | A queue with a backlog has zero consumers |
| Connections and channels | Churn and leaks | Connections opened and closed per second spike, or counts grow without bound |
| Memory, disk, file descriptors | Resource alarms block publishers | Approaching the memory watermark (60% of RAM by default) or the disk limit |

- **Prometheus and Grafana** are the recommended monitoring stack: the `rabbitmq_prometheus` plugin serves metrics on port 15692, and RabbitMQ publishes Grafana dashboards. The management UI (port 15672) is great for inspection and one-off actions, but its built-in metrics collection is deprecated in favour of Prometheus.
- **Raise the disk free limit** from the 50 MB default to something meaningful in production.
- **CLI:** `rabbitmq-diagnostics` for health checks (`check_running`, `check_port_connectivity`, alarms), `rabbitmqctl list_queues name messages_ready messages_unacknowledged consumers`, and `rabbitmq-diagnostics check_if_any_deprecated_features_are_used` before an upgrade.
- **Large messages:** the default maximum message size is 16 MiB. Don't push files through the broker: store the payload in object storage and send a reference (the claim-check pattern).

## RabbitMQ, Kafka or a cloud queue?

| | RabbitMQ | Kafka | Cloud pub/sub (Pub/Sub, SNS+SQS, Service Bus) |
|---|---|---|---|
| Model | Smart broker: exchanges route copies into queues | Partitioned, replicated log; consumers track offsets | Managed topics and subscriptions |
| After consumption | Deleted on ack (streams keep it) | Kept for the retention period; replayable | Deleted on ack (some offer replay windows) |
| Routing | Rich: direct, topic, headers, alternate exchanges | By topic and partition key only | Topics, subscriptions, filters |
| Per-message features | Acks, nack, TTL, priorities, dead-lettering, delivery limits | Offsets per partition; retries and DLQs are application patterns | Ack deadlines, retries, dead-letter topics |
| Ordering | Per queue (with one consumer) | Per partition | Varies (ordering keys, sessions) |
| Sweet spot | Task distribution, routing, request/reply, many small flows | High-throughput event streaming, event sourcing, many independent readers | Not running a broker at all |

A good answer: "RabbitMQ when I need routing, per-message acks and retries for work distribution; Kafka when I need a durable, replayable event log read by many consumers at high volume; a managed cloud service when operations cost matters more than features." RabbitMQ streams narrow the gap for replay. See [Kafka fundamentals](#/kafka-core) for the other side.

## Clients and hosting

- **Node.js:** `amqplib` (2.x bundles TypeScript types and can recover connections itself with `connect(url, { recovery })`). Keep one connection per process; consume and publish on separate channels.
- **Python:** `pika` (simple, synchronous; a connection must stay on one thread) or `aio-pika` for asyncio services (its robust connection reconnects and restores topology).
- **Java and Spring:** the official Java client, and Spring AMQP (`spring-rabbit`) in Spring applications.
- **Hosting:** CloudAMQP and Amazon MQ for RabbitMQ are managed services; on Kubernetes, the RabbitMQ Cluster Operator. Azure and Google Cloud have no first-party RabbitMQ service; their native equivalents are Service Bus and Pub/Sub.
- **Testing:** unit-test handlers without a broker, and run integration tests against a real broker in a container (Testcontainers has a RabbitMQ module). See [Testing](#/testing).

**Your angle:** RabbitMQ is not on your resume, so don't claim production experience. What you can say, once true: you built the portfolio's ShopFlow pipeline (topic routing, confirms, quorum queues, dead-letter retries, RPC) to learn it end to end. Connect it to production work you did: the Labcorp workflows you analysed at The Dot Corp ran background jobs and orchestration, and the external submission APIs at Quantiphi needed the same thinking about retries and duplicates.

## Interview questions

### How would you design a reliable order pipeline on RabbitMQ? {core}

The order API writes the order and an outbox event in one database transaction, and a relay publishes the event to a durable topic exchange with publisher confirms. Each downstream service (payments, notifications, fulfilment) has its own quorum queue bound with the patterns it needs, a dead-letter exchange, and a delivery limit. Workers consume with manual acks and a sensible prefetch, process idempotently by recording each message id in the same transaction as their side effect, retry transient failures through delayed retry queues, and send permanent failures to a parking-lot queue with an alert. That gives at-least-once delivery with no lost orders and no double charges.

### How do you implement a work queue, and how does it scale? {core}

One durable queue, several consumers on it: RabbitMQ gives each message to exactly one of them, so adding consumers adds throughput until the downstream system saturates. Consumers use manual acks so a crash redelivers the job, and a prefetch that fits the job: low for slow or uneven jobs so nobody hoards work, higher for fast ones. I'd autoscale workers on queue depth, and use a quorum queue with a delivery limit and dead-letter exchange so a bad message can't block everyone.

### How do several services each receive every event? {core}

Publish to a fanout or topic exchange and give each subscribing service its own durable queue bound to that exchange. Each service's instances share their service's queue as competing consumers, so every service sees every event once, and adding a new subscriber is a new queue and binding with no producer change. For per-instance feeds, like a dashboard, use an exclusive server-named queue that disappears with the instance.

### How do you implement request/reply (RPC) over RabbitMQ, and what are the drawbacks? {core}

The client publishes the request with `reply_to` set to its reply queue and a unique `correlation_id`; a server consumes the request queue, does the work and publishes the answer to the `reply_to` queue with the same correlation id; the client matches replies by id. Several servers on the request queue share the load. Drawbacks: added latency, temporal coupling (the caller waits on an answer), and requests piling up when no server runs, so the client must always time out and set an expiration on requests. For workflows I prefer publishing events over RPC.

### What is direct reply-to, and what are its caveats? {deep}

It's a shortcut that avoids declaring a reply queue: the client consumes from the pseudo-queue `amq.rabbitmq.reply-to` in no-ack mode and sends requests on the same channel with `reply_to` set to it; RabbitMQ routes replies straight back to that channel. It's cheaper for many short calls, but replies are at-most-once: if the client disconnects, the reply is dropped, and there's only one such consumer per channel. So the client needs a timeout and a retry, and the operation should be safe to retry.

### How do you make a consumer idempotent? {core}

Give every message a stable id, set by the producer from the business identity (the order id plus the event type), not generated per send. The consumer records the id in a processed-messages table with a unique constraint, in the same database transaction as the side effect; if the insert conflicts, the message was already handled, so it acks and skips. Where possible I also make the operation naturally idempotent, like an upsert or "set status to shipped" instead of "increment".

### How do you write to the database and publish an event without losing either? {core}

That's the dual-write problem: the service can crash between committing and publishing, or publish and then fail to commit. The standard fix is the transactional outbox: insert the event into an outbox table in the same transaction as the business data, and have a relay read unpublished outbox rows, publish them with publisher confirms, and mark them published. Delivery becomes at-least-once, so consumers stay idempotent. Change data capture on the outbox table is an alternative to polling.

### How do you implement retries with a delay? {core}

I separate transient failures from permanent ones. For transient ones, the worker publishes a copy of the message, with an attempt counter in its own header, to a retry queue that has a queue-level TTL and a dead-letter exchange pointing back at the main queue, and acks the original once the broker confirms the copy; when the TTL expires the message flows back for another try. I use one retry queue per delay so messages expire in order, and an increasing delay per attempt. After the last attempt, or on a permanent error, the message is rejected without requeue into a parking-lot queue. On RabbitMQ 4.3, quorum queues can also do delayed retries natively with `x-delayed-retry-type`.

### What is a poison message, and how do you stop it looping? {core}

A poison message is one that always makes the consumer fail, such as malformed data or a bug-triggering edge case. With immediate requeue it's redelivered forever, burning CPU and blocking the queue. Defences: never requeue in a tight loop; use quorum queues, whose delivery limit (20 by default) dead-letters a message after too many failed deliveries; catch permanent errors and reject without requeue; and send them to a parking-lot queue with an alert, then fix and redrive.

One 4.3 detail: the delivery limit now counts only failed deliveries, meaning a `basic.reject` with requeue or a consumer crash. A `basic.nack` with requeue is treated as a deliberate return and doesn't count, so a consumer that nacks forever is not caught by the limit. 4.3's built-in delayed retry (`x-delayed-retry-type`) also spaces out redeliveries.

### How do you preserve message order? {deep}

A queue is FIFO, but competing consumers, requeues, priorities and multiple publishers all break order. For per-entity ordering I partition: hash the entity id to one of N queues (the consistent-hash exchange can do this in the broker), and give each queue a single active consumer, so each entity's messages are processed in sequence while different entities run in parallel. Streams with single active consumer are another option when replay matters. I also make consumers tolerant: carry a version and ignore stale events.

### How do you scale and make RabbitMQ highly available? {core}

Run a cluster of three or five nodes, put important data in quorum queues so each queue is replicated by Raft across three nodes by default and survives losing a node, and spread queue leaders across nodes. Clients connect through a load balancer to any node and must reconnect and re-declare after a failover. Throughput scales with more queues and consumers rather than one huge queue, because each queue is handled by one leader. Across data centres I link separate clusters with federation or shovels instead of stretching a cluster over a WAN.

### What is the difference between federation and a shovel? {deep}

Both move messages between brokers. Federation links exchanges or queues: a federated exchange in one cluster receives messages published to an upstream exchange in another, asynchronously and tolerant of slow or unreliable links, which suits multi-site topologies. A shovel is a simple client inside the broker that consumes from a source queue and republishes to a destination, which suits one-off or permanent moves: migrations, draining an old cluster, or redriving a parking-lot queue.

### What do you monitor on a RabbitMQ deployment? {core}

Per queue: ready depth and its trend, unacked messages, consumer count, publish versus ack rate, and redelivery rate. A growing backlog means consumers can't keep up, unacked stuck at consumers times prefetch means consumers are stuck, and a rising redelivery rate means they're failing. Per node: memory against the watermark, free disk, file descriptors, and connection and channel churn. I'd scrape the Prometheus plugin into Grafana, alert on any message in a dead-letter queue, and use the management UI for inspection.

### What happens when a node hits its memory or disk limit, and how should producers react?

RabbitMQ raises a resource alarm and blocks every publishing connection across the cluster until the alarm clears, while consumers keep receiving so the backlog can drain. Clients get a `connection.blocked` notification. Producers should treat it as backpressure: stop accepting work they can't buffer safely, or fail fast upstream, rather than queueing unbounded in their own memory. Operators should raise the disk limit from its low default, add consumers, or cap queue lengths.

### When would you choose Kafka instead of RabbitMQ? {core}

Kafka is a partitioned, replicated log: messages stay for a retention period and every consumer group reads at its own offset, so it's the better fit for high-throughput event streaming, replaying history, event sourcing and many independent readers of the same data. RabbitMQ is a smart broker with rich routing, per-message acks, TTLs, priorities and dead-lettering, so it's the better fit for distributing tasks, routing messages to the right services, request/reply and lots of small flows. RabbitMQ streams narrow the gap for replay, and a managed cloud queue is often the simplest choice when you don't want to run either.

### How do RabbitMQ streams compare with Kafka? {deep}

Both are replicated append-only logs that keep messages after consumption and let consumers read from an offset and replay. Streams live inside RabbitMQ, so they share its routing, users and operations, and partitioning comes from super streams. Kafka has a much larger ecosystem for stream processing and integration (Connect, Streams, schema registries) and is built around partitions from the start. I'd use RabbitMQ streams to add replay or fan-out to an existing RabbitMQ system, and Kafka when streaming is the core of the architecture.

### How should a client handle connection loss?

Assume connections will drop: brokers restart, fail over and get redeployed. The client should reconnect with exponential backoff and jitter, then re-create channels, re-declare its topology and re-register consumers. Unacked messages are redelivered automatically, so handlers must be idempotent, and unconfirmed publishes must be retried. amqplib 2.x can do the reconnection itself with its recovery option and a setup callback; aio-pika's robust connection does the same in Python.

### How do you manage topology: declare it in code or configure it on the broker?

Both, with clear ownership. Services declare the exchanges, queues and bindings they depend on at startup, because declaring is idempotent and it makes each service self-sufficient. Operational settings such as dead-letter exchanges, length limits, delivery limits and TTLs are better set by policy, because policies can change without deleting queues. Shared or regulated environments often load a definitions file at boot so the topology is versioned and reviewed like code.

### How do you upgrade a RabbitMQ cluster safely? {deep}

Read the release notes for breaking changes and check for deprecated features in use with `rabbitmq-diagnostics check_if_any_deprecated_features_are_used`. Between adjacent versions, do a rolling upgrade one node at a time, waiting for quorum queues to be healthy before moving on, and enable new feature flags afterwards. For large jumps or risky changes, do a blue/green upgrade: stand up a new cluster, point producers at it, and drain the old cluster's queues into it with a shovel or federation.

### How do you handle large messages?

Keep messages small. The default maximum message size is 16 MiB since RabbitMQ 4.0, and large messages hurt memory, replication and latency for everyone sharing the broker. For files or big documents, use the claim-check pattern: store the payload in object storage and publish a message with a reference (and a checksum), which the consumer fetches.

### How would you migrate away from classic mirrored queues? {deep}

Mirroring was removed in RabbitMQ 4.0, so it has to happen before or during the upgrade to 4.x. Declare quorum queue equivalents under new names (a queue's type can't change in place), move consumers to them, switch producers' bindings, and drain the old queues with a shovel. Check for features quorum queues don't support, such as exclusive or non-durable queues and global prefetch, and replace them.

### How do you run RabbitMQ: self-hosted, Kubernetes or managed?

Managed services such as CloudAMQP or Amazon MQ for RabbitMQ remove most operations work and are my default when the platform allows it. On Kubernetes, the RabbitMQ Cluster Operator handles cluster formation, scaling and upgrades. Self-hosting on VMs gives the most control and the most work. Azure and Google Cloud have no first-party RabbitMQ service, so teams there either use a third-party managed offering or move to Service Bus or Pub/Sub.

## Coding problems

### Make a consumer idempotent {easy core}

A payment consumer may receive the same message twice. Write `handle(db, message)` so that each `message_id` charges the customer at most once, even if the message is redelivered after a crash. Use SQLite: a `payments` table for the effect and a `processed` table for message ids. Return `"charged"` or `"duplicate"`. If charging fails, nothing must be recorded, so a redelivery can try again.

#### Hints

1. The consumer must remember which message ids it has already handled. Where should that memory live so it survives a restart?
2. Record the id and perform the effect in the same database transaction, with a unique constraint on the id.
3. Try to insert the id first; an `IntegrityError` means a duplicate. Wrap everything in `with db:` so a failure rolls both back.

#### Solution

The id and the effect are committed together, so there's no window where one exists without the other. The unique constraint does the deduplication even if two consumers race on the same id.

```python
import sqlite3


def setup(db: sqlite3.Connection) -> None:
    db.execute("CREATE TABLE processed (message_id TEXT PRIMARY KEY)")
    db.execute("CREATE TABLE payments (order_id TEXT, amount REAL)")


def handle(db: sqlite3.Connection, message: dict, charge=lambda order_id, amount: None) -> str:
    try:
        with db:  # one transaction: commit both or neither
            db.execute("INSERT INTO processed (message_id) VALUES (?)", (message["message_id"],))
            charge(message["order_id"], message["amount"])
            db.execute("INSERT INTO payments VALUES (?, ?)", (message["order_id"], message["amount"]))
    except sqlite3.IntegrityError:
        return "duplicate"
    return "charged"


db = sqlite3.connect(":memory:")
setup(db)
msg = {"message_id": "order.created:ord_1", "order_id": "ord_1", "amount": 49.0}
assert handle(db, msg) == "charged"
assert handle(db, msg) == "duplicate"  # redelivery
assert db.execute("SELECT COUNT(*) FROM payments").fetchone() == (1,)


def flaky_charge(order_id: str, amount: float) -> None:
    raise TimeoutError("gateway timeout")


msg2 = {"message_id": "order.created:ord_2", "order_id": "ord_2", "amount": 10.0}
try:
    handle(db, msg2, charge=flaky_charge)
except TimeoutError:
    pass
assert db.execute("SELECT COUNT(*) FROM processed WHERE message_id = ?", (msg2["message_id"],)).fetchone() == (0,)
assert handle(db, msg2) == "charged"  # the redelivery succeeds
assert db.execute("SELECT COUNT(*) FROM payments").fetchone() == (2,)
```

Complexity: O(1) per message with the primary-key index.

#### Follow-ups

- **The charge goes to an external payment gateway, not your database. Is it still safe?** Not fully: the gateway call can succeed and the transaction still fail. Pass the message id to the gateway as an idempotency key so it deduplicates too.
- **The processed table grows forever.** Keep ids for longer than the longest possible redelivery window (days, not forever) and delete older rows.

### Plan a delayed retry schedule {medium core}

Simulate the retry topology for one message. You get the outcome of each processing attempt in order (`"ok"`, `"transient"` or `"permanent"`) and the retry delays in seconds, such as `[5, 30, 120]`. A transient failure sends the message to the retry queue for that attempt and back after its delay; a permanent failure, or a transient one after all delays are used, parks it in the dead queue. Processing takes no time. Return the list of `(time, queue)` stops and the final status (`"done"` or `"parked"`).

```text
plan(["transient", "transient", "ok"], [5, 30, 120])
→ [(0, 'payments'), (0, 'retry.5s'), (5, 'payments'), (5, 'retry.30s'), (35, 'payments')], 'done'
```

#### Hints

1. Walk the outcomes with a clock and an attempt counter.
2. On a transient failure, the attempt number picks the retry queue; the clock jumps by that queue's delay when the message comes back.
3. Stop as soon as the outcome is `ok` or the message is parked; outcomes after that never happen.

#### Solution

A straight simulation of the topology: each attempt visits the main queue; a transient failure visits the matching retry queue and returns after its delay; anything else ends the journey.

```python
def plan(outcomes: list[str], delays: list[int]) -> tuple[list[tuple[int, str]], str]:
    clock, stops = 0, []
    for attempt, outcome in enumerate(outcomes):
        stops.append((clock, "payments"))
        if outcome == "ok":
            return stops, "done"
        if outcome == "transient" and attempt < len(delays):
            stops.append((clock, f"retry.{delays[attempt]}s"))
            clock += delays[attempt]
            continue
        if outcome not in {"transient", "permanent"}:
            raise ValueError(f"unknown outcome {outcome!r}")
        stops.append((clock, "payments.dead"))
        return stops, "parked"
    raise ValueError("the outcomes ran out before the message finished")


assert plan(["ok"], [5, 30, 120]) == ([(0, "payments")], "done")
assert plan(["transient", "transient", "ok"], [5, 30, 120]) == (
    [(0, "payments"), (0, "retry.5s"), (5, "payments"), (5, "retry.30s"), (35, "payments")],
    "done",
)
assert plan(["permanent"], [5, 30]) == ([(0, "payments"), (0, "payments.dead")], "parked")
stops, status = plan(["transient"] * 4, [5, 30, 120])
assert status == "parked" and stops[-1] == (155, "payments.dead")
assert plan(["transient", "ok"], []) == ([(0, "payments"), (0, "payments.dead")], "parked")
try:
    plan(["transient"], [5])
except ValueError:
    pass
else:
    raise AssertionError("must reject outcomes that end mid-retry")
```

Complexity: O(n) for n attempts.

#### Follow-ups

- **Why one retry queue per delay rather than per-message TTLs in one queue?** Expired messages only leave from the head of a queue, so a 5-second message can be stuck behind a 2-minute one. With one TTL per queue, messages expire in arrival order.
- **What about jitter?** Many failed messages retrying at exactly the same moment hit the recovering service together; add random jitter to the delay (or spread across extra delay levels).

### Correlate RPC replies with timeouts {medium}

Write an asyncio `RpcClient` for the client side of RPC. `call(body, timeout)` publishes a request with a new correlation id (through a `publish(correlation_id, body)` function you are given) and awaits the reply. `on_reply(correlation_id, body)` is called by the transport for every reply. Replies can arrive out of order, late (after the caller gave up), or with unknown ids; late and unknown replies must be ignored and counted, and a timed-out call must raise `TimeoutError` and not leak memory.

#### Hints

1. Keep a dict from correlation id to an `asyncio.Future`.
2. `call` creates the future, publishes, then waits with `asyncio.wait_for`. Whatever happens, remove the id from the dict afterwards.
3. In `on_reply`, look up the id; if it's missing (or the future is done), count it as stray and return.

#### Solution

A dict of pending futures keyed by correlation id. The `finally` block guarantees the entry is removed on success, timeout or cancellation, so late replies find nothing and are counted as strays.

```python
import asyncio
import itertools


class RpcClient:
    def __init__(self, publish) -> None:
        self._publish = publish
        self._pending: dict[str, asyncio.Future] = {}
        self._ids = itertools.count(1)
        self.stray_replies = 0

    async def call(self, body: str, timeout: float) -> str:
        correlation_id = f"req-{next(self._ids)}"
        future = asyncio.get_running_loop().create_future()
        self._pending[correlation_id] = future
        try:
            self._publish(correlation_id, body)
            return await asyncio.wait_for(future, timeout)
        finally:
            self._pending.pop(correlation_id, None)

    def on_reply(self, correlation_id: str, body: str) -> None:
        future = self._pending.get(correlation_id)
        if future is None or future.done():
            self.stray_replies += 1
            return
        future.set_result(body)


async def main() -> None:
    sent: list[tuple[str, str]] = []
    client = RpcClient(lambda cid, body: sent.append((cid, body)))

    async def server_replies() -> None:
        await asyncio.sleep(0.01)
        # answer in reverse order; the request "slow" is never answered in time
        for cid, body in reversed(sent):
            if body != "slow":
                client.on_reply(cid, body.upper())
        client.on_reply("req-999", "who are you?")  # unknown id

    replier = asyncio.create_task(server_replies())
    results = await asyncio.gather(
        client.call("us", 1.0), client.call("eu", 1.0), client.call("slow", 0.05), return_exceptions=True
    )
    await replier
    assert results[0] == "US" and results[1] == "EU"
    assert isinstance(results[2], TimeoutError)
    slow_cid = next(cid for cid, body in sent if body == "slow")
    client.on_reply(slow_cid, "SLOW")  # arrives after the caller gave up
    assert client.stray_replies == 2
    assert client._pending == {}  # nothing leaked


asyncio.run(main())
```

Complexity: O(1) per call and per reply.

#### Follow-ups

- **What else should the request carry?** An `expiration` equal to the timeout, so the broker drops requests nobody is waiting for anymore.
- **The client process restarts with requests in flight.** Their futures are gone; replies arrive as strays. Callers must retry, so the server-side operation must be idempotent.

### Spread keys over queues for ordered processing {medium}

To keep per-order sequence while processing different orders in parallel, each order id must always go to the same one of N queues, and adding a queue should move as few orders as possible. Write a `HashRing` with `add(queue)`, `remove(queue)` and `queue_for(key)` using consistent hashing with virtual nodes, and show that adding a fifth queue to four moves roughly a fifth of the keys, not most of them.

#### Hints

1. Plain `hash(key) % n` moves almost every key when n changes. Place queues on a ring of hash values instead, and give each key to the first queue clockwise from the key's hash.
2. Give each queue many points on the ring ("virtual nodes") so keys spread evenly.
3. Keep the ring as a sorted list of `(hash, queue)` and use `bisect` to find the first point at or after the key's hash, wrapping around at the end.

#### Solution

Each queue owns many points on a ring of 64-bit hashes; a key belongs to the first point clockwise from its own hash. Adding a queue only takes over the arcs just before its new points, so only those keys move.

```python
import bisect
import hashlib


def _hash(text: str) -> int:
    return int.from_bytes(hashlib.sha256(text.encode()).digest()[:8], "big")


class HashRing:
    def __init__(self, replicas: int = 100) -> None:
        if replicas < 1:
            raise ValueError("replicas must be at least 1")
        self.replicas = replicas
        self._points: list[tuple[int, str]] = []

    def add(self, queue: str) -> None:
        for i in range(self.replicas):
            bisect.insort(self._points, (_hash(f"{queue}#{i}"), queue))

    def remove(self, queue: str) -> None:
        self._points = [p for p in self._points if p[1] != queue]

    def queue_for(self, key: str) -> str:
        if not self._points:
            raise LookupError("the ring has no queues")
        i = bisect.bisect_left(self._points, (_hash(key), ""))
        return self._points[i % len(self._points)][1]


ring = HashRing()
for q in ["orders.0", "orders.1", "orders.2", "orders.3"]:
    ring.add(q)
keys = [f"ord_{n}" for n in range(4000)]
before = {k: ring.queue_for(k) for k in keys}
assert all(ring.queue_for(k) == before[k] for k in keys[:200])  # stable

counts = {q: list(before.values()).count(q) for q in set(before.values())}
assert min(counts.values()) > 600  # roughly even: 1,000 each on average

ring.add("orders.4")
after = {k: ring.queue_for(k) for k in keys}
moved = [k for k in keys if before[k] != after[k]]
assert all(after[k] == "orders.4" for k in moved)  # keys only move to the new queue
assert 0.1 < len(moved) / len(keys) < 0.3  # about 1/5, not most of them

ring.remove("orders.4")
assert {k: ring.queue_for(k) for k in keys} == before
try:
    HashRing().queue_for("ord_1")
except LookupError:
    pass
else:
    raise AssertionError("an empty ring must not route")
```

Complexity: O(log(N × R)) per lookup for N queues and R virtual nodes; O(N × R log(N × R)) to build.

#### Follow-ups

- **Do moved keys break ordering?** For a moment, yes: messages for a moved key may sit in the old queue while new ones go to the new queue. Drain or pause briefly during rebalancing, or carry versions so consumers can discard stale events.
- **Can RabbitMQ do the hashing?** The consistent-hash exchange plugin routes by a hash of the routing key (or a header, or `message_id`/`correlation_id`) across bound queues; the binding key is a number that sets each queue's weight. Its ring lives in memory and isn't guaranteed to be the same after a node restart, so if strict per-key placement matters, hash in the producer.
