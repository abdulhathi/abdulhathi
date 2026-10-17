---
title: Arrays and strings
goal: Solve the most common array, string and matrix interview problems in Python, explaining the brute force, the better idea and the complexity as you go.
minutes: 90
---

Arrays and strings are the most common topic in a live coding round. Most problems here have an obvious O(n²)
brute force and a cleaner O(n) answer that comes from one idea: keep a running value, walk from both ends, or
precompute something from the left and the right.

For each problem, say the brute force and its cost first, then the better idea, then code it. Interviewers want to
see you get from the first to the second.

## Patterns that solve most of these problems

| Pattern | Signal in the problem | Example |
|---|---|---|
| Running best (one pass) | "maximum profit", "best so far" | Buy and sell stock, Kadane |
| Read and write pointers | "in place", "keep the order", "remove" | Move zeroes |
| Reverse tricks | "rotate", "reverse the words in place" | Rotate array |
| Prefix and suffix passes | "product / sum of everything except" | Product except self |
| Merge from the back | "two sorted arrays", "in place" | Merge sorted arrays |
| Boundaries that shrink | "spiral", "layer by layer" | Spiral matrix |
| Count, then scan | "first unique", "frequency" | First non-repeating character |

### In place, in Python

"In place" means O(1) extra space: change the list you were given instead of building a new one. In Python, note the
difference between `nums = nums[k:] + nums[:k]`, which only rebinds your local name, and `nums[:] = ...`, which
replaces the contents of the caller's list. The second one actually modifies the list, but it still builds a
temporary copy, so it is O(n) extra space.

```python
def rebind(nums: list[int]) -> None:
    nums = [0, 0]          # the caller's list is untouched

def replace_contents(nums: list[int]) -> None:
    nums[:] = [0, 0]       # the caller sees the change

data = [1, 2, 3]
rebind(data)
assert data == [1, 2, 3]
replace_contents(data)
assert data == [0, 0]
```

## Interview questions

### What does "in place" mean, and how do you show it in Python? {core}

In place means using O(1) extra memory: you modify the input instead of allocating a structure that grows with n.
In Python, that means index assignments and swaps (`nums[i], nums[j] = nums[j], nums[i]`) on the list you were given.
`nums[:] = new_list` changes the caller's list but builds a temporary copy, so be honest that it is O(n) space.

### Why is a Python list append O(1) if the array sometimes has to grow? {core}

A list is a dynamic array that over-allocates. When it fills up, CPython allocates a bigger block and copies the
elements, which costs O(n), but the extra room means that happens rarely. Spread over many appends, the cost per
append is O(1) on average: **amortised** O(1).

### Strings are immutable in Python. How does that change your solutions?

You cannot assign `s[i] = "x"`. To edit characters, convert to a list (`chars = list(s)`), modify the list, and
`"".join(chars)` at the end. Building a result with `+=` in a loop can be O(n²), so collect pieces in a list and
join once.

### How do you approach an array problem you have not seen before? {core}

Restate it and ask about the edges: can it be empty, are there negatives, duplicates, is it sorted, how large is n?
Give the brute force and its cost. Then ask what work the brute force repeats: a running value, a sort, two pointers,
a prefix sum or a hash map usually removes it. Code the better version, then test it on an edge case out loud.

## Coding problems

### Rotate an array to the right by k {medium core}

Rotate a list to the right by `k` steps, in place.

`nums = [1, 2, 3, 4, 5, 6, 7], k = 3` → `[5, 6, 7, 1, 2, 3, 4]`

#### Hints

1. `k` can be larger than the length: rotating by `len(nums)` changes nothing, so use `k % n`.
2. Moving one step at a time k times is O(n·k). Slicing is O(n) time but O(n) space.
3. For O(1) space: reverse the whole list, then reverse the first k items, then the rest.

#### Solution

Brute force: rotate by one, k times, O(n·k). The slicing answer `nums[:] = nums[-k:] + nums[:-k]` is clean and
O(n), but it builds copies. The reverse trick does it in O(1) extra space. Reversing everything puts the last k items
at the front, but backwards. Reversing each of the two parts again fixes their order.

```python
def reverse(nums: list[int], left: int, right: int) -> None:
    while left < right:
        nums[left], nums[right] = nums[right], nums[left]
        left += 1
        right -= 1

def rotate(nums: list[int], k: int) -> None:
    n = len(nums)
    if n == 0:
        return
    k %= n
    reverse(nums, 0, n - 1)
    reverse(nums, 0, k - 1)
    reverse(nums, k, n - 1)

def rotate_slicing(nums: list[int], k: int) -> None:
    if nums:
        k %= len(nums)
        nums[:] = nums[-k:] + nums[:-k] if k else nums

for fn in (rotate, rotate_slicing):
    a = [1, 2, 3, 4, 5, 6, 7]
    fn(a, 3)
    assert a == [5, 6, 7, 1, 2, 3, 4]
    b = [-1, -100, 3, 99]
    fn(b, 2)
    assert b == [3, 99, -1, -100]
    c = [1, 2]
    fn(c, 5)                     # k larger than n
    assert c == [2, 1]
    d: list[int] = []
    fn(d, 3)
    assert d == []
    e = [1, 2, 3]
    fn(e, 0)
    assert e == [1, 2, 3]
```

Note the `if k else nums` in the slicing version: `nums[-0:]` is the whole list, so k = 0 needs care.

Complexity: O(n) time, O(1) extra space for the reverse version.

#### Follow-ups

- **Rotate left instead?** Rotating left by k is rotating right by `n - k % n`.
- **What about `collections.deque.rotate(k)`?** It exists and is O(k), worth mentioning, but the interviewer usually wants the list version.

### Move zeroes to the end {easy core}

Move all zeros to the end of a list, in place, keeping the order of the non-zero elements.

`[0, 1, 0, 3, 12]` → `[1, 3, 12, 0, 0]`

#### Hints

1. Building a new list of non-zeros and padding with zeros is easy, but not in place.
2. Keep a write pointer: every non-zero value gets written at the write position, then the pointer moves.
3. Swapping instead of writing puts the zeros at the end automatically.

#### Solution

The write pointer marks where the next non-zero belongs. Everything before it is finished. Swapping the current
value into that slot moves a zero (or the same value) to the read position, so no second pass is needed.

```python
def move_zeroes(nums: list[int]) -> None:
    write = 0
    for read in range(len(nums)):
        if nums[read] != 0:
            nums[write], nums[read] = nums[read], nums[write]
            write += 1

cases = [
    ([0, 1, 0, 3, 12], [1, 3, 12, 0, 0]),
    ([0], [0]),
    ([1, 2, 3], [1, 2, 3]),
    ([0, 0, 1], [1, 0, 0]),
    ([], []),
    ([4, 0, -2, 0, 0, 5], [4, -2, 5, 0, 0, 0]),
]
for given, want in cases:
    nums = given.copy()
    move_zeroes(nums)
    assert nums == want, (given, nums)
```

Complexity: O(n) time, O(1) extra space, one pass.

#### Follow-ups

- **Minimise the number of writes?** Only swap when `read != write`.
- **Move all values equal to x?** Same loop with `!= x`; this is the read/write pointer pattern from "remove element".

### Best time to buy and sell stock {easy core}

Given daily prices, choose one day to buy and a later day to sell. Return the maximum profit, or 0 if no profit is
possible.

`[7, 1, 5, 3, 6, 4]` → `5` (buy at 1, sell at 6)

#### Hints

1. Brute force: try every pair (buy day, sell day): O(n²).
2. If you sell today, the best buy day is the cheapest day so far.
3. Keep the minimum price seen so far and the best profit so far.

#### Solution

For each day, the best you can do selling today is today's price minus the lowest price before it. So one pass keeps
two numbers. Updating the profit before the minimum means you never "sell before you buy".

```python
def max_profit(prices: list[int]) -> int:
    lowest = float("inf")
    best = 0
    for price in prices:
        best = max(best, price - lowest)
        lowest = min(lowest, price)
    return int(best)

def max_profit_brute(prices: list[int]) -> int:
    return max((prices[j] - prices[i] for i in range(len(prices)) for j in range(i + 1, len(prices))), default=0) if prices else 0

for prices, want in [([7, 1, 5, 3, 6, 4], 5), ([7, 6, 4, 3, 1], 0), ([], 0), ([5], 0), ([2, 4, 1], 2), ([3, 3], 0)]:
    assert max_profit(prices) == want, prices
    assert max(0, max_profit_brute(prices)) == want, prices
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Unlimited transactions?** Add up every positive day-to-day increase: `sum(max(0, b - a) for a, b in pairwise(prices))`.
- **Return the days, not just the profit?** Store the index of the current minimum and record both indices when `best` improves.

### Maximum subarray sum {medium core}

Return the largest sum of any contiguous, non-empty subarray.

`[-2, 1, -3, 4, -1, 2, 1, -5, 4]` → `6` (the subarray `[4, -1, 2, 1]`)

#### Hints

1. Brute force: every start and end, with a running sum: O(n²).
2. At each position, the best subarray ending here either extends the previous one or starts fresh.
3. Start fresh when the running sum so far is negative: it can only hurt. This is Kadane's algorithm.

#### Solution

Kadane's algorithm keeps the best sum of a subarray that ends at the current index. If that sum went negative,
dropping it and starting at the current element is always better. The answer is the best value seen at any index.
Initialising with the first element (not 0) handles all-negative arrays.

```python
def max_subarray(nums: list[int]) -> int:
    if not nums:
        raise ValueError("need at least one number")
    current = best = nums[0]
    for x in nums[1:]:
        current = max(x, current + x)
        best = max(best, current)
    return best

def max_subarray_with_range(nums: list[int]) -> tuple[int, int, int]:
    """Returns (sum, start, end) with end inclusive."""
    best, best_start, best_end = nums[0], 0, 0
    current, start = nums[0], 0
    for i in range(1, len(nums)):
        if current < 0:
            current, start = nums[i], i
        else:
            current += nums[i]
        if current > best:
            best, best_start, best_end = current, start, i
    return best, best_start, best_end

assert max_subarray([-2, 1, -3, 4, -1, 2, 1, -5, 4]) == 6
assert max_subarray([1]) == 1
assert max_subarray([-3, -1, -2]) == -1      # all negative: pick the largest single value
assert max_subarray([5, 4, -1, 7, 8]) == 23
assert max_subarray_with_range([-2, 1, -3, 4, -1, 2, 1, -5, 4]) == (6, 3, 6)

import random
random.seed(1)
for _ in range(300):
    arr = [random.randint(-10, 10) for _ in range(random.randint(1, 12))]
    brute = max(sum(arr[i : j + 1]) for i in range(len(arr)) for j in range(i, len(arr)))
    assert max_subarray(arr) == brute == max_subarray_with_range(arr)[0]
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Empty subarray allowed (answer at least 0)?** Start `best` at 0 and `current` at 0.
- **Maximum product subarray?** Track both the largest and the smallest product ending here, because a negative number swaps them.

### Product of array except self {medium core}

Return a list where position `i` holds the product of every element except `nums[i]`. Do not use division, and aim
for O(n) time.

`[1, 2, 3, 4]` → `[24, 12, 8, 6]`

#### Hints

1. Brute force multiplies everything else for each index: O(n²).
2. The answer at i is (product of everything to the left) × (product of everything to the right).
3. Fill the output with left products in one pass, then multiply in right products in a second pass going backwards.

#### Solution

Division fails as soon as the list contains a zero, which is why interviewers forbid it. Two passes avoid it: the
first writes the product of everything left of i, the second multiplies by a running product of everything right
of i. The output list does not count as extra space, so this is O(1) extra.

```python
def product_except_self(nums: list[int]) -> list[int]:
    n = len(nums)
    out = [1] * n
    left = 1
    for i in range(n):
        out[i] = left
        left *= nums[i]
    right = 1
    for i in range(n - 1, -1, -1):
        out[i] *= right
        right *= nums[i]
    return out

assert product_except_self([1, 2, 3, 4]) == [24, 12, 8, 6]
assert product_except_self([-1, 1, 0, -3, 3]) == [0, 0, 9, 0, 0]
assert product_except_self([0, 0]) == [0, 0]
assert product_except_self([2, 3]) == [3, 2]
assert product_except_self([5]) == [1]
```

Complexity: O(n) time, O(1) extra space besides the output.

#### Follow-ups

- **Why not divide the total product by nums[i]?** One zero makes the total 0 and dividing by zero fails; you would need to count zeros as a special case.
- **Sum except self?** That one can simply use `total - nums[i]`.

### Merge two sorted arrays in place {easy}

`nums1` has length `m + n`: its first `m` values are sorted and the last `n` slots are zeros. `nums2` holds `n`
sorted values. Merge `nums2` into `nums1` so that `nums1` is sorted.

`nums1 = [1, 2, 3, 0, 0, 0], m = 3, nums2 = [2, 5, 6], n = 3` → `[1, 2, 2, 3, 5, 6]`

#### Hints

1. Copying and sorting works in O((m + n) log(m + n)), but ignores that both inputs are sorted.
2. Merging from the front overwrites values of nums1 you still need.
3. Merge from the back: the largest remaining value goes into the last free slot.

#### Solution

Filling from the end means the slot you write to is always empty or already consumed. When `nums2` runs out, the rest
of `nums1` is already in place. When `nums1` runs out, copy what remains of `nums2`.

```python
def merge(nums1: list[int], m: int, nums2: list[int], n: int) -> None:
    i, j, write = m - 1, n - 1, m + n - 1
    while j >= 0:
        if i >= 0 and nums1[i] > nums2[j]:
            nums1[write] = nums1[i]
            i -= 1
        else:
            nums1[write] = nums2[j]
            j -= 1
        write -= 1

a = [1, 2, 3, 0, 0, 0]
merge(a, 3, [2, 5, 6], 3)
assert a == [1, 2, 2, 3, 5, 6]
b = [1]
merge(b, 1, [], 0)
assert b == [1]
c = [0]
merge(c, 0, [1], 1)
assert c == [1]
d = [4, 5, 6, 0, 0, 0]
merge(d, 3, [1, 2, 3], 3)
assert d == [1, 2, 3, 4, 5, 6]
```

Complexity: O(m + n) time, O(1) extra space.

#### Follow-ups

- **Return a new merged list instead?** The classic two-pointer merge from the front; `heapq.merge` does it lazily for any number of sorted inputs.
- **Merge k sorted lists?** A min-heap of the current head of each list: O(N log k).

### Longest common prefix {easy}

Return the longest prefix shared by every string in a list, or `""` if there is none.

`["flower", "flow", "flight"]` → `"fl"`

#### Hints

1. Compare character by character across all strings, stopping at the first mismatch or the shortest string.
2. A neat trick: only the alphabetically smallest and largest strings matter.

#### Solution

Vertical scanning checks position 0 in every string, then position 1, and so on. The `min`/`max` trick works because
any prefix shared by the lexicographically smallest and largest strings is shared by everything sorted between them.

```python
def longest_common_prefix(strs: list[str]) -> str:
    if not strs:
        return ""
    for i, ch in enumerate(strs[0]):
        for s in strs[1:]:
            if i == len(s) or s[i] != ch:
                return strs[0][:i]
    return strs[0]

def longest_common_prefix_minmax(strs: list[str]) -> str:
    if not strs:
        return ""
    lo, hi = min(strs), max(strs)
    i = 0
    while i < len(lo) and lo[i] == hi[i]:
        i += 1
    return lo[:i]

for fn in (longest_common_prefix, longest_common_prefix_minmax):
    assert fn(["flower", "flow", "flight"]) == "fl"
    assert fn(["dog", "racecar", "car"]) == ""
    assert fn([]) == ""
    assert fn(["alone"]) == "alone"
    assert fn(["ab", "a"]) == "a"
    assert fn(["", "abc"]) == ""
```

Complexity: O(S) time where S is the total number of characters; O(1) extra space.

#### Follow-ups

- **Many queries against the same word list?** Build a trie once; the common prefix is the path until a node branches or a word ends.

### String compression {medium}

Compress runs of repeated characters as character + count: `"aabcccccaaa"` → `"a2b1c5a3"`. If the compressed string
is not shorter than the original, return the original.

#### Hints

1. Walk the string, counting how long the current run is.
2. When the character changes (or the string ends), emit the character and its count.
3. Collect parts in a list and join once; repeated `+=` can be O(n²).

#### Solution

```python
from itertools import groupby

def compress(s: str) -> str:
    if not s:
        return s
    parts: list[str] = []
    run_char, run_len = s[0], 1
    for ch in s[1:]:
        if ch == run_char:
            run_len += 1
        else:
            parts.append(f"{run_char}{run_len}")
            run_char, run_len = ch, 1
    parts.append(f"{run_char}{run_len}")      # the last run
    out = "".join(parts)
    return out if len(out) < len(s) else s

def compress_groupby(s: str) -> str:
    out = "".join(f"{ch}{len(list(run))}" for ch, run in groupby(s))
    return out if len(out) < len(s) else s

for fn in (compress, compress_groupby):
    assert fn("aabcccccaaa") == "a2b1c5a3"
    assert fn("abc") == "abc"            # "a1b1c1" is longer
    assert fn("") == ""
    assert fn("aa") == "aa"              # "a2" is not shorter
    assert fn("aaa") == "a3"
    assert fn("a" * 12) == "a12"         # multi-digit counts
```

Forgetting to emit the final run is the classic bug; the line after the loop handles it.

Complexity: O(n) time, O(n) space for the output.

#### Follow-ups

- **Decompress "a2b1c5a3"?** Parse with `re.findall(r"(\D)(\d+)", s)` and join `ch * int(n)`.
- **Omit the count when it is 1 ("a2bc5a3")?** Emit `run_char` alone when `run_len == 1`; then decoding must treat a missing number as 1.

### Reverse the order of words {medium}

Reverse the order of the words in a string. Words are separated by one or more spaces; the result has single spaces
and no leading or trailing spaces.

`"  the sky   is blue "` → `"blue is sky the"`

#### Hints

1. In Python, `s.split()` already drops extra whitespace.
2. If the interviewer forbids `split`, walk the string from the end and collect words manually.

#### Solution

The idiomatic answer is one line. Be ready to write it without `split`, because some interviewers ask for that to see
the indexing.

```python
def reverse_words(s: str) -> str:
    return " ".join(reversed(s.split()))

def reverse_words_manual(s: str) -> str:
    words: list[str] = []
    i = len(s) - 1
    while i >= 0:
        while i >= 0 and s[i] == " ":
            i -= 1
        end = i
        while i >= 0 and s[i] != " ":
            i -= 1
        if end >= 0:
            words.append(s[i + 1 : end + 1])
    return " ".join(words)

for fn in (reverse_words, reverse_words_manual):
    assert fn("the sky is blue") == "blue is sky the"
    assert fn("  hello world  ") == "world hello"
    assert fn("a good   example") == "example good a"
    assert fn("") == ""
    assert fn("   ") == ""
    assert fn("one") == "one"
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **In place on a character array (O(1) extra space)?** Reverse the whole array, then reverse each word.

### First non-repeating character {easy core}

Return the index of the first character that appears exactly once, or -1.

`"leetcode"` → `0`; `"loveleetcode"` → `2`; `"aabb"` → `-1`

#### Hints

1. Checking `s.count(ch)` for every character is O(n²).
2. Count everything in one pass, then scan again for the first count of 1.

#### Solution

Two passes, both O(n): the first counts, the second finds the first character whose count is 1. The second pass goes
over the string (not the counter), so the answer is the first in string order.

```python
from collections import Counter

def first_unique(s: str) -> int:
    counts = Counter(s)
    for i, ch in enumerate(s):
        if counts[ch] == 1:
            return i
    return -1

assert first_unique("leetcode") == 0
assert first_unique("loveleetcode") == 2
assert first_unique("aabb") == -1
assert first_unique("") == -1
assert first_unique("z") == 0
assert first_unique("aabbc") == 4
```

Complexity: O(n) time; O(1) space if the alphabet is fixed (O(k) for k distinct characters in general).

#### Follow-ups

- **Characters arrive as a stream; report the first unique after each one?** Keep counts plus a deque of candidates; pop from the front while the front's count is above 1.

### Rotate a matrix 90 degrees clockwise {medium core}

Rotate an n × n matrix 90 degrees clockwise, in place.

`[[1, 2, 3], [4, 5, 6], [7, 8, 9]]` → `[[7, 4, 1], [8, 5, 2], [9, 6, 3]]`

#### Hints

1. Work out where `matrix[r][c]` goes: it ends up at `matrix[c][n - 1 - r]`.
2. In place: transpose (swap across the main diagonal), then reverse each row.
3. The Pythonic copy version is `[list(row) for row in zip(*matrix[::-1])]`.

#### Solution

Transposing turns rows into columns; reversing each row then gives the clockwise rotation. Only swap above the
diagonal while transposing, or every pair gets swapped twice and nothing changes.

```python
def rotate_matrix(matrix: list[list[int]]) -> None:
    n = len(matrix)
    for r in range(n):
        for c in range(r + 1, n):
            matrix[r][c], matrix[c][r] = matrix[c][r], matrix[r][c]
    for row in matrix:
        row.reverse()

def rotated_copy(matrix: list[list[int]]) -> list[list[int]]:
    return [list(row) for row in zip(*matrix[::-1])]

m = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
assert rotated_copy(m) == [[7, 4, 1], [8, 5, 2], [9, 6, 3]]
rotate_matrix(m)
assert m == [[7, 4, 1], [8, 5, 2], [9, 6, 3]]

m4 = [[5, 1, 9, 11], [2, 4, 8, 10], [13, 3, 6, 7], [15, 14, 12, 16]]
rotate_matrix(m4)
assert m4 == [[15, 13, 2, 5], [14, 3, 4, 1], [12, 6, 8, 9], [16, 7, 10, 11]]

single = [[1]]
rotate_matrix(single)
assert single == [[1]]
```

Complexity: O(n²) time (every cell moves), O(1) extra space.

#### Follow-ups

- **Counter-clockwise?** Transpose, then reverse each column (or reverse the row order instead of each row).
- **A non-square matrix?** It cannot be done in place; build a new m × n matrix with `zip(*matrix[::-1])`.

### Spiral order of a matrix {medium}

Return the elements of an m × n matrix in clockwise spiral order.

`[[1, 2, 3], [4, 5, 6], [7, 8, 9]]` → `[1, 2, 3, 6, 9, 8, 7, 4, 5]`

#### Hints

1. Keep four boundaries: top, bottom, left, right.
2. Walk right along the top row, down the right column, left along the bottom row, up the left column, then shrink.
3. Check the boundaries again before the bottom and left walks, or a single remaining row or column is read twice.

#### Solution

```python
def spiral_order(matrix: list[list[int]]) -> list[int]:
    out: list[int] = []
    if not matrix or not matrix[0]:
        return out
    top, bottom, left, right = 0, len(matrix) - 1, 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:
        out.extend(matrix[top][c] for c in range(left, right + 1))
        top += 1
        out.extend(matrix[r][right] for r in range(top, bottom + 1))
        right -= 1
        if top <= bottom:
            out.extend(matrix[bottom][c] for c in range(right, left - 1, -1))
            bottom -= 1
        if left <= right:
            out.extend(matrix[r][left] for r in range(bottom, top - 1, -1))
            left += 1
    return out

assert spiral_order([[1, 2, 3], [4, 5, 6], [7, 8, 9]]) == [1, 2, 3, 6, 9, 8, 7, 4, 5]
assert spiral_order([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]) == [1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]
assert spiral_order([[1, 2, 3]]) == [1, 2, 3]           # one row
assert spiral_order([[1], [2], [3]]) == [1, 2, 3]       # one column
assert spiral_order([]) == [] and spiral_order([[]]) == []
```

Complexity: O(m·n) time, O(1) extra space besides the output.

#### Follow-ups

- **Generate an n × n spiral filled with 1..n²?** Same boundaries, but write values instead of reading them.

### Roman numeral to integer {easy}

Convert a Roman numeral to an integer. I = 1, V = 5, X = 10, L = 50, C = 100, D = 500, M = 1000. A smaller value
before a larger one is subtracted (IV = 4, IX = 9, XL = 40, XC = 90, CD = 400, CM = 900).

`"MCMXCIV"` → `1994`

#### Hints

1. Map each symbol to its value.
2. If a symbol is smaller than the one after it, subtract it; otherwise add it.

#### Solution

```python
VALUES = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}

def roman_to_int(s: str) -> int:
    total = 0
    for i, ch in enumerate(s):
        value = VALUES[ch]
        if i + 1 < len(s) and value < VALUES[s[i + 1]]:
            total -= value
        else:
            total += value
    return total

PAIRS = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
         (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]

def int_to_roman(n: int) -> str:
    parts: list[str] = []
    for value, symbol in PAIRS:
        count, n = divmod(n, value)
        parts.append(symbol * count)
    return "".join(parts)

assert roman_to_int("III") == 3
assert roman_to_int("LVIII") == 58
assert roman_to_int("MCMXCIV") == 1994
assert roman_to_int("IV") == 4 and roman_to_int("IX") == 9
assert int_to_roman(1994) == "MCMXCIV"
assert all(roman_to_int(int_to_roman(n)) == n for n in range(1, 4000))
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Integer to Roman?** Greedy over the 13 value/symbol pairs from largest to smallest, as in `int_to_roman` above.
- **Validate the input ("IIII", "IC" are invalid)?** Convert, convert back with `int_to_roman`, and compare with the input.
