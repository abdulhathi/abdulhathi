import {
  Box, Cost, Exercises, Pitfalls, Quiz, Recap, Recipe, See, Signals, Step, Structures, TableWrap, TopicIntro,
} from '../components/Content';
import { ProblemSet } from '../components/ProblemSet';
import { topic } from '../topics/matrix';
import { diagonalKeys, rotate, setZeroes, spiral } from '../traces/matrix';
import { VizFigure } from '../viz/Viz';
import { Walkthrough } from '../viz/Walkthrough';

const spiralRun = spiral([
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
]);
const rotation = rotate([
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
]);
const zeroes = setZeroes([
  [1, 2, 3, 4],
  [5, 0, 7, 8],
  [9, 10, 11, 0],
  [13, 14, 15, 16],
]);

export default function Matrix() {
  return (
    <>
      <TopicIntro
        id="matrix"
        time="3–4 hours, plus problems"
        before={['array', 'two-pointers']}
        learn={[
          'Moving around a grid with rows, columns and direction offsets, without off-by-one errors',
          'Naming diagonals with r − c and r + c',
          'Spiral walks with four shrinking boundaries',
          'Rotating in place with a transpose and a reversal, and marking cells in place to save memory',
          'The staircase search on matrices sorted by rows and columns',
        ]}
      />

      <div className="prose">
        <h2>The idea</h2>
        <p>
          A matrix is a spreadsheet: rows going down, columns going across, and a cell at every crossing. In TypeScript it is an array
          of rows, and the cell in row r and column c is <b>matrix[r][c]</b>. Row first, then column, always. Most matrix problems
          are not about clever algorithms at all; they are about moving around the grid precisely, so that every cell is visited
          exactly once, nothing falls off an edge, and an update does not destroy values you still need.
        </p>
        <p>
          A few small ideas do almost all the work. Treat directions as data (a list of row and column offsets), not as four copies of
          the same code. Give each diagonal a name, so you can loop over it or group by it. Keep boundaries that shrink as you finish
          a side. Turn complex moves into simple ones: a rotation is a transpose followed by a flip. Watch the classic spiral walk.
        </p>
      </div>

      <Walkthrough
        title="Spiral order with four shrinking boundaries"
        frames={spiralRun.frames}
        caption="Grey cells are done. After each side, one boundary moves inward, so no cell is ever visited twice."
      />

      <Box kind="key" label="Key idea">
        <p>
          Describe the grid walk with a few numbers you can check: boundaries, a direction, or a diagonal key such as r − c. When the
          walk is defined by those numbers, the code becomes a loop over them, and the edge cases (one row, one column, a single cell)
          become checks on the numbers instead of special cases.
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
          { name: '2D array', ts: 'number[][] (an array of row arrays)', ops: 'read or write matrix[r][c] O(1)', use: 'The grid itself. rows = matrix.length, cols = matrix[0].length.' },
          { name: 'New grid of a given size', ts: 'Array.from, making a fresh row for each index', ops: 'O(rows × cols) to build', use: 'Results of a different shape (transpose, reshape). Never fill with the same row array: all rows would be one object.' },
          { name: 'Direction offsets', ts: 'array of [dr, dc] pairs', ops: 'O(1) per neighbour', use: 'Visiting the 4 side neighbours, the 8 surrounding cells, or turning right in a spiral.' },
          { name: 'Flat index', ts: 'k = r × cols + c', ops: 'r = floor(k / cols), c = k mod cols', use: 'Reshaping, shifting, treating the grid as one array, or using a cell as a single-number key.' },
          { name: 'Map keyed by diagonal', ts: 'Map<number, number[]> with key r − c', ops: 'O(1) average', use: 'Grouping or sorting the cells of each diagonal.' },
        ]}
      />
      <Box kind="warn" label="TypeScript trap">
        <p>
          Building a grid by calling fill on the outer array with one row array looks right, but it puts the <b>same</b> row object
          in every slot, so writing to one row changes them all. Create each row separately, for example with Array.from and a
          function that returns a fresh row each time.
        </p>
      </Box>

      <div className="prose">
        <h2>Pattern 1: Index arithmetic</h2>
        <p>
          Reading a matrix row by row (row-major order) numbers its cells 0, 1, 2, ... up to rows × cols − 1. The cell (r, c) gets the
          number k = r × cols + c, and the number k sits at row floor(k / cols), column k mod cols. With that translation, a matrix
          becomes one long array whenever that is easier: reshaping is copying k to k, and shifting the grid is moving k to (k + shift)
          mod total. The transpose is the other basic move: (r, c) goes to (c, r), and an m × n matrix becomes n × m.
        </p>

        <h2>Pattern 2: Diagonals</h2>
        <p>
          Walking down-right from a cell adds 1 to both r and c, so their <b>difference r − c never changes</b>. Every ↘ diagonal has
          its own value of r − c, from −(cols − 1) to rows − 1. Walking down-left adds 1 to r and subtracts 1 from c, so on a ↙
          anti-diagonal the <b>sum r + c</b> is constant. Those two numbers are names for diagonals: use them as map keys (Sort the
          Matrix Diagonally), as loop variables (Diagonal Traverse), or to check a property cell by cell (a Toeplitz matrix has every
          cell equal to its up-left neighbour).
        </p>
      </div>
      <VizFigure
        parts={[diagonalKeys(4, 5, 'r-c'), diagonalKeys(4, 5, 'r+c')]}
        caption="Left: r − c is the same along each ↘ diagonal (the main diagonal, 0, is highlighted). Right: r + c is the same along each ↙ anti-diagonal."
      />

      <div className="prose">
        <h2>Pattern 3: Layers and spirals</h2>
        <p>
          A spiral visits the outer ring, then the next ring in, and so on. Keep four boundaries for the ring still to visit. Each side
          is a straight walk between two boundaries, and after walking it you move that boundary one step inward. The only subtle
          part is the end: after the top and right sides, the ring may have collapsed to nothing, so check that top ≤ bottom and left
          ≤ right before walking the bottom and left sides.
        </p>
      </div>
      <Recipe
        name="Four-boundary spiral"
        when="cells must be visited (or filled) ring by ring, clockwise or anticlockwise."
        steps={[
          'Set top = 0, bottom = rows − 1, left = 0, right = cols − 1.',
          'While top ≤ bottom and left ≤ right: walk the top row from left to right, then move top down by one.',
          'Walk the right column from top to bottom, then move right left by one.',
          'If top ≤ bottom still holds, walk the bottom row from right to left and move bottom up.',
          'If left ≤ right still holds, walk the left column from bottom to top and move left right.',
        ]}
        why="each side is walked once and then excluded by its boundary, and the two checks stop a single leftover row or column from being walked twice."
        time="O(rows × cols)"
        space="O(1) besides the output"
      />

      <div className="prose">
        <h2>Pattern 4: Rotation and reflection</h2>
        <p>
          Rotating a square 90 degrees clockwise sends the cell (r, c) to (c, n − 1 − r). Doing that directly in place means moving
          cells around in cycles of four, which is easy to get wrong. Split it into two moves that are each trivial to do in place:
          a <b>transpose</b> sends (r, c) to (c, r), and then <b>reversing each row</b> sends (c, r) to (c, n − 1 − r). Every other
          rotation and reflection is a similar combination of a transpose and row or column reversals.
        </p>
      </div>
      <Walkthrough title="Rotate Image: transpose, then reverse each row" frames={rotation.frames} />
      <TableWrap>
        <thead>
          <tr>
            <th>Move</th>
            <th>Where (r, c) goes</th>
            <th>How to do it in place</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Transpose</td>
            <td>(c, r)</td>
            <td>Swap each cell above the main diagonal with its mirror</td>
          </tr>
          <tr>
            <td>Rotate 90° clockwise</td>
            <td>(c, n − 1 − r)</td>
            <td>Transpose, then reverse every row</td>
          </tr>
          <tr>
            <td>Rotate 90° anticlockwise</td>
            <td>(n − 1 − c, r)</td>
            <td>Transpose, then reverse every column</td>
          </tr>
          <tr>
            <td>Rotate 180°</td>
            <td>(n − 1 − r, n − 1 − c)</td>
            <td>Reverse every row, then reverse the order of the rows</td>
          </tr>
          <tr>
            <td>Mirror left to right</td>
            <td>(r, n − 1 − c)</td>
            <td>Reverse every row</td>
          </tr>
        </tbody>
      </TableWrap>

      <div className="prose">
        <h2>Pattern 5: Mark in place</h2>
        <p>
          Many grid updates must happen "simultaneously": each new value depends on the old values around it. Writing new values
          straight away corrupts the old values that later cells still need. Copying the grid fixes that at <Cost>O(m·n)</Cost> extra
          memory. To avoid the copy, store the extra information inside the grid itself: in the first row and column (Set Matrix
          Zeroes), or as special codes or spare bits that hold both the old and the new state (Game of Life). A final pass turns the
          marks into the answer.
        </p>
      </div>
      <Walkthrough
        title="Set Matrix Zeroes: the first row and column as a notebook"
        frames={zeroes.frames}
        caption="Marks are written before anything is cleared, and the first row and column are cleared last, so no mark is lost."
      />

      <div className="prose">
        <h2>Pattern 6: Neighbours</h2>
        <p>
          Write the directions once, as offsets: the four side neighbours are (−1, 0), (1, 0), (0, −1) and (0, 1); add the four
          diagonal ones for all eight. Then a single loop visits every neighbour of (r, c), with one bounds check: 0 ≤ r + dr &lt;
          rows and 0 ≤ c + dc &lt; cols. The same table drives spirals (turn right means "next direction in the list") and, later,
          every grid search in <See id="dfs" /> and <See id="bfs" />.
        </p>

        <h2>Pattern 7: Staircase search</h2>
        <p>
          If every row is sorted left to right and every column top to bottom, start at the <b>top-right</b> corner. Moving left
          makes values smaller; moving down makes them bigger. So when the value is too big, its whole column is too big below it as
          well: discard the column. When it is too small, everything to its left in that row is smaller still: discard the row. Each
          step discards a row or a column, so the search takes at most rows + cols steps. It is the opposite-ends idea from{' '}
          <See id="two-pointers" />, in two dimensions.
        </p>
      </div>
      <Recipe
        name="Staircase walk from the top-right"
        when="rows and columns are both sorted, and you search for a value or count values past a threshold."
        steps={[
          'Start at row 0 and the last column.',
          'Compare the current value with the target.',
          'If it is too big, move one column left (the rest of this column is bigger still).',
          'If it is too small, move one row down (the rest of this row is smaller still).',
          'Stop when you find the target or walk off the matrix.',
        ]}
        why="from the top-right corner the two moves change the value in opposite directions, so each comparison rules out a whole row or column."
        time="O(rows + cols)"
        space="O(1)"
      />

      <div className="prose">
        <h2>Worked example: Rotate Image</h2>
        <p>Rotate an n × n matrix 90 degrees clockwise, in place.</p>
        <Step n={1}>Brute force first</Step>
        <p>
          Build a new matrix and write each old cell (r, c) into position (c, n − 1 − r). Easy and correct, <Cost>O(n²)</Cost> time,
          but it uses <Cost>O(n²)</Cost> extra memory, which the problem forbids.
        </p>
        <Step n={2}>Find the waste</Step>
        <p>
          The new matrix is only needed because writing a cell into its new place overwrites a value that has not moved yet. If every
          step were a <i>swap</i>, nothing would be overwritten.
        </p>
        <Step n={3}>Prove a rule</Step>
        <p>
          A transpose is made entirely of swaps: (r, c) with (c, r). Reversing a row is made entirely of swaps too. Applying the
          transpose sends (r, c) to (c, r); reversing that row then sends it to (c, n − 1 − r), which is exactly the clockwise
          position. So transpose, then reverse each row.
        </p>
        <Step n={4}>Check the cost and the edge cases</Step>
        <p>
          Each cell is swapped at most twice: <Cost>O(n²)</Cost> time and <Cost>O(1)</Cost> extra space. Only swap cells above the
          diagonal during the transpose, or every pair is swapped back. A 1 × 1 matrix needs no work, and the method does not care
          whether n is odd or even.
        </p>
      </div>

      <Pitfalls
        items={[
          <>Mixing up rows and columns: matrix[r][c] is row r, column c, and rows = matrix.length while cols = matrix[0].length.</>,
          <>Filling a new grid with the same row array, so every row changes together.</>,
          <>Transposing a non-square matrix in place. Its shape changes, so you need a new n × m result.</>,
          <>Updating cells while still reading the old values around them. Mark in place, or write to a copy.</>,
          <>Forgetting the boundary checks in a spiral, which walks a single remaining row or column twice.</>,
          <>Starting a staircase search at the top-left, where both moves increase the value and no comparison discards anything.</>,
        ]}
      />

      <Exercises
        items={[
          {
            task: 'In a 3 × 4 matrix, what are the flat index of cell (2, 1) and the cell of flat index 7?',
            solution: '(2, 1) has k = 2 × 4 + 1 = 9. Index 7 is row floor(7 / 4) = 1, column 7 mod 4 = 3.',
          },
          {
            task: 'Which cells of a 3 × 3 matrix lie on the anti-diagonal with r + c = 2, and on the diagonal with r − c = −1?',
            solution: 'r + c = 2: (0, 2), (1, 1), (2, 0). r − c = −1: (0, 1) and (1, 2).',
          },
          {
            task: 'Rotate [[1, 2], [3, 4]] clockwise by transposing and then reversing each row. Write the matrix after each step.',
            solution: 'Transpose: [[1, 3], [2, 4]]. Reverse rows: [[3, 1], [4, 2]].',
          },
          {
            task: 'Search for 5 in [[1, 4, 7], [2, 5, 8], [3, 6, 9]] with the staircase walk. List the cells you visit.',
            solution: 'Start at 7 (too big, go left), 4 (too small, go down), 5: found. Cells (0, 2), (0, 1), (1, 1).',
          },
        ]}
      />

      <Quiz
        questions={[
          {
            q: 'Which quantity is the same for every cell on one top-left to bottom-right diagonal?',
            options: ['r + c', 'r − c', 'r × c', 'max(r, c)'],
            answer: 1,
            why: 'Moving down-right adds 1 to both r and c, so their difference stays the same.',
          },
          {
            q: 'How do you rotate a square matrix 90° clockwise in place?',
            options: ['Reverse every row, then reverse the order of rows', 'Transpose, then reverse every row', 'Transpose, then reverse every column', 'Transpose twice'],
            answer: 1,
            why: 'Transposing sends (r, c) to (c, r), and reversing the row sends it on to (c, n − 1 − r), the clockwise position.',
          },
          {
            q: 'In Game of Life, why can you not write each new value as soon as you compute it?',
            options: [
              'Writing to arrays is slow',
              'Later cells would count neighbours using new values instead of old ones',
              'The rules are applied in a random order',
              'You can; it gives the same result',
            ],
            answer: 1,
            why: 'All cells change at the same moment, so every count must use the old generation. Encode both states, or use a copy.',
          },
          {
            q: 'Why start the staircase search in the top-right corner?',
            options: [
              'It holds the largest value',
              'Moving left decreases values and moving down increases them, so each comparison discards a row or column',
              'It is closest to the middle',
              'Any corner works equally well',
            ],
            answer: 1,
            why: 'At the top-left or bottom-right both moves change the value in the same direction, so a comparison cannot discard anything.',
          },
        ]}
      />

      <div className="prose">
        <h2>Practice problems</h2>
        <p>
          For each problem, draw a small grid on paper and trace your indices before you code. Most matrix bugs are an index in the
          wrong place, and a 3 × 4 sketch finds them faster than a debugger.
        </p>
      </div>
      <ProblemSet id="matrix" />

      <Recap>
        <ul>
          <li>matrix[r][c] is row r, column c. Flat index k = r × cols + c turns a grid into one array.</li>
          <li>Diagonals are named by r − c, anti-diagonals by r + c.</li>
          <li>Spirals use four boundaries that shrink after each side, with checks for a collapsed ring.</li>
          <li>Rotate in place with a transpose plus reversals. Avoid copies by marking in place in the first row and column or in spare bits.</li>
          <li>On a matrix sorted by rows and columns, walk a staircase from the top-right corner in O(rows + cols).</li>
        </ul>
      </Recap>
    </>
  );
}
