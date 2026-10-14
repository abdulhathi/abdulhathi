import type { Topic } from './types';

export const topic: Topic = {
  id: 'array',
  patterns: [
    { name: 'Running best', idea: 'Carry one or two values forward, such as the best sum ending here or the smallest value so far, so one pass replaces checking every subarray.' },
    { name: 'Reverse and rotate', idea: 'Reversing a segment is a swap loop from both ends. Three reversals rotate an array, and reversing a suffix gives the next permutation.' },
    { name: 'Index as a hash', idea: 'When the values are 1 to n, the array can be its own lookup table: mark position v − 1, or swap each value to its home.' },
    { name: 'Prefix and suffix products', idea: 'Precompute what lies to the left and to the right of every position, so each answer combines two values.' },
    { name: 'Majority vote', idea: 'Pair off different values so they cancel. A value making up more than half (or a third) of the array survives the cancelling.' },
    { name: 'Sort or count first', idea: 'Sorting, or counting values into buckets, often turns a hard question into a single scan.' },
  ],
  signals: [
    { see: 'Best (largest or smallest) sum or product of a contiguous subarray', think: 'Kadane: the best run ending at each index', why: 'The best run ending at i depends only on the best run ending at i − 1.' },
    { see: 'Rotate, shift or reorder in place with O(1) extra space', think: 'Reversals and swaps', why: 'Reversals move whole blocks without a temporary copy.' },
    { see: 'Values are in the range 1 to n (or 0 to n) for an array of length n', think: 'Use indices as a hash: mark by sign, or cyclic sort', why: 'Each value has a natural home index, so the array can record what has been seen.' },
    { see: '"Without division", "everything except this element"', think: 'Prefix and suffix products (or sums)', why: 'Everything except i is everything before i combined with everything after i.' },
    { see: 'An element appearing more than n/2 (or n/3) times, with O(1) space', think: 'Boyer–Moore majority vote', why: 'Different values cancel in pairs, and a true majority cannot be cancelled out completely.' },
    { see: '"Next" or "previous" arrangement in lexicographic order', think: 'Find the rightmost ascent, swap, reverse the suffix', why: 'The decreasing suffix is already at its largest arrangement.' },
    { see: 'A circular array', think: 'Handle the wrap: double the array, use indices modulo n, or think "total minus the middle"', why: 'A wrapping subarray is the complement of a non-wrapping one.' },
    { see: 'O(n) time demanded, but the obvious answer sorts', think: 'Counting into buckets, or an index-as-hash trick', why: 'Counting skips the comparisons that make sorting cost n log n.' },
  ],
  problems: [
    // ---------- Running best ----------
    {
      id: 485, title: 'Max Consecutive Ones', pattern: 'Running best',
      summary: 'Find the length of the longest run of consecutive 1s in an array of 0s and 1s.',
      hints: ['Walk once, keeping the length of the current run.', 'A 0 resets the current run; after each 1, update the best.'],
      insight: 'One counter for the current run and one for the best: a 0 resets the current run, so a single pass finds the longest.',
      approach: ['current = 0 and best = 0.', 'For each value: if it is 1, add 1 to current and update best; otherwise set current back to 0.', 'Return best.'],
      ds: ['Array', 'Two counters'], time: 'O(n)', space: 'O(1)',
      traps: ['Update best inside the loop (or once more after it), or a run that reaches the end of the array is missed.'],
    },
    {
      id: 53, title: 'Maximum Subarray', pattern: 'Running best', core: true,
      summary: 'Find the largest sum of a non-empty contiguous subarray.',
      hints: [
        'Checking every subarray is O(n²), even with running sums.',
        'Think about the best subarray that ends exactly at index i. How is it related to the best one ending at i − 1?',
        'Either extend the previous run or start fresh at i, whichever is larger.',
      ],
      insight: 'Kadane\'s algorithm: the best sum ending at i is the larger of nums[i] alone and (best sum ending at i − 1) + nums[i]. A run with a negative total can only drag down what follows, so drop it.',
      approach: ['current = 0 and best = −infinity.', 'For each value v: current = max(v, current + v); then best = max(best, current).', 'Return best.'],
      ds: ['Array', 'Two running values'], time: 'O(n)', space: 'O(1)',
      traps: [
        'Starting best at 0 is wrong when every number is negative: the answer is then the largest single value.',
        'The follow-up divide-and-conquer version is O(n log n): the best subarray lies in the left half, the right half, or crosses the middle.',
      ],
    },
    {
      id: 152, title: 'Maximum Product Subarray', pattern: 'Running best',
      summary: 'Find the largest product of a non-empty contiguous subarray.',
      hints: [
        'Kadane\'s idea almost works, but multiplying by a negative number turns the smallest product into the largest.',
        'Track both the largest and the smallest product ending at each index.',
        'At each value, the new largest is the biggest of: the value, value × old largest, value × old smallest.',
      ],
      insight: 'Multiplying by a negative swaps the roles of the largest and smallest products, so carry both forward. The answer is the best "largest" seen at any index.',
      approach: [
        'hi = lo = best = nums[0].',
        'For each later value v, the candidates are v, v × hi and v × lo.',
        'Set hi to the largest candidate and lo to the smallest, both computed from the old hi and lo.',
        'Update best with hi, and return best at the end.',
      ],
      ds: ['Array', 'Three running values'], time: 'O(n)', space: 'O(1)',
      traps: ['Compute the new hi and lo from the old values; updating hi first and then using it for lo is the usual bug.', 'A zero resets both to 0, and the candidate rule already handles that.'],
    },
    {
      id: 918, title: 'Maximum Sum Circular Subarray', pattern: 'Running best',
      summary: 'In a circular array, where the end wraps around to the start, find the largest sum of a non-empty subarray that uses each element at most once.',
      hints: [
        'A subarray that does not wrap is plain Kadane.',
        'A subarray that wraps is the whole array minus some middle part. Which middle part should you remove?',
        'Remove the subarray with the smallest sum: wrap answer = total − minimum subarray. Watch out when every number is negative.',
      ],
      insight: 'The best circular subarray either does not wrap (Kadane\'s maximum) or wraps, which is the total minus the minimum subarray (Kadane run for the minimum). Take the larger, except when all numbers are negative.',
      approach: [
        'In one pass, run Kadane for the maximum subarray sum, Kadane for the minimum subarray sum, and add up the total.',
        'If the maximum is negative, every number is negative: return the maximum.',
        'Otherwise return the larger of the maximum and total − minimum.',
      ],
      ds: ['Array', 'Running values'], time: 'O(n)', space: 'O(1)',
      traps: ['When every value is negative, total − minimum is 0, which would mean taking nothing. An empty subarray is not allowed, so return the maximum.'],
    },
    {
      id: 334, title: 'Increasing Triplet Subsequence', pattern: 'Running best',
      summary: 'Decide whether some three positions i < j < k hold strictly increasing values.',
      hints: [
        'Keep the smallest value seen so far as the best candidate for the first element.',
        'Also keep the smallest value that has a smaller value somewhere before it: the best candidate for the middle.',
        'A value larger than both completes a triplet.',
      ],
      insight: 'Greedy: first is the smallest value so far, and second is the smallest value that has something smaller before it. Any value above second completes a triplet, and keeping both as small as possible never misses one.',
      approach: ['first = second = +infinity.', 'For each value v: if v ≤ first, set first = v; else if v ≤ second, set second = v; else return true.', 'Return false.'],
      ds: ['Two running values'], time: 'O(n)', space: 'O(1)',
      traps: [
        'first can be replaced after second is set, so first may sit later than second. That is fine: second still has some smaller value before it.',
        'Use ≤ so equal values do not count as increasing.',
      ],
    },
    {
      id: 605, title: 'Can Place Flowers', pattern: 'Running best',
      summary: 'A flowerbed is a row of empty and planted plots, and no two flowers may be next to each other. Decide whether n more flowers can be planted.',
      hints: ['Walk left to right and plant wherever it is allowed.', 'A plot can take a flower if it and both neighbours are empty; outside the bed counts as empty.', 'Planting as early as possible never blocks more than waiting would.'],
      insight: 'Greedy from the left: planting in the first allowed plot is never worse than waiting, because it only blocks the next plot, which any later choice would also block.',
      approach: [
        'count = 0.',
        'For each plot: if it is empty and both neighbours are empty or outside the bed, plant there (mark it) and add 1 to count.',
        'Return whether count reached n (you may stop as soon as it does).',
      ],
      ds: ['Array'], time: 'O(n)', space: 'O(1)',
      traps: ['The first and last plots have only one neighbour.', 'Mark a plot when you plant in it, or the next plot will look free too.'],
    },

    // ---------- Reverse and rotate ----------
    {
      id: 189, title: 'Rotate Array', pattern: 'Reverse and rotate', core: true,
      summary: 'Rotate an array to the right by k steps, in place.',
      hints: [
        'k can be larger than the length: only k mod n matters.',
        'Shifting one step at a time costs O(n · k).',
        'Reverse the whole array, then reverse the first k values and the remaining values separately.',
      ],
      insight: 'Rotating right by k moves the last k values to the front, in order. Reversing everything puts them at the front backwards; reversing each part fixes the order. Three reversals: O(n) time and O(1) space.',
      approach: ['k = k mod n.', 'Reverse the whole array.', 'Reverse the first k elements.', 'Reverse the remaining n − k elements.'],
      ds: ['Array', 'Two indices'], time: 'O(n)', space: 'O(1)',
      traps: ['Forgetting k mod n when k ≥ n.', 'Copying into a new array at position (i + k) mod n is the simple O(n)-space alternative.'],
    },
    {
      id: 31, title: 'Next Permutation', pattern: 'Reverse and rotate', core: true,
      summary: 'Rearrange numbers in place into the next larger arrangement in lexicographic order, or into ascending order if they are already in the largest arrangement.',
      hints: [
        'Look from the right. The longest decreasing suffix is already in its largest arrangement.',
        'Let i be the position just before that suffix. Swap nums[i] with the smallest value in the suffix that is larger than it.',
        'Then reverse the suffix to make it as small as possible.',
      ],
      insight: 'A suffix that only decreases cannot be made larger on its own, so increase the element just before it by the smallest possible step (swap with the next larger value from the suffix), then reset the suffix to ascending order by reversing it.',
      approach: [
        'Find the largest i with nums[i] < nums[i + 1]. If there is none, reverse the whole array and stop.',
        'Find the largest j > i with nums[j] > nums[i], and swap nums[i] with nums[j].',
        'Reverse the part after position i.',
      ],
      ds: ['Array', 'Two indices'], time: 'O(n)', space: 'O(1)',
      traps: ['Use strict comparisons so duplicates work: nums[i] < nums[i + 1] and nums[j] > nums[i].', 'After the swap the suffix is still decreasing, which is why reversing it (not sorting) is enough.'],
    },
    {
      id: 1752, title: 'Check if Array Is Sorted and Rotated', pattern: 'Reverse and rotate',
      summary: 'Decide whether an array could be a non-decreasing array that was rotated by some number of positions.',
      hints: ['A sorted array has no "drops", where a value is followed by a smaller one.', 'A rotated sorted array has at most one drop, counting the wrap from the last element back to the first.'],
      insight: 'Count the positions where a value is larger than the next one, wrapping from the end to the start. A rotated sorted array has at most one such drop.',
      approach: ['drops = 0.', 'For each i, compare nums[i] with the next value (the first value when i is the last index); count the drops.', 'Return whether drops ≤ 1.'],
      ds: ['Array'], time: 'O(n)', space: 'O(1)',
      traps: ['Include the wrap-around comparison, or an array like 2, 1, 3 wrongly looks valid.'],
    },

    // ---------- Index as a hash ----------
    {
      id: 448, title: 'Find All Numbers Disappeared in an Array', pattern: 'Index as a hash', core: true,
      summary: 'An array of n values, each between 1 and n, may contain repeats. Return every number from 1 to n that does not appear, ideally without extra space.',
      hints: [
        'A set of seen values works, but it uses O(n) space.',
        'The values are 1 to n and there are n positions. Can position v − 1 remember that v was seen?',
        'Mark it by making the value at index v − 1 negative. Positions still positive at the end belong to missing numbers.',
      ],
      insight: 'Use the array as its own set: for each value v, mark index v − 1 by making it negative. Indices that stay positive were never marked, so their numbers are missing.',
      approach: [
        'For each value, take its absolute value v and make nums[v − 1] negative if it is still positive.',
        'Then, for each index i whose value is still positive, i + 1 is missing.',
        'Optionally restore the signs afterwards.',
      ],
      ds: ['Array as a marker table'], time: 'O(n)', space: 'O(1) besides the output',
      traps: ['Read values through their absolute value, because earlier steps may have negated them.', 'Negate only positive cells, or a repeated value flips the mark back.'],
    },
    {
      id: 442, title: 'Find All Duplicates in an Array', pattern: 'Index as a hash',
      summary: 'In an array of n values between 1 and n, where each value appears once or twice, return the values that appear twice, in O(n) time with constant extra space.',
      hints: ['Use the same trick as problem 448: index v − 1 records whether v has been seen.', 'If the mark is already there when you visit v, then v is a duplicate.'],
      insight: 'Negate nums[v − 1] the first time you meet v. Finding it already negative means v has appeared before.',
      approach: ['For each value, let v be its absolute value.', 'If nums[v − 1] is negative, add v to the answer; otherwise negate nums[v − 1].', 'Return the answer.'],
      ds: ['Array as a marker table'], time: 'O(n)', space: 'O(1) besides the output',
      traps: ['Always read through the absolute value, since the cell may already be negated.'],
    },
    {
      id: 41, title: 'First Missing Positive', pattern: 'Index as a hash', core: true,
      summary: 'Find the smallest positive integer missing from an unsorted array, in O(n) time and O(1) extra space.',
      hints: [
        'The answer is between 1 and n + 1: n values can cover at most the numbers 1 to n.',
        'So only values from 1 to n matter. Try to put each such value v at index v − 1.',
        'After placing, the first index i that does not hold i + 1 gives the answer.',
      ],
      insight: 'Cyclic sort: swap each value from 1 to n into its home index v − 1, then scan for the first index holding the wrong value. Every swap sends at least one value home for good, so there are at most n swaps.',
      approach: [
        'For each index i: while nums[i] is between 1 and n and nums[nums[i] − 1] differs from nums[i], swap nums[i] with nums[nums[i] − 1].',
        'Then, for each index i, if nums[i] is not i + 1, return i + 1.',
        'If every index matched, return n + 1.',
      ],
      ds: ['Array as its own table'], time: 'O(n)', space: 'O(1)',
      traps: [
        'The check that the home cell does not already hold the value stops endless swapping on duplicates.',
        'Do not move on after a swap: the value that arrived at i still needs placing (the inner loop handles it).',
        'Negatives, zeros and values above n are simply left where they are.',
      ],
    },

    // ---------- Prefix and suffix products ----------
    {
      id: 238, title: 'Product of Array Except Self', pattern: 'Prefix and suffix products', core: true,
      summary: 'Return an array where each entry is the product of every other value, in O(n) time and without division.',
      hints: [
        'Division would be easy, but it is forbidden, and zeros would break it anyway.',
        'The product of everything except i = (product of everything left of i) × (product of everything right of i).',
        'Fill the output with left products in one pass, then multiply in right products during a backward pass, using a running variable.',
      ],
      insight: 'Each answer splits into a prefix product and a suffix product. A forward pass stores the prefixes in the output; a backward pass multiplies in a running suffix, so no extra array is needed.',
      approach: [
        'output[0] = 1, and for i from 1: output[i] = output[i − 1] × nums[i − 1].',
        'suffix = 1. For i from the last index down to 0: output[i] = output[i] × suffix, then suffix = suffix × nums[i].',
        'Return output.',
      ],
      ds: ['Array', 'Output array', 'Running product'], time: 'O(n)', space: 'O(1) besides the output',
      traps: ['Dividing the total product by each value fails when there are zeros, and it is forbidden.', 'The same left-and-right idea works for sums, minimums and maximums; see Prefix sums.'],
    },

    // ---------- Majority vote ----------
    {
      id: 169, title: 'Majority Element', pattern: 'Majority vote', core: true,
      summary: 'Return the value that appears more than half the time in an array; such a value always exists.',
      hints: [
        'A count map works in O(n) space; sorting puts the majority at the middle index.',
        'Pair up two different values and throw both away. What survives?',
        'Keep one candidate and a counter: the same value adds one, a different value subtracts one.',
      ],
      insight: 'Boyer–Moore voting: every pair of different values cancels out. The majority value outnumbers all other values combined, so it is the one left standing.',
      approach: [
        'candidate = none, count = 0.',
        'For each value: if count is 0, make the value the candidate. Then add 1 if the value equals the candidate, otherwise subtract 1.',
        'Return the candidate; the problem guarantees a majority exists.',
      ],
      ds: ['Two variables'], time: 'O(n)', space: 'O(1)',
      traps: ['If a majority is not guaranteed, count the candidate in a second pass to confirm it.', 'Sorting and taking the middle value is O(n log n) and also correct.'],
    },
    {
      id: 229, title: 'Majority Element II', pattern: 'Majority vote',
      summary: 'Return every value that appears more than n/3 times, ideally in linear time with constant space.',
      hints: [
        'At most two values can each appear more than a third of the time.',
        'Generalise the vote: keep two candidates with two counters.',
        'A value matching neither candidate decreases both counters. Confirm the candidates with a second pass.',
      ],
      insight: 'With two candidates, each value that matches neither cancels one copy of each, so a value with more than n/3 copies can never be wiped out. A second pass confirms which survivors really qualify.',
      approach: [
        'c1 and c2 empty, with counts n1 = n2 = 0.',
        'For each value: if it equals c1, add 1 to n1; else if it equals c2, add 1 to n2; else if n1 is 0, make it c1 with count 1; else if n2 is 0, make it c2 with count 1; else subtract 1 from both counts.',
        'Count c1 and c2 again in a second pass, and return those that appear more than n/3 times.',
      ],
      ds: ['Four variables'], time: 'O(n)', space: 'O(1)',
      traps: ['Check "equals a candidate" before "a slot is empty", or the same value can take both slots.', 'The second pass is required: the survivors are only candidates.'],
    },
    {
      id: 1157, title: 'Online Majority Element In Subarray', pattern: 'Majority vote',
      summary: 'Design a structure over an array that answers many queries: return a value occurring at least threshold times in a given subarray, where threshold is more than half the subarray\'s length, or −1 if there is none.',
      hints: [
        'Counting each subarray from scratch is O(n) per query, up to 2 × 10⁸ steps in total.',
        'Vote results (candidate, count) can be merged: equal candidates add their counts, different candidates cancel.',
        'Keep merged votes in a segment tree to get the candidate for any range in O(log n), then check its count by binary search on its list of positions.',
      ],
      insight: 'Majority votes combine: the (candidate, count) results of two halves merge into the result for the whole. A segment tree therefore gives the only possible majority candidate of any range in O(log n), and binary searching that value\'s sorted positions counts it exactly.',
      approach: [
        'For each value, store the sorted list of indices where it occurs.',
        'Build a segment tree whose nodes hold vote results; merge two children by adding counts when the candidates match, otherwise keep the candidate with the larger count and the difference of the counts.',
        'For a query, merge the nodes that cover [left, right] to get a candidate.',
        'Count the candidate\'s positions inside [left, right] with two binary searches; return it if the count reaches threshold, else −1.',
      ],
      ds: ['Segment tree', 'Map from value to sorted positions', 'Binary search'], time: 'O(n) to build, O(log n) per query', space: 'O(n)',
      traps: [
        'Skipping the check is wrong: the vote only guarantees that a true majority would be the candidate, not that the candidate is a majority.',
        'A randomised method also works: test about 20 random positions of the range by binary search; a true majority is picked with probability above one half each time.',
      ],
    },

    // ---------- Sort or count first ----------
    {
      id: 274, title: 'H-Index', pattern: 'Sort or count first',
      summary: 'Given the number of citations of each paper, return the largest h such that h papers each have at least h citations.',
      hints: ['Sort the citations from most to fewest.', 'After sorting, h works when the h-th paper has at least h citations.', 'Or count: h can never exceed n, so bucket the papers by citations capped at n and sweep down from the top.'],
      insight: 'Sorted from most to fewest, the h-index is the last position h (counting from 1) whose paper has at least h citations. A counting array capped at n finds the same in O(n).',
      approach: [
        'Make a count array of size n + 1, and add each paper to bucket min(citations, n).',
        'Sweep h from n down to 0, keeping a running total of papers with at least h citations.',
        'Return the first h where that total is at least h.',
      ],
      ds: ['Count array', 'or sorting'], time: 'O(n), or O(n log n) with sorting', space: 'O(n)',
      traps: ['Citations above n are capped at n: h can never be larger than the number of papers.'],
    },
    {
      id: 628, title: 'Maximum Product of Three Numbers', pattern: 'Sort or count first',
      summary: 'Find three numbers in an array whose product is as large as possible, and return that product.',
      hints: ['If every number were positive, you would take the three largest.', 'Two negatives multiply to a positive. Which other combination could win?', 'Compare (largest × second × third largest) with (largest × the two most negative).'],
      insight: 'The best product is either the three largest values, or the largest value times the two smallest (most negative) values. One pass, or a sort, finds all five candidates.',
      approach: ['Find the three largest values and the two smallest values, in one pass or by sorting.', 'Return the larger of max1 × max2 × max3 and max1 × min1 × min2.'],
      ds: ['Array', 'Five running values, or sorting'], time: 'O(n), or O(n log n) with sorting', space: 'O(1)',
      traps: ['Forgetting the two-negatives case: for −10, −10, 1, 2, 3 the answer is 300, not 6.'],
    },
  ],
};
