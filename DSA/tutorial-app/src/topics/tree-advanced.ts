import type { Topic } from './types';

export const topic: Topic = {
  id: 'tree-advanced',
  patterns: [
    { name: 'Recursive LCA', idea: 'One post-order pass: each subtree reports whether it holds p, q or both, and the first node that hears from both sides is the answer.' },
    { name: 'Parent pointers and depth', idea: 'When you can walk upward, bring both nodes to the same depth and climb together until they meet.' },
    { name: 'Binary lifting', idea: 'Precompute the 2^j-th ancestor of every node. Any jump of k levels is one jump per set bit of k, and LCA takes O(log n) jumps.' },
  ],
  signals: [
    { see: '"Lowest common ancestor", or the meeting point of two nodes in a tree', think: 'Recursive LCA for one query; binary lifting for many', why: 'One query is a single O(n) pass; many queries need O(log n) each after preprocessing.' },
    { see: 'Distance or path between two nodes of a tree', think: 'Go through their LCA', why: 'The unique path from a to b goes up to the LCA and down again: dist = depth(a) + depth(b) − 2·depth(lca).' },
    { see: '"k-th ancestor", or "where am I after k steps" with k up to 10⁹ or 10¹⁰', think: 'Binary lifting (doubling)', why: 'Write k in binary and make one precomputed jump per 1 bit: O(log k) per query.' },
    { see: 'Each node has a parent pointer, or children are numbered 2v and 2v + 1', think: 'Climb upward directly', why: 'You can reach ancestors without a search, so equalise depths and climb together.' },
    { see: 'A question about every edge on a path, with small value ranges (weights 1..26)', think: 'Prefix counts from the root plus LCA', why: 'Counts on a path = count(a) + count(b) − 2·count(lca), just like prefix sums on an array.' },
  ],
  problems: [
    // ---------- Recursive LCA ----------
    {
      id: 236, title: 'Lowest Common Ancestor of a Binary Tree', pattern: 'Recursive LCA', core: true,
      summary: 'Given a binary tree and two different nodes in it, return their lowest common ancestor (a node counts as its own descendant).',
      hints: [
        'Ask each subtree: do you contain p or q?',
        'If the current node is p or q, it can report itself immediately.',
        'If the left and the right subtree each report something, the current node is where p and q split apart.',
      ],
      insight: 'A post-order DFS returns p, q, the LCA or nothing from each subtree. The first node that gets a non-empty answer from both children is the LCA; if only one side answers, pass that answer up.',
      approach: [
        'If the node is empty, return nothing. If it is p or q, return the node.',
        'Recurse into the left and right children.',
        'If both results are non-empty, this node is the LCA: return it.',
        'Otherwise return whichever result is non-empty (or nothing).',
      ],
      ds: ['Binary tree', 'Recursion'], time: 'O(n)', space: 'O(h) for the recursion',
      traps: [
        'If p is an ancestor of q, the search returns p as soon as it reaches p, which is exactly right: no need to look below it.',
        'With 10⁵ nodes in a chain the recursion is 10⁵ deep; in JavaScript that can overflow, so be ready to use an explicit stack with parent pointers.',
      ],
    },
    {
      id: 235, title: 'Lowest Common Ancestor of a Binary Search Tree', pattern: 'Recursive LCA', core: true,
      summary: 'Given a binary search tree and two different nodes in it, return their lowest common ancestor.',
      hints: [
        'The ordering tells you which side each target is on without searching.',
        'If both targets are smaller than the current node, where must the LCA be?',
        'The LCA is the first node whose value lies between the two targets (inclusive).',
      ],
      insight: 'Walk down from the root: go left while both values are smaller, right while both are larger; the first node that is not on one side of both is the split point, so it is the LCA.',
      approach: [
        'Start at the root.',
        'If both p and q are smaller than the node, move to the left child.',
        'If both are larger, move to the right child.',
        'Otherwise return the current node.',
      ],
      ds: ['Binary search tree'], time: 'O(h)', space: 'O(1) iteratively',
      traps: ['Compare values, not nodes. The node equal to p or q also counts as the split point.'],
    },
    {
      id: 1123, title: 'Lowest Common Ancestor of Deepest Leaves', pattern: 'Recursive LCA',
      summary: 'Return the lowest common ancestor of all the deepest leaves of a binary tree.',
      hints: [
        'Each subtree can report two things: its height and the LCA of its own deepest leaves.',
        'Compare the heights of the two children.',
        'Equal heights: the deepest leaves are on both sides, so the current node is their LCA. Otherwise take the deeper side\'s answer.',
      ],
      insight: 'Return (depth, answer) pairs from a post-order DFS: if both children are equally deep, the current node joins the deepest leaves of both; otherwise the deeper child already holds the answer.',
      approach: [
        'Define a helper that returns the height of a subtree and the LCA of its deepest leaves.',
        'An empty subtree returns height 0 and no node.',
        'For a node, get both children\'s results. If the heights are equal, return (height + 1, this node).',
        'Otherwise return (larger height + 1, that child\'s answer).',
      ],
      ds: ['Binary tree', 'Recursion returning a pair'], time: 'O(n)', space: 'O(h)',
      traps: [
        'Problem 865, Smallest Subtree with all the Deepest Nodes, is the same problem: solve it as a free extra.',
        'Computing the height separately for each node is O(n²); return it together with the answer.',
      ],
    },

    // ---------- Parent pointers and depth ----------
    {
      id: 1650, title: 'Lowest Common Ancestor of a Binary Tree III', pattern: 'Parent pointers and depth',
      summary: 'Each node has a pointer to its parent, and you are given two nodes but not the root. Return their lowest common ancestor.',
      hints: [
        'Following parent pointers from a node gives a linked list that ends at the root.',
        'Two linked lists that merge: where have you seen that before?',
        'Walk both pointers up; when one reaches the top, restart it at the other starting node. They meet at the LCA.',
      ],
      insight: 'The paths to the root are two linked lists that merge at the LCA. Switching each pointer to the other start when it runs out makes both walk the same total distance, so they arrive at the merge point together.',
      approach: [
        'Set a = p and b = q.',
        'While a and b are different: move a to its parent, or to q if it has none; move b to its parent, or to p if it has none.',
        'Return a.',
      ],
      ds: ['Parent pointers', 'Two pointers'], time: 'O(h)', space: 'O(1)',
      traps: ['A set of p\'s ancestors also works with O(h) memory; the switching trick is the same as Intersection of Two Linked Lists.'],
    },
    {
      id: 2509, title: 'Cycle Length Queries in a Tree', pattern: 'Parent pointers and depth',
      summary: 'In a complete binary tree numbered like a heap (children of v are 2v and 2v + 1), adding an edge between two nodes creates one cycle. For each query, return that cycle\'s length.',
      hints: [
        'The cycle is the tree path between the two nodes, plus the new edge.',
        'The parent of v is floor(v / 2), so you can climb without storing the tree.',
        'The larger number is never shallower than the smaller one: always halve the larger until they are equal.',
      ],
      insight: 'In heap numbering a larger label is never at a smaller depth, so repeatedly halving the larger label climbs toward the LCA; the number of halvings is the path length, and the new edge adds one.',
      approach: [
        'For each query, set steps = 0.',
        'While a and b differ: halve (integer division) whichever is larger, and add 1 to steps.',
        'The answer is steps + 1.',
      ],
      ds: ['Integer arithmetic'], time: 'O(n) per query, n ≤ 30', space: 'O(1)',
      traps: ['Labels go up to 2³⁰ − 1, which still fits exactly in a JavaScript number; use Math.floor(v / 2) or a right shift.'],
    },
    {
      id: 2096, title: 'Step-By-Step Directions From a Binary Tree Node to Another', pattern: 'Parent pointers and depth', core: true,
      summary: 'Give the shortest route from one node of a binary tree to another as a string of moves: L (to left child), R (to right child) and U (to parent).',
      hints: [
        'The shortest route goes up from the start to the LCA, then down to the destination.',
        'Record the path from the root to each node as a string of L and R moves.',
        'Drop the common prefix of the two paths: what is left of the start path becomes U moves, and what is left of the destination path is used as it is.',
      ],
      insight: 'Root-to-node paths share exactly the prefix that leads to the LCA. After removing it, every remaining step of the start path is one U, followed by the rest of the destination path.',
      approach: [
        'Find the path from the root to the start value and to the destination value as lists of L and R moves (DFS with backtracking, or parent pointers).',
        'Skip the longest common prefix of the two lists.',
        'Output one U for each remaining move of the start path, then the remaining moves of the destination path.',
      ],
      ds: ['Binary tree', 'Array of moves used as a stack'], time: 'O(n)', space: 'O(n)',
      traps: [
        'Building strings by repeated concatenation inside the recursion is O(n²); push and pop on an array instead.',
        'With 10⁵ nodes the tree can be a chain, so a recursive search may hit the call stack limit; an explicit stack is safer.',
      ],
    },

    // ---------- Binary lifting ----------
    {
      id: 1483, title: 'Kth Ancestor of a Tree Node', pattern: 'Binary lifting', core: true,
      summary: 'Given a tree as a parent array, answer many queries asking for the k-th ancestor of a node, or −1 if it does not exist.',
      hints: [
        'Walking up one parent at a time is O(k) per query, up to 5 × 10⁴ steps.',
        'Any k is a sum of powers of two. What if you knew every node\'s 1st, 2nd, 4th, 8th… ancestor?',
        'The 2^j-th ancestor is the 2^(j−1)-th ancestor of the 2^(j−1)-th ancestor.',
      ],
      insight: 'Precompute up[j][v], the 2^j-th ancestor, with up[j][v] = up[j−1][up[j−1][v]]. A query makes one jump for each set bit of k.',
      approach: [
        'Let LOG be about 16 (2¹⁶ > 5 × 10⁴). Row 0 of the table is the parent array.',
        'Fill row j from row j − 1: the ancestor of the ancestor, or −1 if either is missing.',
        'For a query, look at each bit j of k; if it is set, replace the node with up[j][node].',
        'Stop with −1 as soon as the node becomes −1; otherwise return the final node.',
      ],
      ds: ['2D table of ancestors (array of typed arrays)'], time: 'O(n log n) build, O(log k) per query', space: 'O(n log n)',
      traps: ['Propagate −1: once an ancestor is missing, every higher one is missing too.', 'Order of jumps does not matter, because the jumps just add up to k.'],
    },
    {
      id: 2846, title: 'Minimum Edge Weight Equilibrium Queries in a Tree', pattern: 'Binary lifting',
      summary: 'In a weighted tree (weights from 1 to 26), each query asks for the fewest edge changes needed to make every edge on the path between two nodes have the same weight.',
      hints: [
        'The best plan keeps the most common weight on the path and changes every other edge.',
        'So you need, for a path, how many edges carry each of the 26 weights.',
        'Store counts on the path from the root to every node; the counts on a–b come from a, b and their LCA.',
      ],
      insight: 'Answer = path length − (largest count of one weight on the path). Root-to-node counts work like prefix sums: path counts = count(a) + count(b) − 2·count(lca), with the LCA from binary lifting.',
      approach: [
        'Root the tree at 0. With one DFS or BFS, record each node\'s parent, depth and the 26 counts of weights on its root path.',
        'Build the binary lifting table from the parents.',
        'For a query, find the LCA. The path length is depth(a) + depth(b) − 2·depth(lca).',
        'For each of the 26 weights compute its count on the path; the answer is the path length minus the largest count.',
      ],
      ds: ['Adjacency list', 'Binary lifting table', '26 counts per node'], time: 'O((n + m)(log n + 26))', space: 'O(n (log n + 26))',
      traps: ['A query with a = b has an empty path: the answer is 0.', 'Recursive DFS on a 10⁴-node chain is risky in JavaScript; use an explicit stack or BFS.'],
    },
    {
      id: 2836, title: 'Maximize Value of Function in a Ball Passing Game', pattern: 'Binary lifting',
      summary: 'Player i always passes to receiver[i]. Choosing a starting player, the score is the sum of the indices of everyone who holds the ball over k passes (counting the starter and repeats). With k up to 10¹⁰, find the best score.',
      hints: [
        'Simulating k passes from every start is impossible for k = 10¹⁰.',
        'Precompute, for every player and every power of two, where the ball is after 2^j passes and the sum of indices collected on the way.',
        'Combine the jumps for the set bits of k, starting from each player.',
      ],
      insight: 'Binary lifting on the "next player" pointer: store both the player after 2^j passes and the sum of receivers along those passes. Doubling combines them, and k splits into at most 34 jumps.',
      approach: [
        'Row 0: jump[0][i] = receiver[i] and sum[0][i] = receiver[i].',
        'Row j: jump[j][i] = jump[j−1][jump[j−1][i]], and sum[j][i] = sum[j−1][i] + sum[j−1][jump[j−1][i]].',
        'For each start i: score = i; for every set bit j of k, add sum[j][current] and move current to jump[j][current].',
        'Return the largest score.',
      ],
      ds: ['Jump table', 'Sum table (Float64Array)'], time: 'O(n log k)', space: 'O(n log k)',
      traps: [
        'Scores reach about 10¹⁵, below 2⁵³, so JavaScript numbers are still exact; 32-bit typed arrays would overflow.',
        'k does not fit in 32 bits, so read its bits with division by powers of two, not with the >> operator.',
      ],
    },
  ],
};
