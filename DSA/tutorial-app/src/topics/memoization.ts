import type { Topic } from './types';

export const topic: Topic = {
  id: 'memoization',
  patterns: [
    { name: 'One changing number', idea: 'The recursion has a single argument; cache its answer in an array, or in a Map when the values are huge or sparse.' },
    { name: 'A piece of the input', idea: 'The argument is a start index, or a start and end: cache the answer for each suffix or substring.' },
    { name: 'Several changing arguments', idea: 'The state needs two or three numbers (position, fuel, last move); the cache key combines them.' },
    { name: 'Memoised search on a grid', idea: 'DFS on a grid where moves only go uphill (or only downhill): no cycles, so each cell is solved once.' },
  ],
  signals: [
    { see: 'The natural solution is a recursion, and the same arguments come up again and again', think: 'Add a cache keyed by the arguments', why: 'Each distinct subproblem is then solved once instead of exponentially many times.' },
    { see: 'A brute-force recursion works on small inputs but times out at n around 30–40', think: 'Look for repeated subproblems in the call tree', why: 'An exponential call tree over a small number of distinct arguments is exactly what memoisation fixes.' },
    { see: 'The input value is huge (up to 10⁹) but each step divides it or moves it towards a few targets', think: 'Memoise with a Map instead of an array', why: 'A table of size n would not fit; a Map stores only the states the recursion actually reaches.' },
    { see: 'Paths in a grid that may only step to a strictly larger (or smaller) value', think: 'Memoised DFS, with no visited set', why: 'Moves in one direction of value cannot form a cycle, so the cells form a DAG.' },
    { see: '"Return all the ways" to split a string or group an expression', think: 'Memoise the list of results per suffix or substring', why: 'The same piece is split in many ways from many parents; computing its list once saves the repeats.' },
    { see: 'You can write the state as a few small numbers whose ranges multiply to about 10⁷ or less', think: 'Top-down DP: recursion plus a cache', why: 'The number of states times the work per state is the total cost.' },
  ],
  problems: [
    // ---------- One changing number ----------
    {
      id: 509, title: 'Fibonacci Number', pattern: 'One changing number', core: true,
      summary: 'Compute the n-th Fibonacci number, where each number is the sum of the two before it and the sequence starts with 0 and 1.',
      hints: ['The definition is already a recursion. Draw its call tree for n = 5.', 'The same values are computed over and over.', 'Store each answer the first time you compute it, and look it up after that.'],
      insight: 'Plain recursion repeats work exponentially. Caching F(k) the first time it is computed makes every later request O(1), so the whole computation is O(n).',
      approach: [
        'Make an empty cache (an array or a Map).',
        'To compute F(n): if n is 0 or 1, return n.',
        'If the cache holds n, return the stored value.',
        'Otherwise compute F(n − 1) + F(n − 2), store it under n, and return it.',
      ],
      ds: ['Array or Map as the cache', 'Recursion'], time: 'O(n)', space: 'O(n)',
      traps: ['Without the cache the call tree has about 1.6ⁿ calls.', 'Bottom-up with two rolling variables needs only O(1) space (Dynamic programming foundations).'],
    },
    {
      id: 1137, title: 'N-th Tribonacci Number', pattern: 'One changing number',
      summary: 'Compute the n-th Tribonacci number, where each term is the sum of the three terms before it and the sequence starts 0, 1, 1.',
      hints: ['This is Fibonacci with three earlier terms instead of two.', 'Cache each term, or keep only the last three in variables.'],
      insight: 'Each term depends only on the three before it, so caching (or a sliding set of three variables) computes it in linear time.',
      approach: [
        'Return 0 for n = 0, and 1 for n = 1 or n = 2.',
        'Otherwise T(n) = T(n − 1) + T(n − 2) + T(n − 3), caching each value the first time it is computed.',
        'Or loop from 3 to n, keeping only the last three values.',
      ],
      ds: ['Array cache or three variables'], time: 'O(n)', space: 'O(1) iterative, O(n) memoised',
      traps: ['n is at most 37, so the answer fits easily in a number.'],
    },
    {
      id: 397, title: 'Integer Replacement', pattern: 'One changing number', core: true,
      summary: 'Starting from a positive integer n, you may halve it when it is even, or add or subtract 1 when it is odd. Find the fewest steps to reach 1.',
      hints: [
        'Write the recursion: even gives 1 + f(n / 2); odd gives 1 + the smaller of f(n + 1) and f(n − 1).',
        'n goes up to 2³¹ − 1, so an array indexed by n is impossible. What can store only the values you actually visit?',
        'Use a Map as the cache. The recursion visits only a few values per bit of n.',
      ],
      insight: 'Memoise on n with a Map. Every two steps at least halve the number, and the values reached at each level are just two neighbours, so only O(log n) states are ever stored even though n is huge.',
      approach: [
        'Use a Map from number to steps; f(1) = 0.',
        'If n is even, f(n) = 1 + f(n / 2).',
        'If n is odd, f(n) = 1 + the smaller of f(n + 1) and f(n − 1).',
        'Store f(n) in the Map before returning it.',
      ],
      ds: ['Map as the cache', 'Recursion'], time: 'O(log n)', space: 'O(log n)',
      traps: [
        'n + 1 can reach 2³¹, which overflows a 32-bit integer in other languages; TypeScript numbers handle it.',
        'There is also a bit trick: for odd n, subtract 1 when n is 3 or ends in binary 01, otherwise add 1.',
      ],
    },
    {
      id: 1387, title: 'Sort Integers by The Power Value', pattern: 'One changing number',
      summary: 'The power of x is the number of steps to reach 1 by halving even numbers and turning odd x into 3x + 1. Sort the integers from lo to hi by power (ties by value) and return the k-th.',
      hints: ['Computing each power separately repeats work: many numbers pass through the same values.', 'Cache power(x) in a Map so every value on every chain is computed once.', 'Then sort the range by power, then by value.'],
      insight: 'These chains overlap heavily, so memoising power(x) across all numbers in the range turns repeated chain walks into lookups.',
      approach: [
        'power(1) = 0; power(x) = 1 + power(x / 2) if x is even, else 1 + power(3x + 1). Cache every result.',
        'Compute the power of every number from lo to hi.',
        'Sort by power, then by the number itself.',
        'Return the k-th number, counting from 1.',
      ],
      ds: ['Map as the cache', 'Sorting'], time: 'O(n log n + S), S = distinct values on all chains', space: 'O(S)',
      traps: ['Chains climb far above 1000 (3x + 1 grows), so the cache must be a Map, not an array of size 1001.', 'Ties go to the smaller number.'],
    },
    {
      id: 1553, title: 'Minimum Number of Days to Eat N Oranges', pattern: 'One changing number',
      summary: 'Each day you eat one orange, or half of them when the count is divisible by 2, or two thirds of them when it is divisible by 3. Find the fewest days to eat all n oranges, with n up to 2 × 10⁹.',
      hints: [
        'Eating one orange at a time is only useful to reach a multiple of 2 or 3.',
        'From n, either eat singles down to a multiple of 2 and then halve, or down to a multiple of 3 and then take two thirds.',
        'So f(n) = 1 + min(n mod 2 + f(⌊n / 2⌋), n mod 3 + f(⌊n / 3⌋)), cached in a Map.',
      ],
      insight: 'Never eat single oranges except to reach the nearest multiple of 2 or 3. Then each state branches only to ⌊n / 2⌋ and ⌊n / 3⌋, and a Map cache holds just O(log² n) distinct states.',
      approach: [
        'f(0) = 0 and f(1) = 1.',
        'f(n) = 1 + the smaller of (n mod 2) + f(⌊n / 2⌋) and (n mod 3) + f(⌊n / 3⌋).',
        'Cache each result in a Map keyed by n.',
      ],
      ds: ['Map as the cache', 'Recursion'], time: 'O(log² n)', space: 'O(log² n)',
      traps: [
        'An array up to n (2 × 10⁹) or a BFS over every count is far too slow. The insight is cutting the "eat one" move.',
        'Use whole-number division (round down).',
      ],
    },

    // ---------- A piece of the input ----------
    {
      id: 241, title: 'Different Ways to Add Parentheses', pattern: 'A piece of the input', core: true,
      summary: 'Given an expression of numbers joined by +, − and *, return every result you can get by grouping it with parentheses in all possible ways.',
      hints: ['Choose the operator that is applied last. It splits the expression into a left part and a right part.', 'Every result of the left part combines with every result of the right part.', 'The same sub-expression appears in many splits: cache the list of results for each substring.'],
      insight: 'Split at each operator: the results of an expression are every combination of a left result and a right result. Caching the list per substring removes the repeated work.',
      approach: [
        'If the substring is a plain number, its only result is that number.',
        'Otherwise, for each operator position, get all results of the part to its left and the part to its right.',
        'Combine every left result with every right result using that operator.',
        'Store the list for this substring, keyed by its start and end, before returning it.',
      ],
      ds: ['Map keyed by (start, end) holding lists', 'Recursion'], time: 'O(n · Cₙ), Cₙ = the Catalan number of groupings', space: 'O(n · Cₙ)',
      traps: ['Numbers can have two digits: read the whole number, not one character.', 'Repeated values in the output are expected: each grouping counts, even if two give the same result.'],
    },
    {
      id: 894, title: 'All Possible Full Binary Trees', pattern: 'A piece of the input',
      summary: 'Return every full binary tree with n nodes, where every node has either zero or two children.',
      hints: ['A full binary tree always has an odd number of nodes.', 'The root uses one node; the left subtree gets i nodes and the right n − 1 − i, both odd.', 'Cache the list of trees for each size and reuse it.'],
      insight: 'The full trees of size n are a root above every pair (full tree of size i, full tree of size n − 1 − i). Each size\'s list is built once and reused, and subtrees can even be shared between answers.',
      approach: [
        'If n is even, return an empty list. If n is 1, return a list with a single node.',
        'For each odd i from 1 to n − 2: for every tree L of size i and every tree R of size n − 1 − i, make a new root with children L and R.',
        'Cache the list for n before returning it.',
      ],
      ds: ['Map from size to list of trees', 'Binary tree nodes'], time: 'O(Cₖ), k = (n − 1) / 2, the number of trees', space: 'O(Cₖ)',
      traps: ['Even n has no full binary tree at all.', 'The judge accepts answers that share subtree objects, so you do not need deep copies.'],
    },
    {
      id: 140, title: 'Word Break II', pattern: 'A piece of the input',
      summary: 'Insert spaces into a string so that every piece is a dictionary word, and return every sentence you can make.',
      hints: ['Try every dictionary word that matches at the start, then solve the rest of the string.', 'The rest of the string, from position i onward, gets solved many times.', 'Cache the list of sentences for each start position.'],
      insight: 'sentences(i) = for each word that matches at position i, put it in front of every sentence of sentences(i + word length). Memoising by start index stops the same suffix from being split again.',
      approach: [
        'Put the dictionary in a Set.',
        'sentences(end of string) is a list holding one empty sentence.',
        'For a start i, try every end j: if s[i..j) is a word, attach it in front of each sentence in sentences(j).',
        'Cache the list for i and return sentences(0).',
      ],
      ds: ['Set', 'Map from index to list of strings'], time: 'O(n · 2ⁿ) in the worst case, because the output itself can be that large', space: 'O(n · 2ⁿ)',
      traps: ['The output can be exponential, so no method is polynomial; memoisation removes repeated dead ends.', 'If you only need yes or no, Word Break (139) is a plain 1D DP.'],
    },

    // ---------- Several changing arguments ----------
    {
      id: 403, title: 'Frog Jump', pattern: 'Several changing arguments', core: true,
      summary: 'A frog starts on the first stone. If its last jump was k units, the next jump must be k − 1, k or k + 1 units forward, landing on a stone; the first jump is 1 unit. Decide whether it can reach the last stone.',
      hints: ['Where the frog can go next depends on two things: which stone it is on, and the size of its last jump.', 'Cache the answer for each (stone, last jump) pair.', 'A Map from position to stone index checks landings in O(1).'],
      insight: 'The state is (stone, last jump). There are at most n² such pairs, so a memoised recursion over them is O(n²) instead of exponential branching.',
      approach: [
        'Map each stone position to its index.',
        'canCross(i, k): if i is the last stone, return true.',
        'For each next jump d of k − 1, k and k + 1 with d > 0: if the position plus d is a stone, try canCross(that stone, d).',
        'Store the result under the pair (i, k). Start with canCross(first stone, 0), which allows only a first jump of 1.',
      ],
      ds: ['Map from position to index', 'Map or 2D array as the cache'], time: 'O(n²)', space: 'O(n²)',
      traps: ['A jump of size 0 is not allowed.', 'The jump size at stone i is at most i + 1, which is why the state space is bounded by n².'],
    },
    {
      id: 1575, title: 'Count All Possible Routes', pattern: 'Several changing arguments',
      summary: 'Cities sit at distinct positions, and moving between two cities costs fuel equal to their distance. Count the routes from start to finish that never run out of fuel, revisits allowed, modulo 10⁹ + 7.',
      hints: ['A route\'s future depends only on where you are and how much fuel is left.', 'count(city, fuel) = (1 if the city is the finish) + the sum, over every other city j, of count(j, fuel − distance).', 'Cache it: at most 100 cities × 201 fuel values.'],
      insight: 'Memoise on (city, fuel left). Each state adds up the counts of all its moves, plus one if you are standing on the finish, because a route may end there or carry on.',
      approach: [
        'count(i, f) starts at 1 if i is the finish, else 0.',
        'For every other city j whose distance d is at most f, add count(j, f − d).',
        'Reduce modulo 10⁹ + 7 after each addition and store the result under (i, f).',
        'Return count(start, fuel).',
      ],
      ds: ['2D array cache [city][fuel]'], time: 'O(n² · fuel)', space: 'O(n · fuel)',
      traps: ['Reaching the finish counts as a route even if you keep driving, so add 1 and continue.', 'Apply the modulo after every addition.'],
    },
    {
      id: 1444, title: 'Number of Ways of Cutting a Pizza', pattern: 'Several changing arguments',
      summary: 'Cut a rectangular pizza into k pieces with k − 1 straight cuts, each cut giving away the top or the left part, so that every piece has at least one apple. Count the ways modulo 10⁹ + 7.',
      hints: [
        'After any sequence of cuts, what remains is always a bottom-right rectangle starting at some (row, col).',
        'State: (row, col, pieces still to make). Try every horizontal and vertical cut whose given-away part has an apple.',
        'A 2D suffix sum of apples answers "does this rectangle contain an apple?" in O(1).',
      ],
      insight: 'The remaining pizza is always the rectangle from (r, c) to the bottom-right corner, so memoise ways(r, c, k), and use suffix sums of apples to test each possible cut instantly.',
      approach: [
        'Build apples[r][c] = the number of apples in the rectangle from (r, c) to the bottom-right corner.',
        'ways(r, c, 1) = 1 if that rectangle has an apple, else 0.',
        'Otherwise, for each cut row below r whose top strip has an apple, add ways(cut row, c, k − 1); do the same for each cut column.',
        'Cache ways(r, c, k) and return ways(0, 0, k) modulo 10⁹ + 7.',
      ],
      ds: ['2D suffix sums', '3D cache'], time: 'O(k · rows · cols · (rows + cols))', space: 'O(k · rows · cols)',
      traps: ['The given-away strip must contain an apple, and the base case checks that the last piece does too.'],
    },

    // ---------- Memoised search on a grid ----------
    {
      id: 329, title: 'Longest Increasing Path in a Matrix', pattern: 'Memoised search on a grid', core: true,
      summary: 'In a grid of numbers, find the length of the longest path that steps up, down, left or right and always moves to a strictly larger value.',
      hints: ['From each cell, the longest path starting there depends only on its larger neighbours.', 'Paths only go uphill, so they can never loop: you do not need a visited set.', 'Cache longest(r, c), and take the best over all cells.'],
      insight: 'Each step goes to a strictly larger value, so there are no cycles. longest(cell) = 1 + the best longest(larger neighbour) is a memoised DFS that solves every cell exactly once.',
      approach: [
        'Make a cache grid filled with 0, meaning "not computed".',
        'longest(r, c): if cached, return it. Otherwise start at 1 and, for each neighbour with a larger value, keep the maximum of 1 + longest(neighbour).',
        'Store the result and return it.',
        'The answer is the maximum of longest over all cells.',
      ],
      ds: ['2D cache array', 'DFS'], time: 'O(m · n)', space: 'O(m · n)',
      traps: [
        'A long increasing snake makes the recursion up to m · n = 40,000 calls deep, which can overflow the JavaScript call stack. Processing cells in topological order (peeling local maximums first) avoids recursion.',
        'Strictly larger only: equal neighbours do not connect.',
      ],
    },
    {
      id: 2328, title: 'Number of Increasing Paths in a Grid', pattern: 'Memoised search on a grid',
      summary: 'Count every strictly increasing path in a grid (moving in four directions, starting and ending anywhere, a single cell included), modulo 10⁹ + 7.',
      hints: ['Count the paths that start at each cell, then add them up.', 'paths(cell) = 1 + the sum of paths(larger neighbour).', 'Memoise exactly as in Longest Increasing Path.'],
      insight: 'It is the same uphill DAG as Longest Increasing Path, but you sum instead of taking the maximum: paths from a cell = 1 (the cell alone) + paths from each larger neighbour.',
      approach: [
        'Cache grid of 0s, meaning "not computed".',
        'paths(r, c) = 1 + the sum of paths(neighbour) over neighbours with a larger value, modulo 10⁹ + 7; cache it.',
        'The answer is the sum of paths over all cells, modulo 10⁹ + 7.',
      ],
      ds: ['2D cache array', 'DFS'], time: 'O(m · n)', space: 'O(m · n)',
      traps: ['With up to 10⁵ cells, deep recursion can overflow; sorting cells by value and filling them in that order is a safe iterative version.'],
    },
  ],
};
