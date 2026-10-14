import type { Topic } from './types';

export const topic: Topic = {
  id: 'segment-tree',
  patterns: [
    { name: 'Point update, range query', idea: 'Each node keeps a summary (sum, minimum, maximum) of its range; an update fixes one root-to-leaf path, a query combines O(log n) nodes.' },
    { name: 'Custom summaries', idea: 'Any summary that two halves can merge in O(1) works: runs of equal characters, majority candidates, counts with lengths.' },
    { name: 'Tree over values', idea: 'Index the tree by value instead of by position, and ask "how many, or the best, among values in a range" while you scan.' },
    { name: 'Lazy propagation', idea: 'Apply a range update to whole covered nodes and leave a pending tag; push it to the children only when a later operation passes through.' },
    { name: 'Huge coordinates', idea: 'When positions reach 10⁹, create nodes only when they are touched, or compress the coordinates that actually appear.' },
    { name: 'Versions', idea: 'Keep old versions by copying only what changes and sharing the rest: the idea behind persistent data structures.' },
  ],
  signals: [
    { see: 'Many range queries with updates in between', think: 'Segment tree (or a binary indexed tree for plain sums)', why: 'Both operations drop from O(n) to O(log n).' },
    { see: 'Range minimum, maximum, or any summary two halves can combine', think: 'Segment tree with that summary', why: 'Any associative merge works: sum, min, max, gcd, runs, majority candidates.' },
    { see: 'Update a whole range at once: add, assign or flip', think: 'Lazy propagation', why: 'Covered nodes take the change; their children are updated only when visited.' },
    { see: 'Coordinates up to 10⁹ but only thousands of operations', think: 'Dynamic segment tree or coordinate compression', why: 'Only the touched coordinates need nodes.' },
    { see: '"The first position whose value is at least x"', think: 'Descend a max segment tree', why: 'A child\'s maximum tells you whether the answer lies inside it.' },
    { see: 'Queries about the past: versions or snapshots', think: 'Persistence: copy only what changes', why: 'Unchanged parts can be shared between versions.' },
  ],
  problems: [
    // ---------- Point update, range query ----------
    {
      id: 307, title: 'Range Sum Query - Mutable', pattern: 'Point update, range query', core: true,
      summary: 'Support two operations on an array: change one value, and return the sum of a range.',
      hints: [
        'Prefix sums answer ranges in O(1), but one update costs O(n).',
        'Store the sums of halves, quarters, eighths… in a tree.',
        'An update changes one node per level; a range query needs at most two partial nodes per level.',
      ],
      insight: 'A segment tree keeps the sum of every node\'s range, so an update touches the O(log n) nodes above one leaf and a query combines O(log n) whole nodes.',
      approach: [
        'Build: each leaf holds one value; each internal node holds the sum of its two children.',
        'Update: change the leaf, then recompute every ancestor from its children.',
        'Query [l, r]: starting at the root, return a node\'s sum if its range lies inside [l, r], 0 if it lies outside, and otherwise the sum of both children\'s answers.',
      ],
      ds: ['Segment tree (array of 2n or 4n slots)'], time: 'O(log n) per operation, O(n) to build', space: 'O(n)',
      traps: ['A binary indexed tree solves this in fewer lines; the segment tree generalises to min, max and custom summaries.', 'Use 4n slots for the recursive layout, or 2n for the iterative bottom-up one.'],
    },
    {
      id: 3479, title: 'Fruits Into Baskets III', pattern: 'Point update, range query', core: true,
      summary: 'Fruits are placed in order. Each goes into the leftmost unused basket whose capacity is at least the fruit\'s quantity, if one exists. Count the fruits that cannot be placed.',
      hints: [
        'For each fruit you need the leftmost basket with capacity ≥ x.',
        'A segment tree of maximum capacities tells you whether such a basket exists inside any range.',
        'Walk down from the root, going left whenever the left child\'s maximum is big enough.',
      ],
      insight: 'A max segment tree finds the leftmost value ≥ x by descending: left if the left child\'s maximum suffices, otherwise right. Then set that basket to 0 so it is never used again.',
      approach: [
        'Build a max segment tree over the basket capacities.',
        'For each fruit x: if the root\'s maximum is below x, count the fruit as unplaced.',
        'Otherwise descend to the leftmost leaf with capacity ≥ x, set it to 0, and update the maximums on the way back up.',
      ],
      ds: ['Max segment tree'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Scanning the baskets for every fruit is O(n²) for n = 10⁵.', 'Fruits Into Baskets II (3477) is the small version where the scan is fine.'],
    },
    {
      id: 2940, title: 'Find Building Where Alice and Bob Can Meet', pattern: 'Point update, range query',
      summary: 'From building i you can move to any later building that is strictly taller. For each query (a, b), return the leftmost building where Alice (starting at a) and Bob (starting at b) can both end up, or −1.',
      hints: [
        'If a equals b, or the right one of the two is taller than the left one, the answer is the right one.',
        'Otherwise you need the leftmost index after max(a, b) that is taller than both buildings.',
        'A max segment tree finds the first index after a position whose height exceeds h.',
      ],
      insight: 'Each query reduces to "first index after hi with height > max(heights[a], heights[b])", which a descent on a max segment tree answers in O(log n).',
      approach: [
        'Build a max segment tree over the heights.',
        'For a query, lo = min(a, b), hi = max(a, b). If a = b or heights[hi] > heights[lo], answer hi.',
        'Otherwise search the tree for the leftmost index > hi whose height exceeds max(heights[a], heights[b]), or −1 if there is none.',
      ],
      ds: ['Max segment tree'], time: 'O((n + q) log n)', space: 'O(n)',
      traps: ['Equal heights do not allow a move: it must be strictly taller.', 'An offline solution with sorted queries and a monotonic stack also works.'],
    },
    {
      id: 2286, title: 'Booking Concert Tickets in Groups', pattern: 'Point update, range query',
      summary: 'A hall has n rows of m seats. gather(k, maxRow) seats k people together in one row up to maxRow (lowest row, then lowest seat). scatter(k, maxRow) seats k people anywhere in rows up to maxRow, filling the lowest rows and seats first. Each reports whether it succeeded.',
      hints: [
        'Seats in a row fill from the left, so a row is described by how many seats are taken.',
        'gather needs the first row up to maxRow with at least k free seats: a max segment tree over free seats.',
        'scatter needs the total free seats in rows 0..maxRow: a sum over the same tree.',
      ],
      insight: 'One tree storing both the maximum and the sum of free seats answers gather by descending to the first row with enough room, and scatter with a range sum followed by filling rows from the first non-full one.',
      approach: [
        'Leaves hold the free seats of each row (m at first); internal nodes hold the max and the sum.',
        'gather: if the max over [0, maxRow] is below k, fail. Otherwise descend to the leftmost row with free ≥ k, report (row, m − free), and subtract k.',
        'scatter: if the sum over [0, maxRow] is below k, fail. Otherwise fill rows starting from a pointer to the first non-full row, emptying full rows and partly filling the last one.',
        'Each row becomes full at most once, so scatter is amortised O(log n) per row.',
      ],
      ds: ['Segment tree with max and sum', 'Pointer to the first non-full row'], time: 'O((n + q) log n) amortised', space: 'O(n)',
      traps: ['m and k reach 10⁹ and sums reach 5 × 10¹³: still exact in TypeScript numbers.', 'Restarting the fill from row 0 every time is too slow; keep the pointer.'],
    },

    // ---------- Custom summaries ----------
    {
      id: 2213, title: 'Longest Substring of One Repeating Character', pattern: 'Custom summaries',
      summary: 'A string receives single-character updates. After each update, report the length of the longest run of one repeated character.',
      hints: [
        'The best run lies in the left half, in the right half, or across the middle.',
        'So each node stores its longest prefix run, longest suffix run, best run, and its first and last characters.',
        'Merging joins the left suffix run with the right prefix run when the two boundary characters match.',
      ],
      insight: 'A segment tree whose summary is (prefix run, suffix run, best run, end characters) merges two halves in O(1), so each update and the global answer cost O(log n).',
      approach: [
        'Leaf: all three runs are 1.',
        'Merge(L, R): prefix = L.prefix, extended by R.prefix if the whole of L is one run and the boundary matches; suffix similarly from the right; best = max(L.best, R.best, L.suffix + R.prefix when the boundary matches).',
        'After each update recompute the path to the root; the answer is the root\'s best.',
      ],
      ds: ['Segment tree with a custom summary'], time: 'O((n + q) log n)', space: 'O(n)',
      traps: ['The prefix run may only extend into the right half when the entire left half is one run.'],
    },
    {
      id: 1157, title: 'Online Majority Element In Subarray', pattern: 'Custom summaries',
      summary: 'Answer queries asking which value appears at least threshold times in arr[left..right], where threshold is more than half the range length; return −1 if none does.',
      hints: [
        'A majority element can be found by Boyer–Moore voting: keep a candidate and a count.',
        'Two voting results can be merged: equal candidates add their counts, different candidates cancel out.',
        'Then check the candidate\'s real frequency with binary search in its sorted list of positions.',
      ],
      insight: 'Boyer–Moore summaries merge, so a segment tree returns the only possible majority candidate for any range in O(log n); two binary searches on that value\'s positions check the threshold.',
      approach: [
        'Build a segment tree where each node stores (candidate, count): equal candidates add counts, different ones keep the larger and subtract the smaller.',
        'For each value, store the sorted list of its positions.',
        'Query: get the candidate for [left, right] and count its occurrences there with two binary searches.',
        'Return the candidate if the count ≥ threshold, else −1.',
      ],
      ds: ['Segment tree of (candidate, count)', 'Position lists', 'Binary search'], time: 'O(log n) per query', space: 'O(n)',
      traps: ['The tree\'s answer is only a candidate: always verify its count.', 'Random sampling also works, because the majority fills more than half the range.'],
    },

    // ---------- Tree over values ----------
    {
      id: 673, title: 'Number of Longest Increasing Subsequence', pattern: 'Tree over values',
      summary: 'Count how many longest strictly increasing subsequences an array has.',
      hints: [
        'The O(n²) DP keeps (length, count) for each index.',
        'Faster: a segment tree over values storing (best length, number of ways) for each range of values.',
        'Merging two summaries keeps the longer length and adds the counts on a tie.',
      ],
      insight: 'Each node keeps (longest length, number of ways). Querying the values below x returns the best chain to extend and how many ways reach it, so the counting DP becomes O(n log n).',
      approach: [
        'Compress the values to ranks.',
        'For each x in order: query the ranks below x for (len, ways); the new entry is (len + 1, ways), or (1, 1) if len is 0.',
        'Insert it at x\'s rank, merging with what is there: longer wins, equal lengths add their ways.',
        'The root\'s summary gives (longest length, count).',
      ],
      ds: ['Segment tree over value ranks', 'Coordinate compression'], time: 'O(n log n), or O(n²) with the plain DP', space: 'O(n)',
      traps: ['With n ≤ 2000 the O(n²) DP is the expected solution; the tree shows how summaries with counts merge.'],
    },
    {
      id: 315, title: 'Count of Smaller Numbers After Self', pattern: 'Tree over values', core: true,
      summary: 'For every element of an array, count how many elements to its right are smaller.',
      hints: [
        'Scan from right to left, so that "to the right" means "already seen".',
        'Keep a count for every value seen so far, in a tree indexed by value.',
        'A range-sum query over the values below the current one gives its answer.',
      ],
      insight: 'Indexing the tree by value turns "how many smaller numbers have I seen?" into a prefix sum. Values lie in −10⁴..10⁴, so shift them to start at 0 (or compress them).',
      approach: [
        'Shift the values so the smallest possible one maps to 0 (or compress to ranks).',
        'Scan from the right: answer[i] = the sum of counts over values smaller than nums[i].',
        'Then add 1 at nums[i]\'s position.',
        'Return the answers.',
      ],
      ds: ['Segment tree (or BIT) over values'], time: 'O(n log V)', space: 'O(V)',
      traps: ['Comparing every pair is O(n²) = 10¹⁰.', 'Merge sort with index tracking is the other O(n log n) classic.'],
    },
    {
      id: 2407, title: 'Longest Increasing Subsequence II', pattern: 'Tree over values', core: true,
      summary: 'Find the longest strictly increasing subsequence in which consecutive elements differ by at most k.',
      hints: [
        'Let best[v] be the longest valid subsequence that ends with the value v.',
        'For a new value v, the previous element must lie in [v − k, v − 1].',
        'That is a range maximum over values: a segment tree indexed by value.',
      ],
      insight: 'Scan the array keeping best[value] in a max segment tree. Each element sets best[v] = 1 + the maximum over values v − k..v − 1, one O(log V) range query.',
      approach: [
        'Build a max segment tree over the values 1..max(nums), all 0.',
        'For each v in order: q = the maximum over [max(1, v − k), v − 1]; set best[v] = q + 1.',
        'Track the largest value set and return it.',
      ],
      ds: ['Max segment tree over values'], time: 'O(n log V)', space: 'O(V)',
      traps: ['The classic tails-array LIS cannot express the "difference at most k" rule.', 'Values are at most 10⁵, so the tree can be indexed by value directly without compression.'],
    },

    // ---------- Lazy propagation ----------
    {
      id: 2569, title: 'Handling Sum Queries After Update', pattern: 'Lazy propagation', core: true,
      summary: 'nums1 holds 0s and 1s. Queries either flip a range of nums1, add p × nums1[i] to every nums2[i], or ask for the sum of nums2.',
      hints: [
        'The second query type only needs the number of 1s currently in nums1.',
        'So keep the sum of nums2 as one number, and a structure that counts 1s under range flips.',
        'A segment tree with a lazy "flip" tag: flipping a node turns its count into length − count.',
      ],
      insight: 'Only the global count of ones matters for the add query, so a lazy segment tree with range flip and a count at the root is enough; nums2\'s sum is a single running total.',
      approach: [
        'Build a segment tree counting the 1s of nums1.',
        'Flip [l, r]: a covered node sets count = length − count and toggles its flip tag; push tags down before entering children.',
        'Add query: increase the total by p × (count at the root).',
        'Sum query: report the total.',
      ],
      ds: ['Segment tree with lazy flip tags', 'BigInt running total'], time: 'O(log n) per flip, O(1) for the others', space: 'O(n)',
      traps: ['The total can exceed 2⁵³ (about 9 × 10¹⁵): keep it in a BigInt.', 'Two pending flips cancel out: toggle the tag rather than setting it.'],
    },

    // ---------- Huge coordinates ----------
    {
      id: 729, title: 'My Calendar I', pattern: 'Huge coordinates',
      summary: 'Book half-open time intervals [start, end) on a calendar, rejecting any booking that overlaps an existing one.',
      hints: [
        'With at most 1000 bookings, comparing against every existing booking works.',
        'Faster: keep bookings sorted and compare only with the neighbours.',
        'A dynamic segment tree over 0..10⁹ can also answer "is anything booked in this range?".',
      ],
      insight: 'An overlap with [s, e) can only come from the booking just before s or just after it, so a sorted structure (or a dynamic segment tree) answers it in O(log n).',
      approach: [
        'Keep bookings sorted by start.',
        'Find the booking with the largest start ≤ s and the one with the smallest start ≥ s.',
        'Reject if the first ends after s or the second starts before e; otherwise insert.',
      ],
      ds: ['Sorted array or ordered set'], time: 'O(log n) to search, plus O(n) to insert into a sorted array', space: 'O(n)',
      traps: ['Intervals are half-open: [10, 20) and [20, 30) do not overlap.', 'TypeScript has no built-in sorted map; a sorted array with binary search is fine for 1000 bookings.'],
    },
    {
      id: 731, title: 'My Calendar II', pattern: 'Huge coordinates',
      summary: 'Like My Calendar I, but reject a booking only if it would create a triple booking: three events overlapping at some moment.',
      hints: [
        'Keep two lists: all bookings, and the overlaps between pairs of bookings (the double-booked ranges).',
        'A new booking is rejected if it overlaps any double-booked range.',
        'A dynamic segment tree with range add and range maximum is the general tool.',
      ],
      insight: 'A triple booking happens exactly when the new range hits an already double-booked range. Keeping the list of overlaps makes the check simple; a lazy dynamic segment tree (range add, max ≤ 2) generalises it.',
      approach: [
        'Keep bookings and doubles.',
        'If [s, e) overlaps any double, reject.',
        'Otherwise add the overlap of [s, e) with each booking to doubles, then add [s, e) to bookings.',
      ],
      ds: ['Two lists of intervals'], time: 'O(n) per booking', space: 'O(n)',
      traps: ['The overlap of [a, b) and [c, d) is [max(a, c), min(b, d)) when that is not empty.'],
    },
    {
      id: 732, title: 'My Calendar III', pattern: 'Huge coordinates', core: true,
      summary: 'After each booking [start, end), return the largest number of bookings that overlap at any single moment so far.',
      hints: [
        'Think +1 at start and −1 at end; the answer is the largest prefix sum.',
        'With 400 bookings, a sorted difference map rescanned each time is fine.',
        'A dynamic segment tree with range add and a global maximum does it in O(log C) per booking.',
      ],
      insight: 'Each booking adds 1 to every point of [start, end). A lazy segment tree over 0..10⁹ that creates nodes only when they are touched keeps the overall maximum at its root.',
      approach: [
        'Dynamic segment tree: each node covers a range and stores a maximum and a pending add; children are created on demand.',
        'book(s, e): add 1 over [s, e − 1].',
        'Return the root\'s maximum.',
      ],
      ds: ['Dynamic segment tree with lazy add', 'or a sorted difference map'], time: 'O(log C) per booking, C = 10⁹', space: 'O(n log C)',
      traps: ['An array over 10⁹ positions is impossible: create nodes lazily, or compress coordinates offline.', 'The end is exclusive: update [start, end − 1].'],
    },
    {
      id: 715, title: 'Range Module', pattern: 'Huge coordinates',
      summary: 'Track a set of half-open ranges: add a range, remove a range, and ask whether a range is completely tracked.',
      hints: [
        'Store disjoint intervals sorted by start.',
        'Adding and removing merge or split the intervals they touch.',
        'A dynamic segment tree with "assign tracked / untracked" lazy tags is the alternative.',
      ],
      insight: 'A sorted list of disjoint intervals reduces every operation to finding the intervals it touches; with a balanced ordered structure each costs O(log n) plus the intervals removed.',
      approach: [
        'Keep the intervals sorted and non-overlapping.',
        'addRange: remove every interval that overlaps or touches [l, r), and insert their union with [l, r).',
        'removeRange: cut the overlapping intervals, keeping the parts left of l and right of r.',
        'queryRange: find the interval with the largest start ≤ l and check that it reaches r.',
      ],
      ds: ['Sorted list of disjoint intervals', 'or a dynamic segment tree'], time: 'O(log n) amortised with an ordered set (O(n) with a sorted array)', space: 'O(n)',
      traps: ['Touching ranges [1, 3) and [3, 5) should merge when added.', 'A removal can split one interval into two.'],
    },
    {
      id: 2276, title: 'Count Integers in Intervals', pattern: 'Huge coordinates',
      summary: 'Support add(left, right), adding a closed interval of integers, and count(), the number of distinct integers covered by at least one interval.',
      hints: [
        'Keep disjoint intervals and a running total of covered integers.',
        'When adding, swallow every interval the new one overlaps and adjust the total.',
        'A dynamic segment tree with "set covered" lazy tags also works.',
      ],
      insight: 'Merging into a sorted set of disjoint intervals keeps the count exact, and each interval is inserted once and removed at most once, so the work is amortised O(log n) per call.',
      approach: [
        'Keep disjoint intervals sorted by start, and a total.',
        'add(l, r): while some interval overlaps [l, r], remove it, subtract its size, and widen l and r to cover it.',
        'Insert [l, r] and add r − l + 1 to the total.',
        'count() returns the total.',
      ],
      ds: ['Ordered set of intervals', 'or a dynamic segment tree'], time: 'O(log n) amortised', space: 'O(n)',
      traps: ['These intervals are closed: [1, 2] and [3, 4] do not overlap (merging them would still count correctly, but be consistent).'],
    },
    {
      id: 699, title: 'Falling Squares', pattern: 'Huge coordinates',
      summary: 'Squares fall one at a time onto a line and land either on the ground or on top of earlier squares they overlap. After each square lands, report the height of the tallest stack.',
      hints: [
        'A square lands at the maximum height over its x-range, plus its own side.',
        'Then that whole range becomes the new height.',
        'Range maximum plus range assignment: a lazy segment tree over compressed x coordinates.',
      ],
      insight: 'Each drop is a range-maximum query followed by a range assignment over [left, left + side), done in O(log n) with a lazy segment tree on compressed coordinates (or O(n²) by comparing with every earlier square).',
      approach: [
        'Collect every left and left + side, then sort and compress them.',
        'For each square: h = the maximum over its compressed range (right end exclusive) + side.',
        'Assign h over that range with a lazy tag, and update the running maximum.',
        'Report the running maximum after each square.',
      ],
      ds: ['Coordinate compression', 'Lazy segment tree (range max, range assign)'], time: 'O(n log n), or O(n²) simply', space: 'O(n)',
      traps: ['Squares that only touch at an edge do not stack: treat the right end as exclusive.', 'With n ≤ 1000 the O(n²) comparison passes; the tree is the general method.'],
    },
    {
      id: 850, title: 'Rectangle Area II', pattern: 'Huge coordinates',
      summary: 'Return the total area covered by a set of axis-aligned rectangles, counting overlapping parts once, modulo 10⁹ + 7.',
      hints: [
        'Sweep a vertical line across x. Between two events the covered length along y stays the same.',
        'Events: +1 on [y1, y2) at x1, and −1 at x2.',
        'A segment tree over compressed y keeps a cover count per node and the total covered length.',
      ],
      insight: 'A sweep line plus a segment tree over compressed y values: each node keeps how many rectangles cover it fully and its covered length, and the area grows by covered length × the gap to the next event.',
      approach: [
        'Compress all y values; create events (x, y1, y2, ±1) sorted by x.',
        'Between consecutive event x values, add (covered length) × (x gap) to the area.',
        'Apply each event: a node with a positive count is fully covered; otherwise its covered length is the sum of its children\'s.',
        'Return the area modulo 10⁹ + 7.',
      ],
      ds: ['Sweep line events', 'Segment tree over compressed y', 'BigInt products'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Length × width reaches 10¹⁸, beyond exact TypeScript numbers: multiply with BigInt.', 'This tree never pushes anything down: counts stay on the nodes that received them.'],
    },

    // ---------- Versions ----------
    {
      id: 1146, title: 'Snapshot Array', pattern: 'Versions', core: true,
      summary: 'Build an array-like structure that supports set(index, value), snap() (which returns a snapshot id), and get(index, snap_id), the value at that index when that snapshot was taken.',
      hints: [
        'Copying the whole array at every snap is O(length) per snap: too slow.',
        'Store, for each index, only its changes: a list of (snap id, value) pairs.',
        'get is a binary search in that index\'s list for the last change at or before snap_id.',
      ],
      insight: 'Keep a version history per index. Old versions are never copied, only appended to, which is the core idea of persistent data structures.',
      approach: [
        'history[i] starts as [(0, 0)]; the current snap id is 0.',
        'set(i, v): if the last entry of history[i] has the current snap id, overwrite its value; otherwise append (snap id, v).',
        'snap(): return the current snap id, then increase it.',
        'get(i, id): binary search history[i] for the last entry with snap id ≤ id and return its value.',
      ],
      ds: ['Array of version lists', 'Binary search'], time: 'O(1) for set and snap, O(log s) for get', space: 'O(number of changes)',
      traps: ['Several sets between two snaps should leave only the last value for that snap.', 'A persistent segment tree generalises this: each update copies only the O(log n) nodes on its path and shares the rest with older versions.'],
    },
  ],
};
