import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dfs';
import { colourCycle, islands } from '../traces/dfs';
import { Walkthrough } from '../viz/Walkthrough';

const islandRun = islands([
  [1, 1, 0, 0, 1],
  [1, 0, 0, 1, 1],
  [0, 0, 1, 0, 0],
  [1, 0, 1, 1, 0],
]);

const cycleRun = colourCycle(
  [
    { id: 'A', x: 0, y: 80 },
    { id: 'B', x: 110, y: 0 },
    { id: 'C', x: 110, y: 160 },
    { id: 'D', x: 230, y: 80 },
    { id: 'E', x: 350, y: 80 },
    { id: 'F', x: 260, y: 220 },
  ],
  [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'E'], ['C', 'F'], ['F', 'C']],
  ['A'],
);

export default function Dfs() {
  return (
    <>
      <TopicIntro
        id="dfs"
        time="5–6 hours, plus problems"
        before={['stack', 'recursion', 'binary-tree']}
        learn={[
          'How depth-first search explores a grid or a graph, recursively or with your own stack',
          'Flood fill, counting connected components, and the border-first trick',
          'Cycle detection in directed graphs with three colours, and why one visited flag is not enough',
          'Carrying information along a path, and memoising DFS on graphs without cycles',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Imagine exploring a cave system with a ball of string. At every junction you take a passage you have not tried, and keep
          going as deep as you can. When you hit a dead end, you follow the string back to the last junction with an untried
          passage and go down that one. You chalk a mark on every junction you pass, so you never explore the same one twice. That
          is <b>depth-first search</b>: go deep first, back up only when you must.
        </p>
        <p>
          In code, "follow the string back" is a <b>stack</b>: either the call stack of a recursive function or an array you push
          and pop yourself. "Chalk marks" are a <b>visited</b> set. Because each node is marked once and each edge is looked at once
          (twice for undirected edges), DFS costs <Cost>O(V + E)</Cost>: linear in the size of the graph. For a grid with R rows
          and C columns, every cell is a node with up to four edges, so it is <Cost>O(R · C)</Cost>.
        </p>
        <p>
          You already know DFS from trees (<See id="binary-tree" />). The new part on graphs and grids is that paths can meet
          again, so you need the visited marks, and there may be several separate pieces, so you start a new search from every node
          that is still unvisited.
        </p>
      </div>

      <Walkthrough
        title="Count islands with an explicit stack"
        frames={islandRun.frames}
        caption={`The purple cell was just popped, amber cells are on the stack, green cells belong to the island being explored, grey cells to finished islands. Result: ${islandRun.count} islands.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          <b>Mark a node when you push it, not when you pop it.</b> Then every node enters the stack at most once, the stack never
          holds duplicates, and the total work is O(V + E). And the number of times the outer loop starts a fresh search equals the
          number of connected components.
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
          { name: 'Adjacency list', ts: 'number[][] (or Map<string, string[]>)', ops: 'neighbours of v in O(degree)', use: 'The standard graph format. Build it from an edge list, adding both directions for undirected edges.' },
          { name: 'Grid as a graph', ts: 'grid[r][c] plus four direction pairs', ops: 'neighbours O(1)', use: 'Each cell is a node; its neighbours are up, down, left and right (check bounds).' },
          { name: 'Stack', ts: 'array with push and pop', ops: 'O(1)', use: 'Iterative DFS. Safer than recursion for 10⁵+ nodes.' },
          { name: 'Visited marks', ts: 'boolean[] / Uint8Array, a Set, or overwrite grid cells', ops: 'O(1)', use: 'So each node is explored once. Overwriting the input is fine when the problem allows it.' },
          { name: 'Colour array', ts: 'Uint8Array with 0 = white, 1 = grey, 2 = black', ops: 'O(1)', use: 'Cycle detection in directed graphs, and caching "safe" results.' },
          { name: 'Memo table', ts: 'number[] or grid of numbers', ops: 'O(1)', use: 'DFS on a graph without cycles where each node has a value computed from its successors.' },
        ]}
      />

      <div className="prose">
        <h3>Recursive or iterative?</h3>
        <p>
          Recursive DFS is shorter and matches how you think: "visit me, then visit each unvisited neighbour". But each call uses a
          frame on the JavaScript call stack, and a long chain (a 300 × 300 island, a path graph of 200,000 nodes) can throw
          "Maximum call stack size exceeded". An explicit stack lives on the heap and has no such limit. Use recursion when the
          depth is small (trees, grids up to about 100 × 100, graphs of a few thousand nodes) or when you need work to happen after
          the children finish (finish times, memoised results); otherwise use a stack.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 1: Flood fill</h2>
        <p>
          A region of a grid (an island, a patch of one colour) is a connected component of the grid graph. Start at one of its
          cells and DFS through neighbours of the same kind: you claim exactly that region. Count regions by counting how many times
          you start a fill; measure a region by counting the cells one fill claims; label regions by writing an id into their cells.
        </p>
      </div>
      <Recipe
        name="Flood fill a grid"
        when="the grid splits into regions of connected cells, and you must count, measure, compare or relabel them."
        steps={[
          'Loop over every cell. Skip it unless it is part of a region and not yet visited.',
          'Start a new region: mark the cell and push it on a stack.',
          'While the stack is not empty, pop a cell and look at its four neighbours. For each one that is inside the grid, of the same kind and unvisited, mark it and push it.',
          'When the stack empties, the region is complete: record its count, size or id, then continue the outer loop.',
        ]}
        why="a search from one cell reaches exactly the cells connected to it, and the marks stop it from ever counting a cell twice."
        time="O(rows × columns)"
        space="O(rows × columns) for marks and stack"
      />

      <div className="prose">
        <h2>Pattern 2: Border first</h2>
        <p>
          "Which cells can reach the edge?" asked separately for each cell costs a whole search per cell. Turn the question around:
          start one search from <b>every border cell at once</b> and mark what it reaches. Everything unmarked cannot reach the
          edge. If the rule for moving has a direction (water flows downhill), reverse it for the backward search (search uphill
          from the ocean).
        </p>
      </div>
      <Recipe
        name="Search backwards from the target"
        when="the question is which cells can reach some set of targets (the border, an ocean, an exit)."
        steps={[
          'Collect all target cells (for example every border cell of the right kind).',
          'Push all of them on one stack and mark them.',
          'Run the DFS, moving by the reversed rule: from a cell, go to neighbours that could have moved into it.',
          'Marked cells can reach the targets; unmarked ones cannot. Combine the marks of several such searches if needed.',
        ]}
        why="a cell can reach a target exactly when the target can reach the cell with every move reversed."
        time="O(rows × columns) per set of targets"
        space="O(rows × columns)"
      />

      <div className="prose">
        <h2>Pattern 3: Components in a graph</h2>
        <p>
          The same counting idea works on any graph: build an adjacency list, then run DFS from each unvisited node. Each run
          claims one component. Questions like "are a and b connected?", "how many groups?" and "how many cables are missing?" all
          reduce to components. When edges only arrive and are never removed, union-find (<See id="union-find" />) answers the same
          questions, often more conveniently. When "a reaches b" does not imply "b reaches a" (bombs with different radii), the
          graph is directed and you need a search per start node.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 4: Cycles and colours</h2>
        <p>
          In an undirected graph, meeting an already visited node other than the one you came from means a cycle. In a{' '}
          <b>directed</b> graph that test is wrong: reaching a node that was finished earlier is perfectly fine (two paths may lead
          to the same place). What closes a cycle is an edge to a node that is <b>still on the current path</b>. So DFS uses three
          colours: white (never seen), grey (on the current path, its call has not returned) and black (finished).
        </p>
      </div>
      <Walkthrough
        title="Three colours: grey means on the current path"
        frames={cycleRun.frames}
        caption={`Grey nodes are amber, black nodes are faded. The edge into D from C is harmless because D is black; F → C closes the cycle because C is grey. Cycle: ${cycleRun.cycle?.join(' → ')}.`}
      />
      <Recipe
        name="Three-colour DFS on a directed graph"
        when="you must detect a cycle, find nodes that can never reach a cycle, or order nodes by finish time."
        steps={[
          'Colour every node white.',
          'For each white node, call visit: colour it grey (it is now on the current path).',
          'For each edge to v: if v is grey, you found a cycle. If v is white, visit it. If v is black, skip it.',
          'When all edges are done, colour the node black (finished).',
        ]}
        why="a grey node is an ancestor of the current node in the DFS, so an edge to it leads back up the path and closes a loop; a black node's whole subtree is known to be cycle-free."
        time="O(V + E)"
        space="O(V)"
      />
      <div className="prose">
        <p>
          The discovery and finish times written under the nodes are useful too: listing nodes by decreasing finish time gives a
          topological order (<See id="topological-sort" />), and Tarjan's and Kosaraju's algorithms for strongly connected
          components (<See id="scc" />) and bridges (<See id="biconnected" />) are built on the same timestamps.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 5: Paths and memoised DFS</h2>
        <p>
          DFS can carry information down the path: the list of nodes so far (to report every path), or a running product (to
          chain ratios in Evaluate Division). And when a graph has no cycles, a node's answer can depend on its successors' answers:
          compute it once, store it, and reuse it. That is memoisation (<See id="memoization" />) applied to a graph, and it turns
          "longest increasing path in a matrix" from exponential into <Cost>O(m · n)</Cost>.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>The thinking path for <b>Pacific Atlantic Water Flow</b>: a grid of heights up to 200 × 200.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          For every cell, search downhill (to neighbours not higher) and check whether you can reach the top or left edge, and the
          bottom or right edge. Each search is O(m · n), so the total is <Cost>O((m · n)²)</Cost>: 1.6 · 10⁹ for a 200 × 200 grid.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The searches from neighbouring cells overlap almost completely. And there are only two targets, the two oceans, while
          there are 40,000 starting cells.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Water can flow from cell X to the ocean exactly when, walking backwards from the ocean and only stepping to cells at least
          as high, you reach X. So run one backward search from all Pacific border cells and one from all Atlantic border cells. A
          cell drains into both oceans exactly when both searches mark it.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Two searches, each <Cost>O(m · n)</Cost>. Equal heights allow flow, so the backward rule is "neighbour ≥ current". A
          single-row grid touches both oceans everywhere. With 40,000 cells, an explicit stack avoids deep recursion.
        </p>
      </div>

      <div className="prose">
        <h2>DFS or BFS?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Use</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Count or measure regions, check connectivity</td><td>Either</td><td>Both visit every node of a component once.</td></tr>
          <tr><td>Shortest path in an unweighted graph or grid</td><td>BFS (<See id="bfs" />)</td><td>BFS reaches nodes in order of distance; DFS does not.</td></tr>
          <tr><td>Cycle detection in a directed graph</td><td>DFS with colours</td><td>You need to know which nodes are on the current path.</td></tr>
          <tr><td>Every path, or a value combining children's results</td><td>DFS (often recursive)</td><td>Work after the children return is natural in DFS.</td></tr>
          <tr><td>Very deep graphs (long chains)</td><td>Iterative DFS or BFS</td><td>Avoids call stack overflow.</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Marking nodes when popped instead of when pushed: the same node can sit on the stack many times.</>,
          <>Recursing 90,000 levels deep on a large grid and hitting "Maximum call stack size exceeded".</>,
          <>Using one visited flag for cycle detection in a <b>directed</b> graph: reaching a finished node is not a cycle.</>,
          <>Forgetting to start a search from every unvisited node, so separate components are missed.</>,
          <>Flood Fill with the new colour equal to the old one: the recolouring no longer marks pixels, and the search never ends.</>,
          <>Grid bound checks in the wrong order: check row and column limits before reading the cell.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'A grid has rows 1 0 1, 0 1 0, 1 0 1 (four-directional moves). How many islands are there? How many with eight-directional moves?',
            solution: 'Four-directional: 5 (no two land cells share a side). Eight-directional: 1 (the centre touches all four corners diagonally).',
          },
          {
            task: 'Directed edges: 1 → 2, 2 → 3, 1 → 3. A DFS from 1 visits 2, then 3, then returns to 1 and looks at the edge 1 → 3. 3 is already visited. Is there a cycle? What colour is 3 at that moment?',
            solution: 'No cycle. Node 3 is black (finished), not grey, so the edge 1 → 3 just reaches a finished node by a second route.',
          },
          {
            task: 'Why does Longest Increasing Path in a Matrix need no visited set during its DFS?',
            solution: 'Each step goes to a strictly larger value, so a path can never return to a cell it has visited. The memo table is enough.',
          },
          {
            task: 'An undirected graph has 7 nodes and edges 0–1, 1–2, 3–4, 5–6, 6–5. How many components? (The duplicated edge is harmless.)',
            solution: 'Three: {0, 1, 2}, {3, 4}, {5, 6}.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What does DFS cost on a graph with V nodes and E edges, using an adjacency list?',
            options: ['O(V²)', 'O(V + E)', 'O(E log V)', 'O(V · E)'],
            answer: 1,
            why: 'Each node is marked and expanded once, and each edge is examined once per direction.',
          },
          {
            q: 'In a directed graph, DFS from node u finds an edge u → v where v is black. What does it mean?',
            options: ['There is a cycle', 'v was already fully explored by another path; no cycle through this edge', 'The graph is disconnected', 'v is u\'s parent'],
            answer: 1,
            why: 'Only grey nodes are on the current path. A black node is finished, so this edge cannot lead back up the path.',
          },
          {
            q: 'You need every cell that can reach the border of a 500 × 500 grid. What is the efficient plan?',
            options: ['One DFS per cell', 'One DFS starting from all border cells, moving by the reversed rule', 'Sort the cells by height', 'BFS from the centre'],
            answer: 1,
            why: 'Reversing the question costs one search of the whole grid instead of one search per cell.',
          },
          {
            q: 'Why might a recursive DFS fail on a graph that is a single chain of 200,000 nodes?',
            options: ['It visits nodes twice', 'The recursion depth exceeds the JavaScript call stack', 'It needs O(n²) time', 'It cannot handle undirected edges'],
            answer: 1,
            why: 'Each recursive call adds a stack frame; an explicit stack avoids the limit.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Number of Islands is the template for the whole chapter: write it from memory with an explicit stack, then with recursion.
          Try each problem for 20–30 minutes before opening a hint, and mark it Solved so the <a href="#/review">review queue</a>{' '}
          brings it back.
        </p>
      </div>
      <ProblemSet id="dfs" />

      <Recap>
        <ul>
          <li>DFS goes deep first and backs up with a stack (the call stack or your own), visiting every node once: O(V + E).</li>
          <li>Mark nodes when you push them; start a new search from every unvisited node to find all components.</li>
          <li>Flood fill claims grid regions; searching backwards from the border answers "who can reach the edge?" in one pass.</li>
          <li>In directed graphs, only an edge to a grey node (still on the path) is a cycle; black nodes are finished and safe.</li>
          <li>Carry path information downwards, memoise results on graphs without cycles, and prefer an explicit stack for deep graphs.</li>
        </ul>
      </Recap>
    </>
  );
}
