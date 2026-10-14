import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/network-flow';
import { bipartiteMatching, edmondsKarp } from '../traces/network-flow';
import { Walkthrough } from '../viz/Walkthrough';

const flow = edmondsKarp(
  ['s', 'a', 'b', 'c', 'd', 't'],
  [[0, 1, 10], [0, 3, 10], [1, 2, 4], [1, 3, 2], [1, 4, 8], [3, 4, 9], [4, 2, 6], [2, 5, 10], [4, 5, 10]],
  0,
  5,
  { 0: [0, 90], 1: [150, 0], 2: [300, 0], 3: [150, 180], 4: [300, 180], 5: [450, 90] },
);
const matching = bipartiteMatching(['L1', 'L2', 'L3'], ['R1', 'R2', 'R3'], [[0, 1], [0], [1, 2]]);

export default function NetworkFlow() {
  return (
    <>
      <TopicIntro
        id="network-flow"
        time="5–6 hours, plus problems"
        before={['bfs', 'shortest-path', 'bitmask']}
        learn={[
          'Flow networks, residual graphs and augmenting paths, and why "undoing" flow is essential',
          'Ford–Fulkerson, Edmonds–Karp and Dinic, plus what push-relabel and MPM do differently',
          'The max-flow min-cut theorem, and how to read a minimum cut off a finished flow',
          'Bipartite matching, König\'s theorem, the Hungarian algorithm and min-cost flow, and when bitmask DP is the better fit',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Water flows from a reservoir (the <b>source</b>) to a city (the <b>sink</b>) through pipes, and each pipe has a <b>capacity</b>,
          the most it can carry per second. Junctions store nothing, so what flows into a junction must flow out. How much water per second
          can reach the city? That number is the <b>maximum flow</b>.
        </p>
        <p>
          The natural greedy, "find any path with room and push as much as it allows, repeat", can get stuck below the optimum: an early path
          may use a pipe that a better arrangement needs for something else. The fix is the <b>residual graph</b>. For every pipe carrying
          flow f out of capacity c, it offers c − f units of room forwards and f units <i>backwards</i>, which means "cancel some of the flow
          you sent here and send it another way". An <b>augmenting path</b> is a source-to-sink path in the residual graph. Push along
          augmenting paths until none is left, and the flow is maximum. That loop is the Ford–Fulkerson method.
        </p>
        <p>
          Choosing each augmenting path with BFS (the fewest edges) is <b>Edmonds–Karp</b>, which needs at most <Cost>O(V · E)</Cost>{' '}
          augmentations, so <Cost>O(V · E²)</Cost> in total, however large the capacities are.
        </p>
      </div>

      <Walkthrough
        title="Edmonds–Karp: shortest augmenting paths until none is left"
        frames={flow.frames}
        caption="Edge labels are flow / capacity. Indigo edges are the augmenting path just found (amber marks a step that cancels earlier flow); once the flow is pushed, those edges turn green. Full edges are grey. In the last frame, blue nodes are still reachable from the source and the red edges form the minimum cut."
      />

      <Box kind="key" label="Key idea">
        <p>
          <b>Max-flow min-cut theorem</b>: the maximum flow equals the smallest total capacity of edges you would have to cut to separate the
          source from the sink. When no augmenting path is left, the nodes still reachable from the source in the residual graph form one side
          of such a minimum cut. So one algorithm answers two questions: how much can get through, and what is the cheapest way to block it.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to flows and matchings. All signals are collected in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Paired edge arrays', ts: 'to: number[], cap: number[], head: number[], next: number[]', ops: 'add edge O(1); reverse edge is index XOR 1', use: 'Store each edge next to its reverse, so pushing flow updates both in O(1).' },
          { name: 'Capacity matrix', ts: 'number[][] (n × n)', ops: 'O(1) per access', use: 'Small networks (n up to a few hundred), where simplicity beats memory.' },
          { name: 'Queue', ts: 'array with a head index', ops: 'O(1)', use: 'BFS for shortest augmenting paths (Edmonds–Karp) and level graphs (Dinic, Hopcroft–Karp).' },
          { name: 'Level and iterator arrays', ts: 'number[] (two of them)', ops: 'O(1)', use: "Dinic: each node's BFS level, and which edge to try next so dead edges are never retried." },
          { name: 'Matching arrays', ts: 'number[] for each side, −1 when unmatched', ops: 'O(1)', use: 'Bipartite matching: who is paired with whom.' },
          { name: 'DP array over subsets', ts: 'number[] of length 2ⁿ', ops: 'O(1) per state', use: 'Assignment and matching problems with one side of at most about 15.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Max flow and min cut</h2>
      </div>
      <Recipe
        name="Edmonds–Karp"
        when="you need a maximum flow on a moderate network, or a minimum cut."
        steps={[
          'Build the network with a reverse edge of capacity 0 for every edge.',
          'BFS from the source over edges with remaining capacity, remembering how each node was reached.',
          'If the sink is unreachable, stop: the flow is maximum, and the nodes the BFS reached form the source side of a minimum cut.',
          'Otherwise walk back from the sink to find the path and its bottleneck (smallest remaining capacity).',
          'Push the bottleneck: subtract it from each forward edge and add it to each reverse edge. Add it to the total and repeat.',
        ]}
        why="each augmentation keeps the flow valid, and when no augmenting path exists the reachable set defines a cut whose capacity equals the flow."
        time="O(V · E²)"
        space="O(V + E)"
      />

      <div className="prose">
        <h3>Faster algorithms, in one paragraph each</h3>
        <p>
          <b>Dinic's algorithm</b> works in phases. A BFS labels every node with its distance from the source (its level). Then DFS pushes
          flow only along edges that go from one level to the next, until no such path remains (a <i>blocking flow</i>), keeping a pointer per
          node so dead edges are never retried. Each phase increases the source-to-sink distance, so there are at most V phases:{' '}
          <Cost>O(V² · E)</Cost> in general and <Cost>O(E √V)</Cost> on bipartite matching networks (where it does the same work as
          Hopcroft–Karp).
        </p>
        <p>
          <b>MPM</b> (Malhotra, Pramodh-Kumar and Maheshwari) also uses Dinic's level graph, but finds each blocking flow differently: it picks
          the node that can pass the least flow through it (its potential), pushes exactly that much forward to the sink and pulls it back from
          the source, then removes the saturated node. That gives <Cost>O(V³)</Cost> overall.
        </p>
        <p>
          <b>Push-relabel</b> turns the idea around. It floods the network with a <i>preflow</i> that lets nodes hold excess water, gives each
          node a height, and repeatedly pushes excess "downhill" to lower neighbours or raises (relabels) a node that is stuck. When no node has
          excess, the preflow is a maximum flow. Its basic form runs in <Cost>O(V² · E)</Cost>, and refined versions in{' '}
          <Cost>O(V³)</Cost>. In interviews you will be asked to explain these ideas, not to code them.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Algorithm</th>
            <th>Idea</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Ford–Fulkerson (DFS)</td><td>Any augmenting path</td><td>O(E · maxflow), integer capacities</td></tr>
          <tr><td>Edmonds–Karp</td><td>Shortest augmenting path by BFS</td><td>O(V · E²)</td></tr>
          <tr><td>Dinic</td><td>Level graph plus blocking flows</td><td>O(V² · E); O(E √V) for bipartite matching</td></tr>
          <tr><td>MPM</td><td>Blocking flow by node potentials</td><td>O(V³)</td></tr>
          <tr><td>Push-relabel</td><td>Preflow, heights, local pushes</td><td>O(V² · E), or O(V³) with FIFO selection</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 2: Bipartite matching</h2>
        <p>
          Two groups, and allowed pairs between them (boys and girls who are friends, workers and jobs they can do). A <b>matching</b> picks
          pairs so that nobody is used twice. Add a source joined to every left node and a sink joined from every right node, all with
          capacity 1, and the maximum flow is the maximum matching. In practice you skip the network and search for augmenting paths
          directly: a left node takes a free partner, or asks a matched partner's current mate to move elsewhere.
        </p>
      </div>
      <Walkthrough
        title="Augmenting paths grow a matching one pair at a time"
        frames={matching.frames}
        caption="Green edges are matched pairs. An indigo edge is a pair being claimed. An amber edge leads to a partner who is already taken, so that partner's current mate (also amber) is asked to move; a mate who cannot move turns red."
      />
      <Recipe
        name="Augmenting-path matching (Kuhn's algorithm)"
        when="you need a maximum bipartite matching on a graph of a few thousand edges."
        steps={[
          'Mark every right node as unmatched.',
          'For each left node u, start a DFS with a fresh visited set.',
          'For each right node v that u likes and that is not yet visited in this search: mark it visited. If v is free, or the left node matched to v can recursively find another partner, match u with v and report success.',
          'Count the left nodes whose search succeeded.',
        ]}
        why="each success flips the edges along an alternating path, adding one pair; when no left node can find a path, Berge's theorem says the matching is maximum."
        time="O(V · E)"
        space="O(V)"
      />
      <div className="prose">
        <p>
          <b>Hopcroft–Karp</b> speeds this up by finding many shortest augmenting paths per phase with one BFS and one DFS sweep, in{' '}
          <Cost>O(E √V)</Cost>. And matchings answer two other questions for free, thanks to <b>König's theorem</b>: in a bipartite graph,
          the minimum vertex cover (fewest nodes touching every edge) equals the maximum matching, and the maximum independent set (most nodes
          with no edge between them) is V minus the maximum matching. Grids are bipartite under chessboard colouring, which is why "remove the
          fewest cells so no two 1s touch" is a matching problem.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 3: Assignment problems</h2>
        <p>
          When every pair has a cost and everyone on one side must be paired, you want a minimum-cost <b>perfect matching</b>, also called
          the assignment problem. The <b>Hungarian algorithm</b> solves it in <Cost>O(n³)</Cost>. It keeps a price (potential) for every
          row and column so that, after subtracting prices, every cost is non-negative and the pairs it uses cost exactly zero; it then grows
          the matching along zero-cost edges and adjusts prices whenever it gets stuck.
        </p>
        <p>
          Look at the limits before reaching for it. LeetCode's assignment problems have n between 8 and 14, which is designed for{' '}
          <b>bitmask DP</b>: assign the left side in order, keep the set of right nodes already used as a bitmask, and the state count is
          2ⁿ. That is a few lines of logic instead of a delicate algorithm. See <See id="bitmask" /> for the technique.
        </p>
      </div>
      <Recipe
        name="Assignment by bitmask DP"
        when="you must pair n items with n (or more) others at minimum or maximum total cost, and n is at most about 15."
        steps={[
          'dp[set] = best total when the first k left items (k = size of set) are assigned exactly the right items in set; dp[empty] = 0.',
          'Process sets in increasing order. From each set, the next left item is number k; try every right item not in the set.',
          'Update dp[set plus that item] with dp[set] + cost of the pair.',
          'The answer is dp of the full set (or the best set of size n, if the right side is larger).',
        ]}
        why="the order in which left items are assigned does not matter, so the set of used right items is all the state you need."
        time="O(n · 2ⁿ)"
        space="O(2ⁿ)"
      />

      <div className="prose">
        <h2>Pattern 4: Min-cost flow</h2>
        <p>
          Give every edge a cost per unit as well as a capacity, and ask for a flow of a given size at the lowest total cost. The{' '}
          <b>successive shortest path</b> algorithm repeats one step: find the cheapest augmenting path in the residual graph (reverse edges
          carry negative cost, so use Bellman–Ford, or Dijkstra with node potentials) and push flow along it. Assignment is the special case where
          every capacity is 1. As with matching, LeetCode's min-cost-flow problems have small limits and are usually solved with bitmask DP; the
          flow model is how you recognise the structure.
        </p>

        <h2>Pattern 5: Counting matchings</h2>
        <p>
          Flow algorithms find <i>one</i> best matching; they cannot count how many perfect matchings exist. Counting is a DP problem. If one
          side is small (10 people, 40 hats), make the small side the bitmask and walk through the large side one item at a time.
        </p>
      </div>

      <div className="prose">
        <h2>Choose by the constraints</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Problem shape</th>
            <th>Small limits (n ≤ about 15)</th>
            <th>Large limits</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Maximum matching</td><td>Bitmask DP or Kuhn</td><td>Kuhn, then Hopcroft–Karp</td></tr>
          <tr><td>Minimum vertex cover / maximum independent set on a bipartite graph</td><td>Bitmask DP by rows</td><td>König: maximum matching</td></tr>
          <tr><td>Assignment (min-cost perfect matching)</td><td>Bitmask DP over the used side</td><td>Hungarian, O(n³)</td></tr>
          <tr><td>Min-cost flow</td><td>Bitmask DP</td><td>Successive shortest paths</td></tr>
          <tr><td>Count perfect matchings</td><td>Bitmask DP over the small side</td><td>Hard in general</td></tr>
          <tr><td>Supply and demand with unlimited cross links</td><td colSpan={2}>Often a simple greedy (as in Find Valid Matrix)</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Maximum Students Taking Exam</h2>
        <Step n={1}>Brute force first</Step>
        <p>Try every subset of good seats: up to 2⁶⁴ subsets for an 8 × 8 room. Impossible.</p>
        <Step n={2}>Find the waste</Step>
        <p>
          Conflicts only involve the same row and the row directly above. So a row's choice depends only on the row above it, and a row has at
          most 2⁸ = 256 seatings.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Keep, for each valid seating of the current row, the best total so far. A seating is valid when it uses good seats and has no two
          students side by side; it is compatible with the previous row's seating when nobody has a student at the upper-left or upper-right.
          The flow view confirms the structure: every conflict joins two columns of different parity, so the conflict graph is bipartite, and
          the answer is good seats minus the maximum matching.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          8 rows × 256 × 256 pairs of masks is about half a million checks. A room with no good seats gives 0. Seats directly in front or behind
          never conflict.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Forgetting reverse edges. Without them the greedy can get stuck below the maximum flow.</>,
          <>Updating only the forward edge when pushing. The reverse edge must gain exactly what the forward edge loses.</>,
          <>Running plain DFS Ford–Fulkerson on huge capacities. Its running time depends on the flow value; use BFS (Edmonds–Karp) or Dinic.</>,
          <>Reusing the visited set across left nodes in Kuhn's algorithm. Reset it for each search.</>,
          <>Applying König's theorem to a non-bipartite graph. It only holds for bipartite graphs.</>,
          <>Building a flow network when the limits (n ≤ 14) clearly invite bitmask DP.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Network: s→a 3, s→b 2, a→b 1, a→t 2, b→t 3. What is the maximum flow, and which edges form a minimum cut?',
            solution: 'Maximum flow 5: send 2 along s→a→t, 1 along s→a→b→t and 2 along s→b→t. Cut: s→a (3) and s→b (2) have total capacity 5.',
          },
          {
            task: 'Left nodes 1, 2, 3; right nodes A, B. Allowed pairs: 1–A, 2–A, 3–A, 3–B. What is the maximum matching size?',
            solution: '2 (for example 1–A and 3–B). The right side has only two nodes.',
          },
          {
            task: 'A bipartite graph has 10 nodes and a maximum matching of size 4. What are the minimum vertex cover and the maximum independent set?',
            solution: 'By König, the minimum vertex cover is 4, and the maximum independent set is 10 − 4 = 6.',
          },
          {
            task: 'Costs to assign workers W1, W2 to jobs J1, J2: W1: (4, 1), W2: (2, 5). What is the cheapest assignment?',
            solution: 'W1→J2 (1) and W2→J1 (2), total 3. The other option costs 4 + 5 = 9.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why does the residual graph contain backward edges?',
            options: [
              'To make the graph undirected',
              'So an augmenting path can cancel flow sent earlier and reroute it',
              'To double the capacity',
              'They are only needed for negative capacities',
            ],
            answer: 1,
            why: 'Early choices can block the optimum; backward edges let later paths undo them.',
          },
          {
            q: 'Edmonds–Karp finishes. Which nodes form the source side of a minimum cut?',
            options: ['All nodes adjacent to the source', 'The nodes still reachable from the source in the residual graph', 'The nodes on the last augmenting path', 'The nodes with the most flow'],
            answer: 1,
            why: 'Every edge leaving that set is full, and every edge entering it carries no flow, so its capacity equals the flow.',
          },
          {
            q: 'In a bipartite graph, the maximum matching has size 7. What is the minimum vertex cover?',
            options: ['7', '14', 'V − 7', 'It cannot be determined'],
            answer: 0,
            why: "König's theorem: in bipartite graphs, minimum vertex cover equals maximum matching.",
          },
          {
            q: 'An assignment problem with 12 workers and 12 jobs appears on LeetCode. What is the most practical approach?',
            options: ['Try all 12! assignments', 'Bitmask DP over the set of jobs already used', 'Dijkstra', 'A greedy that takes the cheapest pair first'],
            answer: 1,
            why: '2¹² = 4096 states with 12 transitions each is tiny; 12! is about 479 million and greedy is wrong.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          The problems below carry LeetCode's flow and matching tags. For each one, first say which flow model fits, then check the limits and
          decide whether that model or bitmask DP is the practical solution. Several need Premium.
        </p>
      </div>
      <ProblemSet id="network-flow" />

      <Recap>
        <ul>
          <li>Maximum flow pushes along augmenting paths in the residual graph; backward edges let you undo earlier choices.</li>
          <li>Edmonds–Karp uses BFS paths (O(V · E²)); Dinic uses level graphs and blocking flows; push-relabel works locally with heights.</li>
          <li>Max flow equals min cut; the nodes reachable at the end form the source side of the cut.</li>
          <li>Bipartite matching is unit-capacity flow; König turns it into vertex covers and independent sets.</li>
          <li>Assignment and min-cost flow have exact algorithms (Hungarian, successive shortest paths), but small LeetCode limits usually mean bitmask DP.</li>
        </ul>
      </Recap>
    </>
  );
}
