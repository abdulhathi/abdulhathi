import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/reservoir-sampling';
import { reservoirProbabilities } from '../traces/reservoir-sampling';
import { Walkthrough } from '../viz/Walkthrough';

const one = reservoirProbabilities([4, 8, 15, 16, 23, 42]);
const two = reservoirProbabilities(['a', 'b', 'c', 'd', 'e', 'f'], 2);

export default function ReservoirSampling() {
  return (
    <>
      <TopicIntro
        id="reservoir-sampling"
        time="1–2 hours, plus problems"
        before={['randomized', 'linked-list', 'probability']}
        learn={[
          'How to pick a uniformly random item from a stream in one pass, without knowing its length',
          'Why "keep the i-th item with probability 1/i" is exactly fair, with a two-line proof',
          'Reservoirs of size k, and weighted variants',
          'When reservoir sampling beats storing everything, and when it does not',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A stream of items goes past you one at a time: lines of a huge log, nodes of a linked list, readings from a sensor.
          You may remember only one item (or k), you do not know how many will come, and at the end your kept item must be
          a uniformly random one of all of them.
        </p>
        <p>
          Here is the trick, called <b>algorithm R</b>. Keep the first item. When the second arrives, switch to it with
          probability 1/2. When the third arrives, switch with probability 1/3. In general, the i-th item replaces your current
          pick with probability 1/i. Surprisingly, that is perfectly fair at every moment: after i items, each of them is your
          pick with probability 1/i.
        </p>
      </div>

      <Walkthrough
        title="Algorithm R on a stream of six numbers: the chances stay equal"
        frames={one.frames}
        caption="After the sixth item, each of the six is the pick with probability 1/6, without ever knowing in advance that six would arrive."
      />

      <Box kind="key" label="Key idea">
        <p>
          Suppose after i − 1 items each is the pick with probability 1/(i − 1). Item i takes over with probability 1/i. An
          earlier item stays the pick only if it was the pick and item i does not take over: 1/(i − 1) × (i − 1)/i = 1/i. And
          item i itself has 1/i. So all i items are equal, and by induction this holds for the whole stream.
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
          { name: 'Counter', ts: 'number', ops: 'O(1)', use: 'How many items (or matching items) have been seen so far.' },
          { name: 'Reservoir', ts: 'one variable, or an array of k items', ops: 'O(1) replace', use: 'The current sample.' },
          { name: 'Prefix sums', ts: 'number[]', ops: 'O(log n) pick with binary search', use: 'The non-streaming alternative for weighted picks, when all items are known up front.' },
          { name: 'Hash map', ts: 'Map<number, number>', ops: 'O(1) average', use: 'A virtual array for drawing without repeats from a huge range.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Algorithm R</h2>
      </div>
      <Recipe
        name="Reservoir sampling (one item)"
        when="you must pick uniformly from a sequence you can read only once, or whose length you do not know."
        steps={[
          'Set count = 0 and the answer to nothing.',
          'For each item: increase count.',
          'Draw a random integer from 0 to count − 1; if it is 0 (probability 1/count), make this item the answer.',
          'After the last item, return the answer.',
        ]}
        why="by induction, after i items each one is the answer with probability exactly 1/i."
        time="O(n) for the pass, O(1) per item"
        space="O(1)"
      />
      <div className="prose">
        <p>
          The same loop answers "pick a random index where nums[i] equals the target": treat only the matching indices as the
          stream, and count matches instead of items. With a reservoir of size k, keep the first k items, then let item i enter
          with probability k / i, replacing a uniformly random member of the reservoir. Every item ends up in the sample with
          probability k / n.
        </p>
      </div>
      <Walkthrough
        title="A reservoir of size 2 over six letters"
        frames={two.frames}
        caption="With k = 2, every letter ends up in the reservoir with probability 2/6 = 1/3."
      />

      <div className="prose">
        <h2>Pattern 2: Weighted and area-based picks</h2>
        <p>
          If items carry weights (rectangles with different numbers of points, for example), the stream version keeps a running
          total W of the weights seen so far and lets item i take over with probability wᵢ / W. The same induction shows each
          item ends up chosen with probability wᵢ / total. When all items are available in advance, prefix sums and binary
          search (see <See id="randomized" />) answer each pick in <Cost>O(log n)</Cost> after one <Cost>O(n)</Cost> setup, which
          is better when you pick many times.
        </p>

        <h2>Pattern 3: Sampling without repeats</h2>
        <p>
          Reservoir sampling chooses from a stream. When instead you must hand out distinct random elements of a huge range
          one by one (cells of a 10⁴ × 10⁴ grid), use a virtual Fisher–Yates shuffle: pick a random position among the remaining
          ones, return what it holds, and move the last remaining value into it, storing only the changed positions in a map.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Best approach</th>
            <th>Per pick</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Length unknown, read once, O(1) memory</td><td>Reservoir sampling</td><td>O(n) pass</td></tr>
          <tr><td>Data fits in memory, many picks</td><td>Copy to an array once, then pick a random index</td><td>O(1)</td></tr>
          <tr><td>Random index of a target value, many picks</td><td>Map of value → list of indices</td><td>O(1), O(n) memory</td></tr>
          <tr><td>Random index of a target value, no extra memory</td><td>Reservoir over the matches</td><td>O(n)</td></tr>
          <tr><td>Weighted items known in advance</td><td>Prefix sums + binary search</td><td>O(log n)</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Linked List Random Node</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Walk the list once to count its length n, pick a random index in [0, n), and walk again to that node. Correct, two
          passes, O(1) memory. Or copy all values into an array: one pass, then O(1) per call, but O(n) memory.
        </p>
        <Step n={2}>The follow-up</Step>
        <p>
          "The list is extremely large and its length unknown." Now you cannot count first: you must decide as nodes go past.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          At the i-th node, replace the answer with this node's value with probability 1/i. When the walk ends, the answer is
          uniform over all nodes.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          <Cost>O(n)</Cost> time per call, <Cost>O(1)</Cost> space. A single node is always chosen (probability 1/1). The first
          node is always taken, so the answer is never empty.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Replacing with probability 1/2 every time ("coin flip per item"): the last items become far more likely than the first.</>,
          <>Using the item's position starting from 0 in the probability: the i-th item (1-based) needs 1/i, so item 0 must be taken with probability 1.</>,
          <>Counting all elements instead of only the matches in Random Pick Index.</>,
          <>Using plain area instead of the number of integer points when weighting rectangles.</>,
          <>Reaching for reservoir sampling when the data fits in memory and is picked from many times; a stored array is faster.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'With algorithm R on 5 items, what is the probability that item 2 is picked at its arrival and then never replaced?',
            solution: '1/2 × (2/3) × (3/4) × (4/5) = 1/5.',
          },
          {
            task: 'A reservoir of size 3 sees its 10th item. With what probability does the item enter the reservoir, and what is each earlier item\'s chance of being in it afterwards?',
            solution: 'It enters with probability 3/10. Each earlier item was in with probability 3/9 and is evicted with probability (3/10) × (1/3) = 1/10, so it stays with 3/9 × 9/10 = 3/10.',
          },
          {
            task: 'Rectangles [0, 0, 1, 1] and [2, 0, 4, 0]. How many integer points does each cover, and with what probability should each be chosen?',
            solution: 'The first covers 2 × 2 = 4 points, the second 3 × 1 = 3 points. Choose them with probabilities 4/7 and 3/7.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In algorithm R, the 8th item replaces the current pick with probability…',
            options: ['1/2', '1/8', '1/7', '7/8'],
            answer: 1,
            why: 'The i-th item takes over with probability 1/i.',
          },
          {
            q: 'Why is reservoir sampling the answer to the follow-up of Linked List Random Node?',
            options: [
              'It is faster than an array',
              'It needs only one pass and O(1) memory, without knowing the length',
              'It returns nodes in sorted order',
              'It avoids calling the random function',
            ],
            answer: 1,
            why: 'Those are exactly the follow-up\'s constraints: huge list, unknown length, no extra space.',
          },
          {
            q: 'With a reservoir of size k after n items, each item is in the sample with probability…',
            options: ['1/n', 'k/n', '1/k', 'k/(n + 1)'],
            answer: 1,
            why: 'The same induction as for k = 1 gives k/n for every item.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>LeetCode has only a handful of problems here; each teaches a different side of sampling.</p>
      </div>
      <ProblemSet id="reservoir-sampling" />

      <Recap>
        <ul>
          <li>Keep the i-th item with probability 1/i, and every item seen is equally likely at every moment.</li>
          <li>For k items, let item i enter with probability k/i, replacing a random member.</li>
          <li>Weighted streams use wᵢ divided by the running total; known weights use prefix sums and binary search.</li>
          <li>Use it for one-pass, unknown-length, O(1)-memory sampling; otherwise storing the data is usually simpler.</li>
        </ul>
      </Recap>
    </>
  );
}
