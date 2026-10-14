import {
  Box, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dp-digit';
import { atMostNGivenDigitSet, digitSumCount } from '../traces/dp-digit';
import { Walkthrough } from '../viz/Walkthrough';

const walk = atMostNGivenDigitSet([1, 3, 6, 7], 6371);
const sums = digitSumCount(325, 5);

export default function DpDigit() {
  return (
    <>
      <TopicIntro
        id="dp-digit"
        time="3–4 hours, plus problems"
        before={['dp', 'memoization', 'math']}
        learn={[
          'How to count numbers up to N with a digit property without looping over the numbers',
          'The "tight" flag: why a prefix equal to N\'s prefix is the only case that needs care',
          'How to add memory to the state (used digits, last digit, digit sum, remainder) and memoise it',
          'Ranges as f(high) − f(low − 1), huge bounds given as strings, and leading zeros',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          "How many numbers from 1 to 2 × 10⁹ have all distinct digits?" Looping over two billion numbers is far too slow. But a
          number is just a row of digits, and you can build it <b>one digit at a time from the left</b>, counting choices
          instead of numbers.
        </p>
        <p>
          The only difficulty is the upper bound N. Compare it to a dictionary: once your word is alphabetically smaller in its
          first differing letter, every later letter is free. The same holds for numbers of the same length. While every digit
          so far equals N's digit, you are <b>tight</b>: the next digit may not exceed N's next digit. The moment you choose a
          smaller digit, you become <b>free</b>, and every remaining position can be anything the rule allows.
        </p>
        <p>
          The free part is where the speed comes from. How many ways to finish depends only on how many positions remain and a
          small state, never on the exact prefix, so it is computed once and reused. A number up to 10¹⁸ has 19 digits, so the
          work is roughly 19 × 10 × (states): tiny. Watch the walk for "numbers up to 6371 that use only the digits 1, 3, 6
          and 7".
        </p>
      </div>

      <Walkthrough
        title="Numbers At Most N Given Digit Set: walking the digits of 6371"
        frames={walk.frames}
        caption={`Shorter numbers are all free; at each position a smaller allowed digit frees the rest. Total: ${walk.answer}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A digit DP has two kinds of branches. <b>Tight</b> branches follow N exactly and there is only one of them at each
          position. <b>Free</b> branches have dropped below N, and their count depends only on (positions left, state), so you
          compute it once with a formula or a memo and reuse it everywhere.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to digit DP. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Digits of the bound', ts: 'string, or number[] of digits', ops: 'O(1) per position', use: 'Work on the digits of N. For bounds beyond 2⁵³ (10²², 100 digits), keep them as strings.' },
          { name: 'Memo table', ts: 'number[][] or Map keyed by "pos|state"', ops: 'O(1) lookup', use: 'Counts for free branches, keyed by position and state. Never memoise tight branches.' },
          { name: 'Used-digit mask', ts: 'number used as a 10-bit mask', ops: 'test / set a bit O(1)', use: 'Distinct-digit problems: bit d is set when digit d is used.' },
          { name: 'Precomputed powers or tables', ts: 'number[]', ops: 'O(1)', use: 'D^k for k free positions, Fibonacci-like counts for binary problems.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Walk the digits of N</h2>
        <p>
          When the rule needs no memory, or the free part has a closed formula, you do not need recursion at all. Count the
          shorter numbers directly, then walk N's digits from the left, adding the free counts for every smaller choice and
          stopping as soon as N's own digit breaks the rule. Number of Digit One is the same idea applied position by position:
          for each place value, count how often a 1 appears there.
        </p>
      </div>
      <Recipe
        name="Walk the digits of N"
        when="the free part can be counted with a formula (powers, falling products, place-value blocks)."
        steps={[
          'Count all valid numbers with fewer digits than N; they are all smaller.',
          'For each position of N, from the left: add (number of allowed digits smaller than N\'s digit) × (ways to fill the remaining positions freely).',
          'If N\'s digit itself is not allowed at this position, stop: no number can stay tight past it.',
          'If you get through every position, add 1 for N itself.',
        ]}
        why="every valid number below N either is shorter, or first drops below N at exactly one position, and each case is counted once."
        time="O(digits × choices)"
        space="O(digits)"
      />
      <Walkthrough
        title="Numbers up to 325 with digit sum 5: a free table, then a tight walk"
        frames={sums.frames}
        caption={`free[r][t] is computed once and read for every smaller digit choice. Total: ${sums.answer}.`}
      />

      <div className="prose">
        <h2>Pattern 2: Memo on position and state</h2>
        <p>
          When the rule needs memory, put it in the state: the digits used so far (distinct digits), the previous digit
          (stepping numbers), the digit sum (sum in a range), the remainder modulo k and the even-minus-odd balance (beautiful
          integers). The recursion goes position by position with a tight flag; results for free branches are memoised on
          (position, state). If leading zeros would confuse the rule, add a <b>started</b> flag: zeros before the first real
          digit are not part of the number.
        </p>
      </div>
      <Recipe
        name="Memoised digit DP"
        when="the rule depends on something about the digits chosen so far."
        steps={[
          'f(N) counts valid numbers from 0 (or 1) to N. The answer for a range is f(high) − f(low − 1).',
          'Recurse with (position, state, tight, started). At the end of the digits, return 1 if the state is accepted.',
          'At each position try digits from 0 up to N\'s digit when tight, or up to 9 when free; the child stays tight only if you chose N\'s digit.',
          'Update the state for the chosen digit (unless the number has not started and the digit is 0).',
          'Memoise results for non-tight states by (position, state, started).',
        ]}
        why="a free branch's count depends only on the positions left and the state, so equal states are counted once."
        time="O(digits × states × 10)"
        space="O(digits × states)"
      />

      <div className="prose">
        <h2>Pattern 3: Binary digits</h2>
        <p>
          Nothing changes in base 2 except that there are only two digits. "No two adjacent 1s" walks N's bits from the top:
          each 1 bit lets you put a 0 there instead and count every free ending, and the free endings follow a Fibonacci
          recurrence. "Total set bits at certain positions over 1..num" uses the fact that bit p repeats in blocks: it is on for
          2^(p−1) numbers out of every 2^p, so its count is a full-cycle part plus a remainder.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Count Special Integers</b>: how many numbers from 1 to n (up to 2 × 10⁹) have all
          distinct digits?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>Check every number: up to two billion checks, too slow. But the property only depends on the digits, so count digit choices instead.</p>
        <Step n={2}>Split by length</Step>
        <p>
          A number with fewer digits than n is always smaller. For k digits: 9 choices for the first digit (not 0), then 9, 8, 7
          and so on, because each later digit may be 0 but not a digit already used. Add these products for every shorter length.
        </p>
        <Step n={3}>Walk n's digits for the same length</Step>
        <p>
          Keep a mask of digits used by the tight prefix. At position i, every unused digit smaller than n[i] (and not 0 at the
          first position) frees the rest: the remaining positions take distinct digits from the 10 − (i + 1) still unused, a
          falling product. Then, if n[i] is already used, stop; otherwise mark it and continue. If you reach the end, n itself
          counts.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          At most 10 positions × 10 digits: constant work. Single-digit n: the shorter-lengths part is empty and the walk counts
          1..n. The complement, numbers with a repeated digit, is n minus this count (problem 1012). Done.
        </p>
      </div>

      <TableWrap>
        <thead>
          <tr>
            <th>Rule in the problem</th>
            <th>State to add</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Only certain digits allowed</td><td>none (a formula)</td><td>1</td></tr>
          <tr><td>All digits distinct</td><td>mask of used digits (or just how many)</td><td>2¹⁰</td></tr>
          <tr><td>Adjacent digits differ by 1</td><td>previous digit</td><td>10</td></tr>
          <tr><td>Digit sum in a range</td><td>sum so far</td><td>up to 9 × digits</td></tr>
          <tr><td>Divisible by k</td><td>remainder mod k</td><td>k</td></tr>
          <tr><td>Equal even and odd digit counts</td><td>even − odd balance, plus "started"</td><td>2 × digits + 1</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Memoising tight branches. They depend on N's exact digits; only free branches can be shared.</>,
          <>Treating leading zeros as real digits (counting them as even, as a repeated 0, or as the "previous digit").</>,
          <>Forgetting to count N itself after a successful tight walk.</>,
          <>Computing low − 1 on a 100-digit string. Use f(high) − f(low) + (1 if low itself is valid) instead.</>,
          <>Converting huge bounds to numbers: 10²² is past 2⁵³, so keep them as strings.</>,
          <>Leaving a modular subtraction negative: add the modulus before taking the remainder.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Using the walk, count the numbers from 1 to 300 that use only the digits {2, 4, 7}.',
            hint: 'Shorter numbers: 3 one-digit and 9 two-digit. Then walk 3, 0, 0.',
            solution: '21. Shorter: 3 + 9 = 12. At the first digit of 300, the allowed digit 2 is below 3 and frees the last two positions: 1 × 3 × 3 = 9. The digit 3 itself is not allowed, so stop. Total 21.',
          },
          {
            task: 'How many 3-digit numbers have all distinct digits?',
            solution: '9 × 9 × 8 = 648.',
          },
          {
            task: 'Count how many times the digit 1 appears from 0 to 21, using place values.',
            hint: 'Ones place: high = 2, digit = 1, low = 0. Tens place: high = 0, digit = 2.',
            solution: 'Ones place: 2 × 1 + (0 + 1) = 3 (1, 11 and 21). Tens place: 0 × 10 + 10 = 10 (10 to 19). Total 13.',
          },
          {
            task: 'For stepping numbers, why do you need a "started" flag?',
            solution: 'Without it, the padding zeros in front of a shorter number would count as digits. Seen as 023, the stepping number 23 would be rejected, because 0 to 2 is not a step. The flag makes the rule start at the first real digit.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which branches of a digit DP may be memoised and shared?',
            options: ['Tight branches', 'Free branches (already below N)', 'Only the last position', 'None: digit DP is greedy'],
            answer: 1,
            why: 'Free branches depend only on positions left and the state. Tight branches depend on N\'s remaining digits and appear once per position anyway.',
          },
          {
            q: 'How do you count valid numbers in [low, high]?',
            options: ['f(high) + f(low)', 'f(high) − f(low − 1)', 'f(high − low)', 'f(high) × f(low)'],
            answer: 1,
            why: 'Count from 0 to high, then remove the numbers from 0 to low − 1.',
          },
          {
            q: 'What state does "count numbers up to N divisible by k" need?',
            options: ['The digit sum', 'The remainder of the prefix modulo k', 'The last digit', 'Nothing'],
            answer: 1,
            why: 'Appending digit d changes the remainder r to (10r + d) mod k, so the remainder is all the future needs.',
          },
          {
            q: 'A bound has 100 digits. What changes?',
            options: ['Use BigInt for the whole DP', 'Keep it as a string; the DP only reads one digit at a time', 'Digit DP cannot handle it', 'Round it to 10¹⁸'],
            answer: 1,
            why: 'The DP works position by position. The counts are reported modulo 10⁹ + 7, so they stay small.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the walks (902 and 233), then the memoised versions. For every problem, write the state on paper and say
          what happens to it when you append one digit. Problems marked <b>Core</b> are the minimum set.
        </p>
      </div>
      <ProblemSet id="dp-digit" />

      <Recap>
        <ul>
          <li>Build numbers digit by digit: tight while the prefix equals N's, free once it drops below.</li>
          <li>Free branches depend only on (positions left, state): count them with a formula or a memo and reuse them.</li>
          <li>Ranges are f(high) − f(low − 1); huge bounds stay as strings; leading zeros need a "started" flag.</li>
          <li>The cost is about digits × states × 10, independent of how big N is.</li>
        </ul>
      </Recap>
    </>
  );
}
