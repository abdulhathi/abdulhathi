import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/array';
import { cyclicSort, kadane, majorityVote, rotateByReversal } from '../traces/array';
import { Walkthrough } from '../viz/Walkthrough';

const best = kadane([3, -4, 2, -1, 2, 1, -5, 4]);
const rotate = rotateByReversal([10, 20, 30, 40, 50, 60], 2);
const vote = majorityVote([5, 1, 5, 3, 5, 5, 2]);
const missing = cyclicSort([4, -2, 1, 6, 2]);

export default function ArrayChapter() {
  return (
    <>
      <TopicIntro
        id="array"
        time="5–6 hours, plus problems"
        before={['complexity']}
        learn={[
          'What an array really is in memory, and what each operation costs in TypeScript',
          'Running values: Kadane\'s algorithm and its variants for products and circular arrays',
          'In-place tricks: reversals and rotation, next permutation, and using indices as a hash',
          'Prefix and suffix products, and Boyer–Moore majority voting',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          An array is a row of numbered boxes in one block of memory. Because the boxes sit side by side, the computer can jump to box
          i directly: reading or writing any position costs <Cost>O(1)</Cost>. That one property makes arrays the most used structure in
          programming, and the input to more LeetCode problems than any other (over half of them carry the Array tag).
        </p>
        <p>
          The flip side is that inserting or deleting in the middle means shifting everything after it, which costs{' '}
          <Cost>O(n)</Cost>. So the skill with arrays is to work <b>with</b> the layout: read sequentially, carry what you need forward
          in a few variables, write in place, and use the index itself as information. This chapter collects the ideas that come up
          again and again. The two biggest array techniques have their own chapters: <See id="two-pointers" /> and{' '}
          <See id="prefix-sum" />.
        </p>
        <p>
          Start with the most famous one-pass idea. The question: what is the largest sum of a contiguous run of numbers? Checking every
          run is O(n²). Kadane's algorithm asks a smaller question at each position: what is the best run that <i>ends here</i>?
        </p>
      </div>

      <Walkthrough
        title="Kadane's algorithm: the best run ending at each index"
        frames={best.frames}
        caption={`The highlighted bracket is the current run; green cells are the best run so far. Answer: ${best.best}, from index ${best.range[0]} to ${best.range[1]}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A run whose total has dropped below zero can only make anything after it smaller. So at each index, either extend the
          current run or abandon it and start again here. That single choice, made n times, replaces checking all n²/2 subarrays.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          A TypeScript array is a dynamic array: it grows as you push. Know which operations are cheap, because a single O(n) call
          inside a loop is the most common reason a correct array solution times out.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Dynamic array', ts: 'number[]', ops: 'index O(1); push and pop O(1) amortized', use: 'The default for any sequence.' },
          { name: 'Front operations', ts: 'shift, unshift, splice', ops: 'O(n): every element moves', use: 'Avoid in loops. Keep a start index instead of removing from the front.' },
          { name: 'Fixed-size table', ts: 'new Array(n).fill(0), or Int32Array', ops: 'O(n) to create, O(1) per access', use: 'Counts, marks, prefix arrays. Typed arrays are compact and start at 0.' },
          { name: 'Copy', ts: 'slice(), [...arr], Array.from', ops: 'O(n)', use: 'When you must keep the original. Never inside a loop without a good reason.' },
          { name: 'Sort', ts: 'sort, with a comparator that returns a − b', ops: 'O(n log n), in place', use: 'Grouping equal values, greedy scans, two pointers. Without a comparator it compares as strings.' },
          { name: 'Running variables', ts: 'plain numbers', ops: 'O(1)', use: 'The best so far, the minimum so far, a candidate and its count.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Running best</h2>
        <p>
          Many "best subarray" and "is there a pattern" questions can be answered in one pass by carrying a small amount of state:
          the best run ending here (Kadane), the largest and the smallest product ending here (because a negative swaps them), or the
          two smallest values that could start an increasing triplet. The design question is always: <i>what do I need to know about
          everything to my left, in order to decide at this index?</i> If that fits in a few variables, the problem is O(n) and O(1).
        </p>
      </div>
      <Recipe
        name="Carry a running best"
        when="the answer depends on contiguous runs or on what has been seen so far, and a few numbers summarise the left part."
        steps={[
          'Decide what the state is: for example, the best sum of a run ending at the current index.',
          'Write how the state at index i follows from the state at i − 1 and nums[i] (extend or restart; keep both largest and smallest for products).',
          'After updating the state, update the overall answer.',
          'Initialise carefully so a single element, or all negative values, still works.',
        ]}
        why="the best answer ending at i only depends on the best answer ending at i − 1, so nothing earlier needs to be remembered."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 2: Reverse and rotate</h2>
        <p>
          Reversing a segment is the opposite-ends swap loop from <See id="two-pointers" />. It is also a building block: reversing the
          whole array and then each of two parts rotates the array, in place, with no extra memory. And "next permutation" is a
          reversal too: find the rightmost place where the sequence goes up, bump that element just enough, and reverse what follows.
        </p>
      </div>
      <Walkthrough
        title="Rotate right by 2 with three reversals"
        frames={rotate.frames}
        caption={`Reverse everything, then the first k, then the rest. Result: ${rotate.result.join(', ')}.`}
      />
      <Recipe
        name="Rotate by reversals"
        when="an array must be rotated or blocks swapped in place with O(1) extra space."
        steps={[
          'Reduce the shift: k = k mod n.',
          'Reverse the whole array.',
          'Reverse the first k elements, then the remaining n − k elements.',
          'For a left rotation, reverse the first k and the rest first, then the whole array.',
        ]}
        why="reversing the whole array puts the blocks in the right places but backwards; reversing each block restores its order."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 3: Index as a hash</h2>
        <p>
          When an array of length n holds values from 1 to n, every value has a natural home: index v − 1. That lets the array record
          what it has seen without any extra memory. You can <b>mark</b> a value by making its home cell negative (the original value
          survives as the absolute value), or <b>cyclic sort</b>: swap each value into its home until every value that can be home is
          home. Either way a final scan reveals what is missing or doubled.
        </p>
      </div>
      <Walkthrough
        title="First Missing Positive by cyclic sort"
        frames={missing.frames}
        caption={`Green cells hold their own index + 1. The first cell that does not gives the answer: ${missing.missing}.`}
      />
      <Recipe
        name="Use indices as a hash"
        when="values lie in 1..n (or 0..n) and you must find missing or repeated values in O(1) extra space."
        steps={[
          'Mark: for each value v (read as an absolute value), make nums[v − 1] negative; a cell already negative means v was seen before.',
          'Or cyclic sort: while nums[i] is in range and its home cell does not already hold it, swap it home.',
          'Scan: a cell that is still positive, or that does not hold i + 1, points at the missing number i + 1.',
          'Restore the array afterwards if the caller still needs it.',
        ]}
        why="the n cells can store one bit (or one value) for each of the n possible values."
        time="O(n): each value is moved home at most once"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 4: Prefix and suffix products</h2>
        <p>
          "Everything except position i" is "everything before i" combined with "everything after i". Compute the first part in a
          forward pass and the second in a backward pass, and each answer is one multiplication. The output array can hold the forward
          pass, and a single running variable can carry the backward pass, so the extra space is O(1). The same left-and-right split
          answers questions about sums, minimums and maximums; the sum version is the heart of <See id="prefix-sum" />.
        </p>
      </div>
      <Recipe
        name="Left and right passes"
        when="each answer depends on everything to the left and everything to the right of a position, and division is not allowed."
        steps={[
          'Forward pass: output[i] = combination of all values before i (start with the identity: 1 for products, 0 for sums).',
          'Backward pass with a running value: multiply output[i] by the combination of all values after i.',
          'Update the running value with nums[i] after using it.',
        ]}
        why="every answer is exactly (left part) combined with (right part), and both parts grow by one element per step."
        time="O(n)"
        space="O(1) besides the output"
      />

      <div className="prose">
        <h2>Pattern 5: Majority vote</h2>
        <p>
          The Boyer–Moore majority vote finds a value that appears more than half the time using two variables. Imagine every value
          fighting a different value and both leaving. The majority value has more copies than all the others combined, so it is
          the one left at the end. With two candidates and two counters, the same idea finds every value appearing more than n/3
          times. The vote only produces candidates; if a majority is not guaranteed, count them in a second pass.
        </p>
      </div>
      <Walkthrough
        title="Boyer–Moore majority vote"
        frames={vote.frames}
        caption={`Different values cancel in pairs; the majority survives. Answer: ${vote.candidate}.`}
      />
      <Recipe
        name="Boyer–Moore majority vote"
        when="you need a value that appears more than n/2 (or n/3) times, with O(1) extra space."
        steps={[
          'Keep a candidate and a counter, starting at 0.',
          'For each value: if the counter is 0, take this value as the candidate.',
          'Add 1 to the counter if the value equals the candidate, otherwise subtract 1.',
          'If a majority is not guaranteed, count the candidate in a second pass.',
          'For n/3, keep two candidates and two counters; a value matching neither decreases both.',
        ]}
        why="each decrement cancels one majority copy with one other copy, and there are not enough other copies to cancel them all."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 6: Sort or count first</h2>
        <p>
          When order does not matter to the answer, sorting is often the first move: equal values become neighbours, extremes sit at
          the ends, and a greedy scan becomes possible. When the values are small integers, counting them into buckets does the same
          job in O(n). The H-index is a good example: sorted from most cited to least, the answer is visible in one scan; capped
          counts give it without sorting.
        </p>
      </div>

      <div className="prose">
        <h2>Which technique for which array question?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Technique</th>
            <th>Chapter</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Best sum or product of a contiguous run</td><td>Kadane (running best)</td><td>This one</td></tr>
          <tr><td>Pair with a target sum in a sorted array</td><td>Opposite-end pointers</td><td><See id="two-pointers" /></td></tr>
          <tr><td>Longest or shortest run satisfying a condition</td><td>Sliding window</td><td><See id="sliding-window" /></td></tr>
          <tr><td>Many range sums, or count subarrays with sum k</td><td>Prefix sums with a hash map</td><td><See id="prefix-sum" /></td></tr>
          <tr><td>Missing or duplicate values in 1..n with O(1) space</td><td>Index as a hash, cyclic sort</td><td>This one</td></tr>
          <tr><td>Next greater element for every position</td><td>Monotonic stack</td><td><See id="monotonic-stack" /></td></tr>
          <tr><td>Find a value in a sorted array</td><td>Binary search</td><td><See id="binary-search" /></td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Product of Array Except Self</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          For each index, multiply every other value: <Cost>O(n²)</Cost>, about 10¹⁰ steps for 10⁵ values. Dividing the total product
          by each value would be O(n), but division is forbidden, and a single zero would break it anyway.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The answer for index 5 and the answer for index 6 share almost all their factors: both include everything before index 5 and
          everything after index 6. The brute force recomputes those shared products from scratch every time.
        </p>
        <Step n={3}>Find the rule</Step>
        <p>
          answer[i] = (product of nums[0..i − 1]) × (product of nums[i + 1..n − 1]). Both parts can be built incrementally: the left
          product for i + 1 is the left product for i times nums[i], and the same from the right.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          A forward pass writes the left products into the output; a backward pass multiplies in a running right product.{' '}
          <Cost>O(n)</Cost> time and <Cost>O(1)</Cost> extra space. Zeros need no special case: the left or right product simply
          becomes 0 where it should.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Calling <b>shift</b>, <b>unshift</b>, <b>splice</b>, <b>includes</b> or <b>indexOf</b> inside a loop: each is O(n), so the loop becomes O(n²).</>,
          <>Sorting numbers without a comparator: the default sort compares as strings, so 10 comes before 9.</>,
          <>Initialising a running maximum at 0 when all values can be negative.</>,
          <>Off-by-one errors at the ends: the first element, the last element, and empty or single-element arrays.</>,
          <>Modifying an array while iterating over it with a for-of loop or forEach, and skipping elements as a result.</>,
          <>Using new Array(n).fill([]) for a 2D table: every row is the same array. Build each row separately.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run Kadane on 2, −3, 4, −1, 2, −5, 3. Write the current run and the best after each value.',
            solution: 'current: 2, −1, 4, 3, 5, 0, 3. best: 2, 2, 4, 4, 5, 5, 5. The answer is 5, from 4, −1, 2.',
          },
          {
            task: 'Rotate 1, 2, 3, 4, 5 to the right by 7 using reversals. What is k after reduction, and what are the three steps?',
            solution: 'k = 7 mod 5 = 2. Reverse all: 5, 4, 3, 2, 1. Reverse the first 2: 4, 5, 3, 2, 1. Reverse the rest: 4, 5, 1, 2, 3.',
          },
          {
            task: 'Find the next permutation of 1, 3, 5, 4, 2.',
            hint: 'The decreasing suffix is 5, 4, 2. The element before it is 3.',
            solution: 'Swap 3 with the smallest larger value in the suffix, 4: 1, 4, 5, 3, 2. Reverse the suffix: 1, 4, 2, 3, 5.',
          },
          {
            task: 'Run the majority vote on 7, 7, 3, 3, 3, 7, 3. Is the final candidate a majority?',
            solution: 'Candidate 7 (1), 7 (2), 3 cancels (1), 3 cancels (0), 3 becomes candidate (1), 7 cancels (0), 3 becomes candidate (1). The candidate is 3, which appears 4 times out of 7, so yes.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In Kadane\'s algorithm, when do you start a new run at index i?',
            options: ['When nums[i] is negative', 'When the current run\'s total (before adding nums[i]) is negative', 'Every time the best changes', 'Never: runs only grow'],
            answer: 1,
            why: 'A negative running total would make anything after it smaller, so starting fresh at i is better.',
          },
          {
            q: 'Why does Maximum Product Subarray track the smallest product as well as the largest?',
            options: ['To handle zeros', 'Because multiplying the smallest (most negative) product by a negative number can make it the largest', 'To save memory', 'It does not need to'],
            answer: 1,
            why: 'A negative times a negative is positive, so yesterday\'s minimum can be today\'s maximum.',
          },
          {
            q: 'Values are in 1..n and you need the missing ones with O(1) extra space. Which idea fits?',
            options: ['Sort the array', 'A hash set', 'Mark index v − 1 by making it negative', 'A heap'],
            answer: 2,
            why: 'The array itself becomes the "seen" table; sorting costs n log n and a set costs O(n) space.',
          },
          {
            q: 'After one pass of the majority vote on an array with no guaranteed majority, what do you know?',
            options: ['The candidate is the majority', 'If a majority exists, it is the candidate; a second pass must check it', 'There is no majority', 'The candidate is the most frequent value'],
            answer: 1,
            why: 'The vote never loses a true majority, but it always outputs some candidate, majority or not.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          The two-pointer and prefix-sum classics live in their own chapters. Here, focus on saying, for each problem, what you carry
          forward or what the index stands for.
        </p>
      </div>
      <ProblemSet id="array" />

      <Recap>
        <ul>
          <li>Arrays give O(1) access by index but O(n) inserts and deletes in the middle; avoid front operations and searches inside loops.</li>
          <li>Kadane carries the best run ending here; for products carry the largest and smallest; a circular best is total minus the minimum run.</li>
          <li>Reversals rotate in place and produce the next permutation; when values are 1..n, the indices themselves are a free hash table.</li>
          <li>Left and right passes answer "everything except i"; Boyer–Moore finds majorities with two variables, confirmed by a second pass when needed.</li>
        </ul>
      </Recap>
    </>
  );
}
