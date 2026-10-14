import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/eulerian';
import { hierholzer } from '../traces/eulerian';
import { Walkthrough } from '../viz/Walkthrough';

const run = hierholzer(
  [['A', 'B'], ['A', 'C'], ['C', 'A'], ['B', 'D']],
  'A',
  { A: [0, 70], B: [150, 0], C: [150, 140], D: [300, 0] },
);

export default function Eulerian() {
  return (
    <>
      <TopicIntro
        id="eulerian"
        time="2–3 hours, plus problems"
        before={['dfs', 'graph', 'stack']}
        learn={[
          'When a route that uses every edge exactly once exists, from degrees alone',
          "Hierholzer's algorithm, and why it never gets stuck the way a greedy walk does",
          'How to get the lexicographically smallest route, and where to start in a directed graph',
          'De Bruijn sequences: the shortest string containing every combination',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Can you draw a picture without lifting your pen and without tracing any line twice? In 1736 Euler answered the famous version of
          this question, about the seven bridges of Königsberg, and the answer depends only on how many lines meet at each point. A walk that
          uses <b>every edge exactly once</b> is an <b>Eulerian path</b>; if it ends where it started, it is an <b>Eulerian circuit</b>.
        </p>
        <p>
          Do not confuse it with a <i>Hamiltonian</i> path, which visits every <b>node</b> once. That problem has no fast general algorithm
          (on small graphs it is solved with bitmask DP, see <See id="bitmask" />). Eulerian paths, by contrast, are found in linear time,{' '}
          <Cost>O(V + E)</Cost>, while trying every order of edges would take up to E! steps.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Graph</th>
            <th>Eulerian circuit exists when</th>
            <th>Eulerian path exists when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Undirected</td>
            <td>Every node has even degree</td>
            <td>Exactly zero or two nodes have odd degree; a path must start at one odd node and end at the other</td>
          </tr>
          <tr>
            <td>Directed</td>
            <td>Every node has in-degree equal to out-degree</td>
            <td>At most one node has out − in = 1 (the start), at most one has in − out = 1 (the end), all others balanced</td>
          </tr>
          <tr>
            <td>Both</td>
            <td colSpan={2}>All nodes that have edges must be connected (for directed graphs, connected when edge directions are ignored)</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <p>
          Why degrees? Every time a walk passes through a node, it uses one edge in and one edge out. So every node except the start and the end
          needs its edges to pair up. A graph that meets these conditions is called <b>Eulerian</b> (it has a circuit) or <b>semi-Eulerian</b>{' '}
          (it has a path but no circuit), which are the names behind LeetCode's tags.
        </p>
      </div>

      <Walkthrough
        title="Hierholzer's algorithm recovers from a dead end"
        frames={run.frames}
        caption="Taking the smallest edge first walks into the dead end D. Instead of failing, the algorithm moves D to the finished list and backtracks to find the unused loop A → C → A."
      />

      <Box kind="key" label="Key idea">
        <p>
          Hierholzer's rule: keep walking unused edges from the node on top of a stack. When the top node has no unused edges, it is finished:
          pop it onto the route. Nodes are finished in reverse order of the final route, so reverse at the end. Any loop you missed is found
          later from a node still on the stack and spliced in automatically.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to an Eulerian path. All signals are collected in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Adjacency lists in a Map', ts: 'Map<string, string[]> (or Map<number, number[]>)', ops: 'add O(1); pop the next edge O(1)', use: 'Unused outgoing edges of each node. Sort descending and pop from the end to take the smallest first.' },
          { name: 'Degree counters', ts: 'Map<node, number> (out − in)', ops: 'O(1)', use: 'Check the conditions and find the start node of a directed path.' },
          { name: 'Stack', ts: 'array used as a stack', ops: 'push and pop O(1)', use: "Hierholzer's current walk; avoids deep recursion." },
          { name: 'Route array', ts: 'array, reversed at the end', ops: 'O(1) per push', use: 'Nodes in the order they finish.' },
          { name: 'Set of used edges', ts: 'Set<string>', ops: 'O(1) average', use: 'De Bruijn construction: which n-digit combinations are already used.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Degree conditions</h2>
        <p>
          Before searching for a route, count degrees. Many questions stop right there: "can this be drawn in one stroke?", "can two added
          edges make every degree even?". Each edge you add changes the parity of exactly its two ends, so odd nodes are fixed two at a time.
        </p>
      </div>
      <Recipe
        name="Does an Eulerian path exist?"
        when="you need to decide existence, or find where the route must start."
        steps={[
          'Undirected: count nodes of odd degree. Zero means a circuit (start anywhere with an edge); two means a path between those two nodes; anything else means no route.',
          'Directed: for each node compute out − in. All zero means a circuit; one node at +1 and one at −1 means a path from the +1 node to the −1 node; anything else means none.',
          'Check that all nodes with edges are connected (ignoring directions for directed graphs).',
        ]}
        why="every time the walk passes through a node it uses one edge in and one out, so edges must pair up everywhere except at the ends."
        time="O(V + E)"
        space="O(V)"
      />

      <div className="prose">
        <h2>Pattern 2: Hierholzer's algorithm</h2>
      </div>
      <Recipe
        name="Hierholzer with a stack"
        when="you need the actual route that uses every edge once."
        steps={[
          'Choose the start node from the degree conditions (the +1 node for a directed path, an odd node for an undirected path, any node with an edge for a circuit).',
          'Push the start on a stack.',
          'Look at the top of the stack. If it has an unused edge, remove that edge and push its other end. (Take the smallest destination first if the route must be lexicographically smallest.)',
          'If it has no unused edges, pop it and append it to the route.',
          'When the stack is empty, reverse the route.',
        ]}
        why="a node is appended only when it is completely finished, so every detour found later ends up before it in the reversed route."
        time="O(E), or O(E log E) when destinations must be sorted"
        space="O(V + E)"
      />
      <div className="prose">
        <p>
          For undirected graphs, removing an edge means removing it from both endpoints' lists; storing edge ids and a "used" flag is the
          simplest way. For directed graphs, popping from the source node's list is enough.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 3: De Bruijn sequences</h2>
        <p>
          A safe checks the last n digits you typed. What is the shortest string that is guaranteed to open it? There are kⁿ combinations, and
          overlapping them cleverly means each new digit can complete one new combination, so the best possible length is kⁿ + n − 1. Such a
          string is a <b>de Bruijn sequence</b>, and it is an Eulerian circuit in disguise: let the nodes be all strings of n − 1 digits, and
          let typing digit d at node s be an edge to the last n − 1 digits of s + d. Each edge is exactly one n-digit combination, and every node
          has k edges in and k out, so the degree condition for a circuit holds.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Reconstruct Itinerary</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Backtracking: from JFK try the smallest destination, continue, and undo when you get stuck before using all tickets. It works, but in
          bad cases it backtracks a lot.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The only way to get stuck early is to enter a node whose remaining tickets lead nowhere else: a dead end. That dead end must be the
          final airport of the whole trip. Backtracking rediscovers that fact the slow way.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Hierholzer's rule records an airport only when it is stuck. The first airport recorded is the final destination; loops that were skipped
          are walked later from airports still on the stack and land before it. Reversing the record gives a valid itinerary, and taking the
          smallest destination at every step makes it the lexicographically smallest one.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Sorting destinations costs <Cost>O(E log E)</Cost>; the walk itself is <Cost>O(E)</Cost>. Duplicate tickets are separate edges.
          The problem guarantees a valid itinerary, so no existence check is needed.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Appending a node to the route when you <b>enter</b> it instead of when it is finished. That produces greedy walks that get stuck.</>,
          <>Forgetting to reverse the route at the end.</>,
          <>Starting a directed path at an arbitrary node when one node has out − in = 1. The path must start there.</>,
          <>In undirected graphs, removing an edge from one endpoint's list but not the other's.</>,
          <>Confusing Eulerian (every edge once, fast) with Hamiltonian (every node once, exponential in general).</>,
          <>Recursing 10⁵ edges deep; use an explicit stack for big inputs.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Undirected edges: A–B, B–C, C–A, C–D. Is there an Eulerian circuit? An Eulerian path? Where must it start?',
            solution: 'Degrees: A 2, B 2, C 3, D 1. Two odd nodes, so a path exists but no circuit. It must run between C and D, for example D–C–A–B–C.',
          },
          {
            task: 'Directed edges: 1→2, 2→3, 3→1, 3→4. Which node must an Eulerian path start at, and where does it end?',
            solution: 'out − in: node 1: 0, node 2: 0, node 3: +1, node 4: −1. Start at 3 and end at 4: 3→1→2→3→4.',
          },
          {
            task: 'Run Hierholzer from X with edges X→Y, Y→X, X→Z, taking the alphabetically smallest edge first. Write the stack and the finished list as you go.',
            solution: 'Stack X; push Y; push X; X still has X→Z, push Z; Z stuck, finish Z; X stuck, finish X; Y stuck, finish Y; X stuck, finish X. Finished: Z, X, Y, X. Route: X→Y→X→Z.',
          },
          {
            task: 'How long is the shortest string containing every 3-digit binary combination?',
            solution: '2³ + 3 − 1 = 10 characters, for example 0001110100.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'An undirected connected graph has exactly four nodes of odd degree. What is true?',
            options: ['It has an Eulerian circuit', 'It has an Eulerian path but no circuit', 'It has neither', 'It depends on the number of edges'],
            answer: 2,
            why: 'A path allows exactly two odd nodes (its ends). Four odd nodes cannot all be ends.',
          },
          {
            q: 'In Hierholzer\'s algorithm, when is a node added to the route?',
            options: ['When it is first pushed', 'When it has no unused edges left', 'When it has the smallest label', 'When the stack is empty'],
            answer: 1,
            why: 'Adding nodes only when they are finished is what lets the algorithm splice in loops it skipped.',
          },
          {
            q: 'Why does the de Bruijn graph for k symbols always have an Eulerian circuit?',
            options: [
              'Because it is a tree',
              'Because every node has exactly k incoming and k outgoing edges, and it is connected',
              'Because k is small',
              'Because all edges have equal weight',
            ],
            answer: 1,
            why: 'Balanced in- and out-degrees plus connectivity is precisely the directed circuit condition.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>LeetCode has only a few Eulerian problems, and every one of them is worth doing. Reconstruct Itinerary is the classic.</p>
      </div>
      <ProblemSet id="eulerian" />

      <Recap>
        <ul>
          <li>An Eulerian path uses every edge exactly once; existence depends only on degrees and connectivity.</li>
          <li>Undirected: zero odd nodes for a circuit, two for a path. Directed: balanced, or one +1 start and one −1 end.</li>
          <li>Hierholzer: walk unused edges from the top of a stack, pop finished nodes onto the route, reverse at the end.</li>
          <li>Take the smallest edge first for the lexicographically smallest route.</li>
          <li>De Bruijn sequences are Eulerian circuits on (n − 1)-character nodes, with length kⁿ + n − 1.</li>
        </ul>
      </Recap>
    </>
  );
}
