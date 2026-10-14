import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/ordered-set';
import { calendarBookings, slidingMedian } from '../traces/ordered-set';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const calendar = calendarBookings([[10, 20], [25, 32], [15, 26], [20, 25], [5, 12], [0, 5]]);
const median = slidingMedian([5, 2, 8, 1, 9, 3, 7, 4], 3);

export default function OrderedSet() {
  return (
    <>
      <TopicIntro
        id="ordered-set"
        time="4–5 hours, plus problems"
        before={['bst', 'heap', 'binary-search']}
        learn={[
          'What an ordered set or map gives you: sorted iteration, floor and ceiling, rank and k-th, all in O(log n)',
          'How balanced search trees provide it: red-black and AVL trees, treaps and splay trees, in outline',
          'What to use in TypeScript, which has none built in: sorted arrays, lazy-deletion heaps, monotonic deques, Fenwick trees',
          'How to pick the right substitute from the operations a problem really needs',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A hash set answers "is x here?" in constant time, but it has no idea what order its items are in. Ask it "what is the
          smallest value bigger than 17?" and it can only check every item. An <b>ordered set</b> keeps its items sorted at all
          times, even while you insert and delete, so questions about order are fast too.
        </p>
        <p>
          Think of a library shelf sorted by call number. You can walk straight to where 17 would be and look left and right: the
          book just before is the <b>floor</b> of 17 and the book just after is its <b>ceiling</b>. New books slot into place
          without re-sorting the whole shelf. An ordered set gives you that shelf with every operation in{' '}
          <Cost>O(log n)</Cost>: insert, delete, contains, minimum, maximum, floor, ceiling, and walking the items in order.
          Some versions also answer <b>rank</b> (how many items are smaller than x) and <b>k-th</b> (which item is k-th smallest).
        </p>
        <p>
          C++ has <code>std::set</code> and <code>std::map</code>, Java has <code>TreeSet</code> and <code>TreeMap</code>, Python
          users reach for <code>SortedList</code>. <b>TypeScript has none of these.</b> So this chapter has two jobs: teach you what
          an ordered set does, so you recognise when a problem needs one, and teach you the substitutes that do the same job in
          TypeScript, usually more simply.
        </p>
      </div>

      <Walkthrough
        title="My Calendar: only the floor and the ceiling can clash"
        frames={calendar.frames}
        caption="A sorted array plus binary search plays the ordered map. Each request checks exactly two neighbours."
      />

      <Box kind="key" label="Key idea">
        <p>
          Before writing a balanced tree, list the operations the problem really performs. "Only the minimum or maximum" means a
          heap. "Values sorted, few insertions" means a sorted array. "Count how many are smaller, values can be compressed" means a
          Fenwick tree. A full ordered set is only needed when you mix arbitrary inserts, deletes and floor or ceiling queries at
          scale, and even then a short treap does the job.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>How balanced search trees do it</h2>
        <p>
          An ordered set is a binary search tree (<See id="bst" />) that keeps itself balanced, so its height stays about log n and
          every operation is <Cost>O(log n)</Cost>. A plain BST fed sorted input degenerates into a linked list of height n; the
          balancing schemes prevent that.
        </p>
        <ul>
          <li>
            <b>Red-black trees</b> and <b>AVL trees</b> rotate nodes after each insert or delete to keep strict height rules.
            Standard libraries use them. You will rarely write one in an interview.
          </li>
          <li>
            <b>Treaps</b> give every node a random priority and keep two rules at once: keys follow BST order, priorities follow
            heap order (a parent's priority beats its children's). Random priorities make the expected height O(log n). Treaps are
            short to write with two helpers, <i>split</i> (cut a tree into keys below and above a value) and <i>merge</i> (join two
            trees where all keys of one are smaller).
          </li>
          <li>
            <b>Splay trees</b> move every node you access to the root with rotations. Any single operation may be slow, but any
            sequence of m operations costs O(m log n) in total (amortised O(log n)), and recently used items stay near the top.
          </li>
          <li>
            If a node also stores the <b>size of its subtree</b>, the tree answers rank and k-th queries: walk down and add up left
            subtree sizes. That is an <i>order-statistics tree</i>. An <i>implicit</i> treap orders nodes by position instead of by
            key, which lets you cut and join sequences.
          </li>
        </ul>
      </div>
      <VizFigure
        parts={[
          { kind: 'tree', label: 'a treap: keys in BST order, priorities (p) in heap order', nodes: [5, 2, 8, 1, 4, 7, 9], notes: { 0: 'p 92', 1: 'p 71', 2: 'p 80', 3: 'p 30', 4: 'p 55', 5: 'p 64', 6: 'p 12' } },
        ]}
        caption="Reading the keys in order (left, node, right) gives 1, 2, 4, 5, 7, 8, 9. Every parent's priority is higher than its children's."
      />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>These are the TypeScript substitutes. Each covers part of what an ordered set does.</p>
      </div>
      <Structures
        items={[
          { name: 'Sorted array + binary search', ts: 'number[] kept sorted; splice to insert', ops: 'search O(log n); insert or delete O(n)', use: 'Floor, ceiling and ordered iteration when there are at most a few thousand insertions.' },
          { name: 'Heap with lazy deletion', ts: 'your own binary heap + a Map of current values', ops: 'push, top, pop O(log n)', use: 'Only the minimum or maximum is needed, but items change or expire.' },
          { name: 'Two heaps', ts: 'a max-heap and a min-heap', ops: 'O(log n) per update, median O(1)', use: 'Running or sliding median.' },
          { name: 'Monotonic deque', ts: 'array with a head index', ops: 'O(1) amortised', use: 'Minimum or maximum of a sliding window.' },
          { name: 'Fenwick tree over compressed values', ts: 'number[] (or Int32Array) of counts by rank', ops: 'add, prefix count, k-th O(log n)', use: 'Rank queries, counting smaller or larger values, floor and ceiling over a known set of values.' },
          { name: 'Buckets', ts: 'Map<bucketId, value>', ops: 'O(1)', use: 'When "close enough" means within a fixed distance (Contains Duplicate III).' },
          { name: 'Treap (hand-written)', ts: 'node objects with key, priority, left, right, size', ops: 'O(log n) expected', use: 'The general fallback when everything above fails.' },
        ]}
      />

      <div className="prose">
        <h3>Choosing a substitute</h3>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>What the problem does</th>
            <th>Use</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Insert rarely (≤ a few thousand), ask floor or ceiling</td><td>Sorted array + binary search</td></tr>
          <tr><td>Ask only for the min or max, with updates or expiry</td><td>Heap + lazy deletion</td></tr>
          <tr><td>Median of a window or stream</td><td>Two heaps (+ lazy deletion for windows)</td></tr>
          <tr><td>Min or max of a sliding window</td><td>Monotonic deque (<See id="monotonic-queue" />)</td></tr>
          <tr><td>Count values below x as values arrive</td><td>Fenwick tree over compressed values (<See id="binary-indexed-tree" />)</td></tr>
          <tr><td>Values in a small range (≤ 10⁵ or 10⁶)</td><td>Fenwick or segment tree indexed by value, no compression needed</td></tr>
          <tr><td>Arbitrary insert, delete, floor, ceiling, all online and large</td><td>Treap, or a segment tree over offline-compressed values</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Floor and ceiling</h2>
        <p>
          In sorted order, the value closest to x is always one of its two neighbours. That one fact solves a whole family of
          problems: whether a booking clashes, whether two values are close enough, which value an odd or even jump lands on.
        </p>
      </div>
      <Recipe
        name="Nearest neighbours in sorted order"
        when="each new item must be compared with existing items that are closest to it in value."
        steps={[
          'Keep the items sorted: a sorted array (few inserts), a Fenwick tree over compressed values (many inserts), or a real ordered set.',
          'For a query value x, find the insertion position by binary search (lower bound): the item there is the ceiling, the item before it is the floor.',
          'Check only those two items against your condition.',
          'Insert x if the problem says so.',
        ]}
        why="any item further away in sorted order is further away in value than the neighbour on the same side."
        time="O(log n) per query (+ O(n) per insert with a plain array)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Sorted keys and sweeps</h2>
        <p>
          An ordered map from time to change (+1 when a booking starts, −1 when it ends) lets you read the number of active
          bookings at every moment by walking the keys in order. In TypeScript keep a Map for the values and a sorted array for the
          keys, or simply sort the keys when you need them. This is the sweep line idea from <See id="sweep-line" />, kept up to
          date as events arrive.
        </p>

        <h2>Pattern 3: Interval sets</h2>
        <p>
          A set of disjoint intervals sorted by start is an ordered set of ranges. A new range can only touch one contiguous block
          of intervals, found by binary search. Adding merges that block into one interval; removing cuts it (possibly splitting
          one interval in two); querying checks the single interval that starts at or before the left end.
        </p>
      </div>
      <Recipe
        name="Maintain disjoint intervals"
        when="ranges are added, removed or queried, and the answer is about which numbers are covered."
        steps={[
          'Keep intervals sorted by start, never overlapping.',
          'For a range [l, r), binary search the first interval that ends at or after l, and walk forward while intervals start at or before r.',
          'To add: replace that block with one interval from the smallest start to the largest end.',
          'To remove: replace the block with the parts that stick out left of l and right of r.',
          'To query: look at the interval with the largest start ≤ l and check that it reaches r.',
        ]}
        why="intervals are disjoint and sorted, so those that touch [l, r) are consecutive in the list."
        time="O(log n + k) per operation plus array shifting"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Sorted window</h2>
        <p>
          A sliding window needs some ordered fact about its contents. If that fact is the maximum or minimum, two monotonic deques
          are enough. If it is the median, split the window into a smaller half (a max-heap) and a larger half (a min-heap). The
          problem is deletion: a value leaving the window may be buried inside a heap. <b>Lazy deletion</b> solves it: stop counting
          the value as live, and throw it away only when it surfaces at a top.
        </p>
      </div>
      <Walkthrough
        title="Sliding window median with two heaps and lazy deletion"
        frames={median.frames}
        caption={`Dimmed values have left the window but are still inside a heap. The heaps are drawn sorted for reading; a real heap only knows its top. Medians: ${median.medians.join(', ')}.`}
      />
      <Recipe
        name="Two heaps with lazy deletion"
        when="you need the median (or another middle value) of a window that slides, or of a collection with deletions."
        steps={[
          'Keep the smaller half in a max-heap and the larger half in a min-heap, and count the live elements in each.',
          'Add a value to the low heap if it is ≤ the low top, otherwise to the high heap.',
          'When a value leaves, decide which heap holds it by comparing with the low top, decrease that heap\'s live count, and mark it stale (store indices in the heaps, or count pending removals per value).',
          'Rebalance the live counts so low has as many as high, or one more. Before moving or reading a top, pop stale tops.',
          'The median is the low top (odd window) or the mean of both tops (even window).',
        ]}
        why="stale values never decide anything: they are only ever looked at when they reach a top, and then they are discarded."
        time="O(log n) amortised per step"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 5: Rank counting</h2>
        <p>
          "How many values to my right are smaller?" and "how many pairs i &lt; j have nums[i] &gt; 2 · nums[j]?" are rank
          questions. Process the array in index order so the other side of the pair has already been seen, and keep a{' '}
          <b>Fenwick tree</b> of counts indexed by each value's rank in sorted order (coordinate compression). Each step is one
          prefix query and one update. The Fenwick tree itself is taught in <See id="binary-indexed-tree" />; here, see it as an
          ordered multiset that answers "how many are below x" in <Cost>O(log n)</Cost>.
        </p>
      </div>
      <Recipe
        name="Fenwick tree as an ordered multiset"
        when="you must count earlier (or later) values in a range of values, for every element."
        steps={[
          'Collect every value that will ever be inserted or used as a bound, sort them and remove duplicates; a value\'s rank is its position (starting at 1).',
          'Walk the array in the order that makes the partner side "already seen".',
          'For the current element, count the inserted values in the needed rank range with prefix queries (prefix(hi) − prefix(lo − 1)). Use binary search to turn a value bound into a rank.',
          'Insert the current element by adding 1 at its rank.',
        ]}
        why="a prefix sum of counts over ranks is exactly the number of inserted values at or below a value."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 6: Lazy deletion heaps</h2>
        <p>
          Many design problems ask for "the best item" while items keep changing: the highest-rated food in a cuisine, the smallest
          index holding a number, the maximum stock price after corrections. You do not need a sorted structure, only the best item.
          Keep the truth in a map, push a new heap entry on every change, and when asked, pop tops that disagree with the map.
          Each entry is pushed once and popped at most once, so the cost is <Cost>O(log n)</Cost> amortised.
        </p>

        <h2>Pattern 7: Order by position</h2>
        <p>
          Sometimes the order is by position, not by value: "take the k-th item and move it to the end". An implicit treap or a
          splay tree keyed by position handles this in O(log n). A simpler trick: give each item a slot that is only ever appended,
          mark occupied slots with 1 in a Fenwick tree, and find the k-th occupied slot by descending the tree.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>The thinking path for <b>Sliding Window Median</b>, with up to 10⁵ numbers and any window size k.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Sort every window and take the middle: <Cost>O(n · k log k)</Cost>. With n = 100,000 and k = 50,000 there are about 50,000 windows, each costing close to a million steps to sort: tens of billions of operations.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Consecutive windows share k − 1 values. Re-sorting throws that order away. You want to keep the window sorted and change
          one value in, one value out. A C++ programmer would use a multiset. In TypeScript, a sorted array insert is O(k) per step,
          which is still too slow when k is large.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          The median only depends on the boundary between the smaller half and the larger half. A max-heap of the smaller half and a
          min-heap of the larger half keep exactly that boundary at their tops. A leaving value can be ignored until it reaches a top,
          because buried values never affect the tops; you only need correct live sizes to keep the halves balanced.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each value is pushed once and popped at most once: <Cost>O(n log n)</Cost>. With duplicates, track stale copies by index
          (or by count per value) so the right copy is discarded. With k = 1, the high heap is always empty and the median is the
          value itself. Even k averages two tops, which may be a fraction.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Writing a balanced tree when a heap or a sorted array would do. Name the operations first.</>,
          <>Inserting into a sorted array inside a loop of 10⁵ steps with a window or set that can grow large: that is O(n²).</>,
          <>Deleting from the middle of a heap by searching for the value. Use lazy deletion instead.</>,
          <>Forgetting that a JavaScript <code>Map</code> iterates in insertion order, not sorted order.</>,
          <>Using truncating division for bucket ids with negative values; use Math.floor.</>,
          <>Coordinate compression that forgets the values used only as query bounds; map those with binary search.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'The sorted values are 3, 8, 12, 20. What are the floor and the ceiling of 10? Of 12? Of 25?',
            solution: '10: floor 8, ceiling 12. 12: floor 12, ceiling 12. 25: floor 20, no ceiling.',
          },
          {
            task: 'A window holds 4, 9, 1, 7. Which values go in the low max-heap and which in the high min-heap, and what is the median?',
            solution: 'Low holds 1 and 4 (top 4), high holds 7 and 9 (top 7). Median = (4 + 7) / 2 = 5.5.',
          },
          {
            task: 'Values seen so far have ranks 1, 3, 3 and 5 in the compressed order. A new value has rank 4. Using prefix counts, how many seen values are strictly smaller?',
            solution: 'prefix(3) counts ranks 1 to 3: three values (1, 3, 3).',
          },
          {
            task: 'In Contains Duplicate III with valueDiff = 3, which bucket do the values −1, 0, 3, 4 and −5 fall into (width 4)?',
            hint: 'Bucket = floor(value / 4).',
            solution: '−1 → −1, 0 → 0, 3 → 0, 4 → 1, −5 → −2. Note that −1 and 3 are in different buckets even though both truncate toward 0.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A problem needs only "give me the current maximum", but items change over time. What is the simplest structure in TypeScript?',
            options: ['A hand-written red-black tree', 'A heap with lazy deletion and a map of current values', 'A sorted array', 'A hash set'],
            answer: 1,
            why: 'You only need the top. Push on every change and discard tops that disagree with the map.',
          },
          {
            q: 'Why is checking only the floor and the ceiling enough in My Calendar I?',
            options: [
              'Because bookings are short',
              'Because accepted bookings never overlap, so any clash would have to involve a neighbour in start order',
              'Because the calendar holds at most 1000 bookings',
              'It is not enough; you must check all bookings',
            ],
            answer: 1,
            why: 'Bookings are disjoint and sorted, so the only ones that can reach the new interval are the last one starting before it and the first one starting at or after it.',
          },
          {
            q: 'What makes a treap balanced (in expectation)?',
            options: ['Rotations after every insert based on heights', 'Random priorities kept in heap order', 'Splaying each accessed node to the root', 'Rebuilding the tree periodically'],
            answer: 1,
            why: 'With random priorities, the tree has the same shape as a BST built from a random insertion order, whose expected height is O(log n).',
          },
          {
            q: 'For "count of smaller numbers after self", in which direction do you scan?',
            options: ['Left to right', 'Right to left', 'Either: the answer is the same', 'From the middle outwards'],
            answer: 1,
            why: 'Scanning right to left, every value to the right has already been inserted into the Fenwick tree when you query.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, first write down the operations it needs, then choose the substitute. Several of these appear in other
          chapters too, because ordered structures are a tool, not a single trick. Mark problems Solved so the{' '}
          <a href="#/review">review queue</a> brings them back.
        </p>
      </div>
      <ProblemSet id="ordered-set" />

      <Recap>
        <ul>
          <li>An ordered set keeps items sorted under inserts and deletes: floor, ceiling, min, max, rank and k-th in O(log n).</li>
          <li>Balanced BSTs provide it: red-black and AVL by rotations, treaps by random priorities, splay trees by moving accessed nodes up.</li>
          <li>TypeScript has none built in: choose a substitute from the operations you need (sorted array, heap with lazy deletion, two heaps, deque, Fenwick tree, buckets).</li>
          <li>Lazy deletion: never dig inside a heap; discard out-of-date entries when they reach the top.</li>
          <li>Rank questions become prefix counts in a Fenwick tree over compressed values.</li>
        </ul>
      </Recap>
    </>
  );
}
