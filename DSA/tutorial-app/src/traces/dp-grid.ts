// Walkthrough frames for chapter 52 (Grid DP), produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

const key = (r: number, c: number) => `${r},${c}`;

/** Unique Paths II: paths(r, c) = paths from above + paths from the left; obstacles hold 0. */
export function uniquePathsWithObstacles(grid: number[][]): { frames: Frame[]; paths: number } {
  const m = grid.length;
  const n = grid[0].length;
  const table: Cell[][] = grid.map((row) => row.map((v) => (v === 1 ? 'X' : null)));
  const frames: Frame[] = [];
  const obstacleTones = (): Partial<Record<string, Tone>> => {
    const t: Partial<Record<string, Tone>> = {};
    grid.forEach((row, r) => row.forEach((v, c) => { if (v === 1) t[key(r, c)] = 'bad'; }));
    return t;
  };
  const view = (note: string, extra: Partial<Record<string, Tone>> = {}): Frame => ({
    note,
    parts: [{ kind: 'grid', label: 'paths to each cell (X = obstacle)', cells: table.map((row) => [...row]), tones: { ...obstacleTones(), ...extra } }],
  });
  frames.push(view('Each cell will hold the number of paths that reach it. The robot only moves right or down, so a cell is entered from above or from the left.'));
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c] === 1) continue;
      const above = r > 0 && typeof table[r - 1][c] === 'number' ? (table[r - 1][c] as number) : 0;
      const left = c > 0 && typeof table[r][c - 1] === 'number' ? (table[r][c - 1] as number) : 0;
      const value = r === 0 && c === 0 ? 1 : above + left;
      table[r][c] = value;
      const tones: Partial<Record<string, Tone>> = { [key(r, c)]: 'active' };
      if (r > 0 && grid[r - 1][c] !== 1) tones[key(r - 1, c)] = 'info';
      if (c > 0 && grid[r][c - 1] !== 1) tones[key(r, c - 1)] = 'info';
      const note =
        r === 0 && c === 0
          ? 'The start cell has exactly one path: standing still.'
          : `${above} path${above === 1 ? '' : 's'} from above + ${left} from the left = ${value}.${(r > 0 && grid[r - 1][c] === 1) || (c > 0 && grid[r][c - 1] === 1) ? ' An obstacle next to it contributes 0.' : ''}`;
      frames.push(view(note, tones));
    }
  }
  const paths = typeof table[m - 1][n - 1] === 'number' ? (table[m - 1][n - 1] as number) : 0;
  frames.push(view(`The bottom-right cell holds the answer: ${paths} paths.`, { [key(m - 1, n - 1)]: 'match' }));
  return { frames, paths };
}

/** Minimum Path Sum: best(r, c) = grid[r][c] + min(best above, best to the left). */
export function minPathSum(grid: number[][]): { frames: Frame[]; best: number } {
  const m = grid.length;
  const n = grid[0].length;
  const best: Cell[][] = grid.map((row) => row.map(() => null));
  const frames: Frame[] = [];
  const view = (note: string, tones: Partial<Record<string, Tone>> = {}, gridTones: Partial<Record<string, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'grid', label: 'grid (cost of each cell)', cells: grid, tones: gridTones },
      { kind: 'grid', label: 'best: cheapest total to reach each cell', cells: best.map((row) => [...row]), tones },
    ],
  });
  frames.push(view('best(r, c) is the cheapest total of a path from the top-left to (r, c). It comes from the cheaper of the cell above and the cell to the left.'));
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      let from: [number, number] | null = null;
      if (r > 0 && c > 0) from = (best[r - 1][c] as number) <= (best[r][c - 1] as number) ? [r - 1, c] : [r, c - 1];
      else if (r > 0) from = [r - 1, c];
      else if (c > 0) from = [r, c - 1];
      const prev = from ? (best[from[0]][from[1]] as number) : 0;
      best[r][c] = grid[r][c] + prev;
      const tones: Partial<Record<string, Tone>> = { [key(r, c)]: 'active' };
      if (from) tones[key(from[0], from[1])] = 'match';
      if (r > 0 && c > 0) {
        const other: [number, number] = from![0] === r - 1 ? [r, c - 1] : [r - 1, c];
        tones[key(other[0], other[1])] = 'dim';
      }
      const note = !from
        ? `The start costs ${grid[0][0]}.`
        : r === 0 || c === 0
          ? `Only one way in (${r === 0 ? 'from the left' : 'from above'}): ${prev} + ${grid[r][c]} = ${best[r][c]}.`
          : `Above costs ${best[r - 1][c]}, left costs ${best[r][c - 1]}. Take the cheaper (${prev}) and add ${grid[r][c]}: ${best[r][c]}.`;
      frames.push(view(note, tones, { [key(r, c)]: 'active' }));
    }
  }
  const answer = best[m - 1][n - 1] as number;
  frames.push(view(`The cheapest path to the bottom-right corner costs ${answer}.`, { [key(m - 1, n - 1)]: 'match' }));
  return { frames, best: answer };
}

/** Dungeon Game: fill backwards; need(r, c) = max(1, min(need below, need right) − dungeon[r][c]). */
export function dungeon(rooms: number[][]): { frames: Frame[]; start: number } {
  const m = rooms.length;
  const n = rooms[0].length;
  const need: Cell[][] = rooms.map((row) => row.map(() => null));
  const frames: Frame[] = [];
  const at = (r: number, c: number) => (r < m && c < n && need[r][c] !== null ? (need[r][c] as number) : Infinity);
  const view = (note: string, tones: Partial<Record<string, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'grid', label: 'dungeon (health change in each room)', cells: rooms, tones },
      { kind: 'grid', label: 'need: least health when entering each room', cells: need.map((row) => [...row]), tones },
    ],
  });
  frames.push(view('Work backwards from the princess in the bottom-right room. need(r, c) is the least health that lets you enter (r, c) and still survive to the end.'));
  for (let r = m - 1; r >= 0; r--) {
    for (let c = n - 1; c >= 0; c--) {
      const isEnd = r === m - 1 && c === n - 1;
      const nextNeed = isEnd ? 1 : Math.min(at(r + 1, c), at(r, c + 1));
      const value = Math.max(1, nextNeed - rooms[r][c]);
      need[r][c] = value;
      const tones: Partial<Record<string, Tone>> = { [key(r, c)]: 'active' };
      if (!isEnd) {
        const down = at(r + 1, c);
        const right = at(r, c + 1);
        if (r + 1 < m) tones[key(r + 1, c)] = down <= right ? 'match' : 'dim';
        if (c + 1 < n) tones[key(r, c + 1)] = right < down ? 'match' : 'dim';
      }
      const effect = rooms[r][c] >= 0 ? `gives ${rooms[r][c]}` : `costs ${-rooms[r][c]}`;
      const note = isEnd
        ? `The last room ${effect}. You must leave it with at least 1 health, so you need ${value} on entering.`
        : `The safer next room needs ${nextNeed}. This room ${effect}, so entering with ${nextNeed} − (${rooms[r][c]}) = ${nextNeed - rooms[r][c]} works${value !== nextNeed - rooms[r][c] ? ', but health can never be below 1, so need 1' : ''}: ${value}.`;
      frames.push(view(note, tones));
    }
  }
  const start = need[0][0] as number;
  frames.push(view(`The knight must start with ${start} health. Filling forwards would not work: the path with the most health at the end can dip too low in the middle.`, { [key(0, 0)]: 'match' }));
  return { frames, start };
}

/** Maximal Square: side(r, c) = 1 + min(above, left, diagonal) for a 1-cell. */
export function maximalSquare(matrix: number[][]): { frames: Frame[]; side: number } {
  const m = matrix.length;
  const n = matrix[0].length;
  const side: Cell[][] = matrix.map((row) => row.map(() => null));
  const frames: Frame[] = [];
  let best = 0;
  let bestAt: [number, number] = [-1, -1];
  const view = (note: string, tones: Partial<Record<string, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'grid', label: 'matrix', cells: matrix, tones },
      { kind: 'grid', label: 'side of the largest all-1 square ending here', cells: side.map((row) => [...row]), tones },
      { kind: 'vars', items: [['largest side', best], ['area', best * best]], tones: { 1: 'match' } },
    ],
  });
  frames.push(view('side(r, c) is the side of the largest square of 1s whose bottom-right corner is (r, c).'));
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c] === 0) {
        side[r][c] = 0;
        continue;
      }
      const up = r > 0 ? (side[r - 1][c] as number) : 0;
      const left = c > 0 ? (side[r][c - 1] as number) : 0;
      const diag = r > 0 && c > 0 ? (side[r - 1][c - 1] as number) : 0;
      const value = 1 + Math.min(up, left, diag);
      side[r][c] = value;
      const improved = value > best;
      if (improved) {
        best = value;
        bestAt = [r, c];
      }
      const tones: Partial<Record<string, Tone>> = { [key(r, c)]: 'active' };
      if (r > 0) tones[key(r - 1, c)] = 'info';
      if (c > 0) tones[key(r, c - 1)] = 'info';
      if (r > 0 && c > 0) tones[key(r - 1, c - 1)] = 'info';
      if (value > 1 || improved) {
        frames.push(
          view(
            r === 0 || c === 0
              ? `A 1 on the edge can only end a square of side 1.${improved ? ' A new largest square.' : ''}`
              : `Above ${up}, left ${left}, diagonal ${diag}. The smallest of the three limits the square: 1 + ${Math.min(up, left, diag)} = ${value}.${improved ? ' A new largest square.' : ''}`,
            tones,
          ),
        );
      }
    }
  }
  const tones: Partial<Record<string, Tone>> = {};
  for (let r = bestAt[0] - best + 1; r <= bestAt[0]; r++) for (let c = bestAt[1] - best + 1; c <= bestAt[1]; c++) tones[key(r, c)] = 'match';
  frames.push(view(`The largest square has side ${best}, so its area is ${best * best}. Zero cells simply hold 0.`, tones));
  return { frames, side: best };
}
