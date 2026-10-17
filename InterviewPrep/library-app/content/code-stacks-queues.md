---
title: Stacks, queues and heaps
goal: Choose the right Python structure (list, deque, heapq) for last-in-first-out, first-in-first-out and "top k" problems, and solve the classic stack, monotonic-stack, queue and heap questions.
minutes: 75
---

Stacks, queues and heaps are small ideas with a big payoff. A stack remembers what is still "open" (brackets,
unfinished work, values waiting for something bigger). A queue processes things in arrival order. A heap always hands
you the smallest item in O(log n), which is how you get "top k" answers without sorting everything. In Python the
tools are a plain `list` (stack), `collections.deque` (queue) and the `heapq` module (min-heap). Know their costs and
the classic problems below, and you can handle most of the questions in this family.

## The Python tools

| Need | Use | Cost | Avoid |
|---|---|---|---|
| Stack (LIFO) | `list`: `append`, `pop`, `stack[-1]` to peek | O(1) amortised | — |
| Queue (FIFO) | `collections.deque`: `append`, `popleft` | O(1) | `list.pop(0)`, which is O(n) because every element shifts |
| Fixed-size recent history | `deque(maxlen=k)` | O(1); old items fall off automatically | — |
| Smallest item fast | `heapq` on a list: `heappush`, `heappop`, `heap[0]` to peek | O(log n) push/pop, O(1) peek | sorting again after every insert |
| Largest item fast | push `-value` (or `(-priority, item)`); Python 3.14 also adds `heapq.heappush_max` / `heappop_max` | O(log n) | — |
| Top k of n items | a heap of size k, or `heapq.nlargest(k, items)` | O(n log k) | `sorted(items)[-k:]` when n is huge |
| Build a heap from a list | `heapq.heapify(items)` | O(n) | pushing items one by one (O(n log n)) |

A **monotonic stack** keeps its values in increasing or decreasing order by popping everything that breaks the order
before pushing. Every element is pushed and popped at most once, so a full scan is O(n). It answers "next greater",
"previous smaller" and "how many days until" questions.

## Interview questions

### How do you implement a stack and a queue in Python? {core}

A stack is a plain `list`: `append` to push, `pop()` to pop, `stack[-1]` to peek, all O(1) amortised. A queue should
be a `collections.deque`: `append` to enqueue and `popleft` to dequeue, both O(1). Do not use `list.pop(0)` for a
queue: it shifts every remaining element, so it is O(n) per dequeue and O(n²) for a full run.

### What does heapq give you, and how do you get a max-heap? {core}

`heapq` turns a list into a binary min-heap: `heap[0]` is always the smallest, and `heappush`/`heappop` cost
O(log n). `heapify` builds a heap from an existing list in O(n). For a max-heap, push negated keys (`-value`) or tuples
like `(-priority, counter, item)`. Python 3.14 also added public max-heap functions (`heappush_max`, `heappop_max`,
`heapify_max`), but negation works on every version and is what most interviewers expect.

```python
import heapq

nums = [5, 1, 8, 3, 9, 2]
heap = nums[:]
heapq.heapify(heap)
assert heap[0] == 1                                  # smallest on top
assert [heapq.heappop(heap) for _ in range(3)] == [1, 2, 3]

max_heap = [-n for n in nums]
heapq.heapify(max_heap)
assert -max_heap[0] == 9                             # largest via negation

assert heapq.nlargest(2, nums) == [9, 8]
assert heapq.nsmallest(2, nums) == [1, 2]
```

### What is a monotonic stack, and when do you reach for one? {core}

A stack whose values stay sorted, because before pushing a new value you pop everything it "beats". It solves
"for each element, find the next (or previous) greater or smaller element" in O(n), since every index is pushed once
and popped at most once. Signals: "next warmer day", "next greater element", "largest rectangle in a histogram",
"stock span".

### Why does a heap of size k give top-k in O(n log k)? {deep}

You keep only the k best items seen so far in a min-heap. For each new item you push it and, if the heap grows past
k, pop the smallest. Each push/pop costs O(log k), so n items cost O(n log k), and memory stays O(k). Sorting is
O(n log n) and needs all n items in memory. For a one-off answer on a list that fits in memory, `heapq.nlargest` or
even `sorted` is fine; the heap shines on streams and when k is much smaller than n.

### queue.Queue, collections.deque or asyncio.Queue? {deep}

`deque` is the fast general-purpose double-ended queue; single `append`/`popleft` calls are thread-safe in CPython, but
it has no blocking. `queue.Queue` adds blocking `get`/`put`, timeouts and `maxsize`, which is what you want for a
producer/consumer between **threads**. `asyncio.Queue` is the same idea for **coroutines** in one event loop and is not
thread-safe. Across **processes**, use `multiprocessing.Queue`.

## Coding problems

### Valid parentheses {easy core}

Given a string containing only `()[]{}`, return `True` if every bracket is closed by the same type of bracket in the
correct order.

- `"()[]{}"` → `True`, `"(]"` → `False`, `"([)]"` → `False`, `"{[]}"` → `True`

#### Hints

1. The most recently opened bracket must be the first one closed. Which structure gives you "most recent first"?
2. Push opening brackets. On a closing bracket, the top of the stack must be its partner.
3. Do not forget the leftovers: what if the stack is not empty at the end?

#### Solution

A stack holds the brackets that are still open. A closing bracket must match the top; anything else is invalid. At
the end, every bracket must have been closed.

```python
def is_valid(s: str) -> bool:
    partner = {")": "(", "]": "[", "}": "{"}
    stack: list[str] = []
    for ch in s:
        if ch in partner:
            if not stack or stack.pop() != partner[ch]:
                return False
        else:
            stack.append(ch)
    return not stack

assert is_valid("()")
assert is_valid("()[]{}")
assert is_valid("{[]}")
assert is_valid("")
assert not is_valid("(]")
assert not is_valid("([)]")
assert not is_valid("(")       # left open
assert not is_valid(")")       # nothing to close
assert not is_valid("((")
```

Complexity: O(n) time, O(n) space for the stack.

#### Follow-ups

- **Only one kind of bracket?** A counter is enough: +1 for `(`, −1 for `)`, never below zero, zero at the end.
- **Minimum additions to make it valid?** Count unmatched `)` while scanning, plus the balance left at the end.
- **Longest valid parentheses substring (hard)?** A stack of indices, seeded with −1 as a base.

### Implement a queue using two stacks {easy core}

Implement a FIFO queue with `push(x)`, `pop()`, `peek()` and `empty()`, using only stack operations (append, pop from
the end, look at the end, size).

#### Hints

1. Pouring one stack into another reverses the order. Reversed LIFO is FIFO.
2. Push onto an "in" stack. Pop from an "out" stack, refilling it only when it is empty.

#### Solution

New items go on `_in`. When you need the front and `_out` is empty, move everything from `_in` to `_out`, which
reverses it so the oldest item is on top. Each item moves at most once, so every operation is **amortised O(1)**.

```python
class MyQueue:
    def __init__(self) -> None:
        self._in: list[int] = []
        self._out: list[int] = []

    def push(self, x: int) -> None:
        self._in.append(x)

    def _refill(self) -> None:
        if not self._out:                    # only refill when empty, or the order breaks
            while self._in:
                self._out.append(self._in.pop())

    def pop(self) -> int:
        self._refill()
        return self._out.pop()

    def peek(self) -> int:
        self._refill()
        return self._out[-1]

    def empty(self) -> bool:
        return not self._in and not self._out

q = MyQueue()
q.push(1)
q.push(2)
assert q.peek() == 1
assert q.pop() == 1
q.push(3)                   # arrives while 2 is still in the out stack
assert q.pop() == 2
assert q.pop() == 3
assert q.empty()
```

Complexity: amortised O(1) per operation, O(n) space.

#### Follow-ups

- **Why is it amortised, not worst-case, O(1)?** A single `pop` can move n items, but each item is moved once in its
  lifetime, so n operations cost O(n) in total.
- **Stack using queues?** Rotate the queue after each push so the newest item is at the front: O(n) push, O(1) pop.

### Min stack {medium core}

Design a stack with `push`, `pop`, `top` and `get_min`, where every operation is O(1).

- push −2, push 0, push −3 → `get_min()` is −3; pop → `top()` is 0 and `get_min()` is −2

#### Hints

1. One variable for the minimum breaks when you pop the minimum. What was the minimum before it?
2. Store, with every item, the minimum of the stack at the moment it was pushed.

#### Solution

Each entry remembers the minimum of everything at or below it. Popping restores the previous minimum automatically.

```python
class MinStack:
    def __init__(self) -> None:
        self._items: list[tuple[int, int]] = []    # (value, minimum of the stack up to this item)

    def push(self, val: int) -> None:
        current_min = min(val, self._items[-1][1]) if self._items else val
        self._items.append((val, current_min))

    def pop(self) -> None:
        self._items.pop()

    def top(self) -> int:
        return self._items[-1][0]

    def get_min(self) -> int:
        return self._items[-1][1]

s = MinStack()
s.push(-2)
s.push(0)
s.push(-3)
assert s.get_min() == -3
s.pop()
assert s.top() == 0
assert s.get_min() == -2

s.push(-2)                 # a duplicate of the minimum
s.pop()
assert s.get_min() == -2   # still there: the first -2 is below
```

Complexity: O(1) for every operation, O(n) space.

#### Follow-ups

- **Save memory?** Keep a second stack that only receives a value when it is `<=` the current minimum, and pop it
  only when the popped value equals its top. Use `<=`, not `<`, or duplicates of the minimum break it.
- **Max stack with `pop_max`?** Harder: a doubly linked list plus a sorted structure (or a heap with lazy deletion)
  gives O(log n).

### Evaluate reverse Polish notation {medium}

Evaluate an expression in reverse Polish notation. Tokens are integers or `+ - * /`. Division truncates toward zero.

- `["2", "1", "+", "3", "*"]` → `9` (that is (2 + 1) × 3)
- `["4", "13", "5", "/", "+"]` → `6`

#### Hints

1. Numbers wait on a stack until an operator arrives.
2. An operator pops two values. Careful with the order: the first value popped is the **right** operand.
3. Python's `//` floors (−7 // 2 is −4). The problem wants truncation toward zero (−3).

#### Solution

Push numbers; on an operator, pop the right operand, then the left, and push the result. Use a truncating division
helper, because `//` rounds toward negative infinity.

```python
import operator

def truncate_div(a: int, b: int) -> int:
    q = abs(a) // abs(b)
    return q if (a >= 0) == (b >= 0) else -q

OPS = {"+": operator.add, "-": operator.sub, "*": operator.mul, "/": truncate_div}

def eval_rpn(tokens: list[str]) -> int:
    stack: list[int] = []
    for token in tokens:
        if token in OPS:
            right = stack.pop()
            left = stack.pop()
            stack.append(OPS[token](left, right))
        else:
            stack.append(int(token))
    return stack[-1]

assert eval_rpn(["2", "1", "+", "3", "*"]) == 9
assert eval_rpn(["4", "13", "5", "/", "+"]) == 6
assert eval_rpn(["10", "6", "9", "3", "+", "-11", "*", "/", "*", "17", "+", "5", "+"]) == 22
assert eval_rpn(["7", "-2", "/"]) == -3          # truncates toward zero; 7 // -2 would be -4
assert eval_rpn(["42"]) == 42
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **Why not `int(a / b)`?** It works for small numbers, but float division can lose precision for large integers.
  The integer helper is exact.
- **Evaluate a normal infix string like `"3 + 2 * 2"`?** Basic Calculator II: keep a stack of terms, apply `*` and
  `/` immediately, then sum the stack. With parentheses, push state on `(` and pop on `)`.

### Next greater element {medium core}

For each value in `nums`, find the first value to its right that is larger. Use `-1` when there is none.

- `[2, 1, 2, 4, 3]` → `[4, 2, 4, -1, -1]`

#### Hints

1. Brute force scans right from every index: O(n²).
2. Keep the indices still waiting for a bigger value on a stack. Their values are decreasing from bottom to top.
3. When a new value arrives, it is the answer for every smaller value on top of the stack. Pop them.

#### Solution

A monotonic (decreasing) stack of indices. The new value resolves everything it beats; whatever is left at the end
has no greater element.

```python
def next_greater(nums: list[int]) -> list[int]:
    result = [-1] * len(nums)
    waiting: list[int] = []               # indices without an answer yet; their values decrease
    for i, value in enumerate(nums):
        while waiting and nums[waiting[-1]] < value:
            result[waiting.pop()] = value
        waiting.append(i)
    return result

assert next_greater([2, 1, 2, 4, 3]) == [4, 2, 4, -1, -1]
assert next_greater([1, 2, 3]) == [2, 3, -1]
assert next_greater([3, 2, 1]) == [-1, -1, -1]
assert next_greater([5, 5, 5]) == [-1, -1, -1]   # equal is not greater
assert next_greater([]) == []
```

Complexity: O(n) time (each index is pushed and popped at most once), O(n) space.

#### Follow-ups

- **Circular array (Next Greater Element II)?** Loop `i` over `range(2 * n)` using `nums[i % n]`, and only push
  indices during the first pass.
- **Previous smaller element?** Scan the same way, but pop while the top is greater than or equal to the new value;
  the remaining top is the answer.

### Daily temperatures {medium}

Given daily temperatures, return for each day how many days you must wait for a warmer one, or `0` if none comes.

- `[73, 74, 75, 71, 69, 72, 76, 73]` → `[1, 1, 4, 2, 1, 1, 0, 0]`

#### Hints

1. This is "next greater element", but the answer is a distance, not a value.
2. Keep a stack of indices of days still waiting for a warmer day.

#### Solution

When a warmer day arrives, every colder day on top of the stack gets its answer: the difference of the indices.

```python
def daily_temperatures(temperatures: list[int]) -> list[int]:
    answer = [0] * len(temperatures)
    waiting: list[int] = []
    for day, temp in enumerate(temperatures):
        while waiting and temperatures[waiting[-1]] < temp:
            colder_day = waiting.pop()
            answer[colder_day] = day - colder_day
        waiting.append(day)
    return answer

assert daily_temperatures([73, 74, 75, 71, 69, 72, 76, 73]) == [1, 1, 4, 2, 1, 1, 0, 0]
assert daily_temperatures([30, 40, 50, 60]) == [1, 1, 1, 0]
assert daily_temperatures([30, 60, 90]) == [1, 1, 0]
assert daily_temperatures([90, 80, 70]) == [0, 0, 0]
```

Complexity: O(n) time, O(n) space.

#### Follow-ups

- **Stock span (how many consecutive previous days were at or below today's price)?** A monotonic stack of
  `(price, span)` pairs, merging spans as you pop.
- **Largest rectangle in a histogram (hard)?** For each bar, the previous and next smaller bars bound its rectangle;
  both come from a monotonic increasing stack.

### Decode string {medium}

Decode a string where `k[text]` means `text` repeated `k` times. Brackets can nest, and `k` can have several digits.

- `"3[a]2[bc]"` → `"aaabcbc"`
- `"3[a2[c]]"` → `"accaccacc"`
- `"2[abc]3[cd]ef"` → `"abcabccdcdcdef"`

#### Hints

1. Nesting means you must pause the outer string while you decode the inner one. What remembers paused work?
2. On `[`, push the text built so far and the repeat count, then start fresh.
3. On `]`, pop them: `text_before + current * count`.

#### Solution

The stack holds the outer context (text so far and its multiplier) for every open bracket. Build multi-digit numbers
with `count * 10 + digit`.

```python
def decode_string(s: str) -> str:
    stack: list[tuple[str, int]] = []      # (text before the "[", repeat count)
    current = ""
    count = 0
    for ch in s:
        if ch.isdigit():
            count = count * 10 + int(ch)
        elif ch == "[":
            stack.append((current, count))
            current, count = "", 0
        elif ch == "]":
            before, repeat = stack.pop()
            current = before + current * repeat
        else:
            current += ch
    return current

assert decode_string("3[a]2[bc]") == "aaabcbc"
assert decode_string("3[a2[c]]") == "accaccacc"
assert decode_string("2[abc]3[cd]ef") == "abcabccdcdcdef"
assert decode_string("10[a]") == "a" * 10           # multi-digit count
assert decode_string("abc") == "abc"
assert decode_string("") == ""
```

Complexity: roughly O(output length) time and space, since that is how much text must be produced (strictly, deeply
nested brackets copy the inner text once per level).

#### Follow-ups

- **Very long outputs?** Build lists of parts and `"".join` them at the end, instead of repeated `+=` on strings.
- **Recursive version?** A helper that decodes until it hits `]` and returns its position; same complexity.

### Moving average from a data stream {easy}

Design a class that receives a stream of numbers and returns the average of the last `size` values after each one.

- `size = 3`: next(1) → 1.0, next(10) → 5.5, next(3) → 4.667, next(5) → 6.0

#### Hints

1. You only ever need the last `size` values, in arrival order. Which structure drops from the front cheaply?
2. Keep a running total instead of re-summing the window.

#### Solution

A `deque` holds the window, and a running total makes each call O(1).

```python
from collections import deque

class MovingAverage:
    def __init__(self, size: int) -> None:
        self._size = size
        self._window: deque[int] = deque()
        self._total = 0

    def next(self, val: int) -> float:
        self._window.append(val)
        self._total += val
        if len(self._window) > self._size:
            self._total -= self._window.popleft()
        return self._total / len(self._window)

m = MovingAverage(3)
assert m.next(1) == 1.0
assert m.next(10) == 5.5
assert abs(m.next(3) - 14 / 3) < 1e-9
assert m.next(5) == 6.0            # (10 + 3 + 5) / 3: the 1 has left the window
```

Complexity: O(1) per call, O(size) space.

#### Follow-ups

- **Average over the last 5 minutes instead of the last k values?** Store `(timestamp, value)` pairs and pop from the
  left while the oldest is outside the time window (LeetCode's Number of Recent Calls is the counting version).
- **Floating-point drift over millions of values?** Keep the running total as an integer when inputs are integers, or
  recompute it from the window occasionally.

### Kth largest element in an array {medium core}

Return the k-th largest element of `nums` (the k-th in sorted order, not the k-th distinct).

- `[3, 2, 1, 5, 6, 4], k = 2` → `5`
- `[3, 2, 3, 1, 2, 4, 5, 5, 6], k = 4` → `4`

#### Hints

1. Sorting works: `sorted(nums)[-k]`, O(n log n). Say it first.
2. You only need the k largest values. Keep them in a min-heap of size k; its top is the answer.

#### Solution

The heap keeps the k largest values seen so far, with the smallest of them on top. When it grows past k, the smallest
is popped, because at least k values beat it.

```python
import heapq

def find_kth_largest(nums: list[int], k: int) -> int:
    heap: list[int] = []
    for value in nums:
        heapq.heappush(heap, value)
        if len(heap) > k:
            heapq.heappop(heap)            # at least k values are bigger: it cannot be the answer
    return heap[0]

assert find_kth_largest([3, 2, 1, 5, 6, 4], 2) == 5
assert find_kth_largest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4) == 4
assert find_kth_largest([1], 1) == 1
assert find_kth_largest([2, 2, 2], 2) == 2

nums = [9, 4, 7, 1, 8, 2]
assert all(find_kth_largest(nums, k) == sorted(nums)[-k] for k in range(1, len(nums) + 1))
assert heapq.nlargest(3, nums)[-1] == find_kth_largest(nums, 3)   # the library one-liner
```

Complexity: O(n log k) time, O(k) space.

#### Follow-ups

- **Average O(n)?** Quickselect: partition around a random pivot and recurse only into the side that holds the
  answer. Average O(n), worst case O(n²); a random pivot makes the worst case unlikely.
- **A stream of numbers (Kth Largest in a Stream)?** Keep the same size-k heap as a class field; each `add` is
  O(log k).

### K closest points to the origin {medium}

Given points `[x, y]` and `k`, return the `k` points closest to `(0, 0)`, in any order.

- `[[1, 3], [-2, 2]], k = 1` → `[[-2, 2]]`
- `[[3, 3], [5, -1], [-2, 4]], k = 2` → `[[3, 3], [-2, 4]]`

#### Hints

1. Compare squared distances `x*x + y*y`; the square root is not needed for ordering.
2. Sorting is O(n log n). For O(n log k), keep the k closest in a heap where the farthest of them is on top.
3. `heapq` is a min-heap, so push the negated distance to keep the farthest on top.

#### Solution

A max-heap of size k (negated distances). When a closer point arrives and the heap overflows, the farthest of the
k + 1 is dropped.

```python
import heapq

def k_closest(points: list[list[int]], k: int) -> list[list[int]]:
    heap: list[tuple[int, int, int]] = []            # (-distance², x, y): farthest point on top
    for x, y in points:
        heapq.heappush(heap, (-(x * x + y * y), x, y))
        if len(heap) > k:
            heapq.heappop(heap)                        # drop the farthest of the k + 1
    return [[x, y] for _, x, y in heap]

assert k_closest([[1, 3], [-2, 2]], 1) == [[-2, 2]]
assert sorted(k_closest([[3, 3], [5, -1], [-2, 4]], 2)) == [[-2, 4], [3, 3]]
assert sorted(k_closest([[0, 1], [1, 0]], 2)) == [[0, 1], [1, 0]]

points = [[3, 3], [5, -1], [-2, 4], [1, 1]]
library = heapq.nsmallest(2, points, key=lambda p: p[0] ** 2 + p[1] ** 2)
assert sorted(k_closest(points, 2)) == sorted(library)
```

Complexity: O(n log k) time, O(k) space.

#### Follow-ups

- **One-liner?** `heapq.nsmallest(k, points, key=lambda p: p[0]**2 + p[1]**2)` does the same heap work for you.
- **Average O(n)?** Quickselect on the distances, as in the previous problem.
- **Ties?** The tuple falls back to comparing `x`, then `y`, so the result is deterministic.

### Merge k sorted lists {hard}

Given `k` sorted lists, merge them into one sorted list.

- `[[1, 4, 5], [1, 3, 4], [2, 6]]` → `[1, 1, 2, 3, 4, 4, 5, 6]`

#### Hints

1. Concatenating and sorting is O(N log N) for N total items. It ignores that each list is already sorted.
2. The next output item is always the smallest of the k current heads. Which structure gives the smallest of k items
   quickly?
3. Push `(value, list_index, position)` so ties are broken without comparing anything else.

#### Solution

A min-heap holds one "head" per list. Pop the smallest, output it, and push the next item from the same list. The heap
never holds more than k items.

```python
import heapq

def merge_k_sorted(lists: list[list[int]]) -> list[int]:
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    merged: list[int] = []
    while heap:
        value, i, j = heapq.heappop(heap)
        merged.append(value)
        if j + 1 < len(lists[i]):
            heapq.heappush(heap, (lists[i][j + 1], i, j + 1))
    return merged

lists = [[1, 4, 5], [1, 3, 4], [2, 6]]
assert merge_k_sorted(lists) == [1, 1, 2, 3, 4, 4, 5, 6]
assert merge_k_sorted(lists) == list(heapq.merge(*lists))     # the standard library does the same
assert merge_k_sorted([]) == []
assert merge_k_sorted([[], []]) == []
assert merge_k_sorted([[5], [], [1, 9]]) == [1, 5, 9]
```

Complexity: O(N log k) time for N items in total, O(k) extra space besides the output.

#### Follow-ups

- **Linked lists (the LeetCode version)?** Push `(node.val, i, node)`. The index `i` matters: without it, equal values
  would make Python compare `ListNode` objects and raise `TypeError`.
- **Without a heap?** Divide and conquer: merge the lists in pairs, then pairs of results. Also O(N log k).
- **Lists too big for memory (external sort)?** Same idea with one buffered reader per file; `heapq.merge` is lazy and
  works on iterators.

### Sliding window maximum {hard}

Given `nums` and a window size `k`, return the maximum of every window of `k` consecutive values.

- `nums = [1, 3, -1, -3, 5, 3, 6, 7], k = 3` → `[3, 3, 5, 5, 6, 7]`

#### Hints

1. Taking `max()` of every window is O(n·k).
2. If a newer value is bigger than an older one, the older one can never be a window maximum again. Throw it away.
3. Keep indices in a deque with decreasing values. The front is the maximum; drop it when it slides out.

#### Solution

A **monotonic deque** of indices whose values decrease from front to back. New values pop smaller ones off the back;
the front leaves when it falls out of the window. Each index enters and leaves once.

```python
from collections import deque

def max_sliding_window(nums: list[int], k: int) -> list[int]:
    window: deque[int] = deque()          # indices; their values decrease from front to back
    result: list[int] = []
    for i, value in enumerate(nums):
        while window and nums[window[-1]] <= value:
            window.pop()                      # smaller and older: it can never be a maximum again
        window.append(i)
        if window[0] <= i - k:
            window.popleft()                  # the front has slid out of the window
        if i >= k - 1:
            result.append(nums[window[0]])
    return result

assert max_sliding_window([1, 3, -1, -3, 5, 3, 6, 7], 3) == [3, 3, 5, 5, 6, 7]
assert max_sliding_window([1], 1) == [1]
assert max_sliding_window([9, 8, 7, 6], 2) == [9, 8, 7]
assert max_sliding_window([1, 2, 3, 4], 4) == [4]

nums = [4, -2, 7, 7, 1, 0, 3, -5, 6]
for k in range(1, len(nums) + 1):
    assert max_sliding_window(nums, k) == [max(nums[i:i + k]) for i in range(len(nums) - k + 1)]
```

Complexity: O(n) time, O(k) space.

#### Follow-ups

- **Why not a heap?** A heap works with lazy deletion (skip tops whose index is out of the window) in O(n log n).
  The deque is O(n) and simpler once you see it.
- **Minimum instead?** Flip the comparison so values increase from front to back.
