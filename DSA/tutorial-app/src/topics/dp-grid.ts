import type { Topic } from './types';

export const topic: Topic = {
  id: 'dp-grid',
  patterns: [
    { name: 'Count the paths', idea: 'A cell is entered from above or from the left, so its path count is the sum of those two counts.' },
    { name: 'Cheapest path', idea: 'The cheapest way into a cell comes from its cheapest possible predecessor, plus the cell\'s own cost.' },
    { name: 'Fill backwards from the goal', idea: 'When the answer is decided at the end, fill the table from the goal towards the start.' },
    { name: 'Squares ending at a cell', idea: 'The largest square with its corner at a cell is limited by the squares at its three neighbours.' },
    { name: 'Extra state per cell', idea: 'Store more than one number per cell: a remainder, the largest and smallest product, or the move count.' },
    { name: 'Two walkers at once', idea: 'Move two paths in lockstep so one state (step, position of each) describes both.' },
  ],
  signals: [
    { see: 'A grid, and moves only right and down (or only down)', think: 'Fill a DP table row by row', why: 'Every predecessor of a cell sits above it or to its left, so the table can be filled in reading order.' },
    { see: '"How many paths" or "cheapest path" from one corner to another', think: 'Grid DP: sum or minimum of the predecessors', why: 'Paths into a cell split by their last move, just as in 1D counting and cheapest-path DP.' },
    { see: 'The constraint is about the whole path ("health never drops to 0", "sum divisible by k")', think: 'Fill backwards, or add the extra quantity to the state', why: 'Forward totals alone lose the information the constraint needs.' },
    { see: 'Largest or number of squares made of 1s', think: 'side = 1 + min(above, left, diagonal)', why: 'A square ending at a cell needs smaller squares ending at its three neighbours.' },
    { see: 'Moves in all four directions, or a number of moves to make', think: 'Layered DP over moves (or BFS / Dijkstra if it is a shortest path)', why: 'Free movement creates cycles, so a single row-by-row pass does not work; layering by move count removes them.' },
    { see: 'Two paths that must be planned together (a round trip, two robots)', think: 'One DP over both walkers in lockstep', why: 'Optimising the paths one after the other is greedy and fails when they compete for the same cells.' },
  ],
  problems: [
    // ---------- Count the paths ----------
    {
      id: 62, title: 'Unique Paths', pattern: 'Count the paths', core: true,
      summary: 'A robot starts in the top-left corner of an m × n grid and moves only right or down. Count the different paths to the bottom-right corner.',
      hints: ['The robot enters a cell from above or from the left.', 'paths(r, c) = paths(r − 1, c) + paths(r, c − 1).', 'Every cell in the first row and the first column has exactly one path.'],
      insight: 'Every path into a cell arrives from the cell above or the cell to its left, so its count is the sum of those two counts. One row of the table is enough.',
      approach: ['Make a row of n ones: the first row.', 'For every next row, for c from 1 to n − 1: row[c] = row[c] (from above) + row[c − 1] (from the left).', 'Return row[n − 1].'],
      ds: ['1D array (one row)'], time: 'O(m · n)', space: 'O(n)',
      traps: [
        'Updating one row from left to right works because row[c − 1] already holds the new row\'s value.',
        'Combinatorics also answers it: choose which m − 1 of the m + n − 2 moves go down.',
      ],
    },
    {
      id: 63, title: 'Unique Paths II', pattern: 'Count the paths', core: true,
      summary: 'Like Unique Paths, but some cells are obstacles the robot cannot enter. Count the paths from the top-left to the bottom-right corner.',
      hints: ['An obstacle cell has 0 paths.', 'Every other cell is still above + left.', 'Careful in the first row and column: after an obstacle, the rest of that line is unreachable.'],
      insight: 'Same recurrence as Unique Paths, with obstacle cells forced to 0. Starting from paths(0, 0) = 1 and filling in order handles the first row and column automatically.',
      approach: [
        'If the start cell is an obstacle, return 0.',
        'row = n zeros, with row[0] = 1.',
        'For each grid row, for each column c: if the cell is an obstacle, row[c] = 0; otherwise, if c > 0, add row[c − 1] to row[c].',
        'Return row[n − 1].',
      ],
      ds: ['1D array (one row)'], time: 'O(m · n)', space: 'O(n)',
      traps: ['The start or the end cell may itself be an obstacle.', 'Do not fill the first row with 1s blindly: an obstacle blocks everything after it.'],
    },

    // ---------- Cheapest path ----------
    {
      id: 64, title: 'Minimum Path Sum', pattern: 'Cheapest path', core: true,
      summary: 'Moving only right or down through a grid of non-negative numbers, find the path from the top-left to the bottom-right corner with the smallest total.',
      hints: ['The best path into a cell comes from above or from the left.', 'best(r, c) = grid[r][c] + min(best(r − 1, c), best(r, c − 1)).', 'The first row and first column have only one way in.'],
      insight: 'The cheapest path to a cell must arrive from the cheaper of its two possible predecessors, so best(r, c) = grid[r][c] + min(above, left).',
      approach: [
        'Keep one row best of size n; fill the first row with running sums.',
        'For each next row: add grid[r][0] to best[0]; then for c ≥ 1, best[c] = grid[r][c] + min(best[c], best[c − 1]).',
        'Return best[n − 1].',
      ],
      ds: ['1D array (one row)'], time: 'O(m · n)', space: 'O(n)',
      traps: ['Handle the first row and column separately: they have a single predecessor.', 'Always stepping to the smaller neighbour (greedy) fails.'],
    },
    {
      id: 931, title: 'Minimum Falling Path Sum', pattern: 'Cheapest path',
      summary: 'Find the smallest sum of a path that starts anywhere in the top row and, in each next row, moves to the cell directly below or diagonally below-left or below-right.',
      hints: ['best(r, c) = matrix[r][c] + the smallest of the up to three cells above that can reach it.', 'The first and last columns have only two parents.', 'The answer is the smallest value in the last row.'],
      insight: 'Each cell\'s best falling sum is its value plus the best of the (up to three) cells above it. Fill row by row and take the minimum of the last row.',
      approach: [
        'Copy the first row as the current best row.',
        'For each next row and each column c: new[c] = matrix[r][c] + the minimum of best[c − 1], best[c] and best[c + 1], using only those inside the grid.',
        'Replace best with new.',
        'Return the minimum of best.',
      ],
      ds: ['Two 1D arrays'], time: 'O(n²)', space: 'O(n)',
      traps: ['Values can be negative, so start minimums at infinity, never at 0.'],
    },
    {
      id: 1289, title: 'Minimum Falling Path Sum II', pattern: 'Cheapest path',
      summary: 'Pick one number from each row of a square grid so that picks in neighbouring rows are in different columns. Minimise the total.',
      hints: ['best(r, c) = grid[r][c] + the smallest best in the previous row outside column c.', 'Scanning the whole previous row for every cell is O(n³).', 'Keep only the smallest and second smallest values of the previous row, and the column of the smallest.'],
      insight: 'Each cell needs the smallest value of the previous row excluding its own column. That is the row\'s minimum, unless the minimum is in the same column, in which case it is the second minimum. So each row costs O(n).',
      approach: [
        'best = the first row.',
        'For each next row: find the smallest value in best, its column, and the second smallest value.',
        'new[c] = grid[r][c] + (the smallest if its column is not c, otherwise the second smallest).',
        'Replace best with new; return the minimum of best at the end.',
      ],
      ds: ['Two 1D arrays', 'Three running values'], time: 'O(n²)', space: 'O(n)',
      traps: ['A 1 × 1 grid has a single pick.', 'If two columns tie for the minimum, the second smallest equals the smallest, which is still correct.'],
    },

    // ---------- Fill backwards from the goal ----------
    {
      id: 120, title: 'Triangle', pattern: 'Fill backwards from the goal', core: true,
      summary: 'From the top of a triangle of numbers, step down to one of the two adjacent numbers in the row below each time. Find the smallest total from top to bottom.',
      hints: ['Filling top-down means taking a minimum over the whole last row at the end.', 'Bottom-up: the best from a cell is its value plus the better of its two children\'s best.', 'Start with the last row and work upwards; one row of memory is enough.'],
      insight: 'Filling from the bottom row up, best(r, c) = triangle[r][c] + min(best(r + 1, c), best(r + 1, c + 1)), and the answer ends up alone at the top.',
      approach: [
        'best = a copy of the last row.',
        'For each row from the second-to-last up to the top, for each c in that row: best[c] = triangle[r][c] + min(best[c], best[c + 1]).',
        'Return best[0].',
      ],
      ds: ['1D array (one row)'], time: 'O(n²) for n rows', space: 'O(n)',
      traps: ['Overwriting best from left to right is safe: best[c + 1] is still the lower row\'s value when you read it.', 'Values can be negative, so greedy choices fail.'],
    },
    {
      id: 174, title: 'Dungeon Game', pattern: 'Fill backwards from the goal', core: true,
      summary: 'A knight crosses a grid of rooms from the top-left to the bottom-right, moving right or down. Each room adds or removes health, and health must never drop to 0. Find the smallest starting health that guarantees survival.',
      hints: [
        'Going forwards you would need two numbers per cell: current health and the lowest it has been.',
        'Go backwards instead: what is the least health you need when entering each room?',
        'need(r, c) = max(1, min(need below, need to the right) − dungeon[r][c]).',
      ],
      insight: 'Fill from the princess backwards. The health needed on entering a room is what the safer next room needs, minus this room\'s effect, but never less than 1. A forward DP fails because the path with the most health at the end can dip too low in the middle.',
      approach: [
        'Give need an extra row and column of infinity, except the two cells next to the last room, which hold 1.',
        'For r from the last row up, and c from the last column left: need[r][c] = max(1, min(need[r + 1][c], need[r][c + 1]) − dungeon[r][c]).',
        'Return need[0][0].',
      ],
      ds: ['2D table (or one row), filled backwards'], time: 'O(m · n)', space: 'O(n)',
      traps: ['Maximising health along the way (forward DP) gives wrong answers.', 'Health must be at least 1 at every moment, including at the start and after the last room.'],
    },

    // ---------- Squares ending at a cell ----------
    {
      id: 221, title: 'Maximal Square', pattern: 'Squares ending at a cell', core: true,
      summary: 'In a grid of 0s and 1s, find the area of the largest square that contains only 1s.',
      hints: ['Let side(r, c) be the side of the largest all-1 square whose bottom-right corner is (r, c).', 'It is limited by the squares ending above, to the left and diagonally above-left.', 'side(r, c) = 1 + min(above, left, diagonal) when the cell is 1.'],
      insight: 'A square of side s with its corner at (r, c) needs squares of side s − 1 at the cell above, the cell to the left and the diagonal cell, so side = 1 + the smallest of those three.',
      approach: [
        'Keep one row of side values of size n + 1, plus a variable holding the old diagonal value.',
        'For each cell that is 1: side[c + 1] = 1 + min(side[c + 1] (above), side[c] (left), diagonal). Cells that are 0 get 0.',
        'Track the largest side and return its square.',
      ],
      ds: ['2D table, or one row plus a saved diagonal'], time: 'O(m · n)', space: 'O(n)',
      traps: ['Return the area, not the side length.', 'The input cells are the characters "0" and "1", not numbers.'],
    },
    {
      id: 1277, title: 'Count Square Submatrices with All Ones', pattern: 'Squares ending at a cell',
      summary: 'Count all the square submatrices of a 0/1 matrix that contain only 1s.',
      hints: ['Use the same table as Maximal Square.', 'A cell whose largest square has side s is the bottom-right corner of exactly s squares: sides 1 to s.'],
      insight: 'side(r, c) = 1 + min(above, left, diagonal) for a 1-cell, and that number is also how many all-1 squares end at (r, c). The answer is the sum of the table.',
      approach: ['Compute side for every cell as in Maximal Square.', 'Add every side value to a running total.', 'Return the total.'],
      ds: ['2D table'], time: 'O(m · n)', space: 'O(m · n), or O(1) by writing into the input',
      traps: ['Writing the table into the input saves memory but changes it, which is not always acceptable outside LeetCode.'],
    },

    // ---------- Extra state per cell ----------
    {
      id: 576, title: 'Out of Boundary Paths', pattern: 'Extra state per cell',
      summary: 'A ball starts on an m × n grid and may make at most maxMove moves up, down, left or right. Count the move sequences that take it off the grid, modulo 10⁹ + 7.',
      hints: ['Add the number of moves made to the state.', 'Let count[r][c] be the number of ways to be at (r, c) after the current number of moves.', 'At each move, every way that steps off the edge adds to the answer.'],
      insight: 'Layer the DP by moves. From the current spread of ways over the cells, each of the four steps either lands on a neighbour (adding to the next layer) or leaves the grid (adding to the answer).',
      approach: [
        'count = all zeros except count[startRow][startColumn] = 1; answer = 0.',
        'Repeat maxMove times: start an empty next grid; for each cell with w ways and each direction, add w to answer if the neighbour is off the grid, otherwise add w to next at the neighbour.',
        'Replace count with next, keeping everything modulo 10⁹ + 7.',
        'Return answer.',
      ],
      ds: ['Two 2D arrays (this layer and the next)'], time: 'O(maxMove · m · n)', space: 'O(m · n)',
      traps: ['A path stops counting the moment it leaves; it does not continue.', 'maxMove can be 0, and then the answer is 0.'],
    },
    {
      id: 688, title: 'Knight Probability in Chessboard', pattern: 'Extra state per cell',
      summary: 'A knight starts on an n × n board and makes k random moves, each of its 8 moves equally likely, stopping if it leaves the board. Find the probability that it is still on the board after k moves.',
      hints: ['Track the probability of being on each cell after each move.', 'Each move spreads a cell\'s probability equally over its 8 knight moves; moves off the board are lost.', 'After k layers, add up the probability left on the board.'],
      insight: 'A layered DP over moves: probability flows from each cell to its 8 knight targets, one eighth each, and whatever leaves the board disappears. The answer is the total probability that remains after k layers.',
      approach: [
        'prob = zeros, with prob[row][column] = 1.',
        'Repeat k times: next = zeros; for each cell with probability p, for each of the 8 knight moves that stays on the board, add p / 8 at the target.',
        'Replace prob with next.',
        'Return the sum of prob.',
      ],
      ds: ['Two 2D arrays'], time: 'O(k · n²)', space: 'O(n²)',
      traps: ['Divide by 8 for every move, including those that leave the board.', 'With k = 0 the answer is 1.'],
    },
    {
      id: 1594, title: 'Maximum Non Negative Product in a Matrix', pattern: 'Extra state per cell',
      summary: 'Moving right or down from the top-left to the bottom-right corner, find the largest non-negative product of the cells on a path (modulo 10⁹ + 7, applied at the end), or −1 if every product is negative.',
      hints: ['A negative cell turns the largest product into the smallest.', 'Store both the largest and the smallest product for each cell.', 'Apply the modulo only to the final answer.'],
      insight: 'As in Maximum Product Subarray, keep two values per cell: the largest and the smallest product that can reach it. Each comes from the extremes above and to the left, multiplied by the cell\'s value.',
      approach: [
        'maxP[0][0] = minP[0][0] = grid[0][0].',
        'For every other cell, gather the candidates: the cell value times maxP and minP of the cell above and of the cell to the left (where they exist).',
        'maxP = the largest candidate, minP = the smallest.',
        'If maxP at the end is negative, return −1; otherwise return it modulo 10⁹ + 7.',
      ],
      ds: ['Two 2D tables', 'BigInt'], time: 'O(m · n)', space: 'O(m · n)',
      traps: [
        'Taking the modulo along the way breaks the comparisons.',
        'A path has up to 29 cells with values up to 4 in size, so products reach about 2⁵⁸, beyond the 2⁵³ that TypeScript numbers hold exactly. Use BigInt.',
      ],
    },
    {
      id: 2435, title: 'Paths in Matrix Whose Sum Is Divisible by K', pattern: 'Extra state per cell',
      summary: 'Moving only right or down from the top-left to the bottom-right corner, count the paths whose cell values add up to a multiple of k, modulo 10⁹ + 7.',
      hints: ['The number of paths to a cell is not enough; you need to know their sums.', 'You only need each sum modulo k: add the remainder as a third dimension.', 'ways[r][c][x] = number of paths to (r, c) whose sum leaves remainder x.'],
      insight: 'Add the running remainder to the state. ways(r, c, x) counts paths to (r, c) with sum ≡ x (mod k), built from the cell above and the cell to the left, with the remainder shifted by this cell\'s value.',
      approach: [
        'ways[0][0][grid[0][0] mod k] = 1.',
        'For each other cell and each remainder x: add ways[r − 1][c][x] + ways[r][c − 1][x] into ways[r][c][(x + grid[r][c]) mod k].',
        'Reduce every sum modulo 10⁹ + 7.',
        'Return ways[m − 1][n − 1][0].',
      ],
      ds: ['3D table, or two rows of size n × k'], time: 'O(m · n · k)', space: 'O(n · k) with rolling rows',
      traps: ['The start cell\'s value counts in every path\'s sum.', 'm · n ≤ 5 × 10⁴ and k ≤ 50 means 2.5 million states: fine, but keep only the previous row.'],
    },

    // ---------- Two walkers at once ----------
    {
      id: 1463, title: 'Cherry Pickup II', pattern: 'Two walkers at once',
      summary: 'Two robots start at the top-left and top-right corners of a grid. Each step, both move down one row, to the cell below or diagonally below. Shared cells are collected once. Maximise the cherries collected.',
      hints: ['Both robots are always on the same row.', 'So the state is (row, column of robot 1, column of robot 2).', 'From each state, try the 3 × 3 combinations of moves into the next row.'],
      insight: 'Because both robots move down one row per step, they share the row, and (row, c1, c2) captures everything. Each state takes the best of 9 move pairs from the next row.',
      approach: [
        'Fill from the bottom row upwards with dp[c1][c2] for the current row.',
        'For each pair (c1, c2): value = the cherries at both cells (once if c1 equals c2) + the best next-row dp over the 9 move combinations that stay inside the grid.',
        'Return the value at row 0 for the pair (0, cols − 1).',
      ],
      ds: ['2D table per row (rolling)'], time: 'O(rows · cols²)', space: 'O(cols²)',
      traps: ['Count a cell once when both robots stand on it.', 'Skip moves that leave the grid.'],
    },
    {
      id: 741, title: 'Cherry Pickup', pattern: 'Two walkers at once',
      summary: 'Walk from the top-left to the bottom-right of a square grid moving right or down, then back moving left or up, avoiding thorns. Each cherry can be picked once. Maximise the cherries collected.',
      hints: [
        'Taking the best first trip and then the best return trip fails.',
        'Reverse the return trip: it is just a second walker going from the top-left to the bottom-right.',
        'Move both walkers together, one step each. After t steps both satisfy row + column = t, so the state is (t, row of walker 1, row of walker 2).',
      ],
      insight: 'Replace the round trip with two walkers moving forward at the same time. After t steps both stand on the diagonal row + col = t, so (t, r1, r2) describes everything; when they share a cell, its cherry counts once.',
      approach: [
        'Run a DP over steps t from 0 to 2n − 2, with states (r1, r2); the columns are t − r1 and t − r2.',
        'Skip states where either walker is outside the grid or on a thorn.',
        'Take the best of the four previous-state combinations (each walker came from above or from the left) and add the cherries at both cells, counting a shared cell once.',
        'Return the larger of 0 and the final state (n − 1, n − 1), treating unreachable states as minus infinity.',
      ],
      ds: ['3D table, or a 2D table per step'], time: 'O(n³)', space: 'O(n²) with rolling layers',
      traps: ['Optimising the first trip and then the second is greedy and wrong: the best first trip can ruin the return.', 'If the end cannot be reached at all, the answer is 0.'],
    },
  ],
};
