import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/bitmask';
import { assignJobs, closestSubsetSum, submasks } from '../traces/bitmask';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const assign = assignJobs([
  [9, 2, 7],
  [6, 4, 3],
  [5, 8, 1],
]);
const middle = closestSubsetSum([6, -9, 4, 11], 14);
const subs = submasks(0b1011, 4);

export default function Bitmask() {
  return (
    <>
      <TopicIntro
        id="bitmask"
        time="5–6 hours, plus problems"
        before={['bit-manipulation', 'dp', 'backtracking']}
        learn={[
          'How one integer can stand for a whole subset, and the handful of bit operations you need',
          'DP over subsets: assignment, partitioning into groups, and travelling-salesman style "visit everything"',
          'Enumerating the submasks of a mask, and why it costs 3ⁿ in total',
          'Meet in the middle: splitting 2⁴⁰ into two lists of 2²⁰',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Picture a row of light switches, one per item. Each switch is on or off, so the whole row describes a subset, and the
          row read as a binary number is a single integer between 0 and 2ⁿ − 1. That integer is a <b>bitmask</b>: bit i is 1
          exactly when item i is in the subset.
        </p>
        <p>
          This matters because many problems over small sets ask about orders or assignments, and n! orders explode: 15! is
          more than a trillion. But often the future does not care about the <i>order</i> in which things were done, only about{' '}
          <b>which</b> things are done. There are only 2ⁿ such sets: 2¹⁵ = 32,768. A DP indexed by the mask turns{' '}
          <Cost>O(n!)</Cost> into <Cost>O(2ⁿ × n)</Cost>.
        </p>
        <p>
          The tell-tale sign is the limit: n ≤ 20, or 16, or 12. Watch the classic case, assigning three jobs to three workers at
          the lowest total cost.
        </p>
      </div>

      <Walkthrough
        title="Assignment by DP over subsets of jobs"
        frames={assign.frames}
        caption={`dp[mask] is the cheapest way to give the first popcount(mask) workers exactly the jobs in mask. Best total: ${assign.answer}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Use a bitmask when <b>n is small</b> and the future depends only on <b>which</b> items are used, not on their order.
          The popcount of the mask often tells you whose turn it is, so the mask alone is the state.
        </p>
      </Box>

      <div className="prose">
        <h2>The bit operations you need</h2>
        <p>
          You only need a few operations, all O(1). See <See id="bit-manipulation" /> for how they work. In TypeScript, bitwise
          operators work on 32-bit integers, which is plenty for masks of up to 30 items.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Operation, in words</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Is item i in the set?</td><td>mask AND 2ⁱ is not 0</td></tr>
          <tr><td>Add item i</td><td>mask OR 2ⁱ</td></tr>
          <tr><td>Remove item i</td><td>mask AND (NOT 2ⁱ)</td></tr>
          <tr><td>Do two sets overlap?</td><td>a AND b is not 0</td></tr>
          <tr><td>Union of two sets</td><td>a OR b</td></tr>
          <tr><td>The full set of n items</td><td>2ⁿ − 1</td></tr>
          <tr><td>How many items?</td><td>popcount: count the 1 bits (remove the lowest 1 bit until 0)</td></tr>
          <tr><td>Next smaller submask of m</td><td>(sub − 1) AND m</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to bitmasks. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Bitmask', ts: 'number (32-bit operations)', ops: 'test / set / union O(1)', use: 'One integer per subset. Up to about 30 items with JavaScript bitwise operators.' },
          { name: 'Array indexed by mask', ts: 'number[] or Int32Array of length 2ⁿ', ops: 'O(1)', use: 'dp[mask]. Typed arrays use far less memory than plain arrays for 2²⁰ entries.' },
          { name: 'Table mask × position', ts: 'number[][] (2ⁿ × n)', ops: 'O(1)', use: 'Travelling-salesman states: (visited set, current node).' },
          { name: 'Queue', ts: 'array with a head index', ops: 'O(1)', use: 'BFS over (node, mask) states when every move costs 1.' },
          { name: 'Sorted arrays and binary search', ts: 'number[] sorted with a comparator', ops: 'O(log n) search', use: 'Meet in the middle: combine the two halves\' subset sums.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Subsets as integers</h2>
        <p>
          With n ≤ 16 or so, simply loop over every mask from 0 to 2ⁿ − 1 and check it. Letters, skills and features fit the same
          way: one bit per letter turns "no shared letter" into a single AND, as in Maximum Length of a Concatenated String.
        </p>
        <h2>Pattern 2: Assignment DP</h2>
        <p>
          Give items to people one person at a time. If the first popcount(mask) people have received exactly the items in mask,
          the next person to serve is number popcount(mask), and the best cost so far is all you need. Students and mentors,
          numbers in a beautiful arrangement and XOR pairings all follow this shape. If one side is much bigger (40 hats, 10
          people), put the mask on the <b>smaller</b> side.
        </p>
      </div>
      <Recipe
        name="DP over subsets"
        when="you assign or order at most about 20 items and only the set already used matters."
        steps={[
          'Let dp[mask] be the best value after using exactly the items in mask; dp[0] is the starting value.',
          'Go through masks in increasing order: every mask is built from smaller masks, so its value is final by then.',
          'From each reachable mask, decide the next step (often the item for person popcount(mask)), and try every item not in mask.',
          'Relax dp[mask with that item] with dp[mask] plus the cost of the step.',
          'The answer is dp[full mask].',
        ]}
        why="two different orders that use the same set of items lead to the same future, so only the best of them needs keeping."
        time="O(2ⁿ × n)"
        space="O(2ⁿ)"
      />

      <div className="prose">
        <h2>Pattern 3: Partition into groups</h2>
        <p>
          To split items into k groups with equal sums, fill the groups one after another. Then the used mask fixes everything:
          the current group already holds (sum of the mask) mod target. For "minimise the largest group", let dp[j][mask] be
          the best result giving the items in mask to j people, and choose the last person's whole group as a{' '}
          <b>submask</b>.
        </p>
      </div>
      <VizFigure
        caption="The submasks of 1011, produced by repeating sub = (sub − 1) AND mask from the mask down to 0. Over all masks this visits 3ⁿ (mask, submask) pairs, because each item is either outside the mask, in the mask only, or in both."
        parts={[{ kind: 'array', label: 'submasks of 1011, largest first', items: subs, indices: false, tones: { 0: 'active', [subs.length - 1]: 'done' } }]}
      />
      <Recipe
        name="Enumerate submasks"
        when="a DP over masks chooses a whole group of items at once (one person's share, one semester's courses)."
        steps={[
          'Start with sub = mask.',
          'Use sub, then step to (sub − 1) AND mask.',
          'Stop after handling sub = 0 (or before it, if the empty group is not allowed).',
        ]}
        why="subtracting 1 clears the lowest set bit and sets all lower bits; AND-ing with mask keeps only allowed bits, giving the next smaller submask."
        time="O(3ⁿ) over all masks"
        space="O(1) extra"
      />

      <div className="prose">
        <h2>Pattern 4: Visit everything</h2>
        <p>
          When the order matters because the cost of the next step depends on where you are, the state is <b>(visited set,
          current position)</b>. That is the travelling salesman DP: dp[mask][last]. With equal step costs, as in Shortest Path
          Visiting All Nodes, the same states can be explored with BFS starting from every node at once. Parallel Courses II
          moves from mask to mask a whole semester at a time, choosing k-sized submasks of the available courses.
        </p>
        <h2>Pattern 5: Covering and games</h2>
        <p>
          Sometimes the mask is simply the whole state of a search. In Smallest Sufficient Team, dp[skills covered] is the
          smallest team, and each person ORs their skills into every reachable state. In Can I Win, the set of numbers already
          taken determines the running total, so win or lose is memoised by mask alone.
        </p>
        <h2>Pattern 6: Meet in the middle</h2>
        <p>
          At n = 40, 2⁴⁰ is about 10¹², too many. But any subset is a subset of the first half plus a subset of the second half.
          List both halves' subset sums (2²⁰ each, about a million), sort them, and combine: two pointers for the closest sum,
          binary search for a target, or a hash set for an exact match. You trade 2ⁿ for about 2^(n/2) × n.
        </p>
      </div>
      <Walkthrough
        title="Closest Subsequence Sum by meeting in the middle"
        frames={middle.frames}
        caption={`Two sorted lists of half-sums and two pointers. The closest sum is ${middle.best}, at distance ${middle.diff}.`}
      />
      <Recipe
        name="Meet in the middle"
        when="n is around 30–40, subsets are the search space, and the goal can be checked by combining two halves."
        steps={[
          'Split the items into two halves.',
          'List every subset result of each half (sums, or sums grouped by size).',
          'Sort one or both lists.',
          'For each left result, find the best partner in the right list with binary search, or sweep both lists with two pointers.',
        ]}
        why="every subset is exactly one left subset plus one right subset, so checking all pairs smartly covers everything."
        time="O(2^(n/2) × n)"
        space="O(2^(n/2))"
      />

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Partition to K Equal Sum Subsets</b>: can 16 numbers be split into k groups with equal
          sums?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Give each number one of k group labels: kⁿ ways, 16¹⁶ in the worst case. Backtracking with pruning often survives, but
          not reliably.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Fill the groups in order: group 1 until it reaches the target, then group 2, and so on. Two different orders that have
          used the same numbers are in exactly the same situation, because the current group's fill is (sum of used numbers)
          mod target. So the used set is the whole state.
        </p>
        <Step n={3}>Write the DP</Step>
        <p>
          dp[mask] = whether that set of numbers can be placed this way. From a reachable mask, add any unused number that still
          fits in the current group. The answer is dp[full mask].
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          2¹⁶ masks × 16 numbers ≈ a million steps. First check that the total divides by k and that no number exceeds the
          target, which rejects many inputs immediately. Store each mask's current fill rather than recomputing the sum from its
          bits. Done.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Using a bitmask when n is 30 or more without meet in the middle: 2³⁰ states will not fit in time or memory.</>,
          <>Putting the mask on the larger side (40 hats) instead of the smaller one (10 people).</>,
          <>Updating dp in place while iterating when items may only be used once: iterate masks in increasing order, or copy.</>,
          <>Enumerating submasks by testing every mask against every mask (4ⁿ) instead of the (sub − 1) AND mask step (3ⁿ).</>,
          <>Using plain arrays of 2²⁰ objects: prefer typed arrays or numbers to keep memory down.</>,
          <>JavaScript bitwise operators are 32-bit: a shift by 31 or more gives surprising results; keep masks below 2³⁰.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Write the subsets of {a, b, c} as masks, where bit 0 is a, bit 1 is b and bit 2 is c. Which mask is {a, c}?',
            solution: '0 = {}, 1 = {a}, 2 = {b}, 3 = {a, b}, 4 = {c}, 5 = {a, c}, 6 = {b, c}, 7 = {a, b, c}. {a, c} is 5 (binary 101).',
          },
          {
            task: 'List the submasks of 0110 using sub = (sub − 1) AND mask.',
            solution: '0110 → 0100 → 0010 → 0000.',
          },
          {
            task: 'For cost [[1, 2], [2, 1]] (worker by job), fill dp[00], dp[01], dp[10], dp[11] for the assignment DP.',
            solution: 'dp[00] = 0. Worker 0 takes job 0: dp[01] = 1; job 1: dp[10] = 2. Worker 1 then completes: dp[11] = min(dp[01] + cost[1][1], dp[10] + cost[1][0]) = min(2, 4) = 2.',
          },
          {
            task: 'Meet in the middle on [1, 2, 3, 4] with halves [1, 2] and [3, 4]: list both halves\' subset sums. Is there a subset summing to 6?',
            solution: 'Left: 0, 1, 2, 3. Right: 0, 3, 4, 7. 6 = 2 + 4 (or 3 + 3), so yes: {2, 4} or {1, 2, 3}.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'n = 18 items must be assigned to 18 people. Roughly how many states does the bitmask DP have?',
            options: ['18', '18² = 324', '2¹⁸ ≈ 262,000', '18! ≈ 6 × 10¹⁵'],
            answer: 2,
            why: 'One state per subset of used items: 2¹⁸. Each tries 18 items, so about 4.7 million steps.',
          },
          {
            q: 'In the assignment DP, how do you know which person is next for a given mask?',
            options: ['From the largest set bit', 'From popcount(mask)', 'From the mask value itself', 'You must store it separately'],
            answer: 1,
            why: 'People are served in order, so if popcount(mask) items are used, that many people are done.',
          },
          {
            q: 'Why does enumerating all submasks of all masks cost 3ⁿ?',
            options: [
              'Because each mask has n submasks',
              'Because each item is in one of three situations: outside the mask, in the mask only, or in both mask and submask',
              'Because of the popcount',
              'It costs 4ⁿ',
            ],
            answer: 1,
            why: 'Counting (mask, submask) pairs item by item gives three choices per item.',
          },
          {
            q: 'Closest Subsequence Sum has n = 40. Which method fits?',
            options: ['Bitmask DP over 2⁴⁰ masks', 'Meet in the middle', 'Greedy', 'Interval DP'],
            answer: 1,
            why: 'Two halves of 20 give two lists of about a million sums each, which sort and combine quickly.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with Pattern 1 to get comfortable with bits, then assignment and partition DPs, then the travelling-salesman
          problems, and finish with meet in the middle. Read the limit on n first in every problem: it tells you whether 2ⁿ
          fits. Problems marked <b>Core</b> are the minimum set.
        </p>
      </div>
      <ProblemSet id="bitmask" />

      <Recap>
        <ul>
          <li>A bitmask is a subset in one integer; with n ≤ 20, all 2ⁿ subsets can be states.</li>
          <li>DP over subsets keeps only the best value per set of used items: O(2ⁿ × n) instead of O(n!).</li>
          <li>Submask enumeration with (sub − 1) AND mask chooses whole groups; over all masks it costs 3ⁿ.</li>
          <li>When order matters, add the current position: dp[mask][last]. When n is about 40, meet in the middle.</li>
        </ul>
      </Recap>
    </>
  );
}
