import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/binary-search';
import { exactSearch, lowerBound, minSpeed, rotatedSearch } from '../traces/binary-search';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const exact = exactSearch([2, 5, 8, 12, 16, 23, 38, 56, 72, 91], 23);
const bound = lowerBound([1, 3, 3, 3, 7, 9, 12, 15], 4);
const rotated = rotatedSearch([15, 18, 22, 27, 3, 6, 9, 11], 6);
const speed = minSpeed([9, 4, 13, 7], 6);

export default function BinarySearch() {
  return (
    <>
      <TopicIntro
        id="binary-search"
        time="6–8 hours, plus problems"
        before={['array', 'complexity', 'sorting']}
        learn={[
          'Why halving the search space gives O(log n), and how small log n really is',
          'One loop-invariant template that finds the first "yes" without off-by-one bugs',
          'Lower bound, upper bound, rotated arrays and peaks',
          'Binary search on the answer: the move behind "minimise the maximum" problems',
          'Searching unimodal curves (ternary search) and real-valued answers',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think of the guessing game: "I am thinking of a number between 1 and 100." If you guess 50 and hear "higher", you have
          ruled out half the numbers with one question. Guess 75, then 62, and so on. Seven questions always suffice, because
          2⁷ = 128 is more than 100.
        </p>
        <p>
          That is binary search. As long as one question about the middle tells you which half to keep, each step halves what is
          left. After k steps, n candidates shrink to n / 2ᵏ, so about <b>log₂ n</b> steps are needed. log₂ of a million is 20; log₂
          of a billion is 30. Compare that with a linear scan's million or billion steps: <Cost>O(log n)</Cost> versus{' '}
          <Cost>O(n)</Cost>.
        </p>
        <p>
          The famous case is a sorted array, but the real requirement is weaker and far more useful: you need a yes/no question
          whose answers go <b>"no, no, …, no, yes, yes, …, yes"</b> across the candidates. Then the boundary between the "no"s and
          the "yes"es can be found by halving. Once you see binary search this way, you will spot it in problems that never mention
          sorting.
        </p>
      </div>

      <Walkthrough
        title="Find 23 in a sorted array of 10 values"
        frames={exact.frames}
        caption={`Found in ${exact.steps} steps. A linear scan would have needed 6.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Binary search finds the boundary of a <b>monotonic yes/no question</b>: once the answer becomes "yes", it stays "yes". A
          sorted array is just one source of such questions ("is this value ≥ x?"). Feasibility questions ("can I finish at speed
          k?") are another.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Binary search needs random access and an order, nothing more.</p>
      </div>
      <Structures
        items={[
          { name: 'Sorted array', ts: 'number[], sorted with a numeric comparator', ops: 'index O(1); search O(log n)', use: 'The classic setting: exact values, bounds, insert positions.' },
          { name: 'Integer range', ts: 'two numbers, lo and hi', ops: 'O(1) memory', use: 'Binary search on the answer: speeds, capacities, days, distances.' },
          { name: 'Real-number range', ts: 'two floating-point numbers', ops: 'O(1) memory', use: 'Answers accepted within a precision such as 10⁻⁵.' },
          { name: 'Map of sorted lists', ts: 'Map<string, [number, string][]>', ops: 'append O(1); search O(log n)', use: 'Time-based lookups: each key\'s history is already in time order.' },
        ]}
      />
      <Box kind="tip" label="TypeScript tip">
        <p>
          Two traps before you sort. <b>arr.sort()</b> with no comparator sorts numbers as strings, so 10 comes before 9; always pass{' '}
          a comparator that subtracts. And there is no built-in lower bound for arrays, so you will write the search yourself: learn
          one template well (below) and reuse it.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 1: Exact match</h2>
        <p>
          Keep an inclusive range [lo, hi] where the target could be. Look at the middle: equal means found; too small means discard
          the left half including mid; too big means discard the right half including mid. Stop when the range is empty. This
          version is fine when you only need "is it there, and where?".
        </p>
      </div>
      <Recipe
        name="Exact match (inclusive range)"
        when="you need the index of a value in sorted data, or −1."
        steps={[
          'lo = 0, hi = n − 1.',
          'While lo ≤ hi: mid = lo + floor((hi − lo) / 2).',
          'If nums[mid] equals the target, return mid.',
          'If nums[mid] is smaller, set lo = mid + 1; otherwise set hi = mid − 1.',
          'If the loop ends, the target is not there: return −1.',
        ]}
        why="every value outside [lo, hi] has been proven not to be the target, and the range shrinks by at least one each step."
        time="O(log n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 2: First position that passes (the template to master)</h2>
        <p>
          Most binary search bugs come from mixing up ≤ and &lt;, or mid and mid ± 1. The cure is to always search for the{' '}
          <b>first "yes"</b> with a clear invariant, and to turn every question into that form:
        </p>
        <ul>
          <li>Everything left of <b>lo</b> is known to be "no".</li>
          <li>Everything from <b>hi</b> onwards is known to be "yes" (hi starts one past the end, where we pretend the answer is "yes").</li>
          <li>The loop runs while lo &lt; hi. At the end lo = hi, which is exactly the first "yes".</li>
        </ul>
      </div>
      <VizFigure
        parts={[
          { kind: 'array', label: 'nums', items: [1, 3, 3, 3, 7, 9, 12, 15] },
          { kind: 'array', label: 'is the value ≥ 4?', items: ['no', 'no', 'no', 'no', 'yes', 'yes', 'yes', 'yes'], indices: false, tones: { 0: 'bad', 1: 'bad', 2: 'bad', 3: 'bad', 4: 'match', 5: 'match', 6: 'match', 7: 'match' } },
        ]}
        caption="Any sorted array turns any threshold into a no…no yes…yes pattern. The lower bound of 4 is the first yes: index 4."
      />
      <Walkthrough
        title="The first index whose value is at least 4 (lower bound)"
        frames={bound.frames}
        caption={`Result: index ${bound.index}. Notice that a "yes" sets hi = mid (mid may be the answer), while a "no" sets lo = mid + 1.`}
      />
      <Recipe
        name="First yes (half-open range)"
        when="the answers to a yes/no question go no…no yes…yes over a range, and you want the first yes."
        steps={[
          'lo = the first candidate; hi = one past the last candidate (for an array of length n: lo = 0, hi = n).',
          'While lo < hi: mid = lo + floor((hi − lo) / 2).',
          'If the answer at mid is "yes", set hi = mid. Otherwise set lo = mid + 1.',
          'When the loop ends, lo = hi is the first "yes" (it equals the old hi if every answer was "no").',
        ]}
        why="the invariant (left of lo is no, from hi on is yes) holds after every step, and the gap hi − lo shrinks every time, so the loop ends exactly on the boundary."
        time="O(log n) questions"
        space="O(1)"
      />
      <div className="prose">
        <p>Almost everything else is this template with a different question:</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>You want</th>
            <th>Ask "yes" when…</th>
            <th>Answer</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Lower bound / insert position</td>
            <td>nums[i] ≥ x</td>
            <td>lo</td>
          </tr>
          <tr>
            <td>Upper bound (first value greater than x)</td>
            <td>nums[i] &gt; x</td>
            <td>lo</td>
          </tr>
          <tr>
            <td>Last position of x</td>
            <td>nums[i] &gt; x</td>
            <td>lo − 1 (check that it holds x)</td>
          </tr>
          <tr>
            <td>Last value ≤ x (floor)</td>
            <td>nums[i] &gt; x</td>
            <td>lo − 1, if lo &gt; 0</td>
          </tr>
          <tr>
            <td>Count of values in [a, b]</td>
            <td>two searches: ≥ a and &gt; b</td>
            <td>difference of the two</td>
          </tr>
          <tr>
            <td>First bad version, peak of a mountain</td>
            <td>isBad(i), or arr[i] &gt; arr[i + 1]</td>
            <td>lo</td>
          </tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="The last yes">
        <p>
          For "maximise the minimum" problems you want the <b>last</b> "yes" of a yes…yes no…no pattern. Either flip the question
          (find the first "no" and subtract 1), or search with lo = mid on "yes" and hi = mid − 1 on "no", using the upper middle{' '}
          <b>mid = lo + ceil((hi − lo) / 2)</b>. With the lower middle, lo = mid can repeat forever when hi = lo + 1.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 3: Rotated arrays and peaks</h2>
        <p>
          A sorted array rotated at an unknown point is two sorted runs. Split it at mid, and at least one half is still perfectly
          sorted (you can tell which by comparing nums[lo] with nums[mid]). For a sorted half, you can check in O(1) whether the
          target lies inside it. If it does, keep that half; if not, keep the other.
        </p>
      </div>
      <Walkthrough
        title="Find 6 in a rotated array"
        frames={rotated.frames}
        caption={`Found at index ${rotated.index}. Blue marks the half that is known to be sorted at each step.`}
      />
      <div className="prose">
        <p>
          Peaks follow the same spirit. In Find Peak Element, the array is not sorted at all, but the slope at mid tells you a side
          that must contain a peak: if the next value is bigger, walk uphill to the right; there must be a top before the edge,
          because the edges count as −∞. Binary search needs a <i>guarantee about one half</i>, not a fully sorted array.
        </p>
      </div>
      <Recipe
        name="Search a rotated sorted array"
        when="sorted data has been rotated, and values are distinct."
        steps={[
          'lo = 0, hi = n − 1. While lo ≤ hi, compute mid and return it if it holds the target.',
          'If nums[lo] ≤ nums[mid], the left half is sorted: if nums[lo] ≤ target < nums[mid], go left (hi = mid − 1), else go right (lo = mid + 1).',
          'Otherwise the right half is sorted: if nums[mid] < target ≤ nums[hi], go right, else go left.',
          'Return −1 if the range empties.',
        ]}
        why="a sorted half has a known minimum and maximum, so one comparison decides whether the target can be in it."
        time="O(log n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 4: Binary search on the answer</h2>
        <p>
          This is the pattern that separates good problem solvers from great ones. Some problems ask for the smallest (or largest)
          value of something: an eating speed, a ship capacity, a number of days, a minimum distance. Checking whether <i>one</i>{' '}
          candidate works is often easy, a greedy pass in <Cost>O(n)</Cost>. And feasibility is monotonic: if speed k is fast
          enough, so is every faster speed. So the candidates form no…no yes…yes, and you can binary search the answer itself.
        </p>
      </div>
      <Walkthrough
        title="Koko Eating Bananas: the slowest speed that finishes 4 piles in 6 hours"
        frames={speed.frames}
        caption={`Answer: speed ${speed.speed}. We never looked for anything in the piles array; we searched over speeds.`}
      />
      <Recipe
        name="Binary search on the answer"
        when={'the problem asks for the smallest or largest value that makes something possible, especially "minimise the maximum" or "maximise the minimum".'}
        steps={[
          'Find the range: the smallest answer that could possibly work and the largest you would ever need.',
          'Write feasible(candidate): usually a greedy left-to-right pass that counts days, parts, balls or hours.',
          'Check monotonicity: if a candidate works, do all larger (or smaller) ones work too?',
          'Run the first-yes template over the range with feasible as the question (or the last-yes variant for maximise problems).',
        ]}
        why="the feasibility answers switch from no to yes exactly once, so halving the range always keeps the boundary."
        time="O(cost of feasible × log(range))"
        space="O(1) besides the input"
      />

      <div className="prose">
        <h2>Pattern 5: Partition two sorted arrays</h2>
        <p>
          The median of two sorted arrays is the value where the combined data splits into two equal halves. Instead of merging,
          binary search a cut position i in the shorter array; the cut in the other array is then forced (j = half − i). The cut is
          right when the largest value left of both cuts is at most the smallest value right of both cuts. If the left side of the
          short array is too big, move its cut left; otherwise move it right. This is the hardest classic in the chapter, so try it
          after the others feel easy.
        </p>

        <h2>Pattern 6: Unimodal and real-valued searches</h2>
        <p>
          A curve that rises and then falls (unimodal) has one top. <b>Ternary search</b> probes two points m1 &lt; m2: if f(m1) is
          lower than f(m2), the top cannot be left of m1, so drop that third; otherwise drop the part right of m2. Each step keeps two
          thirds, so it is still logarithmic. On integers it is usually simpler to binary search the slope instead: the first i where
          f(i) &gt; f(i + 1) is the peak. The same idea finds the bottom of a convex cost curve.
        </p>
        <p>
          When the answer is a real number accepted within a precision (say 10⁻⁵), lo and hi may never become exactly equal. Loop a
          fixed number of times instead: 100 halvings shrink any range of 10⁹ far below 10⁻⁵.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Capacity To Ship Packages Within D Days</h2>
        <p>
          Packages must be shipped in order. Each day, you load packages until the next one would exceed the ship's capacity. What is
          the smallest capacity that ships everything within D days?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try capacity 1, 2, 3, … and simulate each one until it fits in D days. Each simulation is <Cost>O(n)</Cost>, and with
          weights up to 500 and 5 × 10⁴ packages the capacity can reach 2.5 × 10⁷: far too many simulations.
        </p>
        <Step n={2}>Find the monotonic question</Step>
        <p>
          "Can capacity c ship everything in D days?" If c works, any larger capacity also works, because you can load the same
          packages on the same days. So the answers go no…no yes…yes as c grows.
        </p>
        <Step n={3}>Bound the range and write the check</Step>
        <p>
          The capacity must be at least the heaviest package (or that package can never be loaded) and never needs to exceed the
          total weight (everything in one day). The check fills each day greedily, which is optimal for a fixed capacity: taking a
          package today never makes later days harder.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          About log₂(2.5 × 10⁷) ≈ 25 checks of <Cost>O(n)</Cost> each: <Cost>O(n log(total))</Cost>. Edge cases: D equal to the number
          of packages (the answer is the heaviest package) and D = 1 (the answer is the total).
        </p>
      </div>

      <Pitfalls
        items={[
          <>Mixing templates: an inclusive range [lo, hi] with <b>lo &lt; hi</b>, or a half-open range with <b>hi = mid − 1</b>. Pick one template and stick to it.</>,
          <>An <b>infinite loop</b> from lo = mid with the lower middle. Use the upper middle for last-yes searches.</>,
          <>Searching a question that is <b>not monotonic</b>. Before coding, convince yourself that "yes" never turns back into "no".</>,
          <>Wrong bounds in answer searches: starting below the smallest possible answer, or above the largest needed, makes the check misbehave.</>,
          <>Sorting numbers with <b>arr.sort()</b> and no comparator, which sorts them as strings.</>,
          <>Using ceil vs floor carelessly in feasibility checks (hours = ceil(pile / speed), not floor).</>,
          <>For real numbers, looping until lo equals hi, which may never happen with floating point.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'How many steps does binary search need, at most, for 1,000,000 sorted values? For 10⁹?',
            solution: 'About 20 (2²⁰ ≈ 10⁶) and about 30 (2³⁰ ≈ 10⁹).',
          },
          {
            task: 'Run the first-yes template for "value ≥ 6" on [1, 4, 6, 6, 9]. Write lo, hi and mid at each step.',
            solution: 'lo=0, hi=5, mid=2: 6 ≥ 6 yes, hi=2. mid=1: 4 no, lo=2. lo=hi=2: the first 6 is at index 2.',
          },
          {
            task: 'Which question would you binary search for "the last index holding 6" in [1, 4, 6, 6, 9]?',
            hint: 'Find the first value greater than 6.',
            solution: 'Ask "value > 6": the first yes is index 4, so the last 6 is at index 3.',
          },
          {
            task: 'Koko has piles [5, 8, 10] and 6 hours. Is speed 4 fast enough? Speed 5?',
            solution: 'Speed 4: 2 + 2 + 3 = 7 hours, too slow. Speed 5: 1 + 2 + 2 = 5 hours, fast enough. Since 4 fails and 5 works, 5 is the answer.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'What does binary search really require?',
            options: [
              'A sorted array of distinct values',
              'A yes/no question whose answers go no…no yes…yes over the candidates',
              'An array whose length is a power of two',
              'Integer values',
            ],
            answer: 1,
            why: 'Sortedness is one source of such a question. Feasibility, slopes and rotated halves are others.',
          },
          {
            q: 'In the first-yes template (lo < hi, half-open range), what do you do when the answer at mid is "yes"?',
            options: ['lo = mid + 1', 'hi = mid', 'hi = mid − 1', 'Return mid'],
            answer: 1,
            why: 'mid might be the first yes, so it must stay in the range. Only "no" lets you skip past mid.',
          },
          {
            q: '"Split an array into k parts minimising the largest part sum." Which approach is the classic one?',
            options: ['Sort the array', 'Binary search on the largest sum, with a greedy check', 'Sliding window of size k', 'A heap of part sums'],
            answer: 1,
            why: 'A larger allowed maximum never needs more parts, so feasibility is monotonic in the answer.',
          },
          {
            q: 'In a rotated sorted array with distinct values, nums[lo] = 30 and nums[mid] = 45. What do you know?',
            options: ['The right half is sorted', 'The left half [lo, mid] is sorted', 'The target is on the left', 'The minimum is at mid'],
            answer: 1,
            why: 'nums[lo] ≤ nums[mid] means no rotation point lies between them, so the left half is in order.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Do every problem with the same first-yes template, even the easy ones, until it is automatic. Then the answer-search
          problems become a matter of writing the right check. More binary search appears in <See id="dp-sequences" /> (the fast
          longest increasing subsequence) and <See id="interactive" />.
        </p>
      </div>
      <ProblemSet id="binary-search" />

      <Recap>
        <ul>
          <li>Binary search halves the candidates with each question: about 30 steps for a billion values.</li>
          <li>What it needs is a monotonic yes/no question, not necessarily a sorted array.</li>
          <li>Master one template: half-open range, while lo &lt; hi, "yes" sets hi = mid, "no" sets lo = mid + 1, answer lo.</li>
          <li>Rotated arrays and peaks: you only need a guarantee about one half.</li>
          <li>Binary search on the answer turns "minimise the maximum" and "smallest value that works" into log(range) greedy checks.</li>
        </ul>
      </Recap>
    </>
  );
}
