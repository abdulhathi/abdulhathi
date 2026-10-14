---
title: Binary search, backtracking and dynamic programming
goal: Write binary search without off-by-one bugs, generate subsets and permutations with one backtracking template, and solve the classic DP problems by naming the state, the transition and the base case.
minutes: 100
---

This chapter covers the three techniques that most often turn a medium problem into a hard-looking one. **Binary
search** works whenever the search space is sorted or has a yes/no boundary. **Backtracking** builds every candidate
step by step and abandons a path as soon as it cannot work. **Dynamic programming** solves overlapping subproblems once
and reuses their answers. In each case, interviewers care less about the code than about whether you can state the
invariant (binary search), the choice at each step (backtracking) or the state and transition (DP). Practise saying
those sentences out loud.

## Binary search without off-by-one bugs

Pick one template and use it every time. The **closed interval** template searches `nums[lo..hi]` inclusive and stops
when the interval is empty (`lo > hi`). The **lower bound** template finds the first index where a condition becomes
true, on the half-open range `[lo, hi)`.

```python
from bisect import bisect_left, bisect_right

def lower_bound(nums: list[int], target: int) -> int:
    """First index i with nums[i] >= target (len(nums) if none). Same as bisect_left."""
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1        # mid is too small, so the answer is to its right
        else:
            hi = mid            # mid might be the answer, so keep it
    return lo

nums = [1, 3, 3, 3, 7, 9]
assert lower_bound(nums, 3) == bisect_left(nums, 3) == 1
assert bisect_right(nums, 3) == 4          # first index with nums[i] > 3
assert lower_bound(nums, 8) == 5 and lower_bound(nums, 10) == 6
```

**Binary search on the answer:** if "can we do it with value x?" is false, false, …, true, true (monotonic), binary
search x itself. Examples: minimum ship capacity to deliver in D days, Koko eating bananas, smallest divisor under a
threshold.

## The backtracking template

Every backtracking solution has the same shape: **choose**, **explore**, **un-choose**.

```python
def backtrack_template(items: list[int]) -> list[list[int]]:
    results: list[list[int]] = []
    path: list[int] = []

    def explore(start: int) -> None:
        results.append(path[:])            # record a copy (path keeps changing)
        for i in range(start, len(items)):
            path.append(items[i])          # choose
            explore(i + 1)                 # explore
            path.pop()                     # un-choose

    explore(0)
    return results

assert len(backtrack_template([1, 2, 3])) == 8
```

Recording `path` without copying it is the classic bug: every entry would point at the same list, which ends up empty.

## The DP recipe

1. **State:** what does `dp[i]` (or `dp[i][j]`) mean, in one sentence?
2. **Transition:** how does a state follow from smaller states? This is the choice at each step.
3. **Base case:** the smallest states you know directly.
4. **Order:** compute states so the ones you depend on are ready (or use memoised recursion and let it figure it out).
5. **Answer:** which state, or the best of several states, is the answer?

Then optimise space: if `dp[i]` only needs `dp[i-1]` and `dp[i-2]`, keep two variables instead of a list.

```python
from functools import cache

@cache                                     # top-down: plain recursion plus a memo
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)

def fib_bottom_up(n: int) -> int:          # bottom-up: fill the table in order, O(1) space
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

assert fib(50) == fib_bottom_up(50) == 12586269025
```

## Interview questions

### How do you recognise a dynamic programming problem? {core}

Two signs: the problem asks for an **optimum or a count** ("minimum cost", "maximum profit", "number of ways",
"is it possible"), and a brute-force recursion would **solve the same subproblems repeatedly**. If the answer for the
whole input can be built from answers for prefixes, suffixes or smaller amounts (optimal substructure), cache those
answers. Typical inputs: a sequence, a grid, two strings, an amount or a capacity.

### Memoisation or tabulation? {core}

Memoisation (top-down) is the brute-force recursion plus a cache (`functools.cache`). It is quick to write and only
computes the states it needs, but it uses the call stack, so deep inputs can hit Python's recursion limit. Tabulation
(bottom-up) fills a table in dependency order with loops. It has no recursion, and it is easier to reduce to O(1) or
O(n) space. In an interview, it is fine to start top-down and convert if asked.

### Why does greedy fail for coin change? {core}

Greedy takes the largest coin that fits. With coins `[1, 3, 4]` and amount 6, greedy picks 4 + 1 + 1 = 3 coins, but
3 + 3 = 2 coins is better. Greedy only works for special coin systems (like 1, 5, 10, 25). DP tries every last coin:
`best[a] = 1 + min(best[a - c])` over all coins `c`. When a greedy choice cannot be proven safe, reach for DP.

### How do you avoid off-by-one errors in binary search? {core}

Decide what the interval means and keep it true. With `lo, hi = 0, len(nums) - 1` and `while lo <= hi`, the interval
is inclusive, so you move to `mid + 1` or `mid - 1`. With `hi = len(nums)` and `while lo < hi`, it is half-open, and
you set `hi = mid` when `mid` might be the answer. Mixing the two is what causes infinite loops. Test with one and two
elements, and with the target smaller than everything and larger than everything.

### What is the time complexity of generating subsets and permutations? {deep}

There are 2ⁿ subsets and n! permutations, and copying each result costs O(n), so subsets are O(n · 2ⁿ) and
permutations O(n · n!). No algorithm can beat the size of the output. Pruning (stopping a path that cannot succeed, as
in combination sum) does not change the worst case but often makes real inputs fast.

### functools.cache or lru_cache? Any pitfalls? {deep}

`functools.cache` (Python 3.9+) is an unbounded `lru_cache(maxsize=None)`. Use `lru_cache(maxsize=N)` when memory must
be bounded. Pitfalls: arguments must be hashable (convert lists to tuples), the cache lives as long as the function, so
memoising a nested function per call is cleaner in interviews, and memoised recursion still has the recursion limit.

## Coding problems

### Binary search {easy core}

Given a sorted list of distinct integers and a `target`, return its index, or `-1` if it is absent. O(log n) required.

- `nums = [-1, 0, 3, 5, 9, 12], target = 9` → `4`

#### Hints

1. Compare the target with the middle element. Which half can you throw away?
2. Keep the invariant "if the target exists, it is in `nums[lo..hi]`", and stop when that range is empty.

#### Solution

```python
from bisect import bisect_left

def binary_search(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:                  # nums[lo..hi] is the part that can still hold the target
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1             # everything up to mid is too small
        else:
            hi = mid - 1             # everything from mid on is too big
    return -1

nums = [-1, 0, 3, 5, 9, 12]
assert binary_search(nums, 9) == 4
assert binary_search(nums, 2) == -1
assert binary_search(nums, -1) == 0 and binary_search(nums, 12) == 5
assert binary_search([], 1) == -1
assert binary_search([5], 5) == 0

def with_bisect(nums: list[int], target: int) -> int:
    i = bisect_left(nums, target)
    return i if i < len(nums) and nums[i] == target else -1

assert all(binary_search(nums, t) == with_bisect(nums, t) for t in range(-3, 15))
```

Complexity: O(log n) time, O(1) space.

#### Follow-ups

- **Why `(lo + hi) // 2` is safe here:** Python integers never overflow. In Java or C++, write `lo + (hi - lo) / 2`.
- **Would you use `bisect` in an interview?** Mention it, and write the loop if they want to see the logic.
- **Search a sorted 2D matrix?** Treat it as one sorted list of `rows * cols` items: index `k` is cell
  `(k // cols, k % cols)`.

### Find the first and last position of an element {medium core}

Given a sorted list (with duplicates) and a `target`, return `[first, last]` indices of the target, or `[-1, -1]`.
O(log n) required.

- `nums = [5, 7, 7, 8, 8, 10], target = 8` → `[3, 4]`

#### Hints

1. Finding one 8 and then scanning left and right is O(n) when every value is 8.
2. Run two binary searches: the first index with `value >= target`, and the first index with `value > target`.

#### Solution

The lower-bound search finds the first position. The last position is one before the first index whose value is
greater than the target.

```python
from bisect import bisect_left, bisect_right

def lower_bound(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid
    return lo

def upper_bound(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums)
    while lo < hi:
        mid = (lo + hi) // 2
        if nums[mid] <= target:          # the only difference: <= instead of <
            lo = mid + 1
        else:
            hi = mid
    return lo

def search_range(nums: list[int], target: int) -> list[int]:
    first = lower_bound(nums, target)
    if first == len(nums) or nums[first] != target:
        return [-1, -1]
    return [first, upper_bound(nums, target) - 1]

assert search_range([5, 7, 7, 8, 8, 10], 8) == [3, 4]
assert search_range([5, 7, 7, 8, 8, 10], 6) == [-1, -1]
assert search_range([], 0) == [-1, -1]
assert search_range([2, 2, 2], 2) == [0, 2]
assert search_range([1], 1) == [0, 0]

nums = [1, 2, 2, 4, 4, 4, 9]
for t in range(0, 11):
    expected = [bisect_left(nums, t), bisect_right(nums, t) - 1] if t in nums else [-1, -1]
    assert search_range(nums, t) == expected
```

Complexity: O(log n) time, O(1) space.

#### Follow-ups

- **How many times does the target occur?** `upper_bound - lower_bound`, still O(log n).
- **First bad version, minimum in a rotated array, sqrt(x):** all "find the first index where a condition becomes
  true", the same lower-bound loop with a different condition.

### Search in a rotated sorted array {medium}

A sorted list of distinct values was rotated at an unknown pivot (for example `[0, 1, 2, 4, 5, 6, 7]` became
`[4, 5, 6, 7, 0, 1, 2]`). Return the index of `target`, or `-1`, in O(log n).

- `nums = [4, 5, 6, 7, 0, 1, 2], target = 0` → `4`
- `target = 3` → `-1`

#### Hints

1. Split at `mid`. At least one of the two halves is still properly sorted. How can you tell which one?
2. If `nums[lo] <= nums[mid]`, the left half is sorted. Is the target inside its range? If not, it must be on the
   right.

#### Solution

At every step one half is sorted, and for a sorted half you can check in O(1) whether the target lies inside it. Keep
that half if it does; otherwise keep the other half.

```python
def search_rotated(nums: list[int], target: int) -> int:
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[lo] <= nums[mid]:                      # left half nums[lo..mid] is sorted
            if nums[lo] <= target < nums[mid]:
                hi = mid - 1
            else:
                lo = mid + 1
        else:                                          # right half nums[mid..hi] is sorted
            if nums[mid] < target <= nums[hi]:
                lo = mid + 1
            else:
                hi = mid - 1
    return -1

assert search_rotated([4, 5, 6, 7, 0, 1, 2], 0) == 4
assert search_rotated([4, 5, 6, 7, 0, 1, 2], 3) == -1
assert search_rotated([1], 0) == -1
assert search_rotated([1, 3], 3) == 1
assert search_rotated([3, 1], 1) == 1

base = [1, 3, 5, 7, 9, 11]
for shift in range(len(base)):
    rotated = base[shift:] + base[:shift]
    for t in range(0, 13):
        assert search_rotated(rotated, t) == (rotated.index(t) if t in rotated else -1)
```

Complexity: O(log n) time, O(1) space.

#### Follow-ups

- **Duplicates allowed (Search in Rotated Sorted Array II)?** When `nums[lo] == nums[mid] == nums[hi]` you cannot tell
  which half is sorted; shrink both ends by one. The worst case becomes O(n).
- **Find the minimum (the rotation point)?** Compare `nums[mid]` with `nums[hi]`: if bigger, the minimum is to the
  right of `mid`; otherwise it is at `mid` or to its left.

### Subsets {medium core}

Return all subsets (the power set) of a list of distinct integers, in any order.

- `[1, 2, 3]` → `[[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]`

#### Hints

1. Each element is either in or out: 2ⁿ subsets.
2. Backtracking: at each step choose which element to add next, only from positions after the last one used, so the
   same subset is never built twice in a different order.
3. Iterative alternative: start with `[[]]`, and for each number add it to every subset you already have.

#### Solution

Every node of the recursion tree is a subset, so record a **copy** of the path on entry.

```python
from itertools import combinations

def subsets(nums: list[int]) -> list[list[int]]:
    result: list[list[int]] = []
    path: list[int] = []

    def explore(start: int) -> None:
        result.append(path[:])                 # a copy: path keeps changing
        for i in range(start, len(nums)):
            path.append(nums[i])               # choose
            explore(i + 1)                     # explore with later elements only
            path.pop()                         # un-choose

    explore(0)
    return result

def subsets_iterative(nums: list[int]) -> list[list[int]]:
    result: list[list[int]] = [[]]
    for x in nums:
        result += [subset + [x] for subset in result]
    return result

assert subsets([1, 2, 3]) == [[], [1], [1, 2], [1, 2, 3], [1, 3], [2], [2, 3], [3]]
assert subsets([]) == [[]]
everything = sorted(sorted(c) for r in range(5) for c in combinations([4, 1, 7, 2], r))
assert sorted(sorted(s) for s in subsets([4, 1, 7, 2])) == everything
assert sorted(sorted(s) for s in subsets_iterative([4, 1, 7, 2])) == everything
```

Complexity: O(n · 2ⁿ) time and output space; O(n) recursion depth.

#### Follow-ups

- **Input has duplicates (Subsets II)?** Sort first, and inside the loop skip `nums[i]` when `i > start` and
  `nums[i] == nums[i - 1]`.
- **Bitmask version?** For `mask` in `range(2 ** n)`, include `nums[i]` when bit `i` is set. Handy when n ≤ 20.

### Permutations {medium}

Return all permutations of a list of distinct integers.

- `[1, 2, 3]` → `[[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]`

#### Hints

1. Fill positions one at a time; any unused number can go next.
2. Track which numbers are used with a boolean list (or a set), and undo the mark after exploring.

#### Solution

```python
from itertools import permutations as library_permutations

def permutations(nums: list[int]) -> list[list[int]]:
    result: list[list[int]] = []
    path: list[int] = []
    used = [False] * len(nums)

    def explore() -> None:
        if len(path) == len(nums):
            result.append(path[:])
            return
        for i, x in enumerate(nums):
            if used[i]:
                continue
            used[i] = True                 # choose
            path.append(x)
            explore()                      # explore
            path.pop()                     # un-choose
            used[i] = False

    explore()
    return result

assert permutations([1, 2, 3]) == [[1, 2, 3], [1, 3, 2], [2, 1, 3], [2, 3, 1], [3, 1, 2], [3, 2, 1]]
assert permutations([0, 1]) == [[0, 1], [1, 0]]
assert permutations([1]) == [[1]]
assert permutations([5, 6, 7, 8]) == [list(p) for p in library_permutations([5, 6, 7, 8])]
```

Complexity: O(n · n!) time and output space.

#### Follow-ups

- **In real code?** `itertools.permutations` does it lazily. In interviews, write the backtracking first.
- **Duplicates in the input (Permutations II)?** Sort, and skip `nums[i]` if it equals `nums[i - 1]` and
  `nums[i - 1]` is not currently used.
- **Next permutation in place?** From the right, find the first `i` with `nums[i] < nums[i + 1]`, swap it with the
  smallest larger value to its right, then reverse the suffix.

### Combination sum {medium}

Given distinct positive `candidates` and a `target`, return all unique combinations that sum to `target`. Each number
may be used any number of times.

- `candidates = [2, 3, 6, 7], target = 7` → `[[2, 2, 3], [7]]`
- `candidates = [2, 3, 5], target = 8` → `[[2, 2, 2, 2], [2, 3, 3], [3, 5]]`

#### Hints

1. Backtracking with the remaining amount. Stop when it hits 0 (record) or goes negative (abandon).
2. To avoid `[2, 3, 2]` and `[2, 2, 3]` both appearing, only choose candidates at or after the current index.
3. Reuse is allowed, so recurse with index `i`, not `i + 1`. Sorting lets you stop the loop early.

#### Solution

```python
def combination_sum(candidates: list[int], target: int) -> list[list[int]]:
    candidates = sorted(candidates)
    result: list[list[int]] = []
    path: list[int] = []

    def explore(start: int, remaining: int) -> None:
        if remaining == 0:
            result.append(path[:])
            return
        for i in range(start, len(candidates)):
            c = candidates[i]
            if c > remaining:
                break                          # sorted: every later candidate is too big as well
            path.append(c)
            explore(i, remaining - c)          # i, not i + 1: the same number may be reused
            path.pop()

    explore(0, target)
    return result

assert combination_sum([2, 3, 6, 7], 7) == [[2, 2, 3], [7]]
assert combination_sum([2, 3, 5], 8) == [[2, 2, 2, 2], [2, 3, 3], [3, 5]]
assert combination_sum([2], 1) == []
assert combination_sum([7, 3, 2], 7) == [[2, 2, 3], [7]]     # unsorted input
```

Complexity: exponential in the worst case, roughly O(n^(target / min(candidates))); pruning by sorting cuts most
branches in practice.

#### Follow-ups

- **Each number at most once, input has duplicates (Combination Sum II)?** Recurse with `i + 1`, and skip a value equal
  to the previous one at the same depth (`i > start and candidates[i] == candidates[i - 1]`).
- **Only the count of combinations?** That is a DP (Coin Change II), far cheaper than listing them.

### Generate parentheses {medium}

Given `n`, return all well-formed strings of `n` pairs of parentheses.

- `n = 3` → `["((()))", "(()())", "(())()", "()(())", "()()()"]`

#### Hints

1. Generating all 2²ⁿ strings and filtering the valid ones works for tiny n only.
2. Build the string left to right. When may you add `(`? When may you add `)`?
3. Add `(` while you have used fewer than n; add `)` only while it would close an open one.

#### Solution

Only build valid prefixes: an opening bracket is allowed while fewer than n are open, and a closing bracket is
allowed while there are unmatched opening brackets. Every finished string is then valid by construction.

```python
def generate_parenthesis(n: int) -> list[str]:
    result: list[str] = []

    def explore(current: str, opened: int, closed: int) -> None:
        if len(current) == 2 * n:
            result.append(current)
            return
        if opened < n:
            explore(current + "(", opened + 1, closed)
        if closed < opened:
            explore(current + ")", opened, closed + 1)

    explore("", 0, 0)
    return result

assert generate_parenthesis(3) == ["((()))", "(()())", "(())()", "()(())", "()()()"]
assert generate_parenthesis(1) == ["()"]
assert generate_parenthesis(0) == [""]
assert [len(generate_parenthesis(n)) for n in range(1, 7)] == [1, 2, 5, 14, 42, 132]   # Catalan numbers
```

Complexity: the number of results is the n-th Catalan number, about 4ⁿ / (n^1.5 · √π); each costs O(n) to build.

#### Follow-ups

- **Strings are immutable: is `current + "("` wasteful?** Each call copies O(n) characters, which is already the cost
  of storing the result. A list with append/pop avoids copies on the way down.
- **Check validity instead of generating?** The counter or stack from Valid Parentheses.

### Climbing stairs {easy core}

You can climb 1 or 2 steps at a time. In how many distinct ways can you reach step `n`?

- `n = 2` → `2` (1+1, 2), `n = 3` → `3` (1+1+1, 1+2, 2+1)

#### Hints

1. The last move onto step n came from step n − 1 or from step n − 2.
2. So `ways(n) = ways(n - 1) + ways(n - 2)`. What are the base cases?
3. You only ever need the previous two values.

#### Solution

State: `ways(i)` = number of ways to reach step i. Transition: `ways(i) = ways(i-1) + ways(i-2)`. Base: `ways(0) = 1`
(stand still) and `ways(1) = 1`. It is the Fibonacci sequence, and two variables are enough.

```python
from functools import cache

def climb_stairs(n: int) -> int:
    prev, curr = 1, 1                  # ways to reach step 0 and step 1
    for _ in range(n - 1):
        prev, curr = curr, prev + curr
    return curr

@cache
def climb_memo(n: int) -> int:        # the top-down version: same recurrence plus a cache
    return 1 if n <= 1 else climb_memo(n - 1) + climb_memo(n - 2)

for n, expected in [(1, 1), (2, 2), (3, 3), (4, 5), (5, 8), (10, 89)]:
    assert climb_stairs(n) == expected == climb_memo(n)
assert climb_stairs(45) == 1836311903
```

Complexity: O(n) time, O(1) space (the memo version uses O(n)).

#### Follow-ups

- **Steps of 1, 2 or 3?** Add a third term: `ways(i-1) + ways(i-2) + ways(i-3)`.
- **Any step sizes from a list?** `ways[i] = sum(ways[i - s] for s in steps if s <= i)`.
- **Min cost climbing stairs?** Same shape with `min` and costs instead of a sum.

### House robber {medium core}

Each house has some money. You cannot rob two adjacent houses. Return the most money you can rob.

- `[1, 2, 3, 1]` → `4` (houses 0 and 2)
- `[2, 7, 9, 3, 1]` → `12` (houses 0, 2 and 4)

#### Hints

1. Greedy (take every other house, or always the bigger) fails. Try `[2, 1, 1, 2]`.
2. At house i you either skip it (keep the best up to i − 1) or rob it (best up to i − 2, plus this house).
3. Only the last two best totals matter.

#### Solution

State: `best[i]` = most money from the first i houses. Transition:
`best[i] = max(best[i-1], best[i-2] + nums[i-1])`. Two variables replace the list.

```python
def rob(nums: list[int]) -> int:
    two_back, one_back = 0, 0              # best totals for the houses before the previous one, and up to it
    for money in nums:
        two_back, one_back = one_back, max(one_back, two_back + money)
    return one_back

assert rob([1, 2, 3, 1]) == 4
assert rob([2, 7, 9, 3, 1]) == 12
assert rob([2, 1, 1, 2]) == 4              # houses 0 and 3: no simple alternating pattern works
assert rob([]) == 0
assert rob([5]) == 5
assert rob([5, 1]) == 5
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Houses in a circle (House Robber II)?** The first and last are adjacent: answer
  `max(rob(nums[1:]), rob(nums[:-1]))` (or `nums[0]` when there is one house).
- **Houses in a binary tree (House Robber III)?** Each node returns a pair: (best if robbed, best if not robbed).

### Coin change {medium core}

Given coin denominations and an `amount`, return the fewest coins that make the amount, or `-1` if it cannot be made.
You have unlimited coins of each kind.

- `coins = [1, 2, 5], amount = 11` → `3` (5 + 5 + 1)
- `coins = [2], amount = 3` → `-1`

#### Hints

1. Greedy (largest coin first) fails for `[1, 3, 4]` and amount 6.
2. Think about the last coin used. If it is `c`, the rest is the best way to make `amount - c`.
3. Fill `best[0..amount]` from 0 upward; `best[0] = 0`.

#### Solution

State: `best[a]` = fewest coins that make amount `a`. Transition: `best[a] = 1 + min(best[a - c])` over coins
`c <= a`. Unreachable amounts stay at a sentinel larger than any real answer.

```python
def coin_change(coins: list[int], amount: int) -> int:
    unreachable = amount + 1                    # more coins than any real answer could need
    best = [0] + [unreachable] * amount         # best[a] = fewest coins that make a
    for a in range(1, amount + 1):
        for coin in coins:
            if coin <= a and best[a - coin] + 1 < best[a]:
                best[a] = best[a - coin] + 1
    return best[amount] if best[amount] != unreachable else -1

assert coin_change([1, 2, 5], 11) == 3
assert coin_change([2], 3) == -1
assert coin_change([1], 0) == 0
assert coin_change([1, 3, 4], 6) == 2                  # 3 + 3; greedy would use 4 + 1 + 1
assert coin_change([186, 419, 83, 408], 6249) == 20
```

Complexity: O(amount × number of coins) time, O(amount) space.

#### Follow-ups

- **Number of ways to make the amount (Coin Change II)?** `ways[a] += ways[a - c]`, with the **coins in the outer
  loop** so each combination is counted once. With amounts in the outer loop you count ordered sequences instead.
- **Which coins were used?** Store the coin that improved each `best[a]`, then walk back from `amount`.
- **Huge amount, few coins?** BFS over amounts also works: level k holds amounts reachable with k coins.

### Longest increasing subsequence {medium}

Return the length of the longest strictly increasing subsequence (not necessarily contiguous).

- `[10, 9, 2, 5, 3, 7, 101, 18]` → `4` (for example `2, 3, 7, 18`)

#### Hints

1. Brute force tries all 2ⁿ subsequences. Instead, ask for each index: how long is the best increasing subsequence that *ends* here?
2. O(n²) DP: `dp[i] = 1 + max(dp[j])` over all `j < i` with `nums[j] < nums[i]`.
3. O(n log n): keep `tails[k]`, the smallest tail of any increasing subsequence of length k + 1, and update it with
   binary search.

#### Solution

Give the O(n²) DP first; it is the expected baseline. Then the O(n log n) version: `tails` stays sorted, and each new
value either extends the longest subsequence or replaces the first tail that is `>=` it (a smaller tail is always
better for the future).

```python
from bisect import bisect_left

def length_of_lis_quadratic(nums: list[int]) -> int:
    if not nums:
        return 0
    dp = [1] * len(nums)                    # dp[i] = longest increasing subsequence ending at i
    for i in range(len(nums)):
        for j in range(i):
            if nums[j] < nums[i]:
                dp[i] = max(dp[i], dp[j] + 1)
    return max(dp)

def length_of_lis(nums: list[int]) -> int:
    tails: list[int] = []                   # tails[k] = smallest tail of an increasing run of length k + 1
    for x in nums:
        i = bisect_left(tails, x)           # bisect_left keeps it strictly increasing
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return len(tails)

for nums, expected in [([10, 9, 2, 5, 3, 7, 101, 18], 4), ([0, 1, 0, 3, 2, 3], 4), ([7, 7, 7, 7], 1), ([], 0), ([1, 2, 3], 3)]:
    assert length_of_lis(nums) == expected == length_of_lis_quadratic(nums)
```

Complexity: O(n²) or O(n log n) time; O(n) space.

#### Follow-ups

- **`tails` is not the subsequence itself.** To reconstruct one, store each element's predecessor index.
- **Non-decreasing (duplicates allowed)?** Use `bisect_right`.
- **Russian doll envelopes (hard)?** Sort by width ascending and height descending, then LIS on heights.

### Unique paths {medium}

A robot starts at the top-left of an `m × n` grid and can only move right or down. How many distinct paths reach the
bottom-right?

- `m = 3, n = 7` → `28`
- `m = 3, n = 2` → `3`

#### Hints

1. You arrive at a cell from above or from the left.
2. `paths[r][c] = paths[r-1][c] + paths[r][c-1]`, and the first row and column are all 1.
3. One row of the table is enough.

#### Solution

The 2D recurrence only reads the row above and the cell to the left, so a single row updated left to right holds
everything: before the update `row[c]` is the value from above, and `row[c-1]` is already the current row's left cell.

```python
from math import comb

def unique_paths(m: int, n: int) -> int:
    row = [1] * n                       # the first row: one way to reach each cell
    for _ in range(1, m):
        for c in range(1, n):
            row[c] += row[c - 1]        # from above (old row[c]) + from the left (new row[c-1])
    return row[-1]

assert unique_paths(3, 7) == 28
assert unique_paths(3, 2) == 3
assert unique_paths(1, 1) == 1
assert unique_paths(1, 5) == 1
assert all(unique_paths(m, n) == comb(m + n - 2, m - 1) for m in range(1, 8) for n in range(1, 8))
```

Complexity: O(m·n) time, O(n) space. The closed form `comb(m + n - 2, m - 1)` is O(min(m, n)).

#### Follow-ups

- **Obstacles (Unique Paths II)?** Set `row[c] = 0` on an obstacle cell (and handle column 0 the same way).
- **Minimum path sum?** Same table with `grid[r][c] + min(from above, from the left)`.

### Word break {medium}

Given a string `s` and a list of words, return `True` if `s` can be split into a sequence of dictionary words (words
may be reused).

- `s = "leetcode", words = ["leet", "code"]` → `True`
- `s = "catsandog", words = ["cats", "dog", "sand", "and", "cat"]` → `False`

#### Hints

1. Plain recursion tries every split and repeats work on the same suffixes: exponential.
2. State: `ok[i]` = the first i characters can be split. `ok[0]` is True.
3. `ok[i]` is True if some `j < i` has `ok[j]` True and `s[j:i]` in the word set.

#### Solution

Put the words in a set for O(1) lookups (each lookup hashes a slice, which is O(word length)). Limiting `j` to the
longest word length avoids pointless slices.

```python
def word_break(s: str, word_dict: list[str]) -> bool:
    words = set(word_dict)
    longest = max(map(len, words), default=0)
    ok = [True] + [False] * len(s)              # ok[i]: s[:i] can be split into words
    for i in range(1, len(s) + 1):
        for j in range(max(0, i - longest), i):
            if ok[j] and s[j:i] in words:
                ok[i] = True
                break
    return ok[len(s)]

assert word_break("leetcode", ["leet", "code"])
assert word_break("applepenapple", ["apple", "pen"])            # words can be reused
assert not word_break("catsandog", ["cats", "dog", "sand", "and", "cat"])
assert word_break("", ["a"])
assert not word_break("a", [])
assert word_break("aaaaaaa", ["aaaa", "aaa"])
```

Complexity: O(n · L) slices of length up to L, so O(n · L²) time with L the longest word; O(n) space.

#### Follow-ups

- **Return every sentence (Word Break II)?** Backtracking with memoisation on the start index; the output itself can be
  exponential.
- **Many words with shared prefixes?** A trie lets you walk forward from each `j` and stop as soon as no word matches.

### Longest common subsequence {medium}

Return the length of the longest subsequence common to two strings.

- `"abcde"` and `"ace"` → `3` (`"ace"`)
- `"abc"` and `"def"` → `0`

#### Hints

1. Compare the last characters. If they match, they can end the common subsequence.
2. State: `dp[i][j]` = LCS length of `a[:i]` and `b[:j]`. Row 0 and column 0 are 0.
3. Match: `dp[i-1][j-1] + 1`. No match: the better of dropping a character from either string.

#### Solution

Build the table with a list comprehension. `[[0] * (m + 1)] * (n + 1)` would create n + 1 references to the **same**
row, a classic Python bug.

```python
def longest_common_subsequence(a: str, b: str) -> int:
    n, m = len(a), len(b)
    dp = [[0] * (m + 1) for _ in range(n + 1)]     # dp[i][j] = LCS of a[:i] and b[:j]
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            if a[i - 1] == b[j - 1]:
                dp[i][j] = dp[i - 1][j - 1] + 1
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])
    return dp[n][m]

assert longest_common_subsequence("abcde", "ace") == 3
assert longest_common_subsequence("abc", "abc") == 3
assert longest_common_subsequence("abc", "def") == 0
assert longest_common_subsequence("", "abc") == 0
assert longest_common_subsequence("bsbininm", "jmjkbkjkv") == 1
```

Complexity: O(n·m) time and space; O(min(n, m)) space if you keep only two rows.

#### Follow-ups

- **Edit distance?** The same table shape with three choices (insert, delete, replace):
  `dp[i][j] = 1 + min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1])` when the characters differ.
- **Return the subsequence itself?** Walk back from `dp[n][m]`: on a match go diagonally and record the character,
  otherwise move towards the larger neighbour.
- **Where is this used?** `diff` tools and DNA sequence alignment are built on the same idea.
