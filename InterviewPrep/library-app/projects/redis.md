---
title: "RateGuard: a Redis-backed API front door with caching, rate limiting and Streams"
summary: A FastAPI service that puts Redis in front of a slow upstream API to cache responses safely, rate-limit clients atomically, rank usage and keep an audit trail in Redis Streams, with load-test numbers to prove it.
time: 3–4 days of evenings
---

## What you will build

RateGuard sits in front of a deliberately slow "catalog" API (a small upstream service you write that takes about 800 ms per call). Clients call RateGuard with an API key. RateGuard:

- serves product reads from a **cache-aside** layer with TTLs, jitter and invalidation on writes, and protects cold keys from a **cache stampede** so 200 simultaneous misses cause one upstream call;
- **rate-limits** every API key two ways: a sliding window in a sorted set, and a token bucket in a Lua script, returning `429` with `Retry-After` and `RateLimit-*` headers;
- keeps a daily **leaderboard** of the busiest API keys in a sorted set;
- writes every request to a **Redis Stream**, read by a worker in a consumer group that acknowledges, retries and reclaims stuck messages;
- exposes **metrics** (cache hit ratio, limiter rejections, p50/p95 latency) and ships a **load test** that compares latency with the cache on and off.

It covers almost every Redis interview topic in one small codebase: data types, TTLs and eviction, atomicity with Lua, Streams and consumer groups, and what to do when Redis is down.

## What it proves

- Redis data structures used for the right job: strings, hashes, sorted sets, streams
- Caching patterns: cache-aside, TTL jitter, invalidation, stampede protection (lock + early refresh)
- Atomic rate limiting with Lua scripts; sliding window vs token bucket trade-offs
- Redis Streams with consumer groups: `XADD`, `XREADGROUP`, `XACK`, `XAUTOCLAIM`
- Async Python services with FastAPI and redis-py's asyncio client
- Measuring performance: load testing, latency percentiles, hit ratio
- Keywords: Redis, caching, rate limiting, Lua, Redis Streams, FastAPI, Python, asyncio, performance, observability

## Architecture

```text
                    ┌──────────────────────────── RateGuard (FastAPI) ─────────────────────────────┐
 client ──X-API-Key─►  rate limiter ──► cache-aside ──► single-flight lock ──► upstream client ──┼──► slow catalog API (≈800 ms)
                    │   (ZSET window +    (GET/SET EX      (SET NX PX)                           │
                    │    Lua token bucket) + jitter)                                             │
                    │        │                 │                                                 │
                    │        └──── XADD audit ─┴──► ZINCRBY leaderboard:{date}                   │
                    └──────────────┼──────────────────────────────────────────────────────────────┘
                                   ▼
                       Redis 8:  cache:*  rl:*  leaderboard:*  stream:audit
                                   │
                                   ▼  XREADGROUP / XACK / XAUTOCLAIM
                         audit worker (consumer group "audit") ──► PostgreSQL (request log)
```

## Milestones

### Milestone 1: the slow upstream and the skeleton

Create the FastAPI app, a tiny upstream catalog service (`GET /products/{id}` sleeps 800 ms; `PUT /products/{id}` updates), an API-key dependency, `/healthz`, settings from environment variables, and a Redis client created in the app's lifespan.

**Done when:** `GET /products/42` through RateGuard returns the upstream data in about 800 ms, and the tests start and stop cleanly.

### Milestone 2: cache-aside with TTLs and invalidation

Read from `cache:product:{id}` first; on a miss call upstream and `SET` with `EX` = base TTL plus random jitter. On `PUT`, update upstream and then delete the key. Cache negative results briefly so missing IDs do not hammer upstream.

**Done when:** the second read takes under 10 ms, an update is visible on the next read, and a unit test (with fakeredis) proves the TTL has jitter and the key is invalidated.

### Milestone 3: stampede protection

On a miss, take a short lock with `SET lock:product:{id} <token> NX PX 3000`; the winner refills the cache, the others wait briefly and re-read. Release the lock only if you still own it (compare-and-delete in Lua). Add early refresh: refresh a hot key in the background when its remaining TTL drops below 10%.

**Done when:** a test fires 200 concurrent requests at a cold key and the upstream counter shows exactly one call.

```python
# Release a lock only if it is still ours (atomic compare-and-delete).
RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end"
```

### Milestone 4: rate limiting two ways

Implement a sliding-window limiter with a sorted set per key (`ZREMRANGEBYSCORE`, `ZADD`, `ZCARD` in one `MULTI`) and a token-bucket limiter as one Lua script that stores tokens and the last refill time in a hash. Return `429`, `Retry-After` and `RateLimit-Limit/Remaining/Reset` headers. Decide and document what happens when Redis is unreachable (fail open for reads, fail closed for writes, for example).

**Done when:** tests show exactly N requests allowed per window, the bucket refills at the configured rate, and `Retry-After` is correct.

### Milestone 5: audit stream, worker and leaderboard

`XADD stream:audit MAXLEN ~ 100000 * key … path … status … ms …` on every request, and `ZINCRBY leaderboard:{yyyy-mm-dd} 1 <api-key>` with a 2-day expiry. Write a worker that reads with `XREADGROUP`, writes batches to PostgreSQL, `XACK`s after the write, and runs `XAUTOCLAIM` on start-up to take over messages a crashed worker left pending.

**Done when:** you can kill the worker mid-batch, restart it, and every request appears in PostgreSQL exactly once (dedupe on the stream ID). `GET /admin/top-keys` returns the leaderboard.

### Milestone 6: metrics and a load test

Expose `/metrics` in Prometheus format (hit ratio, rejections, latency histogram). Write a k6 or Locust script that runs the same traffic with the cache disabled and enabled, and a second scenario that shows the limiter rejecting a noisy client while others stay unaffected.

**Done when:** the README has a results table (requests per second, p50, p95, hit ratio) for both runs, produced by your own script.

## Repository layout

```text
rateguard/
├── app/
│   ├── main.py            # FastAPI app, lifespan, routes
│   ├── cache.py           # cache-aside, single-flight lock, early refresh
│   ├── limits.py          # sliding window + token bucket (Lua)
│   ├── audit.py           # XADD + leaderboard
│   ├── metrics.py
│   └── settings.py
├── worker/audit_worker.py # consumer group → PostgreSQL
├── upstream/catalog.py    # the deliberately slow API
├── lua/token_bucket.lua
├── tests/                 # unit (fakeredis) + integration (real Redis)
├── loadtest/rateguard.js  # k6 scenarios
├── docker-compose.yml
├── pyproject.toml
└── README.md
```

## Tests and CI

- **Unit tests** with `fakeredis` (it supports Lua with `lupa`): TTL jitter, invalidation, both limiters at the boundary, lock release by the wrong owner.
- **Integration tests** against a real Redis: stampede test with 200 concurrent requests, worker crash and `XAUTOCLAIM` recovery.
- **GitHub Actions:** one job with a `redis:8` service container; steps: install with `uv` or `pip`, `ruff`, `mypy`, `pytest --cov`. Add the coverage badge.

```yaml
services:
  redis:
    image: redis:8
    ports: ["6379:6379"]
    options: >-
      --health-cmd "redis-cli ping" --health-interval 5s --health-timeout 3s --health-retries 10
```

## README checklist

- Build and coverage badges
- An architecture diagram (export the one above as an image)
- A short GIF: hammer one key, show `429`s for one client while another keeps getting `200`
- How to run: `docker compose up`, and the local alternative below
- The load-test results table and how to reproduce it
- Design decisions: why Lua, sliding window vs token bucket, fail-open vs fail-closed, why `MAXLEN ~`
- What you would do next (Redis Cluster and hash tags, client-side caching, Valkey compatibility)

**Local development on this Mac:** Docker Hub pulls currently fail here, so run Redis with Homebrew instead (`brew install redis && brew services start redis`) and use the local PostgreSQL. Readers of the repo can use `docker compose up`. If you want Docker working again, `docker logout` and log in again to clear stale credentials.

## Stretch goals

- Run the same code against **Valkey** and note any differences
- Redis **Cluster** mode: use hash tags (`rl:{apikey}:…`) so multi-key Lua scripts stay on one slot
- Client-side caching with `CLIENT TRACKING` for the hottest keys
- Semantic caching for an LLM endpoint using vector search in Redis 8

## Talking about it in an interview

**60-second walkthrough:** "RateGuard is a FastAPI front door in front of a slow API. Reads go through cache-aside with jittered TTLs, and a single-flight lock means a cold key causes one upstream call, not hundreds. Every API key is rate-limited by a token bucket written as a Lua script, so the read-modify-write is atomic in Redis, and clients get standard rate-limit headers. Each request is appended to a Redis Stream; a worker in a consumer group persists it and reclaims messages from crashed workers. I load-tested it: with the cache, p95 dropped from about 800 ms to single-digit milliseconds at the same request rate."

**Likely follow-ups:**

- *Why Lua instead of `GET` then `SET`?* Two clients could both read 1 token left and both proceed. A Lua script runs atomically on the Redis server, so the check and the decrement happen as one step.
- *What happens if Redis goes down?* The cache degrades to calling upstream (slower but correct). For the limiter I chose fail-open on reads, so an outage doesn't take the API down, and fail-closed on expensive writes. I'd alert on it and use a replica with automatic failover in production.
- *How would this work on Redis Cluster?* Multi-key operations must hit one hash slot, so I'd put the API key in a hash tag, like `rl:{key}:window`, so every key a script touches lives on the same shard.

## LinkedIn post template

> I built RateGuard, a small open-source project to go deep on Redis: cache-aside with stampede protection, atomic rate limiting with Lua, and an audit trail with Redis Streams and consumer groups.
> The part I learned most from: a single-flight lock turned 200 concurrent cache misses into one upstream call.
> Load test: p95 went from ~800 ms to <10 ms with the cache on (numbers and script in the repo).
> Code and write-up: <repo link> #Redis #Python #FastAPI #BackendEngineering

## Resume bullet

Built RateGuard, an open-source FastAPI service using Redis for cache-aside with stampede protection, Lua-based token-bucket rate limiting and Redis Streams consumer groups; load tests showed p95 latency falling from ~800 ms to under 10 ms. *(Use only after it is built, public and the numbers are your own.)*
