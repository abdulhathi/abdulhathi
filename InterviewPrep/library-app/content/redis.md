---
title: Redis and Memorystore
goal: Pick the right Redis data structure for caching, rate limiting, locks, queues and real-time fan-out, explain the failure modes (stampedes, lost locks, lost messages) and run it on Memorystore from Cloud Run.
minutes: 55
---

Redis is the usual caching tier next to a relational database, and in an agent platform it does several jobs: caching API and model results, **rate limiting** calls to LLMs and enterprise APIs, **idempotency keys and locks** for agent steps, and **fanning out stream events** to every WebSocket or SSE server instance. Interviewers ask "which data structure for X?", "how do you invalidate?", and "what breaks?".

**Redis is not on your resume, so be honest:** "I haven't run Redis in production. I know the patterns and their failure modes, and I can compare them with how the same guarantees, idempotency, locking and job queues, are done in a relational database." Then show it. Every example below runs against `fakeredis`, an in-memory Redis implementation for tests, so the commands are real.

## Data structures and what they are for

| Type | Key commands | Use it for |
|---|---|---|
| String | `GET`, `SET … EX/PX/NX`, `INCR`, `INCRBY` | cached values, counters, idempotency keys, simple locks |
| Hash | `HSET`, `HGET`, `HINCRBY`, `HEXPIRE` (7.4+) | an object's fields (run summary), per-field counters |
| List | `LPUSH`, `RPOP`, `BLMOVE`, `LTRIM` | simple queues, capped "last N" lists |
| Set | `SADD`, `SISMEMBER`, `SINTER` | membership, tags, who is watching a run |
| Sorted set | `ZADD`, `ZRANGE … BYSCORE`, `ZREMRANGEBYSCORE` | leaderboards, priority or delayed jobs, sliding-window rate limits |
| Stream | `XADD`, `XREAD`, `XREADGROUP`, `XACK`, `XAUTOCLAIM` | durable event logs, work queues with consumer groups, replay buffers |
| HyperLogLog | `PFADD`, `PFCOUNT` | approximate unique counts (about 0.81% error, 12 KB per key) |
| Pub/Sub | `PUBLISH`, `SUBSCRIBE`, `SPUBLISH` (7.0+) | fire-and-forget fan-out between servers |

```python
import fakeredis

r = fakeredis.FakeRedis(decode_responses=True)

# Strings: a counter and a cached value with a TTL.
assert r.incr("tenant:acme:runs:2026-10-05") == 1
r.set("cache:agent:invoice-agent", '{"model": "fast", "tools": 4}', ex=300)
assert 0 < r.ttl("cache:agent:invoice-agent") <= 300

# Hash: a run summary whose fields change independently.
r.hset("run:5", mapping={"status": "running", "step": "1", "tokens": "0"})
r.hincrby("run:5", "tokens", 900)
assert r.hgetall("run:5") == {"status": "running", "step": "1", "tokens": "900"}

# Set: which users are watching run 5 right now.
r.sadd("run:5:watchers", "maya", "omar", "maya")
assert r.scard("run:5:watchers") == 2

# Sorted set: delayed retries, scored by the time they become due.
r.zadd("retries", {"job-1": 1000, "job-2": 1005, "job-3": 1020})
assert r.zrange("retries", 0, 1006, byscore=True) == ["job-1", "job-2"]

# HyperLogLog: unique operators today, in constant memory.
r.pfadd("operators:2026-10-05", "maya", "omar", "maya", "lee")
assert r.pfcount("operators:2026-10-05") == 3
```

Name keys hierarchically with the tenant first (`tenant:acme:run:123:summary`), so you can reason about ownership, scan by prefix with `SCAN … MATCH`, and use hash tags (below) in a cluster.

## One thread, atomic commands

Redis executes commands one at a time (network I/O can use extra threads since 6.0), so **every single command is atomic** and there are no locks inside Redis. Three ways to make several commands act as one:

- **`MULTI` / `EXEC`**: queue commands and run them together, with no other client's command in between. There is no rollback: if one command fails at runtime, the others still apply.
- **`WATCH` + `MULTI`**: optimistic concurrency. If a watched key changes before `EXEC`, the transaction is discarded and you retry. This is how you do read-modify-write.
- **Lua scripts / Functions** (`EVAL`, `FCALL`): run logic on the server atomically. This is the usual tool for rate limiters and safe lock release.

The flip side: one slow command blocks everyone. Avoid `KEYS *`, `SMEMBERS` or `HGETALL` on huge keys, and deleting giant keys with `DEL` (use `UNLINK`). Use `SCAN` to iterate, and **pipeline** batches of commands to save round trips.

## Expiry and eviction

`SET key value EX 300` or `EXPIRE key 300` gives a key a time to live. Expired keys are removed lazily on access and by a background sampler, so memory is reclaimed gradually. When memory reaches `maxmemory`, the **eviction policy** decides what happens:

| Policy | Behaviour | Use for |
|---|---|---|
| `noeviction` | writes fail with an error when full | queues, locks, sessions: data you must not lose silently |
| `allkeys-lru` / `allkeys-lfu` | evict the least recently / least frequently used key | a pure cache |
| `volatile-lru` / `volatile-lfu` / `volatile-ttl` | evict only keys that have a TTL | mixed use: cache keys have TTLs, durable keys do not |
| `allkeys-random` / `volatile-random` | evict at random | rarely the right choice |

A common senior answer: run the cache and the queue/lock workloads on **separate instances**, so a cache filling up can never evict a lock.

## Caching patterns

- **Cache-aside (lazy loading):** read the cache; on a miss, load from the database, store it with a TTL, return it. This is the default.
- **Read-through / write-through:** a library or proxy loads and writes the cache for you; write-through updates the cache synchronously on every write.
- **Write-behind:** write to the cache and flush to the database asynchronously. It's fast, but you can lose writes; rarely worth it for business data.

**Invalidation** is the hard part. Write to the database first, then **delete** the cache key (don't update it), and always keep a TTL as the safety net for any race you missed. Versioned keys (`agent:invoice:v42`) avoid invalidation entirely for data that changes by publishing a new version.

**Cache stampede:** a hot key expires and a thousand requests miss at once and all hit the database or the LLM. Defences: a **single-flight lock** so only one request recomputes while others wait or serve stale data, **jittered TTLs** so keys don't expire together, and **early refresh** (refresh in the background before expiry).

```python
import json
import random
import time
import uuid

import fakeredis

r = fakeredis.FakeRedis(decode_responses=True)
loads: list[str] = []


def load_agent_config(agent: str) -> dict:
    loads.append(agent)  # stands in for a slow database or API call
    return {"agent": agent, "model": "fast", "max_steps": 12}


def jittered(ttl: int, spread: float = 0.1) -> int:
    """Spread expiries so keys cached together don't all expire together."""
    return int(ttl * random.uniform(1 - spread, 1 + spread))


def get_config(agent: str, ttl: int = 300) -> dict:
    key = f"cache:agent:{agent}"
    if (hit := r.get(key)) is not None:
        return json.loads(hit)
    lock_key, token = f"{key}:lock", str(uuid.uuid4())
    if r.set(lock_key, token, nx=True, px=5_000):  # single flight: only one caller recomputes
        try:
            value = load_agent_config(agent)
            r.set(key, json.dumps(value), ex=jittered(ttl))
            return value
        finally:
            if r.get(lock_key) == token:  # production code does this compare-and-delete in Lua
                r.delete(lock_key)
    for _ in range(50):  # someone else is loading: wait briefly for their result
        time.sleep(0.01)
        if (hit := r.get(key)) is not None:
            return json.loads(hit)
    return load_agent_config(agent)  # fall back rather than fail


assert get_config("invoice-agent")["max_steps"] == 12
assert get_config("invoice-agent")["max_steps"] == 12
assert loads == ["invoice-agent"]  # the second call was a cache hit
assert 270 <= r.ttl("cache:agent:invoice-agent") <= 330

# Invalidation on write: update the source of truth, then delete the key.
r.delete("cache:agent:invoice-agent")
get_config("invoice-agent")
assert loads == ["invoice-agent", "invoice-agent"]
```

Cache **negative results** too (a short TTL for "not found") or a flood of lookups for a missing key will bypass the cache entirely.

## Rate limiting

An agent platform needs limits in two directions: protect our APIs from clients, and protect **external** systems (LLM providers, SAP) from our agents. Redis is shared by every instance, so the limit is global rather than per pod.

- **Fixed window:** `INCR tenant:acme:2026-10-05T09:01` plus `EXPIRE`. Simple and cheap, but it allows a burst of up to twice the limit across a window boundary.
- **Sliding window log:** a sorted set of request timestamps; drop the ones older than the window, count the rest. Accurate, costs memory per request.
- **Token bucket:** tokens refill at a steady rate up to a capacity, each request takes one. It allows controlled bursts and is the usual choice for LLM token budgets. Implement it in Lua so read, refill and take are one atomic step.

```python
import fakeredis

r = fakeredis.FakeRedis(decode_responses=True)


def allow_fixed_window(tenant: str, limit: int, window_s: int, now: int) -> bool:
    key = f"rl:{tenant}:{now // window_s}"
    with r.pipeline() as pipe:  # MULTI/EXEC: increment and set expiry together
        pipe.incr(key)
        pipe.expire(key, window_s * 2)
        count, _ = pipe.execute()
    return count <= limit


assert [allow_fixed_window("acme", 3, 60, now=120 + i) for i in range(5)] == [True, True, True, False, False]
assert allow_fixed_window("acme", 3, 60, now=180)  # a new window starts
assert allow_fixed_window("globex", 3, 60, now=125)  # limits are per tenant
```

The token bucket as a Lua script: read, refill and take happen in one atomic server-side step, in one round trip. `fakeredis` runs Lua here (through the `lupa` engine), so the script is tested. The [token bucket problem](#/redis/p-token-bucket-with-watch-multi) below builds the same algorithm with `WATCH`/`MULTI` for comparison.

```python
import fakeredis

r = fakeredis.FakeRedis(decode_responses=True)

TOKEN_BUCKET = """
local key = KEYS[1]
local capacity, rate = tonumber(ARGV[1]), tonumber(ARGV[2])
local now, cost = tonumber(ARGV[3]), tonumber(ARGV[4])
local state = redis.call('HMGET', key, 'tokens', 'ts')
local tokens = tonumber(state[1]) or capacity
local ts = tonumber(state[2]) or now
tokens = math.min(capacity, tokens + math.max(0, now - ts) * rate)
local allowed = tokens >= cost
if allowed then tokens = tokens - cost end
redis.call('HSET', key, 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', key, math.ceil(capacity / rate) * 2)
return allowed and 1 or 0
"""
take = r.register_script(TOKEN_BUCKET)  # EVALSHA with an automatic EVAL fallback


def allow(key: str, capacity: float, rate: float, cost: float, now: float) -> bool:
    # The caller passes `now` so every instance uses the same clock source; redis.call('TIME') is the alternative.
    return take(keys=[key], args=[capacity, rate, now, cost]) == 1


# A 10-token budget refilling at 2 tokens per second.
assert allow("tb:acme", 10, 2, 6, now=0)
assert not allow("tb:acme", 10, 2, 6, now=0)  # only 4 left
assert allow("tb:acme", 10, 2, 6, now=1)  # 4 + 2 refilled = 6
assert allow("tb:acme", 10, 2, 10, now=100)  # refill is capped at capacity
assert not allow("tb:acme", 10, 2, 1, now=100.25)  # 0.5 tokens: not enough
assert allow("tb:acme", 10, 2, 1, now=100.5)  # fractional refill adds up
assert allow("tb:globex", 10, 2, 10, now=100)  # each tenant has its own bucket
assert 0 < r.ttl("tb:acme") <= 10  # idle buckets expire on their own
```


## Distributed locks

`SET lock:run:5 <random-token> NX PX 30000` acquires a lock only if nobody holds it, with an expiry so a crashed holder can't block forever. Release it only if you still own it: compare the token and delete atomically (a two-line Lua script, or `WATCH` as below).

```python
import uuid

import fakeredis
import redis

r = fakeredis.FakeRedis(decode_responses=True)


def acquire(name: str, ttl_ms: int) -> str | None:
    token = str(uuid.uuid4())
    return token if r.set(f"lock:{name}", token, nx=True, px=ttl_ms) else None


def release(name: str, token: str) -> bool:
    key = f"lock:{name}"
    with r.pipeline() as pipe:
        try:
            pipe.watch(key)
            if pipe.get(key) != token:  # expired and taken by someone else: do not delete their lock
                return False
            pipe.multi()
            pipe.delete(key)
            pipe.execute()
            return True
        except redis.WatchError:
            return False


mine = acquire("run:5", 30_000)
assert mine is not None
assert acquire("run:5", 30_000) is None  # a second worker cannot take it
assert not release("run:5", "someone-elses-token")
assert release("run:5", mine)
assert acquire("run:5", 30_000) is not None
```

The catch every senior should mention: if the holder pauses longer than the TTL (a GC pause, a slow SAP call), the lock expires, a second worker takes it, and both act. A Redis lock is fine for **efficiency** (avoid duplicate work), but for **correctness** pair it with a **fencing token**: a number that increases on every acquisition, which the protected resource checks and rejects if it's older than one it has seen. Or rely on a database constraint or a conditional write. Redlock (locking across several Redis nodes) is debated for exactly this reason (Martin Kleppmann's critique) and doesn't remove the need for fencing.

## Pub/Sub and Streams

**Pub/Sub** delivers a message to whoever is subscribed **right now**: no storage, no acknowledgements, at most once. If a subscriber is disconnected, it misses messages. It is ideal for fan-out between your own servers, where a missed message can be recovered another way.

**Streams** are an append-only log stored in Redis. Each entry gets an ID (`<ms>-<seq>`), readers can read from any ID, and **consumer groups** give work-queue semantics: each entry goes to one consumer in the group, stays in a **pending entries list** until `XACK`, and can be claimed by another consumer if the first one dies (`XAUTOCLAIM`). That is at-least-once delivery, so consumers must be idempotent. Trim with `MAXLEN ~ N` or `MINID`.

```python
import fakeredis

r = fakeredis.FakeRedis(decode_responses=True)

# Pub/Sub: a message only reaches subscribers connected at that moment.
late = r.pubsub()
early = r.pubsub()
early.subscribe("run:5")
early.get_message(timeout=1)  # the subscribe confirmation
r.publish("run:5", "step 2 started")
late.subscribe("run:5")
late.get_message(timeout=1)
assert early.get_message(timeout=1)["data"] == "step 2 started"
assert late.get_message(timeout=0.1) is None  # it subscribed too late: the message is gone

# Streams with a consumer group: at-least-once work distribution.
r.xgroup_create("jobs", "workers", id="0", mkstream=True)
for po in ("PO-1", "PO-2", "PO-3"):
    r.xadd("jobs", {"po": po})

batch = r.xreadgroup("workers", "worker-a", {"jobs": ">"}, count=2)
taken = batch[0][1]
assert [fields["po"] for _, fields in taken] == ["PO-1", "PO-2"]
r.xack("jobs", "workers", taken[0][0])  # PO-1 done; worker-a crashes before finishing PO-2

assert r.xpending("jobs", "workers")["pending"] == 1
# Another worker claims entries that have been idle too long (0 ms here, for the test).
_, claimed, _ = r.xautoclaim("jobs", "workers", "worker-b", min_idle_time=0, start_id="0-0")
assert [fields["po"] for _, fields in claimed] == ["PO-2"]
rest = r.xreadgroup("workers", "worker-b", {"jobs": ">"}, count=10)
assert [fields["po"] for _, fields in rest[0][1]] == ["PO-3"]
```

## Redis as the fan-out layer for WebSocket and SSE servers

A browser is connected to **one** of many Cloud Run or GKE instances, but the event it needs (a token, a step update) is produced by a worker somewhere else. Redis connects them:

```text
 worker ──XADD run:5:events──▶ Redis stream (replay buffer, MAXLEN ~ 10k)
        └─PUBLISH run:5 ─────▶ Redis pub/sub ──▶ every server instance subscribed to run:5
                                                   └─▶ pushes to its own browsers over SSE / WebSocket
 browser reconnects with Last-Event-ID: 1730000000000-3
   └─▶ server XRANGE run:5:events (1730000000000-3 +   → replay what was missed, then go live
```

Each instance subscribes only to the channels its connected clients are watching, and unsubscribes when the last one leaves. Pub/Sub alone would lose events during a reconnect; the stream fills the gap, and the stream entry ID doubles as the SSE `id:` field. The [SSE](#/sse) and [WebSockets](#/websockets) chapters cover the browser side.

```ts typecheck
import { Redis } from 'ioredis';

// One connection is dedicated to subscribing: in RESP2 (what ioredis speaks) a subscribed connection cannot run other commands.
const sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const cmd = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const listeners = new Map<string, Set<(event: string) => void>>();

sub.on('message', (channel: string, message: string) => {
  for (const send of listeners.get(channel) ?? []) send(message);
});

export async function watchRun(runId: string, lastEventId: string | null, send: (event: string) => void) {
  const channel = `run:${runId}`;
  if (!listeners.has(channel)) {
    listeners.set(channel, new Set());
    await sub.subscribe(channel);
  }
  listeners.get(channel)!.add(send);
  if (lastEventId) {
    // Replay everything after the last id the browser saw (exclusive range).
    const missed = await cmd.xrange(`run:${runId}:events`, `(${lastEventId}`, '+');
    for (const [, fields] of missed) send(fields[1] ?? '');
  }
  return async () => {
    const set = listeners.get(channel);
    set?.delete(send);
    if (set && set.size === 0) {
      listeners.delete(channel);
      await sub.unsubscribe(channel);
    }
  };
}
```

There is a small race between subscribing and replaying (an event can arrive in both). Make the browser de-duplicate by event ID, which it needs anyway for reconnects.

## Persistence, replication and clustering

- **Persistence:** RDB writes point-in-time snapshots; AOF logs every write and replays it on restart (`appendfsync everysec` loses at most about a second). Many deployments use both, or none for a pure cache.
- **Replication is asynchronous:** a primary can acknowledge a write and fail before the replica gets it, so a failover can lose recent writes. `WAIT` narrows that window but doesn't make Redis a strongly consistent database. Keep the source of truth in Postgres.
- **Cluster:** keys are split across 16,384 hash slots by a CRC16 hash of the key. Multi-key commands (`MULTI`, Lua, `SUNION`) only work when all keys are in one slot; force that with **hash tags**: `{run:5}:events` and `{run:5}:watchers` hash only the part in braces.
- **Hot keys and big keys:** one very popular key lands on one shard and caps throughput (shard it or add a local in-process cache); one huge key makes commands and migrations slow (split it).

## Memorystore on Google Cloud

- **Memorystore for Redis:** Basic tier (a single node, no replication) or Standard tier (a primary plus replicas with automatic failover). **Memorystore for Redis Cluster** shards across nodes. **Memorystore for Valkey** runs Valkey, the Linux Foundation fork of Redis (versions 7.2, 8.0 and 9.0, with 9.0 the default in 2026; check the supported-versions page for newer ones).
- Memorystore has **private IP only** (Memorystore for Redis through VPC peering or private services access; Redis Cluster and Valkey through Private Service Connect). A Cloud Run service reaches it through Direct VPC egress or a Serverless VPC Access connector. Turn on in-transit encryption and authentication: Memorystore for Redis uses an AUTH string (keep it in Secret Manager), while Redis Cluster and Valkey also support **IAM authentication**, where the service account gets short-lived tokens instead of a static password.
- Licensing context, in case it comes up: in 2024 Redis moved from the BSD licence to source-available licences (RSALv2/SSPLv1), the community forked Valkey under BSD, and Redis 8 (May 2025) added AGPLv3 as an option. That is why Google Cloud offers Valkey alongside Redis.

## Interview questions

### You haven't used Redis in production. How would you answer a Redis question? {core}

"I'd say it plainly: Redis isn't on my resume. Then I'd show I know where it fits and what goes wrong. In an agent platform I'd use it for caching with TTLs and stampede protection, global rate limits on LLM and SAP calls, idempotency keys and short locks for agent steps, and pub/sub plus streams to fan events out to the streaming servers. The guarantees themselves are familiar from relational databases, idempotency with unique constraints and job claiming with row locks, so what I'd focus on is Redis's commands and its durability limits."

**Your angle:** structured-output validation gates and HITL checkpoints at Quantiphi are the same "don't trust, verify, then act once" thinking that locks and idempotency keys need.

### Where would you use Redis on an agentic AI platform? {core}

"Five places. A cache for expensive reads such as agent configs, permissions and repeated tool results. Rate limiting and token budgets, so a runaway agent can't exhaust the LLM quota or hammer SAP. Idempotency keys and short-lived locks so a retried step doesn't act twice. Session storage for a backend-for-frontend. And real-time fan-out: workers publish run events, every WebSocket or SSE server subscribes, and a stream keeps a replay buffer for reconnects."

What I would not use it for: the system of record for runs and audit data. That belongs in Postgres, because Redis can lose acknowledged writes on failover.

### Which Redis data structure would you use for each of these jobs? {core}

"Counters and cached blobs: strings with TTLs. An object whose fields update independently, like a run summary: a hash. A delayed-retry queue or leaderboard: a sorted set scored by time or rank. Who's watching a run: a set. A durable event log or work queue with acknowledgements: a stream with a consumer group. Approximate unique users: HyperLogLog. Server-to-server broadcast: pub/sub."

### Why is Redis fast, and what does single-threaded execution mean for you? {deep}

"Everything is in memory, the data structures are simple and specialised, and commands run on one thread, so there's no locking overhead. For me it means each command is atomic, so `INCR` or `SET NX` is race-free. But one slow command blocks every client, so I avoid O(N) commands on big keys (`KEYS`, huge `HGETALL`), iterate with `SCAN`, delete big keys with `UNLINK`, and pipeline to cut round trips."

### Explain cache-aside and how you keep the cache correct. {core}

"On read, check Redis; on a miss, load from the database, store it with a TTL, and return it. On write, update the database first, then delete the cache key so the next read reloads it. I delete rather than update, because concurrent updates can write values back in the wrong order. The TTL is the safety net for any race I didn't think of. For data that changes by publishing versions, I put the version in the key and never invalidate."

The classic race: a reader misses, loads the old value, a writer updates the database and deletes the key, then the reader writes its old value into the cache. A short TTL bounds how long that stale value lives, and some teams delete twice (immediately and again after a short delay).

### What is a cache stampede and how do you prevent it? {core}

"A hot key expires and many requests miss at the same moment, all recomputing the value and overloading the database or, worse, the LLM. I use a single-flight lock (`SET NX PX`) so one request recomputes while the others wait briefly or serve the stale value, add random jitter to TTLs so related keys don't expire together, and refresh very hot keys early in the background."

### Write-through vs write-behind caching? {deep}

"Write-through updates the cache synchronously with every database write, so reads are always warm, at the cost of write latency and caching things nobody reads. Write-behind writes to the cache and flushes to the database later. It's very fast, but a crash loses writes, and ordering and retries are hard. For business data like runs or approvals I'd use cache-aside or write-through, never write-behind."

### Which eviction policy would you choose? {deep}

"For a pure cache, `allkeys-lru` or `allkeys-lfu`: Redis evicts the least useful keys when memory is full. For data I can't lose silently, like locks, queues or sessions, `noeviction`, so writes fail loudly instead. If one instance must hold both, `volatile-lru` evicts only keys with a TTL. But I'd rather put caching and coordination on separate instances."

### How do you implement rate limiting with Redis? {core}

"Fixed window is `INCR` on a key per tenant per minute with an expiry: cheap, but it allows bursts at window edges. A sliding window uses a sorted set of timestamps: remove the old ones, count the rest, add the new one, in one transaction. A token bucket stores tokens and a last-refill time and refills on each request in a Lua script; that's what I'd use for LLM token budgets because it allows controlled bursts. Because Redis is shared, the limit is global across all instances."

Return `429 Too Many Requests` with `Retry-After` (and `RateLimit` headers) to callers. For outbound calls, a worker that's over budget should requeue with a delay rather than spin.

### How do you build a distributed lock with Redis, and what are its limits? {core}

"`SET lock:key <random token> NX PX <ttl>` acquires it atomically with an expiry; release is a compare-and-delete in Lua so I never delete someone else's lock. The limit is the expiry: if I pause longer than the TTL, the lock lapses, another worker takes it, and both proceed. So I use Redis locks to avoid duplicate work, and for correctness I add a fencing token that the downstream system checks, or rely on a database constraint or conditional write."

Redlock (acquire on a majority of independent Redis nodes) is contested for the same reason: clocks and pauses. A lease in Postgres or a Firestore transaction gives stronger guarantees.

### Pub/Sub or Streams: when do you use which? {core}

"Pub/Sub is fire-and-forget: only subscribers connected right now get the message, nothing is stored or acknowledged. It's perfect for broadcasting live events between my own servers. Streams are a persisted log: readers can resume from an ID, consumer groups spread work with acknowledgements, and a crashed consumer's messages can be claimed by another. I'd use streams for work queues and replay buffers, and often both together: publish for low latency, stream for recovery."

### How would you deliver run events to clients connected to many different server instances? {core}

"The worker that produces an event appends it to a Redis stream for that run and publishes it on a channel. Every streaming server subscribes to the channels its own clients are watching and pushes events to them over SSE or WebSocket. When a client reconnects, possibly to a different instance, it sends the last event ID it saw, and the server replays the gap from the stream with `XRANGE` before switching to live events. The client de-duplicates by ID."

Alternatives worth naming: Google Cloud Pub/Sub (more durable, higher latency, per-subscriber subscriptions are heavier), or Firestore listeners for coarse state without your own push servers.

### How does a stream consumer group handle a consumer that crashes? {deep}

"Every entry delivered to a consumer stays in the group's pending entries list until it's acknowledged with `XACK`. If a consumer dies, its entries stay pending; another consumer uses `XAUTOCLAIM` (or `XPENDING` plus `XCLAIM`) to take entries idle longer than a threshold and process them. Delivery is at least once, so handlers must be idempotent, and I'd move entries that keep failing to a dead-letter stream after N deliveries."

### MULTI/EXEC, WATCH or Lua: which do you use when? {deep}

"`MULTI/EXEC` when I just need several writes to apply together, such as `INCR` plus `EXPIRE`. `WATCH` plus `MULTI` when I must read a value and write based on it, retrying if it changed underneath me. Lua when the logic is more than trivial or contention is high: the script runs atomically on the server in one round trip, which is why rate limiters and lock release are written in Lua. None of them roll back on a runtime error."

### Can Redis lose data? How do RDB and AOF differ? {deep}

"Yes. RDB snapshots periodically, so a crash loses everything since the last snapshot. AOF logs each write, and with fsync every second loses about a second. Replication is asynchronous, so a failover can drop writes the primary already acknowledged. That's why I treat Redis as a cache and coordination layer and keep durable business state in Postgres."

### How does Redis Cluster split data, and what breaks? {deep}

"Keys map to 16,384 hash slots by a CRC16 hash, and slots are spread across shards. Commands touching several keys, including transactions and Lua scripts, only work if all keys are in the same slot, so I use hash tags like `{run:5}:events` and `{run:5}:watchers`. Watch for hot keys, where one popular key overloads one shard, and big keys, which make commands and slot migrations slow."

### What are your options for Redis on Google Cloud, and how does Cloud Run connect? {deep}

"Memorystore for Redis in Basic tier (single node) or Standard tier (with replicas and automatic failover), Memorystore for Redis Cluster for sharding, or Memorystore for Valkey, the open-source fork. Memorystore only has private IPs, so Cloud Run connects through Direct VPC egress or a Serverless VPC Access connector. I'd turn on in-transit encryption and authentication: IAM authentication where it's supported (Cluster and Valkey), otherwise an AUTH string kept in Secret Manager."

### What are hot keys and big keys, and how do you fix them? {deep}

"A hot key gets a disproportionate share of traffic, like a global config read on every request, and saturates one shard. I'd add a short in-process cache in each instance or replicate the key under several names. A big key is a huge hash, list or set. Reading it is slow, deleting it blocks, and it can't be split across shards. I'd split it by sub-key or time bucket, and use `UNLINK` and `SCAN`-style commands."

### Why does Google Cloud offer both Redis and Valkey? {deep}

"In 2024 Redis changed from the BSD licence to source-available licences, and the community, with backing from cloud providers, forked the last BSD version as Valkey under the Linux Foundation. Redis 8 later added AGPLv3 as an option. For application code they're largely compatible at the command level, so choosing one is mostly about managed offering, features and licence policy."

## Coding problems

### Sliding-window rate limiter {medium core}

Write `allow(r, key, limit, window_ms, now_ms)` using a Redis sorted set: allow at most `limit` requests in any rolling `window_ms`. Rejected requests must not count against the limit.

#### Hints

1. Store each accepted request as a sorted-set member scored by its timestamp.
2. On each call, first remove members older than `now - window`, then count what's left.
3. Members must be unique even when two requests share a millisecond.

#### Solution

Trim, count, and add only if under the limit. In production, wrap trim + count + add in a Lua script so concurrent callers can't both slip in; a pipeline is enough to show the logic.

```python
import uuid

import fakeredis


def allow(r: fakeredis.FakeRedis, key: str, limit: int, window_ms: int, now_ms: int) -> bool:
    with r.pipeline() as pipe:
        pipe.zremrangebyscore(key, 0, now_ms - window_ms)  # drop requests outside the window
        pipe.zcard(key)
        _, count = pipe.execute()
    if count >= limit:
        return False
    r.zadd(key, {f"{now_ms}:{uuid.uuid4().hex}": now_ms})
    r.pexpire(key, window_ms)
    return True


r = fakeredis.FakeRedis()
results = [allow(r, "rl:acme", 3, 1_000, t) for t in (0, 100, 200, 300, 999)]
assert results == [True, True, True, False, False]
assert allow(r, "rl:acme", 3, 1_000, 1_001)  # the request at 0 has left the window
assert not allow(r, "rl:acme", 3, 1_000, 1_050)
assert allow(r, "rl:other", 3, 1_000, 1_050)
```

O(log n) per call plus the removed entries; memory O(limit) per key.

#### Follow-ups

- **How is this better than a fixed window?** No double burst at window boundaries.
- **Memory concern at high limits?** Switch to a sliding window counter (two fixed windows weighted by overlap) or a token bucket.

### Token bucket with WATCH/MULTI {medium}

Implement a token bucket stored in a Redis hash: capacity `C` tokens, refilling at `rate` tokens per second, and `take(cost, now)` returns whether the request is allowed. Make the read-refill-write atomic without Lua.

#### Hints

1. Store `tokens` and `ts` (last refill time). Missing state means a full bucket.
2. Refill is `min(C, tokens + (now - ts) * rate)`.
3. `WATCH` the key, read, compute, then `MULTI`/`EXEC`; retry on `WatchError`.

#### Solution

Optimistic concurrency: if another client changes the bucket between our read and our `EXEC`, Redis discards the transaction and we recompute.

```python
import fakeredis
import redis


def take(r: fakeredis.FakeRedis, key: str, capacity: float, rate: float, cost: float, now: float) -> bool:
    if capacity <= 0 or rate <= 0:
        raise ValueError("capacity and rate must be positive")
    while True:
        with r.pipeline() as pipe:
            try:
                pipe.watch(key)
                state = pipe.hgetall(key)
                tokens = float(state.get(b"tokens", capacity))
                ts = float(state.get(b"ts", now))
                tokens = min(capacity, tokens + max(0.0, now - ts) * rate)
                allowed = tokens >= cost
                if allowed:
                    tokens -= cost
                pipe.multi()
                pipe.hset(key, mapping={"tokens": tokens, "ts": now})
                pipe.expire(key, int(capacity / rate) * 2 + 1)
                pipe.execute()
                return allowed
            except redis.WatchError:
                continue  # someone else updated the bucket: recompute with fresh state


r = fakeredis.FakeRedis()
# 10-token budget refilling at 2 tokens/second.
assert take(r, "tb:acme", 10, 2, 6, now=0)
assert not take(r, "tb:acme", 10, 2, 6, now=0)  # only 4 left
assert take(r, "tb:acme", 10, 2, 6, now=1)  # 4 + 2 refilled = 6
assert not take(r, "tb:acme", 10, 2, 1, now=1)
assert take(r, "tb:acme", 10, 2, 10, now=100)  # refill is capped at capacity
assert not take(r, "tb:big", 10, 2, 11, now=0)  # a request bigger than the bucket never fits

try:
    take(r, "tb:bad", 10, 0, 1, now=0)
    raise AssertionError("expected ValueError")
except ValueError:
    pass
```

O(1) per attempt; retries only under contention.

#### Follow-ups

- **Why prefer Lua in production?** One round trip, no retry loop under contention, and the logic can't be half-applied.
- **How would you use this for LLM budgets?** Cost = estimated tokens; on rejection, requeue the agent step with a delay instead of failing the run.

### Resume a stream from Last-Event-ID {medium}

Run events are appended to a Redis stream `run:{id}:events`. Write `replay(r, run_id, last_event_id)` that returns `(id, type)` for every event after `last_event_id`, or all events when it is `None`, so an SSE endpoint can resume a reconnecting client.

#### Hints

1. Stream entry IDs are ordered, so "after X" is a range query.
2. `XRANGE key (X +` uses an exclusive start (Redis 6.2+).
3. `-` and `+` mean the smallest and largest possible IDs.

#### Solution

An exclusive range from the last seen ID to `+` returns exactly what the client missed. The entry ID doubles as the SSE `id:` field.

```python
import fakeredis


def replay(r: fakeredis.FakeRedis, run_id: str, last_event_id: str | None) -> list[tuple[str, str]]:
    start = f"({last_event_id}" if last_event_id else "-"
    return [(entry_id, fields["type"]) for entry_id, fields in r.xrange(f"run:{run_id}:events", min=start, max="+")]


r = fakeredis.FakeRedis(decode_responses=True)
for i, kind in enumerate(["step_started", "token", "token", "approval_needed"], start=1):
    r.xadd("run:5:events", {"type": kind}, id=f"1000-{i}")

assert replay(r, "5", None) == [("1000-1", "step_started"), ("1000-2", "token"), ("1000-3", "token"), ("1000-4", "approval_needed")]
assert replay(r, "5", "1000-2") == [("1000-3", "token"), ("1000-4", "approval_needed")]
assert replay(r, "5", "1000-4") == []
assert replay(r, "missing", None) == []
```

O(log n + k) for k returned events.

#### Follow-ups

- **What if the client's ID was already trimmed away?** Detect it (the oldest ID is newer than the client's) and tell the client to reload a full snapshot from the API instead of a partial replay.
- **How long do you keep events?** Trim with `MAXLEN ~ N` or `MINID` (time-based), and keep the durable copy in Postgres.
