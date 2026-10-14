import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/monotonic-queue';
import { jumpGame, shortestAtLeastK, windowMax } from '../traces/monotonic-queue';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const maxes = windowMax([2, 7, 3, 1, 5, 4, 6, 2], 3);
const shortest = shortestAtLeastK([1, -2, 3, 4, -1, 2], 7);
const jumps = jumpGame([2, -3, 4, -5, -1, 3, -2, 1], 2);

export default function MonotonicQueue() {
  return (
    <>
      <TopicIntro
        id="monotonic-queue"
        time="3–4 hours, plus problems"
        before={['queue', 'sliding-window', 'monotonic-stack']}
        learn={[
          'Why a deque kept in sorted order gives the maximum of a sliding window in O(1)',
          'How to build an O(1) deque in TypeScript, where shift() is too slow',
          'Combining a deque with prefix sums for subarrays with negative numbers',
          'Speeding up a DP whose step takes the best value over a sliding range',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A sports team picks its captain from the players who joined in the last k seasons, and always picks the strongest.
          When a new player joins who is stronger than some current players, those weaker players can never become captain
          again: the newcomer is stronger <i>and</i> will stay on the shortlist longer. So they can be dropped right away. The
          shortlist that remains is ordered from strongest (oldest) to weakest (newest), and the captain is always at the front,
          unless the front player's k seasons are up, in which case they leave from the front.
        </p>
        <p>
          That shortlist is a <b>monotonic queue</b>: a double-ended queue (deque) whose values stay sorted. New elements enter
          at the back, after removing the weaker elements there; old elements leave from the front when they fall out of the
          window. The front is always the window's maximum. Each element enters once and leaves once, so a whole pass is{' '}
          <Cost>O(n)</Cost>, compared with <Cost>O(n · k)</Cost> for rescanning each window and <Cost>O(n log n)</Cost> for a heap.
        </p>
      </div>

      <Walkthrough
        title="Sliding Window Maximum with a deque"
        frames={maxes.frames}
        caption={`Amber cells are in the deque. The front of the deque is the window's maximum. Result: ${maxes.result.join(', ')}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A monotonic queue is a monotonic stack with a second exit. Like the stack, it drops elements that a newcomer makes
          useless, which keeps it sorted. Unlike the stack, elements also <b>expire</b> from the front when they leave the
          window. Ask the same question as before: <i>which elements can never be the answer again?</i> Here there are two
          kinds: those beaten by a newer element, and those that are too old.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          TypeScript has no built-in deque. An array has fast <b>push</b> and <b>pop</b> at the back, but{' '}
          <b>shift</b> (removing from the front) moves every remaining element, which is <Cost>O(n)</Cost> per call and turns your{' '}
          <Cost>O(n)</Cost> algorithm into <Cost>O(n²)</Cost>. The simple fix: keep a <b>head index</b>. The live part of the
          deque is everything from head to the end; "remove from the front" just moves head forward. The array never shrinks at
          the front, which costs a little memory but nothing else.
        </p>
      </div>
      <VizFigure
        parts={[
          {
            kind: 'array',
            label: 'deque stored as an array plus a head index',
            items: [0, 1, 4, 5, 6],
            tones: { 0: 'dim', 1: 'dim', 2: 'match', 3: 'warn', 4: 'warn' },
            pointers: [{ name: 'head', at: 2, tone: 'match' }, { name: 'back', at: 4, tone: 'warn' }],
          },
        ]}
        caption="Cells before head have been removed from the front without moving anything. Removing from the back is an ordinary pop. Both are O(1)."
      />
      <Structures
        items={[
          { name: 'Deque (array + head index)', ts: 'number[] plus let head = 0', ops: 'push and pop at the back, read and advance the front: O(1)', use: 'Every problem in this chapter. Store indices, so you can tell when the front has left the window.' },
          { name: 'Ring buffer', ts: 'fixed-size number[] with head and tail wrapping around', ops: 'O(1) at both ends', use: 'When memory matters or the stream is endless; the array plus head index is simpler for LeetCode.' },
          { name: 'Prefix sums', ts: 'number[] of length n + 1', ops: 'range sum O(1)', use: 'Subarray sums as P[j] − P[i]; the deque then holds start indices.' },
          { name: 'DP array', ts: 'number[]', ops: 'O(1) per entry', use: 'When each dp value takes the best of a window of earlier dp values.' },
          { name: 'Heap (alternative)', ts: 'your own binary heap', ops: 'push and pop O(log n)', use: 'Works for window maxima with lazy deletion of expired items, but is slower and fiddlier than a deque.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Window maximum or minimum</h2>
        <p>
          For a fixed window size, one deque gives the maximum (decreasing deque) or the minimum (increasing deque). For a
          window that grows and shrinks, such as "longest subarray whose maximum minus minimum is at most limit", keep{' '}
          <b>two</b> deques at once, one for each, and shrink the window from the left until the two fronts are close enough.
        </p>
      </div>
      <Recipe
        name="Sliding window maximum"
        when="you need the maximum (or minimum) of every window as it slides, or of a window that grows on the right and shrinks on the left."
        steps={[
          'Keep a deque of indices; their values decrease from front to back (increase, for a minimum).',
          'For each index i: remove the front while it is outside the window (index less than the window\'s left edge).',
          'Remove from the back every index whose value is at most nums[i] (at least, for a minimum), then push i.',
          'The value at the front is the maximum of the current window.',
        ]}
        why="an element removed from the back is both older and no larger than nums[i], so it can never be a maximum while nums[i] is still in the window."
        time="O(n)"
        space="O(k)"
      />

      <div className="prose">
        <h2>Pattern 2: Prefix sums with a deque</h2>
        <p>
          "Shortest subarray with sum at least K" is easy with only positive numbers: a sliding window grows until the sum is
          big enough, then shrinks. Negative numbers break that, because growing the window can make the sum smaller. Switch to
          prefix sums: the subarray from i to j − 1 sums to P[j] − P[i]. Now each j wants a start i with a small P[i], as late as
          possible. Two observations make a deque work: a start with a larger prefix sum than a later start is useless, and a
          start that has already reached K can be retired, because later ends only give it longer answers.
        </p>
      </div>
      <Walkthrough
        title="Shortest Subarray with Sum at Least 7 (negatives allowed)"
        frames={shortest.frames}
        caption={`The deque holds start indices with rising prefix sums. Shortest length: ${shortest.best}.`}
      />
      <Recipe
        name="Prefix sums plus a deque of starts"
        when="a subarray-sum condition must hold, values can be negative, and you want the shortest (or best) subarray."
        steps={[
          'Build prefix sums P, with P[0] = 0.',
          'For each end j from 0 to n: while the front start satisfies the condition with j, record the answer j − front and remove the front.',
          'While the back start has a prefix sum at least P[j], remove it: start j is later and no worse.',
          'Push j.',
        ]}
        why="removed starts are either finished (no later end can beat their answer) or dominated (a later start is shorter and gives a larger sum)."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: DP over a sliding range</h2>
        <p>
          Some DPs look like this: dp[i] = value[i] + the best dp[j] for j in the last k positions. Computed directly, each step
          scans k earlier values, giving <Cost>O(n · k)</Cost>. But the range of j slides forward by one as i grows, so the
          inner maximum is exactly a sliding-window maximum, over dp instead of over the input. Push each dp value into a deque
          as soon as it is known, and read the front for the next step.
        </p>
      </div>
      <Walkthrough
        title="Jump Game VI: dp plus a deque"
        frames={jumps.frames}
        caption={`The highlighted window on nums shows the indices you could jump from. Best score: ${jumps.score}.`}
      />
      <Recipe
        name="Deque-optimised DP"
        when="dp[i] needs the maximum (or minimum) of dp over a window of earlier indices whose ends both move in one direction."
        steps={[
          'Compute dp in order. Before computing dp[i], remove deque fronts that are outside i\'s window.',
          'dp[i] = (what i adds) + dp[front].',
          'Remove from the back the indices whose dp is no better than dp[i], then push i.',
          'Read the answer from the dp array.',
        ]}
        why="the window of useful j only moves forward, so the deque's invariant (sorted, all inside the window) is cheap to keep."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Worked example: Sliding Window Maximum</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          For each of the n − k + 1 windows, scan its k values: <Cost>O(n · k)</Cost>. With n and k both near 10⁵ that is
          up to 10¹⁰ steps.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Neighbouring windows share k − 1 values, yet each scan starts from nothing. A heap fixes the rescanning, but it keeps
          values that can never win, and you must remove expired values lazily: <Cost>O(n log n)</Cost>.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          If j &lt; i and nums[j] ≤ nums[i], then index j can never be the maximum of any window that contains i, and every
          future window that contains j also contains i (j leaves first). So j can be thrown away the moment i arrives. The
          values that remain must therefore decrease from oldest to newest, and the oldest one still inside the window is the
          maximum.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each index is pushed once and removed once: <Cost>O(n)</Cost> in total. Equal values: remove the older one (use
          "at most" when popping from the back), which keeps the deque short. k = 1: every element is its own maximum, and the
          algorithm handles it without a special case. Remember the front check uses indices, so duplicates do not confuse it.
        </p>
      </div>

      <div className="prose">
        <h2>Deque, heap, stack or sparse table?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Best tool</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Maximum of a window whose both ends only move right</td>
            <td>Monotonic deque</td>
            <td>O(n) total</td>
          </tr>
          <tr>
            <td>Maximum of a collection where items leave in any order</td>
            <td>Heap with lazy deletion, or an ordered set (<See id="heap" />, <See id="ordered-set" />)</td>
            <td>O(log n) per operation</td>
          </tr>
          <tr>
            <td>Nearest larger element for every position, no window</td>
            <td>Monotonic stack (<See id="monotonic-stack" />)</td>
            <td>O(n) total</td>
          </tr>
          <tr>
            <td>Maximum of arbitrary ranges, asked many times on fixed data</td>
            <td>Sparse table (<See id="range-queries" />)</td>
            <td>O(n log n) to build, O(1) per query</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Using <b>Array.prototype.shift</b> to remove from the front. It is O(n) per call; keep a head index.</>,
          <>Storing values instead of <b>indices</b>, then being unable to tell whether the front has left the window.</>,
          <>Checking expiry once per step when several fronts may have expired, in windows defined by distance (such as x-coordinates) rather than by count.</>,
          <>Reading the front before removing expired elements, or adding the new element before computing a candidate that must use only earlier elements.</>,
          <>Forgetting that negative numbers break the plain sliding window; with negatives, think prefix sums plus a deque.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run the sliding-window maximum on [4, 2, 12, 3, 8, 1] with k = 2. Write the deque (as indices) after each step and the list of maximums.',
            solution: 'Deques: [0], [0, 1], [2], [2, 3], [4], [4, 5]. Maximums: 4, 12, 12, 8, 8.',
          },
          {
            task: 'Why is it safe to remove an index from the back when its value equals the new value?',
            solution: 'The new index has the same value and stays in every future window at least as long, so it can stand in for the older one whenever that one would have been the maximum.',
          },
          {
            task: 'For nums = [3, −2, 4] and k = 5, list the prefix sums and find the shortest subarray with sum at least 5.',
            hint: 'Prefix sums are 0, 3, 1, 5.',
            solution: 'P = [0, 3, 1, 5]. Only P[3] − P[0] = 5 reaches 5, so the answer is length 3 (the whole array).',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In a decreasing deque for window maximums, when do you remove from the FRONT?',
            options: ['When the new value is larger than the front', 'When the front index is no longer inside the window', 'Never', 'Every step'],
            answer: 1,
            why: 'The back handles values the newcomer beats; the front only handles expiry, when its index falls out of the window.',
          },
          {
            q: 'Why does Shortest Subarray with Sum at Least K need a deque when Minimum Size Subarray Sum does not?',
            options: ['Because k is larger', 'Because values can be negative, so growing a window can shrink its sum', 'Because the answer must be the shortest', 'It does not; a sliding window works for both'],
            answer: 1,
            why: 'A plain sliding window relies on sums only growing as the window grows. Negative values break that, so you reason about prefix sums instead.',
          },
          {
            q: 'What does removing items with Array.prototype.shift do to a deque solution on 10⁵ items?',
            options: ['Nothing; shift is O(1)', 'It can make the solution O(n²), because each shift moves the remaining elements', 'It uses less memory, so it is better', 'It changes the answer'],
            answer: 1,
            why: 'shift re-indexes the whole array. Keep a head index instead, so removing from the front is O(1).',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Do Sliding Window Maximum first, then the two-deque window problems, then the prefix-sum and DP ones. In every
          problem, say out loud what makes an element useless from the back, and what makes it expire from the front.
        </p>
      </div>
      <ProblemSet id="monotonic-queue" />

      <Recap>
        <ul>
          <li>A monotonic queue keeps a window's candidates sorted: beaten elements leave from the back, expired ones from the front, and the front is the answer.</li>
          <li>Each element enters and leaves once, so a full pass is O(n), better than a heap's O(n log n) and with no lazy deletion.</li>
          <li>Build the deque from an array plus a head index; never use shift in a loop.</li>
          <li>Two deques give a variable window's max and min; prefix sums plus a deque handle negative numbers; a deque over dp turns O(n · k) DPs into O(n).</li>
        </ul>
      </Recap>
    </>
  );
}
