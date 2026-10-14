import type { Topic } from './types';

export const topic: Topic = {
  id: 'quickselect',
  patterns: [
    { name: 'The k-th element', idea: 'Partition around a pivot, then continue only into the side that holds the index you want.' },
    { name: 'Top k by partition', idea: 'Once the k-th element is in place, everything on one side of it is the top k, in no particular order.' },
    { name: 'Median by partition', idea: 'The median is the k-th element with k = n / 2, and many "make everything equal" problems hinge on it.' },
  ],
  signals: [
    { see: 'Find the k-th smallest or largest value, or the median', think: 'Quickselect', why: 'You need one position of the sorted order, not the whole sorted order.' },
    { see: 'Return the top k (closest, most frequent, largest) in any order', think: 'Quickselect, or a heap of size k', why: 'A partition separates the top k from the rest without ordering them.' },
    { see: 'The follow-up demands better than O(n log n)', think: 'Quickselect (average O(n)) or bucketing', why: 'Sorting is O(n log n) by nature; selection is not.' },
    { see: 'Minimise the total distance to one common value', think: 'The median', why: 'The median minimises the sum of absolute differences.' },
    { see: 'Data arrives as a stream, or k is tiny compared with n', think: 'A heap of size k instead', why: 'Quickselect needs all values in memory at once and rearranges them.' },
  ],
  problems: [
    // ---------- The k-th element ----------
    {
      id: 215, title: 'Kth Largest Element in an Array', pattern: 'The k-th element', core: true,
      summary: 'Return the k-th largest value in an array, counting duplicates, ideally without sorting.',
      hints: [
        'The k-th largest is the value that would sit at index n − k if the array were sorted ascending.',
        'Partition around a pivot: the pivot lands at its final sorted index p.',
        'If p is the target, stop; otherwise continue only into the side that contains the target. Pick pivots at random.',
      ],
      insight: 'Each partition puts one pivot in its final sorted place and lets you discard the side that cannot hold the target, so the expected work is n + n/2 + n/4 + … = O(n).',
      approach: [
        'target = n − k; lo = 0; hi = n − 1.',
        'Pick a random pivot value in lo..hi and partition the range three ways: smaller values, then values equal to the pivot, then larger values.',
        'If the target index falls inside the equal block, return the pivot value.',
        'If the target is left of the block, continue in the smaller part (set hi just before the block); otherwise continue in the larger part (set lo just after it).',
        'Repeat.',
      ],
      ds: ['Array', 'In-place partition'], time: 'O(n) average, O(n²) worst', space: 'O(1)',
      traps: [
        'The tests include arrays full of equal values. A simple two-way (Lomuto) partition then removes only one element per round, which is O(n²); the three-way partition finishes such an array in one round.',
        'A min-heap of size k is a safe O(n log k) alternative.',
      ],
    },
    {
      id: 1985, title: 'Find the Kth Largest Integer in the Array', pattern: 'The k-th element',
      summary: 'Numbers are given as digit strings up to 100 digits long, without leading zeros. Return the k-th largest, counting duplicates.',
      hints: [
        'Strings of 100 digits do not fit in normal numbers.',
        'Without leading zeros, a longer string is a bigger number, and strings of equal length compare like words.',
        'Use that order in quickselect, a sort or a heap.',
      ],
      insight: 'Compare by length first and alphabetically second; with that comparison any selection method works, and quickselect finds the k-th with a linear expected number of comparisons.',
      approach: [
        'Define the order: the shorter string is smaller; for equal lengths, compare the strings alphabetically.',
        'Run quickselect for index n − k with that order (or sort descending and take position k − 1).',
        'Return the string found.',
      ],
      ds: ['Array of strings', 'In-place partition'], time: 'O(n · L) average, L = string length', space: 'O(1) besides the input',
      traps: ['Converting with Number() loses precision beyond 2⁵³; BigInt works but is slower than comparing strings.', 'Plain alphabetical order is wrong for different lengths: "9" comes after "10".'],
    },
    {
      id: 3759, title: 'Count Elements With at Least K Greater Values', pattern: 'The k-th element',
      summary: 'Count the elements for which at least k elements of the array are strictly greater.',
      hints: [
        'If k is 0, every element qualifies.',
        'Let t be the k-th largest value. Does an element smaller than t qualify? Does t itself?',
        'Find t with quickselect, then count the elements strictly below it.',
      ],
      insight: 'At least k elements are greater than or equal to the k-th largest value t, so everything strictly below t qualifies; at most k − 1 elements are greater than t, so t and anything above it never do.',
      approach: [
        'If k is 0, return n.',
        'Find t, the k-th largest value, with quickselect.',
        'Count the elements strictly smaller than t.',
      ],
      ds: ['Array', 'In-place partition'], time: 'O(n) average', space: 'O(1)',
      traps: ['Copies of t never qualify, however many there are.', 'Sorting descending and reading position k − 1 gives t in O(n log n).'],
    },

    // ---------- Top k by partition ----------
    {
      id: 973, title: 'K Closest Points to Origin', pattern: 'Top k by partition', core: true,
      summary: 'Return the k points closest to the origin, in any order.',
      hints: [
        'Compare squared distances; you never need a square root.',
        'You want the k smallest distances, not a full sort.',
        'Quickselect on squared distance leaves the k closest points at the front.',
      ],
      insight: 'Quickselect by squared distance moves the k closest points into the first k positions in expected linear time, and their order among themselves does not matter.',
      approach: [
        'Compute each point\'s squared distance x² + y².',
        'Quickselect so that index k − 1 holds the k-th smallest distance, with all smaller ones before it.',
        'Return the first k points.',
      ],
      ds: ['Array', 'In-place partition'], time: 'O(n) average', space: 'O(1)',
      traps: ['Square roots add floating-point noise and are unnecessary for comparing.', 'A max-heap of size k costs O(n log k) and also works on a stream.'],
    },
    {
      id: 347, title: 'Top K Frequent Elements', pattern: 'Top k by partition', core: true,
      summary: 'Return the k most frequent values. The answer is unique, and the solution must be faster than O(n log n).',
      hints: [
        'Count frequencies with a Map.',
        'You need the k largest frequencies, not all of them in order.',
        'Quickselect over the distinct values by frequency, or bucket them by frequency (see Counting, bucket and radix sort).',
      ],
      insight: 'After counting, it is a top-k selection over the distinct values: quickselect by frequency gives average O(n), and bucketing by frequency gives guaranteed O(n).',
      approach: [
        'Count each value\'s frequency in a Map.',
        'Put the distinct values in an array and quickselect so the k most frequent occupy the last k positions.',
        'Return those k values.',
      ],
      ds: ['Hash map', 'Array', 'In-place partition'], time: 'O(n) average', space: 'O(n)',
      traps: ['Sorting the distinct values by frequency is O(n log n), which the follow-up rules out.', 'Select among the distinct values, not the original array.'],
    },
    {
      id: 1738, title: 'Find Kth Largest XOR Coordinate Value', pattern: 'Top k by partition',
      summary: 'The value of a cell is the XOR of every number in the rectangle from the top-left corner to that cell. Return the k-th largest of these values.',
      hints: [
        'Compute every cell\'s value with a 2D prefix XOR in one pass.',
        'XOR undoes itself, so the usual inclusion-exclusion uses XOR instead of plus and minus.',
        'Then it is the k-th largest of m × n numbers: quickselect.',
      ],
      insight: 'A 2D prefix XOR gives each value in O(1) from its top, left and top-left neighbours, and quickselect finds the k-th largest of the m · n values in expected linear time.',
      approach: [
        'value at (i, j) = matrix value XOR top value XOR left value XOR top-left value, treating cells outside the grid as 0.',
        'Collect all values in one array.',
        'Quickselect for index (total − k) in ascending order and return that value.',
      ],
      ds: ['Matrix', 'Prefix XOR', 'In-place partition'], time: 'O(m · n) average', space: 'O(m · n)',
      traps: ['The top-left value appears in both the top and the left value, so it cancels out; XOR it in once more.', 'With up to 10⁶ values, sorting works but quickselect is lighter.'],
    },

    // ---------- Median by partition ----------
    {
      id: 462, title: 'Minimum Moves to Equal Array Elements II', pattern: 'Median by partition', core: true,
      summary: 'In one move you add 1 to or subtract 1 from an element. Find the fewest moves that make all elements equal.',
      hints: [
        'The total number of moves is the sum of the distances from each element to the final value.',
        'Which point on a number line has the smallest total distance to a set of points?',
        'The median. Find it with quickselect.',
      ],
      insight: 'The sum of absolute distances is smallest at the median: moving away from it brings you closer to fewer points than it takes you away from. Quickselect finds the median in expected linear time.',
      approach: [
        'Find the element at index ⌊n / 2⌋ of the sorted order with quickselect: the median.',
        'Add up the absolute difference between each element and the median.',
      ],
      ds: ['Array', 'In-place partition'], time: 'O(n) average', space: 'O(1)',
      traps: ['The mean minimises the sum of squared distances, not absolute ones.', 'For even n, any value between the two middle values is optimal; either middle element works.'],
    },
    {
      id: 324, title: 'Wiggle Sort II', pattern: 'Median by partition',
      summary: 'Reorder an array so it alternates strictly: smaller, larger, smaller, larger, and so on. A valid answer always exists.',
      hints: [
        'Split the values into a smaller half and a larger half around the median.',
        'Put the larger half on the odd indices and the smaller half on the even indices.',
        'Fill each half in descending order, so copies of the median end up far apart.',
      ],
      insight: 'Place the larger half on the odd positions and the smaller half on the even positions, both in descending order; equal values near the median then land at opposite ends of their halves, so no two equal values become neighbours.',
      approach: [
        'Sort a copy (or, for O(n), find the median with quickselect and partition three ways around it).',
        'Fill indices 1, 3, 5, … with the largest values, going down.',
        'Fill indices 0, 2, 4, … with the remaining values, largest first.',
      ],
      ds: ['Array', 'Sorting or partition'], time: 'O(n log n), or O(n) average with quickselect', space: 'O(n)',
      traps: [
        'Filling in ascending order can put copies of the median next to each other and break the strict inequality.',
        'The O(1)-space version uses index mapping ("virtual indexing") and is notoriously tricky; master the simple version first.',
      ],
    },
  ],
};
