import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/backtracking';
import { nQueens, subsets } from '../traces/backtracking';
import { Walkthrough } from '../viz/Walkthrough';

const subsetRun = subsets([1, 2, 3]);
const queens = nQueens(4);

export default function Backtracking() {
  return (
    <>
      <TopicIntro
        id="backtracking"
        time="5–6 hours, plus problems"
        before={['recursion', 'dfs']}
        learn={[
          'The choose, explore, un-choose template that generates subsets, combinations and permutations',
          'How to avoid duplicate answers when the input has duplicates',
          'Pruning: abandoning a branch the moment it cannot lead to an answer',
          'Constraint puzzles (N-Queens, Sudoku) and the exact cover idea behind Algorithm X and Dancing Links',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          Think of solving a maze on paper with a pencil. You walk forward, making a choice at each fork. When you hit a dead end,
          you rub out your last few steps back to the most recent fork and take a different branch. You never draw the same route
          twice, and you never continue down a corridor you already know is blocked. That is <b>backtracking</b>.
        </p>
        <p>
          In code you build a solution one decision at a time in a <b>path</b>. For each option at the current step you{' '}
          <b>choose</b> it (add it to the path), <b>explore</b> (recurse to make the remaining decisions), then{' '}
          <b>un-choose</b> it (remove it from the path) so the next option starts from the same state. It is depth-first search
          (<See id="dfs" />) over a tree of partial solutions that you never build explicitly.
        </p>
        <p>
          Backtracking is the right tool when the problem asks for <b>all</b> solutions, or when the limits are small (n ≤ 10 to
          20). The number of answers is often exponential (2ⁿ subsets, n! permutations), so no algorithm can be faster than
          producing them one by one. The skill is to produce each answer exactly once and to cut branches early.
        </p>
      </div>

      <Walkthrough
        title="Subsets of [1, 2, 3]: choose, explore, un-choose"
        frames={subsetRun.frames}
        caption={`Each node of the recursion tree stands for one subset and shows the number added last; the route from the root spells the subset. ${subsetRun.results.length} subsets in total.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Every backtracking solution is the same three lines inside a loop: <b>choose</b> an option, <b>explore</b> the rest,{' '}
          <b>un-choose</b>. Whatever you change on the way down (the path, a used flag, a sum, a marked cell), you change back on the
          way up. Bugs almost always come from a change that is not undone, or from saving the path itself instead of a copy.
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
          { name: 'Path array', ts: 'number[] with push and pop', ops: 'O(1)', use: 'The partial solution. Save a copy (slice or spread) when it is complete.' },
          { name: 'Used flags', ts: 'boolean[] or a bitmask', ops: 'O(1)', use: 'Permutations: which elements are already in the path.' },
          { name: 'Constraint sets', ts: 'Set<number>, boolean[] or bitmasks', ops: 'O(1)', use: 'N-Queens columns and diagonals; Sudoku rows, columns and boxes.' },
          { name: 'Per-level Set', ts: 'new Set() inside the loop of one call', ops: 'O(1)', use: 'Skipping duplicate values at the same depth when you cannot sort.' },
          { name: 'Result list', ts: 'number[][] or string[]', ops: 'append O(length)', use: 'Collect the answers.' },
        ]}
      />

      <div className="prose">
        <h2>The template</h2>
      </div>
      <Recipe
        name="Choose, explore, un-choose"
        when="you must list every solution, or search all possibilities under small limits."
        steps={[
          'Decide what one decision is (include this element? which element goes in this position? where does this piece end?) and what the state is (path, used flags, running sum).',
          'If the state is a complete solution, record a copy and return.',
          'If the state can no longer lead to a solution (it broke a rule or overshot a target), return immediately: that is pruning.',
          'For each option at this decision: apply it to the state (choose), recurse (explore), then undo it exactly (un-choose).',
        ]}
        why="each root-to-node route in the search tree is one partial solution; undoing every change keeps sibling branches independent."
        time="O(number of nodes in the search tree × work per node)"
        space="O(depth) besides the output"
      />

      <div className="prose">
        <h2>Pattern 1: Subsets</h2>
        <p>
          Two equivalent views. <b>Include or skip</b>: walk the elements and branch twice at each, giving a binary tree with 2ⁿ
          leaves. <b>Add any later element</b>: from the current subset, try adding each element after the last one used; every node
          of this tree is an answer, as the walkthrough shows. The second view is the one that extends to combinations and target
          sums.
        </p>
        <h3>Handling duplicates</h3>
        <p>
          If the input contains duplicates, sort it first. Then, at the same level of the search, using the second copy of a value
          produces exactly the same subsets as using the first. So skip an element if it equals the previous one <i>and</i> it is not
          the first option at this level (the index is greater than the level's start). A copy may still be used deeper in the path.
          When sorting is not allowed (the order of the input matters), keep a small Set of values already tried at each level.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 2: Combinations and target sums</h2>
        <p>
          To list each combination once regardless of order, only ever add elements in increasing index order. Combination Sum adds
          two twists: a number may repeat (recurse with the same index), and the branch dies as soon as the running sum passes the
          target. Sort the candidates so that once one is too big, every later one is too, and you can break out of the loop.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Variant</th>
            <th>Next call starts at</th>
            <th>Duplicates in input?</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Subsets, combinations (each element once)</td><td>i + 1</td><td>Sort, skip equal values at the same level</td></tr>
          <tr><td>Combination Sum (reuse allowed)</td><td>i (the same index)</td><td>Input has none</td></tr>
          <tr><td>Permutations (order matters)</td><td>0, skipping used elements</td><td>Sort, use equal values left to right</td></tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 3: Permutations</h2>
        <p>
          A permutation fills positions one at a time, and any unused element may come next. Keep a <b>used</b> array: mark an element
          before recursing and unmark it after. For duplicates, sort and require that equal values are placed in their original order:
          skip nums[i] if it equals nums[i − 1] and nums[i − 1] is not currently used. There are n! permutations, so the work is at
          least <Cost>O(n · n!)</Cost> just to write them down.
        </p>

        <h2>Pattern 4: Partitioning a string</h2>
        <p>
          Here the decision is where the next piece ends. Try every end position, keep the piece only if it is valid (a palindrome,
          a number from 0 to 255 without leading zeros, an operand), and recurse on the rest of the string. Expression Add Operators
          adds a choice of operator before each piece, and carries the last term so multiplication can bind tighter than addition.
        </p>

        <h2>Pattern 5: Grid paths</h2>
        <p>
          In Word Search, a cell may not be reused within one path, but a different path may use it. So the "visited" mark belongs to
          the current path only: set it when you step onto a cell, and clear it when you step back. This is the difference between
          backtracking on a grid and the flood fill in <See id="dfs" />, where visited marks are permanent.
        </p>
      </div>

      <div className="prose">
        <h2>Pattern 6: Constraint satisfaction and exact cover</h2>
        <p>
          Puzzles such as N-Queens and Sudoku place items under rules. Make one decision per step (one queen per row, one digit per
          empty cell), check the rules in O(1) with sets of what is already taken, and back up the moment a rule fails. The earlier you
          detect failure, the more of the tree you never visit.
        </p>
      </div>
      <Walkthrough
        title="4-Queens: place, check, back up"
        frames={queens.frames}
        caption={`Green = queen, × = attacked, blue = still free in the next row. The 4 × 4 board has ${queens.solutions} solutions; this search stops at the first.`}
      />
      <div className="prose">
        <h3>Good pruning habits</h3>
        <ul>
          <li><b>Fail fast:</b> check constraints when you make a choice, not when the solution is complete.</li>
          <li><b>Most constrained first:</b> in Sudoku, fill the empty cell with the fewest possible digits next. A cell with one option costs nothing to try; a dead cell (zero options) ends the branch at once.</li>
          <li><b>Big items first:</b> when splitting numbers into equal groups, place the largest first; they fail sooner.</li>
          <li><b>Break symmetry:</b> if two buckets are both empty, putting a number in either gives the same result, so only try one.</li>
          <li><b>Bounds:</b> if what is left cannot possibly reach the goal (not enough numbers, not enough digits), stop.</li>
        </ul>
        <h3>Exact cover, Algorithm X and Dancing Links</h3>
        <p>
          Many puzzles are <b>exact cover</b> problems: pick some rows of a 0/1 table so that every column has exactly one 1. For
          Sudoku, each row of the table is a choice "put digit d in cell (r, c)", and the 324 columns are the constraints: each cell
          filled once, each digit once per row, once per column, once per box. Every choice covers exactly four columns. Knuth's{' '}
          <b>Algorithm X</b> is backtracking on this table: pick the column with the fewest 1s (the most constrained constraint), try
          each row that covers it, remove all rows that clash, recurse, then restore. <b>Dancing Links</b> is the trick that makes the
          remove and restore steps O(1): the table is stored as circular doubly linked lists, and a removed node remembers its
          neighbours so it can be put back in exactly the same place (see <See id="doubly-linked-list" />). N-Queens fits the same
          model, with one twist: every row and column must be covered exactly once, but each diagonal at most once. In interviews the row, column and box sets above are enough; know the
          names and the idea.
        </p>
      </div>

      <div className="prose">
        <h2>Worked example: how to think through a new problem</h2>
        <p>The thinking path for <b>Partition to K Equal Sum Subsets</b>: up to 16 numbers, split into k groups of equal sum.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Assign each number to one of k groups and check the sums at the end: <Cost>O(kⁿ)</Cost>. For k = 4 and n = 16 that is 4
          billion assignments. Correct, but you need to cut most of them.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          Every group must reach target = total / k. Many assignments overshoot a group early and are still carried to the end. And
          groups are interchangeable: putting the first number in group 1 or group 3 gives mirror-image searches.
        </p>
        <Step n={3}>Prove the prunings</Step>
        <p>
          Never add a number to a group if it would pass the target: that group can never be fixed later because numbers are positive.
          Sort descending, so large numbers, which have the fewest places to go, are placed first and failures appear early. If placing
          a number into an empty group fails, placing it into another empty group fails the same way, so stop trying.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          If total is not divisible by k, or the largest number exceeds the target, answer false immediately. The worst case is still
          exponential, but the prunings make the search fast for n ≤ 16. If you need a guarantee, the bitmask DP in{' '}
          <See id="bitmask" /> runs in <Cost>O(n · 2ⁿ)</Cost>.
        </p>
      </div>

      <div className="prose">
        <h2>Backtracking or dynamic programming?</h2>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>The problem asks for</th>
            <th>Use</th>
            <th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Every solution, listed</td><td>Backtracking</td><td>The output is exponential anyway.</td></tr>
          <tr><td>The number of solutions, or the best one</td><td>DP or memoisation (<See id="memoization" />)</td><td>Overlapping subproblems can be counted once instead of re-explored.</td></tr>
          <tr><td>Whether any solution exists, small n</td><td>Backtracking with strong pruning, or bitmask DP</td><td>Pruning often finds the answer quickly; bitmask DP gives a guarantee.</td></tr>
        </tbody>
      </TableWrap>

      <Pitfalls
        items={[
          <>Saving the path array itself instead of a copy: every saved answer ends up as the same (finally empty) array.</>,
          <>Forgetting to undo a change (a used flag, a marked cell, a running sum) on the way back.</>,
          <>Duplicate answers: sort and skip equal values at the same level, with the condition i &gt; start, not i &gt; 0.</>,
          <>Starting the next call at the wrong index: i + 1 for no reuse, i for reuse, 0 for permutations.</>,
          <>Checking constraints only at the end instead of when each choice is made.</>,
          <>Using backtracking to count when the subproblems repeat. Count with DP instead.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'How many nodes does the "add any later element" subset tree have for 4 distinct elements? How many leaves?',
            solution: '16 nodes (one per subset). Leaves are subsets containing the last element: 8 of them.',
          },
          {
            task: 'For [1, 2, 2] with the Subsets II rule (skip if i > start and nums[i] equals nums[i − 1]), list the subsets produced.',
            solution: '[], [1], [1, 2], [1, 2, 2], [2], [2, 2]: six subsets, no duplicates.',
          },
          {
            task: 'Generate Parentheses with n = 2: list every string, and explain why ")(" is never even started.',
            solution: '"(())" and "()()". A ")" may only be added while close < open, and at the start open is 0.',
          },
          {
            task: 'In 4-Queens, a queen sits at row 0, column 1. Which columns of row 1 are free?',
            solution: 'Only column 3. Column 1 is taken, and columns 0 and 2 are on its diagonals.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'In Combination Sum (numbers may repeat), where does the recursive call start?',
            options: ['At index 0', 'At the same index i', 'At index i + 1', 'At the end of the array'],
            answer: 1,
            why: 'Staying at i allows the same number again; never going back to smaller indices prevents reordered duplicates.',
          },
          {
            q: 'Why must Word Search unmark a cell when the DFS returns?',
            options: [
              'To save memory',
              'Because the cell is only used by the current path; other paths may need it',
              'Because the grid must be returned unchanged',
              'It does not need to',
            ],
            answer: 1,
            why: 'A failed path must not block a different path from using the same cell.',
          },
          {
            q: 'Sorted input [1, 1, 2]. In Permutations II, when is the second 1 allowed to be placed?',
            options: ['Always', 'Only after the first 1 is already in the path', 'Only at position 0', 'Never'],
            answer: 1,
            why: 'Forcing equal values to be used left to right means each distinct arrangement is built once.',
          },
          {
            q: 'In Algorithm X for Sudoku, what do the columns of the exact cover table represent?',
            options: ['The 81 cells', 'The constraints: each cell filled once, each digit once per row, column and box', 'The digits 1 to 9', 'The empty cells'],
            answer: 1,
            why: 'There are 4 × 81 = 324 constraints; each (cell, digit) choice covers exactly four of them.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          Subsets, Permutations and Combination Sum are the three templates: write each from memory until it takes five minutes. Then
          learn the duplicate rules (Subsets II, Permutations II) and the pruning habits. Mark problems Solved so the{' '}
          <a href="#/review">review queue</a> brings them back.
        </p>
      </div>
      <ProblemSet id="backtracking" />

      <Recap>
        <ul>
          <li>Backtracking is DFS over partial solutions: choose, explore, un-choose, and undo every change on the way back.</li>
          <li>Record a copy of the path; start the next call at i + 1 (no reuse), i (reuse) or 0 with used flags (permutations).</li>
          <li>Duplicates: sort, then skip equal values at the same level; or keep a per-level Set when sorting is not allowed.</li>
          <li>Prune early: check rules when choosing, fill the most constrained spot first, place big items first, break symmetry.</li>
          <li>Exact cover (Algorithm X, Dancing Links) is the general form of puzzles like Sudoku and N-Queens.</li>
        </ul>
      </Recap>
    </>
  );
}
