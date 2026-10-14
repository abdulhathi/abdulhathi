import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/two-pointers';
import { dutchFlag, floydCycle, maxArea, pairSum, removeDuplicates } from '../traces/two-pointers';
import { Walkthrough } from '../viz/Walkthrough';

const pair = pairSum([1, 3, 4, 6, 8, 11, 14], 14);
const dedupe = removeDuplicates([1, 1, 2, 3, 3, 3, 5, 7, 7]);
const cycle = floydCycle([3, 1, 4, 7, 5, 9, 2, 6], 3);
const water = maxArea([3, 9, 4, 2, 7, 5, 8, 1, 6]);
const flag = dutchFlag([1, 2, 0, 2, 1, 0, 0, 2, 1]);

export default function TwoPointers() {
  return (
    <>
      <TopicIntro
        id="two-pointers"
        time="5–6 hours, plus problems"
        before={['array', 'linked-list', 'sorting']}
        learn={[
          'Why two indices moving with purpose replace a nested loop, and how to prove it is safe',
          'Six patterns: opposite ends, read and write, fast and slow, two sequences, fix one, partition',
          "Floyd's cycle detection, including why the second phase finds the cycle's start",
          'How to spot a two-pointer problem from its wording and its limits',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Many array problems ask about <b>pairs</b>: two values that add up to something, two walls that hold water, two ends
          that should match. The obvious way is to try every pair with two nested loops. With n values there are about n²/2
          pairs, so for n = 100,000 that is five billion checks, far too slow.
        </p>
        <p>
          The two-pointer technique keeps two indices into the data and moves them according to a rule. The rule is chosen so
          that every step <b>rules out at least one element for good</b>. Since each pointer only moves forward (or only
          backward), together they make at most n moves. That turns <Cost>O(n²)</Cost> into <Cost>O(n)</Cost>, and it needs
          no extra memory beyond the two indices.
        </p>
        <p>
          The whole skill is in the rule, and in the argument for why the rule never throws away the answer. Watch the classic
          case: a sorted array, and a target sum.
        </p>
      </div>

      <Walkthrough
        title="Find two values that add up to 14"
        frames={pair.frames}
        caption="Each comparison removes one value from consideration: the window between L and R only shrinks."
      />

      <div className="prose">
        <p>
          Look at the moment the sum is too small. Pairing the value at L with anything other than the value at R gives a{' '}
          <i>smaller</i> sum still, because R holds the largest value left. So the value at L cannot be part of any answer, and
          moving L loses nothing. The same argument, mirrored, covers a sum that is too big. That reasoning, "this element can
          never be in an answer, so discard it", is the heart of every opposite-ends problem.
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          A two-pointer solution is correct when you can finish this sentence for every move: <i>"Moving this pointer is safe
          because the element it leaves can never be part of a better answer."</i> If you cannot finish the sentence, the rule
          is a guess, and guesses fail on hidden test cases.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues in a problem statement point to two pointers. You will find every signal from every chapter in the{' '}
          <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          Two pointers need almost nothing: the input itself and two or three integer indices. That is why interviewers like
          them. When a problem says "O(1) extra space", this is often the expected answer.
        </p>
      </div>
      <Structures
        items={[
          { name: 'Array', ts: 'number[]', ops: 'read or write by index O(1)', use: 'The data the pointers walk over. Sorted input is the usual precondition for opposite ends.' },
          { name: 'String', ts: 'string (immutable), or string[] to edit', ops: 'charAt O(1); building a new string O(n)', use: 'Palindromes and comparisons. Split into an array of characters when you must change it in place.' },
          { name: 'Linked list node', ts: '{ val: number; next: ListNode | null }', ops: 'next O(1); no index access', use: 'Fast and slow pointers. You cannot jump to the middle, which is exactly why two speeds help.' },
          { name: 'Integer indices', ts: 'let left = 0, right = n - 1', ops: 'O(1)', use: 'The pointers themselves. Name them for their meaning: read and write, low and high, slow and fast.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Opposite ends</h2>
        <p>
          L starts at the first index and R at the last. Each step looks at the two ends, then moves one of them inward. Use it
          on sorted arrays (pair sums), on anything symmetric (palindromes, reversing), and on problems where the answer
          depends on the two ends of a range (containers, boats, trapped water).
        </p>
      </div>
      <Recipe
        name="Opposite-end pointers"
        when="the input is sorted or symmetric, and each comparison tells you which end can never be part of the answer."
        steps={[
          'Put L on the first index and R on the last.',
          'While L < R, look at the elements at L and R and compute what you need (a sum, an area, a comparison).',
          'Record the result if it is the best so far, or stop if it is the answer.',
          'Move the pointer whose element can no longer help: usually the smaller side, or the side that is too small or too big.',
          'When the pointers meet, every candidate has been considered or ruled out.',
        ]}
        why="each move discards an element that provably cannot appear in a better answer, so nothing useful is ever skipped."
        time="O(n)"
        space="O(1)"
      />
      <Walkthrough
        title="Container With Most Water: always move the shorter wall"
        frames={water.frames}
        caption={`The water level is set by the shorter wall, so keeping the shorter wall and moving the other one can only lose. Best area: ${water.best}.`}
      />

      <div className="prose">
        <h2>Pattern 2: Read and write</h2>
        <p>
          Both pointers start at the left and move right, but at different paces. <b>read</b> visits every element once.{' '}
          <b>write</b> marks where the next element of the answer goes. Everything before write is finished; everything from
          read onward has not been looked at yet. Use it whenever you must remove, keep or compact elements in place.
        </p>
      </div>
      <Recipe
        name="Read and write pointers"
        when="you must filter or compact an array in place with O(1) extra space."
        steps={[
          'Set write to the first position that is not yet decided (often 0, or 1 if the first element is always kept).',
          'Move read across the array, one element at a time.',
          'If the element at read belongs in the answer, copy (or swap) it to write and move write forward.',
          'When read reaches the end, the answer is the first write elements.',
        ]}
        why="write never passes read, so you only ever overwrite cells that have already been read."
        time="O(n)"
        space="O(1)"
      />
      <Walkthrough
        title="Remove duplicates from a sorted array"
        frames={dedupe.frames}
        caption={`Green cells are the finished answer. Result: ${dedupe.length} unique values, ${dedupe.kept.join(', ')}.`}
      />

      <div className="prose">
        <h2>Pattern 3: Fast and slow</h2>
        <p>
          On a linked list you cannot jump to an index, and you often do not know the length. Two pointers at different speeds
          fix that. If fast moves two nodes for every one that slow moves, then when fast reaches the end slow is in the middle.
          And if the list loops back on itself, fast never reaches an end: it laps slow and lands on the same node. That is{' '}
          <b>Floyd's cycle detection</b>, also called the tortoise and the hare.
        </p>
      </div>
      <Walkthrough
        title="Floyd's algorithm: detect the cycle, then find its start"
        frames={cycle.frames}
        caption={`The cycle starts at the node holding ${[3, 1, 4, 7, 5, 9, 2, 6][cycle.entry]}.`}
      />
      <div className="prose">
        <h3>Why phase two finds the start</h3>
        <p>
          Say the cycle starts a nodes from the head, and slow meets fast b nodes into the cycle. Slow has walked a + b nodes.
          Fast has walked twice that, 2(a + b). The extra distance fast covered, a + b, must be a whole number of laps around the
          cycle, because both pointers are now on the same node. So a + b is a multiple of the cycle length, which means that
          walking a more nodes from the meeting point (which sits b nodes into the cycle) brings you exactly back to the cycle's
          start. A second pointer walking a nodes from the head arrives there too. They meet at the start.
        </p>
        <p>
          The same idea works on anything that behaves like a list: a sequence of numbers where each one determines the next (Happy
          Number), or an array whose values point to other indices (Find the Duplicate Number).
        </p>
      </div>
      <Recipe
        name="Fast and slow pointers"
        when="you need the middle of a linked list, want to know whether a list or sequence loops, or need where the loop starts."
        steps={[
          'Start slow and fast at the head.',
          'Each round, move slow one step and fast two steps. If fast (or the node after it) is missing, there is no cycle, and slow is at the middle.',
          'If slow and fast land on the same node, there is a cycle.',
          'To find where it starts, move one pointer back to the head and step both one node at a time until they meet.',
        ]}
        why="inside a cycle the gap between them shrinks by one node every round, so fast cannot jump over slow."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 4: Two sequences</h2>
        <p>
          When the input is two sorted arrays or two strings, give each one its own pointer. Each step compares the two current
          elements and advances the pointer whose element is used up or comes first. This is the merge step of merge sort, and it
          also answers "is this a subsequence of that?", "where do these interval lists overlap?" and "do these two typed strings
          end up equal?".
        </p>
      </div>
      <Recipe
        name="One pointer per sequence"
        when="two sorted inputs must be merged, compared or matched against each other."
        steps={[
          'Put i at the start of the first sequence and j at the start of the second (or both at the ends, when writing into free space at the back).',
          'Compare the current elements.',
          'Use the one that should come first (or record a match), and advance only that pointer, or both on a match.',
          'When one sequence runs out, handle whatever is left of the other.',
        ]}
        why="both inputs are sorted, so the element you consume is the smallest one that has not been used yet."
        time="O(m + n)"
        space="O(1) besides the output"
      />

      <div className="prose">
        <h2>Pattern 5: Fix one, then two pointers</h2>
        <p>
          For three values (3Sum) or four (4Sum), sort once, loop over the first value, and run the opposite-ends pair search on
          the part of the array to its right. Each extra fixed value adds one loop: 3Sum is <Cost>O(n²)</Cost>, 4Sum is{' '}
          <Cost>O(n³)</Cost>. Sorting also makes duplicates sit next to each other, so you can skip a value that equals the
          previous one, which is how you return each triplet only once.
        </p>
        <h2>Pattern 6: Partition</h2>
        <p>
          Sometimes the pointers are boundaries between regions. In the Dutch national flag problem, everything before{' '}
          <b>low</b> is 0, everything after <b>high</b> is 2, and <b>mid</b> scans the unknown middle. Each value is swapped into
          its region. The same idea is the partition step of quicksort, which you will meet again in <See id="sorting" /> and{' '}
          <See id="quickselect" />.
        </p>
      </div>
      <Walkthrough
        title="Sort 0s, 1s and 2s in one pass"
        frames={flag.frames}
        caption={`Blue cells are settled 0s, amber cells are settled 2s. Result: ${flag.sorted.join(', ')}.`}
      />

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Container With Most Water</b>, the way you should practise it: start from brute force,
          look for what you are wasting, and prove the shortcut.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every pair of walls i &lt; j and compute min(h[i], h[j]) × (j − i). That is correct and takes <Cost>O(n²)</Cost>.
          With up to 10⁵ walls it is too slow, so you need to skip most pairs.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Start with the widest container, the two outer walls. Every other container is narrower. A narrower container can only
          win if it is taller, and its height is capped by its shorter wall.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Suppose the left wall is the shorter one. Any container that keeps this left wall has height at most h[L] and is
          narrower than the current one, so it holds less. Therefore the left wall is finished: move L. If the right wall is
          shorter, the mirror argument says move R.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each step moves one pointer inward, so there are n − 1 steps: <Cost>O(n)</Cost> time, <Cost>O(1)</Cost> space. Equal
          heights? Moving either is fine, because neither wall can do better with a narrower partner. Two walls only? One step,
          one area. Done.
        </p>
      </div>

      <div className="prose">
        <h2>Two pointers, sliding window or hash map?</h2>
        <p>These three often compete for the same problem. Choose by what the input gives you.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Situation</th>
            <th>Best tool</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Sorted array, find a pair</td>
            <td>Two pointers</td>
            <td>O(1) space, and the order tells you which end to drop.</td>
          </tr>
          <tr>
            <td>Unsorted array, find a pair, return original indices</td>
            <td>Hash map (<See id="hash-table" />)</td>
            <td>Sorting would lose the indices and cost n log n.</td>
          </tr>
          <tr>
            <td>Best contiguous subarray or substring</td>
            <td>Sliding window (<See id="sliding-window" />)</td>
            <td>The two pointers both move right and bound a window.</td>
          </tr>
          <tr>
            <td>Count subarrays with an exact sum, negatives allowed</td>
            <td>Prefix sum + hash map (<See id="prefix-sum" />)</td>
            <td>With negatives, growing the window does not always grow the sum, so window rules break.</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Using opposite ends on <b>unsorted</b> data. The "too small, move L" argument depends on order.</>,
          <>Off-by-one loop conditions: <b>L &lt; R</b> when a pair needs two different elements, <b>L ≤ R</b> when one element on its own still matters (boats, squares).</>,
          <>Forgetting to skip duplicates after a match in 3Sum and 4Sum, which returns the same triplet several times.</>,
          <>In fast and slow, stepping fast twice without checking that <b>fast.next</b> exists.</>,
          <>Comparing linked list nodes by value instead of by identity.</>,
          <>Moving a pointer without being able to say why it is safe. That is a guess, not an algorithm.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Trace the opposite-ends pair search on [2, 5, 9, 11, 15] with target 20. Write down L, R and the sum at each step.',
            hint: 'Start with 2 + 15 = 17.',
            solution: '2 + 15 = 17, too small, move L. 5 + 15 = 20, found: indices 1 and 4.',
          },
          {
            task: 'Run read and write on [0, 0, 1, 1, 1, 2, 2, 3] (remove duplicates). What is the returned length, and what are the first cells?',
            solution: 'Length 4. The first four cells are 0, 1, 2, 3.',
          },
          {
            task: 'Why does Container With Most Water move the shorter wall and never the taller one? Answer in one sentence.',
            solution: 'Every narrower container that keeps the shorter wall is capped at the same height and is narrower, so it cannot hold more.',
          },
          {
            task: 'In a list with a cycle, fast moves 3 steps per round instead of 2. Does it still always meet slow? Is the phase-two trick still valid?',
            hint: 'Both start at the head. After t rounds, fast is 2t nodes ahead of slow. When is that a whole number of laps?',
            solution:
              'Detection still works: once both are in the cycle, some round makes 2t a multiple of the cycle length, and they meet. Phase two breaks, though. It relied on fast walking exactly twice as far as slow, which made a + b a whole number of laps; with speed 3 you only know 2(a + b) is, and the two pointers can circle forever without meeting (try a cycle of length 4 that starts one node after the head). Stick to speeds 1 and 2.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'A sorted array, target 10. L points at 3 and R points at 9. What do you do?',
            options: ['Move L right', 'Move R left', 'Move both', 'Stop: no pair exists'],
            answer: 1,
            why: '3 + 9 = 12 is too big. Pairing 9 with anything right of L only grows the sum, so 9 is out: move R left.',
          },
          {
            q: 'Which problem is NOT a natural fit for opposite-end pointers?',
            options: ['Valid Palindrome', 'Two Sum on an unsorted array, returning original indices', 'Container With Most Water', 'Squares of a Sorted Array'],
            answer: 1,
            why: 'Without sorted order you cannot tell which end to drop, and sorting would lose the original indices. Use a hash map.',
          },
          {
            q: 'In Sort Colors, why does mid NOT move forward after swapping with high?',
            options: [
              'Because high might now be smaller than mid',
              'Because the value that came from high has not been checked yet',
              'Because 2s must be swapped twice',
              'It should move; that is a bug',
            ],
            answer: 1,
            why: 'Everything between mid and high is unknown. The swapped-in value came from that unknown region, so mid must look at it next.',
          },
          {
            q: 'After fast and slow meet inside a cycle, how do you find where the cycle starts?',
            options: [
              'Keep moving fast until it returns to the meeting point and count the steps',
              'Move one pointer to the head, then move both one step at a time until they meet',
              'Reverse the list',
              'The meeting point is always the start',
            ],
            answer: 1,
            why: 'The distance from the head to the start equals the distance from the meeting point forward to the start, modulo whole laps.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Work through the problems in order inside each pattern. Try each one for 20–30 minutes before opening a hint; reveal one
          hint at a time and go back to your editor after each. Problems marked <b>Core</b> are the minimum set. When you solve
          one, set its status to Solved, and the <a href="#/review">review queue</a> will bring it back in a few days.
        </p>
      </div>
      <ProblemSet id="two-pointers" />

      <Recap>
        <ul>
          <li>Two pointers replace a nested loop when every move can safely discard an element: O(n²) becomes O(n), with O(1) space.</li>
          <li>Opposite ends needs sorted or symmetric data; read and write compacts in place; fast and slow finds middles and cycles.</li>
          <li>Two sequences is the merge step; fix-one turns k-Sum into nested loops around one pair search; partition keeps regions behind pointers.</li>
          <li>Always be able to say why a move is safe. That sentence is your proof, and in an interview it is what earns the credit.</li>
        </ul>
      </Recap>
    </>
  );
}
