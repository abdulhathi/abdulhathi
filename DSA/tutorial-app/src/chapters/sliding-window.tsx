import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/sliding-window';
import { countAtMostK, fixedWindow, longestUnique, shortestAtLeast } from '../traces/sliding-window';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const fixed = fixedWindow([4, -1, 7, 2, -3, 8, 5, -2], 3);
const unique = longestUnique('abcbdeaf');
const shortest = shortestAtLeast([3, 1, 4, 1, 5, 9, 2, 6], 12);
const counting = countAtMostK([1, 2, 1, 3, 3, 2], 2);

export default function SlidingWindow() {
  return (
    <>
      <TopicIntro
        id="sliding-window"
        time="5–6 hours, plus problems"
        before={['two-pointers', 'hash-table', 'counting']}
        learn={[
          'Why updating a window beats recomputing it, and when that is allowed',
          'Fixed-size windows, and variable windows that grow and shrink',
          'The longest-valid and shortest-valid templates, and how they differ by one line',
          'Counting windows with r − l + 1, and the "exactly K = at most K − at most (K − 1)" trick',
          'Why negative numbers break the window, and what to use instead',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Imagine looking at a long train through a window that shows exactly three carriages. As the train moves one carriage,
          one new carriage appears on the right and one disappears on the left. The other two are the same as before. You would
          never re-examine them.
        </p>
        <p>
          That is the whole technique. Many problems ask about <b>contiguous</b> subarrays or substrings: the largest sum of k
          neighbours, the longest substring without repeats, the shortest stretch that adds up to a target. The brute force looks
          at every start and every end, <Cost>O(n²)</Cost> windows, and often spends <Cost>O(n)</Cost> on each one. A sliding window
          keeps a summary of the current window (a sum, a set, some counts) and updates it as one element enters and one leaves.
          Every element enters once and leaves at most once, so the whole scan is <Cost>O(n)</Cost>.
        </p>
        <p>
          A sliding window is a special case of <See id="two-pointers" />: both pointers move left to right, and the elements between
          them form the window.
        </p>
      </div>

      <Walkthrough
        title="The best sum of 3 neighbours, sliding instead of re-adding"
        frames={fixed.frames}
        caption={`Each slide costs one addition and one subtraction. Best sum: ${fixed.best}.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          A variable window works when the rule is <b>monotonic</b>: if a window is valid, every smaller window inside it is also
          valid (or, for "shortest" problems, every larger window around it is). Then the left edge never has to move backwards,
          and both edges together make at most 2n moves.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>The window itself is just two indices. What changes from problem to problem is the summary you keep for it.</p>
      </div>
      <Structures
        items={[
          { name: 'Running sum or product', ts: 'number', ops: 'add or remove an element O(1)', use: 'Sums of a window: fixed-size averages, "at least target", products below k.' },
          { name: 'Hash set', ts: 'Set<string> or Set<number>', ops: 'has, add, delete O(1) average', use: 'Distinctness: no repeated characters, duplicates within distance k.' },
          { name: 'Count map', ts: 'Map<number, number>', ops: 'O(1) average; map.size = number of distinct keys', use: 'At most k distinct values, word counts. Delete a key when its count reaches 0.' },
          { name: 'Count array', ts: 'number[] of length 26 or 128', ops: 'O(1), faster than a Map', use: 'Letters: anagrams, character replacement, minimum window substring.' },
          { name: 'Last-index map', ts: 'Map<string, number>', ops: 'O(1)', use: 'Jump the left edge straight past an earlier copy of a character.' },
          { name: 'Monotonic deque', ts: 'see the Monotonic queue chapter', ops: 'O(1) amortised', use: 'The maximum or minimum of every window.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Fixed-size window</h2>
        <p>
          When the window length k is given, the window simply slides: on each step one element enters on the right and one
          leaves on the left. Compute the summary for the first window, then update it in O(1) per step, however large k is. Watch out for the twist
          where the window is hidden: "take k cards from the two ends" means "keep a contiguous block of n − k cards in the middle".
        </p>
      </div>
      <Recipe
        name="Fixed-size window"
        when="every candidate is a contiguous block of exactly k elements."
        steps={[
          'Build the summary (sum, counts, set) for the first k elements.',
          'Record the answer for this window.',
          'For r from k to the end: add element r, remove element r − k, and record the answer again.',
        ]}
        why="consecutive windows share k − 1 elements, so only the two elements at the edges change."
        time="O(n)"
        space="O(1), or O(alphabet) for counts"
      />

      <div className="prose">
        <h2>Pattern 2: Fixed window with counts</h2>
        <p>
          Two strings are <b>anagrams</b> (rearrangements of each other) exactly when every letter appears the same number of times
          in both. So "is there an anagram of p inside s?" becomes: slide a window of length |p| over s, keep 26 letter counts, and
          compare them with p's counts. Each slide changes two counts. To compare in <Cost>O(1)</Cost> instead of 26 steps, keep a
          counter of how many letters currently have matching counts and update it as counts change.
        </p>
      </div>
      <VizFigure
        parts={[
          { kind: 'array', label: 's', items: ['c', 'b', 'a', 'e', 'b', 'a', 'b', 'a', 'c', 'd'], window: [5, 7], tones: { 5: 'match', 6: 'match', 7: 'match' } },
          { kind: 'map', label: 'counts of p = "aab"', keyTitle: 'letter', valueTitle: 'needed', entries: [['a', 2], ['b', 1]] },
          { kind: 'map', label: 'counts in the window', keyTitle: 'letter', valueTitle: 'have', entries: [['a', 2], ['b', 1]], tones: { 0: 'match', 1: 'match' } },
        ]}
        caption={'The window "aba" has the same letter counts as "aab", so it is an anagram, even though the letters are in a different order.'}
      />

      <div className="prose">
        <h2>Pattern 3: Longest valid window</h2>
        <p>
          Here the window has a rule, such as "no repeated characters" or "at most k zeros", and you want the longest window that
          obeys it. Grow the window one element at a time on the right. If the new element breaks the rule, shrink from the left
          until the rule holds again. After that, the window is valid, so compare its length with the best.
        </p>
      </div>
      <Walkthrough
        title="Longest substring without a repeated letter"
        frames={unique.frames}
        caption={`The left edge only ever moves right. Longest: ${unique.best}.`}
      />
      <Recipe
        name="Longest valid window"
        when="you want the longest contiguous stretch obeying a rule that stays true when the window shrinks."
        steps={[
          'Set l = 0 and an empty summary.',
          'For each r: add element r to the summary.',
          'While the window [l, r] breaks the rule: remove element l from the summary and move l right.',
          'The window is valid now: update the best with r − l + 1.',
        ]}
        why="if [l, r] breaks the rule, so does every window [l, r′] with r′ > r, so a left edge that was dropped is never needed again."
        time="O(n): l and r each move at most n times"
        space="O(size of the summary)"
      />

      <div className="prose">
        <h2>Pattern 4: Shortest valid window</h2>
        <p>
          The mirror image: the rule is "big enough" (sum at least a target, contains every letter of t), and you want the
          shortest window that satisfies it. Grow until the window becomes valid; then shrink from the left <i>while it stays
          valid</i>, recording the length each time. Compare the two templates: the only real difference is where you record the
          answer, outside the shrink loop for "longest", inside it for "shortest".
        </p>
      </div>
      <Walkthrough
        title="Shortest window with a sum of at least 12 (all values positive)"
        frames={shortest.frames}
        caption={`Shortest length: ${shortest.best}. The answer is recorded inside the shrink loop.`}
      />
      <Recipe
        name="Shortest valid window"
        when="you want the shortest contiguous stretch that satisfies a rule which stays true when the window grows."
        steps={[
          'Set l = 0 and an empty summary.',
          'For each r: add element r to the summary.',
          'While the window [l, r] is valid: update the best with r − l + 1, then remove element l and move l right.',
          'After the scan, the best (if any) is the answer.',
        ]}
        why="once [l, r] is valid, any longer window starting at l is worse, so l can move on; and if [l, r] is not valid, no shorter window ending at r is either."
        time="O(n)"
        space="O(size of the summary)"
      />

      <TableWrap>
        <thead>
          <tr>
            <th></th>
            <th>Longest valid window</th>
            <th>Shortest valid window</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Shrink while…</td>
            <td>the window is invalid</td>
            <td>the window is valid</td>
          </tr>
          <tr>
            <td>Record the answer…</td>
            <td>after the shrink loop</td>
            <td>inside the shrink loop, before removing</td>
          </tr>
          <tr>
            <td>Typical rule</td>
            <td>at most k of something, no repeats</td>
            <td>at least a target, contains everything needed</td>
          </tr>
          <tr>
            <td>Examples</td>
            <td>3, 424, 1004, 904</td>
            <td>209, 76</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 5: Count windows</h2>
        <p>
          Some problems ask <i>how many</i> subarrays satisfy a rule. You cannot list them (there can be n²/2), but you can count
          them by their right end. If the window [l, r] is the longest valid window ending at r and the rule survives shrinking,
          then every subarray ending at r and starting anywhere from l to r is valid. That is <b>r − l + 1</b> subarrays, added in
          one step.
        </p>
      </div>
      <Walkthrough
        title="Count subarrays with at most 2 distinct values"
        frames={counting.frames}
        caption={`Each step adds r − l + 1. Total: ${counting.count}.`}
      />

      <div className="prose">
        <h2>Pattern 6: Exactly K = at most K − at most (K − 1)</h2>
        <p>
          "Exactly k distinct values" does not shrink nicely: removing an element can drop you from k to k − 1, and for a given
          right end there may be several valid left ends with invalid ones on both sides. "At most k" behaves perfectly, as above.
          So count subarrays with at most k, count those with at most k − 1, and subtract. What remains is exactly the subarrays with
          k. This one trick unlocks a whole family of counting problems.
        </p>
      </div>
      <Recipe
        name="Exactly K by subtraction"
        when="you must count subarrays with exactly k of something (distinct values, odd numbers, ones)."
        steps={[
          'Write a helper atMost(k) that uses the counting window: shrink while the window has more than k, then add r − l + 1.',
          'Make atMost return 0 for a negative k.',
          'The answer is atMost(k) − atMost(k − 1).',
        ]}
        why={'every subarray with at most k also has either exactly k or at most k − 1, never both, so subtracting leaves the "exactly k" ones.'}
        time="O(n), two passes"
        space="O(size of the summary)"
      />

      <div className="prose">
        <h2>Worked example: why negative numbers break the window</h2>
        <p>
          Take "count subarrays whose sum equals k" (problem 560). It looks like a sliding window problem. Try it with the array
          [3, −2, 4] and k = 5.
        </p>
        <Step n={1}>Try the window</Step>
        <p>
          Grow: [3] has sum 3, too small. Add −2: the sum is 1, <i>smaller</i> than before. The rule "add to grow the sum" has
          broken. When the sum is too big, you would shrink, but removing a negative number makes the sum bigger. You can no longer
          tell which way to move.
        </p>
        <Step n={2}>Name the property you lost</Step>
        <p>
          Every template in this chapter relies on monotonic behaviour: adding an element moves the summary in one direction,
          removing it moves it back. Positive numbers have that property for sums. Negative numbers (and zeros, for some "exactly"
          questions) do not.
        </p>
        <Step n={3}>Switch tools</Step>
        <p>
          Use prefix sums with a hash map instead: the sum of [i, j] is prefix[j + 1] − prefix[i], so count earlier prefixes equal
          to (current prefix − k). That works for any values. It is the core pattern of <See id="prefix-sum" />.
        </p>
        <Step n={4}>Remember the check</Step>
        <p>
          Before using a variable window, ask: "If my window is valid, is every smaller window inside it valid too?" (or larger
          windows, for shortest-window problems). If the answer is no, the window is the wrong tool.
        </p>
      </div>

      <div className="prose">
        <h2>Sliding window or something else?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Problem shape</th>
            <th>Tool</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Contiguous, positive values, longest or shortest with a sum condition</td>
            <td>Sliding window</td>
          </tr>
          <tr>
            <td>Contiguous, negative values allowed, sum equals or is divisible by k</td>
            <td>Prefix sums + hash map (<See id="prefix-sum" />)</td>
          </tr>
          <tr>
            <td>Contiguous, negative values, shortest subarray with sum at least k</td>
            <td>Prefix sums + monotonic deque (<See id="monotonic-queue" />)</td>
          </tr>
          <tr>
            <td>Maximum or minimum inside every window</td>
            <td>Monotonic deque (<See id="monotonic-queue" />)</td>
          </tr>
          <tr>
            <td>A pair from a sorted array, not a contiguous block</td>
            <td>Two pointers from opposite ends (<See id="two-pointers" />)</td>
          </tr>
          <tr>
            <td>Not contiguous at all (subsequences)</td>
            <td>Usually dynamic programming (<See id="dp-sequences" />)</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Using a variable window with <b>negative numbers</b> in a sum problem. Check the monotonic property first.</>,
          <>Recording the answer in the wrong place: after the shrink loop for longest, inside it for shortest.</>,
          <>Forgetting to <b>delete a key</b> from a count map when its count reaches 0, so map.size overstates the number of distinct values.</>,
          <>Off-by-one on the window length: [l, r] holds <b>r − l + 1</b> elements.</>,
          <>Recomputing the summary from scratch inside the loop (summing the window, comparing whole maps), which brings back O(n · k).</>,
          <>Moving the left edge backwards when jumping with a last-index map: always take the larger of l and the jump target.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Slide a window of size 2 over [5, 1, 3, 7, 2] and write the sum after each slide. Which window has the largest sum?',
            solution: 'Sums: 6, 4, 10, 9. The largest is 10, the window [3, 7].',
          },
          {
            task: 'Run the longest-unique template on "abba". Write l, r and the window after each step.',
            hint: 'When the second b arrives, the window must drop both a and b.',
            solution: 'r=0 "a"; r=1 "ab"; r=2 b repeats, drop a and b, window "b"; r=3 "ba" (the old a is gone, so no repeat). The longest length is 2.',
          },
          {
            task: 'How many subarrays of [1, 1, 1] have a sum of at most 2? Use r − l + 1.',
            solution: 'r=0 adds 1; r=1 adds 2; r=2: the sum 3 is too big, drop one 1, window has length 2, adds 2. Total 5.',
          },
          {
            task: 'Explain in one sentence why "exactly k distinct" equals "at most k" minus "at most k − 1".',
            solution: 'The subarrays with at most k distinct values split into those with exactly k and those with at most k − 1, so removing the second group leaves the first.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which problem can NOT be solved with a variable sliding window as it stands?',
            options: [
              'Longest substring with at most 2 distinct letters',
              'Shortest subarray of positive numbers with sum at least 50',
              'Count subarrays with sum exactly k, where values may be negative',
              'Longest run of 1s with at most k zeros flipped',
            ],
            answer: 2,
            why: 'With negative values the sum does not grow as the window grows, so you cannot decide which edge to move. Use prefix sums.',
          },
          {
            q: 'In the shortest-valid-window template, where do you record the answer?',
            options: ['Before growing', 'Inside the shrink loop, while the window is still valid', 'After the shrink loop', 'Only at the very end'],
            answer: 1,
            why: 'The window is valid at the top of the shrink loop. After the loop ends, it has just become invalid.',
          },
          {
            q: 'The longest valid window ending at r is [l, r] = [3, 7]. How many valid subarrays end at r?',
            options: ['4', '5', '7', '1'],
            answer: 1,
            why: 'Left ends 3, 4, 5, 6 and 7 all work: r − l + 1 = 5.',
          },
          {
            q: 'Why is a sliding window O(n) even though it has a loop inside a loop?',
            options: [
              'The inner loop runs at most once per step',
              'l and r only move forward, so together they move at most 2n times',
              'Hash maps are O(1)',
              'It is actually O(n log n)',
            ],
            answer: 1,
            why: 'Count total moves, not moves per step: each element enters once (r) and leaves at most once (l).',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the fixed-size problems, then do the longest and shortest templates until you can write them without
          thinking. Problem 239, Sliding Window Maximum, needs a monotonic deque and lives in <See id="monotonic-queue" />.
        </p>
      </div>
      <ProblemSet id="sliding-window" />

      <Recap>
        <ul>
          <li>A sliding window updates a summary as one element enters and one leaves, turning O(n²) windows into an O(n) scan.</li>
          <li>Fixed size: add the new element, remove the one k behind. Variable size: grow on the right, shrink on the left.</li>
          <li>Longest valid: shrink while invalid, record after. Shortest valid: shrink while valid, record inside.</li>
          <li>Count by right end with r − l + 1; for "exactly k", subtract at-most counts.</li>
          <li>The window needs a monotonic rule. With negative numbers in a sum problem, switch to prefix sums.</li>
        </ul>
      </Recap>
    </>
  );
}
