import type { Topic } from './types';

export const topic: Topic = {
  id: 'reservoir-sampling',
  patterns: [
    { name: 'Algorithm R (one item)', idea: 'Keep the i-th item with probability 1/i; every item seen so far is then the pick with probability 1/i.' },
    { name: 'Weighted and area-based picks', idea: 'When items have sizes, either keep an item with probability (its weight / total so far) in one pass, or use prefix sums and binary search.' },
    { name: 'Sampling without repeats', idea: 'Draw from what remains by swapping chosen positions out of the way, storing only the changes.' },
  ],
  signals: [
    { see: '"the list is extremely large", "length unknown", "a stream"', think: 'Reservoir sampling', why: 'It picks uniformly in one pass with O(1) memory, without knowing the length in advance.' },
    { see: 'Pick a random index among the positions holding a target value, without extra storage', think: 'Reservoir sampling over the matches', why: 'Treat the matching indices as a stream and keep the j-th match with probability 1/j.' },
    { see: 'Pick k items uniformly from a stream', think: 'Algorithm R with a reservoir of size k', why: 'Keep item i with probability k / i, replacing a random one of the k; every item ends with probability k / n.' },
    { see: 'Items have sizes or weights (rectangles with areas)', think: 'Weighted reservoir, or prefix sums + binary search', why: 'Both pick an item with probability proportional to its weight.' },
  ],
  problems: [
    {
      id: 382, title: 'Linked List Random Node', pattern: 'Algorithm R (one item)', core: true,
      summary: 'Return the value of a uniformly random node of a singly linked list. The follow-up asks for O(1) extra space and a list whose length you do not know.',
      hints: ['Copying values into an array works but uses O(n) space.', 'Walk the list once. When you reach the i-th node, replace your current choice with probability 1/i.'],
      insight: 'Reservoir sampling: the i-th node becomes the pick with probability 1/i and then survives all later nodes with probability (i/(i+1)) × … × ((n−1)/n) = i/n, so each node ends up chosen with probability exactly 1/n.',
      approach: ['Walk the list with a counter i starting at 1.', 'At node i, draw a random integer in [0, i); if it is 0, set the answer to this node\'s value.', 'Return the answer after the last node.'],
      ds: ['Linked list', 'Counter'], time: 'O(n) per call', space: 'O(1)',
      traps: ['If the list fits in memory and calls are frequent, copying to an array once and picking in O(1) is faster; reservoir sampling is the answer to the follow-up.'],
    },
    {
      id: 398, title: 'Random Pick Index', pattern: 'Algorithm R (one item)', core: true,
      summary: 'An array may contain duplicates. For a given target, return a uniformly random index where that target appears.',
      hints: ['A map from value to its list of indices works with O(n) extra space.', 'Without extra space: scan the array and treat each occurrence of the target as the next item of a stream.'],
      insight: 'Count the matches as you scan; replace the answer with the j-th match with probability 1/j. Each matching index ends up chosen with probability 1/(number of matches).',
      approach: ['count = 0.', 'For each index where nums[i] equals the target: increase count; with probability 1/count set the answer to i.', 'Return the answer.'],
      ds: ['Array', 'Counter'], time: 'O(n) per pick', space: 'O(1)',
      traps: ['A precomputed map of value → indices gives O(1) picks and is often better in practice; know both and their trade-off.'],
    },
    {
      id: 497, title: 'Random Point in Non-overlapping Rectangles', pattern: 'Weighted and area-based picks',
      summary: 'Pick a uniformly random integer point covered by one of several non-overlapping rectangles (points on edges count).',
      hints: [
        'Picking a rectangle uniformly is wrong: a big rectangle should be chosen more often.',
        'Weight each rectangle by its number of integer points, (x₂ − x₁ + 1) × (y₂ − y₁ + 1).',
        'Use prefix sums and binary search (or weighted reservoir sampling), then a uniform point inside the chosen rectangle.',
      ],
      insight: 'Every integer point must be equally likely, so choose a rectangle with probability proportional to its point count, then a uniform point within it. Prefix sums + binary search do it in O(log n) per pick; a weighted reservoir does it in one pass.',
      approach: [
        'Compute each rectangle\'s point count and the prefix sums of the counts.',
        'pick: draw a random number in [0, total); binary search for the rectangle whose prefix range contains it.',
        'Return a random x in [x₁, x₂] and a random y in [y₁, y₂] (or decode the offset within the rectangle).',
      ],
      ds: ['Prefix sum array', 'Binary search'], time: 'O(n) build, O(log n) per pick', space: 'O(n)',
      traps: ['Area (x₂ − x₁)(y₂ − y₁) undercounts the integer points; add 1 to each side.'],
    },
    {
      id: 519, title: 'Random Flip Matrix', pattern: 'Sampling without repeats',
      summary: 'In a large grid of zeros, repeatedly turn a uniformly random zero into a one and return it, with few random calls and little memory.',
      hints: ['Number the cells and pick a random number among those not used yet.', 'Swap the chosen number with the last unused number, as in Fisher–Yates.', 'Store only the swapped entries in a hash map.'],
      insight: 'A virtual Fisher–Yates shuffle draws without repeats: pick r among the remaining cells, return what r maps to, and move the last remaining cell into slot r; a hash map records only the slots that changed.',
      approach: ['remaining = m × n; map is empty.', 'flip: r = random in [0, remaining); x = map[r] or r; remaining decreases; map[r] = map[remaining] or remaining; return the row and column of x.', 'reset: clear the map and restore remaining.'],
      ds: ['Hash map'], time: 'O(1) per flip', space: 'O(flips)',
      traps: ['LeetCode tags this as reservoir sampling, but the clean solution is the virtual shuffle; both draw from "what is left".'],
    },
  ],
};
