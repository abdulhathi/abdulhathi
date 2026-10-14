import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/bfs';
import { gridBfs, rottingOranges, zeroOneBfs } from '../traces/bfs';
import { Walkthrough } from '../viz/Walkthrough';

const maze = gridBfs(['..#...', '..#.#.', '....#.', '.##...', '......'], [0, 0], [4, 5]);
const oranges = rottingOranges([
  [2, 1, 1, 0, 1],
  [1, 1, 0, 1, 1],
  [0, 1, 1, 1, 2],
]);
const zeroOne = zeroOneBfs([
  [0, 1, 0, 0],
  [0, 1, 1, 0],
  [0, 0, 1, 0],
]);

export default function Bfs() {
  return (
    <>
      <TopicIntro
        id="bfs"
        time="5–6 hours, plus problems"
        before={['queue', 'dfs', 'graph']}
        learn={[
          'Why breadth-first search finds shortest paths when every move costs the same',
          'Level-by-level processing, multi-source BFS and BFS on graphs you never build',
          'Adding extra information to the state: keys held, walls left to break, nodes visited',
          '0-1 BFS with a deque, bidirectional search, and A* with a heuristic',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Drop a stone in a pond. The ripple reaches everything 1 metre away, then everything 2 metres away, then 3. Nothing at 3
          metres is touched before everything at 2 metres. <b>Breadth-first search</b> explores a graph the same way: first the
          start, then all its neighbours (distance 1), then all their unvisited neighbours (distance 2), and so on.
        </p>
        <p>
          That order is the whole point. When every edge costs the same, the first time BFS reaches a node is along a shortest
          path, because all shorter paths were explored first. Depth-first search has no such guarantee: it can wander far down
          a long path before trying the short one. BFS uses a <b>queue</b> (first in, first out) instead of DFS's stack, and like
          DFS it visits each node once: <Cost>O(V + E)</Cost>.
        </p>
      </div>

      <Walkthrough
        title="Shortest path on a grid, one BFS level at a time"
        frames={maze.frames}
        caption={`Each number is a cell's distance from the start, fixed the moment the cell is discovered. Shortest path: ${maze.distance} steps.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          BFS processes nodes in order of distance. So <b>mark a node as visited when you add it to the queue</b>, and record its
          distance there: it will never be found by a shorter route later. The first time you dequeue (or enqueue) the goal, you
          have the answer.
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
          { name: 'Queue', ts: 'array plus a head index (never shift())', ops: 'enqueue and dequeue O(1)', use: 'The BFS frontier. Array.prototype.shift moves every element, which makes BFS O(n²).' },
          { name: 'Level array', ts: 'swap two arrays: current and next', ops: 'O(1) per node', use: 'When you need to know where one level ends: minutes, number of moves.' },
          { name: 'Deque', ts: 'circular buffer with head and tail, or two stacks', ops: 'push or pop at either end O(1)', use: '0-1 BFS.' },
          { name: 'Visited set', ts: 'boolean array, or Set<string> for encoded states', ops: 'O(1)', use: 'One entry per state. Encode a state such as (row, column, mask) as a number or a string.' },
          { name: 'Distance or parent map', ts: 'number[] / Map<state, state>', ops: 'O(1)', use: 'Distances for each node, or parents to rebuild the path at the end.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Shortest path in a grid</h2>
        <p>
          A grid is a graph whose nodes are cells and whose edges join neighbours (four directions, sometimes eight). With walls,
          a start and a goal, BFS from the start gives every reachable cell its distance. To report the path itself, store each
          cell's parent when you discover it, and walk the parents back from the goal.
        </p>
      </div>
      <Recipe
        name="BFS for the fewest steps"
        when="every move costs the same and you need the minimum number of moves."
        steps={[
          'Put the start in the queue with distance 0 and mark it visited.',
          'Repeat: take the node at the front of the queue. If it is the goal, return its distance.',
          'For every neighbour that is allowed and not yet visited, mark it, set its distance to the current distance + 1 (and its parent), and add it to the back of the queue.',
          'If the queue empties without reaching the goal, the goal is unreachable.',
        ]}
        why="the queue always holds nodes of distance d followed by nodes of distance d + 1, so nodes come out in order of distance."
        time="O(V + E); O(rows × columns) on a grid"
        space="O(V)"
      />

      <div className="prose">
        <h2>Pattern 2: Multi-source BFS</h2>
        <p>
          When something spreads from several places at once (rot from every rotten orange, distance to the nearest zero, fire from
          several fires), put <b>all</b> the sources in the queue at distance 0 before you start. It is the same as adding an
          imaginary super-source joined to every real source by a free edge. One BFS then gives each cell its distance to the
          nearest source. Process the queue level by level when the answer is the number of levels (minutes, rounds).
        </p>
      </div>
      <Walkthrough
        title="Rotting oranges: all rotten oranges start together"
        frames={oranges.frames}
        caption={`Green = fresh, red = rotten, amber = rotted this minute. Answer: ${oranges.minutes} minutes.`}
      />

      <div className="prose">
        <h2>Pattern 3: Implicit graphs</h2>
        <p>
          Many BFS problems never give you a graph. The nodes are <b>states</b>: a lock combination, a word, a board arrangement,
          an index. The edges are the moves the rules allow. You do not build the graph; when you dequeue a state, you generate its
          neighbours and check them against a visited Set. Open the Lock has 10,000 states with 8 moves each; Word Ladder's words are
          states and one-letter changes are moves. Choose an encoding for states that is cheap to hash (a string or a number).
        </p>
      </div>
      <Recipe
        name="BFS over states"
        when="you have a start state, a goal state and a rule for one move, and want the fewest moves."
        steps={[
          'Decide what a state is and encode it as a string or a number.',
          'Write a function that lists the states reachable in one move from a given state.',
          'Run ordinary BFS from the start state, with a Set of visited states (add forbidden states to it before starting).',
          'Return the depth at which the goal state appears.',
        ]}
        why="BFS does not care whether the graph is stored or generated; it only needs neighbours on demand."
        time="O(states × moves per state)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Pattern 4: State = place + extra</h2>
        <p>
          Sometimes the same cell can be reached in situations that are not equivalent. If you may break up to k walls, arriving
          with 3 breaks left is better than arriving with 0. If you collect keys, arriving with keys a and b differs from arriving
          with only a. Then the BFS node is the pair (place, extra): visited is indexed by both. Small extras such as a set of up to
          12 items fit in a <b>bitmask</b> (<See id="bit-manipulation" />), giving place × 2ᵏ states.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 5: 0-1 BFS</h2>
        <p>
          BFS needs every edge to cost the same. Dijkstra (<See id="shortest-path" />) handles any non-negative costs with a priority
          queue. In between sits a common special case: every edge costs 0 or 1 (walking into an empty cell is free, breaking an
          obstacle costs 1; following an arrow is free, changing it costs 1). Use a <b>deque</b>: push a node reached by a cost-0
          edge to the front and one reached by a cost-1 edge to the back. The deque then always holds nodes in order of cost, with
          at most two different costs inside, which is exactly what Dijkstra's heap would give you, in <Cost>O(V + E)</Cost>.
        </p>
      </div>
      <Walkthrough
        title="0-1 BFS: fewest obstacles to remove"
        frames={zeroOne.frames}
        caption={`Free moves jump the queue; cost-1 moves wait at the back. Fewest obstacles to remove: ${zeroOne.cost}.`}
      />
      <Recipe
        name="0-1 BFS with a deque"
        when="edge costs are only 0 or 1 and you need the cheapest path."
        steps={[
          'Set every cost to infinity except the start (0), and put the start in a deque.',
          'Take a node from the front. If it was already finalised, skip it; otherwise it is now final.',
          'For each edge of cost w to a neighbour, if cost + w improves the neighbour, update it and push the neighbour to the front when w = 0, or to the back when w = 1.',
          'When the target is taken from the front, its cost is the answer.',
        ]}
        why="the deque stays sorted by cost, so the front is always a cheapest unfinished node, just as in Dijkstra's algorithm."
        time="O(V + E)"
        space="O(V)"
      />

      <div className="prose">
        <h2>Pattern 6: Bidirectional search and A*</h2>
        <p>
          A BFS whose states branch b ways explores about b<sup>d</sup> states to reach depth d. <b>Bidirectional search</b> runs
          one BFS from the start and one from the goal, expanding the smaller frontier each time, and stops when they meet: two
          searches of depth d/2 explore about 2 · b<sup>d/2</sup> states, which can be thousands of times fewer. It needs a known
          goal state and moves that can be reversed.
        </p>
        <p>
          <b>A* search</b> is Dijkstra with a hint. Each state gets a priority of (cost so far) + (an estimate of the cost still to
          go). If the estimate never overestimates (it is <i>admissible</i>), the first time A* takes the goal from its priority
          queue, the cost is optimal. For a sliding puzzle, the sum of each tile's Manhattan distance to its home is admissible:
          each move shifts one tile by one square. A good heuristic lets A* explore far fewer states than plain BFS; LeetCode tags
          this <i>Heuristic Search</i>.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>The thinking path for <b>Open the Lock</b>: four wheels, dead ends to avoid, fewest turns to a target.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Trying every sequence of turns is hopeless: 8 choices per turn, and the answer can need many turns. You need structure.
        </p>
        <Step n={2}>Find the graph</Step>
        <p>
          The lock shows one of 10,000 combinations at any time. Those are the nodes. One turn changes one wheel by one step up or
          down: 8 edges per node, each costing one turn. Dead ends are nodes you may not enter. "Fewest turns" is now "shortest path
          in an unweighted graph".
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          All edges cost 1, so BFS from 0000 reaches each combination first by a shortest sequence of turns. Put the dead ends into
          the visited Set at the start, so the search never enters them.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          At most 10,000 states × 8 neighbours = 80,000 checks. If 0000 itself is a dead end, the answer is −1 before the search
          starts. If the target is unreachable, the queue empties: return −1. Wrapping 9 → 0 and 0 → 9 is the usual bug: test it
          alone.
        </p>
      </div>

      <div className="prose">
        <h2>Which shortest-path tool?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Edge costs</th>
            <th>Algorithm</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>All equal</td><td>BFS</td><td>O(V + E)</td></tr>
          <tr><td>Only 0 and 1</td><td>0-1 BFS with a deque</td><td>O(V + E)</td></tr>
          <tr><td>Any non-negative</td><td>Dijkstra (<See id="shortest-path" />)</td><td>O(E log V)</td></tr>
          <tr><td>Negative edges allowed</td><td>Bellman-Ford (<See id="shortest-path" />)</td><td>O(V · E)</td></tr>
          <tr><td>All equal, known goal, huge state space</td><td>Bidirectional BFS or A*</td><td>Often far less than BFS in practice</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Using <code>Array.prototype.shift</code> as the dequeue: it is O(n), so a BFS over 10⁵ nodes becomes O(n²). Keep a head index.</>,
          <>Marking nodes visited when they are dequeued instead of enqueued: the same node is added many times.</>,
          <>Using BFS when edges have different costs. Use 0-1 BFS or Dijkstra.</>,
          <>A visited flag per cell when the state has extra information (keys, walls left): visits with a different extra are new states.</>,
          <>Counting levels wrongly: decide up front whether the answer counts moves, cells or words, and check with the smallest example.</>,
          <>Forgetting the start-equals-goal and start-is-forbidden cases.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'In a 3 × 3 open grid, BFS starts at the top-left corner with four-directional moves. List the distance of every cell.',
            solution: 'Row 0: 0 1 2. Row 1: 1 2 3. Row 2: 2 3 4. On an open grid the BFS distance is the Manhattan distance.',
          },
          {
            task: 'Two rotten oranges sit at opposite ends of a row of 7 cells, with 5 fresh oranges between them. How many minutes until all rot?',
            solution: '3 minutes. Cells 1 and 5 rot in minute 1, cells 2 and 4 in minute 2, and the middle cell 3 in minute 3: it is 3 steps from the nearest rotten orange.',
          },
          {
            task: 'A deque in 0-1 BFS holds nodes with costs [4, 4, 5]. You pop a cost-4 node and find a neighbour reachable by a cost-0 edge and another by a cost-1 edge. Where do they go, and what does the deque look like?',
            solution: 'The cost-0 neighbour (cost 4) goes to the front, the cost-1 neighbour (cost 5) to the back: [4, 4, 5, 5]. Still sorted.',
          },
          {
            task: 'In Shortest Path to Get All Keys with 4 keys on a 20 × 20 grid, how many BFS states can there be at most?',
            solution: '20 × 20 × 2⁴ = 6,400 states.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why does BFS find shortest paths in unweighted graphs while DFS does not?',
            options: [
              'BFS visits fewer nodes',
              'BFS explores nodes in order of distance from the start',
              'BFS uses less memory',
              'DFS cannot handle cycles',
            ],
            answer: 1,
            why: 'The queue processes all nodes at distance d before any at distance d + 1, so the first arrival is along a shortest path.',
          },
          {
            q: 'For 01 Matrix (distance from every cell to the nearest 0), what is the efficient plan?',
            options: ['BFS from every 1', 'One BFS starting from all 0s at once', 'DFS from the top-left', 'Sort the cells'],
            answer: 1,
            why: 'Multi-source BFS assigns each cell its distance to the nearest source in a single pass.',
          },
          {
            q: 'Edge costs are 0 or 1. Which structure replaces Dijkstra\'s priority queue?',
            options: ['A stack', 'A deque: cost-0 to the front, cost-1 to the back', 'Two separate queues processed one after the other', 'A sorted array'],
            answer: 1,
            why: 'The deque stays ordered by cost, giving Dijkstra\'s behaviour in linear time.',
          },
          {
            q: 'In Shortest Path with Obstacles Elimination, why is a visited flag per cell not enough?',
            options: [
              'Because the grid is too big',
              'Because reaching a cell with more eliminations left can succeed where an earlier visit with fewer failed',
              'Because BFS revisits cells anyway',
              'It is enough',
            ],
            answer: 1,
            why: 'The remaining budget is part of the state; (cell, budget) pairs are the real nodes.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Shortest Path in Binary Matrix and Rotting Oranges are the two templates; then move on to implicit graphs, where the work
          is deciding what a state is. Mark problems Solved so the <a href="#/review">review queue</a> brings them back.
        </p>
      </div>
      <ProblemSet id="bfs" />

      <Recap>
        <ul>
          <li>BFS explores in order of distance, so with equal edge costs the first arrival is a shortest path: O(V + E).</li>
          <li>Use a real queue (a head index, not shift), and mark nodes when you enqueue them.</li>
          <li>Start from every source at once for "nearest source" questions; process level by level when you count rounds.</li>
          <li>States can be anything you can encode; add extra information (keys, budget, visited set) to the state when it matters.</li>
          <li>0-1 costs: deque. General costs: Dijkstra. Huge state spaces with a known goal: bidirectional BFS or A*.</li>
        </ul>
      </Recap>
    </>
  );
}
