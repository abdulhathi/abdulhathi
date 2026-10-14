import type { ComponentType } from 'react';

export type Group =
  | 'Start here'
  | 'Phase 1 · Foundations'
  | 'Phase 2 · Linear structures'
  | 'Phase 3 · Core techniques'
  | 'Phase 4 · Trees and heaps'
  | 'Phase 5 · Graphs and search'
  | 'Phase 6 · Greedy and DP'
  | 'Phase 7 · Advanced structures'
  | 'Phase 8 · Math and special topics'
  | 'Reference';

export type ChapterKind = 'guide' | 'topic' | 'reference';

export type Chapter = {
  id: string; // also the URL (#/<id>), the body file (./<id>.tsx) and, for topics, the data file (../topics/<id>.ts)
  num: string;
  group: Group;
  title: string;
  goal: string;
  kind: ChapterKind;
  tags: readonly string[]; // the LeetCode topic tags this chapter teaches
  load: () => Promise<{ default: ComponentType }>;
};

type Entry = [id: string, title: string, goal: string, tags?: readonly string[]];

// Chapter bodies load on demand, one file each, so the first page stays small.
const bodies = import.meta.glob<{ default: ComponentType }>('./*.tsx');

const missing = (id: string) => () => Promise.reject(new Error(`No chapter body file for "${id}"`));

const GROUPS: [Group, ChapterKind, Entry[]][] = [
  ['Start here', 'guide', [
    ['welcome', 'How this lab works', 'What you will learn, how each chapter teaches one technique, and the study loop that turns reading into solving.'],
    ['method', 'How to solve any problem', 'A repeatable method for a problem you have never seen: understand it, match a pattern, plan, check and explain.'],
  ]],
  ['Phase 1 · Foundations', 'topic', [
    ['complexity', 'Complexity analysis', 'Count the cost of an algorithm with Big-O, and read the input limits to know which complexity a problem expects.'],
    ['recursion', 'Recursion', 'Think in smaller copies of the same problem: base cases, the call stack, and trusting the recursive call.', ['Recursion']],
    ['math', 'Math', 'The arithmetic every solution leans on: overflow, remainders, digits, fast powers and matrix tricks.', ['Math', 'Linear Algebra', "Newton's Method"]],
    ['bit-manipulation', 'Bit manipulation', 'Treat numbers as rows of bits: masks, XOR tricks, and counting and flipping bits in constant time.', ['Bit Manipulation']],
  ]],
  ['Phase 2 · Linear structures', 'topic', [
    ['array', 'Arrays', 'Read, write and rearrange arrays in place, and learn the simple ideas behind most array problems.', ['Array', 'Boyer–Moore Majority Vote Algorithm']],
    ['string', 'Strings', 'Work with characters and substrings efficiently: frequency counts, palindromes, parsing and building strings.', ['String']],
    ['hash-table', 'Hash tables', 'Trade memory for speed: constant-time lookup, the complement trick, grouping and removing duplicates.', ['Hash Table']],
    ['counting', 'Counting', 'Answer "how many" and "how often" with frequency maps, frequency arrays and counting by contribution.', ['Counting']],
    ['matrix', 'Matrices', 'Move around a 2D grid cleanly: directions, layers, spirals, rotations and marking cells in place.', ['Matrix']],
    ['simulation', 'Simulation', 'Follow the rules exactly, step by step, and model the state so no edge case slips through.', ['Simulation']],
    ['enumeration', 'Enumeration', 'Brute force done smartly: choose what to loop over, and use the limits to cut the search.', ['Enumeration', 'Brute-Force Search']],
    ['linked-list', 'Linked lists', 'Rewire nodes safely: dummy heads, reversal, merging, and finding the middle and cycles with two speeds.', ['Linked List']],
    ['doubly-linked-list', 'Doubly linked lists', 'Remove and move nodes in constant time, the building block of LRU caches and text editors.', ['Doubly-Linked List']],
    ['stack', 'Stacks', 'Last in, first out: matching brackets, evaluating expressions, undo, and replacing recursion.', ['Stack', 'Bracket Sequences']],
    ['queue', 'Queues and deques', 'First in, first out: processing in order, circular buffers, and deques that work at both ends.', ['Queue']],
  ]],
  ['Phase 3 · Core techniques', 'topic', [
    ['two-pointers', 'Two pointers', 'Replace a nested loop with two indices that move with purpose: from both ends, at two speeds, or reading and writing.', ['Two Pointers', "Floyd's Cycle Finding Algorithm"]],
    ['sliding-window', 'Sliding window', 'Find the best contiguous range in one pass by growing and shrinking a window instead of starting over.', ['Sliding Window']],
    ['prefix-sum', 'Prefix sums', 'Answer any range-sum question in constant time, and count subarrays with a running sum and a hash map.', ['Prefix Sum']],
    ['binary-search', 'Binary search', 'Halve the search space every step: on sorted data, on rotated data, and on the answer itself.', ['Binary Search', 'Ternary Search']],
    ['sorting', 'Sorting', 'Sort to make a problem easy, write the right comparator, and know how the classic sorts work.', ['Sorting', 'Sort', 'Bubble Sort', 'Quicksort', 'Timsort', 'Tournament Sort']],
    ['divide-and-conquer', 'Divide and conquer', 'Split a problem into independent parts, solve each, and combine the answers.', ['Divide and Conquer']],
    ['merge-sort', 'Merge sort', 'Use the merge step to sort lists and to count pairs that are out of order.', ['Merge Sort']],
    ['quickselect', 'Quickselect', 'Find the k-th smallest element in linear time on average by partitioning only one side.', ['Quickselect']],
    ['linear-sorts', 'Counting, bucket and radix sort', 'Sort faster than n log n when values are small or bounded, and use buckets to group by range.', ['Counting Sort', 'Bucket Sort', 'Radix Sort']],
    ['intervals', 'Intervals', 'Merge, insert and compare ranges: sort by start, then sweep once.'],
    ['sweep-line', 'Sweep line', 'Turn ranges into start and end events and process them in order to track what is active.', ['Sweep Line']],
    ['monotonic-stack', 'Monotonic stack', 'Find the next greater or smaller element for every position in one pass.', ['Monotonic Stack', 'Cartesian Tree']],
    ['monotonic-queue', 'Monotonic queue', 'Keep the maximum or minimum of a sliding window available in constant time.', ['Monotonic Queue']],
  ]],
  ['Phase 4 · Trees and heaps', 'topic', [
    ['tree', 'Trees', 'The vocabulary and shape of trees, and why recursion solves almost every tree problem.', ['Tree']],
    ['binary-tree', 'Binary trees', 'Traverse depth first and level by level, and pass information up and down the tree.', ['Binary Tree']],
    ['bst', 'Binary search trees', 'Use the ordering rule to search, insert, delete, validate and walk a tree in sorted order.', ['Binary Search Tree']],
    ['heap', 'Heaps and priority queues', 'Always get the smallest or largest item fast: top K, merging sorted lists, running medians and scheduling.', ['Heap (Priority Queue)', 'Heap']],
    ['trie', 'Tries', 'Store words by their prefixes for instant prefix search, autocomplete and word games.', ['Trie']],
    ['ordered-set', 'Ordered sets and maps', 'Keep items sorted while inserting and deleting, and ask for the next value above or below.', ['Ordered Set', 'Treap', 'Splay Tree']],
  ]],
  ['Phase 5 · Graphs and search', 'topic', [
    ['dfs', 'Depth-first search', 'Explore as deep as possible before backing up: grids, graphs, components and paths.', ['Depth-First Search']],
    ['bfs', 'Breadth-first search', 'Explore level by level to find shortest paths in unweighted graphs, from one start or many.', ['Breadth-First Search', '0-1 BFS', 'Bidirectional Search', 'Heuristic Search', 'A* Search']],
    ['backtracking', 'Backtracking', 'Build every candidate step by step and abandon a path the moment it cannot work.', ['Backtracking', 'Algorithm X', 'Dancing Links']],
    ['graph', 'Graph theory', 'Model a problem as a graph, store it well, and detect components, cycles and two-colourings.', ['Graph Theory', 'Bipartite Graph', 'Graph Coloring', 'Directed Acyclic Graph', 'Hamiltonian Path', 'Planar Graph']],
    ['topological-sort', 'Topological sort', 'Order tasks so every prerequisite comes first, and detect when no order exists.', ['Topological Sort']],
    ['union-find', 'Union-find', 'Track which items are connected as links are added, in nearly constant time per operation.', ['Union-Find']],
    ['shortest-path', 'Shortest paths', 'Pick the right algorithm for weighted shortest paths: Dijkstra, Bellman-Ford or Floyd-Warshall.', ['Shortest Path', "Dijkstra's Algorithm", 'Bellman–Ford Algorithm', 'Floyd–Warshall Algorithm', 'K Shortest Path']],
    ['mst', 'Minimum spanning trees', "Connect every node at the lowest total cost with Kruskal's or Prim's algorithm.", ['Minimum Spanning Tree', "Prim's Algorithm", "Kruskal's Algorithm", "Borůvka's Algorithm"]],
    ['scc', 'Strongly connected components', 'Find groups of nodes that can all reach each other in a directed graph.', ['Strongly Connected Component', "Kosaraju's Algorithm", "Tarjan's SCC Algorithm"]],
    ['biconnected', 'Bridges and articulation points', 'Find the edges and nodes whose removal disconnects a graph.', ['Biconnected Component', 'Bridge (Graph)', 'Articulation Point']],
    ['eulerian', 'Eulerian paths and circuits', 'Find a route that uses every edge exactly once, and know when one exists.', ['Eulerian Circuit', 'Eulerian Path', 'Semi-Eulerian Graph', 'Eulerian Graph']],
    ['network-flow', 'Network flow and matching', 'Push the most flow through a network, find minimum cuts, and match pairs optimally.', ['Flow Network', 'Maximum Flow', 'Minimum Cut', 'Edmonds–Karp Algorithm', "Dinic's Algorithm", 'MPM Algorithm', 'Push-Relabel Algorithm', 'Minimum-Cost Flow', 'Successive Shortest Path Algorithm', 'Matching (Graph)', 'Maximum Matching', 'Perfect Matching', 'Hungarian Algorithm']],
  ]],
  ['Phase 6 · Greedy and DP', 'topic', [
    ['greedy', 'Greedy algorithms', 'Make the locally best choice, prove it stays safe, and spot when greedy fails.', ['Greedy']],
    ['memoization', 'Memoization', 'Make a slow recursion fast by remembering the answers to subproblems you have already solved.', ['Memoization']],
    ['dp', 'Dynamic programming foundations', 'Define a state, a transition and a base case, and build big answers from smaller ones.', ['Dynamic Programming']],
    ['dp-grid', 'Grid DP', 'Count and optimise paths through a grid by filling a table cell by cell.'],
    ['knapsack', 'Knapsack DP', 'Choose items under a capacity: 0/1, unbounded, bounded and subset-sum variants.', ['Knapsack Problem', '0-1 Knapsack', 'Complete Knapsack', 'Mixed Knapsack', 'Multiple Knapsack']],
    ['dp-sequences', 'Sequence and string DP', 'Longest increasing subsequence, longest common subsequence, edit distance and palindromes.', ['Longest Increasing Subsequence', 'Longest Common Subsequence']],
    ['dp-interval', 'Interval DP', 'Solve a range by choosing where to split it, building from short ranges up to the whole.'],
    ['dp-state-machine', 'State machine DP', 'Model each step as a small set of states, as in the stock trading and house robber problems.'],
    ['dp-tree', 'Tree DP', 'Combine answers from children, and reroot the tree to get an answer for every node.', ['DP on Trees']],
    ['dp-digit', 'Digit DP', 'Count the numbers up to N that have a digit property by building them one digit at a time.'],
    ['bitmask', 'Bitmasks and bitmask DP', 'Represent a subset as an integer, run DP over subsets, and split a search in the middle.', ['Bitmask', 'Meet in the Middle']],
    ['dp-optimization', 'DP optimizations', 'Speed up a correct but slow DP with monotonic queues, binary search and convex hull tricks.', ['Li Chao Tree']],
  ]],
  ['Phase 7 · Advanced structures', 'topic', [
    ['segment-tree', 'Segment trees', 'Answer range queries and apply range updates in logarithmic time.', ['Segment Tree', 'Persistent Data Structure']],
    ['binary-indexed-tree', 'Binary indexed trees', 'Keep prefix sums that support updates, with a structure that fits in one array.', ['Binary Indexed Tree']],
    ['range-queries', 'Sparse tables and sqrt decomposition', 'Answer range minimum queries in constant time on fixed data, and split arrays into blocks.', ['Range Minimum/Maximum Query', 'Sparse Table', 'Sqrt Decomposition']],
    ['tree-advanced', 'LCA and binary lifting', 'Find lowest common ancestors and jump k levels up a tree in logarithmic time.', ['Lowest Common Ancestor', 'Binary Lifting']],
    ['hash-function', 'Hash functions', 'Design keys that capture what matters, and handle collisions when you build your own hash table.', ['Hash Function']],
    ['rolling-hash', 'Rolling hash', 'Compare substrings in constant time by updating a hash as a window slides.', ['Rolling Hash']],
    ['string-matching', 'String matching', "Find patterns in text in linear time with KMP, the Z-function and Manacher's algorithm.", ['String Matching', 'Knuth–Morris–Pratt Algorithm', 'Z Algorithm', 'Manacher', 'Boyer–Moore String-Search Algorithm', 'Aho–Corasick Algorithm', 'Palindromic Tree', 'Lexicographically Minimal String Rotation', 'Lyndon Factorization']],
    ['suffix-array', 'Suffix arrays', 'Sort all suffixes of a string to answer repeated-substring and distinct-substring questions.', ['Suffix Array', 'Suffix Automaton', 'Suffix Tree']],
    ['design', 'Design problems', 'Combine data structures to meet required time limits: LRU caches, rate limiters, time-based stores.', ['Design']],
    ['iterator', 'Iterators', 'Produce items lazily, one at a time, from nested or combined sources.', ['Iterator']],
    ['data-stream', 'Data streams', 'Answer questions about data that arrives one item at a time, keeping only what you need.', ['Data Stream']],
  ]],
  ['Phase 8 · Math and special topics', 'topic', [
    ['number-theory', 'Number theory', 'Primes, GCD and LCM, modular inverses and the sieve.', ['Number Theory', 'Greatest Common Divisor', 'Euclidean Algorithm', 'Extended Euclidean Algorithm', "Bézout's Lemma", 'Least Common Multiple', 'Prime Factorization', 'Primality Test', 'Sieve Theory', 'Prime Number Sieve', "Fermat's Little Theorem", "Euler's Totient Function", "Euler's Theorem"]],
    ['combinatorics', 'Combinatorics', 'Count arrangements and selections without listing them, modulo 10⁹ + 7.', ['Combinatorics', 'Inclusion-Exclusion Principle', 'Pigeonhole Principle']],
    ['geometry', 'Geometry', 'Points, lines, areas, convex hulls and the cross product.', ['Geometry', 'Polygons', 'Convex Hull', 'Nearest Pair of Points', 'Minimum Enclosing Circle', 'Triangulation', 'K-D Tree']],
    ['probability', 'Probability and statistics', 'Expected values, probability DP and the statistics that interview problems ask for.', ['Probability and Statistics']],
    ['game-theory', 'Game theory', 'Decide who wins a two-player game when both play perfectly: minimax, Nim and Grundy numbers.', ['Game Theory', 'Minimax', 'Zero-Sum Game', 'Impartial Game', 'Nim Game', 'Sprague–Grundy Theorem']],
    ['brainteaser', 'Brainteasers', 'Spot the mathematical insight that turns a problem into a short answer.', ['Brainteaser']],
    ['randomized', 'Randomized algorithms', 'Use randomness well: shuffling, weighted picks and constant-time random sets.', ['Randomized']],
    ['reservoir-sampling', 'Reservoir sampling', 'Pick items uniformly from a stream whose length you do not know.', ['Reservoir Sampling']],
    ['rejection-sampling', 'Rejection sampling', 'Build one random generator from another by throwing away results you cannot use.', ['Rejection Sampling']],
    ['interactive', 'Interactive problems', 'Solve problems where you question a hidden judge and must stay within a query limit.', ['Interactive']],
  ]],
  ['Reference', 'reference', [
    ['recognition', 'Pattern recognition guide', 'Every signal from every chapter in one searchable table: what you see in a problem, and what to reach for.'],
    ['ts-toolbox', 'TypeScript toolbox for DSA', 'Which built-in to use for each data structure, what each operation costs, and the traps that cost time.'],
    ['study-plan', 'Study plan', 'A week-by-week route through the lab, a faster Core path, and how to keep what you learn.'],
  ]],
];

let topicNum = 0;
let refNum = 0;

export const CHAPTERS: Chapter[] = GROUPS.flatMap(([group, kind, entries]) =>
  entries.map(([id, title, goal, tags = []]) => ({
    id,
    num: kind === 'reference' ? String.fromCharCode(65 + refNum++) : String(++topicNum).padStart(2, '0'),
    group,
    title,
    goal,
    kind,
    tags,
    load: bodies[`./${id}.tsx`] ?? missing(id),
  })),
);

/** Chapters that count toward progress. */
export const TRACKED = CHAPTERS.filter((c) => c.kind !== 'reference');

export const PRACTICE_PAGES = [
  { id: 'tracker', title: 'Problem tracker', goal: 'Every problem in the lab with your status, plus a finder that tells you which chapters teach any LeetCode problem.' },
  { id: 'drill', title: 'Recognition drill', goal: 'Read a problem, name the technique, then check. Recognising the pattern is most of solving.' },
  { id: 'review', title: 'Review queue', goal: 'Solved problems come back after 3, 7, 15 and 30 days, so the technique stays with you.' },
] as const;

export type PracticePageId = (typeof PRACTICE_PAGES)[number]['id'];

export function findChapter(id: string) {
  return CHAPTERS.find((c) => c.id === id);
}

export function chapterNumber(id: string) {
  return findChapter(id)?.num ?? '';
}
