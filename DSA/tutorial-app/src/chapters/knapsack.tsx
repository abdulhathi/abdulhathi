import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/knapsack';
import { coinChange, oneItemBothWays, subsetSum } from '../traces/knapsack';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const subset = subsetSum([3, 1, 4, 2], 5);
const coins = coinChange([1, 3, 4], 6);
const both = oneItemBothWays(3, 9);

export default function Knapsack() {
  return (
    <>
      <TopicIntro
        id="knapsack"
        time="5–6 hours, plus problems"
        before={['dp', 'greedy']}
        learn={[
          'The knapsack state (items considered, capacity used) and why it beats trying every subset',
          'Why 0/1 knapsack sweeps the capacity downwards and unbounded knapsack sweeps it upwards',
          'Counting versus optimising, and combinations versus orderings',
          'Bounded, group and mixed knapsacks, and knapsacks with two or more capacities',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A hiker has a bag that holds 10 kg and a pile of items, each with a weight and a value. Which items should go in? With n
          items there are <Cost>2ⁿ</Cost> subsets; at 40 items that is a trillion. Greedy by value per kilogram fails (see{' '}
          <See id="greedy" />), so something smarter is needed.
        </p>
        <p>
          The key observation: once you have decided about the first i items, the only thing that matters for the rest is{' '}
          <b>how much capacity you have used</b>, not which items you picked. Two different choices that use the same weight are
          interchangeable for the future; keep only the better one. So the state is (items considered, capacity used), and the table
          has n × capacity entries: <Cost>O(n · W)</Cost> instead of <Cost>O(2ⁿ)</Cost>.
        </p>
        <p>
          Many problems are knapsacks in disguise: splitting an array into equal halves, assigning signs to reach a target, making
          change with coins. The cleanest form is subset sum: which totals can a subset of the items reach?
        </p>
      </div>

      <Walkthrough
        title="Subset sum: one item at a time, sums from high to low"
        frames={subset.frames}
        caption="The table has one entry per possible total. Each item can only turn F into T by adding itself to a total that was already reachable without it."
      />

      <Box kind="key" label="Key idea">
        <p>
          The direction of the capacity loop decides how many times an item can be used. <b>Downwards</b> (high to low): when you
          read can[s − x] it has not been touched by this item yet, so the item is used at most once (<b>0/1 knapsack</b>).{' '}
          <b>Upwards</b> (low to high): can[s − x] may already include this item, so it can be used again and again (
          <b>unbounded knapsack</b>).
        </p>
      </Box>
      <VizFigure
        parts={[
          { kind: 'array', label: 'one item of size 3, capacity swept downwards (0/1)', items: both.down, tones: { 0: 'match', 3: 'match' } },
          { kind: 'array', label: 'the same item, capacity swept upwards (unbounded)', items: both.up, tones: { 0: 'match', 3: 'match', 6: 'warn', 9: 'warn' } },
        ]}
        caption="Starting from only the empty sum, one item of size 3 should reach 0 and 3. Sweeping upwards also reaches 6 and 9 (amber): the item was reused, which is right for coins and wrong for 0/1 items."
      />

      <div className="prose">
        <h2>The four flavours</h2>
        <p>The table always has a capacity axis. What changes is how many times each item may be used and what you store.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Flavour</th>
            <th>Each item can be used</th>
            <th>Loop order</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>0/1</td><td>Once or not at all</td><td>Items outside; capacity downwards</td><td>Partition Equal Subset Sum, Target Sum</td></tr>
          <tr><td>Unbounded (complete)</td><td>Any number of times</td><td>Capacity upwards</td><td>Coin Change, Perfect Squares</td></tr>
          <tr><td>Bounded (multiple)</td><td>Up to c times</td><td>A new layer per item, summing over 0 to c copies</td><td>Number of Ways to Earn Points</td></tr>
          <tr><td>Group / mixed</td><td>Exactly one option per group, or a mix of the above</td><td>A new layer per group</td><td>Number of Dice Rolls With Target Sum, Closest Dessert Cost</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>And what each entry stores depends on the question:</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Entry holds</th>
            <th>Combine with</th>
            <th>Start</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Is total s reachable?</td><td>true / false</td><td>OR</td><td>can[0] = true</td></tr>
          <tr><td>How many ways reach s?</td><td>a count</td><td>+</td><td>ways[0] = 1</td></tr>
          <tr><td>Fewest items to reach s?</td><td>a number</td><td>min of (entry + 1)</td><td>fewest[0] = 0, others infinity</td></tr>
          <tr><td>Most value within capacity s?</td><td>a number</td><td>max of (entry + value)</td><td>all 0 ("at most s") or −infinity except 0 ("exactly s")</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to a knapsack. The <See id="recognition" /> collects every signal from every chapter.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: '1D capacity table', ts: 'new Array(W + 1).fill(0)', ops: 'read and write O(1)', use: 'The standard knapsack: the item dimension is rolled away by the loop order.' },
          { name: 'Boolean table', ts: 'new Array(W + 1).fill(false)', ops: 'O(1)', use: 'Reachability questions: subset sum, equal partition, closest sum.' },
          { name: 'Two layers', ts: 'let ways = …, next = new Array(W + 1).fill(0)', ops: 'O(1)', use: 'Bounded and group knapsacks, where each item or group must be applied exactly once per layer.' },
          { name: '2D capacity table', ts: 'Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))', ops: 'O(1)', use: 'Two budgets at once, such as zeros and ones.' },
          { name: 'Map', ts: 'new Map<number, number>()', ops: 'O(1) average', use: 'Sparse states such as a difference between two sums, or an encoded vector of needs.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: 0/1, each item at most once</h2>
        <p>
          The classic. Many problems need a translation first. Partition Equal Subset Sum asks for a subset that sums to half the
          total. Target Sum asks how many sign choices reach a target; since the plus group P must satisfy P − (total − P) =
          target, it asks how many subsets sum to (total + target) / 2. Last Stone Weight II hides the same "two groups with the
          smallest difference" question behind a smashing game.
        </p>
      </div>
      <Recipe
        name="0/1 knapsack"
        when="each item can be chosen at most once and the choices share one capacity."
        steps={[
          'Translate the question into "subsets with total s" if needed (half the sum, (total + target) / 2, and so on).',
          'Make a 1D table over capacities 0 to W and set the base entry (true, 1 or 0 at capacity 0).',
          'For each item of size x, for s from W down to x: combine table[s] with table[s − x] (OR, +, max with value).',
          'Read the answer at table[W] (or scan the table for the best reachable entry).',
        ]}
        why="sweeping downwards means table[s − x] still describes the items before this one, so this item is counted at most once."
        time="O(n · W)"
        space="O(W)"
      />

      <div className="prose">
        <h2>Pattern 2: Unbounded, unlimited copies</h2>
        <p>
          Coins, squares and digits can be reused, so sweep the capacity upwards. Coin Change asks for the fewest coins; Coin Change
          II counts combinations; Combination Sum IV counts orderings. The last two differ only in loop order, which is one of the
          most useful facts in this chapter.
        </p>
      </div>
      <Walkthrough
        title="Coin Change: fewest coins, amounts from low to high"
        frames={coins.frames}
        caption={`Coins 1, 3 and 4 with amount 6: greedy takes 4 + 1 + 1, the table finds 3 + 3. Fewest coins: ${coins.fewest}.`}
      />
      <TableWrap>
        <thead>
          <tr>
            <th>Loop order</th>
            <th>Counts</th>
            <th>For coins 1 and 2, amount 3</th>
            <th>Problem</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Coins outside, amounts inside</td>
            <td>Combinations (order ignored)</td>
            <td>2: {'{1, 1, 1}'} and {'{1, 2}'}</td>
            <td>Coin Change II</td>
          </tr>
          <tr>
            <td>Amounts outside, coins inside</td>
            <td>Sequences (order matters)</td>
            <td>3: 1 + 1 + 1, 1 + 2, 2 + 1</td>
            <td>Combination Sum IV</td>
          </tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Unbounded knapsack"
        when="each item can be used any number of times."
        steps={[
          'Make a 1D table over capacities and set the base entry at 0.',
          'To count combinations, loop items outside and capacities inside; to count orderings, loop capacities outside and items inside; to optimise (fewest or most), either order works.',
          'Sweep capacities upwards: table[s] combines with table[s − x], which may already include item x.',
          'Read table[W]; for minimums, report "impossible" if it is still infinity.',
        ]}
        why="reading an entry already updated for this item is exactly what lets the item appear again."
        time="O(n · W)"
        space="O(W)"
      />

      <div className="prose">
        <h2>Pattern 3: Bounded, grouped and mixed</h2>
        <p>
          When an item may be used up to c times, or a group allows exactly one choice, build a new layer for each item or group:
          next[s] sums (or maximises) the previous layer over the allowed numbers of copies. Dice are groups (each die gives exactly
          one face). Questions of one type are a bounded item. Closest Dessert Cost mixes both: one base from a group, each topping 0,
          1 or 2 times. When counts are large, a sliding-window sum over s, s − v, s − 2v, … keeps each layer at <Cost>O(W)</Cost>.
        </p>
      </div>
      <Recipe
        name="Bounded or group knapsack"
        when="an item has a limited number of copies, or you must pick exactly one option from each group."
        steps={[
          'Keep the current layer, and build next as an empty table for each item or group.',
          'For each capacity s, combine the current layer over every allowed choice: copies 0 to c of the item, or each option in the group.',
          'Replace the current layer with next.',
          'If counts are large, replace the inner sum with a running window sum over capacities that differ by the item size.',
        ]}
        why="a fresh layer per item means the previous layer never includes it, so the number of copies is exactly what the inner loop chose."
        time="O(W × total choices), or O(n · W) with a sliding window"
        space="O(W)"
      />

      <div className="prose">
        <h2>Pattern 4: More than one capacity</h2>
        <p>
          A string in Ones and Zeroes costs zeros <i>and</i> ones; a crime in Profitable Schemes uses members and produces profit.
          Each budget becomes a dimension, and the 0/1 rule still applies: sweep every capacity dimension downwards. A useful trick
          from Profitable Schemes: if only "at least P" matters, cap that dimension at P so the table stays small.
        </p>
      </div>
      <Recipe
        name="Multi-dimensional knapsack"
        when="each item consumes two or more budgets at once."
        steps={[
          'Make one table dimension per budget (cap any "at least P" quantity at P).',
          'For each item, sweep every budget dimension downwards (for 0/1) and combine with the entry shifted by the item\'s costs.',
          'Read the answer at the full budgets, or sum over the entries that meet the requirement.',
        ]}
        why="the state again replaces which items were chosen with how much of each budget they used, just in more dimensions."
        time="O(n × product of the budgets)"
        space="O(product of the budgets)"
      />

      <div className="prose">
        <h2>Worked example: Target Sum</h2>
        <p>Put + or − before each number so that the expression equals a target. How many ways are there?</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try both signs for every number: <Cost>2ⁿ</Cost> expressions. With n = 20 that is about a million, which passes, but the
          moment n grows it does not, and it teaches nothing reusable.
        </p>
        <Step n={2}>Translate</Step>
        <p>
          Call the numbers with a + sign the group P, and the rest N. Then sum(P) − sum(N) = target and sum(P) + sum(N) = total.
          Adding the two equations: sum(P) = (total + target) / 2. Choosing signs is the same as choosing the subset P.
        </p>
        <Step n={3}>Recognise the knapsack</Step>
        <p>
          Count the subsets with sum (total + target) / 2. Each number is used at most once: a counting 0/1 knapsack, sweeping sums
          downwards, with ways[0] = 1.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(n · total)</Cost> time and <Cost>O(total)</Cost> space. If total + target is odd, or |target| is larger than the
          total, the answer is 0. Zeros double the count (+0 and −0 are different expressions), and the counting table does that for
          you.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Sweeping the capacity in the wrong direction: upwards for 0/1 items reuses them, downwards for coins forbids reuse.</>,
          <>Swapping the loops in a counting problem and counting orderings instead of combinations (or the reverse).</>,
          <>Starting an "exactly s" maximisation at 0 instead of minus infinity, which quietly allows totals below s.</>,
          <>Forgetting the base case: ways[0] = 1, can[0] = true, fewest[0] = 0.</>,
          <>Missing the translation: equal partition, target sum and last stone weight are all subset sums in disguise.</>,
          <>Updating a bounded or group knapsack in place, which lets an item be counted more times than allowed.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Subset sum with items [2, 3, 7] and capacity 10. Which totals from 0 to 10 are reachable?',
            solution: '0, 2, 3, 5, 7, 9 and 10. (7 + 3 = 10, 7 + 2 = 9, 2 + 3 = 5.)',
          },
          {
            task: 'Coin Change II with coins [1, 3, 4] and amount 6. Fill ways after each coin.',
            solution: 'After 1: all 1s. After 3: 1, 1, 1, 2, 2, 2, 3. After 4: 1, 1, 1, 2, 3, 3, 4. Answer 4: 1+1+1+1+1+1, 3+1+1+1, 3+3 and 4+1+1.',
          },
          {
            task: 'Target Sum with nums [1, 2, 3] and target 0. What is P, and how many ways are there?',
            solution: 'Total 6, so P = (6 + 0) / 2 = 3. Subsets with sum 3: {3} and {1, 2}, so 2 ways (−1 −2 +3 and +1 +2 −3).',
          },
          {
            task: 'Explain in one sentence why Coin Change II puts the coin loop outside.',
            solution: 'Coins are then always added in the same order, so each combination is built exactly once instead of once per ordering.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In a 0/1 knapsack with a 1D table, which way should the capacity loop run?',
            options: ['Upwards', 'Downwards', 'Either way', 'It depends on the item values'],
            answer: 1,
            why: 'Downwards means table[s − x] has not been updated for this item yet, so the item is used at most once.',
          },
          {
            q: 'Coin Change II (combinations) and Combination Sum IV (orderings) use the same recurrence. What differs?',
            options: ['The base case', 'The loop order', 'One uses min, the other uses +', 'Nothing'],
            answer: 1,
            why: 'Coins outside counts combinations; amounts outside counts every ordering.',
          },
          {
            q: 'Target Sum: the numbers add up to 10 and the target is 4. Which subsets do you count?',
            options: ['Subsets with sum 4', 'Subsets with sum 7', 'Subsets with sum 3', 'Subsets with sum 14'],
            answer: 1,
            why: 'P = (total + target) / 2 = (10 + 4) / 2 = 7.',
          },
          {
            q: 'Profitable Schemes asks for profit of at least minProfit. Why cap the profit dimension at minProfit?',
            options: [
              'To avoid negative numbers',
              'Every profit above the minimum counts the same, so merging them keeps the table small',
              'Because the profit is always below minProfit',
              'To make the loops run upwards',
            ],
            answer: 1,
            why: 'Only "enough or not" matters beyond the minimum, so one state stands for all of them.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, decide first which flavour it is (0/1, unbounded, bounded or grouped, multi-capacity) and what an entry
          holds (true/false, a count, a minimum, a maximum). The loop order follows from that. Problems marked <b>Core</b> are the
          minimum set; mark each one Solved so the <a href="#/review">review queue</a> brings it back.
        </p>
      </div>
      <ProblemSet id="knapsack" />

      <Recap>
        <ul>
          <li>Knapsack state: items considered and capacity used. O(n · W) replaces O(2ⁿ).</li>
          <li>0/1 sweeps capacity downwards; unbounded sweeps upwards. Bounded and group knapsacks build a new layer per item.</li>
          <li>Counting combinations puts items outside; counting orderings puts capacity outside.</li>
          <li>Translate first: equal partition, sign assignment and smallest difference are all subset sums.</li>
        </ul>
      </Recap>
    </>
  );
}
