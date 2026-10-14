---
title: Two pointers and sliding window
goal: Spot when two indices can replace a nested loop, explain why each pointer move is safe, and write the opposite-ends, read/write and sliding-window templates from memory.
minutes: 80
---

These two patterns turn an O(n²) brute force into a single O(n) pass, which makes them interview favourites: the
brute force is obvious, and the optimisation shows whether you can explain what each pointer move rules out. Learn the
three templates below until you can write them without thinking. Then, for every problem, say out loud *why* moving a
pointer can never skip the answer. That sentence is what interviewers listen for.

## Recognise the pattern

| What the problem says | Pattern | Why it works |
|---|---|---|
| Sorted array, find a pair or triple with a target sum | Opposite ends | A sum that is too small rules out the left value; too big rules out the right value |
| Palindrome, reverse in place, compare from both ends | Opposite ends | The two ends must match, then the problem shrinks |
| Remove, compact or partition in place, keep the order | Read/write (slow/fast) | The write pointer marks the end of the finished part |
| Contiguous subarray or substring, "longest", "shortest", "at most k", "at least" | Variable sliding window | Grow on the right, shrink on the left; each index enters and leaves once |
| Contiguous block of exactly k elements | Fixed sliding window | Add the element entering, subtract the one leaving |
| Character counts must match (anagram, permutation) | Window + frequency map | A permutation is "same counts" |

A sliding window needs a **monotonic** condition: growing the window can only make it "more invalid" (or more
satisfied), and shrinking does the reverse. With negative numbers a sum window breaks, because adding an element can
make the sum smaller. Then you switch to prefix sums.

## The templates

### Opposite ends

```python
def pair_with_sum(nums: list[int], target: int) -> tuple[int, int] | None:
    """nums is sorted ascending."""
    left, right = 0, len(nums) - 1
    while left < right:
        total = nums[left] + nums[right]
        if total == target:
            return left, right
        if total < target:
            left += 1      # nums[left] is too small even with the largest partner left
        else:
            right -= 1     # nums[right] is too big even with the smallest partner left
    return None

assert pair_with_sum([1, 3, 4, 6, 9], 10) == (0, 4)
assert pair_with_sum([1, 3, 4, 6, 9], 7) == (0, 3)   # 1 + 6; the first pair the scan meets
assert pair_with_sum([1, 2], 10) is None
```

### Variable sliding window

Two shapes. For **longest**, shrink while the window is invalid, then record. For **shortest**, record while the
window is valid, then shrink.

```python
def longest_with_at_most_k_distinct(s: str, k: int) -> int:
    counts: dict[str, int] = {}
    left = best = 0
    for right, ch in enumerate(s):
        counts[ch] = counts.get(ch, 0) + 1        # 1. grow: take s[right] in
        while len(counts) > k:                     # 2. shrink until valid again
            counts[s[left]] -= 1
            if counts[s[left]] == 0:
                del counts[s[left]]
            left += 1
        best = max(best, right - left + 1)         # 3. the window is valid: record it
    return best

assert longest_with_at_most_k_distinct("eceba", 2) == 3     # "ece"
assert longest_with_at_most_k_distinct("aa", 1) == 2
assert longest_with_at_most_k_distinct("", 2) == 0
```

### Read/write pointers

```python
def remove_value(nums: list[int], val: int) -> int:
    """Remove every val in place; return the new length. Order of the kept values is preserved."""
    write = 0
    for read in range(len(nums)):
        if nums[read] != val:
            nums[write] = nums[read]
            write += 1
    return write

nums = [3, 2, 2, 3, 4]
k = remove_value(nums, 3)
assert nums[:k] == [2, 2, 4]
```

**Why these are O(n) even with a nested `while`:** `left` and `right` only ever move forward, so together they make at
most 2n moves. Say this when the interviewer asks about the inner loop.

## Interview questions

### Why is a sliding window O(n) when it has a while loop inside a for loop? {core}

Because each pointer only moves forward. The right pointer moves n times in total and the left pointer moves at most n
times in total across the whole run, so the inner loop's work is spread over all iterations: amortised O(1) per step,
O(n) overall. The nested loop shape is misleading; count pointer moves, not loop nesting.

### When does a sliding window not work? {core}

When the window's condition is not monotonic. The classic case is "subarray sum equals k" or "sum at least k" with
**negative numbers**: adding an element can lower the sum, so you can't tell whether to grow or shrink. Use prefix sums
with a hash map (sum equals k) or prefix sums with a monotonic deque (shortest subarray with sum at least k) instead.

### How do you prove an opposite-ends two-pointer solution is correct? {deep}

Show that every pointer move discards only candidates that cannot be the answer. In pair-sum on a sorted array, if
`nums[l] + nums[r] < target` then `nums[l]` plus any element at or left of `r` is also too small, so no remaining pair
uses `nums[l]` and moving `l` is safe. The same style of argument ("the shorter wall caps the height") proves Container
With Most Water.

### Two pointers or a hash map for Two Sum? {core}

Unsorted input and you need original indices: a hash map, O(n) time and O(n) space. Already sorted: two pointers,
O(n) time and O(1) space. Sorting first costs O(n log n) and loses the original indices unless you sort `(value, index)`
pairs. State both and pick based on the input.

### What is the difference between a fixed and a variable window? {deep}

A fixed window has a known size k: both ends move together, and you update the running value by adding the entering
element and removing the leaving one. A variable window grows on the right and shrinks on the left based on a
condition (distinct count, sum, character counts), so its size changes as you go.

## Coding problems

### Valid palindrome {easy core}

Given a string `s`, return `True` if it reads the same forwards and backwards after converting to lower case and
keeping only letters and digits.

- `"A man, a plan, a canal: Panama"` → `True`
- `"race a car"` → `False`

#### Hints

1. The simplest version builds a cleaned string and compares it with its reverse. What does that cost in memory?
2. Put one pointer at each end. Skip anything that is not alphanumeric, then compare.

#### Solution

**Brute force (fine to say first):** `cleaned = "".join(c.lower() for c in s if c.isalnum())` and return
`cleaned == cleaned[::-1]`. That is O(n) time and O(n) extra space, and perfectly readable.

**Optimal for space:** compare from both ends and skip non-alphanumeric characters in place.

```python
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

assert is_palindrome("A man, a plan, a canal: Panama")
assert not is_palindrome("race a car")
assert is_palindrome("")
assert is_palindrome(" ,.")          # nothing left after cleaning
assert not is_palindrome("0P")       # digits count, and "0" != "p"
```

Complexity: O(n) time, O(1) extra space.

#### Follow-ups

- **You may delete at most one character (Valid Palindrome II).** On the first mismatch, check whether either
  `s[left+1 : right+1]` or `s[left:right]` is a palindrome. Still O(n).
- **Non-English text?** `str.isalnum()` and `lower()` are Unicode-aware. For case-insensitive matching across
  languages, `casefold()` is the stronger choice (for example, German "ß" casefolds to "ss").

### Two sum II: the input is sorted {medium core}

`numbers` is sorted in ascending order. Return the 1-based indices `[i, j]` of the two numbers that add up to
`target`. There is exactly one solution, and you must use O(1) extra space.

- `numbers = [2, 7, 11, 15], target = 9` → `[1, 2]`

#### Hints

1. Every pair is O(n²). A hash map is O(n) but uses O(n) memory and ignores the fact that the input is sorted.
2. Start with the smallest and the largest values. If their sum is too small, which value can never be part of the
   answer?

#### Solution

If `numbers[left] + numbers[right]` is below the target, then `numbers[left]` paired with anything at or left of
`right` is also below the target, so `numbers[left]` is useless: move `left`. If the sum is too big, `numbers[right]`
is useless: move `right`. Each step discards one value for good, so one pass is enough.

```python
def two_sum_sorted(numbers: list[int], target: int) -> list[int]:
    left, right = 0, len(numbers) - 1
    while left < right:
        total = numbers[left] + numbers[right]
        if total == target:
            return [left + 1, right + 1]
        if total < target:
            left += 1
        else:
            right -= 1
    return []

assert two_sum_sorted([2, 7, 11, 15], 9) == [1, 2]
assert two_sum_sorted([2, 3, 4], 6) == [1, 3]
assert two_sum_sorted([-1, 0], -1) == [1, 2]
assert two_sum_sorted([1, 2, 3], 100) == []
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Count all pairs, with duplicates?** On a match with different values, count the run of equal values at each end
  and multiply. If both ends hold the same value, the run has `m` elements and gives `m * (m - 1) // 2` pairs.
- **Closest sum to the target?** Same loop; track the smallest `abs(total - target)`.
- **Unsorted input?** Use a hash map (`seen[value] = index`), or sort `(value, index)` pairs if memory is tight.

### Remove duplicates from a sorted array {easy}

Remove duplicates from a sorted list **in place** so that each value appears once, and return the new length `k`.
The first `k` elements must hold the unique values in their original order.

- `[0, 0, 1, 1, 1, 2, 2, 3, 3, 4]` → `5`, and `nums[:5] == [0, 1, 2, 3, 4]`

#### Hints

1. `list(dict.fromkeys(nums))` dedupes in order, but it is not in place.
2. Use a `write` pointer for the next free slot and a `read` pointer that scans. Compare each value with the last one
   you wrote.

#### Solution

Because the input is sorted, duplicates sit next to each other. A value is new exactly when it differs from the last
value written.

```python
def remove_duplicates(nums: list[int]) -> int:
    if not nums:
        return 0
    write = 1
    for read in range(1, len(nums)):
        if nums[read] != nums[write - 1]:
            nums[write] = nums[read]
            write += 1
    return write

nums = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4]
k = remove_duplicates(nums)
assert k == 5 and nums[:k] == [0, 1, 2, 3, 4]

for case, expected in [([], []), ([1], [1]), ([1, 1, 1], [1]), ([1, 2, 3], [1, 2, 3])]:
    k = remove_duplicates(case)
    assert case[:k] == expected
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Keep at most two copies of each value?** Compare with `nums[write - 2]` instead, starting `write` at 2.
- **Unsorted input, keep the first occurrence?** Keep a `seen` set and the same write pointer: O(n) time, O(n) space.
- **Move zeroes to the end** is the same template: write every non-zero forward, then fill the rest with zeros.

### Sort colours {medium}

`nums` contains only `0`, `1` and `2`. Sort it in place, in one pass, without using the library sort.

- `[2, 0, 2, 1, 1, 0]` → `[0, 0, 1, 1, 2, 2]`

#### Hints

1. Two passes work: count the 0s, 1s and 2s, then overwrite. Can you do it in one pass?
2. Keep three regions: 0s before `low`, 2s after `high`, and the unknown part from `mid` to `high`.
3. After swapping a 2 to the end, do not move `mid`: the value that came back has not been checked yet.

#### Solution

This is the Dutch national flag partition. Invariant: `nums[:low]` are 0s, `nums[low:mid]` are 1s, `nums[high+1:]`
are 2s, and `nums[mid:high+1]` is unknown. Each step shrinks the unknown part by one.

```python
def sort_colors(nums: list[int]) -> None:
    low, mid, high = 0, 0, len(nums) - 1
    while mid <= high:
        if nums[mid] == 0:
            nums[low], nums[mid] = nums[mid], nums[low]
            low += 1
            mid += 1          # the value swapped in from low was a 1 (or this same 0), so it is done
        elif nums[mid] == 1:
            mid += 1
        else:
            nums[mid], nums[high] = nums[high], nums[mid]
            high -= 1         # mid stays: the value swapped in is still unknown

for case in ([2, 0, 2, 1, 1, 0], [2, 0, 1], [0], [], [1, 1], [2, 2, 0, 0], [1, 2, 0, 2, 1, 0, 0, 2, 1]):
    expected = sorted(case)
    sort_colors(case)
    assert case == expected
```

Complexity: O(n) time in a single pass, O(1) space.

#### Follow-ups

- **k colours?** Counting sort: count each value, then overwrite. O(n + k).
- **Where else is this used?** The same three-way partition makes quicksort fast on inputs with many equal keys.

### Container with most water {medium core}

`height[i]` is the height of a vertical line at position `i`. Choose two lines that, with the x-axis, hold the most
water. Return the largest area.

- `[1, 8, 6, 2, 5, 4, 8, 3, 7]` → `49` (the lines at index 1 and 8: width 7 × height 7)

#### Hints

1. Brute force: every pair, area = `min(h[i], h[j]) * (j - i)`. That is O(n²).
2. Start with the widest container. Moving the taller wall inward can never help. Why?
3. Always move the shorter wall.

#### Solution

The shorter wall caps the water level. Any narrower container that keeps the shorter wall is both narrower and capped
at the same height or lower, so it can never beat the current area. That wall can be discarded for good: move it.

```python
def max_area(height: list[int]) -> int:
    left, right = 0, len(height) - 1
    best = 0
    while left < right:
        width = right - left
        best = max(best, min(height[left], height[right]) * width)
        if height[left] <= height[right]:
            left += 1
        else:
            right -= 1
    return best

assert max_area([1, 8, 6, 2, 5, 4, 8, 3, 7]) == 49
assert max_area([1, 1]) == 1
assert max_area([4, 3, 2, 1, 4]) == 16
assert max_area([1, 2, 1]) == 2
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Trapping Rain Water** looks similar but sums the water above every bar. Two pointers again: keep `left_max` and
  `right_max`, and always process the side with the smaller max, because that side's water level is already decided.

### 3Sum {medium core}

Return all **unique** triplets `[a, b, c]` from `nums` with `a + b + c == 0`.

- `[-1, 0, 1, 2, -1, -4]` → `[[-1, -1, 2], [-1, 0, 1]]`

#### Hints

1. Brute force is three nested loops, O(n³), plus a set of sorted tuples to remove duplicates.
2. Sort first. Fix the first number, and the rest becomes Two Sum II on the part to its right.
3. To avoid duplicates, skip a first number equal to the previous one, and after a match skip equal neighbours.

#### Solution

Sorting costs O(n log n) but turns the inner search into an O(n) two-pointer scan, giving O(n²) overall. Sorting also
puts equal values next to each other, which makes skipping duplicates easy.

```python
def three_sum(nums: list[int]) -> list[list[int]]:
    nums = sorted(nums)
    result: list[list[int]] = []
    n = len(nums)
    for i in range(n - 2):
        if nums[i] > 0:
            break                      # the smallest of the three is positive: no zero sum is possible
        if i > 0 and nums[i] == nums[i - 1]:
            continue                   # same first value as last time gives the same triplets
        left, right = i + 1, n - 1
        while left < right:
            total = nums[i] + nums[left] + nums[right]
            if total < 0:
                left += 1
            elif total > 0:
                right -= 1
            else:
                result.append([nums[i], nums[left], nums[right]])
                left += 1
                right -= 1
                while left < right and nums[left] == nums[left - 1]:
                    left += 1          # skip repeats of the value we just used
    return result

assert three_sum([-1, 0, 1, 2, -1, -4]) == [[-1, -1, 2], [-1, 0, 1]]
assert three_sum([0, 1, 1]) == []
assert three_sum([0, 0, 0, 0]) == [[0, 0, 0]]
assert three_sum([]) == []
assert three_sum([-2, 0, 1, 1, 2]) == [[-2, 0, 2], [-2, 1, 1]]
```

Complexity: O(n²) time, O(n) for the sorted copy (O(1) extra if you sort in place).

#### Follow-ups

- **3Sum Closest?** Same loop; track the total with the smallest `abs(total - target)`.
- **4Sum?** Add one more outer loop with the same duplicate skipping: O(n³).
- **Why not a hash set inside the loop?** It also gives O(n²), but removing duplicate triplets is messier. Sorting
  plus two pointers is the cleaner interview answer.

### Maximum sum of a window of size k {easy core}

Given daily admission counts `nums` and a window size `k`, return the largest total over any `k` consecutive days.

- `nums = [2, 1, 5, 1, 3, 2], k = 3` → `9` (days `[5, 1, 3]`)

#### Hints

1. Summing every window from scratch costs O(n·k).
2. Neighbouring windows share k − 1 values. Add the day that enters and subtract the day that leaves.

#### Solution

Keep a running total of the current window and slide it one step at a time.

```python
def max_window_sum(nums: list[int], k: int) -> int:
    if not 1 <= k <= len(nums):
        raise ValueError("k must be between 1 and len(nums)")
    window = sum(nums[:k])
    best = window
    for right in range(k, len(nums)):
        window += nums[right] - nums[right - k]     # one value enters, one leaves
        best = max(best, window)
    return best

assert max_window_sum([2, 1, 5, 1, 3, 2], 3) == 9
assert max_window_sum([2, 3, 4, 1, 5], 2) == 7
assert max_window_sum([-3, -1, -2], 2) == -3
assert max_window_sum([5], 1) == 5
try:
    max_window_sum([1, 2], 3)
    raise AssertionError("expected ValueError")
except ValueError:
    pass
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Moving average over a stream?** Keep the last k values in a `deque(maxlen=k)` and a running sum.
- **Maximum value (not sum) in every window?** Use a monotonic deque: see Sliding window maximum in the stacks and
  queues chapter.

### Longest substring without repeating characters {medium core}

Return the length of the longest substring of `s` with no repeated characters.

- `"abcabcbb"` → `3` (`"abc"`), `"bbbbb"` → `1`, `"pwwkew"` → `3` (`"wke"`)

#### Hints

1. Brute force checks every substring: O(n³), or O(n²) if you grow a set from each start.
2. Keep a window with no repeats. When the new character is already inside, move `left` past its earlier copy.
3. Store each character's last index in a dict so `left` can jump straight there.

#### Solution

Grow the window one character at a time. If the character was last seen **inside** the current window, the window
must now start just after that earlier copy. The `>= left` check matters: a stale index from before the window must not
pull `left` backwards.

```python
def length_of_longest_substring(s: str) -> int:
    last_seen: dict[str, int] = {}
    left = best = 0
    for right, ch in enumerate(s):
        if ch in last_seen and last_seen[ch] >= left:
            left = last_seen[ch] + 1       # jump past the earlier copy
        last_seen[ch] = right
        best = max(best, right - left + 1)
    return best

assert length_of_longest_substring("abcabcbb") == 3
assert length_of_longest_substring("bbbbb") == 1
assert length_of_longest_substring("pwwkew") == 3
assert length_of_longest_substring("") == 0
assert length_of_longest_substring(" ") == 1
assert length_of_longest_substring("abba") == 2   # without the >= left check this would wrongly give 3
```

Complexity: O(n) time, O(min(n, alphabet size)) space.

#### Follow-ups

- **Return the substring itself?** Record `left` whenever `best` improves, then slice.
- **At most k distinct characters?** Use the counting window from the templates section.

### Minimum size subarray sum {medium}

Given **positive** integers `nums` and a `target`, return the length of the shortest contiguous subarray whose sum is
at least `target`, or `0` if there is none.

- `target = 7, nums = [2, 3, 1, 2, 4, 3]` → `2` (`[4, 3]`)

#### Hints

1. Brute force: from each start, extend until the sum reaches the target. O(n²).
2. Every number is positive, so growing the window raises the sum and shrinking lowers it.
3. Grow on the right. While the sum is at least the target, record the length and shrink from the left.

#### Solution

This is the "shortest" window shape: record while the window is valid, then shrink to look for something shorter.

```python
def min_subarray_len(target: int, nums: list[int]) -> int:
    left = window = 0
    best = len(nums) + 1                  # longer than any real answer
    for right, value in enumerate(nums):
        window += value
        while window >= target:
            best = min(best, right - left + 1)
            window -= nums[left]
            left += 1
    return best if best <= len(nums) else 0

assert min_subarray_len(7, [2, 3, 1, 2, 4, 3]) == 2
assert min_subarray_len(4, [1, 4, 4]) == 1
assert min_subarray_len(11, [1, 1, 1, 1, 1, 1, 1, 1]) == 0
assert min_subarray_len(15, [1, 2, 3, 4, 5]) == 5
assert min_subarray_len(3, []) == 0
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **What if numbers can be negative?** The window breaks, because the sum is no longer monotonic. Use prefix sums with
  a monotonic deque (LeetCode 862), O(n).
- **An O(n log n) alternative?** Prefix sums are increasing for positive numbers, so for each end you can binary
  search the latest start with `bisect`.

### Permutation in string {medium}

Return `True` if `s2` contains some permutation of `s1` as a contiguous substring.

- `s1 = "ab", s2 = "eidbaooo"` → `True` (`"ba"`)
- `s1 = "ab", s2 = "eidboaoo"` → `False`

#### Hints

1. Generating every permutation of `s1` is O(m!). Not an option.
2. A permutation has exactly the same character counts. Slide a window of length `len(s1)` across `s2` and compare
   counts.
3. Update the window's counts in O(1) per step: add the entering character, remove the leaving one.

#### Solution

A fixed-size window with a `Counter`. Comparing two Counters costs O(alphabet size), which is a constant for lower-case
letters, so the whole scan is O(n).

```python
from collections import Counter

def check_inclusion(s1: str, s2: str) -> bool:
    k = len(s1)
    if k > len(s2):
        return False
    need = Counter(s1)
    window = Counter(s2[:k])
    if window == need:
        return True
    for right in range(k, len(s2)):
        window[s2[right]] += 1
        leaving = s2[right - k]
        window[leaving] -= 1
        if window[leaving] == 0:
            del window[leaving]          # keeps the window small; since 3.10 == also ignores zero counts
        if window == need:
            return True
    return False

assert check_inclusion("ab", "eidbaooo")
assert not check_inclusion("ab", "eidboaoo")
assert check_inclusion("adc", "dcda")
assert check_inclusion("a", "a")
assert not check_inclusion("abc", "ab")
```

Complexity: O(n · σ) time where σ is the alphabet size (O(n) for a fixed alphabet), O(σ) space.

#### Follow-ups

- **Find All Anagrams in a String:** the same loop, but collect every start index `right - k + 1` where the counts
  match.
- **Strictly O(n) with no Counter comparison?** Track how many characters currently have the right count, and update
  that number as counts change.

### Longest repeating character replacement {medium}

`s` contains upper-case letters. You may change at most `k` characters. Return the length of the longest substring
that can be made of one repeated letter.

- `s = "ABAB", k = 2` → `4`
- `s = "AABABBA", k = 1` → `4` (`"AABA"` → `"AAAA"`)

#### Hints

1. A window can be fixed when `window length - count of its most common letter <= k`: you replace everything else.
2. Grow the window on the right; while it cannot be fixed, shrink from the left.
3. With 26 letters, finding the most common count with `max(counts.values())` is O(26), a constant.

#### Solution

The window condition is monotonic: making a window longer never makes it easier to fix. So the standard
"longest window" template applies.

```python
from collections import defaultdict

def character_replacement(s: str, k: int) -> int:
    counts: defaultdict[str, int] = defaultdict(int)
    left = best = 0
    for right, ch in enumerate(s):
        counts[ch] += 1
        while (right - left + 1) - max(counts.values()) > k:
            counts[s[left]] -= 1
            left += 1
        best = max(best, right - left + 1)
    return best

assert character_replacement("ABAB", 2) == 4
assert character_replacement("AABABBA", 1) == 4
assert character_replacement("", 2) == 0
assert character_replacement("AAAA", 0) == 4
assert character_replacement("ABCDE", 1) == 2
assert character_replacement("ABBB", 2) == 4
```

Complexity: O(26 · n) = O(n) time, O(26) space.

#### Follow-ups

- **The well-known optimisation:** keep a running `max_freq` and never decrease it when shrinking. The answer can
  only grow when a larger `max_freq` appears, so the stale value never produces a wrong maximum. It removes the
  O(26) factor, but explain the simple version first; it is easier to defend.
- **Binary array, flip at most k zeros (Max Consecutive Ones III)?** The same window: shrink while the window holds
  more than k zeros.

### Minimum window substring {hard}

Given strings `s` and `t`, return the shortest substring of `s` that contains every character of `t`, including
duplicates. Return `""` if there is none.

- `s = "ADOBECODEBANC", t = "ABC"` → `"BANC"`
- `s = "a", t = "aa"` → `""`

#### Hints

1. Count what you need with `Counter(t)`.
2. Expand the right end until the window covers `t`. Track how many required characters are still missing, so the
   check is O(1).
3. Once it covers `t`, shrink from the left while it still does, recording the shortest window.

#### Solution

`need[c]` is how many more copies of `c` the window still needs; it goes negative when the window holds extras.
`missing` counts the required characters (with multiplicity) not yet covered. The window covers `t` exactly when
`missing == 0`.

```python
from collections import Counter

def min_window(s: str, t: str) -> str:
    if not s or not t:
        return ""
    need = Counter(t)
    missing = len(t)
    left = 0
    best_start, best_len = 0, len(s) + 1
    for right, ch in enumerate(s):
        if need[ch] > 0:
            missing -= 1             # this character was still needed
        need[ch] -= 1                # negative means a surplus inside the window
        while missing == 0:          # the window covers t: record it, then try to shrink
            if right - left + 1 < best_len:
                best_start, best_len = left, right - left + 1
            need[s[left]] += 1
            if need[s[left]] > 0:
                missing += 1         # we just dropped a character we needed
            left += 1
    return "" if best_len > len(s) else s[best_start:best_start + best_len]

assert min_window("ADOBECODEBANC", "ABC") == "BANC"
assert min_window("a", "a") == "a"
assert min_window("a", "aa") == ""
assert min_window("ab", "b") == "b"
assert min_window("aaflslflsldkalskaaa", "aaa") == "aaa"
assert min_window("", "a") == ""
```

Complexity: O(|s| + |t|) time, O(σ) space for the counts.

#### Follow-ups

- **Why is it still O(n)?** Each index enters the window once (right) and leaves at most once (left).
- **Characters of t must appear in order (a subsequence, not a set)?** That is Minimum Window Subsequence, usually
  solved with DP or a forward-then-backward scan. It is a different problem; say so rather than forcing this template.
