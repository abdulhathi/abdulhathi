import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/bst';
import { deleteKey, validateBounds } from '../traces/bst';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const removal = deleteKey([8, 3, 10, 1, 6, null, 14, null, null, 4, 7], 3);
const validation = validateBounds([5, 4, 6, null, null, 3, 7]);

export default function Bst() {
  return (
    <>
      <TopicIntro
        id="bst"
        time="3–4 hours, plus problems"
        before={['binary-tree', 'binary-search']}
        learn={[
          'The ordering rule, and why search, insert and delete follow a single path of length h',
          'Deleting a node with two children by copying in its successor',
          'Why inorder gives sorted order, and the problems that become one traversal because of it',
          'Validating with ranges, building balanced trees, and iterating with a stack',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A <b>binary search tree</b> (BST) is a binary tree with one rule: for every node, all values in its left subtree are
          smaller, and all values in its right subtree are larger. That rule turns the tree into a decision maker. Looking for
          a value? Compare it with the root: if it is smaller it can only be on the left, so the whole right subtree is ruled
          out with one comparison. It is binary search, arranged as a tree.
        </p>
        <p>
          Search, insert and delete all follow one path from the root, so they cost <Cost>O(h)</Cost>, where h is the height.
          In a balanced tree h is about log₂ n, so a tree with a million values needs about 20 comparisons. But the rule does
          not keep the tree balanced by itself: inserting values in sorted order builds a chain, and then h = n.
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'tree', label: 'balanced: height 2, about log n', nodes: [4, 2, 6, 1, 3, 5, 7], tones: { 0: 'match' } },
          { kind: 'tree', label: 'same values inserted in sorted order: a chain', nodes: [1, null, 2, null, 3, null, 4, null, 5, null, 6, null, 7], tones: { 0: 'bad' } },
        ]}
        caption="Both are valid binary search trees holding 1 to 7. Searching the left one takes at most 3 comparisons; the right one can take 7. Library ordered sets keep themselves balanced; on LeetCode you usually get whatever tree the test builds."
      />

      <div className="prose">
        <p>
          Deleting is the one operation that needs thought. A node with no children can simply go; a node with one child is
          replaced by that child. A node with two children is replaced by its <b>successor</b>, the smallest value in its right
          subtree, which is larger than everything on the left and smaller than everything else on the right.
        </p>
      </div>
      <Walkthrough
        title="Delete 3 from a binary search tree"
        frames={removal.frames}
        caption={`3 has two children, so its successor (4) takes its place. Result in level order: ${removal.result.map((v) => (v === null ? 'null' : v)).join(', ')}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Two facts power every BST problem. <b>Going down:</b> one comparison tells you which side can contain a value, so you
          follow one path. <b>Going in order:</b> an inorder traversal visits the values sorted from smallest to largest. When a
          problem says "binary search tree", ask which of the two it wants you to use.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          TypeScript has no built-in sorted set or self-balancing tree. On LeetCode the tree is given to you; when you need a
          sorted collection of your own, see <See id="ordered-set" /> for the options.
        </p>
      </div>
      <Structures
        items={[
          { name: 'BST node', ts: 'class TreeNode { val; left; right }', ops: 'search, insert, delete O(h)', use: 'The input. h is log n when balanced, n when the tree is a chain.' },
          { name: 'Stack', ts: 'array with push / pop', ops: 'O(1)', use: 'Iterative inorder, BST iterators, stopping early at the k-th value.' },
          { name: 'Sorted array', ts: 'number[]', ops: 'binary search O(log n), insert O(n)', use: 'The flattened form of a BST (from inorder); the source for building a balanced tree.' },
          { name: 'Range bounds', ts: 'two numbers passed down, starting at −Infinity and Infinity', ops: 'O(1)', use: 'Validating a BST and building one from preorder.' },
          { name: 'Small record returned up', ts: '{ isBST, min, max, sum }', ops: 'O(1) per node', use: 'Bottom-up questions about which subtrees are BSTs.' },
        ]}
      />
      <TableWrap>
        <thead>
          <tr>
            <th>Operation</th>
            <th>Balanced BST</th>
            <th>Chain-shaped BST</th>
            <th>Sorted array</th>
            <th>Hash set</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Search</td><td>O(log n)</td><td>O(n)</td><td>O(log n)</td><td>O(1) average</td></tr>
          <tr><td>Insert or delete</td><td>O(log n)</td><td>O(n)</td><td>O(n)</td><td>O(1) average</td></tr>
          <tr><td>Smallest, largest, next larger</td><td>O(log n)</td><td>O(n)</td><td>O(1) or O(log n)</td><td>O(n)</td></tr>
          <tr><td>All values in order</td><td>O(n)</td><td>O(n)</td><td>O(n)</td><td>O(n log n): must sort</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Walk down by comparing</h2>
        <p>
          Search, insert, delete, the lowest common ancestor, and range sums all walk downward, choosing a side at each node.
          For the lowest common ancestor of p and q, the answer is the first node whose value lies between them: above it, both
          are on the same side; at it, they split. For range questions, a node below the range lets you skip its whole left
          subtree.
        </p>
      </div>
      <Recipe
        name="Walk down a BST"
        when="you search for a value, insert one, delete one, or look for where two values split."
        steps={[
          'Start at the root.',
          'Compare the target with the node. Equal: you are there. Smaller: go left. Larger: go right.',
          'For insert, the empty spot where you fall off the tree is where the new leaf goes.',
          'For delete: no child, remove; one child, replace by it; two children, copy in the successor and delete the successor from the right subtree.',
        ]}
        why="the ordering guarantees that the other side cannot contain the target, so you never need to look there."
        time="O(h)"
        space="O(1) iteratively, O(h) recursively"
      />

      <div className="prose">
        <h2>Pattern 2: Inorder is sorted</h2>
        <p>
          Inorder visits the left subtree (smaller values), then the node, then the right subtree (larger values), so it lists a
          BST's values in increasing order. That one fact turns many problems into a single pass that remembers the previous
          value: the k-th smallest (stop after k visits), the closest pair (smallest gap between neighbours), the mode (longest
          run of equal values), and recovering two swapped nodes (the places where the order drops). Reverse inorder (right,
          node, left) visits values from largest to smallest.
        </p>
      </div>
      <Recipe
        name="Inorder with a previous value"
        when="the question is about sorted order: ranks, gaps, duplicates, or values that are out of order."
        steps={[
          'Traverse in inorder (recursively, or with a stack if you want to stop early).',
          'Keep the previously visited value (or node).',
          'At each node, compare it with the previous one and update the answer (gap, run length, drop).',
          'Set previous to the current node and continue.',
        ]}
        why="consecutive values in inorder are consecutive in sorted order, so neighbour comparisons see every sorted pair."
        time="O(n), or O(h + k) when stopping at the k-th value"
        space="O(h)"
      />

      <div className="prose">
        <h2>Pattern 3: Ranges from ancestors</h2>
        <p>
          The most common BST bug: checking each node only against its children. The rule is about whole subtrees, so a node
          must also respect its grandparents and every ancestor above. Pass down a range instead: the root may hold anything;
          going left, the upper limit becomes the parent's value; going right, the lower limit does. A node outside its range
          breaks the tree.
        </p>
      </div>
      <Walkthrough
        title="Validate with ranges: 3 passes its parent but fails its grandparent"
        frames={validation.frames}
        caption={`Notes show each node's allowed range. Valid BST: ${validation.valid ? 'yes' : 'no'}.`}
      />
      <Recipe
        name="Pass the allowed range down"
        when="you must check or use the BST property for every node: validating, or rebuilding a BST from preorder."
        steps={[
          'Start at the root with the range (−∞, +∞).',
          'If the node\'s value is not strictly inside its range, the tree is not a BST.',
          'Visit the left child with (low, value) and the right child with (value, high).',
          'For bottom-up questions, return (is it a BST, min, max) from each subtree instead, and combine at the parent.',
        ]}
        why="a value is in the right place exactly when it satisfies every ancestor's side, and the range is the intersection of all those conditions."
        time="O(n)"
        space="O(h)"
      />

      <div className="prose">
        <h2>Pattern 4: Build balanced trees</h2>
        <p>
          From sorted data, make the middle value the root: half the values go left and half go right. Do the same for each half
          and the tree's height stays about log₂ n. To rebalance an existing BST, flatten it with inorder and rebuild. For a
          sorted linked list, build in inorder order by size, taking list nodes one at a time, which avoids searching for the
          middle.
        </p>
      </div>
      <Recipe
        name="Middle as the root"
        when="you must turn sorted values into a height-balanced BST."
        steps={[
          'build(lo, hi): if the range is empty, return empty.',
          'Make the middle value the root.',
          'Build its left subtree from lo to mid − 1 and its right subtree from mid + 1 to hi.',
          'Return the root.',
        ]}
        why="each split halves the range, so the depth of recursion, and the tree's height, is about log₂ n."
        time="O(n)"
        space="O(log n) for the recursion"
      />

      <div className="prose">
        <h2>Pattern 5: BST iterators</h2>
        <p>
          The iterative inorder from <See id="binary-tree" /> can be paused. Its stack holds the left spine still to be visited.
          A next() call pops one node, pushes the left spine of that node's right child, and returns the value. Only O(h) nodes
          are stored at any time, and each node is pushed exactly once over the whole iteration, so each call is O(1) on average.
          Two iterators side by side merge two BSTs in sorted order.
        </p>
      </div>
      <Recipe
        name="Stack of the left spine"
        when="values must be produced one at a time in sorted order, with little memory."
        steps={[
          'To start, push the root and keep going left, pushing every node on the way.',
          'next(): pop the top node. Then push its right child and that child\'s whole left spine.',
          'Return the popped value. hasNext() is "the stack is not empty".',
        ]}
        why="the stack always holds the path to the next smallest value that has not been returned yet."
        time="O(1) amortised per call"
        space="O(h)"
      />

      <div className="prose">
        <h2>Worked example: Validate Binary Search Tree</h2>
        <Step n={1}>The tempting check</Step>
        <p>
          Check that every node's left child is smaller and its right child is larger. It runs in <Cost>O(n)</Cost> and passes
          the small examples, but it is wrong: in [5, 4, 6, null, null, 3, 7], the node 3 is smaller than its parent 6, so the
          local check passes, yet 3 sits in the right subtree of 5, where every value must be larger than 5.
        </p>
        <Step n={2}>Find what is missing</Step>
        <p>
          The rule constrains a node by every ancestor, not only by its parent. Each step down adds one condition: going left adds
          "smaller than this ancestor", going right adds "larger than this ancestor".
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          All those conditions together form an interval: the largest lower bound and the smallest upper bound seen on the path.
          Pass that interval down, tightening it at each step, and check each node against it once.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One visit per node: <Cost>O(n)</Cost>. Duplicates are not allowed, so use strict comparisons. Node values reach the
          32-bit limits, so start the interval at −∞ and +∞ rather than at a fixed number. An inorder traversal that checks the
          values are strictly increasing is an equally good solution.
        </p>
      </div>

      <div className="prose">
        <h2>BST, hash map, sorted array or heap?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>You need</th>
            <th>Best choice</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Only "is x present?" and insert or delete</td><td>Hash set or map (<See id="hash-table" />): O(1) average</td></tr>
          <tr><td>Data that does not change, queried by order</td><td>Sorted array plus binary search (<See id="binary-search" />)</td></tr>
          <tr><td>Only the smallest or largest, repeatedly</td><td>Heap (<See id="heap" />)</td></tr>
          <tr><td>Insert, delete, and "next larger than x" or "k-th smallest" while data changes</td><td>Balanced BST or ordered set (<See id="ordered-set" />)</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Validating by comparing nodes only with their <b>children</b>. Pass the range from all ancestors.</>,
          <>Assuming O(log n) when the tree can be a chain. A BST is only as fast as it is balanced.</>,
          <>Forgetting that deleting or trimming can change the <b>root</b>; always return the new root.</>,
          <>Using plain inorder when you need largest-first order. Reverse it: right, node, left.</>,
          <>Starting range bounds at fixed numbers such as the 32-bit minimum when values can equal them. Use infinities.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Insert 5, 2, 8, 1, 9, 3 into an empty BST in that order. Draw the tree and write its inorder traversal.',
            solution: 'Root 5; 2 left of 5; 8 right of 5; 1 left of 2; 9 right of 8; 3 right of 2. Inorder: 1, 2, 3, 5, 8, 9.',
          },
          {
            task: 'In the tree [8, 3, 10, 1, 6, null, 14, null, null, 4, 7], what are the successor of 3 and the lowest common ancestor of 4 and 7?',
            solution: 'The successor of 3 is 4, the smallest value in its right subtree. The lowest common ancestor of 4 and 7 is 6, the first node between them on the way down.',
          },
          {
            task: 'Delete 8 (the root) from the tree in the previous exercise. Which value replaces it if you use the successor, and which if you use the predecessor? Why could 6 not replace it?',
            solution: 'Successor: 10, the smallest value in the right subtree (it has no left child). Predecessor: 7, the largest value in the left subtree. Either keeps the order. 6 cannot, because 7 would then sit in the left subtree of a smaller value.',
          },
          {
            task: 'An inorder traversal of a BST with two swapped values gives 1, 6, 3, 4, 5, 2, 7. Which values were swapped?',
            solution: 'The drops are 6 > 3 and 5 > 2. The first value of the first drop is 6 and the second value of the last drop is 2: swap 6 and 2.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What does an inorder traversal of a BST produce?',
            options: ['The values level by level', 'The values in increasing order', 'The values in insertion order', 'The root first'],
            answer: 1,
            why: 'Left subtree (smaller), node, right subtree (larger), applied at every node.',
          },
          {
            q: 'When deleting a node with two children, which value can safely take its place?',
            options: ['Its left child', 'Its successor: the smallest value in its right subtree', 'Any leaf', 'Its parent'],
            answer: 1,
            why: 'The successor is larger than everything on the left and smaller than everything else on the right, so the order is preserved.',
          },
          {
            q: 'Why is searching a BST sometimes O(n)?',
            options: ['Because of hash collisions', 'Because a BST built from sorted input is a chain, so its height is n', 'Because comparisons are slow', 'It is never O(n)'],
            answer: 1,
            why: 'The cost is O(h). Without balancing, h can be as large as n.',
          },
          {
            q: 'For LCA in a BST, p = 4 and q = 7. You are at node 6. What next?',
            options: ['Go left', 'Go right', 'Return 6: the values are on different sides', 'Check both subtrees'],
            answer: 2,
            why: '4 < 6 < 7, so p is on the left and q on the right: 6 is where their paths split.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, first decide: does it walk down by comparing, or does it use sorted order through inorder? Then check
          whether the tree's root can change, and return it.
        </p>
      </div>
      <ProblemSet id="bst" />

      <Recap>
        <ul>
          <li>Left subtree smaller, right subtree larger, at every node: one comparison picks a side, so search, insert and delete cost O(h).</li>
          <li>h is log n only when the tree is balanced; sorted insertions make a chain.</li>
          <li>Delete a two-child node by copying in its successor and deleting that instead.</li>
          <li>Inorder lists the values sorted, which turns ranks, gaps, modes and swapped nodes into one pass.</li>
          <li>Validate with ranges from all ancestors; build balanced trees from the middle; iterate with a stack of the left spine.</li>
        </ul>
      </Recap>
    </>
  );
}
