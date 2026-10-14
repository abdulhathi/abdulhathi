import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/probability';
import { knightProbability, new21 } from '../traces/probability';
import { Walkthrough } from '../viz/Walkthrough';

const knight = knightProbability(4, 3, 0, 0);
const game = new21(5, 4, 3);

export default function Probability() {
  return (
    <>
      <TopicIntro
        id="probability"
        time="3–4 hours, plus problems"
        before={['dp', 'combinatorics', 'prefix-sum']}
        learn={[
          'The few probability rules you need: complements, independence, and adding exclusive cases',
          'Expected value and linearity of expectation, the most useful trick in the topic',
          'Probability DP: push probability through the states of a random process',
          'Sliding-window sums and convergence cut-offs that make probability DPs fast',
          'Mean, median and mode from a frequency table, and symmetry arguments',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A probability is a number between 0 and 1 that says how likely something is. When all outcomes are equally likely, it
          is a ratio: favourable outcomes divided by all outcomes. Rolling a 5 or a 6 on a die has probability 2/6.
        </p>
        <p>
          Coding problems usually describe a <b>random process</b> instead: a knight hopping at random, a player drawing cards,
          soup poured in random amounts. Listing every possible run is hopeless (8¹⁰⁰ knight paths), but you do not need runs.
          Think of probability as water: start with one litre at the starting state, and at every step pour each state's water
          into the states it can move to, split by the move probabilities. After the last step, the water sitting in the states
          you care about is the answer. That is <b>probability DP</b>, and it is most of this chapter.
        </p>
      </div>

      <Walkthrough
        title="Knight on a 4 × 4 board: pour the probability, move by move"
        frames={knight.frames}
        caption={`Probability of staying on the board for 3 moves from a corner: ${knight.result.toFixed(5)}.`}
      />

      <div className="prose">
        <h2>The rules you need</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Rule</th>
            <th>Statement</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Complement</td><td>P(not A) = 1 − P(A)</td><td>P(at least one six in 4 rolls) = 1 − (5/6)⁴ ≈ 0.518</td></tr>
          <tr><td>Exclusive cases add</td><td>P(A or B) = P(A) + P(B) if they cannot both happen</td><td>P(roll 5 or 6) = 1/6 + 1/6</td></tr>
          <tr><td>Independent events multiply</td><td>P(A and B) = P(A) × P(B)</td><td>Two heads in two tosses: 1/2 × 1/2</td></tr>
          <tr><td>Total probability</td><td>P(A) = Σ P(case) × P(A given case)</td><td>Every probability DP transition is this rule</td></tr>
          <tr><td>Expected value</td><td>E[X] = Σ value × P(value)</td><td>A fair die averages (1 + … + 6) / 6 = 3.5</td></tr>
          <tr><td>Linearity of expectation</td><td>E[X + Y] = E[X] + E[Y], always, even if X and Y depend on each other</td><td>Expected heads in 10 tosses = 10 × 1/2</td></tr>
        </tbody>
      </TableWrap>

      <Box kind="key" label="Key idea">
        <p>
          <b>Linearity of expectation</b> turns hard expected values into easy sums. To find the expected number of things that
          happen, write it as a sum of 0-or-1 indicators, one per thing, and add up their individual probabilities. Example:
          shuffle n cards; the expected number of cards that stay in their original position is n × (1/n) = 1, even though the
          events depend on each other.
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
          { name: 'Probability array', ts: 'number[] or Float64Array', ops: 'O(1) per read and write', use: 'dp[state] for one-dimensional processes such as running totals.' },
          { name: 'Two grid layers', ts: 'number[][] (current and next)', ops: 'O(cells) per step', use: 'Pushing probability on a board: read the current layer, write the next, then swap.' },
          { name: 'Memo table', ts: 'Map<string, number> or a 2D array', ops: 'O(1) average', use: 'Top-down recursion over states like (soup A left, soup B left).' },
          { name: 'Frequency array', ts: 'number[] indexed by value', ops: 'O(range) to scan', use: 'Statistics of huge samples given as counts.' },
          { name: 'Running sum', ts: 'number', ops: 'O(1) update', use: 'A sliding window over the last m DP values.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Probability DP over states</h2>
        <p>
          Choose the <b>state</b> so that the future depends only on it: (cell, moves made), (points so far), (soup A, soup B).
          Then either <b>push</b>: for every state, send its probability to each next state times the transition probability;
          or <b>pull</b>: compute each state's probability, or its probability of eventually winning, from the states it depends
          on. Push is natural for "where am I after k steps?"; pull with memoisation is natural for "what is my chance of winning
          from here?".
        </p>
      </div>
      <Recipe
        name="Push probability through a random process"
        when="a process makes random moves between a limited set of states and you need the distribution after k steps."
        steps={[
          'Put probability 1 on the start state and 0 everywhere else.',
          'For each step, start a fresh layer of zeros.',
          'For every state with non-zero probability, and every possible move, add (state probability × move probability) to the target state, or to a "lost" or "finished" total if the move leaves the space.',
          'Swap the layers and repeat for the required number of steps.',
          'Read the answer from the final layer (or from the finished totals).',
        ]}
        why="by the rule of total probability, a state's probability after s steps is the sum over every way to arrive there in one more step."
        time="O(steps × states × moves)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Pattern 2: Window speed-ups</h2>
        <p>
          When a step draws uniformly from 1 to m, the probability of a total i is the average of the m totals before it. Summing
          those m values for every i costs <Cost>O(n × m)</Cost>. Keep the sum in a variable instead: add the newest value when
          it enters the window, subtract the oldest when it leaves. Each step becomes <Cost>O(1)</Cost>, the same trick as{' '}
          <See id="sliding-window" /> and <See id="prefix-sum" />. Watch the window in New 21 Game: totals of k or more stop
          drawing, so they never enter it.
        </p>
      </div>
      <Walkthrough
        title="New 21 Game with n = 5, k = 4, maxPts = 3"
        frames={game.frames}
        caption={`Probability that Alice finishes with at most 5 points: ${game.result.toFixed(5)}.`}
      />

      <div className="prose">
        <h2>Pattern 3: Counting equally likely outcomes</h2>
        <p>
          If every outcome is equally likely, count with <See id="combinatorics" />: favourable over total. Be careful about what
          is equally likely. When balls of the same colour are indistinguishable, the different colour splits are <i>not</i>{' '}
          equally likely: a split that puts 2 of 4 red balls in box 1 can happen in C(4, 2) = 6 ways, a split that puts all 4
          there in only 1. Weight each split by its number of ways.
        </p>

        <h2>Pattern 4: Symmetry and convergence</h2>
        <p>
          Two quick wins come from looking at the shape of the answer. <b>Symmetry:</b> in the airplane seat problem, every
          random chooser is equally likely to take the first passenger's seat or the last passenger's seat, and the moment one of
          those is taken the outcome is settled, so the answer is 1/2. Brute-force tiny cases (or simulate) to spot such a
          constant, then explain it. <b>Convergence:</b> when n is huge but only 10⁻⁵ accuracy is needed, the answer often
          approaches a limit. In Soup Servings, soup A is served faster on average, so above about 4,800 mL the answer is within
          10⁻⁵ of 1, which keeps the DP table small.
        </p>
      </div>
      <Recipe
        name="Win probability by memoised recursion (pull)"
        when="you need the chance of an outcome from a starting state, and each state's chance is an average over random next states."
        steps={[
          'Define f(state) = probability of the target outcome starting from that state.',
          'Write the base cases: states where the outcome is decided (1, 0, or a split such as 0.5).',
          'For other states, f(state) = Σ P(move) × f(next state).',
          'Memoise f, and shrink the state space first (divide amounts by a common unit, cap values where the answer has converged).',
        ]}
        why="each state is computed once from states that are closer to the end of the process."
        time="O(states × moves)"
        space="O(states)"
      />

      <div className="prose">
        <h2>Statistics from counts</h2>
        <p>
          A sample of a billion values between 0 and 255 is best kept as 256 counts. The mean is Σ value × count / total. The
          mode is the value with the largest count. The median needs the value at position ⌊total / 2⌋ (and ⌊(total − 1) / 2⌋ for
          an even total) in sorted order: walk the counts with a running total until you pass that position. The same "walk the
          counts" idea finds any percentile.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: New 21 Game</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Recursively try every draw from every total: P(total) = average of P(total + d) for d = 1 … maxPts, until the total
          reaches k. The recursion revisits the same totals again and again, exponentially often.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Only the current total matters, and there are at most n + 1 totals. Store dp[i], the probability of ever holding
          exactly i points. Each dp[i] is the average of up to maxPts earlier values, which is <Cost>O(n × maxPts)</Cost> = 10⁸
          work at the limits: still too slow.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          dp[i] = (window sum) / maxPts, where the window holds dp[j] for the totals j in [i − maxPts, i − 1] that are below k.
          Slide the window by adding dp[i] when i &lt; k and removing dp[i − maxPts] when it was inside.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          <Cost>O(n)</Cost> time. If k = 0 she never draws, and if n ≥ k − 1 + maxPts she can never pass n: both answers are 1.
          The answer is the sum of dp[i] for k ≤ i ≤ n.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Simulating the process with random numbers: fine to check an answer, never accurate enough to submit.</>,
          <>Treating outcomes as equally likely when they are not (indistinguishable balls, weighted moves).</>,
          <>Letting states that have already stopped keep contributing (totals ≥ k in New 21 Game, a knight that has left the board).</>,
          <>Updating a one-dimensional DP in the wrong direction, so the same coin or item is counted twice.</>,
          <>Comparing floating-point probabilities with ===; answers are judged within a tolerance, so compute, do not compare.</>,
          <>Missing the convergence cut-off when the input can be 10⁹.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Roll two fair dice. What is the probability that the sum is 7? What is the expected sum?',
            solution: '6 of the 36 outcomes sum to 7, so 1/6. Expected sum = 3.5 + 3.5 = 7 by linearity.',
          },
          {
            task: 'A knight sits in a corner of a 3 × 3 board. What is the probability it is still on the board after one random move?',
            solution: 'From a corner only 2 of the 8 knight moves stay on a 3 × 3 board: 2/8 = 0.25.',
          },
          {
            task: 'Using linearity of expectation: n people each throw their hat into a pile and take one back at random. What is the expected number of people who get their own hat?',
            solution: 'Each person gets their own hat with probability 1/n; summing n indicators gives 1.',
          },
          {
            task: 'Counts: value 1 appears 3 times, value 2 twice, value 5 three times. What are the mean and the median?',
            solution: 'Total 8, sum 3 + 4 + 15 = 22, mean 2.75. Sorted: 1, 1, 1, 2, 2, 5, 5, 5; positions 3 and 4 hold 2 and 2, so the median is 2.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which statement about expected values is always true?',
            options: [
              'E[X × Y] = E[X] × E[Y]',
              'E[X + Y] = E[X] + E[Y]',
              'E[max(X, Y)] = max(E[X], E[Y])',
              'Only independent variables have expected values',
            ],
            answer: 1,
            why: 'Linearity holds with no conditions. The product rule needs independence, and max does not distribute.',
          },
          {
            q: 'In a push-style probability DP, what happens to probability that moves off the board?',
            options: ['It is redistributed equally', 'It is dropped: those runs have ended', 'It stays where it was', 'It returns to the start'],
            answer: 1,
            why: 'Those runs are over; only probability still on the board can contribute to staying on the board.',
          },
          {
            q: 'Why does New 21 Game keep a running window sum?',
            options: [
              'To save memory',
              'Each dp value averages the previous maxPts values; the running sum makes each step O(1) instead of O(maxPts)',
              'To avoid floating-point errors',
              'Because the window is always size k',
            ],
            answer: 1,
            why: 'Without it the DP costs O(n × maxPts), up to 10⁸ operations.',
          },
          {
            q: 'Soup Servings allows n up to 10⁹. Why is the DP still small?',
            options: [
              'Because of memoisation alone',
              'Amounts are in units of 25 mL and above about 4,800 mL the answer is within 10⁻⁵ of 1',
              'Because only four operations exist',
              'Because n is always even',
            ],
            answer: 1,
            why: 'Dividing by 25 and the convergence cut-off together bound the table to about 192 × 192 states.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          LeetCode has few pure probability problems, so each one below teaches a distinct idea. Verify your answers on small
          inputs by hand or with a quick simulation, then submit the exact DP.
        </p>
      </div>
      <ProblemSet id="probability" />

      <Recap>
        <ul>
          <li>Probability = favourable / total for equally likely outcomes; otherwise use the rules of complements, sums and products.</li>
          <li>Linearity of expectation: sum the probabilities of indicator events, no independence needed.</li>
          <li>Probability DP: pour probability from state to state (push), or average over next states with memoisation (pull).</li>
          <li>Sliding window sums make uniform-draw DPs linear; convergence cut-offs tame huge inputs.</li>
          <li>Symmetry arguments and statistics from counts round out the topic.</li>
        </ul>
      </Recap>
    </>
  );
}
