import type { Topic } from './types';

export const topic: Topic = {
  id: 'string-matching',
  patterns: [
    { name: 'KMP prefix table', idea: 'For every prefix of the pattern, the length of its longest border (proper prefix that is also a suffix). It lets a scan slide the pattern without ever moving back in the text.' },
    { name: 'Z-array', idea: 'For every position, how far the string matches its own beginning. Glue pattern + separator + text, and every position with a Z value of m is a match.' },
    { name: 'Palindromes in linear time', idea: 'Manacher reuses mirror images inside the rightmost palindrome found so far, so all palindromic radii take O(n) in total.' },
    { name: 'Rotations and lexicographic order', idea: 'Rotations live inside s + s; the smallest rotation and the largest suffix can be found with a two-pointer comparison in O(n).' },
    { name: 'Many patterns at once', idea: 'Aho–Corasick puts all patterns in a trie and adds failure links (KMP generalised), so one pass over the text finds every pattern.' },
  ],
  signals: [
    { see: 'Find one pattern in a text, with n and m up to 10⁵–10⁶', think: 'KMP or the Z-algorithm', why: 'Both are O(n + m) and exact; the naive scan can be O(n · m).' },
    { see: '"Longest prefix that is also a suffix", "made of a repeated block", "period of a string"', think: 'The last value of the KMP prefix table', why: 'The border length gives the shortest period: n − border.' },
    { see: '"Longest common prefix of the string with each of its suffixes" or "of each position with the start"', think: 'Z-array', why: 'That is exactly its definition, computed in O(n).' },
    { see: 'Longest palindromic substring, count palindromes, n up to 10⁵', think: "Manacher's algorithm", why: 'Expanding around every centre is O(n²) in the worst case; Manacher is O(n).' },
    { see: 'Rotations of a string, or "lexicographically smallest/largest" rotation or suffix', think: 's + s, and a two-pointer comparison (Booth, Duval)', why: 'Every rotation is a window of s + s, and comparisons can skip whole blocks.' },
    { see: 'Many dictionary words to find in one text or a stream of characters', think: 'Aho–Corasick (or a reversed trie for a stream)', why: 'One automaton finds all patterns in a single pass.' },
    { see: 'Match a pattern of comparisons (up, down, equal) rather than letters', think: 'Turn the data into a string of symbols, then KMP', why: 'Any equality-based pattern works on any sequence of comparable symbols.' },
  ],
  problems: [
    // ---------- KMP prefix table ----------
    {
      id: 28, title: 'Find the Index of the First Occurrence in a String', pattern: 'KMP prefix table', core: true,
      summary: 'Return the index where one string first appears inside another, or −1 if it never does.',
      hints: [
        'After a partial match fails, the naive method restarts one position later and rereads letters it already knows.',
        'Precompute, for each prefix of the pattern, its longest proper prefix that is also a suffix.',
        'On a mismatch, keep that many letters as already matched and continue from the same text position.',
      ],
      insight: 'KMP never moves the text pointer back: on a mismatch it drops to the longest border of what matched so far, taken from the prefix table, so the scan is O(n + m).',
      approach: [
        'Build the prefix table of the pattern.',
        'Scan the text with i, keeping j = number of pattern letters matched.',
        'While j > 0 and text[i] differs from pattern[j], set j to pi[j − 1].',
        'If the letters match, increase j; when j reaches m, return i − m + 1.',
        'Return −1 after the scan.',
      ],
      ds: ['Prefix table (integer array)'], time: 'O(n + m)', space: 'O(m)',
      traps: ['The built-in indexOf is fine in practice, but interviews for this problem usually want KMP or Rabin–Karp explained.'],
    },
    {
      id: 459, title: 'Repeated Substring Pattern', pattern: 'KMP prefix table', core: true,
      summary: 'Decide whether a string is made of some shorter block written two or more times in a row.',
      hints: [
        'If s is a repeated block, the block length is a period of s.',
        'The shortest period of s is n minus the length of its longest border.',
        'Check that the border exists and that the period divides n.',
      ],
      insight: 'With border b = pi[n − 1], the shortest period is p = n − b; s is a repetition exactly when b > 0 and p divides n.',
      approach: ['Build the prefix table of s.', 'Let b be its last value and p = n − b.', 'Return true if b > 0 and n is a multiple of p.'],
      ds: ['Prefix table'], time: 'O(n)', space: 'O(n)',
      traps: [
        'Another classic trick: s is a repetition exactly when s appears inside (s + s) with the first and last letters removed.',
        'b > 0 alone is not enough: "abcab" has a border of length 2, but its period 3 does not divide 5.',
      ],
    },
    {
      id: 686, title: 'Repeated String Match', pattern: 'KMP prefix table',
      summary: 'Find the fewest copies of string a that, written one after another, contain string b as a substring, or −1.',
      hints: [
        'b must start somewhere inside the first copy of a.',
        'So b fits within ceil(|b| / |a|) copies, or one more copy if it starts late in the first one.',
        'Search for b in the repeated text with KMP.',
      ],
      insight: 'Any occurrence of b starts within the first copy of a, so only q = ceil(|b| / |a|) or q + 1 copies are worth checking; one linear search in q + 1 copies decides it.',
      approach: [
        'Let q = ceil(|b| / |a|) and build t = a repeated q + 1 times.',
        'Find the first occurrence of b in t with KMP.',
        'If none, return −1. If it ends within the first q copies, return q; otherwise return q + 1.',
      ],
      ds: ['String', 'Prefix table'], time: 'O(|a| + |b|)', space: 'O(|a| + |b|)',
      traps: ['Trying ever more copies without a bound loops forever when there is no answer.'],
    },
    {
      id: 1764, title: 'Form Array by Concatenating Subarrays of Another Array', pattern: 'KMP prefix table',
      summary: 'Decide whether you can find each group, in order, as non-overlapping contiguous pieces of an array.',
      hints: [
        'Taking the earliest possible match for each group is always best: it leaves the most room for the rest.',
        'So search for group 0 from the start, then group 1 right after that match, and so on.',
        'Use KMP for each search so the total work stays linear.',
      ],
      insight: 'Greedy plus KMP: match each group at its earliest occurrence after the previous match; earliest is never worse, and KMP makes every search linear.',
      approach: [
        'Set a position pointer to 0.',
        'For each group, search for it in nums starting at the pointer (KMP on numbers).',
        'If not found, return false; otherwise move the pointer to just after the match.',
        'Return true when every group is placed.',
      ],
      ds: ['Prefix table on number arrays'], time: 'O(n + total group length)', space: 'O(longest group)',
      traps: ['Matches must not overlap: continue after the end of the previous match, not after its start.'],
    },
    {
      id: 3036, title: 'Number of Subarrays That Match a Pattern II', pattern: 'KMP prefix table',
      summary: 'A pattern of 1, 0 and −1 describes rises, equals and falls between neighbours. Count the windows of the array whose neighbour comparisons follow the pattern exactly. n can be 10⁶.',
      hints: [
        'Turn the array into a sequence of comparisons between neighbours: 1, 0 or −1.',
        'Now you need the number of occurrences of the pattern inside that sequence.',
        'Use KMP (or the Z-algorithm) on the two number sequences.',
      ],
      insight: 'Rewrite nums as the sequence of signs of nums[i + 1] − nums[i]; matching windows are exactly occurrences of the pattern in that sequence, which KMP counts in O(n + m).',
      approach: [
        'Build c of length n − 1 with c[i] = sign(nums[i + 1] − nums[i]).',
        'Build the prefix table of the pattern.',
        'Scan c with KMP; each time the match length reaches m, count it and continue from pi[m − 1].',
        'Return the count.',
      ],
      ds: ['Array of signs', 'Prefix table'], time: 'O(n + m)', space: 'O(n + m)',
      traps: ['The easy version allows checking every window; here 10⁶ × 10⁶ is impossible.', 'Overlapping occurrences all count; continue from the border, not from zero.'],
    },
    {
      id: 1392, title: 'Longest Happy Prefix', pattern: 'KMP prefix table', core: true,
      summary: 'Return the longest proper prefix of a string that is also a suffix, or an empty string.',
      hints: ['This is exactly what the prefix table stores, for the whole string.', 'Build the table and read its last entry.'],
      insight: 'The last value of the KMP prefix table is the length of the longest border of the whole string.',
      approach: ['Build the prefix table of s.', 'Return the first pi[n − 1] characters of s.'],
      ds: ['Prefix table'], time: 'O(n)', space: 'O(n)',
      traps: ['The whole string does not count: borders are proper prefixes.'],
    },
    {
      id: 214, title: 'Shortest Palindrome', pattern: 'KMP prefix table', core: true,
      summary: 'Add as few characters as possible to the front of a string to make it a palindrome, and return the result.',
      hints: [
        'Whatever you add, the original string must start with a palindrome that you keep in the middle.',
        'You want the longest palindromic prefix of s.',
        'A prefix of s is a palindrome when it equals a suffix of reverse(s): look at the border of s + "#" + reverse(s).',
      ],
      insight: 'The longest palindromic prefix of s is the longest border of s + "#" + reverse(s); put the reverse of the remaining suffix in front.',
      approach: [
        'Build t = s + "#" + reverse(s) (the separator stops a border from crossing the middle).',
        'Compute the prefix table of t; L = its last value is the length of the longest palindromic prefix.',
        'Return reverse(s[L..]) + s.',
      ],
      ds: ['String', 'Prefix table'], time: 'O(n)', space: 'O(n)',
      traps: ['Without the separator, the border can be longer than s itself.', 'The empty string returns itself.'],
    },
    {
      id: 3008, title: 'Find Beautiful Indices in the Given Array II', pattern: 'KMP prefix table',
      summary: 'Return, in order, every position where string a occurs in s such that string b occurs at some position within distance k. All lengths can be 5 × 10⁵.',
      hints: [
        'First find all occurrences of a and of b: two linear searches.',
        'Both lists come out sorted.',
        'For each occurrence of a, check the nearest occurrence of b with a moving pointer or a binary search.',
      ],
      insight: 'Two KMP searches give sorted occurrence lists; then a two-pointer walk (or binary search) checks for each a-position whether some b-position lies within k.',
      approach: [
        'Find all start positions of a in s and of b in s with KMP.',
        'Walk through the a-positions with a pointer into the b-positions.',
        'Advance the b-pointer while b-position < a-position − k.',
        'If the current b-position exists and is ≤ a-position + k, the a-position is beautiful.',
      ],
      ds: ['Prefix tables', 'Two sorted lists', 'Two pointers'], time: 'O(|s| + |a| + |b|)', space: 'O(|s| + |a| + |b|)',
      traps: ['The built-in search restarted at every position can degrade to O(n · m) on inputs like "aaaa…".'],
    },

    // ---------- Z-array ----------
    {
      id: 2223, title: 'Sum of Scores of Built Strings', pattern: 'Z-array',
      summary: 'For every suffix of a string, take the length of its longest common prefix with the whole string, and return the sum.',
      hints: ['That is the definition of the Z-array, plus the whole string itself.', 'Compute the Z-array in O(n) and add it up.'],
      insight: 'The score of each suffix is exactly its Z value (with z[0] = n for the whole string), so the answer is the sum of the Z-array.',
      approach: ['Compute the Z-array of s with the Z-box method.', 'Set z[0] = n.', 'Return the sum of all entries.'],
      ds: ['Z-array'], time: 'O(n)', space: 'O(n)',
      traps: ['The sum can reach about 5 × 10⁹: fine in a JavaScript number.', 'Comparing each suffix letter by letter is O(n²) on strings like "aaaa…".'],
    },
    {
      id: 3031, title: 'Minimum Time to Revert Word to Initial State II', pattern: 'Z-array',
      summary: 'Every second, the first k characters of a word are removed and any k characters appended. Find the smallest positive time when the word can be the original again, for words up to 10⁶ characters.',
      hints: [
        'After t seconds, the surviving original characters are word[t·k ..], now at the front.',
        'The word can be restored when that suffix equals the prefix of the same length.',
        'z[t·k] tells you how long the match with the prefix is.',
      ],
      insight: 'The answer is the smallest t ≥ 1 with t·k ≥ n or z[t·k] ≥ n − t·k, where z is the Z-array of the word.',
      approach: [
        'Compute the Z-array of the word.',
        'For t = 1, 2, …: if t·k ≥ n, return t.',
        'If z[t·k] equals n − t·k (the rest of the word matches the prefix), return t.',
      ],
      ds: ['Z-array'], time: 'O(n)', space: 'O(n)',
      traps: ['Remember the fallback: when t·k reaches n, nothing original remains and the word can always be rebuilt.'],
    },
    {
      id: 3303, title: 'Find the Occurrence of First Almost Equal Substring', pattern: 'Z-array',
      summary: 'Return the first position where a window of s differs from a pattern in at most one character, or −1.',
      hints: [
        'A window differs in at most one letter if its longest match with the pattern from the left plus its longest match from the right covers m − 1 letters.',
        'Z-array of pattern + "#" + s gives the match from the left at every position.',
        'Do the same with both strings reversed to get the match from the right.',
      ],
      insight: 'Prefix matches (Z of pattern + # + s) and suffix matches (Z of the reversed strings) at each window add up to at least m − 1 exactly when at most one character differs.',
      approach: [
        'Compute z1 = Z-array of pattern + "#" + s, and z2 = Z-array of reverse(pattern) + "#" + reverse(s).',
        'For each window start i, read the forward match length from z1 at i and the backward match length from z2 at the position of the window\'s end in the reversed string.',
        'If the two lengths add up to at least m − 1, return i.',
        'Return −1 if no window qualifies.',
      ],
      ds: ['Two Z-arrays'], time: 'O(n + m)', space: 'O(n + m)',
      traps: ['Getting the reversed index right is the hard part: the window [i, i + m) ends at position n − (i + m) in the reversed text.', 'An exact match also counts (zero differences).'],
    },

    // ---------- Palindromes in linear time ----------
    {
      id: 5, title: 'Longest Palindromic Substring', pattern: 'Palindromes in linear time', core: true,
      summary: 'Return the longest substring of a string that reads the same forwards and backwards.',
      hints: [
        'Every palindrome has a centre: a character (odd length) or a gap between two characters (even length).',
        'Expanding around each of the 2n − 1 centres is O(n²) and passes for n = 1000.',
        'Manacher reuses the mirror image inside the rightmost palindrome found so far to reach O(n).',
      ],
      insight: 'Expand around every centre; Manacher speeds this up by starting each centre at its mirror\'s radius when it lies inside a known palindrome, so the right edge only moves forward.',
      approach: [
        'Simple version: for each centre (both odd and even), expand while the two ends match, and keep the longest.',
        'Manacher: process centres left to right, keeping the palindrome [l, r] that reaches furthest right.',
        'For a centre inside it, start from min(radius of the mirror centre, r − i + 1); otherwise from 1. Then expand.',
        'Update [l, r] when the new palindrome reaches further, and track the longest.',
      ],
      ds: ['String', 'Radius arrays'], time: 'O(n) Manacher, O(n²) expansion', space: 'O(n) Manacher, O(1) expansion',
      traps: ['Handle even-length palindromes too: run a second pass for gaps, or insert a separator between all characters.'],
    },
    {
      id: 647, title: 'Palindromic Substrings', pattern: 'Palindromes in linear time',
      summary: 'Count all substrings that are palindromes (the same substring at different positions counts separately).',
      hints: ['A centre with radius r contributes r palindromes.', 'Sum the radii over all odd and even centres.'],
      insight: 'Each palindrome is identified by its centre and radius, so the count is the sum over all centres of their maximal radii, which Manacher computes in O(n).',
      approach: [
        'Compute odd radii d1 (including the single character) and even radii d2 for every centre.',
        'Add up all d1 and d2 values.',
        'Return the sum.',
      ],
      ds: ['Radius arrays'], time: 'O(n) Manacher, O(n²) expansion', space: 'O(n)',
      traps: ['Single letters are palindromes and count.'],
    },
    {
      id: 1960, title: 'Maximum Product of the Length of Two Palindromic Substrings', pattern: 'Palindromes in linear time',
      summary: 'Choose two non-overlapping odd-length palindromic substrings to maximise the product of their lengths; n can be 10⁵.',
      hints: [
        'Split the string at a cut: one palindrome lies left of it, one right.',
        'You need, for every prefix, the longest odd palindrome inside it, and the same for every suffix.',
        'Manacher gives every centre\'s radius; turn that into "longest palindrome ending at or before i" with a sweep.',
      ],
      insight: 'Manacher radii plus two sweeps give left[i] (best odd palindrome within s[0..i]) and right[i] (best within s[i..]); the answer is the max of left[i] × right[i + 1].',
      approach: [
        'Run Manacher for odd palindromes to get each centre\'s radius.',
        'For each centre, its palindrome ends at c + r − 1: record length 2r − 1 there. Sweep right to left letting a palindrome ending at e also count as one of length 2 shorter ending at e − 1.',
        'Take running maximums to get left[i]; build right[i] the same way from the other side.',
        'Return the largest left[i] × right[i + 1].',
      ],
      ds: ['Radius array', 'Prefix and suffix maximum arrays'], time: 'O(n)', space: 'O(n)',
      traps: ['Only odd lengths count.', 'Shrinking a palindrome by one letter on each side keeps it a palindrome, which is why the "minus 2" sweep is valid.'],
    },

    // ---------- Rotations and lexicographic order ----------
    {
      id: 796, title: 'Rotate String', pattern: 'Rotations and lexicographic order', core: true,
      summary: 'Decide whether one string can be turned into another by repeatedly moving its first character to the end.',
      hints: ['Write the string twice in a row. What do all its rotations have in common?', 'Every rotation of s is a substring of s + s of length |s|.'],
      insight: 'goal is a rotation of s exactly when the lengths are equal and goal occurs inside s + s.',
      approach: ['If the lengths differ, return false.', 'Search for goal inside s + s (KMP or built-in search).', 'Return whether it was found.'],
      ds: ['String'], time: 'O(n) with KMP', space: 'O(n)',
      traps: ['Without the length check, "a" would be found inside "abab" for s = "ab".'],
    },
    {
      id: 899, title: 'Orderly Queue', pattern: 'Rotations and lexicographic order',
      summary: 'You may repeatedly take one of the first k letters and move it to the end. Return the smallest string reachable.',
      hints: [
        'With k = 1 you can only rotate the string.',
        'With k ≥ 2 you can swap two neighbours (in effect), which means you can sort.',
        'So: k ≥ 2, return the sorted letters; k = 1, return the smallest rotation.',
      ],
      insight: 'k ≥ 2 allows any permutation, so the answer is the sorted string; k = 1 allows only rotations, so the answer is the lexicographically minimal rotation (Booth\'s algorithm, or try all n rotations).',
      approach: [
        'If k ≥ 2, sort the letters and return them.',
        'If k = 1, find the smallest rotation: compare all n rotations (O(n²), fine for n ≤ 1000), or run Booth\'s algorithm on s + s in O(n).',
        'Return that rotation.',
      ],
      ds: ['String', 'Sorting'], time: 'O(n log n) for k ≥ 2; O(n²), or O(n) with Booth, for k = 1', space: 'O(n)',
      traps: ['The k ≥ 2 case is the surprise: convince yourself that moving one of the first two letters lets you bubble-sort.'],
    },
    {
      id: 1163, title: 'Last Substring in Lexicographical Order', pattern: 'Rotations and lexicographic order',
      summary: 'Return the substring of a string that comes last in dictionary order; n can be 4 × 10⁵.',
      hints: [
        'The answer is always a suffix: extending a substring to the end only makes it larger.',
        'Compare two candidate suffix starts i and j letter by letter with an offset k.',
        'When they differ, the loser\'s whole compared block can be skipped, not just one position.',
      ],
      insight: 'Keep the best start i and a challenger j. Compare s[i + k] with s[j + k]; when the challenger loses, jump j past the block (j + k + 1); when it wins, jump i past its block. Each jump skips k + 1 starts, so the scan is O(n).',
      approach: [
        'i = 0, j = 1, k = 0.',
        'While j + k < n: if s[i + k] equals s[j + k], increase k.',
        'If s[i + k] is larger, the starts j … j + k all lose: set j = j + k + 1 and k = 0.',
        'If s[j + k] is larger, the starts i … i + k all lose: set i = max(i + k + 1, j), j = i + 1, k = 0. Return the suffix from i.',
      ],
      ds: ['String', 'Three indices'], time: 'O(n)', space: 'O(1)',
      traps: ['Comparing all suffixes directly is O(n²) on strings like "zzzz…z".', 'This is the same skip idea as the minimal rotation algorithms; a suffix array would also give it as the last suffix.'],
    },

    // ---------- Many patterns at once ----------
    {
      id: 1032, title: 'Stream of Characters', pattern: 'Many patterns at once',
      summary: 'Characters arrive one by one; after each one, report whether some word from a dictionary ends at the latest character.',
      hints: [
        'Checking every word against the recent characters is too slow.',
        'Put all words in a trie and add failure links: where to continue when the next letter does not extend the current match.',
        'Mark a state as accepting if it, or any state reached by following its failure links, ends a word.',
      ],
      insight: 'Aho–Corasick: the trie with failure links is a single automaton over all words; each character moves one state (amortised O(1)), and an accepting state means some word ends here.',
      approach: [
        'Insert all words into a trie and mark word ends.',
        'Build failure links breadth first: a child\'s failure is found by following its parent\'s failure links until one has the same letter.',
        'Make each node accepting if it ends a word or its failure node is accepting.',
        'For each query letter, move the current state (following failure links on a miss) and return whether the new state is accepting.',
      ],
      ds: ['Trie', 'Failure links', 'Queue for BFS'], time: 'O(total word length × alphabet) build, amortised O(1) per letter', space: 'O(total word length)',
      traps: [
        'A simpler accepted approach: a trie of reversed words, checked against the last 200 letters (the longest word) after each query.',
        'Do not forget to propagate the accepting flag along failure links, or words that end inside a longer match are missed.',
      ],
    },
  ],
};
