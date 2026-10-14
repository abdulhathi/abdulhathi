import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/prefix-sum';
import { countSumK, differenceArray, prefix2D, rangeSums } from '../traces/prefix-sum';
import type { Tone } from '../viz/types';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const ranges = rangeSums([3, -1, 4, 1, -5, 9], [[1, 3], [0, 5]]);
const sumK = countSumK([2, -1, 3, -2, 2, 1], 3);
const diff = differenceArray(6, [[1, 3, 5], [2, 5, 2], [0, 1, -1]]);

const grid = [[2, 0, 1, 3], [1, 4, 2, 0], [3, 1, 5, 2]];
const { P, rect } = prefix2D(grid);
// The query rectangle: rows 1..2, columns 1..3.
const gridTones: Partial<Record<string, Tone>> = {};
for (let r = 1; r <= 2; r++) for (let c = 1; c <= 3; c++) gridTones[`${r},${c}`] = 'match';

export default function PrefixSum() {
  return (
    <>
      <TopicIntro
        id="prefix-sum"
        time="4–5 hours, plus problems"
        before={['array', 'hash-table', 'sliding-window']}
        learn={[
          'How one pass of running totals answers every range-sum question in O(1)',
          'The running sum + hash map pattern, which handles negative numbers where sliding windows fail',
          'Remainders, balance (+1/−1) and parity masks: the same trick in disguise',
          '2D prefix sums with inclusion–exclusion, and difference arrays for range updates',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think of a car's odometer. To know how far you drove between the second and the fifth hour, you do not add up the
          distance hour by hour: you read the odometer at both times and subtract. A <b>prefix sum</b> array is an odometer for an
          array. prefix[i] is the total of the first i values, so the sum of any range is the difference of two readings.
        </p>
        <p>
          Building it takes one pass, <Cost>O(n)</Cost>. After that, every range sum costs <Cost>O(1)</Cost> instead of{' '}
          <Cost>O(length of the range)</Cost>. With q queries that turns <Cost>O(n · q)</Cost> into <Cost>O(n + q)</Cost>.
        </p>
        <p>
          The real power comes from turning the formula around. The sum of nums[i..j] is prefix[j + 1] − prefix[i]. If you want that
          sum to equal k, you want an <i>earlier</i> prefix equal to prefix[j + 1] − k. A hash map of earlier prefixes answers that in
          O(1), which counts subarrays with a given sum in one pass, even when values are negative.
        </p>
      </div>

      <Walkthrough
        title="Build a prefix array, then answer ranges with one subtraction"
        frames={ranges.frames}
        caption="prefix has one extra cell at the front, holding 0. That cell removes every special case for ranges that start at index 0."
      />

      <Box kind="key" label="Key idea">
        <p>
          <b>sum(nums[i..j]) = prefix[j + 1] − prefix[i]</b>, where prefix[0] = 0. Every pattern in this chapter is this one line,
          used forwards (range queries), backwards (look up the prefix you need in a hash map), in two dimensions, or in reverse
          (difference arrays).
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
          { name: 'Prefix array', ts: 'number[] of length n + 1, prefix[0] = 0', ops: 'build O(n); range sum O(1)', use: 'Many range-sum queries on fixed data.' },
          { name: 'Running sum', ts: 'number', ops: 'O(1) per step', use: 'When you only need the prefix up to the current index, not the whole array.' },
          { name: 'Hash map of prefixes', ts: 'Map<number, number>', ops: 'get, set O(1) average', use: 'prefix → count (to count subarrays) or prefix → first index (for the longest subarray).' },
          { name: 'Array of remainders', ts: 'number[] of length k', ops: 'O(1)', use: 'Prefix sums modulo k, when k is small enough to index an array.' },
          { name: '2D prefix array', ts: 'number[][] of size (m + 1) × (n + 1)', ops: 'build O(m · n); rectangle sum O(1)', use: 'Rectangle sums in a grid.' },
          { name: 'Difference array', ts: 'number[] of length n + 1', ops: 'range update O(1); rebuild O(n)', use: 'Many range updates followed by reading the final values.' },
        ]}
      />
      <Box kind="tip" label="TypeScript tip">
        <p>
          JavaScript numbers are exact integers up to 2⁵³ (about 9 × 10¹⁵). Sums of 10⁵ values up to 10⁹ reach 10¹⁴, still exact.
          Beyond that, take remainders as you go or use BigInt. And remember that <b>%</b> keeps the sign: −7 % 5 is −2, so
          normalise remainders with <b>((x % k) + k) % k</b>.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 1: Range sums</h2>
        <p>
          Build the prefix array once and answer queries with one subtraction. Many "for each index, compare the left part with the
          right part" problems need even less: with the total known, the right part's sum is total − left − the current value, so a
          single running sum is enough (Find Pivot Index, Number of Ways to Split Array).
        </p>
      </div>
      <Recipe
        name="Prefix array for range queries"
        when="the data does not change and you will ask for many range sums."
        steps={[
          'Make prefix with n + 1 cells and prefix[0] = 0.',
          'For i from 0 to n − 1: prefix[i + 1] = prefix[i] + nums[i].',
          'The sum of nums[l..r] is prefix[r + 1] − prefix[l].',
        ]}
        why="prefix[r + 1] counts everything up to r, prefix[l] counts everything before l, and the difference is exactly the range."
        time="O(n) to build, O(1) per query"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Running sum + hash map</h2>
        <p>
          This is the most important pattern in the chapter, and one of the most important in the whole lab. Walk through the
          array keeping a running sum. At each position, the subarrays that <i>end here</i> correspond to earlier prefixes: the
          subarray after prefix p has sum (current − p). So "how many subarrays ending here sum to k?" becomes "how many earlier
          prefixes equal current − k?", one hash map lookup.
        </p>
      </div>
      <Walkthrough
        title="Count subarrays that sum to 3 (negative numbers included)"
        frames={sumK.frames}
        caption={`Each step looks up running sum − k before recording the running sum. Total: ${sumK.count} subarrays.`}
      />
      <Recipe
        name="Running sum + hash map"
        when="you count, or find the longest, subarrays whose sum (or remainder, or balance) meets an exact condition."
        steps={[
          'Seed the map with the empty prefix: {0: 1} to count, or {0: −1} to measure lengths.',
          'Walk the array, updating the running sum (or remainder, or mask).',
          'Look up the partner prefix you need (sum − k, the same remainder, the same mask) and use what the map says.',
          'Then record the current prefix: increase its count, or store its index if it is new (for the longest subarray).',
        ]}
        why="every subarray is the difference of two prefixes, so checking each new prefix against all earlier ones covers every subarray exactly once."
        time="O(n)"
        space="O(n)"
      />
      <div className="prose">
        <p>The same skeleton solves a surprising number of problems once you choose what the "prefix" is:</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Prefix to keep</th>
            <th>Partner to look up</th>
            <th>Map stores</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Subarrays with sum k (560)</td>
            <td>running sum</td>
            <td>sum − k</td>
            <td>count</td>
          </tr>
          <tr>
            <td>Sum divisible by k (974, 523)</td>
            <td>sum mod k</td>
            <td>the same remainder</td>
            <td>count, or first index</td>
          </tr>
          <tr>
            <td>Equal 0s and 1s (525)</td>
            <td>sum with 0 → −1</td>
            <td>the same sum</td>
            <td>first index</td>
          </tr>
          <tr>
            <td>Every vowel an even number of times (1371)</td>
            <td>5-bit parity mask</td>
            <td>the same mask</td>
            <td>first index</td>
          </tr>
          <tr>
            <td>Shortest piece to remove so the rest divides by p (1590)</td>
            <td>sum mod p</td>
            <td>(sum − total) mod p</td>
            <td>latest index</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 3: Left and right passes</h2>
        <p>
          "For every position, something about all the <i>other</i> positions" sounds like a nested loop. Split "the others" into
          the part on the left and the part on the right. One pass from the left collects prefix results; one pass from the right
          collects suffix results; combine them. Product of Array Except Self is the classic, and it works with products, sums,
          maximums, counts and costs alike.
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'array', label: 'nums', items: [2, 3, 4, 5], tones: { 2: 'active' } },
          { kind: 'array', label: 'product of everything to the left', items: [1, 2, 6, 24], tones: { 2: 'info' } },
          { kind: 'array', label: 'product of everything to the right', items: [60, 20, 5, 1], tones: { 2: 'warn' } },
          { kind: 'array', label: 'answer = left × right', items: [60, 40, 30, 24], tones: { 2: 'match' } },
        ]}
        caption="For index 2: everything to the left multiplies to 6, everything to the right to 5, so the answer is 30. No division needed."
      />
      <Recipe
        name="Left pass, right pass"
        when="each answer depends on everything before and everything after a position."
        steps={[
          'Left to right: keep a running value of everything seen so far; store it at each position before including the current element.',
          'Right to left: keep a second running value; combine it into each position before including the current element.',
          'Each position now holds the combination of everything except itself.',
        ]}
        why="everything except i is exactly the prefix before i plus the suffix after i."
        time="O(n)"
        space="O(1) besides the output"
      />

      <div className="prose">
        <h2>Pattern 4: Prefix XOR and parity</h2>
        <p>
          The prefix trick needs an operation you can undo. Subtraction undoes addition. XOR undoes itself: x XOR x = 0. So the XOR
          of a range is prefix[r + 1] XOR prefix[l], and a range whose XOR is 0 lies between two equal prefixes. Parity is XOR on
          single bits: to track whether each of several counts is even or odd, keep one bit per count in a mask and flip it.
        </p>

        <h2>Pattern 5: 2D prefix sums</h2>
        <p>
          In a grid, store P[r][c] = the sum of the rectangle from the top-left corner to just before (r, c), with a border of zeros.
          The sum of any rectangle is the big top-left rectangle, minus the strip above it, minus the strip to its left, plus the
          corner that was subtracted twice. That is <b>inclusion–exclusion</b>.
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'grid', label: 'grid (query: rows 1–2, columns 1–3)', cells: grid, tones: gridTones },
          {
            kind: 'grid',
            label: 'P, with a zero border',
            cells: P,
            tones: { '3,4': 'active', '1,4': 'bad', '3,1': 'bad', '1,1': 'info' },
            rowHeaders: ['0', '1', '2', '3'],
            colHeaders: ['0', '1', '2', '3', '4'],
          },
        ]}
        caption={`Sum = P[3][4] − P[1][4] − P[3][1] + P[1][1] = ${P[3][4]} − ${P[1][4]} − ${P[3][1]} + ${P[1][1]} = ${rect(1, 1, 2, 3)}. Purple: the big rectangle; red: the strips removed; blue: the corner added back.`}
      />
      <Recipe
        name="2D prefix sums"
        when="you need many rectangle sums from a fixed grid."
        steps={[
          'Make P of size (m + 1) × (n + 1), all zeros.',
          'P[r + 1][c + 1] = grid[r][c] + P[r][c + 1] + P[r + 1][c] − P[r][c].',
          'Sum of rows r1..r2 and columns c1..c2 = P[r2 + 1][c2 + 1] − P[r1][c2 + 1] − P[r2 + 1][c1] + P[r1][c1].',
        ]}
        why="each term is a top-left rectangle; adding and subtracting them leaves exactly the cells of the query, each counted once."
        time="O(m · n) to build, O(1) per query"
        space="O(m · n)"
      />

      <div className="prose">
        <h2>Pattern 6: Difference arrays</h2>
        <p>
          The reverse problem: many updates of the form "add v to every position from l to r", then read the final values. Doing each
          update cell by cell costs <Cost>O(n)</Cost>. Instead, write +v at l and −v at r + 1 in a difference array. A prefix sum
          over it carries each +v forward until the matching −v cancels it, so one pass at the end applies every update at once.
          Booking seats on flights, counting passengers in a car and finding the busiest year are all this pattern.
        </p>
      </div>
      <Walkthrough
        title="Three range updates, then one prefix pass"
        frames={diff.frames}
        caption={`Final values: ${diff.result.join(', ')}. Each update cost two writes.`}
      />
      <Recipe
        name="Difference array"
        when="many range updates come before any reads."
        steps={[
          'Make diff with n + 1 cells, all zero.',
          'For each update (l, r, v): add v to diff[l] and subtract v from diff[r + 1].',
          'Run a prefix sum over diff; the running total at i is the final value at i.',
        ]}
        why="the prefix sum turns each +v at l into +v at every position from l onwards, and the −v at r + 1 cancels it after r."
        time="O(n + number of updates)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Worked example: Subarray Sum Equals K</h2>
        <p>Count the subarrays whose values add up to k. Values can be negative, and there are up to 2 × 10⁴ of them.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every start i, and extend the end j while keeping a running total. That is <Cost>O(n²)</Cost>, about 2 × 10⁸ steps
          here: borderline at best, and hopeless as soon as n grows.
        </p>
        <Step n={2}>Why not a sliding window?</Step>
        <p>
          A window needs "grow to increase, shrink to decrease". With negative values, adding an element can lower the sum, so you
          cannot tell which edge to move. See the worked example in <See id="sliding-window" />.
        </p>
        <Step n={3}>Turn the question around</Step>
        <p>
          Any subarray nums[i..j] has sum prefix[j + 1] − prefix[i]. Standing at j with running sum s, the subarrays ending here that
          sum to k are exactly those starting right after an earlier prefix equal to s − k. Keep a map from prefix value to how many
          times it has appeared, and add map[s − k] at every step.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          One pass with O(1) map operations: <Cost>O(n)</Cost> time and <Cost>O(n)</Cost> space. Seed the map with {'{0: 1}'} so a
          subarray starting at index 0 is counted. Look up before you record, so the empty subarray never counts when k = 0.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Forgetting the <b>empty prefix</b>: prefix[0] = 0 in the array, or {'{0: 1}'} / {'{0: −1}'} in the map. Without it, subarrays starting at index 0 are missed.</>,
          <>Recording the current prefix <b>before</b> looking up its partner, which lets a subarray pair with itself.</>,
          <>Using a sliding window when values can be negative. Prefix sums do not care about signs.</>,
          <>Negative remainders: in JavaScript <b>%</b> keeps the sign. Normalise to 0..k − 1.</>,
          <>For "longest" questions, overwriting the first index of a prefix. Keep the earliest one (and the latest for "shortest").</>,
          <>Forgetting the extra cell in a difference array, so an update ending at the last index writes out of bounds.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Build the prefix array for [4, −2, 7, 1]. Then use it to find the sum of indices 1 to 3.',
            solution: 'prefix = [0, 4, 2, 9, 10]. Sum of 1..3 = prefix[4] − prefix[1] = 10 − 4 = 6, and indeed −2 + 7 + 1 = 6.',
          },
          {
            task: 'Run the running-sum + map pattern on [1, 2, 1, 2] with k = 3. Write the map and the count after each element.',
            hint: 'Start with {0: 1}.',
            solution: 'sum 1: need −2, none; map {0:1, 1:1}. sum 3: need 0, count 1; map adds 3. sum 4: need 1, count 2; map adds 4. sum 6: need 3, count 3. Answer 3: [1,2], [2,1], [1,2].',
          },
          {
            task: 'Apply "add 3 to positions 0..2" and "add −1 to positions 2..4" to five zeros with a difference array. What is diff, and what are the final values?',
            solution: 'diff = [3, 0, −1, −3, 0, 1]. Prefix sums: 3, 3, 2, −1, −1.',
          },
          {
            task: 'Why does 0 → −1 turn "equal numbers of 0s and 1s" into a prefix-sum problem?',
            solution: 'A subarray with equal counts then sums to 0, which means the prefix sums at its two ends are equal. Looking for repeated prefix sums finds it.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'prefix = [0, 5, 3, 10, 12]. What is the sum of nums[1..3]?',
            options: ['7', '9', '12', '10'],
            answer: 0,
            why: 'prefix[4] − prefix[1] = 12 − 5 = 7.',
          },
          {
            q: 'In "count subarrays with sum k", why does the map start as {0: 1}?',
            options: [
              'So the map is never empty',
              'So a subarray that starts at index 0 is counted when the running sum itself equals k',
              'Because k is never 0',
              'To avoid negative numbers',
            ],
            answer: 1,
            why: 'A subarray from index 0 to j has sum equal to the running sum, so its partner is the empty prefix, whose value is 0.',
          },
          {
            q: 'Which technique should you use to count subarrays with sum exactly k when the array contains negative numbers?',
            options: ['Sliding window', 'Running sum + hash map', 'Binary search', 'Sorting'],
            answer: 1,
            why: 'Negative numbers break the sliding window. Prefix sums with a hash map work for any values.',
          },
          {
            q: 'You must apply 10⁵ range-add updates to an array of 10⁵ zeros, then print it. What is the best approach?',
            options: [
              'Apply each update cell by cell',
              'A difference array, then one prefix-sum pass',
              'Sort the updates',
              'A 2D prefix array',
            ],
            answer: 1,
            why: 'Two writes per update and one O(n) pass at the end: O(n + updates) instead of up to 10¹⁰ steps.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Problems 560 and 525 are the heart of this chapter: do them until the map pattern is automatic. Prefix sums that change over
          time need a Fenwick tree or a segment tree; you will meet them in <See id="binary-indexed-tree" /> and{' '}
          <See id="segment-tree" />.
        </p>
      </div>
      <ProblemSet id="prefix-sum" />

      <Recap>
        <ul>
          <li>sum(i..j) = prefix[j + 1] − prefix[i], with prefix[0] = 0. Build once in O(n), answer every range in O(1).</li>
          <li>Running sum + hash map counts or measures subarrays with an exact condition in one pass, negatives included.</li>
          <li>Choose the right "prefix": a sum, a remainder, a +1/−1 balance, or a parity mask. Seed the map with the empty prefix.</li>
          <li>Left and right passes answer "everything except me". 2D prefix sums use inclusion–exclusion.</li>
          <li>Difference arrays do the reverse: O(1) range updates, then one prefix pass to read every value.</li>
        </ul>
      </Recap>
    </>
  );
}
