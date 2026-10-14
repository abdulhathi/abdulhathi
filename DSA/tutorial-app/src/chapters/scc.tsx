import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/scc';
import { kosaraju } from '../traces/scc';
import { Walkthrough } from '../viz/Walkthrough';

const run = kosaraju(
  8,
  [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3], [6, 5], [6, 7], [7, 6]],
  { 0: [0, 0], 1: [120, 60], 2: [0, 120], 3: [240, 60], 4: [360, 0], 5: [360, 120], 6: [500, 120], 7: [500, 0] },
);

export default function Scc() {
  return (
    <>
      <TopicIntro
        id="scc"
        time="3 hours, plus problems"
        before={['dfs', 'graph', 'topological-sort']}
        learn={[
          'What a strongly connected component is, and why shrinking each one leaves a graph with no cycles',
          "Kosaraju's algorithm: two depth-first passes, the second on the reversed graph",
          "Tarjan's algorithm: one pass with discovery times, low-links and a stack",
          'Functional graphs, where every node has one outgoing edge, and the simple tricks they allow',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Imagine a city of one-way streets. Some neighbourhoods are "round trips": from any corner you can drive to any other corner and
          come back. Between neighbourhoods, though, traffic may only flow one way. Those round-trip neighbourhoods are the{' '}
          <b>strongly connected components</b> (SCCs) of a directed graph: maximal groups of nodes in which every node can reach every
          other.
        </p>
        <p>
          The payoff comes when you shrink each component to a single node. The resulting <b>condensation</b> graph has no cycles at all:
          if two components could reach each other, they would be one component. So any question that was awkward because of cycles
          becomes a question about a DAG, where <See id="topological-sort" /> and DP work.
        </p>
        <p>
          Checking every pair of nodes for mutual reachability would cost a search per node, <Cost>O(V · (V + E))</Cost>. Kosaraju and
          Tarjan find all components in <Cost>O(V + E)</Cost>.
        </p>
      </div>

      <Walkthrough
        title="Kosaraju's two passes"
        frames={run.frames}
        caption="Pass 1 records finish order on the original graph. Pass 2 walks the reversed graph, starting from the latest finisher each time; each walk is one component."
      />

      <Box kind="key" label="Key idea">
        <p>
          In the first pass, the node that finishes last always belongs to a "source" component of the condensation, one nothing else
          reaches. Reversing every edge turns it into a sink: a DFS from it in the reversed graph cannot leak into any other unassigned
          component, so it collects exactly its own component. Repeat with the next latest finisher.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to strongly connected components. All signals are collected in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Adjacency list and its reverse', ts: 'number[][] twice', ops: 'build O(V + E)', use: "Kosaraju's two passes: the original graph, then every edge flipped." },
          { name: 'Finish stack', ts: 'number[] used as a stack', ops: 'push and pop O(1)', use: 'Pass 1 of Kosaraju: nodes in the order they finish.' },
          { name: 'Component id array', ts: 'number[] filled with −1', ops: 'O(1)', use: 'Which component each node belongs to; also the "visited" mark in pass 2.' },
          { name: 'Discovery and low-link arrays', ts: 'number[] (two of them)', ops: 'O(1)', use: "Tarjan's algorithm: when a node was found, and the earliest node its subtree can reach." },
          { name: 'Next-pointer array', ts: 'number[] (edges[i] or favourite[i])', ops: 'O(1)', use: 'Functional graphs: the single outgoing edge of each node.' },
        ]}
      />

      <div className="prose">
        <h2>Kosaraju's algorithm</h2>
      </div>
      <Recipe
        name="Kosaraju (two passes)"
        when="you need all strongly connected components and want the easiest algorithm to get right."
        steps={[
          'Pass 1: run DFS over the whole original graph and push each node onto a stack when it finishes.',
          'Build the reversed graph (flip every edge).',
          'Pass 2: pop nodes from the stack. For each node not yet assigned, run a DFS in the reversed graph that only enters unassigned nodes, and give every node it reaches the same new component id.',
          'Each pass-2 DFS is exactly one component, and components come out in topological order of the condensation.',
        ]}
        why="the latest finisher lies in a source component; in the reversed graph that component is a sink, so the DFS cannot escape it."
        time="O(V + E)"
        space="O(V + E)"
      />

      <div className="prose">
        <h2>Tarjan's algorithm</h2>
        <p>
          Tarjan finds the components in a single DFS. Each node gets a <b>discovery time</b> and a <b>low-link</b>: the smallest discovery
          time reachable from its subtree using tree edges and at most one edge back to a node still on the stack. Nodes are pushed on a
          stack when discovered. When a node finishes with low-link equal to its own discovery time, nothing in its subtree reaches above it,
          so it is the root of a component: pop the stack down to it, and those nodes are the component.
        </p>
      </div>
      <Recipe
        name="Tarjan (one pass)"
        when="you want one DFS, or you already use discovery times and low-links (as in bridges)."
        steps={[
          'DFS from each unvisited node. On entry, give the node the next discovery time, set its low-link to that time, and push it on a stack (mark it "on stack").',
          'For each edge to an unvisited node, recurse, then lower this node\'s low-link to the child\'s low-link if smaller.',
          'For each edge to a node that is still on the stack, lower this node\'s low-link to that node\'s discovery time if smaller.',
          'After all edges: if low-link equals the discovery time, pop nodes off the stack until this node comes off; they form one component.',
        ]}
        why="a node whose subtree cannot reach any earlier node still on the stack is the first-discovered node of its component."
        time="O(V + E)"
        space="O(V)"
      />

      <TableWrap>
        <thead>
          <tr>
            <th></th>
            <th>Kosaraju</th>
            <th>Tarjan</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Passes</td><td>Two DFS passes</td><td>One DFS</td></tr>
          <tr><td>Extra structure</td><td>Reversed graph</td><td>Stack, discovery and low-link arrays</td></tr>
          <tr><td>Easiest to get right</td><td>Yes</td><td>Needs care with the "on stack" check</td></tr>
          <tr><td>Component order</td><td>Topological order of the condensation</td><td>Reverse topological order</td></tr>
          <tr><td>Deep graphs</td><td>Both recurse; use an explicit stack for 10⁵ nodes</td><td>Same</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Condensation</h2>
        <p>
          Once nodes are labelled with component ids, build the condensation: one node per component, and an edge between components
          whenever some original edge crosses between them. Now the questions get easy. The fewest starting points that reach everything are
          the components with no incoming edge. Nodes that can loop forever are those that can reach a component with more than one node (or
          a self-loop). Longest-path style questions become DP on a DAG.
        </p>
        <p>
          On LeetCode you will often not need the full machinery: when the graph is guaranteed acyclic, or when only "does a cycle exist on the
          way" matters, Kahn's algorithm or a three-colour DFS does the job. Knowing the condensation picture tells you <i>why</i> those
          shortcuts work.
        </p>

        <h2>Pattern 2: Functional graphs</h2>
        <p>
          When every node has exactly one outgoing edge (a favourite person, a next pointer, edges[i]), the structure is very constrained.
          Following edges from any node must eventually repeat, so every component is <b>one cycle with trees flowing into it</b>. The only
          strongly connected components with more than one node are those cycles.
        </p>
      </div>
      <Recipe
        name="Peel the trees, then measure the cycles"
        when="every node has exactly one (or at most one) outgoing edge."
        steps={[
          'Count in-degrees. Queue every node with in-degree 0 and peel them like Kahn\'s algorithm, recording the order and any value you need along the trees (such as the longest chain into a node).',
          'Nodes never peeled lie on cycles. Walk each cycle once to measure it.',
          'For tree nodes, answers usually follow from their successor\'s answer: process them in reverse peel order.',
          'Alternatively, walk from each unvisited node with timestamps; meeting a node stamped in the same walk reveals a cycle and its length.',
        ]}
        why="peeling removes exactly the nodes that are not on any cycle, because a cycle node always keeps an incoming edge from the cycle."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Worked example: the fewest starting points in a graph with cycles</h2>
        <p>Problem 1557 promises a DAG. What if the graph could contain cycles?</p>
        <Step n={1}>Brute force first</Step>
        <p>Try every subset of nodes and check whether it reaches everything. Exponential, hopeless.</p>
        <Step n={2}>Find the waste</Step>
        <p>
          Inside a strongly connected component, any one node reaches all the others, so choosing two nodes from the same component is
          wasteful. Think in components.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Condense the graph. A component with an incoming edge is reachable from another component, so it never needs its own starting point.
          A component with no incoming edge cannot be reached from outside, so it needs one. Answer: one node from each source component.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Kosaraju plus one scan of the edges to mark components that have an incoming edge: <Cost>O(V + E)</Cost>. In a DAG every
          component is a single node, and the rule reduces to "nodes with in-degree 0".
        </p>
      </div>

      <Pitfalls
        items={[
          <>Using a plain "visited" check instead of "on the stack" in Tarjan. An edge to a node in an already finished component must not lower the low-link.</>,
          <>Forgetting to reverse the edges in Kosaraju's second pass, which merges components that should stay separate.</>,
          <>Starting Kosaraju's second pass in any order. It must follow decreasing finish time.</>,
          <>Recursing 10⁵ levels deep. Long chains overflow the call stack; use an explicit stack or the peeling approach for functional graphs.</>,
          <>Treating an undirected graph with these algorithms. In undirected graphs, components are just connected components; the interesting cut structure there is bridges, covered in <See id="biconnected" />.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Edges: 1→2, 2→3, 3→1, 3→4, 4→5, 5→4, 6→4. List the strongly connected components.',
            solution: '{1, 2, 3}, {4, 5}, {6}.',
          },
          {
            task: 'For the graph above, what is the fewest number of starting nodes from which every node can be reached?',
            solution: 'Condensation: {1,2,3} → {4,5} ← {6}. Sources are {1,2,3} and {6}, so 2 starting nodes, for example 1 and 6.',
          },
          {
            task: 'next = [1, 2, 0, 2, 3, 4] (node i points to next[i]). Which nodes lie on a cycle, and how long is it?',
            solution: 'Nodes 0, 1, 2 form a cycle of length 3. Nodes 3, 4, 5 form a tail flowing into it (5 → 4 → 3 → 2).',
          },
          {
            task: 'In the same array, how many different nodes does a walk from node 5 visit?',
            solution: '5, 4, 3, then the cycle 2, 0, 1: six nodes. That is 1 + the answer of node 4 (5), and so on down to the cycle length 3.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why does the condensation of a directed graph never contain a cycle?',
            options: [
              'Because the original graph has none',
              'Because components on a cycle could all reach each other and would have been one component',
              'Because Kosaraju removes cycle edges',
              'Because it is undirected',
            ],
            answer: 1,
            why: 'Mutual reachability is exactly what defines a component, so two components on a common cycle would merge.',
          },
          {
            q: "In Kosaraju's second pass, which graph and which order do you use?",
            options: [
              'Original graph, increasing node number',
              'Reversed graph, decreasing finish time from pass 1',
              'Reversed graph, increasing finish time',
              'Original graph, decreasing finish time',
            ],
            answer: 1,
            why: 'The latest finisher sits in a source component; in the reversed graph it becomes a sink, so a DFS from it stays inside its component.',
          },
          {
            q: 'Every node has exactly one outgoing edge. What does each connected piece look like?',
            options: ['A tree', 'A single path', 'One cycle with trees flowing into it', 'A complete graph'],
            answer: 2,
            why: 'Following the unique out-edge must eventually repeat a node, which closes exactly one cycle; everything else drains into it.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          LeetCode has few problems that need a full SCC algorithm; most are functional graphs or acyclic graphs where the condensation view
          explains the shortcut. Implement Kosaraju once anyway, on paper and in your editor, so it is ready when an interviewer asks.
        </p>
      </div>
      <ProblemSet id="scc" />

      <Recap>
        <ul>
          <li>A strongly connected component is a maximal group of nodes that can all reach each other.</li>
          <li>Shrinking components gives the condensation, which is always a DAG.</li>
          <li>Kosaraju: DFS for finish order, then DFS on the reversed graph in decreasing finish order. Tarjan: one DFS with low-links and a stack.</li>
          <li>Source components need their own starting point; nodes that reach a non-trivial component can loop forever.</li>
          <li>Functional graphs are cycles with incoming trees: peel the trees with Kahn, then measure the cycles.</li>
        </ul>
      </Recap>
    </>
  );
}
