import type { Topic } from './types';

export const topic: Topic = {
  id: 'doubly-linked-list',
  patterns: [
    { name: 'Sentinels and O(1) unlink', idea: 'With prev and next pointers and two sentinel nodes at the ends, a node you hold can be removed or inserted with four pointer changes and no special cases.' },
    { name: 'Map plus list', idea: 'A hash map finds a node by key in O(1); the list keeps nodes in an order (recency, expiry, count) that you can update in O(1).' },
    { name: 'Moving both ways', idea: 'A current pointer that can step backwards and forwards: history, cursors, and splicing sub-lists into place.' },
    { name: 'Removing neighbours', idea: 'When elements merge with or disappear next to their neighbours, prev and next links let you update the surroundings in O(1).' },
  ],
  signals: [
    { see: '"Least recently used", "most recently used", evict the oldest', think: 'Hash map plus doubly linked list in usage order', why: 'The map finds the node; the list moves it to the front and drops the back, all in O(1).' },
    { see: 'Every operation must be O(1), including removing an item from the middle of an ordering', think: 'A doubly linked list of nodes you can reach directly', why: 'Only a doubly linked list can unlink a node you already hold without walking to its predecessor.' },
    { see: 'Back and forward navigation, undo and redo, a text cursor', think: 'A current node with prev and next (or two stacks)', why: 'Moving one step either way is one pointer move.' },
    { see: 'Adjacent elements are merged or removed repeatedly', think: 'prev and next arrays (a list over indices)', why: 'After a merge, the new neighbours are found in O(1) instead of shifting an array.' },
    { see: 'Insert or remove at the front, the back, and the middle', think: 'A deque, or two halves kept in balance', why: 'The ends of a doubly linked list (or deque) are O(1) to change, and a balanced split exposes the middle.' },
  ],
  problems: [
    // ---------- Sentinels and O(1) unlink ----------
    {
      id: 707, title: 'Design Linked List', pattern: 'Sentinels and O(1) unlink', core: true,
      summary: 'Implement a linked list class with get by index, add at head, add at tail, add before an index, and delete at an index, without a built-in list.',
      hints: ['Use sentinel head and tail nodes so every real node has neighbours on both sides.', 'Keep a size counter to reject invalid indices quickly.', 'With prev pointers you can walk from whichever end is closer to the index.'],
      insight: 'Sentinels turn every insertion and deletion into the same four-pointer change between two existing nodes; a size counter and walking from the nearer end keep index lookups short.',
      approach: [
        'Create sentinel head and tail pointing at each other; size = 0.',
        'To find node i, walk from head if i < size / 2, otherwise from tail backwards.',
        'To insert before node i (or at the tail when i equals size), link the new node between that node\'s prev and the node itself; increase size.',
        'To delete node i, point its prev and next at each other; decrease size. Ignore invalid indices.',
      ],
      ds: ['Doubly linked list', 'Sentinel nodes', 'Size counter'], time: 'O(min(i, n − i)) per indexed operation, O(1) at the ends', space: 'O(n)',
      traps: ['addAtIndex with index equal to the length appends; with a larger index it does nothing.', 'Forgetting to update the new node\'s own prev and next as well as its neighbours\'.'],
    },
    {
      id: 1670, title: 'Design Front Middle Back Queue', pattern: 'Sentinels and O(1) unlink',
      summary: 'Build a queue that can push and pop at the front, the middle and the back. With two middle positions, the front one is used.',
      hints: [
        'Split the queue into two halves at the middle.',
        'Keep the left half holding the first floor(n / 2) values, so the right half has the same size or one more.',
        'Middle operations then happen at the boundary between the halves; after each operation, move one value across to restore the sizes.',
      ],
      insight: 'Two deques split at the middle make all six operations act on an end of a half; a size rule (right has the same size or one more) tells exactly which end is the middle.',
      approach: [
        'Keep two deques, left and right, with left.size = floor(n / 2).',
        'pushFront: add to left\'s front. pushBack: add to right\'s back. pushMiddle: add to left\'s back.',
        'popFront takes left\'s front (or right\'s if left is empty); popBack takes right\'s back; popMiddle takes left\'s back when the halves are equal, otherwise right\'s front.',
        'After every operation, move one value across the boundary if the size rule is broken. Return −1 when empty.',
      ],
      ds: ['Two deques (doubly linked lists)'], time: 'O(1) per operation with real deques', space: 'O(n)',
      traps: ['The middle rule differs for push and pop: pushing into a queue of 5 values puts the new value just before the 3rd one, while popping from a queue of 6 values removes the 3rd one. Test both on the examples.', 'With at most 1,000 calls, arrays with shift also pass; deques make every operation O(1).'],
    },
    {
      id: 2296, title: 'Design a Text Editor', pattern: 'Sentinels and O(1) unlink',
      summary: 'Build a text editor with a cursor: add text at the cursor, delete k characters to its left, and move the cursor left or right, returning up to 10 characters left of the cursor after each move.',
      hints: ['Everything happens next to the cursor.', 'Keep the text left of the cursor and the text right of it separately.', 'Two stacks do it: moving the cursor moves characters from one stack to the other.'],
      insight: 'Split the text at the cursor into two stacks (or keep a cursor node in a doubly linked list): every operation touches only characters next to the cursor, so it costs O(k).',
      approach: [
        'Keep stack left (text before the cursor, top = nearest character) and stack right (text after it).',
        'addText pushes each character onto left. deleteText pops up to k characters from left and returns how many it popped.',
        'cursorLeft moves up to k characters from left to right; cursorRight moves them back.',
        'After a move, return the last min(10, left.size) characters of left as a string.',
      ],
      ds: ['Two stacks (or a doubly linked list with a cursor)'], time: 'O(k) per call', space: 'O(total text)',
      traps: ['Keeping the text as one string and slicing it on every call costs O(length) per operation, which the follow-up rules out.'],
    },

    // ---------- Map plus list ----------
    {
      id: 146, title: 'LRU Cache', pattern: 'Map plus list', core: true,
      summary: 'Design a fixed-capacity cache with get and put in O(1); when full, a put evicts the least recently used key.',
      hints: [
        'A map gives O(1) lookup but no order. A list gives order but slow lookup. Use both.',
        'Keep the list in order of use: most recent at the front, least recent at the back.',
        'Store list nodes as the map\'s values, so you can find a node and unlink it in O(1). That needs prev pointers.',
      ],
      insight: 'The map finds a key\'s node in O(1), and a doubly linked list with sentinels moves that node to the front, or drops the back node, in O(1).',
      approach: [
        'Keep a map from key to node and a doubly linked list between sentinels head and tail.',
        'get: if the key is missing return −1; otherwise unlink its node, reinsert it after head, and return its value.',
        'put: if the key exists, update the value and move the node to the front.',
        'Otherwise, if the cache is full, unlink the node before tail and delete its key from the map; then insert a new node after head and store it in the map.',
      ],
      ds: ['Map (key → node)', 'Doubly linked list with sentinels'], time: 'O(1) per operation', space: 'O(capacity)',
      traps: ['The node must store its key, so eviction can delete the right map entry.', 'A JavaScript Map keeps insertion order, so deleting and re-setting a key also implements LRU; interviewers usually want the list version explained.'],
    },
    {
      id: 1797, title: 'Design Authentication Manager', pattern: 'Map plus list',
      summary: 'Tokens expire a fixed time after they are generated or renewed. Support generate, renew (only for unexpired tokens) and counting unexpired tokens at increasing times.',
      hints: ['Times only increase and every token lives the same length of time.', 'So the token touched most recently always has the latest expiry. A list in touch order is also in expiry order.', 'Expired tokens are then all at the front of that list.'],
      insight: 'Because time only moves forward and lifetimes are equal, a list ordered by last touch is ordered by expiry: renewals move a node to the back, and expired tokens are removed from the front.',
      approach: [
        'Keep a map from token to node and a doubly linked list ordered by expiry.',
        'Before any operation at time t, remove nodes from the front while their expiry is ≤ t (and delete them from the map).',
        'generate adds a node with expiry t + ttl at the back. renew, if the token is still present, updates its expiry and moves it to the back.',
        'countUnexpiredTokens returns the map size after removing expired tokens.',
      ],
      ds: ['Map (token → node)', 'Doubly linked list'], time: 'O(1) amortised per call', space: 'O(tokens)',
      traps: ['A token that expires exactly at time t is already expired at t.', 'With only 2,000 calls, a map scanned on each count also passes; the list is what makes it O(1).'],
    },
    {
      id: 460, title: 'LFU Cache', pattern: 'Map plus list',
      summary: 'Design a fixed-capacity cache that evicts the least frequently used key, breaking ties by least recent use, with get and put in O(1).',
      hints: [
        'Group keys by their use count. Within a group, keep LRU order with a doubly linked list.',
        'Keep a map from count to that group\'s list, and remember the smallest count present.',
        'Using a key moves its node from list f to list f + 1. If list f becomes empty and f was the minimum, the minimum becomes f + 1.',
      ],
      insight: 'One LRU list per frequency, plus a map from key to node and the current minimum frequency, makes "least frequent, then least recent" the back node of the minimum list.',
      approach: [
        'Keep: key → node (with value and count), count → doubly linked list, and minCount.',
        'get: if present, move the node from its count\'s list to the front of the next count\'s list, update minCount if needed, and return the value.',
        'put on an existing key: update the value and do the same move.',
        'put on a new key: if full, remove the back node of the minCount list and its key; insert the new node into the list for count 1 and set minCount to 1.',
      ],
      ds: ['Map (key → node)', 'Map (count → doubly linked list)', 'Min count variable'], time: 'O(1) per operation', space: 'O(capacity)',
      traps: ['A new key always resets minCount to 1.', 'Forgetting to delete empty lists, or to bump minCount when its list empties.'],
    },
    {
      id: 432, title: 'All O`one Data Structure', pattern: 'Map plus list',
      summary: 'Store string counts with increment, decrement (removing a key at zero), and return any key with the maximum or the minimum count, all in O(1).',
      hints: ['Keep buckets of keys that share a count, in a doubly linked list sorted by count.', 'A key\'s count changes by exactly one, so it moves to a neighbouring bucket, which you can create next to the current one in O(1).', 'The first bucket holds the minimum; the last holds the maximum.'],
      insight: 'A sorted doubly linked list of count buckets stays sorted under ±1 changes, because a key only ever moves to the adjacent bucket; the ends of the list give min and max.',
      approach: [
        'Keep a doubly linked list of buckets (count and a set of keys) between sentinels, sorted by count, and a map from key to its bucket.',
        'inc: find the key\'s bucket (or the head sentinel for a new key); move the key into the next bucket if its count is one more, else create that bucket right after; delete the old bucket if it is empty.',
        'dec: the mirror image, moving to the previous bucket or removing the key at count 0.',
        'getMaxKey returns any key of the last bucket; getMinKey any key of the first; "" if none.',
      ],
      ds: ['Doubly linked list of buckets', 'Set of keys per bucket', 'Map (key → bucket)'], time: 'O(1) per operation', space: 'O(keys)',
      traps: ['Remove a bucket as soon as it becomes empty, or getMin and getMax may return nothing.'],
    },

    // ---------- Moving both ways ----------
    {
      id: 1472, title: 'Design Browser History', pattern: 'Moving both ways', core: true,
      summary: 'Simulate a browser tab: visit a URL (clearing forward history), go back up to k steps, and go forward up to k steps, returning the current page.',
      hints: ['Back and forward are steps along a sequence of pages.', 'A visit throws away everything after the current page.', 'A doubly linked list with a current node works; so does an array with a current index and a "last valid" index.'],
      insight: 'Pages form a line with a cursor: back and forward move the cursor, and a visit cuts off everything after the cursor before appending the new page.',
      approach: [
        'Keep the pages in a doubly linked list (or an array) and a pointer to the current page.',
        'visit: drop everything after the current page, append the new page, and move to it.',
        'back(k): move to the previous page up to k times, stopping at the first page.',
        'forward(k): move to the next page up to k times, stopping at the last page. Return the current URL.',
      ],
      ds: ['Doubly linked list', 'or array with indices'], time: 'O(1) visit, O(k) back and forward (O(1) with the array)', space: 'O(pages)',
      traps: ['Forgetting to discard forward history on a visit.', 'With the array version, "dropping" forward pages can just move a last-valid index; no deletion needed.'],
    },
    {
      id: 430, title: 'Flatten a Multilevel Doubly Linked List', pattern: 'Moving both ways', core: true,
      summary: 'Nodes of a doubly linked list may have a child pointer to another such list, nested to any depth. Flatten everything into one level, placing each child list right after its parent node.',
      hints: ['When a node has a child, the whole flattened child list goes between the node and its old next.', 'You need the tail of the flattened child list to reconnect to the old next.', 'Recursion that returns the tail of what it flattened does exactly that (or walk with a stack of saved next nodes).'],
      insight: 'Splicing a flattened child list between a node and its next only needs the child list\'s tail, so a depth-first walk that returns the tail of each flattened part rebuilds the list in place.',
      approach: [
        'Walk the list. When a node has a child: flatten the child list recursively and get its tail.',
        'Link node ⇄ child head and child tail ⇄ the node\'s old next (if any), then set the child pointer to null.',
        'Continue from the old next. Return the last node seen as the tail.',
        'Iterative alternative: when a node has a child, push its next onto a stack and continue into the child; at the end of a list, pop and link.',
      ],
      ds: ['Doubly linked list', 'Recursion or a stack'], time: 'O(n)', space: 'O(depth)',
      traps: ['Set both next and prev on every link you create.', 'Clear every child pointer; the judge checks it.'],
    },
    {
      id: 426, title: 'Convert Binary Search Tree to Sorted Doubly Linked List', pattern: 'Moving both ways',
      summary: 'Turn a binary search tree into a sorted circular doubly linked list in place, using left as prev and right as next, and return the smallest element.',
      hints: ['An in-order traversal of a BST visits values in sorted order.', 'While traversing, link the previous visited node to the current one.', 'At the end, connect the last node back to the first to close the circle.'],
      insight: 'In-order traversal produces the nodes in sorted order; linking each node to the previously visited one builds the list, and joining the ends makes it circular.',
      approach: ['Keep first and prev, both null.', 'Traverse in order. For each node: if prev exists, point prev\'s right at the node and the node\'s left at prev; otherwise this node is first. Then make the node the new prev.', 'After the traversal, link prev (the largest) and first in both directions.', 'Return first.'],
      ds: ['Binary search tree', 'In-order traversal'], time: 'O(n)', space: 'O(height) for recursion',
      traps: ['An empty tree returns null.', 'The list must be circular: the smallest node\'s left points to the largest.'],
    },

    // ---------- Removing neighbours ----------
    {
      id: 3507, title: 'Minimum Pair Removal to Sort Array I', pattern: 'Removing neighbours',
      summary: 'Repeatedly replace the adjacent pair with the smallest sum (leftmost on ties) by their sum, until the array is non-decreasing. Count the operations. The array has at most 50 values.',
      hints: ['The process is fully determined: just simulate it.', 'With n ≤ 50, rebuilding the array after every merge is fast enough.'],
      insight: 'Each step is forced, and the array is tiny, so direct simulation (find the leftmost minimum-sum pair, merge, check sortedness) is the intended answer; part II is the same process at scale.',
      approach: ['While the array is not non-decreasing:', 'Find the leftmost adjacent pair with the smallest sum.', 'Replace the two values by their sum and count one operation.', 'Return the count.'],
      ds: ['Array'], time: 'O(n³) at most, tiny for n ≤ 50', space: 'O(n)',
    },
    {
      id: 3510, title: 'Minimum Pair Removal to Sort Array II', pattern: 'Removing neighbours',
      summary: 'The same merging process as part I (merge the leftmost minimum-sum adjacent pair until non-decreasing), but with up to 10⁵ values.',
      hints: [
        'Rebuilding the array each time is O(n²). Link each position to its current previous and next neighbours instead.',
        'Keep the adjacent pair sums in a min-heap ordered by (sum, left position), and skip stale entries when you pop them.',
        'Keep a count of adjacent pairs that are out of order; the process stops when it reaches 0. A merge only changes the pairs around it.',
      ],
      insight: 'Linked neighbours (prev and next arrays) make each merge O(1), a heap with lazy deletion finds the next pair in O(log n), and a running count of decreasing adjacent pairs tells you when the array is sorted.',
      approach: [
        'Set up prev and next arrays over the positions, push every adjacent pair (sum, i, next) into a min-heap, and count the adjacent pairs with left > right.',
        'While the count is positive, pop the smallest entry; skip it if either position was removed, they are no longer neighbours, or the sum is out of date.',
        'Subtract from the count the out-of-order pairs among (prev, i), (i, j) and (j, after); store the sum at i, remove j by linking i to j\'s next; add back the out-of-order pairs among the new (prev, i) and (i, next).',
        'Push the two new neighbour sums, count one operation, and repeat. Return the count.',
      ],
      ds: ['prev and next arrays (doubly linked list over indices)', 'Min-heap with lazy deletion', 'Counter'], time: 'O(n log n)', space: 'O(n)',
      traps: ['Sums reach about 10¹⁴, still exact in TypeScript numbers.', 'Ties must go to the leftmost pair: order heap entries by sum, then by left position (merged elements keep their left position).'],
    },
  ],
};
