import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/graph';
import { bipartite, representations } from '../traces/graph';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const views = representations(
  [
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: 100, y: 0 },
    { id: 'C', x: 100, y: 90 },
    { id: 'D', x: 0, y: 90 },
    { id: 'E', x: 200, y: 45 },
  ],
  [['A', 'B'], ['A', 'D'], ['B', 'C'], ['B', 'E'], ['C', 'E']],
);

const colouring = bipartite(
  [
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: 90, y: 0 },
    { id: 'C', x: 90, y: 90 },
    { id: 'D', x: 0, y: 90 },
    { id: 'E', x: 180, y: 0 },
    { id: 'F', x: 290, y: 0 },
    { id: 'G', x: 360, y: 90 },
    { id: 'H', x: 250, y: 120 },
  ],
  [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A'], ['B', 'E'], ['F', 'G'], ['G', 'H'], ['H', 'F']],
);

export default function Graph() {
  return (
    <>
      <TopicIntro
        id="graph"
        time="4–5 hours, plus problems"
        before={['dfs', 'bfs', 'hash-table']}
        learn={[
          'How to model a problem as a graph: what are the nodes, what are the edges, directed or not',
          'Adjacency lists, adjacency matrices and edge lists, and when each one fits',
          'Degrees, components, trees, cycles, bipartite graphs, colouring and DAGs',
          'Why Hamiltonian paths are hard, and what to do when a problem asks for one',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A <b>graph</b> is a set of things (nodes, also called vertices) and connections between pairs of them (edges). Cities and
          roads, people and friendships, courses and prerequisites, words that differ by one letter, cells of a grid: all graphs. The
          most important skill in this chapter is not an algorithm. It is <b>modelling</b>: reading a story about people, stones or
          gardens and saying "the nodes are these, the edges are those". Once you can do that, most problems become a question you
          already know how to answer with DFS (<See id="dfs" />), BFS (<See id="bfs" />) or one of the graph chapters that follow.
        </p>
        <p>The words you will meet constantly:</p>
        <ul>
          <li><b>Directed</b> edges go one way (a trusts b); <b>undirected</b> edges go both ways (a and b are friends).</li>
          <li><b>Weighted</b> edges carry a number (a road length, a ratio); unweighted edges all count the same.</li>
          <li>The <b>degree</b> of a node is its number of edges; in a directed graph, <b>in-degree</b> counts incoming and <b>out-degree</b> outgoing edges.</li>
          <li>A <b>path</b> follows edges from node to node; a <b>cycle</b> is a path that returns to its start.</li>
          <li>A <b>connected component</b> is a largest group of nodes that can all reach each other (undirected).</li>
          <li>A <b>tree</b> is a connected undirected graph with no cycle; with n nodes it always has exactly n − 1 edges.</li>
          <li>A <b>DAG</b> (directed acyclic graph) is a directed graph with no directed cycle.</li>
          <li>A graph is <b>sparse</b> when E is close to V and <b>dense</b> when E is close to V². Most LeetCode graphs are sparse.</li>
        </ul>
      </div>

      <div className="prose">
        <h2>Three ways to store a graph</h2>
        <p>The same five nodes and five edges, stored three ways:</p>
      </div>
      <VizFigure
        parts={views}
        caption="The adjacency list stores only the edges that exist; the matrix has a cell for every pair; the edge list is just the input."
      />
      <TableWrap>
        <thead>
          <tr>
            <th>Representation</th>
            <th>Memory</th>
            <th>Are u and v joined?</th>
            <th>List u's neighbours</th>
            <th>Best for</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Adjacency list</td><td>O(V + E)</td><td>O(degree of u)</td><td>O(degree of u)</td><td>Almost everything: traversals on sparse graphs</td></tr>
          <tr><td>Adjacency matrix</td><td>O(V²)</td><td>O(1)</td><td>O(V)</td><td>Dense graphs, V up to a few thousand, pair questions</td></tr>
          <tr><td>Edge list</td><td>O(E)</td><td>O(E)</td><td>O(E)</td><td>Sorting edges (Kruskal), union-find, building the others</td></tr>
        </tbody>
      </TableWrap>

      <Box kind="key" label="Key idea">
        <p>
          Before writing any code, write one sentence: <i>"Nodes are …, there is an edge from a to b when …, the edges are directed /
          undirected and weighted / unweighted."</i> Then name the question in graph terms: reachability, components, shortest path,
          cycle, ordering, colouring. That sentence picks the algorithm for you.
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
          { name: 'Adjacency list', ts: 'number[][], one empty array per node (create each separately, never one shared array)', ops: 'add edge O(1); neighbours O(degree)', use: 'The default. Add both directions for undirected edges.' },
          { name: 'Map-based adjacency', ts: 'Map<string, string[]>', ops: 'O(1) average per lookup', use: 'Nodes named by strings (variables, words, stops).' },
          { name: 'Adjacency matrix', ts: 'boolean[][] or Uint8Array(n * n)', ops: 'pair check O(1)', use: 'Small dense graphs, or when you keep asking whether two nodes are joined.' },
          { name: 'Degree arrays', ts: 'number[] or Int32Array', ops: 'O(1)', use: 'In-degree and out-degree counting, DAG sources, judges, centres.' },
          { name: 'Colour / visited array', ts: 'Int8Array filled with −1', ops: 'O(1)', use: 'Two-colouring, visited marks, three-colour cycle detection.' },
          { name: 'Map from original to copy', ts: 'Map<Node, Node>', ops: 'O(1) average', use: 'Cloning a graph with cycles.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Model and count degrees</h2>
        <p>
          Some graph questions need no traversal at all. The judge is trusted by everyone and trusts nobody: in-degree n − 1,
          out-degree 0. The centre of a star touches every edge. The network rank of two cities is the sum of their degrees, minus one
          if they are directly joined. Assigning values to maximise road importance only depends on how many roads touch each city.
          Count first; traverse only if counting is not enough.
        </p>
      </div>
      <Recipe
        name="Answer with degrees"
        when="the property you need is about how many edges touch each node, not about paths."
        steps={[
          'Make arrays for in-degree and out-degree (or just degree for undirected graphs).',
          'Go through the edge list once, updating the counts.',
          'Express the property as a condition on the counts (for example in − out = n − 1), and scan the nodes.',
          'If the property involves pairs of nodes, add an adjacency matrix or a Set of edges for O(1) pair checks.',
        ]}
        why="each edge contributes exactly one to the degree of each endpoint, so the counts summarise every node's local situation."
        time="O(V + E)"
        space="O(V)"
      />

      <div className="prose">
        <h2>Pattern 2: Traverse, copy and count components</h2>
        <p>
          DFS or BFS from every unvisited node counts components. The same traversal copies a graph (keep a Map from each original
          node to its copy, which also serves as the visited set) or checks that a structure is a tree: every node except the root has
          exactly one parent, there is exactly one root, and everything is reachable from it. For cycles in an undirected graph, the
          simplest test while adding edges one at a time is "are these two endpoints already connected?", which union-find
          (<See id="union-find" />) answers in near-constant time.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Cycle question</th>
            <th>Method</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Undirected graph, given all at once</td><td>DFS: a visited neighbour that is not the node you came from means a cycle. Or: a component with V nodes and at least V edges has a cycle.</td></tr>
          <tr><td>Undirected graph, edges added one by one</td><td>Union-find: an edge between two nodes already in the same set closes a cycle.</td></tr>
          <tr><td>Directed graph</td><td>Three-colour DFS (an edge to a grey node), or Kahn's topological sort leaves nodes unprocessed (<See id="topological-sort" />).</td></tr>
          <tr><td>Each node has one outgoing edge</td><td>Follow the edges and remember the step number of each node on the current walk.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 3: Bipartite graphs and two-colouring</h2>
        <p>
          A graph is <b>bipartite</b> if its nodes split into two groups with every edge going between the groups: people who dislike
          each other must be apart, rows and columns, workers and jobs. To test it, colour one node A; then every neighbour is forced to
          be B, every neighbour of those is forced to be A, and so on. If an edge ever joins two nodes of the same colour, the graph is
          not bipartite. That happens exactly when the graph has a cycle of odd length.
        </p>
      </div>
      <Walkthrough
        title="Two-colouring with BFS, component by component"
        frames={colouring.frames}
        caption={`Blue = colour A, amber = colour B. The square with a tail is bipartite; the triangle is an odd cycle, so the whole graph is not. Result: ${colouring.bipartite ? 'bipartite' : 'not bipartite'}.`}
      />
      <Recipe
        name="Two-colouring"
        when="you must split items into two groups so that every conflict (edge) crosses between groups."
        steps={[
          'Keep a colour per node, initially none.',
          'For each node without a colour, give it colour 0 and start a BFS or DFS from it.',
          'When you look at an edge from u to v: if v has no colour, give it the opposite of u\'s colour and continue from v. If v has the same colour as u, stop: not bipartite.',
          'If every component finishes without a conflict, the colours are a valid split.',
        ]}
        why="within a component, the colour of one node forces all the others; a same-colour edge means two forced colours disagree, which only an odd cycle can cause."
        time="O(V + E)"
        space="O(V)"
      />

      <div className="prose">
        <h2>Pattern 4: Colouring with more colours</h2>
        <p>
          Two colours are easy, as you just saw. With three or more, finding the smallest number of colours (the chromatic number) is
          NP-hard: no efficient algorithm is known. LeetCode problems therefore give you a shortcut. If every node has at most d
          neighbours and you have d + 1 colours, <b>greedy colouring</b> always works: go through the nodes and give each a colour none
          of its neighbours uses. If the graph is a regular shape such as an n × 3 grid, <b>count</b> colourings with DP row by row,
          remembering only the pattern of the previous row (<See id="dp" />). Planar graphs (graphs you can draw without crossing
          edges) can always be coloured with four colours, a famous theorem.
        </p>

        <h2>Pattern 5: DAG reasoning</h2>
        <p>
          In a directed acyclic graph you can always order the nodes so that every edge points forward (a topological order, taught in{' '}
          <See id="topological-sort" />). That gives DAGs useful facts. There is at least one <b>source</b> (in-degree 0) and one{' '}
          <b>sink</b> (out-degree 0). Every node is reachable from some source, so the sources are the smallest set that reaches
          everything. And answers can be pushed along the edges: the quietest richer person, the set of ancestors, the longest path, each
          computed once per node with a memoised DFS or in topological order.
        </p>
      </div>
      <Recipe
        name="Propagate answers through a DAG"
        when="each node's answer depends on the answers of the nodes directly before (or after) it, and the graph has no cycles."
        steps={[
          'Point the edges in the direction the information flows (for "richer than", from the poorer person to the richer).',
          'Define answer(x) using x itself and the answers of x\'s neighbours.',
          'Compute answer(x) with a DFS that stores each result the first time (memoisation), or process nodes in topological order.',
          'Read off the answers.',
        ]}
        why="without cycles, no answer can depend on itself, so each is computed from finished answers and stored once."
        time="O(V + E)"
        space="O(V)"
      />

      <div className="prose">
        <h2>Pattern 6: Hamiltonian paths</h2>
        <p>
          An <b>Eulerian</b> path uses every <i>edge</i> once and is easy to find (<See id="eulerian" />). A <b>Hamiltonian</b> path visits
          every <i>node</i> once and is NP-hard: nobody knows an algorithm much faster than trying orders. So when a problem says "visit every
          cell exactly once" or "find an order of all words", look at the limits: they will be tiny (n ≤ 12 to 20). Then backtracking
          (<See id="backtracking" />) or DP over subsets with state (set visited, last node), in <Cost>O(n² · 2ⁿ)</Cost>, is the intended
          solution (<See id="bitmask" />). Shortest Superstring is the travelling salesman problem in disguise: the "distance" from word i to
          word j is how much of j does not overlap with the end of i.
        </p>

        <h2>Pattern 7: Planar regions</h2>
        <p>
          When lines cut a picture into pieces, the question "how many regions?" is a component count, but the cells are the wrong nodes:
          a slash cuts a square in half. Split each square into four triangles and connect the triangles that are not separated; each
          component is one region. For a connected planar drawing, Euler's formula V − E + F = 2 links vertices, edges and faces
          (regions, counting the outside), which is another way to count regions.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>The thinking path for <b>Most Stones Removed with Same Row or Column</b>: up to 1000 stones on a grid.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Simulate: repeatedly pick a removable stone and remove it, trying all orders to find the most removals. The number of orders is
          factorial: hopeless.
        </p>
        <Step n={2}>Model the graph</Step>
        <p>
          Nodes are stones; two stones are joined when they share a row or a column. A stone can be removed while some neighbour remains.
          Look at one connected component: remove stones in reverse DFS order (leaves of a DFS tree first) and every stone except the
          root always still has its parent present. So each component can be reduced to exactly one stone, and never to zero, since the last
          stone has no partner left.
        </p>
        <Step n={3}>Prove the formula</Step>
        <p>
          Removals never cross components, and each component keeps at least one stone. So the maximum is (number of stones) − (number of
          components). The question has become "count components".
        </p>
        <Step n={4}>Choose the representation and check the cost</Step>
        <p>
          Joining every pair of stones costs <Cost>O(n²)</Cost> edges, fine for 1000 stones. Better: make rows and columns the nodes and
          each stone an edge between its row and its column, a bipartite graph with at most 2n nodes, and count components with
          union-find in <Cost>O(n α(n))</Cost>. Offset column numbers (for example add 10,001) so a column never shares an id with a row.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Adding only one direction for an undirected edge, so traversals miss half the graph.</>,
          <>Starting a traversal from only one node when the graph may be disconnected.</>,
          <>Using a matrix for 10⁵ nodes: 10¹⁰ cells will never fit in memory.</>,
          <>Off-by-one node labels: many problems number nodes from 1, not 0.</>,
          <>Cloning without a Map from original to copy: cycles make the copy run forever.</>,
          <>Treating a hard problem (Hamiltonian path, general colouring) as if a clever polynomial trick must exist; check the limits instead.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'A graph has 6 nodes and 4 edges and no cycles. How many connected components does it have?',
            hint: 'Each component with k nodes and no cycle is a tree with k − 1 edges.',
            solution: 'A forest with V nodes and E edges has V − E components: 6 − 4 = 2.',
          },
          {
            task: 'Is a cycle of 5 nodes bipartite? A cycle of 6 nodes?',
            solution: 'The 5-cycle is not (odd cycle); the 6-cycle is (alternate the colours around it).',
          },
          {
            task: 'In the trust list [(1, 3), (2, 3), (3, 1)] with n = 3, who is the judge?',
            solution: 'Nobody (−1). Person 3 is trusted by 1 and 2, but trusts person 1, so its score is 2 − 1 = 1, not n − 1 = 2.',
          },
          {
            task: 'Directed edges 0 → 1, 0 → 2, 3 → 2. Which vertices form the smallest set that reaches every vertex?',
            solution: 'The vertices with in-degree 0: 0 and 3.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You have 100,000 nodes and 200,000 edges. Which representation do you use?',
            options: ['Adjacency matrix', 'Adjacency list', 'Either, they cost the same', 'Edge list only'],
            answer: 1,
            why: 'A matrix needs 10¹⁰ cells. An adjacency list needs O(V + E), about 500,000 entries.',
          },
          {
            q: 'When is a graph bipartite?',
            options: ['When it is connected', 'When it has no odd-length cycle', 'When it has an even number of nodes', 'When every node has even degree'],
            answer: 1,
            why: 'Two-colouring fails exactly when some cycle has odd length.',
          },
          {
            q: 'A tree with n nodes has how many edges?',
            options: ['n', 'n − 1', 'n + 1', 'It depends on the shape'],
            answer: 1,
            why: 'Connected with no cycle always means exactly n − 1 edges.',
          },
          {
            q: 'A problem asks for a route visiting each of 15 cities exactly once. What should you expect?',
            options: [
              'A greedy algorithm',
              'An NP-hard problem, solved for small n with bitmask DP or backtracking',
              'A BFS from each city',
              'An Eulerian path',
            ],
            answer: 1,
            why: 'Visiting every node once is a Hamiltonian path; the small limit is the hint to use O(n² · 2ⁿ) DP.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For every problem, write the modelling sentence first: nodes, edges, directed or not. Then pick the tool. Mark problems Solved so
          the <a href="#/review">review queue</a> brings them back.
        </p>
      </div>
      <ProblemSet id="graph" />

      <Recap>
        <ul>
          <li>Modelling comes first: name the nodes, the edges, and whether they are directed or weighted.</li>
          <li>Adjacency lists are the default (O(V + E)); matrices suit small dense graphs and pair questions.</li>
          <li>Degrees answer many questions without any traversal; traversals count components, copy graphs and check trees.</li>
          <li>Bipartite means two-colourable means no odd cycle; colouring with more colours needs a shortcut (degree bound or counting DP).</li>
          <li>DAGs have sources and allow answers to be propagated; Hamiltonian paths are hard, so expect tiny limits and bitmask DP.</li>
        </ul>
      </Recap>
    </>
  );
}
