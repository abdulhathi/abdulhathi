import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dp-interval';
import { burstBalloons, longestPalSubseq } from '../traces/dp-interval';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const pal = longestPalSubseq('agbdba');
const balloons = burstBalloons([4, 2, 7, 3]);

export default function DpInterval() {
  return (
    <>
      <TopicIntro
        id="dp-interval"
        time="4–5 hours, plus problems"
        before={['dp', 'memoization', 'dp-sequences']}
        learn={[
          'How to describe a problem as "the best answer for every range [i, j]"',
          'The order to fill an interval table so every cell\'s inputs are ready',
          'Four patterns: shrink from both ends, choose the split point, choose the last action, two players on a range',
          'Why "which element goes last?" beats "which goes first?" in merging and bursting problems',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Some problems are about a <b>contiguous range</b>: a substring, a row of balloons, a stick with cut marks, the
          vertices of a polygon. When you make one decision inside the range, what is left is one or two <b>smaller ranges</b>{' '}
          of the same kind. That is the signature of interval DP.
        </p>
        <p>
          Think of a row of dominoes you must clear. If you can always say "after this move, the left part and the right part
          are separate problems", you never need to remember the whole history, only the two ends of the range you are
          working on. So the state is a pair <b>(i, j)</b>, and there are only about n²/2 of them.
        </p>
        <p>
          The brute force tries every order of moves or every way of splitting, which is exponential: 300 balloons have 300!
          burst orders. Interval DP stores one answer per range and builds long ranges out of short ones, usually in{' '}
          <Cost>O(n²)</Cost> states with <Cost>O(n)</Cost> choices each, so <Cost>O(n³)</Cost> in total. That is why these
          problems have n around 100 to 500.
        </p>
        <p>Watch the simplest member of the family: the longest palindromic subsequence of "agbdba".</p>
      </div>

      <Walkthrough
        title="Longest palindromic subsequence, filled one length at a time"
        frames={pal.frames}
        caption={`Each diagonal holds the ranges of one length. The answer ${pal.answer} ("abdba") sits in the top-right corner.`}
      />

      <div className="prose">
        <p>
          Notice the order. A cell (i, j) reads the cell below it (i + 1, j), the cell to its left (i, j − 1), and the cell
          diagonally below-left (i + 1, j − 1). All three are shorter ranges. Filling by length guarantees they are ready.
          Filling with i going <i>downwards</i> from n − 1 and j going upwards from i + 1 works too, for the same reason.
        </p>
      </div>

      <Box kind="key" label="Key idea">
        <p>
          An interval DP is correct when, for every range, you can name a decision that leaves only <b>strictly shorter,
          independent</b> ranges behind. Then fill the table from short ranges to long ones, and the answer for the whole
          input sits at <b>dp[0][n − 1]</b>.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to interval DP. Every signal from every chapter is collected in the <See id="recognition" />.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>Interval DP needs a square table and, often, prefix sums for the cost of a range.</p>
      </div>
      <Structures
        items={[
          { name: '2D table', ts: 'number[][] built with Array.from', ops: 'read / write O(1)', use: 'dp[i][j] for every range. Only cells with i ≤ j are used.' },
          { name: 'Prefix sums', ts: 'number[] of length n + 1', ops: 'range total O(1)', use: 'The cost of merging or the score of what remains: P[j + 1] − P[i].' },
          { name: 'Padded array', ts: 'number[] with sentinels', ops: 'O(1)', use: 'Add 1s around balloons, or 0 and n around cut positions, so the ends need no special case.' },
          { name: 'Memo map (top-down)', ts: 'Map<number, number> keyed by i × n + j', ops: 'get / set O(1) average', use: 'When writing it as a recursion; a plain 2D array is usually faster.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Shrink from both ends</h2>
        <p>
          Look at the two end elements of the range. Often they either belong together (two equal characters of a palindrome)
          or one of them can be dropped. Each cell then depends on its neighbours inside the table, so there is no loop over
          split points and the whole table costs <Cost>O(n²)</Cost>.
        </p>
      </div>
      <Recipe
        name="Shrink from both ends"
        when="the decision only concerns the first and last element of the range, such as matching palindrome ends."
        steps={[
          'Fill the length-1 ranges (and length 2, if they are a special case).',
          'For each longer range [i, j]: if the two ends pair up, combine them with dp[i + 1][j − 1].',
          'Otherwise take the better of dp[i + 1][j] (drop the left end) and dp[i][j − 1] (drop the right end).',
          'Return dp[0][n − 1].',
        ]}
        why="any solution either uses both ends together or leaves at least one of them out, and each case is a shorter range."
        time="O(n²)"
        space="O(n²)"
      />

      <div className="prose">
        <h2>Pattern 2: Choose the split point</h2>
        <p>
          Some decision divides the range at a point k into two independent parts: the root of a tree over leaves i..j, the
          triangle that sits on the side (i, j) of a polygon, the first cut made in a piece of stick. Try every k and keep the
          best. Each of the n² cells tries up to n split points, so the total is <Cost>O(n³)</Cost>.
        </p>
      </div>
      <Recipe
        name="Choose the split point"
        when="one decision splits the range into a left part and a right part that never affect each other."
        steps={[
          'Ranges too short to split cost 0 (or their base value).',
          'For lengths from short to long, and every start i (end j = i + length − 1):',
          'Try every split k: candidate = dp[i][k] + dp[k + 1][j] + the cost of joining them (or dp[i][k] + dp[k][j] when the parts share k).',
          'Keep the best candidate in dp[i][j].',
        ]}
        why="the split decision is made once per range, and both sides are solved optimally on their own."
        time="O(n³)"
        space="O(n²)"
      />
      <VizFigure
        caption="A polygon with vertices 0..5: the side (0, 5) must belong to one triangle (0, k, 5). Here k = 2 leaves two smaller polygons, 0..2 and 2..5, that are solved independently."
        parts={[
          {
            kind: 'graph',
            label: 'triangulation split on side (0, 5)',
            nodes: [
              { id: '0', x: 0, y: 70 },
              { id: '1', x: 60, y: 0 },
              { id: '2', x: 160, y: 0 },
              { id: '3', x: 240, y: 50 },
              { id: '4', x: 220, y: 140 },
              { id: '5', x: 90, y: 160 },
            ],
            edges: [
              { from: '0', to: '1' }, { from: '1', to: '2' }, { from: '2', to: '3' }, { from: '3', to: '4' }, { from: '4', to: '5' },
              { from: '5', to: '0', tone: 'active' }, { from: '0', to: '2', tone: 'match' }, { from: '2', to: '5', tone: 'match' },
            ],
            tones: { '0': 'active', '5': 'active', '2': 'match' },
          },
        ]}
      />

      <div className="prose">
        <h2>Pattern 3: Choose the last action</h2>
        <p>
          Burst Balloons is the classic trap. If you choose the <b>first</b> balloon to burst, its neighbours change, and the
          left and right parts suddenly become neighbours of each other: they are not independent, and the state would have
          to remember which balloons remain. Choose the <b>last</b> balloon in the range instead. When it bursts, everything
          else between i and j is already gone, so its neighbours are exactly the window ends i and j. The balloons on its
          left were burst while it stood as a wall, and so were those on its right: two independent problems.
        </p>
      </div>
      <Walkthrough
        title="Burst Balloons: which balloon goes last in each window?"
        frames={balloons.frames}
        caption={`dp over open windows (i, j) of the padded row. The best total is ${balloons.answer}.`}
      />
      <Recipe
        name="Choose the last action"
        when="the gain of a move depends on its current neighbours, so the order of moves matters."
        steps={[
          'Pad the input so both ends have a neutral neighbour (1 for products, 0 for sums).',
          'dp[i][j] covers the elements strictly between i and j, with i and j still present.',
          'For each k between them, assume k is handled last: gain = dp[i][k] + (value of the last move with neighbours i and j) + dp[k][j].',
          'Keep the best k; the answer is dp[0][n + 1].',
        ]}
        why="fixing the last move freezes its neighbours, which makes the two sides separate subproblems."
        time="O(n³)"
        space="O(n²)"
      />

      <div className="prose">
        <h2>Pattern 4: Two players on a range</h2>
        <p>
          When two players alternately take from either end of a row, what remains is always one contiguous range. Store the
          best <b>score difference</b> (my total minus yours) that the player to move can force. Taking the left end gives{' '}
          <i>value − dp[i + 1][j]</i>, because after your move the opponent is the one maximising the difference on the rest.
          This one idea solves Predict the Winner and the whole Stone Game family; see <See id="game-theory" /> for the theory
          behind it.
        </p>
      </div>
      <Recipe
        name="Score difference on a range"
        when="two players take from either end of a sequence and both play perfectly."
        steps={[
          'dp[i][i] = the value of taking the last item (or 0 if taking it scores nothing).',
          'For each longer range: dp[i][j] = max(gain of taking the left end − dp[i + 1][j], gain of taking the right end − dp[i][j − 1]).',
          'The first player wins (or ties) when dp[0][n − 1] ≥ 0.',
        ]}
        why="in a zero-sum game, your best difference equals your immediate gain minus the opponent's best difference on what you leave."
        time="O(n²)"
        space="O(n²), or O(n) with one row"
      />

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>
          Here is the thinking path for <b>Minimum Cost to Cut a Stick</b>: cuts at given positions, any order, each cut costs
          the length of the piece it cuts.
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every order of the c cuts and add up the costs. That is c! orders, hopeless for c = 100. But notice that after the
          first cut, the stick is two pieces whose cuts never interact again.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Different orders keep producing the same pieces: "the piece between cut 3 and cut 7" appears in thousands of orders,
          and its best internal cost is always the same. A piece is identified by its two boundaries, so the state is a pair of
          boundary indices.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          Sort the cuts and add the stick ends 0 and n. For the piece between boundaries i and j, some cut k inside it is made
          first. It costs pos[j] − pos[i] whatever k is, and leaves pieces (i, k) and (k, j), solved independently. So dp[i][j]
          = (pos[j] − pos[i]) + min over k of dp[i][k] + dp[k][j]. That is Pattern 2.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          With c cuts there are c + 2 boundaries, so about 10⁴ states and 100 choices each: 10⁶ steps. Edge cases: a piece with
          no cut inside costs 0; the stick length can be a million, which is why the table is indexed by cut number, never by
          position. In <See id="dp-optimization" /> you will see how Knuth's trick brings this down to O(c²).
        </p>
      </div>

      <div className="prose">
        <h2>Top-down or bottom-up?</h2>
        <p>Both work for every problem here. Choose based on what makes the order clearest to you.</p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Style</th>
            <th>How you write it</th>
            <th>Good when</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Bottom-up table</td>
            <td>Loop over lengths from short to long, then over starts</td>
            <td>Fast and predictable; no recursion depth worries. The default for n up to 500.</td>
          </tr>
          <tr>
            <td>Top-down memo</td>
            <td>Recursion on (i, j) with a memo table, as in <See id="memoization" /></td>
            <td>Many states are never reached (Scramble String prunes most), or the recursion is easier to see.</td>
          </tr>
          <tr>
            <td>Reverse-start loop</td>
            <td>i from n − 1 down to 0, j from i + 1 up to n − 1</td>
            <td>Same order guarantee as by length, often shorter to write.</td>
          </tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Filling the table row by row from the top: cell (i, j) then reads (i + 1, j) before it exists.</>,
          <>Choosing the <b>first</b> action when the gain depends on neighbours (balloons, merging): the sides are not independent.</>,
          <>Mixing up whether the parts share the split element: [i, k] and [k, j] for polygons and cuts, [i, k] and [k + 1, j] for leaves and stones.</>,
          <>Indexing the table by a huge coordinate (stick length, time) instead of by the few positions that matter.</>,
          <>Forgetting the impossible case before the DP (merging stones when (n − 1) is not divisible by (k − 1)).</>,
          <>Reaching for interval DP when n is 10⁵: n² states will not fit, so look for a greedy or a different state.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'Fill the longest-palindromic-subsequence table for "abca" by hand. What is in the top-right cell?',
            hint: 'Start with 1s on the diagonal. s[0] = s[3] = "a".',
            solution: '3. The ends match, so it is 2 + the answer for "bc", which is 1. One such subsequence is "aba" (or "aca").',
          },
          {
            task: 'For balloons [2, 6, 3] padded to [1, 2, 6, 3, 1], which balloon should burst last, and what is the total?',
            solution:
              'Burst 3 last. Before that, the window holds 2 and 6 between the padding 1 and the 3: bursting 6 first earns 2·6·3 = 36, then 2 earns 1·2·3 = 6, so that window is worth 42. Then 3 earns 1·3·1 = 3, for 45 in total. Making 2 last gives 44 and making 6 last gives 36, so the answer is 45.',
          },
          {
            task: 'Why does the two-player recurrence subtract dp[i + 1][j] instead of adding it?',
            solution: 'dp[i + 1][j] is the difference the opponent can force on the rest, measured from their side. From your side that difference counts against you.',
          },
          {
            task: 'A stick of length 10 with cuts at 2, 4 and 7. Which cut should be made first, and what is the minimum total cost?',
            hint: 'Boundaries are 0, 2, 4, 7, 10. Compute the three pieces with one cut inside first.',
            solution:
              'Cutting 4 first costs 10, leaving [0, 4] with cut 2 (cost 4) and [4, 10] with cut 7 (cost 6): 20. Cutting 7 first: 10 + cost of [0, 7] with cuts 2 and 4 (7 + 4 = 11) = 21. Cutting 2 first: 10 + cost of [2, 10] with cuts 4 and 7 (8 + 5 = 13) = 23. The minimum is 20, cutting at 4 first.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In what order must an interval DP table be filled?',
            options: ['Row by row from the top', 'By increasing range length (or i from the end backwards)', 'Any order, because the table is memoised', 'By increasing value'],
            answer: 1,
            why: 'Every cell reads only shorter ranges. Filling by length, or with i decreasing, guarantees those are ready.',
          },
          {
            q: 'Why does Burst Balloons choose the LAST balloon to burst in a window?',
            options: [
              'Because the last balloon always has the largest value',
              'Because then its neighbours are fixed (the window ends), so the two sides are independent',
              'Because it makes the table smaller',
              'Because the first balloon can be chosen greedily',
            ],
            answer: 1,
            why: 'Everything else in the window is gone when the last balloon bursts, so it multiplies with the window ends, and each side was solved separately.',
          },
          {
            q: 'An interval DP has n² states and tries every split point. n = 2000. Will it pass?',
            options: ['Yes, easily', 'No: n³ = 8 × 10⁹ is too many', 'Only with memoisation', 'Only in TypeScript'],
            answer: 1,
            why: 'Split-point interval DP is O(n³). With n = 2000 you need a smarter idea, such as Palindrome Partitioning II\'s 1D DP over prefixes.',
          },
          {
            q: 'For Predict the Winner, dp[i][j] stores:',
            options: [
              'The first player\'s total score',
              'The best (mover\'s score − opponent\'s score) on nums[i..j]',
              'Whether the first player wins',
              'The number of moves left',
            ],
            answer: 1,
            why: 'Storing the difference for whoever is to move makes the recurrence symmetric: value − dp of what remains.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Start with the palindrome problems, then the split-point problems, then Burst Balloons. Try each for 20–30 minutes
          before opening a hint, and always write the state, the fill order and the recurrence on paper first. Problems marked{' '}
          <b>Core</b> are the minimum set.
        </p>
      </div>
      <ProblemSet id="dp-interval" />

      <Recap>
        <ul>
          <li>Interval DP stores one answer per range [i, j] and builds long ranges from shorter ones: O(n²) states, O(n³) with split points.</li>
          <li>Fill by increasing length (or i from the end), so every cell's inputs are ready.</li>
          <li>Four patterns: shrink from both ends, choose the split point, choose the last action, score difference for two players.</li>
          <li>When a move's value depends on its neighbours, decide what happens last, not first.</li>
        </ul>
      </Recap>
    </>
  );
}
