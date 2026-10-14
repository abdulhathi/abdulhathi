import type { Topic } from './types';

export const topic: Topic = {
  id: 'monotonic-queue',
  patterns: [
    { name: 'Window maximum or minimum', idea: 'A deque of indices whose values stay sorted: old indices leave from the front, beaten ones from the back, and the front is the answer.' },
    { name: 'Prefix sums with a deque', idea: 'Turn subarray sums into differences of prefix sums, then keep only the start indices that can still give the best answer.' },
    { name: 'DP over a sliding range', idea: 'When dp[i] needs the best dp[j] over a window of earlier positions, a deque makes each step O(1) instead of O(k).' },
  ],
  signals: [
    { see: '"Maximum (or minimum) of every window of size k"', think: 'Monotonic deque', why: 'A value that is older and no larger than a newer one can never be the window maximum again, so it can be thrown away.' },
    { see: '"Longest subarray where max − min ≤ limit", "every pair differs by at most…"', think: 'Sliding window plus two deques (one for max, one for min)', why: 'The deques keep the window\'s maximum and minimum available in O(1) while it grows and shrinks.' },
    { see: '"Shortest subarray with sum at least K" and negative numbers are allowed', think: 'Prefix sums plus an increasing deque of start indices', why: 'Negatives break the plain sliding window; the deque keeps only the starts that can still give a shorter answer.' },
    { see: 'dp[i] depends on the best dp[j] among the last k positions', think: 'Monotonic deque over dp values', why: 'The range of j slides forward as i grows, which is exactly a sliding-window maximum.' },
    { see: 'Points sorted by x and a pair condition like xj − xi ≤ k', think: 'Window maximum over a rewritten expression', why: 'Split the formula into a part fixed by j and a part that depends only on i; the second part is a window maximum.' },
    { see: 'You reached for a heap inside a sliding window', think: 'Check whether a deque works instead', why: 'A deque is O(n) in total and needs no lazy deletion; a heap is O(n log n).' },
  ],
  problems: [
    // ---------- Window maximum or minimum ----------
    {
      id: 1438, title: 'Longest Continuous Subarray With Absolute Diff Less Than or Equal to Limit', pattern: 'Window maximum or minimum', core: true,
      summary: 'Find the length of the longest subarray in which every pair of elements differs by at most limit.',
      hints: [
        '"Every pair differs by at most limit" is the same as "maximum − minimum ≤ limit".',
        'Use a sliding window: grow it on the right, and shrink it on the left while it is invalid.',
        'Keep two monotonic deques so the window\'s maximum and minimum are always at their fronts.',
      ],
      insight: 'A window is valid exactly when its max − min ≤ limit. A decreasing deque gives the max and an increasing deque gives the min in O(1) while the window slides.',
      approach: [
        'Keep a decreasing deque of indices (for the max) and an increasing deque (for the min). left = 0.',
        'For each right index: remove from the back of each deque the indices that the new value beats, then push right onto both.',
        'While (value at the max front) − (value at the min front) > limit: move left forward, and remove a deque\'s front if that index is now less than left.',
        'Update the best with right − left + 1.',
      ],
      ds: ['Two deques of indices', 'Sliding window'], time: 'O(n)', space: 'O(n)',
      traps: ['Expire a front by comparing its index with left, not by comparing values; values repeat.', 'An ordered map or two heaps also work, in O(n log n).'],
    },
    {
      id: 2762, title: 'Continuous Subarrays', pattern: 'Window maximum or minimum',
      summary: 'Count the subarrays in which every pair of elements differs by at most 2.',
      hints: [
        'The validity test is the same as in the previous problem: max − min ≤ 2.',
        'For a fixed right end, every start from the smallest valid left up to right works.',
        'So add the window length right − left + 1 for every right end, maintaining left with two deques.',
      ],
      insight: 'The subarrays ending at right that are valid are exactly those starting at or after the smallest valid left, so the answer is the window length summed over all right ends.',
      approach: [
        'Maintain a window [left, right] with max − min ≤ 2, using a decreasing deque for the max and an increasing deque for the min.',
        'For each right: push it into both deques, then shrink from the left while the window is invalid.',
        'Add right − left + 1 to the count.',
      ],
      ds: ['Two deques of indices', 'Sliding window'], time: 'O(n)', space: 'O(n)',
      traps: ['The count can reach about 5 × 10⁹: more than 32 bits, but exact in a JavaScript number.', 'Checking each subarray separately is O(n²).'],
    },
    {
      id: 239, title: 'Sliding Window Maximum', pattern: 'Window maximum or minimum', core: true,
      summary: 'A window of k consecutive elements slides from left to right one step at a time. Report the maximum of each window.',
      hints: [
        'A heap works in O(n log n), but expired values have to be removed lazily.',
        'If a newer value is at least as big as an older one, the older one can never be a window maximum again. Why?',
        'Keep indices in a deque with decreasing values: expire them from the front, discard beaten ones from the back.',
      ],
      insight: 'A value with a bigger value to its right is dead: it leaves the window sooner and never wins. The survivors form a decreasing deque, so the front is the maximum.',
      approach: [
        'For each index i: if the index at the front is i − k or smaller, remove it from the front.',
        'While the value at the back is at most nums[i], remove it from the back. Then push i at the back.',
        'Once i ≥ k − 1, the value at the front is this window\'s maximum.',
      ],
      ds: ['Deque of indices'], time: 'O(n)', space: 'O(k)',
      traps: ['Store indices, not values, so you can tell when the front has left the window.', 'Array.prototype.shift is O(n) per call; keep a head index (or a ring buffer) so removing from the front is O(1).'],
    },
    {
      id: 1499, title: 'Max Value of Equation', pattern: 'Window maximum or minimum',
      summary: 'Points are sorted by x. Find the maximum of yi + yj + |xi − xj| over pairs i < j whose x values differ by at most k.',
      hints: [
        'Because xj > xi, the expression equals (yi − xi) + (yj + xj).',
        'For each j, you want the largest yi − xi among the earlier points within distance k: a window maximum.',
        'Keep a deque of earlier points with decreasing yi − xi, and drop the front when it is more than k away in x.',
      ],
      insight: 'Rewriting the sum as (yj + xj) + (yi − xi) leaves one part fixed by j and one part that is a sliding-window maximum over earlier points.',
      approach: [
        'For each point j: remove points from the front whose x is more than k less than xj.',
        'If the deque is not empty, candidate = yj + xj + (y − x of the front point). Update the best.',
        'Remove points from the back whose y − x is at most yj − xj, then push point j.',
      ],
      ds: ['Deque', 'Array of points'], time: 'O(n)', space: 'O(n)',
      traps: ['Compute the candidate before pushing j: the pair needs i strictly before j.', 'The window is defined by distance in x, not by a fixed number of points.'],
    },
    {
      id: 2398, title: 'Maximum Number of Robots Within Budget', pattern: 'Window maximum or minimum',
      summary: 'Running a group of consecutive robots costs the largest charge time in the group plus (group size × sum of their running costs). Find the largest group you can run within the budget.',
      hints: [
        'Adding a robot never makes the cost smaller. So if a window is too expensive, every bigger window containing it is too.',
        'That makes a sliding window possible; keep a running sum of running costs.',
        'A decreasing deque gives the largest charge time in the window.',
      ],
      insight: 'Cost only grows as the window grows, so a sliding window works, and a monotonic deque supplies the window\'s maximum charge time in O(1).',
      approach: [
        'Move right forward: add runningCosts[right] to the sum, and push right into a decreasing deque of charge times.',
        'While the window is not empty and (max charge) + size × sum > budget: subtract runningCosts[left], remove the deque front if it is left, and move left forward.',
        'Update the best with the window size.',
      ],
      ds: ['Deque of indices', 'Sliding window', 'Running sum'], time: 'O(n)', space: 'O(n)',
      traps: ['size × sum can reach about 2.5 × 10¹⁴ and the budget 10¹⁵: both still exact in a JavaScript number.', 'Binary searching the group size with a fixed-size window also works, in O(n log n).'],
    },

    // ---------- Prefix sums with a deque ----------
    {
      id: 918, title: 'Maximum Sum Circular Subarray', pattern: 'Prefix sums with a deque',
      summary: 'Find the largest sum of a non-empty subarray of a circular array, using each element at most once.',
      hints: [
        'Write the array out twice. A circular subarray is an ordinary subarray of length at most n in the doubled array.',
        'With prefix sums P over the doubled array, the subarray from i to j − 1 has sum P[j] − P[i], and you need j − i ≤ n.',
        'For each j, you want the smallest P[i] among the previous n indices: a sliding-window minimum.',
      ],
      insight: 'In the doubled array, the best circular subarray ending before j subtracts the smallest prefix sum within the last n positions, and a monotonic deque gives that minimum in O(1).',
      approach: [
        'Build prefix sums over the doubled array (2n values plus the leading 0).',
        'Keep an increasing deque of prefix indices, starting with index 0.',
        'For j from 1 to 2n: remove the front if it is more than n behind j; candidate = P[j] − P[front]; then remove from the back every index whose prefix sum is at least P[j], and push j.',
        'Return the largest candidate.',
      ],
      ds: ['Prefix sums', 'Deque of indices'], time: 'O(n)', space: 'O(n)',
      traps: [
        'The well-known shortcut is max(best normal subarray, total − worst normal subarray) with Kadane\'s algorithm twice; when every value is negative, use only the first part, because the second would be an empty subarray.',
        'The subarray must be non-empty, so start the best at −∞, not at 0.',
      ],
    },
    {
      id: 862, title: 'Shortest Subarray with Sum at Least K', pattern: 'Prefix sums with a deque', core: true,
      summary: 'Find the length of the shortest non-empty subarray whose sum is at least k. Values may be negative. Return −1 if there is none.',
      hints: [
        'With negative numbers, growing a window can make its sum smaller, so the usual sliding window fails.',
        'Use prefix sums: the subarray from i to j − 1 sums to P[j] − P[i]. For each j you want the latest i with P[i] ≤ P[j] − k.',
        'Keep an increasing deque of prefix indices. Remove from the front while the sum condition holds, and from the back while the prefix is not smaller than the new one.',
      ],
      insight: 'A start is useless if a later start has a prefix sum that is no bigger (it gives a larger sum and a shorter subarray), and once a start reaches k, no later end can give it a shorter answer. Both rules leave an increasing deque of starts.',
      approach: [
        'Build prefix sums P with P[0] = 0.',
        'For j from 0 to n: while the deque is not empty and P[j] − P[front] ≥ k, update the best with j − front and remove the front.',
        'While the deque is not empty and P[back] ≥ P[j], remove the back.',
        'Push j. At the end, return the best, or −1 if it was never set.',
      ],
      ds: ['Prefix sums', 'Deque of indices'], time: 'O(n)', space: 'O(n)',
      traps: ['With only positive values (Minimum Size Subarray Sum) a plain sliding window is enough; negatives are why this one needs the deque.', 'Keep removing from the front while the condition holds, not just once.'],
    },

    // ---------- DP over a sliding range ----------
    {
      id: 2944, title: 'Minimum Number of Coins for Fruits', pattern: 'DP over a sliding range',
      summary: 'Buying the i-th fruit (counting from 1) lets you take the next i fruits for free, and you may still buy a free fruit to get its reward. Find the fewest coins needed to get every fruit.',
      hints: [
        'Think backwards: if you buy fruit i, the next fruit you pay for is somewhere from i + 1 to 2i + 1.',
        'dp[i] = price of fruit i + the smallest dp[j] for j in that range, where any position past the last fruit costs 0.',
        'As i decreases, both ends of the range move left: a sliding-window minimum over dp.',
      ],
      insight: 'Define dp[i] as the cheapest way to get fruits i to n given that you buy fruit i. It is price i plus the cheapest next purchase, which lies between i + 1 and 2i + 1.',
      approach: [
        'Use positions 1 to n, and treat dp of any position after n as 0.',
        'For i from n down to 1: dp[i] = price of fruit i + the minimum of dp over positions i + 1 to min(2i + 1, n + 1).',
        'The answer is dp[1], because the first fruit must be bought.',
        'With n ≤ 1000 a direct inner loop is fast enough; a monotonic deque makes the whole thing O(n).',
      ],
      ds: ['DP array', 'Deque (optional)'], time: 'O(n²) directly, O(n) with a deque', space: 'O(n)',
      traps: ['The reward is counted from 1: buying the i-th fruit frees the next i fruits.', 'Buying a fruit you could take for free can be cheaper overall, which is why the DP allows it.'],
    },
    {
      id: 1696, title: 'Jump Game VI', pattern: 'DP over a sliding range', core: true,
      summary: 'Start at index 0 and reach the last index, jumping between 1 and k steps forward each time. Your score is the sum of the values you land on. Maximise it.',
      hints: [
        'dp[i] = nums[i] + the best dp among the k indices before i.',
        'Computing that maximum directly makes the DP O(n · k), up to 10¹⁰ steps.',
        'Keep a deque of indices with decreasing dp; its front is the best of the last k.',
      ],
      insight: 'The DP\'s inner step is a sliding-window maximum over dp, so a monotonic deque makes each step O(1) amortised.',
      approach: [
        'dp[0] = nums[0]; the deque holds index 0.',
        'For i from 1 to n − 1: remove the front if it is more than k behind i.',
        'dp[i] = nums[i] + dp[front].',
        'Remove from the back every index whose dp is at most dp[i], then push i. The answer is dp[n − 1].',
      ],
      ds: ['DP array', 'Deque of indices'], time: 'O(n)', space: 'O(n)',
      traps: ['You must land on the last index even if its value is negative.', 'A max-heap with lazy deletion also works, in O(n log n).'],
    },
    {
      id: 3578, title: 'Count Partitions With Max-Min Difference at Most K', pattern: 'DP over a sliding range',
      summary: 'Split the array into contiguous segments so that in every segment the maximum minus the minimum is at most k. Count the ways, modulo 10⁹ + 7.',
      hints: [
        'dp[i] = number of ways to split the first i elements. The last segment ends at i − 1 and starts at some j.',
        'The valid starts j form a range from some left bound up to i − 1, and that left bound only moves right as i grows.',
        'Track the left bound with two monotonic deques (max and min) and add up dp over the range with prefix sums.',
      ],
      insight: 'The valid starts of the last segment form a sliding window, so dp[i] is a range sum of earlier dp values: two deques maintain the window and prefix sums give the sum.',
      approach: [
        'dp[0] = 1, and keep prefix sums S of dp.',
        'Move right from 0 to n − 1, keeping a window [left, right] whose max − min ≤ k with a decreasing deque (max) and an increasing deque (min).',
        'dp[right + 1] = the sum of dp[left] to dp[right], read from S, modulo 10⁹ + 7.',
        'Return dp[n].',
      ],
      ds: ['Two deques of indices', 'DP array', 'Prefix sums'], time: 'O(n)', space: 'O(n)',
      traps: ['A difference of prefix sums taken modulo 10⁹ + 7 can be negative: add the modulus before reducing.', 'The condition is on the values in the segment, not on its length.'],
    },
    {
      id: 1425, title: 'Constrained Subsequence Sum', pattern: 'DP over a sliding range',
      summary: 'Choose a non-empty subsequence in which consecutive chosen indices are at most k apart, and maximise its sum.',
      hints: [
        'dp[i] = the best sum of a valid subsequence that ends at index i.',
        'dp[i] = nums[i] + max(0, best dp among the previous k indices): starting fresh at i is always allowed.',
        'The best dp among the previous k indices is a sliding-window maximum.',
      ],
      insight: 'Each subsequence ending at i either starts at i or extends the best one ending within the previous k indices, and a monotonic deque gives that best in O(1).',
      approach: [
        'For each i: remove the deque front if it is more than k behind i.',
        'dp[i] = nums[i] + max(0, dp[front]) (or just nums[i] if the deque is empty).',
        'Update the answer with dp[i].',
        'Remove from the back every index whose dp is at most dp[i], then push i.',
      ],
      ds: ['DP array', 'Deque of indices'], time: 'O(n)', space: 'O(n)',
      traps: ['The answer is the maximum over all dp values, not dp at the last index.', 'Clamping with max(0, …) drops a negative history, but the subsequence must be non-empty: with all-negative values the answer is the largest single value.'],
    },
  ],
};
