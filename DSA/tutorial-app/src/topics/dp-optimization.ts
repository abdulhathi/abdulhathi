import type { Topic } from './types';

export const topic: Topic = {
  id: 'dp-optimization',
  patterns: [
    { name: 'Monotonic deque', idea: 'When dp[i] takes the best of the last k dp values, keep those candidates in a deque whose front is always the best.' },
    { name: 'Running window sums', idea: 'When dp[i] adds up a contiguous range of earlier values, keep a running window sum instead of re-adding the range.' },
    { name: 'Sort and binary search', idea: 'When the previous compatible state is found by comparing values, sort once and binary search instead of scanning back.' },
    { name: 'Monotone split points', idea: 'When the best split point only moves one way as the range grows, search between the neighbours\' best split points (Knuth, divide and conquer).' },
    { name: 'Lines and the convex hull trick', idea: 'When the transition is a minimum over j of (slope_j × x_i + intercept_j), store the lines in a hull or a Li Chao tree.' },
  ],
  signals: [
    { see: 'A correct DP that is too slow by a factor of n or k', think: 'Look at the shape of the transition', why: 'The speed-up depends on what the transition takes a min, max or sum over.' },
    { see: 'dp[i] = best of dp over the last k indices', think: 'Monotonic deque', why: 'It gives the sliding window maximum in O(1) amortised.' },
    { see: 'dp[i] = sum over a contiguous range of earlier dp values', think: 'Running window sum (prefix sums)', why: 'Each range sum becomes one addition and one subtraction.' },
    { see: 'Jobs or intervals: "the last item that does not clash with this one"', think: 'Sort by end time, then binary search', why: 'After sorting, the compatible items form a prefix.' },
    { see: 'dp[i] = min over j of (a_j × x_i + b_j)', think: 'Convex hull trick or Li Chao tree', why: 'Each j is a line, and you ask for the lowest line at x_i.' },
    { see: 'An interval or partition DP whose best split point moves monotonically', think: 'Knuth or divide and conquer optimisation', why: 'Searching only between the neighbours\' best split points removes a factor of n.' },
  ],
  problems: [
    // ---------- Monotonic deque ----------
    {
      id: 1696, title: 'Jump Game VI', pattern: 'Monotonic deque', core: true,
      summary: 'Start at index 0 and jump forward at most k steps at a time until you reach the last index. Your score is the sum of the values you land on. Maximise it.',
      hints: [
        'dp[i] = nums[i] + max(dp[i−k], …, dp[i−1]).',
        'Recomputing that maximum every time is O(n × k), up to 10¹⁰.',
        'Keep a deque of indices whose dp values decrease from front to back.',
      ],
      insight: 'The best earlier dp value in the window always sits at the front of a monotonic deque: drop indices that leave the window from the front, and dominated ones from the back.',
      approach: [
        'dp[0] = nums[0]; deque = [0].',
        'For i from 1: pop the front while it is older than i − k.',
        'dp[i] = nums[i] + dp[front].',
        'Pop from the back while dp[back] ≤ dp[i], then push i.',
        'Return dp[n−1].',
      ],
      ds: ['Deque of indices', 'DP array'], time: 'O(n)', space: 'O(n)',
      traps: ['A max-heap also works in O(n log n) but needs lazy removal of old indices.', 'Array.prototype.shift is O(n) in JavaScript: keep a head index for the deque front.'],
    },
    {
      id: 1425, title: 'Constrained Subsequence Sum', pattern: 'Monotonic deque', core: true,
      summary: 'Choose a non-empty subsequence in which consecutive chosen indices are at most k apart, maximising its sum.',
      hints: [
        'dp[i] = the best sum of a valid subsequence that ends at i.',
        'dp[i] = nums[i] + max(0, best dp among the previous k indices): starting fresh is allowed.',
        'That window maximum is a monotonic deque again.',
      ],
      insight: 'It is Jump Game VI, except a subsequence may start anywhere, so a negative window maximum is replaced by 0.',
      approach: [
        'For each i: drop deque fronts older than i − k.',
        'dp[i] = nums[i] + max(0, dp[front]) (just nums[i] if the deque is empty).',
        'Pop backs with dp ≤ dp[i], push i, and track the best dp.',
        'Return the best.',
      ],
      ds: ['Deque of indices', 'DP array'], time: 'O(n)', space: 'O(n)',
      traps: ['The subsequence must be non-empty: with all-negative numbers the answer is the largest single value, not 0.'],
    },
    {
      id: 1499, title: 'Max Value of Equation', pattern: 'Monotonic deque',
      summary: 'Points are sorted by x. Find the largest value of yi + yj + |xi − xj| over pairs whose x values differ by at most k.',
      hints: [
        'For i < j the expression is (yi − xi) + (yj + xj).',
        'For each j you need the largest yi − xi among earlier points within distance k.',
        'That is a sliding window maximum.',
      ],
      insight: 'Rewrite the score so that one part depends only on the earlier point. Then a monotonic deque of yi − xi over the window xj − xi ≤ k gives every j its best partner.',
      approach: [
        'Scan points in order with a deque of earlier indices whose y − x values decrease.',
        'Drop fronts whose x is more than k below xj.',
        'If the deque is not empty, update the answer with yj + xj + the front\'s (y − x).',
        'Pop backs with y − x ≤ yj − xj, then push j.',
      ],
      ds: ['Deque of indices'], time: 'O(n)', space: 'O(n)',
      traps: ['Query before pushing j, so a point is never paired with itself.'],
    },

    // ---------- Running window sums ----------
    {
      id: 1871, title: 'Jump Game VII', pattern: 'Running window sums',
      summary: 'From index i of a binary string you may jump to any index j in [i + minJump, i + maxJump] where s[j] is "0". Decide whether you can reach the last index from index 0.',
      hints: ['reach[i] is true if some reachable index lies in [i − maxJump, i − minJump].', 'Checking that whole range for every i is O(n²).', 'Keep a running count of reachable indices inside that sliding range.'],
      insight: 'A sliding count of reachable indices answers "is any index in the range reachable?" in O(1), turning the O(n × range) DP into O(n).',
      approach: [
        'reach[0] = true; count = 0.',
        'For each i from 1: if i − minJump ≥ 0 and reach[i − minJump] is true, increase count by 1.',
        'If i − maxJump − 1 ≥ 0 and reach[i − maxJump − 1] is true, decrease count by 1.',
        'reach[i] = (s[i] is "0") and count > 0.',
        'Return reach[n−1].',
      ],
      ds: ['Boolean array', 'Running counter'], time: 'O(n)', space: 'O(n)',
      traps: ['Add the index entering the range (i − minJump) and remove the one leaving it (i − maxJump − 1); off-by-one errors here are common.'],
    },
    {
      id: 837, title: 'New 21 Game', pattern: 'Running window sums', core: true,
      summary: 'Alice starts with 0 points and keeps drawing a number uniformly from 1 to maxPts while her total is below k. Return the probability that she finishes with at most n points.',
      hints: [
        'Let dp[x] be the probability that her total is ever exactly x.',
        'dp[x] = (the sum of dp[x − maxPts..x − 1] over totals that were still below k) / maxPts.',
        'Keep that window sum as you go instead of re-adding it.',
      ],
      insight: 'Each probability is the average of a sliding window of earlier probabilities (only totals below k still draw), so a running window sum gives O(n) instead of O(n × maxPts).',
      approach: [
        'If k is 0 or n ≥ k − 1 + maxPts, return 1.',
        'dp[0] = 1, windowSum = 1, answer = 0.',
        'For x from 1 to n: dp[x] = windowSum / maxPts. If x < k add dp[x] to windowSum, otherwise add it to answer.',
        'If x − maxPts ≥ 0 and x − maxPts < k, subtract dp[x − maxPts] from windowSum.',
        'Return answer.',
      ],
      ds: ['Probability array', 'Running window sum'], time: 'O(n)', space: 'O(n)',
      traps: ['Totals of k or more stop drawing, so they never join the window.', 'The answer is a floating-point number accepted within 10⁻⁵.'],
    },
    {
      id: 1155, title: 'Number of Dice Rolls With Target Sum', pattern: 'Running window sums',
      summary: 'Count the ways to roll n dice with k faces each so that the faces add up to target, modulo 10⁹ + 7.',
      hints: ['dp[d][s] = the number of ways for d dice to total s.', 'dp[d][s] = dp[d−1][s−1] + … + dp[d−1][s−k].', 'That range sum can be a running window over the previous row.'],
      insight: 'Each transition sums a contiguous window of the previous row, so a running window sum makes each row O(target) instead of O(target × k).',
      approach: [
        'prev[0] = 1.',
        'For each die, build the next row: keep a window sum, adding prev[s−1] and removing prev[s−k−1] as s grows.',
        'next[s] = the window sum modulo 10⁹ + 7.',
        'Return the last row at target.',
      ],
      ds: ['Two DP rows', 'Running window sum'], time: 'O(n × target)', space: 'O(target)',
      traps: ['With n, k ≤ 30 the plain O(n × target × k) also passes; the window is the reusable idea.', 'Keep window sums non-negative after the modular subtraction.'],
    },
    {
      id: 629, title: 'K Inverse Pairs Array', pattern: 'Running window sums', core: true,
      summary: 'Count the arrangements of the numbers 1..n that have exactly k inverse pairs (pairs in the wrong order), modulo 10⁹ + 7.',
      hints: [
        'Insert the largest number n into an arrangement of 1..n−1: placing it j positions from the end creates exactly j new inverse pairs.',
        'So dp[n][k] = dp[n−1][k] + dp[n−1][k−1] + … + dp[n−1][k−n+1].',
        'That is a sliding window over the previous row.',
      ],
      insight: 'dp[i][j] sums a window of i values from the previous row, so a running window sum makes the whole table O(n × k).',
      approach: [
        'Row for n = 1: dp[0] = 1, everything else 0.',
        'For each i from 2 to n: window = 0; for j from 0 to k, add prev[j], subtract prev[j − i] if j − i ≥ 0, and set cur[j] = window (mod 10⁹ + 7).',
        'Return dp[k] after the last row.',
      ],
      ds: ['Two DP rows', 'Running window sum'], time: 'O(n × k)', space: 'O(k)',
      traps: ['The naive triple loop is O(n² × k) = 10⁹: too slow.', 'Add the modulus before taking the remainder after a subtraction.'],
    },

    // ---------- Sort and binary search ----------
    {
      id: 300, title: 'Longest Increasing Subsequence', pattern: 'Sort and binary search', core: true,
      summary: 'Return the length of the longest strictly increasing subsequence of an array.',
      hints: [
        'The O(n²) DP: dp[i] = 1 + max dp[j] over j < i with nums[j] < nums[i].',
        'Keep tails[len] = the smallest possible last value of an increasing subsequence of length len + 1.',
        'tails stays sorted, so binary search where each new value belongs.',
      ],
      insight: 'tails stays sorted, and replacing the first tail ≥ x with x keeps every length\'s ending as small as possible. Its size is the answer, in O(n log n).',
      approach: [
        'tails = empty.',
        'For each x: find the first index in tails whose value is ≥ x (lower bound).',
        'If there is none, append x; otherwise replace that entry with x.',
        'Return the length of tails.',
      ],
      ds: ['Sorted array', 'Binary search'], time: 'O(n log n)', space: 'O(n)',
      traps: ['tails is not an actual subsequence, only the right length.', 'Strictly increasing uses lower bound (≥ x); non-decreasing would use upper bound.'],
    },
    {
      id: 2008, title: 'Maximum Earnings From Taxi', pattern: 'Sort and binary search',
      summary: 'Driving along a road from point 1 to point n, you may pick up non-overlapping rides. A ride from start to end with a tip earns end − start + tip. Maximise your earnings.',
      hints: ['dp[x] = the best earnings by the time you reach point x.', 'Group the rides by their end point.', 'dp[x] = max(dp[x − 1], dp[start] + earnings of each ride that ends at x).'],
      insight: 'Index the DP by position instead of by ride: each point either inherits the previous best or completes a ride that started earlier, so no search is needed at all.',
      approach: [
        'Bucket the rides by end point.',
        'dp[1] = 0. For x from 2 to n: dp[x] = dp[x − 1]; for each ride (s, x, tip) ending here, dp[x] = max(dp[x], dp[s] + x − s + tip).',
        'Return dp[n].',
      ],
      ds: ['DP array over positions', 'Buckets of rides'], time: 'O(n + r)', space: 'O(n + r)',
      traps: ['Sorting rides and binary searching (as in Job Scheduling) also works; indexing by position avoids the search because points are at most 10⁵.'],
    },
    {
      id: 1235, title: 'Maximum Profit in Job Scheduling', pattern: 'Sort and binary search', core: true,
      summary: 'Jobs have a start time, an end time and a profit. Choose non-overlapping jobs (a job may start exactly when another ends) to maximise the total profit.',
      hints: [
        'Sort the jobs by end time.',
        'dp[i] = the best profit using the first i jobs: skip job i, or take it plus the best among jobs that end by its start.',
        'Find that compatible prefix with binary search.',
      ],
      insight: 'After sorting by end time, the jobs compatible with job i form a prefix, so binary search finds it and dp[i] = max(dp[i−1], profit + dp[prefix length]).',
      approach: [
        'Sort the jobs by end time.',
        'dp[0] = 0.',
        'For job i (1-based): p = the number of jobs whose end ≤ job i\'s start, by binary search on the sorted end times.',
        'dp[i] = max(dp[i−1], profit of job i + dp[p]).',
        'Return dp[n].',
      ],
      ds: ['Array of jobs', 'Sorting', 'Binary search', 'DP array'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Ending at time t and starting at t is allowed: search for end ≤ start, not end < start.', 'Scanning back for the compatible job is O(n²) for 5 × 10⁴ jobs.'],
    },
    {
      id: 1751, title: 'Maximum Number of Events That Can Be Attended II', pattern: 'Sort and binary search',
      summary: 'Events have a start day, an end day and a value. Attend at most k events that do not overlap (one event\'s end day may not equal the next one\'s start day). Maximise the total value.',
      hints: ['It is Job Scheduling with a limit k on how many events you take.', 'dp[j][i] = the best value using at most j events among the first i (sorted by end).', 'Here the compatible events are those that end strictly before this one starts.'],
      insight: 'Add a count dimension to the job-scheduling DP; binary search still finds the last event that ends before each start, giving O(n × k + n log n).',
      approach: [
        'Sort by end day and precompute, for each event, p = the number of events ending before its start day (binary search).',
        'dp[0][*] = 0. For j from 1 to k and i from 1 to n: dp[j][i] = max(dp[j][i−1], value of event i + dp[j−1][p]).',
        'Return dp[k][n].',
      ],
      ds: ['Sorting', 'Binary search', '2D DP table'], time: 'O(n log n + n × k)', space: 'O(n × k), or O(n) with two rows',
      traps: ['Here touching days clash: search for end < start, unlike Job Scheduling.', 'The constraints keep k × n ≤ 10⁶, so the table fits.'],
    },
    {
      id: 354, title: 'Russian Doll Envelopes', pattern: 'Sort and binary search',
      summary: 'An envelope fits inside another only if both its width and its height are strictly smaller. Find the largest number of envelopes you can nest.',
      hints: [
        'Sort by width; then it becomes a longest increasing subsequence on heights.',
        'Envelopes with equal widths cannot nest. Sort equal widths by height in descending order so two of them can never both be picked.',
        'Run the O(n log n) LIS on the heights.',
      ],
      insight: 'Sorting by width ascending and, for equal widths, height descending turns the 2D problem into a strict LIS on heights, solved with the tails array and binary search.',
      approach: ['Sort envelopes by width ascending, ties by height descending.', 'Run the tails-array LIS on the heights.', 'Return its length.'],
      ds: ['Sorting', 'Sorted tails array', 'Binary search'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Sorting ties by height ascending lets two envelopes of equal width chain together, which is wrong.', 'The O(n²) DP times out for 10⁵ envelopes.'],
    },

    // ---------- Monotone split points ----------
    {
      id: 1478, title: 'Allocate Mailboxes', pattern: 'Monotone split points',
      summary: 'Place k mailboxes along a street to minimise the total distance from each house to its nearest mailbox.',
      hints: [
        'Sort the houses. Each mailbox serves a contiguous group of houses.',
        'For one group, the best spot is the group\'s median: precompute cost[i][j].',
        'dp[b][j] = the best cost for the first j houses using b mailboxes.',
      ],
      insight: 'The houses served by one mailbox form a contiguous run whose best spot is its median, so dp[b][j] = min over i of dp[b−1][i−1] + cost[i][j]; the best i only moves right as j grows, which divide and conquer optimisation exploits for large inputs.',
      approach: [
        'Sort the houses; cost[i][j] = the total distance from houses i..j to their median.',
        'dp[0][0] = 0; dp[b][j] = min over i ≤ j of dp[b−1][i−1] + cost[i][j].',
        'Return dp[k][n].',
      ],
      ds: ['Sorting', 'Cost table', '2D DP table'], time: 'O(k × n²)', space: 'O(n²)',
      traps: ['The median, not the mean, minimises a sum of absolute distances.', 'With n ≤ 100 the plain DP is enough; the optimisation matters when n is in the thousands.'],
    },
    {
      id: 410, title: 'Split Array Largest Sum', pattern: 'Monotone split points',
      summary: 'Split an array into k non-empty contiguous parts so that the largest part sum is as small as possible.',
      hints: [
        'DP: dp[j][i] = the best largest sum for the first i numbers in j parts.',
        'Faster and simpler: binary search the answer, and check greedily how many parts a limit needs.',
        'Know both ideas.',
      ],
      insight: 'The DP dp[j][i] = min over m of max(dp[j−1][m], sum(m..i)) has monotone split points, but the cleanest fast method is a binary search on the answer with a greedy part count.',
      approach: [
        'Binary search a limit between max(nums) and sum(nums).',
        'Greedy check: walk the array, starting a new part whenever adding the next number would exceed the limit; count the parts.',
        'If the count is at most k, the limit works: search lower. Otherwise search higher.',
        'Return the smallest limit that works.',
      ],
      ds: ['Binary search on the answer', 'Greedy scan'], time: 'O(n log(sum))', space: 'O(1)',
      traps: ['The DP alone is O(k × n²) = 5 × 10⁷: acceptable, but slower and longer.', 'The lower bound is the largest element, not 0.'],
    },
    {
      id: 1547, title: 'Minimum Cost to Cut a Stick', pattern: 'Monotone split points',
      summary: 'A stick of length n must be cut at given positions, in any order. Each cut costs the length of the piece being cut. Minimise the total cost.',
      hints: [
        'Interval DP over the sorted cut positions: dp[i][j] = (pos[j] − pos[i]) + min over k of dp[i][k] + dp[k][j].',
        'Let opt[i][j] be the best k. It never moves left when i or j grows.',
        'So search k only between opt[i][j−1] and opt[i+1][j].',
      ],
      insight: 'This cost satisfies Knuth\'s conditions, so opt[i][j−1] ≤ opt[i][j] ≤ opt[i+1][j]. Searching only inside that window makes the total work O(c²) instead of O(c³).',
      approach: [
        'Sort the cuts and add 0 and n.',
        'For windows holding one cut: dp is the window length and opt is that cut.',
        'For larger windows: try k only from opt[i][j−1] to opt[i+1][j], and store the best k in opt[i][j].',
        'Return dp[0][m−1].',
      ],
      ds: ['Sorted positions', 'dp and opt tables'], time: 'O(c²) with Knuth, O(c³) without', space: 'O(c²)',
      traps: ['With at most 100 cuts the plain O(c³) passes; Knuth\'s trick is the lesson here.', 'Only use Knuth\'s bounds when the cost has the required properties (here the piece length, which does).'],
    },

    // ---------- Lines and the convex hull trick ----------
    {
      id: 3500, title: 'Minimum Cost to Divide Array Into Subarrays', pattern: 'Lines and the convex hull trick',
      summary: 'Divide an array into contiguous subarrays. The i-th subarray nums[l..r] costs (nums[0] + … + nums[r] + k × i) × (cost[l] + … + cost[r]). Minimise the total cost.',
      hints: [
        'The subarray number i seems to need an extra DP dimension. Can you remove it?',
        'Σ i × (cost sum of subarray i) equals the sum, over all subarrays, of the cost of everything from that subarray\'s start to the end of the array.',
        'Then dp[r] = min over l of dp[l−1] + P[r] × (C[r] − C[l−1]) + k × (C[n] − C[l−1]), with prefix sums P and C.',
      ],
      insight: 'Rewriting the k × i term as k × (suffix cost from each subarray\'s start) removes the subarray count. What remains is a minimum over lines evaluated at x = P[r], so a convex hull trick or Li Chao tree gives O(n log n), although O(n²) already passes for n ≤ 1000.',
      approach: [
        'Build prefix sums P of nums and C of cost.',
        'dp[0] = 0. For r from 1 to n: dp[r] = P[r] × C[r] + k × C[n] + min over l of (dp[l−1] − k × C[l−1] − P[r] × C[l−1]).',
        'O(n²) version: loop over l directly.',
        'Faster: each l adds a line with slope −C[l−1] and intercept dp[l−1] − k × C[l−1], queried at x = P[r]. Keep the lines in a Li Chao tree, or in a monotone hull since slopes decrease and x increases.',
      ],
      ds: ['Prefix sums', 'DP array', 'Li Chao tree or convex hull of lines'], time: 'O(n²), or O(n log n) with a Li Chao tree', space: 'O(n)',
      traps: ['The rewrite that removes i is the real key; without it the DP needs another dimension.', 'All values are positive, so P[r] increases, which is what lets the simple monotone hull work.', 'The hull\'s "is the middle line useless?" test multiplies an intercept difference (up to about 10¹²) by a slope difference (up to 10⁶), past the 2⁵³ limit of exact TypeScript numbers. Use BigInt for that comparison, or a Li Chao tree, which only evaluates lines (values stay near 10¹²).'],
    },
  ],
};
