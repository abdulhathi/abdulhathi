import type { Topic } from './types';

export const topic: Topic = {
  id: 'ordered-set',
  patterns: [
    { name: 'Floor and ceiling', idea: 'Keep values sorted and ask for the nearest value below or above a target; only those two neighbours can matter.' },
    { name: 'Sorted keys and sweeps', idea: 'Keep counts or changes by key and read the keys in sorted order, adding up as you go.' },
    { name: 'Interval sets', idea: 'Store disjoint intervals sorted by start; binary search finds the ones a new interval touches, which you merge or cut.' },
    { name: 'Sorted window', idea: 'Maintain the values inside a sliding window in order, so the minimum, maximum or median is always available.' },
    { name: 'Rank counting', idea: 'Count how many earlier values are smaller (or larger) than the current one, using a Fenwick tree over compressed values.' },
    { name: 'Lazy deletion heaps', idea: 'When you only need the minimum or maximum, a heap that throws away out-of-date entries when they reach the top replaces an ordered set.' },
    { name: 'Order by position', idea: 'Find and remove the k-th item of a changing sequence, using counts over positions.' },
  ],
  signals: [
    { see: '"The closest value to x", "the smallest value ≥ x", "the largest value ≤ x" while values are being added', think: 'Ordered set: floor and ceiling', why: 'In sorted order, the best partner for x is always one of its two neighbours.' },
    { see: 'Median, minimum or maximum of a sliding window, or of a stream with deletions', think: 'Sorted window: two heaps with lazy deletion, or monotonic deques', why: 'You need order inside the window, but only at its edges or its middle.' },
    { see: '"How many values to the right are smaller", "count pairs i < j with a condition on values"', think: 'Rank counting with a Fenwick tree over compressed values (or merge sort)', why: 'Processing in index order turns each pair question into a count over the values seen so far.' },
    { see: 'Bookings, ranges or intervals that are added, removed and queried', think: 'Sorted list of intervals, or a sorted map of +1/−1 changes', why: 'Only intervals near the new one can be affected, and binary search finds them.' },
    { see: 'Design problems: "return the highest-rated", "smallest index holding x", with updates', think: 'Heap per group plus a map of current values; skip stale tops', why: 'A heap gives the best item fast; a map tells you whether that item is still current.' },
    { see: 'A C++ solution uses set, multiset or map, and you write TypeScript', think: 'Pick a substitute by the operations really used', why: 'TypeScript has no balanced search tree built in; each operation pattern has a simpler replacement.' },
  ],
  problems: [
    // ---------- Floor and ceiling ----------
    {
      id: 729, title: 'My Calendar I', pattern: 'Floor and ceiling', core: true,
      summary: 'Accept a new booking [start, end) only if it does not overlap any booking already accepted.',
      hints: [
        'Keep the accepted bookings sorted by start.',
        'Which existing bookings could possibly overlap the new one?',
        'Only the booking just before the new start and the one just after it.',
      ],
      insight: 'In a list sorted by start, a new booking can only clash with its floor (the last booking starting before it) or its ceiling (the first booking starting at or after it). Check those two.',
      approach: [
        'Keep two parallel arrays (or one array of pairs) sorted by start.',
        'Binary search for the first booking whose start is ≥ the new start.',
        'Reject if that booking starts before the new end, or if the booking before it ends after the new start.',
        'Otherwise insert the new booking at that position and accept.',
      ],
      ds: ['Sorted array', 'Binary search'], time: 'O(log n) search + O(n) insert, fine for 1000 calls', space: 'O(n)',
      traps: ['Intervals are half-open: [10, 20) and [20, 30) do not overlap.', 'With a built-in ordered map (such as Java\'s TreeMap) the insert is O(log n); for 1000 calls the array insert is just as fast in practice.'],
    },
    {
      id: 220, title: 'Contains Duplicate III', pattern: 'Floor and ceiling', core: true,
      summary: 'Decide whether two different positions at most indexDiff apart hold values at most valueDiff apart.',
      hints: [
        'Slide a window of the last indexDiff values.',
        'For the new value x, you want any window value in [x − valueDiff, x + valueDiff]. With an ordered set, that is one ceiling query.',
        'Without an ordered set: put values into buckets of width valueDiff + 1. Two values in the same bucket always qualify, so each bucket holds at most one value.',
      ],
      insight: 'Buckets of width valueDiff + 1 act as a coarse ordered set: any two values in one bucket are close enough, so you only need to check the value\'s own bucket and its two neighbours.',
      approach: [
        'Width w = valueDiff + 1. A value x belongs to bucket floor(x / w) (Math.floor handles negatives correctly).',
        'For each index i: if x\'s bucket already holds a value, return true.',
        'If the bucket just below or just above holds a value within valueDiff of x, return true.',
        'Store x in its bucket. If i ≥ indexDiff, delete the bucket of the value at index i − indexDiff, which has left the window.',
        'Return false at the end.',
      ],
      ds: ['Map from bucket id to value', 'Sliding window'], time: 'O(n)', space: 'O(min(n, indexDiff))',
      traps: [
        'Truncating division (or bitwise |0) puts −1 and 1 in the same bucket; use Math.floor.',
        'The ordered-set version (ceiling of x − valueDiff in the window) is O(n log indexDiff) and is the general tool when the question changes.',
      ],
    },
    {
      id: 2817, title: 'Minimum Absolute Difference Between Elements With Constraint', pattern: 'Floor and ceiling',
      summary: 'Find the smallest absolute difference between two values whose positions are at least x apart.',
      hints: [
        'Scan i from left to right. Every index ≤ i − x is a legal partner for i.',
        'Add the value at i − x to a sorted structure before handling i.',
        'The best partner for nums[i] is its floor or its ceiling in that structure.',
      ],
      insight: 'As i moves right, the legal partners only grow, so insert nums[i − x] and query the floor and ceiling of nums[i]: the closest value is always one of those two.',
      approach: [
        'Compress the values to ranks (sort the distinct values).',
        'Use a Fenwick tree of counts over the ranks as an ordered multiset.',
        'For each i from x: add the rank of nums[i − x]; find the largest present rank ≤ rank of nums[i] and the smallest present rank ≥ it (prefix counts plus a k-th search on the tree).',
        'Update the answer with the differences to those two values. Return the minimum.',
      ],
      ds: ['Fenwick tree over compressed values', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Inserting into a sorted array with splice is O(n) per insert: about 5 · 10⁹ element moves in the worst case, too slow.', 'When x is 0 a position may pair with itself, so the answer is 0.'],
    },
    {
      id: 975, title: 'Odd Even Jump', pattern: 'Floor and ceiling',
      summary: 'From a start index, jumps alternate: odd jumps go right to the smallest value ≥ the current one, even jumps go right to the largest value ≤ it (ties go to the smallest index). Count the start indices that can reach the last index.',
      hints: [
        'The jump target from i never depends on where you came from, only on whether the jump is odd or even.',
        'Precompute nextHigher[i] (ceiling to the right) and nextLower[i] (floor to the right).',
        'Then work backwards: odd[i] = even[nextHigher[i]] and even[i] = odd[nextLower[i]].',
      ],
      insight: 'Each jump is a ceiling or floor query among the values to the right; once those targets are precomputed, a two-state DP from right to left counts the good starts.',
      approach: [
        'Sort indices by (value, index). Walk them in that order with a stack of indices still waiting for a target: while the current index is larger than the index on top of the stack, the current index is that top\'s nextHigher, so record it and pop. Then push the current index.',
        'Do the same with indices sorted by (−value, index) to get nextLower.',
        'odd[last] = even[last] = true. For i from right to left: odd[i] = even[nextHigher[i]], even[i] = odd[nextLower[i]] (false when there is no target).',
        'Count the indices with odd[i] true (the first jump is odd).',
      ],
      ds: ['Sorting', 'Monotonic stack', 'Two boolean arrays'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Ties go to the smallest index, which is why indices are sorted by (value, index).', 'An ordered map from value to the nearest index, filled from the right, is the direct way in languages that have one.'],
    },

    // ---------- Sorted keys and sweeps ----------
    {
      id: 2363, title: 'Merge Similar Items', pattern: 'Sorted keys and sweeps',
      summary: 'Two lists of (value, weight) pairs: add up the weights of equal values and return the pairs sorted by value.',
      hints: ['Group by value with a map.', 'An ordered map would return keys in order; in TypeScript, sort the keys at the end.'],
      insight: 'Sum weights per value in a hash map, then sort the keys once: that is everything an ordered map would give you here.',
      approach: ['Add every pair\'s weight to a Map keyed by value.', 'Take the entries, sort them by value, and return them.'],
      ds: ['Map', 'Sorting'], time: 'O(n log n)', space: 'O(n)',
      traps: ['A JavaScript Map keeps insertion order, not sorted order; you must sort.'],
    },
    {
      id: 731, title: 'My Calendar II', pattern: 'Sorted keys and sweeps',
      summary: 'Accept a new booking unless it would make some moment covered by three bookings.',
      hints: [
        'Keep two lists: all accepted bookings, and the regions already covered twice.',
        'A new booking fails if it overlaps any double-covered region.',
        'Otherwise, its overlaps with existing bookings become new double-covered regions.',
      ],
      insight: 'Track the double-booked regions separately; a new booking is legal exactly when it misses all of them, and its intersections with existing bookings are the new double-booked regions.',
      approach: [
        'For a request [s, e): if it overlaps any region in the "double" list, reject.',
        'For each accepted booking [a, b) that overlaps, add [max(s, a), min(e, b)) to the double list.',
        'Add [s, e) to the accepted list and accept.',
      ],
      ds: ['Two arrays of intervals'], time: 'O(n) per booking, O(n²) total for 1000 calls', space: 'O(n)',
      traps: ['The sweep alternative: a sorted map of +1 at start and −1 at end; add, scan prefix sums, and undo if any reaches 3.'],
    },
    {
      id: 732, title: 'My Calendar III', pattern: 'Sorted keys and sweeps',
      summary: 'After each booking, report the largest number of bookings that overlap at any single moment.',
      hints: ['Record +1 at each start and −1 at each end.', 'Scanning the change points in time order, the running total is the number of active bookings.', 'Keep the change points sorted as you add them.'],
      insight: 'A sorted map from time to net change, scanned in order, gives the number of active bookings at every moment; the maximum running total is the answer.',
      approach: [
        'Keep a Map from time to net change, and a sorted array of its keys (binary-search insert new keys).',
        'On book(s, e): add +1 at s and −1 at e.',
        'Scan the keys in order with a running total; return the largest total seen.',
      ],
      ds: ['Map', 'Sorted array of keys'], time: 'O(n) per booking, fine for 400 calls', space: 'O(n)',
      traps: ['Half-open intervals: process an end and a start at the same time as net change, which the map does automatically.', 'A segment tree over compressed times answers each booking in O(log n) (Segment trees chapter).'],
    },

    // ---------- Interval sets ----------
    {
      id: 352, title: 'Data Stream as Disjoint Intervals', pattern: 'Interval sets',
      summary: 'Numbers arrive one at a time; at any point, return the numbers seen so far as a sorted list of disjoint ranges.',
      hints: ['Keep disjoint intervals sorted by start.', 'A new value can extend the interval just before it, the one just after it, or join both.', 'Binary search finds those two neighbours.'],
      insight: 'Only the floor interval and the ceiling interval of a new value can absorb it, so binary search plus at most one merge keeps the list correct.',
      approach: [
        'Keep an array of [start, end] intervals sorted by start.',
        'For a new value v, binary search for the first interval with start > v; the one before it is the floor.',
        'If v is already inside the floor, do nothing. If v joins the floor (end + 1 = v) and the next interval (start − 1 = v), merge all three.',
        'Else extend whichever one it touches, or insert [v, v] at that position.',
        'getIntervals returns the array.',
      ],
      ds: ['Sorted array of intervals', 'Binary search'], time: 'O(log n) search + O(n) insert', space: 'O(n)',
      traps: ['Duplicates of a value already covered must change nothing.', 'Because values are at most 10⁴, a boolean array scanned on each getIntervals call also passes; the interval list is what the follow-up wants.'],
    },
    {
      id: 715, title: 'Range Module', pattern: 'Interval sets',
      summary: 'Track half-open ranges of numbers: add a range, remove a range, and ask whether a range is fully tracked.',
      hints: [
        'Store tracked numbers as disjoint intervals sorted by start.',
        'Adding merges every interval that touches the new range; removing cuts them, possibly splitting one in two.',
        'Binary search finds the first affected interval.',
      ],
      insight: 'A sorted list of disjoint intervals is an ordered set of ranges: every operation only touches one contiguous block of intervals, found by binary search.',
      approach: [
        'Add [l, r): find the block of intervals that overlap or touch [l, r); replace them by one interval from the smallest start to the largest end.',
        'Remove [l, r): for the overlapping block, keep the pieces left of l and right of r, and drop the rest.',
        'Query [l, r): binary search for the interval with the largest start ≤ l; answer true if it exists and its end ≥ r.',
      ],
      ds: ['Sorted array of intervals', 'Binary search'], time: 'O(log n + k) per call, k = intervals touched (plus array shifting)', space: 'O(n)',
      traps: ['Half-open ends: [1, 3) and [3, 5) touch and should merge into [1, 5).', 'Removing the middle of an interval splits it into two.'],
    },

    // ---------- Sorted window ----------
    {
      id: 1438, title: 'Longest Continuous Subarray With Absolute Diff Less Than or Equal to Limit', pattern: 'Sorted window', core: true,
      summary: 'Find the longest contiguous subarray in which the largest and smallest values differ by at most a limit.',
      hints: [
        'Use a sliding window; it is valid while max − min ≤ limit.',
        'You need the max and min of the window as it grows and shrinks.',
        'An ordered multiset works; two monotonic deques work in O(n).',
      ],
      insight: 'The window only needs its maximum and minimum, so two monotonic deques (one decreasing, one increasing) replace a full ordered multiset.',
      approach: [
        'Move the right end forward. Before adding a value, pop smaller values from the back of the max-deque and larger values from the back of the min-deque; then push it on both.',
        'While front of max-deque minus front of min-deque exceeds the limit, move the left end forward, popping a deque front if it is the value leaving.',
        'Record the window length after each step.',
      ],
      ds: ['Two deques (arrays with a head index)', 'Sliding window'], time: 'O(n)', space: 'O(n)',
      traps: ['Store indices (or compare values carefully) so duplicates leave the deque at the right time.', 'Array.shift is O(n); keep a head index instead.'],
    },
    {
      id: 480, title: 'Sliding Window Median', pattern: 'Sorted window', core: true,
      summary: 'Return the median of every window of k consecutive numbers.',
      hints: [
        'Split the window into a smaller half and a larger half.',
        'A max-heap for the smaller half and a min-heap for the larger half give the median from their tops.',
        'Heaps cannot delete from the middle: mark leaving values as stale and discard them when they reach a top.',
      ],
      insight: 'Two heaps keep the halves balanced, and lazy deletion handles values leaving the window: only live sizes are balanced, and stale entries are popped when they surface.',
      approach: [
        'Keep a max-heap (low half) and a min-heap (high half), plus live counts for each.',
        'Add a value to low if it is ≤ low\'s top, else to high.',
        'When a value leaves, decide which heap it is in by comparing with low\'s top, decrease that heap\'s live count, and note it as stale.',
        'Rebalance so low has the same number of live elements as high, or one more, popping stale tops before moving or reading.',
        'Median = low\'s top when k is odd, otherwise the mean of both tops.',
      ],
      ds: ['Two heaps', 'Lazy deletion (map of pending removals, or indices)'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Inserting into a sorted array is O(k) per step: up to 2.5 · 10⁹ moves for large k.',
        'Values reach ±2³¹; their sum does not overflow a TypeScript number, but it would overflow 32-bit integers in other languages.',
        'Store indices in the heaps, or count stale copies per value, so duplicates are deleted correctly.',
      ],
    },
    {
      id: 1825, title: 'Finding MK Average', pattern: 'Sorted window',
      summary: 'For a stream, average the last m values after dropping the k smallest and k largest of them (rounded down), or return −1 if fewer than m values have arrived.',
      hints: [
        'Keep the last m values in a queue.',
        'You need "sum of the smallest t values in the window" quickly. Values are at most 10⁵.',
        'Two Fenwick trees over values (one for counts, one for sums) let you find the sum of the smallest t values in O(log V).',
      ],
      insight: 'Over a small value range, Fenwick trees of counts and sums form an ordered multiset: the middle sum is (sum of smallest m − k) − (sum of smallest k).',
      approach: [
        'Keep a queue of the last m values and two Fenwick trees indexed by value: counts and sums.',
        'On add: push to the queue and add to both trees; if the queue exceeds m, remove the oldest from the queue and both trees.',
        'To get the sum of the smallest t values: descend the count tree to find the largest value v with fewer than t values at or below it. Then the answer is the sum up to v plus (t − count up to v) copies of v + 1.',
        'MK average = (smallest(m − k) − smallest(k)) / (m − 2k), rounded down; −1 if fewer than m values.',
      ],
      ds: ['Queue', 'Two Fenwick trees over values'], time: 'O(log V) per operation', space: 'O(V + m)',
      traps: ['With an ordered multiset language, three multisets (low, middle, high) with a running middle sum is the classic answer.', 'Round down with Math.floor after the division.'],
    },

    // ---------- Rank counting ----------
    {
      id: 315, title: 'Count of Smaller Numbers After Self', pattern: 'Rank counting', core: true,
      summary: 'For each position, count how many values to its right are strictly smaller.',
      hints: [
        'Process from right to left, so "to the right" means "already seen".',
        'You need: how many seen values are smaller than x? That is a rank query.',
        'A Fenwick tree over compressed values answers it in O(log n), then you insert x.',
      ],
      insight: 'Scanning right to left, the answer for x is the number of already-seen values below x: a prefix count in a Fenwick tree indexed by value rank.',
      approach: [
        'Compress the values: sort the distinct values and map each to its rank starting at 1.',
        'For i from right to left: answer[i] = prefix count of ranks below rank(nums[i]).',
        'Add 1 at rank(nums[i]).',
        'Return the answers.',
      ],
      ds: ['Fenwick tree', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Strictly smaller: query ranks up to rank − 1.', 'Merge sort that counts how many right-half elements jump ahead of each left-half element is the other standard answer (Merge sort chapter).'],
    },
    {
      id: 493, title: 'Reverse Pairs', pattern: 'Rank counting',
      summary: 'Count pairs i < j where nums[i] is greater than twice nums[j].',
      hints: [
        'Process j from left to right; earlier values are candidates for i.',
        'You need the number of earlier values greater than 2 · nums[j].',
        'Binary search 2 · nums[j] among the sorted distinct values to find the rank boundary, then query a Fenwick tree.',
      ],
      insight: 'In index order, each j asks a rank question about the values seen before it: how many exceed 2 · nums[j]. A Fenwick tree over sorted values answers it.',
      approach: [
        'Sort the distinct values for compression.',
        'For each j: find how many sorted values are ≤ 2 · nums[j] by binary search; the count of earlier values above that boundary is (inserted so far) − (prefix count up to it).',
        'Add nums[j]\'s rank to the tree.',
        'Sum the counts.',
      ],
      ds: ['Fenwick tree', 'Binary search', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['2 · nums[j] can exceed 32-bit range; TypeScript numbers handle it, but do not use bitwise operators on it.', 'Merge sort with a separate counting pass before each merge also works.'],
    },
    {
      id: 327, title: 'Count of Range Sum', pattern: 'Rank counting',
      summary: 'Count the subarrays whose sum lies between lower and upper, inclusive.',
      hints: [
        'With prefix sums P, a subarray (i, j] has sum P[j] − P[i].',
        'For each j, count earlier prefix sums P[i] in [P[j] − upper, P[j] − lower].',
        'That is a range count over the values seen so far: Fenwick tree over compressed prefix sums.',
      ],
      insight: 'Turn subarray sums into differences of prefix sums; then each j asks how many earlier prefix sums fall in a window of values, a rank-range query.',
      approach: [
        'Compute prefix sums P[0..n] with P[0] = 0, and sort their distinct values.',
        'Insert P[0]. For j from 1 to n: count inserted values in [P[j] − upper, P[j] − lower] using two binary searches to find rank bounds and two Fenwick prefix queries.',
        'Insert P[j].',
        'Sum the counts.',
      ],
      ds: ['Prefix sums', 'Fenwick tree', 'Binary search'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Prefix sums reach about 2 · 10¹⁴: exact in TypeScript numbers, but they overflow 32-bit integers elsewhere.', 'The bounds P[j] − upper and P[j] − lower are not themselves prefix sums, so map them with binary search rather than a rank lookup.'],
    },

    // ---------- Lazy deletion heaps ----------
    {
      id: 2349, title: 'Design a Number Container System', pattern: 'Lazy deletion heaps',
      summary: 'Containers at indices hold numbers that can be replaced. Answer: what is the smallest index currently holding a given number?',
      hints: [
        'Keep the truth in a map: index → number.',
        'For each number, keep a min-heap of indices that held it at some point.',
        'When asked, pop indices from the top that no longer hold that number.',
      ],
      insight: 'Never delete from a heap on change: push the new fact, and let find() discard tops that the index map shows are out of date.',
      approach: [
        'change(index, number): set map[index] = number and push index into the heap for number.',
        'find(number): while that heap is not empty and map[top] is not number, pop.',
        'Return the top, or −1 if the heap is empty.',
      ],
      ds: ['Map', 'Min-heap per number'], time: 'O(log n) amortised per operation', space: 'O(number of changes)',
      traps: ['An index can be set to the same number again; a duplicate heap entry is harmless.'],
    },
    {
      id: 2034, title: 'Stock Price Fluctuation', pattern: 'Lazy deletion heaps', core: true,
      summary: 'Price records arrive out of order and may correct earlier records. Report the latest price, the maximum price and the minimum price among the current records.',
      hints: [
        'Keep the current price per timestamp in a map, and the largest timestamp seen.',
        'For maximum and minimum, use a max-heap and a min-heap of (price, timestamp).',
        'An entry is stale if the map now has a different price for its timestamp. Pop stale tops before answering.',
      ],
      insight: 'Corrections make old heap entries wrong, but you only care when they reach the top: compare the top with the map and discard it if it no longer matches.',
      approach: [
        'update(t, p): map[t] = p; latest = max(latest, t); push (p, t) into both heaps.',
        'current(): return map[latest].',
        'maximum(): while the max-heap top (p, t) has map[t] ≠ p, pop; return the top price. minimum() is the same with the min-heap.',
      ],
      ds: ['Map', 'Max-heap', 'Min-heap'], time: 'O(log n) amortised per call', space: 'O(number of updates)',
      traps: ['A sorted multiset of prices (removing the old price on correction) is the ordered-set version.'],
    },
    {
      id: 2353, title: 'Design a Food Rating System', pattern: 'Lazy deletion heaps',
      summary: 'Foods have cuisines and ratings that can change. Return the highest-rated food of a cuisine, breaking ties by alphabetical name.',
      hints: ['One heap per cuisine, ordered by rating (high first), then name.', 'On a rating change, push a new entry instead of fixing the old one.', 'When asked, pop entries whose rating no longer matches the food\'s current rating.'],
      insight: 'A heap per group plus a map of current ratings: push on every change and lazily discard out-of-date tops.',
      approach: [
        'Map food → cuisine and food → current rating.',
        'Push (rating, name) for every food into its cuisine\'s heap, ordered by higher rating then smaller name.',
        'changeRating: update the map and push a new entry.',
        'highestRated: pop while the top\'s rating differs from the map; return the top name.',
      ],
      ds: ['Maps', 'Heap per cuisine'], time: 'O(log n) amortised per call', space: 'O(n + changes)',
      traps: ['The comparator must break ties by name in ascending order.'],
    },

    // ---------- Order by position ----------
    {
      id: 1756, title: 'Design Most Recently Used Queue', pattern: 'Order by position',
      summary: 'A queue starts as 1, 2, …, n. Each fetch(k) takes the k-th element, moves it to the end, and returns it.',
      hints: [
        'An array with splice is O(n) per fetch, which passes the limits. The follow-up asks for better.',
        'Give every element a slot number: the first n slots, then one new slot at the end per fetch.',
        'A Fenwick tree over slots (1 = occupied) finds the k-th occupied slot by descending the tree.',
      ],
      insight: 'Treat positions as slots that are only ever appended: the k-th element is the k-th occupied slot, which a Fenwick tree finds in O(log n), and moving it means clearing its slot and filling a new one at the end.',
      approach: [
        'Allocate n + (number of fetches) slots; fill slots 1..n with values 1..n and set their counts to 1.',
        'fetch(k): find the k-th occupied slot with a Fenwick descent; read its value.',
        'Set that slot\'s count to 0, write the value into the next free slot at the end, and set that count to 1.',
        'Return the value.',
      ],
      ds: ['Fenwick tree over slots', 'Array of values'], time: 'O(log(n + q)) per fetch', space: 'O(n + q)',
      traps: ['Premium problem. A treap or splay tree keyed by position (an implicit treap) is the textbook O(log n) answer; square-root decomposition gives O(√n).'],
    },
  ],
};
