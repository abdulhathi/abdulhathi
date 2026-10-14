import type { Topic } from './types';

export const topic: Topic = {
  id: 'combinatorics',
  patterns: [
    { name: 'Counting rules and binomial coefficients', idea: 'Multiply independent choices, add separate cases, and count selections with C(n, k) from Pascal\'s triangle or factorials.' },
    { name: 'Stars and bars', idea: 'Splitting n identical items among k groups is choosing where to put k − 1 dividers: C(n + k − 1, k − 1).' },
    { name: 'Ranking and unranking', idea: 'Find the k-th arrangement directly by counting how many arrangements start with each choice and skipping whole blocks.' },
    { name: 'Factorial formulas modulo a prime', idea: 'Arrangements with repeats or constraints become products of factorials; divide with inverse factorials modulo 10⁹ + 7.' },
    { name: 'Catalan numbers', idea: 'Split around a root or a first matching pair; the counts multiply and add up to the Catalan numbers 1, 1, 2, 5, 14, 42, …' },
    { name: 'Inclusion–exclusion', idea: 'Count a union by adding the single sets, subtracting the pairwise overlaps, adding back triple overlaps, and so on.' },
    { name: 'Pigeonhole principle', idea: 'Put more than n items into n boxes and some box gets two. Use it to prove that something repeats or exists, and to bound a search.' },
  ],
  signals: [
    { see: '"how many ways", "number of distinct …", and the answer modulo 10⁹ + 7', think: 'Count with formulas instead of listing', why: 'If the answer can be astronomically large, the solution cannot be enumerating the objects one by one.' },
    { see: 'Choose k of n items, paths on a grid that move only right and down, or k steps left and right on a line', think: 'Binomial coefficient C(n, k)', why: 'Each object is fully described by which positions get one of two labels.' },
    { see: 'Distribute n identical things into k groups, or count sorted (non-decreasing) sequences', think: 'Stars and bars', why: 'Only the counts per group matter, which is a placement of k − 1 dividers among the items.' },
    { see: '"return the k-th permutation / string in lexicographic order"', think: 'Ranking by counting blocks', why: 'All arrangements starting with the same prefix are contiguous, and you can count each block.' },
    { see: 'Number of BSTs, valid parentheses strings, ways to triangulate, mountain ranges', think: 'Catalan numbers', why: 'Each object splits into two independent smaller objects around a root or first match.' },
    { see: '"divisible by a or b or c", count numbers avoiding several conditions', think: 'Inclusion–exclusion, often inside a binary search', why: 'Overlaps are counted with LCMs, and the count up to x is monotone in x.' },
    { see: '"prove a duplicate exists", "find the length" where states are limited, or a gap that must be large', think: 'Pigeonhole principle', why: 'With only k possible states, k + 1 steps must repeat one; with n − 1 gaps covering a range, one gap is at least the average.' },
  ],
  problems: [
    // ---------- Counting rules ----------
    {
      id: 118, title: "Pascal's Triangle", pattern: 'Counting rules and binomial coefficients',
      summary: 'Return the first numRows rows of Pascal\'s triangle, where each inner number is the sum of the two numbers above it.',
      hints: ['Every row starts and ends with 1.', 'Inner entry j of row i is entry j − 1 plus entry j of row i − 1.'],
      insight: 'Pascal\'s rule C(n, k) = C(n − 1, k − 1) + C(n − 1, k) builds every binomial coefficient from the row above, using only additions.',
      approach: ['Start with the row [1].', 'For each next row, write 1, then each sum of two neighbours in the previous row, then 1.', 'Stop after numRows rows.'],
      ds: ['Array of arrays'], time: 'O(numRows²)', space: 'O(numRows²) for the output',
      traps: ['Row i has i + 1 entries when counting rows from 0.'],
    },
    {
      id: 62, title: 'Unique Paths', pattern: 'Counting rules and binomial coefficients', core: true,
      summary: 'A robot moves only right or down on an m by n grid. Count the different paths from the top-left corner to the bottom-right corner.',
      hints: ['Every path has exactly the same number of right moves and the same number of down moves.', 'A path is decided by which of its m + n − 2 moves are the down moves.'],
      insight: 'A path is a sequence of m − 1 downs and n − 1 rights in some order, so there are C(m + n − 2, m − 1) paths.',
      approach: [
        'Let total = m + n − 2 and k = the smaller of m − 1 and n − 1.',
        'Compute C(total, k) as a running product: start at 1 and for i = 1 … k multiply by (total − k + i), then divide by i.',
        'The running value is a whole binomial coefficient after every step, so the division is always exact.',
      ],
      ds: ['Integers'], time: 'O(min(m, n))', space: 'O(1)',
      traps: ['Computing the three factorials separately overflows; the running product stays small.', 'The grid DP from the DP chapters also works in O(m × n).'],
    },
    {
      id: 2400, title: 'Number of Ways to Reach a Position After Exactly k Steps', pattern: 'Counting rules and binomial coefficients',
      summary: 'On a number line, each step moves one to the left or the right. Count the step sequences of length exactly k that go from startPos to endPos, modulo 10⁹ + 7.',
      hints: ['Let r be the number of right steps and l the number of left steps. Write two equations.', 'r + l = k and r − l = distance. When does a whole-number solution exist?', 'Once r is fixed, the sequence is decided by which steps are the right steps.'],
      insight: 'The number of right steps is forced to (k + d) / 2 where d is the distance, so the answer is C(k, (k + d) / 2), or 0 when d > k or k − d is odd.',
      approach: [
        'd = |endPos − startPos|. If d > k or (k − d) is odd, return 0.',
        'r = (k + d) / 2.',
        'Return C(k, r) modulo 10⁹ + 7, using Pascal\'s triangle up to k or factorials with inverses.',
      ],
      ds: ['Pascal table or factorial arrays'], time: 'O(k²) with Pascal, O(k) with factorials', space: 'O(k)',
      traps: ['The line is infinite in both directions, so there are no walls to subtract.', 'Products modulo 10⁹ + 7 need BigInt in TypeScript; Pascal\'s rule needs only additions, which avoids the issue.'],
    },
    {
      id: 2221, title: 'Find Triangular Sum of an Array', pattern: 'Counting rules and binomial coefficients',
      summary: 'Repeatedly replace an array of digits with the sums of neighbouring pairs, each taken modulo 10, until one digit is left. Return it.',
      hints: ['With n up to 1000, simulating all n − 1 rounds is only about 500,000 additions.', 'Why is the final value a weighted sum of the inputs, and what are the weights?'],
      insight: 'The final digit is Σ C(n − 1, i) × nums[i] mod 10: each input reaches the bottom along C(n − 1, i) paths, just like Pascal\'s triangle. With these limits, direct simulation is the simplest correct way.',
      approach: ['Repeat n − 1 times: for i from 0 to the current length − 2, set nums[i] = (nums[i] + nums[i + 1]) mod 10.', 'Shrink the length by one each round.', 'Return nums[0].'],
      ds: ['Array (in place)'], time: 'O(n²)', space: 'O(1)',
      traps: ['Computing C(n − 1, i) modulo 10 directly needs extra care, because 10 is not prime; the simulation avoids it.'],
    },
    {
      id: 458, title: 'Poor Pigs', pattern: 'Counting rules and binomial coefficients',
      summary: 'Exactly one of several buckets is poisoned. A pig that drinks poison dies after a fixed time, and you have a limited total time. Find the fewest pigs that always identify the poisoned bucket.',
      hints: [
        'With t rounds of testing, how many different things can happen to one pig? It dies in round 1, 2, …, t, or survives.',
        'Pigs are independent, so outcomes multiply.',
        'You need at least as many distinct outcomes as there are buckets.',
      ],
      insight: 'Each pig has t + 1 possible fates (dies in one of t rounds, or lives), so p pigs distinguish (t + 1)^p buckets; find the smallest p with (t + 1)^p ≥ buckets.',
      approach: ['t = ⌊minutesToTest / minutesToDie⌋.', 'Start with p = 0 and increase it until (t + 1)^p is at least the number of buckets.', 'Return p.'],
      ds: ['Integers'], time: 'O(log buckets)', space: 'O(1)',
      traps: ['With a single bucket, no pigs are needed.', 'Thinking of each pig as one yes/no test gives 2^p and the wrong answer when there are several rounds.'],
    },

    // ---------- Stars and bars ----------
    {
      id: 1641, title: 'Count Sorted Vowel Strings', pattern: 'Stars and bars', core: true,
      summary: 'Count the strings of length n made of the five vowels whose letters are in alphabetical (non-decreasing) order.',
      hints: ['A sorted string is fully described by how many a\'s, e\'s, i\'s, o\'s and u\'s it has.', 'So you are splitting n identical positions into 5 groups. How many ways?'],
      insight: 'A sorted vowel string is just the counts of each vowel adding up to n; by stars and bars there are C(n + 4, 4) of them.',
      approach: ['Describe each string by its five vowel counts, which are non-negative and add up to n.', 'Count those with stars and bars: C(n + 4, 4) = (n + 4)(n + 3)(n + 2)(n + 1) / 24.'],
      ds: ['Integers'], time: 'O(1)', space: 'O(1)',
      traps: ['A DP over (length, last vowel) also works; the formula is the counting insight.'],
    },
    {
      id: 2929, title: 'Distribute Candies Among Children II', pattern: 'Stars and bars',
      summary: 'Count the ways to give n identical candies to 3 children so that no child gets more than limit candies (n and limit up to 10⁶).',
      hints: [
        'Without the limit, stars and bars gives C(n + 2, 2).',
        'Subtract the distributions where some child gets more than limit. Give that child limit + 1 first, then distribute the rest freely.',
        'Two children over the limit got subtracted twice: add them back. Then handle all three.',
      ],
      insight: 'Stars and bars counts the free distributions, and inclusion–exclusion removes those where at least one child exceeds the limit: Σ (−1)^j × C(3, j) × C(n − j(limit + 1) + 2, 2).',
      approach: [
        'Let f(x) = C(x + 2, 2) for x ≥ 0 and 0 for x < 0 (free ways to split x candies among 3).',
        'Answer = f(n) − 3·f(n − (limit + 1)) + 3·f(n − 2(limit + 1)) − f(n − 3(limit + 1)).',
      ],
      ds: ['Integers'], time: 'O(1)', space: 'O(1)',
      traps: ['f must be 0 for negative arguments.', 'Looping over the first child\'s amount and counting the second child\'s range is a valid O(n) alternative.'],
    },

    // ---------- Ranking ----------
    {
      id: 60, title: 'Permutation Sequence', pattern: 'Ranking and unranking', core: true,
      summary: 'Return the k-th permutation of the numbers 1 to n in lexicographic order, as a string.',
      hints: [
        'How many permutations start with 1? With 2?',
        'They come in blocks of (n − 1)!. Which block contains the k-th permutation?',
        'Count from 0 to make the arithmetic clean: use k − 1.',
      ],
      insight: 'Permutations sharing a first digit form a block of (n − 1)!, so the first digit is the available digit at index ⌊(k − 1) / (n − 1)!⌋; repeat on the remainder with one digit fewer.',
      approach: [
        'List the digits 1 … n and precompute factorials. Set rank = k − 1.',
        'For each position, with s digits still available: idx = ⌊rank / (s − 1)!⌋. Append the digit at idx and remove it from the list.',
        'Set rank = rank mod (s − 1)! and continue until no digits remain.',
      ],
      ds: ['Array of available digits', 'Factorial table'], time: 'O(n²)', space: 'O(n)',
      traps: ['Off-by-one: k is 1-based, block arithmetic is 0-based.', 'Generating permutations one by one is up to 9! = 362,880 steps per query; it passes here but misses the point.'],
    },
    {
      id: 1643, title: 'Kth Smallest Instructions', pattern: 'Ranking and unranking',
      summary: 'Moves are H (right) and V (down). Among all move strings that reach a target cell, return the k-th smallest in lexicographic order.',
      hints: ['H comes before V, so all strings starting with H come first.', 'How many strings start with H? Count the arrangements of the moves that remain.', 'If k is within that count, write H; otherwise write V and skip that many.'],
      insight: 'At each position, the strings starting with H number C(remaining moves − 1, remaining V); compare k with that count to decide the letter, subtracting the skipped block when you choose V.',
      approach: [
        'Let h and v be the remaining right and down moves.',
        'While moves remain: if h is 0 write V; if v is 0 write H.',
        'Otherwise c = C(h − 1 + v, v), the strings that start with H. If k ≤ c, write H and decrease h; else write V, subtract c from k, and decrease v.',
      ],
      ds: ['String builder', 'Binomial coefficients (small)'], time: 'O((h + v)²) or O(h + v) with a Pascal table', space: 'O(h + v)',
      traps: ['k is 1-based here, so compare with ≤.', 'All counts fit easily: C(30, 15) is about 1.5 × 10⁸.'],
    },

    // ---------- Factorial formulas ----------
    {
      id: 1359, title: 'Count All Valid Pickup and Delivery Options', pattern: 'Factorial formulas modulo a prime', core: true,
      summary: 'Count orderings of n pickups and n deliveries in which every delivery comes after its own pickup, modulo 10⁹ + 7.',
      hints: [
        'Of all (2n)! orderings, in exactly half of them delivery i comes after pickup i, independently for each order.',
        'Alternatively, insert the n-th order\'s two events into a valid sequence of the other n − 1 orders. How many ways?',
      ],
      insight: 'Each of the n pairs must appear in one of its two possible orders, so the answer is (2n)! / 2ⁿ, which also equals the product over i of i × (2i − 1).',
      approach: ['result = 1.', 'For i from 1 to n, multiply result by i × (2i − 1), reducing modulo 10⁹ + 7.', 'Return result.'],
      ds: ['BigInt (or careful multiplication)'], time: 'O(n)', space: 'O(1)',
      traps: ['Multiplying a remainder by i × (2i − 1) (up to about 5 × 10⁵) stays below 2⁵³, but a general product of two remainders would not; know which case you are in.'],
    },
    {
      id: 2514, title: 'Count Anagrams', pattern: 'Factorial formulas modulo a prime',
      summary: 'A string of words is rearranged by permuting the letters within each word. Count the distinct results, modulo 10⁹ + 7.',
      hints: [
        'Words are independent: multiply the counts for each word.',
        'A word of length L with letter counts c₁, c₂, … has L! / (c₁! c₂! …) distinct arrangements.',
        'Division modulo a prime needs inverse factorials.',
      ],
      insight: 'The answer is the product over words of the multinomial L! / Π cᵢ!, with the divisions done as multiplications by inverse factorials modulo the prime 10⁹ + 7.',
      approach: [
        'Precompute fact[i] and invFact[i] up to the string length (invFact[n] by Fermat, then invFact[i − 1] = invFact[i] × i).',
        'For each word: multiply the answer by fact[length], then by invFact[count] for each letter count.',
        'Reduce modulo 10⁹ + 7 after every multiplication.',
      ],
      ds: ['Factorial and inverse factorial arrays', 'Letter counts (array of 26)', 'BigInt'], time: 'O(n + log p)', space: 'O(n)',
      traps: ['You cannot divide remainders directly; use the inverse factorials.', 'Products of two remainders exceed 2⁵³: use BigInt.'],
    },
    {
      id: 1569, title: 'Number of Ways to Reorder Array to Get Same BST', pattern: 'Factorial formulas modulo a prime',
      summary: 'Inserting a permutation into an empty binary search tree builds a certain tree. Count the other orderings of the same numbers that build the identical tree, modulo 10⁹ + 7.',
      hints: [
        'The first number must stay first: it is the root.',
        'The rest split into smaller (left subtree) and larger (right subtree) values; only the order within each side matters.',
        'You can interleave the two sides freely: choose which positions belong to the left side.',
      ],
      insight: 'ways(seq) = C(len − 1, size of left) × ways(left) × ways(right): the two sides keep their own internal orders but can be interleaved in any of C(len − 1, left) ways. Subtract 1 for the original ordering.',
      approach: [
        'Build Pascal\'s triangle modulo 10⁹ + 7 up to n (only additions needed).',
        'Recursively, for a sequence: if it has at most 2 elements, return 1.',
        'Otherwise split the rest into values smaller and larger than the first, and return C(len − 1, left size) × ways(left) × ways(right) modulo p.',
        'The answer is ways(nums) − 1, made non-negative modulo p.',
      ],
      ds: ['Recursion', 'Pascal table'], time: 'O(n²)', space: 'O(n²)',
      traps: ['Do not forget the final − 1 (the original order is not counted).', 'Products of remainders need BigInt.'],
    },

    // ---------- Catalan ----------
    {
      id: 96, title: 'Unique Binary Search Trees', pattern: 'Catalan numbers', core: true,
      summary: 'Count the structurally different binary search trees that hold the values 1 to n.',
      hints: ['Choose which value is the root.', 'With root r, the left subtree holds r − 1 values and the right holds n − r, and their shapes are independent.', 'Sum the products over every root.'],
      insight: 'G(n) = Σ G(r − 1) × G(n − r) over the root r, which is the Catalan recurrence; the answer is the n-th Catalan number C(2n, n) / (n + 1).',
      approach: ['G(0) = G(1) = 1.', 'For each size s from 2 to n, G(s) = sum over r from 1 to s of G(r − 1) × G(s − r).', 'Return G(n). (Or compute C(2n, n) / (n + 1) directly.)'],
      ds: ['Array (DP table)'], time: 'O(n²)', space: 'O(n)',
      traps: ['Only the shape counts, not the values: the values are forced by the BST rule once the shape is fixed.'],
    },

    // ---------- Inclusion–exclusion ----------
    {
      id: 1201, title: 'Ugly Number III', pattern: 'Inclusion–exclusion',
      summary: 'A number is "ugly" here if it is divisible by a, b or c. Return the n-th such number (it is at most 2 × 10⁹).',
      hints: ['Count the numbers up to x divisible by a, b or c with inclusion–exclusion over three sets.', 'Pairwise overlaps use lcm(a, b), lcm(b, c), lcm(a, c); the triple overlap uses lcm of all three.', 'Binary search on x.'],
      insight: 'count(x) = x/a + x/b + x/c − x/lcm(ab) − x/lcm(bc) − x/lcm(ac) + x/lcm(abc), all floored, and binary search finds the smallest x with count(x) ≥ n.',
      approach: [
        'Compute the three pairwise LCMs and the triple LCM, each as x / gcd × y.',
        'Binary search x in [1, 2 × 10⁹] for the smallest value with count(x) ≥ n.',
        'Return it.',
      ],
      ds: ['Integers', 'Binary search'], time: 'O(log(2 × 10⁹))', space: 'O(1)',
      traps: ['Pairwise and triple LCMs can reach 10¹⁸, above 2⁵³. They are only used to divide x, so even an inexact value above 2 × 10⁹ contributes 0; cap them, or compute them with BigInt.'],
    },
    {
      id: 2513, title: 'Minimize the Maximum of Two Arrays', pattern: 'Inclusion–exclusion',
      summary: 'Fill two arrays with distinct positive integers, none shared between them: the first needs uniqueCnt1 numbers not divisible by divisor1, the second uniqueCnt2 numbers not divisible by divisor2. Minimise the largest number used.',
      hints: [
        'Binary search on the maximum value x. Can both arrays be filled using only 1 … x?',
        'Array 1 can use x − ⌊x/divisor1⌋ numbers; array 2 can use x − ⌊x/divisor2⌋.',
        'Together they can use every number except those divisible by both, which is x − ⌊x/lcm⌋.',
      ],
      insight: 'x works exactly when array 1 has enough candidates, array 2 has enough, and their union, counted with inclusion–exclusion as x − ⌊x / lcm⌋, covers both counts; that condition is monotone, so binary search the smallest x.',
      approach: [
        'L = lcm(divisor1, divisor2).',
        'feasible(x): x − ⌊x/d1⌋ ≥ cnt1, x − ⌊x/d2⌋ ≥ cnt2 and x − ⌊x/L⌋ ≥ cnt1 + cnt2.',
        'Binary search the smallest feasible x.',
      ],
      ds: ['Integers', 'Binary search'], time: 'O(log(cnt1 + cnt2))', space: 'O(1)',
      traps: ['Numbers usable by only one array go to that array first; the three conditions together capture that greedy argument.', 'The LCM can reach 10¹⁰, which is fine for division.'],
    },
    {
      id: 878, title: 'Nth Magical Number', pattern: 'Inclusion–exclusion', core: true,
      summary: 'A positive number is magical if it is divisible by a or by b. Return the n-th magical number (n up to 10⁹) modulo 10⁹ + 7.',
      hints: [
        'Counting magical numbers up to x is easy: x/a + x/b minus the ones counted twice.',
        'Numbers divisible by both are the multiples of lcm(a, b).',
        'The count grows with x, so binary search for the smallest x whose count reaches n.',
      ],
      insight: 'count(x) = ⌊x/a⌋ + ⌊x/b⌋ − ⌊x/lcm(a, b)⌋ by inclusion–exclusion, and since it never decreases, binary search finds the smallest x with count(x) ≥ n.',
      approach: [
        'L = lcm(a, b).',
        'Binary search x between 1 and n × min(a, b).',
        'If count(x) ≥ n, move the upper bound down to x; otherwise move the lower bound above x.',
        'Return the final x modulo 10⁹ + 7.',
      ],
      ds: ['Integers', 'Binary search'], time: 'O(log(n × min(a, b)))', space: 'O(1)',
      traps: ['The search space reaches 4 × 10¹³, still well within 2⁵³.', 'Take the modulo only at the end; the comparison needs the true value.'],
    },

    // ---------- Pigeonhole ----------
    {
      id: 961, title: 'N-Repeated Element in Size 2N Array', pattern: 'Pigeonhole principle',
      summary: 'An array of length 2n holds n + 1 distinct values, one of which appears n times. Return that value.',
      hints: ['A hash set finds the first repeat, using O(n) space.', 'The repeated value fills half the array. How close together must two copies be?'],
      insight: 'The repeated value fills n of the 2n slots, so two of its copies must be at most 3 positions apart (if every gap were 4 or more, the copies would need about 4n slots). Comparing each element with the next three finds it in O(1) space.',
      approach: ['For each index i, compare nums[i] with nums[i + 1], nums[i + 2] and nums[i + 3] (where they exist).', 'Return the first value that matches.'],
      ds: ['Array'], time: 'O(n)', space: 'O(1)',
      traps: ['Looking only one or two ahead fails on a pattern like x, a, b, x with n = 2: you need a window of four.'],
    },
    {
      id: 1015, title: 'Smallest Integer Divisible by K', pattern: 'Pigeonhole principle', core: true,
      summary: 'Find the length of the smallest number made only of the digit 1 that is divisible by k, or −1 if none exists. The number itself may be enormous.',
      hints: [
        'Track only the remainder modulo k: the next number of ones has remainder (r × 10 + 1) mod k.',
        'There are only k possible remainders. What must happen within k steps?',
        'When is it impossible from the start?',
      ],
      insight: 'Remainders follow r → (10r + 1) mod k and there are only k of them, so within k steps you either hit 0 or repeat a remainder and loop forever (pigeonhole); multiples of 2 or 5 never work because the number ends in 1.',
      approach: ['If k is divisible by 2 or 5, return −1.', 'r = 0. For length from 1 to k: r = (r × 10 + 1) mod k; if r is 0, return length.', 'Return −1 (not reached when k is coprime to 10).'],
      ds: ['Integer remainder'], time: 'O(k)', space: 'O(1)',
      traps: ['Never build the number itself; it overflows after 16 digits.'],
    },
    {
      id: 164, title: 'Maximum Gap', pattern: 'Pigeonhole principle',
      summary: 'Return the largest difference between neighbours in the sorted order of an array, in linear time and linear extra space.',
      hints: [
        'With n numbers between min and max, the n − 1 gaps add up to max − min. How small can the largest gap be?',
        'Use buckets narrower than that average gap. Can the largest gap lie inside one bucket?',
        'Keep only each bucket\'s minimum and maximum, and compare neighbouring non-empty buckets.',
      ],
      insight: 'The largest gap is at least (max − min) / (n − 1) by pigeonhole, so with buckets of that width it can never fall inside a bucket; it must be between one bucket\'s maximum and the next non-empty bucket\'s minimum.',
      approach: [
        'If there are fewer than 2 numbers, return 0. Find min and max; if they are equal, return 0.',
        'Bucket width = max(1, ⌊(max − min) / (n − 1)⌋); number of buckets = ⌊(max − min) / width⌋ + 1.',
        'Put each number in bucket ⌊(x − min) / width⌋, keeping only the bucket minimum and maximum.',
        'Walk the non-empty buckets in order; the answer is the largest (bucket minimum − previous bucket maximum).',
      ],
      ds: ['Arrays of bucket minima and maxima'], time: 'O(n)', space: 'O(n)',
      traps: ['Sorting is O(n log n), which the problem rules out.', 'Width must be at least 1 when values are close together.'],
    },
  ],
};
