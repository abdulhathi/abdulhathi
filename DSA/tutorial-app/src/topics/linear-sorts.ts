import type { Topic } from './types';

export const topic: Topic = {
  id: 'linear-sorts',
  patterns: [
    { name: 'Counting sort', idea: 'When values lie in a small range, count each value and read the counts back in order. No comparisons at all.' },
    { name: 'Bucket by frequency', idea: 'A frequency is at most n, so use it as a bucket index: bucket i holds the values that appear i times.' },
    { name: 'Buckets by value range', idea: 'Split the value range into equal-width buckets: close values share a bucket, and the pigeonhole principle tells you where big gaps must be.' },
    { name: 'Radix sort', idea: 'Sort by one digit at a time with stable bucket passes, starting from the last digit.' },
  ],
  signals: [
    { see: 'Values are small integers (up to about 10⁶) or letters from a fixed alphabet', think: 'Counting sort', why: 'An array indexed by value replaces comparisons, giving O(n + k).' },
    { see: 'Top k by frequency, and the follow-up demands better than O(n log n)', think: 'Bucket by frequency', why: 'Frequencies are whole numbers between 1 and n, so they index an array of buckets directly.' },
    { see: 'Linear time required on arbitrary integers, asking about gaps between neighbours', think: 'Buckets by value range (pigeonhole)', why: 'The maximum gap is at least the average gap, so it never hides inside a narrow bucket.' },
    { see: 'Find two values within a distance of each other, inside a window', think: 'Buckets of width (allowed difference + 1)', why: 'Two values in the same bucket are always close enough; only neighbouring buckets need a real check.' },
    { see: 'Fixed-length digit strings or keys compared digit by digit', think: 'Radix sort', why: 'Stable passes from the last digit to the first build the full order without comparing whole keys.' },
    { see: 'Sort by a small key while keeping the original order of ties', think: 'Stable counting sort with prefix sums', why: 'Prefix sums give each key its block of output positions, filled in input order.' },
  ],
  problems: [
    // ---------- Counting sort ----------
    {
      id: 1365, title: 'How Many Numbers Are Smaller Than the Current Number', pattern: 'Counting sort', core: true,
      summary: 'For each element, count how many other elements are strictly smaller than it.',
      hints: [
        'Values are between 0 and 100.',
        'Count how many times each value occurs.',
        'A running total of the counts tells you how many elements lie below each value.',
      ],
      insight: 'With values in 0..100, a count array plus a running total gives, for every value v, the number of elements smaller than v, in O(n + 101).',
      approach: [
        'Count each value in an array of 101 slots.',
        'Turn it into a running total so that below[v] is the number of elements with a value less than v.',
        'Answer each element with below[its value].',
      ],
      ds: ['Count array', 'Prefix sums'], time: 'O(n + k), k = 101', space: 'O(k)',
      traps: ['Use the total of values strictly below v, which is the running total before v\'s own count is added.'],
    },
    {
      id: 1051, title: 'Height Checker', pattern: 'Counting sort',
      summary: 'Count how many students stand in a different position from where they would be if the line were sorted by height.',
      hints: ['Compare the line with its sorted version.', 'Heights are at most 100, so counting sort gives the sorted version in linear time.'],
      insight: 'Counting sort the heights (range 1..100), then compare position by position with the original line.',
      approach: [
        'Count each height.',
        'Walk the original line while producing the sorted heights from the counts in step.',
        'Count the positions where the two differ.',
      ],
      ds: ['Count array'], time: 'O(n + k)', space: 'O(k)',
      traps: ['Count the positions that differ, not the number of swaps needed to fix them.'],
    },
    {
      id: 1122, title: 'Relative Sort Array', pattern: 'Counting sort', core: true,
      summary: 'Reorder arr1 so that its values follow the order of arr2. Values that do not appear in arr2 go at the end in ascending order.',
      hints: [
        'Values are between 0 and 1000.',
        'Count every value of arr1.',
        'Write out arr2\'s values first, as many times as counted, then the leftover values in increasing order.',
      ],
      insight: 'Counting sort with a custom order: count the values, write arr2\'s values first using their counts, then sweep the count array upward for everything else.',
      approach: [
        'Count each value of arr1 in an array of 1001 slots.',
        'For each value in arr2, write it out as many times as counted and set its count to zero.',
        'Sweep the values 0..1000 and write out any value that still has a count.',
      ],
      ds: ['Count array'], time: 'O(n + m + k)', space: 'O(k)',
      traps: ['A comparator by position in arr2 also works in O(n log n); then unknown values must sort ascending after all known ones.'],
    },
    {
      id: 561, title: 'Array Partition', pattern: 'Counting sort',
      summary: 'Group 2n integers into n pairs so that the sum of the smaller value of each pair is as large as possible.',
      hints: [
        'The smallest value is the minimum of its pair whatever you do. Who should it be paired with?',
        'With the second smallest, so you lose as little as possible.',
        'So sort and add every other value. Values are small, so counting sort makes it linear.',
      ],
      insight: 'After sorting, pairing neighbours is optimal, so the answer is the sum of the values at even positions; counting sort over −10⁴..10⁴ makes it O(n + range).',
      approach: [
        'Count the values with an offset of 10⁴, so negative values fit in an array.',
        'Walk the counts in increasing order, alternately taking and skipping values.',
        'Add up the values you took.',
      ],
      ds: ['Count array'], time: 'O(n + k)', space: 'O(k)',
      traps: ['Negative values need an offset before they can index a count array.', 'When a value appears several times, the take/skip alternation carries on across its copies.'],
    },
    {
      id: 2037, title: 'Minimum Number of Moves to Seat Everyone', pattern: 'Counting sort',
      summary: 'Move n students to n seats, one student per seat, where each step of movement costs one move. Minimise the total moves.',
      hints: [
        'Should the leftmost student take the leftmost seat?',
        'Matching students and seats in sorted order is optimal: crossing assignments never help.',
        'Positions are at most 100, so counting sort both lists.',
      ],
      insight: 'Match the i-th smallest student position with the i-th smallest seat; any two crossing assignments can be uncrossed without increasing the total distance.',
      approach: ['Sort both lists (counting sort works, since positions are at most 100).', 'Add up the absolute differences of matching positions.'],
      ds: ['Count array'], time: 'O(n + k)', space: 'O(k)',
      traps: ['Several seats or students can share a position; counting handles that naturally.'],
    },
    {
      id: 1833, title: 'Maximum Ice Cream Bars', pattern: 'Counting sort',
      summary: 'Buy as many ice cream bars as possible with a fixed number of coins, where each bar has a price. The problem asks for counting sort.',
      hints: [
        'To buy the most bars, buy the cheapest ones first.',
        'Prices are at most 10⁵: count how many bars have each price.',
        'Walk the prices upward, buying as many bars at each price as the coins allow.',
      ],
      insight: 'Cheapest-first is optimal, and counting sort lets you walk the prices in order in O(n + max price) without sorting.',
      approach: [
        'Count the bars at each price.',
        'For each price p from 1 upward: buy the smaller of (bars at p) and ⌊coins / p⌋, and pay for them.',
        'Stop when the coins cannot buy a bar at the current price; return the number bought.',
      ],
      ds: ['Count array', 'Greedy'], time: 'O(n + m), m = largest price', space: 'O(m)',
      traps: ['Buy all affordable bars of one price at once with a division, rather than one by one.'],
    },
    {
      id: 274, title: 'H-Index', pattern: 'Counting sort', core: true,
      summary: 'Given the citation counts of a researcher\'s papers, return the largest h such that h papers have at least h citations each.',
      hints: [
        'The answer is at most n, the number of papers.',
        'Clamp every citation count to n and count how many papers fall into each bucket 0..n.',
        'Walk h from n down, keeping a running total of papers with at least h citations.',
      ],
      insight: 'Citations above n are as good as n, so n + 1 buckets suffice; a running total from the top finds the first h where at least h papers have h or more citations.',
      approach: [
        'Make buckets 0..n and add each paper to bucket min(citations, n).',
        'Walk h from n down to 0 with a running total of the papers in buckets h and above.',
        'Return the first h where the running total is at least h.',
      ],
      ds: ['Count array'], time: 'O(n)', space: 'O(n)',
      traps: ['Sorting descending and finding the last position i where citations ≥ i + 1 is the O(n log n) alternative.'],
    },
    {
      id: 3517, title: 'Smallest Palindromic Rearrangement I', pattern: 'Counting sort',
      summary: 'Given a palindrome, return the alphabetically smallest palindrome that uses exactly the same letters.',
      hints: [
        'A palindrome is decided by its first half (plus a middle letter if the length is odd).',
        'The smallest palindrome has its first half in alphabetical order.',
        'Count the letters: each letter gives half of its count to the first half.',
      ],
      insight: 'Count the letters, write the first half in alphabetical order using half of each count, put the letter with an odd count (if any) in the middle, and mirror the first half.',
      approach: [
        'Count the 26 letters.',
        'Build the first half by writing each letter, from a to z, half its count times.',
        'If the length is odd, the letter with an odd count goes in the middle.',
        'Append the first half reversed.',
      ],
      ds: ['Count array', 'String'], time: 'O(n)', space: 'O(n)',
      traps: ['The input is a palindrome, so at most one letter has an odd count.'],
    },

    // ---------- Bucket by frequency ----------
    {
      id: 347, title: 'Top K Frequent Elements', pattern: 'Bucket by frequency', core: true,
      summary: 'Return the k most frequent values. The answer is unique, and the solution must be faster than O(n log n).',
      hints: [
        'Count frequencies with a Map.',
        'A frequency is a whole number from 1 to n. What if it were an array index?',
        'Put each value into bucket[its frequency], then walk the buckets from the top.',
      ],
      insight: 'Frequencies are between 1 and n, so make n + 1 buckets indexed by frequency and walk them from high to low until you have k values: guaranteed O(n).',
      approach: [
        'Count each value with a Map.',
        'Create buckets 0..n and put each distinct value into the bucket for its frequency.',
        'Walk the buckets from n down, collecting values until you have k.',
      ],
      ds: ['Hash map', 'Array of buckets'], time: 'O(n)', space: 'O(n)',
      traps: ['The buckets are indexed by frequency, not by value.', 'Quickselect by frequency also works in O(n) on average (see Quickselect).'],
    },
    {
      id: 451, title: 'Sort Characters By Frequency', pattern: 'Bucket by frequency',
      summary: 'Rearrange a string so its characters appear in decreasing order of frequency, with all copies of a character together.',
      hints: [
        'Count each character.',
        'Frequencies range from 1 to the string length: bucket the characters by frequency.',
        'Walk the buckets from the highest frequency, writing each character as many times as it appears.',
      ],
      insight: 'Bucket sort by frequency writes characters from most to least frequent in linear time.',
      approach: [
        'Count the characters in a Map.',
        'Put each character into the bucket for its count.',
        'From the highest bucket down, write each character repeated by its count.',
        'Join the pieces into the result.',
      ],
      ds: ['Hash map', 'Array of buckets'], time: 'O(n)', space: 'O(n)',
      traps: ['Uppercase and lowercase letters are different characters.', 'All copies of a character must stay together, so write them in one block.'],
    },
    {
      id: 692, title: 'Top K Frequent Words', pattern: 'Bucket by frequency',
      summary: 'Return the k most frequent words, ordered by frequency from highest to lowest, and alphabetically among words with the same frequency.',
      hints: [
        'Count the words.',
        'Bucket them by frequency; only words in the same bucket need sorting, alphabetically.',
        'The follow-up asks for O(n log k): a heap of size k.',
      ],
      insight: 'Bucketing by frequency gives the frequency order for free; only words that share a frequency need an alphabetical sort.',
      approach: [
        'Count the words in a Map.',
        'Put each word into the bucket for its frequency.',
        'Walk the buckets from the highest frequency: sort each bucket alphabetically and take words until you have k.',
      ],
      ds: ['Hash map', 'Array of buckets', 'Sorting'], time: 'O(n log n) worst case, for sorting inside buckets', space: 'O(n)',
      traps: [
        'Alphabetical order breaks ties, so a frequency-only order is not enough.',
        'For the heap follow-up, keep a min-heap of size k in which "smaller" means lower frequency or, for equal frequency, alphabetically later.',
      ],
    },

    // ---------- Buckets by value range ----------
    {
      id: 164, title: 'Maximum Gap', pattern: 'Buckets by value range', core: true,
      summary: 'Return the largest difference between neighbouring values in the sorted order of an array, using linear time and linear extra space.',
      hints: [
        'With n values between min and max, the average gap between sorted neighbours is (max − min) / (n − 1).',
        'The largest gap is at least that average, so it cannot fit inside a bucket of that width.',
        'Keep only the minimum and maximum of each bucket, and compare neighbouring non-empty buckets.',
      ],
      insight: 'Pigeonhole: a bucket narrower than the average gap cannot contain the maximum gap, so the maximum gap always runs from one bucket\'s maximum to the next non-empty bucket\'s minimum.',
      approach: [
        'If there are fewer than 2 values, or all values are equal, return 0.',
        'Bucket width = max(1, ⌊(max − min) / (n − 1)⌋); number of buckets = ⌊(max − min) / width⌋ + 1.',
        'For each value, update the minimum and maximum of its bucket.',
        'Walk the non-empty buckets in order; the answer is the largest (bucket minimum − previous bucket maximum).',
      ],
      ds: ['Array of buckets (min and max only)'], time: 'O(n)', space: 'O(n)',
      traps: ['Sorting is O(n log n), which the problem forbids.', 'When all values are equal the width formula divides by zero: handle that case first.', 'Radix sort is the other linear solution.'],
    },
    {
      id: 220, title: 'Contains Duplicate III', pattern: 'Buckets by value range',
      summary: 'Decide whether two different indices at most indexDiff apart hold values at most valueDiff apart.',
      hints: [
        'Keep only the last indexDiff values: a sliding window.',
        'Bucket values by width valueDiff + 1: any two values in the same bucket are close enough.',
        'Close values can also sit in neighbouring buckets, so check those two buckets too.',
      ],
      insight: 'With buckets of width valueDiff + 1, two values in one bucket always qualify, so each bucket holds at most one value of the window, and only the two neighbouring buckets need a real comparison.',
      approach: [
        'Walk the array and compute each value\'s bucket: ⌊value / (valueDiff + 1)⌋.',
        'If that bucket already holds a value, the answer is true. If a neighbouring bucket holds a value within valueDiff, the answer is true.',
        'Store the value in its bucket.',
        'Once the window holds more than indexDiff values, remove the bucket of the value that leaves.',
      ],
      ds: ['Hash map of buckets', 'Sliding window'], time: 'O(n)', space: 'O(min(n, indexDiff))',
      traps: [
        'Negative values need floor, not truncation toward zero, to get the bucket. Math.floor in TypeScript is correct; other languages need care.',
        'An ordered set with floor and ceiling queries is the O(n log k) alternative.',
      ],
    },

    // ---------- Radix sort ----------
    {
      id: 2343, title: 'Query Kth Smallest Trimmed Number', pattern: 'Radix sort',
      summary: 'All strings are digit strings of the same length. For each query (k, trim), keep only the last trim digits of every string and report the index of the k-th smallest; equal values are ranked by index.',
      hints: [
        'Each query is a selection with a tie-break by index.',
        'With at most 100 strings and 100 queries, sorting for each query is fast enough.',
        'The follow-up: radix sort by digit from the right gives the order for every trim length in one go.',
      ],
      insight: 'Least-significant-digit radix sort handles digits right to left, and after t passes the order is exactly the sorted order of the numbers trimmed to t digits, with ties already broken by index because each pass is stable.',
      approach: [
        'Start with the order of indices 0..n − 1.',
        'For t = 1 up to the string length: stably bucket the current order by the t-th digit from the right, and save the new order as the order for trim t.',
        'Answer each query (k, trim) with the (k − 1)-th index of the saved order for that trim.',
      ],
      ds: ['Array of indices', '10 buckets per pass'], time: 'O(L · n + q)', space: 'O(L · n)',
      traps: ['Strings can have leading zeros, so compare them as fixed-length digit strings, not as numbers.', 'The tie-break by index needs every pass to be stable.'],
    },
  ],
};
