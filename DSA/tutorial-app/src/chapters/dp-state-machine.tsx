import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { Diagram } from '../diagrams/Diagram';
import type { DiagramSpec } from '../diagrams/geometry';
import { topic } from '../topics/dp-state-machine';
import { stockCooldown, stockTwoTransactions } from '../traces/dp-state-machine';
import { Walkthrough } from '../viz/Walkthrough';

const cooldown = stockCooldown([3, 1, 4, 2, 5, 0, 3]);
const twice = stockTwoTransactions([5, 2, 6, 1, 4, 8, 3, 7]);

const cooldownMachine: DiagramSpec = {
  width: 640,
  height: 270,
  title: 'Stock with cooldown as a state machine: rest goes to hold by buying, hold goes to sold by selling, sold goes back to rest after one day',
  legend: { core: 'State' },
  nodes: [
    { id: 'rest', kind: 'core', x: 130, y: 60, label: 'rest', sub: 'NO SHARE · WAIT OR BUY' },
    { id: 'hold', kind: 'core', x: 500, y: 60, label: 'hold', sub: 'OWN A SHARE · WAIT OR SELL' },
    { id: 'sold', kind: 'core', x: 315, y: 210, label: 'sold', sub: 'SOLD TODAY · MUST WAIT' },
  ],
  edges: [
    { a: 'rest', b: 'hold', label: 'buy: − price', sa: 'r', sb: 'l' },
    { a: 'hold', b: 'sold', label: 'sell: + price', sa: 'b', sb: 'r' },
    { a: 'sold', b: 'rest', label: 'cool down a day', sa: 'l', sb: 'b' },
  ],
};

export default function DpStateMachine() {
  return (
    <>
      <TopicIntro
        id="dp-state-machine"
        time="3–4 hours, plus problems"
        before={['dp', 'greedy']}
        learn={[
          'How to turn rules like "cooldown after selling" or "no two neighbours" into a small set of states',
          'How to draw the states and transitions first, then read the DP straight off the drawing',
          'The whole stock-trading family (I to IV, cooldown, fee) as one machine with more or fewer states',
          'Counting problems with tiny state spaces: attendance records, tilings, colourings, knight moves',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A vending machine does not remember every coin you ever inserted. It only knows which <b>state</b> it is in: idle,
          waiting for more money, ready to dispense. Many DP problems work the same way. You walk through the input one step
          at a time (one day, one house, one character), and at each step you only need to know which of a handful of
          situations you are in.
        </p>
        <p>
          A state machine DP keeps <b>one best value per state</b> and updates all of them at every step, using the allowed
          transitions. If there are s states, the whole thing costs <Cost>O(n × s)</Cost> time and usually <Cost>O(s)</Cost>{' '}
          memory, because a step only looks at the step before it.
        </p>
        <p>
          The brute force tries every sequence of actions, 3ⁿ for buy / sell / wait. The machine collapses all sequences that
          end in the same state into one number: the best of them. Here is the stock problem with a one-day cooldown, drawn
          as a machine.
        </p>
      </div>

      <Diagram spec={cooldownMachine} caption="Three states and three arrows. Staying in rest or in hold (waiting) is the fourth kind of move." />

      <Walkthrough
        title="Best Time to Buy and Sell Stock with Cooldown, one day per column"
        frames={cooldown.frames}
        caption={`Each column is a day, each row a state. The answer is the better of sold and rest on the last day: ${cooldown.answer}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Draw the machine before you write anything: <b>states</b> are the situations the rules care about, <b>arrows</b>{' '}
          are the actions, and each arrow carries a gain or a cost. The DP is then one line per state: <i>new value =
          best over arrows coming in of (old value at the arrow's start + its gain)</i>.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to a state machine. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Almost nothing: a few numbers, updated together.</p>
      </div>
      <Structures
        items={[
          { name: 'Running state values', ts: 'a few number variables', ops: 'O(1) per step', use: 'One number per state. Compute all new values from the old ones before overwriting.' },
          { name: 'Small array of states', ts: 'number[] of length s', ops: 'O(s) per step', use: 'When states are indexed: a last colour, a remainder, a keypad digit, a transaction count.' },
          { name: 'Transition table', ts: 'number[][] (from → list of to)', ops: 'O(1) lookup', use: 'Knight jumps, allowed vowel pairs: write the rules once as data.' },
          { name: 'BigInt', ts: 'bigint (BigInt)', ops: 'slower, exact', use: 'Only when a final product can pass 2⁵³, as in Count Number of Ways to Place Houses.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Holding or not holding</h2>
        <p>
          All six stock problems use the same picture. Without rules you need two states, <b>hold</b> and <b>free</b>. A
          transaction fee lowers the sell arrow. A cooldown adds a <b>sold</b> state that must pass through <b>rest</b>. A
          limit of k transactions gives k copies of the buy and sell states, chained so the second purchase is paid from the
          first profit.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Problem</th>
            <th>States</th>
            <th>What changes</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>121 (one transaction)</td><td>hold, sold</td><td>You can buy only once: hold = max(hold, −price).</td></tr>
          <tr><td>122 (unlimited)</td><td>hold, free</td><td>hold = max(hold, free − price), free = max(free, hold + price).</td></tr>
          <tr><td>714 (fee)</td><td>hold, free</td><td>Subtract the fee on the sell arrow.</td></tr>
          <tr><td>309 (cooldown)</td><td>hold, sold, rest</td><td>Selling leads to sold; buying only from rest.</td></tr>
          <tr><td>123 (at most 2)</td><td>buy1, sell1, buy2, sell2</td><td>Each state is reached only from the one before it.</td></tr>
          <tr><td>188 (at most k)</td><td>buy[t], sell[t], t = 1..k</td><td>k copies; if 2k ≥ n it is just problem 122.</td></tr>
        </tbody>
      </TableWrap>
      <Walkthrough
        title="At most two transactions: four states updated in order"
        frames={twice.frames}
        caption={`The second buy builds on the first sale. The best profit is ${twice.answer}.`}
      />
      <Recipe
        name="State machine DP"
        when="each step offers a few actions and the rules depend only on a small amount of recent history."
        steps={[
          'List the situations the rules care about: these are the states.',
          'Draw the allowed arrows between states, with the gain or cost of each.',
          'Set the starting values: reachable states get their real value, unreachable ones get −∞ (or +∞ when minimising).',
          'For each step, compute every state\'s new value from the OLD values along its incoming arrows.',
          'The answer is the best value among the states you are allowed to finish in.',
        ]}
        why="any sequence of actions is a walk through the machine, and only its current state matters for what can happen next."
        time="O(n × states)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Pattern 2: Take or skip with a neighbour rule</h2>
        <p>
          "No two adjacent houses" means the only thing you need to know about the past is whether you took the previous
          item. Two states, <b>took it</b> and <b>skipped it</b>, cover House Robber, placing houses on a street, and
          swapping or not swapping in Minimum Swaps To Make Sequences Increasing. A circle adds one twist: the first and last
          items are neighbours, so solve two straight lines, one without the first item and one without the last.
        </p>
        <h2>Pattern 3: Remember the last choice</h2>
        <p>
          When the next choice depends on the previous one, make the previous choice the state. Paint House keeps one value
          per last colour. Knight Dialer keeps one count per key. Count Vowels Permutation keeps one count per last vowel. A
          clever reduction sometimes shrinks the state further: in the N × 3 grid colouring, the exact colours do not matter,
          only whether a row looks like ABA or ABC, so 12 states become 2.
        </p>
        <h2>Pattern 4: Track only what the rules need</h2>
        <p>
          For counting problems, ask: "what must I know about the sequence so far to decide what may come next?" For the
          attendance record it is the number of absences (0 or 1) and the current run of lates (0, 1 or 2): six states. For
          tilings it is the shape of the right edge. For "greatest sum divisible by three" it is the remainder. Everything
          else about the past is irrelevant, and forgetting it is what makes the DP fast.
        </p>
      </div>
      <Recipe
        name="Counting with a state machine"
        when="you must count sequences of length n under local rules, modulo 10⁹ + 7."
        steps={[
          'Decide the minimum facts about the sequence so far that the rules need: these are the states.',
          'Start with count 1 in the empty sequence\'s state (or the counts for length 1).',
          'For each new position, for each state and each allowed next item, add the count to the state that item leads to.',
          'Take every addition modulo 10⁹ + 7.',
          'After n steps, add up the counts of the states that are allowed to end the sequence.',
        ]}
        why="two sequences in the same state can be extended in exactly the same ways, so they can be counted together."
        time="O(n × states × choices)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Student Attendance Record II</b>: count strings of length n over A, L and P with fewer
          than two A in total and never three L in a row.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Generate all 3ⁿ strings and check each. With n up to 10⁵ that is impossible, but it tells you what a correct answer
          must count.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Two different prefixes, say "PAL" and "LAL", can be continued in exactly the same ways: both have one absence and
          end with one late. Counting their continuations separately is wasted work.
        </p>
        <Step n={3}>Pick the states and arrows</Step>
        <p>
          The rules only look at (absences so far, current run of lates): 2 × 3 = 6 states. P sends any state to (same
          absences, 0 lates). A is allowed only with 0 absences and goes to (1, 0). L is allowed only with fewer than 2
          trailing lates and adds one to the run.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Six states, three arrows each, n steps: <Cost>O(n)</Cost> with constant memory. For n = 1 the answer is 3. Take the
          modulo after every addition so numbers stay small. Done.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Updating a state in place and then using its <b>new</b> value to compute another state on the same step. Compute from the old values, or update in a safe order.</>,
          <>Starting an impossible state at 0 instead of −∞, which lets the DP "sell" a share it never bought.</>,
          <>Finishing in a state that is not allowed (holding a share at the end, or an unfinished tiling edge).</>,
          <>Remembering more history than the rules need, which multiplies the states for nothing.</>,
          <>For circular inputs, forgetting that the first and last items are neighbours.</>,
          <>Products of two values modulo 10⁹ + 7 can exceed 2⁵³: use BigInt for that multiplication.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run the two-state machine for Best Time to Buy and Sell Stock II on prices [3, 8, 2, 4, 9, 5]. What is the profit?',
            hint: 'Start with hold = −3, free = 0.',
            solution: '12: buy at 3, sell at 8 (+5), buy at 2, sell at 9 (+7). The free value ends at 12, the same as adding the rises 5 + 2 + 5.',
          },
          {
            task: 'Draw the state machine for the stock problem with a transaction fee. How many states and arrows does it have?',
            solution: 'Two states, hold and free. Arrows: free → hold (buy, −price), hold → free (sell, +price − fee), and a "wait" loop on each state.',
          },
          {
            task: 'For Domino and Tromino Tiling, check that full[3] = 5 using full[i] = full[i−1] + full[i−2] + 2 × part[i−1] and part[i] = part[i−1] + full[i−2], starting from full[0] = full[1] = 1, part[1] = 0.',
            solution: 'full[2] = 1 + 1 + 0 = 2, part[2] = 0 + 1 = 1, full[3] = 2 + 1 + 2 × 1 = 5.',
          },
          {
            task: 'House Robber II on [4, 1, 2, 5]: why is the answer 6 and not 9?',
            solution: 'Houses 0 and 3 are neighbours in the circle, so you cannot take both 4 and 5. The two straight lines [4, 1, 2] and [1, 2, 5] each give 6.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In the cooldown problem, which state may you buy from?',
            options: ['hold', 'sold', 'rest', 'any state'],
            answer: 2,
            why: 'After selling you are in sold, and you must spend a day in rest before you are allowed to buy again.',
          },
          {
            q: 'Why do the buy states start at −∞ in the "at most two transactions" problem?',
            options: [
              'To make the answer negative',
              'Because before any purchase, owning a share is impossible',
              'Because prices can be negative',
              'It does not matter what they start at',
            ],
            answer: 1,
            why: '−∞ marks an unreachable state, so it can never be used as the start of a profitable sell.',
          },
          {
            q: 'How many states does Student Attendance Record II need?',
            options: ['2', '3', '6', 'n'],
            answer: 2,
            why: 'Absences so far (0 or 1) times trailing lates (0, 1 or 2) gives six states.',
          },
          {
            q: 'Best Time to Buy and Sell Stock IV has k = 1000 and 500 days. What should you do?',
            options: ['Run the k-state DP', 'Treat it as unlimited transactions (problem 122)', 'Use interval DP', 'Return 0'],
            answer: 1,
            why: 'With 500 days you can never make more than 250 transactions, so the limit never binds.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Do the stock problems in order first: each adds one rule to the same machine. Then the neighbour and last-choice
          problems, then the counting problems. Draw the machine on paper before every problem. Problems marked <b>Core</b>{' '}
          are the minimum set.
        </p>
      </div>
      <ProblemSet id="dp-state-machine" />

      <Recap>
        <ul>
          <li>A state machine DP keeps one best value (or count) per state and updates them all once per step: O(n × states).</li>
          <li>Draw the states and arrows first; the recurrences are read straight off the drawing.</li>
          <li>Every extra rule (cooldown, fee, transaction limit) is an extra state, never a rewrite.</li>
          <li>For counting, keep only the facts the rules need about the past; sequences in the same state are counted together.</li>
        </ul>
      </Recap>
    </>
  );
}
