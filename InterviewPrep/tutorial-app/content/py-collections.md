---
title: Built-in collections and their costs
goal: Pick the right container for the job, state the Big-O of its operations, and use the collections, heapq and bisect modules fluently in live coding.
minutes: 40
---

Choosing the right container matters more in a Python interview than anything else. A good answer to "how would you speed this up?" is often "swap the list for a set". In live coding, `Counter`, `defaultdict`, `deque` and `heapq` turn ten lines into two. Interviewers notice when you reach for them.

Learn the cost table below until you can recite it. Then learn *why* each number is what it is: a list is a dynamic array, and dicts and sets are hash tables. Reasoning from how the structure works is what convinces an interviewer.

## The cost table

| Operation | `list` | `dict` | `set` | `deque` |
|---|---|---|---|---|
| Index / key lookup | O(1) | O(1) average | n/a | O(n) in the middle, O(1) at the ends |
| `x in c` | **O(n)** | **O(1)** average | **O(1)** average | O(n) |
| Append / add at the end | O(1) amortised | O(1) average | O(1) average | O(1) |
| Insert / remove at the front | **O(n)** | n/a | n/a | **O(1)** |
| Pop from the end | O(1) | `popitem()` O(1) | `pop()` O(1) | O(1) |
| Delete arbitrary item | O(n) | O(1) average | O(1) average | O(n) |
| Sort | O(n log n) | n/a | n/a | n/a |
| Copy / iterate | O(n) | O(n) | O(n) | O(n) |

More costs to know:

- **`heapq`:** push and pop are O(log n), `heapify` is O(n), peeking `heap[0]` is O(1), and `nlargest(k, xs)` is O(n log k).
- **`bisect`:** a search is O(log n). `insort` is O(n), because inserting into a list shifts the elements after it.
- **Strings:** building a string with `+=` in a loop can be O(n²). Collect the parts in a list and `"".join()` them, which is O(n).
- **Worst case:** dict and set operations are O(n) when many keys collide. With Python's randomised string hashing this is rare in practice, but say "average" when you quote O(1).

## Lists and tuples

A **list** is a dynamic array of references. It over-allocates when it grows, which is why `append` is amortised O(1). Inserting or deleting anywhere except the end shifts every element after that position.

A **tuple** is an immutable, fixed-size sequence. Use a tuple for a record whose shape is fixed, like `(lat, lng)` or a database row. It's hashable if its items are, it uses slightly less memory, and it signals "this won't change".

```python
row = ("MRN-001", "Ana", 1990)
mrn, name, year = row                 # unpacking
first, *rest = [1, 2, 3, 4]           # star-unpacking
assert rest == [2, 3, 4]
a, b = 1, 2
a, b = b, a                           # swap without a temp variable
assert (a, b) == (2, 1)

nums = [10, 20, 30, 40, 50]
assert nums[-1] == 50                 # negative index counts from the end
assert nums[1:4] == [20, 30, 40]      # slices copy (shallow)
assert nums[::-1] == [50, 40, 30, 20, 10]
assert nums[::2] == [10, 30, 50]
```

## Dicts and sets

A **dict** is a hash table. It hashes the key to find a slot, then confirms the match with `==`. Since Python 3.7, dicts are guaranteed to **keep insertion order**, thanks to a compact layout: a sparse index table pointing into a dense array of entries. A **set** is a hash table of keys only.

```python
counts: dict[str, int] = {}
for code in ["E11", "I10", "E11"]:
    counts[code] = counts.get(code, 0) + 1          # get with a default
assert counts == {"E11": 2, "I10": 1}

groups: dict[str, list[str]] = {}
for name, plan in [("Ana", "gold"), ("Bo", "silver"), ("Cy", "gold")]:
    groups.setdefault(plan, []).append(name)         # create the list on first sight
assert groups == {"gold": ["Ana", "Cy"], "silver": ["Bo"]}

base = {"timeout": 30, "retries": 3}
override = {"retries": 5}
assert base | override == {"timeout": 30, "retries": 5}   # merge (3.9+), right side wins
assert {**base, **override} == base | override

squares = {n: n * n for n in range(4)}               # dict comprehension
assert squares == {0: 0, 1: 1, 2: 4, 3: 9}

seen_a = {"E11", "I10", "J45"}
seen_b = {"I10", "Z00"}
assert seen_a & seen_b == {"I10"}                    # intersection
assert seen_a | seen_b == {"E11", "I10", "J45", "Z00"}
assert seen_a - seen_b == {"E11", "J45"}             # difference
assert seen_a ^ seen_b == {"E11", "J45", "Z00"}      # symmetric difference

assert {"a": 1}.keys() & {"a", "q"} == {"a"}         # dict views are set-like
```

## The `collections` module

| Type | Use it for | Key methods |
|---|---|---|
| `Counter` | Counting things | `most_common(k)`, `total()`, `+`, `-`, `&`, `\|` |
| `defaultdict` | Grouping without "if key not in" checks | `defaultdict(list)`, `defaultdict(int)` |
| `deque` | Queues, sliding windows, BFS | `append`, `appendleft`, `popleft`, `rotate`, `maxlen` |
| `namedtuple` | Lightweight immutable records | `_replace`, `_asdict` |
| `OrderedDict` | LRU caches and order-sensitive equality | `move_to_end`, `popitem(last=False)` |
| `ChainMap` | Layered lookups (CLI args → env → defaults) | `new_child()` |

```python
from collections import ChainMap, Counter, OrderedDict, defaultdict, deque, namedtuple

c = Counter("abracadabra")
assert c.most_common(2) == [("a", 5), ("b", 2)]
assert c["zzz"] == 0                         # missing keys count as 0, no KeyError
assert c.total() == 11                       # 3.10+
assert Counter(a=3, b=1) - Counter(a=1, b=2) == Counter(a=2)   # drops counts <= 0

by_plan: defaultdict[str, list[str]] = defaultdict(list)
for name, plan in [("Ana", "gold"), ("Bo", "silver"), ("Cy", "gold")]:
    by_plan[plan].append(name)
assert by_plan["gold"] == ["Ana", "Cy"]

q = deque([1, 2, 3])
q.appendleft(0)
assert q.popleft() == 0 and q.pop() == 3
last3 = deque(maxlen=3)                      # keeps only the newest 3 items
for x in range(5):
    last3.append(x)
assert list(last3) == [2, 3, 4]

Point = namedtuple("Point", "x y")
p = Point(1, 2)
assert p.x == 1 and p._replace(x=5) == Point(5, 2)

od = OrderedDict(a=1, b=2, c=3)
od.move_to_end("a")                          # most recently used goes to the end
assert list(od) == ["b", "c", "a"]
assert od.popitem(last=False) == ("b", 2)    # evict the oldest

settings = ChainMap({"debug": True}, {"debug": False, "port": 8000})
assert settings["debug"] is True and settings["port"] == 8000
```

## `heapq` and `bisect`

`heapq` turns a plain list into a **binary min-heap**: `heap[0]` is always the smallest item. For a max-heap, push negated values. Python 3.14 also added public `heappush_max` and `heappop_max` functions. Push tuples to order by priority, and add a counter as a tie-breaker so Python never has to compare the payloads.

`bisect` does binary search on a **sorted** list.

```python
import bisect
import heapq
from itertools import count

nums = [5, 1, 8, 3, 9, 2]
assert heapq.nlargest(3, nums) == [9, 8, 5]       # top-k in O(n log k)
assert heapq.nsmallest(2, nums) == [1, 2]

heap = nums[:]
heapq.heapify(heap)                               # O(n)
assert heapq.heappop(heap) == 1

# A priority queue of tasks: (priority, tie-breaker, payload)
tie = count()
tasks: list[tuple[int, int, dict]] = []
heapq.heappush(tasks, (2, next(tie), {"job": "email"}))
heapq.heappush(tasks, (1, next(tie), {"job": "triage"}))
heapq.heappush(tasks, (1, next(tie), {"job": "page"}))   # same priority: the counter decides
assert [heapq.heappop(tasks)[2]["job"] for _ in range(3)] == ["triage", "page", "email"]

# Max-heap by negation
max_heap: list[int] = []
for n in [3, 7, 1]:
    heapq.heappush(max_heap, -n)
assert -max_heap[0] == 7

scores = [10, 20, 20, 30]
assert bisect.bisect_left(scores, 20) == 1        # first position where 20 could go
assert bisect.bisect_right(scores, 20) == 3       # after the last 20
bisect.insort(scores, 25)
assert scores == [10, 20, 20, 25, 30]

# Map a value to a band with bisect
def age_band(age: int) -> str:
    bounds, labels = [18, 40, 65], ["child", "adult", "middle", "senior"]
    return labels[bisect.bisect_right(bounds, age)]
assert [age_band(a) for a in (5, 18, 50, 80)] == ["child", "adult", "middle", "senior"]
```

## Sorting

- `sorted(iterable)` returns a **new list**. `list.sort()` sorts **in place** and returns `None`.
- Both use **Timsort**: O(n log n) in the worst case, O(n) on already sorted runs, and **stable**, so equal items keep their order.
- Sort with `key=`, not a comparison function. Use a tuple key for several fields, and negate numbers to reverse one field.
- Stability lets you sort by several keys in passes: sort by the secondary key first, then by the primary key.

```python
from operator import itemgetter

patients = [("Cy", 30), ("Ana", 30), ("Bo", 25)]
# Age descending, then name ascending
assert sorted(patients, key=lambda p: (-p[1], p[0])) == [("Ana", 30), ("Cy", 30), ("Bo", 25)]

# When you can't negate (e.g. a string), use two stable passes
rows = [("ana", "b"), ("bo", "a"), ("cy", "b")]
rows.sort(key=itemgetter(0), reverse=True)        # secondary key first
rows.sort(key=itemgetter(1))                      # primary key last
assert rows == [("bo", "a"), ("cy", "b"), ("ana", "b")]

words = ["banana", "Apple", "cherry"]
assert sorted(words, key=str.lower) == ["Apple", "banana", "cherry"]
assert max(words, key=len) == "banana"            # min/max also take key=
result = words.sort()
assert result is None                             # the classic bug: x = x.sort()
```

## Interview questions

### What is the difference between a list and a tuple? {core}

A list is **mutable**: you can append, remove and reorder. A tuple is **immutable** once created. That makes tuples hashable when their items are, so they can be dict keys or set members. They're slightly smaller and faster to create, and they signal intent: a fixed record like `(x, y)` or a database row.

Rule of thumb: use a list for a homogeneous collection that grows, and a tuple for a fixed structure. For a record with named fields, prefer a `namedtuple` or a frozen dataclass.

### How does a Python dict work internally? {core}

It's a **hash table**. To store a key, Python calls `hash(key)`, uses the hash to pick a slot, and resolves collisions with **open addressing**: it probes other slots in a pseudo-random sequence. On lookup, it compares hashes first and then `==` to confirm.

Since 3.6, CPython uses a compact layout: a small sparse index table pointing into a dense array of entries. This saves memory and is why dicts **preserve insertion order**, which has been guaranteed by the language since 3.7. The table resizes when it gets about two-thirds full. Average cost is O(1) for get, set and delete. The worst case is O(n) with many collisions, but randomised string hashing makes that hard to trigger.

### Why is `x in my_set` faster than `x in my_list`? {core}

A list has to scan elements one by one and compare each with `==`, which is O(n). A set hashes `x` and jumps straight to its slot, which is O(1) on average. If you test membership inside a loop, converting the list to a set once turns O(n·m) into O(n + m). That's one of the most common optimisations in interviews, and in real code too: deduplicating claim IDs, or checking a code against a set of valid ICD-10 codes.

### Are dictionaries ordered?

Yes. Since Python 3.7, the language guarantees that dicts keep **insertion order** (3.6 did it as a CPython implementation detail). Iteration, `keys()`, `values()` and `items()` follow that order, and `reversed(d)` works since 3.8. Updating an existing key's value doesn't move it. Deleting and reinserting moves it to the end. Equality between two dicts ignores order. Equality between two `OrderedDict`s does not (comparing an `OrderedDict` with a plain dict still ignores order), which is one reason `OrderedDict` still exists.

### When would you still use `OrderedDict`? {deep}

When you need its extra operations or semantics:

- `move_to_end(key)` and `popitem(last=False)` are O(1). They make an **LRU cache** trivial: move a key to the end on access, and evict from the front.
- Equality between two `OrderedDict`s is **order-sensitive**.
- It signals clearly that order is part of the meaning.

For plain "keep my keys in order", a normal dict is enough now.

### What is `Counter`, and what can it do beyond counting? {core}

`Counter` is a dict subclass mapping items to counts. `Counter(iterable)` counts in one O(n) pass, `most_common(k)` returns the top k, missing keys return 0 instead of raising `KeyError`, and `total()` (3.10+) sums the counts.

It also supports multiset arithmetic. `+` adds counts, `-` subtracts and drops results that are zero or negative, `&` takes the minimum and `|` the maximum. That makes anagram checks (`Counter(a) == Counter(b)`) and "can I build word X from letters Y" (`not Counter(x) - Counter(y)`) one-liners.

### `dict.get`, `setdefault` or `defaultdict`: which do you use when? {core}

- **`d.get(k, default)`** reads without inserting. Use it for lookups with a fallback.
- **`d.setdefault(k, [])`** inserts the default only if the key is missing, then returns the value. It's handy as a one-off, but the default object is built on every call, even when it isn't needed.
- **`defaultdict(list)`** calls the factory automatically for missing keys. It's the cleanest choice for grouping or counting in a loop.

One trap: with a `defaultdict`, even *reading* a missing key with `d[k]` inserts it. Use `k in d` or `d.get(k)` when you only want to check.

### Why use `deque` instead of a list for a queue? {core}

`list.pop(0)` and `list.insert(0, x)` are **O(n)**, because every element shifts. A `deque` (a doubly linked list of fixed-size blocks) gives **O(1)** `append`, `appendleft`, `pop` and `popleft`. Use it for BFS, task queues and sliding windows. `deque(maxlen=n)` automatically discards from the other end, which is perfect for "keep the last n events". The trade-off is indexing: it's O(n) in the middle, so don't use a deque for random access.

### How do you implement a priority queue in Python? {core}

Use `heapq` on a list. It's a binary **min-heap**, with O(log n) push and pop and O(1) peek at `heap[0]`. Push `(priority, counter, item)` tuples. The counter breaks ties, so Python never compares two items that may not be comparable, such as dicts, and equal priorities come out in first-in, first-out order.

For a max-heap, push `-priority`. Python 3.14 also added `heappush_max`/`heappop_max`. For top-k problems, `heapq.nlargest(k, xs)` runs in O(n log k). For thread-safe producer-consumer work, use `queue.PriorityQueue`, which wraps `heapq` with locks.

### What does `bisect` do? Give a practical use. {deep}

`bisect` does binary search on a **sorted** list in O(log n). `bisect_left` returns the first index where a value could be inserted, and `bisect_right` returns the index after any equal values. `insort` inserts while keeping the list sorted. The insert itself is O(n), because elements shift.

Practical uses: mapping a value to a band (age → band, score → grade) with a list of boundaries. Finding how many values fall in a range (`bisect_right(xs, hi) - bisect_left(xs, lo)`). Lookups in a sorted timeline of events. Since 3.10, the functions accept `key=`.

### What is the difference between `sort()` and `sorted()`? Is Python's sort stable? {core}

`list.sort()` sorts **in place** and returns `None`, so `x = x.sort()` is a classic bug. `sorted()` accepts any iterable and returns a **new list**. Both use **Timsort**, a hybrid of merge sort and insertion sort. It's O(n log n) in the worst case, close to O(n) on partly sorted data, and **stable**, meaning equal keys keep their original order.

Stability lets you sort by several keys: sort by the secondary key, then by the primary key. Or use a tuple key directly: `key=lambda p: (-p.age, p.name)`.

### How would you sort a list of dicts by two fields, one descending?

Use a tuple key and negate the numeric field: `sorted(rows, key=lambda r: (-r["visits"], r["name"]))`. If the descending field can't be negated, like a string, do two stable sorts: first by the ascending secondary key, then by the primary key with `reverse=True`. `operator.itemgetter("visits")` is a slightly faster, readable alternative to a lambda.

### What is a `namedtuple`, and how does it compare with a dataclass? {deep}

`namedtuple("Point", "x y")` creates a tuple subclass with named fields. It's immutable, hashable, lightweight, and unpacks like a tuple. A `@dataclass` is a regular class: mutable by default (`frozen=True` makes it immutable), with defaults, type hints, methods, and optional `slots=True`.

Use a namedtuple, or the typed `typing.NamedTuple`, for small immutable records that should behave like tuples, such as rows from a CSV. Use a dataclass when you want a real class with behaviour or mutable state. For validation of external data, use Pydantic instead.

### What happens if you modify a dict while iterating over it?

Adding or removing keys while iterating raises `RuntimeError: dictionary changed size during iteration`. Changing the value of an existing key is fine. To delete while looping, iterate over a snapshot (`for k in list(d):`) or build a new dict with a comprehension: `d = {k: v for k, v in d.items() if keep(v)}`. Mutating a list while iterating doesn't raise, but it silently skips elements, which is worse. Iterate over a copy or build a new list.

### How do set operations help in real code? {deep}

They express "compare two collections" in O(n) instead of nested loops:

- **Intersection `&`:** members present in both systems.
- **Difference `-`:** records in the source that never arrived in the target, which is a reconciliation check.
- **Symmetric difference `^`:** mismatches on either side.
- **Union `|`:** the combined set.

Dict `keys()` views support the same operators, so `old.keys() - new.keys()` finds removed config keys. Use `frozenset` when the set itself needs to be a dict key, for example to cache by a set of codes.

### What is the time complexity of common string operations? {deep}

Strings are immutable sequences:

- Indexing and `len` are O(1).
- Slicing is O(k), because it copies.
- `s.find(t)` and `t in s` are fast in practice. A naive search is O(n·m) in the worst case, but CPython 3.10+ switches to the linear-time two-way algorithm for longer patterns, so it stays close to O(n + m).
- Concatenating in a loop with `+=` can degrade to O(n²), because each step may copy. Collect pieces in a list and call `"".join(parts)` once, which is O(total length).
- `split`, `replace`, `upper` and `strip` are O(n) and return new strings.

### What does `ChainMap` do? {deep}

`ChainMap(a, b, c)` presents several dicts as one view. Lookups search them in order and return the first hit, and writes go to the first mapping. It's ideal for layered configuration: command-line overrides, then environment, then defaults. No merging or copying happens, so updates to the underlying dicts show up immediately. `new_child()` pushes a new scope, which is useful for implementing variable scopes.

### When would you use the `array` module or NumPy instead of a list? {deep}

A list stores **pointers** to full Python objects, so a million floats cost tens of megabytes. `array.array("d")` stores raw C doubles compactly, with no vectorised maths. **NumPy** arrays store typed contiguous memory *and* do vectorised operations in C, typically 10–100× faster than Python loops for numeric work. In ML and data pipelines, use NumPy or pandas. Use lists for general-purpose, mixed-type collections.
