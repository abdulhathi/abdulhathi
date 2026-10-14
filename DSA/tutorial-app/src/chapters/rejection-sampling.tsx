import {
  Box, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/rejection-sampling';
import { rand10Walkthrough } from '../traces/rejection-sampling';
import { Walkthrough } from '../viz/Walkthrough';

const run = rand10Walkthrough([7, 3, 2, 5, 6, 6, 1, 1]);

export default function RejectionSampling() {
  return (
    <>
      <TopicIntro
        id="rejection-sampling"
        time="1–2 hours, plus problems"
        before={['randomized', 'probability']}
        learn={[
          'How to build a uniform generator of one size from a generator of another size',
          'Why throwing results away keeps the rest perfectly uniform',
          'The expected number of attempts, 1 / (acceptance probability), and how to waste less',
          'Uniform points in a shape by sampling its bounding box',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          You have a fair seven-sided die and need a fair ten-sided one. No single roll can do it: 7 outcomes cannot split
          evenly into 10. Two rolls give 49 equally likely pairs, still not a multiple of 10, but 40 of them are. So use those
          40 pairs (four for each result) and, if one of the other 9 comes up, simply roll again. Because you retry on exactly
          the same 9 pairs every time, the accepted pairs stay equally likely, and so do the ten results.
        </p>
        <p>
          That is <b>rejection sampling</b>: generate from something easy that contains what you want, and throw away anything
          outside it. The price is the occasional retry.
        </p>
      </div>

      <Walkthrough
        title="rand10 from rand7: accept 40 of the 49 cells"
        frames={run.frames}
        caption={`With these rolls the function returned ${run.results.join(' and then ')} after ${run.calls} calls to rand7. Two rejections made this run unlucky; on average a result costs 2.45 calls.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          If every outcome of the easy generator is equally likely, then conditioned on landing in the accepted set, every
          accepted outcome is still equally likely. Map the accepted set onto your targets so that each target gets the same
          number of outcomes, and the result is exactly uniform. On average you need 1 / p attempts, where p is the fraction
          accepted.
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
          { name: 'Integer arithmetic', ts: 'number', ops: 'O(1)', use: 'Combining rolls: (a − 1) × 7 + b turns two rand7 results into one number from 1 to 49.' },
          { name: 'Floating point', ts: 'number from Math.random()', ops: 'O(1)', use: 'Points in a box, checked with x² + y² ≤ r².' },
          { name: 'Loop with an exit', ts: 'a repeat-until-accepted loop', ops: 'expected O(1 / p) rounds', use: 'Every rejection sampler: draw, test, return or retry.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Building a bigger generator</h2>
      </div>
      <Recipe
        name="randN from randM by rejection"
        when="you have a uniform generator of size M and need one of size N."
        steps={[
          'Combine k calls into one number in base M: value = (r₁ − 1) × M^(k−1) + … + (r_k − 1), uniform on 0 … M^k − 1. Choose the smallest k with M^k ≥ N.',
          'Let L be the largest multiple of N that is at most M^k.',
          'If value < L, return value mod N (plus 1 for a 1-based range).',
          'Otherwise reject: draw again.',
        ]}
        why="every value below L is equally likely, and each result r is hit by exactly L / N of them."
        time="O(k / p) expected calls, where p = L / M^k"
        space="O(1)"
      />
      <div className="prose">
        <p>
          You can waste less by reusing the rejected randomness. In rand10 from rand7, a rejected index from 41 to 49 is itself
          uniform on 9 values; combine it with one more rand7 to get 63 values, accept 60 of them, and so on. This lowers the
          expected number of calls below 2.45, which answers the problem's follow-up.
        </p>

        <h2>Pattern 2: Sampling a shape</h2>
        <p>
          To pick a uniform point inside a circle, pick a uniform point in the surrounding square and reject it if it falls
          outside the circle. The accepted points are uniform inside the circle, and π/4 ≈ 78.5% of attempts succeed, so you need
          about 1.27 attempts per point. The tempting alternative, a random angle and a uniformly random distance from the
          centre, is wrong: half the points land within half the radius, which is only a quarter of the area. The correct polar
          method uses distance r × √(uniform). Rejection works for any shape you can test membership in (see{' '}
          <See id="geometry" />), but in many dimensions the acceptance rate collapses, because a ball fills a tiny part of its
          bounding cube.
        </p>
      </div>
      <Recipe
        name="Uniform point in a shape"
        when="you need a uniform random point in a region that is easy to test but hard to sample directly."
        steps={[
          'Find a bounding box that contains the region.',
          'Draw a uniform point in the box (each coordinate independently uniform over its range).',
          'If the point is inside the region, return it; otherwise draw again.',
        ]}
        why="inside the region every point of the box was equally likely, and rejection removes only points outside it."
        time="O(1 / p) expected, p = region area / box area"
        space="O(1)"
      />

      <TableWrap>
        <thead>
          <tr>
            <th>Sampler</th>
            <th>Acceptance probability p</th>
            <th>Expected attempts 1 / p</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>rand10 from two rand7 calls</td><td>40 / 49</td><td>about 1.23 attempts, so 2.45 rand7 calls</td></tr>
          <tr><td>Point in a circle from its square</td><td>π / 4</td><td>about 1.27</td></tr>
          <tr><td>rand5 from rand7 (reject 6 and 7)</td><td>5 / 7</td><td>1.4</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Implement Rand10() Using Rand7()</h2>
        <Step n={1}>The wrong first ideas</Step>
        <p>
          rand7() + rand7() − 1 ranges from 1 to 13 but is not uniform: the middle value 7 can be made seven ways, the value 1 only one way. Taking rand7()
          mod something cannot give 10 values. Mapping all 49 pairs with mod 10 gives 1 to 9 five times each and 10 only four
          times.
        </p>
        <Step n={2}>Make a uniform bigger range</Step>
        <p>
          (a − 1) × 7 + b reads the two rolls as the digits of a two-digit number in base 7: every value from 1 to 49 has exactly
          one pair. That is uniform.
        </p>
        <Step n={3}>Cut it to a multiple of 10</Step>
        <p>
          Keep 1 to 40 and return (idx − 1) mod 10 + 1, so each result owns four cells. Reject 41 to 49 and roll again.
        </p>
        <Step n={4}>Cost</Step>
        <p>
          Each attempt costs two calls and succeeds with probability 40/49, so the expected number of calls is 2 × 49/40 = 2.45.
          The loop can in principle run long, but the chance of needing more than 10 attempts is (9/49)¹⁰, about 4 × 10⁻⁸.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Adding random results: sums are not uniform.</>,
          <>Using every outcome with mod: unless the range is a multiple of the target, some results get one extra outcome.</>,
          <>Sampling the angle and a uniform radius for a disc: points crowd the centre. Use rejection, or r × √(uniform).</>,
          <>Calling a forbidden built-in random function when the problem allows only the given generator.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Build rand6 from rand4. How many rand4 calls do you combine, which values do you accept, and what is the expected number of calls?',
            solution: 'Two calls give 16 values; accept 12 (the largest multiple of 6), mapping with mod 6. Expected calls = 2 × 16/12 ≈ 2.67.',
          },
          {
            task: 'What fraction of points drawn in the square [−1, 1] × [−1, 1] lands inside the unit circle? How many attempts per point on average?',
            solution: 'π/4 ≈ 0.785, so about 1/0.785 ≈ 1.27 attempts.',
          },
          {
            task: 'Why does the polar method need √(uniform) for the distance from the centre?',
            solution: 'The area within distance d grows like d², so the chance of landing within d must be (d / r)². Setting distance = r × √u, with u uniform, gives exactly that.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Two rand7 calls give idx = (a − 1) × 7 + b. Which values should rand10 accept?',
            options: ['1 to 49', '1 to 40', '1 to 10', '1 to 42'],
            answer: 1,
            why: '40 is the largest multiple of 10 not above 49, so each result gets exactly four cells.',
          },
          {
            q: 'An attempt succeeds with probability p. How many attempts are needed on average?',
            options: ['p', '1 / p', '1 − p', 'p²'],
            answer: 1,
            why: 'The number of attempts is geometric with mean 1 / p.',
          },
          {
            q: 'Why does rejecting points outside a circle keep the accepted points uniform?',
            options: [
              'Because the circle is symmetric',
              'Because every point in the square was equally likely, and rejection treats all inside points alike',
              'Because Math.random is uniform in [0, 1)',
              'It does not; it biases towards the centre',
            ],
            answer: 1,
            why: 'Conditioning a uniform distribution on a region gives a uniform distribution on that region.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          LeetCode has two problems with this tag. Both are classics; also see Random Pick with Blacklist in{' '}
          <See id="randomized" /> for a case where rejection would be too slow and remapping wins.
        </p>
      </div>
      <ProblemSet id="rejection-sampling" />

      <Recap>
        <ul>
          <li>Generate from an easy uniform space that contains the target, and retry on anything outside it.</li>
          <li>Accepted outcomes stay uniform; map them so every target gets the same number of outcomes.</li>
          <li>Expected attempts are 1 / p; reuse rejected randomness to waste fewer calls.</li>
          <li>Points in a shape: sample the bounding box and test membership; beware the naive polar method.</li>
        </ul>
      </Recap>
    </>
  );
}
