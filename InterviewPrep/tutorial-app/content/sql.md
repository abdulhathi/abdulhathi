---
title: SQL and PostgreSQL
goal: Write joins, aggregations and window-function queries on a whiteboard without hesitating, and explain indexes, transactions and isolation like someone who has tuned a production database.
minutes: 70
---

Almost every full-stack interview has SQL in it, either as spoken questions ("what is the difference between WHERE and HAVING?") or as a live query on a small schema. In healthcare the schema is usually patients, providers, encounters and claims, so this chapter uses exactly that.

Focus on three things: the **logical order a query runs in** (it explains half the trick questions), **window functions** (they turn "top N per group" and "running total" into one query), and **indexes plus transactions** (the senior-level follow-ups). Every query on this page runs against the practice schema below, and the problems check their exact results.

## The practice schema

Four tables, deliberately small so you can check answers by eye. Note the traps built in: a duplicate patient (Maria Garcia appears twice), a patient with no visits, a duplicate claim, NULL emails, two providers with the same salary, and a provider who earns more than their manager.

```sql
CREATE TABLE providers (
  provider_id INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  specialty   TEXT    NOT NULL,
  manager_id  INTEGER REFERENCES providers(provider_id),
  salary      INTEGER NOT NULL
);

CREATE TABLE patients (
  patient_id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  dob        TEXT NOT NULL,          -- ISO date 'YYYY-MM-DD'
  state      TEXT NOT NULL,
  email      TEXT                    -- nullable on purpose
);

CREATE TABLE encounters (
  encounter_id   INTEGER PRIMARY KEY,
  patient_id     INTEGER NOT NULL REFERENCES patients(patient_id),
  provider_id    INTEGER NOT NULL REFERENCES providers(provider_id),
  encounter_date TEXT    NOT NULL,
  type           TEXT    NOT NULL    -- office, er, inpatient, telehealth
);

CREATE TABLE claims (
  claim_id      INTEGER PRIMARY KEY,
  encounter_id  INTEGER NOT NULL REFERENCES encounters(encounter_id),
  billed_amount INTEGER NOT NULL,
  paid_amount   INTEGER,             -- NULL while pending
  status        TEXT    NOT NULL     -- paid, denied, pending
);

INSERT INTO providers VALUES
  (1, 'Dr. Ada Shah',   'Cardiology',      NULL, 310000),
  (2, 'Dr. Ben Okafor', 'Cardiology',      1,    330000),
  (3, 'Dr. Cara Lin',   'Family Medicine', NULL, 240000),
  (4, 'Dr. Dev Patel',  'Family Medicine', 3,    210000),
  (5, 'Dr. Eva Ruiz',   'Family Medicine', 3,    240000),
  (6, 'Dr. Finn Walsh', 'Pediatrics',      NULL, 230000);

INSERT INTO patients VALUES
  (1, 'Maria', 'Garcia', '1958-03-14', 'CA', 'maria@example.com'),
  (2, 'James', 'Lee',    '1990-07-02', 'CA', NULL),
  (3, 'Aisha', 'Khan',   '1975-11-23', 'TX', 'aisha@example.com'),
  (4, 'Tom',   'Brown',  '2012-05-30', 'TX', NULL),
  (5, 'Maria', 'Garcia', '1958-03-14', 'CA', 'maria.g@example.com'),
  (6, 'Li',    'Wei',    '1983-01-09', 'NY', 'li@example.com');

INSERT INTO encounters VALUES
  (101, 1, 1, '2026-01-05', 'office'),
  (102, 1, 2, '2026-01-20', 'er'),
  (103, 1, 1, '2026-02-03', 'inpatient'),
  (104, 2, 3, '2026-01-11', 'telehealth'),
  (105, 3, 4, '2026-01-11', 'office'),
  (106, 3, 4, '2026-03-02', 'office'),
  (107, 4, 6, '2026-02-14', 'office'),
  (108, 2, 5, '2026-02-15', 'office'),
  (109, 3, 3, '2026-03-03', 'er'),
  (110, 3, 3, '2026-03-04', 'inpatient');

INSERT INTO claims VALUES
  (1001, 101,   200,  160, 'paid'),
  (1002, 102,  1500, 1200, 'paid'),
  (1003, 103,  9000, NULL, 'pending'),
  (1004, 104,   120,    0, 'denied'),
  (1005, 105,   180,  150, 'paid'),
  (1006, 106,   180,  150, 'paid'),
  (1007, 107,   150,  120, 'paid'),
  (1008, 108,   220,    0, 'denied'),
  (1009, 109,  2200, 1800, 'paid'),
  (1010, 110, 12000, NULL, 'pending'),
  (1011, 105,   180,  150, 'paid');   -- duplicate of claim 1005
```

The queries here run on SQLite, which supports standard joins, CTEs and window functions. Where PostgreSQL syntax differs (dates mostly), the text says so.

## How a query actually runs

You write `SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT`, but the database evaluates it logically in this order:

| Step | Clause | What it means for you |
|---|---|---|
| 1 | `FROM` / `JOIN` | Build the row set. Join conditions apply here. |
| 2 | `WHERE` | Filter individual rows. Aggregates do not exist yet, so `WHERE COUNT(*) > 1` is an error. |
| 3 | `GROUP BY` | Collapse rows into groups. |
| 4 | `HAVING` | Filter groups, so aggregates are allowed. |
| 5 | Window functions | Computed over the rows that survived steps 1–4. |
| 6 | `SELECT` | Compute output columns and aliases. |
| 7 | `DISTINCT` | Remove duplicate output rows. |
| 8 | `ORDER BY` | Sort. This is the first place a `SELECT` alias is guaranteed to be visible. |
| 9 | `LIMIT` / `OFFSET` | Cut the result. |

This order answers several classic questions at once: why you cannot use a window function in `WHERE` (it is computed later, so wrap it in a CTE), why a `SELECT` alias is not visible in `WHERE`, and why `HAVING` exists at all. The optimiser may physically reorder work, but the result must be as if this order ran.

## Joins at a glance

| Join | Keeps | Typical use |
|---|---|---|
| `INNER JOIN` | Only rows with a match on both sides | Encounters with their provider |
| `LEFT JOIN` | Every left row; NULLs where the right has no match | Patients and their visits, including patients with none |
| `RIGHT JOIN` | Mirror of LEFT | Rarely used: rewrite as LEFT for readability |
| `FULL OUTER JOIN` | Every row from both sides | Reconciling two feeds (claims file vs payments file) |
| `CROSS JOIN` | Every combination | Generating a calendar × provider grid |
| Self join | A table joined to itself | Employee and manager in one table |

```sql
-- INNER drops patients without encounters; LEFT keeps them.
SELECT
  (SELECT COUNT(DISTINCT p.patient_id) FROM patients p JOIN encounters e ON e.patient_id = p.patient_id),
  (SELECT COUNT(DISTINCT p.patient_id) FROM patients p LEFT JOIN encounters e ON e.patient_id = p.patient_id)
-- expect: [(4, 6)]
```

## Window functions

A window function computes a value for each row from a set of related rows (the "window") without collapsing them the way `GROUP BY` does. The shape is always `function() OVER (PARTITION BY … ORDER BY … frame)`.

```sql
SELECT name, salary,
       ROW_NUMBER() OVER (ORDER BY salary DESC, name) AS rn,
       RANK()       OVER (ORDER BY salary DESC)       AS rnk,
       DENSE_RANK() OVER (ORDER BY salary DESC)       AS dense
FROM providers
ORDER BY salary DESC, name
-- expect: [('Dr. Ben Okafor', 330000, 1, 1, 1), ('Dr. Ada Shah', 310000, 2, 2, 2), ('Dr. Cara Lin', 240000, 3, 3, 3), ('Dr. Eva Ruiz', 240000, 4, 3, 3), ('Dr. Finn Walsh', 230000, 5, 5, 4), ('Dr. Dev Patel', 210000, 6, 6, 5)]
```

Read the tie: Cara and Eva both earn 240,000. `ROW_NUMBER` gives them 3 and 4 (arbitrary unless you add a tie-breaker, which is why the query orders by name too). `RANK` gives both 3 and then skips to 5. `DENSE_RANK` gives both 3 and continues with 4.

| Family | Functions | Use |
|---|---|---|
| Ranking | `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `NTILE` | Top N per group, deduplication |
| Offset | `LAG`, `LEAD`, `FIRST_VALUE`, `LAST_VALUE` | Previous visit, days between events |
| Aggregate | `SUM`, `AVG`, `COUNT`, `MIN`, `MAX` with `OVER` | Running totals, moving averages, share of total |

```sql
-- LAG looks at the previous row in the window.
SELECT encounter_id, encounter_date,
       LAG(encounter_date) OVER (ORDER BY encounter_date) AS previous_visit
FROM encounters
WHERE patient_id = 1
ORDER BY encounter_date
-- expect: [(101, '2026-01-05', None), (102, '2026-01-20', '2026-01-05'), (103, '2026-02-03', '2026-01-20')]
```

## Indexes in one page

- A **B-tree index** keeps a column's values sorted with pointers to the rows, so equality and range lookups take O(log n) instead of a full scan. It is the default in PostgreSQL, SQL Server and MySQL.
- A **composite index** on `(patient_id, encounter_date)` serves queries that filter on `patient_id`, or on `patient_id` and `encounter_date`, but not on `encounter_date` alone (the leftmost-prefix rule).
- A **covering index** contains every column a query needs, so the database never touches the table (PostgreSQL "index-only scan"; `INCLUDE` adds non-key columns).
- A **partial index** indexes only some rows, such as only pending claims.
- Indexes cost write speed and disk. Every `INSERT`, `UPDATE` and `DELETE` must maintain them.

```sql
CREATE INDEX idx_encounters_patient_date ON encounters (patient_id, encounter_date);
CREATE INDEX idx_claims_pending ON claims (encounter_id) WHERE status = 'pending';
```

Other PostgreSQL index types worth naming: **GIN** for JSONB, arrays and full-text search, **GiST** for ranges and geometry, **BRIN** for huge append-only tables ordered by time, and **hash** for pure equality.

## Interview questions

### What is the difference between WHERE and HAVING? {core}

`WHERE` filters individual rows before grouping; `HAVING` filters groups after `GROUP BY`, so it can use aggregates like `COUNT(*)`. If a condition does not need an aggregate, put it in `WHERE`: it removes rows earlier, so less data is grouped.

```sql
-- Patients with at least two in-person visits: WHERE removes telehealth rows, HAVING filters the groups.
SELECT patient_id, COUNT(*) AS visits
FROM encounters
WHERE type <> 'telehealth'
GROUP BY patient_id
HAVING COUNT(*) >= 2
ORDER BY patient_id
-- expect: [(1, 3), (3, 4)]
```

Follow-up: "Can you use a column alias in HAVING?" PostgreSQL does not allow `SELECT` aliases in `HAVING` (repeat the expression); MySQL and SQLite are more permissive. Write the expression to be portable.

### Explain the different types of joins. {core}

An inner join keeps only rows that match on both sides. A left join keeps every row from the left table and fills NULLs where the right has no match, which is how you find "patients with no visits". A full outer join keeps unmatched rows from both sides, a cross join produces every combination, and a self join joins a table to itself, such as providers to their managers.

The classic trap: a filter on the right table in `WHERE` turns a left join back into an inner join, because the NULL rows fail the condition. Put that filter in the `ON` clause instead:

```sql
-- Every patient, with their count of ER visits (0 if none). The type filter lives in ON, not WHERE.
SELECT p.patient_id, COUNT(e.encounter_id) AS er_visits
FROM patients p
LEFT JOIN encounters e ON e.patient_id = p.patient_id AND e.type = 'er'
GROUP BY p.patient_id
ORDER BY p.patient_id
-- expect: [(1, 1), (2, 0), (3, 1), (4, 0), (5, 0), (6, 0)]
```

### In what order does SQL evaluate a query?

Logically: `FROM` and joins, then `WHERE`, `GROUP BY`, `HAVING`, window functions, `SELECT`, `DISTINCT`, `ORDER BY`, and finally `LIMIT`. That is why aggregates are not allowed in `WHERE`, why window functions cannot be filtered directly (wrap them in a CTE or subquery), and why a `SELECT` alias works in `ORDER BY` but not in `WHERE`.

The optimiser is free to execute in a different physical order (for example pushing a filter into a join) as long as the result is the same.

### What are window functions and when do you use them instead of GROUP BY? {core}

A window function computes a value across a set of rows related to the current row but keeps every row, while `GROUP BY` collapses each group into one row. Use a window when you need the detail and the aggregate together: each claim with its patient's total, a running total, the previous visit date, or a rank within a group.

```sql
-- Providers earning above their specialty's average: a window keeps every provider row.
WITH s AS (
  SELECT name, specialty, salary,
         AVG(salary) OVER (PARTITION BY specialty) AS specialty_avg
  FROM providers
)
SELECT name, specialty, salary FROM s WHERE salary > specialty_avg ORDER BY name
-- expect: [('Dr. Ben Okafor', 'Cardiology', 330000), ('Dr. Cara Lin', 'Family Medicine', 240000), ('Dr. Eva Ruiz', 'Family Medicine', 240000)]
```

The same result with a correlated subquery runs the inner `AVG` per row; most optimisers handle both well, but the window version reads more clearly and scans the table once.

### ROW_NUMBER vs RANK vs DENSE_RANK? {core}

All three number rows in a window order; they differ only on ties. `ROW_NUMBER` always gives unique numbers (1, 2, 3, 4) even for ties, `RANK` gives ties the same number and leaves gaps (1, 2, 2, 4), and `DENSE_RANK` gives ties the same number with no gaps (1, 2, 2, 3).

Choose by the question: "exactly one row per group" (dedupe, latest record) → `ROW_NUMBER` with a deterministic tie-breaker. "Top earners including ties" → `RANK`. "The Nth highest distinct value" → `DENSE_RANK`.

```sql
-- Highest-paid provider in each specialty, ties included.
WITH r AS (
  SELECT specialty, name, salary,
         RANK() OVER (PARTITION BY specialty ORDER BY salary DESC) AS rnk
  FROM providers
)
SELECT specialty, name, salary FROM r WHERE rnk = 1 ORDER BY specialty, name
-- expect: [('Cardiology', 'Dr. Ben Okafor', 330000), ('Family Medicine', 'Dr. Cara Lin', 240000), ('Family Medicine', 'Dr. Eva Ruiz', 240000), ('Pediatrics', 'Dr. Finn Walsh', 230000)]
```

### Subquery vs CTE vs temporary table?

A subquery is a query nested inside another; a CTE (`WITH name AS (…)`) is a named subquery that makes multi-step logic readable and can be referenced more than once in the same statement; a temporary table physically stores an intermediate result for the session, so it can be indexed and reused across several statements.

Performance notes worth saying: since PostgreSQL 12, a CTE referenced once is inlined like a subquery (before 12 it was always materialised, an "optimisation fence"); you can force either with `AS MATERIALIZED` or `AS NOT MATERIALIZED`. Recursive CTEs (`WITH RECURSIVE`) walk hierarchies such as an org chart or a referral chain.

```sql
-- Recursive CTE: everyone under Dr. Cara Lin in the reporting chain.
WITH RECURSIVE team(provider_id, name, depth) AS (
  SELECT provider_id, name, 0 FROM providers WHERE provider_id = 3
  UNION ALL
  SELECT p.provider_id, p.name, t.depth + 1
  FROM providers p JOIN team t ON p.manager_id = t.provider_id
)
SELECT name, depth FROM team ORDER BY depth, name
-- expect: [('Dr. Cara Lin', 0), ('Dr. Dev Patel', 1), ('Dr. Eva Ruiz', 1)]
```

### What is a correlated subquery? {deep}

A subquery that refers to a column of the outer query, so logically it runs once per outer row. `EXISTS` and `NOT EXISTS` are the most useful forms because the database can stop at the first match and treats NULLs safely.

```sql
SELECT name, specialty, salary
FROM providers p
WHERE salary > (SELECT AVG(salary) FROM providers q WHERE q.specialty = p.specialty)
ORDER BY name
-- expect: [('Dr. Ben Okafor', 'Cardiology', 330000), ('Dr. Cara Lin', 'Family Medicine', 240000), ('Dr. Eva Ruiz', 'Family Medicine', 240000)]
```

Modern optimisers often rewrite these into joins; if one is slow, check the plan and try the join or window version.

### How do NULLs behave in SQL? {core}

NULL means "unknown", so any comparison with NULL, including `NULL = NULL`, is unknown rather than true, and `WHERE` keeps only rows where the condition is true. Test with `IS NULL` / `IS NOT NULL`, use `COALESCE` for defaults, and remember aggregates skip NULLs: `COUNT(*)` counts rows, `COUNT(email)` counts non-NULL emails.

```sql
SELECT COUNT(*), COUNT(email) FROM patients
-- expect: [(6, 4)]
```

The trap interviewers love is `NOT IN` with a NULL in the list. `x NOT IN (a, NULL)` is never true, so the query silently returns nothing:

```sql
-- Texas emails are ('aisha@example.com', NULL), so NOT IN returns no rows at all.
SELECT first_name FROM patients
WHERE email NOT IN (SELECT email FROM patients WHERE state = 'TX')
-- expect: []
```

```sql
-- NOT EXISTS does what was meant.
SELECT p.first_name FROM patients p
WHERE NOT EXISTS (SELECT 1 FROM patients t WHERE t.state = 'TX' AND t.email = p.email)
ORDER BY p.patient_id
-- expect: [('Maria',), ('James',), ('Tom',), ('Maria',), ('Li',)]
```

Prefer `NOT EXISTS` (or a left join with `IS NULL`) for anti-joins.

### How does an index work, and when will the database not use it? {core}

A B-tree index stores the column's values in sorted order with pointers to the rows, so the database can find a value or a range in O(log n) page reads instead of scanning the whole table. The planner uses it when it expects few rows back; for a large fraction of the table, a sequential scan is cheaper.

Common reasons an index is ignored:

- A function or cast on the column: `WHERE LOWER(email) = …` or `WHERE DATE(created_at) = …`. Fix with an expression index or rewrite as a range.
- A leading wildcard: `LIKE '%smith'` (a trigram GIN index helps in PostgreSQL).
- The query does not use the leftmost column of a composite index.
- Low selectivity (a status column with three values) or stale statistics (run `ANALYZE`).
- Type mismatch, such as comparing a text column to a number, which forces a cast.
- `OR` across different columns (sometimes handled with a bitmap OR, sometimes not).

### What is a composite index, and does column order matter? {core}

A composite index covers several columns, sorted by the first, then the second within it, and so on. Order matters because of the leftmost-prefix rule: an index on `(patient_id, encounter_date)` serves `WHERE patient_id = ?` and `WHERE patient_id = ? AND encounter_date > ?`, but not `WHERE encounter_date > ?` alone.

Rule of thumb: put equality columns first and the range or sort column last, so "this patient's visits in date order" is a single index range scan with no sort.

Senior nuance: PostgreSQL 18 (September 2025) added B-tree **skip scan**, which can use such an index even without a condition on the leading column, but it only pays off when the leading column has few distinct values. Design the column order for your real queries rather than relying on it.

### What is a covering index? {deep}

An index that contains every column a query reads, so the database answers from the index alone without visiting the table. PostgreSQL calls this an index-only scan, and you add non-key payload columns with `INCLUDE`:

```sql norun
-- PostgreSQL: lookups by patient also return the date and type without touching the table.
CREATE INDEX idx_enc_patient_cover ON encounters (patient_id) INCLUDE (encounter_date, type);
```

In PostgreSQL, index-only scans also depend on the visibility map being current (vacuum keeps it so).

### How do you find and fix a slow query? {core}

First measure: find the slow query in the logs or `pg_stat_statements`, then run `EXPLAIN (ANALYZE, BUFFERS)` to see the real plan, the row estimates versus actual rows, and where the time goes. Then fix the cause: add or change an index, rewrite the query (remove functions on indexed columns, replace `NOT IN`, avoid `SELECT *`), fix N+1 patterns in the application, update statistics, or paginate with keysets instead of large offsets.

```sql norun
-- PostgreSQL
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM encounters WHERE patient_id = 42 ORDER BY encounter_date DESC LIMIT 10;
-- Look for: Seq Scan on a big table, estimated rows far from actual rows,
-- a Sort that spills to disk, or a Nested Loop over many rows.
```

**Your angle:** at Medidata you optimised PostgreSQL queries for clinical-trial workflows. Describe the method (measure, read the plan, fix, re-measure) with one concrete example from that work. Do not quote numbers you cannot back up.

### What does EXPLAIN show you? {deep}

The execution plan: the tree of operations (Seq Scan, Index Scan, Index Only Scan, Bitmap Heap Scan, Nested Loop, Hash Join, Merge Join, Sort, Aggregate), with estimated cost and rows. `EXPLAIN ANALYZE` actually runs the query and adds real timings and row counts. The most useful signal is a big gap between estimated and actual rows: it means bad statistics or a skewed distribution, which leads the planner to the wrong join type.

Join types in one line each: nested loop is best when one side is small and the other is indexed; hash join builds a hash table on the smaller input and suits large unsorted equality joins; merge join walks two inputs already sorted on the join key.

### Explain ACID. {core}

ACID is what a transaction guarantees. **Atomicity**: all statements commit or none do. **Consistency**: constraints (keys, foreign keys, checks) hold before and after. **Isolation**: concurrent transactions do not see each other's partial work, to the degree the isolation level promises. **Durability**: once committed, the change survives a crash, because it was written to the write-ahead log first.

```sql
-- Atomicity in action: the update is rolled back, so the claim is still pending.
BEGIN;
UPDATE claims SET status = 'paid', paid_amount = 7200 WHERE claim_id = 1003;
ROLLBACK;
```

```sql
SELECT status FROM claims WHERE claim_id = 1003
-- expect: [('pending',)]
```

Healthcare example: posting a payment and marking the claim paid must be one transaction, so a crash between the two can never leave money recorded against an unpaid claim.

### What are isolation levels and the anomalies they prevent? {core}

Isolation levels trade correctness under concurrency for throughput. The anomalies are: **dirty read** (seeing uncommitted data), **non-repeatable read** (reading the same row twice and getting different values), **phantom read** (re-running a query and getting new rows), and **serialization anomalies** such as write skew.

| Level | Dirty read | Non-repeatable read | Phantom |
|---|---|---|---|
| Read Uncommitted | Possible (PostgreSQL treats it as Read Committed) | Possible | Possible |
| Read Committed | Prevented | Possible | Possible |
| Repeatable Read | Prevented | Prevented | Allowed by the standard; prevented in PostgreSQL |
| Serializable | Prevented | Prevented | Prevented |

PostgreSQL's Repeatable Read is really **snapshot isolation**: each transaction sees one snapshot, so phantoms cannot appear, but **write skew** still can (two transactions each check that at least two doctors are on call, then each takes a different doctor off call, leaving nobody on call). Only Serializable (PostgreSQL's SSI) prevents that.

PostgreSQL's default is **Read Committed**; SQL Server's default is also Read Committed (optionally with row versioning via `READ_COMMITTED_SNAPSHOT`); MySQL InnoDB defaults to Repeatable Read. Serializable in PostgreSQL can abort a transaction with a serialization failure, so the application must retry.

### What is MVCC? {deep}

Multi-Version Concurrency Control: instead of locking rows for reads, the database keeps several versions of a row and each transaction sees a consistent snapshot. In PostgreSQL an `UPDATE` writes a new row version and marks the old one dead; readers never block writers and writers never block readers. The cost is dead tuples, which `VACUUM` (usually autovacuum) cleans up; neglecting it causes table bloat and, in extreme cases, transaction ID wraparound protection kicking in.

### What is a deadlock and how do you avoid one? {deep}

Two transactions each hold a lock the other needs, so neither can proceed. The database detects the cycle and aborts one of them with an error. Avoid them by touching rows in a consistent order (for example, always lock the lower claim ID first), keeping transactions short, not waiting for user input or network calls inside a transaction, and using `SELECT … FOR UPDATE` deliberately. Retry the aborted transaction in the application.

### Normalisation: what are 1NF, 2NF and 3NF, and when would you denormalise? {core}

Normalisation removes redundancy so each fact is stored once. **1NF**: atomic values, no repeating groups (no comma-separated diagnosis codes in one column). **2NF**: 1NF and every non-key column depends on the whole primary key, not part of a composite key. **3NF**: 2NF and no column depends on another non-key column (store `provider_id`, not the provider's specialty, on each encounter).

Denormalise deliberately for read performance: reporting tables, a materialised view of monthly claim totals, or caching a patient's latest status. The cost is keeping copies in sync, so do it where reads vastly outnumber writes, and prefer materialised views or an analytics warehouse to ad-hoc duplication in the transactional schema.

### UNION vs UNION ALL?

Both stack the results of two queries with the same columns. `UNION` removes duplicate rows, which needs a sort or hash step; `UNION ALL` keeps everything and is faster. Use `UNION ALL` unless you actually need deduplication.

```sql
SELECT state FROM patients WHERE state = 'CA'
UNION
SELECT state FROM patients WHERE state IN ('CA', 'TX')
ORDER BY state
-- expect: [('CA',), ('TX',)]
```

```sql
SELECT COUNT(*) FROM (
  SELECT state FROM patients WHERE state = 'CA'
  UNION ALL
  SELECT state FROM patients WHERE state IN ('CA', 'TX')
)
-- expect: [(8,)]
```

### DELETE vs TRUNCATE vs DROP? {core}

`DELETE` removes rows matching a `WHERE`, row by row, fires triggers and is fully logged; it can be rolled back. `TRUNCATE` removes all rows at once by deallocating storage, which is much faster and does not fire row-level `DELETE` triggers. Identity counters: SQL Server and MySQL reset them; PostgreSQL keeps them unless you add `RESTART IDENTITY`. In PostgreSQL and SQL Server `TRUNCATE` is transactional and can be rolled back; in MySQL (and Oracle) it commits implicitly. `DROP` removes the table itself: structure, data, indexes and constraints.

### Primary key vs unique constraint vs foreign key?

A primary key uniquely identifies each row, cannot be NULL, and there is one per table. A unique constraint also enforces uniqueness but allows NULLs (in PostgreSQL multiple NULLs, unless declared `NULLS NOT DISTINCT` in version 15+), and a table can have many. A foreign key enforces that a value exists in another table's key, protecting referential integrity; choose its `ON DELETE` behaviour (`RESTRICT`, `CASCADE`, `SET NULL`) on purpose. In PostgreSQL, foreign key columns are not indexed automatically: add the index yourself, or joins and parent deletes get slow.

### What PostgreSQL features would you mention for a healthcare app? {deep}

- **JSONB** for semi-structured payloads such as FHIR resources or extracted document fields, with GIN indexes and operators like `->>` and `@>`.
- **Partial and expression indexes** (`WHERE status = 'pending'`, `LOWER(email)`).
- **Row-level security** policies so a tenant or care team only sees its own rows.
- **pgcrypto** and encryption at rest through the cloud provider, plus TLS in transit.
- **Audit triggers** or logical decoding to record who changed what.
- **pgvector** for embeddings when a RAG feature needs vector search next to relational data.
- **Partitioning** by date for very large encounter or claim tables.

```sql norun
-- PostgreSQL JSONB: find documents whose extracted payload says the form type is MAGI.
SELECT id FROM documents WHERE payload @> '{"form_type": "MAGI"}';
CREATE INDEX idx_documents_payload ON documents USING GIN (payload);
```

### Offset pagination vs keyset pagination? {deep}

`LIMIT 20 OFFSET 100000` makes the database read and throw away 100,000 rows, so deep pages get slower and rows shift if data changes between requests. Keyset (cursor) pagination remembers the last row's sort key and asks for the next rows after it, using an index, so every page costs the same:

```sql
-- Next page after the last encounter seen (date 2026-02-03, id 103), newest first.
SELECT encounter_id, encounter_date FROM encounters
WHERE (encounter_date, encounter_id) < ('2026-02-03', 103)
ORDER BY encounter_date DESC, encounter_id DESC
LIMIT 3
-- expect: [(102, '2026-01-20'), (105, '2026-01-11'), (104, '2026-01-11')]
```

The trade-off: keyset cannot jump to page 37 directly, which is fine for infinite scroll and APIs.

### Views vs materialised views? {deep}

A view is a saved query: it stores no data and runs every time you select from it, so it is always current. A materialised view stores the result physically, so reads are fast, but it is stale until refreshed (`REFRESH MATERIALIZED VIEW CONCURRENTLY` in PostgreSQL avoids blocking readers, given a unique index). Use materialised views for expensive reporting aggregates like monthly paid amounts per plan.

## Coding problems

### Second highest salary {easy core}

Return the second highest distinct provider salary. If there is no second distinct salary, return NULL rather than no row.

#### Hints

1. The answer is the largest salary that is smaller than the maximum.
2. An aggregate over an empty set returns one row with NULL, which is the behaviour you want.
3. For the Nth highest in general, think `DENSE_RANK`.

#### Solution

Take the maximum of everything below the maximum. Because it is an aggregate, an empty set returns NULL instead of an empty result.

```sql
SELECT MAX(salary) AS second_highest
FROM providers
WHERE salary < (SELECT MAX(salary) FROM providers)
-- expect: [(310000,)]
```

The general Nth-highest version uses `DENSE_RANK`, so ties do not skip ranks:

```sql
WITH ranked AS (
  SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS dr FROM providers
)
SELECT MAX(salary) FROM ranked WHERE dr = 3
-- expect: [(240000,)]
```

`SELECT DISTINCT salary … ORDER BY salary DESC LIMIT 1 OFFSET 1` also works but returns no row (not NULL) when there is no second salary.

#### Follow-ups

- **What if two providers tie for the top salary?** The `MAX(… < MAX)` and `DENSE_RANK` versions both still return the next distinct value.
- **Second highest per specialty?** Add `PARTITION BY specialty` to the `DENSE_RANK`.

### Providers who earn more than their manager {easy core}

List each provider whose salary is higher than their manager's, with both names and salaries.

#### Hints

1. Manager and report live in the same table.
2. Join `providers` to itself: one alias for the employee, one for the manager.

#### Solution

A self join matches each provider to the row whose `provider_id` equals their `manager_id`. Providers with no manager drop out of the inner join, which is what we want.

```sql
SELECT e.name, e.salary, m.name AS manager, m.salary AS manager_salary
FROM providers e
JOIN providers m ON e.manager_id = m.provider_id
WHERE e.salary > m.salary
-- expect: [('Dr. Ben Okafor', 330000, 'Dr. Ada Shah', 310000)]
```

Dr. Eva Ruiz earns exactly what her manager earns, so a strict `>` correctly excludes her.

#### Follow-ups

- **How would you include providers without a manager?** Use a `LEFT JOIN` and decide what "more than a missing manager" means; usually they are excluded.
- **What index helps?** The join uses the primary key on the manager side; an index on `manager_id` helps the reverse lookup ("who reports to X").

### Patients with no encounters {easy core}

Find every patient who has never had an encounter.

#### Hints

1. You need the patients that have no matching row in `encounters`.
2. A left join produces NULLs on the right side for those patients.
3. `NOT EXISTS` is the other clean way; avoid `NOT IN` if the subquery column can be NULL.

#### Solution

Left join and keep the rows where the right side is missing:

```sql
SELECT p.patient_id, p.first_name, p.last_name
FROM patients p
LEFT JOIN encounters e ON e.patient_id = p.patient_id
WHERE e.encounter_id IS NULL
ORDER BY p.patient_id
-- expect: [(5, 'Maria', 'Garcia'), (6, 'Li', 'Wei')]
```

The anti-join with `NOT EXISTS` gives the same rows and is often what the planner prefers:

```sql
SELECT p.patient_id, p.first_name, p.last_name
FROM patients p
WHERE NOT EXISTS (SELECT 1 FROM encounters e WHERE e.patient_id = p.patient_id)
ORDER BY p.patient_id
-- expect: [(5, 'Maria', 'Garcia'), (6, 'Li', 'Wei')]
```

Notice patient 5 is the duplicate Maria Garcia record. Records with no activity are often duplicates, which is a good observation to make out loud.

#### Follow-ups

- **Patients with no encounter in the last 90 days?** Move the date condition into the `ON` clause (or the `NOT EXISTS` subquery), not the `WHERE`.

### Duplicate patient records {easy core}

Find patients who appear more than once with the same first name, last name and date of birth, and say how many copies exist.

#### Hints

1. Group by the identifying columns.
2. Filter groups, not rows.

#### Solution

Group by the matching key and keep groups with more than one row, using `HAVING` because the filter is on an aggregate.

```sql
SELECT first_name, last_name, dob, COUNT(*) AS copies
FROM patients
GROUP BY first_name, last_name, dob
HAVING COUNT(*) > 1
-- expect: [('Maria', 'Garcia', '1958-03-14', 2)]
```

To see the actual duplicate rows, not just the groups, use a window count:

```sql
WITH c AS (
  SELECT patient_id, first_name, last_name, dob,
         COUNT(*) OVER (PARTITION BY first_name, last_name, dob) AS copies
  FROM patients
)
SELECT patient_id, first_name, last_name FROM c WHERE copies > 1 ORDER BY patient_id
-- expect: [(1, 'Maria', 'Garcia'), (5, 'Maria', 'Garcia')]
```

#### Follow-ups

- **Is name + DOB a safe match in real healthcare data?** No. Real master patient index matching normalises names (case, accents, nicknames), compares addresses, phone and identifiers, and scores probabilistic matches for human review rather than auto-merging.

### Two most recent encounters per patient {medium core}

For each patient, return their two most recent encounters, newest first.

#### Hints

1. "Top N per group" is a window function problem.
2. Number each patient's encounters by date descending, then keep numbers 1 and 2.
3. A window result cannot be filtered in the same `SELECT`'s `WHERE`: use a CTE.

#### Solution

`ROW_NUMBER` restarts at 1 for each patient because of `PARTITION BY`. The `encounter_id` tie-breaker makes the order deterministic if two visits share a date.

```sql
WITH ranked AS (
  SELECT patient_id, encounter_id, encounter_date,
         ROW_NUMBER() OVER (
           PARTITION BY patient_id
           ORDER BY encounter_date DESC, encounter_id DESC
         ) AS rn
  FROM encounters
)
SELECT patient_id, encounter_id, encounter_date
FROM ranked
WHERE rn <= 2
ORDER BY patient_id, rn
-- expect: [(1, 103, '2026-02-03'), (1, 102, '2026-01-20'), (2, 108, '2026-02-15'), (2, 104, '2026-01-11'), (3, 110, '2026-03-04'), (3, 109, '2026-03-03'), (4, 107, '2026-02-14')]
```

Patient 4 has only one encounter, so they get one row. Use `RANK` instead if ties on the date should all be included.

#### Follow-ups

- **Which index makes this fast?** `(patient_id, encounter_date DESC)` lets the database read each patient's rows already in order.
- **PostgreSQL alternative?** `LATERAL` with `LIMIT 2` per patient, which is very fast with that index when there are many encounters per patient.

### Monthly paid amounts with a running total {medium core}

For paid claims, show the total paid per month (by encounter date) and a running total across months.

#### Hints

1. First aggregate claims to one row per month.
2. Then a `SUM(...) OVER (ORDER BY month)` adds up everything so far.
3. In SQLite, `substr(date, 1, 7)` gives 'YYYY-MM'; in PostgreSQL use `date_trunc('month', encounter_date)`.

#### Solution

Aggregate in a CTE, then apply the running sum over the monthly rows. An aggregate window with `ORDER BY` defaults to the frame `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, which is a running total. (`RANGE` adds rows with the same `ORDER BY` value together; the months here are unique, and you write `ROWS` when you need a strict row-by-row total.)

```sql
WITH monthly AS (
  SELECT substr(e.encounter_date, 1, 7) AS month, SUM(c.paid_amount) AS paid
  FROM claims c
  JOIN encounters e ON e.encounter_id = c.encounter_id
  WHERE c.status = 'paid'
  GROUP BY substr(e.encounter_date, 1, 7)
)
SELECT month, paid, SUM(paid) OVER (ORDER BY month) AS running_total
FROM monthly
ORDER BY month
-- expect: [('2026-01', 1660, 1660), ('2026-02', 120, 1780), ('2026-03', 1950, 3730)]
```

January includes the duplicate claim 1011, which inflates the total by 150. Pointing that out is exactly the kind of data-quality instinct interviewers like.

#### Follow-ups

- **Running total per payer or per patient?** Add `PARTITION BY` to the window.
- **Months with no claims should show 0.** Generate the month series (a recursive CTE, or `generate_series` in PostgreSQL) and left join to it.
- **Three-month moving average?** `AVG(paid) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)`.

### Encounter counts by type per patient (pivot) {medium}

Produce one row per patient with a column for each encounter type: office, er, inpatient, telehealth.

#### Hints

1. This is conditional aggregation: one `SUM` per output column.
2. `CASE WHEN type = 'office' THEN 1 ELSE 0 END` turns each row into a 0 or 1.

#### Solution

Group by patient and count each type with its own conditional sum. This works in every SQL dialect, unlike vendor `PIVOT` syntax.

```sql
SELECT patient_id,
       SUM(CASE WHEN type = 'office'     THEN 1 ELSE 0 END) AS office,
       SUM(CASE WHEN type = 'er'         THEN 1 ELSE 0 END) AS er,
       SUM(CASE WHEN type = 'inpatient'  THEN 1 ELSE 0 END) AS inpatient,
       SUM(CASE WHEN type = 'telehealth' THEN 1 ELSE 0 END) AS telehealth
FROM encounters
GROUP BY patient_id
ORDER BY patient_id
-- expect: [(1, 1, 1, 1, 0), (2, 1, 0, 0, 1), (3, 2, 1, 1, 0), (4, 1, 0, 0, 0)]
```

PostgreSQL also supports the cleaner `COUNT(*) FILTER (WHERE type = 'office')`.

#### Follow-ups

- **What if the types are not known in advance?** SQL needs fixed columns, so either build the query dynamically or return long format (patient, type, count) and pivot in the application or pandas.

### Denial rate per provider {medium}

For each provider with at least one denied claim, show the number of claims, the number denied, and the denial rate as a percentage rounded to one decimal, highest rate first.

#### Hints

1. The path is claims → encounters → providers.
2. Count denied claims with a conditional sum.
3. Multiply by `100.0`, not `100`, or integer division truncates the rate to 0.

#### Solution

Join the three tables, group by provider, and compute the rate from two aggregates. `HAVING` keeps only providers with a denial.

```sql
SELECT pr.name,
       COUNT(*) AS claims,
       SUM(CASE WHEN c.status = 'denied' THEN 1 ELSE 0 END) AS denied,
       ROUND(100.0 * SUM(CASE WHEN c.status = 'denied' THEN 1 ELSE 0 END) / COUNT(*), 1) AS denial_rate
FROM claims c
JOIN encounters e ON e.encounter_id = c.encounter_id
JOIN providers pr ON pr.provider_id = e.provider_id
GROUP BY pr.provider_id, pr.name
HAVING SUM(CASE WHEN c.status = 'denied' THEN 1 ELSE 0 END) > 0
ORDER BY denial_rate DESC, pr.name
-- expect: [('Dr. Eva Ruiz', 1, 1, 100.0), ('Dr. Cara Lin', 3, 1, 33.3)]
```

Grouping by `provider_id` as well as the name avoids merging two providers who happen to share a name.

#### Follow-ups

- **Should pending claims count in the denominator?** Probably not: a fair rate is denied / adjudicated. Say the assumption out loud, then filter `status <> 'pending'` if asked.
- **One provider with one claim shows 100%.** Small samples mislead; report the counts next to the rate, or require a minimum volume.

### ER visit followed by an admission within 30 days {medium}

Find ER visits that were followed by the same patient's inpatient admission within 30 days, with the number of days in between.

#### Hints

1. You need each encounter next to the patient's next encounter.
2. `LEAD` over `PARTITION BY patient_id ORDER BY encounter_date` gives the next row's values.
3. SQLite subtracts dates with `julianday`; PostgreSQL subtracts `date` columns directly to get an integer.

#### Solution

Use `LEAD` to pull the next encounter's date and type onto each row, then filter ER rows whose next encounter is an inpatient stay within 30 days.

```sql
WITH ordered AS (
  SELECT patient_id, encounter_date, type,
         LEAD(encounter_date) OVER (PARTITION BY patient_id ORDER BY encounter_date) AS next_date,
         LEAD(type)           OVER (PARTITION BY patient_id ORDER BY encounter_date) AS next_type
  FROM encounters
)
SELECT patient_id,
       encounter_date AS er_date,
       next_date AS admit_date,
       CAST(julianday(next_date) - julianday(encounter_date) AS INTEGER) AS days_later
FROM ordered
WHERE type = 'er'
  AND next_type = 'inpatient'
  AND julianday(next_date) - julianday(encounter_date) <= 30
ORDER BY patient_id
-- expect: [(1, '2026-01-20', '2026-02-03', 14), (3, '2026-03-03', '2026-03-04', 1)]
```

#### Follow-ups

- **What if another visit sits between the ER visit and the admission?** `LEAD` only sees the very next encounter. Use a self join or `EXISTS` on "any inpatient encounter within 30 days after", which checks all of them.
- **This is the shape of a 30-day readmission metric**, a core quality measure in payer analytics.

### Three or more consecutive days of encounters {hard}

Find patients who had encounters on at least three consecutive calendar days, with the first day, last day and length of the streak.

#### Hints

1. This is the "gaps and islands" problem.
2. For consecutive dates, `date − row_number` is the same value for every day in a run.
3. Deduplicate dates first, or two visits on one day break the trick.

#### Solution

Number each patient's distinct dates in order. Within a run of consecutive days, the date and the row number both go up by one each step, so their difference is constant: that difference identifies the island. Group by it and keep islands of three or more days.

```sql
WITH days AS (
  SELECT DISTINCT patient_id, encounter_date FROM encounters
),
grouped AS (
  SELECT patient_id, encounter_date,
         julianday(encounter_date)
           - ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY encounter_date) AS grp
  FROM days
)
SELECT patient_id, MIN(encounter_date) AS first_day, MAX(encounter_date) AS last_day, COUNT(*) AS streak
FROM grouped
GROUP BY patient_id, grp
HAVING COUNT(*) >= 3
-- expect: [(3, '2026-03-02', '2026-03-04', 3)]
```

In PostgreSQL with a real `date` column, the island key is `encounter_date - (ROW_NUMBER() OVER (…))::int`, because subtracting an integer from a date gives a date.

#### Follow-ups

- **Longest streak per patient?** Wrap the grouped result and take `MAX(streak)` per patient.
- **Gaps instead of islands?** Use `LEAD` and keep rows where the next date is more than one day later.

### Delete duplicate claims, keeping the first {medium core}

Claims are duplicates if they share the same encounter and billed amount. Delete the duplicates, keeping the lowest `claim_id` of each group.

#### Hints

1. First write a `SELECT` that finds the rows to keep.
2. The keeper of each group is `MIN(claim_id)` grouped by the duplicate key.
3. Delete everything that is not a keeper. Run it inside a transaction and check the count before committing.

#### Solution

Find the keeper IDs with `GROUP BY` and delete the rest. Here only claim 1011 (a copy of 1005) goes.

```sql
DELETE FROM claims
WHERE claim_id NOT IN (
  SELECT MIN(claim_id) FROM claims GROUP BY encounter_id, billed_amount
);
```

```sql
SELECT COUNT(*), COUNT(DISTINCT encounter_id) FROM claims
-- expect: [(10, 10)]
```

`NOT IN` is safe here because `MIN(claim_id)` is never NULL. A window version is handy when "first" means latest by timestamp rather than lowest ID:

```sql norun
-- Delete all but the newest row per key, using ROW_NUMBER (assumes a created_at column, which the practice schema does not have).
DELETE FROM claims
WHERE claim_id IN (
  SELECT claim_id FROM (
    SELECT claim_id,
           ROW_NUMBER() OVER (PARTITION BY encounter_id, billed_amount ORDER BY created_at DESC) AS rn
    FROM claims
  ) t
  WHERE rn > 1
);
```

#### Follow-ups

- **How do you stop duplicates coming back?** Add a unique constraint on the business key (or an idempotency key on the API that creates claims), then fix the producer.
- **Safety in production?** Run the `SELECT` first, wrap the delete in a transaction, compare row counts, and keep a backup or soft-delete flag for regulated data.
