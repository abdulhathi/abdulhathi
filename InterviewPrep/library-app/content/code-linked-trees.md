---
title: Linked lists, trees and graphs
goal: Rewire linked lists safely with dummy heads and fast/slow pointers, traverse trees recursively and level by level, and run BFS, DFS and topological sort on grids and graphs.
minutes: 90
---

Pointer problems test whether you can keep a mental picture of references while you change them. Tree and graph
problems test whether you can choose between recursion (depth-first) and a queue (breadth-first) and explain why.
Interviewers often start with an easy one here (reverse a list, maximum depth) and then add a twist, so learn the
patterns and the one sentence that justifies each. Every solution below includes small helpers that build the inputs,
so each block runs on its own. They are marked **Scaffolding** in each block: in an interview the node class is given to
you, and you write only the part marked **The answer**.

## Patterns in one table

| Problem shape | Technique | Key sentence to say |
|---|---|---|
| Head might change (insert/delete at the front, merge) | Dummy (sentinel) node | "The dummy means the head is never a special case" |
| Middle, cycle, k-th from the end | Fast and slow pointers | "Fast moves two, slow moves one; when fast ends, slow is in the middle" |
| Reverse a list or part of one | Three pointers: prev, current, next | "Save next before cutting the link" |
| Anything about a tree's height, sums or validity | Recursive DFS returning a value | "Trust the recursive call on each child, combine at the node" |
| Level by level, "minimum depth", right-side view | BFS with a queue, one level per loop | "`len(queue)` at the start of the loop is the size of this level" |
| Shortest path in an unweighted grid or graph | BFS | "BFS reaches every node by the fewest edges first" |
| Connected regions (islands) | BFS or DFS flood fill with a visited set | "Mark a cell visited when you add it, not when you pop it" |
| Order with dependencies, detect a cycle | Topological sort (Kahn's algorithm) | "Take nodes with no remaining prerequisites" |

## The node classes

These match LeetCode's definitions. The string annotations (`"ListNode | None"`) let the class refer to itself on
every Python version.

```python
class ListNode:
    def __init__(self, val: int = 0, next: "ListNode | None" = None):
        self.val = val
        self.next = next

class TreeNode:
    def __init__(self, val: int = 0, left: "TreeNode | None" = None, right: "TreeNode | None" = None):
        self.val = val
        self.left = left
        self.right = right

head = ListNode(1, ListNode(2, ListNode(3)))
root = TreeNode(2, TreeNode(1), TreeNode(3))
assert head.next.next.val == 3 and root.right.val == 3
```

## Interview questions

### When do you use a dummy head node? {core}

Whenever the head of the list might change: deleting the first node, merging two lists, partitioning, or inserting at
the front. You create `dummy = ListNode(0, head)`, do the work with `dummy` as the node before the head, and return
`dummy.next`. It removes the special case for an empty list or a changed head, which is where most linked-list bugs
come from.

### BFS or DFS: how do you choose? {core}

BFS (a queue) explores level by level, so it finds the **shortest path in an unweighted graph** and answers
level-based questions. DFS (recursion or a stack) goes deep first. It is natural for exhaustive search, path
existence, tree computations like height, cycle detection and topological order. Both visit each node and edge once:
O(V + E) time. BFS memory is the widest level; DFS memory is the deepest path.

### What is the risk of recursive DFS in Python? {core}

Python's default recursion limit is 1,000 frames, and CPython has no tail-call optimisation. A degenerate tree (a
chain of 10,000 nodes) or a long path in a big grid raises `RecursionError`. Options: write the DFS iteratively with
an explicit stack, use BFS, or raise the limit with `sys.setrecursionlimit` (fine for a moderate increase, but deep
recursion still costs memory per frame, and on older Python versions it could crash the interpreter). Mention this; it
shows you know Python, not just algorithms.

### Name the tree traversals and when each is useful. {core}

Pre-order (node, left, right) copies or serialises a tree. In-order (left, node, right) visits a binary search tree in
**sorted order**, which is the basis of "validate BST" and "k-th smallest". Post-order (left, right, node) computes
values that depend on children, like height or subtree sums. Level order (BFS) goes level by level.

### How do you represent a graph in Python? {deep}

Usually an adjacency list: `dict[node, list[neighbour]]`, often a `defaultdict(list)` built from an edge list, or
`list[list[int]]` when nodes are 0..n−1. An adjacency matrix (`n × n`) suits dense graphs and O(1) edge checks but
costs O(n²) memory. A grid is an implicit graph: the neighbours of `(r, c)` are the four (or eight) adjacent cells.

### Why is BFS O(V + E)? {deep}

Each vertex is added to the queue at most once, thanks to the visited set, and when it is popped we look at each of
its edges once. So the work is proportional to vertices plus edges. On a grid with R × C cells, that is O(R·C),
because each cell has at most four edges.

## Coding problems

### Reverse a linked list {easy core}

Reverse a singly linked list and return the new head.

- `1 → 2 → 3 → 4 → 5` → `5 → 4 → 3 → 2 → 1`

#### Hints

1. Draw `1 → 2 → 3`. Where must each arrow point afterwards, and what do you lose if you flip an arrow too early?
2. Walk once with three references: `prev`, `current`, and the saved `next` (or you lose the rest of the list).

#### Solution

The iterative version is the one to write first: O(1) space and no recursion limit. The recursive version is a common
follow-up.

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
class ListNode:
    def __init__(self, val: int = 0, next: "ListNode | None" = None):
        self.val = val
        self.next = next

def build(values: list[int]) -> ListNode | None:
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def to_list(head: ListNode | None) -> list[int]:
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

# --- The answer: this is the part you write ---
def reverse_list(head: ListNode | None) -> ListNode | None:
    prev = None
    current = head
    while current:
        nxt = current.next          # save the rest before cutting the link
        current.next = prev         # point this node backwards
        prev = current
        current = nxt
    return prev

def reverse_recursive(head: ListNode | None) -> ListNode | None:
    if head is None or head.next is None:
        return head
    new_head = reverse_recursive(head.next)     # reverse everything after head
    head.next.next = head                       # the old next node now points back at head
    head.next = None
    return new_head

for values in ([1, 2, 3, 4, 5], [1, 2], [7], []):
    assert to_list(reverse_list(build(values))) == values[::-1]
    assert to_list(reverse_recursive(build(values))) == values[::-1]
```

Complexity: O(n) time. Iterative O(1) space; recursive O(n) stack space.

#### Follow-ups

- **Reverse only positions `left..right` (Reverse Linked List II)?** Walk to the node before `left` (a dummy head helps
  when `left` is 1), reverse that segment with the same loop, then reconnect both ends.
- **Reverse in groups of k (hard)?** Repeat the segment reversal for each full group of k nodes.
- **Palindrome linked list?** Find the middle, reverse the second half, compare the halves.

### Merge two sorted lists {easy core}

Merge two sorted linked lists into one sorted list by splicing their nodes together.

- `1 → 2 → 4` and `1 → 3 → 4` → `1 → 1 → 2 → 3 → 4 → 4`

#### Hints

1. Which node is the head of the result? It depends on the first comparison. A dummy node avoids that question.
2. Keep a `tail` pointer. Attach the smaller head, advance that list, and advance the tail.
3. When one list runs out, attach the rest of the other in one step.

#### Solution

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
class ListNode:
    def __init__(self, val: int = 0, next: "ListNode | None" = None):
        self.val = val
        self.next = next

def build(values: list[int]) -> ListNode | None:
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def to_list(head: ListNode | None) -> list[int]:
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

# --- The answer: this is the part you write ---
def merge_two_lists(a: ListNode | None, b: ListNode | None) -> ListNode | None:
    dummy = ListNode()
    tail = dummy
    while a and b:
        if a.val <= b.val:          # <= keeps equal values from a first (a stable merge)
            tail.next = a
            a = a.next
        else:
            tail.next = b
            b = b.next
        tail = tail.next
    tail.next = a or b              # one list is empty; the other is already sorted
    return dummy.next

assert to_list(merge_two_lists(build([1, 2, 4]), build([1, 3, 4]))) == [1, 1, 2, 3, 4, 4]
assert to_list(merge_two_lists(build([]), build([]))) == []
assert to_list(merge_two_lists(build([]), build([0]))) == [0]
assert to_list(merge_two_lists(build([5, 6]), build([1, 2, 3]))) == [1, 2, 3, 5, 6]
```

Complexity: O(n + m) time, O(1) extra space (the nodes are reused).

#### Follow-ups

- **k lists?** A heap of the k heads, or merge pairs of lists repeatedly: O(N log k). See the stacks, queues and heaps
  chapter.
- **Sort a linked list (Sort List)?** Merge sort: split at the middle with fast/slow pointers, sort both halves, merge.

### Linked list cycle {easy core}

Return `True` if the linked list has a cycle. Then, as the follow-up interviewers usually ask, return the node where
the cycle begins.

- `3 → 2 → 0 → −4 → (back to 2)` → `True`, and the cycle starts at the node with value 2

#### Hints

1. A set of visited nodes works: O(n) time and O(n) space. Can you use O(1) space?
2. Move a slow pointer one step and a fast pointer two steps. If there is a loop, fast must catch slow.
3. To find the start: after they meet, put one pointer back at the head and move both one step at a time.

#### Solution

Inside a cycle, fast gains one node per step on slow, so it catches up within one lap (Floyd's algorithm). For the
start: if the distance from the head to the cycle start is `a`, the two pointers meet at a point from which walking
`a` more steps also lands on the cycle start. So a pointer from the head and one from the meeting point, both moving
one step at a time, meet exactly at the start.

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
class ListNode:
    def __init__(self, val: int = 0, next: "ListNode | None" = None):
        self.val = val
        self.next = next

def build_with_cycle(values: list[int], pos: int) -> tuple[ListNode | None, list[ListNode]]:
    """pos = index the tail links back to, or -1 for no cycle."""
    nodes = [ListNode(v) for v in values]
    for a, b in zip(nodes, nodes[1:]):
        a.next = b
    if nodes and pos >= 0:
        nodes[-1].next = nodes[pos]
    return (nodes[0] if nodes else None), nodes

# --- The answer: this is the part you write ---
def has_cycle(head: ListNode | None) -> bool:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:            # compare identity, not values
            return True
    return False

def cycle_start(head: ListNode | None) -> ListNode | None:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
        if slow is fast:
            finder = head
            while finder is not slow:
                finder = finder.next
                slow = slow.next
            return finder
    return None

head, nodes = build_with_cycle([3, 2, 0, -4], 1)
assert has_cycle(head) and cycle_start(head) is nodes[1]

head, nodes = build_with_cycle([1, 2], 0)
assert has_cycle(head) and cycle_start(head) is nodes[0]

head, nodes = build_with_cycle([1], 0)          # a node pointing at itself
assert has_cycle(head) and cycle_start(head) is nodes[0]

for values in ([1, 2, 3], [1], []):
    head, _ = build_with_cycle(values, -1)
    assert not has_cycle(head) and cycle_start(head) is None
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **Why compare with `is`?** Two different nodes can hold the same value; a cycle means the same **node** comes back.
- **Find the duplicate number in an array of n + 1 values in 1..n (LeetCode 287)?** Treat `i → nums[i]` as a linked
  list; the duplicate is the start of the cycle, found with exactly this algorithm.

### Middle of the linked list {easy}

Return the middle node. With an even number of nodes, return the second of the two middle nodes.

- `1 → 2 → 3 → 4 → 5` → node 3
- `1 → 2 → 3 → 4 → 5 → 6` → node 4

#### Hints

1. Counting the length and then walking half of it takes two passes. Can you do one?
2. Move slow one step and fast two steps. Where is slow when fast reaches the end?

#### Solution

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
class ListNode:
    def __init__(self, val: int = 0, next: "ListNode | None" = None):
        self.val = val
        self.next = next

def build(values: list[int]) -> ListNode | None:
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

# --- The answer: this is the part you write ---
def middle_node(head: ListNode | None) -> ListNode | None:
    slow = fast = head
    while fast and fast.next:
        slow = slow.next
        fast = fast.next.next
    return slow

assert middle_node(build([1, 2, 3, 4, 5])).val == 3
assert middle_node(build([1, 2, 3, 4, 5, 6])).val == 4
assert middle_node(build([1])).val == 1
assert middle_node(build([1, 2])).val == 2
assert middle_node(build([])) is None
```

Complexity: O(n) time, O(1) space.

#### Follow-ups

- **First middle instead of the second?** Loop `while fast.next and fast.next.next`, starting both at the head.
- **Delete the middle node?** Stop slow one node earlier (start fast one step ahead) and unlink `slow.next`.

### Remove the nth node from the end {medium}

Remove the `n`-th node from the end of the list and return its head. `n` is always valid.

- `1 → 2 → 3 → 4 → 5`, `n = 2` → `1 → 2 → 3 → 5`

#### Hints

1. Two passes work: count the length L, then remove node number L − n from the front. Can you do one pass?
2. Start a `lead` pointer n nodes ahead of a `trail` pointer, then move both until `lead` reaches the last node.
3. Removing the head is a special case. A dummy node makes it ordinary.

#### Solution

With a gap of exactly n nodes, when `lead` is on the last node, `trail` is on the node **before** the one to remove.
Starting both at a dummy makes "remove the head" work like any other case.

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
class ListNode:
    def __init__(self, val: int = 0, next: "ListNode | None" = None):
        self.val = val
        self.next = next

def build(values: list[int]) -> ListNode | None:
    head = None
    for v in reversed(values):
        head = ListNode(v, head)
    return head

def to_list(head: ListNode | None) -> list[int]:
    out = []
    while head:
        out.append(head.val)
        head = head.next
    return out

# --- The answer: this is the part you write ---
def remove_nth_from_end(head: ListNode | None, n: int) -> ListNode | None:
    dummy = ListNode(0, head)
    lead = trail = dummy
    for _ in range(n):
        lead = lead.next                # lead is now n nodes ahead of trail
    while lead.next:
        lead = lead.next
        trail = trail.next
    trail.next = trail.next.next        # trail is just before the node to remove
    return dummy.next

assert to_list(remove_nth_from_end(build([1, 2, 3, 4, 5]), 2)) == [1, 2, 3, 5]
assert to_list(remove_nth_from_end(build([1]), 1)) == []
assert to_list(remove_nth_from_end(build([1, 2]), 1)) == [1]
assert to_list(remove_nth_from_end(build([1, 2]), 2)) == [2]      # removes the head
```

Complexity: O(n) time in one pass, O(1) space.

#### Follow-ups

- **What if n can be larger than the length?** Check for `lead is None` while creating the gap and return the list
  unchanged (or raise), depending on the spec. Ask the interviewer.
- **Rotate the list right by k?** Find the length, connect the tail to the head, and cut at position `length - k % length`.

### Maximum depth of a binary tree {easy core}

Return the number of nodes on the longest path from the root down to a leaf.

- `[3, 9, 20, null, null, 15, 7]` (level order) → `3`

#### Hints

1. Start with the base case: what is the depth of an empty tree? Then ask how a node's depth relates to its children's.
2. Depth is 1 plus the larger of the two subtree depths. Iteratively: BFS, counting how many levels you process.

#### Solution

The recursive version is three lines and the expected first answer. Mention the iterative BFS version too, because a
very deep tree breaks Python's recursion limit. The test proves it.

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
from collections import deque

class TreeNode:
    def __init__(self, val: int = 0, left: "TreeNode | None" = None, right: "TreeNode | None" = None):
        self.val = val
        self.left = left
        self.right = right

def build_tree(values: list[int | None]) -> TreeNode | None:
    """Build from LeetCode's level-order list, where None marks a missing child."""
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root

# --- The answer: this is the part you write ---
def max_depth(root: TreeNode | None) -> int:
    if root is None:
        return 0
    return 1 + max(max_depth(root.left), max_depth(root.right))

def max_depth_bfs(root: TreeNode | None) -> int:
    if root is None:
        return 0
    depth = 0
    queue = deque([root])
    while queue:
        depth += 1
        for _ in range(len(queue)):         # every node of the current level
            node = queue.popleft()
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
    return depth

for values, expected in [([3, 9, 20, None, None, 15, 7], 3), ([1, None, 2], 2), ([], 0), ([0], 1)]:
    root = build_tree(values)
    assert max_depth(root) == expected == max_depth_bfs(root)

chain = TreeNode(0)                         # a 5,000-node chain: a degenerate tree
node = chain
for i in range(1, 5000):
    node.right = TreeNode(i)
    node = node.right
assert max_depth_bfs(chain) == 5000
try:
    max_depth(chain)
    raise AssertionError("expected RecursionError")
except RecursionError:
    pass                                    # the default limit is about 1,000 frames
```

Complexity: O(n) time. Recursive O(h) stack space, where h is the height; BFS O(w), the widest level.

#### Follow-ups

- **Minimum depth?** BFS and return at the first leaf. Recursively, careful: a node with one child is not a leaf.
- **Balanced binary tree?** Return the height from a helper, or −1 as soon as the two sides differ by more than one.
- **Diameter of a binary tree?** At each node, `left_height + right_height` is a candidate; track the maximum while
  returning heights.

### Invert a binary tree {easy}

Mirror a binary tree: swap the left and right children of every node.

- `[4, 2, 7, 1, 3, 6, 9]` → `[4, 7, 2, 9, 6, 3, 1]`

#### Hints

1. Think recursively: if both subtrees were already mirrored, what is left to do at the root?
2. Swap the two (mirrored) children. Any traversal that visits every node once works, recursive or BFS.

#### Solution

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
from collections import deque

class TreeNode:
    def __init__(self, val: int = 0, left: "TreeNode | None" = None, right: "TreeNode | None" = None):
        self.val = val
        self.left = left
        self.right = right

def build_tree(values: list[int | None]) -> TreeNode | None:
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root

def to_level_list(root: TreeNode | None) -> list[int | None]:
    out: list[int | None] = []
    queue = deque([root])
    while queue:
        node = queue.popleft()
        if node:
            out.append(node.val)
            queue.append(node.left)
            queue.append(node.right)
        else:
            out.append(None)
    while out and out[-1] is None:
        out.pop()
    return out

# --- The answer: this is the part you write ---
def invert_tree(root: TreeNode | None) -> TreeNode | None:
    if root is None:
        return None
    root.left, root.right = invert_tree(root.right), invert_tree(root.left)
    return root

assert to_level_list(invert_tree(build_tree([4, 2, 7, 1, 3, 6, 9]))) == [4, 7, 2, 9, 6, 3, 1]
assert to_level_list(invert_tree(build_tree([2, 1, 3]))) == [2, 3, 1]
assert to_level_list(invert_tree(build_tree([1, 2]))) == [1, None, 2]
assert invert_tree(None) is None
```

Complexity: O(n) time, O(h) stack space.

#### Follow-ups

- **Symmetric tree?** Compare the left subtree with the mirror of the right: `a.val == b.val`, `a.left` vs `b.right`,
  `a.right` vs `b.left`.
- **Same tree?** The same recursion without the mirroring.

### Binary tree level order traversal {medium core}

Return the values of a binary tree level by level, left to right.

- `[3, 9, 20, null, null, 15, 7]` → `[[3], [9, 20], [15, 7]]`

#### Hints

1. A queue gives you nodes in the order they were discovered: level by level.
2. At the start of each round, `len(queue)` is exactly the number of nodes on the current level.

#### Solution

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
from collections import deque

class TreeNode:
    def __init__(self, val: int = 0, left: "TreeNode | None" = None, right: "TreeNode | None" = None):
        self.val = val
        self.left = left
        self.right = right

def build_tree(values: list[int | None]) -> TreeNode | None:
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root

# --- The answer: this is the part you write ---
def level_order(root: TreeNode | None) -> list[list[int]]:
    if root is None:
        return []
    levels: list[list[int]] = []
    queue = deque([root])
    while queue:
        level = []
        for _ in range(len(queue)):           # only the nodes that belong to this level
            node = queue.popleft()
            level.append(node.val)
            if node.left:
                queue.append(node.left)
            if node.right:
                queue.append(node.right)
        levels.append(level)
    return levels

assert level_order(build_tree([3, 9, 20, None, None, 15, 7])) == [[3], [9, 20], [15, 7]]
assert level_order(build_tree([1])) == [[1]]
assert level_order(build_tree([])) == []
assert level_order(build_tree([1, 2, 3, 4, None, None, 5])) == [[1], [2, 3], [4, 5]]
```

Complexity: O(n) time, O(w) space for the widest level.

#### Follow-ups

- **Zigzag order?** Reverse every other level (or append to a deque from alternating ends).
- **Right side view?** The last value of each level.
- **Average of each level?** `sum(level) / len(level)` per level.

### Validate a binary search tree {medium core}

Return `True` if a binary tree is a valid BST: every value in a node's left subtree is strictly smaller than the node,
and every value in its right subtree is strictly larger.

- `[2, 1, 3]` → `True`
- `[5, 4, 6, null, null, 3, 7]` → `False` (3 sits in the right subtree of 5)

#### Hints

1. Checking only `left.val < node.val < right.val` is the classic trap. Try it on the second example.
2. Every node must lie inside a range set by all of its ancestors. Pass `(low, high)` down the recursion.
3. Alternative: an in-order traversal of a valid BST is strictly increasing.

#### Solution

Going left tightens the upper bound to the parent's value; going right tightens the lower bound. A node is valid only
if it sits strictly inside its range and both subtrees are valid.

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
from collections import deque

class TreeNode:
    def __init__(self, val: int = 0, left: "TreeNode | None" = None, right: "TreeNode | None" = None):
        self.val = val
        self.left = left
        self.right = right

def build_tree(values: list[int | None]) -> TreeNode | None:
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root

# --- The answer: this is the part you write ---
def is_valid_bst(root: TreeNode | None) -> bool:
    def check(node: TreeNode | None, low: float, high: float) -> bool:
        if node is None:
            return True
        if not low < node.val < high:
            return False
        return check(node.left, low, node.val) and check(node.right, node.val, high)

    return check(root, float("-inf"), float("inf"))

assert is_valid_bst(build_tree([2, 1, 3]))
assert not is_valid_bst(build_tree([5, 1, 4, None, None, 3, 6]))
assert not is_valid_bst(build_tree([5, 4, 6, None, None, 3, 7]))   # passes a children-only check, but is invalid
assert not is_valid_bst(build_tree([2, 2, 2]))                     # duplicates break "strictly"
assert is_valid_bst(build_tree([]))
assert is_valid_bst(build_tree([-(2 ** 31)]))                      # infinities, not sentinel ints, as bounds
```

Complexity: O(n) time, O(h) stack space.

#### Follow-ups

- **In-order version?** Traverse iteratively with a stack, remembering the previous value; any value `<=` the previous
  one means invalid.
- **k-th smallest in a BST?** In-order traversal and stop at the k-th value.
- **Why `float("inf")` and not a big integer?** Node values may be the minimum or maximum integer; infinities cannot
  collide with real values.

### Lowest common ancestor of a binary tree {medium}

Given a binary tree and two nodes `p` and `q` that are both in it, return their lowest common ancestor: the deepest
node that has both as descendants (a node counts as its own descendant).

- Tree `[3, 5, 1, 6, 2, 0, 8, null, null, 7, 4]`: LCA(5, 1) = 3, LCA(5, 4) = 5

#### Hints

1. Ask each subtree: "do you contain p or q?" and return what you found.
2. If p turns up in one subtree and q in the other, the current node is the split point.
3. If the current node is p or q itself, return it: it is the answer or part of the answer.

#### Solution

The recursion returns `p`, `q`, their LCA, or `None` for each subtree. When both sides return something, the current
node is where the paths to p and q split.

```python
# --- Scaffolding: the node class is given in the interview; build/print helpers are only for the tests ---
from collections import deque

class TreeNode:
    def __init__(self, val: int = 0, left: "TreeNode | None" = None, right: "TreeNode | None" = None):
        self.val = val
        self.left = left
        self.right = right

def build_tree(values: list[int | None]) -> TreeNode | None:
    if not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = deque([root])
    i = 1
    while queue and i < len(values):
        node = queue.popleft()
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root

def find(root: TreeNode | None, val: int) -> TreeNode | None:
    if root is None or root.val == val:
        return root
    return find(root.left, val) or find(root.right, val)

# --- The answer: this is the part you write ---
def lowest_common_ancestor(root: TreeNode | None, p: TreeNode, q: TreeNode) -> TreeNode | None:
    if root is None or root is p or root is q:
        return root
    left = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)
    if left and right:
        return root              # p and q are on different sides: this is the split point
    return left or right         # both on one side (or neither)

root = build_tree([3, 5, 1, 6, 2, 0, 8, None, None, 7, 4])
def lca(a: int, b: int) -> int:
    return lowest_common_ancestor(root, find(root, a), find(root, b)).val

assert lca(5, 1) == 3
assert lca(5, 4) == 5            # a node is its own ancestor
assert lca(6, 4) == 5
assert lca(7, 8) == 3
assert lca(0, 8) == 1
```

Complexity: O(n) time, O(h) stack space.

#### Follow-ups

- **It is a BST?** Use the values: if both are smaller than the node, go left; if both are larger, go right; otherwise
  the current node is the LCA. O(h) time and O(1) space iteratively.
- **p or q might be missing?** Count how many of them you actually found, and only trust the answer if both were.
- **Nodes have parent pointers?** It becomes "intersection of two linked lists": walk up from both.

### Number of islands {medium core}

`grid` is a 2D list of `"1"` (land) and `"0"` (water). Count the islands: groups of land connected horizontally or
vertically.

```text
1 1 0 0 0
1 1 0 0 0
0 0 1 0 0
0 0 0 1 1      → 3 islands
```

#### Hints

1. Scan every cell. Each time you find land you have not seen before, that is a new island.
2. From that cell, flood-fill (BFS or DFS) to mark the whole island as seen.
3. Mark a cell when you add it to the queue, not when you pop it, or cells get queued twice.

#### Solution

Each unseen land cell starts a BFS that marks its whole island. The number of BFS runs is the answer. BFS avoids the
recursion limit on large grids; recursive DFS is fine to mention for small ones.

```python
from collections import deque

def num_islands(grid: list[list[str]]) -> int:
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen: set[tuple[int, int]] = set()
    islands = 0
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] != "1" or (r, c) in seen:
                continue
            islands += 1                         # unseen land: a new island
            seen.add((r, c))
            queue = deque([(r, c)])
            while queue:
                cr, cc = queue.popleft()
                for nr, nc in ((cr + 1, cc), (cr - 1, cc), (cr, cc + 1), (cr, cc - 1)):
                    if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == "1" and (nr, nc) not in seen:
                        seen.add((nr, nc))       # mark when queued
                        queue.append((nr, nc))
    return islands

# Test helper: turn the picture into a grid
def parse(text: str) -> list[list[str]]:
    return [row.split() for row in text.strip().splitlines()]

assert num_islands(parse("""
1 1 1 1 0
1 1 0 1 0
1 1 0 0 0
0 0 0 0 0
""")) == 1
assert num_islands(parse("""
1 1 0 0 0
1 1 0 0 0
0 0 1 0 0
0 0 0 1 1
""")) == 3
assert num_islands([]) == 0
assert num_islands([["0", "0"]]) == 0
assert num_islands([["1", "0"], ["0", "1"]]) == 2      # diagonals do not connect
```

Complexity: O(R·C) time and space.

#### Follow-ups

- **Not allowed extra memory?** Overwrite visited land with `"0"` in the grid itself (ask first: mutating input is
  sometimes not acceptable).
- **Largest island area?** Return the size of each BFS and keep the maximum.
- **Land is added one cell at a time, count after each (Number of Islands II)?** Union-Find with path compression.

### Course schedule {medium}

There are `num_courses` courses labelled `0..n−1`. Each pair `[a, b]` means you must take `b` before `a`. Return
`True` if you can finish every course.

- `2, [[1, 0]]` → `True`
- `2, [[1, 0], [0, 1]]` → `False` (each needs the other first)

#### Hints

1. Model it as a directed graph: an edge `b → a` for each prerequisite. When is finishing impossible?
2. A cycle makes it impossible. Topological sort finds an order exactly when there is no cycle.
3. Kahn's algorithm: repeatedly take a course with no remaining prerequisites (in-degree 0).

#### Solution

Count each course's prerequisites (its in-degree). Start with the courses that have none. Taking a course removes one
prerequisite from each course that depends on it; any course whose count reaches zero becomes available. If you take
all n courses, there is no cycle.

```python
from collections import deque

def can_finish(num_courses: int, prerequisites: list[list[int]]) -> bool:
    graph: list[list[int]] = [[] for _ in range(num_courses)]
    indegree = [0] * num_courses
    for course, prereq in prerequisites:
        graph[prereq].append(course)              # edge: prereq → course
        indegree[course] += 1
    available = deque(c for c in range(num_courses) if indegree[c] == 0)
    taken = 0
    while available:
        course = available.popleft()
        taken += 1
        for nxt in graph[course]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0:
                available.append(nxt)
    return taken == num_courses                   # courses in a cycle never reach in-degree 0

assert can_finish(2, [[1, 0]])
assert not can_finish(2, [[1, 0], [0, 1]])
assert can_finish(3, [])
assert can_finish(4, [[1, 0], [2, 0], [3, 1], [3, 2]])
assert not can_finish(4, [[1, 0], [2, 1], [3, 2], [1, 3]])
assert not can_finish(1, [[0, 0]])                # a course that requires itself
```

Complexity: O(V + E) time and space.

#### Follow-ups

- **Return a valid order (Course Schedule II)?** Append each course to a list as you take it; return the list if it
  has n courses, otherwise `[]`.
- **DFS instead?** Three colours: unvisited, in progress, done. Reaching an "in progress" node means a cycle.
- **Real-world version?** Build pipelines, task schedulers and data workflow DAGs (Airflow) all rely on topological
  order.

### Shortest path in a binary matrix {medium}

In an `n × n` grid of `0` (open) and `1` (blocked), return the length (number of cells) of the shortest clear path
from the top-left to the bottom-right, moving in any of the 8 directions. Return `-1` if there is none.

- `[[0, 1], [1, 0]]` → `2`
- `[[0, 0, 0], [1, 1, 0], [1, 1, 0]]` → `4`

#### Hints

1. Every move costs the same. Which traversal finds the fewest moves first?
2. BFS from the start, storing the path length with each cell. The first time you pop the target, you are done.
3. Check the start and target cells first: if either is blocked, the answer is −1.

#### Solution

BFS explores cells in order of distance, so the first time it reaches the target is along a shortest path. Mark cells
as seen when you queue them.

```python
from collections import deque

def shortest_path_binary_matrix(grid: list[list[int]]) -> int:
    n = len(grid)
    if grid[0][0] == 1 or grid[n - 1][n - 1] == 1:
        return -1
    queue = deque([(0, 0, 1)])                # (row, col, path length in cells)
    seen = {(0, 0)}
    while queue:
        r, c, length = queue.popleft()
        if (r, c) == (n - 1, n - 1):
            return length
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                nr, nc = r + dr, c + dc
                if 0 <= nr < n and 0 <= nc < n and grid[nr][nc] == 0 and (nr, nc) not in seen:
                    seen.add((nr, nc))
                    queue.append((nr, nc, length + 1))
    return -1

assert shortest_path_binary_matrix([[0, 1], [1, 0]]) == 2
assert shortest_path_binary_matrix([[0, 0, 0], [1, 1, 0], [1, 1, 0]]) == 4
assert shortest_path_binary_matrix([[1, 0, 0], [1, 1, 0], [1, 1, 0]]) == -1
assert shortest_path_binary_matrix([[0]]) == 1
assert shortest_path_binary_matrix([[0, 1], [1, 1]]) == -1
```

Complexity: O(n²) time and space: each cell is queued at most once.

#### Follow-ups

- **Cells have different costs?** BFS no longer works; use Dijkstra's algorithm with `heapq` (O(E log V)).
- **Faster in practice on big grids?** A* search: Dijkstra plus a heuristic (here the Chebyshev distance to the target)
  that steers the search.
- **Only 4 directions?** Use the four orthogonal offsets; everything else is unchanged.
