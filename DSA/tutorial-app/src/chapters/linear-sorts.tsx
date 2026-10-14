import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/linear-sorts';
import { countingSort, radixSort } from '../traces/linear-sorts';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const counting = countingSort([4, 1, 3, 4, 0, 2, 1], 4);
const radix = radixSort([170, 45, 75, 90, 802, 24, 2, 66]);

export default function LinearSorts() {
  return (
    <>
      <TopicIntro
        id="linear-sorts"
        time="3–4 hours, plus problems"
        before={['sorting', 'hash-table', 'counting']}
        learn={[
          'How counting sort beats O(n log n) by using values as array positions',
          'Stable counting sort with prefix sums, and why radix sort depends on stability',
          'Bucket sort by frequency for top-k problems in guaranteed linear time',
          'The pigeonhole trick behind Maximum Gap and bucketed nearby-value checks',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A post office does not sort letters by comparing them with each other. Each letter goes straight into the pigeonhole for
          its street, and the pigeonholes are already in order. That is the trick of this chapter: when keys are small whole
          numbers (or letters, or digits), use the key itself as an <b>address</b>, and no comparisons are needed.
        </p>
        <p>
          The <See id="sorting" /> chapter showed that a sort which only compares elements needs about n log n comparisons. These
          sorts escape that limit because they never compare two elements. They cost <Cost>O(n + k)</Cost>, where k is the number
          of possible keys. When k is small (heights up to 100, frequencies up to n, ten digits) that is linear time. When k is
          huge (values up to 10⁹), a plain count array would be far too big, and you need buckets by range or radix passes instead.
        </p>
      </div>

      <Walkthrough
        title="Counting sort: tally, then read the tallies back"
        frames={counting.frames}
        caption="The count array's index is the value itself, so walking it from left to right visits the values in sorted order."
      />

      <Box kind="key" label="Key idea">
        <p>
          Ask how many different values the key can take. If that number is small, an array indexed by the key replaces sorting,
          searching and comparing. Frequencies (1 to n), letters (26), digits (10), small heights and ages are all small key
          ranges.
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
          { name: 'Count array', ts: 'number[] filled with zeros, or Int32Array', ops: 'increment O(1)', use: 'One slot per possible value. Add an offset for negative values.' },
          { name: 'Prefix sums of counts', ts: 'number[]', ops: 'O(k) to build', use: 'Turns counts into starting positions, for a stable counting sort.' },
          { name: 'Array of buckets', ts: 'number[][] or string[][]', ops: 'push O(1)', use: 'Bucket by frequency, or by value range.' },
          { name: 'Bucket min and max', ts: 'two number[] arrays', ops: 'O(1) per value', use: 'Maximum Gap only needs each bucket\'s extremes, not its contents.' },
          { name: 'Hash map of buckets', ts: 'Map<number, number>', ops: 'O(1) on average', use: 'Sparse buckets when the value range is huge (Contains Duplicate III).' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Counting sort</h2>
        <p>
          The simple version writes each value out as many times as it was counted. When you need to move whole records (sort
          people by age and keep everything else), use the <b>stable</b> version: turn the counts into prefix sums, so each key
          knows where its block of the output starts, then place every record into its key's next free slot, walking the input
          from left to right. Records with equal keys keep their input order, which is what radix sort relies on.
        </p>
      </div>
      <Recipe
        name="Counting sort"
        when="keys are integers in a small range 0..k − 1 (shift negative keys by an offset)."
        steps={[
          'Make a count array of size k filled with zeros.',
          'For each element, add one to the count of its key.',
          'Simple version: walk the keys from 0 to k − 1 and write each key out as many times as counted.',
          'Stable version: replace the counts with running totals of the counts before each key (each key\'s starting position), then place each element at its key\'s position and move that position on.',
        ]}
        why="the count array is indexed by key, so visiting it in index order is visiting the keys in sorted order."
        time="O(n + k)"
        space="O(n + k)"
      />

      <div className="prose">
        <h2>Pattern 2: Bucket by frequency</h2>
        <p>
          "Return the k most frequent elements" looks like it needs a sort by frequency. But a frequency is a whole number between
          1 and n, so it can index an array of n + 1 buckets: bucket f holds every value that appears exactly f times. Walk the
          buckets from n down and you meet the values in decreasing order of frequency, in linear time.
        </p>
      </div>
      <VizFigure
        caption="Values 1, 1, 1, 2, 2, 3 and 4, 4, 4 bucketed by frequency. Walking from the highest bucket down gives 1 and 4 first, then 2, then 3."
        parts={[
          { kind: 'map', label: 'counts', keyTitle: 'value', valueTitle: 'frequency', entries: [[1, 3], [2, 2], [3, 1], [4, 3]] },
          { kind: 'map', label: 'buckets by frequency', keyTitle: 'frequency', valueTitle: 'values', entries: [[3, '1, 4'], [2, '2'], [1, '3']], tones: { 0: 'match' } },
        ]}
      />
      <Recipe
        name="Frequency buckets"
        when="you need items ordered by how often they occur, faster than O(n log n)."
        steps={[
          'Count each item with a Map.',
          'Create n + 1 empty buckets and put each distinct item into the bucket for its count.',
          'Walk the buckets from the highest index down, collecting items until you have what you need.',
          'If ties need an order (alphabetical, say), sort only within a bucket.',
        ]}
        why="frequencies are bounded by n, so they are small keys, and bucketing by a small key is counting sort."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Buckets by value range</h2>
        <p>
          Classic <b>bucket sort</b> splits the value range into equal-width buckets, drops each value into its bucket, sorts each
          small bucket and concatenates them. On evenly spread data the buckets stay tiny and the whole sort is linear on average.
        </p>
        <p>
          The more useful idea for problems is what the buckets <i>guarantee</i>. The <b>pigeonhole principle</b> says that if you
          put n + 1 pigeons into n holes, some hole holds two. Its cousin here: n values spread over a range have an average gap of
          (max − min) / (n − 1), and the largest gap is at least the average. So if every bucket is narrower than the average gap,
          the largest gap can never lie inside one bucket; it must jump from one bucket to a later one. In the other direction,
          buckets of width d + 1 guarantee that two values in the same bucket differ by at most d.
        </p>
      </div>
      <Recipe
        name="Range buckets with a guarantee"
        when="values are large or arbitrary integers, but the question is about gaps or about values being close to each other."
        steps={[
          'Choose the bucket width from the question: the average gap (rounded down, at least 1) for gap questions, or d + 1 for "within d" questions.',
          'Compute each value\'s bucket as ⌊(value − min) / width⌋, or ⌊value / width⌋ with a Map for sparse buckets.',
          'Keep only what the question needs per bucket: its minimum and maximum, or its single value.',
          'Compare neighbouring non-empty buckets to find the answer.',
        ]}
        why="the width is chosen so that the answer can never hide inside a bucket (gaps) or is automatic inside one (closeness)."
        time="O(n)"
        space="O(n) buckets"
      />

      <div className="prose">
        <h2>Pattern 4: Radix sort</h2>
        <p>
          Radix sort handles big keys by looking at one digit at a time. Least-significant-digit (LSD) radix sort does a stable
          bucket pass on the last digit, then on the second-to-last, and so on. After the pass on digit t, the keys are sorted by
          their last t digits, because the stable pass keeps the order earlier passes created among keys that share digit t.
        </p>
      </div>
      <Walkthrough
        title="LSD radix sort: ones, then tens, then hundreds"
        frames={radix.frames}
        caption="Each pass is a stable counting sort on one digit. After the last pass, the numbers are fully sorted."
      />
      <Recipe
        name="LSD radix sort"
        when="keys are fixed-length strings of digits (or letters), or integers with a bounded number of digits."
        steps={[
          'Find the number of digits d of the longest key (pad shorter keys with leading zeros in your head).',
          'For each digit position from the last to the first: stably distribute the keys into 10 buckets by that digit, then read the buckets back in order 0 to 9.',
          'After d passes the keys are sorted.',
          'For signed integers, handle negative numbers separately (or offset them) before sorting.',
        ]}
        why="each stable pass sorts by a more significant digit while keeping the existing order for ties, so the earlier, less significant digits break those ties correctly."
        time="O(d · (n + 10))"
        space="O(n)"
      />

      <div className="prose">
        <h2>Which linear sort?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Method</th>
            <th>Time</th>
            <th>Space</th>
            <th>Needs</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Counting sort</td><td>O(n + k)</td><td>O(n + k)</td><td>Integer keys in a small range of size k.</td></tr>
          <tr><td>Bucket sort (range buckets)</td><td>O(n) average</td><td>O(n)</td><td>Values spread roughly evenly, or a question answered by bucket extremes.</td></tr>
          <tr><td>Frequency buckets</td><td>O(n)</td><td>O(n)</td><td>Ordering by counts, which are at most n.</td></tr>
          <tr><td>LSD radix sort</td><td>O(d · (n + b))</td><td>O(n + b)</td><td>Keys with d digits in base b; each pass must be stable.</td></tr>
          <tr><td>Comparison sort</td><td>O(n log n)</td><td>O(n)</td><td>Nothing: works for any comparable keys.</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Maximum Gap</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Sort and check neighbours: <Cost>O(n log n)</Cost>. Correct, but the problem demands linear time, and values up to 10⁹
          rule out a count array.
        </p>
        <Step n={2}>Find what you actually need</Step>
        <p>
          You need the biggest gap between sorted neighbours, not the full sorted order. If you knew which values sit next to each
          other across the big gaps, you would be done.
        </p>
        <Step n={3}>Use the pigeonhole guarantee</Step>
        <p>
          The n values span max − min, so the n − 1 gaps between sorted neighbours average (max − min) / (n − 1), and the largest
          gap is at least that. Make buckets of that width (rounded down, at least 1). A gap inside one bucket is smaller than the
          width, so it is not the largest. The largest gap therefore runs from the maximum of some bucket to the minimum of the next
          non-empty bucket. You only need each bucket's minimum and maximum.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          One pass fills the bucket extremes and one pass over the buckets finds the answer: <Cost>O(n)</Cost> time and space.
          Handle fewer than two values, and all-equal values (width would be zero), before computing the width.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Allocating a count array for values up to 10⁹. Counting sort only fits small ranges; use range buckets, radix sort or a comparison sort.</>,
          <>Forgetting the offset for negative values, so they index outside the array.</>,
          <>Using an unstable pass inside radix sort. The order from earlier digits is lost.</>,
          <>Indexing buckets by value when they should be indexed by frequency (top-k problems).</>,
          <>Using truncation instead of floor for the bucket of a negative value: with width 3, −2 and 2 would share bucket 0 although they are 4 apart.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Counting sort the values 3, 0, 2, 3, 1, 0 (range 0..3). Write the count array, then the output.',
            solution: 'Counts: [2, 1, 1, 2]. Output: 0, 0, 1, 2, 3, 3.',
          },
          {
            task: 'Do one LSD radix pass (ones digit) on 31, 12, 22, 41, 13. What is the order after the pass?',
            solution: 'Ones digit 1: 31, 41. Digit 2: 12, 22. Digit 3: 13. Order: 31, 41, 12, 22, 13, with each bucket keeping input order.',
          },
          {
            task: 'Values 1, 3, 9, 10 (n = 4). What bucket width does Maximum Gap use, and in which buckets do the values fall?',
            solution: 'Width = ⌊(10 − 1) / 3⌋ = 3. Buckets by ⌊(value − 1) / 3⌋: 1 → 0, 3 → 0, 9 → 2, 10 → 3. The largest gap is from bucket 0\'s max (3) to bucket 2\'s min (9): 6.',
          },
          {
            task: 'With valueDiff = 2, which bucket do the values −1, 0, 2 and 3 go into (width 3, using floor)?',
            solution: '−1 → −1, 0 → 0, 2 → 0, 3 → 1. The values 0 and 2 share a bucket, so they are within 2 of each other.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why can counting sort beat the O(n log n) limit of comparison sorts?',
            options: ['It compares faster', 'It never compares elements; it uses values as array indices', 'It is randomised', 'It only works on sorted input'],
            answer: 1,
            why: 'The n log n limit applies only to algorithms that learn about the order through comparisons.',
          },
          {
            q: 'In Top K Frequent Elements, how many buckets do you need?',
            options: ['26', 'k', 'n + 1, one per possible frequency', 'One per distinct value'],
            answer: 2,
            why: 'A frequency is between 1 and n, so buckets 0..n cover every possible frequency.',
          },
          {
            q: 'What property must each pass of LSD radix sort have?',
            options: ['It must be in place', 'It must be stable', 'It must be recursive', 'It must use a heap'],
            answer: 1,
            why: 'Stability keeps the order established by the less significant digits for keys that tie on the current digit.',
          },
          {
            q: 'Values go up to 10⁹ and n = 10⁵. Which approach can find the maximum gap in linear time?',
            options: ['Counting sort with an array of 10⁹', 'Buckets of width about (max − min) / (n − 1)', 'Bubble sort', 'Binary search'],
            answer: 1,
            why: 'The pigeonhole argument guarantees the maximum gap crosses buckets, so only bucket minimums and maximums matter.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          The counting-sort problems are quick wins that build the "value as index" reflex. Spend more time on Top K Frequent
          Elements, H-Index and Maximum Gap: each one teaches a different reason why linear time is possible.
        </p>
      </div>
      <ProblemSet id="linear-sorts" />

      <Recap>
        <ul>
          <li>When keys are small integers, an array indexed by key sorts in O(n + k) with no comparisons.</li>
          <li>The stable version uses prefix sums of counts as starting positions; radix sort needs that stability on every pass.</li>
          <li>Frequencies are at most n, so frequency buckets give top-k answers in guaranteed O(n).</li>
          <li>Range buckets come with guarantees: the maximum gap crosses buckets, and values in one bucket of width d + 1 are within d.</li>
        </ul>
      </Recap>
    </>
  );
}
