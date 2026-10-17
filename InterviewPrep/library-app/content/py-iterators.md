---
title: Iterators, generators and comprehensions
goal: Explain the iterator protocol and generators, choose between a list and a generator, and process large data lazily with itertools.
minutes: 40
---

Generators are the Python answer to a question data and AI roles always ask: "this file or dataset is too big for memory. What do you do?" Interviewers also like the mechanics. What does `for` actually do? What's the difference between an iterable and an iterator? What does `yield` do to a function?

The core idea is **laziness**: produce one item at a time, only when asked. If you can explain that, write a generator pipeline, and name the right `itertools` function, you'll handle every question in this area.

## The iterator protocol

- An **iterable** is anything you can loop over. It has `__iter__()`, which returns an iterator. Lists, dicts, strings, files and ranges are iterables.
- An **iterator** produces values one at a time with `__next__()` and raises `StopIteration` when it's exhausted. An iterator is also iterable: its `__iter__` returns itself.

A `for` loop is just this protocol:

```python
items = ["a", "b"]
it = iter(items)              # calls items.__iter__()
assert next(it) == "a"        # calls it.__next__()
assert next(it) == "b"
try:
    next(it)
    raise AssertionError
except StopIteration:         # for-loops catch this and stop quietly
    pass

# An iterator is single-use; an iterable can be iterated again
it = iter([1, 2, 3])
assert list(it) == [1, 2, 3]
assert list(it) == []         # exhausted
r = range(3)
assert list(r) == list(r) == [0, 1, 2]   # range is a re-iterable sequence, not an iterator
```

You can write an iterator as a class. In practice, a generator is almost always shorter.

```python
class Countdown:
    """Iterable: each for-loop gets a fresh iterator."""
    def __init__(self, start: int) -> None:
        self.start = start
    def __iter__(self):
        n = self.start
        while n > 0:
            yield n           # __iter__ written as a generator: the easiest correct way
            n -= 1

c = Countdown(3)
assert list(c) == [3, 2, 1]
assert list(c) == [3, 2, 1]   # re-iterable because __iter__ starts fresh each time
```

## Generators

A function containing `yield` is a **generator function**. Calling it runs no code; it returns a generator object. Each `next()` runs the body until the next `yield`, hands back that value, and **pauses with all local state kept**. When the function returns, the generator raises `StopIteration`.

```python
def read_claims(lines):
    """Parse lines lazily: one claim in memory at a time."""
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        member, amount = line.split(",")
        yield {"member": member, "amount": float(amount)}

gen = read_claims(["# header", "M1,10.5", "", "M2,4.5"])
assert next(gen) == {"member": "M1", "amount": 10.5}
assert sum(c["amount"] for c in gen) == 4.5      # continues where it paused
```

**Generator expressions** are the lazy version of list comprehensions: round brackets instead of square ones. The memory difference is dramatic.

```python
import sys

squares_list = [n * n for n in range(100_000)]
squares_gen = (n * n for n in range(100_000))
assert sys.getsizeof(squares_list) > 100_000     # holds every value (about 800 KB)
assert sys.getsizeof(squares_gen) < 1_000        # holds only its state (a few hundred bytes)
assert sum(squares_gen) == sum(squares_list)
assert sum(n * n for n in range(10)) == 285      # brackets can be dropped as the only argument
```

**`yield from`** delegates to another iterable or generator and passes its values straight through. It's ideal for recursion, and it also returns the sub-generator's `return` value.

```python
def inner():
    yield 1
    yield 2
    return "inner done"

def outer():
    result = yield from inner()      # re-yields 1 and 2, then captures the return value
    yield result

assert list(outer()) == [1, 2, "inner done"]
```

**Pipelines.** Chain generators so each stage pulls from the previous one. Nothing runs until the final consumer asks for values. Memory stays flat however big the input is.

```python
import io

log = io.StringIO(
    "2026-10-12T09:01 INFO login\n"
    "2026-10-12T09:15 ERROR db timeout\n"
    "2026-10-12T10:02 ERROR payer 503\n"
    "2026-10-12T10:30 INFO logout\n"
)

lines = (line.rstrip("\n") for line in log)          # a file object is already a lazy line iterator
errors = (line for line in lines if " ERROR " in line)
hours = (line[11:13] for line in errors)
assert list(hours) == ["09", "10"]
```

## Comprehensions

| Form | Result | Lazy? |
|---|---|---|
| `[f(x) for x in xs if cond]` | list | No |
| `{f(x) for x in xs}` | set | No |
| `{k: v for k, v in pairs}` | dict | No |
| `(f(x) for x in xs)` | generator | **Yes** |

```python
matrix = [[1, 2, 3], [4, 5, 6]]
assert [n for row in matrix for n in row] == [1, 2, 3, 4, 5, 6]   # loops read left to right
assert [[row[i] for row in matrix] for i in range(3)] == [[1, 4], [2, 5], [3, 6]]   # transpose
assert ["even" if n % 2 == 0 else "odd" for n in range(3)] == ["even", "odd", "even"]  # if-else goes before for

codes = ["e11", "I10", "e11"]
assert {c.upper() for c in codes} == {"E11", "I10"}
inverted = {v: k for k, v in {"a": 1, "b": 2}.items()}
assert inverted == {1: "a", 2: "b"}
```

Comprehensions have their own scope, so the loop variable doesn't leak, and they're usually faster than an equivalent `for` loop with `append`. Once a comprehension needs more than one condition or nesting level, a plain loop or a helper function reads better.

## `itertools`: the toolbox

| Function | What it does | Example |
|---|---|---|
| `chain(a, b)`, `chain.from_iterable(xs)` | Concatenate iterables lazily | flatten one level |
| `islice(it, start, stop)` | Slice any iterator | first n of an infinite generator |
| `count(start, step)`, `cycle(xs)`, `repeat(x, n)` | Infinite and repeating iterators | ids, round-robin |
| `groupby(xs, key)` | Group **consecutive** equal keys | sort first! |
| `batched(xs, n)` (3.12+) | Chunks of n as tuples | API batches |
| `pairwise(xs)` (3.10+) | Overlapping pairs `(a, b), (b, c)` | differences between readings |
| `accumulate(xs, func)` | Running totals (or any running function) | prefix sums |
| `product`, `permutations`, `combinations` | Combinatorics | brute force search |
| `zip_longest(a, b, fillvalue=)` | Zip to the longest input | align columns |
| `takewhile`, `dropwhile`, `filterfalse`, `compress` | Conditional filtering | skip a header block |
| `tee(it, n)` | Split one iterator into n | rarely needed: buffers memory |

```python
from itertools import accumulate, batched, chain, combinations, groupby, islice, pairwise, permutations, product

assert list(chain([1, 2], (3,), "ab")) == [1, 2, 3, "a", "b"]
assert list(chain.from_iterable([[1], [2, 3]])) == [1, 2, 3]
assert list(batched(range(7), 3)) == [(0, 1, 2), (3, 4, 5), (6,)]
assert list(pairwise([98.6, 99.1, 100.4])) == [(98.6, 99.1), (99.1, 100.4)]
assert list(accumulate([5, 10, 20])) == [5, 15, 35]
assert list(accumulate([3, 1, 4, 1], max)) == [3, 3, 4, 4]                # running maximum
assert list(combinations("abc", 2)) == [("a", "b"), ("a", "c"), ("b", "c")]
assert len(list(permutations("abc"))) == 6 and len(list(product("ab", repeat=3))) == 8

visits = [("Ana", "ER"), ("Bo", "Clinic"), ("Ana", "Clinic"), ("Bo", "ER")]
visits.sort(key=lambda v: v[0])                     # groupby only groups ADJACENT keys
grouped = {name: [place for _, place in group] for name, group in groupby(visits, key=lambda v: v[0])}
assert grouped == {"Ana": ["ER", "Clinic"], "Bo": ["Clinic", "ER"]}

assert [k for k, _ in groupby("aabbba")] == ["a", "b", "a"]    # without sorting, "a" appears twice
assert list(islice((n * n for n in range(10**12)), 3)) == [0, 1, 4]   # safe on a huge lazy range

assert list(zip("ab", [1, 2], strict=True)) == [("a", 1), ("b", 2)]   # strict=True (3.10+) checks lengths
```

## Interview questions

### What is the difference between an iterable and an iterator? {core}

An **iterable** is something you can loop over: it implements `__iter__` and returns a fresh iterator each time. Lists, dicts, strings, sets, files and ranges are iterables. An **iterator** is the object that does the looping: it implements `__next__`, returning the next value or raising `StopIteration`, and `__iter__` returning itself.

Iterators are **single-pass**. Once exhausted, they stay empty. A `for` loop calls `iter()` on the iterable, then `next()` repeatedly until `StopIteration`. That's why you can loop over a list twice, but not over the same generator twice.

### What is a generator, and how does `yield` work? {core}

A generator is a function that uses `yield`. Calling it doesn't run the body. It returns a generator object, which is an iterator. Each `next()` resumes the function until the next `yield`, hands that value out, and **freezes the function's local state** until the next request. When the function ends, iteration stops.

The benefit is **lazy evaluation**. Values are produced on demand, so memory stays constant even for huge or infinite sequences. You can also stop early without computing the rest.

### When would you use a generator instead of a list? {core}

Use a generator when:

- The data is **large or unbounded**, like reading a multi-gigabyte file, streaming API pages, or an infinite sequence.
- You only need **one pass**.
- You might **stop early**, as with `any()`, `next()` or `islice`.
- You're building **pipelines** of transformations.

Use a list when you need random access, `len()`, multiple passes, sorting, or when the data is small and you want to inspect it while debugging.

**Your angle:** processing documents or claim files one record at a time is how you keep a Document AI or ingestion worker's memory flat, whatever the batch size.

### What is the difference between a list comprehension and a generator expression? {core}

The syntax differs only in brackets: `[x * 2 for x in xs]` versus `(x * 2 for x in xs)`. The list comprehension builds the whole list immediately in memory. The generator expression returns a lazy iterator that computes each value when asked, using a few hundred bytes no matter how many items there are.

So `sum(x * x for x in range(10**8))` works in constant memory, while the list version would need gigabytes. A generator can only be consumed once.

### What does `yield from` do? {deep}

`yield from iterable` yields every value from a sub-iterable or sub-generator, as if you'd written `for x in it: yield x`. With sub-generators, it also forwards `send()` and `throw()` and **evaluates to the sub-generator's return value**. That makes it ideal for recursive generators, like flattening nested structures or walking trees, and for composing generators cleanly. It was the foundation of generator-based coroutines before `async`/`await`.

### What happens if you iterate over a generator twice?

The second loop gets nothing. A generator is an iterator, so once it has raised `StopIteration` it stays exhausted. This is a common bug: you compute `rows = (parse(l) for l in f)`, call `len(list(rows))` for logging, and then the real loop sees no rows. Materialise with `list()` if you need several passes, or make an iterable class whose `__iter__` creates a fresh generator each time.

### How do you process a 10 GB file that doesn't fit in memory? {core}

Stream it. Iterate over the file object line by line (`for line in f:`), which reads buffered chunks lazily, and chain generator stages: parse, filter, transform. Aggregate with constant-memory structures, like running counters or a `Counter` keyed by category. Write results incrementally too.

For binary or fixed-size records, read chunks with `iter(lambda: f.read(65536), b"")`. For tabular data, pandas can stream with `read_csv(..., chunksize=100_000)`. If one machine is too slow, the same idea scales out with Spark or Dask.

### What is `itertools.groupby`, and what is the catch? {core}

`groupby(iterable, key)` yields `(key, group_iterator)` pairs for **consecutive** items with the same key. The catch: it does *not* group globally. `groupby("aabbba")` gives the groups a, b, a. So you must **sort by the same key first**, or use a `defaultdict(list)` when the data isn't sorted. Each group iterator is also invalidated when you advance to the next group, so convert it with `list()` if you need to keep it.

### What does `send()` do on a generator? {deep}

`gen.send(value)` resumes the generator and makes the paused `yield` expression evaluate to `value`, so data flows **into** the generator. You must prime it with `next(gen)` (or `send(None)`) first, to reach the first `yield`. It enables coroutine-style state machines, like a running averager. Since `async`/`await`, you rarely need it in application code, but it explains how coroutines were built.

```python
def running_average():
    total = count = 0
    average = None
    while True:
        value = yield average
        total += value
        count += 1
        average = total / count

avg = running_average()
next(avg)                         # prime: run to the first yield
assert avg.send(10) == 10.0
assert avg.send(20) == 15.0
```

### Why does raising `StopIteration` inside a generator cause a `RuntimeError`? {deep}

Since Python 3.7 (PEP 479), a `StopIteration` that escapes from inside a generator body is converted into `RuntimeError: generator raised StopIteration`. Before that, an accidental `StopIteration`, say from calling `next()` on an empty iterator inside the generator, would silently end the iteration and hide the bug. To end a generator, just `return`. If you call `next(it)` inside one, pass a default (`next(it, None)`) or catch the exception.

### Name some useful `itertools` functions and when you'd use them. {core}

- `chain` and `chain.from_iterable` to concatenate or flatten one level.
- `islice` to take the first n from any iterator, including infinite ones.
- `batched` (3.12+) to chunk records for bulk API calls or database inserts.
- `groupby` on sorted data to group records.
- `accumulate` for running totals or maxima.
- `pairwise` (3.10+) for differences between consecutive readings.
- `product`, `permutations` and `combinations` for brute-force search.
- `count` and `cycle` for ids and round-robin.

All of them are lazy and implemented in C, so they're fast and memory-friendly.

### How do comprehensions differ from `map` and `filter`? {deep}

They produce the same results. `map` and `filter` return lazy iterators, and comprehensions are eager unless written as generator expressions. Comprehensions are generally preferred for readability, especially when they replace `map(lambda ...)`, and they can map and filter in one expression. `map(str.upper, words)`, with an existing function, is fine and occasionally faster, because no lambda call is involved. Comprehensions also have their own scope, so loop variables don't leak (Python 3).

### What is `iter(callable, sentinel)`? {deep}

The two-argument form of `iter` calls `callable()` repeatedly and stops when it returns `sentinel`. For example, `for chunk in iter(lambda: f.read(4096), b""):` reads a binary file in 4 KB chunks until EOF, and `iter(queue.get, None)` consumes a queue until a `None` poison pill arrives. It turns any "call until done" API into an iterator.

### How do generators relate to `async`/`await`? {deep}

Coroutines grew out of generators. Both are functions that can **pause and resume** while keeping their local state. Early asyncio used generator coroutines (`yield from`). Since 3.5, `async def` defines a native coroutine, and `await` pauses it until the awaited operation completes. The event loop drives it, much like `next()` drives a generator.

There are also **async generators** (`async def` with `yield`), consumed with `async for`. They're useful for streaming results, such as reading paginated API responses or streaming LLM tokens in a FastAPI `StreamingResponse`.

### What is `zip(..., strict=True)` for?

Plain `zip` stops silently at the **shortest** input, which can hide data bugs, like two columns that should be aligned but aren't. Since 3.10, `zip(a, b, strict=True)` raises `ValueError` if the lengths differ. Use `itertools.zip_longest` with a `fillvalue` when uneven lengths are expected.

## Coding problems

### Chunk an iterable into batches {easy core}

Write `chunked(iterable, size)`, which yields lists of up to `size` items. The input may be any iterable, including a generator, so you can't use `len()` or slicing. Example: `chunked(range(7), 3)` gives `[0, 1, 2]`, `[3, 4, 5]`, `[6]`. Use case: sending records to an API that accepts at most 100 per request.

#### Hints

1. Get an iterator with `iter()` so you can keep pulling from the same position.
2. `itertools.islice(it, size)` takes the next `size` items. An empty result means you're done.
3. Validate `size` (it must be at least 1), otherwise you'd loop forever.

#### Solution

Pulling with `islice` from one shared iterator works for lists *and* generators, and only holds one batch in memory. The walrus operator keeps the loop compact. On 3.12+, `itertools.batched` does the same thing but yields tuples. Mention it, and show you can write it yourself.

```python
from itertools import batched, islice
from typing import Iterable, Iterator, TypeVar

T = TypeVar("T")

def chunked(iterable: Iterable[T], size: int) -> Iterator[list[T]]:
    if size < 1:
        raise ValueError("size must be >= 1")
    it = iter(iterable)
    while batch := list(islice(it, size)):
        yield batch

assert list(chunked(range(7), 3)) == [[0, 1, 2], [3, 4, 5], [6]]
assert list(chunked([], 3)) == []
assert list(chunked((x for x in "abcd"), 2)) == [["a", "b"], ["c", "d"]]   # works on a generator
assert [list(b) for b in batched(range(7), 3)] == list(chunked(range(7), 3))
try:
    list(chunked([1], 0))
    raise AssertionError
except ValueError:
    pass
```

Complexity: O(n) total time, O(size) memory.

#### Follow-ups

- **What if the last chunk must be padded?** Use `zip_longest(*[iter(xs)] * n, fillvalue=None)`, the classic "grouper" recipe.
- **What about memory?** Only one batch is ever materialised, so it handles millions of records.

### An infinite Fibonacci generator {easy}

Write a generator `fibonacci()` that yields 0, 1, 1, 2, 3, 5, ... forever. Then get the first 10 numbers, and the first Fibonacci number above 1,000, without writing another loop.

#### Hints

1. Keep two variables and update them with tuple assignment: `a, b = b, a + b`.
2. An infinite generator is just `while True: yield ...`. The consumer decides when to stop.
3. Use `islice` for "first n" and `next()` with a generator expression for "first match".

#### Solution

Because the generator is lazy, an infinite loop is safe: it only advances when asked. The consumer uses `islice` to take a prefix, and `next(x for x in gen if cond)` to find the first match. Each call to `fibonacci()` gives an independent generator.

```python
from itertools import islice, takewhile
from typing import Iterator

def fibonacci() -> Iterator[int]:
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

assert list(islice(fibonacci(), 10)) == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
assert next(n for n in fibonacci() if n > 1000) == 1597
assert list(takewhile(lambda n: n < 20, fibonacci())) == [0, 1, 1, 2, 3, 5, 8, 13]
```

Complexity: O(1) per value, O(1) memory.

#### Follow-ups

- **Why not recursion?** Naive recursive Fibonacci is exponential, and deep recursion hits the recursion limit. Iteration is O(n) and constant memory.
- **What is the nth number for a huge n?** Matrix exponentiation or fast doubling gives O(log n) arithmetic steps.

### Count errors per hour in a huge log, lazily {medium core}

A log has lines like `2026-10-12T09:15:02Z ERROR payer timeout`. Write `errors_per_hour(lines)`, which returns a dict mapping `"YYYY-MM-DDTHH"` to the number of ERROR lines, plus the number of malformed lines it skipped. It must work on a file of any size (assume many GB), so never load all lines at once. Malformed lines must be skipped, not crash the run.

#### Hints

1. A file object is already a lazy iterator of lines. Accept any iterable of strings.
2. Build a generator pipeline: strip, then split, then filter by level.
3. Use a `Counter`. It's the only thing that grows, and only by the number of distinct hours.

#### Solution

Each stage is a generator, so only one line is in memory at a time. Splitting with `maxsplit=2` keeps the message intact even if it contains spaces. Malformed lines (too few fields) are filtered out and counted, rather than raising. In production you'd log the skipped count, because silently dropping data hides problems.

```python
import io
from collections import Counter
from typing import Iterable

def errors_per_hour(lines: Iterable[str]) -> tuple[dict[str, int], int]:
    skipped = 0

    def parsed():
        nonlocal skipped
        for line in lines:
            parts = line.strip().split(maxsplit=2)
            if len(parts) < 2 or len(parts[0]) < 13:
                skipped += 1
                continue
            yield parts[0], parts[1]

    counts = Counter(ts[:13] for ts, level in parsed() if level == "ERROR")
    return dict(counts), skipped

log_file = io.StringIO(       # stands in for open("app.log"): iterating it is lazy in exactly the same way
    "2026-10-12T09:15:02Z ERROR payer timeout\n"
    "2026-10-12T09:40:00Z INFO login ok\n"
    "2026-10-12T09:59:59Z ERROR db pool exhausted\n"
    "garbage\n"
    "\n"
    "2026-10-12T10:00:01Z ERROR payer 503 Service Unavailable\n"
)
counts, skipped = errors_per_hour(log_file)
assert counts == {"2026-10-12T09": 2, "2026-10-12T10": 1}
assert skipped == 2
assert errors_per_hour([]) == ({}, 0)
```

Complexity: O(n) time over n lines. Memory is O(h) for h distinct hours, independent of file size.

#### Follow-ups

- **How do you open it for real?** `with open(path, encoding="utf-8", errors="replace") as f: errors_per_hour(f)`. Also handle `.gz` files with `gzip.open(path, "rt")`.
- **What if it's 500 GB, or many files?** Process files in parallel with `ProcessPoolExecutor` and merge the Counters (`sum(counters, Counter())`), or use Spark.
- **What about structured logs?** Parse each line with `json.loads` inside the generator, with `try`/`except json.JSONDecodeError`.

### Flatten an arbitrarily nested list {medium core}

Write `flatten(items)`, which yields all non-list values from a nested structure of lists and tuples, at any depth. Example: `[1, [2, [3, (4, 5)]], 6]` gives `1, 2, 3, 4, 5, 6`. Strings must stay whole (don't split `"abc"` into characters).

#### Hints

1. Recursion fits: if an item is a list or tuple, flatten it too. Otherwise, yield it.
2. `yield from flatten(item)` passes the inner values straight through.
3. Strings are iterable too, so check explicitly for `(list, tuple)` rather than "is it iterable".

#### Solution

The recursive generator is short and lazy. Recursion depth equals the nesting depth, and Python's default limit is about 1,000. For pathologically deep input, an explicit stack of iterators avoids recursion entirely. Show both if time allows: it demonstrates you know the recursion-limit risk.

```python
from typing import Any, Iterator

def flatten(items: Any) -> Iterator[Any]:
    for item in items:
        if isinstance(item, (list, tuple)):
            yield from flatten(item)
        else:
            yield item

def flatten_iterative(items: Any) -> Iterator[Any]:
    stack = [iter(items)]
    while stack:
        for item in stack[-1]:
            if isinstance(item, (list, tuple)):
                stack.append(iter(item))     # descend; resume the outer iterator later
                break
            yield item
        else:
            stack.pop()                      # this level is exhausted

nested = [1, [2, [3, (4, 5)]], 6, "abc", []]
assert list(flatten(nested)) == [1, 2, 3, 4, 5, 6, "abc"]
assert list(flatten_iterative(nested)) == [1, 2, 3, 4, 5, 6, "abc"]

deep: list = [0]
for _ in range(5000):                        # deeper than the recursion limit
    deep = [deep]
assert list(flatten_iterative(deep)) == [0]
try:
    list(flatten(deep))
    raise AssertionError
except RecursionError:
    pass
```

Complexity: O(n) over all elements. The recursive version uses O(depth) stack frames, and the iterative version O(depth) list entries.

#### Follow-ups

- **What about dicts in JSON?** Flattening nested dicts into dotted keys (`"patient.address.city"`) is a common follow-up. The same recursion works, passing the key prefix down.
- **Why not `sum(lists, [])`?** It's O(n²), because each `+` copies, and it only flattens one level.

### A sliding window iterator {medium}

Write `windows(iterable, k)`, which yields tuples of `k` consecutive items: `windows([1, 2, 3, 4, 5], 3)` gives `(1, 2, 3), (2, 3, 4), (3, 4, 5)`. It must work on a stream, such as live heart-rate readings, so it can't use indexing. Then use it to compute a 3-reading moving average.

#### Hints

1. You need to remember the last `k` items. Which structure drops the oldest automatically?
2. `collections.deque(maxlen=k)` discards from the left when you append on the right.
3. Start yielding only once the window is full.

#### Solution

A `deque` with `maxlen` keeps exactly the last k items, with O(1) append and automatic eviction. Converting to a tuple for each yield gives the caller an immutable snapshot. For a moving average over long windows, keep a running sum instead of re-summing each window, which turns O(n·k) into O(n).

```python
from collections import deque
from itertools import islice
from typing import Iterable, Iterator, TypeVar

T = TypeVar("T")

def windows(iterable: Iterable[T], k: int) -> Iterator[tuple[T, ...]]:
    if k < 1:
        raise ValueError("k must be >= 1")
    it = iter(iterable)
    window = deque(islice(it, k), maxlen=k)
    if len(window) == k:
        yield tuple(window)
    for item in it:
        window.append(item)           # the oldest item falls off the left
        yield tuple(window)

def moving_average(readings: Iterable[float], k: int) -> Iterator[float]:
    it = iter(readings)
    window = deque(islice(it, k), maxlen=k)
    if len(window) < k:
        return
    total = sum(window)
    yield total / k
    for x in it:
        total += x - window[0]        # O(1) update: add the new value, drop the oldest
        window.append(x)
        yield total / k

assert list(windows([1, 2, 3, 4, 5], 3)) == [(1, 2, 3), (2, 3, 4), (3, 4, 5)]
assert list(windows([1, 2], 3)) == []
assert list(windows(iter("abc"), 1)) == [("a",), ("b",), ("c",)]
heart_rate = (bpm for bpm in [70, 72, 74, 90, 110])
assert [round(x, 2) for x in moving_average(heart_rate, 3)] == [72.0, 78.67, 91.33]
```

Complexity: `windows` is O(n·k), because building each tuple copies k items. `moving_average` is O(n) time and O(k) memory.

#### Follow-ups

- **What is the built-in for k = 2?** `itertools.pairwise` (3.10+).
- **What about a time-based window ("the last 5 minutes")?** Keep a deque of `(timestamp, value)` and pop from the left while the oldest is older than the cutoff. Every element is pushed and popped once, so it's amortised O(1).

### Iterate over a paginated API lazily {medium}

An API returns patients a page at a time: `fetch_page(cursor)` returns `{"items": [...], "next": cursor_or_None}`. Write `all_patients(fetch_page)`, which yields every patient across all pages. It should only fetch a page when the consumer actually needs it, so `next(all_patients(...))` fetches just one page.

#### Hints

1. Loop: fetch a page, `yield from` its items, follow the `next` cursor, and stop when it's `None`.
2. A generator fetches lazily for free, because nothing after a `yield` runs until the consumer asks for more.
3. Test laziness by counting how many times the fake `fetch_page` was called.

#### Solution

The generator hides pagination completely. Callers just write `for p in all_patients(fetch)`, and can stop early with `islice` or `break` without wasting API calls. This is exactly how SDKs like boto3 paginators or the Stripe client are designed.

```python
from itertools import islice
from typing import Callable, Iterator

Page = dict
def all_patients(fetch_page: Callable[[str | None], Page]) -> Iterator[dict]:
    cursor: str | None = None
    while True:
        page = fetch_page(cursor)
        yield from page["items"]
        cursor = page.get("next")
        if cursor is None:
            return

# Fake API with 3 pages, recording each call
PAGES = {
    None: {"items": [{"id": 1}, {"id": 2}], "next": "c2"},
    "c2": {"items": [{"id": 3}, {"id": 4}], "next": "c3"},
    "c3": {"items": [{"id": 5}], "next": None},
}
calls: list[str | None] = []
def fake_fetch(cursor: str | None) -> Page:
    calls.append(cursor)
    return PAGES[cursor]

assert [p["id"] for p in all_patients(fake_fetch)] == [1, 2, 3, 4, 5]
assert calls == [None, "c2", "c3"]

calls.clear()
first_three = [p["id"] for p in islice(all_patients(fake_fetch), 3)]
assert first_three == [1, 2, 3]
assert calls == [None, "c2"]                      # page 3 was never fetched
```

Complexity: O(total items) to iterate everything. Memory holds one page at a time.

#### Follow-ups

- **How would you make it async?** Write an `async def` generator that does `page = await client.get(...)` and `for item in page: yield item`, consumed with `async for`.
- **How would you handle a page that fails?** Wrap `fetch_page` with the retry decorator from the functions chapter, and keep the cursor so you can resume.
- **What about rate limits?** Respect `Retry-After` on HTTP 429 and add a token-bucket limiter between page fetches.
