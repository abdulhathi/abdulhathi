import type { Topic } from './types';

export const topic: Topic = {
  id: 'iterator',
  patterns: [
    { name: 'Look-ahead buffer', idea: 'Read one item early and keep it in a buffer, so you can answer peek and hasNext without consuming anything twice.' },
    { name: 'Explicit stack for lazy traversal', idea: 'Replace recursion with a stack that holds exactly the work still pending, and do only as much as the next call needs.' },
    { name: 'Cursor over a structure', idea: 'Keep indices into the underlying data (row and column, run and amount used) instead of copying it into a flat list.' },
    { name: 'Round-robin and generated sequences', idea: 'Take turns between several sources with a queue, or compute the next item directly from the current one.' },
  ],
  signals: [
    { see: '"Design an iterator" with next and hasNext', think: 'Keep state that describes where you are, not a copy of everything', why: 'Iterators should be lazy: O(1) or amortised O(1) per call and small memory.' },
    { see: '"peek" on top of an iterator that cannot peek', think: 'A one-item look-ahead buffer', why: 'Reading ahead once and remembering the value makes peek free.' },
    { see: 'In-order or depth-first order over a tree or nested list, one item at a time', think: 'An explicit stack', why: 'The stack holds what recursion would have kept on the call stack, and pauses between calls.' },
    { see: 'Compressed input (run lengths, 2D lists) and "skip n items"', think: 'A cursor with counters', why: 'Jump over whole runs or rows instead of expanding them.' },
    { see: 'Alternate between several lists or produce combinations in order', think: 'A queue of active sources, or "next from current" arithmetic', why: 'No need to build the whole output up front.' },
  ],
  problems: [
    // ---------- Look-ahead buffer ----------
    {
      id: 284, title: 'Peeking Iterator', pattern: 'Look-ahead buffer', core: true,
      summary: 'Wrap an iterator that only has next and hasNext so that it also supports peek (see the next item without consuming it).',
      hints: ['The underlying iterator cannot un-read an item.', 'So read one item ahead and remember it.', 'next returns the remembered item and reads the following one into the buffer.'],
      insight: 'Always keep the next item cached: peek returns the cache, next returns it and refills the cache from the underlying iterator, and hasNext checks whether the cache holds anything.',
      approach: [
        'On construction, if the inner iterator has an item, read it into the buffer; otherwise mark the buffer empty.',
        'peek: return the buffer.',
        'next: save the buffer, refill it from the inner iterator (or mark it empty), and return the saved value.',
        'hasNext: return whether the buffer is non-empty.',
      ],
      ds: ['One-item buffer', 'Flag for "buffer is empty"'], time: 'O(1) per call', space: 'O(1)',
      traps: ['Use a separate flag for "empty" rather than a sentinel value like 0 or null that could be a real item.'],
    },

    // ---------- Explicit stack for lazy traversal ----------
    {
      id: 173, title: 'Binary Search Tree Iterator', pattern: 'Explicit stack for lazy traversal', core: true,
      summary: 'Return the values of a binary search tree in sorted order, one per next() call, with hasNext(), using O(h) memory.',
      hints: [
        'In-order traversal of a BST gives sorted order. Flattening it all first uses O(n) memory.',
        'Simulate the recursion: the smallest value is at the end of the leftmost path from the root.',
        'After returning a node, the next values come from its right subtree, starting with that subtree\'s leftmost path.',
      ],
      insight: 'A stack holds the nodes whose left subtree is finished but who have not been returned yet. next pops one and pushes the left spine of its right child, so each node is pushed and popped once.',
      approach: [
        'On construction, push the root and every left child down the leftmost path.',
        'next: pop the top node. Push its right child and then that child\'s left children, all the way down. Return the popped value.',
        'hasNext: the stack is not empty.',
      ],
      ds: ['Stack of tree nodes'], time: 'O(1) amortised per call', space: 'O(h)',
      traps: ['A single next can push O(h) nodes; across all calls each node is pushed once, so the average is O(1).'],
    },
    {
      id: 341, title: 'Flatten Nested List Iterator', pattern: 'Explicit stack for lazy traversal', core: true,
      summary: 'Iterate over all integers of a nested list (lists can contain integers or more lists) in order.',
      hints: [
        'Flattening everything up front works but is not lazy.',
        'Keep a stack of items still to visit, with the next one on top.',
        'In hasNext, while the top is a list, replace it with its items (in reverse order). Then the top is the next integer.',
      ],
      insight: 'A stack of pending items (pushed in reverse so the first is on top) unpacks lists only when they reach the top; doing the unpacking in hasNext also skips empty lists correctly.',
      approach: [
        'Push the top-level items onto a stack in reverse order.',
        'hasNext: while the stack is not empty and its top is a list, pop it and push its items in reverse. Return whether the stack is non-empty.',
        'next: call hasNext (to make sure an integer is on top), then pop and return it.',
      ],
      ds: ['Stack of nested items'], time: 'O(1) amortised per call', space: 'O(total items) in the worst case, usually O(depth + width)',
      traps: [
        'Empty lists like [[], []] mean hasNext must look ahead past them; doing the work in next instead leads to wrong answers.',
        'A stack of (list, index) pairs avoids copying items and uses O(depth) memory.',
      ],
    },

    // ---------- Cursor over a structure ----------
    {
      id: 251, title: 'Flatten 2D Vector', pattern: 'Cursor over a structure',
      summary: 'Iterate over all numbers of a list of lists in order, some of which may be empty, with next and hasNext.',
      hints: ['Keep two indices: which inner list, and the position inside it.', 'Before answering, skip forward past finished or empty inner lists.'],
      insight: 'Two indices (row, column) are the whole state; an "advance to a valid position" step skips empty rows, so no flattened copy is needed.',
      approach: [
        'Store the outer index r = 0 and the inner index c = 0.',
        'Advance step: while r is in range and c has reached the end of row r, move to the next row and reset c to 0.',
        'hasNext: run the advance step, then return whether r is in range.',
        'next: run the advance step, return row r at c, and increase c.',
      ],
      ds: ['Two indices'], time: 'O(1) amortised per call', space: 'O(1)',
      traps: ['Several empty rows in a row: the advance step must be a loop, not a single if.'],
    },
    {
      id: 900, title: 'RLE Iterator', pattern: 'Cursor over a structure',
      summary: 'Given a run-length encoded sequence (count, value pairs), implement next(n), which uses up the next n items and returns the last one, or −1 if the sequence runs out.',
      hints: ['Counts reach 10⁹: never expand the runs.', 'Keep a pointer to the current run and how many items of it are left.', 'Subtract whole runs from n while they are not enough.'],
      insight: 'A cursor over the runs: consume min(n, remaining in this run) from the current run, skipping exhausted runs, so each call costs O(number of runs passed).',
      approach: [
        'Keep the index i of the current pair (start at 0).',
        'next(n): while i is in range and the count at i is less than n, subtract that count from n and move i to the next pair.',
        'If i is out of range, return −1.',
        'Otherwise subtract n from the count at i and return the value at i.',
      ],
      ds: ['Array of runs', 'Index'], time: 'O(runs) in total over all calls, amortised', space: 'O(1) extra',
      traps: ['Runs with count 0 must be skipped.', 'If the current run has exactly n left, it is used up but the call still returns its value.'],
    },

    // ---------- Round-robin and generated sequences ----------
    {
      id: 281, title: 'Zigzag Iterator', pattern: 'Round-robin and generated sequences',
      summary: 'Given two lists, return their elements alternately (first of one, first of the other, second of one, …), continuing with whatever remains when one runs out.',
      hints: ['Think of each list as its own iterator.', 'Keep a queue of the iterators that still have items.', 'Take from the front iterator, and put it at the back if it has more.'],
      insight: 'Round-robin with a queue of (list, position) pairs: serve the front, re-queue it if it has more items. This also generalises to k lists.',
      approach: [
        'Put (list, 0) for each non-empty list into a queue.',
        'next: take the front pair, read its current item, advance its position, and push it back if items remain.',
        'hasNext: the queue is not empty.',
      ],
      ds: ['Queue of (list, index) pairs'], time: 'O(1) per call', space: 'O(k)',
      traps: ['Do not enqueue empty lists at the start.', 'For JavaScript, a queue with a head index avoids the O(n) cost of shift.'],
    },
    {
      id: 1286, title: 'Iterator for Combination', pattern: 'Round-robin and generated sequences',
      summary: 'Given sorted distinct letters and a length k, return the combinations of k letters one at a time in dictionary order.',
      hints: [
        'A combination is a list of k increasing positions into the letters.',
        'The next combination comes from the current one: find the rightmost position that can still move right.',
        'Move it one step and reset every position after it to follow it consecutively.',
      ],
      insight: 'Keep the current combination as k increasing indices; "next" increments the rightmost index that has room and resets the rest after it, which is exactly the next combination in dictionary order.',
      approach: [
        'Start with indices 0, 1, …, k − 1 and a flag that more combinations remain.',
        'next: build the answer from the current indices.',
        'Find the rightmost i whose index is below n − k + i. If none exists, clear the flag; otherwise add 1 to it and set each later index to the previous index + 1.',
        'hasNext: return the flag.',
      ],
      ds: ['Array of k indices'], time: 'O(k) per call', space: 'O(k)',
      traps: ['Generating all C(15, 7) = 6,435 combinations up front also passes, but the in-place step is the lesson.'],
    },
  ],
};
