import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/union-find';
import { unionFind } from '../traces/union-find';
import { Walkthrough } from '../viz/Walkthrough';

const run = unionFind(8, [
  ['union', 0, 1], ['union', 2, 3], ['union', 0, 2], ['union', 4, 5], ['union', 6, 4], ['union', 1, 3], ['union', 4, 0], ['find', 3], ['find', 5],
]);

export default function UnionFind() {
  return (
    <>
      <TopicIntro
        id="union-find"
        time="4–5 hours, plus problems"
        before={['graph', 'dfs', 'sorting']}
        learn={[
          'How a forest of parent links answers "are these two connected?" in almost constant time',
          'The two tricks that make it fast: union by size (or rank) and path compression',
          'Six patterns: counting components, redundant edges, grouping by shared keys, grids, offline thresholds and weighted links',
          'When union-find beats a DFS, and when it cannot help at all',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Picture clubs where every member knows one other member, their "parent", and following parents always ends at the club
          president, who is their own parent. To check whether two people are in the same club, follow each one up to their president
          and compare. To merge two clubs, make one president report to the other. That is the whole data structure, also called a{' '}
          <b>disjoint set union</b> (DSU).
        </p>
        <p>
          It supports two operations. <b>find(x)</b> returns the representative (root) of x's set. <b>union(a, b)</b> merges the sets
          that contain a and b. Two items are connected exactly when find gives them the same root.
        </p>
        <p>
          Done naively, the parent links can form a long chain and find takes <Cost>O(n)</Cost>. Two simple rules fix that.{' '}
          <b>Union by size</b>: hang the smaller tree under the larger one, so trees stay shallow (depth at most log₂ n). <b>Path
          compression</b>: after a find, point every node on the path straight at the root. Together, a long sequence of operations
          costs <Cost>O(α(n))</Cost> each, where α is the inverse Ackermann function: at most 4 for any input you will ever see.
        </p>
      </div>

      <Walkthrough
        title="Unions, a redundant union, and path compression"
        frames={run.frames}
        caption="Arrows point from a node to its parent. Roots have no outgoing arrow. Watch the last two finds flatten the paths."
      />

      <Box kind="key" label="Key idea">
        <p>
          Union-find only ever <b>adds</b> connections. It answers "connected?" and "how many groups?" while links keep arriving, far
          faster than rerunning a search after each one. It cannot remove a link, so when a problem deletes things, try running time
          backwards.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues point to union-find. Every chapter's signals are collected in the <See id="recognition" />.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Union-find is usually written by hand as a small class with two arrays. There is nothing to import.</p>
      </div>
      <Structures
        items={[
          { name: 'Parent array', ts: 'number[] or Int32Array', ops: 'read or write O(1)', use: 'parent[x] is x\'s parent; a root is its own parent.' },
          { name: 'Size (or rank) array', ts: 'number[]', ops: 'O(1)', use: 'Union by size: attach the smaller tree under the larger root.' },
          { name: 'Map-based union-find', ts: 'Map<string, string> for parents', ops: 'O(1) average per access', use: 'Keys that are not small integers: emails, variable names, row and column ids.' },
          { name: 'Component counter', ts: 'number', ops: 'O(1)', use: 'Start at n and subtract one on every union that merges two different sets.' },
          { name: 'Weight array', ts: 'number[] or Map<string, number>', ops: 'O(1)', use: 'Weighted union-find: the ratio or offset from a node to its parent.' },
        ]}
      />

      <div className="prose">
        <h2>The two operations</h2>
      </div>
      <Recipe
        name="find with path compression"
        when="you need the representative of an item's set."
        steps={[
          'Follow parent links from x until you reach a node that is its own parent: that is the root.',
          'Walk the same path again and set each node\'s parent to the root (or, in one pass, point each node at its grandparent as you go).',
          'Return the root.',
        ]}
        why="flattening the path means the next find on any of those nodes takes a single step."
        time="amortised O(α(n))"
        space="O(1) with a loop"
      />
      <Recipe
        name="union by size"
        when="you need to merge the sets of a and b."
        steps={[
          'Find the roots ra and rb.',
          'If they are equal, the two are already connected: report "no merge" (this is how you detect cycles).',
          'Otherwise attach the root of the smaller set under the root of the larger set, and add the sizes.',
          'Subtract one from the component counter.',
        ]}
        why="a node's depth grows only when its tree is merged into one at least as large, so it can grow at most log₂ n times."
        time="amortised O(α(n))"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 1: Count components</h2>
        <p>
          Start the counter at n. Every union that merges two different sets lowers it by one. After all links, the counter is the number
          of connected components. Problems that ask "how many groups", "how many moves to connect everything" (components − 1) or "how
          many pairs cannot reach each other" (from component sizes) all start here.
        </p>

        <h2>Pattern 2: Redundant edges</h2>
        <p>
          When union(a, b) finds that a and b already share a root, the edge a–b closes a cycle. In Redundant Connection, the first such edge
          is the answer. In Remove Max Number of Edges, every such edge can be removed. This is the cleanest way to detect a cycle in an{' '}
          <i>undirected</i> graph while edges arrive. (For directed graphs, use <See id="topological-sort" /> instead.)
        </p>

        <h2>Pattern 3: Group by shared keys</h2>
        <p>
          Many problems never mention a graph. Accounts that share an email are one person. Stones that share a row or column form a
          group. Positions joined by swap pairs can be rearranged freely. Numbers that share a factor are linked. The trick is to choose a{' '}
          <b>key</b> to union through: map each email to the first account that used it; treat every row and every column as a node and
          each stone as an edge between them; union each number with its prime factors. Comparing all pairs is never needed.
        </p>
      </div>
      <Recipe
        name="Union through a shared key"
        when="items are equivalent whenever they share some property, possibly through a chain."
        steps={[
          'Pick the shared property: email, row, column, factor, letter.',
          'Keep a Map from each key to the first item (or key node) that used it.',
          'For each item and each of its keys, union the item with the key\'s first owner (or with the key node itself).',
          'Group items by root to read off the answer: group sizes, merged lists, or the number of groups.',
        ]}
        why="union-find is transitive by construction, so a chain of shared keys ends in one set."
        time="O(total keys · α(n))"
        space="O(n + keys)"
      />

      <div className="prose">
        <h2>Pattern 4: Grids and adding land</h2>
        <p>
          On a grid, number cell (r, c) as <b>r × cols + c</b> so a flat parent array covers it. When a cell becomes land, union it with
          each land neighbour. Add <b>virtual nodes</b> when a whole side matters: a TOP node joined to every first-row cell and a BOTTOM
          node joined to every last-row cell answer "does anything connect the top to the bottom?" with a single find.
        </p>
        <p>
          If cells <i>disappear</i> over time (flooding), union-find cannot undo it. Run time backwards instead: start from the final state
          and add cells back in reverse order. The first moment the condition becomes true going backwards is the last moment it was true
          going forwards.
        </p>

        <h2>Pattern 5: Offline, sorted by threshold</h2>
        <p>
          "Can p reach q using only edges shorter than x?" asked for many different x. If you answer the queries in increasing order of x,
          the set of allowed edges only grows, so sort the edges, sort the queries, and add edges to the union-find as the threshold rises.
          This is called answering <b>offline</b>: you are allowed to reorder the questions as long as you put the answers back in their
          original order. Number of Good Paths uses the same idea on node values, and Find All People With Secret on meeting times.
        </p>
      </div>
      <Recipe
        name="Offline queries by threshold"
        when="each query has a limit and asks about connectivity using only links within that limit."
        steps={[
          'Sort the links by weight.',
          'Sort the query indices by their limit (keep the original indices).',
          'For each query in that order, union every not-yet-added link that satisfies its limit.',
          'Answer the query with a find, and store the result at its original index.',
        ]}
        why="each link is added exactly once, and every query sees exactly the links its limit allows."
        time="O(E log E + Q log Q + (E + Q) α(n))"
        space="O(n + Q)"
      />

      <div className="prose">
        <h2>Pattern 6: Weighted union-find</h2>
        <p>
          Sometimes a link carries a value: a / b = 2.5, or "x is 3 more than y". Store with each node its relation to its parent (a ratio
          or an offset). find then returns both the root and the node's relation to the root, by combining the relations along the path
          (multiplying ratios, adding offsets), and path compression updates them as it flattens. In Evaluate Division, c / d is then
          (c / root) ÷ (d / root).
        </p>

        <h2>Union-find or DFS?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Better tool</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>The whole graph is given once; count components</td><td>Either</td><td>A DFS is just as fast and needs no extra structure.</td></tr>
          <tr><td>Links arrive over time, with questions in between</td><td>Union-find</td><td>A DFS would restart after every link.</td></tr>
          <tr><td>Links are removed over time</td><td>Union-find on reversed time, or a search</td><td>Union-find cannot delete.</td></tr>
          <tr><td>You need the actual path between two nodes</td><td>DFS or BFS</td><td>Union-find only knows whether a path exists.</td></tr>
          <tr><td>Cycle in an undirected graph</td><td>Union-find</td><td>The first union that finds equal roots is the cycle edge.</td></tr>
          <tr><td>Cycle in a directed graph</td><td>DFS colouring or Kahn</td><td>Union-find ignores direction and reports false cycles.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Checking Existence of Edge Length Limited Paths</h2>
        <p>Up to 10⁵ edges and 10⁵ queries; each query asks whether p reaches q using only edges shorter than its limit.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          For each query, run a BFS from p that ignores long edges. That is <Cost>O(Q · (n + E))</Cost>, about 10¹⁰ steps. Too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Two queries with limits 5 and 7 repeat almost all the same work: every edge allowed under 5 is also allowed under 7. The allowed
          edge set only grows as the limit grows.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Sort queries by limit and edges by length. Before answering a query, union every edge shorter than its limit that has not been added
          yet. At that moment the union-find holds exactly the allowed edges, so "same root" means "reachable under this limit".
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Sorting dominates: <Cost>O(E log E + Q log Q)</Cost>, plus near-constant unions and finds. Use a strict comparison (shorter
          than the limit), keep the original query indices, and remember that several edges may join the same two nodes; union handles that.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Forgetting to compare <b>roots</b>. parent[a] === parent[b] is not the same as find(a) === find(b).</>,
          <>Skipping union by size and path compression. Without them a chain can make every find O(n), and recursion on a long chain overflows the stack.</>,
          <>Counting a component decrease on every union call, including the ones where the roots were already equal.</>,
          <>Using union-find for a directed graph's cycles. It ignores direction.</>,
          <>Trying to delete a link. Union-find cannot split a set; reverse time or use a different tool.</>,
          <>1-based node numbers with a parent array of size n. Allocate n + 1.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Five nodes, union by size (ties: attach the second root under the first). Apply union(0,1), union(2,3), union(1,3), union(4,4). Write the parent array and the number of components.',
            solution: 'union(0,1): parent[1] = 0. union(2,3): parent[3] = 2. union(1,3): roots 0 and 2, tie, parent[2] = 0. union(4,4): same root, nothing. Parent array: [0, 0, 0, 2, 4]. Components: 2.',
          },
          {
            task: 'In the result above, run find(3) with path compression. What changes?',
            solution: 'The path is 3 → 2 → 0. Compression sets parent[3] = 0. Parent array: [0, 0, 0, 0, 4].',
          },
          {
            task: 'Edges arrive in this order: 1–2, 2–3, 3–4, 1–3, 4–5. Which edge closes a cycle?',
            solution: '1–3: when it arrives, 1 and 3 are already connected through 2.',
          },
          {
            task: 'Stones at (0,0), (0,2), (1,1), (2,1), (2,2). How many stones can be removed?',
            hint: 'Union each stone\'s row with its column and count groups.',
            solution: 'Row 0 joins columns 0 and 2; row 2 joins columns 1 and 2; row 1 joins column 1. Everything is one group, so 5 − 1 = 4 stones can be removed.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why does union by size keep trees shallow?',
            options: [
              'It sorts the nodes',
              'A node gets deeper only when its tree joins one at least as large, so its tree size at least doubles each time',
              'It removes nodes from the tree',
              'It always makes the newest node the root',
            ],
            answer: 1,
            why: 'Each time a node sinks one level, the size of its tree at least doubles, which can happen at most log₂ n times.',
          },
          {
            q: 'union(a, b) finds that a and b already have the same root. In Redundant Connection, what does that tell you?',
            options: ['Nothing; skip it', 'This edge closes a cycle and is the answer', 'The graph is disconnected', 'You should merge again'],
            answer: 1,
            why: 'Two nodes that are already connected plus one more edge make a cycle.',
          },
          {
            q: 'Cells of a grid flood one per day, and you need the last day the top still connects to the bottom. What makes union-find usable?',
            options: ['Deleting nodes from the forest', 'Processing the days in reverse, so cells are added instead of removed', 'Using a priority queue', 'Running union-find once per day'],
            answer: 1,
            why: 'Union-find only adds connections. Going backwards in time turns every flood into an addition.',
          },
          {
            q: 'Which task can union-find NOT do on its own?',
            options: ['Count connected components', 'Detect a cycle in an undirected graph', 'Return the actual path between two connected nodes', 'Answer whether two nodes are connected'],
            answer: 2,
            why: 'Union-find knows set membership, not routes. Use BFS or DFS to recover a path.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Write one clean union-find class (find with compression, union by size returning whether it merged) and reuse it for every problem
          below. Most of the difficulty is in choosing what the nodes are.
        </p>
      </div>
      <ProblemSet id="union-find" />

      <Recap>
        <ul>
          <li>Union-find keeps disjoint sets as a forest of parent links; two items are connected when their roots match.</li>
          <li>Union by size plus path compression makes each operation effectively constant time.</li>
          <li>Count components by subtracting on successful unions; an unsuccessful union is a cycle edge.</li>
          <li>Union through shared keys (emails, rows, factors), number grid cells r × cols + c, and add virtual nodes for whole sides.</li>
          <li>Sort queries by threshold to add links in order; reverse time when things disappear; store ratios on links for weighted relations.</li>
        </ul>
      </Recap>
    </>
  );
}
