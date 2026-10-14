import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/mst';
import { kruskal, prim, type WEdge } from '../traces/mst';
import { Walkthrough } from '../viz/Walkthrough';

const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
const edges: WEdge[] = [[0, 1, 4], [0, 2, 3], [1, 2, 1], [1, 3, 2], [2, 3, 4], [2, 4, 5], [3, 4, 7], [3, 5, 6], [4, 5, 3]];
const pos = { 0: [0, 70], 1: [140, 0], 2: [140, 140], 3: [280, 0], 4: [280, 140], 5: [420, 70] } as Record<number, [number, number]>;
const k = kruskal(labels, edges, pos);
const p = prim(labels, edges, pos);

export default function Mst() {
  return (
    <>
      <TopicIntro
        id="mst"
        time="3–4 hours, plus problems"
        before={['union-find', 'heap', 'greedy']}
        learn={[
          'What a minimum spanning tree is, and the cut property that makes greedy choices safe',
          "Kruskal's algorithm (sorted edges plus union-find) and Prim's algorithm (grow one tree)",
          "When an O(n²) Prim beats both, and what Borůvka's algorithm does",
          'Modelling tricks: virtual nodes, critical edges, and bottleneck (minimax) paths',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A town wants to lay cable so that every house is connected, directly or through other houses, using as little cable as
          possible. The cheapest network never contains a cycle: if it did, you could remove the most expensive cable on the cycle and
          everything would stay connected. So the answer is a tree that spans every house: a <b>minimum spanning tree</b> (MST), with
          exactly n − 1 edges.
        </p>
        <p>
          Trying every spanning tree is hopeless: a complete graph on n nodes has n<sup>n−2</sup> of them. Instead, MST algorithms are{' '}
          <b>greedy</b>, and the reason greed works here is one fact, the <b>cut property</b>: split the nodes into any two groups; the
          cheapest edge crossing between the groups belongs to some MST. Every algorithm below just keeps applying that fact.
        </p>
      </div>

      <Walkthrough
        title="Kruskal: cheapest edge that does not make a cycle"
        frames={k.frames}
        caption={`The indigo edge has just been added; green edges were kept earlier; red edges are rejected because they would close a cycle. The tree weighs ${k.total}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          The cut property: for any division of the nodes into two sides, the lightest edge crossing it is safe to take. Kruskal applies
          it to the two components an edge joins; Prim applies it to "the tree so far" versus "everything else". If an edge would join
          two nodes that are already connected, it is the heaviest edge on a cycle and can be skipped.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to a minimum spanning tree. All signals are collected in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Edge list', ts: 'Array<[number, number, number]> (u, v, weight)', ops: 'sort O(E log E)', use: "Kruskal's input, sorted by weight." },
          { name: 'Union-find', ts: 'parent and size arrays (see Union-find)', ops: 'find and union ≈ O(1)', use: 'Kruskal: does this edge join two different components?' },
          { name: 'Min-heap', ts: 'hand-written binary heap of [weight, node]', ops: 'push and pop O(log n)', use: 'Prim on sparse graphs: the cheapest edge leaving the tree.' },
          { name: 'Distance array', ts: 'number[] filled with Infinity', ops: 'O(1)', use: 'Prim on dense graphs: each outside node\'s cheapest connection to the tree.' },
          { name: 'Boolean array', ts: 'boolean[] or Uint8Array', ops: 'O(1)', use: 'Prim: which nodes are already in the tree.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Kruskal</h2>
      </div>
      <Recipe
        name="Kruskal's algorithm"
        when="the graph is given as an edge list and is not extremely dense."
        steps={[
          'Sort all edges by weight.',
          'Create a union-find with every node in its own component.',
          'For each edge in order: if its two ends are in different components, keep it, add its weight and union the components; otherwise skip it.',
          'Stop after n − 1 edges are kept. If you run out of edges first, the graph is disconnected.',
        ]}
        why="each kept edge is the lightest one crossing the cut between its two components, so the cut property says it is safe."
        time="O(E log E)"
        space="O(n + E)"
      />

      <div className="prose">
        <h2>Pattern 2: Prim, and when an O(n²) version wins</h2>
        <p>
          Prim grows a single tree. It starts at any node and repeatedly adds the cheapest edge that leaves the tree, which is the cut
          property applied to "tree" versus "rest". With a heap it looks a lot like Dijkstra, except that it compares a single edge weight,
          not a distance from the start.
        </p>
      </div>
      <Walkthrough
        title="Prim from A: always the cheapest edge leaving the tree"
        frames={p.frames}
        caption={`Same graph, same total (${p.total}). Entries whose far end is already in the tree are discarded when they come out of the queue.`}
      />
      <Recipe
        name="Prim's algorithm"
        when="you want to grow from one node, or the graph is dense (every pair of points can be joined)."
        steps={[
          'Mark a start node as in the tree. For a heap version, push all its edges; for an array version, set every other node\'s best connection to its edge weight (or ∞).',
          'Take the outside node with the cheapest connection (pop from the heap, skipping nodes already in the tree, or scan the array).',
          'Add it to the tree and add that cost to the total.',
          'Update: push its edges to outside nodes, or lower each outside node\'s best connection if this node offers a cheaper one.',
          'Repeat until all n nodes are in the tree.',
        ]}
        why="each step takes the lightest edge crossing the cut between the tree and the rest."
        time="O(E log E) with a heap, O(n²) with an array"
        space="O(n + E), or O(n) with an array"
      />
      <div className="prose">
        <p>
          On a <b>complete</b> graph, such as points in the plane where any two can be joined, there are about n²/2 edges. Sorting them
          for Kruskal costs <Cost>O(n² log n)</Cost> time and a lot of memory. The array version of Prim needs no edge list at all: it
          computes distances on the fly and runs in <Cost>O(n²)</Cost>.
        </p>
        <h3>Borůvka's algorithm, briefly</h3>
        <p>
          Borůvka works in rounds: every component picks its cheapest outgoing edge at the same time, all those edges are added, and the
          components merge. Each round at least halves the number of components, so there are at most log₂ n rounds of O(E) work. It is
          rarely needed in interviews, but it parallelises well and is the reason LeetCode tags some MST problems with its name.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Best for</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Kruskal</td><td>Edge lists, sparse graphs, anything you already sort</td><td>O(E log E)</td></tr>
          <tr><td>Prim with a heap</td><td>Adjacency lists, growing from a start node</td><td>O(E log E)</td></tr>
          <tr><td>Prim with an array</td><td>Complete or very dense graphs</td><td>O(n²)</td></tr>
          <tr><td>Borůvka</td><td>Parallel settings; rounds of cheapest outgoing edges</td><td>O(E log n)</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 3: Virtual nodes</h2>
        <p>
          Sometimes a node can be served on its own: a house can dig a well instead of taking a pipe. Add one imaginary node, the "water
          source", and an edge from it to every house with that house's well cost. Digging a well is now the same as connecting to the
          source, and the cheapest plan is an ordinary MST over the houses plus the source.
        </p>

        <h2>Pattern 4: Edges in every MST, or in some</h2>
        <p>
          An edge is <b>critical</b> if every MST uses it: leaving it out makes the minimum weight go up (or disconnects the graph). It is{' '}
          <b>pseudo-critical</b> if some MSTs use it but not all: forcing it in still gives the minimum weight. With small inputs, test each
          edge with one Kruskal run that skips it and one that forces it in first.
        </p>

        <h2>Pattern 5: Bottleneck paths</h2>
        <p>
          Between any two nodes, the path whose heaviest edge is as light as possible runs along a minimum spanning tree. That means
          Kruskal's order answers minimax questions directly: add edges from lightest upward, and the moment two nodes become connected,
          the edge just added is the smallest possible bottleneck between them. It is the union-find view of the minimax paths in{' '}
          <See id="shortest-path" />. Reverse the order (heaviest first, a maximum spanning tree) to maximise the weakest link instead.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Min Cost to Connect All Points</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          List every pair of points as an edge (about 500,000 for 1000 points), sort them, and run Kruskal. It works, but it sorts half a
          million edges and stores them all.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Most of those edges are never used: an MST keeps only 999 of them. And every distance can be computed on demand from the
          coordinates, so there is no need to store edges.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Prim's cut property: the cheapest connection from the tree to any outside point is safe to add. Keep, for each outside point, its
          cheapest connection so far; after adding a point, one pass over the others updates those values.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          n rounds, each scanning n points: <Cost>O(n²)</Cost> time and <Cost>O(n)</Cost> space. One point costs 0. Coordinates can be
          negative; the Manhattan distance |x₁ − x₂| + |y₁ − y₂| handles that.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Confusing the MST with shortest paths. An MST minimises the <b>total</b> weight of the network, not the distance between two particular nodes.</>,
          <>Forgetting to check that n − 1 edges were chosen. Otherwise a disconnected graph silently returns a forest's weight.</>,
          <>Losing original edge indices when sorting, in problems that ask which edges are critical.</>,
          <>Using path compression in a union-find that must remember link weights (the online bottleneck queries). It erases the history.</>,
          <>Building all n²/2 edges of a complete graph when an O(n²) Prim would need none.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Edges: A–B 1, B–C 2, A–C 2, C–D 3, B–D 4. Run Kruskal. Which edges are kept and what is the total?',
            solution: 'A–B 1 kept, B–C 2 kept, A–C 2 skipped (cycle), C–D 3 kept. Total 6.',
          },
          {
            task: 'In the graph above, is A–C (weight 2) in every MST, some MST, or none?',
            solution: 'Some MST: swapping B–C for A–C gives another tree of weight 6. It is pseudo-critical, and so is B–C.',
          },
          {
            task: 'Three houses with well costs 5, 2, 2 and pipes 1–2 cost 1, 2–3 cost 1. What is the cheapest plan?',
            hint: 'Add a source node 0 with edges 0–1 (5), 0–2 (2), 0–3 (2).',
            solution: 'Kruskal takes 1–2 (1), 2–3 (1), then one well edge of cost 2. Total 4: one well at house 2 or 3, and two pipes.',
          },
          {
            task: 'Edges: S–A 5, S–B 2, B–A 3, A–T 4, B–T 6. What is the smallest possible largest edge on a path from S to T?',
            solution: 'Add edges in order: S–B 2, B–A 3, then A–T 4 connects S and T. The bottleneck is 4 (path S–B–A–T).',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why can Kruskal skip an edge whose ends are already in the same component?',
            options: [
              'It is the most expensive edge on the cycle it would close, so a tree never needs it',
              'Its weight is negative',
              'It would disconnect the graph',
              'Union-find cannot handle it',
            ],
            answer: 0,
            why: 'Edges come in increasing order, so this edge is at least as heavy as every edge already on the path between its ends.',
          },
          {
            q: '1000 points, every pair can be connected. Which approach is the best fit?',
            options: ['Kruskal over all pairs', 'Prim with an O(n²) distance array', 'Dijkstra from every point', 'Floyd–Warshall'],
            answer: 1,
            why: 'A complete graph has about 500,000 edges. Prim with an array never builds them and runs in O(n²).',
          },
          {
            q: 'How do you model "each house may build its own well instead of taking a pipe"?',
            options: ['Remove the houses with cheap wells', 'Add a virtual source node with an edge to each house costing its well', 'Run Kruskal twice', 'Use the cheapest well for every house'],
            answer: 1,
            why: 'A well connects a house to water, just like an edge to an imaginary source; then it is an ordinary MST.',
          },
          {
            q: 'What is true about a minimum spanning tree?',
            options: [
              'It contains the shortest path between every pair of nodes',
              'It contains, between every pair of nodes, a path whose largest edge is as small as possible',
              'It is unique',
              'It always contains the lightest edge of every node',
            ],
            answer: 1,
            why: 'MSTs give optimal bottleneck paths, not shortest paths. They are unique only when all weights differ. Each node\'s lightest edge is in some MST, which is a different claim.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          LeetCode has only a handful of problems tagged with minimum spanning trees, and several need Premium. The classic free ones are
          marked Core; the bottleneck problems also train the idea from a different angle.
        </p>
      </div>
      <ProblemSet id="mst" />

      <Recap>
        <ul>
          <li>An MST connects all nodes with minimum total weight and has exactly n − 1 edges.</li>
          <li>The cut property makes greedy choices safe: the lightest edge across any cut is in some MST.</li>
          <li>Kruskal sorts edges and uses union-find; Prim grows one tree; on complete graphs, use Prim with an O(n²) array.</li>
          <li>Per-node costs become edges to a virtual node; critical edges are tested by skipping or forcing them.</li>
          <li>Minimax (bottleneck) paths run along the MST, so Kruskal's order answers them.</li>
        </ul>
      </Recap>
    </>
  );
}
