---
title: "Algorithms in TypeScript, part 2: lists, trees, graphs, heaps and DP"
goal: Write linked-list, tree, graph, heap and dynamic-programming solutions in TypeScript from memory, including a binary heap and Dijkstra, and explain each one's cost.
minutes: 130
---

The second half of the classic interview set needs data structures you build yourself. JavaScript has no linked
list, tree, priority queue or deque in its standard library, so interviewers expect you to write a small node class or
a binary heap on the spot. This chapter gives you compact, tested versions of each, then the problems that use them.

Several problems use shapes from real systems: pipeline steps with dependencies are a graph, and "how many agent
runs overlap" is an interval sweep. When you meet one of those in the interview, say the textbook name ("this is a
topological sort") and then solve it.

For more depth on any technique, the [DSA Lab](http://localhost:5182) has a chapter per topic.

## Building blocks

Interviewers usually give you the node classes. If not, write them in thirty seconds. Under Node's type stripping,
avoid constructor parameter properties (`constructor(public val: number)`); assign fields in the body instead.

```ts
import assert from 'node:assert/strict';

class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val: number, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}

const fromArray = (values: number[]): ListNode | null =>
  values.reduceRight<ListNode | null>((next, v) => new ListNode(v, next), null);

function toArray(head: ListNode | null): number[] {
  const out: number[] = [];
  for (let node = head; node; node = node.next) out.push(node.val);
  return out;
}

class TreeNode {
  val: number;
  left: TreeNode | null = null;
  right: TreeNode | null = null;
  constructor(val: number) {
    this.val = val;
  }
}

/** Builds a tree from LeetCode-style level order, where null marks a missing child. */
function fromLevelOrder(values: (number | null)[]): TreeNode | null {
  const first = values[0];
  if (first === undefined || first === null) return null;
  const root = new TreeNode(first);
  const queue: TreeNode[] = [root];
  let head = 0;
  let i = 1;
  while (i < values.length) {
    const node = queue[head++];
    const left = values[i++];
    if (left !== null && left !== undefined) queue.push((node.left = new TreeNode(left)));
    const right = values[i++];
    if (right !== null && right !== undefined) queue.push((node.right = new TreeNode(right)));
  }
  return root;
}

assert.deepEqual(toArray(fromArray([1, 2, 3])), [1, 2, 3]);
const tree = fromLevelOrder([3, 9, 20, null, null, 15, 7]);
assert.equal(tree?.right?.left?.val, 15);

// A graph as an adjacency list: Map from node to its neighbours.
const edges: [string, string][] = [['a', 'b'], ['a', 'c'], ['b', 'c']];
const graph = new Map<string, string[]>();
for (const [from, to] of edges) {
  if (!graph.has(from)) graph.set(from, []);
  graph.get(from)!.push(to);
}
assert.deepEqual(graph.get('a'), ['b', 'c']);
```

A queue built on `Array.prototype.shift` is O(n) per dequeue. In BFS, keep a `head` index into the array instead, as
`fromLevelOrder` does.

## Interview questions

### BFS or DFS: how do you choose? {core}

BFS explores level by level with a queue, so the first time it reaches a node is by the fewest edges: use it for
shortest paths in unweighted graphs and level-order output. DFS goes deep first with recursion or a stack: use it for
"does a path exist", connected components, cycle detection and topological sort. Both are O(V + E). In JavaScript I
write DFS with an explicit stack when the input can be deep, because recursion depth is limited.

### How deep can recursion go in JavaScript, and what do you do about it? {core}

With Node's default stack size the call stack holds roughly ten thousand frames (about 10,300 for a trivial function
on Node 25; fewer when frames are bigger), so recursing over a 100,000-node linked list or a skewed tree throws
`RangeError: Maximum call stack size exceeded`. Raising it with `node --stack-size` is a workaround, not a fix. I mention it, then either convert to
iteration with an explicit stack or queue, or keep recursion when the depth is bounded by a balanced tree's height.

### Adjacency list or adjacency matrix?

An adjacency list (`Map<node, neighbour[]>`) uses O(V + E) memory and iterates neighbours in O(degree), which suits
sparse graphs, and most real graphs are sparse. A matrix uses O(V²) memory but answers "is there an edge from u to v"
in O(1), which suits small, dense graphs.

### Why does Dijkstra fail with negative edge weights? {deep}

Dijkstra finalises the closest unvisited node on the assumption that no later path can make it cheaper. A negative
edge breaks that: a path through a node finalised later could still lower the distance. With negative weights you use
Bellman–Ford (O(V·E)), which also detects negative cycles.

### When is a heap better than sorting?

When you need repeated access to the smallest or largest item while the data changes: streaming top-k, merging k
sorted lists, scheduling the next job, Dijkstra. A binary heap gives O(log n) push and pop and O(1) peek. If all the
data is known up front and you need it all in order, sorting once is simpler.

### How do you recognise a dynamic programming problem? {core}

It asks for a count, a minimum, a maximum or "is it possible", and the answer for a size-n input can be built from
answers to smaller inputs that overlap (the same subproblem appears many times). I define the state in words ("best[i]
is the fewest coins for amount i"), write the recurrence, pick the base cases, and then choose top-down with
memoisation or bottom-up with a table. Bottom-up avoids recursion limits.

## Coding problems

### Reverse a Linked List {easy core}

Reverse a singly linked list and return the new head.

`1 → 2 → 3 → 4 → 5` → `5 → 4 → 3 → 2 → 1`

#### Hints

1. Walk the list once, turning each `next` pointer around.
2. You need three references: the previous node, the current node, and the next node saved before you overwrite it.
3. When `current` becomes null, `previous` is the new head.

#### Solution

Iteratively: save `next`, point `current.next` back at `previous`, then advance both. The recursive version is shorter
but uses O(n) stack, which fails on very long lists in JavaScript.

```ts
import assert from 'node:assert/strict';

class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val: number, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}
const fromArray = (v: number[]) => v.reduceRight<ListNode | null>((next, x) => new ListNode(x, next), null);
const toArray = (head: ListNode | null) => {
  const out: number[] = [];
  for (let n = head; n; n = n.next) out.push(n.val);
  return out;
};

function reverseList(head: ListNode | null): ListNode | null {
  let previous: ListNode | null = null;
  let current = head;
  while (current) {
    const next: ListNode | null = current.next;
    current.next = previous;
    previous = current;
    current = next;
  }
  return previous;
}

function reverseRecursive(head: ListNode | null): ListNode | null {
  if (!head || !head.next) return head;
  const newHead = reverseRecursive(head.next);
  head.next.next = head;
  head.next = null;
  return newHead;
}

for (const reverse of [reverseList, reverseRecursive]) {
  assert.deepEqual(toArray(reverse(fromArray([1, 2, 3, 4, 5]))), [5, 4, 3, 2, 1]);
  assert.deepEqual(toArray(reverse(fromArray([1]))), [1]);
  assert.deepEqual(toArray(reverse(null)), []);
}
// The iterative version handles a list far deeper than the call stack.
const long = fromArray(Array.from({ length: 200_000 }, (_, i) => i));
assert.equal(reverseList(long)?.val, 199_999);
```

Complexity: O(n) time; O(1) space iteratively, O(n) stack recursively.

#### Follow-ups

- **Reverse only positions m to n?** Walk to node m−1, reverse the next n−m+1 nodes, then reconnect both ends.
- **Reverse in groups of k?** Reverse k at a time, connecting each group's tail to the next group's new head.

### Linked List Cycle {easy}

Return whether a linked list contains a cycle, and if it does, the node where the cycle begins.

#### Hints

1. A `Set` of visited nodes works in O(n) space. Can you do O(1)?
2. Move a slow pointer one step and a fast pointer two steps. If there is a cycle, they meet.
3. To find the start: after they meet, move one pointer back to the head and advance both one step at a time.

#### Solution

Floyd's tortoise and hare. In a cycle the fast pointer gains one node per step, so it must catch the slow one. For the
start: if the distance from the head to the cycle start is a, then walking a steps forward from the meeting point (going
round the cycle) also lands on the start, so two pointers moving at the same speed from the head and from the meeting
point meet exactly there.

```ts
import assert from 'node:assert/strict';

class ListNode {
  val: number;
  next: ListNode | null = null;
  constructor(val: number) {
    this.val = val;
  }
}

/** Builds a list and links the tail back to index `pos` (-1 for no cycle). */
function withCycle(values: number[], pos: number): ListNode | null {
  const nodes = values.map((v) => new ListNode(v));
  nodes.forEach((node, i) => (node.next = nodes[i + 1] ?? null));
  if (pos >= 0 && nodes.length > 0) nodes[nodes.length - 1].next = nodes[pos];
  return nodes[0] ?? null;
}

function cycleStart(head: ListNode | null): ListNode | null {
  let slow = head;
  let fast = head;
  while (fast && fast.next) {
    slow = slow!.next;
    fast = fast.next.next;
    if (slow === fast) {
      let finder = head;
      while (finder !== slow) {
        finder = finder!.next;
        slow = slow!.next;
      }
      return finder;
    }
  }
  return null;
}

const hasCycle = (head: ListNode | null) => cycleStart(head) !== null;

assert.equal(cycleStart(withCycle([3, 2, 0, -4], 1))?.val, 2);
assert.equal(cycleStart(withCycle([1, 2], 0))?.val, 1);
assert.equal(cycleStart(withCycle([7], 0))?.val, 7); // a node pointing to itself
assert.equal(hasCycle(withCycle([1, 2, 3], -1)), false);
assert.equal(hasCycle(null), false);
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Length of the cycle?** After the pointers meet, keep one still and count steps until the other returns.
- **Why not compare values?** Values can repeat; compare node identity.

### Merge Two Sorted Lists {easy}

Merge two sorted linked lists into one sorted list by relinking the nodes.

`1 → 2 → 4` and `1 → 3 → 4` → `1 → 1 → 2 → 3 → 4 → 4`

#### Hints

1. Compare the two heads and take the smaller each time.
2. A dummy head node removes the special case for the first node.
3. When one list runs out, attach the rest of the other in one step.

#### Solution

Keep a `tail` pointer starting at a dummy node. Repeatedly attach the smaller head and advance. Using `<=` takes from
the first list on ties, which keeps the merge stable.

```ts
import assert from 'node:assert/strict';

class ListNode {
  val: number;
  next: ListNode | null;
  constructor(val: number, next: ListNode | null = null) {
    this.val = val;
    this.next = next;
  }
}
const fromArray = (v: number[]) => v.reduceRight<ListNode | null>((next, x) => new ListNode(x, next), null);
const toArray = (head: ListNode | null) => {
  const out: number[] = [];
  for (let n = head; n; n = n.next) out.push(n.val);
  return out;
};

function mergeTwoLists(a: ListNode | null, b: ListNode | null): ListNode | null {
  const dummy = new ListNode(0);
  let tail = dummy;
  while (a && b) {
    if (a.val <= b.val) {
      tail.next = a;
      a = a.next;
    } else {
      tail.next = b;
      b = b.next;
    }
    tail = tail.next;
  }
  tail.next = a ?? b;
  return dummy.next;
}

assert.deepEqual(toArray(mergeTwoLists(fromArray([1, 2, 4]), fromArray([1, 3, 4]))), [1, 1, 2, 3, 4, 4]);
assert.deepEqual(toArray(mergeTwoLists(null, fromArray([0]))), [0]);
assert.deepEqual(toArray(mergeTwoLists(fromArray([5]), fromArray([1, 2, 3]))), [1, 2, 3, 5]);
assert.deepEqual(toArray(mergeTwoLists(null, null)), []);
```

Complexity: O(n + m) time, O(1) extra space.

#### Follow-ups

- **Merge k lists?** Use a min-heap of the current heads (see Merge K Sorted Arrays below): O(N log k).
- **Sort a linked list?** Merge sort: split with slow/fast pointers, sort each half, merge. O(n log n).

### Binary Tree Level Order Traversal {medium core}

Return the values of a binary tree level by level, left to right.

`[3, 9, 20, null, null, 15, 7]` → `[[3], [9, 20], [15, 7]]`

#### Hints

1. Levels mean breadth-first search with a queue.
2. At the start of each level, the queue holds exactly that level's nodes. Record its length.
3. Use a head index instead of `shift()` so each dequeue is O(1).

#### Solution

BFS, processing one level at a time. Instead of a head index, this version builds the next level as a fresh array,
which is just as fast and reads clearly.

```ts
import assert from 'node:assert/strict';

class TreeNode {
  val: number;
  left: TreeNode | null = null;
  right: TreeNode | null = null;
  constructor(val: number) {
    this.val = val;
  }
}
function fromLevelOrder(values: (number | null)[]): TreeNode | null {
  const first = values[0];
  if (first === undefined || first === null) return null;
  const root = new TreeNode(first);
  const queue = [root];
  for (let head = 0, i = 1; i < values.length; head++) {
    const node = queue[head];
    const l = values[i++];
    if (l != null) queue.push((node.left = new TreeNode(l)));
    const r = values[i++];
    if (r != null) queue.push((node.right = new TreeNode(r)));
  }
  return root;
}

function levelOrder(root: TreeNode | null): number[][] {
  const levels: number[][] = [];
  let level = root ? [root] : [];
  while (level.length > 0) {
    levels.push(level.map((node) => node.val));
    const next: TreeNode[] = [];
    for (const node of level) {
      if (node.left) next.push(node.left);
      if (node.right) next.push(node.right);
    }
    level = next;
  }
  return levels;
}

assert.deepEqual(levelOrder(fromLevelOrder([3, 9, 20, null, null, 15, 7])), [[3], [9, 20], [15, 7]]);
assert.deepEqual(levelOrder(fromLevelOrder([1, 2, null, 3])), [[1], [2], [3]]);
assert.deepEqual(levelOrder(fromLevelOrder([1])), [[1]]);
assert.deepEqual(levelOrder(null), []);
```

Complexity: O(n) time, O(width) space.

#### Follow-ups

- **Zigzag order?** Reverse every other level before pushing it.
- **Right side view?** Take the last value of each level.

### Validate a Binary Search Tree {medium core}

Return whether a binary tree is a valid BST: every node's left subtree holds smaller values and its right subtree
holds larger values (no duplicates).

`[5, 1, 4, null, null, 3, 6]` → `false` (4 is in the right subtree of 5)

#### Hints

1. Checking only each node against its children is not enough: a value deep in the right subtree can still be smaller
   than the root.
2. Pass down the allowed range `(low, high)` for each node.
3. Going left narrows `high` to the node's value; going right narrows `low`.

#### Solution

Recurse with bounds. Each node must lie strictly between `low` and `high`. An in-order traversal that checks values
strictly increase is the other standard answer.

```ts
import assert from 'node:assert/strict';

class TreeNode {
  val: number;
  left: TreeNode | null = null;
  right: TreeNode | null = null;
  constructor(val: number) {
    this.val = val;
  }
}
function fromLevelOrder(values: (number | null)[]): TreeNode | null {
  const first = values[0];
  if (first === undefined || first === null) return null;
  const root = new TreeNode(first);
  const queue = [root];
  for (let head = 0, i = 1; i < values.length; head++) {
    const node = queue[head];
    const l = values[i++];
    if (l != null) queue.push((node.left = new TreeNode(l)));
    const r = values[i++];
    if (r != null) queue.push((node.right = new TreeNode(r)));
  }
  return root;
}

function isValidBST(node: TreeNode | null, low = -Infinity, high = Infinity): boolean {
  if (!node) return true;
  if (node.val <= low || node.val >= high) return false;
  return isValidBST(node.left, low, node.val) && isValidBST(node.right, node.val, high);
}

assert.equal(isValidBST(fromLevelOrder([2, 1, 3])), true);
assert.equal(isValidBST(fromLevelOrder([5, 1, 4, null, null, 3, 6])), false);
assert.equal(isValidBST(fromLevelOrder([5, 4, 6, null, null, 3, 7])), false); // 3 < 5 deep on the right
assert.equal(isValidBST(fromLevelOrder([1, 1])), false); // duplicates
assert.equal(isValidBST(null), true);
```

Complexity: O(n) time, O(h) stack for a tree of height h.

#### Follow-ups

- **Duplicates allowed in the left subtree?** Make the upper bound inclusive: fail on `node.val > high` instead of
  `>= high`, and keep `<= low`. Agree the rule with the interviewer first.
- **Kth smallest in a BST?** In-order traversal, stopping at the k-th visited node.

### Lowest Common Ancestor of a Binary Tree {medium}

Given a binary tree and two nodes in it, return their lowest common ancestor: the deepest node that has both as
descendants (a node counts as its own descendant).

`[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4]`, nodes 5 and 4 → `5`

#### Hints

1. Recurse into both subtrees and ask each: "did you find p or q?"
2. If both sides report a node, the current node is the answer.
3. If the current node is p or q, return it immediately.

#### Solution

Post-order recursion. A subtree returns p or q if it contains one of them, the LCA if it contains both, or null. When
the left and right calls both return something, p and q are on different sides, so this node is the LCA.

```ts
import assert from 'node:assert/strict';

class TreeNode {
  val: number;
  left: TreeNode | null = null;
  right: TreeNode | null = null;
  constructor(val: number) {
    this.val = val;
  }
}
function fromLevelOrder(values: (number | null)[]): TreeNode | null {
  const first = values[0];
  if (first === undefined || first === null) return null;
  const root = new TreeNode(first);
  const queue = [root];
  for (let head = 0, i = 1; i < values.length; head++) {
    const node = queue[head];
    const l = values[i++];
    if (l != null) queue.push((node.left = new TreeNode(l)));
    const r = values[i++];
    if (r != null) queue.push((node.right = new TreeNode(r)));
  }
  return root;
}
function find(node: TreeNode | null, val: number): TreeNode | null {
  if (!node) return null;
  if (node.val === val) return node;
  return find(node.left, val) ?? find(node.right, val);
}

function lowestCommonAncestor(root: TreeNode | null, p: TreeNode, q: TreeNode): TreeNode | null {
  if (!root || root === p || root === q) return root;
  const left = lowestCommonAncestor(root.left, p, q);
  const right = lowestCommonAncestor(root.right, p, q);
  if (left && right) return root;
  return left ?? right;
}

const root = fromLevelOrder([3, 5, 1, 6, 2, 0, 8, null, null, 7, 4]);
const lca = (a: number, b: number) => lowestCommonAncestor(root, find(root, a)!, find(root, b)!)?.val;
assert.equal(lca(5, 1), 3);
assert.equal(lca(5, 4), 5); // a node is its own descendant
assert.equal(lca(7, 8), 3);
assert.equal(lca(6, 4), 5);
assert.equal(lca(7, 4), 2);
```

Complexity: O(n) time, O(h) stack.

#### Follow-ups

- **In a BST?** Walk from the root: go left if both values are smaller, right if both are larger, otherwise stop. O(h).
- **Nodes have parent pointers?** It becomes "intersection of two linked lists".

### Number of Islands {medium core}

Given a grid of `'1'` (land) and `'0'` (water), count the islands. Land connects horizontally and vertically.

```text
1 1 0 0 0
1 1 0 0 0
0 0 1 0 0
0 0 0 1 1      →  3
```

#### Hints

1. Each island is a connected component of land cells.
2. Scan every cell. When you find unvisited land, count one island and flood-fill it so you never count it again.
3. Use an explicit stack (or queue) for the flood fill so a huge island does not overflow the call stack.

#### Solution

Scan the grid; on unvisited land, increment the count and flood-fill with a stack, marking cells visited as you push
them. A separate `visited` array keeps the caller's grid unchanged.

```ts
import assert from 'node:assert/strict';

function numIslands(grid: string[][]): number {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  const visited = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let islands = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== '1' || visited[r][c]) continue;
      islands++;
      visited[r][c] = true;
      const stack: [number, number][] = [[r, c]];
      while (stack.length > 0) {
        const [y, x] = stack.pop()!;
        for (const [dy, dx] of steps) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx] === '1' && !visited[ny][nx]) {
            visited[ny][nx] = true;
            stack.push([ny, nx]);
          }
        }
      }
    }
  }
  return islands;
}

const toGrid = (rows: string[]) => rows.map((row) => row.split(''));
assert.equal(numIslands(toGrid(['11000', '11000', '00100', '00011'])), 3);
assert.equal(numIslands(toGrid(['11110', '11010', '11000', '00000'])), 1);
assert.equal(numIslands(toGrid(['101', '010', '101'])), 5); // diagonals do not connect
assert.equal(numIslands(toGrid(['0'])), 0);
assert.equal(numIslands([]), 0);
assert.equal(numIslands([new Array(100_000).fill('1')]), 1); // no stack overflow
```

Complexity: O(rows × cols) time and space.

#### Follow-ups

- **Size of the largest island?** Count cells during each flood fill.
- **Land is added one cell at a time and you report the count after each?** Union–Find with path compression.

### Order Pipeline Steps (Topological Sort) {medium core}

An agent pipeline has named steps and dependencies such as "`embed` needs `parse`". Return an order that runs every
step after its dependencies, or `null` if the dependencies contain a cycle. Among steps that are ready at the same
time, keep the order they were listed in.

`steps = [fetch, parse, embed, index, notify]`, `parse needs fetch`, `embed needs parse`, `index needs embed`,
`notify needs index` → `[fetch, parse, embed, index, notify]`

#### Hints

1. Model steps as nodes and "B needs A" as an edge A → B.
2. A step can run when it has no unfinished dependencies (in-degree zero). Start with those.
3. Kahn's algorithm: repeatedly take a ready step, append it, and decrement its dependents' in-degrees. If you finish
   with fewer steps than you started with, there is a cycle.

#### Solution

Kahn's algorithm with a FIFO queue. In-degree counts unfinished dependencies. The queue starts with steps that have
none, in listed order, which makes the output deterministic. Unknown step names are a caller error, so throw.

```ts
import assert from 'node:assert/strict';

function orderSteps(steps: string[], needs: [step: string, dependsOn: string][]): string[] | null {
  const inDegree = new Map<string, number>(steps.map((s) => [s, 0]));
  const dependents = new Map<string, string[]>(steps.map((s) => [s, []]));
  for (const [step, dependsOn] of needs) {
    if (!inDegree.has(step) || !inDegree.has(dependsOn)) throw new Error(`unknown step in ${step} <- ${dependsOn}`);
    dependents.get(dependsOn)!.push(step);
    inDegree.set(step, inDegree.get(step)! + 1);
  }

  const queue = steps.filter((s) => inDegree.get(s) === 0);
  const order: string[] = [];
  for (let head = 0; head < queue.length; head++) {
    const step = queue[head];
    order.push(step);
    for (const next of dependents.get(step)!) {
      const remaining = inDegree.get(next)! - 1;
      inDegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
  }
  return order.length === steps.length ? order : null;
}

const steps = ['fetch', 'parse', 'embed', 'index', 'notify'];
assert.deepEqual(
  orderSteps(steps, [['parse', 'fetch'], ['embed', 'parse'], ['index', 'embed'], ['notify', 'index']]),
  ['fetch', 'parse', 'embed', 'index', 'notify'],
);
// Listed order is not dependency order: notify is listed first but runs last.
assert.deepEqual(orderSteps(['notify', 'load', 'check'], [['notify', 'check'], ['check', 'load']]), ['load', 'check', 'notify']);
// Independent steps keep their listed order.
assert.deepEqual(orderSteps(['b', 'a', 'c'], []), ['b', 'a', 'c']);
// A cycle has no valid order.
assert.equal(orderSteps(['a', 'b', 'c'], [['a', 'b'], ['b', 'c'], ['c', 'a']]), null);
assert.equal(orderSteps(['a'], [['a', 'a']]), null);
assert.throws(() => orderSteps(['a'], [['a', 'missing']]));
```

Complexity: O(V + E) time and space.

#### Follow-ups

- **Run independent steps in parallel?** Process the queue in waves: each wave is every step whose in-degree is zero
  right now. The number of waves is the critical path length.
- **Report the cycle?** DFS with three colours (unvisited, in progress, done); meeting an in-progress node closes a
  cycle, and the recursion stack holds it.

### Implement a Binary Min-Heap {medium core}

Build a priority queue with `push`, `pop` (remove the smallest), `peek` and `size`, taking a comparison function so it
works for any item type.

#### Hints

1. Store the heap in an array: the children of index i are `2i + 1` and `2i + 2`, its parent is `(i - 1) >> 1`.
2. `push`: append at the end, then swap upwards while smaller than the parent ("sift up").
3. `pop`: take the root, move the last item to the root, then swap downwards with the smaller child ("sift down").

#### Solution

The array form keeps the tree complete, so its height is log n and both operations are O(log n). A `less` function
makes the same class a min-heap, a max-heap, or a heap of objects ordered by priority.

```ts
import assert from 'node:assert/strict';

class Heap<T> {
  private items: T[] = [];
  private less: (a: T, b: T) => boolean;

  constructor(less: (a: T, b: T) => boolean) {
    this.less = less;
  }

  get size(): number {
    return this.items.length;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(item: T): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.less(a[i], a[parent])) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      i = parent;
    }
  }

  pop(): T | undefined {
    const a = this.items;
    if (a.length === 0) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < a.length && this.less(a[left], a[smallest])) smallest = left;
        if (right < a.length && this.less(a[right], a[smallest])) smallest = right;
        if (smallest === i) break;
        [a[i], a[smallest]] = [a[smallest], a[i]];
        i = smallest;
      }
    }
    return top;
  }
}

// Heap sort as a test: popping everything gives ascending order.
const values = Array.from({ length: 500 }, () => Math.floor(Math.random() * 100));
const minHeap = new Heap<number>((a, b) => a < b);
values.forEach((v) => minHeap.push(v));
const popped: number[] = [];
while (minHeap.size > 0) popped.push(minHeap.pop()!);
assert.deepEqual(popped, values.toSorted((a, b) => a - b));
assert.equal(minHeap.pop(), undefined);

// A max-heap is the same class with the comparison flipped.
const maxHeap = new Heap<number>((a, b) => a > b);
[3, 9, 1].forEach((v) => maxHeap.push(v));
assert.equal(maxHeap.peek(), 9);

// Jobs by priority, then by arrival order for ties.
type Job = { name: string; priority: number; seq: number };
const jobs = new Heap<Job>((a, b) => (a.priority !== b.priority ? a.priority < b.priority : a.seq < b.seq));
let seq = 0;
for (const [name, priority] of [['report', 2], ['alert', 0], ['digest', 2], ['retry', 1]] as const) {
  jobs.push({ name, priority, seq: seq++ });
}
const order: string[] = [];
while (jobs.size) order.push(jobs.pop()!.name);
assert.deepEqual(order, ['alert', 'retry', 'report', 'digest']);
```

Complexity: `push` and `pop` O(log n), `peek` and `size` O(1). Building from n items by pushing is O(n log n).

#### Follow-ups

- **Build a heap from an existing array in O(n)?** Sift down every index from `n/2 - 1` down to 0 ("heapify").
- **Why compare priorities first and then the sequence number?** A heap is not stable, so equal priorities could come
  out in any order. Adding an arrival counter as the tie-breaker makes the order first-in, first-out within a priority.
  Note that `less` must return a boolean "a comes first", not a `sort`-style negative or positive number.

### Merge K Sorted Arrays {hard}

Merge k sorted arrays into one sorted array.

`[[1, 4, 5], [1, 3, 4], [2, 6]]` → `[1, 1, 2, 3, 4, 4, 5, 6]`

#### Hints

1. Concatenating and sorting is O(N log N) for N total items and ignores that the inputs are sorted.
2. The next output item is always the smallest of the k current heads.
3. Keep the heads in a min-heap: pop the smallest, push the next item from the same array.

#### Solution

A min-heap of `[value, arrayIndex, itemIndex]` entries, one per array. Each of the N items is pushed and popped once,
and the heap never holds more than k entries, so the cost is O(N log k).

```ts
import assert from 'node:assert/strict';

type Entry = [value: number, list: number, index: number];

class MinHeap {
  private a: Entry[] = [];
  get size() {
    return this.a.length;
  }
  push(e: Entry) {
    const a = this.a;
    a.push(e);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): Entry {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function mergeKSorted(lists: number[][]): number[] {
  const heap = new MinHeap();
  lists.forEach((list, i) => {
    if (list.length > 0) heap.push([list[0], i, 0]);
  });
  const out: number[] = [];
  while (heap.size > 0) {
    const [value, list, index] = heap.pop();
    out.push(value);
    if (index + 1 < lists[list].length) heap.push([lists[list][index + 1], list, index + 1]);
  }
  return out;
}

assert.deepEqual(mergeKSorted([[1, 4, 5], [1, 3, 4], [2, 6]]), [1, 1, 2, 3, 4, 4, 5, 6]);
assert.deepEqual(mergeKSorted([]), []);
assert.deepEqual(mergeKSorted([[], []]), []);
assert.deepEqual(mergeKSorted([[-3, 0], [], [-5]]), [-5, -3, 0]);
const random = Array.from({ length: 8 }, () =>
  Array.from({ length: Math.floor(Math.random() * 10) }, () => Math.floor(Math.random() * 50)).sort((a, b) => a - b),
);
assert.deepEqual(mergeKSorted(random), random.flat().sort((a, b) => a - b));
```

Complexity: O(N log k) time, O(k) heap space plus the output.

#### Follow-ups

- **Without a heap?** Divide and conquer: merge pairs of arrays, then pairs of results. Also O(N log k).
- **The inputs are huge files?** The same heap merge streams them (external merge sort), holding one item per file.

### Network Delay Time (Dijkstra) {medium core}

Nodes are numbered 1…n. `times` holds directed edges `[from, to, ms]`. A signal starts at node k. Return how long until
every node has received it, or −1 if some node never does.

`times = [[2, 1, 1], [2, 3, 1], [3, 4, 1]], n = 4, k = 2` → `2`

#### Hints

1. You need the shortest path from k to every node, with non-negative weights: Dijkstra.
2. Keep a min-heap of `[distance, node]`. Pop the closest, and relax its outgoing edges.
3. When a popped entry is worse than the best known distance, it is stale: skip it. The answer is the largest distance.

#### Solution

Dijkstra with a binary heap and "lazy deletion": instead of decreasing a key inside the heap, push a new entry and skip
stale ones when they surface. Each edge can push at most once, so the cost is O(E log E).

```ts
import assert from 'node:assert/strict';

type Item = [dist: number, node: number];

class MinHeap {
  private a: Item[] = [];
  get size() {
    return this.a.length;
  }
  push(e: Item) {
    const a = this.a;
    a.push(e);
    for (let i = a.length - 1; i > 0; ) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): Item {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      for (let i = 0; ; ) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function networkDelayTime(times: [number, number, number][], n: number, k: number): number {
  const graph = new Map<number, [number, number][]>();
  for (const [from, to, ms] of times) {
    if (!graph.has(from)) graph.set(from, []);
    graph.get(from)!.push([to, ms]);
  }
  const dist = new Array<number>(n + 1).fill(Infinity);
  dist[k] = 0;
  const heap = new MinHeap();
  heap.push([0, k]);
  while (heap.size > 0) {
    const [d, node] = heap.pop();
    if (d > dist[node]) continue; // stale entry
    for (const [next, ms] of graph.get(node) ?? []) {
      if (d + ms < dist[next]) {
        dist[next] = d + ms;
        heap.push([dist[next], next]);
      }
    }
  }
  const slowest = Math.max(...dist.slice(1));
  return slowest === Infinity ? -1 : slowest;
}

assert.equal(networkDelayTime([[2, 1, 1], [2, 3, 1], [3, 4, 1]], 4, 2), 2);
assert.equal(networkDelayTime([[1, 2, 1]], 2, 1), 1);
assert.equal(networkDelayTime([[1, 2, 1]], 2, 2), -1); // node 1 is unreachable
assert.equal(networkDelayTime([[1, 2, 10], [1, 3, 1], [3, 2, 1]], 3, 1), 2); // the indirect path wins
assert.equal(networkDelayTime([], 1, 1), 0);
```

Complexity: O(E log E) time, O(V + E) space.

#### Follow-ups

- **Return the path too?** Store `previous[next] = node` when relaxing, then walk back from the target.
- **At most k stops?** Plain Dijkstra no longer works; use Bellman–Ford limited to k+1 rounds, or BFS by levels.

### Shortest Path in a Grid {medium}

A grid has open cells (0) and walls (1). Moving up, down, left or right, return the fewest moves from the top-left to
the bottom-right corner, or −1 if it cannot be reached.

```text
0 0 0
1 1 0
0 0 0      →  4
```

#### Hints

1. Every move costs the same, so BFS finds the shortest path. Dijkstra is unnecessary.
2. Store the distance of each cell when you first reach it; that also marks it as visited.
3. Handle the corner cases first: a wall at the start or the end, and a 1×1 grid.

#### Solution

BFS from the start, recording each cell's distance the first time it is reached. Marking cells when they are enqueued,
not when dequeued, stops the same cell entering the queue many times.

```ts
import assert from 'node:assert/strict';

function shortestPath(grid: number[][]): number {
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  if (rows === 0 || grid[0][0] === 1 || grid[rows - 1][cols - 1] === 1) return -1;
  const dist = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
  dist[0][0] = 0;
  const queue: [number, number][] = [[0, 0]];
  for (let head = 0; head < queue.length; head++) {
    const [r, c] = queue[head];
    if (r === rows - 1 && c === cols - 1) return dist[r][c];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0 && dist[nr][nc] === -1) {
        dist[nr][nc] = dist[r][c] + 1;
        queue.push([nr, nc]);
      }
    }
  }
  return -1;
}

assert.equal(shortestPath([[0, 0, 0], [1, 1, 0], [0, 0, 0]]), 4);
assert.equal(shortestPath([[0, 1], [1, 0]]), -1);
assert.equal(shortestPath([[0]]), 0);
assert.equal(shortestPath([[1]]), -1);
assert.equal(shortestPath([[0, 0, 0], [0, 1, 0], [0, 1, 0]]), 4);
assert.equal(shortestPath([]), -1);
```

Complexity: O(rows × cols) time and space.

#### Follow-ups

- **Diagonal moves allowed?** Add the four diagonal offsets; BFS still applies.
- **Cells have different costs?** Use Dijkstra, or 0–1 BFS with a deque when costs are only 0 or 1.

### Most Agent Runs at Once (Meeting Rooms II) {medium core}

Each agent run has a half-open time range `[start, end)`. Return the largest number of runs active at the same moment,
which is also the number of workers needed to run them all without waiting.

`[[0, 30], [5, 10], [15, 20]]` → `2`

#### Hints

1. Only the moments when a run starts or ends matter.
2. Sort all starts, and separately all ends. Sweep through the starts in order.
3. Before counting a new start, release every run that ended at or before it.

#### Solution

A sweep over two sorted arrays. For each start, release runs whose end is at or before it (half-open ranges, so a run
ending at 10 frees its worker for one starting at 10), then count this run as active. A min-heap of end times is the
other common answer and is equivalent.

```ts
import assert from 'node:assert/strict';

function maxConcurrent(runs: [number, number][]): number {
  const starts = runs.map((r) => r[0]).sort((a, b) => a - b);
  const ends = runs.map((r) => r[1]).sort((a, b) => a - b);
  let active = 0;
  let best = 0;
  let e = 0;
  for (const start of starts) {
    while (e < ends.length && ends[e] <= start) {
      active--;
      e++;
    }
    active++;
    best = Math.max(best, active);
  }
  return best;
}

assert.equal(maxConcurrent([[0, 30], [5, 10], [15, 20]]), 2);
assert.equal(maxConcurrent([[7, 10], [2, 4]]), 1);
assert.equal(maxConcurrent([[1, 5], [5, 10]]), 1); // back to back, half-open
assert.equal(maxConcurrent([[1, 10], [2, 9], [3, 8]]), 3);
assert.equal(maxConcurrent([]), 0);
```

Complexity: O(n log n) time for the sorts, O(n) space.

#### Follow-ups

- **Which worker runs which job?** Use a min-heap of `[endTime, workerId]`; reuse the worker whose run ends first.
- **Can one worker do everything?** Sort by start and check no run starts before the previous one ends.

### Climbing Stairs {easy}

You can climb 1 or 2 steps at a time. How many distinct ways are there to reach step n?

`n = 3` → `3` (1+1+1, 1+2, 2+1)

#### Hints

1. The last move was either a 1-step from n−1 or a 2-step from n−2.
2. So `ways(n) = ways(n - 1) + ways(n - 2)`: Fibonacci.
3. Naive recursion is exponential. Keep only the last two values.

#### Solution

Bottom-up with two variables. Explain the recurrence first: it is the whole idea, and it is the template for most
"count the ways" DP problems.

```ts
import assert from 'node:assert/strict';

function climbStairs(n: number): number {
  let oneBack = 1; // ways to reach step 0
  let twoBack = 0;
  for (let step = 1; step <= n; step++) {
    [oneBack, twoBack] = [oneBack + twoBack, oneBack];
  }
  return oneBack;
}

assert.equal(climbStairs(1), 1);
assert.equal(climbStairs(2), 2);
assert.equal(climbStairs(3), 3);
assert.equal(climbStairs(5), 8);
assert.equal(climbStairs(45), 1836311903);
assert.equal(climbStairs(0), 1); // one way to stay put
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Steps of size 1, 2 or 3?** Sum the last three values.
- **Very large n, modulo a prime?** Matrix exponentiation gives O(log n).

### Coin Change {medium core}

Given coin values and an amount, return the fewest coins that make the amount, or −1 if it cannot be made. You have
unlimited coins of each value.

`coins = [1, 2, 5], amount = 11` → `3` (5 + 5 + 1)

#### Hints

1. Greedy (largest coin first) fails: coins `[1, 3, 4]`, amount 6 gives 4+1+1 instead of 3+3.
2. Define `best[a]` as the fewest coins for amount a. The last coin used was one of the coins.
3. `best[a] = 1 + min(best[a - coin])` over coins that fit, with `best[0] = 0`.

#### Solution

Bottom-up DP over amounts from 1 to the target. `Infinity` marks amounts that cannot be made, which keeps the
`Math.min` logic simple. The test compares it with a memoised top-down version on random inputs.

```ts
import assert from 'node:assert/strict';

function coinChange(coins: number[], amount: number): number {
  const best = new Array<number>(amount + 1).fill(Infinity);
  best[0] = 0;
  for (let a = 1; a <= amount; a++) {
    for (const coin of coins) {
      if (coin <= a && best[a - coin] + 1 < best[a]) best[a] = best[a - coin] + 1;
    }
  }
  return best[amount] === Infinity ? -1 : best[amount];
}

function coinChangeMemo(coins: number[], amount: number): number {
  const memo = new Map<number, number>();
  const fewest = (a: number): number => {
    if (a === 0) return 0;
    if (a < 0) return Infinity;
    const cached = memo.get(a);
    if (cached !== undefined) return cached;
    let result = Infinity;
    for (const coin of coins) result = Math.min(result, fewest(a - coin) + 1);
    memo.set(a, result);
    return result;
  };
  const answer = fewest(amount);
  return answer === Infinity ? -1 : answer;
}

assert.equal(coinChange([1, 2, 5], 11), 3);
assert.equal(coinChange([2], 3), -1);
assert.equal(coinChange([1], 0), 0);
assert.equal(coinChange([1, 3, 4], 6), 2); // greedy would say 3
assert.equal(coinChange([186, 419, 83, 408], 6249), 20);
for (let trial = 0; trial < 50; trial++) {
  const coins = Array.from({ length: 1 + (trial % 4) }, () => 1 + Math.floor(Math.random() * 12));
  const amount = Math.floor(Math.random() * 60);
  assert.equal(coinChange(coins, amount), coinChangeMemo(coins, amount));
}
```

Complexity: O(amount × coins) time, O(amount) space.

#### Follow-ups

- **Number of ways to make the amount (order does not matter)?** Loop over coins in the outer loop and amounts in the
  inner loop, adding `ways[a - coin]`.
- **Which coins?** Store the coin that produced each `best[a]` and walk back from the amount.

### Longest Increasing Subsequence {medium}

Return the length of the longest strictly increasing subsequence (not necessarily contiguous).

`[10, 9, 2, 5, 3, 7, 101, 18]` → `4` (2, 3, 7, 18)

#### Hints

1. O(n²) DP: `lis[i]` is the longest increasing subsequence ending at i, built from every earlier smaller element.
2. For O(n log n), keep `tails[k]`: the smallest possible tail of an increasing subsequence of length k + 1.
3. `tails` is always sorted, so binary-search where each new number goes: replace the first tail that is at least as
   large, or append.

#### Solution

The "patience sorting" method. `tails` stays sorted, so each number costs one binary search. Replacing a tail with a
smaller value keeps the same length but makes it easier to extend later. The length of `tails` is the answer (the
array itself is not necessarily a real subsequence). The test checks it against the O(n²) DP.

```ts
import assert from 'node:assert/strict';

function lengthOfLIS(nums: number[]): number {
  const tails: number[] = [];
  for (const x of nums) {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = x; // replaces, or appends when lo === tails.length
  }
  return tails.length;
}

function lengthOfLISQuadratic(nums: number[]): number {
  const lis = nums.map(() => 1);
  for (let i = 0; i < nums.length; i++) {
    for (let j = 0; j < i; j++) if (nums[j] < nums[i]) lis[i] = Math.max(lis[i], lis[j] + 1);
  }
  return Math.max(0, ...lis);
}

assert.equal(lengthOfLIS([10, 9, 2, 5, 3, 7, 101, 18]), 4);
assert.equal(lengthOfLIS([0, 1, 0, 3, 2, 3]), 4);
assert.equal(lengthOfLIS([7, 7, 7, 7]), 1); // strictly increasing
assert.equal(lengthOfLIS([]), 0);
for (let trial = 0; trial < 100; trial++) {
  const nums = Array.from({ length: trial % 20 }, () => Math.floor(Math.random() * 10));
  assert.equal(lengthOfLIS(nums), lengthOfLISQuadratic(nums));
}
```

Complexity: O(n log n) time, O(n) space.

#### Follow-ups

- **Non-decreasing instead of strictly increasing?** Search for the first tail strictly greater than x (`<=` in the
  comparison).
- **Return the subsequence?** Keep, for each number, the index of the tail before it, then walk back from the last tail.

### Word Break {medium}

Given a string and a dictionary of words, return whether the string can be split into a sequence of dictionary words.
Words can be reused.

`s = "applepenapple", words = ["apple", "pen"]` → `true`

#### Hints

1. Trying every split recursively repeats the same suffixes many times.
2. Define `ok[i]`: can the first i characters be split? `ok[0]` is true.
3. `ok[i]` is true if some `j < i` has `ok[j]` true and `s.slice(j, i)` is a word. Only check lengths up to the longest word.

#### Solution

Bottom-up DP over prefix lengths, with a `Set` for O(1) word lookups and a cap on the slice length, so the work is
O(n × maxWordLength) slices instead of O(n²).

```ts
import assert from 'node:assert/strict';

function wordBreak(s: string, words: string[]): boolean {
  const dictionary = new Set(words);
  const longest = Math.max(0, ...words.map((w) => w.length));
  const ok = new Array<boolean>(s.length + 1).fill(false);
  ok[0] = true;
  for (let i = 1; i <= s.length; i++) {
    for (let j = Math.max(0, i - longest); j < i; j++) {
      if (ok[j] && dictionary.has(s.slice(j, i))) {
        ok[i] = true;
        break;
      }
    }
  }
  return ok[s.length];
}

assert.equal(wordBreak('leetcode', ['leet', 'code']), true);
assert.equal(wordBreak('applepenapple', ['apple', 'pen']), true); // reuse
assert.equal(wordBreak('catsandog', ['cats', 'dog', 'sand', 'and', 'cat']), false);
assert.equal(wordBreak('aaaaaaa', ['aaaa', 'aaa']), true);
assert.equal(wordBreak('', ['a']), true);
assert.equal(wordBreak('a', []), false);
```

Complexity: O(n × L) slices for string length n and longest word L (each slice costs up to L), O(n) space.

#### Follow-ups

- **Return every possible sentence?** DFS with memoisation of suffix → list of sentences; the output can be exponential.
- **Huge dictionary?** A trie lets you walk forward from each `ok[j]` position without building slices.
