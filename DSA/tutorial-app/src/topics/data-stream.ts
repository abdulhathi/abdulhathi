import type { Topic } from './types';

export const topic: Topic = {
  id: 'data-stream',
  patterns: [
    { name: 'Sliding windows over time', idea: 'Keep only the items that can still matter in a queue; drop old ones from the front as new ones arrive at the back.' },
    { name: 'Running aggregates', idea: 'Update a small summary (a counter, prefix products, a monotonic stack, point counts) with each new item so queries never rescan the stream.' },
    { name: 'Order statistics with heaps', idea: 'Heaps keep the k-th largest, the median, or a moving rank available as items arrive, with lazy deletion when old entries change.' },
    { name: 'Window statistics over bounded values', idea: 'When values are small integers, count them in an array or a Fenwick tree and read sums of the smallest or largest k directly.' },
    { name: 'Merging as data arrives', idea: 'Keep the summary already merged (sorted disjoint intervals, the next expected id) so each arrival only touches its neighbours.' },
    { name: "Matching the stream's suffix", idea: 'Only the last L characters can end a word of length at most L: check them against a trie of reversed words.' },
  ],
  signals: [
    { see: '"Stream", "online", "after each insertion return…"', think: 'Maintain a summary incrementally', why: 'Recomputing over everything seen so far makes each call O(n) and the whole run O(n²).' },
    { see: 'Count or sum over the last T time units or the last k items', think: 'A queue (or a ring buffer) as a sliding window', why: 'Each item enters and leaves once: amortised O(1).' },
    { see: 'Median, k-th largest, or rank of a growing collection', think: 'Two heaps, or one heap of size k', why: 'Heaps give the boundary element in O(1) and absorb a new item in O(log n).' },
    { see: 'Values bounded by about 10⁵ and you need sums of the smallest or largest k', think: 'Fenwick trees of counts and sums over values', why: 'A k-th smallest search and a prefix sum each cost O(log V).' },
    { see: 'Keep the numbers seen so far as merged ranges', think: 'Sorted disjoint intervals, merge with neighbours on insert', why: 'An arrival can only join the interval just before it and the one just after it.' },
    { see: 'Product or sum of the last k items with zeros possible', think: 'Prefix products, reset at every zero', why: 'A zero makes every product that includes it 0, so only items after the last zero matter.' },
  ],
  problems: [
    // ---------- Sliding windows over time ----------
    {
      id: 933, title: 'Number of Recent Calls', pattern: 'Sliding windows over time', core: true,
      summary: 'Requests arrive at increasing times. After each one, return how many requests happened in the last 3000 milliseconds (inclusive), counting the new one.',
      hints: ['Times only increase, so an old request never comes back into the window.', 'Keep the times in a queue and remove too-old ones from the front.'],
      insight: 'A queue of times is a sliding window: push the new time, pop from the front while it is older than t − 3000, and the queue length is the answer.',
      approach: ['Push t onto the back of the queue.', 'While the front is less than t − 3000, remove it.', 'Return the number of times in the queue.'],
      ds: ['Queue (array with a head index)'], time: 'O(1) amortised per call', space: 'O(window size)',
      traps: ['The range is inclusive: a request exactly 3000 ms ago still counts.', 'Array.prototype.shift is O(n); a head index keeps it O(1).'],
    },
    {
      id: 2526, title: 'Find Consecutive Integers from a Data Stream', pattern: 'Sliding windows over time',
      summary: 'Integers arrive one at a time. After each, report whether the last k integers were all equal to a given value.',
      hints: ['You do not need to store the last k numbers.', 'What single number tells you whether the last k all equal value?'],
      insight: 'Count the length of the current run of numbers equal to value: reset it to 0 on any other number. The answer is whether the run length is at least k.',
      approach: ['Keep run = 0.', 'For each number: if it equals value, add one to run; otherwise set run to 0.', 'Return whether run ≥ k.'],
      ds: ['One counter'], time: 'O(1) per call', space: 'O(1)',
      traps: ['A queue of the last k numbers works but is wasteful; the window question reduces to a run length.'],
    },

    // ---------- Running aggregates ----------
    {
      id: 1352, title: 'Product of the Last K Numbers', pattern: 'Running aggregates', core: true,
      summary: 'Numbers arrive one at a time (0 to 100). Answer queries for the product of the last k numbers.',
      hints: [
        'Prefix sums answer "sum of the last k" by subtraction. Products work by division.',
        'Division breaks when a zero appears.',
        'On a zero, throw away the prefix products: any window that reaches back past it has product 0.',
      ],
      insight: 'Keep prefix products since the last zero. If k is within that list, the answer is last ÷ prefix[length − 1 − k]; if k reaches back past the last zero, the answer is 0.',
      approach: [
        'Keep a list of prefix products starting with 1.',
        'add(0): reset the list to [1]. add(x > 0): append (last product) × x.',
        'getProduct(k): if k ≥ length of the list, return 0 (the window includes a zero).',
        'Otherwise return list[last] ÷ list[last − k].',
      ],
      ds: ['Array of prefix products'], time: 'O(1) per call', space: 'O(n)',
      traps: ['The statement guarantees that every contiguous product fits in 32 bits, so the prefix products since the last zero stay small and the division is exact.', 'Forgetting to reset on a zero leaves a 0 in the list and makes every later division by it fail.'],
    },
    {
      id: 901, title: 'Online Stock Span', pattern: 'Running aggregates',
      summary: 'Prices arrive daily. For each day, return how many consecutive days, ending today, had a price at most today\'s price.',
      hints: [
        'Once a higher price appears, the lower prices before it never matter for later days separately.',
        'Keep a stack of (price, span) with prices strictly decreasing from bottom to top.',
        'Pop every entry with price ≤ today\'s, adding its span to today\'s.',
      ],
      insight: 'A monotonic stack of (price, span): today absorbs the spans of all smaller-or-equal prices on top of the stack, so each price is pushed and popped at most once.',
      approach: [
        'span = 1.',
        'While the stack is not empty and its top price ≤ today\'s price, pop it and add its span to span.',
        'Push (today\'s price, span) and return span.',
      ],
      ds: ['Stack of (price, span)'], time: 'O(1) amortised per call', space: 'O(n)',
      traps: ['Use ≤, not <: equal prices are included in the span.'],
    },
    {
      id: 2013, title: 'Detect Squares', pattern: 'Running aggregates',
      summary: 'Points arrive (duplicates allowed). For a query point, count the ways to pick three stored points that form an axis-aligned square with it.',
      hints: [
        'Fix the corner diagonally opposite the query point; that decides the whole square.',
        'Store a count for every distinct point.',
        'For each stored point (px, py) with |px − x| = |py − y| > 0, multiply the counts of the three needed corners.',
      ],
      insight: 'Choosing the diagonal corner fixes the square, so a count map of points lets each query sum count(diagonal) × count(x, py) × count(px, y) over the distinct stored points.',
      approach: [
        'add: increase the count of the point (key x × 1001 + y, or a string).',
        'count(x, y): for every distinct stored point (px, py) with px ≠ x and |px − x| = |py − y|, add count(px, py) × count(x, py) × count(px, y).',
        'Return the total.',
      ],
      ds: ['Map from point to count'], time: 'O(1) add, O(distinct points) per count', space: 'O(distinct points)',
      traps: ['Duplicates multiply: two copies of a corner double the number of squares.', 'Skip zero-size squares (px = x).'],
    },

    // ---------- Order statistics with heaps ----------
    {
      id: 703, title: 'Kth Largest Element in a Stream', pattern: 'Order statistics with heaps', core: true,
      summary: 'Scores arrive one at a time. After each, return the k-th largest score so far.',
      hints: ['Only the k largest scores ever matter.', 'Keep them in a min-heap of size k.', 'The smallest of the k largest is the top of that heap.'],
      insight: 'A min-heap holding the k largest values: its top is the k-th largest. A new value enters, and if the heap grows past k, the smallest leaves.',
      approach: ['Build the heap from the initial numbers, keeping at most k.', 'add(v): push v; if the size exceeds k, pop the smallest.', 'Return the top.'],
      ds: ['Min-heap of size k'], time: 'O(log k) per add', space: 'O(k)',
      traps: ['The initial list can be shorter than k (by one); the first add fills the heap.', 'A max-heap of everything works but costs O(n) memory and more time.'],
    },
    {
      id: 2034, title: 'Stock Price Fluctuation', pattern: 'Order statistics with heaps',
      summary: 'Price records (time, price) arrive out of order, and later records may correct earlier ones. Report the latest price, the maximum and the minimum of the current records.',
      hints: [
        'Keep the current price per timestamp in a map, and the largest timestamp seen.',
        'For max and min, push every record into a max-heap and a min-heap.',
        'When reading a top, discard it if its price no longer matches the map for that timestamp.',
      ],
      insight: 'Lazy deletion: heaps keep every record ever pushed, and a top is valid only if the map still has that price for that timestamp; stale tops are popped when you look at them.',
      approach: [
        'update: set map[time] = price, update latestTime, push (price, time) onto both heaps.',
        'current: return map[latestTime].',
        'maximum: while the max-heap top disagrees with the map, pop it; return its price. minimum: the same with the min-heap.',
      ],
      ds: ['Map time → price', 'Max-heap and min-heap of (price, time)'], time: 'O(log n) amortised per call', space: 'O(n)',
      traps: ['A corrected record changes the max or min; never trust a heap top without checking it against the map.'],
    },
    {
      id: 295, title: 'Find Median from Data Stream', pattern: 'Order statistics with heaps', core: true,
      summary: 'Numbers arrive one at a time. Support adding a number and returning the median of all numbers so far.',
      hints: [
        'The median splits the numbers into a lower half and an upper half.',
        'Keep the lower half in a max-heap and the upper half in a min-heap.',
        'Rebalance after each add so the sizes differ by at most one.',
      ],
      insight: 'Two heaps meet at the middle: the max of the lower half and the min of the upper half are the one or two middle values, so the median is read in O(1) and each add costs O(log n).',
      approach: [
        'If the new number is at most the lower half\'s top (or the lower half is empty), push it there; otherwise push it into the upper half.',
        'If the lower half has two more items than the upper, move its top across; if the upper half is bigger, move its top to the lower half.',
        'Median: the lower top when the count is odd, else the average of both tops.',
      ],
      ds: ['Max-heap', 'Min-heap'], time: 'O(log n) add, O(1) median', space: 'O(n)',
      traps: [
        'Follow-up: with values in [0, 100], a count array of 101 slots finds the median by scanning counts.',
        'JavaScript has no built-in heap; a max-heap can be a min-heap of negated numbers.',
      ],
    },
    {
      id: 2102, title: 'Sequentially Ordinal Rank Tracker', pattern: 'Order statistics with heaps',
      summary: 'Locations with scores are added over time. The i-th query returns the i-th best location so far (higher score first, then smaller name).',
      hints: [
        'The rank asked for grows by exactly one with each query.',
        'Split the locations into "the best i so far" and "the rest".',
        'Keep the best ones in a heap with the worst on top, and the rest in a heap with the best on top.',
      ],
      insight: 'Two heaps split at the current rank: a new location goes into the "best" heap and its worst member is pushed down to "rest"; a query lifts the best of "rest" up, and that item is exactly the next rank.',
      approach: [
        'Let top be a heap whose root is its worst location, and rest a heap whose root is its best. top holds the answers already given.',
        'add: push the location into top, then pop top\'s worst and push it into rest.',
        'get: pop the best of rest, push it into top, and return its name.',
      ],
      ds: ['Two heaps with a custom comparison'], time: 'O(log n) per call', space: 'O(n)',
      traps: ['"Better" means higher score, and for equal scores the lexicographically smaller name; both heaps must use the same rule.'],
    },

    // ---------- Window statistics over bounded values ----------
    {
      id: 1825, title: 'Finding MK Average', pattern: 'Window statistics over bounded values',
      summary: 'For the last m numbers of a stream, drop the k smallest and k largest and return the floor of the average of the rest (or −1 if fewer than m numbers arrived).',
      hints: [
        'Keep the last m numbers in a queue so you know which one leaves.',
        'Values are at most 10⁵: count them by value in a Fenwick tree, with a second Fenwick tree of sums.',
        'The middle sum is the total minus the sum of the smallest k minus the sum of the largest k; "sum of the smallest k" is a k-th smallest search plus a prefix sum.',
      ],
      insight: 'Fenwick trees over values (counts and sums) answer "sum of the smallest j numbers in the window" in O(log V); the middle sum is total − smallest(k) − (total − smallest(m − k)).',
      approach: [
        'Keep a queue of the last m numbers and their total; Fenwick trees cnt and sum indexed by value.',
        'addElement: push the number and add it to both trees; if the queue holds more than m, remove the oldest from the queue and the trees.',
        'smallest(j): descend the count tree to find the value v where the running count reaches j; it is the sum below v plus (j − count below v) × v.',
        'calculateMKAverage: if fewer than m numbers, return −1; else return floor((smallest(m − k) − smallest(k)) ÷ (m − 2k)).',
      ],
      ds: ['Queue', 'Two Fenwick trees over values'], time: 'O(log V) per call', space: 'O(V + m)',
      traps: [
        'Three ordered multisets (low, middle, high) with a running middle sum also work, but JavaScript has no built-in ordered multiset.',
        'Sums reach 10¹⁰, still exact in a JavaScript number.',
      ],
    },

    // ---------- Merging as data arrives ----------
    {
      id: 1656, title: 'Design an Ordered Stream', pattern: 'Merging as data arrives',
      summary: 'Pairs (id, value) for ids 1..n arrive in any order. After each insert, return the longest run of values, in id order, that can now be released.',
      hints: ['Remember the next id you are waiting for.', 'After inserting, release values while the waited-for id is present.'],
      insight: 'A pointer to the next expected id: each insert fills its slot, and if that completes the run at the pointer, sweep forward releasing values until a gap.',
      approach: ['Keep an array of n + 1 slots and ptr = 1.', 'insert: store the value at its id.', 'Collect values while slot ptr is filled, moving ptr forward; return the collected chunk.'],
      ds: ['Array', 'Pointer'], time: 'O(n) total over all inserts', space: 'O(n)',
      traps: ['Most inserts return an empty chunk; that is expected.'],
    },
    {
      id: 352, title: 'Data Stream as Disjoint Intervals', pattern: 'Merging as data arrives', core: true,
      summary: 'Non-negative integers arrive one at a time. At any time, return the numbers seen so far as a sorted list of disjoint intervals.',
      hints: [
        'Keep the intervals merged and sorted at all times.',
        'A new number can only touch the interval just before it and the interval just after it.',
        'Find those neighbours with binary search on the interval starts, then merge.',
      ],
      insight: 'Maintain sorted disjoint intervals: a new value either lies inside one, extends the left neighbour, extends the right neighbour, joins both, or starts a new interval; binary search finds the neighbours.',
      approach: [
        'Binary search the last interval whose start ≤ value (left) and the next one (right).',
        'If value is inside left, do nothing.',
        'If value = left end + 1 and value + 1 = right start, merge left and right into one interval; else extend whichever one touches.',
        'If neither touches, insert [value, value] at the right position. getIntervals returns the list.',
      ],
      ds: ['Sorted array of intervals', 'Binary search'], time: 'O(log n) search, O(n) worst case to insert into the array', space: 'O(n)',
      traps: [
        'Follow-up: with many merges and few intervals, a balanced tree or ordered map gives O(log n) inserts.',
        'Values ≤ 10⁴ and few getIntervals calls also allow a simple seen-array scanned on each query.',
      ],
    },

    // ---------- Matching the stream's suffix ----------
    {
      id: 1032, title: 'Stream of Characters', pattern: "Matching the stream's suffix",
      summary: 'Characters arrive one by one; after each, report whether some word from a dictionary ends at the newest character.',
      hints: [
        'A word ending now is a suffix of the stream.',
        'Store the words reversed in a trie, so a suffix read backwards is a path from the root.',
        'After each character, walk the trie over the newest characters, newest first, up to the longest word length.',
      ],
      insight: 'A trie of reversed words turns "does some word end here?" into a walk from the newest character backwards; only the last L characters (L = longest word) can matter, so keep just those.',
      approach: [
        'Insert every word reversed into a trie, marking word ends.',
        'Keep the stream\'s characters in an array (or a buffer of the last L).',
        'For each query, start at the root and walk the trie with the characters from newest to oldest.',
        'Return true as soon as you reach a word end; false if the walk falls off the trie or runs out of characters.',
      ],
      ds: ['Trie of reversed words', 'Buffer of recent characters'], time: 'O(L) per query', space: 'O(total word length + L)',
      traps: ['Aho–Corasick gives amortised O(1) per character (see the String matching chapter); the reversed trie is simpler and passes.'],
    },
  ],
};
