import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/topological-sort';
import { dfsColours, kahn } from '../traces/topological-sort';
import { Walkthrough } from '../viz/Walkthrough';

const kahnRun = kahn(
  6,
  [[0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]],
  { 0: [0, 0], 1: [0, 120], 2: [140, 0], 3: [140, 120], 4: [280, 60], 5: [420, 60] },
);
const dfsRun = dfsColours(
  5,
  [[0, 1], [1, 4], [1, 2], [2, 3], [3, 4], [3, 1]],
  { 0: [0, 70], 1: [120, 70], 2: [240, 0], 3: [240, 140], 4: [380, 70] },
);

export default function TopologicalSort() {
  return (
    <>
      <TopicIntro
        id="topological-sort"
        time="4–5 hours, plus problems"
        before={['graph', 'bfs', 'dfs']}
        learn={[
          'What a topological order is, and why one exists exactly when a directed graph has no cycle',
          "Kahn's algorithm (in-degree counting with a queue) and the DFS version (reverse finish order)",
          'How to detect a cycle with three colours, and how to count the fewest rounds with levels',
          'DP in topological order: longest paths, critical paths and passing sets along edges',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think about getting dressed. Socks go on before shoes, a shirt before a jacket, trousers before a belt. Some items do
          not care about each other (a watch can go on at any point). You need <b>some</b> order that respects every rule, and
          there are usually many. That is a <b>topological order</b>: an arrangement of the nodes of a directed graph in which
          every edge points forward.
        </p>
        <p>
          Such an order exists exactly when the graph has <b>no cycle</b>. If course A needs B, B needs C and C needs A, nobody can
          ever start. Directed graphs without cycles are called DAGs (directed acyclic graphs), and they appear whenever a problem
          talks about prerequisites, dependencies, build steps or "this must happen before that".
        </p>
        <p>
          Brute force would try orderings until one works: n! of them. The trick is to notice that a node with no unmet
          prerequisites can safely go next. Remove it, update the counts, and repeat. Each node and edge is handled once, so the
          whole thing costs <Cost>O(V + E)</Cost>.
        </p>
      </div>

      <Walkthrough
        title="Kahn's algorithm on six courses"
        frames={kahnRun.frames}
        caption="Purple is the node being placed, blue nodes wait in the queue, amber nodes just lost a prerequisite, grey nodes are placed, and 'in k' is how many unplaced prerequisites still point at a node."
      />

      <Box kind="key" label="Key idea">
        <p>
          A node whose in-degree has dropped to zero can go next, because everything that must come before it is already placed.
          If the queue empties while some nodes still wait, those nodes are waiting on each other: that is a cycle, and no order
          exists. Counting how many nodes you placed is the cycle check.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to a topological sort. The full list of signals from every chapter is in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Adjacency list', ts: 'number[][] (or Map<string, string[]> for named nodes)', ops: 'add edge O(1); visit neighbours O(degree)', use: 'Store, for each node, the nodes that must come after it.' },
          { name: 'In-degree array', ts: 'number[] (or Map<string, number>)', ops: 'read or update O(1)', use: "Kahn's counters: how many unplaced prerequisites each node still has." },
          { name: 'Queue', ts: 'number[] with a head index', ops: 'push O(1); pop from the front O(1) with a head index', use: 'Nodes that are ready to place. Array.prototype.shift is O(n), so keep a head index instead in big inputs.' },
          { name: 'Colour array', ts: 'Uint8Array or number[] (0 white, 1 grey, 2 black)', ops: 'O(1)', use: 'DFS cycle detection: grey means on the current path.' },
          { name: 'DP array', ts: 'number[] (or number[][])', ops: 'O(1) per update', use: 'Answers built in topological order: earliest finish, longest path, counts per colour.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Kahn's algorithm</h2>
        <p>
          This is the queue version you just watched, and the one to reach for first. It gives the order and the cycle check in one
          pass, and it extends naturally to levels and to DP.
        </p>
      </div>
      <Recipe
        name="Kahn's algorithm"
        when="you need a valid order of tasks with dependencies, or need to know whether one exists."
        steps={[
          'Build an adjacency list with an edge from each prerequisite to the task that needs it, and count every node\'s in-degree.',
          'Put every node with in-degree 0 into a queue.',
          'Pop a node and append it to the order.',
          'For each of its outgoing edges, decrease the target\'s in-degree; if it reaches 0, push the target.',
          'When the queue is empty: if the order holds all n nodes it is a topological order, otherwise the remaining nodes lie on or behind a cycle.',
        ]}
        why="a node enters the queue only after all its prerequisites have been output, so every edge points forward in the order."
        time="O(V + E)"
        space="O(V + E)"
      />

      <div className="prose">
        <h2>Pattern 2: DFS colouring</h2>
        <p>
          A depth-first search can do the same job. Give every node one of three colours. <b>White</b> means not visited yet,{' '}
          <b>grey</b> means on the path you are currently exploring, and <b>black</b> means finished, with everything it reaches
          already explored. An edge that leads to a grey node points back to something on your own path: a cycle. An edge to a
          black node is harmless.
        </p>
      </div>
      <Walkthrough
        title="Three colours find the cycle 1 → 2 → 3 → 1"
        frames={dfsRun.frames}
        caption="Amber nodes are grey (on the current path) and grey-filled nodes are black (finished). The red edge closes the loop, and the red nodes form the cycle."
      />
      <div className="prose">
        <h3>Why the reverse finish order is topological</h3>
        <p>
          A node turns black only after every node it can reach has turned black. So for any edge u → v, v finishes before u.
          Write nodes down as they finish and then reverse the list: every u now comes before its v. In a graph without cycles this
          gives a valid order, which is the DFS version of topological sort.
        </p>
      </div>
      <Recipe
        name="Three-colour DFS"
        when="you need cycle detection in a directed graph, safe nodes, or a topological order and DFS is more natural for the problem."
        steps={[
          'Colour every node white.',
          'For each white node, start a DFS. Entering a node colours it grey.',
          'For each neighbour: if it is grey, you found a cycle; if it is white, recurse; if it is black, skip it.',
          'After all neighbours, colour the node black and append it to the finish list.',
          'If no cycle was found, the reversed finish list is a topological order.',
        ]}
        why="grey nodes are exactly the current recursion path, so an edge into one is an edge back to an ancestor."
        time="O(V + E)"
        space="O(V) plus recursion depth"
      />

      <div className="prose">
        <h2>Pattern 3: Peeling layers</h2>
        <p>
          Run Kahn's algorithm one level at a time: take everything that is in the queue right now, process all of it, and only then
          move on to what it freed. Each level is one "semester" or "round" in which everything ready happens together. The number of
          levels is the length of the longest chain of dependencies, and no schedule can do better.
        </p>
        <p>
          The same idea works on an <b>undirected tree</b> if you use degree instead of in-degree: removing all leaves at once, round
          after round, peels the tree like an onion until only its centre remains. That is the trick behind Minimum Height Trees.
        </p>
      </div>
      <Recipe
        name="Level-by-level peeling"
        when="the question asks for the fewest rounds, or for the centre of a tree."
        steps={[
          'Queue every node with in-degree 0 (or, for a tree, every leaf).',
          'Start a round: note how many nodes are in the queue right now.',
          'Process exactly that many nodes, queuing the nodes they free for the next round.',
          'Count rounds until the queue is empty (or until the tree is down to its last one or two nodes).',
        ]}
        why="a node is freed in round r exactly when its longest chain of prerequisites has r − 1 nodes."
        time="O(V + E)"
        space="O(V + E)"
      />

      <div className="prose">
        <h2>Pattern 4: DP in topological order</h2>
        <p>
          Many questions on DAGs are dynamic programming in disguise. The earliest a course can finish is its own duration plus the
          latest finish among its prerequisites. The longest path ending at a node is one more than the longest path ending at any
          predecessor. If you process nodes in topological order, every predecessor is already final when you reach a node, so each
          value is computed exactly once. You will meet this idea again in <See id="dp" /> and <See id="memoization" />.
        </p>
      </div>
      <Recipe
        name="DP along a topological order"
        when="you need a longest path, a critical path, a count or a set that flows along the edges of a DAG."
        steps={[
          'Decide what value each node stores (earliest finish, best length, counts per colour, a set of ancestors).',
          "Run Kahn's algorithm.",
          'When a node leaves the queue, its value is final: add its own contribution.',
          'Push its value along each outgoing edge, combining with the target\'s value (max, sum, union).',
          'Read the answer from the stored values (often their maximum).',
        ]}
        why="processing in topological order means no value is read before all its inputs are complete."
        time="O(V + E) times the cost of one combine"
        space="O(V + E)"
      />

      <div className="prose">
        <h2>Pattern 5: Build the graph first</h2>
        <p>
          The hard part of many problems is that nobody hands you the edges. In Alien Dictionary each pair of neighbouring words gives
          one rule, from the first position where they differ. In Build a Matrix With Conditions, rows and columns are two separate
          graphs. In Sort Items by Groups, rules between items in different groups become rules between the groups. Once the edges are
          clear, the sort itself is the usual Kahn's algorithm.
        </p>
      </div>

      <div className="prose">
        <h2>Kahn or DFS?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Kahn (queue)</th>
            <th>DFS (colours)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Produces an order</td><td>Directly, in queue order</td><td>Reverse the finish order</td></tr>
          <tr><td>Detects a cycle</td><td>Fewer than n nodes placed</td><td>An edge into a grey node</td></tr>
          <tr><td>Fewest rounds or levels</td><td>Natural: process level by level</td><td>Awkward</td></tr>
          <tr><td>Finds the actual cycle</td><td>Not directly</td><td>Yes: the grey path from the target node</td></tr>
          <tr><td>Very deep graphs</td><td>Safe, no recursion</td><td>Recursion can overflow; use an explicit stack</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Parallel Courses III</h2>
        <p>Courses have durations, any number may run at once, and a course starts only after its prerequisites end. How long does it all take?</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Simulate month by month, starting every course whose prerequisites are done. With durations up to 10⁴ months and 5·10⁴
          courses that is far too many steps, and it is hard to get right.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          You never need individual months. A course can start exactly when its <i>slowest</i> prerequisite finishes, so its finish time
          depends only on its prerequisites' finish times.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          finish(c) = time(c) + max(finish(p)) over prerequisites p, or time(c) if it has none. Processing courses in topological order
          guarantees every finish(p) is final before c needs it. The answer is the largest finish time.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One pass of Kahn's algorithm: <Cost>O(n + m)</Cost>. Courses are numbered from 1, so shift them. A course with no relations at
          all still counts with its own time. The input promises no cycle, so every course leaves the queue.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Reversing the edge direction. Read the statement: in Course Schedule <b>[a, b]</b> means b first, in Course Schedule IV it means a first.</>,
          <>Using Array.prototype.shift on a big queue. It is O(n) per call; keep a head index.</>,
          <>Forgetting nodes that appear in no edge. They have in-degree 0 and must still appear in the order.</>,
          <>Counting duplicate edges once in the adjacency list but twice in the in-degrees (or the other way round). Keep them consistent.</>,
          <>In DFS, treating any visited node as a cycle. Only an edge to a <b>grey</b> node is a cycle; black nodes are fine.</>,
          <>Returning a partial order when there is a cycle, when the problem wants an empty result.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Edges: A → C, B → C, C → D, B → D, D → E. Write down the in-degrees, then the order Kahn\'s algorithm produces (break ties alphabetically).',
            solution: 'In-degrees: A 0, B 0, C 2, D 2, E 1. Order: A, B, C, D, E.',
          },
          {
            task: 'Add the edge E → C to the graph above. Which nodes does Kahn\'s algorithm place, and what does the leftover tell you?',
            solution: 'It places A and B; C, D and E never reach in-degree 0. They form (or sit behind) the cycle C → D → E → C.',
          },
          {
            task: 'Course durations: A 3, B 2, C 4, with A → C and B → C. What is the minimum total time if courses can run in parallel?',
            solution: 'C starts when the slower of A (3) and B (2) ends, at 3, and finishes at 7. Total: 7 months.',
          },
          {
            task: 'Words sorted in an alien order: "cab", "cad", "ba", "bce", "eda". Which letter rules do neighbouring pairs give, and what is one valid alphabet?',
            hint: 'Compare each pair only up to its first differing letter.',
            solution: 'b before d (cab, cad); c before b (cad, ba); a before c (ba, bce); b before e (bce, eda). One valid order: a, c, b, d, e. d and e may swap, because no rule links them.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Kahn\'s algorithm finishes with 7 of 10 nodes placed. What can you conclude?',
            options: ['The graph is disconnected', 'The graph contains a cycle', 'The graph is a tree', 'Some edges are duplicates'],
            answer: 1,
            why: 'Nodes that never reach in-degree 0 are waiting on a cycle (or on nodes behind one). A disconnected DAG would still place every node.',
          },
          {
            q: 'In a three-colour DFS, the current node has an edge to a black node. What does that mean?',
            options: ['A cycle', 'Nothing special: that node is finished and cannot lead back to the current path', 'The graph is not a DAG', 'You must recolour it grey'],
            answer: 1,
            why: 'Black nodes and everything they reach are fully explored. Only an edge to a grey node, which is on the current path, closes a cycle.',
          },
          {
            q: 'Which problem is best solved by processing Kahn\'s queue level by level?',
            options: ['Return any valid course order', 'The minimum number of semesters when any number of available courses can be taken together', 'Detect whether a cycle exists', 'Find the shortest weighted path'],
            answer: 1,
            why: 'Each level is everything available at once, so the number of levels is the fewest semesters.',
          },
          {
            q: 'Why does DP in topological order compute each node\'s value correctly in one pass?',
            options: [
              'Because the graph is undirected',
              'Because every predecessor of a node is processed before the node itself',
              'Because values only decrease',
              'Because the queue is a priority queue',
            ],
            answer: 1,
            why: 'A node leaves the queue only after all its prerequisites, so all the values it depends on are already final.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with Course Schedule I and II until Kahn's algorithm feels automatic, then work through the patterns. For every problem,
          decide first which way the edges point. Set a problem to Solved when you finish it and the <a href="#/review">review queue</a>{' '}
          will bring it back.
        </p>
      </div>
      <ProblemSet id="topological-sort" />

      <Recap>
        <ul>
          <li>A topological order puts every edge forward; it exists exactly when the directed graph has no cycle.</li>
          <li>Kahn's algorithm: count in-degrees, queue the zeros, pop, decrement, repeat. Fewer than n placed means a cycle.</li>
          <li>DFS with three colours finds cycles (an edge to grey) and gives an order by reversing the finish list.</li>
          <li>Level-by-level Kahn counts the fewest rounds; leaf peeling finds a tree's centre.</li>
          <li>Process a DAG in topological order and DP becomes one pass: longest paths, critical paths, sets and counts.</li>
        </ul>
      </Recap>
    </>
  );
}
