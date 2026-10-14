import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/memoization';
import { fibCallTree, fibMemo, longestIncreasingPath } from '../traces/memoization';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const plain = fibCallTree(5);
const memo = fibMemo(5);
const grid = longestIncreasingPath([[7, 8, 9], [6, 1, 2], [5, 4, 3]]);

export default function Memoization() {
  return (
    <>
      <TopicIntro
        id="memoization"
        time="4–5 hours, plus problems"
        before={['recursion', 'hash-table']}
        learn={[
          'Why plain recursion can explode, and how a cache turns exponential work into linear work',
          'How to choose the cache key: exactly the arguments that change between calls',
          'When to cache in an array and when in a Map, including states as large as 10⁹',
          'How memoised DFS solves grid problems without a visited set, and the call-stack limit to watch for',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A recursive solution is often the clearest way to describe a problem: "the answer for n is built from the answers for
          n − 1 and n − 2". The trouble is that the recursion does not remember anything. Ask it for f(5) and it computes f(3)
          twice, f(2) three times, and so on. Look at the whole call tree below: amber calls are repeats of work already done.
        </p>
      </div>
      <VizFigure
        parts={[plain.tree]}
        caption={`Plain recursion for f(5) makes ${plain.calls} calls, but there are only ${plain.distinct} different questions (f(0) to f(5)). Amber nodes repeat earlier work; the number under each node is its result.`}
      />
      <div className="prose">
        <p>
          <b>Memoisation</b> means keeping a cache of answers keyed by the function's arguments. Before computing, look in the
          cache; after computing, store the result. Now every distinct question is answered once, and every later request is a
          lookup. It is like a student who writes each solved exercise in a notebook and checks the notebook before starting a new
          one. For Fibonacci the cost drops from about <Cost>1.6ⁿ</Cost> calls to <Cost>2n − 1</Cost>.
        </p>
      </div>
      <Walkthrough
        title="The same f(5), with a cache"
        frames={memo.frames}
        caption={`The indigo node has just returned and grey nodes are finished computations. Green nodes are cache hits: their whole subtree from the figure above simply disappears. ${memo.calls} calls instead of ${plain.calls}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Memoisation pays off when a recursion asks the <i>same question</i> many times. The total cost becomes{' '}
          <b>(number of distinct states) × (work per state)</b>. Count the distinct values the arguments can take: that number, not
          the size of the call tree, is your running time.
        </p>
      </Box>

      <div className="prose">
        <h2>Choosing the cache key</h2>
        <p>
          The key must contain every argument that changes from call to call and affects the answer, and nothing else. In Frog Jump
          the answer depends on which stone the frog is on <i>and</i> how long its last jump was, so the key is the pair. In Word
          Break II it is only the start index, because the dictionary never changes.
        </p>
        <ul>
          <li>
            <b>One small number</b> (an index, n up to about 10⁶): use an array, filled with a value that cannot be a real answer,
            such as −1.
          </li>
          <li>
            <b>One huge or sparse number</b> (n up to 10⁹): use a Map. Integer Replacement and Minimum Number of Days to Eat N
            Oranges reach at most a few hundred distinct values, so the Map stays tiny.
          </li>
          <li>
            <b>Several numbers</b>: a nested array (cache[i][j]) when the ranges are small, or a Map with a combined key. A number
            key such as i × 10,000 + j is faster than a string key like "i,j".
          </li>
        </ul>
      </div>

      <div className="prose">
        <h2>Memoisation or a bottom-up table?</h2>
        <p>
          Memoisation is top-down dynamic programming; the bottom-up version fills a table in a loop (see <See id="dp" />). They
          compute the same values, so pick the one that is easier for the problem in front of you.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Prefer</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Only a few of the possible states are ever reached</td>
            <td>Memoisation</td>
            <td>It computes only what the recursion asks for; a table would fill every cell.</td>
          </tr>
          <tr>
            <td>The fill order of a table is awkward (grids with uphill moves, game states)</td>
            <td>Memoisation</td>
            <td>The recursion discovers the right order by itself.</td>
          </tr>
          <tr>
            <td>The recursion could go 10,000 or more calls deep</td>
            <td>Bottom-up table</td>
            <td>JavaScript's call stack overflows at roughly that depth.</td>
          </tr>
          <tr>
            <td>You want to cut memory to one row or a few variables</td>
            <td>Bottom-up table</td>
            <td>A loop knows exactly which entries are still needed.</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to memoisation. The <See id="recognition" /> collects every signal from every chapter.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Array cache', ts: 'number[] of length n + 1, filled with −1', ops: 'read and write O(1)', use: 'One small integer argument. Use a value that cannot be a real answer to mean "not computed yet".' },
          { name: 'Nested array cache', ts: 'number[][], each row created separately and filled with −1', ops: 'O(1)', use: 'Two or three small arguments, such as (city, fuel) or (row, col).' },
          { name: 'Map cache', ts: 'Map<number, number>', ops: 'get, set, has O(1) average', use: 'Huge or sparse arguments, or keys built from several numbers.' },
          { name: 'Map of lists', ts: 'Map<number, string[]>', ops: 'O(1) to look up a list', use: 'Problems that return all results (sentences, expressions, trees) for each piece of the input.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: One changing number</h2>
        <p>
          The recursion has a single argument that shrinks: Fibonacci, Tribonacci, integer halving. When the argument fits an array,
          use an array. When it can be as large as 10⁹, notice that each step divides it, so the recursion touches only a handful of
          values; a Map stores just those. Minimum Number of Days to Eat N Oranges adds a classic trick: prune the move that
          wastes time (eating one orange at a time) so only two branches remain.
        </p>
      </div>
      <Recipe
        name="Memoise a one-argument recursion"
        when="a function of one number calls itself on smaller numbers, and the same numbers come up repeatedly."
        steps={[
          'Write the plain recursion first, with its base cases.',
          'Create a cache: an array if the argument is small, a Map if it can be huge.',
          'At the start of the function, return the cached answer if there is one.',
          'At the end, store the answer in the cache before returning it.',
        ]}
        why="each distinct argument is computed once; every later call is a constant-time lookup."
        time="O(distinct arguments × work per call)"
        space="O(distinct arguments) for the cache and the call stack"
      />

      <div className="prose">
        <h2>Pattern 2: A piece of the input</h2>
        <p>
          When the function works on part of a string or array, the key is where that part starts (a suffix) or where it starts and
          ends (a substring). Different Ways to Add Parentheses splits an expression at each operator and combines the results of
          the two sides; the same sub-expression is reached from many splits, so its list of results is cached. These problems often
          return lists, so the cache holds lists, and the output itself can be exponential.
        </p>
      </div>
      <Recipe
        name="Memoise over suffixes or substrings"
        when="the recursion splits the input into pieces, and the same piece shows up from many different splits."
        steps={[
          'Describe the piece by its start index (suffix) or by start and end (substring).',
          'For a piece, try every way to split off the first part (or every operator to apply last).',
          'Combine the cached answers of the smaller pieces.',
          'Store the result for this piece, keyed by its indices, not by the substring text.',
        ]}
        why="there are only O(n) suffixes and O(n²) substrings, however many ways the recursion reaches them."
        time="O(pieces × splits per piece), plus the size of the output"
        space="O(pieces), plus the stored results"
      />

      <div className="prose">
        <h2>Pattern 3: Several changing arguments</h2>
        <p>
          Many states need two or three numbers: the stone and the last jump in Frog Jump, the city and the fuel left in Count All
          Possible Routes, the corner of the remaining pizza and the pieces still to cut. Multiply the ranges to estimate the cost:
          100 cities × 201 fuel values × 100 moves each is about two million steps, comfortably fast.
        </p>
      </div>
      <Recipe
        name="Memoise a multi-argument state"
        when="what you can do next depends on more than one changing value."
        steps={[
          'List the values the remaining decisions depend on. Those are the state.',
          'Check the size: multiply the ranges of the values, then multiply by the work per state.',
          'Use a nested array (or a Map with a combined numeric key) as the cache.',
          'Write the recursion over the state and cache every result.',
        ]}
        why="two calls with the same state have the same future, so one answer serves them all."
        time="O(states × work per state)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Pattern 4: Memoised search on a grid</h2>
        <p>
          In Longest Increasing Path in a Matrix, a path only moves to a strictly larger value, so it can never come back to a cell.
          That means the "longest path starting here" of each cell is a fixed number: compute it once with DFS, cache it, and reuse
          it for every path that passes through. No visited set is needed, because cycles are impossible.
        </p>
      </div>
      <Walkthrough
        title="Longest Increasing Path: each cell is solved exactly once"
        frames={grid.frames}
        caption={`The cache fills in the order the DFS finishes cells. Later cells reuse finished neighbours (green) instead of exploring again. Longest path: ${grid.best}.`}
      />
      <Recipe
        name="Memoised DFS on a DAG"
        when="moves only go one way in value (uphill, downhill, forward in time), so the states form a directed acyclic graph."
        steps={[
          'Make a cache with one entry per cell, marked "not computed".',
          'dfs(cell): if cached, return it. Otherwise combine the dfs results of every allowed neighbour (max, or sum for counting) and add the cell itself.',
          'Store the result in the cache and return it.',
          'Call dfs from every cell and combine the results.',
        ]}
        why="without cycles, a cell's answer never depends on itself, so it is final the first time it is computed."
        time="O(cells × neighbours)"
        space="O(cells), plus recursion depth up to the longest path"
      />

      <div className="prose">
        <h2>Worked example: Frog Jump</h2>
        <p>
          Stones sit at given positions. If the frog's last jump was k units, its next jump must be k − 1, k or k + 1 units, landing
          on a stone; the first jump is 1. Can it reach the last stone?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          From each stone, try all three jump sizes recursively. Each call branches three ways, so the work grows like{' '}
          <Cost>3ⁿ</Cost> in the worst case, far too slow for 2,000 stones.
        </p>
        <Step n={2}>Find the repeats</Step>
        <p>
          The frog can reach the same stone with the same last jump along many different routes. From then on, its future is
          identical: the route it took does not matter. So the state is (stone, last jump).
        </p>
        <Step n={3}>Count the states</Step>
        <p>
          A jump grows by at most 1 per jump, so at stone i the last jump is at most i + 1. That gives at most n² ≈ 4 million states
          for 2,000 stones, each doing three O(1) checks with a Map from position to stone index. Cache each (stone, jump) answer.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(n²)</Cost> time and space. The first jump must be exactly 1: if the second stone is not at position 1, the answer
          is false. Jumps of size 0 are not allowed, so skip k − 1 when it is 0.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Leaving a changing argument out of the cache key. Two calls then share an answer they should not, and results are silently wrong.</>,
          <>Putting a constant (the input array, the dictionary) into the key. It wastes time and memory and changes nothing.</>,
          <>Using 0 or <code>undefined</code> as "not computed" when 0 is a valid answer. Use −1, or check with <code>has</code> on a Map.</>,
          <>Building string keys like "3,7" in a hot loop. Numeric keys (i × 10,000 + j) or nested arrays are much faster.</>,
          <>Deep recursion. JavaScript overflows at roughly 10,000 nested calls; convert to a bottom-up table or an explicit stack when the depth can be larger.</>,
          <>Memoising a function that depends on outside state that changes (a visited set, a running path). Its answer then depends on more than its arguments.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'How many calls does plain recursive Fibonacci make for f(6)? How many with a cache?',
            hint: 'calls(n) = 1 + calls(n − 1) + calls(n − 2), with calls(0) = calls(1) = 1.',
            solution: 'Plain: 25 calls (1, 1, 3, 5, 9, 15, 25). With a cache: 2 × 6 − 1 = 11 calls.',
          },
          {
            task: 'Integer Replacement starting at 15. Using f(even) = 1 + f(n / 2) and f(odd) = 1 + min(f(n + 1), f(n − 1)), what is f(15)?',
            solution: 'f(15) = 5: 15 → 16 → 8 → 4 → 2 → 1. (15 → 14 → 7 → 8 → 4 → 2 → 1 takes 6.)',
          },
          {
            task: 'Count All Possible Routes has up to 100 cities and fuel up to 200. Estimate the number of states and the total work.',
            solution: '100 × 201 ≈ 20,000 states, each trying up to 99 moves: about 2 million steps.',
          },
          {
            task: 'Why does Longest Increasing Path not need a visited set, while a general longest-path search would?',
            solution: 'Every step goes to a strictly larger value, so a path can never return to a cell. Without cycles, each cell\'s answer is fixed and can be cached.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What is the running time of a memoised recursion?',
            options: [
              'The size of the call tree without the cache',
              'Number of distinct states × work per state',
              'Always O(n)',
              'The depth of the recursion',
            ],
            answer: 1,
            why: 'Each distinct state is computed once, doing its own work; everything else is an O(1) lookup.',
          },
          {
            q: 'n can be as large as 2 × 10⁹, but each step divides n by 2 or 3. What cache should you use?',
            options: ['An array of size n + 1', 'A Map', 'No cache: it is fast enough', 'A sorted array with binary search'],
            answer: 1,
            why: 'An array that large would not fit in memory. The recursion reaches only a few hundred distinct values, which a Map stores easily.',
          },
          {
            q: 'In Frog Jump, which cache key is correct?',
            options: ['The stone index', 'The jump size', 'The pair (stone index, last jump size)', 'The whole path so far'],
            answer: 2,
            why: 'The future depends on both where the frog is and how far it last jumped. The path taken to get there does not matter.',
          },
          {
            q: 'Your memoised DFS crashes with "Maximum call stack size exceeded" on a 300 × 300 grid. What is the best fix?',
            options: [
              'Use a bigger cache',
              'Process the states bottom-up in a valid order (or with an explicit stack) instead of recursing',
              'Switch the cache from an array to a Map',
              'Add a visited set',
            ],
            answer: 1,
            why: 'The cache is fine; the recursion is too deep. An iterative order removes the call stack from the picture.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, write the plain recursion first, then name the cache key and estimate the number of states before adding
          the cache. Problems marked <b>Core</b> are the minimum set; mark each one Solved so the <a href="#/review">review queue</a>{' '}
          brings it back.
        </p>
      </div>
      <ProblemSet id="memoization" />

      <Recap>
        <ul>
          <li>Memoisation caches a recursion's answers by its arguments, so each distinct question is answered once.</li>
          <li>Cost = distinct states × work per state; count the states before you code.</li>
          <li>The key holds exactly the arguments that change and matter: an array for small ranges, a Map for huge or sparse ones.</li>
          <li>Uphill or one-way moves make a DAG, where memoised DFS needs no visited set; switch to bottom-up when recursion gets too deep.</li>
        </ul>
      </Recap>
    </>
  );
}
