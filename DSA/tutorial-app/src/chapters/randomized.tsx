import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/randomized';
import { fisherYates, shuffleCounts } from '../traces/randomized';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const shuffle = fisherYates(['A', 'B', 'C', 'D', 'E'], [1, 0, 2, 0]);
const bias = shuffleCounts(3);

export default function Randomized() {
  return (
    <>
      <TopicIntro
        id="randomized"
        time="3–4 hours, plus problems"
        before={['array', 'hash-table', 'prefix-sum', 'binary-search', 'quickselect']}
        learn={[
          'How to turn Math.random into a fair random integer, and how LeetCode checks random answers',
          'The Fisher–Yates shuffle, and why the obvious shuffle is biased',
          'Weighted random picks with prefix sums and binary search',
          'O(1) random sets: an array plus a map from value to index',
          'Drawing from "what is left" with remapping and virtual shuffles, and why random pivots make algorithms fast',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Randomness shows up in two ways. Sometimes the problem asks for it: shuffle fairly, pick an index with the right
          probability, return a random element of a set in O(1). Sometimes randomness is a tool: a quickselect with a random
          pivot is fast on every input on average, because no input order can be bad for a pivot chosen after the input is
          known.
        </p>
        <p>
          The building block is a uniform random integer. Math.random() returns a number in [0, 1), so{' '}
          <b>Math.floor(Math.random() × k)</b> is an integer from 0 to k − 1, each with probability 1/k. Everything in this
          chapter is about combining such picks so that the final result has exactly the probabilities you want. "Roughly
          random" is not enough: LeetCode runs your code thousands of times and checks the frequencies.
        </p>
      </div>

      <Walkthrough
        title="Fisher–Yates shuffle of five letters"
        frames={shuffle.frames}
        caption={`With the random picks 1, 0, 2, 0 the result is ${shuffle.result.join(', ')}. Each position is filled by a uniform choice among the values not yet placed.`}
      />

      <div className="prose">
        <p>
          Why not the shorter loop "for every position i, swap it with a random position in 0…n − 1"? It makes n choices of n
          options each: nⁿ equally likely runs. For n = 3 that is 27 runs, which cannot split evenly among 3! = 6 orders. Count
          them exactly:
        </p>
      </div>
      <VizFigure
        parts={bias.parts}
        caption={`Naive shuffle of 1, 2, 3: three orders appear in 5 of the 27 runs and three in only 4, so some orders are 25% more likely. Fisher–Yates makes 3 × 2 = 6 runs, one per order.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A random procedure is fair when its equally likely runs split evenly among the outcomes. Count the runs: Fisher–Yates
          has n! runs for n! orders; the naive shuffle has nⁿ, which is not a multiple of n! for n ≥ 3. When the counts cannot
          divide, the procedure is biased, no matter how random it looks.
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
          { name: 'Array', ts: 'number[]', ops: 'random index O(1); pop O(1)', use: 'The only structure that gives a uniform random element in O(1).' },
          { name: 'Hash map value → index', ts: 'Map<number, number>', ops: 'O(1) average', use: 'Finding where a value sits in the array so it can be deleted by a swap with the last element.' },
          { name: 'Hash map value → set of indices', ts: 'Map<number, Set<number>>', ops: 'O(1) average', use: 'The same idea when duplicates are allowed.' },
          { name: 'Prefix sums', ts: 'number[]', ops: 'build O(n); binary search O(log n)', use: 'Weighted picks: each index owns a stretch of [0, total).' },
          { name: 'Sparse "virtual array"', ts: 'Map<number, number>', ops: 'O(1) average', use: 'A Fisher–Yates shuffle over 10⁸ cells where only the swapped positions are stored.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Shuffling</h2>
      </div>
      <Recipe
        name="Fisher–Yates shuffle"
        when="you need a uniformly random ordering of an array, or the first k items of one."
        steps={[
          'Copy the array if the original must be kept.',
          'For i from n − 1 down to 1: pick j uniformly from 0…i (inclusive), and swap positions i and j.',
          'Position i is now final; the positions before it are still undecided.',
          'For a random sample of k items, stop after k steps: the last k positions hold a uniform sample in random order.',
        ]}
        why="position i gets each of the i + 1 undecided values with probability 1/(i + 1), so every order has probability 1/n!."
        time="O(n), or O(k) for a sample"
        space="O(1) beyond the array"
      />

      <div className="prose">
        <h2>Pattern 2: Weighted picks</h2>
        <p>
          To pick index i with probability w[i] / total, lay the weights end to end on a line from 0 to total. Index i owns a
          stretch of length w[i]. A uniform random point on the line lands in that stretch with exactly the right probability,
          and binary search over prefix sums finds the stretch in <Cost>O(log n)</Cost>. For millions of picks from fixed
          weights, the alias method gets each pick down to O(1), but prefix sums are what interviews expect.
        </p>
      </div>
      <Recipe
        name="Weighted random pick"
        when="each index must be chosen with probability proportional to a weight."
        steps={[
          'Build prefix sums: prefix[i] = w[0] + … + w[i]. The total is the last prefix sum.',
          'Draw x uniformly from [0, total) (an integer from 0 to total − 1 works for integer weights).',
          'Binary search for the smallest i with prefix[i] > x.',
          'Return i.',
        ]}
        why="the x values that select i are exactly those in [prefix[i − 1], prefix[i]), and there are w[i] of them."
        time="O(n) to build, O(log n) per pick"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Random access sets</h2>
        <p>
          A hash set gives O(1) insert and delete but cannot hand you a random element in O(1). An array can, but deleting from
          its middle costs O(n). Use both: the array holds the values, and a map remembers each value's index. To delete, move
          the last value into the hole, update its index in the map, and pop the end. Order does not matter in a set, so this is
          allowed.
        </p>

        <h2>Pattern 4: Picking from what is left</h2>
        <p>
          When some values are forbidden (a blacklist) or used up (cells already flipped), retrying until you hit a valid value
          gets slow as the valid set shrinks. Instead, draw from a range of exactly the right size and redirect the forbidden
          values. In Random Pick with Blacklist, draw from [0, m) where m is the number of allowed values, and map each
          blacklisted value below m to an allowed value at m or above. In Random Flip Matrix, run Fisher–Yates on the cell
          numbers but keep only the swapped entries in a map, so 10⁸ cells cost memory only for the cells actually picked.
        </p>
      </div>
      <Recipe
        name="Virtual Fisher–Yates (draw without repeats)"
        when="you must draw values from a huge range, each at most once, without storing the whole range."
        steps={[
          'remaining = size of the range; map = empty (an absent key k means "position k holds k").',
          'To draw: r = random integer in [0, remaining). The drawn value is map[r] if present, otherwise r.',
          'Decrease remaining. Move the value at the last position into slot r: map[r] = map[remaining] if present, otherwise remaining.',
          'Return the drawn value. To reset, clear the map and restore remaining.',
        ]}
        why="it is exactly a Fisher–Yates step on an array that is never built; only positions that differ from the identity are stored."
        time="O(1) per draw"
        space="O(draws)"
      />

      <div className="prose">
        <h2>Pattern 5: Randomised algorithms</h2>
        <p>
          Quickselect and quicksort are <Cost>O(n²)</Cost> in the worst case, when every pivot is the smallest or largest
          element. With a fixed rule ("the first element"), a sorted input triggers that every time. With a random pivot, no
          input is bad: the expected time is <Cost>O(n)</Cost> for quickselect (see <See id="quickselect" />) and{' '}
          <Cost>O(n log n)</Cost> for quicksort. Algorithms like this are always correct and only their running time is random
          (Las Vegas algorithms). Treaps (see <See id="ordered-set" />) and random hash seeds use the same idea.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Task</th>
            <th>Technique</th>
            <th>Cost per call</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Uniform random order</td><td>Fisher–Yates</td><td>O(n)</td></tr>
          <tr><td>Index with probability ∝ weight</td><td>Prefix sums + binary search</td><td>O(log n)</td></tr>
          <tr><td>Random element of a changing set</td><td>Array + value → index map</td><td>O(1)</td></tr>
          <tr><td>Uniform value avoiding a blacklist</td><td>Remap blacklisted values below m</td><td>O(1)</td></tr>
          <tr><td>Distinct random cells of a huge grid</td><td>Virtual Fisher–Yates</td><td>O(1)</td></tr>
          <tr><td>Uniform item from a stream of unknown length</td><td>Reservoir sampling (<See id="reservoir-sampling" />)</td><td>O(1) per item</td></tr>
          <tr><td>Uniform value from a generator of the wrong size</td><td>Rejection sampling (<See id="rejection-sampling" />)</td><td>O(1) expected</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Worked example: Insert Delete GetRandom O(1)</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          A Set handles insert and remove in O(1), but getRandom would have to walk to a random position: O(n). An array gives a
          random element in O(1), but remove has to find the value (O(n)) and close the gap (O(n)).
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Finding the value is a lookup, which a map from value to index does in O(1). Closing the gap is only needed because we
          keep order, and a set has no order.
        </p>
        <Step n={3}>The rule</Step>
        <p>
          To remove v at index i: take the last value u, put it at index i, set map[u] = i, pop the array, and delete v from the
          map. getRandom picks a random index of the array.
        </p>
        <Step n={4}>Cost and edge cases</Step>
        <p>
          Every operation is <Cost>O(1)</Cost> on average. Removing the last element itself: u is v, so make sure you do not
          re-add v to the map after deleting it (update the map before deleting, or check the case).
        </p>
      </div>

      <Box kind="tip" label="Testing random code">
        <p>
          You cannot compare random outputs with expected ones. Instead, run your function many times (say 100,000) and count how
          often each outcome appears; each count should be close to runs × probability. For an exact check of a small case,
          replace the random source with a counter that enumerates every possible sequence of picks, as the bias figure above
          does.
        </p>
      </Box>

      <Pitfalls
        items={[
          <>The naive shuffle (swap each position with any position) and sorting with a random comparator are both biased.</>,
          <>Off-by-one in Fisher–Yates: j must range over 0…i inclusive. Using 0…i − 1 (Sattolo's algorithm) produces only cyclic orders.</>,
          <>Picking a rectangle uniformly instead of by its number of points makes points in small rectangles too likely.</>,
          <>Retrying random draws while a blacklist or used set grows: correct, but the number of calls blows up.</>,
          <>Updating the moved element's index after deleting the removed value, which breaks when they are the same element.</>,
          <>Using a fixed pivot in quickselect on inputs that may be sorted.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Weights [2, 5, 3]. What are the prefix sums, and which index does x = 6 (drawn from 0…9) select?',
            solution: 'Prefix sums 2, 7, 10. The smallest prefix greater than 6 is 7, so index 1.',
          },
          {
            task: 'Run Fisher–Yates on [1, 2, 3, 4] with picks j = 0 (for i = 3), j = 2 (for i = 2), j = 0 (for i = 1). What is the result?',
            solution: 'i = 3, j = 0: [4, 2, 3, 1]. i = 2, j = 2: unchanged. i = 1, j = 0: [2, 4, 3, 1].',
          },
          {
            task: 'n = 10 with blacklist {1, 8, 3}. What is m, and how are blacklisted values below m remapped?',
            solution: 'm = 7. Allowed values at 7 or above: 7 and 9 (8 is blacklisted). Remap 1 → 9 and 3 → 7 (any one-to-one assignment works).',
          },
          {
            task: 'Why is "for each i swap with a random j in 0…n − 1" biased for n = 3 but not obviously for n = 2?',
            solution: 'n = 2 gives 4 runs for 2 orders, which divide evenly (and the result is fair). n = 3 gives 27 runs for 6 orders, and 27 is not a multiple of 6.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In Fisher–Yates, position i is swapped with a random j drawn from…',
            options: ['0…n − 1', '0…i, including i', '0…i − 1', 'Always 0'],
            answer: 1,
            why: "j ranges over every undecided position, including i itself. Excluding i (Sattolo's algorithm) produces only cyclic orders, and 0…n − 1 is the biased naive shuffle.",
          },
          {
            q: 'Which structure pair gives insert, remove and getRandom in O(1) average?',
            options: ['A hash set alone', 'A sorted array', 'An array plus a map from value to index', 'A linked list plus a hash set'],
            answer: 2,
            why: 'The array gives random access, the map finds positions, and swap-with-last makes removal O(1).',
          },
          {
            q: 'Weights are [1, 3]. How often should a correct pickIndex return 1 over 10,000 calls?',
            options: ['About 5,000', 'About 7,500', 'About 3,000', 'Exactly 7,500'],
            answer: 1,
            why: 'Probability 3/4, so about 7,500, with random variation.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          These are design problems: you implement a class with a constructor and methods. Focus on the probability argument
          for each method first; the code is short once that is right.
        </p>
      </div>
      <ProblemSet id="randomized" />

      <Recap>
        <ul>
          <li>Fair means equally likely runs split evenly among outcomes; count them to spot bias.</li>
          <li>Fisher–Yates: fill positions from the back with uniform picks from what is undecided.</li>
          <li>Weighted picks: prefix sums plus binary search on a uniform point.</li>
          <li>O(1) random sets: array plus value → index map, delete by swapping with the last element.</li>
          <li>Draw from what is left by remapping or by a virtual shuffle; random pivots make quickselect fast on every input.</li>
        </ul>
      </Recap>
    </>
  );
}
