import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/quickselect';
import { kthLargest } from '../traces/quickselect';
import { Walkthrough } from '../viz/Walkthrough';

const run = kthLargest([7, 2, 9, 4, 1, 8, 5], 3);

export default function Quickselect() {
  return (
    <>
      <TopicIntro
        id="quickselect"
        time="3–4 hours, plus problems"
        before={['sorting', 'divide-and-conquer', 'two-pointers']}
        learn={[
          'How partitioning finds the k-th smallest or largest value without sorting everything',
          'Why random pivots give O(n) on average, and what goes wrong without them',
          'Lomuto, Hoare and three-way partitions, and when each one fits',
          'When to choose quickselect, a heap of size k, or a plain sort',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          You want the 30th tallest student in a hall of 100. Sorting everyone by height would work, but it does far more than
          you need. Instead, pick any student as a <b>pivot</b> and ask everyone shorter to stand on the left and everyone
          taller on the right. Suppose 40 people end up on the left. Then the pivot is exactly the 41st shortest, the 30th
          tallest is somewhere on the right, and you can send the left group home. Repeat with the right group only.
        </p>
        <p>
          That is <b>quickselect</b>: the partition step of quicksort, but recursing into <b>one</b> side instead of both. With a
          good pivot each round halves the work, so the total is about n + n/2 + n/4 + … = 2n, which is <Cost>O(n)</Cost>.
          Sorting would cost <Cost>O(n log n)</Cost>. The catch is the pivot: if it is always the smallest or largest value, each
          round removes just one element and the cost becomes <Cost>O(n²)</Cost>. Choosing the pivot at random makes that
          practically impossible.
        </p>
      </div>

      <Walkthrough
        title="Find the 3rd largest value with partitions"
        frames={run.frames}
        caption={`The walkthrough uses the last value as the pivot so you can repeat it on paper; real code picks a random pivot. ${run.partitions} partitions were enough here.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          After a partition, the pivot sits at the index it would have in fully sorted order, even though nothing else is sorted.
          Compare that index with the one you want and throw away the side that cannot contain it. You never sort anything you
          do not need.
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
          { name: 'Array (rearranged in place)', ts: 'number[] (copy it first if the input must stay unchanged)', ops: 'swap O(1)', use: 'Quickselect works by swapping inside the array, so it needs no extra memory.' },
          { name: 'Random pivot', ts: 'Math.random(), scaled to an index in lo..hi', ops: 'O(1)', use: 'Defeats inputs crafted to make fixed pivots slow (sorted, reversed).' },
          { name: 'Hash map', ts: 'Map<number, number>', ops: 'O(1) on average', use: 'Count frequencies before selecting by frequency.' },
          { name: 'Heap of size k', ts: 'no built-in; a binary heap on an array', ops: 'push and pop O(log k)', use: 'The alternative when data streams in or must not be rearranged.' },
        ]}
      />

      <div className="prose">
        <h2>Partition schemes</h2>
        <p>
          The partition step is the engine of quickselect and quicksort, and there are three classic ways to write it. All of
          them rearrange the range so smaller values end up before larger ones.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Scheme</th>
            <th>How it works</th>
            <th>Strength</th>
            <th>Weakness</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lomuto</td>
            <td>One boundary i and one scanner j move left to right. Each value smaller than the pivot is swapped to the boundary. Finally the pivot is swapped to i.</td>
            <td>Simple; the pivot ends at its exact sorted index.</td>
            <td>Many swaps, and with many equal values it removes one element per round.</td>
          </tr>
          <tr>
            <td>Hoare</td>
            <td>Two pointers start at both ends and walk inward; when the left one finds a large value and the right one a small value, they swap.</td>
            <td>About three times fewer swaps; handles equal values better.</td>
            <td>The pivot does not necessarily end at its final index, so the recursion logic is subtler.</td>
          </tr>
          <tr>
            <td>Three-way (Dutch national flag)</td>
            <td>low, mid and high pointers split the range into smaller, equal and larger parts.</td>
            <td>Arrays full of duplicates become easy: the whole equal block is settled at once.</td>
            <td>Slightly more bookkeeping.</td>
          </tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The three-way partition is exactly the Sort Colors technique from <See id="two-pointers" />, with "smaller than the
          pivot", "equal" and "larger" in place of 0, 1 and 2. For problems with many repeated values, it is the safe choice.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 1: The k-th element</h2>
      </div>
      <Recipe
        name="Quickselect"
        when="you need the value at one position of the sorted order: k-th smallest, k-th largest, or the median."
        steps={[
          'Turn the question into a target index of the ascending order: k − 1 for the k-th smallest, n − k for the k-th largest.',
          'Set lo and hi to the whole array.',
          'Pick a random pivot in lo..hi and partition three ways: smaller, equal, larger.',
          'If the target index falls inside the equal block, the pivot is the answer.',
          'Otherwise continue with the smaller block or the larger block, whichever contains the target.',
        ]}
        why="the partition puts every value on the correct side of the pivot, so the target index can only be in one block, and the others are never needed again."
        time="O(n) on average, O(n²) in the very unlikely worst case"
        space="O(1) with a loop instead of recursion"
      />

      <div className="prose">
        <h2>Pattern 2: Top k by partition</h2>
        <p>
          "Return the k closest points" or "the k most frequent values, in any order" are selection problems in disguise. Once the
          k-th element is in place, every element before it is no larger, so the first k positions already hold the answer. Their
          order among themselves is not sorted, and the problem does not ask for it.
        </p>
      </div>
      <Recipe
        name="Top k in any order"
        when="the answer is a set of k items by some score, and their order does not matter."
        steps={[
          'Compute the score of each item (squared distance, frequency) once.',
          'Quickselect on the scores for position k − 1 (smallest k) or n − k (largest k).',
          'Return the items on the chosen side of that position.',
        ]}
        why="after the final partition, everything on one side of position k is no worse than the k-th item, and everything on the other side is no better."
        time="O(n) on average"
        space="O(1) besides the scores"
      />

      <div className="prose">
        <h2>Pattern 3: Median by partition</h2>
        <p>
          The median has a special property: it minimises the sum of absolute distances to all values. That is why "make all
          elements equal with ±1 moves" is solved by moving everything to the median, and why "where to build a meeting point on a
          line" is answered by the median position. Quickselect finds it in linear time. Problems such as Wiggle Sort II also
          split values into a smaller half and a larger half around the median.
        </p>
      </div>
      <Recipe
        name="Use the median"
        when="you minimise a total absolute distance, or need to split values into a lower and an upper half."
        steps={[
          'Find the element at index ⌊n / 2⌋ of the sorted order with quickselect.',
          'For distance problems, add up |value − median| over all values.',
          'For splitting problems, partition three ways around the median to get the lower half, the copies of the median, and the upper half.',
        ]}
        why="moving the meeting point away from the median gets closer to fewer values than it moves away from, so the total distance grows."
        time="O(n) on average"
        space="O(1)"
      />

      <div className="prose">
        <h2>Quickselect, heap or sort?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Method</th>
            <th>Time</th>
            <th>Memory</th>
            <th>Choose it when</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Sort, then index</td><td>O(n log n)</td><td>O(n)</td><td>n is small, you also need sorted order, or simplicity matters most.</td></tr>
          <tr><td>Quickselect</td><td>O(n) average</td><td>O(1)</td><td>All data is in memory, you may rearrange it, and you need speed.</td></tr>
          <tr><td>Heap of size k (see <See id="heap" />)</td><td>O(n log k)</td><td>O(k)</td><td>Data arrives as a stream, k is small, or the input must stay untouched.</td></tr>
          <tr><td>Buckets (see <See id="linear-sorts" />)</td><td>O(n + range)</td><td>O(range)</td><td>The scores are small integers, such as frequencies.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          There is also a pivot rule called <b>median of medians</b> that guarantees <Cost>O(n)</Cost> even in the worst case. It
          is slower in practice and rarely expected in interviews; knowing that it exists is enough.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Minimum Moves to Equal Array Elements II</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every candidate final value t and add up |x − t| for all x. The best t is one of the values themselves, so that is
          n candidates times n terms: <Cost>O(n²)</Cost>, too slow for 10⁵ elements.
        </p>
        <Step n={2}>Find the structure</Step>
        <p>
          Picture the values as points on a line and t as a marker. Moving the marker one step right brings it one step closer to
          every point on its right and one step further from every point on its left. The total improves while more points are on
          the right, and gets worse once more points are on the left.
        </p>
        <Step n={3}>Prove the rule</Step>
        <p>
          So the total is smallest where the points are balanced on both sides: the median. Any position with fewer than half the
          points on one side can be improved by moving towards the bigger side. That needs no sorting, only the median.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Quickselect finds the median in <Cost>O(n)</Cost> on average and one pass adds the distances. With an even number of
          values, any marker between the two middle values gives the same total, so either middle value works. The values reach
          ±10⁹ and the answer fits in 32 bits by the problem's promise; TypeScript numbers are safe either way.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Using a fixed pivot (first or last value). Sorted or crafted inputs then cost O(n²). Pick a random pivot.</>,
          <>Using a two-way partition on arrays with many equal values. Each round removes one element; use three-way partitioning.</>,
          <>Mixing up k-th largest and k-th smallest. Convert to one target index of the ascending order before you start.</>,
          <>Returning the top k sorted when the problem allows any order, or forgetting to sort them when it does not.</>,
          <>Using quickselect on a stream that does not fit in memory. Use a heap of size k instead.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'In an array of 9 values, which ascending index holds the 4th largest value? And the median?',
            solution: 'The 4th largest is at index 9 − 4 = 5. The median is at index ⌊9 / 2⌋ = 4.',
          },
          {
            task: 'Partition 6, 3, 8, 1, 5 around the last value (Lomuto). Where does the pivot end up?',
            solution: '3 and 1 are smaller than 5 and move to the front: 3, 1, 8, 6, 5. Then the pivot swaps into index 2: 3, 1, 5, 6, 8. Its index is 2.',
          },
          {
            task: 'Why is quickselect O(n) on average while quicksort is O(n log n)?',
            solution: 'Quicksort recurses into both sides, so every level still processes about n elements. Quickselect recurses into one side, so the work shrinks geometrically: n + n/2 + n/4 + … ≈ 2n.',
          },
          {
            task: 'For the values 1, 2, 9, 10, 100, which final value minimises the total ±1 moves, and what is the total?',
            solution: 'The median, 9. Total = 8 + 7 + 0 + 1 + 91 = 107.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Quickselect with a random pivot on n values costs, on average:',
            options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(n²)'],
            answer: 1,
            why: 'Each round shrinks the range by a constant fraction on average, so the work adds up to a constant times n.',
          },
          {
            q: 'An array holds 10⁵ copies of the same value. Which partition keeps quickselect fast?',
            options: ['Lomuto with the last value as pivot', 'Three-way partition', 'Bubble sort first', 'Hoare without randomness'],
            answer: 1,
            why: 'All values land in the equal block in one pass, and the target is found immediately.',
          },
          {
            q: 'You must report the 10 largest values from a stream of a billion numbers. Best tool?',
            options: ['Quickselect', 'Sort everything', 'A min-heap of size 10', 'A Set'],
            answer: 2,
            why: 'The data does not fit in memory, so keep only the 10 best seen so far in a small heap.',
          },
          {
            q: 'Which value minimises the sum of absolute differences to a list of numbers?',
            options: ['The mean', 'The median', 'The largest value', 'The most frequent value'],
            answer: 1,
            why: 'Moving away from the median brings you closer to fewer points than it moves you away from.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Kth Largest Element in an Array is the template: get it right with a random pivot and a three-way partition, and the
          rest of this chapter is about recognising selection hiding inside other wording.
        </p>
      </div>
      <ProblemSet id="quickselect" />

      <Recap>
        <ul>
          <li>Quickselect partitions around a pivot and continues into only one side: O(n) on average, O(1) extra space.</li>
          <li>Random pivots avoid the O(n²) worst case; three-way partitioning handles many equal values.</li>
          <li>Top k in any order and the median are selection problems; the median minimises total absolute distance.</li>
          <li>Prefer a heap of size k for streams, buckets for small integer scores, and a plain sort when n is small.</li>
        </ul>
      </Recap>
    </>
  );
}
