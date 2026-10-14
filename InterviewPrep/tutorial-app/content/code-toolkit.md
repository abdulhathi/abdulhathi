---
title: Python toolkit for live coding
goal: Write clean, correct Python fast under pressure, using the built-ins interviewers expect a Python developer to know, and solve the classic warm-up problems without hesitation.
minutes: 60
---

In a live coding round the interviewer watches *how* you write Python as much as whether it works. Someone who reaches
for `Counter`, `enumerate`, `sorted(..., key=...)` and `deque` looks fluent. Someone who writes index loops and
hand-built dictionaries looks like a Python beginner, even when the answer is right.

This chapter is the toolkit: the idioms worth having in your fingers, what each built-in costs, the gotchas that sink
otherwise good answers, and twelve-plus warm-up problems. Warm-ups like these often open the round, so solve them
quickly, say the complexity, and move on. Every code block here runs as written.

## The idioms that save you minutes

### Looping

```python
names = ["Ana", "Bo", "Cy"]

# enumerate gives index and value together; start=1 for human numbering.
numbered = [f"{i}. {name}" for i, name in enumerate(names, start=1)]
assert numbered == ["1. Ana", "2. Bo", "3. Cy"]

# zip walks several sequences in step and stops at the shortest.
ages = [34, 27, 41]
assert list(zip(names, ages)) == [("Ana", 34), ("Bo", 27), ("Cy", 41)]
assert dict(zip(names, ages)) == {"Ana": 34, "Bo": 27, "Cy": 41}

# zip(strict=True) (Python 3.10+) raises if the lengths differ, instead of silently dropping items.
try:
    list(zip([1, 2], [1], strict=True))
    raise AssertionError("expected ValueError")
except ValueError:
    pass

from itertools import zip_longest
assert list(zip_longest([1, 2], [9], fillvalue=0)) == [(1, 9), (2, 0)]

# Counting down, and iterating backwards without copying.
assert list(range(5, 0, -1)) == [5, 4, 3, 2, 1]
assert list(reversed([1, 2, 3])) == [3, 2, 1]
```

### Sorting with a key

```python
from operator import itemgetter

patients = [("Ana", 34), ("Bo", 27), ("Cy", 34)]

# key= says what to compare. Python's sort is stable: equal keys keep their original order.
assert sorted(patients, key=lambda p: p[1]) == [("Bo", 27), ("Ana", 34), ("Cy", 34)]

# Several keys: build a tuple. Negate a number to sort that part descending.
assert sorted(patients, key=lambda p: (-p[1], p[0])) == [("Ana", 34), ("Cy", 34), ("Bo", 27)]

# min and max take key= too, and return the FIRST best item on ties.
assert max(patients, key=itemgetter(1)) == ("Ana", 34)

# Case-insensitive sort.
assert sorted(["banana", "Apple", "cherry"], key=str.lower) == ["Apple", "banana", "cherry"]

# list.sort() sorts in place and returns None; sorted() returns a new list and accepts any iterable.
nums = [3, 1, 2]
assert nums.sort(reverse=True) is None and nums == [3, 2, 1]
assert sorted("cab") == ["a", "b", "c"]
```

### Counting and grouping

```python
from collections import Counter, defaultdict

counts = Counter("mississippi")
assert counts["s"] == 4
assert counts["z"] == 0                      # missing keys count as 0, no KeyError
assert counts.most_common(2) == [("i", 4), ("s", 4)]

# Group items by a computed key.
groups: defaultdict[str, list[str]] = defaultdict(list)
for word in ["eat", "tea", "tan"]:
    groups["".join(sorted(word))].append(word)
assert dict(groups) == {"aet": ["eat", "tea"], "ant": ["tan"]}

# Plain dict equivalents, when you do not want an import.
freq: dict[str, int] = {}
for ch in "aab":
    freq[ch] = freq.get(ch, 0) + 1
assert freq == {"a": 2, "b": 1}

by_first: dict[str, list[str]] = {}
for word in ["apple", "avocado", "beet"]:
    by_first.setdefault(word[0], []).append(word)
assert by_first == {"a": ["apple", "avocado"], "b": ["beet"]}

# Dict merge (3.9+): the right-hand side wins on duplicate keys.
assert {"a": 1, "b": 2} | {"b": 3} == {"a": 1, "b": 3}
```

### Queues, heaps and binary search

```python
import bisect
import heapq
from collections import deque

# deque: O(1) appends and pops at BOTH ends. Use it for queues and BFS.
q = deque([1, 2, 3])
q.append(4)
q.appendleft(0)
assert q.popleft() == 0 and q.pop() == 4

# maxlen keeps only the last N items: a ready-made sliding window.
last3 = deque(maxlen=3)
for x in range(5):
    last3.append(x)
assert list(last3) == [2, 3, 4]

# heapq is a MIN-heap on a plain list.
heap = [5, 1, 4]
heapq.heapify(heap)              # O(n)
heapq.heappush(heap, 2)          # O(log n)
assert heap[0] == 1              # peek at the smallest
assert heapq.heappop(heap) == 1  # O(log n)
assert heapq.nlargest(2, [5, 1, 4, 2]) == [5, 4]
assert heapq.nsmallest(2, [5, 1, 4, 2]) == [1, 2]

# Max-heap trick that works on every Python version: push negated values.
max_heap: list[int] = []
for x in [5, 1, 4]:
    heapq.heappush(max_heap, -x)
assert -max_heap[0] == 5

# Heap of tuples: compared by the first item, then the second on ties.
tasks = [(2, "write tests"), (1, "fix bug")]
heapq.heapify(tasks)
assert heapq.heappop(tasks) == (1, "fix bug")

# bisect: binary search on a SORTED list.
scores = [10, 20, 20, 30]
assert bisect.bisect_left(scores, 20) == 1   # first position where 20 could go
assert bisect.bisect_right(scores, 20) == 3  # position after the last 20
bisect.insort(scores, 25)                    # finds the spot in O(log n), inserts in O(n)
assert scores == [10, 20, 20, 25, 30]
```

Python 3.14 added public max-heap functions (`heapq.heappush_max`, `heapq.heappop_max`, `heapq.heapify_max`).
The interviewer's environment may run an older Python, so know the negation trick first.

### Strings

```python
s = "  Hello, World  "
assert s.strip() == "Hello, World"
assert "a,b,,c".split(",") == ["a", "b", "", "c"]   # split(sep) keeps empty fields
assert "a   b\tc".split() == ["a", "b", "c"]        # split() with no argument collapses whitespace
assert "-".join(["2026", "10", "13"]) == "2026-10-13"
assert "abc"[::-1] == "cba"

assert "A1b".isalnum() and not "A1b!".isalnum()
assert "abc".isalpha() and "123".isdigit()
assert ord("a") == 97 and chr(98) == "b"
assert ord("c") - ord("a") == 2                    # letter index, handy for 26-slot count arrays

assert "banana".count("an") == 2
assert "banana".find("x") == -1                    # find returns -1; index would raise ValueError
assert "banana".replace("a", "o", 1) == "bonana"
assert f"{3.14159:.2f}" == "3.14" and f"{42:05d}" == "00042" and f"{1234567:,}" == "1,234,567"
```

### Numbers

```python
import math

assert divmod(17, 5) == (3, 2)
assert -7 // 2 == -4             # floor division rounds toward minus infinity
assert int(-7 / 2) == -3         # int() truncates toward zero
assert -7 % 3 == 2               # the result takes the sign of the divisor
assert 2**100 > 10**30           # ints never overflow in Python
assert float("inf") > 10**100    # a safe starting value for a running minimum

assert math.gcd(12, 18) == 6 and math.lcm(4, 6) == 12
assert math.isqrt(17) == 4       # exact integer square root, no float error
assert int("1011", 2) == 11 and bin(11) == "0b1011" and bin(11).count("1") == 3
assert round(2.5) == 2 and round(3.5) == 4   # banker's rounding: ties go to the even number

assert any(x > 3 for x in [1, 5]) and all(x > 0 for x in [1, 5])
assert min([], default=0) == 0   # default= avoids ValueError on an empty sequence
```

### itertools you will actually use

```python
from itertools import accumulate, combinations, groupby, pairwise, permutations, product

assert list(accumulate([1, 2, 3, 4])) == [1, 3, 6, 10]                  # running (prefix) sums
assert list(combinations("abc", 2)) == [("a", "b"), ("a", "c"), ("b", "c")]
assert len(list(permutations("abc"))) == 6
assert list(product([0, 1], repeat=2)) == [(0, 0), (0, 1), (1, 0), (1, 1)]
assert [(k, len(list(g))) for k, g in groupby("aaabcc")] == [("a", 3), ("b", 1), ("c", 2)]
assert list(pairwise([1, 2, 4])) == [(1, 2), (2, 4)]                    # 3.10+
```

`groupby` only groups *consecutive* equal items. Sort first if you want one group per key.

## What the built-ins cost

| Operation | Cost | Note |
|---|---|---|
| `lst[i]`, `lst[i] = x`, `len(lst)` | O(1) | A list is a dynamic array |
| `lst.append(x)`, `lst.pop()` | O(1) amortised | Occasional resize copies everything |
| `lst.insert(0, x)`, `lst.pop(0)` | O(n) | Every element shifts: use `deque` |
| `x in lst`, `lst.index(x)`, `lst.remove(x)` | O(n) | Linear scan |
| `lst[a:b]` | O(b − a) | A slice is a copy |
| `lst.sort()`, `sorted(it)` | O(n log n) | Stable; O(n) on already-sorted data |
| `x in s`, `s.add(x)`, `d[k]`, `d[k] = v`, `del d[k]` | O(1) average | O(n) worst case with heavy collisions |
| `deque.append / appendleft / pop / popleft` | O(1) | `deque[i]` in the middle is O(n) |
| `heappush`, `heappop` | O(log n) | `heapify` is O(n); `heap[0]` peek is O(1) |
| `bisect_left`, `bisect_right` | O(log n) | `insort` is O(n) because of the insert |
| `"".join(parts)` | O(total length) | Build strings this way |
| `s += piece` in a loop | O(n²) worst case | Strings are immutable; each `+=` may copy |
| `min`, `max`, `sum`, `Counter(it)` | O(n) | One pass |
| `set_a & set_b` | O(min(len(a), len(b))) | Iterates over the smaller set |

## Gotchas that sink good answers

```python
# 1. [[0] * cols] * rows repeats the SAME inner list.
grid = [[0] * 3] * 2
grid[0][0] = 1
assert grid == [[1, 0, 0], [1, 0, 0]]          # both rows changed
grid = [[0] * 3 for _ in range(2)]             # one new list per row
grid[0][0] = 1
assert grid == [[1, 0, 0], [0, 0, 0]]

# 2. Removing from a list while iterating over it skips elements.
nums = [1, 2, 2, 3]
for x in nums:
    if x == 2:
        nums.remove(x)
assert nums == [1, 2, 3]                       # one 2 survived
nums = [1, 2, 2, 3]
assert [x for x in nums if x != 2] == [1, 3]   # build a new list instead

# 3. A mutable default argument is created once and shared by every call.
def add_bad(item: int, bucket: list[int] = []) -> list[int]:
    bucket.append(item)
    return bucket

assert add_bad(1) == [1]
assert add_bad(2) == [1, 2]                    # surprise: the same list

def add(item: int, bucket: list[int] | None = None) -> list[int]:
    bucket = [] if bucket is None else bucket
    bucket.append(item)
    return bucket

assert add(1) == [1] and add(2) == [2]

# 4. Copying: b = a copies the reference; a slice or list() copies one level only.
a = [[1], [2]]
b = a[:]
b[0].append(99)
assert a == [[1, 99], [2]]                     # the inner lists are shared

# 5. Compare to None with "is", values with "==".
value = None
assert value is None
```

Two more to keep in mind:

- **Recursion depth.** CPython's default limit is 1,000 frames (`sys.getrecursionlimit()`). A recursive DFS on a
  100,000-node path raises `RecursionError`. Say so, and offer an iterative version with an explicit stack.
- **Adding or removing dict keys while iterating over it** raises `RuntimeError` (changing values is fine). Iterate
  over `list(d)` or build a new dict.

## Test your function in 30 seconds

Before saying "done", run a handful of cases, including the edge cases. A table of tests reads well in an interview:

```python
def running_max(nums: list[int]) -> list[int]:
    out: list[int] = []
    best = float("-inf")
    for x in nums:
        best = max(best, x)
        out.append(best)
    return out

cases = [
    ([3, 1, 4, 1, 5], [3, 3, 4, 4, 5]),   # normal
    ([], []),                              # empty
    ([7], [7]),                            # single element
    ([-2, -5], [-2, -2]),                  # negatives
]
for given, want in cases:
    got = running_max(given)
    assert got == want, f"{given}: got {got}, want {want}"
```

Edge cases to check every time: empty input, one element, all equal, duplicates, negatives and zero, already sorted,
reverse sorted, and the largest allowed size.

## Interview questions

### What does `x in my_list` cost compared with `x in my_set`? {core}

`x in my_list` scans the list, so it is O(n). `x in my_set` hashes `x` and checks one bucket, so it is O(1) on average.
If you test membership inside a loop, convert the list to a set first. That turns an O(n²) solution into O(n).

The worst case for a set is O(n), when many keys collide, but with Python's hash functions that does not happen on
normal data. Mention it only if asked.

### Why is `list.pop(0)` slow, and what do you use instead? {core}

A Python list is a dynamic array. Removing the first element shifts every other element one slot left: O(n).
`collections.deque` is a doubly-linked list of fixed-size blocks, so `popleft()` and `appendleft()` are O(1).
Use a deque for every queue, especially in BFS.

### How does Python sort, and is it stable? {core}

`list.sort()` and `sorted()` use Timsort (since Python 3.11 with the Powersort merge policy): a merge-sort hybrid
that finds runs that are already in order. It is O(n log n) in the worst case, O(n) on sorted data, and **stable**:
items with equal keys keep their original order. Stability lets you sort by several keys in passes, or rely on ties
staying in input order.

### How do you get a max-heap in Python? {core}

`heapq` is a min-heap. The portable trick is to push negated values: `heappush(h, -x)` and read `-h[0]`. For tuples,
negate the priority: `(-priority, item)`. Python 3.14 added `heapq.heappush_max` and friends, but the interviewer's
environment may run an older version.

### What is the difference between `sort()` and `sorted()`?

`lst.sort()` sorts the list in place and returns `None`. `sorted(iterable)` returns a new list and works on any
iterable: a string, a dict's keys, a generator. A common bug is `nums = nums.sort()`, which sets `nums` to `None`.

### Why should you avoid building a string with `+=` in a loop?

Strings are immutable, so each `+=` can create a new string and copy everything so far: O(n²) in total. CPython
sometimes optimises this in place, but you should not rely on it. Collect pieces in a list and `"".join(parts)` once,
which is O(n).

### When does `defaultdict` beat `dict.get`, and when does `Counter` beat both?

`dict.get(k, 0) + 1` is fine for one-off counting. `defaultdict(list)` is cleaner for grouping, because
`groups[key].append(x)` creates the list automatically. `Counter` is the right tool for frequencies: it counts an
iterable in one call, returns 0 for missing keys, and has `most_common(k)` and multiset arithmetic (`c1 - c2`, `c1 & c2`).

### What do you do if a recursive solution might be too deep? {deep}

CPython's default recursion limit is 1,000. For deep inputs (a linked list or a degenerate tree with 10⁵ nodes),
rewrite the recursion as a loop with an explicit stack, or a deque for BFS. `sys.setrecursionlimit` works for
moderate depths but can crash the interpreter if the C stack overflows, so the iterative version is the safe answer.

## Coding problems

### FizzBuzz {easy}

Return a list of strings for the numbers 1 to `n`: `"Fizz"` for multiples of 3, `"Buzz"` for multiples of 5,
`"FizzBuzz"` for multiples of both, otherwise the number itself.

`fizzbuzz(5)` → `["1", "2", "Fizz", "4", "Buzz"]`

#### Hints

1. Check the "both" case first, or build the word up piece by piece.
2. Building the word piece by piece makes adding a new rule (7 → "Bazz") a one-line change.

#### Solution

The usual bug is checking 3 before 15, so 15 prints "Fizz". Building the word from a list of rules avoids the
special case entirely and shows the interviewer you think about extension.

```python
def fizzbuzz(n: int) -> list[str]:
    rules = [(3, "Fizz"), (5, "Buzz")]
    out: list[str] = []
    for i in range(1, n + 1):
        word = "".join(text for divisor, text in rules if i % divisor == 0)
        out.append(word or str(i))
    return out

assert fizzbuzz(5) == ["1", "2", "Fizz", "4", "Buzz"]
assert fizzbuzz(15)[-1] == "FizzBuzz"
assert fizzbuzz(15)[8:10] == ["Fizz", "Buzz"]   # 9 and 10
assert fizzbuzz(0) == []
```

Complexity: O(n) time, O(n) for the output.

#### Follow-ups

- **Add "Bazz" for multiples of 7.** Append `(7, "Bazz")` to `rules`; 105 becomes "FizzBuzzBazz".
- **Stream instead of building a list?** Turn it into a generator with `yield`, so memory stays O(1).

### Reverse each word {easy}

Reverse the letters of every word but keep the words in their original order and keep the spaces exactly as they are.

`"Hello World"` → `"olleH dlroW"`; `"a  bc"` (two spaces) → `"a  cb"`

#### Hints

1. Work one word at a time: what separates the words, and how do you reverse one word in Python?
2. `split(" ")` (with an explicit separator) keeps empty strings for repeated spaces, so joining with `" "` restores them.

#### Solution

`s.split()` with no argument would collapse the double space. `s.split(" ")` turns `"a  bc"` into `["a", "", "bc"]`,
and joining with a single space puts both spaces back.

```python
def reverse_each_word(s: str) -> str:
    return " ".join(word[::-1] for word in s.split(" "))

assert reverse_each_word("Hello World") == "olleH dlroW"
assert reverse_each_word("a  bc") == "a  cb"
assert reverse_each_word("") == ""
assert reverse_each_word(" lead") == " dael"
```

Complexity: O(n) time and O(n) space for the result.

#### Follow-ups

- **Tabs and newlines too?** Split with `re.split(r"(\s+)", s)`, which keeps the whitespace runs as separate items; reverse only the non-space items.
- **Do it without slicing?** Walk the string, collect characters of the current word, and emit them reversed at each space.

### Valid palindrome {easy core}

Return `True` if a string reads the same forwards and backwards after lower-casing it and removing everything that is
not a letter or a digit.

`"A man, a plan, a canal: Panama"` → `True`; `"race a car"` → `False`

#### Hints

1. The simple version: clean the string, then compare it with its reverse.
2. To use O(1) extra space, move two pointers inward and skip non-alphanumeric characters.

#### Solution

Start with the clean-and-compare version: it is correct and O(n). Then offer the two-pointer version, which avoids
building a second string.

```python
def is_palindrome_simple(s: str) -> bool:
    cleaned = [ch.lower() for ch in s if ch.isalnum()]
    return cleaned == cleaned[::-1]

def is_palindrome(s: str) -> bool:
    left, right = 0, len(s) - 1
    while left < right:
        if not s[left].isalnum():
            left += 1
        elif not s[right].isalnum():
            right -= 1
        elif s[left].lower() != s[right].lower():
            return False
        else:
            left += 1
            right -= 1
    return True

for fn in (is_palindrome_simple, is_palindrome):
    assert fn("A man, a plan, a canal: Panama")
    assert not fn("race a car")
    assert fn("")
    assert fn(" .,")          # nothing left after cleaning
    assert fn("0P") is False  # digits count
    assert fn("ab_a")
```

Complexity: both are O(n) time; the two-pointer version uses O(1) extra space.

#### Follow-ups

- **Allow deleting at most one character?** On the first mismatch, check whether skipping the left or the right character leaves a palindrome.
- **Unicode text?** `str.isalnum` and `str.lower` already handle Unicode; for case-insensitive comparison of all scripts, use `casefold()`.

### Count vowels and consonants {easy}

Return a tuple `(vowels, consonants)` for the letters in a string. Ignore digits, spaces and punctuation. Treat
"aeiou" as vowels, case-insensitive.

`"Hello, World!"` → `(3, 7)`

#### Hints

1. Keep the vowels in a set for O(1) membership tests.
2. Only count characters where `ch.isalpha()` is true.

#### Solution

```python
VOWELS = frozenset("aeiou")

def count_letters(s: str) -> tuple[int, int]:
    vowels = consonants = 0
    for ch in s.lower():
        if not ch.isalpha():
            continue
        if ch in VOWELS:
            vowels += 1
        else:
            consonants += 1
    return vowels, consonants

assert count_letters("Hello, World!") == (3, 7)
assert count_letters("") == (0, 0)
assert count_letters("AEIOU xyz 123") == (5, 3)
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **What about "é"?** `isalpha()` is true for accented letters, so "é" counts as a consonant here. Normalise with `unicodedata.normalize("NFD", s)` and drop combining marks if accents should count as their base vowel.
- **Return counts per vowel?** `Counter(ch for ch in s.lower() if ch in VOWELS)`.

### Second largest distinct number {easy core}

Return the second largest *distinct* value in a list, or `None` if there is none. Do not sort.

`[3, 5, 1, 5, 4]` → `4`; `[7, 7]` → `None`

#### Hints

1. The quick answer is `sorted(set(nums))[-2]`, but that is O(n log n). Mention it, then improve.
2. Track the largest and second largest in one pass.
3. When a new largest arrives, the old largest becomes the second. Skip values equal to the largest.

#### Solution

The brute force sorts the distinct values. The one-pass version keeps two variables, and the duplicate check
(`x != first`) is what makes `[5, 5, 4]` return 4 instead of 5.

```python
def second_largest(nums: list[int]) -> int | None:
    first: int | None = None
    second: int | None = None
    for x in nums:
        if first is None or x > first:
            first, second = x, first
        elif x != first and (second is None or x > second):
            second = x
    return second

def second_largest_sorted(nums: list[int]) -> int | None:
    distinct = sorted(set(nums))
    return distinct[-2] if len(distinct) >= 2 else None

for fn in (second_largest, second_largest_sorted):
    assert fn([3, 5, 1, 5, 4]) == 4
    assert fn([7, 7]) is None
    assert fn([]) is None
    assert fn([1]) is None
    assert fn([5, 5, 4]) == 4
    assert fn([-1, -3, -2]) == -2
    assert fn([2, 1]) == 1
```

Using `None` instead of `float("-inf")` keeps the return type honest and handles all-negative input.

Complexity: O(n) time, O(1) space for the one-pass version.

#### Follow-ups

- **The k-th largest?** `heapq.nlargest(k, set(nums))[-1]` is O(n log k); quickselect is O(n) on average.
- **Duplicates count as separate values?** Drop the `x != first` check.

### Remove duplicates, keeping the order {easy core}

Return the items of a list with duplicates removed, keeping the first occurrence of each, in the original order.

`[3, 1, 3, 2, 1]` → `[3, 1, 2]`

#### Hints

1. `set(items)` removes duplicates but loses the order.
2. Keep a `seen` set and append each item the first time you meet it.
3. Dicts keep insertion order, so `dict.fromkeys(items)` does it in one line.

#### Solution

```python
from collections.abc import Hashable, Iterable

def dedupe(items: Iterable[Hashable]) -> list[Hashable]:
    seen: set[Hashable] = set()
    out: list[Hashable] = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out

def dedupe_short(items: list) -> list:
    return list(dict.fromkeys(items))

for fn in (dedupe, dedupe_short):
    assert fn([3, 1, 3, 2, 1]) == [3, 1, 2]
    assert fn([]) == []
    assert fn(["a", "A", "a"]) == ["a", "A"]
```

Complexity: O(n) time and O(n) space. A nested "is it already in `out`?" check would be O(n²).

#### Follow-ups

- **Case-insensitive, keeping the first spelling?** Track `item.lower()` in `seen` but append the original `item`.
- **Unhashable items such as dicts?** Use a hashable key, for example `tuple(sorted(d.items()))`, or a chosen field such as a patient ID.

### Valid anagram {easy core}

Return `True` if two strings contain exactly the same characters with the same counts.

`("listen", "silent")` → `True`; `("rat", "car")` → `False`

#### Hints

1. Sorting both strings and comparing works in O(n log n).
2. Counting characters works in O(n).
3. Check the lengths first: different lengths can never be anagrams.

#### Solution

```python
from collections import Counter

def is_anagram(a: str, b: str) -> bool:
    return len(a) == len(b) and Counter(a) == Counter(b)

def is_anagram_sorted(a: str, b: str) -> bool:
    return sorted(a) == sorted(b)

def is_anagram_lowercase(a: str, b: str) -> bool:
    """Only lowercase a-z: a fixed array of 26 counts, O(1) extra space."""
    if len(a) != len(b):
        return False
    counts = [0] * 26
    for x, y in zip(a, b):
        counts[ord(x) - ord("a")] += 1
        counts[ord(y) - ord("a")] -= 1
    return all(c == 0 for c in counts)

for fn in (is_anagram, is_anagram_sorted, is_anagram_lowercase):
    assert fn("listen", "silent")
    assert not fn("rat", "car")
    assert fn("", "")
    assert not fn("a", "ab")
    assert not fn("aab", "abb")
```

Complexity: `Counter` is O(n) time and O(k) space for k distinct characters; sorting is O(n log n).

#### Follow-ups

- **Ignore spaces and case?** Normalise first: `"".join(s.lower().split())`.
- **Find all anagrams of p inside s?** A sliding window of size `len(p)` with a running count (see the sliding window chapter).

### Missing number {easy core}

A list holds `n` distinct numbers taken from `0..n`, so exactly one is missing. Find it in O(n) time and O(1) extra space.

`[3, 0, 1]` → `2`

#### Hints

1. A set of all numbers works but uses O(n) space.
2. The sum of `0..n` is `n * (n + 1) // 2`. Subtract the actual sum.
3. XOR also works: `x ^ x == 0`, so XOR-ing every index and every value leaves the missing number.

#### Solution

```python
from functools import reduce
from operator import xor

def missing_number(nums: list[int]) -> int:
    n = len(nums)
    return n * (n + 1) // 2 - sum(nums)

def missing_number_xor(nums: list[int]) -> int:
    return reduce(xor, range(len(nums) + 1), 0) ^ reduce(xor, nums, 0)

for fn in (missing_number, missing_number_xor):
    assert fn([3, 0, 1]) == 2
    assert fn([0, 1]) == 2
    assert fn([1]) == 0
    assert fn([9, 6, 4, 2, 3, 5, 7, 0, 1]) == 8
```

Python ints never overflow, so the sum formula is safe. In Java or C++ the XOR version avoids overflow, which is
worth saying out loud.

Complexity: O(n) time, O(1) extra space.

#### Follow-ups

- **Numbers are 1..n instead?** The expected sum becomes `(n + 1) * (n + 2) // 2` with `n = len(nums)`.
- **Two numbers missing?** Use the sum and the sum of squares to get two equations, or XOR and split by a set bit.

### Digit sum and digital root {easy}

Write `digit_sum(n)` that adds the digits of an integer (ignore the sign), and `digital_root(n)` that keeps adding
digits until one digit remains.

`digit_sum(1234)` → `10`; `digital_root(9875)` → `2` (9+8+7+5 = 29 → 2+9 = 11 → 1+1 = 2)

#### Hints

1. `sum(int(d) for d in str(abs(n)))` is fine; the arithmetic version uses `divmod(n, 10)`.
2. For the digital root, loop while the number has more than one digit.
3. There is a closed form for positive n: `1 + (n - 1) % 9`.

#### Solution

```python
def digit_sum(n: int) -> int:
    n = abs(n)
    total = 0
    while n:
        n, digit = divmod(n, 10)
        total += digit
    return total

def digital_root(n: int) -> int:
    n = abs(n)
    while n >= 10:
        n = digit_sum(n)
    return n

def digital_root_formula(n: int) -> int:
    n = abs(n)
    return 0 if n == 0 else 1 + (n - 1) % 9

assert digit_sum(1234) == 10 and digit_sum(-56) == 11 and digit_sum(0) == 0
for fn in (digital_root, digital_root_formula):
    assert fn(9875) == 2
    assert fn(0) == 0
    assert fn(9) == 9
    assert fn(18) == 9
assert all(digital_root(n) == digital_root_formula(n) for n in range(10_000))
```

Complexity: `digit_sum` is O(d) for d digits; the formula is O(1).

#### Follow-ups

- **Why does the formula work?** 10 ≡ 1 (mod 9), so a number and its digit sum leave the same remainder when divided by 9.

### Fibonacci {easy core}

Return the n-th Fibonacci number, with `fib(0) = 0` and `fib(1) = 1`.

`fib(10)` → `55`

#### Hints

1. The textbook recursion `fib(n - 1) + fib(n - 2)` recomputes the same values: O(2ⁿ).
2. Cache results (`functools.cache`) to make the recursion O(n).
3. Or loop, keeping only the last two values: O(n) time, O(1) space.

#### Solution

Name the naive recursion and its exponential cost, then give the iterative version as the answer. The cached
version is a good bridge to dynamic programming.

```python
from functools import cache
from collections.abc import Iterator

def fib(n: int) -> int:
    if n < 0:
        raise ValueError("n must be non-negative")
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

@cache
def fib_memo(n: int) -> int:
    return n if n < 2 else fib_memo(n - 1) + fib_memo(n - 2)

def fib_stream() -> Iterator[int]:
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

assert [fib(i) for i in range(10)] == [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
assert fib(10) == 55 == fib_memo(10)
assert fib(90) == 2880067194370816120
from itertools import islice
assert list(islice(fib_stream(), 6)) == [0, 1, 1, 2, 3, 5]
try:
    fib(-1)
    raise AssertionError("expected ValueError")
except ValueError:
    pass
```

Complexity: iterative O(n) time and O(1) space; memoised O(n) time and O(n) space (plus recursion depth, so it fails
past about 1,000 on a cold cache).

#### Follow-ups

- **Very large n (10¹⁸) modulo a prime?** Matrix exponentiation or fast doubling: O(log n).
- **Climbing stairs (1 or 2 steps)?** The same recurrence, shifted by one.

### Primes up to n {medium}

Return all primes less than or equal to `n`.

`primes_up_to(20)` → `[2, 3, 5, 7, 11, 13, 17, 19]`

#### Hints

1. Testing one number: try divisors only up to its square root.
2. For all numbers up to n, the Sieve of Eratosthenes crosses out multiples of each prime.
3. Start crossing out at `p * p`: smaller multiples were already crossed out by smaller primes.

#### Solution

Trial division for every number is O(n√n). The sieve is O(n log log n), close to linear.

```python
import math

def is_prime(n: int) -> bool:
    if n < 2:
        return False
    if n % 2 == 0:
        return n == 2
    for d in range(3, math.isqrt(n) + 1, 2):
        if n % d == 0:
            return False
    return True

def primes_up_to(n: int) -> list[int]:
    if n < 2:
        return []
    is_p = [True] * (n + 1)
    is_p[0] = is_p[1] = False
    for p in range(2, math.isqrt(n) + 1):
        if is_p[p]:
            is_p[p * p :: p] = [False] * len(range(p * p, n + 1, p))
    return [i for i, flag in enumerate(is_p) if flag]

assert primes_up_to(20) == [2, 3, 5, 7, 11, 13, 17, 19]
assert primes_up_to(1) == [] and primes_up_to(2) == [2]
assert primes_up_to(1000) == [i for i in range(1001) if is_prime(i)]
assert len(primes_up_to(100_000)) == 9592
```

Complexity: O(n log log n) time, O(n) space.

#### Follow-ups

- **Is a single huge number prime?** Trial division needs about √n steps, far too many for an 18-digit number; mention Miller–Rabin.
- **Why slice assignment?** It crosses out all multiples in C instead of a Python loop, which is much faster.

### Most frequent character {easy}

Return the character that appears most often. On a tie, return the one that appears first in the string. Return
`None` for an empty string.

`"abracadabra"` → `"a"`; `"abba"` → `"a"`

#### Hints

1. Count with `Counter`.
2. `max(counts, key=counts.get)` returns the first key with the highest count, because dicts keep insertion order.

#### Solution

```python
from collections import Counter

def most_frequent_char(s: str) -> str | None:
    if not s:
        return None
    counts = Counter(s)
    return max(counts, key=counts.get)

assert most_frequent_char("abracadabra") == "a"
assert most_frequent_char("abba") == "a"     # tie: "a" appears first
assert most_frequent_char("bbaa") == "b"
assert most_frequent_char("") is None
assert most_frequent_char("z") == "z"
```

`Counter` keeps the order in which keys first appear, and `max` returns the first maximal element, so ties resolve
to the earliest character without extra work.

Complexity: O(n) time, O(k) space for k distinct characters.

#### Follow-ups

- **Ignore case and spaces?** Count `ch.lower()` for `ch` in `s` if `ch.isalpha()`.
- **Top three characters?** `counts.most_common(3)`.

### Is one string a rotation of another? {easy}

Return `True` if `b` can be obtained by rotating `a` (moving some characters from the front to the back).

`("waterbottle", "erbottlewat")` → `True`

#### Hints

1. Try every split point of `a`: O(n²).
2. Every rotation of `a` appears inside `a + a`.

#### Solution

Write out `a + a` for "abcd": "abcdabcd" contains "bcda", "cdab" and "dabc". So `b` is a rotation exactly when the
lengths match and `b` is a substring of `a + a`.

```python
def is_rotation(a: str, b: str) -> bool:
    return len(a) == len(b) and b in a + a

assert is_rotation("waterbottle", "erbottlewat")
assert not is_rotation("abc", "acb")
assert is_rotation("", "")
assert not is_rotation("aa", "a")      # the length check matters
assert is_rotation("abcd", "abcd")     # rotating by 0
```

Complexity: O(n) extra space for `a + a`; the substring search is linear on typical inputs.

#### Follow-ups

- **By how many positions was it rotated?** `(a + a).find(b)` gives the offset.
