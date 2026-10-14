---
title: Real-world Python tasks
goal: Solve the practical tasks a full-stack Python round favours (parsing logs and CSVs, reshaping JSON, caches, rate limiters, retries, data cleaning) with clean, tested code.
minutes: 120
---

Many "Full Stack Python Developer" rounds skip puzzle problems and hand you something that looks like real work:
a few log lines, a CSV of claims, a nested JSON payload, or "build a small cache". These tasks check things
LeetCode-style problems don't: whether you pick the right standard-library tool, handle messy input without
crashing, name things clearly, and test your own code.

Every problem below uses healthcare-flavoured data, because CitiusTech's clients are payers, providers and life-sciences
companies. Solve each one out loud: restate the task, ask about the edge cases, write the code, then run the
asserts in your head.

## How practical rounds are graded

| What they watch | What a strong candidate does |
|---|---|
| Clarifying questions | Asks about bad rows, duplicates, time zones, empty input and expected output format before coding |
| Right tool | Reaches for `csv`, `json`, `datetime`, `collections`, `heapq`, `re` and `decimal` instead of hand-rolling them |
| Robustness | Skips or collects bad records instead of crashing, and says which choice they made and why |
| Testability | Injects the clock (`now`) and `sleep` so time-based code can be tested without waiting |
| Readability | Small functions, type hints, names like `errors_by_hour`, not `d` or `tmp` |
| Complexity | States time and memory cost, and what changes when the file is 50 GB |

## The toolbox these tasks use

| Task shape | Reach for |
|---|---|
| Count things | `collections.Counter` |
| Group rows by a key | `collections.defaultdict(list)` |
| Keep the order of most recent use | `collections.OrderedDict` (`move_to_end`, `popitem(last=False)`) |
| Sliding time window | `collections.deque` of timestamps |
| "What happens next in time order" | `heapq` with `(time, sequence, item)` tuples |
| Money | `decimal.Decimal`, never `float` |
| Dates and times | `datetime.strptime`, `date.fromisoformat`, and always an injectable clock |
| CSV text or files | `csv.DictReader` (handles quoting and commas inside fields) |
| Nested JSON | `json.loads`, then recursion (or an explicit stack for very deep data) |
| Text patterns | `re.compile(...).fullmatch(...)` for validation, `re.findall` for extraction |

## Coding problems

### Count errors per hour from a log {medium core}

You're given lines from a service log. Count the `ERROR` lines per hour and return them sorted by hour. Lines that
don't parse (bad timestamp, too few fields, blank lines) must be skipped, not crash the job.

```text
2026-10-12 09:15:02 ERROR claims-api Timeout calling eligibility
2026-10-12 09:47:10 INFO  claims-api Claim 123 accepted
2026-10-12 09:59:59 ERROR claims-api Database connection reset
2026-10-12 10:00:00 ERROR auth-api Invalid token signature
```

Expected: `{"2026-10-12 09:00": 2, "2026-10-12 10:00": 1}`.

#### Hints

1. Split each line into at most four parts: date, time, level and the rest of the message.
2. Parse the timestamp with `datetime.strptime` inside `try`/`except ValueError` so bad lines are skipped.
3. Count with a `Counter` keyed by the timestamp truncated to the hour.

#### Solution

Walk the lines once. `split(maxsplit=3)` keeps the free-text message in one piece. Parsing the timestamp, rather than
slicing the string, rejects impossible dates like month 13. Truncate to the hour with `strftime`, count, then sort the
keys. ISO-style timestamps sort correctly as plain strings.

```python
from collections import Counter
from datetime import datetime


def errors_per_hour(lines: list[str]) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for line in lines:
        parts = line.split(maxsplit=3)
        if len(parts) < 3 or parts[2] != "ERROR":
            continue
        try:
            ts = datetime.strptime(f"{parts[0]} {parts[1]}", "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue  # malformed timestamp: skip the line (or log it)
        counts[ts.strftime("%Y-%m-%d %H:00")] += 1
    return dict(sorted(counts.items()))


logs = [
    "2026-10-12 09:15:02 ERROR claims-api Timeout calling eligibility",
    "2026-10-12 09:47:10 INFO  claims-api Claim 123 accepted",
    "2026-10-12 09:59:59 ERROR claims-api Database connection reset",
    "2026-10-12 10:00:00 ERROR auth-api Invalid token signature",
    "garbage line",
    "2026-13-40 10:05:00 ERROR auth-api impossible date",
    "",
]
assert errors_per_hour(logs) == {"2026-10-12 09:00": 2, "2026-10-12 10:00": 1}
assert errors_per_hour([]) == {}
assert errors_per_hour(["2026-10-12 09:00:00 INFO ok"]) == {}
```

Complexity: O(n) time over the lines and O(h) memory for h distinct hours. The input never has to fit in memory: pass an
open file instead of a list, because iterating a file yields one line at a time.

#### Follow-ups

- **The log is 50 GB.** Iterate the file object lazily (`for line in f`), which is already O(1) memory per line. For
  several files, count each one in a separate process and add the Counters together (`total += partial`).
- **Count per service too.** Key the Counter by `(hour, service)`, or use a `defaultdict(Counter)`.
- **Time zones?** Ask which zone the logs use. Parse to an aware `datetime` and convert to UTC before bucketing.

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

### Flatten nested JSON into dotted keys {medium core}

You get a nested JSON document, such as a FHIR-like patient. Flatten it so it can go into a flat table. Nested keys join
with dots, and list items use their index. An empty dict or list stays as a value.

```text
{"name": {"given": "Ana"}, "ids": [{"system": "MRN", "value": "123"}], "tags": []}
→ {"name.given": "Ana", "ids.0.system": "MRN", "ids.0.value": "123", "tags": []}
```

#### Hints

1. Recursion fits naturally: a dict or a list means "go deeper", and anything else is a leaf.
2. Pass the path built so far (the prefix) down to each recursive call.
3. Treat a list like a dict whose keys are `"0"`, `"1"`, and so on.

#### Solution

The recursive function returns a flat dict for whatever it receives. For a container it merges the children's results,
each with a longer prefix. For a leaf it returns `{prefix: value}`. An empty container produces no children, so we
store it as a value, or it would disappear.

```python
import json
from typing import Any


def flatten(data: Any, prefix: str = "", sep: str = ".") -> dict[str, Any]:
    if isinstance(data, dict):
        items = [(str(k), v) for k, v in data.items()]
    elif isinstance(data, list):
        items = [(str(i), v) for i, v in enumerate(data)]
    else:
        return {prefix: data}
    if not items:
        return {prefix: data} if prefix else {}
    out: dict[str, Any] = {}
    for key, value in items:
        out.update(flatten(value, f"{prefix}{sep}{key}" if prefix else key, sep))
    return out


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
assert flatten({}) == {}
assert flatten({"a": {"b": {"c": None}}}, sep="_") == {"a_b_c": None}
```

Complexity: O(total number of values × depth) time, because every leaf key is a path string as long as the depth.

#### Follow-ups

- **Very deep documents hit the recursion limit (about 1000).** Use an explicit stack of `(prefix, value)` pairs instead of recursion.
- **A key already contains a dot.** Choose a separator that can't appear in keys, or escape dots in keys.
- **With pandas?** `pd.json_normalize(records, sep=".")` flattens dicts. Lists need `record_path` or `explode`.

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
- **Round trip?** `unflatten(flatten(d)) == d` holds for dicts of dicts with non-empty containers. Say what breaks:
  lists, and keys that contain dots.

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
- **Entries should expire after 5 minutes.** Store `(value, expires_at)` and treat expired entries as misses. The TTL
  store problem below shows this.
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

### Token-bucket rate limiter {medium core}

Protect an eligibility API: each client may burst up to `capacity` requests, and tokens refill at `rate` per second.
Write `allow()`, which returns `True` if a request may go through. It must be testable without real sleeping.

#### Hints

1. You don't need a background thread refilling the bucket. What is the least state you must remember between calls?
2. Refill lazily: on each call, add `elapsed × rate` tokens since the last call, capped at capacity.
3. Inject the clock as a function (`clock=time.monotonic`), so tests can pass a fake one. Use `time.monotonic`, not
   `time.time`: wall-clock time can jump backwards.

#### Solution

The state is just `tokens` and `last_refill`. Each call tops up the bucket for the time that has passed, then spends a
token if one is available. A burst of `capacity` requests goes through, and after that the throughput is capped at `rate`.

```python
import time
from collections.abc import Callable


class TokenBucket:
    def __init__(self, capacity: float, rate: float, clock: Callable[[], float] = time.monotonic) -> None:
        self.capacity = capacity
        self.rate = rate  # tokens added per second
        self.clock = clock
        self.tokens = capacity
        self.last_refill = clock()

    def allow(self, cost: float = 1.0) -> bool:
        now = self.clock()
        self.tokens = min(self.capacity, self.tokens + (now - self.last_refill) * self.rate)
        self.last_refill = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True
        return False


class FakeClock:
    def __init__(self) -> None:
        self.t = 0.0

    def __call__(self) -> float:
        return self.t


clock = FakeClock()
bucket = TokenBucket(capacity=3, rate=1, clock=clock)
assert [bucket.allow() for _ in range(4)] == [True, True, True, False]  # burst of 3
clock.t = 1.0
assert [bucket.allow(), bucket.allow()] == [True, False]                # one token refilled
clock.t = 100.0
assert [bucket.allow() for _ in range(4)] == [True, True, True, False]  # refill is capped at capacity

# One bucket per client
buckets: dict[str, TokenBucket] = {}
def allow_client(client_id: str) -> bool:
    if client_id not in buckets:
        buckets[client_id] = TokenBucket(2, 1, clock)
    return buckets[client_id].allow()
assert [allow_client("a"), allow_client("a"), allow_client("a"), allow_client("b")] == [True, True, False, True]
```

Complexity: O(1) per call. Memory is O(1) per client.

#### Follow-ups

- **Several API servers?** Keep the bucket in Redis and update it atomically in a Lua script, or use a gateway's built-in
  limiter (API Gateway, Apigee, Azure API Management).
- **What does the client see?** HTTP 429 Too Many Requests with a `Retry-After` header. The wait is
  `(cost - tokens) / rate` seconds.
- **Threads?** Guard `allow` with a lock, because read-modify-write on `tokens` is a race.

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

### Retry with exponential backoff {medium core}

Calls to a payer's API sometimes fail with `ConnectionError`. Write a decorator `@retry(times=3, base_delay=0.5)` that
retries only the listed exceptions, waits 0.5 s, 1 s, 2 s and so on between attempts (with optional jitter), and re-raises
the last error. It must be testable without sleeping.

#### Hints

1. A decorator with arguments has three layers: `retry(...)` returns `decorator(func)`, which returns `wrapper(*args, **kwargs)`.
2. The delay before retry number k is `base_delay * 2 ** (k - 1)`.
3. Inject `sleep` as a parameter, so tests pass a function that records delays instead of waiting.

#### Solution

Loop over the attempts. On success return immediately. On a listed exception, either re-raise (on the last attempt)
or sleep and try again. An exception that isn't listed passes straight through, because retrying a `ValueError` (a bug
in the request) never helps. `functools.wraps` keeps the original name and docstring.

```python
import functools
import random
import time
from collections.abc import Callable
from typing import ParamSpec, TypeVar

P = ParamSpec("P")
R = TypeVar("R")


def retry(
    times: int = 3,
    base_delay: float = 0.5,
    exceptions: tuple[type[BaseException], ...] = (ConnectionError, TimeoutError),
    sleep: Callable[[float], None] = time.sleep,
    jitter: bool = True,
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            for attempt in range(1, times + 1):
                try:
                    return func(*args, **kwargs)
                except exceptions:
                    if attempt == times:
                        raise
                    delay = base_delay * 2 ** (attempt - 1)
                    sleep(random.uniform(0, delay) if jitter else delay)
            raise AssertionError("unreachable")
        return wrapper
    return decorator


# Test 1: succeeds on the third attempt, after waiting 0.5 s and 1 s.
waits: list[float] = []
calls = {"n": 0}

@retry(times=3, sleep=waits.append, jitter=False)
def check_eligibility(member_id: str) -> str:
    """Call the payer API."""
    calls["n"] += 1
    if calls["n"] < 3:
        raise ConnectionError("reset by peer")
    return f"{member_id}: eligible"

assert check_eligibility("M1") == "M1: eligible"
assert calls["n"] == 3 and waits == [0.5, 1.0]
assert check_eligibility.__name__ == "check_eligibility" and check_eligibility.__doc__ == "Call the payer API."

# Test 2: a non-retryable error is raised at once, with no waiting.
waits.clear()
@retry(times=5, sleep=waits.append)
def bad_request() -> None:
    raise ValueError("invalid member id")

try:
    bad_request()
except ValueError:
    pass
assert waits == []

# Test 3: always failing re-raises the last error after `times` attempts.
waits.clear()
@retry(times=3, sleep=waits.append, jitter=False)
def down() -> None:
    raise TimeoutError("gateway timeout")

try:
    down()
except TimeoutError:
    pass
else:
    raise AssertionError("should have raised")
assert waits == [0.5, 1.0]
```

Complexity: at most `times` calls. The total wait is under `base_delay × 2^(times-1)`.

**Interview version:** on a whiteboard, drop the `ParamSpec`/`TypeVar` typing and write
`def retry(times=3, base_delay=0.5, exceptions=(ConnectionError,), sleep=time.sleep)`. The three layers, the
re-raise on the last attempt and the injected `sleep` are what the interviewer is looking for.

#### Follow-ups

- **Why jitter?** If 1,000 clients fail together and all retry after exactly 1 s, they hit the recovering server
  together (a thundering herd). Random "full jitter" spreads them out.
- **Is it safe to retry a POST that creates a claim?** Only if it's idempotent. Send an idempotency key so the server
  can drop duplicates.
- **Async version?** Same shape with `async def wrapper` and `await asyncio.sleep(delay)`.
- **In production?** The `tenacity` library does this, with stop and wait strategies and logging hooks.

### Average length of stay per department {easy core}

You get encounter records like `{"dept": "Cardiology", "los_days": 3}`. Return, per department, the number of encounters,
the average length of stay (rounded to 2 decimal places) and the maximum. Sort by average, highest first, and break ties by
department name.

#### Hints

1. Group values with `defaultdict(list)`.
2. Build one summary dict per group, then sort with a tuple key.
3. Negate the average in the key to sort it descending while the name sorts ascending.

#### Solution

The classic group-by in plain Python is to bucket, then summarise. The sort key `(-avg, dept)` sorts by two fields in
different directions in a single pass.

```python
from collections import defaultdict
from statistics import mean
from typing import Any


def los_by_department(encounters: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: defaultdict[str, list[int]] = defaultdict(list)
    for e in encounters:
        groups[e["dept"]].append(e["los_days"])
    summary = [
        {"dept": dept, "count": len(days), "avg_los": round(mean(days), 2), "max_los": max(days)}
        for dept, days in groups.items()
    ]
    return sorted(summary, key=lambda r: (-r["avg_los"], r["dept"]))


encounters = [
    {"dept": "Cardiology", "los_days": 4},
    {"dept": "Oncology", "los_days": 6},
    {"dept": "Cardiology", "los_days": 2},
    {"dept": "Orthopedics", "los_days": 3},
    {"dept": "Cardiology", "los_days": 3},
    {"dept": "Oncology", "los_days": 1},
]
assert los_by_department(encounters) == [
    {"dept": "Oncology", "count": 2, "avg_los": 3.5, "max_los": 6},
    {"dept": "Cardiology", "count": 3, "avg_los": 3.0, "max_los": 4},
    {"dept": "Orthopedics", "count": 1, "avg_los": 3.0, "max_los": 3},
]
assert los_by_department([]) == []
```

Complexity: O(n) to group, plus O(g log g) to sort g groups.

#### Follow-ups

- **In pandas?** `df.groupby("dept")["los_days"].agg(count="count", avg_los="mean", max_los="max")`. See the pandas chapter.
- **Streaming data that doesn't fit in memory?** Keep running `count`, `total` and `max` per department instead of lists.
- **`itertools.groupby`?** It only groups consecutive equal keys, so you must sort by the key first.

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

### In-memory key-value store with TTL {medium}

Build a tiny cache for auth tokens: `set(key, value, ttl=None)`, `get(key, default=None)`, `delete(key)` and
`purge_expired()`. A key with a TTL disappears `ttl` seconds after it was set. Make it testable without waiting.

#### Hints

1. Store `(value, expires_at)`, where `expires_at` is `None` for keys that never expire.
2. "Lazy expiry": check the deadline inside `get`, and delete the key there if it has passed.
3. Lazy expiry alone leaks memory for keys nobody reads again, which is why `purge_expired` exists.

#### Solution

Inject the clock as before. `get` treats an expired entry as missing and removes it. `purge_expired` sweeps everything,
and would run periodically. Redis combines both: lazy expiry on access plus random sampling in the background.

```python
import time
from collections.abc import Callable
from typing import Any

_MISSING = object()


class TTLStore:
    def __init__(self, clock: Callable[[], float] = time.monotonic) -> None:
        self._clock = clock
        self._data: dict[str, tuple[Any, float | None]] = {}

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        self._data[key] = (value, None if ttl is None else self._clock() + ttl)

    def get(self, key: str, default: Any = None) -> Any:
        item = self._data.get(key, _MISSING)
        if item is _MISSING:
            return default
        value, expires_at = item
        if expires_at is not None and self._clock() >= expires_at:
            del self._data[key]
            return default
        return value

    def delete(self, key: str) -> bool:
        return self._data.pop(key, _MISSING) is not _MISSING

    def purge_expired(self) -> int:
        now = self._clock()
        dead = [k for k, (_, exp) in self._data.items() if exp is not None and now >= exp]
        for k in dead:
            del self._data[k]
        return len(dead)


now = 0.0
store = TTLStore(clock=lambda: now)
store.set("token:M1", "abc", ttl=30)
store.set("config", {"region": "us"})        # never expires
store.set("token:M2", None, ttl=10)          # a stored None is still a real value
assert store.get("token:M1") == "abc"
assert store.get("token:M2", "missing") is None
now = 10.0
assert store.get("token:M2", "missing") == "missing"   # expired exactly at the deadline
now = 31.0
assert store.purge_expired() == 1                       # token:M1
assert store.get("config") == {"region": "us"}
assert store.delete("config") is True and store.delete("config") is False
```

Complexity: `set`, `get` and `delete` are O(1). `purge_expired` is O(n). For a cheap sweep, keep a min-heap of
`(expires_at, key)` and pop only what has expired.

#### Follow-ups

- **Why the `_MISSING` sentinel?** So that a stored `None` is not confused with a missing key.
- **Thread safety and multiple processes?** Use a lock within one process. Across servers, use Redis (`SET key value EX 30`).

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
