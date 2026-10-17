---
title: Practical Python tasks
goal: Solve the practical tasks a Python backend or data round favours (logs and CSVs, reshaping JSON, caches, rate limiters, retries, bounded queues, concurrency limits, state machines, stream parsing) with clean, tested, async-aware code.
minutes: 190
---

Many Python rounds skip puzzle problems and hand you something that looks like real work: a few log lines, a CSV of
claims, a nested JSON payload, "build a small cache", or a small piece of an orchestration service such as a bounded
worker queue or a retry decorator. These tasks check things LeetCode-style problems don't: whether you pick the right
standard-library tool, handle messy input without crashing, write correct async code, name things clearly, and test your
own code.

Every solution injects its clock, sleep function or random source. Say why when you do it: it makes time-based code
deterministic to test, and interviewers notice. The examples mix healthcare data (claims, patients, appointments) with
service data (logs, tool calls, agent runs). Each block runs on Python 3.14 with its own asserts. Solve each one out
loud: restate the task, ask about the edge cases, write the code, then run the asserts in your head.

## How practical rounds are graded

| What they watch | What a strong candidate does |
|---|---|
| Clarifying questions | Asks about bad rows, duplicates, time zones, empty input and expected output format before coding |
| Right tool | Reaches for `csv`, `json`, `datetime`, `collections`, `heapq`, `re`, `decimal` and `asyncio` instead of hand-rolling them |
| Robustness | Skips or collects bad records instead of crashing, and says which choice they made and why |
| Testability | Injects the clock (`now`), `sleep` and randomness so time-based code can be tested without waiting |
| Readability | Small functions, type hints, names like `errors_by_hour`, not `d` or `tmp` |
| Complexity | States time and memory cost, and what changes when the file is 50 GB or there are a million jobs |

## The toolkit you will reach for

| Need | Tool |
|---|---|
| Count things | `collections.Counter` |
| Group rows by a key | `collections.defaultdict(list)` |
| LRU order | `collections.OrderedDict` with `move_to_end` and `popitem(last=False)` |
| Sliding time window | `collections.deque` of timestamps |
| "What happens next in time order" | `heapq` with `(time, sequence, item)` tuples |
| Top k | `heapq.nlargest`, or a size-k min-heap for a stream |
| Fixed-size chunks | `itertools.batched` (3.12+) |
| Money | `decimal.Decimal`, never `float` |
| Dates and times | `datetime.strptime`, `date.fromisoformat`, `datetime.fromisoformat` |
| Elapsed time, rate limits, TTLs | `time.monotonic()` (never wall-clock time), injected so tests can fake it |
| CSV text or files | `csv.DictReader` (handles quoting and commas inside fields) |
| Nested JSON | `json.loads`, then recursion (or an explicit stack for very deep data) |
| Text patterns | `re.compile(...).fullmatch(...)` for validation, `re.findall` for extraction |
| Typed records | `@dataclass(frozen=True, slots=True)` |
| Work queue with backpressure | `asyncio.Queue(maxsize=n)` |
| At most n things at once | `asyncio.Semaphore(n)` |
| Run tasks, cancel the rest if one fails | `asyncio.TaskGroup` (3.11+) |
| Deadline around a block | `async with asyncio.timeout(seconds)` (3.11+) |
| First of several to finish | `asyncio.wait(…, return_when=FIRST_COMPLETED)` |
| Blocking call from async code | `await asyncio.to_thread(fn, …)` |

```python
import asyncio
import itertools
import time
from collections import OrderedDict


async def main() -> list[int]:
    limit = asyncio.Semaphore(2)

    async def job(i: int) -> int:
        async with limit:
            await asyncio.sleep(0.001)
            return i * i

    async with asyncio.timeout(1):
        async with asyncio.TaskGroup() as tg:
            tasks = [tg.create_task(job(i)) for i in range(5)]
    return [t.result() for t in tasks]


assert asyncio.run(main()) == [0, 1, 4, 9, 16]
assert list(itertools.batched("abcde", 2)) == [("a", "b"), ("c", "d"), ("e",)]

lru = OrderedDict(a=1, b=2, c=3)
lru.move_to_end("a")                       # "a" is now the most recently used
assert lru.popitem(last=False) == ("b", 2)  # evict the least recently used

start = time.monotonic()
assert time.monotonic() >= start           # monotonic never goes backwards
```

## Interview questions

### `asyncio.gather` or `asyncio.TaskGroup`? {core}

`TaskGroup` is the structured choice since Python 3.11: if any task fails, the group cancels the others, waits for
them, and raises an `ExceptionGroup`, so nothing keeps running in the background. `gather` returns results in input
order and is handy with `return_exceptions=True` when you want every outcome, but on failure it raises the first
exception and leaves the other tasks running unless you cancel them yourself.

### Why `time.monotonic()`, and why inject the clock?

Wall-clock time can jump backwards or forwards (NTP corrections, daylight saving, a manual change), which would break
a rate limiter or a TTL. `monotonic()` only moves forward, so it is the right source for durations. Injecting it as a
parameter lets tests drive time with a fake clock, so a test of "expires after 30 seconds" runs instantly and never
flakes.

### What happens if you call a blocking function inside `async def`? {core}

It blocks the whole event loop: every other request, stream and timer on that worker freezes until it returns. Use
the async version of the library, or move the call to a thread with `await asyncio.to_thread(fn, ...)`. CPU-heavy work
needs a process pool or another service, because threads still share the GIL on the default build.

### How do you call an external API safely from many concurrent tasks? {core}

Three controls. A semaphore caps concurrency so you never open more connections than the API or your pool allows. A
rate limiter (token bucket) caps requests per second to stay under the provider's quota. A retry with exponential
backoff and jitter handles transient failures, retrying only on errors that are safe to retry (timeouts, 429, 503),
and honouring `Retry-After` when the server sends it.

### What does `functools.wraps` do, and why does it matter for decorators?

It copies the wrapped function's `__name__`, `__doc__`, `__module__`, `__qualname__` and `__wrapped__` onto the
wrapper. Without it, every decorated function looks like `wrapper` in logs, tracebacks, FastAPI's OpenAPI output and
`inspect.signature`, which makes debugging and introspection harder.

### When do you use a generator instead of building a list? {deep}

When the data is large, unbounded or arrives over time: log files, paginated API results, a token stream. A generator
holds one item at a time and starts producing results immediately, and generators chain into lazy pipelines. Build a
list when you need its length, random access, or to iterate it more than once.

## Coding problems

### Aggregate service logs: errors per minute and p95 latency {medium core}

Each log line looks like `2026-10-14T10:01:07Z planner ERROR 120ms Tool timeout`: timestamp, service, level, latency,
message. Return the number of `ERROR` lines per (service, minute), the p95 latency per service (nearest-rank method),
and how many lines were malformed.

#### Hints

1. `line.split(maxsplit=4)` gives the five parts, keeping spaces inside the message.
2. `datetime.fromisoformat` accepts the trailing `Z` since Python 3.11. Format the minute as the bucket key.
3. Nearest-rank p95: sort the values and take index `ceil(0.95 × n) - 1`. Catch parse errors per line and count them.

#### Solution

One pass with a `Counter` for errors and a `defaultdict(list)` for latencies, then one sort per service. Malformed
lines are counted, not fatal: a log processor should never die on one bad line.

```python
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Summary:
    errors_per_minute: Counter[tuple[str, str]]
    p95_ms: dict[str, int]
    skipped: int


def p95(values: list[int]) -> int:
    ordered = sorted(values)
    return ordered[math.ceil(0.95 * len(ordered)) - 1]


def summarise(lines: list[str]) -> Summary:
    errors: Counter[tuple[str, str]] = Counter()
    latencies: defaultdict[str, list[int]] = defaultdict(list)
    skipped = 0
    for line in lines:
        try:
            stamp, service, level, latency, _message = line.split(maxsplit=4)
            minute = datetime.fromisoformat(stamp).strftime("%Y-%m-%dT%H:%M")
            if not latency.endswith("ms"):
                raise ValueError(latency)
            ms = int(latency.removesuffix("ms"))
        except ValueError:
            skipped += 1
            continue
        latencies[service].append(ms)
        if level == "ERROR":
            errors[(service, minute)] += 1
    return Summary(errors, {service: p95(values) for service, values in latencies.items()}, skipped)


LOG = [
    "2026-10-14T10:01:07Z planner ERROR 120ms Tool timeout: sap.create_po",
    "2026-10-14T10:01:42Z planner INFO 80ms Step finished",
    "2026-10-14T10:01:59Z planner ERROR 95ms Tool timeout: search",
    "2026-10-14T10:02:00Z planner ERROR 300ms Model returned invalid JSON",
    "2026-10-14T10:02:03Z gateway INFO 12ms GET /runs/42",
    "garbage line",
    "2026-10-14T10:02:04Z gateway WARN slow Upstream slow",
    "not-a-date gateway INFO 5ms x",
]
summary = summarise(LOG)
assert summary.errors_per_minute == Counter({("planner", "2026-10-14T10:01"): 2, ("planner", "2026-10-14T10:02"): 1})
assert summary.p95_ms == {"planner": 300, "gateway": 12}
assert summary.skipped == 3
assert p95(list(range(1, 101))) == 95 and p95([7]) == 7
assert summarise([]) == Summary(Counter(), {}, 0)
```

Complexity: O(n) to parse plus O(m log m) to sort each service's m latencies.

#### Follow-ups

- **A 10 GB file?** Read line by line (a file object is a lazy iterator) and keep a histogram per service instead of
  every latency.
- **Several files?** Count each one in a separate process and add the partial results: `Counter` supports
  `total += partial`.
- **Time zones?** Ask which zone the logs use. Parse to an aware `datetime` and convert to UTC before bucketing; a
  trailing `Z` already means UTC.
- **Structured logs?** Prefer JSON lines (`json.loads` per line) over regex parsing, and include the trace id.

### Total claims per member and flag duplicates {medium core}

You get claims as CSV text. Return three things:

- the total billed amount per member;
- the ids of duplicate claims, meaning the same member, service date and CPT code as an earlier claim (possible double
  billing), left out of the totals;
- the line numbers of rows whose amount is missing or not a number.

```text
claim_id,member_id,service_date,cpt,amount
C1,M1,2026-09-01,99213,120.00
C2,M2,2026-09-01,99214,200.50
C3,M1,2026-09-01,99213,120.00
C4,M1,2026-09-15,80053,45.25
C5,M2,2026-09-03,99213,abc
C6,M3,2026-09-04,99395,
```

#### Hints

1. Use `csv.DictReader` over `io.StringIO(text)`. Don't split on commas yourself, because quoted fields can contain commas.
2. Money must be `Decimal`, not `float`. `Decimal("abc")` raises `InvalidOperation`.
3. Keep a dict from the duplicate key `(member, date, cpt)` to the first claim id that used it.

#### Solution

This is one pass with three accumulators. `enumerate(reader, start=2)` gives real file line numbers, because line 1 is
the header. A `defaultdict(Decimal)` starts every member at `Decimal("0")`.

```python
import csv
import io
from collections import defaultdict
from decimal import Decimal, InvalidOperation


def summarise_claims(text: str) -> tuple[dict[str, Decimal], list[str], list[int]]:
    totals: defaultdict[str, Decimal] = defaultdict(Decimal)
    first_claim: dict[tuple[str, str, str], str] = {}
    duplicates: list[str] = []
    bad_lines: list[int] = []

    for line_no, row in enumerate(csv.DictReader(io.StringIO(text)), start=2):
        try:
            amount = Decimal(row["amount"])
        except (InvalidOperation, TypeError):  # "abc", "" or a missing column (None)
            bad_lines.append(line_no)
            continue
        if not amount.is_finite():  # Decimal("NaN") and Decimal("Infinity") parse without error
            bad_lines.append(line_no)
            continue
        key = (row["member_id"], row["service_date"], row["cpt"])
        if key in first_claim:
            duplicates.append(row["claim_id"])
            continue
        first_claim[key] = row["claim_id"]
        totals[row["member_id"]] += amount

    return dict(totals), duplicates, bad_lines


data = """claim_id,member_id,service_date,cpt,amount
C1,M1,2026-09-01,99213,120.00
C2,M2,2026-09-01,99214,200.50
C3,M1,2026-09-01,99213,120.00
C4,M1,2026-09-15,80053,45.25
C5,M2,2026-09-03,99213,abc
C6,M3,2026-09-04,99395,
"""
totals, dups, bad = summarise_claims(data)
assert totals == {"M1": Decimal("165.25"), "M2": Decimal("200.50")}
assert dups == ["C3"]
assert bad == [6, 7]
assert summarise_claims("claim_id,member_id,service_date,cpt,amount\n") == ({}, [], [])
assert summarise_claims("claim_id,member_id,service_date,cpt,amount\nC9,M9,2026-09-01,99213,NaN\n")[2] == [2]

# Why Decimal: floats cannot represent most cents exactly.
assert 0.1 + 0.2 != 0.3
assert Decimal("0.1") + Decimal("0.2") == Decimal("0.3")
```

Complexity: O(n) time. Memory is O(m + k) for m members and k distinct claim keys.

#### Follow-ups

- **Is C3 really a duplicate?** It might be a legitimate repeat visit. In a real system, flag it for review instead of
  dropping it, and match on more fields (provider NPI, units, modifiers).
- **The file has 100 million rows.** Stream it as above. The duplicate-key dict may outgrow memory, so push the job into
  a database (`GROUP BY member_id, service_date, cpt HAVING COUNT(*) > 1`) or into pandas or Spark.
- **Report bad rows to the sender?** Collect `(line_no, reason)` pairs and return them, so the sender can fix the file.

### Top N most frequent words in clinical notes {easy core}

Return the `n` most common words in a block of text: ignore case and punctuation, skip stop words, and break ties
alphabetically. Return `(word, count)` pairs.

#### Hints

1. Extract words with `re.findall` rather than `split()`, so "pain." and "pain" count as the same word.
2. `Counter` counts them. `most_common` breaks ties by first appearance, not alphabetically.
3. To control ties, sort by the key `(-count, word)`. `heapq.nsmallest(n, ...)` avoids sorting everything.

#### Solution

Tokenise, filter, count, then pick the top n with an explicit tie-break. Interviewers often check whether you know that
`most_common`'s tie order isn't alphabetical.

```python
import heapq
import re
from collections import Counter

STOP_WORDS = frozenset({"the", "a", "an", "and", "of", "to", "in", "is", "was", "with"})


def top_words(text: str, n: int, stop: frozenset[str] = STOP_WORDS) -> list[tuple[str, int]]:
    words = re.findall(r"[a-z]+(?:'[a-z]+)?", text.lower())
    counts = Counter(w for w in words if w not in stop)
    return heapq.nsmallest(n, counts.items(), key=lambda kv: (-kv[1], kv[0]))


note = "The patient reported chest pain. Chest pain worsened; the patient was admitted. Pain!"
assert top_words(note, 3) == [("pain", 3), ("chest", 2), ("patient", 2)]
assert top_words(note, 0) == []
assert top_words("", 5) == []
assert top_words("Patient's chart, patient's chart.", 1) == [("chart", 2)]
```

Complexity: O(W) to count W words, plus O(U log n) to pick the top n of U unique words.

#### Follow-ups

- **Gigabytes of notes?** Count each chunk separately and add the Counters, which is a map-reduce. For approximate top-k
  in a stream, use a Count-Min Sketch or the Space-Saving algorithm.
- **Medical text?** Plain tokenising splits "q.i.d." and "COVID-19" badly. Clinical NLP uses special tokenisers and
  recognises negation ("no chest pain").

### Top k slowest tool calls {easy}

Given tool-call records with a duration in milliseconds, return the k slowest, slowest first. Then handle an unbounded
stream using O(k) memory. Ties keep the earlier call.

#### Hints

1. Sorting everything is O(n log n). `heapq.nlargest(k, …, key=…)` is O(n log k).
2. For a stream, keep a min-heap of size k: its root is the fastest of the current top k, the one to evict.
3. Add a sequence number to heap entries so ties never compare the records themselves.

#### Solution

`heapq.nlargest` is the one-liner, and it matches a stable descending sort, so ties keep their input order. The
streaming version keeps `(duration, -sequence, record)` in a min-heap, so among equal durations the most recent call
is evicted first, and sorts the survivors at the end.

```python
import heapq
import random
from collections.abc import Iterable
from dataclasses import dataclass


@dataclass(frozen=True)
class ToolCall:
    tool: str
    ms: int


def slowest(calls: list[ToolCall], k: int) -> list[ToolCall]:
    return heapq.nlargest(k, calls, key=lambda c: c.ms)


def slowest_stream(calls: Iterable[ToolCall], k: int) -> list[ToolCall]:
    if k <= 0:
        return []
    heap: list[tuple[int, int, ToolCall]] = []
    for seq, call in enumerate(calls):
        entry = (call.ms, -seq, call)
        if len(heap) < k:
            heapq.heappush(heap, entry)
        elif entry > heap[0]:
            heapq.heapreplace(heap, entry)
    return [call for _, _, call in sorted(heap, key=lambda e: (-e[0], -e[1]))]


calls = [ToolCall("search", 120), ToolCall("sap.create_po", 900), ToolCall("fetch", 300), ToolCall("embed", 900)]
assert slowest(calls, 2) == [ToolCall("sap.create_po", 900), ToolCall("embed", 900)]
assert slowest_stream(iter(calls), 2) == slowest(calls, 2)
assert slowest(calls, 10) == sorted(calls, key=lambda c: c.ms, reverse=True)
assert slowest_stream(calls, 0) == [] and slowest_stream([], 3) == []

rng = random.Random(7)
for _ in range(200):
    data = [ToolCall(f"t{i}", rng.randint(0, 20)) for i in range(rng.randint(0, 30))]
    k = rng.randint(0, 8)
    assert slowest_stream(data, k) == sorted(data, key=lambda c: c.ms, reverse=True)[:k]
```

Complexity: O(n log k) time, O(k) memory for the stream version.

#### Follow-ups

- **p99 latency over a stream?** Keep a histogram or a quantile sketch (t-digest), not every value.
- **Top k per tool?** A dict of heaps keyed by tool name.

### Deduplicate patients by normalised name and date of birth {medium core}

Patient records from two clinics use different formats. Treat two records as the same person when their normalised
first name, last name and date of birth match. Normalise names by ignoring case, accents, spaces, hyphens and apostrophes.
Dates arrive as `YYYY-MM-DD` or US `MM/DD/YYYY`. Return the records you keep, and a map from each duplicate id to the id
it merged into.

#### Hints

1. Build a match key: `(normalised first, normalised last, parsed date)`.
2. `unicodedata.normalize("NFKD", s)` splits "é" into "e" plus a combining accent, which you can then drop.
3. Parse the date into a `date` object, so that `1985-03-07` and `03/07/1985` compare equal.

#### Solution

The whole problem is in the match key. Normalise the names to lowercase letters only (accents stripped, spaces and punctuation
dropped), so that "José", "jose " and "JOSE" match, and so do "Mary-Jane" and "Mary Jane". Keep letters from every script
with `str.isalpha()`: a regex like `[^a-z]` would erase non-Latin names completely and make them all collide. Parse dates by trying each known format. Then a dict from key to the
first id seen does the deduplication in one pass.

```python
import unicodedata
from datetime import date, datetime
from typing import Any


def normalise_name(name: str) -> str:
    decomposed = unicodedata.normalize("NFKD", name)
    no_accents = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return "".join(ch for ch in no_accents.casefold() if ch.isalpha())


def parse_dob(raw: str) -> date:
    for fmt in ("%Y-%m-%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unrecognised date of birth: {raw!r}")


def dedupe_patients(records: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    kept: list[dict[str, Any]] = []
    first_id: dict[tuple[str, str, date], str] = {}
    merged_into: dict[str, str] = {}
    for rec in records:
        key = (normalise_name(rec["first"]), normalise_name(rec["last"]), parse_dob(rec["dob"]))
        if key in first_id:
            merged_into[rec["id"]] = first_id[key]
        else:
            first_id[key] = rec["id"]
            kept.append(rec)
    return kept, merged_into


records = [
    {"id": "P1", "first": "José", "last": "García", "dob": "1985-03-07"},
    {"id": "P2", "first": "jose ", "last": "GARCIA", "dob": "03/07/1985"},
    {"id": "P3", "first": "Mary-Jane", "last": "O'Brien", "dob": "1990-12-01"},
    {"id": "P4", "first": "Mary Jane", "last": "OBrien", "dob": "12/01/1990"},
    {"id": "P5", "first": "Jose", "last": "Garcia", "dob": "1985-07-03"},  # different DOB: a different person
]
kept, merged = dedupe_patients(records)
assert [r["id"] for r in kept] == ["P1", "P3", "P5"]
assert merged == {"P2": "P1", "P4": "P3"}
assert normalise_name("  Zoë  ") == "zoe"
assert normalise_name("李 小龍") == "李小龍"   # non-Latin letters are kept, not erased
try:
    parse_dob("7 March 1985")
except ValueError:
    pass
else:
    raise AssertionError("unknown format should raise")
```

Complexity: O(n × L) time for name length L. Memory is O(n) for the key map.

#### Follow-ups

- **Nicknames and typos (Bob and Robert, Jon and John)?** Exact keys miss these. Use fuzzy scores (Jaro–Winkler,
  Levenshtein), a nickname table and extra fields (address, phone, last 4 of SSN), then send borderline matches to a
  person for review. This is how a Master Patient Index works.
- **Millions of records?** Comparing all pairs is O(n²). Use "blocking": compare only within a block that shares, say,
  the DOB and the first letter of the last name.
- **Keep the most recent record instead of the first?** Store the best record per key with its parsed timestamp, and
  replace it when a newer one arrives. Replacing a dict value keeps the key's original position, so the output stays
  in first-seen order. Compare real datetimes, not strings, and normalise them to UTC first: comparing a naive
  timestamp with an aware one raises `TypeError`.
- **Why `casefold()` and not `lower()`?** `casefold` is the stronger, language-aware fold: `"Straße".casefold()` is
  `"strasse"`, while `lower()` leaves the ß.
- **Should it auto-merge?** In healthcare, a wrong merge mixes two people's medical histories, so high-confidence matches
  merge and the rest go to a human review queue.

### Validate intake records and collect every error {medium}

Validate patient intake records before loading them. Rules: `member_id`, `name`, `dob` and `zip` are required;
`member_id` looks like `M123456`; `dob` is a real `YYYY-MM-DD` date and not in the future; `zip` is 5 digits. Return the
valid records and a list of `(index, field, message)` errors. Report **all** errors for a record, not just the first.

#### Hints

1. Collect problems per record into a list. A record is valid only if its list is empty.
2. Use `re.fullmatch`, not `re.match`: `match` would accept `M1234567X`.
3. Pass `today` in as a parameter, so the "not in the future" rule is testable.

#### Solution

Run every rule and append to a list instead of raising on the first failure. Users want one report covering every bad
field. `date.fromisoformat` both parses the date and rejects impossible ones like `1985-02-30`.

```python
import re
from datetime import date
from typing import Any

MEMBER_ID = re.compile(r"M\d{6}")
ZIP = re.compile(r"\d{5}")
REQUIRED = ("member_id", "name", "dob", "zip")


def validate(records: list[dict[str, Any]], today: date) -> tuple[list[dict[str, Any]], list[tuple[int, str, str]]]:
    valid: list[dict[str, Any]] = []
    errors: list[tuple[int, str, str]] = []
    for i, rec in enumerate(records):
        problems = [(i, f, "is required") for f in REQUIRED if not str(rec.get(f) or "").strip()]

        member_id = rec.get("member_id")
        if member_id and not MEMBER_ID.fullmatch(member_id):
            problems.append((i, "member_id", "must look like M123456"))

        if dob_raw := rec.get("dob"):
            try:
                dob = date.fromisoformat(dob_raw)
            except ValueError:
                problems.append((i, "dob", "must be a real date in YYYY-MM-DD form"))
            else:
                if dob > today:
                    problems.append((i, "dob", "cannot be in the future"))

        zip_code = rec.get("zip")
        if zip_code and not ZIP.fullmatch(zip_code):
            problems.append((i, "zip", "must be 5 digits"))

        if problems:
            errors.extend(problems)
        else:
            valid.append(rec)
    return valid, errors


today = date(2026, 10, 13)
records = [
    {"member_id": "M123456", "name": "Ana Diaz", "dob": "1985-03-07", "zip": "92620"},
    {"member_id": "M12", "name": "", "dob": "1985-02-30", "zip": "9262"},
    {"member_id": "M1234567X", "name": "Raj Patel", "dob": "2030-01-01"},
]
valid, errors = validate(records, today)
assert [r["name"] for r in valid] == ["Ana Diaz"]
assert errors == [
    (1, "name", "is required"),
    (1, "member_id", "must look like M123456"),
    (1, "dob", "must be a real date in YYYY-MM-DD form"),
    (1, "zip", "must be 5 digits"),
    (2, "zip", "is required"),
    (2, "member_id", "must look like M123456"),
    (2, "dob", "cannot be in the future"),
]
```

Complexity: O(n × r) for n records and r rules.

#### Follow-ups

- **Use Pydantic instead?** Define a model with `Field(pattern=...)` and a `field_validator` for the date.
  `ValidationError.errors()` already lists every failure with its location. This is the same approach as a
  structured-output quality gate.
- **Rules change often?** Make the rules data: a list of `(field, check_function, message)` tuples that the loop runs.

### Flatten nested JSON into dotted keys {medium core}

You get a nested JSON document, such as a FHIR-like patient or a tool-call payload. Flatten it so it can go into a flat
table or a search index. Nested keys join with dots, and list items use their index. Empty dicts and lists below the top
level are kept as values.

```text
{"name": {"given": "Ana"}, "ids": [{"system": "MRN", "value": "123"}], "tags": []}
→ {"name.given": "Ana", "ids.0.system": "MRN", "ids.0.value": "123", "tags": []}
```

#### Hints

1. Recursion fits naturally: a non-empty dict or list means "go deeper", and anything else is a leaf.
2. Pass the path built so far down to each recursive call, and avoid a leading dot for top-level keys.
3. Treat a list like a dict whose keys are `"0"`, `"1"`, and so on. Decide what an empty container should become, or it
   silently disappears.

#### Solution

Walk the document once, writing each leaf straight into one shared dict. (Returning a dict from every call and merging
them works too, but copies results up the tree at every level.) An empty container has no children, so it is stored as
a value; at the very top an empty document simply flattens to `{}`, and a bare scalar, which has no path, lands under the empty key `""`.

```python
import json
from typing import Any


def flatten(value: Any, sep: str = ".") -> dict[str, Any]:
    flat: dict[str, Any] = {}

    def walk(node: Any, path: str) -> None:
        if isinstance(node, dict) and node:
            items = ((str(k), v) for k, v in node.items())
        elif isinstance(node, list) and node:
            items = ((str(i), v) for i, v in enumerate(node))
        else:
            if path or not isinstance(node, (dict, list)):
                flat[path] = node  # a leaf, or an empty container below the top level
            return
        for key, child in items:
            walk(child, f"{path}{sep}{key}" if path else key)

    walk(value, "")
    return flat


patient = json.loads("""
{"resourceType": "Patient",
 "name": {"given": "Ana", "family": "Diaz"},
 "ids": [{"system": "MRN", "value": "123"}, {"system": "MBI", "value": "1EG4"}],
 "active": true, "tags": [], "extra": {}}
""")
assert flatten(patient) == {
    "resourceType": "Patient",
    "name.given": "Ana",
    "name.family": "Diaz",
    "ids.0.system": "MRN",
    "ids.0.value": "123",
    "ids.1.system": "MBI",
    "ids.1.value": "1EG4",
    "active": True,
    "tags": [],
    "extra": {},
}

run = {"run": {"id": 7, "steps": [{"tool": "search"}, {"tool": "sap"}]}, "tags": [], "meta": {}}
assert flatten(run) == {"run.id": 7, "run.steps.0.tool": "search", "run.steps.1.tool": "sap", "tags": [], "meta": {}}
assert flatten({}) == {} and flatten([]) == {}
assert flatten({"a": {"b": {"c": None}}}, sep="_") == {"a_b_c": None}
assert flatten([1, [2, 3]]) == {"0": 1, "1.0": 2, "1.1": 3}
assert flatten(5) == {"": 5}
```

Complexity: one visit per value, and each leaf key costs O(depth) characters to build, so O(values × depth) in the
worst case and O(values) for shallow documents.

#### Follow-ups

- **Very deep documents hit the recursion limit (about 1000).** Use an explicit stack of `(path, value)` pairs instead
  of recursion. JSON from an API or a model is usually shallow, so recursion is fine; say so.
- **A key already contains the separator.** Choose a separator that can't appear in keys, escape it (JSON Pointer
  writes `/` as `~1`), or return tuples of path parts instead of strings.
- **With pandas?** `pd.json_normalize(records, sep=".")` flattens dicts. Lists need `record_path` or `explode`.
- **Unflatten?** The next problem.

### Unflatten dotted keys back into nested JSON {medium}

Do the reverse of the previous problem: turn `{"patient.name.given": "Ana", "patient.active": true}` into nested dicts.
If two keys conflict, such as `"a": 1` and `"a.b": 2`, raise `ValueError`.

#### Hints

1. Split each key on the separator. All parts except the last are parent dicts, and the last part is the leaf.
2. Walk down with `node = node.setdefault(part, {})`.
3. A conflict means a parent turned out to be a non-dict value, or the leaf is already set.

#### Solution

For each key, walk or create the parent dicts, then set the leaf. Detecting conflicts is the part interviewers probe:
without it, later keys silently overwrite earlier ones.

```python
from typing import Any


def unflatten(flat: dict[str, Any], sep: str = ".") -> dict[str, Any]:
    root: dict[str, Any] = {}
    for path, value in flat.items():
        *parents, leaf = path.split(sep)
        node = root
        for part in parents:
            child = node.setdefault(part, {})
            if not isinstance(child, dict):
                raise ValueError(f"{path!r}: {part!r} already holds a value")
            node = child
        if leaf in node:
            raise ValueError(f"{path!r} conflicts with an existing key")
        node[leaf] = value
    return root


assert unflatten({"patient.name.given": "Ana", "patient.name.family": "Diaz", "patient.active": True}) == {
    "patient": {"name": {"given": "Ana", "family": "Diaz"}, "active": True}
}
assert unflatten({}) == {}

for bad in ({"a": 1, "a.b": 2}, {"a.b": 2, "a": 1}):
    try:
        unflatten(bad)
    except ValueError:
        pass
    else:
        raise AssertionError(f"expected a conflict for {bad}")
```

Complexity: O(total length of all keys).

#### Follow-ups

- **Rebuild lists from numeric segments?** After building the dicts, convert any dict whose keys are exactly `"0".."n-1"`
  into a list, recursively.
- **Round trip?** `unflatten(flatten(d)) == d` holds for nested dicts, empty dicts and lists included (flatten keeps
  empty containers as values). Say what breaks: non-empty lists come back as dicts keyed `"0"`, `"1"`…, and keys that
  contain the separator (or are empty strings) get split or merged.

### Batch an iterator into fixed-size chunks {easy}

Write `batched(iterable, n)` that yields tuples of up to n items, lazily, so it works on generators and infinite
streams. This is how you send records to an API that accepts at most n per request.

#### Hints

1. Get an iterator once with `iter()`; do not index into the input.
2. `itertools.islice(it, n)` takes the next n items from the same iterator.
3. Stop when a slice comes back empty. Reject `n < 1`.

#### Solution

The walrus operator keeps the loop to two lines. Python 3.12 added `itertools.batched`, which behaves the same way; the
test compares them. Say you would use the built-in in real code.

```python
import itertools
from collections.abc import Iterable, Iterator


def batched[T](iterable: Iterable[T], n: int) -> Iterator[tuple[T, ...]]:
    if n < 1:
        raise ValueError("n must be at least one")
    it = iter(iterable)
    while batch := tuple(itertools.islice(it, n)):
        yield batch


assert list(batched("abcdefg", 3)) == [("a", "b", "c"), ("d", "e", "f"), ("g",)]
assert list(batched([], 2)) == []
for size in range(1, 6):
    assert list(batched(range(11), size)) == list(itertools.batched(range(11), size))

# Lazy: works on an infinite generator.
first_two = list(itertools.islice(batched(itertools.count(), 4), 2))
assert first_two == [(0, 1, 2, 3), (4, 5, 6, 7)]

try:
    list(batched([1], 0))
    raise AssertionError("should raise")
except ValueError:
    pass
```

Complexity: O(n) total time; O(batch size) memory.

#### Follow-ups

- **Batch by size in bytes, not count?** Accumulate items until adding the next would exceed the limit, then yield.
- **Async iterators?** The same idea with `async for` and an `async def` generator.

### Merge overlapping appointments into busy blocks {medium core}

A doctor's booked appointments arrive unsorted as `("HH:MM", "HH:MM")` pairs, and some overlap. Return the merged busy
blocks in time order. Appointments that touch (one ends at 10:00 and the next starts at 10:00) join into one block. Then
list the free slots between 09:00 and 17:00.

#### Hints

1. Sort by start time. After that, only the last merged block can overlap the next appointment.
2. Zero-padded `"HH:MM"` strings sort and compare correctly as plain strings.
3. Free slots are the gaps between consecutive busy blocks, plus the edges of the working day.

#### Solution

Comparing every pair is O(n²). Sorting first makes it O(n log n): walk the sorted list, and either extend the last block
(when `start <= last_end`) or start a new one. Use `max` for the end, because one appointment can sit entirely inside another.

```python
def merge_busy(appointments: list[tuple[str, str]]) -> list[tuple[str, str]]:
    merged: list[list[str]] = []
    for start, end in sorted(appointments):
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(s, e) for s, e in merged]


def free_slots(busy: list[tuple[str, str]], day_start: str = "09:00", day_end: str = "17:00") -> list[tuple[str, str]]:
    slots, cursor = [], day_start
    for start, end in merge_busy(busy):
        if start > cursor:
            slots.append((cursor, min(start, day_end)))
        cursor = max(cursor, end)
    if cursor < day_end:
        slots.append((cursor, day_end))
    return [(s, e) for s, e in slots if s < e]


booked = [
    ("10:00", "10:30"), ("09:00", "09:45"), ("09:30", "10:00"),
    ("13:00", "13:15"), ("13:15", "13:45"),
    ("11:00", "12:00"), ("11:15", "11:30"),
    ("15:00", "15:30"),
]
assert merge_busy(booked) == [("09:00", "10:30"), ("11:00", "12:00"), ("13:00", "13:45"), ("15:00", "15:30")]
assert merge_busy([]) == []
assert free_slots(booked) == [("10:30", "11:00"), ("12:00", "13:00"), ("13:45", "15:00"), ("15:30", "17:00")]
assert free_slots([]) == [("09:00", "17:00")]
```

Complexity: O(n log n) for the sort, then O(n). The merged list uses O(n) memory.

#### Follow-ups

- **How many exam rooms are needed so nothing overlaps?** Sort by start time and keep a min-heap of end times. Pop
  every room that has freed up, then push the new end time. The largest heap size is the answer.
- **Total busy time?** Sum the lengths of the merged blocks. Summing the raw appointments would count overlaps twice.
- **Times across midnight or in different zones?** Use real `datetime` values in UTC instead of strings.

### LRU cache with OrderedDict {medium core}

Build a least-recently-used cache for eligibility responses: `get(key)` returns the value or `None`, and
`put(key, value)` stores it. When the cache is over capacity, evict the entry used longest ago. Both operations must be O(1).

#### Hints

1. You need two things in O(1): look up a key, and find the least recently used entry.
2. `OrderedDict` remembers order, and `move_to_end(key)` marks a key as most recent.
3. `popitem(last=False)` removes the oldest entry.

#### Solution

Keep the entries ordered from least to most recently used. A `get` hit moves the key to the end. A `put` inserts or moves
the key to the end, then evicts from the front if the cache is over capacity.

```python
from collections import OrderedDict
from collections.abc import Hashable
from typing import Any


class LRUCache:
    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._data: OrderedDict[Hashable, Any] = OrderedDict()

    def get(self, key: Hashable) -> Any | None:
        if key not in self._data:
            return None
        self._data.move_to_end(key)
        return self._data[key]

    def put(self, key: Hashable, value: Any) -> None:
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = value
        if len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def __len__(self) -> int:
        return len(self._data)


cache = LRUCache(2)
cache.put("M1", "eligible")
cache.put("M2", "ineligible")
assert cache.get("M1") == "eligible"   # M1 is now the most recent
cache.put("M3", "eligible")            # evicts M2, the least recent
assert cache.get("M2") is None
assert cache.get("M3") == "eligible"
cache.put("M1", "termed")              # update moves M1 to most recent
cache.put("M4", "eligible")            # evicts M3
assert cache.get("M3") is None and cache.get("M1") == "termed"
assert len(cache) == 2
```

Complexity: O(1) per operation and O(capacity) memory.

#### Follow-ups

- **Thread safety?** Wrap `get` and `put` in a `threading.Lock`. `move_to_end` followed by a read is not atomic as a pair.
- **Entries should expire after 5 minutes.** Store `(expires_at, value)` and treat expired entries as misses. The LRU
  cache with a time-to-live, further down, shows this.
- **Caching a pure function?** `functools.lru_cache(maxsize=1024)` does this for you.
- **Several app servers?** Use a shared cache such as Redis with `maxmemory-policy allkeys-lru`.

### LRU cache from scratch (no OrderedDict) {hard}

The interviewer says "no OrderedDict". Implement the same O(1) LRU cache with a dict and a doubly linked list.

#### Hints

1. The dict maps a key to its list node, so you can find any node in O(1).
2. A doubly linked list lets you unlink any node in O(1), given the node.
3. Sentinel head and tail nodes remove every "is the list empty?" special case.

#### Solution

The list order is the usage order: the node just after `head` is the least recent, and the node just before `tail` is the
most recent. Every access unlinks the node and re-adds it before `tail`. Eviction removes `head.next` and deletes its key
from the dict, which is why each node stores its key.

```python
from typing import Any


class _Node:
    __slots__ = ("key", "value", "prev", "next")

    def __init__(self, key: Any = None, value: Any = None) -> None:
        self.key, self.value = key, value
        self.prev: _Node = self
        self.next: _Node = self


class LRUCache:
    def __init__(self, capacity: int) -> None:
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self.map: dict[Any, _Node] = {}
        self.head, self.tail = _Node(), _Node()  # sentinels
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, node: _Node) -> None:
        node.prev.next, node.next.prev = node.next, node.prev

    def _append(self, node: _Node) -> None:  # insert just before tail = most recent
        node.prev, node.next = self.tail.prev, self.tail
        self.tail.prev.next = node
        self.tail.prev = node

    def get(self, key: Any) -> Any | None:
        node = self.map.get(key)
        if node is None:
            return None
        self._unlink(node)
        self._append(node)
        return node.value

    def put(self, key: Any, value: Any) -> None:
        if key in self.map:
            node = self.map[key]
            node.value = value
            self._unlink(node)
        else:
            node = _Node(key, value)
            self.map[key] = node
            if len(self.map) > self.capacity:
                lru = self.head.next
                self._unlink(lru)
                del self.map[lru.key]
        self._append(node)

    def keys_lru_to_mru(self) -> list[Any]:
        out, node = [], self.head.next
        while node is not self.tail:
            out.append(node.key)
            node = node.next
        return out


c = LRUCache(2)
c.put(1, "a"); c.put(2, "b")
assert c.get(1) == "a"
c.put(3, "c")                       # evicts 2
assert c.get(2) is None
assert c.keys_lru_to_mru() == [1, 3]
c.put(1, "A")                       # update, 1 becomes most recent
assert c.keys_lru_to_mru() == [3, 1] and c.get(1) == "A"
c.put(4, "d")                       # evicts 3
assert c.get(3) is None and c.keys_lru_to_mru() == [1, 4]
```

Complexity: O(1) per operation. Memory is O(capacity) nodes plus the dict.

#### Follow-ups

- **Why doubly linked?** To unlink a node you need its predecessor. A singly linked list would need an O(n) search for it.
- **LFU instead of LRU?** Keep a map from frequency to an ordered set of keys, plus the current minimum frequency. Every
  operation is still O(1).

### LRU cache with a time-to-live {medium}

Build a cache with a maximum number of entries and a TTL. `get` returns a default for missing or expired keys, and
counts as a use. When full, `put` evicts the least recently used entry.

#### Hints

1. `OrderedDict` keeps order: `move_to_end(key)` on every use, `popitem(last=False)` to evict the oldest.
2. Store the expiry time with the value, and check it on `get` (lazy expiry).
3. Edge cases: capacity 0, overwriting an existing key, a key that expires exactly now.

#### Solution

Each entry stores `(expires_at, value)`. `get` deletes an expired entry when it finds one, so expired entries never
come back. `purge()` sweeps every expired entry for callers that want memory back sooner.

```python
import time
from collections import OrderedDict
from collections.abc import Callable, Hashable


class TTLCache[K: Hashable, V]:
    def __init__(self, capacity: int, ttl: float, clock: Callable[[], float] = time.monotonic) -> None:
        if capacity < 0 or ttl <= 0:
            raise ValueError("capacity must be >= 0 and ttl > 0")
        self.capacity = capacity
        self.ttl = ttl
        self.clock = clock
        self._data: OrderedDict[K, tuple[float, V]] = OrderedDict()

    def get(self, key: K, default: V | None = None) -> V | None:
        entry = self._data.get(key)
        if entry is None:
            return default
        expires_at, value = entry
        if self.clock() >= expires_at:
            del self._data[key]
            return default
        self._data.move_to_end(key)
        return value

    def put(self, key: K, value: V) -> None:
        if self.capacity == 0:
            return
        if key in self._data:
            self._data.move_to_end(key)
        self._data[key] = (self.clock() + self.ttl, value)
        while len(self._data) > self.capacity:
            self._data.popitem(last=False)

    def purge(self) -> int:
        now = self.clock()
        expired = [k for k, (expires_at, _) in self._data.items() if now >= expires_at]
        for k in expired:
            del self._data[k]
        return len(expired)

    def __len__(self) -> int:
        return len(self._data)


class FakeClock:
    now = 0.0

    def __call__(self) -> float:
        return self.now


clock = FakeClock()
cache: TTLCache[str, int] = TTLCache(capacity=2, ttl=10, clock=clock)
cache.put("a", 1)
cache.put("b", 2)
assert cache.get("a") == 1          # "a" is now most recent
cache.put("c", 3)                   # evicts "b", the least recently used
assert cache.get("b") is None and cache.get("a") == 1 and cache.get("c") == 3

clock.now = 5.0
cache.put("a", 10)                  # overwrite refreshes the value and the expiry (now 15.0)
clock.now = 9.9
assert cache.get("a") == 10 and cache.get("c") == 3
clock.now = 10.0
assert cache.get("c", -1) == -1     # "c" was written at 0.0, so it expires exactly at 10.0
assert cache.get("a") == 10         # still alive until 15.0
clock.now = 20.0
assert len(cache) == 1 and cache.purge() == 1 and len(cache) == 0

zero: TTLCache[str, int] = TTLCache(capacity=0, ttl=1, clock=clock)
zero.put("x", 1)
assert zero.get("x") is None and len(zero) == 0
```

Complexity: O(1) average for `get` and `put`; `purge` is O(n).

#### Follow-ups

- **Evict expired entries before live ones when full?** Keep a second structure ordered by expiry (a heap with lazy
  deletion), and pop expired entries first.
- **A different TTL per key, and keys that never expire?** Pass the TTL to `put` and store `(expires_at, value)` per
  key, with `expires_at=None` for keys that never expire. Use a private sentinel (`_MISSING = object()`) for "not found", so a stored `None` is
  not mistaken for a miss. Redis combines lazy expiry on access with a background sweep that samples keys.
- **Thread-safe?** Guard every method with a `threading.Lock`; in asyncio a single event loop needs no lock if no
  method awaits.

### Reminder scheduler with a heap {medium}

Build a scheduler for appointment reminders. `add(at, message)` returns an id, `cancel(id)` cancels a reminder, and
`pop_due(now)` returns every non-cancelled message due at or before `now`, in time order. Reminders due at the same time
come out in the order they were added.

#### Hints

1. A min-heap gives the earliest reminder in O(log n).
2. Push `(at, sequence, message)`. The sequence number breaks ties in insertion order, and means Python never has to compare messages.
3. Removing from the middle of a heap is slow, so cancel lazily: remember cancelled ids and skip them when they are popped.

#### Solution

`heapq` keeps the smallest tuple at index 0. `pop_due` pops while the top is due. A cancelled id stays in the heap
until it reaches the top, where it is skipped: this is "lazy deletion", the standard way to cancel heap items.

```python
import heapq
import itertools


class ReminderScheduler:
    def __init__(self) -> None:
        self._heap: list[tuple[float, int, str]] = []
        self._ids = itertools.count()
        self._cancelled: set[int] = set()

    def add(self, at: float, message: str) -> int:
        rid = next(self._ids)
        heapq.heappush(self._heap, (at, rid, message))
        return rid

    def cancel(self, rid: int) -> None:
        self._cancelled.add(rid)

    def pop_due(self, now: float) -> list[str]:
        due: list[str] = []
        while self._heap and self._heap[0][0] <= now:
            _, rid, message = heapq.heappop(self._heap)
            if rid in self._cancelled:
                self._cancelled.discard(rid)
                continue
            due.append(message)
        return due


s = ReminderScheduler()
s.add(30, "Ana: fasting labs tomorrow")
flu = s.add(10, "Raj: flu shot")
s.add(10, "Lee: bring insurance card")
s.add(20, "Kim: telehealth link")
s.cancel(flu)
assert s.pop_due(5) == []
assert s.pop_due(20) == ["Lee: bring insurance card", "Kim: telehealth link"]
assert s.pop_due(100) == ["Ana: fasting labs tomorrow"]
assert s.pop_due(1000) == []
```

Complexity: `add` is O(log n), `cancel` is O(1), and each popped reminder costs O(log n).

#### Follow-ups

- **Why not a sorted list?** Inserting into a sorted list is O(n). A heap is O(log n) per insert and pop.
- **Survives restarts and runs on many workers?** Store reminders in a database table indexed on `send_at`, and poll
  with `SELECT ... FOR UPDATE SKIP LOCKED`. Or use a delayed queue such as SQS delay, Cloud Tasks or Celery ETA.

### In-memory pub/sub with topic wildcards {medium}

Build a small event bus. `subscribe(pattern, handler)` returns an unsubscribe function. Topics are dot-separated
(`runs.42.status`). In patterns, `*` matches exactly one segment and `#` matches zero or more. `publish` delivers to
every matching handler; one handler failing must not stop the others.

#### Hints

1. Split topics and patterns on `.` and match segment by segment.
2. `#` is the only tricky case: try letting it swallow 0, 1, 2… segments.
3. Iterate over a copy of the subscriptions, so a handler can unsubscribe while you publish.

#### Solution

A recursive matcher over positions, memoised per call (several `#` segments would otherwise be exponential). The memo
lives inside the call on purpose: a module-level `@cache` keyed by topic would grow forever in a service whose topics
contain run ids. Subscriptions are stored by id, so unsubscribing is O(1) and safe to call twice. Errors are collected
and returned instead of raised.

```python
from collections.abc import Callable
from functools import cache

Handler = Callable[[str, object], None]


def matches(pattern: tuple[str, ...], topic: tuple[str, ...]) -> bool:
    @cache
    def match(p: int, t: int) -> bool:
        if p == len(pattern):
            return t == len(topic)
        if pattern[p] == "#":
            return any(match(p + 1, i) for i in range(t, len(topic) + 1))
        return t < len(topic) and pattern[p] in ("*", topic[t]) and match(p + 1, t + 1)

    return match(0, 0)


class PubSub:
    def __init__(self) -> None:
        self._subs: dict[int, tuple[tuple[str, ...], Handler]] = {}
        self._next_id = 0

    def subscribe(self, pattern: str, handler: Handler) -> Callable[[], None]:
        sub_id = self._next_id
        self._next_id += 1
        self._subs[sub_id] = (tuple(pattern.split(".")), handler)

        def unsubscribe() -> None:
            self._subs.pop(sub_id, None)

        return unsubscribe

    def publish(self, topic: str, message: object) -> tuple[int, list[Exception]]:
        parts = tuple(topic.split("."))
        delivered, errors = 0, []
        for pattern, handler in list(self._subs.values()):
            if matches(pattern, parts):
                try:
                    handler(topic, message)
                    delivered += 1
                except Exception as exc:
                    errors.append(exc)
        return delivered, errors


assert matches(("runs", "*", "status"), ("runs", "42", "status"))
assert not matches(("runs", "*", "status"), ("runs", "42", "steps", "status"))
assert all(matches(("runs", "#"), tuple(t.split("."))) for t in ["runs", "runs.1", "runs.1.steps.2"])
assert matches(("#", "status"), ("runs", "1", "status")) and matches(("#",), ())
assert matches(("#", "#", "x", "#"), ("a",) * 30 + ("x",)) and not matches(("#", "#", "x", "#"), ("a",) * 30)

bus = PubSub()
seen: list[tuple[str, object]] = []
stop_status = bus.subscribe("runs.*.status", lambda t, m: seen.append((t, m)))
bus.subscribe("runs.#", lambda t, m: None)


def broken(topic: str, message: object) -> None:
    raise RuntimeError("handler bug")


bus.subscribe("runs.42.#", broken)

delivered, errors = bus.publish("runs.42.status", "running")
assert delivered == 2 and [str(e) for e in errors] == ["handler bug"]
assert seen == [("runs.42.status", "running")]

stop_status()
stop_status()  # safe to call twice
assert bus.publish("runs.7.status", "done") == (1, [])
assert seen == [("runs.42.status", "running")]
```

Complexity: matching visits at most P × T memoised states for a pattern of P segments and a topic of T (a `#` state
tries up to T splits); publish is O(subscriptions × match cost).

#### Follow-ups

- **Thousands of patterns?** Index subscriptions in a trie of segments, with `*` and `#` children, instead of testing
  every pattern.
- **Across processes?** Use Redis pub/sub or Pub/Sub topics; in-memory only works within one instance.

### Token-bucket rate limiter {medium core}

Write a rate limiter that allows bursts up to `capacity` requests and refills at `rate` tokens per second. `allow()`
returns whether a request may go now, and `retry_after()` says how long until it could.

#### Hints

1. You do not need a background timer. Refill lazily: when a request arrives, add `elapsed × rate` tokens, capped at
   the capacity.
2. Use a monotonic clock, injected so the test can control time.
3. For `retry_after`, ask how many tokens are missing and how fast they arrive. What if the cost is larger than the
   capacity?

#### Solution

Store the token count and the time it was last updated. Each call refills, then spends if it can. Floats are fine
because the refill is proportional to elapsed time.

```python
import math
import time
from collections.abc import Callable


class TokenBucket:
    def __init__(self, rate: float, capacity: float, clock: Callable[[], float] = time.monotonic) -> None:
        if rate <= 0 or capacity <= 0:
            raise ValueError("rate and capacity must be positive")
        self.rate = rate
        self.capacity = capacity
        self.clock = clock
        self.tokens = capacity
        self.updated = clock()

    def _refill(self) -> None:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.updated) * self.rate)
        self.updated = now

    def allow(self, cost: float = 1.0) -> bool:
        self._refill()
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False

    def retry_after(self, cost: float = 1.0) -> float:
        if cost > self.capacity:
            return math.inf  # waiting will never help: the bucket cannot hold that many tokens
        self._refill()
        return max(0.0, (cost - self.tokens) / self.rate)


class FakeClock:
    def __init__(self) -> None:
        self.now = 0.0

    def __call__(self) -> float:
        return self.now


clock = FakeClock()
bucket = TokenBucket(rate=1.0, capacity=3, clock=clock)
assert [bucket.allow() for _ in range(4)] == [True, True, True, False]  # burst of 3
assert bucket.retry_after() == 1.0
clock.now += 0.5
assert bucket.allow() is False  # only half a token
clock.now += 0.5
assert bucket.allow() is True
clock.now += 100
assert bucket.tokens <= 3 and [bucket.allow() for _ in range(4)] == [True, True, True, False]  # capped
assert bucket.allow(cost=5) is False  # more than the bucket can ever hold
assert bucket.retry_after(cost=5) == math.inf

try:
    TokenBucket(rate=0, capacity=1)
    raise AssertionError("should raise")
except ValueError:
    pass
```

Complexity: O(1) time and space per call.

#### Follow-ups

- **Per client?** A dict from client id to bucket, with idle buckets evicted (a TTL cache works).
- **Across many server instances?** Keep the bucket in Redis and update it atomically with a Lua script, or use a
  gateway's built-in limiter (API Gateway, Apigee, Azure API Management).
- **What does the client see?** HTTP 429 Too Many Requests with a `Retry-After` header, whose value is `retry_after()`
  rounded up to whole seconds.
- **Threads?** Guard `allow` with a lock, because the read-modify-write on `tokens` is a race.

### Sliding-window rate limiter per client {medium}

Allow at most `limit` requests per client in any rolling `window` of seconds. For example, 2 requests per 10 seconds:
requests at t = 0 and t = 1 pass, t = 2 is rejected, and t = 10 passes again because the request at t = 0 has left the window.

#### Hints

1. To decide on a request, you only need the client's own requests from the last `window` seconds.
2. Keep each client's timestamps in a `deque`, and pop from the left while the oldest is at or before `now - window`.
3. If fewer than `limit` remain, record `now` and allow the request.

#### Solution

This is the "sliding log" algorithm: it's exact, and it costs memory proportional to the limit. Old timestamps leave from
the left and new ones arrive on the right, which is exactly what a deque does in O(1).

```python
import time
from collections import defaultdict, deque
from collections.abc import Callable


class SlidingWindowLimiter:
    def __init__(self, limit: int, window: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit, self.window, self.clock = limit, window, clock
        self.hits: defaultdict[str, deque[float]] = defaultdict(deque)

    def allow(self, client: str) -> bool:
        now = self.clock()
        q = self.hits[client]
        while q and q[0] <= now - self.window:
            q.popleft()
        if len(q) < self.limit:
            q.append(now)
            return True
        return False


t = 0.0
limiter = SlidingWindowLimiter(limit=2, window=10, clock=lambda: t)
results = []
for t, client in [(0, "a"), (1, "a"), (2, "a"), (2, "b"), (10, "a"), (10.5, "a"), (11, "a")]:
    results.append(limiter.allow(client))
assert results == [True, True, False, True, True, False, True]
```

Complexity: O(1) amortised per call, because each timestamp is pushed and popped once. Memory is O(limit) per client.

| Algorithm | Accuracy | Memory per client | Bursts |
|---|---|---|---|
| Fixed window counter | Allows 2× the limit at a window boundary | O(1) | Spiky at edges |
| Sliding log (this one) | Exact | O(limit) | Smooth |
| Sliding window counter | Close approximation (weights the previous window) | O(1) | Smooth |
| Token bucket | Exact for its model | O(1) | Allows bursts up to capacity |

#### Follow-ups

- **Memory with millions of clients?** Evict idle clients, for example when their deque is empty, or switch to a
  sliding-window counter that stores two integers.
- **Distributed?** Use a Redis sorted set per client: `ZREMRANGEBYSCORE` to drop old entries, then `ZCARD` and `ZADD`,
  all in one transaction.

### Retry decorator for sync and async functions {medium core}

Write `@retry(attempts=..., base_delay=..., retry_on=(...))` that retries a function on the listed exceptions with
exponential backoff and jitter. It must work on both `def` and `async def` functions, re-raise the last error when
attempts run out, and not retry other exceptions.

#### Hints

1. A decorator with arguments is a function that returns a decorator.
2. `inspect.iscoroutinefunction(fn)` tells you which wrapper to return: an async one must `await` and use
   `asyncio.sleep`, never `time.sleep`.
3. Full jitter: sleep a random amount between 0 and `min(max_delay, base_delay * 2 ** (attempt - 1))`. Inject the sleep
   and random functions so the test can record delays.

#### Solution

Two wrappers sharing one delay rule. Jitter spreads retries from many clients over time, so they do not all hit a
recovering service at the same instant. `functools.wraps` keeps the function's name and signature.

```python
import asyncio
import functools
import inspect
import random
import time
from collections.abc import Awaitable, Callable


def retry(
    *,
    attempts: int = 3,
    base_delay: float = 0.1,
    max_delay: float = 5.0,
    retry_on: tuple[type[BaseException], ...] = (Exception,),
    sleep: Callable[[float], None] = time.sleep,
    async_sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    rand: Callable[[], float] = random.random,
):
    if attempts < 1:
        raise ValueError("attempts must be at least 1")

    def delay(attempt: int) -> float:
        return rand() * min(max_delay, base_delay * 2 ** (attempt - 1))

    def decorate(fn):
        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(*args, **kwargs):
                for attempt in range(1, attempts + 1):
                    try:
                        return await fn(*args, **kwargs)
                    except retry_on:
                        if attempt == attempts:
                            raise
                        await async_sleep(delay(attempt))

            return async_wrapper

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            for attempt in range(1, attempts + 1):
                try:
                    return fn(*args, **kwargs)
                except retry_on:
                    if attempt == attempts:
                        raise
                    sleep(delay(attempt))

        return wrapper

    return decorate


# Sync: fails twice, then succeeds. rand=1.0 makes the delays the upper bounds.
delays: list[float] = []
calls = {"n": 0}


@retry(attempts=4, base_delay=0.1, retry_on=(ConnectionError,), sleep=delays.append, rand=lambda: 1.0)
def fetch_status() -> str:
    """Fetch the run status."""
    calls["n"] += 1
    if calls["n"] < 3:
        raise ConnectionError("reset")
    return "ok"


assert fetch_status() == "ok"
assert calls["n"] == 3 and delays == [0.1, 0.2]
assert fetch_status.__name__ == "fetch_status" and fetch_status.__doc__ == "Fetch the run status."


@retry(attempts=3, retry_on=(ConnectionError,), sleep=lambda s: None)
def bad_request() -> None:
    raise ValueError("400: not retryable")


try:
    bad_request()
    raise AssertionError("should raise")
except ValueError:
    pass


@retry(attempts=2, sleep=lambda s: None)
def always_down() -> None:
    raise ConnectionError("down")


try:
    always_down()
    raise AssertionError("should raise")
except ConnectionError as exc:
    assert str(exc) == "down"  # the last error is re-raised


# Async: same behaviour with an awaited sleep.
async_delays: list[float] = []


async def record(seconds: float) -> None:
    async_delays.append(seconds)


attempts_seen = {"n": 0}


@retry(attempts=3, base_delay=0.5, async_sleep=record, rand=lambda: 0.5)
async def call_model() -> str:
    attempts_seen["n"] += 1
    if attempts_seen["n"] == 1:
        raise TimeoutError
    return "tokens"


assert asyncio.run(call_model()) == "tokens"
assert async_delays == [0.25]
assert inspect.iscoroutinefunction(call_model)
```

Complexity: O(attempts) calls; the backoff caps total waiting time.

#### Follow-ups

- **Why jitter?** If 1,000 clients fail together and all retry after exactly 1 s, they hit the recovering server
  together (a thundering herd). Random full jitter spreads them out.
- **On a whiteboard?** Drop the typing and the injected `async_sleep` and `rand`, and write the sync version first:
  the three layers (factory, decorator, wrapper), the re-raise on the last attempt and the injected `sleep` are what
  the interviewer looks for.
- **In production?** The `tenacity` library does this, with stop and wait strategies and logging hooks.
- **Honour `Retry-After` from a 429?** Let the exception carry the server's delay, and sleep `max(server_delay, delay)`.
- **Is retrying a POST safe?** Only if the operation is idempotent, for example with an idempotency key the server
  deduplicates on.

### Bounded producer and consumers with asyncio {medium core}

Process a list of jobs with a fixed number of async workers and a bounded queue, so the producer slows down when the
workers fall behind. One failing job must not stop the others. Return the results, the errors and the largest queue
size seen.

#### Hints

1. `asyncio.Queue(maxsize=n)` makes `await queue.put(x)` wait while the queue is full. That is your backpressure.
2. Start one producer and N workers. How does each worker know there is no more work?
3. Put one unique stop marker per worker on the queue after the real jobs. Catch exceptions per job inside the worker.

#### Solution

The producer awaits `put`, so it can never run more than `maxsize` jobs ahead. Each worker loops until it takes the
stop marker. A plain `object()` is used as the marker so that any real value, including `None`, can be a job. The
`TaskGroup` waits for everything and would cancel the rest if a worker itself crashed.

```python
import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

_STOP = object()


@dataclass
class Outcome:
    results: dict[int, int] = field(default_factory=dict)
    errors: dict[int, str] = field(default_factory=dict)
    peak_queue: int = 0


async def process_all(jobs: list[int], handler: Callable[[int], Awaitable[int]], workers: int = 3, maxsize: int = 2) -> Outcome:
    queue: asyncio.Queue[object] = asyncio.Queue(maxsize=maxsize)
    outcome = Outcome()

    async def producer() -> None:
        for job in jobs:
            await queue.put(job)  # waits while the queue is full
            outcome.peak_queue = max(outcome.peak_queue, queue.qsize())
        for _ in range(workers):
            await queue.put(_STOP)

    async def worker() -> None:
        while (job := await queue.get()) is not _STOP:
            assert isinstance(job, int)
            try:
                outcome.results[job] = await handler(job)
            except Exception as exc:
                outcome.errors[job] = repr(exc)

    async with asyncio.TaskGroup() as tg:
        tg.create_task(producer())
        for _ in range(workers):
            tg.create_task(worker())
    return outcome


async def double(job: int) -> int:
    await asyncio.sleep(0.001 * (job % 3))
    if job == 3:
        raise TimeoutError("tool call timed out")
    return job * 2


out = asyncio.run(process_all(list(range(10)), double, workers=3, maxsize=2))
assert out.results == {i: i * 2 for i in range(10) if i != 3}
assert out.errors == {3: "TimeoutError('tool call timed out')"}
assert out.peak_queue <= 2

empty = asyncio.run(process_all([], double))
assert empty.results == {} and empty.errors == {}
```

Complexity: O(n) work; memory is bounded by `maxsize` plus one job per worker.

#### Follow-ups

- **Another way to stop the workers?** `await queue.join()` (needs `task_done()` after each job), then cancel the
  worker tasks.
- **Retries for failed jobs?** Re-queue with an attempt count, and send jobs over the limit to a dead-letter list.

### Run coroutines with a concurrency limit {medium core}

Given a list of async job factories (functions that return an awaitable), run them with at most `limit` in flight and
return the results in input order. Then write a strict version that cancels the remaining jobs as soon as one fails.

#### Hints

1. `asyncio.Semaphore(limit)` around each job caps how many run at once.
2. `asyncio.gather` keeps input order in its result list.
3. For the strict version, create the tasks inside an `asyncio.TaskGroup`: a failure cancels the siblings, including
   those still waiting for the semaphore.

#### Solution

Factories rather than coroutine objects: nothing is created until there is a slot, and a factory can be called again
for a retry. The test measures the peak number of jobs running at once.

```python
import asyncio
import random
from collections.abc import Awaitable, Callable


async def gather_limited[T](factories: list[Callable[[], Awaitable[T]]], limit: int) -> list[T]:
    if limit < 1:
        raise ValueError("limit must be at least 1")
    semaphore = asyncio.Semaphore(limit)

    async def run(factory: Callable[[], Awaitable[T]]) -> T:
        async with semaphore:
            return await factory()

    return await asyncio.gather(*(run(f) for f in factories))


async def gather_limited_strict[T](factories: list[Callable[[], Awaitable[T]]], limit: int) -> list[T]:
    semaphore = asyncio.Semaphore(limit)

    async def run(factory: Callable[[], Awaitable[T]]) -> T:
        async with semaphore:
            return await factory()

    async with asyncio.TaskGroup() as tg:
        tasks = [tg.create_task(run(f)) for f in factories]
    return [t.result() for t in tasks]


active = peak = 0


def make_job(i: int) -> Callable[[], Awaitable[int]]:
    async def job() -> int:
        global active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(random.uniform(0, 0.005))
        active -= 1
        return i

    return job


assert asyncio.run(gather_limited([make_job(i) for i in range(12)], limit=3)) == list(range(12))
assert peak == 3
assert asyncio.run(gather_limited([], limit=2)) == []

started: list[int] = []


def flaky(i: int) -> Callable[[], Awaitable[int]]:
    async def job() -> int:
        started.append(i)
        await asyncio.sleep(0.005)
        if i == 1:
            raise RuntimeError("tool failed")
        return i

    return job


try:
    asyncio.run(gather_limited_strict([flaky(i) for i in range(10)], limit=2))
    raise AssertionError("should raise")
except* RuntimeError as group:
    assert [str(e) for e in group.exceptions] == ["tool failed"]
assert len(started) < 10  # the rest were cancelled before they started
```

Complexity: O(n) tasks; at most `limit` run at once.

#### Follow-ups

- **Millions of jobs?** Do not create a task per job up front. Use N worker tasks pulling from a bounded queue (the
  producer-and-consumers problem above).
- **Per-host limits?** A dict of semaphores keyed by host.

### First successful response from hedged calls {hard}

To cut tail latency, a service can send the same request to several providers (or replicas) at once and use the first
successful answer. Write `first_success(factories, timeout)`: return the first result that does not raise, cancel the
others, raise an `ExceptionGroup` if all fail, and raise `TimeoutError` if nothing succeeds in time.

#### Hints

1. Start every call as a task, then loop on `asyncio.wait(pending, return_when=FIRST_COMPLETED)`.
2. A finished task either has a result (return it) or an exception (record it and keep waiting).
3. Cancel and await the leftover tasks in a `finally` block, so nothing keeps running after you return or time out.

#### Solution

`asyncio.timeout` bounds the whole wait. The `finally` block runs on success, on failure and on timeout, cancels every
task that is still running, and awaits them so their cancellation is complete before the function returns.

```python
import asyncio
from collections.abc import Awaitable, Callable


async def first_success[T](factories: list[Callable[[], Awaitable[T]]], timeout: float) -> T:
    if not factories:
        raise ValueError("need at least one call")
    tasks = [asyncio.ensure_future(f()) for f in factories]
    errors: list[Exception] = []
    try:
        async with asyncio.timeout(timeout):
            pending = set(tasks)
            while pending:
                done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    error = task.exception()
                    if error is None:
                        return task.result()
                    errors.append(error)  # type: ignore[arg-type]
        raise ExceptionGroup("every call failed", errors)
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)


cancelled: list[str] = []


def provider(name: str, delay: float, fail: bool = False) -> Callable[[], Awaitable[str]]:
    async def call() -> str:
        try:
            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            cancelled.append(name)
            raise
        if fail:
            raise ConnectionError(f"{name} unavailable")
        return name

    return call


# The fast provider fails, the medium one wins, the slow one is cancelled.
winner = asyncio.run(first_success([provider("slow", 0.5), provider("fast", 0.01, fail=True), provider("medium", 0.03)], timeout=1))
assert winner == "medium" and cancelled == ["slow"]

try:
    asyncio.run(first_success([provider("a", 0.01, fail=True), provider("b", 0.02, fail=True)], timeout=1))
    raise AssertionError("should raise")
except* ConnectionError as group:
    assert sorted(str(e) for e in group.exceptions) == ["a unavailable", "b unavailable"]

cancelled.clear()
try:
    asyncio.run(first_success([provider("x", 1.0), provider("y", 1.0)], timeout=0.05))
    raise AssertionError("should raise")
except TimeoutError:
    assert sorted(cancelled) == ["x", "y"]  # nothing left running
```

Complexity: O(k) tasks; the wait ends at the first success, the last failure, or the timeout.

#### Follow-ups

- **Hedge only after a delay?** Start the first call, wait for it with a short timeout (say the p95 latency), and only
  then start the backup. This keeps extra load low.
- **Is hedging safe for every call?** Only for idempotent, read-like operations. Never hedge "create a purchase order"
  without an idempotency key.

### Agent-run state machine {medium}

Model an agent run with states `queued`, `running`, `waiting_approval`, `succeeded`, `failed` and `cancelled`. Events
move it between states; anything not allowed must raise. A failed run may be retried, but only up to a limit. Keep a
history of transitions.

#### Hints

1. A transition table `{(state, event): next_state}` is clearer and easier to test than nested `if` statements.
2. Terminal states have no outgoing transitions, apart from `retry` on `failed`.
3. Put the retry limit in a guard that runs before the transition is applied.

#### Solution

The table is the single source of truth, so the allowed moves are easy to review. `send` checks the table, applies the
guard, records history, and returns the new state. Invalid events raise a specific exception that the API layer can
turn into a 409 Conflict.

```python
from dataclasses import dataclass, field
from enum import StrEnum


class State(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    SUCCEEDED = "succeeded"
    FAILED = "failed"
    CANCELLED = "cancelled"


TRANSITIONS: dict[tuple[State, str], State] = {
    (State.QUEUED, "start"): State.RUNNING,
    (State.QUEUED, "cancel"): State.CANCELLED,
    (State.RUNNING, "need_approval"): State.WAITING_APPROVAL,
    (State.RUNNING, "finish"): State.SUCCEEDED,
    (State.RUNNING, "fail"): State.FAILED,
    (State.RUNNING, "cancel"): State.CANCELLED,
    (State.WAITING_APPROVAL, "approve"): State.RUNNING,
    (State.WAITING_APPROVAL, "reject"): State.CANCELLED,
    (State.WAITING_APPROVAL, "cancel"): State.CANCELLED,
    (State.FAILED, "retry"): State.QUEUED,
}


class InvalidTransition(Exception):
    pass


@dataclass
class AgentRun:
    max_attempts: int = 3
    state: State = State.QUEUED
    attempts: int = 1
    history: list[tuple[State, str, State]] = field(default_factory=list)

    def send(self, event: str) -> State:
        target = TRANSITIONS.get((self.state, event))
        if target is None:
            raise InvalidTransition(f"cannot {event!r} a run that is {self.state}")
        if event == "retry":
            if self.attempts >= self.max_attempts:
                raise InvalidTransition(f"no attempts left ({self.attempts}/{self.max_attempts})")
            self.attempts += 1
        self.history.append((self.state, event, target))
        self.state = target
        return target


run = AgentRun()
for event in ["start", "need_approval", "approve", "finish"]:
    run.send(event)
assert run.state is State.SUCCEEDED
assert run.history[1] == (State.RUNNING, "need_approval", State.WAITING_APPROVAL)

try:
    run.send("start")  # terminal
    raise AssertionError("should raise")
except InvalidTransition as exc:
    assert "succeeded" in str(exc)

flaky = AgentRun(max_attempts=2)
flaky.send("start")
flaky.send("fail")
flaky.send("retry")
flaky.send("start")
flaky.send("fail")
try:
    flaky.send("retry")  # second retry would be attempt 3 of 2
    raise AssertionError("should raise")
except InvalidTransition:
    assert flaky.state is State.FAILED and flaky.attempts == 2

rejected = AgentRun()
rejected.send("start")
rejected.send("need_approval")
assert rejected.send("reject") is State.CANCELLED
```

Complexity: O(1) per event.

#### Follow-ups

- **Two workers send events at the same time?** Persist the state with optimistic concurrency: `UPDATE runs SET
  state = :next, version = version + 1 WHERE id = :id AND state = :current AND version = :version`, and treat zero rows
  updated as a conflict.
- **Side effects such as notifying the approver?** Emit an event after the state change is committed (an outbox
  table), not inside `send`.

### Parse a Server-Sent Events stream from chunks {medium}

Write an incremental parser for a `text/event-stream` body. Network chunks can split anywhere, even between `\r` and
`\n`. Support `data` (multiple lines joined with `\n`), `event` (default `"message"`), `id` (remembered for later events),
`retry`, and comments starting with `:`. An event is dispatched at a blank line, and only if it has data.

#### Hints

1. Keep a buffer. Only process complete lines; keep the incomplete tail for the next chunk.
2. Lines can end with `\r\n`, `\n` or `\r`. A `\r` at the very end of a chunk is ambiguous: treat the line as ended, and
   skip a `\n` if it starts the next chunk.
3. Split each line at the first colon, and remove one leading space from the value. Test by feeding the same stream
   split at every position.

#### Solution

The parser follows the WHATWG rules for event streams: field names `data`, `event`, `id` and `retry`; one optional
space after the colon; a line without a colon is a field with an empty value; an `id` containing NUL is ignored; an
event with no data lines is dropped, but its `event` type is still reset. One subtle rule matters for reconnecting:
an `id:` line only fills a buffer, and the **last event ID used for `Last-Event-ID` is committed at the blank line**,
even when the event has no data. If the connection drops in the middle of event 5, the client must resume after
event 4, not 5. The test proves chunk boundaries do not matter by splitting the stream at every possible index
(including empty chunks) and feeding it one character at a time.

```python
import re
from dataclasses import dataclass

LINE_END = re.compile(r"\r\n|\r|\n")


@dataclass(frozen=True)
class Event:
    data: str
    event: str = "message"
    id: str | None = None


class SSEParser:
    def __init__(self) -> None:
        self.buffer = ""
        self.at_start = True
        self.skip_lf = False
        self.data: list[str] = []
        self.event_type = ""
        self.id_buffer: str | None = None
        self.last_event_id: str | None = None  # committed at each blank line; send it as Last-Event-ID
        self.retry: int | None = None

    def feed(self, chunk: str) -> list[Event]:
        if not chunk:
            return []  # an empty read must not clear the pending "\r" state
        if self.at_start:
            chunk = chunk.removeprefix("\ufeff")  # one leading byte-order mark is ignored
            self.at_start = False
        if self.skip_lf and chunk.startswith("\n"):
            chunk = chunk[1:]
        self.skip_lf = False
        self.buffer += chunk
        events: list[Event] = []
        while match := LINE_END.search(self.buffer):
            if match.group() == "\r" and match.end() == len(self.buffer):
                self.skip_lf = True  # a "\n" may arrive at the start of the next chunk
            line = self.buffer[: match.start()]
            self.buffer = self.buffer[match.end():]
            event = self._line(line)
            if event:
                events.append(event)
        return events

    def _line(self, line: str) -> Event | None:
        if line == "":
            self.last_event_id = self.id_buffer  # set before the empty-data check, as the spec says
            data, event_type = self.data, self.event_type
            self.data, self.event_type = [], ""
            if not data:
                return None
            return Event("\n".join(data), event_type or "message", self.id_buffer)
        if line.startswith(":"):
            return None  # comment, often a keep-alive
        name, _, value = line.partition(":")
        if value.startswith(" "):
            value = value[1:]
        if name == "data":
            self.data.append(value)
        elif name == "event":
            self.event_type = value
        elif name == "id" and "\0" not in value:
            self.id_buffer = value
        elif name == "retry" and value.isascii() and value.isdigit():
            self.retry = int(value)
        return None


STREAM = (
    ": keep-alive\n"
    "retry: 3000\n"
    "id: 1\nevent: token\ndata: Hel\n\n"
    "id: 2\nevent: token\ndata: lo\n\n"
    "data: line one\ndata: line two\n\n"
    "data\n\n"
    "event: done\n\n"
    'data: {"ok": true}\n\n'
    "data:no space\n\n"
    "data:  two spaces\n\n"
    "id: bad\0id\ndata: x\n\n"
    "data: never finished\n"
)
EXPECTED = [
    Event("Hel", "token", "1"),
    Event("lo", "token", "2"),
    Event("line one\nline two", "message", "2"),
    Event("", "message", "2"),
    Event('{"ok": true}', "message", "2"),  # the data-less "done" block reset the type
    Event("no space", "message", "2"),
    Event(" two spaces", "message", "2"),
    Event("x", "message", "2"),  # an id containing NUL is ignored
]


def parse_in_pieces(text: str, cuts: list[int]) -> tuple[list[Event], SSEParser]:
    parser = SSEParser()
    events: list[Event] = []
    for start, end in zip([0, *cuts], [*cuts, len(text)]):
        events += parser.feed(text[start:end])
    return events, parser


events, parser = parse_in_pieces(STREAM, [])
assert events == EXPECTED and parser.retry == 3000
for newline in ["\r\n", "\r"]:
    variant = STREAM.replace("\n", newline)
    for cut in range(len(variant) + 1):
        assert parse_in_pieces(variant, [cut])[0] == EXPECTED, (repr(newline), cut)
        assert parse_in_pieces(variant, [cut, cut])[0] == EXPECTED  # an empty chunk at the cut
    assert parse_in_pieces(variant, list(range(1, len(variant))))[0] == EXPECTED  # one char at a time

# Resume point: an unfinished event must not move it; a data-less event with an id does.
p = SSEParser()
assert p.feed("id: 1\ndata: a\n\nid: 2\ndata: b") == [Event("a", "message", "1")]
assert p.last_event_id == "1"  # event 2 is incomplete, so a reconnect resumes after 1
assert p.feed("\n\n") == [Event("b", "message", "2")] and p.last_event_id == "2"
assert p.feed("id: 3\n\n") == [] and p.last_event_id == "3"
assert SSEParser().feed("\ufeffdata: hi\n\n") == [Event("hi")]
```

Complexity: O(n) over the stream (each character is scanned a constant number of times per chunk; with very many tiny
chunks, keep the buffer as a list to avoid repeated string concatenation).

#### Follow-ups

- **Bytes instead of text?** Decode with an incremental UTF-8 decoder (`codecs.getincrementaldecoder("utf-8")()`), so a
  multi-byte character split across chunks is not corrupted.
- **Reconnect?** Send `last_event_id` in the `Last-Event-ID` header, and wait `retry` milliseconds first. The server
  replays every event after that id, so the client must also tolerate a duplicate if the server's log is at-least-once.
