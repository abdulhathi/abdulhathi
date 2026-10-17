---
title: Firestore for live, document-shaped data
goal: Model data for Firestore by the queries you need, know its limits and query rules cold, and explain when its real-time listeners beat building your own WebSocket layer, and when Postgres or Redis is the better tier.
minutes: 50
---

Firestore often sits next to PostgreSQL as the document tier of a GCP application. Interviewers want to know three things: that you **model by query** instead of normalising, that you know the **limits and query rules** that shape every design, and that you can say **when Firestore is the right tier** (live documents pushed to browsers, per-user data, spiky serverless load) and when it is not (relational reporting, joins, very hot single documents).

**Your angle:** Firestore is on your resume's skills list. Be ready to describe in your own words what you stored in it and why. The material below gives you the vocabulary and the trade-offs.

## The data model in one page

- A **database** holds **collections**; a collection holds **documents**; a document holds **fields** and can own **subcollections**. Paths alternate: `tenants/acme/runs/r-123/steps/0004`.
- A document is a map of typed fields: string, number (integer or double), boolean, map, array, null, timestamp, geopoint, reference, bytes and vector. Maps and arrays nest up to 20 levels.
- Collections are created implicitly by writing a document, and there is no schema: two documents in one collection can differ.
- **Subcollections are independent.** Deleting `runs/r-123` does not delete `runs/r-123/steps/*`; you delete them yourself.
- Every query is served by an index, so query cost scales with the size of the **result set**, not the size of the collection.
- Firestore has **Native mode** (real-time listeners, client SDKs) and **Datastore mode** (the older Datastore API, server-side only). Everything here is Native mode.
- A database is also either **Standard** or **Enterprise edition**. Standard is the classic Firestore: every query needs an index, and you pay per document read and written. Enterprise adds an advanced query engine (**pipeline operations**, generally available since April 2026, including subqueries that can join collections), optional indexes, MongoDB compatibility, text and geospatial search in preview, and pricing by bytes read and written. Both editions keep real-time listeners and offline support. The limits, query rules and billing below are for **Standard edition**, which is what most existing projects and most interview questions assume; if a project uses Enterprise, say you would check which pipeline features it relies on.

## Limits that shape designs

From the current Standard edition quotas and best-practice pages:

| Limit | Value |
|---|---|
| Maximum document size | 1 MiB (1,048,576 bytes) |
| Maximum document name (path) size | 6 KiB |
| Maximum depth of maps and arrays | 20 |
| Index entries per document | 40,000 |
| Maximum indexed field value | 1,500 bytes (longer values are truncated in the index) |
| Composite indexes per database | 200 without billing, 1,000 with billing |
| Transaction time limit | 270 seconds, with a 60-second idle expiration |
| Field transforms per document in one commit | 500 |
| Maximum API request size | 10 MiB |
| `in` and `array-contains-any` | up to 30 values; `not-in` up to 10 |
| OR queries | up to 30 disjunctions in disjunctive normal form |
| Range or inequality filters | on up to 10 different fields in one query |
| Writes to a collection with a monotonically increasing indexed field (a timestamp) | capped at about 500 per second |

Two items have changed over the years, so say them carefully. Older documentation gave "about one sustained write per second per document"; the current best-practices page gives no fixed number and says it depends on the workload, but either way **a single hot document is a bottleneck**. Older documentation also capped a batch or transaction at 500 writes; the current quotas page lists only the 500 field-transform limit and the 10 MiB request size.

For new collections that will take heavy traffic, ramp up with the **500/50/5 rule**: start at no more than 500 operations per second, then increase by 50% every 5 minutes.

## Model by query, not by entity

In Postgres you normalise and join at read time. Standard edition Firestore has **no joins** (Enterprise pipelines add subqueries, but they cost reads and are not available to Standard databases), so you shape documents around the screens and queries you need and accept duplication. For the agent platform:

```text
tenants/{tenantId}/runs/{runId}              run summary: status, agent, startedAt, progress, lastStep, ownerUid
tenants/{tenantId}/runs/{runId}/steps/{seq}  one document per step (unbounded list → subcollection)
users/{uid}/approvals/{approvalId}           fan-out copy for each approver's inbox
tenants/{tenantId}/stats/{yyyy-mm-dd}        pre-aggregated daily counters (sharded if hot)
```

The rules of thumb:

- **Embed** data that is small, bounded and read together (the run's latest step, a progress percentage, the three most recent errors).
- Use a **subcollection** for unbounded or independently queried lists (steps, messages, logs). Query all of them at once with a **collection group** query (`collectionGroup('steps')`).
- **Denormalise** what a screen needs: copy the agent's display name into each run so the run list needs one query, and update the copies when the name changes (rarely).
- **Fan out on write** when many readers need their own view: an approval request is written into each approver's inbox, so each inbox is one cheap query.
- **Pre-aggregate**: maintain counters and summaries as documents updated on write (or by a trigger), instead of counting at read time.
- Use **automatic IDs** (random, scattered) rather than sequential ones, which create hotspots.

Because a document has a hard 1 MiB ceiling, know how size is counted. Per the storage-size docs: a string costs its UTF-8 bytes + 1, integers, doubles and timestamps 8 bytes, booleans and null 1 byte, arrays the sum of their values, and a document is its name size (each path segment as a string, plus 16) + each field name + each value + 32 bytes. This calculator reproduces the docs' worked example exactly:

```python
from datetime import datetime


def string_size(s: str) -> int:
    return len(s.encode("utf-8")) + 1


def name_size(path: str) -> int:
    return sum(string_size(segment) for segment in path.split("/")) + 16


def value_size(value: object) -> int:
    if value is None or isinstance(value, bool):  # check bool before int: bool is a subclass of int
        return 1
    if isinstance(value, (int, float, datetime)):
        return 8
    if isinstance(value, str):
        return string_size(value)
    if isinstance(value, bytes):
        return len(value)
    if isinstance(value, list):
        return sum(value_size(v) for v in value)
    if isinstance(value, dict):  # the docs size a map "the same way as document size"; we read that as fields + 32
        return fields_size(value) + 32
    raise TypeError(f"unsupported type {type(value).__name__}")


def fields_size(fields: dict[str, object]) -> int:
    return sum(string_size(name) + value_size(v) for name, v in fields.items())


def document_size(path: str, fields: dict[str, object]) -> int:
    return name_size(path) + fields_size(fields) + 32


# The worked example from the Firestore storage-size documentation.
example = {"type": "Personal", "done": False, "priority": 1, "description": "Learn Cloud Firestore"}
assert name_size("users/jeff/tasks/my_task_id") == 44
assert fields_size(example) == 71
assert document_size("users/jeff/tasks/my_task_id", example) == 147

# Why steps go in a subcollection: embedding every LLM response in the run document hits the 1 MiB wall.
MAX_DOC = 1_048_576
step = {"seq": 1, "name": "summarise", "output": "x" * 20_000}
steps_until_full = next(n for n in range(1, 1000) if document_size("tenants/acme/runs/r-1", {"steps": [step] * n}) > MAX_DOC)
assert 50 < steps_until_full < 60
```

About 52 steps with 20 KB outputs fill a document, and a long agent run easily has more. Large payloads (full LLM transcripts, files) belong in **Cloud Storage**, with the path stored in Firestore.

## Queries and indexes

- Firestore automatically keeps a **single-field index** for every field (ascending, descending and array-contains). Simple equality or range queries on one field just work.
- Queries that combine fields, or filter on one field and order by another, need a **composite index**. The SDK error message includes a link that creates it; in a real project, declare indexes in `firestore.indexes.json` and deploy them through CI.
- In a composite index put equality fields first, then the most selective range field, and make the index order match the query's `orderBy`.
- You can now use range and inequality filters on up to **10 fields** in one query (older guides say "one field only").
- `!=` and `not-in` **exclude documents where the field does not exist**. A field set to `null` or `""` does exist.
- `or()` queries and `in` / `array-contains-any` expand into disjunctions, capped at 30 after normalisation.
- **Aggregation queries** (`count()`, `sum()`, `average()`) run on the server without downloading the documents, and are billed by index entries read.
- **Paginate with cursors** (`startAfter(lastDoc)`) plus `limit`. An `offset` still bills you for the documents it skips.

Pagination needs a unique tie-breaker, exactly like keyset pagination in Postgres: Firestore orders by the document ID last, so cursors stay stable even when timestamps tie. This emulation shows why the tie-breaker matters:

```ts
import assert from 'node:assert/strict';

type RunDoc = { id: string; startedAt: number };

// orderBy('startedAt', 'desc') then by document id, like Firestore's implicit __name__ ordering.
const byNewest = (a: RunDoc, b: RunDoc) => b.startedAt - a.startedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

function page(docs: RunDoc[], limit: number, after?: RunDoc): RunDoc[] {
  const sorted = [...docs].sort(byNewest);
  const start = after ? sorted.findIndex((d) => byNewest(d, after) > 0) : 0;
  return start === -1 ? [] : sorted.slice(start, start + limit);
}

// Three runs share a timestamp: a cursor on startedAt alone would skip or repeat them.
const docs: RunDoc[] = [
  { id: 'a', startedAt: 300 }, { id: 'b', startedAt: 200 }, { id: 'c', startedAt: 200 },
  { id: 'd', startedAt: 200 }, { id: 'e', startedAt: 100 },
];

const seen: string[] = [];
let cursor: RunDoc | undefined;
for (;;) {
  const batch = page(docs, 2, cursor);
  if (batch.length === 0) break;
  seen.push(...batch.map((d) => d.id));
  cursor = batch.at(-1);
}
assert.deepEqual(seen, ['a', 'd', 'c', 'b', 'e']);
assert.equal(new Set(seen).size, docs.length);
```

The SDK code for the same query looks like this (the Firebase web SDK is not installed here, so the block is not run):

```ts norun
import { collection, getDocs, limit, orderBy, query, startAfter, where } from 'firebase/firestore';
import type { DocumentSnapshot, Firestore } from 'firebase/firestore';

export async function runPage(db: Firestore, tenant: string, after?: DocumentSnapshot) {
  const base = query(
    collection(db, 'tenants', tenant, 'runs'),
    where('status', 'in', ['running', 'waiting_approval']),
    orderBy('startedAt', 'desc'),
    limit(25),
  );
  const snap = await getDocs(after ? query(base, startAfter(after)) : base);
  return { runs: snap.docs.map((d) => ({ id: d.id, ...d.data() })), next: snap.docs.at(-1) };
}
```

This query (equality-style `in` on `status`, ordered by `startedAt`) needs a composite index on `status ASC, startedAt DESC`.

## Transactions and batched writes

- A **batched write** applies several writes atomically, with no reads. Use it for fan-out and for keeping denormalised copies in step.
- A **transaction** reads and then writes atomically; all reads must come before any writes. The transaction function can run more than once on contention, so it must have **no side effects** (no API calls, no emails) inside it.
- Server client libraries use pessimistic concurrency (locks); the mobile and web SDKs use optimistic concurrency and retry when a document they read has changed. Client transactions need a connection, so they fail offline.

```python norun
from google.cloud import firestore

db = firestore.Client()  # Application Default Credentials: the Cloud Run service account


@firestore.transactional
def approve(transaction: firestore.Transaction, approval_ref, run_ref, approver: str) -> bool:
    approval = approval_ref.get(transaction=transaction)  # reads first
    if approval.get("state") != "pending":
        return False  # someone else already decided
    transaction.update(approval_ref, {"state": "approved", "by": approver})
    transaction.update(run_ref, {"status": "running", "updatedAt": firestore.SERVER_TIMESTAMP})
    return True


approve(db.transaction(), db.document("tenants/acme/approvals/a-1"), db.document("tenants/acme/runs/r-5"), "maya")
```

## Real-time listeners

`onSnapshot` subscribes to a document or query, and the SDK pushes the initial result and then every change, with `docChanges()` telling you what was added, modified or removed. For a dashboard this is server push **without running your own WebSocket servers**: a Cloud Run worker updates `runs/r-5` and every browser watching it re-renders.

```ts norun
import { doc, onSnapshot } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export function watchRun(db: Firestore, tenant: string, runId: string, onChange: (run: unknown) => void) {
  // Returns the unsubscribe function: call it in a useEffect cleanup.
  return onSnapshot(doc(db, 'tenants', tenant, 'runs', runId), (snap) => {
    if (snap.metadata.hasPendingWrites) return; // our own optimistic local write, not yet on the server
    onChange(snap.data());
  });
}
```

What to know:

- **Latency compensation:** local writes fire listeners immediately with `hasPendingWrites: true`, before the server confirms them.
- **Offline:** mobile SDKs cache by default; on the web you opt into persistent local cache. Snapshots say whether they came from cache (`metadata.fromCache`).
- **Cost:** you pay a read for each document in the initial result and for each document that is added or changes afterwards. If a listener is disconnected for more than 30 minutes, reconnecting is billed like a new query.
- **Security:** browser SDKs go through **security rules** and need Firebase Authentication or Identity Platform tokens, so the front end's identity must map to rules.

Do **not** stream LLM tokens through Firestore: one document write per token is slow, costly and runs into the per-document write rate. Use SSE or WebSockets for tokens and Firestore (or Postgres plus a push channel) for coarse state such as "step 3 of 5, waiting for approval".

## Security rules and the server SDK

Rules protect access from **client SDKs only**. Server libraries running on Cloud Run use IAM and bypass rules entirely, so server code must enforce tenancy itself.

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /tenants/{tenant}/runs/{runId} {
      // Readers must belong to the tenant; only the backend (Admin SDK, IAM) writes runs.
      allow read: if request.auth != null && request.auth.token.tenant == tenant;
      allow write: if false;
    }
  }
}
```

Rules are **not filters**: a query is rejected unless the rules can prove every possible result is allowed. A browser query on `tenants/globex/runs` from an `acme` user fails outright; it does not return an empty list.

## Sharded counters for hot documents

A "runs started today" counter updated by every run would make one document hot. Spread increments across N shard documents and sum them on read (or on a schedule into a summary document):

```python
import random
from collections import Counter


class ShardedCounter:
    """Simulates counters/{name}/shards/{0..n-1}: writes pick a random shard, reads sum all shards."""

    def __init__(self, shards: int, seed: int = 0) -> None:
        self.shards = [0] * shards
        self.writes_per_shard: Counter[int] = Counter()
        self._rng = random.Random(seed)

    def increment(self, by: int = 1) -> None:
        shard = self._rng.randrange(len(self.shards))  # in Firestore: FieldValue.increment on that shard doc
        self.shards[shard] += by
        self.writes_per_shard[shard] += 1

    def total(self) -> int:
        return sum(self.shards)  # in Firestore: read the N shard docs (or an aggregation query)


counter = ShardedCounter(shards=10)
for _ in range(10_000):
    counter.increment()
assert counter.total() == 10_000
# Each shard takes roughly a tenth of the write load instead of one document taking all of it.
assert max(counter.writes_per_shard.values()) < 1_200
assert len(counter.writes_per_shard) == 10
```

Trade-offs: reads cost N document reads and the total is only as fresh as the last read; more shards mean more write throughput but costlier reads.

## TTL, deletes and cost

- **TTL policies** delete documents after the timestamp in a chosen field, typically within 24 hours after expiry. Expired documents still appear in queries until deleted, TTL deletes are billed as normal deletes, and subcollections are not removed.
- **Billing** (Standard edition) is per document read, write and delete, plus stored data (including index entries) and network egress. Enterprise edition bills by the bytes read and written instead. A query that returns nothing still costs at least one read. Big documents read often, wide indexes and chatty listeners are the usual cost surprises.
- Exempt fields you never query (large text, blobs, monotonically increasing timestamps you do not filter on) from indexing to save storage and avoid the 500 writes/s sequential-index cap.

## Firestore, PostgreSQL or Redis?

| Need | Firestore | PostgreSQL / Cloud SQL | Redis / Memorystore |
|---|---|---|---|
| Live updates pushed to browsers | built in (listeners) | needs your own push layer (SSE/WS, LISTEN/NOTIFY) | pub/sub for your servers, not browsers |
| Joins, ad-hoc reports, constraints | Standard: no joins, limited aggregation (Enterprise pipelines add subqueries) | yes | no |
| Multi-row transactions | yes, with limits | yes, full ACID | MULTI/EXEC, Lua; not durable by default |
| Scaling | serverless, automatic | vertical + read replicas, connection limits | in-memory, size and throughput by tier |
| Hot single key / document | bottleneck | row locks under contention | very fast |
| Typical role here | live run status, per-user inboxes, settings | system of record for runs, steps, audit | cache, rate limits, sessions, stream fan-out |

On Cloud Run, create the Firestore client once per instance (not per request), authenticate with the service account through Application Default Credentials (no key files), and test locally against the Firebase Local Emulator Suite.

## Interview questions

### When would you choose Firestore over PostgreSQL? {core}

"When the data is document-shaped, accessed by key or simple queries, and especially when clients need live updates: run status pages, per-user inboxes, settings, chat metadata. Firestore is serverless, scales automatically and pushes changes to browsers through listeners. For relational data with joins, constraints and ad-hoc reporting, like the run history and audit trail, I'd use Postgres as the system of record."

A good senior answer says they can coexist: Postgres is the source of truth, and a worker projects coarse state into Firestore documents that browsers subscribe to.

### How do you model data in Firestore? {core}

"By query, not by entity. I list the screens and queries first, then shape documents so each screen is one cheap query, accepting duplication. Small, bounded data is embedded; unbounded lists become subcollections; values a screen needs from another entity are denormalised; per-reader views are fanned out on write; and counts are pre-aggregated. The 1 MiB document limit and the hot-document limit are the constraints I design around."

### Subcollection or an array inside the document? {core}

"An array or map if the list is small, bounded and always read with the parent, like the last three errors. A subcollection if it's unbounded or queried on its own, like steps or messages. Arrays also make updates awkward: you can add or remove exact values atomically, but not update one element in place, and every element counts towards the 1 MiB limit."

Subcollections can be queried across parents with collection group queries, and they are not deleted with the parent document.

### What indexes does Firestore create, and when do you need a composite index? {core}

"Firestore indexes every field automatically, ascending, descending and array-contains, so single-field queries just work. As soon as I filter on several fields, or filter on one and order by another, I need a composite index, with equality fields first and the order matching the query. I keep indexes in `firestore.indexes.json` and deploy them with the code, and I exempt large or unqueried fields from single-field indexing."

### What query limitations do you need to design around? {core}

"On Standard edition: no joins, and every query must be served by an index. `in` and `array-contains-any` take up to 30 values and `not-in` up to 10. OR queries are capped at 30 disjunctions. `!=` and `not-in` skip documents missing the field. Range filters now work on up to 10 fields, but each combination needs an index. Offsets still bill the skipped documents, so I paginate with cursors."

Also on Standard edition: no full-text search (pair it with a search service), and aggregations are limited to count, sum and average. Enterprise edition's pipeline operations lift much of this (subqueries, many more expressions, and full-text search in preview), at a different price model, so ask which edition the project uses.

### How do you paginate a Firestore query? {deep}

"With query cursors: order the query, take `limit(n)`, and pass the last document snapshot to `startAfter` for the next page. Firestore orders by document ID last, which gives a unique tie-breaker, so pages don't repeat or skip documents with equal timestamps. I avoid `offset`, because skipped documents are still read and billed."

### Transactions or batched writes: what's the difference? {core}

"Both are atomic. A batched write has only writes, so I use it for fan-out or keeping denormalised copies consistent. A transaction reads then writes, with all reads first, and is retried on contention, so the function must have no side effects. On server SDKs it uses pessimistic locks, and on web and mobile it's optimistic. Client transactions don't work offline."

### How do real-time listeners work, and what do they cost? {core}

"`onSnapshot` gives the initial result and then pushes every change to that document or query, with `docChanges` listing what was added, modified or removed. Local writes show up immediately with `hasPendingWrites` set. I pay a read for each document in the initial result and one per changed document after that, and if the client is disconnected for over 30 minutes, reconnecting costs a fresh query."

In React, subscribe in `useEffect` and return the unsubscribe function as the cleanup, or wrap the listener in a store read with `useSyncExternalStore`.

### How would you show live agent-run progress in a dashboard using Firestore? {deep}

"The orchestration worker on Cloud Run writes a run summary document, with status, current step, progress and last error, at each step transition, not per token. The dashboard subscribes to that document, or to a query of active runs for the tenant, through the web SDK, with security rules restricting reads to the tenant. Token streaming stays on SSE. That avoids running our own WebSocket fleet for coarse state, and Postgres stays the system of record."

Trade-offs to volunteer: per-update read costs with many viewers, coupling the front end to Firebase Auth or Identity Platform for rules, and eventual consistency between Postgres and the projection.

### What causes hotspots in Firestore, and how do you avoid them? {deep}

"Concentrated writes: one document updated constantly, sequential document IDs, or a monotonically increasing indexed field like a timestamp, which caps a collection at about 500 writes a second. I use automatic IDs, shard hot counters across several documents, exempt increasing fields from indexing when I don't query them, and ramp new traffic with the 500/50/5 rule."

### How does a distributed counter work? {deep}

"Instead of one counter document, I create N shard documents and increment a random shard with an atomic increment. Reading the total means summing the shards, or a scheduled job writes the sum into a summary document. Write throughput scales with N; reads cost N documents and the total is slightly stale."

### What are security rules, and do they apply to your backend? {deep}

"Rules are server-enforced conditions for client SDK access: who can read or write which paths, based on `request.auth` and the data. They don't apply to server client libraries, which authenticate with IAM and bypass rules. So a Cloud Run service must enforce tenancy and permissions in its own code."

### What does "rules are not filters" mean? {deep}

"Firestore checks whether a query could ever return a document the user isn't allowed to read. If it could, the whole query is rejected; it isn't filtered down to the allowed documents. So the client's query must include the same constraint as the rule, for example `where('tenant', '==', myTenant)`, or target a path the rule already scopes."

### How do you handle data bigger than 1 MiB? {deep}

"I keep the document small and put large payloads in Cloud Storage, storing the object path and metadata in Firestore, and serve them to the browser with signed URLs. If a list grows without bound, it becomes a subcollection. I'd also check index entry limits for big maps, and exempt big text fields from indexing."

**Your angle:** GCS signed URLs for document rendering at Quantiphi are the same pattern.

### How do you delete data in Firestore, including old data? {deep}

"For expiry, a TTL policy on a timestamp field deletes documents typically within 24 hours after they expire. Deletes are billed and subcollections are not removed, so I either avoid subcollections under expiring documents or delete them in a job. For bulk deletes I run a server-side job that pages through documents and deletes them in batches."

### How is Firestore billed, and how do you keep costs down? {core}

"On Standard edition, per document read, write and delete, plus storage (including indexes) and egress; Enterprise edition bills by bytes read and written instead. Costs grow with chatty listeners, large result sets, re-reading big documents and wide indexes. I keep documents small, pre-aggregate instead of counting by reading, paginate with cursors, exempt unqueried fields from indexes, use aggregation queries for counts, and don't stream fine-grained data through it."

### Would you stream LLM tokens through Firestore? {deep}

"No. That's one write per token, and each write fires listener reads for every viewer. It's slow, expensive and runs into the per-document write rate. Tokens go over SSE or WebSockets from the service that talks to the model. Firestore can hold the final message and coarse run state."

### What are offline persistence and latency compensation? {deep}

"The client SDK keeps a local cache and applies your writes to it immediately, so the UI updates before the server confirms; snapshots carry `hasPendingWrites`. With persistence enabled, which is the default on mobile and opt-in on web, queries can be served from cache offline and writes sync when the connection returns. For an enterprise web console I'd usually leave web persistence off unless offline use is a requirement."

### What is the difference between Native mode and Datastore mode? {deep}

"Native mode is the Firestore API with real-time listeners, offline support and the web and mobile SDKs. Datastore mode keeps the older Cloud Datastore API for server-side workloads, without the real-time and client features. A new project building live UIs uses Native mode."

## Coding problems

### Will this document fit? {easy}

Using Firestore's storage-size rules, write `document_size(path, fields)` for documents whose values are strings, integers, booleans and lists, and check it against the docs' example: `users/jeff/tasks/my_task_id` with `type="Personal"`, `done=False`, `priority=1`, `description="Learn Cloud Firestore"` is 147 bytes.

#### Hints

1. Strings cost their UTF-8 byte length plus one, and that includes field names and path segments.
2. The document name is the sum of its segments plus 16; the document adds 32 bytes on top of name and fields.
3. Check `bool` before `int` in Python: `True` is an `int`.

#### Solution

Sum the parts as the docs define them. A non-ASCII string costs more than its character count, which is why the solution encodes to UTF-8.

```python
def size(value: object) -> int:
    if isinstance(value, bool):
        return 1
    if isinstance(value, int):
        return 8
    if isinstance(value, str):
        return len(value.encode("utf-8")) + 1
    if isinstance(value, list):
        return sum(size(v) for v in value)
    raise TypeError(type(value).__name__)


def document_size(path: str, fields: dict[str, object]) -> int:
    name = sum(size(segment) for segment in path.split("/")) + 16
    return name + sum(size(k) + size(v) for k, v in fields.items()) + 32


doc = {"type": "Personal", "done": False, "priority": 1, "description": "Learn Cloud Firestore"}
assert document_size("users/jeff/tasks/my_task_id", doc) == 147
assert size("é") == 3  # two UTF-8 bytes + 1
assert document_size("a/b", {}) == (2 + 2 + 16) + 32
```

O(total size of the data).

#### Follow-ups

- **How would you use this in production?** As a guard before writes that embed growing lists: if the document is near the limit, move the list to a subcollection.

### Cursor pagination with a tie-breaker {medium}

Given documents with `id` and `updatedAt`, implement `page(docs, limit, after)` that returns the next page ordered by `updatedAt` descending, where `after` is the last document of the previous page. Pages must never repeat or skip documents, even when timestamps tie.

#### Hints

1. Order by `updatedAt` descending and then by `id`, so every document has a unique position.
2. The next page starts at the first document that sorts strictly after the cursor.
3. Do not compare on `updatedAt` alone.

#### Solution

A total order (timestamp, then id) plus "strictly after the cursor" makes pages disjoint and complete. Firestore does the same with its implicit document-ID ordering.

```ts
import assert from 'node:assert/strict';

type Doc = { id: string; updatedAt: number };

const order = (a: Doc, b: Doc): number => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id);

export function page(docs: Doc[], limit: number, after?: Doc): Doc[] {
  const sorted = [...docs].sort(order);
  const rest = after ? sorted.filter((d) => order(d, after) > 0) : sorted;
  return rest.slice(0, limit);
}

const docs: Doc[] = [
  { id: 'r3', updatedAt: 5 }, { id: 'r1', updatedAt: 5 }, { id: 'r2', updatedAt: 5 },
  { id: 'r4', updatedAt: 9 }, { id: 'r5', updatedAt: 1 },
];
const p1 = page(docs, 2);
const p2 = page(docs, 2, p1.at(-1));
const p3 = page(docs, 2, p2.at(-1));
assert.deepEqual([...p1, ...p2, ...p3].map((d) => d.id), ['r4', 'r1', 'r2', 'r3', 'r5']);
assert.deepEqual(page(docs, 2, p3.at(-1)), []);
assert.deepEqual(page([], 3), []);
```

O(n log n) for this in-memory version; Firestore does it with an index seek.

#### Follow-ups

- **What if a document changes between pages?** It can move to an earlier page and be missed; for a live list, combine a listener on page 1 with cursor pages for history.

### Sharded counter {medium}

Implement a counter spread over N shards: `increment()` adds 1 to a random shard, `total()` returns the sum. Show that 1,000 increments over 5 shards give the right total and use every shard.

#### Hints

1. Keep one integer per shard.
2. Choose the shard uniformly at random on each write; seed the generator in tests.
3. The read side sums every shard.

#### Solution

The shard choice spreads write contention; correctness only depends on the sum.

```python
import random


class ShardedCounter:
    def __init__(self, shards: int, rng: random.Random | None = None) -> None:
        if shards < 1:
            raise ValueError("need at least one shard")
        self.values = [0] * shards
        self.rng = rng or random.Random()

    def increment(self, by: int = 1) -> None:
        self.values[self.rng.randrange(len(self.values))] += by

    def total(self) -> int:
        return sum(self.values)


c = ShardedCounter(5, random.Random(42))
for _ in range(1_000):
    c.increment()
assert c.total() == 1_000
assert all(v > 0 for v in c.values)

try:
    ShardedCounter(0)
    raise AssertionError("expected ValueError")
except ValueError:
    pass
```

Increment O(1); total O(N).

#### Follow-ups

- **How would you get an exact, cheap total for a dashboard?** A scheduled job (or a trigger on shard writes, rate-limited) sums the shards into one summary document that clients listen to.
