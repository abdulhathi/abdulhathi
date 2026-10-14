import type { Topic } from './types';

export const topic: Topic = {
  id: 'dp-interval',
  patterns: [
    { name: 'Shrink from both ends', idea: 'dp[i][j] looks at the two end elements: if they work together, use the inside range; otherwise drop one end.' },
    { name: 'Choose the split point', idea: 'Try every k inside the range as the place where it breaks into two independent smaller ranges.' },
    { name: 'Choose the last action', idea: 'Pick the element handled last. At that moment its neighbours are the range ends, so the two sides never interact.' },
    { name: 'Two players on a range', idea: 'Players take from either end, so what remains is always a range; dp[i][j] is the best score difference for the player to move.' },
  ],
  signals: [
    { see: 'The answer for a whole substring, subarray, polygon or stick depends on answers for smaller pieces of it', think: 'Interval DP: dp[i][j] over every range', why: 'Every range splits or shrinks into shorter ranges, which you solve first.' },
    { see: 'Merging, bursting or removing neighbours, where the gain depends on what is next to the element', think: 'Choose the LAST action in the range', why: 'Fixing what happens last makes the left and right parts independent.' },
    { see: 'Palindromes, or matching the first and last characters', think: 'Shrink from both ends', why: 'dp[i][j] only needs dp[i+1][j−1], dp[i+1][j] and dp[i][j−1].' },
    { see: 'Two players take from either end, both play optimally', think: 'Score-difference DP over [i, j]', why: 'What is left is always one contiguous range.' },
    { see: 'n up to about 100–500 and you must consider every way to split', think: 'O(n³) interval DP is expected', why: 'n³ is between 10⁶ and 10⁸ operations: it fits.' },
    { see: 'Cuts or triangulations where the order of operations changes the cost', think: 'Choose the split point', why: 'The first cut, or the triangle on a fixed side, divides the problem into independent halves.' },
  ],
  problems: [
    // ---------- Shrink from both ends ----------
    {
      id: 516, title: 'Longest Palindromic Subsequence', pattern: 'Shrink from both ends', core: true,
      summary: 'Find the length of the longest subsequence of a string that reads the same forwards and backwards.',
      hints: [
        'Let dp[i][j] be the answer for the substring from i to j.',
        'Look at the two end characters. What can you say when they are equal? When they are not?',
        'Fill the table by increasing length, so the inside of every range is already solved.',
      ],
      insight: 'If s[i] equals s[j], both ends join the best palindrome inside and add 2. Otherwise at least one end is useless, so take the better of dropping the left end or the right end.',
      approach: [
        'Set dp[i][i] = 1 for every i.',
        'For each length from 2 to n, and each start i with end j = i + length − 1:',
        'If s[i] equals s[j], dp[i][j] = dp[i+1][j−1] + 2, where the inside counts as 0 when the length is 2.',
        'Otherwise dp[i][j] = the larger of dp[i+1][j] and dp[i][j−1].',
        'Return dp[0][n−1].',
      ],
      ds: ['2D table'], time: 'O(n²)', space: 'O(n²), or O(n) with two rows',
      traps: [
        'A subsequence may skip characters; a substring may not. This is not Longest Palindromic Substring.',
        'A second way to see it: the longest common subsequence of the string and its reverse.',
      ],
    },
    {
      id: 1312, title: 'Minimum Insertion Steps to Make a String Palindrome', pattern: 'Shrink from both ends',
      summary: 'Find the fewest characters you must insert, anywhere in a string, to turn it into a palindrome.',
      hints: [
        'Characters that already pair up with a partner need no insertion.',
        'The longest palindromic subsequence stays as it is; every other character needs one inserted twin.',
        'Or define dp[i][j] directly as the fewest insertions for s[i..j].',
      ],
      insight: 'If the ends match, they pair up and only the inside matters. If not, insert a copy of one end on the other side and solve the rest: dp[i][j] = 1 + min(dp[i+1][j], dp[i][j−1]). The answer also equals n minus the longest palindromic subsequence.',
      approach: [
        'Single characters cost 0.',
        'For each length from 2 up and each start i (end j): if s[i] equals s[j], dp[i][j] = dp[i+1][j−1] (0 when nothing is inside).',
        'Otherwise dp[i][j] = 1 + the smaller of dp[i+1][j] and dp[i][j−1].',
        'Return dp[0][n−1].',
      ],
      ds: ['2D table'], time: 'O(n²)', space: 'O(n²)',
      traps: ['There is no need to try split points here: comparing the two ends is enough, so the table stays O(n²).'],
    },

    // ---------- Choose the split point ----------
    {
      id: 1039, title: 'Minimum Score Triangulation of Polygon', pattern: 'Choose the split point', core: true,
      summary: 'Each vertex of a convex polygon has a value. Cut the polygon into triangles; a triangle scores the product of its three vertex values. Minimise the total score.',
      hints: [
        'The side between vertex 0 and vertex n − 1 belongs to exactly one triangle.',
        'That triangle\'s third vertex k splits the rest into two smaller polygons.',
        'Let dp[i][j] be the best score for the polygon made of vertices i to j.',
      ],
      insight: 'The side (i, j) must belong to some triangle (i, k, j). Choosing k leaves two independent polygons, i..k and k..j, so dp[i][j] = min over k of dp[i][k] + v[i]·v[k]·v[j] + dp[k][j].',
      approach: [
        'dp[i][j] = 0 when j − i < 2, because two vertices form no triangle.',
        'For ranges of three vertices or more, try every k strictly between i and j.',
        'dp[i][j] = the minimum of dp[i][k] + values[i] × values[k] × values[j] + dp[k][j].',
        'Return dp[0][n−1].',
      ],
      ds: ['2D table'], time: 'O(n³)', space: 'O(n²)',
      traps: ['The two smaller polygons share vertex k: their ranges are [i, k] and [k, j], not [k + 1, j].'],
    },
    {
      id: 1130, title: 'Minimum Cost Tree From Leaf Values', pattern: 'Choose the split point',
      summary: 'Build a binary tree whose leaves, read left to right, are the array values. Each internal node is worth the largest leaf in its left subtree times the largest leaf in its right subtree. Minimise the sum of the internal nodes.',
      hints: [
        'The root splits the leaves into a left part and a right part.',
        'dp[i][j] = cheapest tree over leaves i..j; try every split.',
        'The root itself costs max(left part) × max(right part).',
      ],
      insight: 'The root divides leaves i..j at some k. The two subtrees are independent, and the root costs max(arr[i..k]) × max(arr[k+1..j]).',
      approach: [
        'Precompute the maximum of every range.',
        'dp[i][i] = 0 for a single leaf.',
        'For each range of length 2 or more: dp[i][j] = min over k of dp[i][k] + dp[k+1][j] + max(i..k) × max(k+1..j).',
        'Return dp[0][n−1].',
      ],
      ds: ['2D table', 'Range maximum table'], time: 'O(n³)', space: 'O(n²)',
      traps: ['A greedy with a monotonic stack solves it in O(n): always remove the smallest leaf, paying it times its smaller neighbour. See the Monotonic stack chapter.'],
    },
    {
      id: 375, title: 'Guess Number Higher or Lower II', pattern: 'Choose the split point',
      summary: 'A number from 1 to n is hidden. Each wrong guess x costs x dollars, and you are told whether the number is higher or lower. Find the least money that guarantees a win, whatever the number is.',
      hints: [
        '"Guarantees" means you must survive the worst case of every guess.',
        'Guessing k in the range [i, j] costs k plus the worse of the two remaining sides.',
        'dp[i][j] = min over k of k + max(dp[i][k−1], dp[k+1][j]).',
      ],
      insight: 'A minimax interval DP: you choose the guess that minimises your cost, and the hidden number behaves like an opponent who picks the side that maximises it.',
      approach: [
        'dp[i][j] = 0 when i ≥ j: one number left needs no paid guess.',
        'For each length from 2 up: dp[i][j] = min over k in i..j of k + max(dp[i][k−1], dp[k+1][j]).',
        'Return dp[1][n].',
      ],
      ds: ['2D table'], time: 'O(n³)', space: 'O(n²)',
      traps: ['Binary search (always guess the middle) does not minimise money, because guesses have different prices.', 'When one number remains, you guess it right, so it costs 0.'],
    },
    {
      id: 1547, title: 'Minimum Cost to Cut a Stick', pattern: 'Choose the split point', core: true,
      summary: 'A stick of length n must be cut at given positions, in any order you like. Each cut costs the length of the piece being cut. Find the minimum total cost.',
      hints: [
        'n can be a million, but there are at most 100 cuts: index your table by cut number, not by length.',
        'Sort the cuts and add the two ends, 0 and n.',
        'dp[i][j] = cheapest way to make every cut strictly between boundary i and boundary j. The first of those cuts costs the whole piece.',
      ],
      insight: 'Between two boundaries, whichever cut you make first costs the full piece length and splits the work into two independent pieces, so dp[i][j] = (pos[j] − pos[i]) + min over k of dp[i][k] + dp[k][j].',
      approach: [
        'Sort the cuts and add 0 at the front and n at the end, giving m positions.',
        'dp[i][j] = 0 when j = i + 1: no cut lies between them.',
        'For larger gaps: dp[i][j] = (pos[j] − pos[i]) + the minimum over k between i and j of dp[i][k] + dp[k][j].',
        'Return dp[0][m−1].',
      ],
      ds: ['Sorted array of positions', '2D table'], time: 'O(c³) for c cuts', space: 'O(c²)',
      traps: [
        'A table over the stick length (up to 10⁶) is far too big; at most 102 positions matter.',
        'Forgetting to add the two ends 0 and n.',
      ],
    },
    {
      id: 132, title: 'Palindrome Partitioning II', pattern: 'Choose the split point',
      summary: 'Cut a string into pieces that are all palindromes, using as few cuts as possible.',
      hints: [
        'First answer "is s[i..j] a palindrome?" for every range in O(n²), from the inside out.',
        'Then let cuts[j] be the fewest cuts for the prefix ending at j.',
        'If s[i..j] is a palindrome, the prefix ending at j can be the prefix ending at i − 1 plus one more piece.',
      ],
      insight: 'An interval table of palindromes turns the search into a 1D DP over prefixes: cuts[j] = min over palindromic s[i..j] of cuts[i−1] + 1, and 0 when s[0..j] is itself a palindrome.',
      approach: [
        'isPal[i][j] = (s[i] equals s[j]) and (j − i < 2 or isPal[i+1][j−1]); fill it with i going from the end backwards.',
        'For each end j: if s[0..j] is a palindrome, cuts[j] = 0.',
        'Otherwise cuts[j] = the minimum over i ≥ 1 with isPal[i][j] of cuts[i−1] + 1.',
        'Return cuts[n−1].',
      ],
      ds: ['2D boolean table', '1D DP array'], time: 'O(n²)', space: 'O(n²)',
      traps: ['Checking each substring for being a palindrome on the fly makes it O(n³), too slow for n = 2000.', 'Count cuts, not pieces: pieces = cuts + 1.'],
    },
    {
      id: 1000, title: 'Minimum Cost to Merge Stones', pattern: 'Choose the split point',
      summary: 'Piles of stones stand in a row. A move merges exactly k neighbouring piles into one and costs their total size. Find the minimum cost to end with one pile, or −1 if that is impossible.',
      hints: [
        'When is it possible at all? Each move turns k piles into 1, removing k − 1.',
        'dp[i][j] = cheapest way to reduce piles i..j to as few piles as they can reach.',
        'Split so that the left part collapses to exactly one pile: step the split point by k − 1.',
      ],
      insight: 'A range can end as one pile only if (length − 1) is divisible by (k − 1). dp[i][j] pairs a left part that becomes one pile with the rest, and pays the range total exactly when the whole range can merge into one.',
      approach: [
        'If (n − 1) is not divisible by (k − 1), return −1.',
        'Build prefix sums so each range total is O(1).',
        'For lengths from k to n: dp[i][j] = min over m from i to j − 1, stepping by k − 1, of dp[i][m] + dp[m+1][j].',
        'If (length − 1) is divisible by (k − 1), add the total of piles i..j for the final merge of this range.',
        'Return dp[0][n−1].',
      ],
      ds: ['2D table', 'Prefix sums'], time: 'O(n³ / k)', space: 'O(n²)',
      traps: ['Stepping the split by 1 instead of k − 1 mixes in left parts that cannot become a single pile.', 'Check the impossible case before anything else.'],
    },
    {
      id: 87, title: 'Scramble String', pattern: 'Choose the split point',
      summary: 'A string is scrambled by splitting it into two non-empty parts, optionally swapping them, and scrambling each part the same way. Decide whether s2 can be a scramble of s1.',
      hints: [
        'Try every split point of the s1 range.',
        'For each split, the two parts appear in s2 either in the same order or swapped.',
        'Memoise on (start in s1, start in s2, length).',
      ],
      insight: 's2[j..j+len) scrambles s1[i..i+len) if some split makes both halves scrambles, either straight or swapped. There are only O(n³) distinct (i, j, len) states, so memoisation removes the exponential blow-up.',
      approach: [
        'State (i, j, len): is s2 starting at j a scramble of s1 starting at i, both of length len?',
        'Length 1: the characters must be equal. Prune any state whose two substrings have different letter counts.',
        'For each split k from 1 to len − 1: straight means (i, j, k) and (i + k, j + k, len − k); swapped means (i, j + len − k, k) and (i + k, j, len − k).',
        'The state is true if any split works. Memoise every result.',
      ],
      ds: ['3D memo table', 'Letter counts'], time: 'O(n⁴)', space: 'O(n³)',
      traps: ['Without memoisation the recursion is exponential.', 'In the swapped case, the first k characters of s1 match the LAST k characters of the s2 range: index mistakes here are the usual bug.'],
    },

    // ---------- Choose the last action ----------
    {
      id: 312, title: 'Burst Balloons', pattern: 'Choose the last action', core: true,
      summary: 'Burst every balloon in a row. Bursting one earns its value times the values of its current left and right neighbours (a missing neighbour counts as 1). Maximise the coins.',
      hints: [
        'If you choose the FIRST balloon to burst, its neighbours keep changing later, and the two sides interact.',
        'Choose the LAST balloon to burst in a range instead. Who are its neighbours at that moment?',
        'Pad the row with a 1 at each end, and let dp[i][j] be the best score for the balloons strictly between i and j.',
      ],
      insight: 'If k bursts last between i and j, everything else in between is already gone, so it earns vals[i]·vals[k]·vals[j]. The left part (i, k) and the right part (k, j) never affect each other.',
      approach: [
        'Build vals = [1, ...nums, 1].',
        'dp[i][j] = 0 when j = i + 1, because nothing lies between them.',
        'For gaps from 2 up: dp[i][j] = the maximum over k strictly between i and j of dp[i][k] + vals[i] × vals[k] × vals[j] + dp[k][j].',
        'Return dp[0][n+1].',
      ],
      ds: ['Padded array', '2D table'], time: 'O(n³)', space: 'O(n²)',
      traps: [
        'Thinking about the first balloon leads to states that must remember which balloons remain: exponential.',
        'The neighbours in the formula are the window ends i and j, not k − 1 and k + 1.',
      ],
    },
    {
      id: 664, title: 'Strange Printer', pattern: 'Choose the last action',
      summary: 'A printer can print a run of one repeated character over any range in one turn, covering what was there. Find the fewest turns needed to print a given string.',
      hints: [
        'Printing s[i..j]: the last character s[j] can always be printed with one extra turn.',
        'If s[j] equals some earlier s[m] in the range, the turn that printed s[m] can be stretched to cover s[j] for free.',
        'dp[i][j] = min(dp[i][j−1] + 1, min over m with s[m] = s[j] of dp[i][m] + dp[m+1][j−1]).',
      ],
      insight: 'The last character can share a turn with an equal character at m: that turn is stretched over m..j, and the part in between is printed on top of it independently.',
      approach: [
        'dp[i][i] = 1.',
        'For i from n − 1 down to 0 and j from i + 1 up: start with dp[i][j] = dp[i][j−1] + 1.',
        'For each m from i to j − 1 with s[m] equal to s[j]: dp[i][j] = min(dp[i][j], dp[i][m] + dp[m+1][j−1]), where an empty middle costs 0.',
        'Return dp[0][n−1].',
      ],
      ds: ['2D table'], time: 'O(n³)', space: 'O(n²)',
      traps: ['Removing consecutive duplicate characters first does not change the answer and makes the string shorter.', 'A greedy that prints the most frequent letter first fails.'],
    },

    // ---------- Two players on a range ----------
    {
      id: 486, title: 'Predict the Winner', pattern: 'Two players on a range', core: true,
      summary: 'Two players take turns removing a number from either end of an array and adding it to their score; both play perfectly. Decide whether player 1 ends with at least as much as player 2.',
      hints: [
        'Track the score difference instead of two separate scores.',
        'Let dp[i][j] be the best (my score − your score) the player to move can force on nums[i..j].',
        'Taking the left end is worth nums[i] − dp[i+1][j].',
      ],
      insight: 'In a zero-sum game the opponent\'s best difference on what remains is subtracted from yours, so dp[i][j] = max(nums[i] − dp[i+1][j], nums[j] − dp[i][j−1]).',
      approach: [
        'dp[i][i] = nums[i].',
        'For each length from 2 up: dp[i][j] = max(nums[i] − dp[i+1][j], nums[j] − dp[i][j−1]).',
        'Player 1 wins if dp[0][n−1] ≥ 0.',
      ],
      ds: ['2D table'], time: 'O(n²)', space: 'O(n²), or O(n) with one row',
      traps: ['A tie counts as a win for player 1.', 'Greedily taking the bigger end is wrong: it can hand the opponent a much bigger number next.'],
    },
    {
      id: 877, title: 'Stone Game', pattern: 'Two players on a range',
      summary: 'An even number of piles stand in a row and the total is odd. Players alternately take a whole pile from either end. Decide whether Alice, who moves first, wins with perfect play.',
      hints: ['The score-difference DP from Predict the Winner works directly.', 'Colour the piles by even and odd index. Can the first player always take every pile of one colour?'],
      insight: 'The first player can always take all even-indexed piles or all odd-indexed piles, and one of those groups is larger because the total is odd. So Alice always wins; the interval DP confirms it in O(n²).',
      approach: [
        'Interval DP: dp[i][j] = max(piles[i] − dp[i+1][j], piles[j] − dp[i][j−1]); Alice wins if dp[0][n−1] > 0.',
        'Or use the parity argument: the answer is true for every valid input.',
      ],
      ds: ['2D table'], time: 'O(n²), or O(1) by parity', space: 'O(n²)',
      traps: ['The O(1) answer depends on the even count and odd total. Other Stone Game versions have no such shortcut.'],
    },
    {
      id: 1690, title: 'Stone Game VII', pattern: 'Two players on a range',
      summary: 'Players alternately remove the leftmost or rightmost stone and score the sum of the stones that remain. Alice wants to maximise the final score difference and Bob to minimise it. Return the difference.',
      hints: [
        'Prefix sums give "sum of what remains" in O(1).',
        'Let dp[i][j] be the best difference for the player to move on stones i..j.',
        'Removing the left stone scores sum(i+1..j), and then the opponent faces stones i+1..j.',
      ],
      insight: 'Score-difference interval DP: dp[i][j] = max(sum(i+1..j) − dp[i+1][j], sum(i..j−1) − dp[i][j−1]). Bob minimising Alice\'s lead is the same as Bob maximising his own.',
      approach: [
        'Build prefix sums.',
        'dp[i][i] = 0: removing the last stone scores nothing.',
        'For each length from 2 up: dp[i][j] = max(sum(i+1, j) − dp[i+1][j], sum(i, j−1) − dp[i][j−1]).',
        'Return dp[0][n−1].',
      ],
      ds: ['Prefix sums', '2D table'], time: 'O(n²)', space: 'O(n²), or O(n) with one row',
      traps: ['The score is the sum of what REMAINS, not the stone removed.', 'Plain recursion without a memo is exponential; n is up to 1000.'],
    },
  ],
};
