import type { Topic } from './types';

export const topic: Topic = {
  id: 'divide-and-conquer',
  patterns: [
    { name: 'Split in half and combine', idea: 'Solve the left and right halves on their own, then combine the two answers, often with a step that looks across the middle.' },
    { name: 'Build a tree from parts', idea: 'Choose the root, split the rest into what goes left and what goes right, and build each side the same way.' },
    { name: 'Every way to split', idea: 'Try every split point, solve both sides recursively, and combine every pair of their answers.' },
    { name: 'Split a grid', idea: 'Cut a 2D area into quadrants, or discard a row or column at a time, and work on what remains.' },
    { name: 'Split at a bad element', idea: 'An element that can never belong to the answer cuts the input into independent pieces.' },
  ],
  signals: [
    { see: 'The answer for a range can be built from the answers of its two halves', think: 'Split in half and combine', why: 'If the halves are independent, the work divides cleanly and a merge-like step combines them.' },
    { see: 'Build a tree from a sorted array, a list, or two traversals', think: 'Root first, then recurse on the left and right parts', why: 'Every subtree is the same problem on a smaller part of the input.' },
    { see: 'Return all possible results, trees or groupings', think: 'Try every split point and combine sub-results (with memoisation)', why: 'Each split creates two independent subproblems, and their answers combine as a cross product.' },
    { see: 'Some element can never be part of a valid answer', think: 'Split the input at it and solve the pieces', why: 'No answer crosses that element, so the pieces are independent problems.' },
    { see: 'A grid of size 2ᵏ, or a matrix sorted along rows and columns', think: 'Quadrants, or discard a row or column per step', why: 'Each step removes a large part of the area that cannot hold the answer.' },
    { see: 'A follow-up asks for O(n log n) using "a more subtle" approach', think: 'Divide and conquer with a linear combine step', why: 'T(n) = 2T(n/2) + O(n) solves to O(n log n), the merge sort recurrence.' },
  ],
  problems: [
    // ---------- Split in half and combine ----------
    {
      id: 169, title: 'Majority Element', pattern: 'Split in half and combine', core: true,
      summary: 'Return the value that appears more than half the time in an array. It always exists.',
      hints: [
        'If a value is the majority of the whole array, it must be the majority of at least one half.',
        'Solve both halves. If they agree, you are done; if not, count which of the two candidates appears more often in the whole range.',
        'The Boyer–Moore voting method solves it in O(n) time and O(1) space; see the Arrays chapter.',
      ],
      insight: 'The majority of a range is the majority of its left half or of its right half (otherwise it would fill at most half of each), so recursively get both candidates and keep the one that occurs more often in the range.',
      approach: [
        'A range with one value has that value as its majority.',
        'Find the majority candidate of each half recursively.',
        'If both halves return the same value, return it.',
        'Otherwise count both candidates in the whole range and return the more frequent one.',
      ],
      ds: ['Array', 'Recursion'], time: 'O(n log n)', space: 'O(log n) for the recursion',
      traps: ['In interviews, also know the O(n) time, O(1) space voting method: it answers the follow-up.'],
    },
    {
      id: 53, title: 'Maximum Subarray', pattern: 'Split in half and combine', core: true,
      summary: 'Find the largest sum of a non-empty contiguous subarray.',
      hints: [
        'Split the array in half. Where can the best subarray be?',
        'Entirely in the left half, entirely in the right half, or crossing the middle.',
        'The best crossing subarray is the best suffix of the left half plus the best prefix of the right half, found by two linear scans outward from the middle.',
      ],
      insight: 'The answer for a range is the largest of the left answer, the right answer and the best subarray crossing the middle; the crossing part takes two linear scans, so the whole thing is O(n log n).',
      approach: [
        'A single element is its own answer.',
        'Solve the left and right halves recursively.',
        'Scan left from the middle for the best suffix sum, and right from the middle for the best prefix sum; their total is the best crossing sum.',
        'Return the largest of the three.',
      ],
      ds: ['Array', 'Recursion'], time: 'O(n log n)', space: 'O(log n)',
      traps: [
        "Kadane's algorithm solves it in O(n) (see Dynamic programming foundations). The divide-and-conquer version is the problem's follow-up and teaches the crossing idea.",
        'All values can be negative: the answer is then the largest single value, so never start the best sum at 0.',
      ],
    },
    {
      id: 932, title: 'Beautiful Array', pattern: 'Split in half and combine',
      summary: 'Return any arrangement of the numbers 1 to n in which no number lies between two others that it is the exact average of.',
      hints: [
        'If all odd numbers come first and all even numbers after them, can an average bridge the two groups?',
        'An odd number plus an even number is odd, so it is never twice a whole number.',
        'If an arrangement is beautiful, applying x → 2x − 1 or x → 2x to every element keeps it beautiful.',
      ],
      insight: 'Odd numbers on the left and even numbers on the right can never form an average across the boundary. Build each side from a smaller beautiful array with the maps x → 2x − 1 and x → 2x, which preserve the property.',
      approach: [
        'If n is 1, the answer is [1].',
        'Build a beautiful array for ⌈n / 2⌉ and map each x to 2x − 1: these are the odd numbers up to n.',
        'Build a beautiful array for ⌊n / 2⌋ and map each x to 2x: these are the even numbers up to n.',
        'Put the odd part first and the even part after it.',
      ],
      ds: ['Array', 'Recursion'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Do not search for an arrangement and test all triples: construction needs no checking at all.'],
    },

    // ---------- Build a tree from parts ----------
    {
      id: 108, title: 'Convert Sorted Array to Binary Search Tree', pattern: 'Build a tree from parts', core: true,
      summary: 'Turn a sorted array into a height-balanced binary search tree.',
      hints: [
        'Which value should be the root so both sides have about the same size?',
        'The middle value: everything before it forms the left subtree, everything after it the right subtree.',
        'Pass index bounds into the recursion instead of copying sub-arrays.',
      ],
      insight: 'The middle element as root splits the rest into two halves whose sizes differ by at most one, and building each half the same way keeps every subtree balanced.',
      approach: [
        'To build a range of the array: if it is empty, there is no node.',
        'Otherwise make a node from the middle value of the range.',
        'Build its left child from the part before the middle and its right child from the part after it.',
        'Build the whole array.',
      ],
      ds: ['Array', 'Binary tree', 'Recursion'], time: 'O(n)', space: 'O(log n) for the recursion',
      traps: ['Slicing the array at every step adds O(n log n) copying; pass index bounds instead.'],
    },
    {
      id: 105, title: 'Construct Binary Tree from Preorder and Inorder Traversal', pattern: 'Build a tree from parts', core: true,
      summary: 'Rebuild a binary tree with distinct values from its preorder and inorder traversals.',
      hints: [
        'The first value of preorder is the root.',
        'Find the root in inorder: everything to its left is the left subtree, everything to its right the right subtree.',
        'Store each value\'s inorder position in a Map, so finding the root takes O(1).',
      ],
      insight: 'Preorder names the root; its position in inorder tells you how many nodes go left. That splits both traversals into the two subtrees, and the same step repeats on each.',
      approach: [
        'Map every value to its index in inorder.',
        'Keep a pointer into preorder, starting at the first value.',
        'To build an inorder range: if it is empty, there is no node. Otherwise take the next preorder value as the root, find its inorder index, build the left subtree from the part of the range before it, then the right subtree from the part after it.',
        'Build the full range.',
      ],
      ds: ['Hash map', 'Binary tree', 'Recursion'], time: 'O(n)', space: 'O(n)',
      traps: ['Build the left subtree before the right one, because preorder lists every left-subtree node first.', 'Searching inorder linearly for each root makes it O(n²).'],
    },
    {
      id: 106, title: 'Construct Binary Tree from Inorder and Postorder Traversal', pattern: 'Build a tree from parts',
      summary: 'Rebuild a binary tree with distinct values from its inorder and postorder traversals.',
      hints: [
        'The last value of postorder is the root.',
        'Its position in inorder separates the left and right subtrees.',
        'Consume postorder from the back, so build the right subtree before the left one.',
      ],
      insight: 'Postorder read backwards is root, right subtree, left subtree; with the root\'s inorder index splitting the range, build right first and then left.',
      approach: [
        'Map every value to its index in inorder.',
        'Keep a pointer at the last postorder value.',
        'To build an inorder range: if empty, no node. Otherwise the pointer\'s value is the root (move the pointer back); build the right part of the range first, then the left part.',
        'Build the full range.',
      ],
      ds: ['Hash map', 'Binary tree', 'Recursion'], time: 'O(n)', space: 'O(n)',
      traps: ['Building the left subtree first takes values that belong to the right subtree.'],
    },
    {
      id: 889, title: 'Construct Binary Tree from Preorder and Postorder Traversal', pattern: 'Build a tree from parts',
      summary: 'Rebuild a binary tree with distinct values from its preorder and postorder traversals. If several trees fit, any one is accepted.',
      hints: [
        'Preorder\'s first value is the root, and its second value (if any) is the root of the left subtree.',
        'Find that left root in postorder: everything up to and including it belongs to the left subtree.',
        'That gives the size of the left subtree; what remains is the right subtree.',
      ],
      insight: 'Without inorder, the split is ambiguous when a node has one child, so treat the second preorder value as the left child\'s root; its position in postorder fixes the size of the left subtree.',
      approach: [
        'Map every value to its index in postorder.',
        'The root is the first value of the preorder range. A range of one value is a leaf.',
        'The next preorder value is the left subtree\'s root. Its postorder index minus the start of the postorder range, plus one, is the size of the left subtree.',
        'Build the left subtree from that many following preorder values and the right subtree from the rest.',
      ],
      ds: ['Hash map', 'Binary tree', 'Recursion'], time: 'O(n)', space: 'O(n)',
      traps: ['When a node has a single child, preorder and postorder cannot tell left from right. The problem accepts either, so always choose left.'],
    },
    {
      id: 109, title: 'Convert Sorted List to Binary Search Tree', pattern: 'Build a tree from parts',
      summary: 'Turn a sorted singly linked list into a height-balanced binary search tree.',
      hints: [
        'The middle node should be the root, but a list has no index access.',
        'Fast and slow pointers find the middle, but doing that at every level costs O(n log n).',
        'Better: count the nodes, then build the tree in inorder, taking the next list node for each root.',
      ],
      insight: 'An inorder traversal of a BST visits values in sorted order, so building the tree by sizes in inorder consumes the list front to back in exactly the right order, O(n) in total.',
      approach: [
        'Count the nodes, n, and keep a pointer at the head.',
        'To build a subtree of size k: first build its left subtree of size ⌊k / 2⌋.',
        'Then create the root from the current list node and advance the pointer.',
        'Then build the right subtree of size k − ⌊k / 2⌋ − 1.',
      ],
      ds: ['Linked list', 'Binary tree', 'Recursion'], time: 'O(n)', space: 'O(log n)',
      traps: ['Copying the list into an array turns it into problem 108, at the cost of O(n) memory. That is also accepted.'],
    },
    {
      id: 1382, title: 'Balance a Binary Search Tree', pattern: 'Build a tree from parts',
      summary: 'Given a binary search tree, return a balanced binary search tree with the same values.',
      hints: ['An inorder traversal of a BST lists its values in sorted order.', 'Then this is problem 108: build from a sorted list, middle first.'],
      insight: 'Flatten the tree with an inorder traversal into a sorted array, then rebuild it by always choosing the middle value as the root.',
      approach: [
        'Traverse the tree in inorder and collect the values (or the nodes) in an array.',
        'Build a balanced tree from the array: middle as root, halves as subtrees.',
        'Return the new root.',
      ],
      ds: ['Array', 'Binary search tree', 'Recursion'], time: 'O(n)', space: 'O(n)',
      traps: ['Balancing by rotations, as AVL trees do, also works but is far more complex for no gain here.'],
    },

    // ---------- Every way to split ----------
    {
      id: 241, title: 'Different Ways to Add Parentheses', pattern: 'Every way to split', core: true,
      summary: 'Given an expression with numbers and the operators +, − and ×, return the results of every possible way to add parentheses.',
      hints: [
        'Every grouping has one operator that is applied last.',
        'Split the expression at each operator: compute all results of the left part and all results of the right part.',
        'Combine every left result with every right result using that operator; cache repeated pieces.',
      ],
      insight: 'Choosing the operator applied last splits the expression into two independent subexpressions, and its results are every combination of their result lists.',
      approach: [
        'If the expression is just a number, its only result is that number.',
        'Otherwise, for each operator position, get the list of results for the text before it and for the text after it.',
        'For every pair of left and right results, apply the operator and add the value to this expression\'s list.',
        'Cache the list for each substring, because the same pieces come up many times.',
      ],
      ds: ['Recursion', 'Hash map (memo)', 'Array'], time: 'O(n · Cₙ), where Cₙ is a Catalan number', space: 'O(n · Cₙ)',
      traps: ['Numbers can have two digits: parse whole numbers, not single characters.', 'Different groupings can give the same value; the output keeps every one.'],
    },
    {
      id: 95, title: 'Unique Binary Search Trees II', pattern: 'Every way to split',
      summary: 'Return every structurally different binary search tree that stores exactly the values 1 to n.',
      hints: [
        'Choose the root value r. Which values must go left, and which right?',
        'Values below r form every possible left subtree; values above r every possible right subtree.',
        'Combine every left tree with every right tree under the root r.',
      ],
      insight: 'With root r, the left subtree is any BST of 1..r − 1 and the right subtree any BST of r + 1..n; the two choices are independent, so the trees of a range are all the pairings.',
      approach: [
        'To list all trees of a range: if it is empty, the only option is "no tree" (a single null).',
        'For each root r in the range, list all trees of the part below r and of the part above r.',
        'For every pair, create a new root r with those children.',
        'List the trees for 1..n.',
      ],
      ds: ['Recursion', 'Binary search tree'], time: 'O(n · Cₙ), Catalan many trees', space: 'O(n · Cₙ)',
      traps: ['An empty range must return a list containing null, not an empty list, or every combination vanishes.', 'Results may share subtrees; the problem allows it.'],
    },
    {
      id: 894, title: 'All Possible Full Binary Trees', pattern: 'Every way to split',
      summary: 'Return every full binary tree (each node has zero or two children) with n nodes.',
      hints: [
        'A full binary tree always has an odd number of nodes.',
        'The root takes one node; split the other n − 1 between the left and right subtrees, both odd.',
        'Cache the list of trees for each size.',
      ],
      insight: 'For every odd left size, combine every full tree of that size with every full tree of the remaining size; an even n has no answer at all.',
      approach: [
        'If n is even, return an empty list. If n is 1, return a single leaf.',
        'For left sizes 1, 3, 5, … up to n − 2, the right size is n − 1 − left size.',
        'Pair every tree of the left size with every tree of the right size under a new root.',
        'Cache the list for each n.',
      ],
      ds: ['Recursion', 'Hash map (memo)', 'Binary tree'], time: 'O(number of trees), a Catalan number', space: 'O(number of trees)',
      traps: ['Skipping the odd-size check wastes time on sizes that can never be full.'],
    },

    // ---------- Split a grid ----------
    {
      id: 427, title: 'Construct Quad Tree', pattern: 'Split a grid',
      summary: 'Represent an n × n grid of 0s and 1s (n a power of two) as a quad tree: a uniform square becomes a leaf, otherwise it splits into four quadrants.',
      hints: [
        'If a square holds one value only, it is a leaf.',
        'Otherwise split it into four equal squares and build each one.',
        'Build the four children first: if all four are leaves with the same value, merge them into one leaf.',
      ],
      insight: 'Recurse on the quadrants and merge four identical leaves into one, so no square is ever scanned twice.',
      approach: [
        'To build a square (top row, left column, size): if the size is 1, return a leaf with that cell\'s value.',
        'Build the four quadrants of half the size.',
        'If all four are leaves with the same value, return one leaf with that value.',
        'Otherwise return an internal node with the four children.',
      ],
      ds: ['Recursion', 'Quad tree'], time: 'O(n²)', space: 'O(log n) recursion plus the tree',
      traps: ['Checking uniformity by scanning the whole square at every level costs O(n² log n); merging the children avoids it.'],
    },
    {
      id: 240, title: 'Search a 2D Matrix II', pattern: 'Split a grid',
      summary: 'Search for a target in a matrix whose rows and columns are each sorted in ascending order.',
      hints: [
        'Look at the top-right corner. What does it tell you if it is bigger than the target? Smaller?',
        'Each comparison at that corner rules out a whole row or a whole column.',
        'Splitting around a middle element into quadrants also works, but the corner walk is simpler.',
      ],
      insight: 'From the top-right corner, a value bigger than the target rules out its whole column and a smaller value rules out its whole row, so the walk takes at most m + n steps.',
      approach: [
        'Start at the first row and the last column.',
        'If the value equals the target, the answer is true.',
        'If it is bigger, move one column left; if smaller, move one row down.',
        'If you leave the matrix, the answer is false.',
      ],
      ds: ['Matrix', 'Two indices'], time: 'O(m + n)', space: 'O(1)',
      traps: ['Starting at the top-left corner does not work: both directions increase, so no comparison rules anything out.', 'Binary search in every row costs O(m log n).'],
    },

    // ---------- Split at a bad element ----------
    {
      id: 1763, title: 'Longest Nice Substring', pattern: 'Split at a bad element',
      summary: 'A string is nice if every letter in it appears both in lowercase and in uppercase. Return the longest nice substring, the earliest one if there is a tie.',
      hints: [
        'A letter whose other case appears nowhere in the string can never be part of a nice substring.',
        'Such a letter cuts the string into pieces, and the answer lies inside one piece.',
        'Solve each piece the same way and keep the longest, preferring the left one on a tie.',
      ],
      insight: 'Any character whose partner case is missing from the current string cannot belong to the answer, so split at it and recurse; a string with no such character is nice.',
      approach: [
        'If the string is shorter than 2, return the empty string.',
        'Put its characters in a Set and find the first character whose other case is not in the set.',
        'If there is none, the whole string is nice: return it.',
        'Otherwise solve the parts before and after that character and return the longer one, the left one on a tie.',
      ],
      ds: ['String', 'Set', 'Recursion'], time: 'O(n²) in the worst case', space: 'O(n)',
      traps: ['On a tie the earliest substring wins, so prefer the left part.'],
    },
    {
      id: 395, title: 'Longest Substring with At Least K Repeating Characters', pattern: 'Split at a bad element', core: true,
      summary: 'Find the length of the longest substring in which every character appears at least k times.',
      hints: [
        'Count the characters of the whole string.',
        'A character that appears fewer than k times in the whole string can never be inside a valid substring.',
        'Split the string at every such character and solve each piece on its own.',
      ],
      insight: 'Characters that appear fewer than k times are walls: no valid substring can contain them, so split there and recurse. A string with no walls is valid as a whole.',
      approach: [
        'If the string is shorter than k, return 0.',
        'Count its characters.',
        'If every character appears at least k times, return the string\'s length.',
        'Otherwise split at all characters that appear fewer than k times, and return the best result among the pieces.',
      ],
      ds: ['String', 'Count array', 'Recursion'], time: 'O(26 · n)', space: 'O(n)',
      traps: [
        'Split at all rare characters at once: then each level of recursion removes at least one letter for good, so there are at most 26 levels.',
        'A sliding window also works if you fix the number of distinct letters (1 to 26) in each pass.',
      ],
    },
  ],
};
