import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/binary-tree';
import { diameter, iterativeInorder, levelOrderTrace } from '../traces/binary-tree';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const inorder = iterativeInorder([4, 2, 6, 1, 3, 5, 7]);
const levels = levelOrderTrace([6, 4, 9, 2, null, 7, 11]);
const diam = diameter([1, 2, null, 3, 4, 5, null, null, 6]);

export default function BinaryTree() {
  return (
    <>
      <TopicIntro
        id="binary-tree"
        time="5–6 hours, plus problems"
        before={['tree', 'recursion', 'stack', 'queue']}
        learn={[
          'All four traversals, recursively and with an explicit stack or queue',
          'Level-by-level processing and the "save the queue size" trick',
          'Top-down (pass state down) versus bottom-up (return state up), and the shared-best trick for paths',
          'Rebuilding trees from traversals, serialising, and positions as coordinates',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A binary tree is a tree where every node has at most two children, called <b>left</b> and <b>right</b>. It is the
          tree you will meet most often. Almost every binary tree problem is one of a handful of moves: visit the nodes in a
          particular <b>order</b>; go <b>level by level</b>; pass information <b>down</b> from a node to its children; or
          return information <b>up</b> from the children to their parent. Learn those moves well and you can combine them for
          almost anything.
        </p>
        <p>
          Recursion makes the depth-first orders short, but you should also be able to run them with an explicit stack. That
          is a common interview follow-up, and it is how you avoid overflowing the call stack on a very deep tree. Watch the
          stack replace the recursion in an inorder traversal: it remembers the nodes whose left side is still being explored.
        </p>
      </div>

      <Walkthrough
        title="Inorder traversal with an explicit stack"
        frames={inorder.frames}
        caption={`Amber nodes are on the stack, grey nodes are already output. This tree is a binary search tree, so inorder lists the values sorted: ${inorder.order.join(', ')}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Before writing anything, decide which way information flows. <b>Down</b>: does a node need something from its
          ancestors (a running sum, the largest value so far)? Pass it as an argument. <b>Up</b>: does it need something from
          its descendants (heights, whether p was found)? Return it. When the final answer is not what the parent needs (the
          best path anywhere), keep a <b>shared best</b> outside the recursion and update it at every node.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Tree node', ts: 'class TreeNode { val; left; right }', ops: 'child access O(1)', use: 'The input. LeetCode gives you the root.' },
          { name: 'Stack', ts: 'array with push / pop', ops: 'O(1)', use: 'Iterative preorder, inorder and postorder; any depth-first search without recursion.' },
          { name: 'Queue', ts: 'array plus a head index', ops: 'O(1) enqueue and dequeue', use: 'Level order. Save the queue size at the start of each round.' },
          { name: 'Hash map', ts: 'Map<number, number>', ops: 'O(1) average', use: 'Value to inorder index when rebuilding trees; prefix-sum counts on a path.' },
          { name: 'Path array', ts: 'number[] shared by the recursion', ops: 'push and pop O(1)', use: 'Recording the current root-to-node path; copy it when saving an answer.' },
          { name: 'Shared best', ts: 'a variable outside the recursive function', ops: 'O(1)', use: 'Answers that are not what the parent needs: diameter, maximum path sum.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Depth-first traversals</h2>
        <p>
          The three depth-first orders differ only in when the node itself is recorded: before its subtrees (preorder),
          between them (inorder), or after them (postorder). Recursively, each is three lines of reasoning. Iteratively, each
          has its own small trick:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Order</th>
            <th>Recursive</th>
            <th>With a stack</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Preorder</td>
            <td>record, left, right</td>
            <td>Pop and record a node; push its right child, then its left child.</td>
          </tr>
          <tr>
            <td>Inorder</td>
            <td>left, record, right</td>
            <td>Push nodes while going left; when you cannot, pop, record, and move to the right child.</td>
          </tr>
          <tr>
            <td>Postorder</td>
            <td>left, right, record</td>
            <td>Record "node, right, left" (push left, then right), then reverse the list.</td>
          </tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Iterative inorder"
        when="you need inorder without recursion, or want to stop early (the k-th smallest in a BST)."
        steps={[
          'Set current to the root and start with an empty stack.',
          'While current exists or the stack is not empty: push current and move left, repeatedly, until current is empty.',
          'Pop a node and record it (this is where an inorder visit happens).',
          'Set current to that node\'s right child and repeat.',
        ]}
        why="a node is popped only after everything to its left has been pushed and popped, which is exactly inorder."
        time="O(n)"
        space="O(h)"
      />

      <div className="prose">
        <h2>Pattern 2: Level order</h2>
        <p>
          Breadth-first search visits nodes level by level using a queue. The one trick that makes level questions easy: at the
          start of each round, <b>save the queue's size</b>. Exactly that many nodes belong to the current level; their children,
          added to the back while you work, form the next level.
        </p>
      </div>
      <Walkthrough
        title="Level order: one round per level"
        frames={levels.frames}
        caption={`Amber nodes are waiting in the queue. Levels: ${levels.levels.map((l) => `[${l.join(', ')}]`).join(' ')}.`}
      />
      <Recipe
        name="Level-by-level breadth-first search"
        when="the question is about levels: averages, rightmost nodes, zigzag order, widths, the first leaf."
        steps={[
          'Put the root in a queue (if the tree is not empty).',
          'While the queue is not empty, save its current size.',
          'Remove exactly that many nodes, handling each one (sum it, record it, remember the last one) and enqueuing its children.',
          'The nodes you just removed are one complete level; finish that level\'s work, then start the next round.',
        ]}
        why="every node of level d is enqueued before any node of level d + 1, so a round that takes exactly the saved size never mixes levels."
        time="O(n)"
        space="O(w), the widest level (up to n/2)"
      />

      <div className="prose">
        <h2>Pattern 3: Top-down</h2>
        <p>
          Some properties depend on the path from the root: "is this node bigger than everything above it?", "does the sum from
          the root to this leaf equal the target?". Each node receives what it needs as an argument, updates it with its own
          value, and passes the new version to its children. For paths that may start anywhere (Path Sum III), combine this
          with prefix sums: carry a map of the prefix sums seen on the current path, exactly as in{' '}
          <See id="prefix-sum" />, and undo your entry when you leave the node.
        </p>
      </div>
      <Recipe
        name="Pass state down"
        when="a node's answer depends on its ancestors: running sums, the maximum so far, the depth."
        steps={[
          'Choose the state a node receives from its parent (for example the running sum or the largest value so far).',
          'At each node, update the state with the node\'s own value and check the condition (count the node, or test a leaf).',
          'Visit each child with the updated state.',
          'If the state is shared (a path list or a map), undo your change before returning.',
        ]}
        why="the state at a node summarises exactly the path from the root to it, which is everything the condition depends on."
        time="O(n)"
        space="O(h)"
      />

      <div className="prose">
        <h2>Pattern 4: Bottom-up</h2>
        <p>
          The diameter is the longest path between any two nodes. Every path has exactly one highest node, where it bends:
          it goes down to the left and down to the right. So at each node, the longest path bending there is left height +
          right height. But the node's parent does not want that number; it wants the node's <b>height</b>, because a parent
          can only extend one branch. So each call does two things: update a shared best with the bending path, and return the
          height. Binary Tree Maximum Path Sum is the same pattern with sums instead of heights.
        </p>
      </div>
      <Walkthrough
        title="Diameter: return the height, record the bend"
        frames={diam.frames}
        caption={`Notes show the height each node returns (counted in nodes). The diameter of this tree is ${diam.best} edges: from 5 up to 2 and down to 6, a path that does not pass through the root.`}
      />
      <Recipe
        name="Return one branch, record the bend"
        when="the answer is the best path anywhere in the tree (longest, largest sum, longest same-value path)."
        steps={[
          'Decide what a parent can use from a child: usually the best single downward branch from the child.',
          'At each node, get both children\'s values (replacing harmful negative ones with 0 if needed).',
          'Update the shared best with the path that bends here: node plus both branches.',
          'Return the node plus the better single branch.',
        ]}
        why="every path is counted at its highest node, and every branch a parent can extend is returned to it."
        time="O(n)"
        space="O(h)"
      />
      <div className="prose">
        <p>
          The lowest common ancestor uses the same direction of flow: each call returns whether it found p or q. The first node
          where both sides report a find is where the paths from the root to p and to q split, so it is the answer.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 5: Build and serialise</h2>
        <p>
          A single traversal does not determine a tree's shape, but two of them do (when the values are distinct): preorder or
          postorder tells you which node is the root, and inorder tells you how many nodes go to its left. Recursing on index
          ranges, with a map from value to inorder position, rebuilds the tree in <Cost>O(n)</Cost>.
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'array', label: 'preorder', items: [5, 2, 8, 6, 9], tones: { 0: 'match', 1: 'info', 2: 'warn', 3: 'warn', 4: 'warn' } },
          { kind: 'array', label: 'inorder', items: [2, 5, 6, 8, 9], tones: { 1: 'match', 0: 'info', 2: 'warn', 3: 'warn', 4: 'warn' } },
          { kind: 'tree', label: 'rebuilt tree', nodes: [5, 2, 8, null, null, 6, 9], tones: { 0: 'match', 1: 'info', 2: 'warn', 5: 'warn', 6: 'warn' } },
        ]}
        caption="Preorder starts with the root, 5 (green). In inorder, one value (2, blue) lies left of 5, so the left subtree has one node; the three amber values form the right subtree. Repeat inside each part."
      />
      <div className="prose">
        <p>
          To <b>serialise</b> (turn a tree into a string you can rebuild exactly), record the empty children as well: a
          preorder traversal with a marker such as "#" for every missing child determines the tree uniquely, and reading the
          tokens back in the same order rebuilds it.
        </p>
      </div>
      <Recipe
        name="Rebuild from preorder and inorder"
        when="you are given two traversals of a tree with distinct values and must reconstruct it."
        steps={[
          'Build a map from each value to its position in inorder.',
          'Keep a pointer into preorder; the value it points to is the root of the subtree being built.',
          'For an inorder range lo to hi: take the root, find its inorder position m, build the left subtree from lo to m − 1, then the right from m + 1 to hi.',
          'An empty range (lo > hi) is an empty subtree.',
        ]}
        why="preorder lists a root before its whole left subtree and then its whole right subtree, and inorder separates those two subtrees around the root."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 6: Coordinates</h2>
        <p>
          Sometimes it helps to give each node numbers. Heap positions (children of p at 2p and 2p + 1) measure the width of a
          level. Row and column coordinates (children one row down, one column left or right) define vertical order. Once the
          numbers are attached, the problem becomes sorting or arithmetic. Watch for overflow: heap positions double every level,
          so renumber each level from 0.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Binary Tree Maximum Path Sum</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every pair of nodes as the two ends, find the path between them, and add it up. There are about n²/2 pairs and
          each path costs up to n: <Cost>O(n³)</Cost>.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Every path has one highest node where it bends. If you fix that node, the best path through it is the node plus the
          best downward branch on the left plus the best downward branch on the right. Those best branches can be computed for
          every node in one bottom-up pass.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Let gain(node) be the best sum of a path that starts at the node and goes straight down. It is the node's value plus
          the better of the two children's gains, but a negative gain should be skipped (taking nothing is better), so use
          max(0, gain). At each node, the best path that bends there is value + left gain + right gain: update the answer with
          it. Return only value + the better gain, because a parent can extend just one branch.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One visit per node: <Cost>O(n)</Cost>. If every value is negative, the answer is the largest single value, so the
          shared best must start at −∞, not at 0. A single node is a valid path on its own.
        </p>
      </div>

      <div className="prose">
        <h2>Depth first or breadth first?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th></th>
            <th>Depth-first (recursion or stack)</th>
            <th>Breadth-first (queue)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Natural for</td>
            <td>Paths from the root, subtree properties, building and serialising</td>
            <td>Levels, the nearest node, the first leaf, widths</td>
          </tr>
          <tr>
            <td>Extra memory</td>
            <td>O(h): small for balanced trees, n for a chain</td>
            <td>O(w): the widest level, up to n/2 in a full tree</td>
          </tr>
          <tr>
            <td>Stops early when</td>
            <td>A condition holds deep in one branch</td>
            <td>The shallowest match is found (Minimum Depth)</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Mixing levels in breadth-first search by reading the queue length while children are being added. <b>Save the size first.</b></>,
          <>Returning the wrong thing upward: the parent needs one branch, the answer needs the bend. Keep a shared best.</>,
          <>Saving the shared path array itself instead of a copy, so all saved answers change later.</>,
          <>Starting a maximum at 0 when all values can be negative.</>,
          <>Slicing arrays in tree-building recursions, which turns O(n) into O(n²). Pass index ranges.</>,
          <>Forgetting the empty tree: many problems allow the root to be null.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Write down the preorder, inorder, postorder and level order of the tree [1, 2, 3, 4, 5, null, 6].',
            solution: 'Preorder 1, 2, 4, 5, 3, 6. Inorder 4, 2, 5, 1, 3, 6. Postorder 4, 5, 2, 6, 3, 1. Level order [1], [2, 3], [4, 5, 6].',
          },
          {
            task: 'Run the iterative inorder by hand on [2, 1, 3]. List the stack after each push and pop.',
            solution: 'Push 2, push 1 (current becomes empty). Pop 1, output 1, go right (empty). Pop 2, output 2, go right to 3. Push 3, pop 3, output 3. Output: 1, 2, 3.',
          },
          {
            task: 'Rebuild the tree from preorder [1, 2, 4, 3] and inorder [4, 2, 1, 3].',
            hint: 'The root is 1; in inorder, two values lie to its left.',
            solution: 'Root 1. Left part of inorder: [4, 2], so the left subtree has root 2 (next in preorder) with 4 as its left child. Right part: [3]. Level order: [1, 2, 3, 4].',
          },
          {
            task: 'In the maximum path sum recursion, a node with value −3 gets gains 5 (left) and 4 (right). What does it return, and what bending path does it consider?',
            solution: 'It returns −3 + 5 = 2. It considers −3 + 5 + 4 = 6 for the shared best.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which traversal of a binary search tree gives the values in sorted order?',
            options: ['Preorder', 'Inorder', 'Postorder', 'Level order'],
            answer: 1,
            why: 'Inorder visits the left subtree (smaller values), then the node, then the right subtree (larger values).',
          },
          {
            q: 'In iterative preorder, why do you push the right child before the left child?',
            options: ['To save memory', 'Because a stack returns the last item pushed first, so the left child is processed first', 'It does not matter', 'Because right children are larger'],
            answer: 1,
            why: 'Preorder must visit the left subtree before the right. A stack is last in, first out.',
          },
          {
            q: 'For the diameter, what does each recursive call return to its parent?',
            options: ['The diameter of its subtree', 'Its height', 'The number of nodes below it', 'Whether it is balanced'],
            answer: 1,
            why: 'A parent can only extend one downward branch, so it needs the height. The bending path is recorded in a shared best.',
          },
          {
            q: 'Why does Path Sum III remove the current prefix sum from the map when leaving a node?',
            options: ['To save memory', 'So that paths are only counted within one root-to-node path, never across branches', 'Because maps cannot hold duplicates', 'It is optional'],
            answer: 1,
            why: 'The map must describe the path from the root to the current node only. Leaving an entry behind would let a later branch match a prefix from a different branch.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Work through the traversals first, recursively and iteratively, until you can write each from memory. Then do the
          level problems, then top-down, then bottom-up. For every problem, say which way information flows before you start.
        </p>
      </div>
      <ProblemSet id="binary-tree" />

      <Recap>
        <ul>
          <li>Four traversals: preorder, inorder, postorder (stack or recursion) and level order (queue, saving the size each round).</li>
          <li>Top-down passes state to the children; bottom-up returns state to the parent; a shared best holds answers the parent does not need.</li>
          <li>Paths anywhere in the tree bend at one highest node: return one branch, record the bend.</li>
          <li>Preorder or postorder gives the root, inorder gives the split; null markers let one traversal describe the shape.</li>
          <li>Number nodes (heap positions, rows and columns) when the question is really about positions, and renumber to avoid overflow.</li>
        </ul>
      </Recap>
    </>
  );
}
