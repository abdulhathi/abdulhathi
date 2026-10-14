import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/tree';
import { distanceK, informTime, maxDepth } from '../traces/tree';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const depth = maxDepth([5, 2, 8, null, 4, 7]);
const distance = distanceK([7, 2, 9, 1, 4, 8, 11, null, null, 3, 6], 2, 2);
const inform = informTime(
  [-1, 0, 0, 1, 1, 2, 2],
  [1, 2, 3, 0, 0, 0, 0],
  0,
  [[150, 0], [70, 80], [230, 80], [30, 160], [110, 160], [190, 160], [270, 160]],
);

const vocab = [1, 2, 3, 4, 5, null, 6];

export default function Tree() {
  return (
    <>
      <TopicIntro
        id="tree"
        time="3–4 hours, plus problems"
        before={['recursion', 'stack', 'queue']}
        learn={[
          'The vocabulary of trees: root, leaf, depth, height, subtree, ancestor',
          'The recursion template that solves most tree problems: what do I return, and what do I need from my children?',
          'Top-down versus bottom-up, and N-ary trees',
          'Trees given as parent arrays or edge lists, and treating a tree as a graph when distance can go upward',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A folder on your computer contains files and other folders, which contain more files and folders. A company has a
          boss, who has managers, who have staff. A web page is an element containing elements. All of these are{' '}
          <b>trees</b>: one starting point (the <b>root</b>), and every other item hangs under exactly one parent.
        </p>
        <p>
          The most useful fact about trees is that they are built from smaller trees. Take any node and everything below it,
          and you have a tree again, called a <b>subtree</b>. So a question about a tree can almost always be answered by asking
          the same question about its subtrees and combining the answers. "How deep is this tree?" becomes "how deep are my
          two subtrees? Take the deeper one and add one for me." That is recursion, and once you trust it, most tree
          problems become a few lines of reasoning that touch each node once: <Cost>O(n)</Cost>.
        </p>
      </div>

      <div className="prose">
        <h2>Vocabulary</h2>
      </div>
      <VizFigure
        parts={[
          { kind: 'tree', label: 'depth: edges from the root', nodes: vocab, tones: { 0: 'active' }, notes: { 0: 'd=0', 1: 'd=1', 2: 'd=1', 3: 'd=2', 4: 'd=2', 6: 'd=2' } },
          { kind: 'tree', label: 'height: edges down to the deepest leaf', nodes: vocab, tones: { 3: 'match', 4: 'match', 6: 'match' }, notes: { 0: 'h=2', 1: 'h=1', 2: 'h=1', 3: 'h=0', 4: 'h=0', 6: 'h=0' } },
        ]}
        caption="Node 1 is the root. Nodes 4, 5 and 6 (green) are leaves: they have no children. Node 2 is the parent of 4 and 5; 2, 4 and 5 together form the subtree rooted at 2."
      />
      <TableWrap>
        <thead>
          <tr>
            <th>Term</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Root</td><td>The only node with no parent. Every tree problem starts here.</td></tr>
          <tr><td>Leaf</td><td>A node with no children. A node with one child is not a leaf.</td></tr>
          <tr><td>Depth of a node</td><td>Edges from the root down to it; the root has depth 0.</td></tr>
          <tr><td>Height of a node</td><td>Edges on the longest path from it down to a leaf; a leaf has height 0. The tree's height is the root's height.</td></tr>
          <tr><td>"Maximum depth" on LeetCode</td><td>Counts <b>nodes</b> on the longest root-to-leaf path, which is the height plus one. Always check which one a problem means.</td></tr>
          <tr><td>Ancestor, descendant</td><td>Any node on the path up to the root is an ancestor; any node below is a descendant.</td></tr>
          <tr><td>Level</td><td>All nodes with the same depth.</td></tr>
          <tr><td>Binary tree, N-ary tree</td><td>At most two children (left and right), or any number of children in a list.</td></tr>
          <tr><td>n nodes, n − 1 edges</td><td>Every node except the root has exactly one edge to its parent. A connected graph with n − 1 edges is a tree.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>The recursion template</h2>
        <p>
          Here is the whole method. For any tree problem, decide what a call on one node <b>returns</b>, and what it{' '}
          <b>needs from its children</b>. Write the answer for the empty tree (the base case). Then trust the recursive calls to
          return correct answers for the children, and combine them. Do not trace the whole recursion in your head; check one
          node and the base case, and the rest follows. Watch it compute the depth of a tree: every node waits for its
          children, then answers.
        </p>
      </div>
      <Walkthrough
        title="Maximum depth: answers flow up from the leaves"
        frames={depth.frames}
        caption={`↑ shows the value each call returns to its parent. The root returns ${depth.depth}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Two questions solve most tree problems: <b>"What does my function return for a subtree?"</b> and <b>"Given my
          children's answers, what is mine?"</b> If the answer for the whole tree needs extra information that the parent does
          not (such as the best path seen anywhere), keep it in a variable outside the recursion and update it at every node.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          On LeetCode a binary tree arrives as its root node. Other problems give the tree as arrays, and the first step is to
          turn them into something you can walk.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Tree node', ts: 'class TreeNode { val; left; right }', ops: 'reach a child O(1); no parent link', use: 'Binary tree problems. The tree is only as reachable as its root.' },
          { name: 'N-ary node', ts: '{ val: number; children: Node[] }', ops: 'loop over children', use: 'Trees where a node may have any number of children.' },
          { name: 'Child lists', ts: 'number[][] (children of node i)', ops: 'build O(n); visit children O(1) each', use: 'Turning a parent or manager array into something you can walk downward.' },
          { name: 'Adjacency list', ts: 'number[][] built from the edge list', ops: 'build O(n)', use: 'Undirected edge lists. Walk with a parent argument so you never go back.' },
          { name: 'Parent map', ts: 'Map<TreeNode, TreeNode | null>', ops: 'O(1) per lookup', use: 'When you need to move upward in a tree that only has child links.' },
          { name: 'Queue', ts: 'array plus a head index', ops: 'enqueue and dequeue O(1)', use: 'Level by level processing and shortest distances (breadth-first search).' },
          { name: 'Stack', ts: 'array with push / pop', ops: 'O(1)', use: 'Depth-first search without recursion, for very deep trees.' },
        ]}
      />

      <div className="prose">
        <h2>How trees are handed to you</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Given as</th>
            <th>Example</th>
            <th>First step</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Root node</td>
            <td>Most binary tree problems</td>
            <td>Recurse from the root.</td>
          </tr>
          <tr>
            <td>Level-order list with nulls</td>
            <td>[5, 2, 8, null, 4, 7] in examples and tests</td>
            <td>LeetCode builds the nodes for you; you only read this format in examples.</td>
          </tr>
          <tr>
            <td>Parent (manager) array</td>
            <td>manager[i] is the boss of i; the root has −1</td>
            <td>Build child lists by adding i to the list of manager[i].</td>
          </tr>
          <tr>
            <td>Edge list</td>
            <td>n − 1 pairs [a, b], no direction</td>
            <td>Build an adjacency list, pick the root, pass the parent while walking.</td>
          </tr>
          <tr>
            <td>Left and right child arrays</td>
            <td>leftChild[i], rightChild[i], −1 for none</td>
            <td>Find the root (the node that is nobody's child), then walk.</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: The recursion template</h2>
        <p>
          Information can flow in two directions. <b>Bottom-up</b> (post-order): a node needs its children's answers first,
          as in depth, balance or pruning. <b>Top-down</b> (pre-order): a node passes something down to its children, such as
          the depth so far or the largest value on the path from the root. Many problems use both: pass a value down, return a
          value up.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th></th>
            <th>Bottom-up</th>
            <th>Top-down</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Information</td>
            <td>Children report to the parent</td>
            <td>Parent tells the children</td>
          </tr>
          <tr>
            <td>Work happens</td>
            <td>After the recursive calls</td>
            <td>Before the recursive calls</td>
          </tr>
          <tr>
            <td>Typical questions</td>
            <td>Height, size, balanced, diameter, "delete if…"</td>
            <td>Depth of each node, path sums, "good nodes" (bigger than every ancestor)</td>
          </tr>
          <tr>
            <td>The function returns</td>
            <td>The subtree's answer</td>
            <td>Often nothing; it updates a shared result</td>
          </tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Tree recursion"
        when="a property of the whole tree, or of every node, can be computed from the same property of the subtrees."
        steps={[
          'Decide what one call returns (a number, a true/false, a new subtree) and what extra information it receives from its parent, if any.',
          'Write the base case: what the empty tree (or a leaf) returns.',
          'Call the function on the left and right subtrees (or on each child), passing down whatever they need.',
          'Combine the children\'s answers with the node\'s own value, update any shared best-so-far, and return.',
        ]}
        why="the recursive calls are smaller trees, and the empty tree is answered directly, so by induction every subtree gets the right answer."
        time="O(n)"
        space="O(h) for the call stack, h = height"
      />

      <div className="prose">
        <h2>Pattern 2: N-ary trees</h2>
        <p>
          Nothing in the template depends on having exactly two children. For an N-ary tree, loop over the children list and
          combine their answers: the maximum for depth, the sum for size, and so on. Traversals follow the same idea: preorder
          visits the node then each child; postorder visits each child then the node; level order uses a queue.
        </p>
      </div>
      <Recipe
        name="N-ary recursion"
        when="each node has a list of children instead of a left and a right."
        steps={[
          'Base case: an empty node (or a node with no children) returns the leaf answer.',
          'Loop over the children, calling the function on each and combining the results (max, sum, all, any).',
          'Combine with the node itself and return.',
        ]}
        why="it is the same induction as for binary trees, over any number of subtrees."
        time="O(n)"
        space="O(h)"
      />

      <div className="prose">
        <h2>Pattern 3: Trees given as edges or parents</h2>
        <p>
          When the tree arrives as arrays, build a structure you can walk first. A manager array becomes child lists, so you can
          go from the boss downward. An undirected edge list becomes an adjacency list; since edges have no direction, carry
          the node you came from and skip it, which is enough to avoid walking back up (a tree has no cycles, so you need no
          visited set). Then apply the same template.
        </p>
      </div>
      <VizFigure
        parts={[inform.figure]}
        caption={`Time Needed to Inform All Employees: each edge costs the manager's inform time, and t is when each employee hears the news. Everyone knows after ${inform.total} minutes, the longest path.`}
      />
      <Recipe
        name="Walk a tree given as arrays"
        when="the tree comes as a parent array, an edge list, or child arrays."
        steps={[
          'Build child lists (from a parent array) or an adjacency list (from an edge list).',
          'Find the root: the node with parent −1, the node that is nobody\'s child, or the node the problem names.',
          'Walk depth first or breadth first from the root, passing the parent so that undirected edges are not walked backwards.',
          'Compute the answer with the recursion template, or with an explicit stack if the tree can be a long chain.',
        ]}
        why="each node is reached through its single parent exactly once, because a tree has no cycles."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Tree as a graph</h2>
        <p>
          Child links only let you move down. Questions like "which nodes are k steps from this node?" or "how long until an
          infection spreads everywhere?" also move <i>up</i>. Fix that by recording every node's parent in one traversal. Now
          the tree is an undirected graph, and a breadth-first search from the starting node finds distances level by level. You
          will use the same search on general graphs in <See id="bfs" />.
        </p>
      </div>
      <Walkthrough
        title="All nodes at distance 2 from node 2"
        frames={distance.frames}
        caption={`Grey nodes are reached, with their distance from node 2. Answer: ${distance.result.join(', ')}.`}
      />
      <Recipe
        name="Parent links plus breadth-first search"
        when="distances between nodes matter, and paths may go through a parent."
        steps={[
          'Traverse the tree once and store each node\'s parent in a map.',
          'Start a queue at the given node and mark it visited.',
          'Process one level per round: from each node, enqueue its left child, right child and parent, if they exist and are not visited.',
          'Stop after k rounds (nodes at distance k), or when the queue empties (the farthest distance).',
        ]}
        why="breadth-first search reaches nodes in order of distance, and the visited set stops it from bouncing between a child and its parent."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Traversal orders at a glance</h2>
        <p>
          You will use these constantly. The next chapter, <See id="binary-tree" />, covers each one in depth, including how to
          do them without recursion.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Order</th>
            <th>Visits</th>
            <th>Typical use</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Preorder</td><td>Node, then left subtree, then right subtree</td><td>Copying or serialising a tree; passing values down</td></tr>
          <tr><td>Inorder</td><td>Left subtree, node, right subtree</td><td>Binary search trees: gives values in sorted order</td></tr>
          <tr><td>Postorder</td><td>Left subtree, right subtree, node</td><td>Anything that needs the children's answers first: heights, deleting</td></tr>
          <tr><td>Level order</td><td>Level 0, then level 1, … each left to right</td><td>Per-level questions, shortest distance from the root</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Balanced Binary Tree</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          At every node, compute the height of the left subtree and of the right subtree from scratch, and compare them. Height
          costs time proportional to the subtree's size, and you do it at every node: on a chain-shaped tree that is{' '}
          <Cost>O(n²)</Cost>.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The height of a subtree is computed again for every ancestor above it. But a node's height only needs its children's
          heights, which were just computed by the recursive calls.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Let one function return the height of a subtree, and, in the same pass, check the balance at that node. If a subtree
          is unbalanced, the whole tree is, so return a signal value such as −1 and let every ancestor pass it straight up.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each node is visited once: <Cost>O(n)</Cost> time, <Cost>O(h)</Cost> stack space. The empty tree is balanced (height
          0). A single node is balanced. A chain of three nodes is not: counting nodes, as the function does, its root's subtrees have heights 2 and 0.
        </p>
      </div>

      <Box kind="tip" label="Deep trees in JavaScript">
        <p>
          Every recursive call uses a frame on the call stack, and a chain-shaped tree with 10⁵ nodes needs 10⁵ frames, which
          can overflow it. Problems that guarantee a balanced tree or at most a few thousand nodes are safe. When a tree can be a
          long chain (edge lists with 10⁵ nodes, for example), use an explicit stack or a queue instead of recursion.
        </p>
      </Box>

      <Pitfalls
        items={[
          <>Confusing depth and height, or counting edges when LeetCode counts nodes. Check the definition in the statement.</>,
          <>Treating a node with one child as a leaf. A leaf has <b>no</b> children (see Minimum Depth).</>,
          <>Recomputing a subtree's answer at every ancestor. Return everything the parent needs in one pass.</>,
          <>Walking an undirected edge list without passing the parent, which walks straight back up and loops.</>,
          <>Forgetting the empty tree: the root itself can be null.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'For the tree [1, 2, 3, 4, null, null, 5, 6], what is the depth of node 6, the height of node 2, and the maximum depth (in nodes) of the tree?',
            hint: 'Node 4 is the left child of 2, node 5 the right child of 3, node 6 the left child of 4.',
            solution: 'Node 6 has depth 3 (path 1, 2, 4, 6). Node 2 has height 2 (2, 4, 6). The maximum depth is 4 nodes.',
          },
          {
            task: 'Write, in words, the recursion that counts the leaves of a binary tree: what does it return for an empty tree, for a leaf, and for any other node?',
            solution: 'Empty tree: 0. Leaf: 1. Any other node: leaves(left) + leaves(right).',
          },
          {
            task: 'A manager array is [2, 2, −1, 2]. Draw the tree. Which node is the root, and what are its child lists?',
            solution: 'Node 2 is the root (manager −1). Its children are 0, 1 and 3; the other nodes have no children.',
          },
          {
            task: 'Why does a walk over an undirected tree need only the parent to avoid going back, while a general graph needs a visited set?',
            solution: 'In a tree the only way back to a visited node is the edge you just came along, because there are no cycles. In a graph a cycle can lead back to a visited node through a different edge.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which traversal must a "delete every leaf with value x, repeatedly" solution use?',
            options: ['Preorder', 'Postorder: decide about a node after its children are processed', 'Level order', 'Any order works'],
            answer: 1,
            why: 'A parent can only become a leaf once its children are gone, so children must be handled first.',
          },
          {
            q: 'For a root that has only a left child (a leaf), what is the minimum depth?',
            options: ['1', '2', '0', 'It depends on the values'],
            answer: 1,
            why: 'The root is not a leaf because it has a child. The only leaf is at depth 2 (counting nodes).',
          },
          {
            q: 'You need all nodes 3 steps away from a given node in a binary tree. What do you add first?',
            options: ['A sorted list of values', 'A map from each node to its parent', 'A heap', 'Nothing; recursion from the root is enough'],
            answer: 1,
            why: 'Paths may go up through parents. With parent links the tree is an undirected graph and breadth-first search finds distances.',
          },
          {
            q: 'A tree has 50 nodes. How many edges does it have?',
            options: ['50', '49', '100', 'It depends on the shape'],
            answer: 1,
            why: 'Every node except the root has exactly one edge to its parent.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          The first group is about the template itself: for each one, say the two sentences ("this function returns…", "a node
          combines its children by…") before writing anything. Then practise trees given as arrays, and finally trees treated
          as graphs.
        </p>
      </div>
      <ProblemSet id="tree" />

      <Recap>
        <ul>
          <li>A tree is a root plus subtrees, so most questions are answered by asking the same question of the subtrees and combining.</li>
          <li>Decide what a call returns and what it needs from its children; write the empty-tree case; trust the recursion.</li>
          <li>Bottom-up returns answers to the parent; top-down passes information to the children; many problems do both.</li>
          <li>Trees given as arrays need child lists or an adjacency list first; pass the parent when edges are undirected.</li>
          <li>When paths can go upward, add parent links and search the tree like a graph.</li>
        </ul>
      </Recap>
    </>
  );
}
