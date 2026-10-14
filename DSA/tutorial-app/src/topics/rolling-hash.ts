import type { Topic } from './types';

export const topic: Topic = {
  id: 'rolling-hash',
  patterns: [
    { name: 'Fixed-length windows', idea: 'Slide a window of length k: drop the leftmost character, shift, add the new one. Each window\'s hash costs O(1).' },
    { name: 'Comparing prefixes and suffixes', idea: 'Prefix hashes give the hash of any substring in O(1), so "is this prefix equal to that suffix (or that piece)?" is one comparison.' },
    { name: 'Binary search on the length', idea: 'If a repeat of length L exists, shorter ones do too. Binary search L, and test each length with a set of window hashes.' },
    { name: 'Hashing inside dynamic programming', idea: 'When a DP step asks "are these two pieces equal?", O(1) hash comparisons keep the whole DP at O(n²).' },
  ],
  signals: [
    { see: 'Find a pattern in a text, or all repeated substrings of a fixed length', think: 'Rabin–Karp: a rolling hash over windows', why: 'Every window\'s hash is updated in O(1) from the previous one.' },
    { see: 'Tiny alphabet and short windows (DNA letters, binary strings with k ≤ 20)', think: 'Encode the window exactly as an integer', why: 'Two bits per DNA letter or one bit per binary digit fit in one number with no collisions at all.' },
    { see: '"Longest substring (or subarray) that appears twice / in every string"', think: 'Binary search on the length + set of window hashes', why: 'Existence of a common piece of length L is monotone in L.' },
    { see: 'Many questions "is s[a..b) equal to s[c..d)?"', think: 'Prefix hashes and powers of the base', why: 'Each substring hash is a subtraction and a multiplication: O(1) per comparison.' },
    { see: 'n up to a few thousand and an O(n²) loop over pairs of pieces', think: 'Hash comparisons inside the loop', why: 'Comparing pieces character by character would make it O(n³).' },
  ],
  problems: [
    // ---------- Fixed-length windows ----------
    {
      id: 28, title: 'Find the Index of the First Occurrence in a String', pattern: 'Fixed-length windows', core: true,
      summary: 'Return the index where one string first appears inside another, or −1 if it never does.',
      hints: [
        'Comparing the pattern at every position is O(n · m) in the worst case.',
        'Compare a number per window instead of the whole window: a hash.',
        'Update the window\'s hash as it slides, and check the characters only when the hashes agree.',
      ],
      insight: 'Rabin–Karp: keep the polynomial hash of the current window, update it in O(1) per slide, and compare characters only when the hash equals the pattern\'s hash.',
      approach: [
        'Compute the pattern\'s hash and the hash of the first window of the same length, and the weight base^(m−1) mod M.',
        'At each position, if the window hash equals the pattern hash, compare the characters; return the position on a real match.',
        'Slide: subtract the leaving character times the weight, multiply by the base, add the new character, all mod M.',
        'Return −1 if no window matched.',
      ],
      ds: ['String', 'Integers mod M'], time: 'O(n + m) expected', space: 'O(1)',
      traps: [
        'Keep the hash non-negative after subtracting: add M before taking the remainder.',
        'KMP gives a guaranteed O(n + m) without hashing; see the String matching chapter.',
      ],
    },
    {
      id: 187, title: 'Repeated DNA Sequences', pattern: 'Fixed-length windows', core: true,
      summary: 'In a DNA string of the letters A, C, G and T, return every 10-letter substring that appears more than once.',
      hints: [
        'Putting every 10-letter substring in a set works but builds 10 characters per window.',
        'There are only four letters: each fits in 2 bits, and 10 letters fit in 20 bits.',
        'Roll a 20-bit number: shift left by 2, add the new letter\'s code, and keep only the low 20 bits.',
      ],
      insight: 'With 2 bits per letter, a 10-letter window is an exact 20-bit integer. Rolling it with a shift and a mask gives every window\'s code in O(1), with no collisions at all.',
      approach: [
        'Map A, C, G, T to 0, 1, 2, 3.',
        'Scan the string keeping code = ((code shifted left by 2) + letter) masked to 20 bits.',
        'From index 9 on, the code identifies the current window: if it was seen once before, add the window to the answer; record how often it has been seen.',
        'Return the answer list.',
      ],
      ds: ['Integer bit mask', 'Map from code to count'], time: 'O(n)', space: 'O(n)',
      traps: ['Report each repeated sequence once, even if it appears three or more times.', 'Strings shorter than 10 letters have no windows.'],
    },
    {
      id: 1461, title: 'Check If a String Contains All Binary Codes of Size K', pattern: 'Fixed-length windows',
      summary: 'Decide whether every binary string of length k appears somewhere as a substring of a given binary string.',
      hints: ['There are 2^k codes. How many windows of length k does the string have?', 'Each window is a k-bit number. Roll it: shift left, add the new bit, drop the bit that left.'],
      insight: 'Each window is an exact k-bit integer, rolled in O(1), so count distinct window values and compare with 2^k.',
      approach: [
        'If the string has fewer than 2^k windows (length − k + 1 < 2^k), return false at once.',
        'Keep a seen array of size 2^k and a rolling value: double it, add the new bit, and keep the low k bits.',
        'From index k − 1 on, mark the value; count newly marked values.',
        'Return whether the count reaches 2^k.',
      ],
      ds: ['Boolean array of size 2^k', 'Integer bit mask'], time: 'O(n)', space: 'O(2^k)',
      traps: ['k can be 20, so 2^k is about a million: a typed array is far lighter than a Set of strings.'],
    },
    {
      id: 2156, title: 'Find Substring With Given Hash Value', pattern: 'Fixed-length windows',
      summary: 'Given a hash where the first character has the smallest power (val(s[0])·p⁰ + val(s[1])·p¹ + …) mod m, return the first substring of length k with a given hash value.',
      hints: [
        'In this hash, the leftmost character has power 0. Sliding right would require dividing by p, which a modulus does not allow in general.',
        'Slide from right to left instead: multiplying by p shifts every power up by one, and the new leftmost character gets power 0.',
        'Products can reach 10¹⁸, beyond exact JavaScript numbers: use BigInt or split the multiplication.',
      ],
      insight: 'Scan from the right: hash = hash × p + val(new left character) − val(dropped right character) × p^k, all mod m. Remember the leftmost window that matches, since you meet it last.',
      approach: [
        'Precompute p^k mod m.',
        'Go from the last index down to 0: hash = (hash × p + val(s[i])) mod m; if a character now sits k places to the right, subtract its value times p^k (mod m, kept non-negative).',
        'Whenever the window starting at i is complete and its hash equals the target, record i.',
        'Return the substring of length k at the last recorded i (the leftmost one).',
      ],
      ds: ['BigInt arithmetic, or safe modular multiplication'], time: 'O(n)', space: 'O(1)',
      traps: [
        'p and m are up to 10⁹, so p × hash can be near 10¹⁸, far above 2⁵³: plain number multiplication silently loses digits.',
        'Dividing by p does not work: p may share a factor with m, so it may have no inverse.',
      ],
    },

    // ---------- Comparing prefixes and suffixes ----------
    {
      id: 1392, title: 'Longest Happy Prefix', pattern: 'Comparing prefixes and suffixes', core: true,
      summary: 'Return the longest proper prefix of a string that is also a suffix (not the whole string), or an empty string.',
      hints: [
        'For each length L, ask whether the first L characters equal the last L characters.',
        'Build the prefix hash and the suffix hash incrementally as L grows.',
        'Keep the largest L where both hashes agree (and verify, or use two moduli).',
      ],
      insight: 'Grow L from 1 to n − 1, extending the prefix hash at its end and the suffix hash at its front in O(1) each; the largest L with equal hashes is the answer.',
      approach: [
        'prefixHash = 0, suffixHash = 0, power = 1.',
        'For L from 1 to n − 1: prefixHash = prefixHash × base + s[L − 1]; suffixHash = s[n − L] × power + suffixHash; power = power × base (all mod M).',
        'If the two hashes are equal, remember L.',
        'Return the first L characters for the largest remembered L.',
      ],
      ds: ['Integers mod M'], time: 'O(n)', space: 'O(1)',
      traps: [
        'A single small modulus can be fooled; use two moduli or check the winning candidate character by character.',
        'The KMP prefix table solves this exactly: its last value is the answer length.',
      ],
    },
    {
      id: 3029, title: 'Minimum Time to Revert Word to Initial State I', pattern: 'Comparing prefixes and suffixes',
      summary: 'Every second you remove the first k characters of a word and append any k characters. Find the smallest positive number of seconds after which the word can equal the original again.',
      hints: [
        'After t seconds, the original characters that remain are word[t·k ..], and they now sit at the front.',
        'You can append anything, so the word can be restored exactly when word[t·k ..] equals a prefix of the word.',
        'Once t·k reaches the length, nothing original remains, so that t always works.',
      ],
      insight: 'The answer is the first t ≥ 1 where the suffix starting at t·k equals the prefix of the same length (or t·k ≥ n); prefix hashes compare each candidate in O(1).',
      approach: [
        'Build prefix hashes of the word.',
        'For t = 1, 2, …: if t·k ≥ n, return t.',
        'Otherwise compare the hash of word[t·k .. n) with the hash of word[0 .. n − t·k); if equal, return t.',
      ],
      ds: ['Prefix hash array', 'Powers of the base'], time: 'O(n)', space: 'O(n)',
      traps: ['With n ≤ 50 a direct comparison also passes; the hard version (problem 3031, n up to 10⁶) needs hashing or the Z-algorithm.'],
    },
    {
      id: 1147, title: 'Longest Chunked Palindrome Decomposition', pattern: 'Comparing prefixes and suffixes',
      summary: 'Split a string into the largest number of non-empty chunks such that the chunk list reads the same forwards and backwards (chunk i equals chunk k − i + 1).',
      hints: [
        'Work from both ends at once.',
        'Take the shortest prefix that equals the suffix of the same length; removing it never hurts.',
        'Compare the growing prefix and suffix with rolling hashes; when nothing matches, the middle is one chunk.',
      ],
      insight: 'Greedily cut the shortest matching chunk from both ends: a longer match can always be split around a shorter one, so the greedy count is never smaller. Rolling hashes make each comparison O(1).',
      approach: [
        'Keep l at the start and r at the end of the remaining text, and count = 0.',
        'Grow a chunk length from 1, extending a hash of text[l..] at the end and a hash of text[..r) at the front.',
        'When the two hashes match (and the characters agree), add 2 to count and move l and r past the chunks.',
        'If the chunks would overlap before any match, add 1 for the middle and stop; if the text is used up exactly, stop.',
      ],
      ds: ['Rolling hashes', 'Two indices'], time: 'O(n) with hashing, O(n²) with direct comparison', space: 'O(1)',
      traps: ['n is only 1000, so direct substring comparison also passes; the greedy argument is the real lesson.'],
    },
    {
      id: 1316, title: 'Distinct Echo Substrings', pattern: 'Comparing prefixes and suffixes',
      summary: 'Count the distinct substrings that are some string written twice in a row (like "abab").',
      hints: [
        'An echo of half-length L starting at i means s[i..i+L) equals s[i+L..i+2L).',
        'Try every start and every L; each check must be O(1).',
        'Store the hash of each echo found (with its length) in a set to count distinct ones.',
      ],
      insight: 'With prefix hashes, checking whether the two halves of any candidate are equal is O(1), and a set of (length, hash) pairs counts distinct echoes over all O(n²) candidates.',
      approach: [
        'Build prefix hashes and powers of the base.',
        'For every half-length L from 1 to n / 2 and every start i with i + 2L ≤ n: compare hash(i, L) with hash(i + L, L).',
        'If equal, add (L, hash(i, L)) to a set.',
        'Return the size of the set.',
      ],
      ds: ['Prefix hash array', 'Set of numbers or strings'], time: 'O(n²)', space: 'O(n²) in the worst case',
      traps: ['Key the set by length and hash together, so echoes of different lengths cannot collide.', 'Building every substring as a string is O(n³).'],
    },

    // ---------- Binary search on the length ----------
    {
      id: 718, title: 'Maximum Length of Repeated Subarray', pattern: 'Binary search on the length', core: true,
      summary: 'Return the length of the longest contiguous subarray that appears in both of two arrays.',
      hints: [
        'If a common subarray of length L exists, a common one of every shorter length exists too.',
        'Binary search L. For one L, how do you test "some window of nums1 equals some window of nums2"?',
        'Put the rolling hashes of all windows of nums1 in a set, then slide over nums2 and look each hash up.',
      ],
      insight: 'Common-subarray existence is monotone in the length, so binary search it; each test hashes all windows of both arrays in O(m + n).',
      approach: [
        'Binary search L between 0 and the shorter length.',
        'For a candidate L, roll a hash over nums1 and store every window hash in a set.',
        'Roll a hash over nums2; if any window hash is in the set (verify the values to be safe), L works.',
        'Move the search up when L works and down when it does not.',
      ],
      ds: ['Set of hashes', 'Rolling hash'], time: 'O((m + n) log min(m, n))', space: 'O(m)',
      traps: ['Values can be 0: hash value + 1 so that 0 is not invisible.', 'The O(m · n) DP (longest common suffix ending at each pair) is the simpler alternative here.'],
    },
    {
      id: 1044, title: 'Longest Duplicate Substring', pattern: 'Binary search on the length', core: true,
      summary: 'Return any longest substring that occurs at least twice in a string (occurrences may overlap), or an empty string.',
      hints: [
        'If a substring of length L repeats, a substring of every shorter length repeats too.',
        'Binary search L, testing each length with a set of window hashes.',
        'With n = 3 × 10⁴, collisions are a real risk: use two moduli or verify the characters.',
      ],
      insight: 'Binary search the length, and for each candidate length slide a rolling hash over the string looking for a repeated window hash; O(n) per test, O(n log n) in all.',
      approach: [
        'Binary search L from 0 to n − 1.',
        'For a candidate L, roll the hash over every window of length L, keeping a Map from hash to starting positions.',
        'If a hash repeats and the substrings really are equal, remember that start and report success.',
        'Return the substring of the largest successful length.',
      ],
      ds: ['Map from hash to start positions', 'Rolling hash'], time: 'O(n log n) expected', space: 'O(n)',
      traps: [
        'Multiplying two residues near 10⁹ exceeds 2⁵³ in JavaScript; keep the modulus below about 9.4 × 10⁷ or use BigInt.',
        'A suffix array with its LCP array solves it deterministically (see the Suffix arrays chapter).',
      ],
    },
    {
      id: 1923, title: 'Longest Common Subpath', pattern: 'Binary search on the length',
      summary: 'Each friend walks a path of cities. Return the length of the longest contiguous sequence of cities that appears in every friend\'s path.',
      hints: [
        'A common subpath of length L implies common subpaths of every shorter length: binary search L.',
        'For one L, find the window hashes of each path and intersect the sets path by path.',
        'The tests include inputs built to break a single hash: use two independent moduli.',
      ],
      insight: 'Binary search the length; for each candidate, intersect the sets of window hashes of all paths. With total length 10⁵, each test is linear, but only a double hash survives the adversarial tests.',
      approach: [
        'Binary search L between 0 and the shortest path length.',
        'For a candidate L, compute every window\'s pair of hashes for the first path and put them in a set.',
        'For each next path, keep only the window hashes that are also in the current set; stop early if the set becomes empty.',
        'L works if the set is non-empty at the end.',
      ],
      ds: ['Sets of hash pairs', 'Rolling hash with two moduli'], time: 'O(total length × log(min length))', space: 'O(total length)',
      traps: [
        'City numbers go up to 10⁵, so the base must be larger than 10⁵ (or hash value + 1 with a large base).',
        'Combine the two residues into one key as h1 × M2 + h2, which stays below 2⁵³ when both moduli are under about 9.4 × 10⁷.',
      ],
    },

    // ---------- Hashing inside dynamic programming ----------
    {
      id: 2430, title: 'Maximum Deletions on a String', pattern: 'Hashing inside dynamic programming',
      summary: 'In one move you may delete the whole string, or delete its first i letters if they equal the next i letters. Return the maximum number of moves needed to delete everything.',
      hints: [
        'Let best[i] be the most moves for the suffix starting at i. Deleting the whole suffix gives 1.',
        'A first block of length L can be deleted when s[i..i+L) equals s[i+L..i+2L); then you continue from i + L.',
        'Make each equality check O(1): rolling hashes, or a table of longest common prefixes filled from the end.',
      ],
      insight: 'DP from the right: best[i] = 1 + max best[i + L] over every L whose two blocks are equal; with O(1) block comparisons the DP is O(n²).',
      approach: [
        'Fill best from the end: best[n] is not used; each best[i] starts at 1.',
        'For each L with i + 2L ≤ n, check whether s[i..i+L) equals s[i+L..i+2L) in O(1).',
        'If so, best[i] = max(best[i], 1 + best[i + L]).',
        'Return best[0].',
      ],
      ds: ['DP array', 'Prefix hashes or an LCP table'], time: 'O(n²)', space: 'O(n) to O(n²)',
      traps: [
        'Greedily deleting the shortest block is wrong; the DP must try every length.',
        'A full n × n LCP table is 16 million entries for n = 4000; keep only the current and next rows.',
      ],
    },
  ],
};
