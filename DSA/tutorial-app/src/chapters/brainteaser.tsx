import {
  Box, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/brainteaser';
import { bulbs } from '../traces/brainteaser';
import { Walkthrough } from '../viz/Walkthrough';

const run = bulbs(12);

export default function Brainteaser() {
  return (
    <>
      <TopicIntro
        id="brainteaser"
        time="2–3 hours, plus problems"
        before={['math', 'bit-manipulation', 'game-theory']}
        learn={[
          'A method for problems whose answer is a short formula: simulate small cases, spot the pattern, then prove it',
          'Five proof tools that explain most brainteasers: pairing, invariants, parity, erasing identities and extreme cases',
          'Bitwise facts that collapse problems: AND only loses bits, OR only gains them, XOR cancels in pairs',
          'How to recognise a brainteaser from its constraints, and when not to trust a pattern',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Some problems look like they need a long simulation or a game-tree search, but the constraints give them away: n up to
          10⁹, or a game with thousands of moves. The real answer is a one-line formula, and the work is in finding it and
          convincing yourself it is right.
        </p>
        <p>
          You do not find such formulas by staring. You find them like a scientist: run the process on small inputs (by hand or
          with a throwaway simulation), write the results in a table, look for the pattern, and then explain why it holds. The
          explanation matters: patterns that hold for n = 1 to 10 sometimes break at 11, and an interviewer will ask "why?".
        </p>
      </div>

      <Walkthrough
        title="Bulb Switcher: simulate 12 bulbs and look"
        frames={run.frames}
        caption={`After 12 rounds the bulbs left on are ${run.on.join(', ')}: the perfect squares. So for any n the answer is ⌊√n⌋.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Simulate small cases, tabulate, conjecture, prove. The proof is usually one of a few standard arguments: things that
          come in <b>pairs</b>, a quantity that never changes (an <b>invariant</b>), <b>parity</b>, ignoring which identical
          object is which, or looking at the <b>extreme</b> case.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Brainteasers rarely need structures in the final answer; they need them while you explore.</p>
      </div>
      <Structures
        items={[
          { name: 'Scratch simulation', ts: 'a few arrays in a throwaway file', ops: 'whatever is simplest', use: 'Generating the table of small cases. Speed does not matter here; correctness does.' },
          { name: 'Hash set', ts: 'Set<number>', ops: 'O(1) average', use: 'Checking which powers of two are present (Minimum Impossible OR).' },
          { name: 'Sorted array + prefix sum', ts: 'number[]', ops: 'O(n log n) sort', use: 'Sums of pairwise distances once identities are ignored.' },
          { name: 'BigInt', ts: 'bigint', ops: 'exact', use: 'Values beyond 2⁵³, and bit counting beyond 32 bits (JavaScript bitwise operators are 32-bit).' },
        ]}
      />

      <div className="prose">
        <h2>The method</h2>
      </div>
      <Recipe
        name="Find the pattern, then prove it"
        when="the input is too large to simulate, or the answer seems to depend on very little."
        steps={[
          'Write the slowest correct solution you can think of, for tiny inputs only (by hand, or a scratch simulation).',
          'Print the answers for n = 1, 2, …, 20 (or for many small random inputs) in a table.',
          'Look for structure: constant answers, periodic answers (mod 2, mod 4), squares, powers of two, parity of counts.',
          'Conjecture a formula, then test it against the brute force on more cases, including edge cases.',
          'Prove it with one of the tools below. If you cannot, keep looking: the pattern may break.',
        ]}
        why="small cases are cheap to compute exactly, and the proof turns an observation into a guarantee."
        time="O(1) to O(n) for the final formula"
        space="O(1)"
      />

      <div className="prose">
        <h2>Five proof tools</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Tool</th>
            <th>The argument</th>
            <th>Example</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Pairing</td><td>Things come in pairs that cancel, except an unpaired one</td><td>Divisors pair up as (d, n / d), except √n for squares: Bulb Switcher</td></tr>
          <tr><td>Invariant</td><td>Some quantity never changes, so the end state must match the start</td><td>The set of positions of colliding robots never depends on who bounced</td></tr>
          <tr><td>Parity</td><td>Each move flips something between odd and even</td><td>Chalkboard XOR: with an even count, a safe move always exists</td></tr>
          <tr><td>Erasing identities</td><td>Swapping two identical objects changes nothing you are asked about</td><td>Bouncing ants are the same as ants walking through each other</td></tr>
          <tr><td>Extreme case</td><td>Look at the largest, smallest or last element, or the largest base</td><td>Strictly Palindromic Number fails in base n − 2, where n is written "12"</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 1: Count what really changes</h2>
        <p>
          Instead of simulating the process, ask how many times each item is affected. In Bulb Switcher, bulb k is toggled once
          per divisor of k; that turns the problem into number theory (see <See id="number-theory" />). In Moving Stones, each
          move can fill exactly one empty slot between the outer stones, which gives the maximum directly.
        </p>

        <h2>Pattern 2: Ignore identities</h2>
        <p>
          When identical objects bounce off each other, swap their labels at every collision. Now nobody bounced: everyone walked
          straight on. If the question is about positions, times or distances, and not about which object is which, the answer
          is the same as in the pass-through world, which is trivial to compute.
        </p>
      </div>
      <Recipe
        name="Pass-through trick"
        when="identical objects move at equal speeds and reverse when they meet, and the question does not care which object is which."
        steps={[
          'Pretend the objects pass through each other instead of bouncing.',
          'Compute each object\'s position or exit time as if it were alone.',
          'Answer the question from that set of positions or times (a maximum, a sorted list, a sum of distances).',
          'Only if the question asks about a specific object, use the extra fact that objects never overtake each other, so their order along the line is preserved.',
        ]}
        why="a bounce is indistinguishable from a pass-through with the two labels swapped."
        time="O(n), or O(n log n) with sorting"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Bitwise insights</h2>
        <ul>
          <li><b>AND only removes bits.</b> Adding numbers to an AND can only make it smaller, so the best AND of any subarray is the largest single element.</li>
          <li><b>OR only adds bits.</b> A power of two can only appear as an OR if that exact power is in the input; the smallest missing power of two is the smallest impossible OR.</li>
          <li><b>XOR cancels in pairs.</b> An element used an even number of times vanishes from a total XOR, so count uses modulo 2.</li>
        </ul>
        <p>More on these operators in <See id="bit-manipulation" />.</p>

        <h2>Pattern 4: Games that end at once</h2>
        <p>
          Some "both play optimally" games need no search. In the vowels game, Alice can always either take everything or leave
          exactly one vowel, so she wins whenever a vowel exists. Always check what happens if a player makes the most extreme
          move first. The general theory is in <See id="game-theory" />.
        </p>

        <h2>Pattern 5: Impossible or forced answers</h2>
        <p>
          Occasionally the answer never changes. Strictly Palindromic Number is always false, and the airplane-seat probability
          is always 1/2 for n ≥ 2 (see <See id="probability" />). If every small case gives the same answer, look for the one
          argument that forces it, often by examining an extreme choice (the largest base, the first or last passenger).
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Last Moment Before All Ants Fall Out of a Plank</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Simulate every ant in half-unit time steps, reversing ants that meet. It works, but collisions make it fiddly, and with
          10⁴ ants there are many of them.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The question is only "when does the last ant fall?". It never asks which ant. Two ants meeting and turning around look
          exactly like two ants walking through each other with their names swapped.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          Treat every ant as if alone: a left-moving ant at position p falls after p seconds, a right-moving ant after n − p. The
          answer is the largest of these times.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          One pass, O(n). Either list may be empty. An ant at the very end facing outwards falls at time 0, which the formula
          already gives.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Trusting a pattern after three cases. Check at least 10–20, including edge cases like n = 0 and n = 1.</>,
          <>Skipping the proof. In an interview, "it matched my examples" is not an explanation.</>,
          <>Using JavaScript bitwise operators on values above 2³¹: they silently truncate to 32 bits.</>,
          <>Forgetting that the pass-through trick only answers questions that ignore identities.</>,
          <>Writing a huge search for a game that is decided by its first move.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Bulb Switcher with n = 30: how many bulbs are on, and which?',
            solution: '⌊√30⌋ = 5: bulbs 1, 4, 9, 16 and 25.',
          },
          {
            task: 'Ants on a plank of length 10: left-movers at 2 and 7, right-movers at 3 and 9. When does the last ant fall?',
            solution: 'Times: 2, 7 (left) and 7, 1 (right). The last ant falls at 7.',
          },
          {
            task: 'nums1 has 3 elements and nums2 has 4. In the XOR of all pairings, which array\'s elements survive?',
            solution: 'Elements of nums1 appear 4 times each (even, they cancel); elements of nums2 appear 3 times each (odd, they survive). The answer is the XOR of nums2.',
          },
          {
            task: 'Why is the maximum AND of any subarray of [6, 3, 6, 6, 2] equal to 6, and what is the longest subarray achieving it?',
            solution: 'AND cannot exceed any element it includes, so the best is the maximum element 6, reached only by runs of 6s. The longest run is [6, 6], length 2.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Bulb k ends up on in Bulb Switcher exactly when…',
            options: ['k is prime', 'k is a perfect square', 'k is even', 'k is a power of two'],
            answer: 1,
            why: 'k is toggled once per divisor; only squares have an odd number of divisors.',
          },
          {
            q: 'Identical robots bounce when they collide. Which question can the pass-through trick NOT answer directly?',
            options: [
              'When does the last robot leave the track?',
              'What is the sum of pairwise distances after d seconds?',
              'Where is the robot that started at position 5?',
              'What is the set of occupied positions after d seconds?',
            ],
            answer: 2,
            why: 'Tracking a specific robot needs the extra fact that robots keep their order; the other questions ignore identities.',
          },
          {
            q: 'Which statement is true for any non-empty subarray?',
            options: [
              'Its AND is at least its largest element',
              'Its AND is at most its smallest element',
              'Its OR is at most its largest element',
              'Its XOR is at least its largest element',
            ],
            answer: 1,
            why: 'AND can only clear bits, so it is at most every element, in particular the smallest.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, write a tiny brute force on paper or in a scratch file first, tabulate small cases, and only then
          read the hints. The habit is the skill.
        </p>
      </div>
      <ProblemSet id="brainteaser" />

      <Recap>
        <ul>
          <li>Huge limits plus a simple process usually mean a formula. Find it by simulating small cases.</li>
          <li>Prove the pattern with pairing, invariants, parity, erasing identities, or an extreme case.</li>
          <li>AND only loses bits, OR only gains them, XOR cancels in pairs.</li>
          <li>Check whether a game is decided by its first move before searching it.</li>
        </ul>
      </Recap>
    </>
  );
}
