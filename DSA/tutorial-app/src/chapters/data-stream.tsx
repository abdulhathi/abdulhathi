import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/data-stream';
import { recentCounter, runningMedian } from '../traces/data-stream';
import { Walkthrough } from '../viz/Walkthrough';

const recent = recentCounter([100, 900, 2500, 3200, 4100, 6200], 3000);
const median = runningMedian([5, 15, 1, 3, 8, 7, 9, 10]);

export default function DataStream() {
  return (
    <>
      <TopicIntro
        id="data-stream"
        time="3 hours, plus problems"
        before={['queue', 'heap', 'monotonic-stack', 'design']}
        learn={[
          'What "online" means: answering after every item without rescanning the past',
          'Sliding windows over time with a queue, and running aggregates like counters and prefix products',
          'Two heaps for the running median, one heap for the k-th largest, and lazy deletion for corrections',
          'Counting by value with Fenwick trees, and keeping merged intervals as numbers arrive',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Imagine reading a river of numbers through a narrow window: each one floats past once, and after each you must answer a
          question about everything so far. You cannot scroll back. That is a <b>data stream</b>, and algorithms for it are called{' '}
          <b>online</b>: they answer after every item using a small summary instead of the full history.
        </p>
        <p>
          The naive approach stores everything and recomputes each answer: sorting for the median, rescanning for a count. That is{' '}
          <Cost>O(n)</Cost> or <Cost>O(n log n)</Cost> per item and <Cost>O(n²)</Cost> over the whole stream. The goal is to keep a
          summary that updates in <Cost>O(1)</Cost> or <Cost>O(log n)</Cost> per item, and holds only what future answers can still
          need.
        </p>
      </div>

      <Walkthrough
        title="Requests in the last 3000 ms: a queue as a sliding window"
        frames={recent.frames}
        caption={`Counts after each ping: ${recent.counts.join(', ')}. Old times leave from the front and never come back.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Ask: <i>"which past items can still affect a future answer?"</i> Keep exactly those, in a structure that makes the next
          answer cheap. Requests older than the window can never count again; numbers below the k largest can never be the k-th
          largest again; prices below today's can never block a later span. Throw everything else away.
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
          { name: 'Queue / ring buffer', ts: 'array with a head index', ops: 'push back, pop front O(1)', use: 'Time windows and "last k items".' },
          { name: 'Min-heap and max-heap', ts: 'array-based binary heap (write one, or negate values in a min-heap)', ops: 'push and pop O(log n), top O(1)', use: 'k-th largest, running median, ranks, max and min with corrections.' },
          { name: 'Monotonic stack', ts: 'array of (value, extra)', ops: 'amortised O(1) per item', use: 'Spans and "previous greater" questions in a stream.' },
          { name: 'Prefix array', ts: 'number[] of running sums or products', ops: 'O(1) append and range query', use: 'Sum or product of the last k items.' },
          { name: 'Fenwick tree over values', ts: 'number[] of size maxValue + 1', ops: 'update and prefix query O(log V)', use: 'Counts and sums of the smallest k values in a window.' },
          { name: 'Count map', ts: 'Map<number, number>', ops: 'O(1) average', use: 'How many times each point or value has arrived.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Sliding windows over time</h2>
      </div>
      <Recipe
        name="Time window with a queue"
        when="items arrive in time order and questions concern the last T time units or the last k items."
        steps={[
          'Push each new item (with its time) onto the back of a queue.',
          'Pop from the front while the front item is outside the window.',
          'Answer from the queue: its length, or a running sum updated on every push and pop.',
        ]}
        why="time only moves forward, so an item that leaves the window never re-enters; each item is pushed and popped once."
        time="O(1) amortised per item"
        space="O(window size)"
      />
      <div className="prose">
        <p>
          Sometimes even the queue is unnecessary. "Were the last k numbers all equal to v?" only needs the length of the current
          run of v. Always check whether a single counter can replace the window.
        </p>

        <h2>Pattern 2: Running aggregates</h2>
        <p>
          A summary that updates in <Cost>O(1)</Cost> per item: a running total, a counter, prefix sums or products, a count per
          point. For "product of the last k numbers", keep prefix products and divide, and handle zeros by restarting the prefix
          list: any window that reaches back past a zero has product 0. For "how many previous days had a price at most today's",
          a monotonic stack (<See id="monotonic-stack" />) folds each smaller price into today's span.
        </p>

        <h2>Pattern 3: Order statistics with heaps</h2>
        <p>
          A heap holds a boundary: the smallest of the k largest values, or the two middle values. To track the{' '}
          <b>k-th largest</b>, keep a min-heap of size k: anything smaller than its top can never matter again. For the{' '}
          <b>median</b>, keep two heaps that meet in the middle.
        </p>
      </div>
      <Walkthrough
        title="Running median with two heaps"
        frames={median.frames}
        caption={`Medians after each number: ${median.medians.join(', ')}.`}
      />
      <Recipe
        name="Two heaps for the median"
        when="you need the median (or another middle rank) after every insertion."
        steps={[
          'Lower half: a max-heap. Upper half: a min-heap.',
          'Insert into the lower half if the number is at most its top, otherwise into the upper half.',
          'Rebalance: if the lower half has two more items, move its top up; if the upper half is bigger, move its top down.',
          'Median: the lower top for an odd count; the average of both tops for an even count.',
        ]}
        why="every item in the lower half is at most every item in the upper half, and the sizes differ by at most one, so the tops are the middle values."
        time="O(log n) insert, O(1) median"
        space="O(n)"
      />
      <div className="prose">
        <p>
          When records can be <b>corrected</b> later (a stock price at a timestamp changes), heaps cannot update entries in place.
          Push the new record and keep the old one; when reading a top, pop it if it no longer matches the current data. This{' '}
          <b>lazy deletion</b> keeps every operation <Cost>O(log n)</Cost> amortised.
        </p>

        <h2>Pattern 4: Window statistics over bounded values</h2>
        <p>
          When values are small integers (say up to 10⁵), you can count them by value. A Fenwick tree of counts and one of sums
          (<See id="binary-indexed-tree" />) answer "sum of the smallest j values in the window" by descending the count tree to
          the j-th smallest value. Removing the k smallest and k largest from a window is then a few subtractions.
        </p>

        <h2>Pattern 5: Merging as data arrives</h2>
        <p>
          If the summary is a set of merged ranges, keep it merged at all times. A new number can only touch the interval ending
          just before it and the interval starting just after it, which binary search finds. A pointer to "the next id we are
          waiting for" is the simplest version of the same idea.
        </p>

        <h2>Pattern 6: Matching the stream's suffix</h2>
        <p>
          A word that ends at the newest character is a suffix of the stream. Store the words reversed in a trie and walk it over
          the newest characters, newest first. Only the last L characters (L = longest word) can matter, so the buffer stays small.
        </p>

        <h3>Beyond LeetCode</h3>
        <p>
          Real streams are often too big for exact answers. Systems use approximate summaries: a <b>count-min sketch</b> estimates
          how often an item appeared, <b>HyperLogLog</b> estimates how many distinct items there were, and{' '}
          <See id="reservoir-sampling" /> keeps a uniform random sample. They trade a small, controlled error for tiny memory. Good to
          mention in system design interviews.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Question about the stream</th>
            <th>Summary to keep</th>
            <th>Cost per item</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Count in the last T ms</td><td>Queue of times</td><td>O(1) amortised</td></tr>
          <tr><td>Last k all equal v?</td><td>Run counter</td><td>O(1)</td></tr>
          <tr><td>Product or sum of the last k</td><td>Prefix array (reset at zeros for products)</td><td>O(1)</td></tr>
          <tr><td>k-th largest</td><td>Min-heap of size k</td><td>O(log k)</td></tr>
          <tr><td>Median</td><td>Max-heap + min-heap</td><td>O(log n)</td></tr>
          <tr><td>Max and min with corrections</td><td>Map + two heaps with lazy deletion</td><td>O(log n) amortised</td></tr>
          <tr><td>Merged ranges so far</td><td>Sorted disjoint intervals</td><td>O(log n) search</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: the running median</h2>
        <p>
          <b>Find Median from Data Stream</b> adds numbers and asks for the median at any time, up to 5 × 10⁴ calls.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Keep a list; sort it for each median query: <Cost>O(n log n)</Cost> per query. Keeping it sorted with insertion is{' '}
          <Cost>O(n)</Cost> per add. Both are slow when calls alternate.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The median only depends on the one or two middle values. You do not need the lower half sorted, only its largest
          element; nor the upper half sorted, only its smallest.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          A max-heap for the lower half and a min-heap for the upper half give exactly those two elements. Keep every lower value
          at most every upper value (insert by comparing with the lower top) and the sizes within one (move a top across when
          needed). Then the tops are the middle values.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(log n)</Cost> per add, <Cost>O(1)</Cost> per median. For the follow-up where all values lie in [0, 100], a count
          array of 101 slots finds the median by scanning counts: <Cost>O(100)</Cost> per query with no heaps at all.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Storing the whole stream and recomputing every answer: O(n) per call becomes O(n²) overall.</>,
          <>Using shift on an array as a queue; each call copies the array.</>,
          <>Forgetting that a time window is inclusive or exclusive at its edge; read the statement.</>,
          <>Dividing prefix products across a zero; restart the prefix list at every zero instead.</>,
          <>Trusting a heap top after a correction without lazy-deletion checks.</>,
          <>Unbalanced median heaps: rebalance after every insertion, not only when asked for the median.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run the two-heap median on 4, 1, 7. Show both halves and the median after each number.',
            solution: '4: low [4], high [], median 4. 1: low [1, 4] is too big, move 4 up: low [1], high [4], median 2.5. 7: goes high [4, 7], high bigger, move 4 down: low [1, 4], high [7], median 4.',
          },
          {
            task: 'A min-heap of size 3 tracks the 3rd largest. It holds 5, 8, 9 (top 5). What happens when 6 arrives? When 2 arrives?',
            solution: '6: push, then pop the smallest (5); the heap is 6, 8, 9 and the answer is 6. 2: push, pop 2 at once; the answer stays 6.',
          },
          {
            task: 'Stream 3, 0, 2, 5 with prefix products reset at zeros. What is the product of the last 2? Of the last 3?',
            solution: 'After the 0 the list restarts: [1, 2, 10]. Last 2: 10 ÷ 1 = 10. Last 3: k = 3 is not smaller than the list length 3, so the window includes the zero: 0.',
          },
          {
            task: 'Intervals [1, 3] and [5, 7] exist. Which merges happen when 4 arrives? When 9 arrives?',
            solution: '4 touches both (3 + 1 = 4 and 4 + 1 = 5): merge into [1, 7]. 9 touches neither (7 + 1 = 8): add [9, 9].',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why is a min-heap of size k (not a max-heap) used for the k-th largest?',
            options: [
              'Min-heaps are faster',
              'Its top is the smallest of the k largest, which is exactly the k-th largest, and it is the one to discard when a bigger value arrives',
              'Max-heaps cannot hold k items',
              'Either works the same',
            ],
            answer: 1,
            why: 'The boundary value is the smallest kept one, so it must be on top.',
          },
          {
            q: 'In the two-heap median, where do the middle values live?',
            options: ['At the bottoms of the heaps', 'At the tops of both heaps', 'In a separate array', 'Only in the min-heap'],
            answer: 1,
            why: 'The max of the lower half and the min of the upper half are the middle of the sorted order.',
          },
          {
            q: 'Prices can be corrected after they are pushed into a max-heap. How do you keep maximum() correct?',
            options: ['Rebuild the heap every time', 'Pop tops that disagree with the current price map (lazy deletion)', 'Ignore corrections', 'Use a sorted array'],
            answer: 1,
            why: 'Stale entries are removed only when they reach the top, so each costs O(log n) once.',
          },
          {
            q: 'Times arrive in increasing order. Why can a queue answer "requests in the last 3000 ms" in amortised O(1)?',
            options: [
              'Because 3000 is a constant',
              'Each time enters once and leaves once, and leaving never needs to be undone',
              'Because queues are always O(1)',
              'Because of hashing',
            ],
            answer: 1,
            why: 'Once a time is too old it stays too old, so the total work over n pings is O(n).',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
      </div>
      <ProblemSet id="data-stream" />

      <Recap>
        <ul>
          <li>Online algorithms keep a summary of only what future answers can still need, updated per item.</li>
          <li>Time windows use a queue; a run counter or prefix array often replaces even that.</li>
          <li>Heaps track boundaries: size-k min-heap for the k-th largest, two heaps for the median, lazy deletion for corrections.</li>
          <li>Bounded values can be counted with Fenwick trees to get sums of the smallest or largest k.</li>
          <li>Keep merged summaries merged as items arrive; a reversed trie checks the stream's newest suffix.</li>
        </ul>
      </Recap>
    </>
  );
}
