---
title: PostgreSQL and Cloud SQL
goal: Design the tables behind an agent platform, write window-function and JSONB queries without hesitating, and explain indexes, isolation, locking and connection pooling on Cloud SQL like someone who has run Postgres in production.
minutes: 80
---

Backend and full-stack roles that run on PostgreSQL, or a managed version such as Cloud SQL, ask three kinds of question: **modelling** (how would you store agent runs, steps and tool calls?), **querying** (a live SQL task: latest step per run, top N per group, gaps, running totals), and **operating** (why is this query slow, what isolation level, how many connections can a serverless service open?).

This chapter is about what is specific to PostgreSQL. The database-neutral foundations (joins, grouping, window functions, NULLs, index basics, ACID, isolation anomalies, deadlocks, normalisation, keyset pagination) are in [SQL](#/sql), with their own query problems.

Everything on this page runs against a real PostgreSQL 14 server, and the problems check their exact results. Features from 15+ are called out where they matter. **Your angle:** at Medidata you managed and optimised PostgreSQL databases, writing efficient queries and improving data-access performance for clinical-trial workflows; before that you worked with SQL Server and Entity Framework at Cognizant and optimised SQL schemas at DXC. Lean on the tuning stories you actually remember.

## The practice schema

A slice of an agent platform: agent **runs**, the **steps** inside each run (LLM calls, tool calls, human approvals), an **audit log** of what operators did in the console, and **approval requests** for HITL checkpoints. Traps are built in: run 3 is missing step 4, two audit events are duplicates, some runs have no tool calls, and runs 4, 5 and 8 have not finished.

```sql postgres
SET TIME ZONE 'UTC';

CREATE TABLE runs (
  id          bigint      PRIMARY KEY,
  tenant      text        NOT NULL,
  agent       text        NOT NULL,
  status      text        NOT NULL CHECK (status IN
                ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled')),
  started_at  timestamptz NOT NULL,
  finished_at timestamptz,
  input       jsonb       NOT NULL DEFAULT '{}'
);

CREATE TABLE steps (
  run_id      bigint      NOT NULL REFERENCES runs (id) ON DELETE CASCADE,
  seq         int         NOT NULL,
  kind        text        NOT NULL CHECK (kind IN ('llm', 'tool', 'approval')),
  name        text        NOT NULL,
  status      text        NOT NULL,
  started_at  timestamptz NOT NULL,
  duration_ms int,
  tokens      int,
  PRIMARY KEY (run_id, seq)
);

CREATE TABLE audit_events (
  id     bigint      PRIMARY KEY,
  actor  text        NOT NULL,
  action text        NOT NULL,
  at     timestamptz NOT NULL
);

CREATE TABLE approval_requests (
  id      bigint PRIMARY KEY,
  run_id  bigint NOT NULL REFERENCES runs (id),
  state   text   NOT NULL DEFAULT 'pending',
  version int    NOT NULL DEFAULT 1
);

INSERT INTO runs VALUES
  (1, 'acme',   'invoice-agent',      'succeeded',        '2026-10-01 09:00', '2026-10-01 09:02', '{"po": "PO-1001", "priority": "high"}'),
  (2, 'acme',   'invoice-agent',      'failed',           '2026-10-01 10:00', '2026-10-01 10:01', '{"po": "PO-1002"}'),
  (3, 'acme',   'provisioning-agent', 'succeeded',        '2026-10-02 08:00', '2026-10-02 08:05', '{"env": "dev"}'),
  (4, 'globex', 'support-agent',      'running',          '2026-10-03 12:00', NULL,               '{"ticket": "T-77", "priority": "high"}'),
  (5, 'globex', 'invoice-agent',      'waiting_approval', '2026-10-03 12:30', NULL,               '{"po": "PO-2001", "priority": "high"}'),
  (6, 'globex', 'support-agent',      'succeeded',        '2026-10-03 13:00', '2026-10-03 13:01', '{"ticket": "T-78"}'),
  (7, 'acme',   'provisioning-agent', 'cancelled',        '2026-10-05 09:00', '2026-10-05 09:00', '{"env": "prod"}'),
  (8, 'acme',   'support-agent',      'queued',           '2026-10-05 09:30', NULL,               '{}');

INSERT INTO steps VALUES
  (1, 1, 'llm',      'plan',             'ok',      '2026-10-01 09:00:00', 1200,   850),
  (1, 2, 'tool',     'sap.get_po',       'ok',      '2026-10-01 09:00:02', 640,    NULL),
  (1, 3, 'tool',     'sap.post_invoice', 'ok',      '2026-10-01 09:00:05', 2100,   NULL),
  (1, 4, 'llm',      'summarise',        'ok',      '2026-10-01 09:01:50', 900,    400),
  (2, 1, 'llm',      'plan',             'ok',      '2026-10-01 10:00:00', 1100,   800),
  (2, 2, 'tool',     'sap.get_po',       'error',   '2026-10-01 10:00:02', 30000,  NULL),
  (3, 1, 'llm',      'plan',             'ok',      '2026-10-02 08:00:00', 1500,   1000),
  (3, 2, 'tool',     'terraform.plan',   'ok',      '2026-10-02 08:00:02', 45000,  NULL),
  (3, 3, 'approval', 'human_approval',   'ok',      '2026-10-02 08:00:50', 120000, NULL),
  (3, 5, 'tool',     'terraform.apply',  'ok',      '2026-10-02 08:02:55', 90000,  NULL),
  (4, 1, 'llm',      'plan',             'ok',      '2026-10-03 12:00:00', 1000,   700),
  (4, 2, 'tool',     'kb.search',        'ok',      '2026-10-03 12:00:01', 300,    NULL),
  (5, 1, 'llm',      'plan',             'ok',      '2026-10-03 12:30:00', 1300,   900),
  (5, 2, 'tool',     'sap.get_po',       'ok',      '2026-10-03 12:30:02', 700,    NULL),
  (5, 3, 'approval', 'human_approval',   'waiting', '2026-10-03 12:30:03', NULL,   NULL),
  (6, 1, 'llm',      'answer',           'ok',      '2026-10-03 13:00:00', 800,    500);

INSERT INTO audit_events VALUES
  (1, 'maya', 'login',   '2026-10-05 09:00'),
  (2, 'maya', 'approve', '2026-10-05 09:10'),
  (3, 'maya', 'approve', '2026-10-05 09:35'),
  (4, 'maya', 'logout',  '2026-10-05 11:00'),
  (5, 'omar', 'login',   '2026-10-05 09:05'),
  (6, 'omar', 'approve', '2026-10-05 09:06'),
  (7, 'omar', 'approve', '2026-10-05 09:06'),
  (8, 'omar', 'reject',  '2026-10-05 10:00');

INSERT INTO approval_requests (id, run_id) VALUES (1, 5);
```

`SET TIME ZONE 'UTC'` matters: `timestamptz` is stored as an absolute instant, but it is displayed (and cast to `date`) in the session's time zone. Run your services in UTC and convert at the edge.

## Modelling agent data: columns or JSONB?

A run has a fixed shape (tenant, agent, status, timestamps) and a variable part (the input, each tool's arguments and result). Put what you **filter, join, sort or constrain on** in real columns, and the variable payloads in **JSONB**.

| Use a column when… | Use JSONB when… |
|---|---|
| you filter, join or sort on it | the shape varies per tool or per agent |
| it needs a constraint (NOT NULL, CHECK, FK, UNIQUE) | you store it and read it back whole |
| it is updated on its own, often | it is written once (an event, a tool result) |
| reports aggregate it | the schema is owned by someone else (an LLM, an external API) |

JSONB is a parsed binary format: keys are de-duplicated, key order is not kept, and it can be indexed. Its operators: `->` returns JSON, `->>` returns text, `@>` means "contains", `?` means "has key".

```sql postgres
SELECT id FROM runs WHERE input @> '{"priority": "high"}' ORDER BY id
-- expect: [(1,), (4,), (5,)]
```

```sql postgres
SELECT id, input ->> 'po' FROM runs WHERE input ? 'po' ORDER BY id
-- expect: [(1, 'PO-1001'), (2, 'PO-1002'), (5, 'PO-2001')]
```

When one JSON field becomes a real query dimension, promote it: a **generated column** (or an expression index) gives you a typed, indexable value without changing writers.

```sql postgres
ALTER TABLE runs ADD COLUMN po text GENERATED ALWAYS AS (input ->> 'po') STORED;
CREATE INDEX runs_po_idx ON runs (po) WHERE po IS NOT NULL;
```

```sql postgres
SELECT count(*) FROM runs WHERE po IS NOT NULL
-- expect: [(3,)]
```

Two JSONB costs to mention: updating one key rewrites the whole value (large values are compressed and stored out of line, "TOAST"), and the planner has no statistics on keys inside the document, so row estimates for JSONB filters can be poor.

## Indexes that matter

Index basics (how a B-tree works, the leftmost-prefix rule, why the planner skips an index) are in [SQL](#/sql/q-how-does-an-index-work-and-when-will-the-database-not-use-it). This section is about PostgreSQL's index types and reading its plans.

```sql postgres
-- Equality column first, then the sort/range column: serves "this tenant's runs, newest first".
CREATE INDEX runs_tenant_started_idx ON runs (tenant, started_at DESC);
-- Partial index: only the rows a dashboard polls (unfinished runs), so it stays tiny.
CREATE INDEX runs_active_idx ON runs (started_at) WHERE status IN ('queued', 'running', 'waiting_approval');
-- GIN index for containment queries on JSONB (input @> '{...}').
CREATE INDEX runs_input_gin ON runs USING gin (input jsonb_path_ops);
-- Covering index: the query can be answered from the index alone (an index-only scan).
CREATE INDEX steps_tool_duration_idx ON steps (name) INCLUDE (duration_ms) WHERE kind = 'tool';
```

| Index | Best for | Watch out |
|---|---|---|
| B-tree (default) | `=`, ranges, `ORDER BY`, prefix `LIKE 'abc%'` | column order: equality first, then range or sort; prefix `LIKE` needs the C collation or a `text_pattern_ops` index |
| Partial | a hot subset (unfinished runs, unprocessed jobs) | the query's WHERE must imply the index predicate |
| Expression | `lower(email)`, `(input->>'po')` | the query must use the same expression |
| Covering (`INCLUDE`) | index-only scans for a few extra columns | bigger index; needs the visibility map to be fresh (VACUUM) |
| GIN | JSONB `@>` / `?`, arrays, full-text search | slower writes; `jsonb_path_ops` is smaller and faster but supports only `@>` and jsonpath (`@?`, `@@`), not the key-exists operators like `?` |
| BRIN | huge append-only tables ordered by time | only useful when physical order matches the column |

Every index slows writes and takes memory, so index for the queries you actually run. The way to prove an index helps is `EXPLAIN (ANALYZE, BUFFERS)`. Here is the real plan for "a tenant's 20 newest runs" on a 200,000-row copy of `runs`, before and after adding `(tenant, started_at DESC)`:

```text
 Limit (actual rows=20 loops=1)
   ->  Gather Merge (actual rows=20 loops=1)
         Workers Planned: 1
         ->  Sort (actual rows=14 loops=2)
               Sort Key: started_at DESC
               Sort Method: top-N heapsort  Memory: 28kB
               ->  Parallel Seq Scan on runs (actual rows=2000 loops=2)
                     Filter: (tenant = 'tenant-7'::text)
                     Rows Removed by Filter: 98000
 Execution Time: 11.219 ms

 Limit (actual rows=20 loops=1)
   ->  Index Scan using runs_tenant_started_idx on runs (actual rows=20 loops=1)
         Index Cond: (tenant = 'tenant-7'::text)
 Execution Time: 0.018 ms
```

Read it bottom-up: the first plan scans every row, throws 98% away, then sorts; the second walks the index in order and stops after 20 rows. Things to look for in any plan: **Seq Scan with a large "Rows Removed by Filter"**, **estimated vs actual rows far apart** (stale statistics: run `ANALYZE`), **Sort or Hash spilling to disk**, and **Nested Loop with many loops** on the inner side.

## Transactions, isolation and locking

| Level in PostgreSQL | What each statement sees | Prevents | Still possible |
|---|---|---|---|
| Read committed (default) | a fresh snapshot per **statement** | dirty reads | non-repeatable reads, phantoms, lost updates in read-modify-write code |
| Repeatable read | one snapshot for the whole **transaction** | also non-repeatable reads and phantoms | write skew; concurrent updates to the same row fail with a serialization error |
| Serializable | repeatable read + conflict tracking (SSI) | all anomalies, including write skew | serialization failures (SQLSTATE `40001`) that the app must retry |

(Read uncommitted exists in the syntax but behaves as read committed: Postgres never shows dirty reads.)

The classic bug is the **lost update**: two workers read a counter, both add one, both write. Three fixes, in order of preference: do it in one statement (`UPDATE … SET n = n + 1`, which re-checks the row after waiting for a lock), lock the row while you decide (`SELECT … FOR UPDATE`), or use **optimistic concurrency** with a version column. Optimistic concurrency fits a HITL approval perfectly: two reviewers click "approve" at once, and only one wins.

```sql postgres
UPDATE approval_requests SET state = 'approved', version = version + 1
WHERE id = 1 AND version = 1
RETURNING id, state, version
-- expect: [(1, 'approved', 2)]
```

```sql postgres
UPDATE approval_requests SET state = 'rejected', version = version + 1
WHERE id = 1 AND version = 1
RETURNING id
-- expect: []
```

The second reviewer's update matches no row because the version moved on, so the API returns 409 Conflict and the UI shows "already approved by Maya".

**Row locks for work queues.** `FOR UPDATE SKIP LOCKED` lets many workers claim different rows without waiting on each other: each one locks the first row nobody else has locked. The [task queues chapter](#/task-queues) builds a full queue on it.

```sql postgres
CREATE TABLE jobs (id bigint PRIMARY KEY, priority int NOT NULL, state text NOT NULL DEFAULT 'queued');
INSERT INTO jobs (id, priority) VALUES (1, 1), (2, 5), (3, 5);
```

```sql postgres
UPDATE jobs SET state = 'running'
WHERE id = (SELECT id FROM jobs WHERE state = 'queued' ORDER BY priority DESC, id FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING id
-- expect: [(2,)]
```

**Deadlocks** follow the general rules in [SQL](#/sql/q-what-is-a-deadlock-and-how-do-you-avoid-one): lock rows in a consistent order, keep transactions short, and retry. PostgreSQL checks for a cycle after `deadlock_timeout` (1 second by default) and aborts one transaction with SQLSTATE `40P01`.

**Advisory locks** are application-defined locks on a number: `pg_try_advisory_xact_lock(hashtext('scheduler'))` lets exactly one instance run a scheduled sweep. Prefer the transaction-scoped versions (`_xact_`): session-scoped ones leak through a pooler in transaction mode.

## Idempotent writes with upserts

Agents retry. A tool call that creates an invoice must not create two when the worker crashes after the API call and retries. Store an **idempotency key** with a unique constraint and let the database decide who was first.

```sql postgres
CREATE TABLE tool_results (
  idempotency_key text  PRIMARY KEY,
  run_id          bigint NOT NULL,
  result          jsonb  NOT NULL
);
CREATE TABLE usage_daily (tenant text, day date, tokens bigint NOT NULL, PRIMARY KEY (tenant, day));
```

```sql postgres
INSERT INTO tool_results VALUES ('run-1:sap.post_invoice:PO-1001', 1, '{"invoice": "INV-9"}')
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING idempotency_key
-- expect: [('run-1:sap.post_invoice:PO-1001',)]
```

```sql postgres
INSERT INTO tool_results VALUES ('run-1:sap.post_invoice:PO-1001', 1, '{"invoice": "INV-10"}')
ON CONFLICT (idempotency_key) DO NOTHING
RETURNING idempotency_key
-- expect: []
```

The retry gets no row back, so it reads the stored result instead of calling SAP again. `DO UPDATE` turns the same pattern into an atomic counter:

```sql postgres
INSERT INTO usage_daily VALUES ('acme', '2026-10-01', 100)
ON CONFLICT (tenant, day) DO UPDATE SET tokens = usage_daily.tokens + EXCLUDED.tokens
RETURNING tokens
-- expect: [(100,)]
```

```sql postgres
INSERT INTO usage_daily VALUES ('acme', '2026-10-01', 150)
ON CONFLICT (tenant, day) DO UPDATE SET tokens = usage_daily.tokens + EXCLUDED.tokens
RETURNING tokens
-- expect: [(250,)]
```

## Big tables: partitioning by time

Run events and logs grow forever and are queried by recent time. **Declarative range partitioning** splits one logical table into monthly tables: queries with a time filter only touch the matching partitions ("partition pruning"), and retention becomes `DROP TABLE run_events_2026_01` instead of a huge `DELETE` that bloats the table.

```sql postgres
CREATE TABLE run_events (
  run_id bigint      NOT NULL,
  at     timestamptz NOT NULL,
  type   text        NOT NULL,
  PRIMARY KEY (run_id, at)          -- the primary key must include the partition key
) PARTITION BY RANGE (at);
CREATE TABLE run_events_2026_09 PARTITION OF run_events FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE run_events_2026_10 PARTITION OF run_events FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
INSERT INTO run_events VALUES (1, '2026-09-30 23:59', 'queued'), (1, '2026-10-01 09:00', 'started'), (1, '2026-10-01 09:02', 'done');
```

```sql postgres
SELECT tableoid::regclass::text AS partition, count(*) FROM run_events GROUP BY 1 ORDER BY 1
-- expect: [('run_events_2026_09', 1), ('run_events_2026_10', 2)]
```

Create future partitions ahead of time (a scheduled job or the `pg_partman` extension); an insert with no matching partition fails unless you add a `DEFAULT` partition.

## Running Postgres on Cloud SQL

- **Connecting from Cloud Run:** the built-in Cloud SQL connection (a Unix socket at `/cloudsql/PROJECT:REGION:INSTANCE`), the **Cloud SQL Auth Proxy**, or the **Cloud SQL language connectors** (Python, Node, Java, Go). The proxy and connectors handle TLS and authorise with IAM, and support **IAM database authentication**, so no database password lives in config. For private IP, Cloud Run reaches the VPC through Direct VPC egress or a Serverless VPC Access connector.
- **Connection budget:** each Postgres connection is a backend process (several MB), and `max_connections` is fixed per instance. Cloud Run multiplies your pool: max instances × pool size per instance. 100 instances × a pool of 10 is 1,000 connections, more than most instances allow. Cap max instances, size the pool to the instance's concurrency (not bigger), and put a pooler in front if you need more clients than connections: **Managed Connection Pooling** (generally available since 2025, Enterprise Plus edition only) or your own **PgBouncer**. In PgBouncer's transaction mode, session state (session-level `SET`, advisory locks, `LISTEN`) does not survive between transactions, and named prepared statements need a recent PgBouncer with prepared-statement support enabled.
- **High availability:** a regional (HA) instance keeps a standby in another zone with synchronous replication and fails over automatically; clients must reconnect, so use retries with backoff.
- **Read replicas** are asynchronous, so a read just after a write may not see it. Send "read your own writes" traffic (the run the user just started) to the primary, and send dashboards and reports to replicas.
- **Maintenance:** autovacuum must keep up (dead rows from MVCC, index-only scans need the visibility map, and transaction ID wraparound protection). Watch table bloat and long-running transactions, which stop vacuum from cleaning anything newer than them.
- **Neighbours:** AlloyDB is Google's Postgres-compatible engine for heavier analytical or HTAP load; **pgvector** (available on Cloud SQL and AlloyDB) stores embeddings with HNSW or IVFFlat indexes, so a RAG index can live next to the run data.
- **Newer versions:** PostgreSQL 17 added `JSON_TABLE` and `MERGE … RETURNING`; PostgreSQL 18 added asynchronous I/O, B-tree skip scan, `uuidv7()` (time-ordered UUIDs that index well) and virtual generated columns as the default.

## Zero-downtime migrations

Deploys roll out gradually, so old and new code run against the same schema at once. Use **expand → migrate → contract**: add the new column or table (expand), deploy code that writes both and reads the new one, backfill in small batches, then remove the old column in a later release (contract).

Step 1, expand: add the column. `lock_timeout` makes the `ALTER` fail fast instead of queueing behind a long query (and blocking everyone queued behind it).

```sql postgres
SET lock_timeout = '3s';
ALTER TABLE runs ADD COLUMN priority text DEFAULT 'normal'; -- constant default: no table rewrite since PG 11
```

Step 2, index it without blocking writes. `CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so it runs as a statement on its own (migration tools need a "no transaction" flag for it):

```sql postgres
CREATE INDEX CONCURRENTLY runs_priority_idx ON runs (priority)
```

Step 3, add NOT NULL without a long exclusive lock: a `NOT VALID` check constraint is instant, validating it scans the table while reads and writes continue, and PostgreSQL 12+ then uses the valid check to skip the scan when setting NOT NULL.

```sql postgres
ALTER TABLE runs ADD CONSTRAINT runs_priority_not_null CHECK (priority IS NOT NULL) NOT VALID;
ALTER TABLE runs VALIDATE CONSTRAINT runs_priority_not_null;
ALTER TABLE runs ALTER COLUMN priority SET NOT NULL;
ALTER TABLE runs DROP CONSTRAINT runs_priority_not_null;
```

```sql postgres
SELECT indexname, (SELECT indisvalid FROM pg_index WHERE indexrelid = indexname::regclass)
FROM pg_indexes WHERE tablename = 'runs' AND indexname = 'runs_priority_idx'
-- expect: [('runs_priority_idx', True)]
```

Never rename or drop a column that running code still reads; never run a long backfill in one transaction; and check that a failed `CREATE INDEX CONCURRENTLY` did not leave an `INVALID` index behind.

## Interview questions

### How would you model agent runs, steps and tool calls in PostgreSQL? {core}

"I'd use a `runs` table with the fields I filter and report on as real columns: tenant, agent, status, timestamps. Then a `steps` table keyed by `(run_id, seq)`, with the step kind, status, duration and token counts as columns, and the tool's arguments and results as JSONB because they vary per tool. Status gets a CHECK constraint or an enum. Indexes follow the queries: `(tenant, started_at DESC)` for the run list, a partial index on unfinished runs for the live dashboard, and a GIN index if we query inside the JSON."

Then mention the event log: an append-only `run_events` table (partitioned by month) is what an SSE endpoint replays from when a client reconnects with `Last-Event-ID`. And multi-tenancy: tenant id on every table, in every index's leading column, and optionally enforced with **row-level security** (`CREATE POLICY … USING (tenant = current_setting('app.tenant'))`).

### When would you use JSONB instead of normal columns? {core}

"For data whose shape varies or that I mostly store and read back whole: tool arguments and results, LLM responses, external API payloads. Anything I filter, join, sort or need a constraint on goes in a column. If a JSON field becomes important later, I promote it with a generated column or an expression index."

Follow-up: JSONB vs JSON. `json` stores the original text (keeps whitespace, key order and duplicate keys) and must be re-parsed for every operation; `jsonb` is parsed once, supports indexing and containment, and is what you want almost always.

### When would you use a partial, expression, covering, GIN or BRIN index? {deep}

- **Partial:** a small hot subset. Unfinished runs or queued jobs are a tiny fraction of the table, so `WHERE status IN (...)` keeps the index small and fast.
- **Expression:** queries on a computed value, such as `lower(email)` or `(input->>'po')`.
- **Covering (`INCLUDE`):** add the few columns a query returns, so it is answered by an index-only scan. Index-only scans also depend on the visibility map being current, which vacuum maintains; on a table with many recently changed rows PostgreSQL still visits the heap.
- **GIN:** JSONB containment, arrays, full-text search.
- **BRIN:** a very large append-only table naturally ordered by time. It is tiny but coarse.

### How do you find and fix a slow query in PostgreSQL? {core}

"First find it: `pg_stat_statements` for the queries with the most total time, or Cloud SQL Query Insights. Then `EXPLAIN (ANALYZE, BUFFERS)` and read the plan bottom-up. I look for sequential scans that discard most rows, estimated rows far from actual rows, sorts spilling to disk and nested loops with many iterations. Fixes, in order: add or adjust an index, rewrite the query (for example keyset pagination, or `EXISTS` instead of `IN` with a big subquery), run `ANALYZE` if statistics are stale, and only then change settings like `work_mem`."

Mention the application side too: N+1 query patterns, fetching columns you do not use, missing `LIMIT`, and long transactions holding locks. **Your angle:** query and data-access tuning for clinical-trial workflows at Medidata.

### What is the N+1 problem and how do you fix it? {core}

"Loading a list and then running one more query per item: fetch 50 runs, then 50 separate queries for their steps. It's 51 round trips, and latency grows with the list. The fix is to fetch related rows in one query: a join, a single `WHERE run_id = ANY($1)` for all ids, or `json_agg` to return nested results. In an ORM it's eager loading: SQLAlchemy's `selectinload`, Prisma's `include`."

It also appears in GraphQL resolvers (fixed with a DataLoader that batches per request) and in front-end code that fetches per row: batch the API instead.

### What is MVCC, and why does PostgreSQL need VACUUM? {deep}

"Postgres never updates a row in place. An UPDATE writes a new row version and marks the old one dead, and each transaction sees the versions that were committed when its snapshot was taken. That is why readers never block writers. The cost is dead row versions, so VACUUM (usually autovacuum) reclaims them, updates the visibility map for index-only scans, and freezes old transaction ids to prevent wraparound."

Operational signs: table bloat, autovacuum falling behind on hot tables, and long-running or idle-in-transaction sessions that prevent cleanup. An update that changes no indexed column and fits on the same page is a **HOT update**: it skips index maintenance, which is one reason to avoid indexing frequently changing columns.

### Explain the isolation levels in PostgreSQL. {core}

"Postgres has read committed (the default), repeatable read and serializable. Read committed takes a new snapshot for every statement, so two reads in one transaction can see different data. Repeatable read uses one snapshot for the whole transaction, and in Postgres that also prevents phantoms; if you update a row someone else changed, you get a serialization error. Serializable adds conflict detection so the result equals some serial order, which prevents write skew. Its cost is that transactions can fail with SQLSTATE 40001, so the application must retry them."

Write skew example: "at least one on-call approver must remain". Two transactions each check that there are two approvers and each removes a different one. Neither saw the other's change, so the rule breaks. Only serializable (or explicit locking) prevents it.

### What is a lost update, and how do you prevent it? {core}

"Two transactions read the same value, change it in application code, and write it back. The second write silently overwrites the first. I prevent it by doing the change atomically in SQL (`SET tokens = tokens + $1`), by locking the row with `SELECT ... FOR UPDATE` while I decide, or with optimistic concurrency: a version column checked in the `WHERE` clause, returning 409 if no row was updated."

For a web API the optimistic approach maps neatly onto HTTP: return the version as an ETag, require `If-Match` on updates, and answer `412 Precondition Failed` (or 409) on a mismatch.

### Which PostgreSQL-specific SQL features do you use day to day? {core}

"`RETURNING`, so an insert or update hands back what it changed without a second query. `ON CONFLICT` for upserts and idempotent writes. `DISTINCT ON` for 'latest row per key'. `FILTER (WHERE …)` for conditional aggregates instead of `CASE` inside `SUM`. `generate_series` to fill gaps in a time series. `= ANY($1)` to pass a whole list as one array parameter, and `json_agg` or `jsonb_build_object` to return nested results in one round trip."

```sql postgres
-- DISTINCT ON keeps the first row per actor under the ORDER BY: each operator's latest action.
SELECT DISTINCT ON (actor) actor, action
FROM audit_events
ORDER BY actor, at DESC, id DESC
-- expect: [('maya', 'logout'), ('omar', 'reject')]
```

```sql postgres
-- FILTER: several conditional counts in one pass.
SELECT run_id,
       count(*) FILTER (WHERE kind = 'tool') AS tool_steps,
       count(*) FILTER (WHERE kind = 'llm')  AS llm_steps
FROM steps
WHERE run_id IN (1, 2, 3)
GROUP BY run_id
ORDER BY run_id
-- expect: [(1, 2, 2), (2, 1, 1), (3, 2, 1)]
```

The portable alternatives are worth naming too: `ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) = 1` instead of `DISTINCT ON`, and `SUM(CASE WHEN … THEN 1 ELSE 0 END)` instead of `FILTER`. Know both, because the interviewer may ask for standard SQL.

### Optimistic or pessimistic locking: when do you use which?

"Pessimistic (`SELECT ... FOR UPDATE`) when conflicts are likely and the transaction is short, for example claiming a job or moving money. Optimistic (a version check) when conflicts are rare or the 'transaction' spans user think-time, like a reviewer editing a form for two minutes. You can't hold a database lock across an HTTP round trip, so optimistic is the only option there."

### What does `FOR UPDATE SKIP LOCKED` do, and where would you use it? {deep}

"It locks the selected rows but silently skips rows another transaction has already locked, instead of waiting. That lets many workers poll the same jobs table and each claim a different job, which makes Postgres a simple and reliable work queue: the claim and the state change are transactional with your other data."

Limits: polling load, no push notifications (you can add `LISTEN/NOTIFY` as a wake-up signal), and at very high throughput a dedicated queue (Pub/Sub, Cloud Tasks) scales better. `FOR UPDATE NOWAIT` is the other option: fail immediately instead of waiting.

### What are advisory locks? {deep}

"Locks on an application-chosen number rather than a row. I'd use `pg_try_advisory_xact_lock(hashtext('nightly-sweep'))` so that only one instance runs a scheduled job, or to serialise work per run id. I prefer the transaction-scoped variants because they release automatically and behave correctly behind a pooler in transaction mode."

### How do you make writes idempotent? {core}

"Give each logical operation an idempotency key and put a unique constraint on it. `INSERT ... ON CONFLICT DO NOTHING RETURNING` tells me whether I was first; if I get no row back, it's a retry, and I return the stored result instead of repeating the side effect. For counters, `ON CONFLICT DO UPDATE SET n = n + EXCLUDED.n` makes the increment atomic."

The harder part is the external side effect: if the worker crashes after calling SAP but before saving the result, the key alone does not help. Pass the same idempotency key to the external API when it supports one, or record "in progress" first and reconcile on retry. The [task queues chapter](#/task-queues) covers the outbox pattern.

### When would you partition a table, and how? {deep}

"When a table is very large and naturally queried and expired by time, like run events or logs. I'd use declarative range partitioning by month: queries with a time filter only scan the relevant partitions, and retention is a fast `DROP` of an old partition instead of a giant `DELETE`. The partition key must be part of the primary key, and I'd automate creating future partitions."

Partitioning is not a fix for a missing index, and too many partitions slow planning. Below tens of millions of rows a good index usually beats partitioning.

### How many database connections will a Cloud Run service open, and how do you control it? {core}

"Up to max instances times the pool size per instance. With 100 instances and a pool of 10 that's 1,000 connections, and a Cloud SQL instance's `max_connections` is usually lower. So I size the pool to what one instance needs, cap max instances, and put a transaction-mode pooler in front if many services share the database: Cloud SQL's Managed Connection Pooling on Enterprise Plus, or PgBouncer. I also set connection and statement timeouts so a slow database doesn't make every instance pile up waiting requests."

Inside one instance: with Cloud Run concurrency 80 and a pool of 10, requests queue for a connection, which is usually fine because queries are short. Make the pool smaller than concurrency, not equal to it, and watch pool wait time.

### How does an application connect securely to Cloud SQL? {deep}

"From Cloud Run I'd use the built-in Cloud SQL connection or a Cloud SQL language connector. Both use the service account's IAM permissions (`roles/cloudsql.client`) to authorise and TLS to encrypt, and with IAM database authentication there's no password at all. For a private-IP-only instance, Cloud Run reaches the VPC through Direct VPC egress or a Serverless VPC Access connector. If a password is needed, it lives in Secret Manager."

### How do read replicas affect correctness? {deep}

"Cloud SQL read replicas replicate asynchronously, so a replica can be a little behind. If a user starts a run and the next request reads from a replica, the run may not be there yet. I route read-your-own-writes paths to the primary and send dashboards, reports and search to replicas, which tolerate a few seconds of lag. I'd monitor replication lag and alert on it."

### How do you change a schema without downtime? {deep}

"Expand, migrate, contract. Add new columns or tables in a backward-compatible way; deploy code that writes both and reads the new; backfill in small batches; and drop the old column only in a later release, when no running code reads it. On big tables I use `CREATE INDEX CONCURRENTLY`, add constraints as `NOT VALID` then validate them, and set `lock_timeout` so a migration fails fast instead of blocking traffic behind a lock queue."

Postgres 11+ adds a column with a constant default without rewriting the table. Renames are the classic outage: old pods still query the old name.

### Which PostgreSQL features would you use for a regulated or multi-tenant application? {deep}

"Row-level security policies so each tenant or care team only sees its own rows, enforced in the database rather than in every query. JSONB with GIN indexes for semi-structured payloads such as FHIR resources or extracted document fields. Partial and expression indexes for the hot queries. Encryption at rest from the cloud provider plus TLS in transit, and `pgcrypto` for the few columns that need application-level encryption. Audit triggers or logical decoding to record who changed what. Partitioning by month for very large event or claim tables, and pgvector if a RAG feature needs embeddings next to the relational data."

```sql postgres
CREATE TABLE documents (id bigint PRIMARY KEY, payload jsonb NOT NULL);
INSERT INTO documents VALUES
  (1, '{"form_type": "MAGI", "fields": {"monthly_income": 2400}}'),
  (2, '{"form_type": "paystub", "fields": {"gross": 1800}}');
CREATE INDEX documents_payload_gin ON documents USING gin (payload jsonb_path_ops);
```

```sql postgres
-- Containment query that the GIN index can serve.
SELECT id FROM documents WHERE payload @> '{"form_type": "MAGI"}'
-- expect: [(1,)]
```

**Your angle:** at Quantiphi, Pydantic schemas validated ML-extracted fields from Medicaid documents such as MAGI forms and paystubs. If asked how you would keep such a variable payload in PostgreSQL, JSONB next to the relational columns you filter on is the natural answer; describe the storage the project actually used only as you remember it.

### Why keep runs in PostgreSQL rather than Firestore or Redis?

"Runs and steps are relational and need constraints, transactions across tables, ad-hoc reporting and joins, so Postgres is the system of record. Firestore is a good fit where the front end needs live listeners on a document, such as a run's progress, and Redis fits ephemeral, fast data: caches, rate limits, the pub/sub fan-out to WebSocket servers. I'd keep one source of truth and treat the others as projections of it."

See the decision table in [Firestore](#/firestore) and [Redis](#/redis).

## Coding problems

### Latest step of every run {easy core}

For each run that has steps, return the run id, the latest step's `seq` and its `name`, ordered by run id.

#### Hints

1. "Latest per key" is a top-1-per-group problem.
2. PostgreSQL has a shortcut that keeps the first row of each group under a given ORDER BY.

#### Solution

`DISTINCT ON (run_id)` keeps the first row for each run under the ORDER BY, so ordering by `seq DESC` makes that the latest step. The portable alternative is `ROW_NUMBER() OVER (PARTITION BY run_id ORDER BY seq DESC) = 1`.

```sql postgres
SELECT DISTINCT ON (run_id) run_id, seq, name
FROM steps
ORDER BY run_id, seq DESC
-- expect: [(1, 4, 'summarise'), (2, 2, 'sap.get_po'), (3, 5, 'terraform.apply'), (4, 2, 'kb.search'), (5, 3, 'human_approval'), (6, 1, 'answer')]
```

With the primary key `(run_id, seq)` this reads the index in order.

#### Follow-ups

- **What if you need the latest step for only 20 runs on a page?** Use a `LATERAL` subquery with `ORDER BY seq DESC LIMIT 1` per run; it does 20 index lookups.

### Two slowest tool calls per agent {medium core}

For each agent, return its two slowest tool calls: agent, run id, tool name and duration in ms, slowest first within each agent, agents in alphabetical order.

#### Hints

1. Tool calls live in `steps`; the agent lives in `runs`.
2. Number the rows within each agent by duration, descending.
3. Filter on that number in an outer query: you cannot use a window function in WHERE.

#### Solution

Join steps to runs, rank with `ROW_NUMBER()` partitioned by agent, then keep ranks 1 and 2. Use `RANK()` instead if ties should both be kept.

```sql postgres
WITH ranked AS (
  SELECT r.agent, s.run_id, s.name, s.duration_ms,
         ROW_NUMBER() OVER (PARTITION BY r.agent ORDER BY s.duration_ms DESC) AS rn
  FROM steps s JOIN runs r ON r.id = s.run_id
  WHERE s.kind = 'tool'
)
SELECT agent, run_id, name, duration_ms FROM ranked WHERE rn <= 2 ORDER BY agent, rn
-- expect: [('invoice-agent', 2, 'sap.get_po', 30000), ('invoice-agent', 1, 'sap.post_invoice', 2100), ('provisioning-agent', 3, 'terraform.apply', 90000), ('provisioning-agent', 3, 'terraform.plan', 45000), ('support-agent', 4, 'kb.search', 300)]
```

#### Follow-ups

- **ROW_NUMBER vs RANK vs DENSE_RANK?** ROW_NUMBER is always unique; RANK leaves gaps after ties (1, 1, 3); DENSE_RANK does not (1, 1, 2).

### Success rate per agent {easy core}

For each agent: the total number of runs, how many have finished (succeeded, failed or cancelled), and the success rate as a percentage of finished runs, rounded to one decimal place.

#### Hints

1. You need several conditional counts in one pass over `runs`.
2. Postgres supports `count(*) FILTER (WHERE …)`.
3. Guard against dividing by zero for an agent with no finished runs.

#### Solution

One GROUP BY with filtered aggregates. `NULLIF(x, 0)` turns a zero denominator into NULL, so the rate is NULL instead of an error.

```sql postgres
SELECT agent,
       count(*) AS total,
       count(*) FILTER (WHERE status IN ('succeeded', 'failed', 'cancelled')) AS finished,
       round(100.0 * count(*) FILTER (WHERE status = 'succeeded')
             / NULLIF(count(*) FILTER (WHERE status IN ('succeeded', 'failed', 'cancelled')), 0), 1) AS success_pct
FROM runs
GROUP BY agent
ORDER BY agent
-- expect: [('invoice-agent', 3, 2, 50), ('provisioning-agent', 2, 2, 50), ('support-agent', 3, 1, 100)]
```

#### Follow-ups

- **Why `100.0` and not `100`?** Integer division truncates: `1 / 2` is 0 in SQL.
- **Without FILTER?** `sum(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END)` works in every database.

### Running token total within each run {medium core}

For runs 1 and 3, list every step with its tokens (0 when NULL) and the running total of tokens up to and including that step.

#### Hints

1. A running total is a windowed SUM with an ORDER BY.
2. Restart the total for each run.
3. NULL tokens should count as 0 in the output.

#### Solution

`SUM(...) OVER (PARTITION BY run_id ORDER BY seq)` uses the default frame "from the start of the partition to the current row".

```sql postgres
SELECT run_id, seq, coalesce(tokens, 0) AS tokens,
       sum(coalesce(tokens, 0)) OVER (PARTITION BY run_id ORDER BY seq) AS running_tokens
FROM steps
WHERE run_id IN (1, 3)
ORDER BY run_id, seq
-- expect: [(1, 1, 850, 850), (1, 2, 0, 850), (1, 3, 0, 850), (1, 4, 400, 1250), (3, 1, 1000, 1000), (3, 2, 0, 1000), (3, 3, 0, 1000), (3, 5, 0, 1000)]
```

#### Follow-ups

- **What is the subtle trap with the default frame?** With `ORDER BY` the default frame is `RANGE ... CURRENT ROW`, which includes all peers with the same sort value. If the sort key has ties, use `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`.

### Runs with no tool calls {easy core}

Return the id and status of every run that has no tool-call step, including runs with no steps at all.

#### Hints

1. This is an anti-join.
2. An inner join would drop runs with no steps; you want the ones with no matching tool step.

#### Solution

`NOT EXISTS` reads exactly like the requirement and is safe with NULLs. `LEFT JOIN ... WHERE s.run_id IS NULL` also works; avoid `NOT IN (subquery)`, which returns nothing if the subquery yields a NULL.

```sql postgres
SELECT r.id, r.status
FROM runs r
WHERE NOT EXISTS (SELECT 1 FROM steps s WHERE s.run_id = r.id AND s.kind = 'tool')
ORDER BY r.id
-- expect: [(6, 'succeeded'), (7, 'cancelled'), (8, 'queued')]
```

#### Follow-ups

- **Why is NOT IN dangerous?** `x NOT IN (1, NULL)` is never true, because `x <> NULL` is unknown.

### Find gaps in step numbering {medium}

Steps should be numbered 1, 2, 3… without gaps. Return every gap as `(run_id, gap_start, gap_end)`.

#### Hints

1. Compare each step with the next one in the same run.
2. If the next `seq` is more than one higher, the numbers in between are missing.

#### Solution

`LEAD(seq)` gives the next step's number; a gap starts at `seq + 1` and ends at `next_seq - 1`.

```sql postgres
SELECT run_id, seq + 1 AS gap_start, next_seq - 1 AS gap_end
FROM (SELECT run_id, seq, LEAD(seq) OVER (PARTITION BY run_id ORDER BY seq) AS next_seq FROM steps) t
WHERE next_seq > seq + 1
ORDER BY run_id, gap_start
-- expect: [(3, 4, 4)]
```

#### Follow-ups

- **And a gap at the start (first step is 2)?** Also check `min(seq) > 1` per run, or compare against `generate_series(1, max(seq))`.

### Group operator activity into sessions {hard}

An operator's console session ends after 30 minutes of inactivity. For each actor, number their sessions and return the session's first and last event time (`HH24:MI`) and its number of events.

#### Hints

1. Look at the previous event of the same actor with LAG.
2. Mark an event as "starts a new session" when there is no previous event or the gap is over 30 minutes.
3. A running SUM of those marks gives every event its session number.

#### Solution

The "gaps and islands" pattern: flag session starts, turn the flags into ids with a running sum, then group.

```sql postgres
WITH flagged AS (
  SELECT id, actor, at,
         CASE WHEN at - LAG(at) OVER (PARTITION BY actor ORDER BY at, id) <= interval '30 minutes'
              THEN 0 ELSE 1 END AS starts_session
  FROM audit_events
), numbered AS (
  SELECT actor, at, sum(starts_session) OVER (PARTITION BY actor ORDER BY at, id ROWS UNBOUNDED PRECEDING) AS session_no
  FROM flagged
)
SELECT actor, session_no, to_char(min(at), 'HH24:MI'), to_char(max(at), 'HH24:MI'), count(*)
FROM numbered
GROUP BY actor, session_no
ORDER BY actor, session_no
-- expect: [('maya', 1, '09:00', '09:35', 3), ('maya', 2, '11:00', '11:00', 1), ('omar', 1, '09:05', '09:06', 3), ('omar', 2, '10:00', '10:00', 1)]
```

The first event's LAG is NULL, the comparison is unknown, and CASE falls through to 1: a new session.

#### Follow-ups

- **Where else does this pattern appear?** Consecutive failed runs, streaks of days with activity, and merging overlapping time ranges.

### Delete duplicate audit events {medium core}

Two audit rows with the same actor, action and timestamp are duplicates from a retried write. Delete the duplicates, keeping the row with the lowest id, and return the ids you deleted.

#### Hints

1. Number the rows within each duplicate group, lowest id first.
2. Everything with a number above 1 goes.
3. `DELETE ... RETURNING` can sit inside a CTE.

#### Solution

Rank inside each `(actor, action, at)` group, delete ranks above 1, and return what was removed. Then add a unique constraint so it can't happen again.

```sql postgres
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY actor, action, at ORDER BY id) AS rn FROM audit_events
), deleted AS (
  DELETE FROM audit_events WHERE id IN (SELECT id FROM ranked WHERE rn > 1) RETURNING id
)
SELECT id FROM deleted ORDER BY id
-- expect: [(7,)]
```

```sql postgres
ALTER TABLE audit_events ADD CONSTRAINT audit_events_once UNIQUE (actor, action, at);
```

#### Follow-ups

- **On a 500-million-row table?** Delete in batches (by id range) so each transaction is short and replicas keep up, or copy the distinct rows into a new table and swap.

### Keyset pagination for the run list {medium core}

The console lists runs newest first, three per page. Page 1 ended with the run started at `2026-10-03 13:00` with id 6. Write the query for page 2, returning id and agent.

#### Hints

1. Do not use OFFSET.
2. The cursor is the last row's sort key plus a unique tie-breaker.
3. Postgres can compare row values: `(a, b) < (x, y)`.

#### Solution

A row comparison on `(started_at, id)` continues exactly after the last row seen. With an index on `(started_at DESC, id DESC)` this is an index range scan at any depth.

```sql postgres
SELECT id, agent
FROM runs
WHERE (started_at, id) < ('2026-10-03 13:00+00', 6)
ORDER BY started_at DESC, id DESC
LIMIT 3
-- expect: [(5, 'invoice-agent'), (4, 'support-agent'), (3, 'provisioning-agent')]
```

#### Follow-ups

- **How does the API expose this?** Return an opaque `next_cursor` (base64 of the two values) and accept it on the next request; never expose raw SQL offsets.
- **And for a tenant-filtered list?** Index `(tenant, started_at DESC, id DESC)` and add `tenant = $1`.

### Daily run counts, including days with no runs {medium}

Return the number of runs started on each day from 2026-10-01 to 2026-10-05, including days with zero runs.

#### Hints

1. Days with no runs have no rows to group, so you need a list of days to start from.
2. `generate_series` can produce dates.
3. Count a column from the runs side, not `*`, so empty days count 0.

#### Solution

Generate the calendar, LEFT JOIN runs onto it, and count `r.id`. Comparing on a half-open range keeps an index on `started_at` usable.

```sql postgres
SELECT d::date AS day, count(r.id)
FROM generate_series(date '2026-10-01', date '2026-10-05', interval '1 day') AS d
LEFT JOIN runs r ON r.started_at >= d AND r.started_at < d + interval '1 day'
GROUP BY d
ORDER BY d
-- expect: [('2026-10-01', 2), ('2026-10-02', 1), ('2026-10-03', 3), ('2026-10-04', 0), ('2026-10-05', 2)]
```

#### Follow-ups

- **Why not `WHERE r.started_at::date = d`?** Casting the column defeats a plain index on `started_at`, and it depends on the session time zone.
- **For a dashboard over months of data?** Pre-aggregate into a daily rollup table (or a materialised view refreshed on a schedule).
