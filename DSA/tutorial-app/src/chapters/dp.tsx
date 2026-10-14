import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dp';
import { houseRobber, kadane, wordBreak } from '../traces/dp';
import { Walkthrough } from '../viz/Walkthrough';

const robber = houseRobber([6, 2, 8, 9, 3, 4]);
const words = wordBreak('catsdog', ['cat', 'cats', 'sdog', 'dog', 'do']);
const sub = kadane([-3, 4, -1, 2, -6, 1, 5, -2, 3]);

export default function DynamicProgramming() {
  return (
    <>
      <TopicIntro
        id="dp"
        time="7–8 hours, plus problems"
        before={['recursion', 'memoization', 'greedy']}
        learn={[
          'What dynamic programming is: a recursion whose repeated subproblems are solved once and stored',
          'The five questions that define every DP: state, transition, base case, order and answer',
          'Five one-dimensional patterns: count the ways, cheapest path, take or skip, best ending here, try every last piece',
          'How to find the state for a new problem, and how to cut memory with rolling variables',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Some problems are made of smaller copies of themselves, and those smaller copies overlap. To count the ways to climb 10
          stairs you need the ways to climb 9 and 8; to count 9 you need 8 and 7. A plain recursion asks for 8 twice, 7 three times,
          and the repeats multiply until a 45-step staircase takes over a billion calls.
        </p>
        <p>
          <b>Dynamic programming</b> (DP) solves each distinct subproblem once, writes the answer down, and builds larger answers
          from smaller ones. Imagine a notebook with one line per subproblem: you fill the lines in order, and each new line only
          looks up lines already written. The climbing-stairs notebook has 45 lines, so the work drops from exponential to{' '}
          <Cost>O(n)</Cost>.
        </p>
        <p>Two properties make a problem a DP problem:</p>
        <ul>
          <li>
            <b>Optimal substructure</b>: the best (or the count) for the whole problem can be built from the best (or counts) of
            smaller subproblems.
          </li>
          <li>
            <b>Overlapping subproblems</b>: the same smaller subproblem is needed many times. If every subproblem were needed once,
            plain recursion or divide and conquer would already be efficient.
          </li>
        </ul>
        <p>Here is a full DP from start to finish. Houses stand in a row, and you may not rob two neighbours.</p>
      </div>

      <Walkthrough
        title="House Robber: fill the table from left to right"
        frames={robber.frames}
        caption={`Each entry looks at only two earlier entries: skip this house, or rob it on top of the answer two houses back. Answer: ${robber.best}.`}
      />

      <div className="prose">
        <h2>The five questions</h2>
        <p>
          Every DP solution is the answer to five questions. Write them down before anything else; once they are right, the rest is
          mechanical.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Question</th>
            <th>Climbing Stairs</th>
            <th>House Robber</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><b>1. State</b>: what does one entry mean?</td>
            <td>ways[i] = number of ways to reach step i</td>
            <td>best[k] = most money from the first k houses</td>
          </tr>
          <tr>
            <td><b>2. Transition</b>: how is an entry built from smaller ones?</td>
            <td>ways[i] = ways[i − 1] + ways[i − 2]</td>
            <td>best[k] = max(best[k − 1], best[k − 2] + money[k − 1])</td>
          </tr>
          <tr>
            <td><b>3. Base cases</b>: which entries are known outright?</td>
            <td>ways[1] = 1, ways[2] = 2</td>
            <td>best[0] = 0, best[1] = money[0]</td>
          </tr>
          <tr>
            <td><b>4. Order</b>: which entries must be filled first?</td>
            <td>Increasing i</td>
            <td>Increasing k</td>
          </tr>
          <tr>
            <td><b>5. Answer</b>: which entry (or entries) is the result?</td>
            <td>ways[n]</td>
            <td>best[n]</td>
          </tr>
        </tbody>
      </TableWrap>

      <Box kind="key" label="Key idea">
        <p>
          The state must hold <i>everything the remaining decisions depend on</i>, and nothing more. If two situations with the
          same state could need different answers, the state is missing information. If the state includes details that never
          change the answer, the table is bigger than it needs to be.
        </p>
      </Box>

      <div className="prose">
        <h2>Top-down or bottom-up</h2>
        <p>
          The same recurrence can be computed two ways. <b>Top-down</b> is the recursion with a cache, covered in{' '}
          <See id="memoization" />. <b>Bottom-up</b> fills a table in a loop, smallest states first. Both do the same work; choose
          by convenience.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th></th>
            <th>Top-down (memoisation)</th>
            <th>Bottom-up (tabulation)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>How it feels</td>
            <td>Write the recursion, add a cache</td>
            <td>Decide an order, fill a table with a loop</td>
          </tr>
          <tr>
            <td>Computes</td>
            <td>Only the states actually reached</td>
            <td>Every state in the table</td>
          </tr>
          <tr>
            <td>Risks</td>
            <td>Deep recursion can overflow the call stack (about 10,000 frames in JavaScript)</td>
            <td>You must get the fill order right</td>
          </tr>
          <tr>
            <td>Memory tricks</td>
            <td>Hard to shrink</td>
            <td>Easy to keep only the last row or last few values</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>How to find the state</h2>
        <p>The state is the hardest part. These questions get you there for most one-dimensional problems:</p>
        <ul>
          <li>
            <b>What does the last decision look like?</b> The last step taken, the last house robbed or skipped, the last word in a
            split. The transition is "try every possible last decision".
          </li>
          <li>
            <b>What is left after that last decision?</b> Usually a shorter prefix (the first i items) or a later suffix (items from
            i onward). That shorter piece is the smaller state.
          </li>
          <li>
            <b>Does the answer for that piece depend on anything else?</b> A cooldown, whether the first house was robbed, the last
            value used. If so, add it to the state as a second number (the later DP chapters are mostly about these extra numbers).
          </li>
          <li>
            <b>Is the question about a contiguous subarray?</b> Then "best ending exactly at i" is usually the right state, not
            "best within the first i".
          </li>
        </ul>
      </div>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to dynamic programming. The <See id="recognition" /> collects the signals from every chapter.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>A DP table is almost always a plain array. The skill is in choosing its meaning, not its type.</p>
      </div>
      <Structures
        items={[
          { name: '1D table', ts: 'new Array(n + 1).fill(0)', ops: 'read and write O(1)', use: 'One entry per prefix, position or value. Size n + 1 makes the empty prefix entry 0 available.' },
          { name: 'Rolling variables', ts: 'let prev2 = 0, prev1 = 0', ops: 'O(1)', use: 'When each entry reads only the last one or two entries, keep just those.' },
          { name: 'Set', ts: 'new Set(words)', ops: 'has O(1) average', use: 'Fast dictionary checks inside a transition, as in Word Break.' },
          { name: 'Map as a cache', ts: 'new Map<number, number>()', ops: 'get and set O(1) average', use: 'Top-down DP when the states are sparse or the values are huge.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Count the ways</h2>
        <p>
          Split the ways by their last move. To reach step n you last stepped from n − 1 or from n − 2, and no way does both, so
          the counts simply add. Decode Ways splits by whether the last letter used one digit or two; tiling problems split by
          the last tile placed. When a move is only sometimes allowed (a "0" cannot be decoded alone), add that term only when it
          is valid.
        </p>
      </div>
      <Recipe
        name="Counting DP"
        when="the question is how many ways, and every way can be described by its last move."
        steps={[
          'Define ways[i] as the number of ways to reach state i (a step, a prefix length, a board width).',
          'List every possible last move into state i, and the state it comes from.',
          'ways[i] = the sum of ways[from] over the valid last moves.',
          'Set the base cases (often ways[0] = 1: there is exactly one way to do nothing).',
          'Fill in increasing order and return ways[n], applying a modulo if the problem asks for one.',
        ]}
        why="each way has exactly one last move, so grouping by it counts every way once."
        time="O(n × moves)"
        space="O(n), or O(1) with rolling variables"
      />

      <div className="prose">
        <h2>Pattern 2: Cheapest path along a line</h2>
        <p>
          Swap "sum" for "minimum" and you have the cheapest way to reach a position: best[i] is the cheapest of the positions you
          could have come from, plus the price of that move. Min Cost Climbing Stairs looks one or two steps back; Minimum Cost For
          Tickets looks 1, 7 or 30 days back.
        </p>
      </div>
      <Recipe
        name="Cheapest path DP"
        when="you move forward along positions, each move has a price, and you want the cheapest (or most valuable) way to the end."
        steps={[
          'Define best[i] as the cheapest way to reach position i.',
          'For each possible previous position j, compute best[j] + price of moving from j to i.',
          'best[i] = the smallest of those candidates.',
          'Fill in increasing order and return the entry for the end position.',
        ]}
        why="the cheapest route to i must arrive from some j, and its part up to j must itself be the cheapest route to j."
        time="O(n × moves)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Pattern 3: Take it or skip it</h2>
        <p>
          At each item, you either skip it, keeping the best answer so far, or take it, which forbids some neighbours. In House
          Robber, taking house i means the best up to i − 2 plus its money. Delete and Earn becomes House Robber once you add up
          the points per value; House Robber II runs House Robber twice to break the circle.
        </p>
      </div>
      <Recipe
        name="Take or skip"
        when="each item is either chosen or not, and choosing it rules out a fixed set of nearby items."
        steps={[
          'Define best[i] as the best answer using only the first i items (or the items from i onward).',
          'Skip: best[i − 1]. Take: the item\'s value plus the best answer that ignores everything it rules out.',
          'best[i] = max(skip, take).',
          'Fill in order; keep only the entries the transition reads.',
        ]}
        why="every valid selection either contains item i or does not, and both cases reduce to a smaller prefix."
        time="O(n)"
        space="O(1) with rolling variables"
      />

      <div className="prose">
        <h2>Pattern 4: Best ending here</h2>
        <p>
          For contiguous subarrays, the right state is the best subarray that <b>ends exactly at i</b>. It either extends the best
          one ending at i − 1 or starts fresh at i. That is Kadane's algorithm. Products need two states, the largest and the
          smallest product ending at i, because a negative number swaps them.
        </p>
      </div>
      <Walkthrough
        title="Kadane's algorithm: extend or start fresh"
        frames={sub.frames}
        caption={`The bracket shows the best subarray ending at i; green shows the best seen anywhere. Answer: ${sub.best}.`}
      />
      <Recipe
        name="Best ending here (Kadane)"
        when="you want the best contiguous subarray: largest sum, largest product, longest run with a property."
        steps={[
          'Keep current = the best value of a subarray ending at the previous index.',
          'At index i: current = the better of "start fresh with nums[i]" and "extend: current combined with nums[i]".',
          'Keep the best current seen anywhere as the answer.',
          'For products, keep both the largest and the smallest value ending here, and update both from the old values.',
        ]}
        why="a subarray ending at i is either just nums[i] or a subarray ending at i − 1 plus nums[i], and only the best of the latter matters."
        time="O(n)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Pattern 5: Try every last piece</h2>
        <p>
          When a string or array must be split into pieces, look at the last piece. If it runs from j to i, the part before it is a
          smaller prefix, already in the table. So entry i tries every possible j. Word Break asks whether any split exists;
          Partition Array for Maximum Sum and Filling Bookcase Shelves ask for the best split.
        </p>
      </div>
      <Walkthrough
        title="Word Break: each prefix asks the smaller prefixes"
        frames={words.frames}
        caption="ok[i] becomes true as soon as a dictionary word ends at i on top of a prefix that already splits."
      />
      <Recipe
        name="Prefix DP over the last piece"
        when="the input must be cut into consecutive pieces, and each piece has a validity rule or a cost."
        steps={[
          'Define dp[i] as the answer for the first i elements; dp[0] is the empty prefix.',
          'For each i, try every start j of the last piece s[j..i) (limit j to the longest possible piece).',
          'If the piece is valid, combine dp[j] with the piece: OR for "possible?", + for "how many?", min or max for "best?".',
          'Fill i from 1 to n and return dp[n].',
        ]}
        why="every split has a last piece, and the split of what comes before it is independent of that piece."
        time="O(n × longest piece)"
        space="O(n)"
      />

      <div className="prose">
        <h2>Shrinking memory: rolling variables</h2>
        <p>
          Look at which entries a transition reads. Climbing Stairs and House Robber read only the last two, so two variables
          replace the whole table: compute the new value, then shift (the older variable takes the newer one's value, the newer one
          takes the new value). Memory drops from <Cost>O(n)</Cost> to <Cost>O(1)</Cost>. In two-dimensional DPs the same idea keeps
          only the previous row (see <See id="dp-grid" /> and <See id="knapsack" />).
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: Decode Ways</h2>
        <p>A string of digits was encoded with A = 1 … Z = 26. How many ways can it be decoded?</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Recursively decide whether the next letter uses one digit or two. Each position branches in two, so the work is about{' '}
          <Cost>2ⁿ</Cost>; a 100-digit string is hopeless.
        </p>
        <Step n={2}>Find the repeats</Step>
        <p>
          After decoding "1, 2" or "12" you are in the same situation: the rest of the string from position 2. The recursion
          solves that suffix again for every way of reaching it. The only thing that matters is <i>where</i> you are, not how you
          got there.
        </p>
        <Step n={3}>Write the five answers</Step>
        <p>
          State: ways[i] = decodings of the first i digits. Transition: the last letter used one digit (allowed if it is not "0")
          or two digits (allowed if they form 10 to 26), so ways[i] = (ways[i − 1] if valid) + (ways[i − 2] if valid). Base case:
          ways[0] = 1. Order: increasing i. Answer: ways[n].
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(n)</Cost> time, and <Cost>O(1)</Cost> memory with two rolling variables. A leading "0" gives 0. "10" and "20" have
          one decoding, not two. "30" has none, because 30 is not a letter and "0" cannot stand alone.
        </p>
      </div>

      <div className="prose">
        <h2>Where DP goes next</h2>
        <p>
          This chapter covers DPs whose state is a single position. Later chapters add more to the state; recognise the shape and
          jump to the right one.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>If the state needs…</th>
            <th>It is</th>
            <th>Classic problem</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>a row and a column</td><td><See id="dp-grid" /></td><td>Unique Paths, Dungeon Game</td></tr>
          <tr><td>an item index and a remaining capacity</td><td><See id="knapsack" /></td><td>Partition Equal Subset Sum, Coin Change</td></tr>
          <tr><td>a position in each of two strings</td><td><See id="dp-sequences" /></td><td>Longest Common Subsequence, Edit Distance</td></tr>
          <tr><td>a left and a right end of a range</td><td><See id="dp-interval" /></td><td>Burst Balloons</td></tr>
          <tr><td>a position and a mode (holding, resting)</td><td><See id="dp-state-machine" /></td><td>Best Time to Buy and Sell Stock with Cooldown</td></tr>
          <tr><td>a tree node and a flag</td><td><See id="dp-tree" /></td><td>House Robber III</td></tr>
          <tr><td>a digit position and a "still tight" flag</td><td><See id="dp-digit" /></td><td>Count numbers with a digit property</td></tr>
          <tr><td>a set of used items</td><td><See id="bitmask" /></td><td>Shortest path visiting all nodes</td></tr>
          <tr><td>the same, but faster</td><td><See id="dp-optimization" /></td><td>Monotonic queue and convex hull tricks</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Starting to fill a table before writing the five answers. An unclear state leads to a transition that "almost" works.</>,
          <>Off-by-one confusion between "first i items" (table of size n + 1) and "item i" (size n). Pick one meaning and write it down.</>,
          <>Forgetting base cases such as ways[0] = 1, which makes every count 0.</>,
          <>Using "best within the first i" for a contiguous subarray question; it must be "best ending at i".</>,
          <>Overwriting a rolling variable before it has been read, which silently corrupts the next entry.</>,
          <>Reaching for DP when a greedy proof exists, or for greedy when choices interact. Check both directions with a small example.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Fill the House Robber table for money [5, 1, 1, 5]. What are best[0] to best[4]?',
            hint: 'best[2] = max(best[1], best[0] + 1).',
            solution: 'best = 0, 5, 5, 6, 10. Rob the first and the last house for 10.',
          },
          {
            task: 'Count the decodings of "1214" with the Decode Ways recurrence. Show ways[0] to ways[4].',
            solution: 'ways = 1, 1, 2, 3, 5: "1 2 1 4", "12 1 4", "1 21 4", "1 2 14" and "12 14".',
          },
          {
            task: 'Run Kadane on [3, −4, 5, −1, 2]. What is the best subarray?',
            solution: 'Ending-here values: 3, −1, 5, 4, 6. The best is 6, from 5, −1, 2.',
          },
          {
            task: 'Climbing Stairs, but you may take 1, 2 or 3 steps. Write the transition and compute ways for n = 4.',
            solution: 'ways[i] = ways[i − 1] + ways[i − 2] + ways[i − 3], with ways[0] = 1. ways = 1, 1, 2, 4, 7, so 7 ways for n = 4.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which two properties make a problem suitable for dynamic programming?',
            options: [
              'Sorted input and a target sum',
              'Optimal substructure and overlapping subproblems',
              'A tree structure and a recursion',
              'Small input and a greedy choice',
            ],
            answer: 1,
            why: 'The answer must build from smaller answers, and those smaller answers must repeat; otherwise caching gains nothing.',
          },
          {
            q: 'For "largest sum of a contiguous subarray", what should dp[i] mean?',
            options: ['The largest sum within the first i elements', 'The largest sum of a subarray ending exactly at i', 'The sum of the first i elements', 'The largest element so far'],
            answer: 1,
            why: 'Contiguity means a subarray ending at i can only extend one ending at i − 1, so the state must pin down where it ends.',
          },
          {
            q: 'House Robber II puts the houses in a circle. What is the simplest fix?',
            options: [
              'Add a third state to the table',
              'Run House Robber without the first house and without the last house, and take the maximum',
              'Rob every other house',
              'Double the array and run Kadane',
            ],
            answer: 1,
            why: 'The circle adds one conflict, first versus last. Excluding either breaks it into a straight line.',
          },
          {
            q: 'A transition reads only dp[i − 1] and dp[i − 2]. How much memory do you really need?',
            options: ['O(n²)', 'O(n)', 'O(1)', 'O(log n)'],
            answer: 2,
            why: 'Keep two rolling variables and shift them after each step.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For every problem, write the five answers (state, transition, base cases, order, answer) before you write anything else.
          Problems marked <b>Core</b> are the minimum set; mark each one Solved so the <a href="#/review">review queue</a> brings it
          back.
        </p>
      </div>
      <ProblemSet id="dp" />

      <Recap>
        <ul>
          <li>DP solves each distinct subproblem once and builds bigger answers from smaller ones; it needs optimal substructure and overlapping subproblems.</li>
          <li>Every DP is five answers: state, transition, base cases, order and the final entry.</li>
          <li>One-dimensional shapes: count the ways, cheapest path, take or skip, best ending here, try every last piece.</li>
          <li>Find the state from the last decision and what it leaves behind; shrink memory to what the transition reads.</li>
        </ul>
      </Recap>
    </>
  );
}
