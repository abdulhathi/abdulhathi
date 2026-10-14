import type { Topic } from './types';

export const topic: Topic = {
  id: 'brainteaser',
  patterns: [
    { name: 'Count what really changes', idea: 'Track how many times each item is affected, or which quantity a move preserves, instead of simulating every step.' },
    { name: 'Ignore identities', idea: 'When identical objects bounce off each other, pretend they pass through: the set of positions is the same.' },
    { name: 'Bitwise insights', idea: 'AND only shrinks, OR only grows, and XOR cancels in pairs: one of these facts usually collapses the problem.' },
    { name: 'Games that end at once', idea: 'Some games are decided by the first move or by parity, so no search is needed.' },
    { name: 'Impossible or forced answers', idea: 'Sometimes a quick argument shows the answer is always the same, or that only one very small case matters.' },
  ],
  signals: [
    { see: 'n up to 10⁹ and a process that runs n rounds', think: 'Find a formula from small cases', why: 'Simulating 10⁹ rounds is impossible, so the answer must have a closed form.' },
    { see: 'Many identical objects collide and reverse direction', think: 'Let them pass through each other', why: 'Swapping identities at a collision does not change the set of positions at any moment.' },
    { see: '"maximum AND" of a subarray', think: 'The answer is the maximum element', why: 'AND-ing more numbers can only clear bits, so no subarray beats its largest single element.' },
    { see: 'XOR over all pairs or many repetitions', think: 'Count how often each element appears, modulo 2', why: 'x XOR x = 0, so only elements used an odd number of times survive.' },
    { see: 'An answer that looks constant on every small case you try', think: 'Prove it is always that value', why: 'A short argument (often a case like base n − 2) can show the property never holds, or always holds.' },
    { see: 'A game where you can choose to take everything', think: 'Check whether the first move already decides it', why: 'If the first player can always win immediately or force the last move, no game tree is needed.' },
  ],
  problems: [
    // ---------- Count what changes ----------
    {
      id: 319, title: 'Bulb Switcher', pattern: 'Count what really changes', core: true,
      summary: 'n bulbs start off. In round i you toggle every i-th bulb, for rounds 1 to n. How many bulbs are on at the end? n can be 10⁹.',
      hints: ['Simulate n = 1 to 12 and write down which bulbs are on.', 'Bulb k is toggled once for every divisor of k.', 'Which numbers have an odd number of divisors?'],
      insight: 'Divisors pair up as (d, k / d), except √k when k is a perfect square, so only squares are toggled an odd number of times and stay on: the answer is ⌊√n⌋.',
      approach: ['Compute the integer square root of n.', 'Return it (Math.floor(Math.sqrt(n)) is exact for n up to 10⁹).'],
      ds: ['None'], time: 'O(1)', space: 'O(1)',
      traps: ['Simulating is O(n log n) work and impossible for 10⁹.'],
    },
    {
      id: 1033, title: 'Moving Stones Until Consecutive', pattern: 'Count what really changes',
      summary: 'Three stones on a line. A move picks up an end stone and puts it in an empty spot between the other two. Return the minimum and maximum number of moves before the stones are consecutive.',
      hints: ['Sort the positions x < y < z.', 'Maximum: each move can shrink the total span by exactly one empty spot.', 'Minimum: it is never more than 2. When is it 0 or 1?'],
      insight: 'The maximum is the number of empty spots between the outer stones, z − x − 2, since each move can fill just one. The minimum is 0 if already consecutive, 1 if some gap is at most 2 (one stone can jump in next to another), else 2.',
      approach: ['Sort to get x < y < z.', 'max = z − x − 2.', 'min = 0 if z − x = 2; 1 if y − x ≤ 2 or z − y ≤ 2; otherwise 2.'],
      ds: ['Three integers'], time: 'O(1)', space: 'O(1)',
      traps: ['A gap of exactly 2 (like 1 _ 3) still needs only one move: drop a stone into the hole.'],
    },
    {
      id: 3577, title: 'Count the Number of Computer Unlocking Permutations', pattern: 'Count what really changes',
      summary: 'Computer 0 starts unlocked. Computer i can be unlocked using an earlier-labelled unlocked computer with lower complexity. Count the unlocking orders (permutations) that work, modulo 10⁹ + 7.',
      hints: ['Computer 0 has the smallest label, so it can unlock any computer with higher complexity.', 'What if some other computer has complexity at most that of computer 0?'],
      insight: 'If every other computer is strictly more complex than computer 0, computer 0 alone can unlock all of them in any order, giving (n − 1)!; otherwise the least complex computer (other than 0) can never be unlocked, so the answer is 0.',
      approach: ['If any complexity[i] for i ≥ 1 is less than or equal to complexity[0], return 0.', 'Otherwise return (n − 1)! modulo 10⁹ + 7.'],
      ds: ['Array', 'BigInt or careful multiplication'], time: 'O(n)', space: 'O(1)',
      traps: ['The permutation lists the order of the other computers after 0; the count is (n − 1)!, not n!.'],
    },

    // ---------- Ignore identities ----------
    {
      id: 1503, title: 'Last Moment Before All Ants Fall Out of a Plank', pattern: 'Ignore identities', core: true,
      summary: 'Ants walk at speed 1 on a plank of length n; when two meet they both turn around. Given the starting positions of left-moving and right-moving ants, return when the last ant falls off.',
      hints: ['Watch two ants meet and bounce. Now erase their names: what does it look like?', 'Bouncing is the same as passing through, if you do not care which ant is which.'],
      insight: 'Two ants bouncing look exactly like two ants passing through each other, so every ant simply walks straight to its end: the answer is the longest such walk.',
      approach: ['For left-moving ants, the time to fall is their position; for right-moving ants, it is n − position.', 'Return the maximum over all ants.'],
      ds: ['Arrays'], time: 'O(n)', space: 'O(1)',
      traps: ['Either array may be empty.'],
    },
    {
      id: 2731, title: 'Movement of Robots', pattern: 'Ignore identities',
      summary: 'Robots on a number line move left or right at speed 1 and reverse direction when they collide. Return the sum of distances over all pairs after d seconds, modulo 10⁹ + 7.',
      hints: [
        'As with the ants, collisions only swap which robot is where; the set of positions is the same as if they passed through.',
        'So each final position is start ± d.',
        'Sort the final positions; the sum of pairwise distances uses a running prefix sum.',
      ],
      insight: 'Ignoring identities, the final positions are just start + d or start − d. After sorting, position p at index i contributes i × p − (sum of the earlier positions) to the total.',
      approach: [
        'Final position = nums[i] + d for "R", nums[i] − d for "L".',
        'Sort the final positions.',
        'Walk through them keeping a prefix sum; add i × p − prefix to the answer and reduce modulo 10⁹ + 7.',
      ],
      ds: ['Array (sorted)', 'Prefix sum', 'BigInt'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Positions reach ±3 × 10⁹ and the sum of distances far more: use BigInt or reduce carefully.', 'The answer is about pairs, so the robots\' identities really do not matter.'],
    },

    // ---------- Bitwise ----------
    {
      id: 2419, title: 'Longest Subarray With Maximum Bitwise AND', pattern: 'Bitwise insights', core: true,
      summary: 'Among all subarrays, find the maximum possible bitwise AND, and return the length of the longest subarray that achieves it.',
      hints: ['What happens to an AND when you include one more number?', 'So which subarray value is the largest possible?'],
      insight: 'AND never gains bits, so a subarray\'s AND is at most each of its elements. The maximum AND is therefore the maximum element, reached exactly by runs made only of that element.',
      approach: ['Find the maximum value.', 'Return the length of the longest run of consecutive elements equal to it.'],
      ds: ['Array'], time: 'O(n)', space: 'O(1)',
      traps: ['A run containing anything smaller than the maximum has a smaller AND.'],
    },
    {
      id: 2425, title: 'Bitwise XOR of All Pairings', pattern: 'Bitwise insights',
      summary: 'Pair every number in nums1 with every number in nums2, XOR each pair, and return the XOR of all those results.',
      hints: ['Each element of nums1 appears in as many pairs as nums2 has elements.', 'Something XOR-ed with itself an even number of times disappears.'],
      insight: 'Each nums1 element appears len(nums2) times and each nums2 element len(nums1) times; only those appearing an odd number of times survive the XOR.',
      approach: ['result = 0.', 'If nums2 has odd length, XOR all of nums1 into result.', 'If nums1 has odd length, XOR all of nums2 into result.'],
      ds: ['Arrays'], time: 'O(m + n)', space: 'O(1)',
      traps: ['Building all m × n pairs is up to 10¹⁰ operations.'],
    },
    {
      id: 2568, title: 'Minimum Impossible OR', pattern: 'Bitwise insights',
      summary: 'A positive number is expressible if it is the OR of some subsequence of the array. Return the smallest positive number that is not expressible.',
      hints: ['Can you make a power of two, like 4, by OR-ing numbers that are not 4?', 'If 1, 2 and 4 are all present, which numbers below 8 can you make?'],
      insight: 'A power of two can only come from an element equal to it, since OR never creates a lone bit from other bits; and if all powers below 2ᵏ are present, every number below 2ᵏ is expressible. So the answer is the smallest power of two missing from the array.',
      approach: ['Put the numbers in a set.', 'Try 1, 2, 4, 8, …; return the first one not in the set.'],
      ds: ['Hash set'], time: 'O(n + log max)', space: 'O(n)',
    },
    {
      id: 2749, title: 'Minimum Operations to Make the Integer Zero', pattern: 'Bitwise insights',
      summary: 'One operation subtracts 2ⁱ + num2 (any i from 0 to 60) from num1. Return the fewest operations that make num1 exactly 0, or −1.',
      hints: [
        'After k operations you have subtracted k × num2 plus a sum of k powers of two.',
        'So x = num1 − k × num2 must be a sum of exactly k powers of two.',
        'That works when the number of 1-bits in x is at most k and x is at least k.',
      ],
      insight: 'Try k = 1, 2, …: k operations work exactly when x = num1 − k·num2 satisfies popcount(x) ≤ k ≤ x, because any power can be split into two halves to use more terms, and each term is at least 1.',
      approach: ['For k from 1 to 60: x = num1 − k × num2.', 'If x ≥ k and the number of 1-bits of x is at most k, return k.', 'If no k works, return −1.'],
      ds: ['Integers'], time: 'O(60 × log x)', space: 'O(1)',
      traps: ['x can reach about 6 × 10¹⁰, beyond 32 bits: JavaScript\'s bitwise operators work on 32-bit integers, so count bits with division by 2 or with BigInt.'],
    },

    // ---------- Games that end at once ----------
    {
      id: 3227, title: 'Vowels Game in a String', pattern: 'Games that end at once',
      summary: 'Alice must remove a substring with an odd number of vowels, Bob a substring with an even number. Alice moves first; whoever cannot move loses. Does Alice win?',
      hints: ['If the string has no vowels, can Alice move at all?', 'If it has an odd number of vowels, what can Alice do on her first move?', 'If it has an even, non-zero number, can she leave Bob a string with exactly one vowel?'],
      insight: 'Alice wins exactly when the string contains at least one vowel: with an odd count she deletes everything, and with an even count she leaves exactly one vowel, so whatever Bob removes, a vowel remains and she takes it all next.',
      approach: ['Scan for a vowel.', 'Return whether one exists.'],
      ds: ['String'], time: 'O(n)', space: 'O(1)',
    },
    {
      id: 810, title: 'Chalkboard XOR Game', pattern: 'Games that end at once',
      summary: 'Players alternately erase one number. A player who makes the XOR of the remaining numbers 0 loses, and a player who starts a turn with XOR 0 wins. Does Alice (first) win?',
      hints: ['If the XOR is already 0, Alice wins at once.', 'If the count is even and the XOR is not 0, can every possible erasure make the XOR 0?', 'If removing any element gave XOR 0, every element would equal the total XOR. What would that mean for an even count?'],
      insight: 'Alice wins if the total XOR is 0 or the count is even. With an even count and non-zero XOR, she always has a safe move (otherwise all elements equal the XOR, whose XOR over an even count is 0), and parity keeps her in that position every turn.',
      approach: ['Compute the XOR of all numbers.', 'Return whether it is 0 or the array length is even.'],
      ds: ['Array'], time: 'O(n)', space: 'O(1)',
      traps: ['Searching the game tree is hopeless for 1000 numbers; this is a parity proof.'],
    },

    // ---------- Forced answers ----------
    {
      id: 2396, title: 'Strictly Palindromic Number', pattern: 'Impossible or forced answers',
      summary: 'A number n is strictly palindromic if its representation in every base from 2 to n − 2 is a palindrome. Decide whether n is strictly palindromic (n ≥ 4).',
      hints: ['Look at the largest allowed base, n − 2.', 'How is n written in base n − 2?'],
      insight: 'In base n − 2, n is written "12" (one times n − 2, plus 2), which is not a palindrome, so no n ≥ 4 qualifies: the answer is always false.',
      approach: ['Write n in base n − 2: it is the two digits 1 and 2 (for n ≥ 5; n = 4 fails in base 2 as "100").', 'Return false.'],
      ds: ['None'], time: 'O(1)', space: 'O(1)',
      traps: ['Checking every base works too, but the proof is the point of the problem.'],
    },
  ],
};
