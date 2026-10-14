import type { Topic } from './types';

export const topic: Topic = {
  id: 'range-queries',
  patterns: [
    { name: 'Static range minimum or maximum', idea: 'The array never changes: build a sparse table once in O(n log n), then answer any range min or max with two overlapping lookups.' },
    { name: 'Other overlap-friendly operations', idea: 'AND, OR and GCD also ignore double counting, so the same sparse table works for them, often combined with binary search.' },
    { name: 'Sqrt decomposition', idea: 'Cut the array into about √n blocks with a summary per block. Queries touch at most two partial blocks plus whole-block summaries; updates touch one block.' },
    { name: 'Position lists per value', idea: 'Store the sorted positions of each value. How often a value occurs in [l, r] is the gap between two binary searches.' },
  ],
  signals: [
    { see: 'Many questions "what is the minimum (or maximum) of nums[l..r]?" on an array that never changes', think: 'Sparse table', why: 'O(n log n) preprocessing, then every query costs two lookups, whatever the range length.' },
    { see: 'Range queries for AND, OR or GCD', think: 'Sparse table (these are idempotent)', why: 'Combining a value with itself changes nothing, so two overlapping blocks give the exact answer.' },
    { see: 'For a fixed start, the range value only goes one way as the end moves (AND only drops, OR only grows, max only grows)', think: 'Binary search on the end, with O(1) range queries', why: 'A monotone function of the end point can be searched; the sparse table makes each probe constant time.' },
    { see: 'Range sums or counts with point updates, and n or the number of queries around 10⁴–10⁵', think: 'Sqrt decomposition, or a Fenwick / segment tree', why: 'Blocks give O(√n) queries and O(1) updates with very little logic; trees give O(log n).' },
    { see: '"How many times does value v appear between l and r?"', think: 'Sorted position list per value + binary search', why: 'Counting inside a sorted list of positions is two binary searches.' },
    { see: 'All queries are known in advance and the answer for [l, r] can be updated when l or r moves by one', think: "Mo's algorithm (offline sqrt ordering)", why: 'Sorting the queries by block makes the two ends move about n√n steps in total.' },
  ],
  problems: [
    // ---------- Static range minimum or maximum ----------
    {
      id: 239, title: 'Sliding Window Maximum', pattern: 'Static range minimum or maximum', core: true,
      summary: 'For every window of k consecutive values in an array, report the largest value in that window.',
      hints: [
        'Every window is a range [i, i + k − 1] of an array that never changes.',
        'A structure that answers "max of any range" in O(1) after preprocessing makes this a simple loop.',
        'Build a sparse table for maximum, then query each window. (A monotonic deque does it in O(n); learn both.)',
      ],
      insight: 'Each window is a static range-maximum query, so a sparse table built once answers all n − k + 1 windows with two lookups each.',
      approach: [
        'Build a sparse table for maximum: row 0 is the array, and each row doubles the block length by taking the max of two blocks from the row above.',
        'Precompute floor(log2) for every length up to n, or use the bit length of the number.',
        'For each window start i, let p be the largest power of two not above k. The answer is the max of the block of length p starting at i and the block of length p ending at i + k − 1.',
        'Collect the answers in order.',
      ],
      ds: ['Sparse table (array of arrays)', 'Log table'], time: 'O(n log n)', space: 'O(n log n)',
      traps: [
        'The optimal solution is the monotonic deque in O(n) time and O(k) space (see the Monotonic queue chapter); the sparse table is the general tool when the windows are not all the same size.',
        'The table has about 17 rows for n = 10⁵, so 1.7 million numbers: fine, but do not build one per query.',
      ],
    },
    {
      id: 1438, title: 'Longest Continuous Subarray With Absolute Diff Less Than or Equal to Limit', pattern: 'Static range minimum or maximum', core: true,
      summary: 'Find the length of the longest contiguous subarray in which the largest value minus the smallest value is at most a given limit.',
      hints: [
        'Every pair in the subarray is within the limit exactly when max − min is within the limit.',
        'If a subarray is valid, every shorter subarray inside it is valid too. That allows a sliding window.',
        'You need max and min of the current window quickly: two sparse tables (or two monotonic deques).',
      ],
      insight: 'Validity depends only on max − min of the window, and shrinking never breaks validity, so slide a window and ask a range-max and range-min structure about it at each step.',
      approach: [
        'Build one sparse table for maximum and one for minimum.',
        'Keep a left edge L = 0. For each right edge R, while max(L..R) − min(L..R) exceeds the limit, move L right.',
        'Record R − L + 1 as a candidate answer.',
        'Return the largest candidate.',
      ],
      ds: ['Two sparse tables', 'Two indices'], time: 'O(n log n)', space: 'O(n log n)',
      traps: [
        'Comparing only neighbouring values is wrong: the statement compares every pair, not just adjacent ones.',
        'Monotonic deques give O(n) and are the usual interview answer; the sparse table version is simpler to get right.',
      ],
    },
    {
      id: 84, title: 'Largest Rectangle in Histogram', pattern: 'Static range minimum or maximum',
      summary: 'Bars of width 1 stand side by side with given heights. Find the area of the largest rectangle that fits inside the bars.',
      hints: [
        'Over a range of bars, the tallest rectangle that spans the whole range is limited by the shortest bar in it.',
        'Take the whole array. Either the best rectangle spans everything (height = the minimum), or it lies entirely left or right of the shortest bar.',
        'Find the position of the minimum in a range with a sparse table that stores indices, and split there.',
      ],
      insight: 'Divide and conquer around the shortest bar: the best rectangle either uses the full range at the minimum height or avoids that bar, and a sparse table finds the minimum of any range in O(1).',
      approach: [
        'Build a sparse table that stores the index of the minimum height for each block (compare heights, keep the index).',
        'Process ranges with an explicit stack, starting from the whole array.',
        'For range [l, r], find the index m of its minimum. Candidate area = height[m] × (r − l + 1).',
        'Push [l, m − 1] and [m + 1, r], and keep the largest candidate.',
      ],
      ds: ['Sparse table of indices', 'Explicit stack of ranges'], time: 'O(n log n)', space: 'O(n log n)',
      traps: [
        'Writing the recursion directly can go 10⁵ calls deep on sorted heights and overflow the JavaScript call stack; use an explicit stack.',
        'The classic answer is a monotonic stack in O(n) (see the Monotonic stack chapter). This version shows range minimum as a building block.',
      ],
    },
    {
      id: 2940, title: 'Find Building Where Alice and Bob Can Meet', pattern: 'Static range minimum or maximum',
      summary: 'From building i you may move to any building to the right that is strictly taller. For each query giving two starting buildings, return the leftmost building where both people can end up, or −1.',
      hints: [
        'Order the pair so a ≤ b. Handle the easy cases first: same building, or building b is already taller than a.',
        'Otherwise the meeting building must be right of b and taller than both, which means taller than heights[a].',
        'Find the first index after b whose height beats heights[a]: binary search with range-maximum queries.',
      ],
      insight: 'The answer is the first building after b that is taller than max(heights[a], heights[b]); "first index where the running max exceeds x" is a binary search over O(1) range-maximum queries.',
      approach: [
        'Build a sparse table for maximum height.',
        'For each query, swap so a ≤ b. If a equals b, the answer is a. If heights[a] < heights[b], the answer is b.',
        'Otherwise set need = heights[a]. If the max of [b + 1, n − 1] is not above need, the answer is −1.',
        'Else binary search the smallest j > b whose prefix max from b + 1 to j exceeds need; that j is the answer.',
      ],
      ds: ['Sparse table', 'Binary search'], time: 'O((n + q) log n)', space: 'O(n log n)',
      traps: [
        'Moves must go to strictly taller buildings: equal heights do not count.',
        'If heights[a] equals heights[b] with a < b, b is not reachable from a, so you still need a building to the right.',
      ],
    },

    // ---------- Other overlap-friendly operations ----------
    {
      id: 1521, title: 'Find a Value of a Mysterious Function Closest to Target', pattern: 'Other overlap-friendly operations',
      summary: 'The mystery formula in this problem computes the bitwise AND of a subarray. Over all subarrays, find the smallest possible distance between that AND and a target.',
      hints: [
        'AND is idempotent: x AND x = x. Which range structure loves idempotent operations?',
        'For a fixed left end, the AND can only stay the same or shrink as the right end moves right.',
        'Binary search the first right end where the AND drops to the target or below, and check it and its neighbour.',
      ],
      insight: 'With a sparse table for AND, the AND of any range costs O(1); since it never increases as the range grows, binary search finds where it crosses the target for each left end.',
      approach: [
        'Build a sparse table where each block stores the AND of its values.',
        'For each left end l, binary search the smallest r ≥ l whose range AND is at most the target.',
        'Check |AND(l..r) − target| and |AND(l..r − 1) − target| (when r − 1 ≥ l), and keep the minimum.',
        'Return the best distance found.',
      ],
      ds: ['Sparse table', 'Binary search'], time: 'O(n log n)', space: 'O(n log n)',
      traps: [
        'A neat alternative: the set of distinct AND values of subarrays ending at r has at most about 20 members, because each new value drops at least one bit.',
        'Check both sides of the crossing point; the closest value may be just above the target.',
      ],
    },
    {
      id: 3171, title: 'Find Subarray With Bitwise OR Closest to K', pattern: 'Other overlap-friendly operations',
      summary: 'Over all subarrays, find the smallest possible distance between k and the bitwise OR of the subarray.',
      hints: [
        'This is the mirror of problem 1521, with OR instead of AND.',
        'For a fixed left end, the OR only grows as the subarray gets longer.',
        'Sparse table for OR plus a binary search per left end, checking both sides of where the OR passes k.',
      ],
      insight: 'OR is idempotent and grows monotonically with the right end, so an O(1) range-OR from a sparse table lets you binary search the crossing point for each left end.',
      approach: [
        'Build a sparse table where each block stores the OR of its values.',
        'For each left end l, binary search the smallest r with OR(l..r) ≥ k.',
        'Compare |OR(l..r) − k| and |OR(l..r − 1) − k| with the best so far.',
        'Return the best.',
      ],
      ds: ['Sparse table', 'Binary search'], time: 'O(n log n)', space: 'O(n log n)',
      traps: ['If no r reaches k, the binary search lands on the last index; still check it, since the full OR may be the closest value.'],
    },

    // ---------- Sqrt decomposition ----------
    {
      id: 307, title: 'Range Sum Query - Mutable', pattern: 'Sqrt decomposition', core: true,
      summary: 'Support two operations on an array: change one value, and return the sum of a range.',
      hints: [
        'Prefix sums answer ranges fast but an update would rewrite O(n) of them.',
        'Split the array into blocks of about √n and keep each block\'s sum.',
        'A range covers at most two partial blocks plus some whole blocks; an update changes one value and one block sum.',
      ],
      insight: 'Block sums balance the two operations: an update touches one block sum (O(1)), and a query adds up at most 2√n single values plus √n block sums.',
      approach: [
        'Choose a block size B ≈ √n and compute the sum of each block.',
        'Update: add (new − old) to the block sum of that index, then store the new value.',
        'Query [l, r]: if both ends are in the same block, add the values directly.',
        'Otherwise add the tail of l\'s block, the sums of the blocks strictly between, and the head of r\'s block.',
      ],
      ds: ['Array', 'Array of block sums'], time: 'O(1) update, O(√n) query', space: 'O(√n) extra',
      traps: [
        'A Fenwick tree or segment tree gives O(log n) for both operations; know when the simpler blocks are fast enough (here 3 × 10⁴ calls × ~500 steps is fine).',
        'Remember to update the stored value as well as the block sum.',
      ],
    },
    {
      id: 1409, title: 'Queries on a Permutation With Key', pattern: 'Sqrt decomposition',
      summary: 'Start with the numbers 1..m in order. For each query value, report its current position, then move it to the front.',
      hints: [
        'With m up to 1000, a direct simulation is fast enough. But the interesting question is how to do it fast for large m.',
        'Give each number a slot in a longer array with q empty slots in front. Moving to the front means taking the next free slot on the left.',
        'The position of a number is how many occupied slots come before its slot: a prefix count with updates.',
      ],
      insight: 'Moving to the front becomes "empty one slot, fill a slot further left", and a position becomes "count occupied slots before this one", which block counts (or a Fenwick tree) answer quickly.',
      approach: [
        'Use an array of q + m slots. Put number v in slot q + v − 1 and mark it occupied; remember each number\'s slot.',
        'Keep a count of occupied slots per block of about √(q + m).',
        'For a query v: its answer is the number of occupied slots before its slot (whole blocks by their counts, then single slots).',
        'Clear its old slot, place it in the next free front slot (counting down from q − 1), and update the two block counts.',
      ],
      ds: ['Occupancy array', 'Block counts', 'Slot of each number'], time: 'O(q √(q + m))', space: 'O(q + m)',
      traps: ['The output is the position before the move, counted from 0.', 'For the given limits, plain simulation in O(q · m) also passes; use it to check your faster version.'],
    },
    {
      id: 1157, title: 'Online Majority Element In Subarray', pattern: 'Sqrt decomposition',
      summary: 'Answer many queries: does some value occur at least threshold times in arr[left..right], where threshold is more than half the range length? Return that value or −1.',
      hints: [
        'Store the sorted positions of each value; counting a value inside a range is then two binary searches.',
        'Short ranges can simply be scanned. What about long ones?',
        'In a long range the answer must occur more than half the range length, so it is a value that is frequent in the whole array. There are few such values.',
      ],
      insight: 'Split by length: scan short ranges directly (Boyer–Moore vote, then verify), and for long ranges only the few globally frequent values can win, so test each with binary search on its positions.',
      approach: [
        'Build a sorted position list for every value. Let B ≈ √n, and call a value heavy if it occurs at least B times; there are at most n / B heavy values.',
        'Short query (length below 2B): run a majority vote over the range to get one candidate, then count it with binary search. Return it if the count reaches the threshold, else −1.',
        'Long query: the threshold is above B, so only heavy values can qualify. Count each heavy value in the range with binary search and return the first that reaches the threshold.',
        'If none does, return −1.',
      ],
      ds: ['Map from value to sorted positions', 'List of heavy values'], time: 'O(√n log n) per query', space: 'O(n)',
      traps: [
        'The vote only gives a candidate; always verify its count.',
        'A segment tree that merges majority-vote pairs, followed by the same binary-search check, gives O(log n) per query.',
      ],
    },

    // ---------- Position lists per value ----------
    {
      id: 2080, title: 'Range Frequency Queries', pattern: 'Position lists per value', core: true,
      summary: 'Answer many queries asking how often a given value occurs between two indices of a fixed array.',
      hints: [
        'Scanning each range is O(n) per query: too slow for 10⁵ queries.',
        'For each value, write down the indices where it appears. Those lists are sorted automatically.',
        'Count the positions that fall between left and right with two binary searches.',
      ],
      insight: 'The occurrences of one value form a sorted list of positions, so its frequency in [left, right] is (first position > right) − (first position ≥ left), two binary searches.',
      approach: [
        'Scan the array once and append each index to the list for its value, in a Map from value to positions.',
        'For a query, take the list for the value (empty if missing).',
        'Find the first position ≥ left and the first position > right with binary search.',
        'Return the difference of the two indices.',
      ],
      ds: ['Map from value to sorted array of positions', 'Binary search'], time: 'O(n) build, O(log n) per query', space: 'O(n)',
      traps: ['Use lower bound for left and upper bound for right, or you will be off by one at the edges.', 'A value that never appears must return 0, not crash.'],
    },
  ],
};
