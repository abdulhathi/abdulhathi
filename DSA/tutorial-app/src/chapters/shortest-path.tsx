import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/shortest-path';
import { bellmanFordRounds, dijkstra, floydWarshall } from '../traces/shortest-path';
import { Walkthrough } from '../viz/Walkthrough';

const dij = dijkstra(
  ['A', 'B', 'C', 'D', 'E', 'F'],
  [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 5], [2, 3, 8], [2, 4, 10], [3, 4, 2], [3, 5, 6], [4, 5, 3]],
  0,
  { 0: [0, 70], 1: [140, 0], 2: [140, 140], 3: [280, 0], 4: [280, 140], 5: [420, 70] },
);
const bf = bellmanFordRounds(
  4,
  [[0, 1, 100], [1, 2, 100], [2, 3, 100], [0, 2, 500], [1, 3, 600]],
  0,
  3,
  1,
  { 0: [0, 70], 1: [160, 0], 2: [160, 140], 3: [320, 70] },
);
const fw = floydWarshall(['A', 'B', 'C', 'D', 'E'], [[0, 1, 3], [1, 2, 1], [0, 2, 7], [2, 3, 2], [0, 3, 12], [3, 4, 1], [1, 4, 9]]);

export default function ShortestPath() {
  return (
    <>
      <TopicIntro
        id="shortest-path"
        time="5–6 hours, plus problems"
        before={['bfs', 'heap', 'graph']}
        learn={[
          'How to pick the right algorithm: BFS, 0-1 BFS, Dijkstra, Bellman–Ford or Floyd–Warshall',
          'Dijkstra with a min-heap and lazy deletion, and exactly why negative edges break it',
          'Bellman–Ford in rounds, including the "at most k edges" trick for stop limits',
          'Minimax paths, state-expanded graphs, counting shortest paths and the second shortest path',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A map app finds the fastest route even though roads have different lengths. <See id="bfs" /> already finds shortest paths
          when every edge counts the same, because it explores in rings of 1 edge, 2 edges, 3 edges. Once edges have <b>weights</b>, a
          route with more edges can be shorter, and BFS gives wrong answers.
        </p>
        <p>
          <b>Dijkstra's algorithm</b> keeps the ring idea but measures rings by distance instead of edge count. It always expands the
          unsettled node closest to the start. With non-negative weights that node's distance is final: any other route to it must
          leave the settled region through a node that is at least as far away, and adding non-negative edges cannot make it shorter.
          A min-heap finds the closest node quickly, giving <Cost>O(E log E)</Cost>.
        </p>
        <p>
          Trying every route instead would be exponential: the number of simple paths in a graph can grow like n!. Shortest-path
          algorithms avoid that by reusing the best distance to each node.
        </p>
      </div>

      <Walkthrough
        title="Dijkstra from A"
        frames={dij.frames}
        caption="d is the best distance found so far. The indigo node has just been popped, and its indigo edges are the ones being relaxed; amber nodes just improved; grey nodes are settled for good. Green edges record how each node was best reached. A red queue entry is stale and skipped."
      />

      <Box kind="key" label="Key idea">
        <p>
          Dijkstra's rule, "settle the closest unsettled node", is safe only when no edge can make a route cheaper later, which means
          no negative weights. Everything else in this chapter is about what to do when that condition, or the "one best value per
          node" assumption, does not hold.
        </p>
      </Box>

      <div className="prose">
        <h2>Which algorithm?</h2>
        <p>Choosing correctly is half the problem. Read the weights and the size of the graph first.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Algorithm</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>All edges weigh the same</td><td>BFS</td><td>O(V + E)</td></tr>
          <tr><td>Weights are only 0 and 1</td><td>0-1 BFS (deque)</td><td>O(V + E)</td></tr>
          <tr><td>Non-negative weights, one source</td><td>Dijkstra (min-heap)</td><td>O(E log E)</td></tr>
          <tr><td>A DAG (no cycles), any weights</td><td>DP in topological order (<See id="topological-sort" />)</td><td>O(V + E)</td></tr>
          <tr><td>Negative weights, or a limit on the number of edges</td><td>Bellman–Ford</td><td>O(V · E), or O(k · E) for k rounds</td></tr>
          <tr><td>Every pair, V up to a few hundred</td><td>Floyd–Warshall</td><td>O(V³)</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to a shortest-path algorithm. All signals are collected in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Weighted adjacency list', ts: 'Array<[number, number][]> (neighbour, weight)', ops: 'visit neighbours O(degree)', use: 'The graph for Dijkstra, BFS and Bellman–Ford.' },
          { name: 'Min-heap (priority queue)', ts: 'no built-in: write a small binary heap over [distance, node] pairs', ops: 'push and pop O(log n), peek O(1)', use: 'Dijkstra: always pop the closest unsettled node. See the Heaps chapter.' },
          { name: 'Distance array', ts: 'number[] filled with Infinity', ops: 'O(1)', use: 'Best distance found so far; also the check for stale heap entries.' },
          { name: 'Deque', ts: 'circular buffer over an array, or two arrays', ops: 'push and pop at both ends O(1)', use: '0-1 BFS: free moves to the front, paid moves to the back.' },
          { name: 'Distance matrix', ts: 'number[][] (n × n)', ops: 'O(1)', use: 'Floyd–Warshall and all-pairs queries.' },
          { name: 'Edge list', ts: 'Array<[number, number, number]>', ops: 'scan O(E)', use: 'Bellman–Ford relaxes every edge in each round.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Dijkstra</h2>
        <p>
          TypeScript has no priority queue, so you push pairs onto a hand-written binary heap. Instead of updating an entry when a
          distance improves (a "decrease-key" that binary heaps do not support well), push a new entry and leave the old one in place.
          When an entry comes out whose distance is larger than the node's best, it is <b>stale</b>: skip it. This is called lazy
          deletion, and it is how almost everyone writes Dijkstra.
        </p>
      </div>
      <Recipe
        name="Dijkstra with lazy deletion"
        when="weights are non-negative and you need distances from one start node."
        steps={[
          'Set every distance to ∞, the start to 0, and push (0, start) onto a min-heap.',
          'Pop the entry with the smallest distance. If it is larger than the node\'s recorded distance, it is stale: skip it.',
          'Otherwise the node is settled. If it is the target, you may stop here.',
          'For each edge to a neighbour, if distance + weight beats the neighbour\'s distance, record the new value and push it.',
          'Repeat until the heap is empty.',
        ]}
        why="with non-negative weights, the closest unsettled node cannot be reached more cheaply through nodes that are farther away."
        time="O(E log E)"
        space="O(V + E)"
      />
      <div className="prose">
        <p>
          Many problems bolt extra information onto Dijkstra. Keep a <b>count</b> per node (reset on a better distance, add on an equal one)
          to count shortest routes. Run it <b>from the target</b> on reversed edges to get every node's distance to the target. Run it{' '}
          <b>three times</b> and combine the results when two routes must meet. Multiply probabilities with a max-heap when the best path
          is the most likely one.
        </p>
        <h3>Why negative edges break it</h3>
        <p>
          Take edges A→B weight 2, A→C weight 3, C→B weight −2. Dijkstra settles B at 2 first, because it is the closest. Later it
          discovers A→C→B costs 1, but B is already final. One negative edge broke the guarantee. If negative weights are possible, use
          Bellman–Ford.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 2: Minimax paths</h2>
        <p>
          Sometimes a route's cost is its <b>worst step</b>: the largest height difference, the highest water level, the heaviest edge.
          Dijkstra still works if you replace "distance + weight" with "max(cost so far, weight)", because a maximum, like a sum of
          non-negative numbers, never decreases as a route grows. Two other tools solve the same problems: binary search on the answer
          with a BFS check, and union-find adding edges from cheapest upwards until start and end connect (the same idea that builds a{' '}
          <See id="mst" />).
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 3: States beyond the node</h2>
        <p>
          Plain Dijkstra stores one best value per node. That breaks when the route itself has a limit. In Cheapest Flights Within K
          Stops, the cheapest way to reach a city might already use too many stops, while a pricier way with fewer stops is the only
          one that can continue. The fix is to put the limit into the state.
        </p>
        <p>
          The cleanest version for a stop limit is <b>Bellman–Ford in rounds</b>: round r relaxes every edge once, reading from a copy
          of the previous round, so after round r you know the cheapest price using at most r edges.
        </p>
      </div>
      <Walkthrough
        title="Cheapest price with at most 1 stop (2 flights)"
        frames={bf.frames}
        caption="Each row is one round. Without the limit the cheapest route 0 → 1 → 2 → 3 costs 300, but it needs 2 stops."
      />
      <Recipe
        name="Bellman–Ford"
        when="weights may be negative, or the number of edges on the route is limited."
        steps={[
          'Set every distance to ∞ and the start to 0.',
          'Repeat V − 1 times (or k + 1 times for an edge limit): copy the distances, then for every edge (u, v, w) set copy[v] to the smaller of copy[v] and dist[u] + w; then replace dist with the copy.',
          'For negative-cycle detection, run one more round: if anything still improves, a negative cycle is reachable.',
        ]}
        why="a shortest path without cycles has at most V − 1 edges, and round r settles every path of up to r edges."
        time="O(V · E)"
        space="O(V)"
      />
      <div className="prose">
        <p>
          Other limits work the same way. With a time budget, make the state (city, time used) and fill a table in increasing time. With
          signals or waiting rules, check whether the arrival time depends only on the number of edges; if so, BFS on lengths is enough.
          For the <b>second</b> (or k-th) shortest route, let each node be reached up to k times with different values: that is the{' '}
          <i>K shortest path</i> idea, and Second Minimum Time to Reach Destination needs just two values per node.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 4: 0-1 BFS</h2>
        <p>
          If every edge weighs 0 or 1, you can drop the heap. Keep a deque: when you relax a free edge push the neighbour to the{' '}
          <b>front</b>, when you relax a paid edge push it to the <b>back</b>. The deque then always holds nodes in order of distance
          (at most two different values at a time), so popping from the front behaves like Dijkstra in linear time. Grid problems where
          following an arrow is free and changing it costs one, or where empty cells are free and obstacles cost one, are classic
          cases. The <See id="bfs" /> chapter covers this from the BFS side.
        </p>
      </div>
      <Recipe
        name="0-1 BFS"
        when="every edge weighs 0 or 1."
        steps={[
          'Set every distance to ∞, the start to 0, and put the start in a deque.',
          'Pop a node from the front.',
          'For each edge: if distance + weight improves the neighbour, record it and push the neighbour to the front if the weight is 0, or to the back if it is 1.',
          'Repeat until the deque is empty.',
        ]}
        why="the deque stays sorted by distance, so the front always holds a closest unsettled node."
        time="O(V + E)"
        space="O(V)"
      />

      <div className="prose">
        <h2>Pattern 5: All pairs with Floyd–Warshall</h2>
        <p>
          When you need distances between <i>every</i> pair and there are at most a few hundred nodes, Floyd–Warshall is simplest. Its
          idea: allow intermediate stops one node at a time. After allowing nodes 1..k, d[i][j] is the shortest route that only stops at
          those nodes. Adding node k+1 means checking, for every pair, whether going through it is shorter.
        </p>
      </div>
      <Walkthrough
        title="Floyd–Warshall on five nodes"
        frames={fw.frames}
        caption="Blue: the row and column of the node now allowed as a stop. Green: entries that improved this round."
      />
      <Recipe
        name="Floyd–Warshall"
        when="you need all-pairs distances and n is small (n³ steps must fit)."
        steps={[
          'Fill an n × n table with edge weights, 0 on the diagonal and ∞ for missing edges.',
          'For each intermediate node k (outermost loop), for each i, for each j: set d[i][j] to the smaller of d[i][j] and d[i][k] + d[k][j].',
          'Read any pair\'s distance from the table. A negative number on the diagonal means a negative cycle.',
        ]}
        why="after round k, d[i][j] is the shortest route whose intermediate stops are all among the first k nodes."
        time="O(n³)"
        space="O(n²)"
      />

      <div className="prose">
        <h2>Worked example: Cheapest Flights Within K Stops</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Explore every route with at most k + 1 flights by DFS. With 100 cities, the number of routes explodes, so you need to share work
          between routes.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Many routes reach the same city with the same number of flights; only the cheapest of them matters. But you cannot keep just one
          value per city, as plain Dijkstra does: the cheapest arrival might have used up the stops.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Keep, for each city, the cheapest price using at most r flights, for r = 0, 1, …, k + 1. Round r + 1 is computed from round r by
          trying every flight once. Reading from a copy of round r guarantees each round adds at most one flight.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          k + 1 rounds over E flights: <Cost>O(k · E)</Cost>, at most 100 × 5000 here. If dst is still ∞ at the end, return −1. A
          heap-based alternative keeps (price, city, stops) states and allows revisiting a city with fewer stops.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Using Dijkstra with negative edges. It settles nodes too early and gives wrong answers.</>,
          <>Forgetting to skip stale heap entries. The algorithm still works but can run far slower, and code that "settles" a node twice may double-count.</>,
          <>Marking a node visited when you <b>push</b> it instead of when you <b>pop</b> it. That locks in the first distance found, not the best.</>,
          <>Updating Bellman–Ford in place when the number of edges is limited. Read from a copy of the previous round.</>,
          <>Putting the intermediate node k in an inner loop of Floyd–Warshall. It must be outermost.</>,
          <>Overflowing distances in languages with 32-bit integers. TypeScript numbers are exact up to 2⁵³, so sums of 10⁹-sized weights are safe.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Edges (undirected): S–A 2, S–B 5, A–B 1, A–C 6, B–C 2. Run Dijkstra from S and give the order nodes are settled and their distances.',
            solution: 'S 0, then A 2, then B 3 (through A), then C 5 (through B).',
          },
          {
            task: 'Directed edges: S→A 4, S→B 5, B→A −3. A version of Dijkstra that never changes a settled node reports what distance for A? What is the true shortest distance?',
            solution: 'Dijkstra settles A at 4 before it processes B (4 is smaller than 5). The true distance is 2, through S → B → A. One negative edge broke the "closest is final" rule; use Bellman–Ford when weights can be negative.',
          },
          {
            task: 'Flights: 0→1 50, 1→2 50, 0→2 120, 2→3 10. Cheapest from 0 to 3 with at most 1 stop?',
            solution: 'Routes with at most 2 flights: 0→2→3 = 130. The route 0→1→2→3 = 110 needs 2 stops, so the answer is 130.',
          },
          {
            task: 'A route\'s effort is its largest height step. Heights along two routes: 1, 3, 5, 8 and 1, 2, 7, 8. Which has lower effort?',
            solution: 'Steps of the first: 2, 2, 3, so effort 3. Steps of the second: 1, 5, 1, so effort 5. Both climb 7 in total, but effort only looks at the largest step, so the first route wins.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'All edge weights are 1. What is the simplest correct algorithm for single-source shortest paths?',
            options: ['Dijkstra', 'BFS', 'Bellman–Ford', 'Floyd–Warshall'],
            answer: 1,
            why: 'With equal weights, distance equals the number of edges, and BFS visits nodes in exactly that order in O(V + E).',
          },
          {
            q: 'In Dijkstra with lazy deletion, you pop (7, X) but dist[X] is already 5. What do you do?',
            options: ['Update dist[X] to 7', 'Skip the entry: it is stale', 'Push X again', 'Stop the algorithm'],
            answer: 1,
            why: 'A better entry for X was processed earlier. This one is left over from before the improvement.',
          },
          {
            q: 'Why can plain Dijkstra fail on "cheapest route with at most k stops"?',
            options: [
              'Prices can be negative',
              'Keeping only the cheapest price per city can discard a pricier route that still has stops left',
              'The graph is directed',
              'Dijkstra cannot handle 100 nodes',
            ],
            answer: 1,
            why: 'The limit makes "stops used" part of the state. Bellman–Ford rounds or (city, stops) states fix it.',
          },
          {
            q: 'Which loop must be outermost in Floyd–Warshall?',
            options: ['The source i', 'The destination j', 'The intermediate node k', 'Any order works'],
            answer: 2,
            why: 'The correctness argument adds one allowed intermediate node per round, so k must change slowest.',
          },
          {
            q: 'Weights are 0 or 1. Which structure replaces the heap?',
            options: ['A stack', 'A deque, front for 0 and back for 1', 'A hash map', 'A sorted array'],
            answer: 1,
            why: 'Pushing free moves to the front keeps the deque ordered by distance.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Write one Dijkstra you trust, with a small binary heap and stale-entry skipping, and reuse it. Before coding each problem, decide
          which row of the "Which algorithm?" table it belongs to.
        </p>
      </div>
      <ProblemSet id="shortest-path" />

      <Recap>
        <ul>
          <li>Equal weights: BFS. Weights 0/1: 0-1 BFS. Non-negative: Dijkstra. Negative or limited edges: Bellman–Ford. All pairs on small n: Floyd–Warshall. DAG: DP in topological order.</li>
          <li>Dijkstra settles the closest unsettled node; push duplicates and skip stale entries instead of decreasing keys.</li>
          <li>Minimax costs work in Dijkstra too, with max in place of plus.</li>
          <li>When the route has a limit, put the limit in the state, or run Bellman–Ford in rounds from a copy.</li>
          <li>Extra values ride along: counts of shortest routes, second-best distances, distances from the target on reversed edges.</li>
        </ul>
      </Recap>
    </>
  );
}
