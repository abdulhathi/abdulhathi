import type { Topic } from './types';

export const topic: Topic = {
  id: 'binary-indexed-tree',
  patterns: [
    { name: 'Prefix sums with updates', idea: 'Point update and prefix query in O(log n) each; any range is the difference of two prefixes.' },
    { name: 'Counting by value', idea: 'Scan the array and keep counts indexed by value; a prefix query counts how many values seen so far are smaller (or within a bound).' },
    { name: 'Order statistics', idea: 'With 0/1 marks in a BIT, find the k-th remaining item, or an item\'s position after earlier items were removed.' },
    { name: 'Prefix maximum for DP', idea: 'A BIT can keep prefix maximums instead of sums, as long as the stored values only ever increase.' },
    { name: 'Offline sweeps', idea: 'Sort the queries and the items by one coordinate, sweep, and use the BIT for the other coordinate.' },
  ],
  signals: [
    { see: 'Prefix or range sums with point updates in between', think: 'Binary indexed tree', why: 'Both operations are O(log n) in about ten lines of logic.' },
    { see: 'Count earlier (or later) elements that are smaller, larger or within a bound', think: 'BIT over value ranks while scanning in order', why: 'The BIT holds counts of the values seen so far.' },
    { see: 'Values up to 10⁹, or negative values', think: 'Coordinate compression to ranks first', why: 'The BIT only needs one slot per distinct value.' },
    { see: 'Find the k-th remaining element, or positions that shift as items are removed', think: 'BIT of 0/1 marks plus a binary-lifting search', why: 'Prefix counts give positions after removals.' },
    { see: 'Longest chain or best sum where each step needs a key no larger than the next', think: 'Prefix-maximum BIT over keys', why: 'The stored values only grow, which a max-BIT supports.' },
    { see: 'Pairs (i, j) with a condition that splits into f(i) ≤ g(j)', think: 'Scan one side and query the other in a BIT', why: 'Once the indices are separated, each side depends on one index only.' },
  ],
  problems: [
    // ---------- Prefix sums with updates ----------
    {
      id: 307, title: 'Range Sum Query - Mutable', pattern: 'Prefix sums with updates', core: true,
      summary: 'Support two operations on an array: change one value, and return the sum of a range.',
      hints: [
        'You need prefix sums that survive updates.',
        'tree[i] stores the sum of the block of values ending at i whose length is lowbit(i), the value of i\'s lowest 1-bit.',
        'An update climbs by adding lowbit(i); a prefix query descends by removing it.',
      ],
      insight: 'A binary indexed tree answers prefix sums and point updates in O(log n) each. sumRange(l, r) = prefix(r) − prefix(l − 1), and an update adds the difference between the new and the old value.',
      approach: [
        'Keep a copy of the array so you know the old values.',
        'Build the tree by adding every value (or in O(n) by pushing each cell into its parent).',
        'update(i, val): add val − old at i, then remember val.',
        'sumRange(l, r) = prefix(r + 1) − prefix(l), using 1-based positions.',
      ],
      ds: ['Binary indexed tree (array of n + 1)'], time: 'O(log n) per operation', space: 'O(n)',
      traps: ['The tree is 1-indexed: shift every index by one.', 'update sets a value but the BIT adds, so add the difference.'],
    },
    {
      id: 1409, title: 'Queries on a Permutation With Key', pattern: 'Prefix sums with updates',
      summary: 'Start with the permutation 1..m. For each query value, report its current position, then move it to the front.',
      hints: [
        'Simulating with an array is O(m) per query: fine for m ≤ 1000, but not in general.',
        'Leave empty slots in front, and move each queried value into a fresh slot ahead of all others.',
        'A BIT over the slots counts how many values sit before any slot.',
      ],
      insight: 'Reserve one empty slot per query in front of the values. Moving a value to the front clears its slot and fills the next free front slot, and its position is a prefix count of filled slots.',
      approach: [
        'With q queries, put value v in slot q + v, mark filled slots with 1 in a BIT, and remember each value\'s slot.',
        'Front slots are handed out from q down to 1.',
        'For a query v: answer = the count of filled slots before v\'s slot.',
        'Clear v\'s slot, give it the next front slot, and mark that slot.',
      ],
      ds: ['Binary indexed tree over slots', 'Slot of each value'], time: 'O((m + q) log(m + q))', space: 'O(m + q)',
      traps: ['Positions are 0-based in the answer.'],
    },
    {
      id: 3187, title: 'Peaks in Array', pattern: 'Prefix sums with updates',
      summary: 'A peak is an element larger than both of its neighbours; the first and last elements of a subarray can never be peaks of it. Answer queries that count peaks in a subarray, with single-value updates in between.',
      hints: [
        'Mark each index with 1 if it is a peak in the whole array.',
        'Inside [l, r] only indices strictly between l and r can be peaks: count the marks in [l + 1, r − 1].',
        'Changing nums[i] can only change the peak status of i − 1, i and i + 1.',
      ],
      insight: 'A BIT over the peak marks answers range counts, and an update re-checks just three indices and adjusts their marks.',
      approach: [
        'Compute the peak marks and build a BIT over them.',
        'Count query on [l, r]: 0 if r − l < 2, else prefix(r − 1) − prefix(l).',
        'Update at i: set nums[i], then for j in i − 1, i, i + 1 recompute the mark and add the change to the BIT.',
      ],
      ds: ['Binary indexed tree', 'Peak marks'], time: 'O((n + q) log n)', space: 'O(n)',
      traps: ['The ends of the queried subarray are never peaks, even if they are peaks in the whole array.'],
    },

    // ---------- Counting by value ----------
    {
      id: 1395, title: 'Count Number of Teams', pattern: 'Counting by value', core: true,
      summary: 'Count the teams of three soldiers i < j < k whose ratings are strictly increasing or strictly decreasing.',
      hints: [
        'Fix the middle soldier j.',
        'Count the soldiers to the left with lower and higher ratings, and the soldiers to the right with lower and higher ratings.',
        'Teams through j = leftLow × rightHigh + leftHigh × rightLow.',
      ],
      insight: 'Every team has one middle soldier. Counting smaller and larger ratings on each side of j (O(n²) directly, or O(n log n) with a BIT) gives the teams through j as two products.',
      approach: [
        'For each j: leftLow and leftHigh = earlier ratings below and above rating[j]; rightLow and rightHigh the same for later ones.',
        'Add leftLow × rightHigh + leftHigh × rightLow.',
        'With a BIT: fill it left to right for the left counts; right counts are totals minus left counts.',
      ],
      ds: ['Binary indexed tree over ratings'], time: 'O(n log n) with a BIT, O(n²) directly', space: 'O(n)',
      traps: ['Ratings are unique, so "not lower" means "higher".', 'Checking every triple is O(n³).'],
    },
    {
      id: 315, title: 'Count of Smaller Numbers After Self', pattern: 'Counting by value', core: true,
      summary: 'For every element of an array, count how many elements to its right are smaller.',
      hints: ['Scan from the right.', 'Compress the values to ranks 1..m.', 'Before adding nums[i], a prefix query up to its rank − 1 counts the smaller values already seen.'],
      insight: 'A BIT over value ranks counts the values seen so far, and scanning right to left makes them exactly the values to the right.',
      approach: [
        'Sort the distinct values and map each to its rank.',
        'For i from n − 1 down to 0: answer[i] = prefix(rank(nums[i]) − 1); then add 1 at rank(nums[i]).',
        'Return the answers.',
      ],
      ds: ['Binary indexed tree', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Equal values are not smaller: query up to rank − 1, not rank.'],
    },
    {
      id: 493, title: 'Reverse Pairs', pattern: 'Counting by value', core: true,
      summary: 'Count the pairs i < j with nums[i] > 2 × nums[j].',
      hints: [
        'Scan left to right: for each j, count the earlier values greater than 2 × nums[j].',
        'Values reach ±2³¹, so compress every value together with every doubled value.',
        'Or count during merge sort, before merging two sorted halves.',
      ],
      insight: 'With a BIT over compressed values, each j asks how many earlier values exceed 2 × nums[j]; the doubled values must be compressed alongside the values themselves.',
      approach: [
        'Collect all values and their doubles; sort and remove duplicates to get ranks.',
        'For each j: add (values seen so far) − prefix(rank of 2 × nums[j]) to the answer.',
        'Then add 1 at rank(nums[j]).',
        'Return the total.',
      ],
      ds: ['Binary indexed tree', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['2 × nums[j] overflows 32-bit integers in other languages; in TypeScript it stays exact.', 'In the merge-sort method, count with a separate pointer before merging, never during the merge.'],
    },
    {
      id: 327, title: 'Count of Range Sum', pattern: 'Counting by value',
      summary: 'Count the subarrays whose sum lies between lower and upper, inclusive.',
      hints: [
        'With prefix sums P, the subarray (i, j] sums to P[j] − P[i].',
        'For each j, count the earlier P[i] with P[j] − upper ≤ P[i] ≤ P[j] − lower.',
        'Compress all prefix sums and query a BIT for that range.',
      ],
      insight: 'Range sums become differences of prefix sums, so each j counts the earlier prefix values inside a target range: two BIT prefix queries on compressed prefix sums.',
      approach: [
        'Compute P[0..n] with P[0] = 0.',
        'Compress the P values.',
        'For each j in order: find the ranks bounding [P[j] − upper, P[j] − lower] by binary search, and count the earlier P[i] in that range with two prefix queries.',
        'Then insert P[j].',
      ],
      ds: ['Prefix sums', 'Binary indexed tree', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Insert P[0] = 0 before the first query.', 'Merge sort on the prefix sums is the other classic method.'],
    },
    {
      id: 1649, title: 'Create Sorted Array through Instructions', pattern: 'Counting by value',
      summary: 'Insert numbers one by one into a sorted container. Each insertion costs the smaller of (elements strictly smaller) and (elements strictly larger) already inside. Return the total cost modulo 10⁹ + 7.',
      hints: ['You only need counts of smaller and larger values seen so far.', 'Values are at most 10⁵: a BIT indexed by value.', 'larger = inserted so far − (values ≤ x).'],
      insight: 'A BIT over values gives "smaller than x" and "at most x" as prefix sums, so each insertion\'s cost is O(log V).',
      approach: [
        'For the insertion of x with i values already inside: smaller = prefix(x − 1), larger = i − prefix(x).',
        'Add min(smaller, larger) to the cost, modulo 10⁹ + 7.',
        'Add 1 at x.',
      ],
      ds: ['Binary indexed tree over values'], time: 'O(n log V)', space: 'O(V)',
      traps: ['Equal values are neither smaller nor larger.', 'Use the number inserted so far, not the final count, when computing larger.'],
    },
    {
      id: 2179, title: 'Count Good Triplets in an Array', pattern: 'Counting by value',
      summary: 'Two permutations of 0..n−1 are given. Count the triples of values that appear in the same left-to-right order in both arrays.',
      hints: [
        'Rewrite nums1 through the positions of its values in nums2. Then you need increasing triples in one array.',
        'Fix the middle element: count smaller elements on its left and larger elements on its right.',
        'Both counts come from a BIT.',
      ],
      insight: 'Mapping nums1 through nums2\'s positions turns "same order in both" into "increasing triple", and each middle element contributes (smaller on the left) × (larger on the right).',
      approach: [
        'pos[v] = the index of v in nums2; a[i] = pos[nums1[i]].',
        'Scan left to right with a BIT: left = prefix(a[i] − 1) counts the smaller values already seen.',
        'right = (n − 1 − a[i]) − (i − left), the larger values still to come.',
        'Add left × right, then insert a[i].',
      ],
      ds: ['Binary indexed tree', 'Position map'], time: 'O(n log n)', space: 'O(n)',
      traps: ['The count can reach about 10¹⁴: still exact in TypeScript numbers.'],
    },
    {
      id: 2426, title: 'Number of Pairs Satisfying Inequality', pattern: 'Counting by value',
      summary: 'Count the pairs i < j with nums1[i] − nums1[j] ≤ nums2[i] − nums2[j] + diff.',
      hints: [
        'Move the terms so that each side depends on one index.',
        'With d[i] = nums1[i] − nums2[i], the condition becomes d[i] ≤ d[j] + diff.',
        'Scan j and count earlier d[i] ≤ d[j] + diff with a BIT.',
      ],
      insight: 'Separating the indices turns the condition into d[i] ≤ d[j] + diff: a "count earlier values at most a bound" query on a BIT over compressed d values.',
      approach: [
        'd[i] = nums1[i] − nums2[i]; compress the distinct d values.',
        'For each j: find the number of ranks whose value is ≤ d[j] + diff, and add the prefix count up to there.',
        'Insert d[j].',
      ],
      ds: ['Binary indexed tree', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Query before inserting j.', 'The bound d[j] + diff is usually not a d value itself: use the last rank whose value is ≤ the bound.'],
    },

    // ---------- Order statistics ----------
    {
      id: 406, title: 'Queue Reconstruction by Height', pattern: 'Order statistics',
      summary: 'People are described by (height, k), where k is how many people in front of them are at least as tall. Rebuild the queue.',
      hints: [
        'Place the shortest people first: taller people do not care where shorter ones stand.',
        'When placing the shortest remaining person with count k, exactly k empty spots must stay in front for taller-or-equal people.',
        'A BIT over free spots finds the (k + 1)-th free spot.',
      ],
      insight: 'Sorting by height ascending (ties by k descending) makes each person take the (k + 1)-th still-empty position; a BIT of free spots finds it by binary lifting in O(log n).',
      approach: [
        'Sort by height ascending, ties by k descending.',
        'BIT with 1 at every free position.',
        'For each person, find the smallest position whose prefix count of free spots is k + 1, place them there, and set that position to 0.',
      ],
      ds: ['Binary indexed tree of free spots', 'Sorting'], time: 'O(n log n) with a BIT, O(n²) with list insertion', space: 'O(n)',
      traps: ['The popular short method sorts by height descending and inserts each person at index k: O(n²), fine for n ≤ 2000.', 'Equal heights count each other, so sort them by k descending in the ascending method.'],
    },
    {
      id: 1505, title: 'Minimum Possible Integer After at Most K Adjacent Swaps On Digits', pattern: 'Order statistics',
      summary: 'You may swap adjacent digits of a number at most k times. Return the smallest number you can make, as a string.',
      hints: [
        'Greedy: for the first position, bring the smallest digit you can afford.',
        'The cost of bringing a digit forward is its distance, minus the digits in front of it that were already moved out.',
        'Keep a queue of positions for each digit and a BIT of the positions already used.',
      ],
      insight: 'At each step pick the smallest digit whose current distance (original index minus the number of earlier digits already moved out) fits in k; a BIT counts the moved digits in O(log n).',
      approach: [
        'For each digit 0–9, a queue of its original positions.',
        'For each output position: try digits 0 to 9; for the front position p of that digit\'s queue, cost = p − (moved positions before p, from the BIT).',
        'Take the first digit whose cost ≤ k: subtract the cost, output the digit, pop p and mark it in the BIT.',
        'Return the output.',
      ],
      ds: ['Queues per digit', 'Binary indexed tree'], time: 'O(10 × n log n)', space: 'O(n)',
      traps: ['Simulating swaps on the string is O(n²) or worse.', 'k can be up to 10⁹; the greedy simply stops being limited once k covers everything.'],
    },

    // ---------- Prefix maximum for DP ----------
    {
      id: 1964, title: 'Find the Longest Valid Obstacle Course at Each Position', pattern: 'Prefix maximum for DP', core: true,
      summary: 'For each position, find the length of the longest non-decreasing subsequence of obstacle heights that ends exactly at that position.',
      hints: [
        'It is a longest non-decreasing subsequence, asked at every index.',
        'Tails array: binary search for the first tail strictly greater than the current height.',
        'Or a BIT of prefix maximums over compressed heights.',
      ],
      insight: 'For non-decreasing sequences, the answer at i is 1 + (the longest chain ending with a height ≤ obstacles[i]): a prefix-maximum query on a BIT over heights, or an upper-bound search in the tails array.',
      approach: [
        'Compress the heights to ranks.',
        'For each obstacle: best = the prefix maximum up to its rank; answer[i] = best + 1.',
        'Update its rank with answer[i], keeping the maximum.',
      ],
      ds: ['Prefix-maximum BIT', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Non-decreasing: equal heights may follow each other, so query ranks up to and including the current one (upper bound in the tails version).'],
    },
    {
      id: 2926, title: 'Maximum Balanced Subsequence Sum', pattern: 'Prefix maximum for DP',
      summary: 'A subsequence with indices i₁ < i₂ < … is balanced if each step satisfies nums[iₖ] − nums[iₖ₋₁] ≥ iₖ − iₖ₋₁. Return the largest sum of a balanced subsequence.',
      hints: [
        'Rewrite the condition as nums[iₖ] − iₖ ≥ nums[iₖ₋₁] − iₖ₋₁.',
        'So the keys nums[i] − i must never decrease along the subsequence.',
        'dp[i] = nums[i] + max(0, best dp with key ≤ key(i)): a prefix-maximum BIT over compressed keys.',
      ],
      insight: 'With key(i) = nums[i] − i the balance rule says keys never decrease, so it is a best-sum non-decreasing subsequence over keys, answered with a prefix-maximum BIT.',
      approach: [
        'Compress the keys nums[i] − i.',
        'For each i: prev = the prefix maximum up to its key\'s rank; dp = nums[i] + max(0, prev).',
        'Update the BIT at that rank with dp, and track the best dp.',
        'Return the best, which is the largest single value when everything is negative.',
      ],
      ds: ['Prefix-maximum BIT', 'Coordinate compression'], time: 'O(n log n)', space: 'O(n)',
      traps: ['A single element is always balanced, so an all-negative array returns its maximum.', 'Never add a negative previous sum: take max with 0.'],
    },

    // ---------- Offline sweeps ----------
    {
      id: 2250, title: 'Count Number of Rectangles Containing Each Point', pattern: 'Offline sweeps',
      summary: 'Rectangles have a corner at the origin with length l and height h (h ≤ 100). For each point, count the rectangles that contain it.',
      hints: [
        'A point (x, y) is inside if l ≥ x and h ≥ y.',
        'Heights are small: group rectangles by height and sort the lengths in each group.',
        'Or offline: sort the points by y descending and add rectangles with h ≥ y into a BIT over lengths.',
      ],
      insight: 'Process points from the highest y down, inserting rectangles as their heights qualify; a BIT over compressed lengths then counts the lengths ≥ x for each point.',
      approach: [
        'Sort rectangles by height descending and points by y descending, keeping each point\'s original index.',
        'For each point, insert every rectangle with h ≥ y into the BIT at its length\'s rank.',
        'answer = inserted so far − (inserted lengths < x), using a prefix query.',
        'Write the answers back in the original order.',
      ],
      ds: ['Sorting', 'Binary indexed tree', 'Coordinate compression'], time: 'O((r + p) log r)', space: 'O(r + p)',
      traps: ['With h ≤ 100, per-height buckets with binary search are simpler; the offline BIT works without that limit.'],
    },
  ],
};
