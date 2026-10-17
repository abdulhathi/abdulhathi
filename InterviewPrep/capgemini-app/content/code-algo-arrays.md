---
title: "Algorithms in TypeScript, part 1: arrays, strings and hashing"
goal: Recognise the pattern behind a classic array or string problem within a minute, and write a clean, tested TypeScript solution while explaining its cost.
minutes: 120
---

A front-end-heavy full-stack loop often includes one algorithm problem, usually in JavaScript or TypeScript, in a
shared editor that may not run code. The problems below are the ones that come up again and again: hash maps, two
pointers, sliding windows, prefix sums, stacks and binary search. Every solution is plain TypeScript that runs under
Node, with asserts for the normal case and the edge cases.

For each problem, practise the same routine: say the brute force and its cost, name what it keeps recomputing, then
name the structure that removes the repetition ("a map from value to index", "a window with a count of each
character"). That sentence is most of the explanation an interviewer wants to hear.

## Spot the pattern

| Signal in the problem | Technique | Typical cost |
|---|---|---|
| "Find a pair / complement", "seen before?" | Hash map or set | O(n) time, O(n) space |
| Group items that are "the same" in some way | Map from a signature to a list | O(n·k) |
| Sorted input, pairs or triples | Two pointers from both ends | O(n) after sorting |
| "Longest / shortest substring or subarray with…" | Sliding window with counts | O(n) |
| "Number of subarrays summing to k" | Prefix sums + map of counts | O(n) |
| "Next greater / warmer / taller" | Monotonic stack of indices | O(n) |
| Sorted (or rotated sorted) input, "find" | Binary search | O(log n) |
| Overlapping ranges | Sort by start, then sweep | O(n log n) |
| "k-th largest", "top k" | Quickselect, heap, or buckets | O(n) average, O(n log k), O(n) |

## TypeScript habits for algorithm code

A few JavaScript behaviours cause most of the bugs in live coding. Know them so you can say why you avoid them.

- **`sort()` without a comparator sorts as strings.** Always pass `(a, b) => a - b` for numbers.
- **Use `Map` and `Set` for hash maps,** not plain objects: any key type, no prototype keys such as `"constructor"`,
  `size`, and insertion-ordered iteration.
- **Check `!== undefined`, not truthiness,** when reading a map of indices: index `0` is falsy.
- **`new Array(n).fill([])` shares one array** between every slot. Use `Array.from({ length: n }, () => [])`.
- **Strings iterate by code point with `for…of` or `[...s]`,** but `s.length` and `s[i]` count UTF-16 code units.
  Most interview inputs are ASCII, so say the assumption out loud.
- **Sort a copy with `toSorted()`** (ES2023, Node 20+) when the caller's array must not change. If the shared
  editor runs an older engine, `nums.slice().sort(…)` does the same.

```ts
import assert from 'node:assert/strict';

// Default sort compares strings.
assert.deepEqual([10, 9, 1].sort(), [1, 10, 9]);
assert.deepEqual([10, 9, 1].sort((a, b) => a - b), [1, 9, 10]);

// Index 0 is falsy, so test for undefined.
const indexOf = new Map<string, number>([['a', 0]]);
const i = indexOf.get('a');
assert.equal(i ? 'found' : 'missing', 'missing'); // the bug
assert.equal(i !== undefined ? 'found' : 'missing', 'found'); // the fix

// fill() with an object shares the same object.
const shared = new Array<number[]>(3).fill([]);
shared[0].push(1);
assert.deepEqual(shared, [[1], [1], [1]]);
const separate = Array.from({ length: 3 }, (): number[] => []);
separate[0].push(1);
assert.deepEqual(separate, [[1], [], []]);

// length counts UTF-16 units; spreading counts code points.
assert.equal('héllo👋'.length, 7);
assert.equal([...'héllo👋'].length, 6);
```

## Interview questions

### Why does `[10, 9, 1].sort()` return `[1, 10, 9]`? {core}

Without a comparator, `Array.prototype.sort` converts elements to strings and compares them in UTF-16 order, so
`"10"` comes before `"9"`. For numbers I always pass `(a, b) => a - b`. The sort is in place and, since ES2019,
guaranteed stable, so equal elements keep their order, which matters for multi-key sorts.

### `Map` or a plain object for a hash map in JavaScript? {core}

`Map`. Keys can be any type, including numbers that stay numbers and objects by identity. It has no inherited keys
such as `toString`, it has `size`, it iterates in insertion order, and it is optimised for frequent adds and deletes.
A plain object is fine for a fixed set of string keys, like a lookup table of bracket pairs.

### What do the common array operations cost? {core}

`push`, `pop`, index access and `length` are O(1). `shift` and `unshift` are O(n) because every element moves, so a
queue built on `shift` is O(n²) over n operations; use an index pointer or a deque instead. (Engines sometimes optimise
`shift` on small arrays, but you should not rely on it.) `includes`, `indexOf`,
`splice` and `slice` are O(n). `sort` is O(n log n). `Set.has` and `Map.get` are O(1) on average.

### When does a sliding window apply, and when does it not?

When you need the best contiguous subarray or substring, and extending the window can only make a condition "more
violated" while shrinking it can only fix it. That monotonic behaviour is what lets each pointer move forward only,
giving O(n). It breaks with negative numbers in sum problems, because adding an element can make the sum smaller;
there you switch to prefix sums with a hash map.

### How do you avoid off-by-one errors in binary search? {deep}

Pick one invariant and keep it. I use a half-open range `[lo, hi)` and the "lower bound" form: find the first index
whose value is at least x. The loop runs while `lo < hi`, `mid = lo + ((hi - lo) >> 1)`, and either `lo = mid + 1` or
`hi = mid`. It always terminates, and "first and last position", "insert position" and "count of x" all fall out of
the same helper.

### How do you explain complexity when you use built-ins? {deep}

Count what the built-ins do. `[...w].sort()` on a word of length k is O(k log k), so grouping n words that way is
O(n·k log k). `Array.from(map.values())` is O(n). Spreading inside a loop (`out = [...out, x]`) is O(n²) in total,
which is why I push into an array instead.

## Coding problems

### Two Sum {easy core}

Given an array of integers and a target, return the indices of the two numbers that add up to the target. Assume at
most one answer exists, and you may not use the same element twice. Return `null` if there is no pair.

`nums = [2, 7, 11, 15], target = 9` → `[0, 1]`

#### Hints

1. Brute force checks every pair: O(n²).
2. For each number x, the partner you need is `target - x`. The slow part is searching for it.
3. Keep a `Map` from value to index of everything seen so far, and check it before you insert.

#### Solution

When you reach index i, the map holds every earlier value and its index. If the partner is there, you are done.
Checking before inserting is what stops a number pairing with itself, while `[3, 3]` with target 6 still works
because the first 3 is already stored when the second arrives. Note the `!== undefined` check: index 0 is falsy.

```ts
import assert from 'node:assert/strict';

function twoSum(nums: number[], target: number): [number, number] | null {
  const indexOf = new Map<number, number>();
  for (let i = 0; i < nums.length; i++) {
    const j = indexOf.get(target - nums[i]);
    if (j !== undefined) return [j, i];
    indexOf.set(nums[i], i);
  }
  return null;
}

assert.deepEqual(twoSum([2, 7, 11, 15], 9), [0, 1]);
assert.deepEqual(twoSum([3, 2, 4], 6), [1, 2]); // 3 must not pair with itself
assert.deepEqual(twoSum([3, 3], 6), [0, 1]);
assert.deepEqual(twoSum([-1, -2, -3, -4, -5], -8), [2, 4]);
assert.deepEqual(twoSum([0, 4, 0], 0), [0, 2]); // index 0 is a real answer
assert.equal(twoSum([1, 2], 10), null);
assert.equal(twoSum([], 1), null);
```

Complexity: O(n) time, O(n) extra space.

#### Follow-ups

- **The input is sorted?** Two pointers from both ends: O(n) time, O(1) space.
- **Return all pairs, without duplicates?** Sort and use two pointers, skipping repeated values.

### Best Time to Buy and Sell Stock {easy core}

Given daily prices, return the largest profit from buying on one day and selling on a later day, or 0 if no profit is
possible.

`[7, 1, 5, 3, 6, 4]` → `5` (buy at 1, sell at 6)

#### Hints

1. Brute force tries every buy day with every later sell day: O(n²).
2. For a sell on day i, the best buy is the lowest price before day i.
3. Keep the lowest price seen so far as you walk once.

#### Solution

Walk the prices once. Keep the lowest price so far; at each day, the best profit selling today is today's price minus
that minimum. Track the best of those.

```ts
import assert from 'node:assert/strict';

function maxProfit(prices: number[]): number {
  let lowest = Infinity;
  let best = 0;
  for (const price of prices) {
    lowest = Math.min(lowest, price);
    best = Math.max(best, price - lowest);
  }
  return best;
}

assert.equal(maxProfit([7, 1, 5, 3, 6, 4]), 5);
assert.equal(maxProfit([7, 6, 4, 3, 1]), 0); // prices only fall
assert.equal(maxProfit([2, 4, 1]), 2); // the later low does not help
assert.equal(maxProfit([5]), 0);
assert.equal(maxProfit([]), 0);
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Unlimited transactions?** Add every positive day-to-day difference.
- **Return the days too?** Remember the index of the minimum when it changes, and the pair when `best` improves.

### Valid Parentheses {easy core}

Given a string of `()[]{}` characters, return whether every bracket is closed by the same type in the right order.

`"([]{})"` → `true`, `"([)]"` → `false`

#### Hints

1. The most recently opened bracket must be closed first. Which structure gives you "most recent"?
2. Push opening brackets on a stack. On a closing bracket, the top must be its partner.
3. Do not forget the leftovers at the end, and a closing bracket on an empty stack.

#### Solution

A stack of open brackets. A lookup table maps each closing bracket to its opener. `pop()` on an empty array returns
`undefined`, which never equals an opener, so the empty-stack case needs no special branch.

```ts
import assert from 'node:assert/strict';

const OPENER: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

function isValid(s: string): boolean {
  const stack: string[] = [];
  for (const ch of s) {
    if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (stack.pop() !== OPENER[ch]) return false;
  }
  return stack.length === 0;
}

assert.equal(isValid('()[]{}'), true);
assert.equal(isValid('([]{})'), true);
assert.equal(isValid('(]'), false);
assert.equal(isValid('([)]'), false);
assert.equal(isValid(''), true);
assert.equal(isValid('(('), false); // left open
assert.equal(isValid(')'), false); // closes nothing
```

Complexity: O(n) time, O(n) space in the worst case.

#### Follow-ups

- **Only one bracket type?** A counter is enough: increment, decrement, never below zero, zero at the end.
- **Ignore other characters?** Skip anything that is neither an opener nor a key of `OPENER`.

### Group Anagrams {medium core}

Group words that are anagrams of each other. Keep the groups in the order their first word appears.

`["eat", "tea", "tan", "ate", "nat", "bat"]` → `[["eat", "tea", "ate"], ["tan", "nat"], ["bat"]]`

#### Hints

1. Two words are anagrams when they have the same letters with the same counts. Find a key that captures that.
2. Sorting the letters gives such a key. A `Map` from key to list does the grouping.
3. For lowercase letters, a 26-count signature avoids the sort.

#### Solution

Anagrams share a signature. Sorting the letters is the simplest signature (O(k log k) per word); counting letters into
26 slots is O(k). A `Map` keeps insertion order, so the groups come out in first-appearance order.

```ts
import assert from 'node:assert/strict';

function groupAnagrams(words: string[], keyOf: (w: string) => string = sortedKey): string[][] {
  const groups = new Map<string, string[]>();
  for (const word of words) {
    const key = keyOf(word);
    const group = groups.get(key);
    if (group) group.push(word);
    else groups.set(key, [word]);
  }
  return [...groups.values()];
}

function sortedKey(word: string): string {
  return [...word].sort().join('');
}

function countKey(word: string): string {
  const counts = new Array<number>(26).fill(0);
  for (let i = 0; i < word.length; i++) counts[word.charCodeAt(i) - 97]++;
  return counts.join('#');
}

for (const key of [sortedKey, countKey]) {
  assert.deepEqual(groupAnagrams(['eat', 'tea', 'tan', 'ate', 'nat', 'bat'], key), [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']]);
  assert.deepEqual(groupAnagrams([''], key), [['']]);
  assert.deepEqual(groupAnagrams(['ab', 'ba', 'ab'], key), [['ab', 'ba', 'ab']]);
  assert.deepEqual(groupAnagrams([], key), []);
}
```

Complexity: O(n·k log k) with sorted keys, O(n·k) with count keys, for n words of length k.

#### Follow-ups

- **Why `join('#')` in the count key?** Without a separator, counts `[1, 11]` and `[11, 1]` would both become `"111"`.
- **Unicode input?** Use the sorted key over `[...word]`, or count with a `Map` instead of 26 slots.

### Top K Frequent Elements {medium core}

Return the k most frequent numbers. Any order is fine.

`nums = [1, 1, 1, 2, 2, 3], k = 2` → `[1, 2]`

#### Hints

1. Count first with a `Map`.
2. Sorting the counts is O(n log n). Can you avoid a full sort?
3. A count is at most n, so you can put each number in a bucket indexed by its count, then read buckets from the top.

#### Solution

Count, then bucket by frequency: `buckets[c]` holds every number seen exactly c times. Walk from the highest bucket
down until you have k numbers. That is O(n), better than sorting (O(n log n)) or a heap of size k (O(n log k)).

```ts
import assert from 'node:assert/strict';

function topKFrequent(nums: number[], k: number): number[] {
  const counts = new Map<number, number>();
  for (const x of nums) counts.set(x, (counts.get(x) ?? 0) + 1);

  const buckets = Array.from({ length: nums.length + 1 }, (): number[] => []);
  for (const [x, c] of counts) buckets[c].push(x);

  const result: number[] = [];
  for (let c = buckets.length - 1; c > 0 && result.length < k; c--) {
    for (const x of buckets[c]) {
      result.push(x);
      if (result.length === k) break;
    }
  }
  return result;
}

const sorted = (a: number[]) => a.toSorted((x, y) => x - y);
assert.deepEqual(sorted(topKFrequent([1, 1, 1, 2, 2, 3], 2)), [1, 2]);
assert.deepEqual(topKFrequent([1], 1), [1]);
assert.deepEqual(sorted(topKFrequent([4, 4, 5, 5, 6], 2)), [4, 5]);
assert.deepEqual(topKFrequent([-1, -1, 2], 1), [-1]);
assert.deepEqual(topKFrequent([], 0), []);
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **A stream that never ends?** Keep counts in a map and a min-heap of size k, or an approximate sketch (Count-Min).
- **Ties must be broken by value?** Sort each bucket before reading it.

### Product of Array Except Self {medium}

Return an array where each position holds the product of every other element. Do it in O(n) without division.

`[1, 2, 3, 4]` → `[24, 12, 8, 6]`

#### Hints

1. The answer at i is (product of everything left of i) × (product of everything right of i).
2. One pass left to right can store the left products in the output array.
3. A second pass right to left multiplies in a running right product, so no extra array is needed.

#### Solution

Two passes. The first writes the product of everything before i; the second multiplies by the product of everything
after i. Division would fail on zeros, and the interviewer usually forbids it anyway.

One JavaScript detail: multiplying a negative number by 0 gives `-0`, and `assert.deepEqual` (strict) tells `-0` and
`0` apart. The last line normalises it.

```ts
import assert from 'node:assert/strict';

function productExceptSelf(nums: number[]): number[] {
  const n = nums.length;
  const out = new Array<number>(n).fill(1);
  let left = 1;
  for (let i = 0; i < n; i++) {
    out[i] = left;
    left *= nums[i];
  }
  let right = 1;
  for (let i = n - 1; i >= 0; i--) {
    out[i] *= right;
    right *= nums[i];
  }
  return out.map((x) => (x === 0 ? 0 : x)); // turn -0 into 0
}

assert.deepEqual(productExceptSelf([1, 2, 3, 4]), [24, 12, 8, 6]);
assert.deepEqual(productExceptSelf([-1, 1, 0, -3, 3]), [0, 0, 9, 0, 0]);
assert.deepEqual(productExceptSelf([0, 0]), [0, 0]);
assert.deepEqual(productExceptSelf([2, 3]), [3, 2]);
assert.deepEqual(productExceptSelf([5]), [1]);
```

Complexity: O(n) time, O(1) extra space besides the output.

#### Follow-ups

- **Very large products?** Use `BigInt`, or work modulo a prime if the problem allows.
- **Allowed to divide?** Count zeros: two or more zeros make everything 0; one zero leaves only that position non-zero.

### Longest Consecutive Sequence {medium}

Given an unsorted array, return the length of the longest run of consecutive integers, in O(n).

`[100, 4, 200, 1, 3, 2]` → `4` (1, 2, 3, 4)

#### Hints

1. Sorting gives O(n log n). The problem asks for O(n).
2. Put everything in a `Set` for O(1) membership.
3. Only start counting from a number whose predecessor is not in the set.

#### Solution

A run starts at x only if `x - 1` is absent. From each start, count upwards while the next number exists. Every
number is visited at most twice (once in the outer loop, once inside one run), so the total is O(n).

```ts
import assert from 'node:assert/strict';

function longestConsecutive(nums: number[]): number {
  const values = new Set(nums);
  let best = 0;
  for (const x of values) {
    if (values.has(x - 1)) continue; // not the start of a run
    let length = 1;
    while (values.has(x + length)) length++;
    best = Math.max(best, length);
  }
  return best;
}

assert.equal(longestConsecutive([100, 4, 200, 1, 3, 2]), 4);
assert.equal(longestConsecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1]), 9);
assert.equal(longestConsecutive([1, 2, 0, 1]), 3); // duplicates
assert.equal(longestConsecutive([-2, -1, 5]), 2);
assert.equal(longestConsecutive([]), 0);
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **Why iterate the set, not the array?** With many duplicates, the array would repeat the same run checks.
- **Return the run itself?** Remember the start of the best run; the run is `start … start + best - 1`.

### Subarray Sum Equals K {medium core}

Return how many contiguous subarrays sum to k. Values can be negative.

`nums = [1, 2, 3], k = 3` → `2` (`[1, 2]` and `[3]`)

#### Hints

1. Brute force sums every subarray: O(n²).
2. With prefix sums, the sum of `nums[i..j]` is `prefix[j + 1] - prefix[i]`.
3. While walking, you need "how many earlier prefixes equal `current - k`". Keep a map of prefix-sum counts, starting
   with `0 → 1`.

#### Solution

A sliding window does not work here because negative numbers break the "growing only increases the sum" rule. Instead
keep the running sum and a map counting how often each running sum has occurred. Every earlier prefix equal to
`sum - k` marks the start of a subarray ending here that sums to k. Seeding the map with `0 → 1` counts subarrays that
start at index 0.

```ts
import assert from 'node:assert/strict';

function subarraySum(nums: number[], k: number): number {
  const seen = new Map<number, number>([[0, 1]]);
  let sum = 0;
  let count = 0;
  for (const x of nums) {
    sum += x;
    count += seen.get(sum - k) ?? 0;
    seen.set(sum, (seen.get(sum) ?? 0) + 1);
  }
  return count;
}

assert.equal(subarraySum([1, 1, 1], 2), 2);
assert.equal(subarraySum([1, 2, 3], 3), 2);
assert.equal(subarraySum([1, -1, 0], 0), 3); // [1,-1], [0], [1,-1,0]
assert.equal(subarraySum([3], 3), 1);
assert.equal(subarraySum([], 0), 0);
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **All values positive?** A sliding window works with O(1) space.
- **Longest subarray summing to k?** Store the first index of each prefix sum instead of a count.

### 3Sum {medium core}

Return every unique triple of numbers that sums to zero.

`[-1, 0, 1, 2, -1, -4]` → `[[-1, -1, 2], [-1, 0, 1]]`

#### Hints

1. Brute force is O(n³) and needs a set of triples to remove duplicates.
2. Sort first. Then fix the first number and solve Two Sum on the rest with two pointers.
3. Skip equal values for the fixed number, and after a match skip equal values on both pointers.

#### Solution

Sorting makes duplicates adjacent and enables two pointers. For each i (skipping repeats), move `lo` and `hi` towards
each other: too small moves `lo` up, too large moves `hi` down. After a hit, step past repeats so each triple appears
once. Stop early when the fixed number is positive, because three positives cannot sum to zero.

```ts
import assert from 'node:assert/strict';

function threeSum(input: number[]): number[][] {
  const nums = input.toSorted((a, b) => a - b);
  const result: number[][] = [];
  for (let i = 0; i < nums.length - 2; i++) {
    if (nums[i] > 0) break;
    if (i > 0 && nums[i] === nums[i - 1]) continue;
    let lo = i + 1;
    let hi = nums.length - 1;
    while (lo < hi) {
      const sum = nums[i] + nums[lo] + nums[hi];
      if (sum < 0) lo++;
      else if (sum > 0) hi--;
      else {
        result.push([nums[i], nums[lo], nums[hi]]);
        while (lo < hi && nums[lo] === nums[lo + 1]) lo++;
        while (lo < hi && nums[hi] === nums[hi - 1]) hi--;
        lo++;
        hi--;
      }
    }
  }
  return result;
}

assert.deepEqual(threeSum([-1, 0, 1, 2, -1, -4]), [[-1, -1, 2], [-1, 0, 1]]);
assert.deepEqual(threeSum([0, 1, 1]), []);
assert.deepEqual(threeSum([0, 0, 0, 0]), [[0, 0, 0]]);
assert.deepEqual(threeSum([-2, 0, 1, 1, 2]), [[-2, 0, 2], [-2, 1, 1]]);
assert.deepEqual(threeSum([]), []);
```

Complexity: O(n²) time, O(n) for the sorted copy (O(log n) if sorting in place).

#### Follow-ups

- **3Sum closest to a target?** Same loop; track the sum with the smallest distance instead of collecting.
- **4Sum?** One more outer loop, O(n³).

### Container With Most Water {medium}

Given heights of vertical lines at positions 0…n−1, pick two lines that hold the most water. The area is the distance
between them times the shorter height.

`[1, 8, 6, 2, 5, 4, 8, 3, 7]` → `49`

#### Hints

1. Brute force checks all pairs: O(n²).
2. Start with the widest pair: both ends.
3. Which of the two lines limits the area? Think about what happens to every narrower pair that keeps that line.

#### Solution

Two pointers from the ends. The area is limited by the shorter line, and any pair that keeps that shorter line but is
narrower is worse, so you can safely discard it and move the shorter pointer.

```ts
import assert from 'node:assert/strict';

function maxArea(heights: number[]): number {
  let lo = 0;
  let hi = heights.length - 1;
  let best = 0;
  while (lo < hi) {
    best = Math.max(best, (hi - lo) * Math.min(heights[lo], heights[hi]));
    if (heights[lo] < heights[hi]) lo++;
    else hi--;
  }
  return best;
}

assert.equal(maxArea([1, 8, 6, 2, 5, 4, 8, 3, 7]), 49);
assert.equal(maxArea([1, 1]), 1);
assert.equal(maxArea([4, 3, 2, 1, 4]), 16);
assert.equal(maxArea([1, 2, 1]), 2);
assert.equal(maxArea([5]), 0);
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Why is it safe to move the shorter side?** Every skipped pair is narrower and no taller at its limiting end, so
  none can beat the area already recorded.
- **Trapping Rain Water?** A related two-pointer problem: track the max height seen from each side.

### Longest Substring Without Repeating Characters {medium core}

Return the length of the longest substring with no repeated characters.

`"abcabcbb"` → `3` (`"abc"`)

#### Hints

1. Brute force checks every substring: O(n²) or worse.
2. Keep a window `[left, right]` with no repeats, and grow it one character at a time.
3. Remember the last index of each character. When you see a repeat inside the window, jump `left` past it.

#### Solution

A sliding window with a map from character to its last index. When the new character was last seen at or after
`left`, the window must start just after that position. `Math.max` stops `left` moving backwards (the `"abba"` case).

```ts
import assert from 'node:assert/strict';

function lengthOfLongestSubstring(s: string): number {
  const lastIndex = new Map<string, number>();
  let left = 0;
  let best = 0;
  for (let right = 0; right < s.length; right++) {
    const seen = lastIndex.get(s[right]);
    if (seen !== undefined) left = Math.max(left, seen + 1);
    lastIndex.set(s[right], right);
    best = Math.max(best, right - left + 1);
  }
  return best;
}

assert.equal(lengthOfLongestSubstring('abcabcbb'), 3);
assert.equal(lengthOfLongestSubstring('bbbbb'), 1);
assert.equal(lengthOfLongestSubstring('pwwkew'), 3);
assert.equal(lengthOfLongestSubstring('abba'), 2); // left must not move back
assert.equal(lengthOfLongestSubstring('dvdf'), 3);
assert.equal(lengthOfLongestSubstring(''), 0);
```

Complexity: O(n) time, O(min(n, alphabet)) space.

#### Follow-ups

- **At most k distinct characters?** Keep counts in the window and shrink while `counts.size > k`.
- **Return the substring?** Record `left` whenever `best` improves.

### Minimum Window Substring {hard}

Given strings `s` and `t`, return the shortest substring of `s` that contains every character of `t`, counting
duplicates. Return `""` if there is none.

`s = "ADOBECODEBANC", t = "ABC"` → `"BANC"`

#### Hints

1. Grow the window to the right until it covers `t`, then shrink it from the left while it still covers `t`.
2. Keep a map of how many of each character you still need, and one number: how many characters of `t` are missing.
3. A character only changes `missing` when its need crosses zero.

#### Solution

`need` starts as the counts of `t`. Moving `right` decrements the need of the new character; if the need was positive,
one fewer character is missing. While nothing is missing, record the window and move `left`, giving its character
back; if that pushes its need above zero, the window is missing something again. Each pointer moves at most n times.

```ts
import assert from 'node:assert/strict';

function minWindow(s: string, t: string): string {
  if (t.length === 0 || t.length > s.length) return '';
  const need = new Map<string, number>();
  for (const ch of t) need.set(ch, (need.get(ch) ?? 0) + 1);

  let missing = t.length;
  let bestStart = 0;
  let bestLength = Infinity;
  let left = 0;
  for (let right = 0; right < s.length; right++) {
    const wanted = need.get(s[right]);
    if (wanted !== undefined) {
      if (wanted > 0) missing--;
      need.set(s[right], wanted - 1);
    }
    while (missing === 0) {
      if (right - left + 1 < bestLength) {
        bestLength = right - left + 1;
        bestStart = left;
      }
      const leaving = s[left++];
      const n = need.get(leaving);
      if (n !== undefined) {
        need.set(leaving, n + 1);
        if (n + 1 > 0) missing++;
      }
    }
  }
  return bestLength === Infinity ? '' : s.slice(bestStart, bestStart + bestLength);
}

assert.equal(minWindow('ADOBECODEBANC', 'ABC'), 'BANC');
assert.equal(minWindow('a', 'a'), 'a');
assert.equal(minWindow('a', 'aa'), ''); // needs two a's
assert.equal(minWindow('ab', 'b'), 'b');
assert.equal(minWindow('aaflslflsldkalskaaa', 'aaa'), 'aaa');
assert.equal(minWindow('abc', ''), '');
```

Complexity: O(|s| + |t|) time, O(alphabet) space.

#### Follow-ups

- **Why track `missing` instead of comparing maps?** Comparing two maps on every step would cost O(alphabet) each time.
- **Characters must appear in order (a subsequence)?** That is a different problem, solved with two pointers or DP.

### Daily Temperatures {medium}

For each day, return how many days you wait for a warmer temperature, or 0 if none comes.

`[73, 74, 75, 71, 69, 72, 76, 73]` → `[1, 1, 4, 2, 1, 1, 0, 0]`

#### Hints

1. Brute force scans forward from each day: O(n²).
2. Keep the days that are still waiting for a warmer day. Which order are they in?
3. A stack of indices with decreasing temperatures: a warmer day resolves everything colder on top of the stack.

#### Solution

A monotonic stack. The stack holds indices of days still waiting, with temperatures decreasing from bottom to top.
When today is warmer than the top, pop it and record the distance. Each index is pushed and popped once.

```ts
import assert from 'node:assert/strict';

function dailyTemperatures(temps: number[]): number[] {
  const wait = new Array<number>(temps.length).fill(0);
  const stack: number[] = []; // indices, temperatures decreasing
  for (let i = 0; i < temps.length; i++) {
    while (stack.length > 0 && temps[i] > temps[stack.at(-1)!]) {
      const day = stack.pop()!;
      wait[day] = i - day;
    }
    stack.push(i);
  }
  return wait;
}

assert.deepEqual(dailyTemperatures([73, 74, 75, 71, 69, 72, 76, 73]), [1, 1, 4, 2, 1, 1, 0, 0]);
assert.deepEqual(dailyTemperatures([30, 40, 50, 60]), [1, 1, 1, 0]);
assert.deepEqual(dailyTemperatures([60, 50, 40]), [0, 0, 0]);
assert.deepEqual(dailyTemperatures([50, 50, 51]), [2, 1, 0]); // equal is not warmer
assert.deepEqual(dailyTemperatures([]), []);
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **Next greater element in a circular array?** Loop twice over the indices (`i % n`), only pushing in the first pass.
- **Largest rectangle in a histogram?** The same stack idea with increasing heights.

### Merge Intervals {medium core}

Given execution windows `[start, end]`, merge every overlapping pair and return the merged list sorted by start. Do
not change the input.

`[[1, 3], [2, 6], [8, 10], [15, 18]]` → `[[1, 6], [8, 10], [15, 18]]`

#### Hints

1. Overlaps are easy to see once the intervals are sorted by start.
2. Walk in order and compare each interval with the last merged one.
3. They overlap when `start <= last.end`; then extend `last.end` to the larger end.

#### Solution

Sort a copy by start (`toSorted`), then sweep. Copy each interval as you push it so the caller's arrays never change. Touching
intervals such as `[1, 4]` and `[4, 5]` count as overlapping here; ask the interviewer which they want.

```ts
import assert from 'node:assert/strict';

type Interval = [number, number];

function merge(intervals: Interval[]): Interval[] {
  const sorted = intervals.toSorted((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

const input: Interval[] = [[8, 10], [1, 3], [2, 6], [15, 18]];
assert.deepEqual(merge(input), [[1, 6], [8, 10], [15, 18]]);
assert.deepEqual(input, [[8, 10], [1, 3], [2, 6], [15, 18]]); // unchanged
assert.deepEqual(merge([[1, 4], [4, 5]]), [[1, 5]]);
assert.deepEqual(merge([[1, 4], [2, 3]]), [[1, 4]]); // contained
assert.deepEqual(merge([]), []);
```

Complexity: O(n log n) time for the sort, O(n) for the output.

#### Follow-ups

- **Insert one new interval into a sorted, merged list?** O(n): copy the ones before, merge the overlapping ones, copy
  the rest.
- **How many run at the same time at most?** Sort starts and ends separately and sweep, or use a min-heap of end times.

### Search in Rotated Sorted Array {medium}

A sorted array of distinct numbers was rotated at an unknown pivot, for example `[4, 5, 6, 7, 0, 1, 2]`. Return the
index of a target, or −1, in O(log n).

`nums = [4, 5, 6, 7, 0, 1, 2], target = 0` → `4`

#### Hints

1. Plain binary search fails because the array is not sorted as a whole.
2. Split at `mid`: at least one half is always sorted. Compare `nums[lo]` with `nums[mid]` to see which.
3. If the target lies inside the sorted half's range, search there; otherwise search the other half.

#### Solution

At each step one side of `mid` is sorted. If the left side is sorted (`nums[lo] <= nums[mid]`) and the target is
between `nums[lo]` and `nums[mid]`, go left; otherwise go right. Mirror that when the right side is sorted.

```ts
import assert from 'node:assert/strict';

function search(nums: number[], target: number): number {
  let lo = 0;
  let hi = nums.length - 1;
  while (lo <= hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] === target) return mid;
    if (nums[lo] <= nums[mid]) {
      if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
      else lo = mid + 1;
    } else {
      if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  return -1;
}

assert.equal(search([4, 5, 6, 7, 0, 1, 2], 0), 4);
assert.equal(search([4, 5, 6, 7, 0, 1, 2], 3), -1);
assert.equal(search([1], 1), 0);
assert.equal(search([1], 0), -1);
assert.equal(search([3, 1], 1), 1);
assert.equal(search([5, 1, 3], 5), 0);
assert.equal(search([], 1), -1);
for (let r = 0; r < 7; r++) {
  const rotated = [10, 20, 30, 40, 50, 60, 70].map((_, i, a) => a[(i + r) % a.length]);
  rotated.forEach((x, i) => assert.equal(search(rotated, x), i));
}
```

Complexity: O(log n) time, O(1) space.

#### Follow-ups

- **Duplicates allowed?** When `nums[lo] === nums[mid] === nums[hi]` you cannot tell which side is sorted; shrink both
  ends by one. The worst case becomes O(n).
- **Find the rotation point (the minimum)?** Binary search comparing `nums[mid]` with `nums[hi]`.

### First and Last Position of a Target {medium}

Given a sorted array, return the first and last index of a target, or `[-1, -1]`, in O(log n).

`nums = [5, 7, 7, 8, 8, 10], target = 8` → `[3, 4]`

#### Hints

1. Finding any match and scanning outwards is O(n) when the target repeats many times.
2. Write one helper: the first index whose value is at least x (lower bound).
3. The first position is `lowerBound(target)`; the last is `lowerBound(target + 1) - 1` for integers.

#### Solution

One binary-search helper with a half-open range `[lo, hi)` answers both questions. This is the template to memorise:
it never loops forever and has no `±1` guesswork.

```ts
import assert from 'node:assert/strict';

/** First index i with nums[i] >= x (nums.length if none). */
function lowerBound(nums: number[], x: number): number {
  let lo = 0;
  let hi = nums.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (nums[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function searchRange(nums: number[], target: number): [number, number] {
  const first = lowerBound(nums, target);
  if (first === nums.length || nums[first] !== target) return [-1, -1];
  return [first, lowerBound(nums, target + 1) - 1];
}

assert.deepEqual(searchRange([5, 7, 7, 8, 8, 10], 8), [3, 4]);
assert.deepEqual(searchRange([5, 7, 7, 8, 8, 10], 6), [-1, -1]);
assert.deepEqual(searchRange([2, 2], 2), [0, 1]);
assert.deepEqual(searchRange([1], 1), [0, 0]);
assert.deepEqual(searchRange([], 0), [-1, -1]);
assert.equal(lowerBound([1, 3, 5], 4), 2); // also the insert position
```

Complexity: O(log n) time, O(1) space.

#### Follow-ups

- **Floating-point values?** Write an `upperBound` (first index with value greater than x) instead of `target + 1`.
- **Count occurrences?** `upperBound(x) - lowerBound(x)`.

### Kth Largest Element {medium}

Return the k-th largest element of an unsorted array (k = 1 is the maximum). Aim for better than sorting.

`nums = [3, 2, 1, 5, 6, 4], k = 2` → `5`

#### Hints

1. Sorting is O(n log n). A min-heap of size k is O(n log k).
2. Quickselect: partition around a pivot like quicksort, but only recurse into the side that holds the answer.
3. The k-th largest is the element at index `n - k` in ascending order. Pick the pivot at random to avoid the O(n²) case
   on sorted input, and use a three-way partition so many duplicates stay fast.

#### Solution

Quickselect with a random pivot and a three-way partition (less, equal, greater). After partitioning, if the target
index falls inside the "equal" block, that value is the answer; otherwise narrow the range to one side. On average
each round halves the work, giving O(n).

```ts
import assert from 'node:assert/strict';

function kthLargest(nums: number[], k: number): number {
  if (k < 1 || k > nums.length) throw new RangeError(`k must be between 1 and ${nums.length}`);
  const a = nums.slice();
  const target = a.length - k;
  let lo = 0;
  let hi = a.length - 1;
  for (;;) {
    const pivot = a[lo + Math.floor(Math.random() * (hi - lo + 1))];
    // After the loop: a[lo..lt-1] < pivot, a[lt..gt] === pivot, a[gt+1..hi] > pivot.
    let lt = lo;
    let i = lo;
    let gt = hi;
    while (i <= gt) {
      if (a[i] < pivot) {
        [a[lt], a[i]] = [a[i], a[lt]];
        lt++;
        i++;
      } else if (a[i] > pivot) {
        [a[i], a[gt]] = [a[gt], a[i]];
        gt--;
      } else {
        i++;
      }
    }
    if (target < lt) hi = lt - 1;
    else if (target > gt) lo = gt + 1;
    else return a[target];
  }
}

assert.equal(kthLargest([3, 2, 1, 5, 6, 4], 2), 5);
assert.equal(kthLargest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4), 4);
assert.equal(kthLargest([1], 1), 1);
assert.equal(kthLargest([2, 2, 2, 2], 3), 2);
assert.throws(() => kthLargest([1, 2], 3), RangeError);
for (let trial = 0; trial < 200; trial++) {
  const nums = Array.from({ length: 1 + (trial % 15) }, () => Math.floor(Math.random() * 10) - 5);
  const k = 1 + Math.floor(Math.random() * nums.length);
  assert.equal(kthLargest(nums, k), nums.toSorted((x, y) => y - x)[k - 1]);
}
```

Complexity: O(n) average, O(n²) worst case (very unlikely with a random pivot), O(n) for the copy.

#### Follow-ups

- **When would you choose a heap instead?** For a stream, or when k is small and you cannot copy the data: O(n log k)
  time, O(k) space.
- **Guaranteed O(n)?** Median-of-medians pivot selection; rarely worth it in practice.

### Maximum Subarray {medium}

Return the largest sum of any non-empty contiguous subarray.

`[-2, 1, -3, 4, -1, 2, 1, -5, 4]` → `6` (`[4, -1, 2, 1]`)

#### Hints

1. Brute force sums every subarray: O(n²).
2. For each index, the best subarray ending there either extends the best one ending just before it, or starts fresh.
3. Start fresh when the running sum has gone negative (Kadane's algorithm).

#### Solution

Kadane's algorithm: `current` is the best sum of a subarray ending at this index, which is `max(x, current + x)`. The
answer is the best `current` seen. Starting `best` at the first element, not 0, handles all-negative input.

```ts
import assert from 'node:assert/strict';

function maxSubArray(nums: number[]): number {
  if (nums.length === 0) throw new RangeError('nums must not be empty');
  let current = nums[0];
  let best = nums[0];
  for (let i = 1; i < nums.length; i++) {
    current = Math.max(nums[i], current + nums[i]);
    best = Math.max(best, current);
  }
  return best;
}

assert.equal(maxSubArray([-2, 1, -3, 4, -1, 2, 1, -5, 4]), 6);
assert.equal(maxSubArray([1]), 1);
assert.equal(maxSubArray([5, 4, -1, 7, 8]), 23);
assert.equal(maxSubArray([-3, -1, -2]), -1); // all negative
assert.throws(() => maxSubArray([]), RangeError);
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Return the indices?** Remember where `current` last restarted, and copy it when `best` improves.
- **Circular array?** The answer is the larger of the normal maximum and `total - minimum subarray` (unless every value
  is negative).
