import type { Topic } from './types';

export const topic: Topic = {
  id: 'interactive',
  patterns: [
    { name: 'Binary search through an API', idea: 'Each query answers a yes/no or higher/lower question; halving the candidates per query keeps you within a logarithmic budget.' },
    { name: 'Searching hidden structured data', idea: 'Use the promised structure (a mountain, a monotone function) to choose queries that discard large parts of the space.' },
    { name: 'Elimination by queries', idea: 'Each answer rules out candidates; pick queries that rule out the most in the worst case.' },
    { name: 'Exploring a hidden world', idea: 'When you can only move and sense, run depth-first search in your own coordinates and physically back up after each branch.' },
    { name: 'Stateful readers', idea: 'An API that returns data in fixed chunks needs a buffer for leftovers between calls.' },
  ],
  signals: [
    { see: '"you call a pre-defined API", "you cannot access the array directly"', think: 'Interactive problem: count your queries', why: 'The judge limits or scores the number of calls, so the algorithm is about which questions to ask.' },
    { see: 'The API answers higher/lower or true/false on a sorted or monotone range', think: 'Binary search on the queries', why: 'Each answer halves the remaining candidates.' },
    { see: '"more than 100 calls will be judged wrong" on 10⁴ elements', think: 'A few logarithmic searches in a row', why: '100 calls allow about three to six binary searches over 10⁴ items, never a scan.' },
    { see: 'An unknown size: reading out of range returns a sentinel', think: 'Exponential search, then binary search', why: 'Doubling the bound finds a range containing the target in O(log n) queries.' },
    { see: 'A relation query between pairs (knows(a, b)) and one special element to find', think: 'Candidate elimination', why: 'Every pair query eliminates one of the two people, so one pass leaves a single candidate to verify.' },
    { see: 'You control a robot with move and turn commands but cannot see the map', think: 'DFS with backtracking in relative coordinates', why: 'You must remember visited cells yourself and return physically after exploring each direction.' },
  ],
  problems: [
    // ---------- Binary search ----------
    {
      id: 374, title: 'Guess Number Higher or Lower', pattern: 'Binary search through an API', core: true,
      summary: 'A number between 1 and n (up to about 2 × 10⁹) is hidden. An API tells you whether your guess is too high, too low or correct. Find the number.',
      hints: ['Each answer tells you which half the number is in.', 'Keep lo and hi and guess the middle.'],
      insight: 'Binary search with the API as the comparison: each guess halves the range, so about 31 guesses suffice for n = 2³¹ − 1.',
      approach: ['lo = 1, hi = n.', 'Guess mid = lo + ⌊(hi − lo) / 2⌋.', 'If the API says your guess is too high, set hi = mid − 1; too low, set lo = mid + 1; correct, return mid.'],
      ds: ['Integers'], time: 'O(log n) queries', space: 'O(1)',
      traps: ['Read the sign carefully: −1 means your guess is higher than the number.', 'Writing (lo + hi) / 2 overflows in 32-bit languages; in TypeScript it is safe here, but the lo + (hi − lo) / 2 habit is worth having.'],
    },
    {
      id: 278, title: 'First Bad Version', pattern: 'Binary search through an API', core: true,
      summary: 'Versions 1 … n; from some version on, every version is bad. Using an API that says whether a version is bad, find the first bad one with as few calls as possible.',
      hints: ['The answers look like good, good, …, good, bad, bad, …: monotone.', 'Find the boundary with binary search, keeping the answer inside [lo, hi].'],
      insight: 'Binary search for the first true in a monotone false/true sequence: if mid is bad, the answer is mid or earlier (hi = mid); otherwise it is after mid (lo = mid + 1).',
      approach: ['lo = 1, hi = n.', 'While lo < hi: mid = lo + ⌊(hi − lo) / 2⌋; if mid is bad, hi = mid, else lo = mid + 1.', 'Return lo.'],
      ds: ['Integers'], time: 'O(log n) calls', space: 'O(1)',
      traps: ['hi = mid − 1 when mid is bad could skip the answer: mid might be the first bad one.'],
    },
    {
      id: 702, title: 'Search in a Sorted Array of Unknown Size', pattern: 'Binary search through an API',
      summary: 'A sorted array of distinct numbers can only be read through an API, and reading past the end returns a huge sentinel value. Find the index of a target, or −1.',
      hints: ['You do not know the length, so you cannot set hi yet.', 'Double hi (1, 2, 4, 8, …) until the value there is at least the target.', 'Then binary search between the previous bound and hi; the sentinel behaves like +∞.'],
      insight: 'Exponential search: double the upper bound until it passes the target, then binary search inside that range. Both phases take O(log position) reads, and the out-of-range sentinel acts as infinity.',
      approach: ['hi = 1. While reading at hi gives a value smaller than the target, set lo = hi and double hi.', 'Binary search in [lo, hi] using the reader; treat the sentinel as larger than any target.', 'Return the index where the value equals the target, or −1.'],
      ds: ['Integers'], time: 'O(log k) reads, k = target position', space: 'O(1)',
      traps: ['Starting the binary search at [0, 10⁴] also works with these limits, but exponential search is the idea being tested.'],
    },
    {
      id: 1428, title: 'Leftmost Column with at Least a One', pattern: 'Binary search through an API',
      summary: 'A binary matrix has every row sorted (zeros, then ones) and can only be read cell by cell through an API with a call limit. Find the leftmost column that contains a 1, or −1.',
      hints: [
        'Binary searching each row costs rows × log(columns) calls.',
        'Better: start in the top-right corner.',
        'Seeing a 1, move left (a better column may exist); seeing a 0, move down (this row has no 1 further left).',
      ],
      insight: 'A staircase walk from the top-right corner: each read moves left or down, so at most rows + columns reads, and the last column where you saw a 1 is the answer.',
      approach: ['Start at row 0, last column; answer = −1.', 'While inside the matrix: if the cell is 1, record the column and move left; otherwise move down.', 'Return the recorded column.'],
      ds: ['Integers (row, column)'], time: 'O(rows + columns) calls', space: 'O(1)',
      traps: ['Reading whole rows exceeds the call limit.', 'The binary-search-per-row approach also fits the limit here; the staircase is optimal.'],
    },

    // ---------- Structured hidden data ----------
    {
      id: 1237, title: 'Find Positive Integer Solution for a Given Equation', pattern: 'Searching hidden structured data',
      summary: 'A hidden function f(x, y) is strictly increasing in both x and y. Find all positive integer pairs with f(x, y) = z, where solutions have x and y up to 1000.',
      hints: ['Picture f as a grid that increases to the right and downwards.', 'Start with x = 1 and y = 1000 (top right). If f is too big, decrease y; too small, increase x.'],
      insight: 'Two pointers on a monotone grid: from x = 1, y = 1000, a value that is too big rules out the whole column y, and too small rules out the whole row x, so each query discards a line.',
      approach: ['x = 1, y = 1000.', 'While x ≤ 1000 and y ≥ 1: v = f(x, y). If v equals z, record (x, y), increase x and decrease y. If v < z, increase x. If v > z, decrease y.', 'Return the recorded pairs.'],
      ds: ['Integers', 'List of pairs'], time: 'O(1000 + 1000) calls', space: 'O(answers)',
      traps: ['Trying all 10⁶ pairs works but wastes calls; binary search per x is O(1000 log 1000), also fine but slower.'],
    },
    {
      id: 1095, title: 'Find in Mountain Array', pattern: 'Searching hidden structured data', core: true,
      summary: 'A mountain array (strictly up, then strictly down) can only be read through get(i), at most 100 times, and has up to 10⁴ elements. Return the smallest index holding the target, or −1.',
      hints: [
        'Find the peak first: compare get(mid) with get(mid + 1).',
        'Then the array is two sorted halves: increasing up to the peak, decreasing after it.',
        'Search the increasing half first, because the problem wants the smallest index.',
      ],
      insight: 'Three binary searches: find the peak by comparing neighbours, then search the rising side normally and, only if needed, the falling side with the comparison reversed. That is about 28 reads for the peak (two per step) plus about 14 per side: under 60, within the limit.',
      approach: [
        'Peak: lo = 0, hi = n − 1; while lo < hi, mid = ⌊(lo + hi) / 2⌋; if get(mid) < get(mid + 1), lo = mid + 1, else hi = mid.',
        'Binary search [0, peak] for the target in increasing order. If found, return it.',
        'Otherwise binary search [peak + 1, n − 1] in decreasing order, and return the index or −1.',
      ],
      ds: ['Integers'], time: 'O(log n) reads', space: 'O(1) (optionally cache reads in a map)',
      traps: ['The same value can appear once on each side; the rising side must be searched first.', 'A linear scan uses up to 10⁴ reads and fails.'],
    },

    // ---------- Elimination ----------
    {
      id: 277, title: 'Find the Celebrity', pattern: 'Elimination by queries',
      summary: 'Among n people, a celebrity is known by everyone else and knows nobody. Using an API knows(a, b), find the celebrity or report that there is none, with as few calls as possible.',
      hints: [
        'knows(a, b) eliminates someone either way: if a knows b, a is not the celebrity; if not, b is not.',
        'One pass with a running candidate leaves exactly one possible celebrity.',
        'Then verify that candidate against everybody.',
      ],
      insight: 'Each knows(candidate, i) call eliminates one person, so a single pass leaves one candidate in n − 1 calls; a verification pass (does the candidate know anyone? does everyone know the candidate?) confirms or rejects it, for under 3n calls in total.',
      approach: [
        'candidate = 0. For i from 1 to n − 1: if knows(candidate, i), set candidate = i.',
        'For every other person i: if knows(candidate, i) or not knows(i, candidate), return −1.',
        'Return candidate.',
      ],
      ds: ['Integers'], time: 'O(n) calls (under 3n)', space: 'O(1)',
      traps: ['Checking all n² pairs is correct but uses far too many calls.', 'The first pass alone does not prove a celebrity exists; you must verify.'],
    },
    {
      id: 843, title: 'Guess the Word', pattern: 'Elimination by queries',
      summary: 'One of up to 100 six-letter words is secret. Guessing a word from the list tells you how many positions match the secret. Find the secret within a small number of guesses (often 10).',
      hints: [
        'After a guess with m matches, the secret must be a word that also has exactly m matches with your guess. Filter the candidates.',
        'Which guess helps most? One whose answer splits the remaining candidates into small groups.',
        'Choose the word minimising the size of the largest group (minimax), preferring words that are still candidates.',
      ],
      insight: 'Maintain the set of words consistent with every answer so far, and guess the word that minimises the worst-case number of survivors; the candidate set shrinks quickly enough to stay within the guess limit on the test data.',
      approach: [
        'candidates = all words.',
        'Repeat: for each word w, group the candidates by their match count with w; score w by its largest group. Guess the best-scoring word.',
        'If the answer is 6, stop. Otherwise keep only candidates whose match count with the guess equals the answer.',
      ],
      ds: ['Array of words', 'Counting array of size 7'], time: 'O(guesses × n² × 6)', space: 'O(n)',
      traps: ['Guessing words at random can exceed the limit. The minimax choice passes LeetCode\'s tests, but it is a heuristic, not a proof: a word list built to be adversarial can still push it past 10 guesses.', 'Always remove the guessed word itself from the candidates after a non-6 answer.'],
    },

    // ---------- Hidden world ----------
    {
      id: 489, title: 'Robot Room Cleaner', pattern: 'Exploring a hidden world',
      summary: 'Control a robot in an unknown room with obstacles using only move (returns whether it moved), turnLeft, turnRight and clean. Clean every reachable cell. You never see the map or your absolute position.',
      hints: [
        'Track your own coordinates and direction relative to the start, and a set of visited cells.',
        'Depth-first search: at each cell, clean it, then try the four directions in turn.',
        'After exploring a neighbour, physically return: turn around, move one step, turn around again.',
      ],
      insight: 'DFS in relative coordinates with physical backtracking: clean, try each of four directions (turning right between tries), recurse into unvisited free cells, and undo each move by turning 180°, stepping back and turning 180° again.',
      approach: [
        'visited = set of "x,y". Directions in clockwise order: up, right, down, left.',
        'dfs(x, y, dir): clean; mark visited. For k = 0 to 3: d = (dir + k) mod 4; next cell = (x, y) + step of d. If it is not visited and move() succeeds, dfs(next, d) then go back. Turn right.',
        'Going back: turn right twice, move, turn right twice.',
      ],
      ds: ['Hash set of visited cells', 'Recursion (DFS)'], time: 'O(cells − obstacles) moves × 4', space: 'O(cells)',
      traps: ['Forgetting to restore the robot\'s direction after backtracking breaks every later turn.', 'Coordinates are only relative to the start; never assume the start is a corner.'],
    },

    // ---------- Stateful readers ----------
    {
      id: 157, title: 'Read N Characters Given Read4', pattern: 'Stateful readers',
      summary: 'A file can only be read through read4, which copies up to 4 characters into a small buffer and returns how many it read. Implement read(buf, n) that reads up to n characters.',
      hints: ['Call read4 repeatedly until you have n characters or it returns fewer than 4 (end of file).', 'Copy only as many characters as you still need from each chunk.'],
      insight: 'Loop over read4 calls, copying min(chunk size, still needed) characters each time, and stop at n characters or at end of file; the follow-up (called many times) needs a persistent buffer for leftover characters.',
      approach: ['total = 0.', 'While total < n: count = read4(temp). Copy min(count, n − total) characters into buf and add them to total. If count < 4, stop.', 'Return total.'],
      ds: ['Character array buffer'], time: 'O(n)', space: 'O(1) (a buffer of 4)',
      traps: ['Copying all 4 characters when fewer are needed writes past n.', 'The "call multiple times" version (problem 158) must keep unread characters between calls.'],
    },
  ],
};
