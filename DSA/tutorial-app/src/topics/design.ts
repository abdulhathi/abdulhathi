import type { Topic } from './types';

export const topic: Topic = {
  id: 'design',
  patterns: [
    { name: 'Stacks and queues with bookkeeping', idea: 'Keep a little extra next to a stack or queue (running minimums, lazy increments, a second stack, a set of occupied cells) so every operation stays O(1).' },
    { name: 'Hash map plus linked list', idea: 'The map finds a node in O(1); the doubly linked list keeps an order (recency, frequency buckets) that can be changed in O(1).' },
    { name: 'Array plus hash map', idea: 'An array gives random access and random picks; a map from value to index makes membership and swap-removal O(1).' },
    { name: 'History per key with binary search', idea: 'Append each version with its time; times arrive in increasing order, so "value at time t" is a binary search.' },
    { name: 'Heaps and sorted views', idea: 'When you need the best item among a changing group, keep a heap (with lazy deletion of stale entries) or an ordered structure per group.' },
    { name: 'Records and aggregates', idea: 'Store only what the queries need: open records by id, and running sums and counts per key.' },
    { name: 'Trees inside a design', idea: 'Paths and hierarchies map naturally onto a trie or a tree; serialisation turns a tree into a string and back.' },
  ],
  signals: [
    { see: '"Design a class" with several operations and required costs ("each in O(1) average")', think: 'List the operations, write the cost each needs, then pick structures that meet all of them', why: 'Each structure is good at some operations; designs combine two or three so every operation is cheap.' },
    { see: 'Evict the least recently (or least frequently) used item', think: 'Hash map + doubly linked list (per frequency for LFU)', why: 'The map locates the node, the list moves or removes it in O(1).' },
    { see: 'Random element in O(1) together with insert and delete', think: 'Array + map from value to index, delete by swapping with the last', why: 'Random picks need an array; deleting from the middle needs the swap trick.' },
    { see: 'Get the value "as of" a time or a snapshot', think: 'Per key, an append-only list of (time, value) + binary search', why: 'Times are increasing, so the list stays sorted for free.' },
    { see: 'Return the minimum, maximum or top k of a changing collection', think: 'A second stack of minimums, a heap, or an ordered set', why: 'Recomputing from scratch costs O(n) per query.' },
    { see: 'Paths like "/a/b/c", hierarchies, prefixes', think: 'A trie keyed by path parts', why: 'Parents and children are direct links, and prefix checks are walks.' },
  ],
  problems: [
    // ---------- Stacks and queues with bookkeeping ----------
    {
      id: 232, title: 'Implement Queue using Stacks', pattern: 'Stacks and queues with bookkeeping', core: true,
      summary: 'Build a first-in-first-out queue using only stack operations (push to top, pop and peek from top, size, empty).',
      hints: [
        'Pouring one stack into another reverses the order.',
        'Use an "in" stack for pushes and an "out" stack for pops.',
        'Only pour when the out stack is empty.',
      ],
      insight: 'Two stacks: pushes go on "in"; pops come from "out", refilled by pouring all of "in" only when "out" is empty. Each element is moved at most once, so every operation is amortised O(1).',
      approach: [
        'push(x): push x onto in.',
        'pop and peek: if out is empty, pop every element from in and push it onto out. Then pop or read the top of out.',
        'empty: both stacks are empty.',
      ],
      ds: ['Two stacks'], time: 'O(1) amortised per operation', space: 'O(n)',
      traps: ['Pouring back and forth on every operation makes it O(n) each; pour only when out is empty.'],
    },
    {
      id: 155, title: 'Min Stack', pattern: 'Stacks and queues with bookkeeping', core: true,
      summary: 'Build a stack that supports push, pop, top and retrieving the minimum element, each in constant time.',
      hints: [
        'Scanning for the minimum is O(n). What if every stack entry remembered something extra?',
        'When you push a value, the minimum of the stack from the bottom up to here is fixed until this value is popped.',
        'Push the pair (value, minimum so far), or keep a second stack of minimums.',
      ],
      insight: 'Each entry stores the minimum of everything at or below it. That minimum cannot change until the entry is popped, so getMin just reads the top.',
      approach: [
        'Keep a stack of pairs (value, minimum at this depth).',
        'push(v): the new minimum is v if the stack is empty, otherwise the smaller of v and the top\'s minimum; push the pair.',
        'pop and top: work on the top pair.',
        'getMin: return the top pair\'s minimum.',
      ],
      ds: ['Stack of pairs (or two stacks)'], time: 'O(1) per operation', space: 'O(n)',
      traps: ['Keeping one "current minimum" variable fails after popping the minimum: you no longer know the next one.'],
    },
    {
      id: 1381, title: 'Design a Stack With Increment Operation', pattern: 'Stacks and queues with bookkeeping',
      summary: 'Build a stack with a maximum size that also supports adding a value to its bottom k elements.',
      hints: [
        'Applying the increment to k elements immediately costs O(k).',
        'Store the increment once, at the k-th element from the bottom, meaning "everything from here down gets this".',
        'When you pop that element, hand its pending increment down to the element below.',
      ],
      insight: 'Lazy increments: inc[i] means "add this to positions 0..i". Popping position i returns value + inc[i] and passes inc[i] to position i − 1, so every operation is O(1).',
      approach: [
        'Keep a value array, an inc array of the same size, and the current size.',
        'push: if not full, place the value and set its inc to 0.',
        'increment(k, v): if the stack is not empty, add v to inc[min(k, size) − 1].',
        'pop: if empty return −1; otherwise take i = top, add inc[i] to inc[i − 1] (if i > 0), and return value[i] + inc[i].',
      ],
      ds: ['Array', 'Array of pending increments'], time: 'O(1) per operation', space: 'O(maxSize)',
      traps: ['Clear inc[i] when a new value is pushed at position i.'],
    },
    {
      id: 622, title: 'Design Circular Queue', pattern: 'Stacks and queues with bookkeeping',
      summary: 'Build a fixed-capacity queue in an array that wraps around, with front, rear, enqueue, dequeue, isEmpty and isFull.',
      hints: ['Keep the index of the front and the number of stored items.', 'The rear position is (front + count − 1) mod capacity.'],
      insight: 'A ring buffer: a fixed array, a head index and a count. Indices wrap with modulo, so enqueue and dequeue never shift elements.',
      approach: [
        'Store an array of size k, head = 0 and count = 0.',
        'enQueue: if full, return false; write at (head + count) mod k and increase count.',
        'deQueue: if empty, return false; move head to (head + 1) mod k and decrease count.',
        'Front reads array[head]; Rear reads array[(head + count − 1) mod k]; both return −1 when empty.',
      ],
      ds: ['Fixed-size array', 'Head index and count'], time: 'O(1) per operation', space: 'O(k)',
      traps: ['Storing head and tail without a count makes "empty" and "full" look the same; keep a count (or leave one slot unused).'],
    },
    {
      id: 353, title: 'Design Snake Game', pattern: 'Stacks and queues with bookkeeping',
      summary: 'Simulate the snake game on a grid: the snake moves one cell per call, grows when it eats food, and the game ends when it leaves the grid or hits itself. Return the score after each move.',
      hints: [
        'The body is a sequence of cells: the head is added at one end and the tail removed at the other.',
        'Checking "does the head hit the body?" must be O(1).',
        'Remove the tail before checking the collision: the head may move into the cell the tail just left.',
      ],
      insight: 'A deque holds the body in order (head at one end, tail at the other) and a set holds the occupied cells, so each move is a push, maybe a pop, and an O(1) collision check.',
      approach: [
        'Store the body in a deque and the occupied cells (encoded as row × width + col) in a set; track the index of the next food.',
        'On a move, compute the new head. If it is outside the grid, return −1.',
        'If the new head is the next food, keep the tail (grow) and advance the food index; otherwise remove the tail from the deque and the set.',
        'If the new head is in the set, return −1. Otherwise add it to both and return the score (length − 1).',
      ],
      ds: ['Deque of cells', 'Set of encoded cells'], time: 'O(1) per move', space: 'O(length of the snake + food)',
      traps: ['Checking the collision before removing the tail wrongly ends the game when the head follows the tail.'],
    },
    {
      id: 2296, title: 'Design a Text Editor', pattern: 'Stacks and queues with bookkeeping',
      summary: 'Build a text editor with a cursor: add text, delete characters to the left, and move the cursor left or right, reporting up to the last 10 characters left of the cursor.',
      hints: [
        'Everything happens at the cursor. Split the text there.',
        'Keep the characters left of the cursor in one stack and those to the right in another (top = nearest the cursor).',
        'Moving the cursor moves characters from one stack to the other.',
      ],
      insight: 'Two stacks meeting at the cursor: typing pushes onto the left stack, backspace pops it, and moving the cursor transfers characters between the stacks, so each call costs O(k) for the k characters it touches.',
      approach: [
        'addText: push each character onto the left stack.',
        'deleteText(k): pop min(k, left size) characters from the left stack and return how many were removed.',
        'cursorLeft(k): move min(k, left size) characters from the left stack to the right stack; cursorRight(k) does the opposite.',
        'After a move, return the last up to 10 characters of the left stack as a string.',
      ],
      ds: ['Two arrays used as stacks'], time: 'O(k) per call', space: 'O(text length)',
      traps: ['Rebuilding the whole text string on every call is O(n) each and too slow.', 'A doubly linked list with a cursor node also works.'],
    },

    // ---------- Hash map plus linked list ----------
    {
      id: 146, title: 'LRU Cache', pattern: 'Hash map plus linked list', core: true,
      summary: 'Build a fixed-capacity key–value cache where get and put run in O(1) average time and a full cache evicts the least recently used key.',
      hints: [
        'You need two things fast: finding a key, and knowing which key was used longest ago.',
        'A doubly linked list ordered by recency can move a node to the front and remove the tail in O(1).',
        'A map from key to list node finds the node in O(1).',
      ],
      insight: 'A hash map from key to node plus a doubly linked list ordered by recency: every get or put moves the node to the front, and eviction removes the tail, all in O(1).',
      approach: [
        'Keep a map key → node and a doubly linked list with dummy head and tail nodes.',
        'get: if the key is missing, return −1; otherwise unlink its node, insert it after the head, and return its value.',
        'put: if the key exists, update the value and move the node to the front.',
        'Otherwise, if full, remove the node before the tail and delete its key from the map; then insert a new node at the front and add it to the map.',
      ],
      ds: ['Map<number, Node>', 'Doubly linked list with sentinels'], time: 'O(1) per operation', space: 'O(capacity)',
      traps: [
        'In JavaScript, a Map remembers insertion order: deleting and re-setting a key moves it to the end, and the first key is the least recent. That is a valid short solution, but be ready to build the list.',
        'Dummy head and tail nodes remove all the edge cases for empty lists.',
      ],
    },
    {
      id: 460, title: 'LFU Cache', pattern: 'Hash map plus linked list', core: true,
      summary: 'Build a cache that, when full, evicts the least frequently used key, breaking ties by least recent use; get and put must be O(1) on average.',
      hints: [
        'Group keys by their use count. Inside a group, keep recency order like an LRU cache.',
        'Track the smallest count that has any keys.',
        'On every access, move the key from group f to group f + 1. If group f becomes empty and was the minimum, the minimum becomes f + 1.',
      ],
      insight: 'Keep, for each frequency, an LRU-ordered list of keys, a map from key to (value, frequency), and minFreq. Accesses move a key one group up; eviction takes the oldest key of the minFreq group. Everything is O(1).',
      approach: [
        'Maps: key → (value, freq); freq → ordered set of keys (a doubly linked list, or a JavaScript Set, which keeps insertion order).',
        'Touch(key): remove it from its freq group, add it to group freq + 1, and bump minFreq if its old group was minFreq and is now empty.',
        'get: if present, touch it and return the value; else −1.',
        'put: if present, update and touch. Otherwise, if full, evict the first (oldest) key of group minFreq; insert the new key with freq 1 and set minFreq = 1.',
      ],
      ds: ['Map key → value and freq', 'Map freq → ordered set of keys', 'minFreq counter'], time: 'O(1) per operation', space: 'O(capacity)',
      traps: ['A new key always resets minFreq to 1.', 'Ties go to the least recently used key in the lowest group, so each group must keep recency order.'],
    },
    {
      id: 432, title: 'All O`one Data Structure', pattern: 'Hash map plus linked list',
      summary: 'Keep string counts with increment, decrement, and return any key with the maximum count and any key with the minimum count, all in O(1).',
      hints: [
        'Counts change by exactly 1 at a time.',
        'Keep a doubly linked list of buckets, one per count that exists, in increasing order of count.',
        'A key moves only to the next or previous bucket, which you can create next to the current one in O(1).',
      ],
      insight: 'A sorted doubly linked list of count buckets (each holding a set of keys) plus a map key → bucket: inc and dec move a key to the neighbouring bucket, creating or deleting buckets beside it, so max is the last bucket and min the first.',
      approach: [
        'Keep sentinel head and tail; each bucket has a count and a set of keys; a map sends each key to its bucket.',
        'inc(key): let b be its bucket (or the head for a new key). If the next bucket does not have count b.count + 1, insert one. Move the key there; delete b if it becomes empty.',
        'dec(key): similar, moving to a bucket with count − 1 (inserted before b if needed), or removing the key entirely when the count reaches 0.',
        'getMaxKey: any key of the bucket before the tail. getMinKey: any key of the bucket after the head. Empty string if there are none.',
      ],
      ds: ['Doubly linked list of buckets', 'Set of keys per bucket', 'Map key → bucket'], time: 'O(1) per operation', space: 'O(number of keys)',
      traps: ['Remove empty buckets immediately, or min and max can point at empty buckets.'],
    },
    {
      id: 895, title: 'Maximum Frequency Stack', pattern: 'Hash map plus linked list',
      summary: 'Build a stack whose pop removes the most frequent element, choosing the one nearest the top when frequencies tie.',
      hints: [
        'Think of one stack per frequency level.',
        'When a value is pushed for the f-th time, put it on stack number f.',
        'Pop from the stack of the highest frequency; that also respects "nearest the top".',
      ],
      insight: 'Keep a stack for each frequency: the f-th copy of a value goes on stack f. The highest non-empty stack holds the most frequent values, ordered by recency, so pop is O(1).',
      approach: [
        'Maps: value → current frequency; frequency → stack of values. Track maxFreq.',
        'push(v): increase freq(v) to f, push v on stack f, and raise maxFreq to f if larger.',
        'pop: take v from the top of stack maxFreq, decrease freq(v), and if that stack is now empty, lower maxFreq by one.',
        'Return v.',
      ],
      ds: ['Map value → frequency', 'Map frequency → stack'], time: 'O(1) per operation', space: 'O(n)',
      traps: ['A value appears on several stacks at once (one per copy); that is intended, not a bug.'],
    },

    // ---------- Array plus hash map ----------
    {
      id: 380, title: 'Insert Delete GetRandom O(1)', pattern: 'Array plus hash map', core: true,
      summary: 'Build a set of integers with insert, remove and getRandom (each element equally likely), all in average O(1) time.',
      hints: [
        'A random element in O(1) needs an array: pick a random index.',
        'Membership in O(1) needs a map. Map each value to its index in the array.',
        'To delete from the middle in O(1), move the last element into the gap.',
      ],
      insight: 'An array for random picks plus a map value → index; remove swaps the last element into the removed slot and pops, so nothing shifts.',
      approach: [
        'insert(v): if v is in the map, return false; else append v and store its index.',
        'remove(v): if missing, return false; else copy the last value into v\'s index, update that value\'s index in the map, pop the array, delete v from the map.',
        'getRandom: return the element at a random index from 0 to length − 1.',
      ],
      ds: ['Array', 'Map<number, number>'], time: 'O(1) average per operation', space: 'O(n)',
      traps: ['Update the moved element\'s index before deleting v, and handle v being the last element itself.'],
    },
    {
      id: 381, title: 'Insert Delete GetRandom O(1) - Duplicates allowed', pattern: 'Array plus hash map',
      summary: 'The same design as problem 380, but duplicates are allowed, and getRandom must pick each copy with equal chance.',
      hints: ['Keep every copy in the array.', 'Map each value to a set of the indices where it appears.', 'Removal swaps any one copy with the last element, then fixes both index sets.'],
      insight: 'Array of all copies plus value → set of indices. To remove one copy, take any index i from its set, move the last element into i (updating its set from the last index to i), and pop.',
      approach: [
        'insert(v): append v, add the new index to v\'s set; return true if the set was empty before.',
        'remove(v): if v has no indices, return false. Take any index i from v\'s set and remove it.',
        'Move the last element w into i: in w\'s set, delete the last index and add i (unless i was the last index). Pop the array.',
        'getRandom: a random index of the array.',
      ],
      ds: ['Array', 'Map<number, Set<number>>'], time: 'O(1) average per operation', space: 'O(n)',
      traps: ['When i is the last index, do not add it back to any set after popping.'],
    },

    // ---------- History per key with binary search ----------
    {
      id: 981, title: 'Time Based Key-Value Store', pattern: 'History per key with binary search', core: true,
      summary: 'Store values for keys at given times, and return the value of a key as of a time: the value set at the latest time not after it, or an empty string.',
      hints: ['Set calls come with strictly increasing timestamps.', 'So each key\'s list of (time, value) is already sorted.', 'Answer a get with binary search for the last time ≤ the query time.'],
      insight: 'Per key, append (timestamp, value); timestamps increase, so the list is sorted and "latest at or before t" is a binary search.',
      approach: [
        'Keep a Map from key to an array of [timestamp, value] pairs.',
        'set: append the pair to the key\'s array.',
        'get: binary search the key\'s array for the last timestamp ≤ t; return its value, or "" if there is none.',
      ],
      ds: ['Map<string, [number, string][]>', 'Binary search'], time: 'O(1) set, O(log n) get', space: 'O(number of sets)',
      traps: ['Find the last time ≤ t (an upper bound minus one), not the first time ≥ t.'],
    },
    {
      id: 1146, title: 'Snapshot Array', pattern: 'History per key with binary search',
      summary: 'Build an array where you can set values, take numbered snapshots, and read any index as it was at any earlier snapshot.',
      hints: ['Copying the whole array on every snapshot costs O(length) each time.', 'Record only changes: for each index, a list of (snapshot id, value).', 'Read an old value with binary search on that index\'s list.'],
      insight: 'Store per index an append-only history of (snapId, value). snap just increments a counter; get binary searches the last entry with snapId ≤ the requested one.',
      approach: [
        'For each index keep a list starting with (0, 0); keep a counter snapId = 0.',
        'set(i, v): if the last entry of list i has the current snapId, overwrite its value; otherwise append (snapId, v).',
        'snap: return snapId, then increase it.',
        'get(i, id): binary search list i for the last entry with snapId ≤ id and return its value.',
      ],
      ds: ['Array of lists of [snapId, value]', 'Binary search'], time: 'O(1) set and snap, O(log s) get', space: 'O(length + number of sets)',
      traps: ['Several sets between two snaps should keep only the last value for that snapshot.'],
    },

    // ---------- Heaps and sorted views ----------
    {
      id: 355, title: 'Design Twitter', pattern: 'Heaps and sorted views',
      summary: 'Support posting tweets, following and unfollowing, and returning the 10 most recent tweets from a user and everyone they follow.',
      hints: [
        'Give every tweet a global time stamp from a counter.',
        'Each user\'s own tweets are already in time order.',
        'Merge the newest tweets of the user and their followees with a max-heap, stopping after 10 (a k-way merge).',
      ],
      insight: 'Each user has a time-ordered list of tweets; the news feed is the first 10 items of a k-way merge of those lists, done with a heap keyed by time.',
      approach: [
        'Keep: user → list of (time, tweetId); user → set of followees; a global time counter.',
        'postTweet appends to the user\'s list. follow and unfollow add to or remove from the set (never unfollow yourself).',
        'getNewsFeed: push the newest tweet of the user and of each followee into a max-heap by time.',
        'Pop up to 10 times; after popping a tweet, push the next older tweet from the same user.',
      ],
      ds: ['Map of tweet lists', 'Map of follow sets', 'Max-heap'], time: 'O(F log F) per feed, F = followees', space: 'O(users + tweets + follows)',
      traps: ['Include the user\'s own tweets even though they do not follow themselves.', 'Collecting every tweet of every followee and sorting works for these limits but scales badly.'],
    },
    {
      id: 2353, title: 'Design a Food Rating System', pattern: 'Heaps and sorted views',
      summary: 'Track food ratings by cuisine: change a food\'s rating, and return the highest-rated food of a cuisine (smallest name on ties).',
      hints: [
        'Keep a heap per cuisine ordered by (rating descending, name ascending).',
        'Changing a rating cannot easily edit a heap entry. Push a new entry instead.',
        'When reading the top, discard entries whose rating no longer matches the food\'s current rating.',
      ],
      insight: 'Lazy deletion: every rating change pushes a fresh (rating, name) entry onto its cuisine\'s heap; highestRated pops stale entries until the top agrees with the current rating table.',
      approach: [
        'Maps: food → current rating, food → cuisine, cuisine → heap of (rating, name) with the best first.',
        'changeRating: update the rating map and push (newRating, food) onto the cuisine\'s heap.',
        'highestRated: while the heap\'s top rating differs from the current rating of its food, pop it.',
        'Return the top food\'s name.',
      ],
      ds: ['Map', 'Heap per cuisine (or an ordered set)'], time: 'O(log n) amortised per call', space: 'O(n + changes)',
      traps: ['The tie-break is the lexicographically smaller name, so compare names when ratings are equal.', 'JavaScript has no built-in heap: write one, or use the priority queue library LeetCode provides.'],
    },

    // ---------- Records and aggregates ----------
    {
      id: 1396, title: 'Design Underground System', pattern: 'Records and aggregates',
      summary: 'Record passengers checking in and out of stations and return the average travel time between two stations.',
      hints: ['You only need averages, not every journey.', 'Keep open check-ins by card id, and a running total and count per (start, end) pair.'],
      insight: 'Store only what the queries use: an open-trip record per card, and a running (sum, count) per station pair; the average is sum ÷ count.',
      approach: [
        'checkIn: store (station, time) for the card id.',
        'checkOut: take and delete the card\'s check-in, then add (t − startTime) to the total for the key "start→end" and add 1 to its count.',
        'getAverageTime: return total ÷ count for the pair.',
      ],
      ds: ['Map id → check-in', 'Map route → [sum, count]'], time: 'O(1) per operation', space: 'O(open trips + routes)',
      traps: ['Routes are directional: A→B and B→A are different keys.', 'Use a separator in the composite key that cannot appear in station names.'],
    },

    // ---------- Trees inside a design ----------
    {
      id: 1166, title: 'Design File System', pattern: 'Trees inside a design',
      summary: 'Create paths like "/a/b" with values, allowed only if the parent path exists and the path is new, and look up a path\'s value.',
      hints: ['Split each path into its parts.', 'A trie of path parts makes "does the parent exist?" a walk.', 'Alternatively, a Map from full path to value plus a parent check by cutting at the last "/".'],
      insight: 'Paths form a tree: a trie keyed by path parts (or a Map of full paths) answers "parent exists?" and "already exists?" in time proportional to the path length.',
      approach: [
        'Store a trie whose nodes have a Map of children and a value.',
        'createPath: walk all parts except the last; if any is missing, return false. If the last part already exists, return false; otherwise create it with the value and return true.',
        'get: walk all parts; return the value, or −1 if any part is missing.',
      ],
      ds: ['Trie with Map children (or Map of full paths)'], time: 'O(path length) per call', space: 'O(total path length)',
      traps: ['The root "/" path itself and empty paths are invalid; a top-level path like "/a" has the root as its parent.'],
    },
    {
      id: 297, title: 'Serialize and Deserialize Binary Tree', pattern: 'Trees inside a design', core: true,
      summary: 'Turn a binary tree into a string and back again, with any format you choose, so the rebuilt tree is identical.',
      hints: [
        'A preorder list of values alone is ambiguous. What extra information fixes it?',
        'Write a marker for every missing child.',
        'To rebuild, read the tokens in the same preorder, using a shared position pointer.',
      ],
      insight: 'Preorder with null markers is unambiguous: reading tokens in the same order rebuilds each node, then its left subtree, then its right subtree.',
      approach: [
        'Serialise: in preorder, write each node\'s value, and a marker such as "#" for every missing child, separated by commas.',
        'Deserialise: split into tokens and keep a position index.',
        'Read a token: if it is the marker, return nothing; otherwise create the node, then read its left subtree, then its right subtree.',
      ],
      ds: ['Array of tokens', 'Position index (or a queue)'], time: 'O(n)', space: 'O(n)',
      traps: ['Values can be negative or have several digits, so use a separator.', 'A level-order (BFS) format with null markers works too, and avoids deep recursion.'],
    },
  ],
};
