import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/dp-grid';
import { dungeon, maximalSquare, minPathSum, uniquePathsWithObstacles } from '../traces/dp-grid';
import { Walkthrough } from '../viz/Walkthrough';

const paths = uniquePathsWithObstacles([[0, 0, 0, 0], [0, 1, 0, 0], [0, 0, 0, 1], [1, 0, 0, 0]]);
const cheapest = minPathSum([[2, 1, 4, 3], [5, 2, 1, 8], [3, 6, 2, 1]]);
const knight = dungeon([[-3, 2, -4], [-6, -8, 3], [5, -2, -5]]);
const squares = maximalSquare([[1, 0, 1, 1], [1, 1, 1, 1], [0, 1, 1, 1], [1, 1, 1, 0]]);

export default function GridDp() {
  return (
    <>
      <TopicIntro
        id="dp-grid"
        time="4–5 hours, plus problems"
        before={['dp', 'matrix']}
        learn={[
          'How a grid becomes a DP table, and why moving only right and down makes the fill order obvious',
          'Counting paths, cheapest paths, and squares that end at a cell',
          'When to fill backwards from the goal, as in Dungeon Game',
          'How to add a remainder, a sign or a move count to each cell, and how to run two walkers at once',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A grid where you may only move right or down is a DP table already laid out for you. Each cell has at most two ways in:
          from the cell above and from the cell to its left. So whatever you want to know about a cell (how many paths reach it, the
          cheapest way to reach it) is built from those two neighbours, and both are filled before it if you go row by row, left to
          right.
        </p>
        <p>
          Compare that with trying every path. An m × n grid has about <Cost>C(m + n − 2, m − 1)</Cost> right-and-down paths, which
          for a 20 × 20 grid is over 35 billion. The table has 400 cells, each computed once from two others: <Cost>O(m · n)</Cost>.
        </p>
        <p>Watch the table fill. Obstacles hold 0, so paths simply flow around them.</p>
      </div>

      <Walkthrough
        title="Unique Paths II: each cell = above + left"
        frames={paths.frames}
        caption={`Blue cells are the two predecessors being added. The bottom-right cell is the answer: ${paths.paths} paths.`}
      />

      <Box kind="key" label="Key idea">
        <p>
          Before filling a grid table, check that every cell's predecessors are filled before the cell itself. With right and down
          moves, reading order works. With moves in all four directions there are cycles, and you need layers (by move count),
          backwards filling, or a graph algorithm instead.
        </p>
      </Box>

      <div className="prose">
        <h2>When to use it</h2>
        <p>
          These clues point to grid DP. The <See id="recognition" /> collects every signal from every chapter.
        </p>
      </div>
      <Signals items={topic.signals} />

      <div className="prose">
        <h2>Data structures you will use</h2>
        <p>
          A full 2D table is the easiest to reason about. Because each row reads only the row above, you can almost always shrink it
          to one row.
        </p>
      </div>
      <Structures
        items={[
          { name: '2D table', ts: 'Array.from({ length: m }, () => new Array(n).fill(0))', ops: 'read and write O(1)', use: 'The clearest version: one entry per cell. Build each row separately; filling with the same row object shares it.' },
          { name: 'One rolling row', ts: 'new Array(n).fill(0)', ops: 'O(1)', use: 'When a cell reads only above and left: row[c] still holds "above", row[c − 1] already holds "left".' },
          { name: 'Two rows (current and next)', ts: 'let cur = …, next = …', ops: 'O(1)', use: 'Layered DPs (moves, probabilities) and transitions that read diagonals.' },
          { name: '3D table', ts: 'nested arrays, or a flat array indexed r × n × k + c × k + x', ops: 'O(1)', use: 'An extra number per cell: a remainder, a move count, a second walker.' },
        ]}
      />

      <div className="prose">
        <h2>Pattern 1: Count the paths</h2>
        <p>
          paths(r, c) = paths(r − 1, c) + paths(r, c − 1), with paths(0, 0) = 1 and obstacles forced to 0. With one rolling row the
          update is a single addition per cell: row[c] already holds the value from above, and row[c − 1] was just updated, so it
          holds the value from the left.
        </p>
      </div>
      <Recipe
        name="Count paths in a grid"
        when="moves go only right and down (or only down), and you need the number of paths."
        steps={[
          'paths(0, 0) = 1. Cells that cannot be entered hold 0.',
          'Fill row by row, left to right: paths(r, c) = paths from above + paths from the left (treat cells outside the grid as 0).',
          'Apply the modulo after each addition if the problem asks for one.',
          'Return the value in the target cell.',
        ]}
        why="every path into a cell has exactly one last move, from above or from the left."
        time="O(m · n)"
        space="O(n) with one row"
      />

      <div className="prose">
        <h2>Pattern 2: Cheapest path</h2>
        <p>
          Replace the sum with a minimum and add the cell's own cost. Minimum Path Sum reads above and left; Minimum Falling Path Sum
          reads the three cells above; the harder version needs "the best of the previous row except my column", which you can get
          in O(1) by remembering the smallest and the second smallest value of that row.
        </p>
      </div>
      <Walkthrough
        title="Minimum Path Sum: take the cheaper way in"
        frames={cheapest.frames}
        caption={`Green is the predecessor chosen, faded the one rejected. Cheapest total: ${cheapest.best}.`}
      />
      <Recipe
        name="Cheapest path in a grid"
        when="each cell has a cost and you want the cheapest (or most valuable) path under right-and-down style moves."
        steps={[
          'best(start) = the start cell\'s cost.',
          'For every other cell in fill order: best(r, c) = cost(r, c) + the minimum of best over the cells it can be entered from.',
          'Cells with only one possible predecessor (first row, first column, grid edges) take that one.',
          'The answer is the target cell, or the best over the last row if the path may end anywhere there.',
        ]}
        why="the cheapest route to a cell continues the cheapest route to one of its predecessors."
        time="O(m · n × predecessors)"
        space="O(n) with rolling rows"
      />

      <div className="prose">
        <h2>Pattern 3: Fill backwards from the goal</h2>
        <p>
          Sometimes the condition is about the future, not the past. In Dungeon Game the knight's health must stay positive the whole
          way, so the question for each room is "how much health do I need <i>from here</i> to finish?". That depends on the rooms
          after it, so fill from the princess back to the start. Triangle is easier backwards too: filling from the base up leaves
          the answer alone at the top.
        </p>
      </div>
      <Walkthrough
        title="Dungeon Game: least health needed, from the goal back"
        frames={knight.frames}
        caption={`need(r, c) = max(1, min(need below, need right) − room value). The knight must start with ${knight.start}.`}
      />
      <Recipe
        name="Backwards grid DP"
        when="the constraint is about the rest of the path (survive to the end, reach the base), or the answer is naturally read at the start."
        steps={[
          'Define the state as "what is needed (or best) from this cell to the goal".',
          'Set the goal cell (and, if helpful, padding cells beyond the grid) as the base case.',
          'Fill from the goal towards the start: each cell reads the cells you can move to next.',
          'Read the answer at the start cell.',
        ]}
        why="the future of a cell is decided by the cells after it, which are already filled."
        time="O(m · n)"
        space="O(n) with one row"
      />

      <div className="prose">
        <h2>Pattern 4: Squares ending at a cell</h2>
        <p>
          The largest all-1 square whose bottom-right corner is (r, c) has side 1 + min(above, left, diagonal). The smallest of the
          three is the bottleneck: if any neighbour only supports a smaller square, the new square cannot be bigger than that plus
          one. The same table also counts squares, because a cell with side s ends exactly s squares.
        </p>
      </div>
      <Walkthrough
        title="Maximal Square: the smallest neighbour limits the square"
        frames={squares.frames}
        caption={`Blue cells are the three neighbours read. Largest square: side ${squares.side}, area ${squares.side * squares.side}.`}
      />
      <Recipe
        name="Largest square ending here"
        when="you need the largest, or the number of, squares made entirely of 1s."
        steps={[
          'side(r, c) = 0 if the cell is 0.',
          'Otherwise side(r, c) = 1 + min(side above, side to the left, side diagonally above-left), treating outside cells as 0.',
          'Track the largest side (area = side²), or add up all side values to count squares.',
        ]}
        why="a square of side s ending at (r, c) contains squares of side s − 1 ending at each of the three neighbours."
        time="O(m · n)"
        space="O(n) with one row and a saved diagonal"
      />

      <div className="prose">
        <h2>Pattern 5: Extra state per cell</h2>
        <p>
          When one number per cell is not enough, add a dimension. For "path sum divisible by k", keep a count for each remainder.
          For products, keep the largest and the smallest. When moves go in all four directions, cycles appear, but if the problem
          limits the number of moves you can layer the DP by moves: layer t + 1 is computed from layer t, and the cycles disappear.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr>
            <th>Problem</th>
            <th>Extra state</th>
            <th>Why it is needed</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Paths in Matrix Whose Sum Is Divisible by K</td><td>Sum mod k</td><td>The count alone cannot tell you which paths end on a multiple of k.</td></tr>
          <tr><td>Maximum Non Negative Product in a Matrix</td><td>Largest and smallest product</td><td>A negative cell turns the smallest into the largest.</td></tr>
          <tr><td>Out of Boundary Paths</td><td>Moves made (as layers)</td><td>Four-direction moves loop; counting moves gives a fill order.</td></tr>
          <tr><td>Knight Probability in Chessboard</td><td>Moves made (as layers)</td><td>Probability spreads move by move.</td></tr>
        </tbody>
      </TableWrap>
      <Recipe
        name="Grid DP with an extra dimension"
        when="the answer for a cell depends on a property of the path so far (remainder, sign, number of moves)."
        steps={[
          'Name the extra quantity and its range (k remainders, 2 extremes, maxMove layers).',
          'Make the state (r, c, extra) and write how each predecessor\'s states map into this cell\'s states.',
          'Fill in an order where predecessors come first: reading order for right-and-down moves, layer by layer for counted moves.',
          'Read the answer from the right extra value at the target (remainder 0, the largest product, the sum over all cells).',
        ]}
        why="two paths into the same cell with the same extra value have the same future, so they can be merged."
        time="O(m · n × extra range × predecessors)"
        space="O(n × extra range) with rolling rows"
      />

      <div className="prose">
        <h2>Pattern 6: Two walkers at once</h2>
        <p>
          Cherry Pickup asks for a trip to the corner and back. Reverse the return trip and it becomes a second walker going forward.
          Move both walkers one step at a time: after t steps both satisfy row + col = t, so the state is (t, row of walker 1, row of
          walker 2), and when they share a cell its cherry counts once. Cherry Pickup II is the same idea with both robots always on
          the same row.
        </p>
      </div>
      <Recipe
        name="Two walkers in lockstep"
        when="two paths through the same grid interact, for example by sharing what they collect."
        steps={[
          'Make both walkers take one step per round, so a single number (the step or the row) is shared.',
          'State = (shared step, position of walker 1, position of walker 2).',
          'Each state takes the best of all combinations of the two walkers\' previous moves, plus what both collect now (once if they share a cell).',
          'Skip states where either walker is outside the grid or blocked.',
        ]}
        why="planning the paths together sees every interaction; planning them one after another is greedy and fails."
        time="O(steps × positions²)"
        space="O(positions²) with rolling layers"
      />

      <div className="prose">
        <h2>Worked example: Dungeon Game</h2>
        <p>
          A knight walks from the top-left to the bottom-right of a grid, moving right or down. Each room changes his health, and
          health must never reach 0. What is the smallest starting health that works?
        </p>
        <Step n={1}>Brute force first</Step>
        <p>
          Try every path, track the lowest health along it, and take the best. With up to 200 × 200 rooms the number of paths is
          astronomical.
        </p>
        <Step n={2}>Why a forward DP fails</Step>
        <p>
          The natural forward table, "the most health I can have at this room", does not work. One path can end with lots of health
          after dipping dangerously low; another stays safe but ends lower. One number per cell cannot capture both the current health
          and the lowest point.
        </p>
        <Step n={3}>Turn the question around</Step>
        <p>
          Ask instead: entering room (r, c), how much health do I need to finish? From there I go to the safer of the two next rooms,
          so I need min(need below, need right), minus what this room gives me, but never less than 1. Every quantity depends only on
          rooms closer to the princess, so fill from the bottom-right corner backwards.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          <Cost>O(m · n)</Cost> time, <Cost>O(n)</Cost> space with one row. A single room with a big bonus still needs a starting
          health of 1. A deadly last room needs 1 − (its value). Padding the table with infinity, except the two cells next to the
          princess which hold 1, removes all edge cases.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Building a 2D array by filling the outer array with one inner array: every row is then the same object, so writing one cell writes a whole column.</>,
          <>Forgetting that the first row and first column have only one predecessor (or initialising them all to 1 despite an obstacle).</>,
          <>Filling forwards when the constraint is about the rest of the path (Dungeon Game).</>,
          <>Starting a minimum at 0 when values can be negative.</>,
          <>Taking a modulo in the middle of a maximisation (products): the comparison then compares remainders, not values.</>,
          <>Planning two interacting paths one after another instead of together.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'How many right-and-down paths cross a 3 × 3 grid with no obstacles? Fill the table.',
            solution: 'Rows: 1 1 1 / 1 2 3 / 1 3 6. There are 6 paths.',
          },
          {
            task: 'Minimum Path Sum on [[1, 2], [5, 1]]. Fill the best table.',
            solution: 'best = [[1, 3], [6, 4]]. The cheapest total is 4 (right, then down).',
          },
          {
            task: 'Dungeon Game on a single row [−3, 5, −4]. What starting health is needed?',
            hint: 'Fill from the right: the last room needs max(1, 1 − (−4)).',
            solution: 'need = [4, 1, 5]: the last room needs 5, the middle room needs max(1, 5 − 5) = 1, the first needs max(1, 1 + 3) = 4. Start with 4.',
          },
          {
            task: 'In Maximal Square, a 1-cell has above = 2, left = 3, diagonal = 2. What is its side, and why not 4?',
            solution: 'Side 3 = 1 + min(2, 3, 2). A side-4 square would need a side-3 square ending above, but only side 2 fits there.',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Moves go only right or down. In which order can you fill the table?',
            options: ['Any order', 'Row by row, left to right', 'Column by column, bottom to top', 'Diagonals from the bottom-right'],
            answer: 1,
            why: 'Each cell reads the cell above and the cell to the left, and reading order fills both before it.',
          },
          {
            q: 'Why does Dungeon Game fill the table backwards?',
            options: [
              'It is faster',
              'The health needed at a room depends on the rooms after it, not before it',
              'Because the princess is at the bottom-right',
              'To save memory',
            ],
            answer: 1,
            why: 'The constraint is about surviving the rest of the path, so each room\'s answer depends on later rooms.',
          },
          {
            q: 'Maximal Square: side(r, c) = 1 + min(above, left, diagonal). Why the minimum?',
            options: [
              'To keep the numbers small',
              'The smallest neighbour square limits how far the new square can extend',
              'Because squares cannot overlap',
              'It counts the number of squares',
            ],
            answer: 1,
            why: 'A larger square would need larger squares at all three neighbours; the weakest one sets the limit.',
          },
          {
            q: 'A ball moves in four directions for at most 50 moves. How do you get a valid fill order?',
            options: ['Row by row', 'Layer the DP by the number of moves made', 'Fill backwards', 'There is none; use backtracking'],
            answer: 1,
            why: 'Free movement creates cycles, but each move goes from layer t to layer t + 1, so layers can be filled in order.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, draw a small table and fill five or six cells by hand before deciding on the recurrence. Problems marked{' '}
          <b>Core</b> are the minimum set; mark each one Solved so the <a href="#/review">review queue</a> brings it back.
        </p>
      </div>
      <ProblemSet id="dp-grid" />

      <Recap>
        <ul>
          <li>With right-and-down moves, a grid is a DP table filled in reading order; each cell reads above and left.</li>
          <li>Counting adds the predecessors, cheapest path takes their minimum plus the cell, squares take 1 + the minimum of three.</li>
          <li>Fill backwards when the constraint is about the rest of the path; add a dimension when one number per cell is not enough.</li>
          <li>Interacting paths move together in one state; one rolling row usually replaces the full table.</li>
        </ul>
      </Recap>
    </>
  );
}
