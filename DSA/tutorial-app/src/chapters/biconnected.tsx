import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/biconnected';
import { bridgesAndCuts } from '../traces/biconnected';
import { Walkthrough } from '../viz/Walkthrough';

const run = bridgesAndCuts(
  7,
  [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3], [5, 6]],
  { 0: [0, 0], 1: [120, 70], 2: [0, 140], 3: [250, 70], 4: [370, 0], 5: [370, 140], 6: [500, 140] },
);

export default function Biconnected() {
  return (
    <>
      <TopicIntro
        id="biconnected"
        time="2–3 hours, plus problems"
        before={['dfs', 'graph', 'scc']}
        learn={[
          'What bridges, articulation points and biconnected components are',
          'Discovery times and low-links: how one DFS finds every weak spot of a graph',
          'The exact tests: low[child] > disc[parent] for bridges, low[child] ≥ disc[parent] for cut vertices, and the special rule for the root',
          'Shortcuts: leaf peeling when a graph has one cycle, and small upper bounds for "fewest removals" questions',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A road network has weak spots. A <b>bridge</b> is a single road whose closure splits the network into two parts that can no
          longer reach each other. An <b>articulation point</b> (or cut vertex) is a single junction whose closure does the same. A
          network without any articulation point is <b>biconnected</b>: every pair of junctions is joined by two routes that share no
          junction, so no single failure disconnects it. The maximal biconnected pieces of a graph are its biconnected components.
        </p>
        <p>
          The brute-force way removes each edge (or node) in turn and checks connectivity: <Cost>O(E · (V + E))</Cost>, about 10¹⁰ steps
          on a graph with 10⁵ edges. Tarjan's idea finds all of them in one DFS, <Cost>O(V + E)</Cost>.
        </p>
        <p>
          The key fact: an edge is a bridge exactly when it lies on <b>no cycle</b>. A cycle gives a second way around, so removing any one
          of its edges keeps everything connected.
        </p>
      </div>

      <Walkthrough
        title="One DFS finds both bridges and all three articulation points"
        frames={run.frames}
        caption="Notes show d (discovery time) and low (the earliest discovery time reachable). The indigo node is being processed and grey nodes are already visited. Green edges are DFS tree edges, an amber edge is a back edge being used, red edges are bridges and red nodes are articulation points."
      />

      <Box kind="key" label="Key idea">
        <p>
          For each node, <b>low</b> is the earliest discovery time its DFS subtree can reach using tree edges downward plus at most one back
          edge upward. If a child's subtree cannot reach the parent or anything above it (low[child] &gt; disc[parent]), the edge between
          them is the only way out: a bridge. If it cannot reach above the parent (low[child] ≥ disc[parent]), the parent is the only way out:
          an articulation point.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to bridges or articulation points. All signals are collected in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Adjacency list with edge ids', ts: 'Array<[number, number][]> (neighbour, edge id)', ops: 'visit neighbours O(degree)', use: 'Undirected graph; the edge id lets you skip only the edge you arrived by.' },
          { name: 'Discovery time array', ts: 'number[] filled with −1', ops: 'O(1)', use: 'When the DFS first reached each node; −1 means unvisited.' },
          { name: 'Low-link array', ts: 'number[]', ops: 'O(1)', use: 'The earliest discovery time each subtree can reach.' },
          { name: 'Explicit stack', ts: 'array of [node, parent edge, next neighbour index]', ops: 'push and pop O(1)', use: 'An iterative DFS for very deep graphs, where recursion would overflow.' },
          { name: 'Degree array and queue', ts: 'number[] and an array used as a queue', ops: 'O(1)', use: 'Leaf peeling, when a graph has a single cycle.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Bridges</h2>
      </div>
      <Recipe
        name="Bridges with low-links"
        when="you need every edge whose removal disconnects an undirected graph."
        steps={[
          'Run a DFS. When you first reach a node, give it the next discovery time and set its low-link to the same value.',
          'For each neighbour reached by a new edge: if it is unvisited, recurse into it, then lower this node\'s low-link to the child\'s low-link if smaller.',
          'After returning from a child, if low[child] > disc[this node], the edge between them is a bridge.',
          'If the neighbour is already visited and the edge is not the one you arrived by, it is a back edge: lower this node\'s low-link to the neighbour\'s discovery time if smaller.',
          'Restart the DFS from any unvisited node, so disconnected graphs are covered too.',
        ]}
        why="low[child] > disc[parent] means no back edge from the child's subtree reaches the parent or above, so no cycle passes through that edge."
        time="O(V + E)"
        space="O(V + E)"
      />
      <div className="prose">
        <p>
          If a graph has exactly one cycle (n nodes and n edges, connected), you do not even need low-links. Every edge off the cycle is a
          bridge, and repeatedly removing nodes of degree 1 strips them all away, leaving exactly the cycle. That is the same leaf-peeling idea
          used for Minimum Height Trees in <See id="topological-sort" />.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 2: Articulation points</h2>
        <p>
          The test for nodes is almost the same, with two differences. The comparison is <b>≥</b> instead of &gt;: a child subtree that can
          reach the parent itself, but nothing above it, still depends on the parent. And the <b>root</b> of the DFS needs its own rule,
          because nothing lies above it: the root is a cut vertex exactly when it has two or more DFS children.
        </p>
      </div>
      <Recipe
        name="Articulation points"
        when="you need every node whose removal disconnects an undirected graph."
        steps={[
          'Run the same DFS with discovery times and low-links, and count each node\'s DFS children.',
          'For a non-root node u, after returning from a child v: if low[v] ≥ disc[u], u is an articulation point.',
          'For the root, after the DFS: it is an articulation point if it has at least two DFS children.',
          'Record each node at most once.',
        ]}
        why="if v's subtree cannot reach above u, every path from that subtree to the rest of the graph goes through u."
        time="O(V + E)"
        space="O(V + E)"
      />

      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Test after returning from child v of u</th>
            <th>Special case</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Is edge u–v a bridge?</td><td>low[v] &gt; disc[u]</td><td>Skip only the edge you arrived by, so parallel edges count as cycles</td></tr>
          <tr><td>Is node u an articulation point?</td><td>low[v] ≥ disc[u]</td><td>The root: only if it has two or more DFS children</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h3>Biconnected and 2-edge-connected components</h3>
        <p>
          Delete every bridge and the connected pieces that remain are the <b>2-edge-connected components</b>: inside each, any two nodes are
          joined by two routes with no edge in common. <b>Biconnected components</b> (also called blocks) are the node version: they can be
          collected during the same DFS by pushing edges on a stack and popping them off whenever a node satisfies the articulation test for
          a child. LeetCode rarely asks for the components themselves; bridges and cut vertices are what the problems need.
        </p>
        <p>
          Compare this with <See id="scc" />: strongly connected components are about <i>directed</i> reachability, while bridges and
          articulation points are about how robust an <i>undirected</i> graph is. Both use discovery times and low-links, which is why
          Tarjan's name appears on both.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Minimum Number of Days to Disconnect Island</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Try removing one cell, then every pair of cells, then every triple, checking islands each time. Pairs alone are about 400,000
          combinations for a 30 × 30 grid, each with a flood fill. Too slow if you keep going.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          You never need to go past two. The top-most land cell (left-most among ties) has no land above it or to its left, so at most two
          land neighbours; removing them cuts it off from the rest. (Islands of one to three cells also break within two days.) So the answer is 0, 1 or 2.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Answer 0 if the grid is not exactly one island. Answer 1 if the island is a single cell, or if one cell is an articulation point of the
          land graph. Otherwise answer 2.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Low-links make it <Cost>O(mn)</Cost>. With only 900 cells, trying each cell and recounting islands (<Cost>O((mn)²)</Cost>, under
          a million steps) is also fine and easier to get right. Two adjacent cells have no articulation point, so the answer is 2.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Skipping every edge back to the parent instead of only the one you arrived by. With parallel edges, a second edge to the parent is a genuine cycle.</>,
          <>Using &gt; for articulation points or ≥ for bridges. The two tests differ by exactly that one symbol.</>,
          <>Forgetting the root rule. The DFS root has no ancestor, so the child test always "passes" for it; only two or more children make it a cut vertex.</>,
          <>Updating low with low[neighbour] on a back edge. Use disc[neighbour] for back edges and low[child] only for tree children.</>,
          <>Recursing 10⁵ levels deep. Convert to an explicit stack for long chains.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Edges: 0–1, 1–2, 2–0, 2–3. Which edges are bridges and which nodes are articulation points?',
            solution: 'Bridge: 2–3 (it lies on no cycle). Articulation point: 2 (removing it cuts 3 off).',
          },
          {
            task: 'A path 0–1–2–3. Which edges are bridges and which nodes are articulation points?',
            solution: 'Every edge is a bridge. Nodes 1 and 2 are articulation points; the end nodes 0 and 3 are not.',
          },
          {
            task: 'Start a DFS at node 1 in a star graph where node 1 joins nodes 0, 2 and 3. Why is the root rule needed here?',
            solution: 'Node 1 has three DFS children whose subtrees cannot reach above it, so it is a cut vertex. If the DFS started at node 0 instead, node 1 would be found by the ordinary test. The root rule covers the case where the cut vertex happens to be the start.',
          },
          {
            task: 'A connected graph has 6 nodes and 6 edges. How many bridges can it have at most?',
            hint: 'It has exactly one cycle.',
            solution: 'The cycle has at least 3 edges (no repeated edges), and the other edges are bridges, so at most 6 − 3 = 3 bridges.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'When is the tree edge between parent u and child v a bridge?',
            options: ['low[v] < disc[u]', 'low[v] ≥ disc[u]', 'low[v] > disc[u]', 'disc[v] > disc[u]'],
            answer: 2,
            why: 'v\'s subtree must be unable to reach u or anything above it; if it can reach u itself, there is a cycle through the edge.',
          },
          {
            q: 'The DFS root has exactly one child. Can it be an articulation point?',
            options: ['Yes, always', 'No: removing it leaves the single subtree connected', 'Only if the graph has a cycle', 'Only if it has degree 1'],
            answer: 1,
            why: 'Everything else lies in one DFS subtree, which stays connected without the root.',
          },
          {
            q: 'On a back edge from u to an already visited ancestor w, how do you update low[u]?',
            options: ['low[u] = min(low[u], low[w])', 'low[u] = min(low[u], disc[w])', 'low[u] = disc[u]', 'No update'],
            answer: 1,
            why: 'A back edge lets u reach w itself, whose discovery time is disc[w]. Using low[w] is a common bug for articulation points.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          LeetCode has only a few problems on this topic, but Critical Connections in a Network is a famous interview question. Implement it
          until the two tests and the root rule are second nature.
        </p>
      </div>
      <ProblemSet id="biconnected" />

      <Recap>
        <ul>
          <li>A bridge is an edge on no cycle; an articulation point is a node whose removal disconnects the graph.</li>
          <li>One DFS with discovery times and low-links finds both in O(V + E).</li>
          <li>Bridge: low[child] &gt; disc[parent]. Cut vertex: low[child] ≥ disc[parent], plus the root with two or more children.</li>
          <li>With exactly one cycle, peel degree-1 nodes to strip the bridges away.</li>
          <li>For "fewest removals" questions, look for a small upper bound and test the small answers.</li>
        </ul>
      </Recap>
    </>
  );
}
