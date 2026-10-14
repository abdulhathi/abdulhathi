import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dp-tree';
import { robTree, sumOfDistances } from '../traces/dp-tree';
import { Walkthrough } from '../viz/Walkthrough';

const rob = robTree([4, 1, 6, 2, 3, null, 5]);
const layout = [
  { id: '0', x: 150, y: 0 },
  { id: '1', x: 150, y: 85 },
  { id: '2', x: 40, y: 170 },
  { id: '3', x: 260, y: 170 },
  { id: '4', x: 190, y: 255 },
  { id: '5', x: 330, y: 255 },
];
const distances = sumOfDistances(6, [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5]], layout);

export default function DpTree() {
  return (
    <>
      <TopicIntro
        id="dp-tree"
        time="4–5 hours, plus problems"
        before={['binary-tree', 'dfs', 'dp']}
        learn={[
          'Why trees are perfect for DP: every subtree is an independent subproblem',
          'What to return from a node and what to record globally (the "arm versus path" split)',
          'Returning several values per node when a choice constrains the children',
          'Rerooting: an answer for every node as the root, in two passes instead of n',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A tree has no cycles, so once you pick a root every node's subtree is separate from its siblings' subtrees. That is
          exactly what DP needs: <b>independent subproblems</b>, here one per node. Solve the children first (post-order), and
          the parent builds its answer from theirs.
        </p>
        <p>
          Think of a company reporting its numbers. Each team lead reports a summary of their team to their manager, who adds
          their own figures and reports upwards. Nobody needs the details of other teams, only the summaries from their direct
          reports. The art is choosing <b>what the summary contains</b>.
        </p>
        <p>
          The brute force tries every choice at every node (rob or skip, camera or not), which is 2ⁿ. A tree DP visits each node
          once and does constant work per child, so it runs in <Cost>O(n)</Cost>. Watch House Robber III: every node reports two
          numbers, the best total if it is robbed and if it is skipped.
        </p>
      </div>

      <Walkthrough
        title="House Robber III: two numbers per node, computed bottom-up"
        frames={rob.frames}
        caption={`Under each node: best if robbed / best if skipped. The answer is ${rob.answer}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          For every tree DP, decide two things: <b>what a node returns to its parent</b> (only what the parent can use, such as
          a height or a single downward arm) and <b>what it records globally</b> (answers that do not continue upwards, such
          as a path that bends at this node). Mixing the two up is the most common tree DP bug.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to tree DP. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Binary tree node', ts: '{ val, left, right } (TreeNode)', ops: 'child access O(1)', use: 'LeetCode binary tree problems. Recursion on left and right gives post-order for free.' },
          { name: 'Adjacency list', ts: 'number[][]', ops: 'neighbours O(degree)', use: 'Trees given as edge lists. Skip the parent when you visit neighbours.' },
          { name: 'Per-node arrays', ts: 'number[] (size, below, answer…)', ops: 'O(1)', use: 'Store each node\'s summary by index, especially for rerooting.' },
          { name: 'Explicit stack or order list', ts: 'number[] used as a stack', ops: 'push / pop O(1)', use: 'Iterative DFS for trees with 10⁵ nodes, where recursion may overflow the call stack.' },
          { name: 'Tuple return values', ts: '[number, number] or a small object', ops: 'O(1)', use: 'Returning several values per node: rob/skip, isBST/min/max/sum.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Return one value up</h2>
        <p>
          The diameter, the longest univalue path and the maximum path sum all share one shape. A path has a single highest
          node where its two arms meet. So each node <b>returns</b> the best single arm going down from it (a parent can extend
          only one arm), and <b>records</b> left arm + right arm as a candidate for the global answer.
        </p>
      </div>
      <Recipe
        name="Arm up, path recorded"
        when="the answer is the best path or chain anywhere in the tree."
        steps={[
          'A missing child returns the neutral value (0 for heights and gains).',
          'Get the best arm from each child, clamped when needed (a negative gain is replaced by 0).',
          'Record a global candidate that joins both arms through this node.',
          'Return the node\'s value plus the better single arm.',
        ]}
        why="every path bends at exactly one node, and that node sees both of its arms; the parent can only continue one arm."
        time="O(n)"
        space="O(h) for the recursion, h = tree height"
      />

      <div className="prose">
        <h2>Pattern 2: Return several values</h2>
        <p>
          When a choice at a node restricts its children, return one value per choice. House Robber III returns (robbed,
          skipped). Binary Tree Cameras returns one of three states: has a camera, covered, or not covered. Maximum Sum BST
          returns (is a BST, min, max, sum). The parent combines the children's tuples according to the rules.
        </p>
      </div>
      <Recipe
        name="One value per choice"
        when="choosing a node forbids or forces something for its children or parent."
        steps={[
          'List the choices (or states) a node can be in.',
          'For each choice, write how it combines the children\'s values: which child states it may use.',
          'Return all of them as a tuple from the node.',
          'At the root, take the best allowed choice.',
        ]}
        why="the parent can then pick the child state that matches its own choice, instead of re-exploring the child."
        time="O(n × choices)"
        space="O(h)"
      />

      <div className="prose">
        <h2>Pattern 3: General trees from edge lists</h2>
        <p>
          Many tree problems give n − 1 edges instead of node objects. Build an adjacency list, choose any root (usually 0), and
          walk it while remembering the parent so you never go back up. The DP is the same as on binary trees, with a loop
          over children instead of left and right. For 10⁵ nodes a path-shaped tree is 10⁵ deep, so use an explicit stack: record
          the visiting order, then process it in reverse for post-order.
        </p>
        <h2>Pattern 4: Rerooting</h2>
        <p>
          Some problems want an answer for <b>every</b> node as the root. Running a fresh DFS from each node is{' '}
          <Cost>O(n²)</Cost>. Rerooting does it in two passes. Pass one roots the tree at 0 and computes subtree summaries
          bottom-up. Pass two goes top-down: when the root moves from a parent p to its child c, only the edge between them
          changes direction, so the child's answer is the parent's answer adjusted by that edge's contribution.
        </p>
      </div>
      <Walkthrough
        title="Sum of Distances in Tree: one pass up, one pass down"
        frames={distances.frames}
        caption={`answer[c] = answer[p] − size[c] + (n − size[c]). Final answers: [${distances.answer.join(', ')}].`}
      />
      <Recipe
        name="Rerooting in two passes"
        when="you need the same quantity computed with every node as the root."
        steps={[
          'Root the tree at node 0 and record a DFS order and each node\'s parent.',
          'Pass 1, in reverse order (children before parents): compute subtree summaries such as sizes and sums below.',
          'The root\'s answer comes straight from pass 1.',
          'Pass 2, in order (parents before children): derive each child\'s answer from its parent\'s answer by adjusting for the edge between them.',
        ]}
        why="moving the root across one edge only changes which side of that edge each node is on; everything else stays the same."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Binary Tree Maximum Path Sum</b>: the largest sum of values on any path, where values
          may be negative and the path need not pass through the root.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Every pair of nodes defines one path. Trying all pairs and summing each path is <Cost>O(n³)</Cost> or{' '}
          <Cost>O(n²)</Cost> with care: too slow for 3 × 10⁴ nodes.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Every path has a highest node. If you knew, for each node, the best way to go down on its left and on its right, the
          best path bending at that node would be value + best left arm + best right arm. The same downward arms are
          recomputed for many pairs.
        </p>
        <Step n={3}>Decide what to return and what to record</Step>
        <p>
          Return the best single downward arm: value + max(left arm, right arm), where an arm with a negative sum is replaced by
          0 (you would rather not go down at all). Record value + left arm + right arm as a global candidate. Never return the
          bent path: the parent can only continue one side.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One visit per node: <Cost>O(n)</Cost>. If every value is negative, the best path is the single largest node, so the
          global best must start at −∞, not 0. A single node is a valid path. Done.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Problem</th>
            <th>Returned to the parent</th>
            <th>Recorded globally</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Diameter of Binary Tree</td><td>height</td><td>left height + right height</td></tr>
          <tr><td>Maximum Path Sum</td><td>value + best arm (arms clamped at 0)</td><td>value + both arms</td></tr>
          <tr><td>Distribute Coins</td><td>excess coins of the subtree</td><td>sum of |excess| over all edges</td></tr>
          <tr><td>House Robber III</td><td>(robbed, skipped)</td><td>nothing: the root decides</td></tr>
          <tr><td>Maximum Sum BST</td><td>(is BST, min, max, sum)</td><td>sum of every valid BST</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Returning the bent path (left + right through the node) to the parent. A parent can only extend one arm.</>,
          <>Starting the global best at 0 when all values may be negative.</>,
          <>On edge-list trees, walking back to the parent because you forgot to skip it.</>,
          <>Deep recursion on a path-shaped tree with 10⁵ nodes: use an explicit stack in JavaScript.</>,
          <>Trying grandchildren directly in House Robber III without a memo: exponential time. Return a pair instead.</>,
          <>Running a DFS from every node when rerooting would answer all roots in two passes.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Compute House Robber III by hand on the tree [2, 5, 1, null, 4, 3]. Write (rob, skip) under each node.',
            hint: 'The leaves are the 4 under the 5 and the 3 under the 1.',
            solution: 'Leaf 4: (4, 0). Leaf 3: (3, 0). Node 5: (5 + 0, 4) = (5, 4). Node 1: (1 + 0, 3) = (1, 3). Root 2: rob = 2 + 4 + 3 = 9, skip = 5 + 3 = 8. The answer is 9: rob 2, 4 and 3.',
          },
          {
            task: 'For a path of 4 nodes, 0 – 1 – 2 – 3, compute the sum of distances from node 0, then reroot to node 1 using answer[c] = answer[p] − size[c] + (n − size[c]).',
            solution: 'From 0: 1 + 2 + 3 = 6. size[1] = 3 (nodes 1, 2, 3). answer[1] = 6 − 3 + 1 = 4, which matches 1 + 1 + 2.',
          },
          {
            task: 'In Binary Tree Cameras, why does a missing child count as "covered" rather than "not covered"?',
            solution: 'A missing child needs nothing. Calling it uncovered would force a camera onto every leaf, which is never optimal.',
          },
          {
            task: 'What should each node return for Longest Univalue Path, and what should it record?',
            solution: 'Return the longest arm of equal values going down from it (one side only). Record left arm + right arm, where an arm counts only if the child has the same value.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In Binary Tree Maximum Path Sum, what does each node return to its parent?',
            options: ['The best path through the node', 'Its value plus the better of its two arms (arms clamped at 0)', 'The sum of its subtree', 'The global best so far'],
            answer: 1,
            why: 'A parent can extend only one downward arm. The path through both arms is recorded globally instead.',
          },
          {
            q: 'House Robber III returns two values per node. Why?',
            options: [
              'To store the left and right child sums',
              'Because robbing a node forbids robbing its children, so the parent must know both cases',
              'To make the recursion iterative',
              'Because the tree is binary',
            ],
            answer: 1,
            why: 'If the parent is robbed it needs the children\'s "skipped" values; otherwise it takes each child\'s better value.',
          },
          {
            q: 'Rerooting answers a question for every root in how much time?',
            options: ['O(n²)', 'O(n log n)', 'O(n)', 'O(2ⁿ)'],
            answer: 2,
            why: 'One bottom-up pass and one top-down pass, each touching every node once.',
          },
          {
            q: 'A tree with 10⁵ nodes is given as an edge list and might be a long path. What should you watch out for?',
            options: ['Integer overflow', 'Recursion depth: use an explicit stack', 'Cycles in the input', 'Duplicate edges'],
            answer: 1,
            why: 'A path-shaped tree makes the recursion 10⁵ calls deep, which can overflow the JavaScript call stack.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the "return one value" problems; they train the arm-versus-path split. Then the tuple problems, then
          edge-list trees, and finish with rerooting. For each, write down what a node returns and what it records before
          anything else. Problems marked <b>Core</b> are the minimum set.
        </p>
      </div>
      <ProblemSet id="dp-tree" />

      <Recap>
        <ul>
          <li>Subtrees are independent subproblems: solve children first, then combine at the parent, O(n) in total.</li>
          <li>Separate what a node returns (one usable arm, or one value per choice) from what it records globally.</li>
          <li>Return a tuple when a choice at a node constrains its children.</li>
          <li>Rerooting gives every node's answer in two passes: subtree summaries up, edge-by-edge adjustments down.</li>
        </ul>
      </Recap>
    </>
  );
}
