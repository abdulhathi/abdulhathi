---
title: "RabbitMQ fundamentals: AMQP, exchanges and queues"
goal: Explain how a message travels through RabbitMQ (exchanges, bindings, queues, acknowledgements, prefetch, durability, confirms and dead letters) and choose the right queue type in RabbitMQ 4.x.
minutes: 65
---

RabbitMQ is a message broker: services publish messages to it and other services consume them, so neither side has to be up, fast or known to the other at the moment of sending. It is the classic "smart broker": routing rules live in the broker, so a producer publishes one event and the broker decides which queues get a copy. Interviewers probe four things: **the AMQP model** (why you never publish straight to a queue), **delivery guarantees** (acks, confirms, durability), **flow control** (prefetch), and **what happens when things fail** (redelivery, dead letters, queue types).

The one sentence to remember: **producers publish to exchanges, bindings decide which queues get a copy, and consumers acknowledge after the work is done.** Add "so every consumer must be idempotent" and you have the core of most good answers.

This chapter is the model; [RabbitMQ in practice](#/rabbitmq-practice) covers patterns, reliability end to end and operations. The portfolio's **RabbitMQ tutorial** (in Study Hub) builds every idea here into a small order pipeline, ShopFlow, with tested code.

## The AMQP 0-9-1 model in one picture

```text
                       routing key "order.created.eu"
 producer ──publish──▶ [ exchange "shop" (topic) ]
                          │ binding "order.created.*" ──▶ [ queue payments ]  ──▶ consumer (payments)
                          │ binding "order.#"         ──▶ [ queue analytics ] ──▶ consumer (analytics)
                          └ binding "invoice.#"          (no match: no copy)
```

| Term | What it is |
|---|---|
| **Broker** | The RabbitMQ server (a node, or a cluster of nodes). Stores and routes messages. |
| **Virtual host (vhost)** | A namespace with its own exchanges, queues, users' permissions and limits. One cluster can host many apps or tenants. |
| **Connection** | One TCP connection from a process to the broker: handshake, authentication, heartbeats. Expensive; keep one per process. |
| **Channel** | A lightweight virtual connection multiplexed inside a connection. Almost every operation happens on a channel. Use one channel per thread or task; channels are not meant to be shared concurrently. |
| **Exchange** | Receives every published message and routes copies to queues (or other exchanges) according to its **type** and its **bindings**. |
| **Routing key** | A string the producer attaches to a message, such as `order.created.eu`. |
| **Binding** | A rule linking an exchange to a queue, with a key or pattern (or header arguments). |
| **Queue** | An ordered buffer that stores messages until a consumer takes them. |
| **Consumer** | Code subscribed to a queue. The broker **pushes** messages to it. |
| **Acknowledgement (ack)** | The consumer telling the broker "done, delete it". Until then the broker keeps the message and can redeliver it. |

Even `sendToQueue('payments', …)` goes through an exchange: the nameless **default exchange**, which is bound to every queue by the queue's own name.

## Exchange types

| Type | Routes to | Typical use |
|---|---|---|
| **Default** (`""`) | The queue whose name equals the routing key | Simple point-to-point, RPC replies |
| **Direct** | Queues whose binding key equals the routing key exactly | Route by a fixed category: region, severity, tenant |
| **Fanout** | Every bound queue; the routing key is ignored | Broadcast one event to every interested service |
| **Topic** | Queues whose binding **pattern** matches the dotted routing key | Event streams where each consumer picks what it wants |
| **Headers** | Queues whose binding arguments match the message headers (`x-match: all` or `any`) | Routing on several attributes that don't fit one key |

**Topic patterns:** the routing key is a list of words separated by dots (at most 255 bytes). In a binding pattern, `*` matches **exactly one** word and `#` matches **zero or more** words. So `order.created.*` matches `order.created.eu` but not `order.created` or `order.created.eu.north`, while `order.#` matches all three and also `order` itself. A binding of `#` makes a topic exchange behave like a fanout.

Two RabbitMQ extensions worth knowing:

- **Exchange-to-exchange bindings:** an exchange can be bound to another exchange, so you can build routing trees (a global `events` exchange fanning out to per-domain exchanges).
- **Alternate exchange:** declared on an exchange with the `alternate-exchange` argument; messages that exchange cannot route go there (often a fanout to an `unrouted` queue) instead of being dropped.

## What a message carries

| Part | Examples | Set by |
|---|---|---|
| **Body** | JSON, Protobuf, any bytes. The broker never looks inside. | Producer |
| **Properties** | `content_type`, `delivery_mode` (2 = persistent), `message_id`, `correlation_id`, `reply_to`, `expiration` (per-message TTL, a string of milliseconds), `priority`, `timestamp`, `type`, `app_id`, `headers` | Producer |
| **Delivery info** | `exchange`, `routing_key`, `redelivered`, `delivery_tag` | Broker, on delivery |

Put a stable **`message_id`** on every message: it is what an idempotent consumer deduplicates on.

## Queues: declaring them, durability and the three queue types

A queue is declared with a name, flags and optional arguments. **Declaring is idempotent**: if the queue exists with the same settings nothing happens, so both producers and consumers declare what they use on startup and start order stops mattering. Declaring an existing queue with *different* settings fails with `PRECONDITION_FAILED - inequivalent arg …` and closes the channel; settings such as the queue type or `durable` can't change after creation (delete and re-declare, or migrate to a new name). Policies, applied by the operator to queues matching a name pattern, are the way to change most arguments later.

| Flag | Meaning |
|---|---|
| `durable` | The queue definition survives a broker restart. |
| `exclusive` | Used by one connection only, deleted when it closes. Good for private reply queues and live feeds. |
| `auto_delete` | Deleted when its last consumer unsubscribes. |
| `arguments` | `x-queue-type`, `x-message-ttl`, `x-dead-letter-exchange`, `x-max-length`, `x-delivery-limit`, … |

Since RabbitMQ 4.0 you choose between three queue types with `x-queue-type`:

| | Classic (default) | Quorum | Stream |
|---|---|---|---|
| Declare with | nothing, or `"classic"` | `"quorum"` | `"stream"` |
| Replication | none: lives on one node | Raft consensus across an odd number of nodes (3 by default; 5 or 7 for more failure tolerance) | replicated append-only log |
| After a message is consumed | deleted on ack | deleted on ack | **kept**; consumers read from an offset and can replay |
| Durability | per message (`persistent`) | always durable and persistent | always durable and persistent |
| Exclusive / non-durable | supported | no | no |
| Poison-message protection | none | delivery limit, **20 by default since 4.0** | not applicable |
| Priorities | `x-max-priority` 1–255 (2–4 recommended) | 32 strict levels (0–31) since 4.3; unprioritised messages count as 4 | no |
| Use it for | temporary, exclusive and reply queues | orders, payments, anything you cannot lose | event history, many consumers reading the same data, replay |

The rule of thumb: **quorum for anything important, classic for temporary and exclusive queues, stream when consumers need history.** Classic **mirrored** queues no longer exist: mirroring was removed in RabbitMQ 4.0, and quorum queues (or streams) are the replicated option.

Streams deserve a sentence of their own: they behave more like a Kafka log than a queue. Consumers attach at an offset (`x-stream-offset`: `first`, `last`, `next`, a number, a timestamp or an interval), must set a prefetch and ack manually, and retention is by age or size (`x-max-age`, `x-max-length-bytes`) instead of TTL. Streams have no dead-lettering, priorities or per-message TTL.

### What changed in RabbitMQ 4.x

| Version | Change |
|---|---|
| 4.0 (Sep 2024) | Classic queue mirroring removed. AMQP 1.0 became a core, always-on protocol. Quorum queues get a default delivery limit of 20 and message priorities. Default maximum message size cut from 128 MiB to 16 MiB. RabbitMQ no longer interprets an `x-death` header set by a publisher. |
| 4.2 (Oct 2025) | Khepri (a Raft-based metadata store) becomes the default for new clusters. SQL filter expressions for streams. |
| 4.3 (Apr 2026) | Khepri is the only metadata store (Mnesia removed). Quorum queues get 32 strict priority levels and built-in delayed retries, and now enforce consumer timeouts themselves (classic queues and streams no longer time out consumers). The delivery limit counts only failed deliveries (a reject or a crash, not a `basic.nack` return). Global QoS and transient non-exclusive queues are refused by default. The community delayed-message-exchange plugin is deprecated and archived. |

## Consuming: acknowledgements and redelivery

| Mode | What happens | Guarantee |
|---|---|---|
| **Automatic ack** (`noAck: true`) | The broker deletes the message the moment it sends it | At-most-once: a crash mid-processing loses the message |
| **Manual ack** (`noAck: false`) | The broker keeps the message as **unacked** until the consumer acks | At-least-once: a crash causes a redelivery |

With manual acks the consumer answers each delivery with one of:

- `ack`: done, delete it.
- `nack` (a RabbitMQ extension) or `reject`: failed. With `requeue: true` it goes back to the queue (to its original position where possible) and is redelivered with `redelivered = true`; with `requeue: false` it is **dead-lettered** if the queue has a dead-letter exchange, otherwise discarded. `nack` also accepts `multiple`, `reject` does not.

Delivery tags are scoped to the **channel**: you must ack on the channel that received the message. If a channel or connection closes, every unacked message on it goes back to its queue and is redelivered, which is exactly what makes worker crashes safe. **Ack after the work, never before.**

Quorum queues also count failed deliveries: the `x-delivery-count` header tells the consumer how many times a message failed before, and once the delivery limit is reached the queue dead-letters the message instead of redelivering it forever. Since 4.3 only real failures count: `basic.reject` with requeue and a consumer crash increment it, but a `basic.nack` with requeue is treated as an explicit "give it back" and does not (a separate `x-acquired-count` counts every delivery). So on 4.3, signal a failure with `reject` if you want the delivery limit to protect you.

The **consumer timeout** (30 minutes by default) stops a consumer that holds an unacked message too long, so a stuck consumer can't hoard work forever. Up to 4.2 the broker closes the whole channel with a `PRECONDITION_FAILED` error and requeues its unacked messages. Since 4.3 quorum queues enforce it (classic queues and streams no longer time out consumers): the message is requeued and only that consumer is cancelled with `basic.cancel`, or the channel is closed for clients that don't support cancel notifications. It can be set per consumer (`x-consumer-timeout` consumer argument, 4.3), per queue (`x-consumer-timeout` argument or `consumer-timeout` policy) or node-wide (`consumer_timeout`).

## Prefetch: flow control for consumers

Without a limit, the broker pushes messages to consumers as fast as it can, round-robin, regardless of how busy they are. **Prefetch** (`basic.qos`) caps the number of unacked messages a consumer may hold.

- **`prefetch = 1`**: fairest; a worker stuck on a slow job receives nothing else, so other workers take the rest. Lowest throughput, because every message waits for an ack round trip.
- **Tens to a few hundred**: far better throughput for fast, uniform jobs. RabbitMQ's documentation suggests 100–300 as the usual sweet spot; quorum queues cap a consumer's prefetch at 2,000.
- **Unlimited** (`0`): the default if you set nothing, and the cause of "one consumer has 50,000 unacked messages and the others are idle" plus memory pressure on both sides.

Set prefetch **per consumer**; the old "global" (per-channel) prefetch is deprecated, quorum queues and streams reject it, and since 4.3 it is refused by default.

## Durability and persistence: two settings, both needed

A **durable queue** survives a broker restart; a **persistent message** (`delivery_mode = 2`) is written to disk. You need both: a persistent message in a non-durable queue is lost with the queue, and a durable classic queue full of transient messages comes back empty. Quorum queues and streams are always durable and persistent, which removes one way to get this wrong.

Durability protects against a restart; **replication** (quorum queues) protects against losing a node's disk; **publisher confirms** protect the hop from producer to broker.

## Publisher confirms and unroutable messages

On a **confirm channel** the broker answers every publish with an `ack` (it has taken responsibility) or a `nack` (it could not). For a persistent message to a durable queue the ack comes after the message is written to disk (writes are batched every few hundred milliseconds); for a quorum queue, after a quorum of replicas has it. A producer that gets no confirm must assume the message may not have arrived and publish again, which is another reason consumers must tolerate duplicates.

A message that matches **no binding** is silently dropped by default. Two ways to notice:

- Publish with **`mandatory: true`**: the broker sends the message back with `basic.return` (before the confirm), and the client fires a `return` event.
- Configure an **alternate exchange** that catches everything unroutable.

Confirms are asynchronous: for throughput, publish a batch and wait for all confirms once (`waitForConfirms()`), or track them with callbacks; waiting after every single message caps you at one round trip per message.

## Dead-letter exchanges, TTL and length limits

A queue with a **dead-letter exchange** (`x-dead-letter-exchange`, optionally `x-dead-letter-routing-key`) republishes a message there instead of dropping it when:

| `x-death` reason | Cause |
|---|---|
| `rejected` | A consumer called `nack` or `reject` with `requeue: false` |
| `expired` | The message's TTL ran out |
| `maxlen` | The queue hit its length limit and overflow is `drop-head` (the oldest message is dead-lettered) |
| `delivery_limit` | A quorum queue redelivered it more times than its delivery limit |

The broker adds an **`x-death`** header recording each death (reason, queue, count, time). Since 4.0 the broker ignores any `x-death` a publisher sets, so keep your own attempt counter in a header of your own.

**TTL:** a per-queue TTL (`x-message-ttl`) applies to every message; a per-message TTL (`expiration`) to one message; if both are set, the lower wins. Expired messages are never delivered, but they are only removed (and dead-lettered) when they reach the **head** of the queue. That is why delayed retries use one queue per delay with a queue-level TTL: every message in it expires in arrival order. **Queue TTL** (`x-expires`) is different: it deletes an unused queue.

**Length limits:** `x-max-length` or `x-max-length-bytes` cap the ready messages (unacked ones don't count). Overflow is `drop-head` by default; `reject-publish` refuses new messages (a confirming publisher gets a `nack`); classic queues also offer `reject-publish-dlx`.

## Connections, channels, heartbeats and resource alarms

- **One long-lived connection per process, channels as needed.** Opening a connection per message is the most common RabbitMQ performance mistake.
- **Heartbeats** let both sides detect a dead TCP connection that the network didn't close cleanly.
- **Reconnection is the client's job.** The broker can restart, fail over or be redeployed; a production client reconnects with backoff and re-declares its topology and consumers. amqplib 2.x can do this itself (`connect(url, { recovery: { … } })`, with a `setup` callback that re-declares).
- **Resource alarms:** when a node passes its memory high watermark (60% of RAM by default) or its free-disk limit (50 MB by default, which is low for production), RabbitMQ **blocks publishing connections** cluster-wide until the alarm clears. Consumers keep receiving, so they can drain the backlog. Clients get a `connection.blocked` notification.

## A producer and a consumer in Node.js (amqplib)

This is typechecked against amqplib 2.2 (which bundles its own TypeScript types); it needs a running broker, so it is not executed here.

```ts typecheck
import { connect, type ConsumeMessage } from 'amqplib';

type Order = { id: string; total: number };

const conn = await connect(process.env.AMQP_URL ?? 'amqp://localhost');
const pub = await conn.createConfirmChannel(); // publish on one channel…
const sub = await conn.createChannel(); // …consume on another

// Topology: declared on startup by everyone who uses it; declaring is idempotent.
await pub.assertExchange('shop', 'topic', { durable: true });
await pub.assertExchange('shop.dlx', 'fanout', { durable: true });
await pub.assertQueue('payments', {
  durable: true,
  deadLetterExchange: 'shop.dlx',
  arguments: { 'x-queue-type': 'quorum', 'x-delivery-limit': 5 },
});
await pub.assertQueue('payments.dead', { durable: true, arguments: { 'x-queue-type': 'quorum' } });
await pub.bindQueue('payments', 'shop', 'order.created.*');
await pub.bindQueue('payments.dead', 'shop.dlx', '');

// Producer: persistent, a stable id for deduplication, mandatory so a missing binding is noticed.
pub.on('return', (msg) => console.warn('unroutable:', msg.fields.routingKey));
const order: Order = { id: 'ord_42', total: 49 };
pub.publish('shop', 'order.created.eu', Buffer.from(JSON.stringify(order)), {
  persistent: true,
  messageId: order.id,
  contentType: 'application/json',
  mandatory: true,
});
await pub.waitForConfirms(); // the broker has taken responsibility for every message so far

// Consumer: at most 20 unacked messages; ack after the work; dead-letter permanent failures.
await sub.prefetch(20);
await sub.consume(
  'payments',
  async (msg: ConsumeMessage | null) => {
    if (msg === null) return; // the broker cancelled this consumer (for example, the queue was deleted)
    try {
      const job = JSON.parse(msg.content.toString()) as Order;
      await charge(job);
      sub.ack(msg);
    } catch {
      sub.nack(msg, false, false); // no requeue: dead-lettered to payments.dead
    }
  },
  { noAck: false },
);

async function charge(job: Order): Promise<void> {
  if (job.total <= 0) throw new Error(`invalid amount for ${job.id}`);
}
```

The same consumer in Python with pika looks like this (pika is not installed here, so it is shown, not run):

```python norun
import json
import pika

connection = pika.BlockingConnection(pika.URLParameters("amqp://localhost"))
channel = connection.channel()
channel.basic_qos(prefetch_count=20)

def on_message(ch, method, properties, body):
    try:
        charge(json.loads(body))
        ch.basic_ack(delivery_tag=method.delivery_tag)
    except Exception:
        ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

channel.basic_consume(queue="payments", on_message_callback=on_message, auto_ack=False)
channel.start_consuming()
```

**Your angle:** your resume lists event-driven architecture, and the Labcorp workflows you analysed at The Dot Corp ran orchestration and background jobs. RabbitMQ itself is not on your resume: if you have built and run the portfolio's ShopFlow tutorial, say "I built a small order pipeline on RabbitMQ to learn it properly: topic routing, confirms, dead-letter retries and RPC", and only then.

## Interview questions

### What is RabbitMQ, and when would you use it? {core}

RabbitMQ is a message broker that lets services communicate asynchronously: a producer publishes a message and returns immediately, and one or more consumers process it when they can. I would use it to decouple services, to absorb load spikes with a queue that workers drain at their own pace, to spread slow jobs across competing workers, and to route events to whichever services are interested. Its strength is flexible routing in the broker (direct, fanout, topic and headers exchanges) with per-message acknowledgements and dead-lettering.

I'd pick something else when I need a long-retained, replayable event log consumed by many independent readers at high volume, where Kafka (or RabbitMQ streams) fits better, or when a managed cloud queue already meets the need with less to operate.

### Explain exchanges, bindings, queues and routing keys. {core}

Producers never publish to a queue; they publish to an exchange with a routing key. The exchange looks at its type and its bindings (rules linking it to queues, each with a key or pattern) and puts a copy of the message into every matching queue. Consumers read from queues. So the producer only knows the exchange and the event name, and adding a new consumer is just a new queue and binding, with no change to the producer.

Even `sendToQueue` uses an exchange: the nameless default exchange, which is bound to every queue by the queue's name.

### What exchange types are there, and when do you use each? {core}

Four types. **Direct** routes on an exact match between routing key and binding key, for fixed categories such as a region. **Fanout** copies every message to every bound queue and ignores the key, for broadcasts. **Topic** matches dotted keys against patterns with `*` (one word) and `#` (zero or more words), for event streams where each consumer picks what it needs. **Headers** matches on message headers with `x-match` all or any, for routing on several attributes. In practice topic covers most event-driven systems, because it can behave like direct or fanout as well.

### How does topic routing work? {core}

The routing key is a list of words separated by dots, like `order.created.eu`. A binding pattern uses `*` to match exactly one word and `#` to match zero or more words. So `order.created.*` matches `order.created.eu` but not `order.created`, while `order.#` matches `order`, `order.created` and `order.created.eu`. A message is copied to every queue with at least one matching binding, once per queue even if several bindings match.

Design tip: put the most general word first (`domain.event.region`), so consumers can subscribe at any level of detail.

### What is the default exchange?

A nameless direct exchange that every queue is automatically bound to, using the queue's name as the binding key. Publishing to it with routing key `payments` delivers to the queue named `payments`. It's what `sendToQueue` uses, and what RPC replies usually use. You can't bind to it or unbind from it explicitly.

### What is the difference between a connection and a channel? {core}

A connection is a real TCP connection with a handshake, authentication, TLS and heartbeats, so it is expensive to open; an application keeps one long-lived connection per process. A channel is a lightweight virtual connection multiplexed inside it, and almost every operation (declare, publish, consume, ack) happens on a channel. Use separate channels for publishing and consuming and one per thread, because a channel isn't safe for concurrent use, and remember that delivery tags and acks are scoped to the channel.

The classic mistake is opening a connection per message, which wrecks throughput and churns the broker.

### What does an acknowledgement do, and when do you use automatic versus manual acks? {core}

An ack tells the broker the consumer has finished with a message, so it can delete it. With automatic acks the broker deletes the message as soon as it sends it, which is fast but loses the message if the consumer crashes mid-processing: at-most-once. With manual acks the message stays unacked until the consumer acks; if the consumer's channel or connection closes first, the broker requeues it and delivers it again: at-least-once. I use manual acks, sent after the work is done, for anything that matters.

### What is the difference between nack and reject, and what does requeue do?

Both are negative acknowledgements. `reject` is the AMQP standard and handles one message; `nack` is RabbitMQ's extension and can also cover all messages up to a delivery tag with `multiple`. With `requeue: true` the message goes back to the queue (to its original position if possible) and is redelivered with the `redelivered` flag set. With `requeue: false` it is dead-lettered if the queue has a dead-letter exchange, otherwise discarded.

Requeueing immediately is dangerous for a message that will always fail: it becomes a hot loop. Use a delayed retry or a delivery limit instead. On quorum queues since 4.3 the two differ in one more way: a `reject` with requeue counts as a failed delivery towards the delivery limit, while a `nack` with requeue does not.

### What is prefetch, and how do you choose a value? {core}

Prefetch, set with `basic.qos`, is the maximum number of unacknowledged messages the broker will push to a consumer. Without it the broker pushes everything round-robin, so one consumer can hoard thousands of messages while others sit idle, and both sides use more memory. A prefetch of 1 gives the fairest distribution for slow, uneven jobs but costs throughput, because each message waits for an ack round trip; for fast, uniform work tens to a few hundred is much better, and RabbitMQ's docs suggest 100–300 as the usual range. I'd start there for fast jobs, use 1 to 10 for long jobs, and measure.

Set it per consumer: global (per-channel) prefetch is deprecated, quorum queues reject it, and since 4.3 it is refused by default.

### How do you make sure messages survive a broker restart? {core}

Declare the queue durable and publish messages as persistent. You need both: a persistent message in a non-durable queue disappears with the queue, and a durable classic queue of transient messages comes back empty. Better still, use a quorum queue, which is always durable and persistent and replicated across nodes, so it also survives losing a node. Then add publisher confirms, so the producer knows the broker actually stored each message, and manual acks on the consumer side.

### What are publisher confirms, and what does the mandatory flag do? {core}

Publisher confirms make the broker answer every publish on a confirm channel with an ack once it has taken responsibility for the message (for a persistent message, after it is on disk; for a quorum queue, after a quorum of replicas has it) or a nack if it couldn't. Without confirms a producer has no idea whether a message survived a network drop or a broker crash. The `mandatory` flag covers a different gap: if no queue matches, the broker returns the message to the producer with `basic.return` instead of silently dropping it.

Confirms are asynchronous, so for throughput you publish a batch and wait for all confirms at once rather than after each message.

### What happens to a message that matches no queue?

By default the exchange drops it silently, and a confirming publisher still gets an ack, because the broker did handle it. To find out, publish with `mandatory: true` so the broker returns it (the client fires a `return` event before the ack), or configure an alternate exchange that routes everything unroutable to a catch-all queue. Unroutable messages almost always mean a missing binding, so they're worth alerting on.

### What are classic, quorum and stream queues, and when do you use each? {core}

Classic queues are the default: a single node, no replication, and the only type that supports exclusive and non-durable queues, so I use them for temporary, private and reply queues. Quorum queues replicate every message across an odd number of nodes with the Raft consensus protocol, are always durable, and have poison-message protection through a delivery limit; they are the default choice for anything you cannot lose, such as orders and payments. Streams are a replicated append-only log: messages stay after they are read, and consumers attach at an offset and can replay, so I use them for event history or many consumers reading the same data.

Classic mirrored queues, the old replication option, were removed in RabbitMQ 4.0; quorum queues replace them.

### What is a dead-letter exchange, and when is a message dead-lettered? {core}

A dead-letter exchange is an exchange that a queue republishes messages to instead of dropping them. A message is dead-lettered when a consumer rejects it without requeue, when its TTL expires, when the queue overflows its length limit with the default drop-head behaviour, or when a quorum queue's delivery limit is exceeded. The broker adds an `x-death` header with the reason, the queue and a count. I use it for a parking-lot queue that a person or a redrive tool inspects, and for delayed retries via a TTL queue.

### What is the difference between a per-queue and a per-message TTL? {deep}

A per-queue TTL (`x-message-ttl`) applies the same lifetime to every message in the queue; a per-message TTL is the `expiration` property on one message; if both are set, the lower wins. Either way an expired message is never delivered, but it is only actually removed and dead-lettered when it reaches the head of the queue. So with per-message TTLs a short-lived message can be stuck behind a long-lived one. That's why delayed retries use one queue per delay with a queue-level TTL, where messages expire in arrival order. Queue TTL (`x-expires`) is a different feature: it deletes a queue that has gone unused.

### How do queue length limits behave?

You can cap a queue by message count (`x-max-length`) or total body size (`x-max-length-bytes`); only ready messages count, not unacked ones. The default overflow behaviour is `drop-head`: the oldest message is dropped, or dead-lettered if the queue has a DLX. `reject-publish` refuses new messages instead, and a confirming publisher receives a nack, which turns the limit into backpressure. Classic queues also support `reject-publish-dlx`, which dead-letters the refused messages.

### How do message priorities work? {deep}

On classic queues you opt in with `x-max-priority` (1 to 255, with 2 to 4 levels recommended because each level costs resources), and messages without a priority count as 0. Since RabbitMQ 4.3, quorum queues always support 32 strict priority levels (0–31) and ignore `x-max-priority`; messages without a priority count as 4. Priorities only help when messages actually wait in the queue: with a large prefetch, low-priority messages already sitting in a consumer's buffer still get processed first.

### What delivery guarantee does RabbitMQ give? {core}

With manual acks, publisher confirms, and durable queues with persistent messages (or quorum queues), RabbitMQ gives at-least-once delivery: nothing is lost, but a message can arrive more than once. A consumer that finishes the work and crashes before acking sees the message again; a producer that times out waiting for a confirm publishes again. Exactly-once delivery doesn't exist end to end, so I make consumers idempotent: every message carries a stable id, and the consumer records processed ids in the same transaction as its side effect and skips duplicates.

Without acks and confirms you get at-most-once: faster, but any failure loses messages.

### What is the consumer (acknowledgement) timeout? {deep}

It's a safety net against consumers that hold an unacked message forever: if a delivery isn't acked within the timeout, 30 minutes by default, RabbitMQ takes the message back and redelivers it. Up to 4.2 it does that by closing the consumer's whole channel with a precondition-failed error. Since 4.3 quorum queues enforce it, classic queues and streams no longer do, and only the slow consumer is cancelled if the client supports cancel notifications. A job that legitimately runs longer should get a higher timeout for that queue or consumer, or be split into steps with progress tracked outside the message.

It can be set node-wide (`consumer_timeout`), per queue (`x-consumer-timeout` argument or the `consumer-timeout` policy key), and since 4.3 per consumer.

### What do exclusive, auto-delete and durable mean on a queue?

Durable means the queue definition survives a broker restart. Exclusive means only the declaring connection can use it and it is deleted when that connection closes, which suits private reply queues and per-browser live feeds. Auto-delete means the queue is deleted when its last consumer goes away. Non-durable, non-exclusive queues are deprecated and, since 4.3, refused by default: use a durable queue, or an exclusive one if it's temporary.

### What changed in RabbitMQ 4.x? {deep}

4.0 removed classic mirrored queues (quorum queues replace them), made AMQP 1.0 a core protocol, gave quorum queues a default delivery limit of 20 and priorities, and cut the default maximum message size to 16 MiB. 4.2 made the Raft-based Khepri metadata store the default for new clusters. 4.3 removed the old Mnesia store entirely, gave quorum queues 32 strict priorities and built-in delayed retries, moved consumer timeouts into quorum queues, and made the delivery limit count only real failures. The practical upshot for an application: use quorum queues for important data, keep payloads small, and stop relying on mirroring, global prefetch, transient shared queues or the delayed-message plugin.

### What is the difference between a single active consumer and an exclusive consumer? {deep}

Both make one consumer at a time receive a queue's messages, which preserves order. An exclusive consumer (classic queues only; quorum queues ignore the flag) simply refuses other consumers; if it dies, your application must notice and register a new one. A single active consumer (`x-single-active-consumer`, classic and quorum queues) lets several consumers register, delivers only to one, and fails over to the next automatically when the active one goes away. I use single active consumer for ordered processing with high availability.

### What is a virtual host?

A virtual host is a namespace inside a RabbitMQ cluster with its own exchanges, queues, bindings, policies and limits. Users get permissions per vhost (configure, write and read, each as a regex on resource names). I use separate vhosts per application or environment to isolate them on a shared cluster, and per-vhost limits on connections and queues to stop one tenant exhausting the broker.

### Which protocols does RabbitMQ speak? {deep}

AMQP 0-9-1 is the classic protocol most client libraries use. AMQP 1.0 has been a core protocol since 4.0, standardised and used by some enterprise clients. MQTT and STOMP are available as plugins, MQTT for IoT devices. Streams also have their own binary protocol (port 5552), which is faster for high-volume stream consumption and supports features like super streams. They share the same broker, so an MQTT device can publish and an AMQP service can consume.

### What happens when RabbitMQ runs low on memory or disk?

It raises a resource alarm: by default when memory use passes 60% of RAM, or free disk drops below 50 MB, which is too low for production and usually raised. While an alarm is active the whole cluster blocks connections that publish, by no longer reading from their sockets, while consumers keep receiving so they can drain the backlog. Clients are told through `connection.blocked`. A publisher that keeps buffering while blocked can run out of memory itself, so producers should watch that notification and apply backpressure upstream.

## Coding problems

### Match routing keys against topic bindings {medium core}

Write `topic_matches(pattern: str, key: str) -> bool` implementing RabbitMQ topic matching. Keys and patterns are words separated by dots. In a pattern, `*` matches exactly one word and `#` matches zero or more words; any other word must match exactly. Treat an empty string as having no words.

```text
topic_matches("order.created.*", "order.created.eu")   → True
topic_matches("order.created.*", "order.created")      → False
topic_matches("order.#", "order")                      → True
topic_matches("#.eu", "order.created.eu")              → True
```

#### Hints

1. Split both strings into word lists and compare them from the left, one position at a time.
2. `*` is easy: it consumes exactly one word. The hard part is `#`: it can consume zero words or keep consuming more.
3. Write a recursive `match(i, j)` over the pattern index and the key index. For `#`, try "skip the `#`" (`match(i + 1, j)`) or "eat one key word and stay on `#`" (`match(i, j + 1)`). Memoise it.

#### Solution

Recursion over two indices, with memoisation so patterns like `#.#.#` don't explode. When the pattern is exhausted we match only if the key is too. A `#` either matches nothing or swallows one more word and stays put.

```python
from functools import cache


def topic_matches(pattern: str, key: str) -> bool:
    pat = pattern.split(".") if pattern else []
    words = key.split(".") if key else []

    @cache
    def match(i: int, j: int) -> bool:
        if i == len(pat):
            return j == len(words)
        if pat[i] == "#":
            # '#' matches zero words, or one word and stays on '#'
            return match(i + 1, j) or (j < len(words) and match(i, j + 1))
        if j == len(words):
            return False
        return (pat[i] == "*" or pat[i] == words[j]) and match(i + 1, j + 1)

    return match(0, 0)


assert topic_matches("order.created.*", "order.created.eu")
assert not topic_matches("order.created.*", "order.created")
assert not topic_matches("order.created.*", "order.created.eu.north")
assert topic_matches("order.#", "order")
assert topic_matches("order.#", "order.created.eu")
assert not topic_matches("order.#", "orders.created")
assert topic_matches("#", "")
assert topic_matches("#", "a.b.c")
assert topic_matches("#.eu", "order.created.eu")
assert topic_matches("#.eu", "eu")
assert not topic_matches("#.eu", "order.eu.x")
assert topic_matches("*.created.#", "invoice.created")
assert topic_matches("*.created.#", "invoice.created.us.west")
assert not topic_matches("*.created.#", "created")
assert topic_matches("a.#.#.b", "a.b")
assert topic_matches("a.#.#.b", "a.x.y.b")
assert not topic_matches("*", "")
assert topic_matches("", "")
assert not topic_matches("", "a")
assert topic_matches("order.created.eu", "order.created.eu")
```

Complexity: O(P × W) time and space for P pattern words and W key words, thanks to memoisation.

#### Follow-ups

- **A topic exchange has 10,000 bindings. Do you check each one per message?** No: RabbitMQ stores bindings in a trie of words, and walks it once per message, following exact words, `*` and `#` branches.
- **What does a binding of `#` do?** It matches everything, so the topic exchange behaves like a fanout for that queue.

### Route a message through exchanges {medium}

Build a tiny in-memory router. Support declaring queues (each automatically bound to the default exchange `""` by name), exchanges of type `direct`, `fanout`, `topic` and `headers` (with `x-match` of `all` or `any`), bindings from exchanges to queues and to other exchanges, and an optional **alternate exchange** used when an exchange can't route a message anywhere. `route(exchange, key, headers)` returns the set of queues that get a copy.

```text
declare_exchange("shop", "topic"); declare_queue("payments"); bind("payments", "shop", "order.created.*")
route("shop", "order.created.eu")  → {"payments"}
route("", "payments")              → {"payments"}       (default exchange)
```

#### Hints

1. Keep bindings as `(source, destination, key, args, destination_is_exchange)` and dispatch on the source exchange's type.
2. Routing through an exchange-to-exchange binding is recursion: collect the queues the destination exchange routes to. Track visited exchanges so a cycle can't loop forever.
3. Apply an exchange's alternate exchange only when none of that exchange's own bindings matched (to a queue or to another exchange). That's RabbitMQ's rule: a binding to an exchange that then routes nowhere still counts as a match.

#### Solution

Dispatch per exchange type, recurse into destination exchanges with a visited set, and fall back to the alternate exchange when none of the exchange's bindings matched. Each queue appears once in the result even if several bindings match, which is how RabbitMQ behaves. Headers bindings follow RabbitMQ's rule too: arguments starting with `x-` are not matched, and an `all` binding with no other arguments matches every message (an `any` binding with none matches nothing).

```python
from dataclasses import dataclass, field
from functools import cache


def topic_matches(pattern: str, key: str) -> bool:
    pat = pattern.split(".") if pattern else []
    words = key.split(".") if key else []

    @cache
    def match(i: int, j: int) -> bool:
        if i == len(pat):
            return j == len(words)
        if pat[i] == "#":
            return match(i + 1, j) or (j < len(words) and match(i, j + 1))
        if j == len(words):
            return False
        return (pat[i] == "*" or pat[i] == words[j]) and match(i + 1, j + 1)

    return match(0, 0)


@dataclass(frozen=True)
class Binding:
    source: str
    destination: str
    key: str = ""
    args: tuple[tuple[str, str], ...] = ()
    to_exchange: bool = False


@dataclass
class Router:
    exchanges: dict[str, str] = field(default_factory=lambda: {"": "direct"})
    alternates: dict[str, str] = field(default_factory=dict)
    queues: set[str] = field(default_factory=set)
    bindings: list[Binding] = field(default_factory=list)

    def declare_exchange(self, name: str, kind: str, alternate: str | None = None) -> None:
        if kind not in {"direct", "fanout", "topic", "headers"}:
            raise ValueError(f"unknown exchange type {kind!r}")
        self.exchanges[name] = kind
        if alternate:
            self.alternates[name] = alternate

    def declare_queue(self, name: str) -> None:
        self.queues.add(name)  # the default exchange routes to it by name

    def bind(self, queue: str, exchange: str, key: str = "", args: dict[str, str] | None = None) -> None:
        if exchange == "":
            raise ValueError("cannot bind to the default exchange")
        self.bindings.append(Binding(exchange, queue, key, tuple(sorted((args or {}).items()))))

    def bind_exchange(self, destination: str, source: str, key: str = "") -> None:
        self.bindings.append(Binding(source, destination, key, to_exchange=True))

    def _matches(self, kind: str, b: Binding, key: str, headers: dict[str, str]) -> bool:
        if kind == "fanout":
            return True
        if kind == "direct":
            return b.key == key
        if kind == "topic":
            return topic_matches(b.key, key)
        args = dict(b.args)
        mode = args.pop("x-match", "all")
        checks = [headers.get(k) == v for k, v in args.items() if not k.startswith("x-")]
        return all(checks) if mode == "all" else any(checks)

    def route(self, exchange: str, key: str, headers: dict[str, str] | None = None) -> set[str]:
        return self._route(exchange, key, headers or {}, frozenset())

    def _route(self, exchange: str, key: str, headers: dict[str, str], seen: frozenset[str]) -> set[str]:
        if exchange in seen or exchange not in self.exchanges:
            return set()
        seen = seen | {exchange}
        if exchange == "":
            return {key} if key in self.queues else set()
        kind = self.exchanges[exchange]
        found: set[str] = set()
        matched = False
        for b in self.bindings:
            if b.source == exchange and self._matches(kind, b, key, headers):
                matched = True
                found |= self._route(b.destination, key, headers, seen) if b.to_exchange else {b.destination}
        if not matched and exchange in self.alternates:
            found = self._route(self.alternates[exchange], key, headers, seen)
        return found


r = Router()
for q in ["payments", "analytics", "eu-warehouse", "audit", "unrouted", "priority-orders"]:
    r.declare_queue(q)
r.declare_exchange("unrouted.ae", "fanout")
r.bind("unrouted", "unrouted.ae")
r.declare_exchange("shop", "topic", alternate="unrouted.ae")
r.bind("payments", "shop", "order.created.*")
r.bind("analytics", "shop", "order.#")
r.bind("analytics", "shop", "#.eu")  # a second match must not create a second copy
r.declare_exchange("regions", "direct")
r.bind("eu-warehouse", "regions", "eu")
r.declare_exchange("everything", "fanout")
r.bind("audit", "everything")
r.bind_exchange("shop", "everything")  # everything → shop
r.bind_exchange("everything", "shop", "order.#")  # shop → everything: a cycle the router must survive
r.declare_exchange("by-headers", "headers")
r.bind("priority-orders", "by-headers", args={"x-match": "all", "tier": "gold", "region": "eu"})

assert r.route("shop", "order.created.eu") == {"payments", "analytics", "audit"}
assert r.route("shop", "invoice.paid.us") == {"unrouted"}  # nothing matched: alternate exchange
assert r.route("", "payments") == {"payments"}
assert r.route("", "missing") == set()
assert r.route("regions", "eu") == {"eu-warehouse"}
assert r.route("regions", "us") == set()  # no alternate exchange: dropped
assert r.route("everything", "anything") == {"audit", "unrouted"}  # shop routes 'anything' nowhere, so its AE fires
assert r.route("by-headers", "", {"tier": "gold", "region": "eu"}) == {"priority-orders"}
assert r.route("by-headers", "", {"tier": "gold", "region": "us"}) == set()
r.bind("priority-orders", "by-headers", args={"x-match": "any", "rush": "yes", "vip": "yes"})
assert r.route("by-headers", "", {"vip": "yes"}) == {"priority-orders"}
r.declare_exchange("loose-headers", "headers")
r.bind("audit", "loose-headers", args={"x-match": "all"})  # no conditions: matches every message
r.bind("payments", "loose-headers", args={"x-match": "any"})  # no conditions: matches nothing
assert r.route("loose-headers", "", {}) == {"audit"}
r.declare_exchange("front", "fanout", alternate="unrouted.ae")
r.declare_exchange("empty", "direct")  # no bindings
r.bind_exchange("empty", "front")
assert r.route("front", "x") == set()  # front's binding matched (to "empty"), so its AE does not fire
```

Complexity: O(B) binding checks per exchange visited (plus topic matching), and each exchange is visited at most once per route.

#### Follow-ups

- **With `mandatory: true`, when does the publisher get the message back?** When the final set is empty, alternate exchange included: a message the alternate exchange routes counts as routed.
- **How would you make topic routing fast with many bindings?** Index bindings in a trie keyed by word, as RabbitMQ does, instead of scanning every binding.

### Simulate prefetch on uneven jobs {medium}

Messages sit in a queue in order, each with a processing time; all are available at time 0. Several consumers process one message at a time from their own buffer. The broker pushes messages round-robin to consumers that have fewer than `prefetch` unacked messages (`0` means unlimited), and whenever a consumer acks, the broker pushes again. Write `simulate(durations, consumers, prefetch)` returning the total time to finish all messages and which consumer processed each message. Show that `prefetch = 1` finishes `[4, 1, 1, 1, 1, 1]` on 2 consumers sooner than unlimited prefetch.

#### Hints

1. Keep, per consumer, a local buffer of pushed messages, a count of unacked messages, and the time it becomes free.
2. Drive it with an event queue (a heap) of "consumer c finishes at time t". On each finish, ack (decrement unacked), let the broker push more, and start the next buffered message.
3. Write `dispatch()` to hand one message at a time to the next consumer (after the one served last) that still has credit, until the queue is empty or nobody has credit.

#### Solution

An event-driven simulation. The broker's `dispatch` gives one message at a time to the next consumer with free credit, round-robin. Each finish event acks a message, which frees credit and triggers another dispatch. With unlimited prefetch everything is pushed up front, so the consumer that got the 4-second job also holds two short jobs that the other consumer could have done.

```python
import heapq
from collections import deque


def simulate(durations: list[float], consumers: int, prefetch: int) -> tuple[float, list[int]]:
    if consumers < 1 or prefetch < 0:
        raise ValueError("need at least one consumer and a non-negative prefetch")
    queue = deque(range(len(durations)))
    buffers = [deque() for _ in range(consumers)]
    unacked = [0] * consumers
    busy = [False] * consumers
    owner = [-1] * len(durations)
    events: list[tuple[float, int, int]] = []  # (finish time, consumer, message)
    rr = 0

    def has_credit(c: int) -> bool:
        return prefetch == 0 or unacked[c] < prefetch

    def dispatch() -> None:
        nonlocal rr
        while queue:
            # the next consumer with credit, starting after the one served last
            ready = [(rr + step) % consumers for step in range(consumers) if has_credit((rr + step) % consumers)]
            if not ready:
                return
            c = ready[0]
            m = queue.popleft()
            buffers[c].append(m)
            unacked[c] += 1
            owner[m] = c
            rr = (c + 1) % consumers

    def start(c: int, now: float) -> None:
        if not busy[c] and buffers[c]:
            m = buffers[c].popleft()
            busy[c] = True
            heapq.heappush(events, (now + durations[m], c, m))

    dispatch()
    for c in range(consumers):
        start(c, 0.0)
    finished = 0.0
    while events:
        now, c, _ = heapq.heappop(events)
        finished = now
        busy[c] = False
        unacked[c] -= 1  # ack
        dispatch()
        for other in range(consumers):
            start(other, now)
    return finished, owner


jobs = [4, 1, 1, 1, 1, 1]
fair_time, fair_owner = simulate(jobs, consumers=2, prefetch=1)
greedy_time, greedy_owner = simulate(jobs, consumers=2, prefetch=0)
assert greedy_time == 6  # consumer 0 holds the 4s job plus two 1s jobs
assert fair_time == 5  # consumer 1 drains the short jobs while consumer 0 is busy
assert greedy_owner == [0, 1, 0, 1, 0, 1]
assert fair_owner.count(1) == 4
assert simulate([], consumers=3, prefetch=1) == (0.0, [])
assert simulate([2, 2, 2], consumers=1, prefetch=5)[0] == 6
even_time, _ = simulate([1] * 8, consumers=4, prefetch=2)
assert even_time == 2  # uniform jobs: prefetch barely matters
```

Complexity: O(n log n + n × c) for n messages and c consumers.

#### Follow-ups

- **So why not always use prefetch 1?** Each message then waits for a full ack round trip before the next is sent, which caps throughput for fast jobs; the simulation ignores network latency, which is exactly what a larger prefetch hides.
- **What changes with priorities?** Higher-priority messages only jump ahead of messages still in the queue, not ones already in a consumer's prefetch buffer, so a big prefetch weakens priorities.
