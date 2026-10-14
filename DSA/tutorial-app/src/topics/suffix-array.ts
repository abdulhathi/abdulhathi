import type { Topic } from './types';

export const topic: Topic = {
  id: 'suffix-array',
  patterns: [
    { name: 'Suffix array and LCP', idea: 'Sort all suffixes; neighbours in that order share the longest prefixes, and the LCP array of neighbours answers repeat and distinct-substring questions.' },
    { name: 'Comparing a suffix with the whole string', idea: 'The LCP of any two suffixes is the minimum LCP between their ranks: a range-minimum query on the LCP array.' },
    { name: 'Several sequences at once', idea: 'Join the sequences with unique separators and build one suffix array; a window of sorted suffixes that covers every sequence shares a common prefix.' },
    { name: 'Matching many words against one text', idea: 'All suffixes that start with a word form one block of the suffix array, found by binary search, so every word\'s occurrences come out at once.' },
  ],
  signals: [
    { see: '"Longest repeated substring", "longest duplicate", "number of distinct substrings"', think: 'Suffix array + LCP array', why: 'Repeats are common prefixes of two suffixes, and the closest suffixes in sorted order share the most.' },
    { see: 'Questions about every substring of a string of length up to 10⁵', think: 'Suffix structures (array, automaton or tree)', why: 'There are n² / 2 substrings, but they are all prefixes of n suffixes.' },
    { see: '"Longest common substring of several strings"', think: 'One suffix array of the strings joined with unique separators', why: 'A common substring is a common prefix of suffixes from every string.' },
    { see: 'The answer is the largest or smallest suffix in dictionary order', think: 'The last or first entry of the suffix array', why: 'The suffix array is exactly the suffixes in order.' },
    { see: 'You could hash, but the tests may be adversarial and you want a deterministic answer', think: 'Suffix array instead of rolling hash', why: 'No collisions are possible; the cost is O(n log n) or O(n log² n).' },
  ],
  problems: [
    // ---------- Suffix array and LCP ----------
    {
      id: 1044, title: 'Longest Duplicate Substring', pattern: 'Suffix array and LCP', core: true,
      summary: 'Return any longest substring that occurs at least twice in a string (occurrences may overlap), or an empty string.',
      hints: [
        'A repeated substring is a common prefix of two different suffixes.',
        'Sort the suffixes: the two suffixes sharing the longest prefix are neighbours in sorted order.',
        'Build the LCP array of neighbours and take its maximum.',
      ],
      insight: 'The longest repeated substring is the largest LCP between neighbouring suffixes in the suffix array, because the best pair of suffixes is always adjacent in sorted order.',
      approach: [
        'Build the suffix array by prefix doubling.',
        'Build the LCP array with Kasai\'s algorithm.',
        'Find the position r with the largest LCP value.',
        'Return the substring of that length starting at sa[r].',
      ],
      ds: ['Suffix array', 'LCP array'], time: 'O(n log n) to O(n log² n)', space: 'O(n)',
      traps: [
        'Why neighbours: if suffix A sorts before B before C, then LCP(A, C) is at most min(LCP(A, B), LCP(B, C)).',
        'The rolling-hash binary search also works; the suffix array is deterministic.',
      ],
    },
    {
      id: 1062, title: 'Longest Repeating Substring', pattern: 'Suffix array and LCP', core: true,
      summary: 'Return the length of the longest substring that occurs at least twice in a string.',
      hints: ['This is problem 1044 asking only for the length.', 'Largest value in the LCP array.'],
      insight: 'The answer is the maximum of the LCP array: neighbouring suffixes in sorted order share the longest prefixes.',
      approach: ['Build the suffix array.', 'Build the LCP array with Kasai.', 'Return its maximum.'],
      ds: ['Suffix array', 'LCP array'], time: 'O(n log n)', space: 'O(n)',
      traps: ['With n ≤ 2000, an O(n²) DP on common suffix lengths (dp[i][j] = dp[i − 1][j − 1] + 1 when s[i] = s[j], i ≠ j) also passes.'],
    },
    {
      id: 1698, title: 'Number of Distinct Substrings in a String', pattern: 'Suffix array and LCP', core: true,
      summary: 'Count how many different non-empty substrings a string has.',
      hints: [
        'Every substring is a prefix of some suffix.',
        'Walk the suffixes in sorted order. How many of each suffix\'s prefixes have not appeared in an earlier suffix?',
        'Exactly those longer than its LCP with the previous suffix.',
      ],
      insight: 'In sorted order, suffix sa[r] contributes (its length − lcp[r]) new substrings, so the count is n(n + 1)/2 minus the sum of the LCP array.',
      approach: ['Build the suffix array and the LCP array.', 'Compute n(n + 1)/2.', 'Subtract the sum of all LCP values.', 'Return the result.'],
      ds: ['Suffix array', 'LCP array'], time: 'O(n log n)', space: 'O(n)',
      traps: ['A Set of all substrings is O(n³) characters of work; a trie of all suffixes is O(n²), fine only for small n.'],
    },
    {
      id: 3934, title: 'Smallest Unique Subarray', pattern: 'Suffix array and LCP',
      summary: 'Find the shortest length of a contiguous subarray that appears exactly once in the array.',
      hints: [
        'A subarray starting at i is unique when no other suffix shares that many first values with suffix i.',
        'In sorted order, the most similar suffixes are the neighbours.',
        'For each suffix, the shortest unique prefix is one longer than the larger of its two neighbouring LCPs.',
      ],
      insight: 'For the suffix at rank r, its shortest unique prefix has length max(lcp[r], lcp[r + 1]) + 1, valid if the suffix is that long; the answer is the minimum over all suffixes.',
      approach: [
        'Build a suffix array and LCP array over the integer array (values compare as numbers).',
        'For each rank r, compute need as max(lcp with the previous suffix, lcp with the next suffix) + 1.',
        'If need is at most the suffix\'s length, it is a candidate.',
        'Return the smallest candidate (the whole array is always unique).',
      ],
      ds: ['Suffix array on integers', 'LCP array'], time: 'O(n log n)', space: 'O(n)',
      traps: [
        'Alternative: "a unique subarray of length L exists" is monotone in L (extend a unique one by a neighbour), so binary search with hashing also works.',
        'Values go up to 10⁵: rank them, or compare them directly, but do not map them to letters.',
      ],
    },
    {
      id: 1163, title: 'Last Substring in Lexicographical Order', pattern: 'Suffix array and LCP',
      summary: 'Return the substring of a string that comes last in dictionary order.',
      hints: ['The answer is always a whole suffix.', 'Which suffix sits at the end of the suffix array?'],
      insight: 'The largest substring is the largest suffix, which is the last entry of the suffix array (the two-pointer skip in the String matching chapter finds it in O(n) too).',
      approach: ['Build the suffix array.', 'Return the suffix starting at its last entry.'],
      ds: ['Suffix array'], time: 'O(n log n)', space: 'O(n)',
      traps: ['n is 4 × 10⁵: an O(n log² n) doubling with a comparison sort is slow in JavaScript; prefer radix-sorting the pairs, or the O(n) two-pointer method.'],
    },

    // ---------- Comparing a suffix with the whole string ----------
    {
      id: 2223, title: 'Sum of Scores of Built Strings', pattern: 'Comparing a suffix with the whole string',
      summary: 'For every suffix of a string, take its longest common prefix with the whole string, and return the sum.',
      hints: [
        'The LCP of two suffixes is the minimum of the LCP array between their ranks.',
        'So each score is a range minimum between rank[0] and rank[i].',
        'A sparse table answers those in O(1). (The Z-array is the shorter route.)',
      ],
      insight: 'LCP(suffix 0, suffix i) is the minimum LCP value strictly between their positions in the suffix array, so a sparse table over the LCP array gives every score in O(1).',
      approach: [
        'Build the suffix array, rank array and LCP array.',
        'Build a sparse table for range minimum over the LCP array.',
        'For each i ≥ 1, take the minimum LCP between ranks min(rank[0], rank[i]) + 1 and max(rank[0], rank[i]); add it to the total.',
        'Add n for the whole string, and return the total.',
      ],
      ds: ['Suffix array', 'LCP array', 'Sparse table'], time: 'O(n log n)', space: 'O(n log n)',
      traps: ['Here the Z-array gives the same answer in O(n) with far less code; use the suffix array version to practise LCP range queries.'],
    },

    // ---------- Several sequences at once ----------
    {
      id: 1923, title: 'Longest Common Subpath', pattern: 'Several sequences at once',
      summary: 'Each friend walks a path of cities. Return the length of the longest contiguous sequence of cities that appears in every path.',
      hints: [
        'Join all paths into one array, separated by values that occur nowhere else (a different separator after each path).',
        'Build the suffix array and LCP array of the joined array, and remember which path each suffix starts in.',
        'Slide a window over the sorted suffixes that contains at least one suffix from every path; its common prefix is the minimum LCP inside it.',
      ],
      insight: 'A common subpath is a common prefix of suffixes from all paths. In the suffix array, take every minimal window that covers all paths; the best answer is the largest minimum LCP over those windows, found with a sliding window and a monotonic deque.',
      approach: [
        'Concatenate the paths, appending a unique separator (for example n + path index) after each one; record each position\'s path.',
        'Build the suffix array and LCP array (separators stop matches at path ends).',
        'Slide a window over ranks, counting how many suffixes of each path it holds; shrink from the left while every path stays covered.',
        'For each covering window, the common prefix length is the minimum LCP inside it (monotonic deque); return the largest.',
      ],
      ds: ['Suffix array on integers', 'LCP array', 'Count per path', 'Monotonic deque'], time: 'O(N log N) for total length N', space: 'O(N)',
      traps: [
        'Separators must all differ from each other and from every city, or matches run across path boundaries.',
        'Binary search on the length with double hashing is the more common solution; know both.',
      ],
    },

    // ---------- Matching many words against one text ----------
    {
      id: 3213, title: 'Construct String with Minimum Cost', pattern: 'Matching many words against one text',
      summary: 'Build a target string by appending words, each with a cost. Return the minimum total cost, or −1 if it cannot be done.',
      hints: [
        'Let dp[i] be the cheapest way to build the first i characters.',
        'From position i you can append any word that occurs in the target starting at i.',
        'Find every word\'s occurrences at once: in the target\'s suffix array, the suffixes starting with a word form one block.',
      ],
      insight: 'DP over positions, where the moves out of position i are the words occurring at i. A suffix array of the target locates all occurrences of each word by binary search, and there are at most a few hundred distinct word lengths, so the edges stay manageable.',
      approach: [
        'Build the suffix array of the target. For each word, binary search the block of suffixes that start with it; each suffix in the block is an occurrence (keep the cheapest cost per word text).',
        'Record, for each start position, the (length, cost) moves available there.',
        'dp[0] = 0; for i from 0 to n − 1 with finite dp[i], relax dp[i + length] with dp[i] + cost for each move at i.',
        'Return dp[n], or −1 if it is still infinite.',
      ],
      ds: ['Suffix array', 'DP array', 'Moves per position'], time: 'O(n √S + S log n) roughly, S = total word length', space: 'O(n √S)',
      traps: [
        'Group words by length: the lengths sum to at most 5 × 10⁴, so there are at most about 316 distinct lengths. Hashing each length\'s words and checking every position is a simpler accepted method.',
        'Keep the cheapest cost for duplicate words.',
      ],
    },
  ],
};
