import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/binary-indexed-tree';
import { countSmallerAfterSelf, fenwickWalk } from '../traces/binary-indexed-tree';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const walk = fenwickWalk([3, 2, -1, 6, 5, 4, -3, 3], 7, 3, 5);
const smaller = countSmallerAfterSelf([4, 7, 1, 5, 2]);
const lowbit = (i: number) => i & -i;
const coverage = Array.from({ length: 8 }, (_, k) => {
  const i = k + 1;
  return { start: i - lowbit(i), end: i, label: `tree[${i}] = a[${i - lowbit(i) + 1}..${i}]`, tone: lowbit(i) >= 4 ? ('info' as const) : undefined };
});

export default function BinaryIndexedTree() {
  return (
    <>
      <TopicIntro
        id="binary-indexed-tree"
        time="3–4 hours, plus problems"
        before={['prefix-sum', 'bit-manipulation', 'segment-tree']}
        learn={[
          'How a binary indexed tree (Fenwick tree) stores block sums in a single array',
          'lowbit(i), the value of i\'s lowest 1-bit, and why it drives both the query and the update',
          'Counting smaller, larger or bounded values with a BIT over compressed values',
          'Finding the k-th remaining item, and prefix maximums for DP',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A binary indexed tree, or Fenwick tree, does one job extremely well: <b>prefix sums with point updates</b>, both in{' '}
          <Cost>O(log n)</Cost>, in a single array of n + 1 numbers and a few lines of logic. It does less than a segment tree
          but is much shorter, so it is the first choice whenever the question is about sums or counts.
        </p>
        <p>
          The trick is in how the blocks are chosen. Write any position i in binary. Its lowest 1-bit, called{' '}
          <b>lowbit(i)</b>, has some value 1, 2, 4, 8…, and tree[i] stores the sum of exactly that many values ending at i. So
          tree[6] (binary 110, lowbit 2) holds a[5] + a[6], and tree[8] (binary 1000, lowbit 8) holds a[1..8]. Any prefix 1..i
          splits into at most log₂ n such blocks, one per 1-bit of i.
        </p>
        <p>
          To read prefix(i), add tree[i] and remove i's lowest 1-bit, until i is 0. To add to a[i], add to tree[i] and add i's
          lowest 1-bit to move to the next block that also contains i, until you pass n. Think of lowbit as a ruler with marks of
          length 1, 2, 4, 8: going down, you measure off the largest block that ends where you stand.
        </p>
      </div>

      <VizFigure
        caption="Which values each cell of the tree covers, for n = 8. Cells whose index has a large lowest 1-bit (4 and 8, in blue) cover long blocks; odd indices cover only themselves."
        parts={[{ kind: 'intervals', label: 'tree[i] covers the lowbit(i) values ending at i', items: coverage, min: 0, max: 8 }]}
      />

      <Walkthrough
        title="Prefix query by stripping bits, update by adding them"
        frames={walk.frames}
        caption={`prefix(7) = tree[7] + tree[6] + tree[4] = ${walk.prefix}. Adding 5 at index 3 changes tree[3], tree[4] and tree[8].`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A query walks <b>down</b> by removing the lowest 1-bit (i becomes i − lowbit(i)); an update walks <b>up</b> by adding it
          (i becomes i + lowbit(i)). Each step changes one bit position, so both take at most log₂ n steps. Any range is then
          prefix(r) − prefix(l − 1).
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to a binary indexed tree. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Binary indexed tree', ts: 'number[] of length n + 1 (index 0 unused)', ops: 'prefix query and point update O(log n)', use: 'Sums and counts with updates. 1-indexed: shift positions by one.' },
          { name: 'Coordinate compression', ts: 'sorted unique number[] plus Map from value to rank', ops: 'O(n log n) once, O(1) per lookup', use: 'Values up to 10⁹ or negative become ranks 1..m.' },
          { name: 'Prefix-maximum BIT', ts: 'number[] storing maximums', ops: 'O(log n)', use: 'Best chain so far among keys ≤ x, as long as stored values only increase.' },
          { name: 'Binary lifting search', ts: 'powers of two from high to low', ops: 'O(log n)', use: 'Find the smallest position whose prefix sum reaches k (the k-th remaining item).' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Prefix sums with updates</h2>
        <p>
          This is the BIT's home ground: Range Sum Query - Mutable, counting peaks after updates, positions in a list where items
          keep moving to the front. Remember that LeetCode's update usually <i>sets</i> a value while the BIT <i>adds</i>, so keep
          the current array and add the difference.
        </p>
      </div>
      <Recipe
        name="Binary indexed tree"
        when="you need prefix or range sums while single values keep changing."
        steps={[
          'Create tree of size n + 1, all zeros. Position i of the input is index i + 1 in the tree.',
          'add(i, delta): while i ≤ n, add delta to tree[i], then increase i by lowbit(i).',
          'prefix(i): start a sum at 0; while i > 0, add tree[i], then decrease i by lowbit(i).',
          'range(l, r) = prefix(r) − prefix(l − 1).',
          'To set a value, add (new value − old value) and remember the new value.',
        ]}
        why="every prefix splits into at most log n blocks, one per 1-bit, and every position belongs to at most log n blocks."
        time="O(log n) per operation, O(n log n) to build by adding (O(n) with the parent trick)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Counting by value</h2>
        <p>
          The most common BIT trick in interviews: scan the array and keep a BIT of <b>counts by value</b>. Before adding the
          current value, a prefix query tells you how many earlier values are smaller (or at most some bound). Scan right to left
          to count elements to the right instead. Values are usually compressed to ranks first, so the BIT has one slot per
          distinct value.
        </p>
      </div>
      <Walkthrough
        title="Count of Smaller Numbers After Self: scan from the right, count with the BIT"
        frames={smaller.frames}
        caption={`Each answer is one prefix query over ranks below the current value. Result: [${smaller.counts.join(', ')}].`}
      />
      <Recipe
        name="Count smaller values seen so far"
        when="for each element you need how many elements before it (or after it) are smaller, larger, or within a bound."
        steps={[
          'Collect every value you will insert or query (including derived ones such as 2 × x), sort, remove duplicates, and give each a rank from 1.',
          'Scan in the direction that makes "already inserted" mean the side you want.',
          'For each element: query the BIT for the ranks that satisfy the condition (a prefix, or total minus a prefix).',
          'Then add 1 at the element\'s own rank.',
        ]}
        why="the BIT always holds exactly the values already scanned, and a prefix over ranks is a count over values."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Order statistics</h2>
        <p>
          Put a 1 at every position that is still free (or still present). Then prefix(i) is the number of free positions up to
          i, and "the k-th free position" is the smallest i whose prefix reaches k. Find it by <b>binary lifting</b>: try steps of
          the largest power of two first and take a step whenever the block sum is still below k. This reconstructs Queue
          Reconstruction by Height and tracks shifting positions when digits are moved to the front.
        </p>
        <h2>Pattern 4: Prefix maximum for DP</h2>
        <p>
          A BIT can store maximums instead of sums, provided each slot's value only ever increases. Then "the best chain ending
          with a key ≤ x" is a prefix-maximum query. Longest obstacle course and maximum balanced subsequence sum are both this,
          after the right change of key (for the balanced subsequence the key is nums[i] − i).
        </p>
        <h2>Pattern 5: Offline sweeps</h2>
        <p>
          When queries ask about two conditions, such as "rectangles with length ≥ x and height ≥ y", sort both the items and
          the queries by one condition, sweep in that order inserting items, and let the BIT answer the other condition.
          Answers are written back in the original order at the end.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th></th>
            <th>Binary indexed tree</th>
            <th>Segment tree</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Code size</td><td>About ten lines</td><td>Several times longer</td></tr>
          <tr><td>Prefix and range sums with updates</td><td>Yes, O(log n)</td><td>Yes, O(log n)</td></tr>
          <tr><td>Range minimum or maximum with arbitrary updates</td><td>No (prefix max only, values must grow)</td><td>Yes</td></tr>
          <tr><td>Range updates</td><td>Range add with point query, using a difference array; range add with range sum needs two BITs</td><td>Yes, with lazy propagation</td></tr>
          <tr><td>Custom summaries (runs, majority)</td><td>No</td><td>Yes</td></tr>
          <tr><td>Memory</td><td>n + 1 numbers</td><td>2n to 4n numbers</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Count Good Triplets in an Array</b>: two permutations, count the triples of values that
          appear in the same order in both.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>Try every triple of values and check both orders: <Cost>O(n³)</Cost>, hopeless for n = 10⁵.</p>
        <Step n={2}>Simplify the condition</Step>
        <p>
          Replace each value in nums1 by its position in nums2. Now "same order in both arrays" means "increasing in this new
          array": you need the number of increasing triples i &lt; j &lt; k.
        </p>
        <Step n={3}>Fix the middle</Step>
        <p>
          A triple has one middle element. For each j, the number of triples with j in the middle is (smaller values to its left)
          × (larger values to its right). Scan left to right with a BIT of seen values: the left count is a prefix query, and the
          right count follows from the totals, because the array is a permutation.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          n queries and n updates: <Cost>O(n log n)</Cost>. The total can reach about 10¹⁴, still exact in TypeScript numbers.
          Done.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Using index 0 in the BIT: lowbit(0) is 0, so the update loop never ends. The tree is 1-indexed.</>,
          <>Adding the new value on an update that should SET it; add the difference instead.</>,
          <>Querying up to the value itself when you want strictly smaller values: query rank − 1.</>,
          <>Forgetting to compress derived values (such as 2 × x or prefix sum − upper) together with the originals.</>,
          <>Expecting a BIT to answer range minimums with arbitrary updates; use a segment tree for that.</>,
          <>Inserting the current element before querying, so it counts itself.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Which values does tree[12] cover? Which cells does prefix(13) add up?',
            hint: '12 is 1100 in binary; 13 is 1101.',
            solution: 'lowbit(12) = 4, so tree[12] covers a[9..12]. prefix(13) adds tree[13] (a[13]), then tree[12] (a[9..12]), then tree[8] (a[1..8]).',
          },
          {
            task: 'With n = 16, which cells change when you add to position 5?',
            solution: '5 → 6 → 8 → 16 (5 + 1 = 6, 6 + 2 = 8, 8 + 8 = 16).',
          },
          {
            task: 'Count of Smaller Numbers After Self on [3, 1, 2, 3, 0]: write the answer and explain one entry using the BIT.',
            solution: '[3, 1, 1, 1, 0]. For the first 3, the values to its right are 1, 2, 3, 0; scanning from the right they are already in the BIT, and the prefix over ranks below 3 counts 1, 2 and 0: 3.',
          },
          {
            task: 'For Reverse Pairs (nums[i] > 2 × nums[j]), what exactly do you compress, and which query do you make for each j?',
            solution: 'Compress every nums[i] and every 2 × nums[i] together. For each j: (count inserted so far) − prefix(rank of 2 × nums[j]), then insert nums[j].',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What is lowbit(12)?',
            options: ['1', '2', '4', '8'],
            answer: 2,
            why: '12 is 1100 in binary; its lowest 1-bit has value 4.',
          },
          {
            q: 'How does a BIT prefix query move from index i to the next index?',
            options: ['i + lowbit(i)', 'i − lowbit(i)', 'i / 2', 'i − 1'],
            answer: 1,
            why: 'Removing the lowest 1-bit jumps to the block that ends just before the current one.',
          },
          {
            q: 'Values range from −10⁹ to 10⁹. What do you do before using a BIT over values?',
            options: ['Use a Map instead of an array', 'Compress the values to ranks', 'Add 10⁹ to every value', 'Use a segment tree'],
            answer: 1,
            why: 'Only the distinct values that actually occur need slots, so map them to ranks 1..m.',
          },
          {
            q: 'Which task is a better fit for a segment tree than a BIT?',
            options: ['Range sums with point updates', 'Counting smaller elements', 'Range minimum with point updates that can decrease or increase values', 'Prefix sums'],
            answer: 2,
            why: 'A BIT cannot undo a maximum or minimum when a value changes arbitrarily; a segment tree recomputes from children.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Write the two BIT loops from memory with Range Sum Query - Mutable, then spend most of your time on the counting
          problems: they are the ones interviews use. Order statistics and prefix-maximum problems come last. Problems marked{' '}
          <b>Core</b> are the minimum set.
        </p>
      </div>
      <ProblemSet id="binary-indexed-tree" />

      <Recap>
        <ul>
          <li>tree[i] holds the sum of the lowbit(i) values ending at i; prefix queries strip low bits, updates add them.</li>
          <li>Both operations are O(log n) in one array of n + 1 numbers; ranges are differences of prefixes.</li>
          <li>Counting by value (after compressing to ranks) answers "how many earlier values are smaller" in O(log n).</li>
          <li>Use a segment tree instead for range min/max with arbitrary updates, lazy range updates or custom summaries.</li>
        </ul>
      </Recap>
    </>
  );
}
