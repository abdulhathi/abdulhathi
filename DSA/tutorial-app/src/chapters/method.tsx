import { Box, Exercises, Pitfalls, Quiz, Recap, See, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import type { DiagramSpec } from '../diagrams/geometry';
import { twoSumBrute, twoSumMap } from '../traces/method';
import { Walkthrough } from '../viz/Walkthrough';

const nums = [3, 9, 14, 6, 11, 7];
const brute = twoSumBrute(nums, 13);
const fast = twoSumMap(nums, 13);

const flow: DiagramSpec = {
  width: 860,
  height: 250,
  title: 'The method: understand, read the limits, brute force, match a pattern, plan and prove, code, test, analyse',
  legend: { app: 'Understand the problem', os: 'Read the clues', core: 'Design', engine: 'Build', error: 'Check' },
  nodes: [
    { id: 'u', kind: 'app', x: 95, y: 60, label: 'Understand', sub: 'RESTATE · EXAMPLES' },
    { id: 'c', kind: 'os', x: 305, y: 60, label: 'Read the limits', sub: 'TARGET COMPLEXITY' },
    { id: 'b', kind: 'core', x: 525, y: 60, label: 'Brute force', sub: 'CORRECT FIRST' },
    { id: 'm', kind: 'os', x: 745, y: 60, label: 'Match a pattern', sub: 'SIGNALS' },
    { id: 'p', kind: 'core', x: 745, y: 190, label: 'Plan and prove', sub: 'STEPS · INVARIANT' },
    { id: 'k', kind: 'engine', x: 525, y: 190, label: 'Write the code', sub: 'SMALL FUNCTIONS' },
    { id: 't', kind: 'error', x: 305, y: 190, label: 'Test by hand', sub: 'EDGE CASES' },
    { id: 'a', kind: 'error', x: 95, y: 190, label: 'Analyse', sub: 'TIME · SPACE' },
  ],
  edges: [
    { a: 'u', b: 'c' },
    { a: 'c', b: 'b' },
    { a: 'b', b: 'm' },
    { a: 'm', b: 'p', sa: 'b', sb: 't' },
    { a: 'p', b: 'k' },
    { a: 'k', b: 't' },
    { a: 't', b: 'a' },
    { a: 't', b: 'p', kind: 'loop', label: 'bug: fix the plan', sa: 'b', sb: 'b', pts: [[305, 236], [745, 236]] },
  ],
};

export default function Method() {
  return (
    <>
      <div className="prose">
        <p>
          Strong problem solvers are not faster at typing. They follow a method, so a problem they have never seen still feels
          familiar after a few minutes. This chapter is that method. Use it on every practice problem in the lab, and it will be
          automatic by the time you sit an interview.
        </p>
      </div>

      <Diagram spec={flow} caption="The eight steps. Most time goes into the top row: understanding, limits, brute force and the pattern. The code is the short part." />

      <div className="prose">
        <Step n={1}>Understand the problem</Step>
        <p>
          Restate the task in one sentence of your own. Write down the input, the output and the rules. Work through the examples
          by hand, and then invent one more: the smallest possible input, and one tricky case. Ask yourself what should happen
          with an empty input, a single element, duplicates, negative numbers and the largest allowed values. Many wrong answers
          are wrong because the problem was misread, not because the algorithm was bad.
        </p>

        <Step n={2}>Read the limits: they tell you the expected complexity</Step>
        <p>
          The constraints at the bottom of a LeetCode problem are a hint. A judge runs roughly 10⁸ simple operations per second,
          so the size of n tells you which complexities can pass. Learn this table; <See id="complexity" /> explains it in depth.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>If n is up to</th>
            <th>Aim for</th>
            <th>Typical techniques</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>10–12</td><td>O(n!) or O(n · 2ⁿ)</td><td>Permutations, backtracking</td></tr>
          <tr><td>20–25</td><td>O(2ⁿ) or O(n² · 2ⁿ)</td><td>Subsets, bitmask DP, meet in the middle</td></tr>
          <tr><td>100–500</td><td>O(n³)</td><td>Interval DP, Floyd–Warshall</td></tr>
          <tr><td>1,000–5,000</td><td>O(n²)</td><td>2D DP, all pairs</td></tr>
          <tr><td>10⁵–10⁶</td><td>O(n log n) or O(n)</td><td>Sorting, heaps, binary search, two pointers, sliding window, prefix sums, hashing</td></tr>
          <tr><td>10⁹ and more</td><td>O(log n) or O(1)</td><td>Binary search on the answer, math, fast power</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <Step n={3}>Find a brute force, and say what it costs</Step>
        <p>
          Before looking for anything clever, describe the simplest correct solution and its complexity. It proves you understand
          the problem, it is a fallback if you get stuck, and it shows you exactly what is slow. In an interview, saying it out
          loud earns credit. Watch the brute force for Two Sum: try every pair.
        </p>
      </div>
      <Walkthrough
        title="Brute force: try every pair (target 13)"
        frames={brute.frames}
        caption={`It works, but it checked ${brute.checks} pairs. With n values that is n(n − 1)/2 pairs: O(n²).`}
      />

      <div className="prose">
        <Step n={4}>Match a pattern</Step>
        <p>
          Now ask what the brute force wastes. Here, for each value we scan the whole array looking for its partner,{' '}
          <i>target − value</i>. Scanning for a value is exactly what a hash map makes instant. That jump, from "what am I
          repeating?" to "which structure removes the repetition?", is pattern matching. Every topic chapter has a table of
          signals for this, and the <See id="recognition" /> collects them all.
        </p>
      </div>
      <Walkthrough
        title="Better: remember what you have seen in a hash map"
        frames={fast.frames}
        caption="One pass and one map lookup per value: O(n) time, O(n) extra space. Memory bought speed."
      />

      <div className="prose">
        <Step n={5}>Plan in words, and prove it</Step>
        <p>
          Write the steps in plain sentences before writing code, exactly like the recipes in this lab. Then say why it is
          correct: what is always true at each step (the <b>invariant</b>), and why nothing that could be the answer is ever
          skipped. For Two Sum: "when I reach index i, the map holds every earlier value, so if the partner came earlier, I will
          find it." If you cannot say why it works, test it on a tricky case before you trust it.
        </p>

        <Step n={6}>Write the code</Step>
        <p>
          Translate the plan line by line. Use names that say what things mean (<i>left</i>, <i>seen</i>, <i>windowSum</i>),
          not single letters. Put a repeated idea in a small helper function. Handle the edge cases you listed in step 1.
        </p>

        <Step n={7}>Test it by hand before you press Submit</Step>
        <p>
          Walk one example through your code line by line, tracking every variable, exactly like a walkthrough. Then run your edge
          cases in your head: empty, one element, all equal, already sorted, reverse sorted, negative values, the maximum size.
          Finding the bug yourself is faster than reading a failing test case, and in interviews it is what interviewers want to
          see.
        </p>

        <Step n={8}>Analyse and improve</Step>
        <p>
          State the time and space complexity. Ask whether a better complexity is possible (could sorting help? is there a
          monotonic property for binary search?), and whether the space can drop (do you need the whole table, or only the last
          row?). Then compare your solution with others on LeetCode's discussion tab, and write the key idea in your own words.
        </p>
      </div>

      <Box kind="key" label="When you are stuck">
        <ul>
          <li><b>Solve a smaller case</b> by hand: n = 1, 2, 3. Look for the pattern in what you did.</li>
          <li><b>Change the representation:</b> sort it, draw it as a graph, write it as a table, turn it into prefix sums.</li>
          <li><b>Look for monotonicity:</b> if "answer x works" implies "x + 1 works", binary search the answer.</li>
          <li><b>Reverse the problem:</b> fill from the back, process events backwards, count the complement.</li>
          <li><b>Ask what you are recomputing:</b> repeated work is where a hash map, prefix sums or DP come in.</li>
          <li><b>Time-box it:</b> after 25–30 minutes, take one hint. Struggling longer teaches less than understanding the idea and re-solving it later.</li>
        </ul>
      </Box>

      <div className="prose">
        <h2>How to talk through a problem in an interview</h2>
        <p>
          Interviewers grade your thinking as much as your code. Narrate the same eight steps: restate the problem and confirm
          the edge cases, give the brute force and its cost, explain the insight that improves it, write the code while saying
          what each part does, test it on an example, and finish with the complexity. If you are stuck, say what you are trying.
          Silence is the worst signal.
        </p>
      </div>

      <Pitfalls
        items={[
          'Starting to code before you can say the plan in two or three sentences.',
          'Ignoring the constraints, then writing an O(n²) solution for n = 10⁵.',
          'Testing only the given examples, and missing empty input, duplicates or negative numbers.',
          'Spending an hour stuck without a hint. Take the hint, then re-solve the problem from scratch a few days later.',
          'Reading a solution, nodding, and moving on. If you did not type it yourself, you have not learned it.',
        ]}
      />

      <Exercises
        items={[
          {
            task: 'A problem says 1 ≤ n ≤ 2 · 10⁵. Which complexities can pass, and which cannot?',
            solution: 'O(n log n) and O(n) are comfortable. O(n²) would be 4 · 10¹⁰ operations, far too slow.',
          },
          {
            task: 'A problem says n ≤ 16 and asks for the best way to order all items. What does that limit suggest?',
            solution: 'Exponential search over subsets: 2¹⁶ = 65,536 subsets, so bitmask DP over subsets (with n² work each) fits easily.',
          },
          {
            task: 'Trace the hash map Two Sum on [2, 7, 11, 15] with target 9. What is in the map when the answer is found?',
            solution: 'At 2 the map is empty, so store 2 → 0. At 7 we need 2, which is in the map: answer [0, 1]. The map holds only {2 → 0}.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Why describe a brute force before an optimal solution?',
            options: ['Interviewers require exactly two solutions', 'It proves you understand the problem and shows what is being wasted', 'Brute force is always fast enough', 'It is shorter to write'],
            answer: 1,
            why: 'The brute force is a correct baseline, and the work it repeats is usually exactly what the better technique removes.',
          },
          {
            q: 'n can be 10⁹. What should you aim for?',
            options: ['O(n)', 'O(n log n)', 'O(log n) or O(1)', 'O(n²)'],
            answer: 2,
            why: 'Even a single pass over 10⁹ items is too slow. Think binary search on the answer, or a formula.',
          },
          {
            q: 'What is an invariant?',
            options: ['A variable that never changes', 'A statement that stays true at every step of the algorithm', 'The final answer', 'An edge case'],
            answer: 1,
            why: 'Invariants are how you prove an algorithm correct: if it holds at every step, it holds at the end.',
          },
        ]}
      />

      <Recap>
        <ul>
          <li>Understand, read the limits, brute force, match a pattern, plan and prove, code, test, analyse.</li>
          <li>The constraints tell you the target complexity. Learn the table.</li>
          <li>Ask what the brute force repeats; the right structure or technique removes that repetition.</li>
          <li>Time-box being stuck, take hints one at a time, and re-solve problems later from scratch.</li>
        </ul>
      </Recap>
    </>
  );
}
