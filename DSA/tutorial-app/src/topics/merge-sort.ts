import type { Topic } from './types';

export const topic: Topic = {
  id: 'merge-sort',
  patterns: [
    { name: 'Merge two sorted lists', idea: 'Take the smaller front element again and again. This merge step is the heart of merge sort.' },
    { name: 'Sort with merge sort', idea: 'Split, sort both halves, merge: O(n log n) on every input, stable, and a natural fit for linked lists.' },
    { name: 'k-way merge', idea: 'Merge many sorted lists, either by merging pairs round after round or with a heap of the current heads.' },
    { name: 'Count pairs while merging', idea: 'During a merge every left element came before every right element in the original order, and both halves are sorted, so pairs (i < j) can be counted across the halves in linear time.' },
  ],
  signals: [
    { see: 'Sort a linked list, or sort with a guaranteed O(n log n) and stability', think: 'Merge sort', why: 'It needs no random access, its worst case is still n log n, and taking the left element on ties keeps it stable.' },
    { see: 'Merge two or more sorted arrays or lists', think: 'The merge step, or a k-way merge', why: 'Each step takes the smallest front element, so the output is sorted with one pass.' },
    { see: 'Count pairs i < j with a condition on the two values (inversions, reverse pairs)', think: 'Count during merge sort', why: 'Across one merge, every left index is before every right index, and both halves are sorted, so two pointers count the pairs.' },
    { see: 'For each element, count smaller or larger elements to its right or left', think: 'Merge sort over indices (or a Binary Indexed Tree)', why: 'Counts build up as elements pass each other during the merges.' },
    { see: 'Count subarrays whose sum lies in a range', think: 'Prefix sums, then count pairs by merge sort', why: 'A subarray sum is the difference of two prefix sums, so it becomes a pair-counting problem.' },
    { see: 'n up to 10⁵ and the brute force compares every pair', think: 'Divide and conquer on the pairs', why: 'Pairs within each half are counted recursively; only the cross pairs need the linear merge-time count.' },
  ],
  problems: [
    // ---------- Merge two sorted lists ----------
    {
      id: 21, title: 'Merge Two Sorted Lists', pattern: 'Merge two sorted lists', core: true,
      summary: 'Merge two sorted linked lists into one sorted list by relinking their nodes.',
      hints: [
        'A dummy head node removes the special case for the first node.',
        'Compare the two front nodes and attach the smaller one to the result.',
        'When one list runs out, attach the rest of the other list in one step.',
      ],
      insight: 'With a dummy head and a tail pointer, each step attaches the smaller front node, and whatever remains of the other list is attached whole at the end.',
      approach: [
        'Create a dummy node and a tail pointer that starts at it.',
        'While both lists have nodes: attach the smaller front node to the tail, then advance that list and the tail.',
        'Attach whichever list is not empty.',
        'Return the node after the dummy.',
      ],
      ds: ['Linked list', 'Dummy node'], time: 'O(m + n)', space: 'O(1)',
      traps: ['On equal values take the node from the first list, which keeps the merge stable.', 'Forgetting to attach the leftover list drops nodes.'],
    },

    // ---------- Sort with merge sort ----------
    {
      id: 148, title: 'Sort List', pattern: 'Sort with merge sort', core: true,
      summary: 'Sort a linked list in O(n log n) time.',
      hints: [
        'Merge sort suits linked lists: merging needs no extra array.',
        'Find the middle with slow and fast pointers, cut the list in two, sort each half, and merge.',
        'For O(1) extra space, merge bottom-up: sublists of size 1, then 2, then 4, and so on.',
      ],
      insight: 'On a linked list the merge step needs no extra memory and splitting is a slow/fast walk, so merge sort is the natural O(n log n) choice; bottom-up merging even removes the recursion stack.',
      approach: [
        'A list with zero or one node is already sorted.',
        'Find the middle with slow and fast pointers, and cut the list after the middle node.',
        'Sort both halves recursively.',
        'Merge the two sorted halves and return the merged list.',
      ],
      ds: ['Linked list', 'Two pointers', 'Merge sort'], time: 'O(n log n)', space: 'O(log n) recursive, O(1) bottom-up',
      traps: [
        'Cut the list (the middle node\'s next becomes null), or the halves never get smaller.',
        'Start fast one node ahead of slow, so a two-node list splits into two single nodes instead of two nodes and nothing.',
      ],
    },
    {
      id: 912, title: 'Sort an Array', pattern: 'Sort with merge sort',
      summary: 'Sort an array of integers in ascending order without built-in sort functions, in O(n log n) time.',
      hints: [
        'Merge sort is O(n log n) whatever the input looks like.',
        'Allocate one temporary buffer and reuse it for every merge.',
        'Very short ranges can be finished with insertion sort, which is faster on tiny inputs.',
      ],
      insight: 'Merge sort guarantees O(n log n) on sorted, reversed and all-equal inputs alike, the very cases that defeat a naive quicksort; one shared buffer keeps memory at O(n).',
      approach: [
        'Allocate a temporary array as long as the input, once.',
        'To sort a range: if it has one element, stop. Otherwise sort its left and right halves.',
        'Merge the halves into the buffer by taking the smaller front value each time, then copy the merged part back.',
        'Sort the whole array.',
      ],
      ds: ['Array', 'Temporary buffer'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Creating new arrays in every call works but allocates O(n log n) memory in total and runs slower.'],
    },

    // ---------- k-way merge ----------
    {
      id: 23, title: 'Merge k Sorted Lists', pattern: 'k-way merge', core: true,
      summary: 'Merge k sorted linked lists into one sorted list.',
      hints: [
        'Merging the lists one after another into a growing result is too slow. Why?',
        'Merge them in pairs instead: list 0 with 1, 2 with 3, and so on. How many rounds does that take?',
        'A min-heap of the k current heads is the other O(N log k) solution.',
      ],
      insight: 'Merging in pairs halves the number of lists each round, so every node takes part in only log k merges: O(N log k) in total instead of O(N · k).',
      approach: [
        'If there are no lists, return an empty list.',
        'While more than one list remains, merge the lists in pairs (the last one passes through if the count is odd) into a new array of lists.',
        'Return the single list that remains.',
      ],
      ds: ['Linked list', 'Array of heads'], time: 'O(N log k) for N nodes in total', space: 'O(k) for the array of lists',
      traps: ['Merging sequentially into one growing list makes early nodes take part in up to k merges: O(N · k).', 'Some of the k lists can be empty.'],
    },

    // ---------- Count pairs while merging ----------
    {
      id: 315, title: 'Count of Smaller Numbers After Self', pattern: 'Count pairs while merging', core: true,
      summary: 'For each element, count how many elements to its right are smaller.',
      hints: [
        'Comparing every pair is O(n²), too slow for 10⁵ elements.',
        'In merge sort, when you place an element from the left half, how many right-half elements were already placed before it?',
        'Sort indices rather than values, so you know which original element each count belongs to.',
      ],
      insight: 'A right-half element placed before a left-half element is smaller and was originally to its right. So when you place a left element, add the number of right elements placed so far to that element\'s count.',
      approach: [
        'Merge sort an array of indices, comparing the values they point to.',
        'During each merge, track j, the number of right-half elements placed so far.',
        'When you place a left-half index (place left first on ties), add j to that index\'s count.',
        'After the sort, the counts array is the answer.',
      ],
      ds: ['Array of indices', 'Merge sort', 'Counts array'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'On equal values place the left element first; otherwise equal values are counted as smaller.',
        'A Binary Indexed Tree over the values (which lie in −10⁴..10⁴) is the other standard solution.',
      ],
    },
    {
      id: 493, title: 'Reverse Pairs', pattern: 'Count pairs while merging', core: true,
      summary: 'Count the pairs i < j where nums[i] is more than twice nums[j].',
      hints: [
        'The condition mixes two indices, but merge sort hands you two sorted halves in which every left index comes before every right index.',
        'Before merging, count the cross pairs with a two-pointer pass over the two sorted halves.',
        'Then merge the halves as usual.',
      ],
      insight: 'With both halves sorted, the number of right elements r with left > 2r only grows as the left element grows, so one forward pointer counts all cross pairs in linear time before the merge.',
      approach: [
        'Merge sort the array.',
        'After both halves are sorted, put j at the start of the right half.',
        'For each left element in increasing order, move j forward while that element is more than twice nums[j]; add the number of right elements j has passed.',
        'Then merge the halves normally.',
      ],
      ds: ['Array', 'Merge sort', 'Two pointers'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Count before merging: the counting condition (more than twice) is not the merge comparison.',
        'Twice a value near 2³¹ overflows 32-bit integers in other languages; TypeScript numbers handle it exactly.',
      ],
    },
    {
      id: 327, title: 'Count of Range Sum', pattern: 'Count pairs while merging',
      summary: 'Count the subarrays whose sum lies between lower and upper, inclusive.',
      hints: [
        'A subarray sum is the difference of two prefix sums: P[j] − P[i] for i < j.',
        'So count pairs i < j of prefix sums with lower ≤ P[j] − P[i] ≤ upper.',
        'Merge sort the prefix sums. For each left value, two pointers in the sorted right half mark where the valid values begin and end.',
      ],
      insight: 'Turn subarrays into pairs of prefix sums. During merge sort, for each left prefix the valid right prefixes form one contiguous block of the sorted right half, found with two pointers that only move forward.',
      approach: [
        'Build the prefix sums P[0..n] with P[0] = 0.',
        'Merge sort P. Before each merge, put two pointers lo and hi at the start of the right half.',
        'For each left value x in increasing order: move lo while P[lo] − x < lower, and move hi while P[hi] − x ≤ upper; add hi − lo to the count.',
        'Merge the halves and return the total count.',
      ],
      ds: ['Prefix sums', 'Merge sort', 'Two pointers'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Include P[0] = 0, or subarrays that start at index 0 are missed.',
        'Prefix sums reach about 2 × 10¹⁴: exact in TypeScript numbers, but they overflow 32-bit integers in other languages.',
      ],
    },
    {
      id: 2426, title: 'Number of Pairs Satisfying Inequality', pattern: 'Count pairs while merging',
      summary: 'Given two arrays and a number diff, count pairs i < j with nums1[i] − nums1[j] ≤ nums2[i] − nums2[j] + diff.',
      hints: [
        'Move everything about i to one side and everything about j to the other.',
        'With d[k] = nums1[k] − nums2[k], the condition becomes d[i] ≤ d[j] + diff.',
        'Count pairs i < j with that condition by merge sort, like counting inversions.',
      ],
      insight: 'Rewriting the inequality as d[i] ≤ d[j] + diff on one derived array turns it into a standard pair count across merge-sort halves.',
      approach: [
        'Build d[k] = nums1[k] − nums2[k].',
        'Merge sort d. Before each merge, for each right value v in increasing order, advance a left pointer while the left value ≤ v + diff, and add how many left values it has passed.',
        'Merge the halves and return the total.',
      ],
      ds: ['Array', 'Merge sort', 'Two pointers'], time: 'O(n log n)', space: 'O(n)',
      traps: ['The answer can reach about 5 × 10⁹, beyond 32-bit range in other languages.', 'A Binary Indexed Tree over compressed values solves it too.'],
    },
    {
      id: 1649, title: 'Create Sorted Array through Instructions', pattern: 'Count pairs while merging',
      summary: 'Insert values one at a time into a sorted container. Each insertion costs the smaller of two counts among the values already present: those strictly less and those strictly greater. Return the total cost modulo 10⁹ + 7.',
      hints: [
        'For each position you need two counts over the earlier elements: strictly smaller and strictly greater.',
        'Counting smaller-before is the mirror image of counting smaller-after.',
        'Merge sort over indices (or a Binary Indexed Tree over values) gives both counts in O(n log n).',
      ],
      insight: 'Both costs are counts of earlier elements by value, so one merge-sort pass over indices produces the strictly-less and strictly-greater counts for every element; the answer adds up their minimums.',
      approach: [
        'Merge sort the indices by value. In each merge, for every right-half index, count the left-half values strictly smaller (a pointer that moves while values are smaller) and strictly greater (left size minus a pointer that moves while values are smaller or equal).',
        'Add those to the element\'s running counts.',
        'Add up the smaller of the two counts over all elements, modulo 10⁹ + 7.',
      ],
      ds: ['Array of indices', 'Merge sort'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Equal values count as neither less nor greater: use strict comparisons.',
        'A Binary Indexed Tree over the values 1..10⁵ is shorter to get right for many people. Both are O(n log n).',
      ],
    },
    {
      id: 2179, title: 'Count Good Triplets in an Array', pattern: 'Count pairs while merging',
      summary: 'Two permutations of 0..n − 1 are given. Count the triples of values that appear in increasing position order in both arrays.',
      hints: [
        'Rename each value by its position in the second array, listed in the order of the first array.',
        'Now count increasing triplets i < j < k with A[i] < A[j] < A[k] in that one array.',
        'For each middle element j, the count is (smaller values to its left) × (larger values to its right).',
      ],
      insight: 'Mapping one permutation into the other\'s positions turns the task into counting increasing triplets; each middle element contributes left-smaller × right-larger, where left-smaller comes from a merge-sort count and right-larger follows by arithmetic.',
      approach: [
        'Record each value\'s position in nums2, and build A[i] = that position for nums1[i].',
        'Compute leftSmaller[j], the number of earlier values smaller than A[j], with merge sort over indices.',
        'rightLarger[j] = (n − 1 − A[j]) − (j − leftSmaller[j]): all values larger than A[j], minus the larger ones already on its left.',
        'Add up leftSmaller[j] × rightLarger[j].',
      ],
      ds: ['Array', 'Merge sort'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'The total can reach about 1.6 × 10¹⁴ for n = 10⁵: exact in TypeScript numbers, but use 64-bit integers elsewhere.',
        'Because A is a permutation, exactly n − 1 − A[j] values in the whole array are larger than A[j].',
      ],
    },
  ],
};
