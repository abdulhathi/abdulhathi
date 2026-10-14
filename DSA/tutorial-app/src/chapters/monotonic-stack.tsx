import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/monotonic-stack';
import { cartesianTree, largestRectangle, minContributions, nextWarmer, removeKDigits } from '../traces/monotonic-stack';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const warmer = nextWarmer([71, 69, 72, 70, 68, 73, 75, 70]);
const histogram = largestRectangle([2, 4, 5, 3, 1, 3]);
const digits = removeKDigits('5381274', 3);
const cartesian = cartesianTree([4, 1, 6, 2, 5, 3]);
const mins = [4, 2, 3, 5];
const contrib = minContributions(mins);

export default function MonotonicStack() {
  return (
    <>
      <TopicIntro
        id="monotonic-stack"
        time="4–5 hours, plus problems"
        before={['stack', 'two-pointers', 'prefix-sum']}
        learn={[
          'Why a stack kept in sorted order answers "next greater" for every element in O(n)',
          'How to choose increasing or decreasing, and when the answer is recorded: on pop or after popping',
          'Nearest smaller on both sides (histograms), counting contributions, and greedy removal',
          'Building a Cartesian tree in one pass',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Picture people standing in a line, all facing right. Each person wants to know: who is the first person to my right
          who is taller than me? The obvious way is for every person to look along the line until they spot someone taller. In
          the worst case (heights that only go down) every person looks at everyone after them: about n²/2 looks. For 10⁵
          people that is five billion.
        </p>
        <p>
          Now flip it around. Walk along the line from left to right, and keep a list of the people who are <b>still
          waiting</b> for their answer. When a new person arrives, everyone waiting who is shorter than them has just found
          their answer, and can leave. Who is left waiting? Only people who are each at least as tall as the person after them,
          so the waiting list is sorted. The shortest are always at the end you add to, so the newcomer compares with the
          end of the list, removing people until someone taller (or equal) blocks the way.
        </p>
        <p>
          That waiting list is a <b>stack</b> whose values stay in order: a <b>monotonic stack</b>. Each person is pushed once
          and popped at most once, so the whole pass costs <Cost>O(n)</Cost>, even though one arrival may pop many people.
        </p>
      </div>

      <Walkthrough
        title="Daily Temperatures: days wait on the stack until a warmer day arrives"
        frames={warmer.frames}
        caption={`Amber cells are waiting on the stack; grey cells are answered. Answer: ${warmer.answer.join(', ')}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A monotonic stack holds the elements that are <b>still waiting</b> for something. Its order is a consequence, not a
          rule you impose: whenever a new element would break the order, the elements it beats have found their answer and
          leave. Before writing anything, decide two things: <i>what does an element wait for</i> (a larger or a smaller
          value), and <i>what do I record when it leaves</i>.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>These clues in a problem statement point to a monotonic stack.</p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          A plain array used as a stack is all you need. The decision that matters is <b>what you push</b>: an index lets you
          compute distances and widths and look the value up; a value is enough only when positions do not matter.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Stack of indices', ts: 'number[] with push / pop', ops: 'push, pop, peek at the last element O(1)', use: 'The default. Distances (i − j), widths and answers written back by position all need indices.' },
          { name: 'Stack of values', ts: 'number[] or string[]', ops: 'O(1)', use: 'When only the values matter: Remove K Digits, 132 Pattern, building the answer itself.' },
          { name: 'Stack of pairs', ts: '[price, span][]', ops: 'O(1)', use: 'When a popped element hands something over, such as the span it had absorbed (Online Stock Span).' },
          { name: 'Answer array', ts: 'number[] filled with 0 or −1', ops: 'write by index O(1)', use: 'Pre-fill with the "no answer" value; elements never popped keep it.' },
          { name: 'Hash map', ts: 'Map<number, number>', ops: 'get / set O(1) average', use: 'Answers by value instead of by index, when values are distinct (Next Greater Element I).' },
          { name: 'Prefix sums', ts: 'number[] of length n + 1', ops: 'range sum O(1)', use: 'Sums of the range an element controls (Maximum Subarray Min-Product).' },
        ]}
      />

      <div className="prose">
        <h2>Which stack? Four questions, four stacks</h2>
        <p>
          Every monotonic-stack problem is one of these four questions, or two of them combined. Learn the table and you can
          write the loop for any of them without thinking.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question for each element</th>
            <th>Stack order (bottom → top)</th>
            <th>Pop while the top is</th>
            <th>Where the answer appears</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Next greater to the right</td>
            <td>Decreasing</td>
            <td>smaller than the new value</td>
            <td>The popped element's answer is the new value</td>
          </tr>
          <tr>
            <td>Next smaller to the right</td>
            <td>Increasing</td>
            <td>larger than the new value</td>
            <td>The popped element's answer is the new value</td>
          </tr>
          <tr>
            <td>Previous greater to the left</td>
            <td>Decreasing</td>
            <td>smaller than (or equal to) the new value</td>
            <td>After popping, the top is the new value's answer</td>
          </tr>
          <tr>
            <td>Previous smaller to the left</td>
            <td>Increasing</td>
            <td>larger than (or equal to) the new value</td>
            <td>After popping, the top is the new value's answer</td>
          </tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Two details decide most wrong answers. <b>Strict or not</b>: "greater" pops on smaller-than, "greater or equal" pops
          on smaller-or-equal; read the statement. <b>Direction</b>: scanning right to left turns every "next" question into a
          "previous" one, which is sometimes easier (132 Pattern, Number of Visible People in a Queue).
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 1: Next greater or smaller</h2>
        <p>
          The pattern from the walkthrough. Elements wait on the stack; a new element answers every waiting element it beats.
          Circular arrays are handled by walking the array twice, and streams (prices arriving one by one) keep the stack
          between calls.
        </p>
      </div>
      <Recipe
        name="Next greater element"
        when="each element needs the first element to its right that is larger (flip the comparison for smaller)."
        steps={[
          'Fill the answer with the "none" value (−1 or 0) and start with an empty stack of indices.',
          'For each index i, left to right: while the stack is not empty and the value at the top is smaller than nums[i], pop the top and record nums[i] (or the distance i − top) as its answer.',
          'Push i.',
          'When the scan ends, the indices still on the stack have no answer; they keep the "none" value.',
        ]}
        why="an element leaves the stack exactly when the first larger element arrives, and the elements still waiting never rise from bottom to top, so the newcomer only needs to look at the top."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 2: Both boundaries</h2>
        <p>
          Many problems ask, for each element, how far it can stretch while staying the minimum. The answer is the range between
          its <b>nearest smaller element on the left</b> and its <b>nearest smaller element on the right</b>. An increasing stack
          finds both at once: when a bar is popped, the bar that pops it is its right limit, and the bar just below it on the
          stack is its left limit.
        </p>
      </div>
      <Walkthrough
        title="Largest Rectangle in Histogram: each bar is measured when it is popped"
        frames={histogram.frames}
        caption={`Amber bars are on the stack. When a bar is popped, the highlighted range is the widest rectangle of its height. Largest area: ${histogram.best}.`}
      />
      <Recipe
        name="Nearest smaller on both sides"
        when="each element should be treated as the minimum of a range, and you need how wide that range can be."
        steps={[
          'Scan i from 0 to n, treating i = n as a value smaller than everything (height 0) so the stack empties at the end.',
          'While the value at the top is at least the current value, pop it. Its right limit is i; its left limit is the index now on top, or −1 if the stack is empty.',
          'The popped element is the minimum of every subarray strictly between those limits: use the width, or the sum from prefix sums.',
          'Push i.',
        ]}
        why="the stack is increasing, so the element below the popped one is the nearest smaller to its left, and the element that popped it is the first one to its right that is not larger."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Contribution counting</h2>
        <p>
          "Sum the minimum of every subarray" sounds like it needs every subarray, and there are n²/2 of them. Turn the
          question inside out: element i is the minimum of every subarray that starts after its previous smaller element and
          ends before its next smaller element. If it can start in <b>left</b> places and end in <b>right</b> places, it is the
          minimum of left × right subarrays, and it contributes value × left × right to the total.
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'array', label: 'arr', items: mins },
          {
            kind: 'grid',
            label: 'how many subarrays each element is the minimum of',
            colHeaders: mins.map((v) => String(v)),
            rowHeaders: ['left choices', 'right choices', 'value × left × right'],
            cells: [contrib.left, contrib.right, contrib.contribution],
            tones: { '2,1': 'match' },
          },
          { kind: 'vars', items: [['sum of all subarray minimums', contrib.total]], tones: { 0: 'match' } },
        ]}
        caption={`The 2 can start at index 0 or 1 and end at index 1, 2 or 3: it is the minimum of 2 × 3 = 6 subarrays. Adding every contribution gives ${contrib.total}, the same as listing all ten subarrays.`}
      />
      <div className="prose">
        <p>
          One trap: equal values. If two equal values are both allowed to extend over each other, a subarray containing both is
          counted twice. Fix it by breaking ties on one side only: stop at a <b>strictly</b> smaller value on the left, and at a{' '}
          <b>smaller or equal</b> value on the right.
        </p>
      </div>
      <Recipe
        name="Contribution counting"
        when="you must add up the minimum (or maximum) of every subarray, or count subarrays where an element is the extreme."
        steps={[
          'Scan left to right with an increasing stack to find, for each i, the distance back to the previous strictly smaller element (or to the start): left[i].',
          'Scan right to left to find the distance forward to the next smaller-or-equal element (or to the end): right[i].',
          'Add value[i] × left[i] × right[i] for every i. For maximums, reverse every comparison.',
        ]}
        why="every subarray has exactly one rightmost minimum, and this tie-breaking credits each subarray to that element and no other."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 4: Greedy removal</h2>
        <p>
          To make a number as small as possible, the first digit matters more than all the others together. So if a digit is
          followed by a smaller one, removing the larger digit always helps. A stack does this: push digits, but first pop any
          larger digits before the new one while you are still allowed to remove. The same skeleton picks the smallest
          subsequence of a given length, or the smallest string that keeps one copy of each letter.
        </p>
      </div>
      <Walkthrough title="Remove K Digits: smaller digits push larger ones out" frames={digits.frames} caption={`Removing 3 digits from 5381274 leaves ${digits.result}.`} />
      <Recipe
        name="Greedy removal with a budget"
        when="you must delete elements (or choose a subsequence) to make the result smallest or largest in dictionary order."
        steps={[
          'For each element: while you can still remove, the stack is not empty, and the top is worse than the new element (larger, when you want the smallest result), pop the top and use up one removal.',
          'Push the new element.',
          'If removals remain at the end, take them from the end of the stack, where they matter least.',
          'Clean up the result (strip leading zeros, or trim to the required length).',
        ]}
        why="replacing a larger value at an earlier position with a smaller one makes the result smaller no matter what comes later."
        time="O(n)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 5: Cartesian trees</h2>
        <p>
          A <b>Cartesian tree</b> of an array puts the maximum (or minimum) at the root, builds the left subtree from the part
          of the array before it and the right subtree from the part after it. Reading the tree in order gives back the array.
          Building it by "find the maximum, then recurse" is <Cost>O(n²)</Cost> on sorted input. A decreasing stack builds it in{' '}
          <Cost>O(n)</Cost>: the stack holds the tree's right spine, and each new value takes the nodes it pops as its left
          subtree.
        </p>
      </div>
      <Walkthrough
        title="Maximum Binary Tree built in one pass"
        frames={cartesian.frames}
        caption="The tree on the right is the tree built so far; amber nodes are on the stack, which is the tree's right spine."
      />

      <div className="prose">
        <h2>Pattern 6: Candidate stacks</h2>
        <p>
          The most general form: keep only the elements that can still be part of some future answer, and notice that they
          end up sorted. In Maximum Width Ramp, a left end is only useful if it is smaller than every value before it, so the
          candidates decrease. In 132 Pattern, scanning from the right, the stack holds candidates for the middle value. In Car
          Fleet the stack of fleet arrival times collapses to a single number. The skill is to ask: <i>which elements can I
          prove are useless from now on?</i> Those are the ones you pop.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Largest Rectangle in Histogram</h2>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every pair of start and end bars, and multiply the width by the shortest bar between them: <Cost>O(n²)</Cost> pairs
          (even with a running minimum). With 10⁵ bars that is too slow.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The best rectangle is as tall as the shortest bar it covers. So instead of choosing two ends, choose that shortest bar.
          For a bar of height h, the widest rectangle of height h runs left and right until it meets a shorter bar. There are
          only n bars to choose, so if both limits can be found quickly, the problem is solved.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Keep an increasing stack of bar indices. When a bar shorter than the top arrives, the top bar cannot extend further
          right: the arriving bar is its right limit. And because the stack increases, the bar right below it is the nearest bar
          to its left that is shorter: its left limit. So at the moment of popping you know the full width, and you can compute
          the area.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each bar is pushed once and popped once: <Cost>O(n)</Cost>. Bars still on the stack at the end are popped by an
          imaginary bar of height 0 at position n. If the stack is empty after a pop, the bar reaches all the way to the start, so
          the left limit is −1. Equal heights are safe to pop: the last bar of an equal run is popped later and measures the full
          width.
        </p>
      </div>

      <div className="prose">
        <h2>Monotonic stack, monotonic queue or heap?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>You need</th>
            <th>Best tool</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>For every element, the nearest larger or smaller element</td>
            <td>Monotonic stack</td>
            <td>Answers arrive when elements leave, each in O(1) amortised.</td>
          </tr>
          <tr>
            <td>The maximum or minimum of a window that slides</td>
            <td>Monotonic queue (<See id="monotonic-queue" />)</td>
            <td>Elements also expire from the front when they leave the window.</td>
          </tr>
          <tr>
            <td>The largest or smallest item of a changing collection, in any order</td>
            <td>Heap (<See id="heap" />)</td>
            <td>Insertions and removals are not tied to positions, so O(log n) each.</td>
          </tr>
          <tr>
            <td>Range minimum queries on arbitrary ranges, answered many times</td>
            <td>Sparse table or segment tree (<See id="range-queries" />)</td>
            <td>A stack answers one fixed question per element, not arbitrary ranges.</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Pushing values when you need distances or widths. Push <b>indices</b> unless you are sure positions never matter.</>,
          <>Mixing up the comparison: <b>strict versus non-strict</b> decides whether equal values pop, which changes the answer.</>,
          <>Forgetting the elements left on the stack at the end. Either pre-fill the "none" answer or add a sentinel that pops everything.</>,
          <>Double counting equal values in contribution counting. Break ties strictly on one side only.</>,
          <>Using the plain "remove the larger digit" greedy without a <b>budget</b> check, then ending up with too few elements.</>,
          <>Thinking one pop loop per element makes it O(n²). Count pushes and pops in total: each index is pushed once and popped at most once.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Run the next-greater scan on [2, 1, 2, 4, 3] by hand. Write down the stack after each step and the final answers (−1 for none).',
            solution: 'Answers: 4, 2, 4, −1, −1. The stack ends holding the 4 and the 3. Note the first 2 is not answered by the second 2: equal is not greater.',
          },
          {
            task: 'For the histogram [2, 4, 4, 1], which bar is being popped when the largest rectangle is found, and what are its limits?',
            hint: 'The largest area is 8.',
            solution: 'When the second 4 arrives it pops the first 4 (equal heights pop): width 1, area 4. When the 1 arrives it pops the second 4: its left limit is the 2 at index 0 and its right limit is the 1 at index 3, so width 2 and area 8, the largest. Then it pops the 2: width 3, area 6.',
          },
          {
            task: 'Using contribution counting, compute the sum of subarray minimums of [2, 2]. Show left and right for each element.',
            solution: 'Left: stop at a strictly smaller value, so left = [1, 2]. Right: stop at a smaller-or-equal value, so right = [1, 1]. Contributions 2 × 1 × 1 + 2 × 2 × 1 = 6, matching the subarrays [2], [2], [2, 2] with minimums 2 + 2 + 2.',
          },
          {
            task: 'Remove 2 digits from "4321" with the greedy stack. What happens, and why is the answer "21"?',
            solution: 'Each new digit is smaller than the top, so 4 is popped by 3 and 3 by 2, using both removals; then 2 and 1 stay. The result 21 is the smallest: the first digit should be as small as possible.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'You want the previous smaller element for every index. Which stack do you keep, and when do you read the answer?',
            options: [
              'A decreasing stack; read the answer when an element is popped',
              'An increasing stack; after popping larger-or-equal values, the top is the answer for the new element',
              'An increasing stack; read the answer when an element is popped',
              'Any stack; sort it at the end',
            ],
            answer: 1,
            why: 'Pop everything that is not smaller than the new value. What remains on top is the nearest smaller element to its left.',
          },
          {
            q: 'A monotonic stack loop has a while loop inside a for loop. What is its running time on n elements?',
            options: ['O(n²)', 'O(n log n)', 'O(n), because each index is pushed once and popped at most once', 'It depends on the values'],
            answer: 2,
            why: 'Count total work, not work per step: there are n pushes and at most n pops altogether.',
          },
          {
            q: 'In Daily Temperatures, the stack holds days 1, 3, 4 with temperatures 80, 74, 70, and day 5 is 76. What happens?',
            options: ['Nothing is popped', 'Days 4 and 3 are popped and answered with 1 and 2; day 1 stays', 'All three days are popped', 'Only day 1 is popped'],
            answer: 1,
            why: '76 beats 70 (day 4, wait 1) and 74 (day 3, wait 2), but not 80, so day 1 keeps waiting and day 5 is pushed.',
          },
          {
            q: 'Why does Sum of Subarray Minimums use "strictly smaller" on one side and "smaller or equal" on the other?',
            options: ['For speed', 'So that a subarray with two equal minimums is counted exactly once', 'Because the array is sorted', 'It does not matter'],
            answer: 1,
            why: 'Each subarray must be assigned to exactly one of its minimums. Asymmetric tie-breaking assigns it to one of them, every time.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the next-greater problems until the loop feels automatic, then move to boundaries and contributions. For
          each problem, first decide the four things from the table: scan direction, stack order, pop condition, and where the
          answer appears.
        </p>
      </div>
      <ProblemSet id="monotonic-stack" />

      <Recap>
        <ul>
          <li>A monotonic stack holds elements still waiting for an answer; its sorted order follows from popping everything the newcomer beats.</li>
          <li>Each index is pushed once and popped at most once, so a full pass is O(n) however many pops one step makes.</li>
          <li>Pick the stack from the question: next greater (decreasing, answer on pop), previous smaller (increasing, answer after popping), and so on.</li>
          <li>Nearest smaller on both sides solves histograms; contribution counting sums over all subarrays; a budgeted greedy stack builds the smallest sequence.</li>
          <li>Push indices, decide strict versus non-strict deliberately, and deal with whatever is left on the stack at the end.</li>
        </ul>
      </Recap>
    </>
  );
}
