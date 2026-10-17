---
title: "Query Clinic: a PostgreSQL performance case study"
summary: A reproducible PostgreSQL repository that generates a realistic 10-million-row dataset, answers 25 interview-style analytics questions, and documents how each slow query was measured with EXPLAIN ANALYZE and made fast with indexes, rewrites and partitioning.
time: 3–4 days of evenings
---

## What you will build

Query Clinic is a SQL portfolio piece that recruiters and interviewers can read in five minutes and verify in ten. It models a multi-clinic appointment system (clinics, providers, patients, appointments, payments), filled with synthetic data from `generate_series`, so there is no real or sensitive data anywhere.

The repository answers 25 questions of the kind live SQL rounds ask ("top 3 providers by revenue per clinic last quarter", "patients with no visit in 12 months", "7-day rolling no-show rate", "longest streak of consecutive booked days"). For the five slowest queries it contains a written case study: the plan before, what the planner was doing, the fix, the plan after, and the measured speed-up.

## What it proves

- SQL fluency: joins, aggregation, CTEs (including recursive), window functions, `DISTINCT ON`, `FILTER`, gaps and islands
- Schema design: keys, constraints, normalisation decisions, and where JSONB is and is not appropriate
- Performance: reading `EXPLAIN (ANALYZE, BUFFERS)`, B-tree composite and partial indexes, covering indexes, statistics, partitioning by time, keyset pagination
- Transactions and concurrency: a documented demo of lost updates and how `SELECT … FOR UPDATE` or serializable isolation prevents them
- Testing SQL: assertions on query results in CI
- Keywords: SQL, PostgreSQL, query optimisation, indexing, window functions, data modelling, performance tuning

## Architecture

```text
schema/            DDL: tables, constraints, comments
seed/              generate_series data generator (sizes set by a variable: small for CI, 10M rows locally)
queries/q01..q25   one file per question: the question, the SQL, the expected result shape
case-studies/      5 write-ups: before plan → diagnosis → fix → after plan → timing table
tests/             pytest + psycopg: runs every query on the small dataset and checks results
bench/             a script that times each query 10× and writes a Markdown table
```

## Milestones

### Milestone 1: schema and data generator

- Design the schema with real constraints (foreign keys, `CHECK`s, a unique booking per provider and slot).
- A seed script parameterised by size; skew the data realistically (a few busy clinics, seasonal booking peaks) so plans behave like production.
- Develop on your local PostgreSQL (Homebrew; upgrade from 14 to the current release if you can). Readers can use the included Docker Compose file.

Done when: `make seed SIZE=small` and `make seed SIZE=large` both work, and `\d+` output is in the README.

### Milestone 2: the 25 questions

- Write each query in its own file with the question as a comment and a sample of the expected output.
- Cover joins, grouping, windows (rank, running totals, rolling averages), gaps and islands, recursive CTEs, and anti-joins (`NOT EXISTS`).

Done when: every query runs on the small dataset and has a pytest assertion on its result.

### Milestone 3: measure

- `bench/run.py` times each query on the large dataset with a warm cache, 10 runs, median and p95.
- Save `EXPLAIN (ANALYZE, BUFFERS)` output for the slowest five.

Done when: a benchmark table is generated into the README automatically.

### Milestone 4: fix and write up

- For each slow query: diagnose (sequential scan, bad join order, sort spilling to disk, missing statistics), then fix with the smallest change (composite or partial index, covering index, rewrite, `ANALYZE`, partitioning).
- Write one case study per query, with before and after plans and the timing table.

Done when: five case studies show a measured improvement and explain the trade-off (index size, write cost).

### Milestone 5: concurrency demo

- Two scripts that run concurrent transactions and show a lost update under Read Committed, then the fixes: `FOR UPDATE`, an atomic `UPDATE … SET x = x + 1`, and Serializable with a retry loop.

Done when: the demo is reproducible from the README in two terminal windows.

## Repository layout

```text
query-clinic/
├─ schema/001_tables.sql, 002_indexes.sql
├─ seed/seed.sql
├─ queries/q01_top_providers.sql … q25_booking_streaks.sql
├─ case-studies/01-revenue-report.md … 05-rolling-no-show.md
├─ concurrency/lost_update_a.sql, lost_update_b.sql
├─ tests/test_queries.py
├─ bench/run.py
├─ docker-compose.yml, Makefile
└─ .github/workflows/ci.yml
```

## Tests and CI

- pytest with psycopg 3: create a fresh database, apply the schema, seed the small dataset, run every query and compare with expected rows.
- A test that checks the planner uses the intended index for the indexed queries (`EXPLAIN` JSON, looking for an Index Scan node).
- CI: a PostgreSQL service container in GitHub Actions, then `make test`.

## README checklist

- A one-paragraph summary with the headline result ("5 queries, from 2.4 s median to 38 ms")
- The schema diagram (generate it with a tool such as `dbdiagram.io` or SchemaSpy)
- A table of the 25 questions with links to each query
- The benchmark table and links to the case studies
- How to run it (local PostgreSQL or Docker Compose)
- What you would do next (`pg_stat_statements`, connection pooling, read replicas)

## Stretch goals

- `pg_stat_statements` and `auto_explain` configuration and what they revealed
- The same questions answered with an ORM (SQLAlchemy) and a note on where the ORM's SQL was worse
- A materialised view for the dashboard query, with a refresh strategy

## Talking about it in an interview

**60-second walkthrough:** "Query Clinic is a PostgreSQL case study. I generated a skewed ten-million-row appointment dataset, wrote twenty-five interview-style analytics queries with tests, then benchmarked them. For the five slowest I read the EXPLAIN ANALYZE output, found the cause (a sequential scan on appointments, a sort spilling to disk, stale statistics) and fixed each with the smallest change, mostly composite and partial indexes and one rewrite. Each case study shows the before and after plans and the measured speed-up."

- **How do you choose the column order in a composite index?** Equality filters first, then the range or sort column, so one index serves both the filter and the order; check it with EXPLAIN.
- **When would you not add an index?** On write-heavy tables where the index cost outweighs rare reads, on low-selectivity columns, or when a partial index or a rewrite solves it more cheaply.
- **Why keyset pagination?** `OFFSET` reads and throws away every skipped row; a `WHERE (created_at, id) < (…)` predicate with a matching index stays fast on page 1,000.

## LinkedIn post template

> I built Query Clinic, a PostgreSQL performance case study: a synthetic 10M-row dataset, 25 tested analytics queries, and five write-ups showing how I diagnosed slow queries with EXPLAIN ANALYZE and fixed them.
> Biggest lesson: the smallest fix usually wins. A partial index beat a big rewrite.
> Everything is reproducible from the README: <repo link> #SQL #PostgreSQL #DatabasePerformance

## Resume bullet

Built Query Clinic, a reproducible PostgreSQL performance case study: 25 tested analytics queries over a 10M-row synthetic dataset, with documented EXPLAIN ANALYZE tuning that cut the slowest queries' median latency by over 90%.
