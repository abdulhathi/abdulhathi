import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dp-optimization';
import { jobScheduling, jumpGameDeque } from '../traces/dp-optimization';
import { Walkthrough } from '../viz/Walkthrough';

const jump = jumpGameDeque([2, -4, 3, -1, -6, 5, -2, 4], 2);
const jobs = jobScheduling([1, 2, 4, 5], [4, 5, 7, 8], [30, 50, 40, 25]);

export default function DpOptimization() {
  return (
    <>
      <TopicIntro
        id="dp-optimization"
        time="4–5 hours, plus problems"
        before={['dp', 'monotonic-queue', 'binary-search', 'prefix-sum']}
        learn={[
          'How to read the shape of a slow DP transition and pick the matching speed-up',
          'Monotonic deques for "best of the last k states", running sums for "sum of a range of states"',
          'Sorting plus binary search for "the last compatible state", as in job scheduling and LIS',
          'Monotone split points (Knuth, divide and conquer) and the convex hull trick with Li Chao trees',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          You found the right states and a correct recurrence, but the DP is too slow: each state looks back over k or n earlier
          states, so the total is <Cost>O(n × k)</Cost> or <Cost>O(n²)</Cost> where the limits need <Cost>O(n)</Cost> or{' '}
          <Cost>O(n log n)</Cost>. Do not throw the DP away. Look at <b>what the transition does</b> with the earlier states:
        </p>
        <ul>
          <li>takes the maximum over a sliding window → a monotonic deque;</li>
          <li>adds up a contiguous range → a running window sum;</li>
          <li>looks for the last state that is compatible → sort and binary search;</li>
          <li>minimises over a split point that moves only one way → Knuth or divide and conquer optimisation;</li>
          <li>minimises over expressions of the form slope × x + intercept → the convex hull trick.</li>
        </ul>
        <p>
          Each of these replaces a loop over earlier states with an O(1) or O(log n) data-structure query. The recurrence does
          not change; only how you evaluate it. Watch Jump Game VI: dp[i] = nums[i] + the best of the previous k dp values.
        </p>
      </div>

      <Walkthrough
        title="Jump Game VI: the window maximum lives at the front of a deque"
        frames={jump.frames}
        caption={`Each index is pushed and popped at most once, so the DP runs in O(n). Best score: ${jump.answer}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Write the slow DP first and make sure it is correct. Then circle the inner loop of the transition and ask: <i>"what
          is this loop computing over the earlier states, and which data structure answers that question faster?"</i> The
          optimisation is a change of data structure, not a new algorithm.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to a DP optimisation. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <TableWrap>
        <thead>
          <tr>
            <th>Transition looks like</th>
            <th>Technique</th>
            <th>Speed-up</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>max or min of dp[i − k .. i − 1]</td><td>Monotonic deque (<See id="monotonic-queue" />)</td><td>O(n × k) → O(n)</td></tr>
          <tr><td>sum of dp[a .. b] for a sliding range</td><td>Running window sum (<See id="prefix-sum" />)</td><td>O(n × k) → O(n)</td></tr>
          <tr><td>best dp among items that end before this one starts</td><td>Sort + binary search (<See id="binary-search" />)</td><td>O(n²) → O(n log n)</td></tr>
          <tr><td>min over a split k, best k moves monotonically</td><td>Knuth or divide and conquer optimisation</td><td>O(n³) → O(n²), or O(k n²) → O(k n log n)</td></tr>
          <tr><td>min over j of a_j × x_i + b_j</td><td>Convex hull trick or Li Chao tree</td><td>O(n²) → O(n log n)</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Data structures you will use</h2>
      </div>
      <Structures
        items={[
          { name: 'Deque', ts: 'number[] with head and tail indices', ops: 'push / pop both ends O(1)', use: 'Monotonic window of candidate indices. Avoid Array.prototype.shift, which is O(n).' },
          { name: 'Running sum', ts: 'number', ops: 'add and subtract O(1)', use: 'The sum of the dp values currently in the window.' },
          { name: 'Sorted array', ts: 'number[] sorted with a comparator', ops: 'binary search O(log n)', use: 'End times of jobs, or the tails array of an LIS.' },
          { name: 'Split-point table', ts: 'number[][] (opt)', ops: 'O(1)', use: 'Knuth\'s optimisation: the best k of each range bounds the search for its neighbours.' },
          { name: 'Li Chao tree', ts: 'array of lines over a range of x', ops: 'insert / query O(log C)', use: 'Minimum over many lines at one x, with lines added in any order.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Monotonic deque</h2>
        <p>
          If dp[i] needs the best dp value among the last k indices, keep a deque of indices whose dp values decrease from front
          to back. An index that is both older and no better than a newer one can never be the answer again, so it is popped
          from the back when the newer one arrives. The front is always the best index still inside the window.
        </p>
      </div>
      <Recipe
        name="Sliding window maximum inside a DP"
        when="dp[i] uses the best of dp over a window of the previous k indices."
        steps={[
          'Before computing dp[i], pop indices that have left the window from the front.',
          'dp[i] = (its own value) + dp[front] (or + max(0, dp[front]) if starting fresh is allowed).',
          'Pop indices from the back while their dp is no better than dp[i].',
          'Push i at the back.',
        ]}
        why="every index enters and leaves the deque once, and dominated indices are never the window's best again."
        time="O(n)"
        space="O(k)"
      />

      <div className="prose">
        <h2>Pattern 2: Running window sums</h2>
        <p>
          Counting and probability DPs often say "dp[i] is the sum of dp over a range of earlier states": the last maxPts totals
          in New 21 Game, the last i values in K Inverse Pairs, the reachable indices in Jump Game VII. Keep that sum as a running
          number: add the value that enters the range and subtract the one that leaves.
        </p>
        <h2>Pattern 3: Sort and binary search</h2>
        <p>
          In weighted interval problems the previous state is "the best result among jobs that end before this one starts".
          Sort the jobs by end time once; then the compatible jobs form a prefix, and binary search finds its length. The same
          idea powers the O(n log n) longest increasing subsequence: the tails array is sorted, so the place for each new value
          is a binary search away.
        </p>
      </div>
      <Walkthrough
        title="Maximum Profit in Job Scheduling: take or skip each job, found by binary search"
        frames={jobs.frames}
        caption={`dp[i] = max(dp[i − 1], profit + dp[compatible prefix]). Best profit: ${jobs.answer}.`}
      />
      <Recipe
        name="Weighted intervals with binary search"
        when="you choose non-overlapping items and each item's best partner is the last item that ends before it starts."
        steps={[
          'Sort the items by end.',
          'dp[0] = 0; dp[i] is the best value using only the first i items.',
          'For item i, binary search the number p of items whose end is compatible with its start (≤ or <, as the problem says).',
          'dp[i] = max(dp[i − 1], value of item i + dp[p]).',
        ]}
        why="after sorting by end, every item compatible with item i comes before every incompatible one."
        time="O(n log n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Monotone split points</h2>
        <p>
          In interval and partition DPs, dp[i][j] = min over k of (something with k). Often the best k, call it opt[i][j], moves
          only in one direction as the range grows. <b>Knuth's optimisation</b> uses opt[i][j − 1] ≤ opt[i][j] ≤ opt[i + 1][j] to
          search only between those two bounds; summed over all ranges, the searches cost O(n²) instead of O(n³). It applies when
          the cost of a range behaves well (it satisfies the quadrangle inequality), as in cutting a stick or building an optimal
          search tree. <b>Divide and conquer optimisation</b> handles layered DPs like "k groups over n items": compute the middle
          state's best split by scanning, then solve the left half with splits only up to it and the right half with splits only
          from it, O(k × n log n) in total.
        </p>
        <h2>Pattern 5: Lines and the convex hull trick</h2>
        <p>
          Some transitions expand into dp[i] = (terms of i) + min over j of (a_j × x_i + b_j). Each earlier state j is then a{' '}
          <b>line</b> with slope a_j and intercept b_j, and dp[i] asks for the lowest line at x = x_i. The lowest lines form a
          convex lower envelope. If slopes arrive in sorted order and queries move monotonically, keep the envelope in a deque
          and the whole DP is O(n). In general, a <b>Li Chao tree</b> works: a segment tree over the x range where each node keeps
          the line that is lowest at its midpoint, and inserting a line pushes the loser down into one half. Both insert and
          query cost O(log C). Minimum Cost to Divide Array Into Subarrays is LeetCode's Li Chao problem, after a clever rewrite
          removes the subarray count from the state.
        </p>
      </div>
      <Recipe
        name="Convex hull trick"
        when="dp[i] = f(i) + min over j < i of (a_j × x_i + b_j)."
        steps={[
          'Rewrite the transition until the part that depends on both i and j is a product of one j-number and one i-number.',
          'Treat each finished state j as a line: slope a_j, intercept b_j.',
          'For each i, query the lowest line at x = x_i, then add f(i) to get dp[i].',
          'Insert state i\'s own line for later queries.',
          'Use a Li Chao tree in general, or a monotone deque hull when slopes and queries are both sorted.',
        ]}
        why="the minimum of a family of lines at a point is the lower envelope, which a hull or a Li Chao tree answers in O(log C) or better."
        time="O(n log C) with a Li Chao tree"
        space="O(n) or O(C)"
      />

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>New 21 Game</b>: Alice draws numbers 1..maxPts while her total is below k. What is the
          probability she ends with at most n?
        </p>
        <Step n={1}>Write the slow DP</Step>
        <p>
          Let dp[x] be the probability that her total ever equals x. She reaches x from a total y = x − d (d from 1 to maxPts)
          that was still below k, with probability 1/maxPts each. So dp[x] = (sum of dp[y] for y in [x − maxPts, x − 1], y &lt; k)
          / maxPts. That is <Cost>O(n × maxPts)</Cost> = 10⁸: borderline.
        </p>
        <Step n={2}>Circle the inner loop</Step>
        <p>
          The loop adds up a contiguous range of dp values, and the range slides by one as x grows. That is Pattern 2.
        </p>
        <Step n={3}>Replace it with a running sum</Step>
        <p>
          Keep windowSum = the sum of dp[y] in the current range with y &lt; k. For each x: dp[x] = windowSum / maxPts; if x &lt; k,
          add dp[x] to the window (Alice keeps drawing from x); otherwise add it to the answer (she stops). Then remove
          dp[x − maxPts] if it is still inside the window.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(n)</Cost> time. If k = 0 she never draws, so the answer is 1; if n ≥ k − 1 + maxPts, every possible final total is
          at most n, so the answer is also 1. Done.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Optimising before the slow DP is correct. Get the recurrence right, then speed it up; the optimisation should not change any answer.</>,
          <>Using Array.prototype.shift for the deque front: it is O(n) and quietly brings back the slow DP.</>,
          <>Window edges off by one: decide exactly which index enters and which leaves at each step.</>,
          <>Mixing up "end ≤ start" and "end &lt; start" for compatible intervals; each problem says which one it wants.</>,
          <>Applying Knuth's bounds to a cost that does not satisfy its conditions: the answer silently becomes wrong. When unsure, test against the O(n³) version on random inputs.</>,
          <>Floating-point lines in a convex hull: compare with care, or keep everything in integers.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run Jump Game VI by hand on nums = [10, −5, −2, 4, 0, 3] with k = 3. Write dp and the deque after each index.',
            hint: 'dp[0] = 10. The deque front is the best of the last three dp values.',
            solution: 'dp = [10, 5, 8, 14, 14, 17]. Every index can reach back to index 0 or a later better index; the answer is 17.',
          },
          {
            task: 'K Inverse Pairs: compute the row for n = 3 (k from 0 to 3) from the row for n = 2, which is [1, 1, 0, 0].',
            solution: 'dp[3][j] = dp[2][j] + dp[2][j − 1] + dp[2][j − 2]: [1, 2, 2, 1].',
          },
          {
            task: 'Jobs (start, end, profit): (1, 4, 30), (2, 5, 50), (4, 7, 40), (5, 8, 25). Sorted by end, which jobs are compatible with the job (5, 8), and what is the best total profit?',
            solution: '(1, 4) and (2, 5): both end by day 5, when (5, 8) starts. Taking (2, 5) and then (5, 8) gives 75, the answer; the next best is (1, 4) then (4, 7) for 70.',
          },
          {
            task: 'Why can an index be popped from the BACK of the deque in Jump Game VI when a new index with a bigger or equal dp arrives?',
            solution: 'The new index is newer, so it stays in the window at least as long, and it is at least as good. The old one can never be the best again.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'dp[i] = cost[i] + min(dp[i − k], …, dp[i − 1]) with n, k up to 10⁵. What speeds it up?',
            options: ['A running window sum', 'A monotonic deque', 'Binary search', 'Bitmask DP'],
            answer: 1,
            why: 'A sliding window minimum (or maximum) is exactly what a monotonic deque provides in O(1) amortised.',
          },
          {
            q: 'dp[x] = (dp[x − 1] + … + dp[x − m]) / m. What speeds it up?',
            options: ['A running window sum', 'A heap', 'Knuth\'s optimisation', 'Nothing: it is already O(n)'],
            answer: 0,
            why: 'The range of terms slides by one each step, so add the new term and subtract the old one.',
          },
          {
            q: 'In Maximum Profit in Job Scheduling, why sort the jobs by END time?',
            options: [
              'So the most profitable job comes first',
              'So the jobs compatible with any job form a prefix, found by binary search',
              'So jobs never overlap',
              'Sorting by start time is equally good',
            ],
            answer: 1,
            why: 'With ends sorted, every job ending before a given start comes before every job ending after it.',
          },
          {
            q: 'When does the convex hull trick apply?',
            options: [
              'When dp[i] is a sum over a window',
              'When dp[i] = f(i) + min over j of (a_j × x_i + b_j)',
              'When the input is a tree',
              'When n ≤ 20',
            ],
            answer: 1,
            why: 'Each j is a line; the minimum over lines at one x is the lower envelope.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For every problem, first write the slow recurrence and its complexity, then identify the shape of the inner loop.
          Start with the deque and running-sum problems, then the binary-search ones; the split-point and convex hull problems
          are advanced. Problems marked <b>Core</b> are the minimum set.
        </p>
      </div>
      <ProblemSet id="dp-optimization" />

      <Recap>
        <ul>
          <li>Keep the correct recurrence; speed up how its inner loop is evaluated.</li>
          <li>Window max or min → monotonic deque; window sum → running sum; last compatible item → sort and binary search.</li>
          <li>Monotone split points → Knuth (O(n³) → O(n²)) or divide and conquer optimisation.</li>
          <li>Minimum over lines → convex hull trick or Li Chao tree.</li>
        </ul>
      </Recap>
    </>
  );
}
