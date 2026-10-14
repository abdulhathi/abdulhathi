import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/segment-tree';
import { segmentQuery, segmentRangeAdd, segmentUpdate } from '../traces/segment-tree';
import { Walkthrough } from '../viz/Walkthrough';

const values = [5, 2, 6, 1, 3, 4, 7, 8];
const query = segmentQuery(values, 2, 6);
const update = segmentUpdate(values, 3, 10);
const lazy = segmentRangeAdd(values, 1, 6, 2, 3);

export default function SegmentTree() {
  return (
    <>
      <TopicIntro
        id="segment-tree"
        time="5–6 hours, plus problems"
        before={['tree', 'divide-and-conquer', 'prefix-sum']}
        learn={[
          'How a segment tree stores a summary for every half, quarter and eighth of an array',
          'Range queries and point updates in O(log n), and why at most two nodes per level are split',
          'Custom summaries (runs, majority candidates, counts) and trees indexed by value',
          'Lazy propagation for range updates, dynamic trees for coordinates up to 10⁹, and the idea of persistence',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Prefix sums answer "sum of a range" in O(1), but a single change forces you to rebuild them in O(n). A plain array is
          the opposite: O(1) updates, O(n) queries. When a problem mixes 10⁵ queries with 10⁵ updates, both are too slow.
        </p>
        <p>
          A segment tree sits in between. Think of a sports league's results table that is also kept per region, per
          country and per continent. When one match result changes, only the tables that contain it change: one per level.
          And to answer a question about a big region, you combine a few ready-made tables instead of every match. The root
          summarises the whole array, each child summarises half of its parent, and the leaves are the single values.
        </p>
        <p>
          The tree has about 2n nodes and height log₂ n. An update walks one root-to-leaf path: <Cost>O(log n)</Cost>. A query
          takes whole nodes that fit inside the range and splits only nodes that overlap it partly; on each level at most two
          nodes are split, so a query is also <Cost>O(log n)</Cost>. Watch a range sum query on eight values.
        </p>
      </div>

      <Walkthrough
        title="Range sum query: whole nodes inside the range answer at once"
        frames={query.frames}
        caption={`Green nodes are fully inside [2, 6] and contribute their sums; grey ones are skipped. Sum = ${query.answer}, using ${query.visited} node visits.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A segment tree works for any summary that two halves can <b>merge</b> in O(1): sum, minimum, maximum, gcd, the
          number of ones, the longest run, a majority candidate. Define the summary and the merge, and build, update and query
          all follow the same three rules.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to a segment tree. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Array-backed tree', ts: 'number[] (or a typed array) of size 2n or 4n', ops: 'node children at 2p + 1 and 2p + 2', use: 'The standard layout: no node objects, very fast.' },
          { name: 'Lazy tags', ts: 'a second array of pending updates', ops: 'O(1) per node', use: 'Range add, assign or flip: the change waiting to be pushed to the children.' },
          { name: 'Node objects', ts: '{ lo, hi, left, right, max, lazy }', ops: 'created on demand', use: 'Dynamic segment trees over 0..10⁹, where only touched ranges get nodes.' },
          { name: 'Coordinate compression', ts: 'sorted unique number[] plus a Map from value to rank', ops: 'O(log n) or O(1) lookup', use: 'Map huge coordinates or values to 0..m − 1 before building a normal tree.' },
          { name: 'BigInt', ts: 'bigint', ops: 'exact, slower', use: 'Totals that can pass 2⁵³, such as running sums of 10¹⁶ or areas of 10¹⁸.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Point update, range query</h2>
        <p>
          This is the basic tree. Each node stores the summary of its range. To change one value, walk down to its leaf, change
          it, and recompute every ancestor from its two children. To query a range, recurse from the root with three cases: the
          node is outside the range (contribute nothing), inside it (contribute its summary), or partly inside (ask both
          children).
        </p>
      </div>
      <Walkthrough
        title="Point update: one path from the leaf back to the root"
        frames={update.frames}
        caption={`After setting index 3 to 10, the root holds ${update.root}. Only the nodes on one path changed.`}
      />
      <Recipe
        name="Segment tree: build, update, query"
        when="you need range summaries and single-value updates, each in O(log n)."
        steps={[
          'Build: a leaf holds its value; an internal node holds merge(left child, right child), computed bottom-up.',
          'Update(i, v): go down to the leaf for i, set it, then recompute each ancestor on the way back up.',
          'Query(l, r) at a node: if its range is outside [l, r], return the neutral value (0 for sums, ∞ for min).',
          'If its range is inside [l, r], return its summary.',
          'Otherwise return merge(query on the left child, query on the right child).',
        ]}
        why="each level has at most two partly covered nodes, so a query visits O(log n) nodes; an update changes one node per level."
        time="O(log n) per operation, O(n) to build"
        space="O(n)"
      />

      <div className="prose">
        <h3>Searching by descending the tree</h3>
        <p>
          A max tree can also find things: "the leftmost basket with capacity at least x" or "the first building after hi that
          is taller than h". At each node, if the left child's maximum is big enough (and lies in the allowed range), go left;
          otherwise go right. That is one path, so O(log n), with no binary search on top.
        </p>

        <h2>Pattern 2: Custom summaries</h2>
        <p>
          The summary can be anything that merges. For the longest run of one character, store (prefix run, suffix run, best
          run, first and last character): the best run of a merged node is the best of the two halves or the left suffix plus
          the right prefix when the boundary characters match. For a majority element, store a Boyer–Moore (candidate, count)
          pair: equal candidates add, different ones cancel. The tree then gives a candidate for any range, which you verify.
        </p>

        <h2>Pattern 3: Tree over values</h2>
        <p>
          Index the tree by <b>value</b> instead of position and scan the array. Then "how many numbers smaller than x have I
          seen?" is a range sum over values below x, and "the longest chain ending with a value in [x − k, x − 1]" is a range
          maximum. When values are huge, compress them to ranks first. A binary indexed tree handles the sum version more
          simply; see <See id="binary-indexed-tree" />.
        </p>

        <h2>Pattern 4: Lazy propagation</h2>
        <p>
          Updating a whole range one leaf at a time is O(n log n). Instead, when an update fully covers a node, change the node's
          summary directly (add delta × length to a sum, or count = length − count for a flip) and leave a <b>lazy tag</b>{' '}
          saying "my children still owe this change". Whenever a later operation needs to go below that node, it first pushes
          the tag down to the two children. Work is only done where it is needed.
        </p>
      </div>
      <Walkthrough
        title="Lazy propagation: add 2 to [1, 6], then a query pushes the change down"
        frames={lazy.frames}
        caption={`Amber nodes took the change and carry a "+2" note for their children. The root now holds ${lazy.root}, and index 3 reads ${lazy.probeValue}.`}
      />
      <Recipe
        name="Lazy propagation"
        when="updates apply to whole ranges: add, assign or flip."
        steps={[
          'Give each node a tag for the change its children have not received yet.',
          'Apply(node, change): update the node\'s summary as if every value below changed, and combine the change into its tag.',
          'Push(node): if it has a tag, apply it to both children and clear it. Always push before entering a node\'s children.',
          'Range update: fully covered nodes get apply; partly covered nodes push, recurse into both children, then recompute their summary.',
          'Queries are unchanged except that they push before descending.',
        ]}
        why="a covered node's summary can be updated without visiting its children, and the children are brought up to date the moment anyone looks at them."
        time="O(log n) per range update or query"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 5: Huge coordinates</h2>
        <p>
          Calendars and intervals often use coordinates up to 10⁹, too many for an array. Two fixes. <b>Offline:</b> if you know
          all coordinates in advance, sort and compress them so only the real endpoints remain. <b>Online:</b> build a{' '}
          <b>dynamic</b> segment tree whose nodes are created only when an operation reaches them; each operation creates
          O(log C) nodes, where C = 10⁹. For simpler interval problems (Range Module, Count Integers in Intervals) a sorted set
          of disjoint intervals is often enough; see <See id="ordered-set" />.
        </p>
        <h2>Pattern 6: Versions</h2>
        <p>
          A persistent structure keeps every old version. The trick is to never modify a node: an update copies only the
          O(log n) nodes on its path and points to the unchanged children of the old version. LeetCode's only problem tagged
          Persistent Data Structure, Snapshot Array, uses the simplest form: a list of (version, value) changes per index, and a
          binary search to read the past.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Need</th>
            <th>Best tool</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Range sums, no updates</td><td>Prefix sums (<See id="prefix-sum" />)</td><td>O(1) per query, trivial to write.</td></tr>
          <tr><td>Range sums with point updates</td><td>Binary indexed tree (<See id="binary-indexed-tree" />)</td><td>Shorter and faster than a segment tree.</td></tr>
          <tr><td>Range min or max, no updates</td><td>Sparse table (<See id="range-queries" />)</td><td>O(1) per query after O(n log n) preprocessing.</td></tr>
          <tr><td>Range min, max or custom summary with updates</td><td>Segment tree</td><td>Any mergeable summary in O(log n).</td></tr>
          <tr><td>Range updates (add, assign, flip)</td><td>Segment tree with lazy propagation</td><td>Covered nodes absorb the change.</td></tr>
          <tr><td>Coordinates up to 10⁹</td><td>Compression, or a dynamic segment tree</td><td>Only touched coordinates need nodes.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Falling Squares</b>: squares drop one by one onto a line; each lands on the highest
          point under it. Report the tallest stack after every drop.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          For each new square, compare it with every earlier square it overlaps and take the highest top: <Cost>O(n²)</Cost>.
          With n = 1000 that passes, but it does not scale, so look for the operations hiding inside.
        </p>
        <Step n={2}>Name the operations</Step>
        <p>
          Landing height = (maximum height over [left, left + side)) + side. Then every point in that range becomes that new
          height. So each drop is a <b>range maximum</b> followed by a <b>range assignment</b>.
        </p>
        <Step n={3}>Choose the structure</Step>
        <p>
          Coordinates reach 10⁸, but there are only 2n endpoints: compress them. A segment tree over the compressed points stores
          the maximum of each node and a lazy "assign" tag. Treat the right end as exclusive, so squares that only touch at an
          edge do not stack.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each drop is two O(log n) operations, so <Cost>O(n log n)</Cost> in total. Keep a running maximum for the answer, since
          the tallest stack never shrinks. Done.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Allocating 2n slots for the recursive layout on an n that is not a power of two: use 4n, or the iterative layout.</>,
          <>Forgetting to push a lazy tag before entering the children, so they read stale values.</>,
          <>Setting a lazy tag instead of combining it (two flips must cancel; two adds must add up).</>,
          <>Using the wrong neutral value for outside nodes: 0 for sums, +∞ for minimums, −∞ for maximums.</>,
          <>Building an array over coordinates up to 10⁹ instead of compressing or creating nodes on demand.</>,
          <>Reaching for a segment tree when prefix sums or a binary indexed tree would do; it is more code to get wrong.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'For the array [5, 2, 6, 1, 3, 4, 7, 8], write the sums stored at the root, its two children and its four grandchildren.',
            solution: 'Root 36. Children: [0, 3] = 14 and [4, 7] = 22. Grandchildren: [0, 1] = 7, [2, 3] = 7, [4, 5] = 7, [6, 7] = 15.',
          },
          {
            task: 'Which nodes does a sum query for [1, 4] take whole on that tree?',
            hint: 'Look for the largest nodes that fit inside [1, 4].',
            solution: 'The leaf [1], the node [2, 3] and the leaf [4]: 2 + 7 + 3 = 12.',
          },
          {
            task: 'A node covering 4 values has sum 10 and a pending "+3" tag. What does its sum become after another "+2" on the whole node, and what is its tag?',
            solution: 'The sum becomes 10 + 2 × 4 = 18 (the +3 was already included). The tag becomes +5 for the children.',
          },
          {
            task: 'Design the summary for "longest run of equal characters". What do you store, and how do you merge two halves?',
            solution: 'Store prefix run, suffix run, best run, first and last character, and length. Merge: best = max of both bests, plus left suffix + right prefix if left\'s last character equals right\'s first; extend the prefix only if the whole left half is one run (and the suffix symmetrically).',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why does a segment tree query visit only O(log n) nodes?',
            options: [
              'Because it uses binary search on the array',
              'Because on each level at most two nodes are partly covered and need splitting',
              'Because the tree stores prefix sums',
              'Because queries are cached',
            ],
            answer: 1,
            why: 'Nodes fully inside the range answer immediately and nodes outside are skipped; only the two boundary paths go deeper.',
          },
          {
            q: 'Which summary could NOT be kept in a segment tree directly?',
            options: ['Sum', 'Minimum', 'Median of the range', 'Number of ones'],
            answer: 2,
            why: 'The median of a merged range cannot be computed from the two halves\' medians, so it is not a mergeable summary.',
          },
          {
            q: 'What does a lazy tag on a node mean?',
            options: [
              'The node is out of date',
              'The node is up to date, but its children still owe this change',
              'The node will be deleted',
              'The node covers a single value',
            ],
            answer: 1,
            why: 'Apply updates the node\'s own summary at once; the tag records what must still be pushed to its children.',
          },
          {
            q: 'Coordinates go up to 10⁹ and calls arrive online. What do you build?',
            options: ['An array of 10⁹ leaves', 'A dynamic segment tree that creates nodes on demand', 'A sparse table', 'Nothing: sort every time'],
            answer: 1,
            why: 'Each operation creates only O(log 10⁹) ≈ 30 nodes, so memory stays proportional to the number of operations.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Implement the basic tree once from memory with Range Sum Query - Mutable before anything else. Then try the descent
          problems, the custom summaries, the value-indexed trees, and finally lazy propagation and huge coordinates. Problems
          marked <b>Core</b> are the minimum set.
        </p>
      </div>
      <ProblemSet id="segment-tree" />

      <Recap>
        <ul>
          <li>A segment tree stores a mergeable summary for every node's range: queries and updates in O(log n).</li>
          <li>Three query cases: outside (neutral value), inside (node summary), partial (merge both children).</li>
          <li>Index by value to count or optimise over values seen so far; descend a max tree to find the first fit.</li>
          <li>Lazy tags make range updates O(log n); compression or dynamic nodes handle coordinates up to 10⁹.</li>
        </ul>
      </Recap>
    </>
  );
}
