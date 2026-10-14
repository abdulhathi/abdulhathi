import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/tree-advanced';
import { binaryLifting, lcaRecursive, SAMPLE_TREE } from '../traces/tree-advanced';
import { Walkthrough } from '../viz/Walkthrough';

const recursive = lcaRecursive(SAMPLE_TREE, 7, 9);
const lifting = binaryLifting(SAMPLE_TREE, [10, 3], [10, 4]);

export default function TreeAdvanced() {
  return (
    <>
      <TopicIntro
        id="tree-advanced"
        time="3–4 hours, plus problems"
        before={['binary-tree', 'dfs', 'bit-manipulation', 'range-queries']}
        learn={[
          'Three ways to find the lowest common ancestor (LCA), and when each one fits',
          'Binary lifting: jump k levels up a tree in O(log k) with a table of 2^j-th ancestors',
          'How to turn any tree path question into "up to the LCA, then down"',
          'Path aggregates with root prefixes, and the Euler tour idea that turns LCA into a range minimum',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think of a family tree. Two cousins share grandparents; two siblings share parents. The <b>lowest common ancestor</b>{' '}
          of two people is the closest relative they both descend from. In a tree, every path between two nodes goes up from the
          first node to their LCA and then down to the second. So once you can find the LCA, distances, paths and "what is on the
          way" questions all become easy.
        </p>
        <p>
          One LCA question is easy: a single depth-first pass, <Cost>O(n)</Cost>. But problems often ask 10⁴ or 10⁵ questions on
          the same tree, and <Cost>O(n)</Cost> each is too slow. <b>Binary lifting</b> fixes that: store each node's 1st, 2nd,
          4th, 8th… ancestor once, in <Cost>O(n log n)</Cost>, and then any jump upward costs one step per bit of the distance.
          Both the k-th ancestor and the LCA then take <Cost>O(log n)</Cost>.
        </p>
      </div>

      <Walkthrough
        title="Recursive LCA of nodes 7 and 9"
        frames={recursive.frames}
        caption={`The notes under each node show what its call returns. The first node that hears from both sides is the LCA: ${recursive.lca}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          The path between two tree nodes is always: up to their LCA, then down. So distance(a, b) = depth(a) + depth(b) −
          2 × depth(lca), and anything you can add up from the root (counts, sums, XORs) works on a path the same way:
          value(a) + value(b) − 2 × value(lca).
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
          { name: 'Adjacency list', ts: 'number[][] or Map<number, number[]>', ops: 'build O(n)', use: 'Trees given as edge lists. Root the tree with one BFS or DFS to get parents and depths.' },
          { name: 'Parent and depth arrays', ts: 'Int32Array of length n', ops: 'O(1) lookup', use: 'Climbing upward and equalising depths.' },
          { name: 'Lifting table', ts: 'Int32Array[] with LOG rows (about 17 for 10⁵ nodes)', ops: 'build O(n log n); jump O(log n)', use: 'k-th ancestor and LCA for many queries. Use −1 for "above the root".' },
          { name: 'Root prefix values', ts: 'number[] or Int32Array per node', ops: 'O(1) per node during the DFS', use: 'Path sums and counts: combine a, b and lca.' },
          { name: 'Explicit stack', ts: 'number[] used with push and pop', ops: 'O(1)', use: 'Iterative DFS, so a 10⁵-node chain does not overflow the call stack.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Recursive LCA</h2>
        <p>
          For a single query on a binary tree, let every subtree answer one question: "do you contain p or q?" A call returns p,
          q, the LCA, or nothing. Because children answer first, the first node to receive answers from both children is where
          p and q part ways.
        </p>
      </div>
      <Recipe
        name="Recursive LCA"
        when="you have one (or a few) LCA questions on a binary tree."
        steps={[
          'If the node is empty, report nothing. If it is p or q, report it.',
          'Ask the left subtree, then the right subtree.',
          'If both report something, the current node is the LCA: report it.',
          'Otherwise report whatever the one non-empty side reported.',
        ]}
        why="p and q are in different subtrees of their LCA (or the LCA is one of them), so the LCA is the only node that can collect both answers."
        time="O(n)"
        space="O(h)"
      />

      <div className="prose">
        <h2>Pattern 2: Parent pointers and depth</h2>
        <p>
          If you can move upward (parent pointers, a parent array, or labels where the parent of v is v / 2), you do not need a
          search. Lift the deeper node until both are at the same depth, then move both up one step at a time until they meet.
          With parent pointers but no depths, the two-pointer switching trick from linked lists does the same job without
          measuring anything.
        </p>

        <h2>Pattern 3: Binary lifting</h2>
        <p>
          Climbing one level at a time is <Cost>O(depth)</Cost>, and a tree can be 10⁵ levels deep. Binary lifting stores{' '}
          <b>up[j][v]</b>, the ancestor 2^j levels above v. The table fills itself: jumping 2^j is jumping 2^(j−1) twice.
        </p>
      </div>
      <Walkthrough
        title="Binary lifting: build the table, find a k-th ancestor, then an LCA"
        frames={lifting.frames}
        caption={`3rd ancestor of 10: ${lifting.kthAncestor}. LCA of 10 and 4: ${lifting.lca}.`}
      />
      <Recipe
        name="Binary lifting"
        when="you need many k-th ancestor or LCA queries on one tree, or many long jumps along any 'next' pointer."
        steps={[
          'Root the tree and record parent and depth for every node (one BFS or DFS).',
          'Row 0 of the table is the parent. Row j: up[j][v] = up[j−1][up[j−1][v]], or −1 if that is above the root.',
          'k-th ancestor: for each set bit j of k, move the node to up[j][node].',
          'LCA(a, b): lift the deeper node by the depth difference. If they are now equal, that is the LCA.',
          'Otherwise, for j from high to low: if up[j][a] differs from up[j][b], move both. The LCA is the parent of a.',
        ]}
        why="every distance is a sum of distinct powers of two, and jumping from high to low while the ancestors differ lands both nodes just below the meeting point."
        time="O(n log n) build, O(log n) per query"
        space="O(n log n)"
      />
      <div className="prose">
        <p>
          The same doubling works on any "next" pointer, not just parents. In the ball passing game, "next" is the player you pass
          to; you store where the ball is after 2^j passes and the sum collected along the way, and k = 10¹⁰ passes become at most
          34 jumps. That is binary lifting on a functional graph.
        </p>

        <h3>Euler tour plus range minimum</h3>
        <p>
          Another classic LCA method: walk the tree depth first and write down each node every time you visit it, along with its
          depth. Between the first visits of a and b in that list, the node with the smallest depth is their LCA. That turns
          every LCA query into a range-minimum query, which a sparse table answers in <Cost>O(1)</Cost> (see{' '}
          <See id="range-queries" />). It is the fastest per query; binary lifting is easier to write and also gives k-th ancestors.
        </p>

        <h3>Values along a path</h3>
        <p>
          Store, for every node, something accumulated from the root: the number of edges with each weight, the sum of values, or
          the XOR of values. For a path a–b, combine value(a) + value(b) − 2 × value(lca) (for a node value, add the LCA's own value
          back once). For a maximum or minimum along a path, which cannot be subtracted, keep a second lifting table: the largest
          edge on each 2^j jump, combined as you jump.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>LCA method</th>
            <th>Preparation</th>
            <th>Per query</th>
            <th>Use when</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Recursive search</td><td>none</td><td>O(n)</td><td>One query on a binary tree</td></tr>
          <tr><td>BST walk</td><td>none</td><td>O(h)</td><td>The tree is a binary search tree</td></tr>
          <tr><td>Depth + parent climbing</td><td>O(n)</td><td>O(h)</td><td>Parent pointers exist and the tree is shallow</td></tr>
          <tr><td>Binary lifting</td><td>O(n log n)</td><td>O(log n)</td><td>Many queries, k-th ancestors, path maximums</td></tr>
          <tr><td>Euler tour + sparse table</td><td>O(n log n)</td><td>O(1)</td><td>Very many LCA queries, nothing else needed</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: directions between two nodes</h2>
        <p>
          <b>Step-By-Step Directions From a Binary Tree Node to Another</b> asks for the moves (L, R, U) from a start node to a
          destination.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Treat the tree as a graph, add parent links, and run BFS from the start, remembering how you reached each node. That
          works in <Cost>O(n)</Cost> but needs extra maps and careful path rebuilding.
        </p>
        <Step n={2}>Find the structure</Step>
        <p>
          A shortest path in a tree is unique: up from the start to the LCA, then down to the destination. Write the
          root-to-start path and the root-to-destination path as L/R strings. They agree exactly up to the LCA.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          After the common prefix, every remaining step of the start path is a step you must undo going up: one U each. The
          remaining part of the destination path is the way down.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Two path searches and one prefix comparison: <Cost>O(n)</Cost>. If the start is an ancestor of the destination, the
          start path is fully shared and there are no U moves. Use an array as a stack while searching, not string concatenation.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Forgetting to equalise depths before jumping both nodes together.</>,
          <>Jumping from small powers to large in the LCA loop. The "jump while ancestors differ" step must go from the highest power down.</>,
          <>Not propagating −1 in the lifting table, so a jump past the root reads index −1.</>,
          <>Recursion 10⁵ levels deep on a chain-shaped tree. Root the tree with an explicit stack or BFS.</>,
          <>Using 32-bit bit operations on a k that can exceed 2³¹ (k = 10¹⁰). Read bits with division instead.</>,
          <>Subtracting the LCA's value twice for node values on a path; the LCA itself lies on the path once.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'In the sample tree, what are up[1][7] and up[2][7]?',
            hint: '7 → 3 → 1 → 0.',
            solution: 'up[1][7] = 1 (two levels up). up[2][7] is four levels up, which is above the root: −1.',
          },
          {
            task: 'Write k = 13 as jumps. How many table lookups does the 13th ancestor take?',
            solution: '13 = 8 + 4 + 1, so three lookups: 2⁰, 2² and 2³.',
          },
          {
            task: 'Depths: a = 6, b = 2, lca at depth 1. How many edges are on the path from a to b?',
            solution: '6 + 2 − 2 × 1 = 6 edges.',
          },
          {
            task: 'In a heap-numbered tree, find the cycle length when you join 12 and 7.',
            hint: 'Halve the larger number until both are equal, counting steps.',
            solution: '12 → 6 (1), 7 → 3 (2), 6 → 3 (3). They meet at 3 after 3 steps; the cycle has 3 + 1 = 4 edges.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You must answer 5 × 10⁴ k-th ancestor queries on a tree with 5 × 10⁴ nodes. What do you use?',
            options: ['Walk up one parent at a time', 'Binary lifting', 'BFS from the root for every query', 'A hash set of ancestors'],
            answer: 1,
            why: 'Walking can be O(n) per query (2.5 × 10⁹ steps in total). Binary lifting answers each in about 16 jumps.',
          },
          {
            q: 'In the recursive LCA, the left subtree returns p and the right subtree returns nothing. What does the node return?',
            options: ['Itself', 'p', 'Nothing', 'Its parent'],
            answer: 1,
            why: 'Only one target is below this node, so it passes p up unchanged; the LCA is higher.',
          },
          {
            q: 'During the LCA loop, up[j][a] equals up[j][b]. Why not jump?',
            options: [
              'Because that ancestor might be above the LCA',
              'Because the table might be wrong',
              'Because j must be even',
              'You should jump',
            ],
            answer: 0,
            why: 'A shared ancestor is a common ancestor, but maybe not the lowest one. Only jump when the ancestors still differ.',
          },
          {
            q: 'Root-to-node weight counts are cntA, cntB and cntL (for the LCA). What are the counts on the path a–b?',
            options: ['cntA + cntB', 'cntA + cntB − cntL', 'cntA + cntB − 2 × cntL', 'max(cntA, cntB)'],
            answer: 2,
            why: 'The part from the root to the LCA is counted in both cntA and cntB, and it is not on the path, so remove it twice.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
      </div>
      <ProblemSet id="tree-advanced" />

      <Recap>
        <ul>
          <li>Every tree path is "up to the LCA, then down": distances and path values come from depth and root prefixes.</li>
          <li>One query: recursive LCA in O(n). A BST: walk down by value. Parent pointers: equalise depths and climb.</li>
          <li>Binary lifting stores 2^j-th ancestors; k-th ancestor and LCA take O(log n) after O(n log n) preparation.</li>
          <li>Doubling works on any "next" pointer, carrying sums or maximums along each jump.</li>
          <li>Euler tour + sparse table gives O(1) LCA when you need nothing else.</li>
        </ul>
      </Recap>
    </>
  );
}
