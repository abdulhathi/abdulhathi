import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/enumeration';
import { arithmeticTriplets, consecutiveSums, sequentialDigits } from '../traces/enumeration';
import { Walkthrough } from '../viz/Walkthrough';

const seq = sequentialDigits(1000, 13000);
const triplets = arithmeticTriplets([0, 1, 4, 6, 7, 10], 3);
const sums = consecutiveSums(15);

export default function Enumeration() {
  return (
    <>
      <TopicIntro
        id="enumeration"
        time="3 hours, plus problems"
        before={['complexity', 'hash-table', 'bit-manipulation']}
        learn={[
          'How to read the limits to know when brute force is the intended solution',
          'Enumerating the answers instead of the input',
          'Choosing which variable to loop over so the others become lookups',
          'Listing all subsets with bitmasks, and bounding loops with a little algebra',
          'Turning a brute-force search into an efficient one by removing repeated work',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Enumeration means trying the possibilities one by one. That sounds like the opposite of a clever algorithm, but "brute force
          done well" solves a surprising number of problems, and it is always the first step toward the clever answer. The skill is
          not whether to try possibilities; it is <b>which</b> possibilities to try.
        </p>
        <p>
          Think of finding a friend's house on a long street when you know the number has the same digit three times. You would not
          knock on every door. You would walk straight to 111, 222, 333 and so on. Enumeration works the same way: instead of scanning
          a huge range of inputs, list the few things that could possibly be answers. Instead of three nested loops, fix the one
          element that determines the others. Instead of trying every start of a sum, try every length, which is short.
        </p>
      </div>

      <Walkthrough
        title="Sequential Digits: enumerate the 36 possible answers, not the range"
        frames={seq.frames}
        caption="Every number whose digits go up by one is a slice of 123456789, so the search never touches the 12,000 numbers in the range."
      />

      <Box kind="key" label="Key idea">
        <p>
          Before writing a loop, ask two questions. <i>How many candidates does it try?</i> Multiply that by the cost per candidate
          and compare with about 10⁸ operations per second. <i>Is there a smaller set of candidates that still contains every
          answer?</i> The best enumerations come from a structural fact: answers have a fixed shape, one variable determines the
          others, or a parameter can only be small.
        </p>
      </Box>

      <div className="prose">
        <h2>Read the limits first</h2>
        <p>
          The input limits tell you which enumeration is allowed. These rough rules (from <See id="complexity" />) assume about
          10⁸ simple operations per second.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Limit</th>
            <th>Enumeration you can afford</th>
            <th>Typical shape</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>n ≤ 10</td>
            <td>All permutations: n! ≈ 3.6 million</td>
            <td>Try every ordering</td>
          </tr>
          <tr>
            <td>n ≤ 20</td>
            <td>All subsets: 2ⁿ ≈ 1 million</td>
            <td>Bitmask from 0 to 2ⁿ − 1</td>
          </tr>
          <tr>
            <td>n ≤ 100 to 500</td>
            <td>Three nested loops: n³</td>
            <td>All triples</td>
          </tr>
          <tr>
            <td>n ≤ 5,000</td>
            <td>Two nested loops: n²</td>
            <td>All pairs</td>
          </tr>
          <tr>
            <td>n ≤ 10⁵ to 10⁶</td>
            <td>One loop, maybe with log n inside</td>
            <td>Fix one element, look the rest up</td>
          </tr>
          <tr>
            <td>n ≤ 10⁹ or more</td>
            <td>Loop up to √n or log n, or a formula</td>
            <td>Enumerate a small parameter</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Nested loops', ts: 'for loops over index ranges', ops: 'n, n², n³ iterations', use: 'Small limits: pairs and triples, permutations of 4 digits.' },
          { name: 'Hash set or map', ts: 'Set<number>, Map<number, number>', ops: 'O(1) average lookups', use: 'Replacing an inner loop by a lookup once one element is fixed.' },
          { name: 'Bitmask', ts: 'a number from 0 to 2ⁿ − 1; bit i set means element i is chosen', ops: 'O(1) per bit test', use: 'Listing every subset of up to about 20 elements.' },
          { name: 'Counts', ts: 'array of 10 or 26 counters', ops: 'O(1)', use: 'Checking whether a generated candidate can be built from available pieces.' },
          { name: 'Memo table', ts: 'boolean or number array indexed by position', ops: 'O(1) per lookup', use: 'Remembering answers to repeated subproblems inside a search.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Enumerate the answers</h2>
        <p>
          When the valid answers have a rigid shape, there are often only a handful of them. Numbers with sequential digits: 36.
          Powers of two below 10⁹: 30. Even three-digit numbers: 450. Times made from 4 digits: 24 orderings. Generate those
          candidates and test each against the input, instead of searching the input for things with the shape. It is faster, and
          it usually removes duplicates and produces sorted output for free.
        </p>

        <h2>Pattern 2: Choose what to loop over</h2>
        <p>
          For triples and quadruplets, the naive enumeration nests one loop per element. But often fixing <b>one</b> element
          determines the others, or reduces them to a lookup. In an arithmetic triplet with difference d, fixing the middle value v
          forces the other two to be v − d and v + d. With a set, that is one loop instead of three.
        </p>
      </div>
      <Walkthrough title="Number of Arithmetic Triplets: fix the middle" frames={triplets.frames} caption={`Triplets with difference 3: ${triplets.count}.`} />
      <Recipe
        name="Fix the element that determines the rest"
        when="you count tuples with a relation between their elements, and the naive loops are one level too deep."
        steps={[
          'Write the relation down and ask: if I fix this element, what must the others be?',
          'Pick the element that pins down the most: often the middle one, or one side of an equation.',
          'Precompute a set or count map for the elements you will look up.',
          'Loop over the fixed element and replace the inner loops with lookups or counts.',
        ]}
        why="every tuple has exactly one value of the fixed element, so each tuple is still found exactly once."
        time="one loop level fewer, e.g. O(n³) → O(n²) or O(n)"
        space="O(n) for the lookup structure"
      />
      <div className="prose">
        <p>
          Moving a term across an equation is the same trick in disguise. a + b + c = d becomes a + b = d − c: now the left pair
          and the right pair can be counted separately and matched, which is the meet-in-the-middle idea from{' '}
          <See id="hash-table" />. Grouping can also shrink the loop: in Naming a Company, looping over pairs of <i>first letters</i>{' '}
          (26 × 26) replaces looping over pairs of names (n²).
        </p>

        <h2>Pattern 3: Enumerate subsets</h2>
        <p>
          A set of n elements has 2ⁿ subsets, and each one can be written as an n-bit number: bit i is 1 exactly when element i is in
          the subset. So the integers from 0 to 2ⁿ − 1 list every subset, with no recursion. For n ≤ 20 that is about a million
          subsets, which is fine. You will use this constantly in <See id="bitmask" />, and the recursive alternative is{' '}
          <See id="backtracking" />.
        </p>
      </div>
      <Recipe
        name="Every subset as a bitmask"
        when="n is at most about 20 and the answer depends on which elements are chosen."
        steps={[
          'Loop mask from 0 to 2ⁿ − 1.',
          'For each mask, look at each bit i: if it is set, element i is in the subset.',
          'Compute what you need for this subset (sum, XOR, OR, validity) and update the answer.',
        ]}
        why="the numbers 0 to 2ⁿ − 1 are exactly the 2ⁿ different patterns of n bits, one per subset."
        time="O(2ⁿ · n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 4: Bound the loop with math</h2>
        <p>
          When n is as large as 10⁹, look for an unknown whose range is small. Divisors come in pairs d and n / d, so trying d up to
          √n finds them all. Powers of 2 or 3 below 10⁶ number about 20. And a sum of k consecutive numbers starting at x equals
          k·x + k(k − 1)/2, so choosing the <i>length</i> k forces the start x, and k cannot pass about √(2n).
        </p>
      </div>
      <Walkthrough title="Consecutive Numbers Sum for n = 15: loop over the length" frames={sums.frames} caption={`15 can be written in ${sums.ways} ways.`} />

      <div className="prose">
        <h2>Pattern 5: Search, then cut repeated work</h2>
        <p>
          Some problems are best understood as a search over choices: where to split a string into words, which windows to flip. Write
          the brute-force search first, then look for repeated work. If the search keeps solving the same subproblem (the same suffix
          of a string), remember each answer: that is memoisation, and it turns Word Break from exponential into <Cost>O(n²)</Cost>.
          If every step has only one sensible choice (the leftmost 0 must be flipped by the window that starts there), the search
          collapses to a single path, and the remaining work is making each step cheap. Both ideas grow into whole chapters:{' '}
          <See id="memoization" /> and <See id="greedy" />.
        </p>
        <p>
          LeetCode tags only two problems "Brute-Force Search", and both are here for that reason: they start as a search and end as
          something efficient once you see what the search repeats.
        </p>

        <h2>Worked example: Consecutive Numbers Sum</h2>
        <p>Count the ways to write n as a sum of consecutive positive integers, for n up to 10⁹.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          For every start x from 1 to n, keep adding x, x + 1, x + 2, ... until the sum reaches or passes n. That is up to{' '}
          <Cost>O(n²)</Cost> additions; even with a formula per start it is <Cost>O(n)</Cost> starts, 10⁹ of them.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Most starts fail. And the sum of a run is fully described by two numbers, its start x and its length k: k·x + k(k − 1)/2.
          If one of them is small, loop over that one.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Fix k. Then x = (n − k(k − 1)/2) / k, which must be a whole number and at least 1. As k grows, k(k − 1)/2 grows quadratically,
          and once it reaches n no positive start remains. So k ranges from 1 to about √(2n): about 45,000 values for n = 10⁹.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(√n)</Cost> time, <Cost>O(1)</Cost> space. k = 1 always works (n on its own). Use the remainder to test
          divisibility, not a floating-point division. For n = 15 the lengths 1, 2, 3 and 5 work: 15, 7 + 8, 4 + 5 + 6 and 1 + 2 + 3
          + 4 + 5.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Skipping the limits. The same problem can need brute force at n = 100 and a formula at n = 10⁹; the limits tell you which.</>,
          <>Enumerating inputs that produce duplicates (orderings of repeated digits) instead of enumerating the distinct answers.</>,
          <>Using greedy shortcuts in tiny search spaces. With 24 possible times, try them all; greedy digit choice fails on inputs like 2, 0, 6, 6.</>,
          <>Infinite loops on powers of 1. When the base is 1, its powers never grow; break after the first.</>,
          <>Floating-point tests for "is a perfect square" or "is divisible": round, then verify with integer arithmetic.</>,
          <>Writing a recursive search without asking how many distinct subproblems it visits.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'List all sequential-digit numbers between 100 and 300.',
            solution: '123 and 234. (345 is already above 300.)',
          },
          {
            task: 'How many subsets does a set of 15 elements have? Is enumerating them all, with 15 steps of work per subset, fast enough?',
            solution: '2¹⁵ = 32,768 subsets, about 500,000 steps in total. Easily fast enough.',
          },
          {
            task: 'Using the length method, in how many ways can 9 be written as a sum of consecutive positive integers?',
            solution: 'k = 1: 9. k = 2: (9 − 1) / 2 = 4, so 4 + 5. k = 3: (9 − 3) / 3 = 2, so 2 + 3 + 4. k = 4: (9 − 6) / 4 is not whole. k = 5: 10 ≥ 9, stop. Three ways.',
          },
          {
            task: 'Count quadruplets a < b < c < d with nums[a] + nums[b] + nums[c] = nums[d] for nums = [1, 1, 1, 3, 5] by brute force.',
            solution: '1 + 1 + 1 = 3 (indices 0, 1, 2, 3) and three ways to make 1 + 1 + 3 = 5 (choosing two of the three 1s with the 3). Total 4.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'The input has n ≤ 18 elements and asks about the best subset. What is the natural first approach?',
            options: ['Sort and use two pointers', 'Enumerate all 2ⁿ subsets with bitmasks', 'Dynamic programming over values', 'Binary search on the answer'],
            answer: 1,
            why: '2¹⁸ ≈ 262,000 subsets, each checked in O(n), is about 5 million steps: well within limits.',
          },
          {
            q: 'To count arithmetic triplets in a strictly increasing array, which element should you fix?',
            options: ['The first', 'The middle', 'The last', 'It does not matter, all are O(n³)'],
            answer: 1,
            why: 'With the middle value v fixed, the other two must be v − d and v + d, so two set lookups finish the job. (Fixing the first works too, but the middle is the most symmetric.)',
          },
          {
            q: 'Why does Sequential Digits not need to scan the range [low, high]?',
            options: [
              'Because the range is small',
              'Because every answer is a slice of "123456789", so only 36 candidates exist',
              'Because binary search finds them',
              'Because the answers are all multiples of 11',
            ],
            answer: 1,
            why: 'Answers have a rigid shape. Enumerating that shape is far smaller than enumerating the range.',
          },
          {
            q: 'In Word Break, what makes the plain recursive search slow, and what fixes it?',
            options: [
              'Too many dictionary words; use a trie',
              'It solves the same suffix many times; remember each suffix\'s answer',
              'String comparisons; use hashing',
              'Recursion depth; use a stack',
            ],
            answer: 1,
            why: 'There are only n + 1 suffixes, but the search may reach each one exponentially many times. Memoising them gives O(n²) work.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, first estimate the size of the naive enumeration from the limits. Then ask what smaller set of candidates
          still contains every answer. Writing those two numbers down is most of the solution.
        </p>
      </div>
      <ProblemSet id="enumeration" />

      <Recap>
        <ul>
          <li>Enumeration is the first step of every solution. Read the limits to see how much of it you can afford.</li>
          <li>Enumerate the answers when they have a rigid shape; there are often only dozens.</li>
          <li>Fix the element that determines the others, and replace inner loops with set lookups or counts.</li>
          <li>Subsets of up to about 20 elements are bitmasks from 0 to 2ⁿ − 1.</li>
          <li>For huge n, loop over the parameter with a small range (√n, log n) and solve for the other.</li>
          <li>When a search repeats subproblems, memoise; when its choice is forced, make each step O(1).</li>
        </ul>
      </Recap>
    </>
  );
}
