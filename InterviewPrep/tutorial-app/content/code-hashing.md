---
title: Hash maps and counting
goal: Recognise when a dict, set or Counter turns an O(n²) search into O(n), and solve the classic hash map problems cleanly in Python.
minutes: 80
---

The single most useful idea in coding interviews is: **if you keep searching for something, store it in a hash map**.
Two Sum, anagram grouping, duplicates, frequencies and subarray sums are all variations of it. In Python the tools
are `dict`, `set`, `collections.Counter` and `collections.defaultdict`, and fluent use of them is exactly what a
"strong Python" interviewer is looking for.

For each problem, name the nested-loop brute force, then say what the map remembers. That sentence ("the map holds
every value seen so far, mapped to its index") is most of the explanation.

## How a hash map earns O(1)

A dict hashes the key to a number, uses it to pick a slot in an array, and stores the key and value there. A lookup
hashes the key again and goes straight to that slot. When two keys land in the same slot (a collision), CPython
probes other slots. The table resizes as it fills, so the average cost of get, set, delete and `in` stays O(1).

The worst case is O(n), when many keys collide, but that does not happen with normal data. Since Python 3.7, dicts
also keep insertion order, which several solutions below rely on.

### What can be a key

A key must be **hashable**: its hash never changes while it is in the map. Immutable built-ins are hashable: `int`,
`str`, `tuple` of hashables, `frozenset`. Lists, dicts and sets are not.

```python
seen = {(1, 2): "tuple keys are fine", frozenset({"a", "b"}): "so are frozensets"}
assert seen[(1, 2)] == "tuple keys are fine"

try:
    {[1, 2]: "list"}
    raise AssertionError("expected TypeError")
except TypeError:
    pass                     # unhashable type: 'list'

# Turn a list into a key by converting it to a tuple.
key = tuple(sorted(["b", "a"]))
assert key == ("a", "b")
```

## The patterns

| Pattern | What the map stores | Problems |
|---|---|---|
| Complement lookup | value → index seen so far | Two Sum |
| Seen set | values seen so far | Contains duplicate, happy number |
| Frequency count | value → count (`Counter`) | Top k frequent, ransom note, majority |
| Group by signature | signature → list of items | Group anagrams |
| Prefix sum + count | running sum → how many times seen | Subarray sum equals k |
| Two-way mapping | char → char, both directions | Isomorphic strings |
| Membership for neighbours | set of all values | Longest consecutive sequence |

## Interview questions

### Why is dict lookup O(1) on average, and when is it not? {core}

The key is hashed to pick a slot in an array, so finding it does not depend on how many items are stored. Collisions
are resolved by probing other slots, and the table grows to keep it sparse, so the average stays O(1). If many keys
had the same hash, lookups would degrade to O(n), but Python's hash functions make that rare on real data.

### What makes an object hashable, and why can't a list be a dict key? {core}

An object is hashable if it has a hash that never changes during its lifetime and it can be compared with `==`.
Equal objects must have equal hashes. A list can change after you insert it, which would change its hash and strand
it in the wrong slot, so lists are unhashable. Use a tuple instead. Your own classes are hashable by identity by
default. If you override `__eq__` without `__hash__`, Python sets `__hash__` to `None` and instances become
unhashable, so define `__hash__` from the same fields that `__eq__` compares.

### When would you sort instead of using a hash map?

Sorting costs O(n log n) but needs no extra memory if done in place, and it gives you order: neighbours, ranges, the
k smallest. A hash map gives O(n) time with O(n) memory but no order. If memory is tight or the output must be
ordered, sorting plus two pointers is often the better trade.

### `Counter` versus `defaultdict(int)` versus a plain dict? {core}

All three can count. `Counter(iterable)` counts in one call, returns 0 for missing keys without inserting them, and
adds `most_common(k)` and multiset operators (`+`, `-`, `&`, `|`). `defaultdict(int)` is a general dict that creates
missing keys on access, which is handy for grouping with `defaultdict(list)`. A plain dict with `get(k, 0)` needs no
import. In an interview, `Counter` reads best for frequencies.

### Set or dict? {core}

Use a set when you only need "have I seen this?", and a dict when you need to remember something about it: its index,
its count, its group. Both have O(1) average membership tests.

## Coding problems

### Two Sum {easy core}

Given a list of integers and a target, return the indices of the two numbers that add up to the target. Exactly one
answer exists, and you cannot use the same element twice.

`nums = [2, 7, 11, 15], target = 9` → `[0, 1]`

#### Hints

1. Brute force: check every pair, O(n²).
2. For each number x, the partner you need is `target - x`. Searching for it again and again is the slow part.
3. Store each number's index in a dict as you go, and check the dict for the partner before storing.

#### Solution

When you reach index i, the dict holds every earlier value mapped to its index. If the partner `target - x` is there,
you are done. Checking before inserting is what stops a number from pairing with itself, while `[3, 3]` with target 6
still works because the first 3 is already stored when the second arrives.

```python
def two_sum(nums: list[int], target: int) -> list[int]:
    index_of: dict[int, int] = {}
    for i, x in enumerate(nums):
        partner = target - x
        if partner in index_of:
            return [index_of[partner], i]
        index_of[x] = i
    return []

def two_sum_brute(nums: list[int], target: int) -> list[int]:
    for i in range(len(nums)):
        for j in range(i + 1, len(nums)):
            if nums[i] + nums[j] == target:
                return [i, j]
    return []

for fn in (two_sum, two_sum_brute):
    assert fn([2, 7, 11, 15], 9) == [0, 1]
    assert fn([3, 2, 4], 6) == [1, 2]       # 3 must not pair with itself
    assert fn([3, 3], 6) == [0, 1]
    assert fn([-1, -2, -3, -4, -5], -8) == [2, 4]
    assert fn([1, 2], 10) == []
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **The list is sorted?** Two pointers from both ends: O(n) time, O(1) space.
- **Return all pairs of values, without duplicates?** Sort and use two pointers, skipping repeated values, or use a set of seen values and a set of result pairs.
- **Count pairs?** Keep a `Counter` of seen values and add `seen[target - x]` at each step.

### Contains duplicate {easy core}

Return `True` if any value appears at least twice in the list.

`[1, 2, 3, 1]` → `True`; `[1, 2, 3, 4]` → `False`

#### Hints

1. Comparing every pair is O(n²); sorting and checking neighbours is O(n log n).
2. A set removes duplicates, so compare lengths. Or stop early at the first value already seen.

#### Solution

`len(set(nums)) != len(nums)` is one line and O(n). The loop version stops at the first duplicate, which is better
when duplicates are likely to appear early.

```python
def contains_duplicate(nums: list[int]) -> bool:
    return len(set(nums)) != len(nums)

def contains_duplicate_early_exit(nums: list[int]) -> bool:
    seen: set[int] = set()
    for x in nums:
        if x in seen:
            return True
        seen.add(x)
    return False

def contains_nearby_duplicate(nums: list[int], k: int) -> bool:
    """Is there a duplicate pair at most k positions apart?"""
    last_index: dict[int, int] = {}
    for i, x in enumerate(nums):
        if x in last_index and i - last_index[x] <= k:
            return True
        last_index[x] = i
    return False

for fn in (contains_duplicate, contains_duplicate_early_exit):
    assert fn([1, 2, 3, 1]) is True
    assert fn([1, 2, 3, 4]) is False
    assert fn([]) is False
    assert fn([7, 7]) is True

assert contains_nearby_duplicate([1, 2, 3, 1], 3) is True
assert contains_nearby_duplicate([1, 2, 3, 1, 2, 3], 2) is False
assert contains_nearby_duplicate([1, 0, 1, 1], 1) is True
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **Duplicates within k positions?** Remember each value's last index, as in `contains_nearby_duplicate`.
- **O(1) extra space allowed only?** Sort in place and compare neighbours: O(n log n) time.

### Group anagrams {medium core}

Group words that are anagrams of each other.

`["eat", "tea", "tan", "ate", "nat", "bat"]` → `[["eat", "tea", "ate"], ["tan", "nat"], ["bat"]]` (any order)

#### Hints

1. Two words are anagrams if they have the same letters with the same counts.
2. Give every word a signature that is identical for anagrams, and group by it.
3. The sorted letters make a good signature; a tuple of 26 counts is faster for long words.

#### Solution

The signature is the dict key, and `defaultdict(list)` collects the words for each one. Sorting each word costs
O(k log k) for a word of length k; the 26-count signature costs O(k) but only works for a fixed alphabet.

```python
from collections import defaultdict

def group_anagrams(words: list[str]) -> list[list[str]]:
    groups: defaultdict[str, list[str]] = defaultdict(list)
    for word in words:
        groups["".join(sorted(word))].append(word)
    return list(groups.values())

def group_anagrams_counts(words: list[str]) -> list[list[str]]:
    groups: defaultdict[tuple[int, ...], list[str]] = defaultdict(list)
    for word in words:
        counts = [0] * 26
        for ch in word:
            counts[ord(ch) - ord("a")] += 1
        groups[tuple(counts)].append(word)
    return list(groups.values())

def normalise(groups: list[list[str]]) -> list[list[str]]:
    return sorted(sorted(g) for g in groups)

for fn in (group_anagrams, group_anagrams_counts):
    assert normalise(fn(["eat", "tea", "tan", "ate", "nat", "bat"])) == [["ate", "eat", "tea"], ["bat"], ["nat", "tan"]]
    assert fn([""]) == [[""]]
    assert fn(["a"]) == [["a"]]
    assert fn([]) == []
```

The `normalise` helper makes the test independent of group order, which is a nice touch to mention: the problem allows
any order.

Complexity: O(n · k log k) with sorted keys, O(n · k) with count keys, for n words of length up to k. O(n · k) space.

#### Follow-ups

- **Unicode words?** Use the sorted-string key (or `frozenset(Counter(word).items())`); the 26-slot array assumes a–z.
- **Return only groups with at least two words?** Filter `len(g) > 1`.

### Top k frequent elements {medium core}

Return the `k` most frequent values (any order).

`nums = [1, 1, 1, 2, 2, 3], k = 2` → `[1, 2]`

#### Hints

1. Count with `Counter`.
2. `Counter.most_common(k)` uses a heap: O(n log k).
3. For O(n): bucket sort. Make a list of buckets indexed by count, then read from the highest count down.

#### Solution

The idiomatic answer is `Counter(nums).most_common(k)`. If the interviewer asks for better than O(n log n), the bucket
approach works because a count can never exceed n.

```python
import heapq
from collections import Counter

def top_k_frequent(nums: list[int], k: int) -> list[int]:
    return [value for value, _ in Counter(nums).most_common(k)]

def top_k_frequent_heap(nums: list[int], k: int) -> list[int]:
    counts = Counter(nums)
    return heapq.nlargest(k, counts, key=counts.get)

def top_k_frequent_buckets(nums: list[int], k: int) -> list[int]:
    counts = Counter(nums)
    buckets: list[list[int]] = [[] for _ in range(len(nums) + 1)]
    for value, count in counts.items():
        buckets[count].append(value)
    out: list[int] = []
    for count in range(len(buckets) - 1, 0, -1):
        for value in buckets[count]:
            out.append(value)
            if len(out) == k:
                return out
    return out

for fn in (top_k_frequent, top_k_frequent_heap, top_k_frequent_buckets):
    assert sorted(fn([1, 1, 1, 2, 2, 3], 2)) == [1, 2]
    assert fn([1], 1) == [1]
    assert sorted(fn([4, 4, -1, -1, 2], 2)) == [-1, 4]
    assert fn([], 0) == []
```

Complexity: `most_common(k)` and the heap are O(n log k); buckets are O(n). All use O(n) space.

#### Follow-ups

- **Ties must break by value?** Sort the items with `key=lambda kv: (-kv[1], kv[0])` and take the first k.
- **Top k over a never-ending stream?** Keep counts in a dict and a size-k min-heap of (count, value), or approximate with Count-Min Sketch when memory is limited.

### Longest consecutive sequence {medium core}

Return the length of the longest run of consecutive integers that can be formed from the values (in any order).
Aim for O(n).

`[100, 4, 200, 1, 3, 2]` → `4` (1, 2, 3, 4)

#### Hints

1. Sorting and scanning works in O(n log n).
2. Put everything in a set so "is x + 1 present?" is O(1).
3. Only start counting at a number whose predecessor is missing: that is the start of a run.

#### Solution

Starting a count from every number would make it O(n²) on a long run. Starting only where `x - 1` is not in the set
means each run is walked exactly once, so the total work is O(n).

```python
def longest_consecutive(nums: list[int]) -> int:
    values = set(nums)
    best = 0
    for x in values:
        if x - 1 not in values:          # x starts a run
            length = 1
            while x + length in values:
                length += 1
            best = max(best, length)
    return best

assert longest_consecutive([100, 4, 200, 1, 3, 2]) == 4
assert longest_consecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1]) == 9
assert longest_consecutive([]) == 0
assert longest_consecutive([5]) == 1
assert longest_consecutive([1, 2, 2, 3]) == 3          # duplicates do not break the run
assert longest_consecutive([-2, -1, 0, 10]) == 3
```

Iterating over the set (not the list) also skips duplicates.

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **Return the sequence itself?** Remember the start value of the best run and return `list(range(start, start + best))`.

### Subarray sum equals k {medium core}

Return the number of contiguous subarrays whose sum equals `k`. Values can be negative.

`nums = [1, 1, 1], k = 2` → `2`; `nums = [1, 2, 3], k = 3` → `2`

#### Hints

1. Brute force: every start, with a running sum to every end: O(n²).
2. With prefix sums, the sum of a subarray is `prefix[j] - prefix[i]`. You want that to equal k.
3. Keep a Counter of prefix sums seen so far. At each step, add how many times `running - k` has been seen. Start with `{0: 1}`.

#### Solution

A subarray ending here sums to k exactly when some earlier prefix sum equals `running - k`. So the Counter of earlier
prefix sums answers "how many subarrays end here?" in O(1). The `{0: 1}` entry represents the empty prefix, which
covers subarrays that start at index 0.

A sliding window does **not** work here: with negative numbers, growing the window can decrease the sum, so you never
know which end to move. Saying this out loud is a strong signal.

```python
from collections import Counter

def subarray_sum(nums: list[int], k: int) -> int:
    seen = Counter({0: 1})
    running = count = 0
    for x in nums:
        running += x
        count += seen[running - k]
        seen[running] += 1
    return count

def subarray_sum_brute(nums: list[int], k: int) -> int:
    count = 0
    for i in range(len(nums)):
        total = 0
        for j in range(i, len(nums)):
            total += nums[j]
            count += total == k
    return count

assert subarray_sum([1, 1, 1], 2) == 2
assert subarray_sum([1, 2, 3], 3) == 2
assert subarray_sum([1, -1, 0], 0) == 3
assert subarray_sum([], 0) == 0
assert subarray_sum([3, 4, 7, 2, -3, 1, 4, 2], 7) == 4

import random
random.seed(7)
for _ in range(300):
    arr = [random.randint(-5, 5) for _ in range(random.randint(0, 10))]
    k = random.randint(-5, 5)
    assert subarray_sum(arr, k) == subarray_sum_brute(arr, k)
```

The order inside the loop matters: look up `running - k` *before* recording `running`, or k = 0 would count the empty
subarray at every index.

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **Longest subarray with sum k?** Store the *first* index of each prefix sum instead of a count.
- **All values positive?** Then a sliding window works in O(1) space.
- **Subarray sum divisible by k?** Count prefix sums modulo k.

### Isomorphic strings {easy}

Two strings are isomorphic if the characters of the first can be replaced to get the second, where each character
maps to exactly one character and no two characters map to the same one.

`("egg", "add")` → `True`; `("foo", "bar")` → `False`; `("badc", "baba")` → `False`

#### Hints

1. One dict from s to t is not enough: "badc" → "baba" would pass with only one direction checked.
2. Keep two dicts, one per direction, and check both at every position.
3. A short alternative: the number of distinct pairs must equal the number of distinct characters in each string.

#### Solution

```python
def is_isomorphic(s: str, t: str) -> bool:
    if len(s) != len(t):
        return False
    s_to_t: dict[str, str] = {}
    t_to_s: dict[str, str] = {}
    for a, b in zip(s, t):
        if s_to_t.setdefault(a, b) != b or t_to_s.setdefault(b, a) != a:
            return False
    return True

def is_isomorphic_short(s: str, t: str) -> bool:
    return len(s) == len(t) and len(set(zip(s, t))) == len(set(s)) == len(set(t))

for fn in (is_isomorphic, is_isomorphic_short):
    assert fn("egg", "add")
    assert not fn("foo", "bar")
    assert fn("paper", "title")
    assert not fn("badc", "baba")       # needs the reverse check
    assert fn("", "")
    assert not fn("ab", "a")
```

`setdefault(a, b)` stores the mapping the first time and returns the existing one afterwards, so one comparison checks
"a was already mapped to something else".

Complexity: O(n) time, O(k) space for k distinct characters.

#### Follow-ups

- **Word pattern ("abba" vs "dog cat cat dog")?** The same two-dict check, with words instead of characters.

### Top N words in a text {easy core}

Return the `n` most common words in a text, ignoring case and punctuation. Break ties alphabetically.

`top_words("The cat and the hat. THE end!", 2)` → `[("the", 3), ("and", 1)]`

#### Hints

1. Normalise first: lower-case, then extract words with a regular expression.
2. `Counter` counts them.
3. `most_common` keeps first-seen order on ties; for alphabetical ties, sort by `(-count, word)`.

#### Solution

```python
import re
from collections import Counter

WORD = re.compile(r"[a-z0-9']+")

def top_words(text: str, n: int) -> list[tuple[str, int]]:
    counts = Counter(WORD.findall(text.lower()))
    return sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:n]

assert top_words("The cat and the hat. THE end!", 2) == [("the", 3), ("and", 1)]
assert top_words("b a b a c", 2) == [("a", 2), ("b", 2)]     # alphabetical on ties
assert top_words("", 3) == []
assert top_words("Don't stop, don't!", 1) == [("don't", 2)]
```

Complexity: O(W log W) for the sort over W distinct words; `heapq.nsmallest(n, counts.items(), key=...)` makes it
O(W log n) when n is small.

#### Follow-ups

- **The text is a 50 GB log file?** Stream it line by line, update the Counter per line, and never load the whole file. If even the distinct words do not fit in memory, hash-partition them into files and count each file separately.
- **Ignore stop words?** Filter against a set of stop words before counting.

### Intersection of two arrays {easy}

Return the values that appear in both lists. First version: each value once. Second version: each value as many times
as it appears in both.

`[1, 2, 2, 1]` and `[2, 2]` → unique: `[2]`; with counts: `[2, 2]`

#### Hints

1. Unique version: which structure answers "is this value in the other list?" in O(1), and drops repeats for free?
2. Counted version: `Counter` supports `&`, which keeps the minimum count of each key.

#### Solution

```python
from collections import Counter

def intersection_unique(a: list[int], b: list[int]) -> list[int]:
    return sorted(set(a) & set(b))

def intersection_counted(a: list[int], b: list[int]) -> list[int]:
    return sorted((Counter(a) & Counter(b)).elements())

assert intersection_unique([1, 2, 2, 1], [2, 2]) == [2]
assert intersection_unique([4, 9, 5], [9, 4, 9, 8, 4]) == [4, 9]
assert intersection_counted([1, 2, 2, 1], [2, 2]) == [2, 2]
assert intersection_counted([4, 9, 5], [9, 4, 9, 8, 4]) == [4, 9]
assert intersection_unique([], [1]) == [] and intersection_counted([1], []) == []
```

Complexity: O(n + m) time; O(min(n, m)) space if you build the map from the smaller list.

#### Follow-ups

- **Both lists are already sorted?** Two pointers: O(n + m) time, O(1) extra space.
- **One list is too large for memory?** Build the Counter from the small list and stream the large one, decrementing counts as you match.

### Ransom note {easy}

Can `note` be built from the letters in `magazine`, using each magazine letter at most once?

`("aa", "aab")` → `True`; `("aa", "ab")` → `False`

#### Hints

1. Count the letters in both.
2. Every letter's count in the note must be at most its count in the magazine.

#### Solution

```python
from collections import Counter

def can_construct(note: str, magazine: str) -> bool:
    return not (Counter(note) - Counter(magazine))

def can_construct_loop(note: str, magazine: str) -> bool:
    available = Counter(magazine)
    for ch in note:
        if available[ch] == 0:
            return False
        available[ch] -= 1
    return True

for fn in (can_construct, can_construct_loop):
    assert fn("aa", "aab")
    assert not fn("aa", "ab")
    assert not fn("a", "b")
    assert fn("", "anything")

assert Counter("ab") <= Counter("aabb")      # Python 3.10+: multiset inclusion
```

`Counter` subtraction drops zero and negative counts, so an empty result means nothing was missing. On 3.10+ you can
also write `Counter(note) <= Counter(magazine)`.

Complexity: O(n + m) time, O(k) space.

#### Follow-ups

- **Why might the loop version be better?** It can stop at the first missing letter, and it reads well to interviewers who do not know Counter arithmetic.

### Majority element {easy core}

Return the value that appears more than ⌊n/2⌋ times. Assume it exists.

`[2, 2, 1, 1, 1, 2, 2]` → `2`

#### Hints

1. Counting with a dict is O(n) time and O(n) space.
2. Sorting puts the majority at the middle index: O(n log n).
3. For O(1) space: Boyer–Moore voting. Keep a candidate and a counter; matching values vote for it, others vote against.

#### Solution

The Counter answer is fine to start with. Boyer–Moore works because the majority value outnumbers all other values
combined: every "vote against" cancels one majority vote at most, and the majority still has votes left at the end.

```python
from collections import Counter

def majority_counter(nums: list[int]) -> int:
    return Counter(nums).most_common(1)[0][0]

def majority_vote(nums: list[int]) -> int:
    candidate, votes = 0, 0
    for x in nums:
        if votes == 0:
            candidate = x
        votes += 1 if x == candidate else -1
    return candidate

for fn in (majority_counter, majority_vote):
    assert fn([3, 2, 3]) == 3
    assert fn([2, 2, 1, 1, 1, 2, 2]) == 2
    assert fn([7]) == 7
    assert fn([1, 1, 2]) == 1
```

If a majority is not guaranteed, Boyer–Moore still returns *a* candidate, so verify it with a second pass:
`nums.count(candidate) > len(nums) // 2`.

Complexity: Boyer–Moore is O(n) time and O(1) space.

#### Follow-ups

- **All values appearing more than n/3 times?** There are at most two; run Boyer–Moore with two candidates, then verify both.

### Valid Sudoku {medium}

Check whether a partially filled 9 × 9 Sudoku board is valid: no digit repeats in any row, any column or any 3 × 3 box.
Empty cells are `"."`. The board does not have to be solvable.

#### Hints

1. Keep one set per row, per column and per box.
2. The box index for cell (r, c) is `(r // 3, c // 3)`.
3. Or keep a single set of tuples such as `("row", r, digit)`.

#### Solution

```python
from collections import defaultdict

def is_valid_sudoku(board: list[list[str]]) -> bool:
    rows: defaultdict[int, set[str]] = defaultdict(set)
    cols: defaultdict[int, set[str]] = defaultdict(set)
    boxes: defaultdict[tuple[int, int], set[str]] = defaultdict(set)
    for r in range(9):
        for c in range(9):
            digit = board[r][c]
            if digit == ".":
                continue
            box = (r // 3, c // 3)
            if digit in rows[r] or digit in cols[c] or digit in boxes[box]:
                return False
            rows[r].add(digit)
            cols[c].add(digit)
            boxes[box].add(digit)
    return True

valid = [
    ["5", "3", ".", ".", "7", ".", ".", ".", "."],
    ["6", ".", ".", "1", "9", "5", ".", ".", "."],
    [".", "9", "8", ".", ".", ".", ".", "6", "."],
    ["8", ".", ".", ".", "6", ".", ".", ".", "3"],
    ["4", ".", ".", "8", ".", "3", ".", ".", "1"],
    ["7", ".", ".", ".", "2", ".", ".", ".", "6"],
    [".", "6", ".", ".", ".", ".", "2", "8", "."],
    [".", ".", ".", "4", "1", "9", ".", ".", "5"],
    [".", ".", ".", ".", "8", ".", ".", "7", "9"],
]
assert is_valid_sudoku(valid)

same_box = [row.copy() for row in valid]
same_box[0][0] = "8"                       # 8 now repeats in column 0 and the top-left box
assert not is_valid_sudoku(same_box)

box_only = [["."] * 9 for _ in range(9)]
box_only[0][0] = box_only[1][1] = "4"      # different row and column, same box
assert not is_valid_sudoku(box_only)
assert is_valid_sudoku([["."] * 9 for _ in range(9)])
```

Complexity: O(81) = O(1) for a fixed board; O(n²) for an n × n board.

#### Follow-ups

- **Solve the Sudoku?** Backtracking over empty cells, using the same three sets to test each candidate digit in O(1).

### Happy number {easy}

Repeatedly replace a number by the sum of the squares of its digits. It is "happy" if this reaches 1. If it loops
forever without reaching 1, it is not happy.

`19` → `True` (1 + 81 = 82 → 64 + 4 = 68 → 36 + 64 = 100 → 1); `2` → `False`

#### Hints

1. Either you reach 1, or you revisit a number you have seen before (a cycle).
2. Keep a set of numbers seen so far.
3. For O(1) space, use Floyd's fast and slow pointers on the sequence.

#### Solution

```python
def square_digit_sum(n: int) -> int:
    total = 0
    while n:
        n, d = divmod(n, 10)
        total += d * d
    return total

def is_happy(n: int) -> bool:
    seen: set[int] = set()
    while n != 1 and n not in seen:
        seen.add(n)
        n = square_digit_sum(n)
    return n == 1

def is_happy_floyd(n: int) -> bool:
    slow, fast = n, square_digit_sum(n)
    while fast != 1 and slow != fast:
        slow = square_digit_sum(slow)
        fast = square_digit_sum(square_digit_sum(fast))
    return fast == 1

for fn in (is_happy, is_happy_floyd):
    assert fn(19) is True
    assert fn(2) is False
    assert fn(1) is True
    assert fn(7) is True
assert [n for n in range(1, 30) if is_happy(n)] == [1, 7, 10, 13, 19, 23, 28]
assert all(is_happy(n) == is_happy_floyd(n) for n in range(1, 2000))
```

Complexity: the numbers quickly drop below a few hundred, so each step is O(log n) and the number of steps is small.
The set version uses O(steps) space; Floyd's uses O(1).

#### Follow-ups

- **Why does a seen set detect the loop?** The sequence is deterministic, so revisiting any number means it will repeat forever.
