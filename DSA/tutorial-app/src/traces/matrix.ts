// Walkthrough frames for the matrices chapter, produced by running each algorithm for real.
import type { Cell, Frame, GridViz, Tone } from '../viz/types';

const copy = (m: Cell[][]) => m.map((row) => [...row]);
const key = (r: number, c: number) => `${r},${c}`;

function grid(cells: Cell[][], label: string, tones: Partial<Record<string, Tone>>): GridViz {
  return { kind: 'grid', label, cells: copy(cells), tones, rowHeaders: cells.map((_, r) => `r${r}`), colHeaders: cells[0].map((_, c) => `c${c}`) };
}

/** Spiral order with four shrinking boundaries: one frame per side of each layer. */
export function spiral(matrix: number[][]): { frames: Frame[]; order: number[] } {
  const rows = matrix.length;
  const cols = matrix[0].length;
  let top = 0;
  let bottom = rows - 1;
  let left = 0;
  let right = cols - 1;
  const order: number[] = [];
  const visited = new Set<string>();
  const frames: Frame[] = [];
  const view = (fresh: [number, number][], note: string): Frame => {
    const tones: Partial<Record<string, Tone>> = {};
    for (const k of visited) tones[k] = 'done';
    for (const [r, c] of fresh) tones[key(r, c)] = 'active';
    return {
      note,
      parts: [
        grid(matrix, 'matrix', tones),
        { kind: 'vars', items: [['top', top], ['bottom', bottom], ['left', left], ['right', right]] },
        { kind: 'array', label: 'output so far', items: [...order], indices: false },
      ],
    };
  };
  frames.push(view([], 'Four boundaries mark the layer still to visit: top and bottom rows, left and right columns.'));
  const take = (cells: [number, number][], note: string) => {
    for (const [r, c] of cells) order.push(matrix[r][c]);
    frames.push(view(cells, note));
    for (const [r, c] of cells) visited.add(key(r, c));
  };
  while (top <= bottom && left <= right) {
    take(Array.from({ length: right - left + 1 }, (_, i) => [top, left + i]), `Walk the top row from column ${left} to ${right}, then move top down: that row is finished.`);
    top++;
    if (top <= bottom) {
      take(Array.from({ length: bottom - top + 1 }, (_, i) => [top + i, right]), `Walk down the right column from row ${top} to ${bottom}, then move right inward.`);
    }
    right--;
    if (top <= bottom && left <= right) {
      take(Array.from({ length: right - left + 1 }, (_, i) => [bottom, right - i]), `Walk the bottom row from right to left, then move bottom up.`);
      bottom--;
    }
    if (left <= right && top <= bottom) {
      take(Array.from({ length: bottom - top + 1 }, (_, i) => [bottom - i, left]), `Walk up the left column, then move left inward. One layer done.`);
      left++;
    }
  }
  frames.push(view([], `The boundaries crossed, so every cell has been visited exactly once: ${order.length} values.`));
  return { frames, order };
}

/** Rotate a square matrix 90° clockwise in place: transpose, then reverse every row. */
export function rotate(input: number[][]): { frames: Frame[]; result: number[][] } {
  const m = input.map((row) => [...row]);
  const n = m.length;
  const frames: Frame[] = [];
  frames.push({ note: 'Goal: turn the square a quarter turn clockwise, in place. Two simple steps do it: transpose, then reverse each row.', parts: [grid(m, 'matrix', {})] });
  for (let r = 0; r < n; r++) {
    const tones: Partial<Record<string, Tone>> = {};
    for (let c = r + 1; c < n; c++) {
      [m[r][c], m[c][r]] = [m[c][r], m[r][c]];
      tones[key(r, c)] = 'active';
      tones[key(c, r)] = 'info';
    }
    if (r < n - 1) {
      frames.push({
        note: `Transpose, row ${r}: swap each cell right of the diagonal with its mirror image below it, (${r}, c) with (c, ${r}).`,
        parts: [grid(m, 'transposing', { ...tones, [key(r, r)]: 'done' })],
      });
    }
  }
  frames.push({ note: 'Transposed: rows have become columns. The first column of the answer is now the first row, but in the wrong order.', parts: [grid(m, 'transposed', {})] });
  for (let r = 0; r < n; r++) {
    m[r].reverse();
    const tones: Partial<Record<string, Tone>> = {};
    for (let c = 0; c < n; c++) tones[key(r, c)] = 'match';
    frames.push({ note: `Reverse row ${r} with two pointers from its ends.`, parts: [grid(m, 'reversing rows', tones)] });
  }
  frames.push({ note: 'Done: the original first column now reads along the top from right to left, which is a 90° clockwise turn.', parts: [grid(m, 'rotated', {})] });
  return { frames, result: m };
}

/** Set Matrix Zeroes with O(1) extra space: the first row and column store the marks. */
export function setZeroes(input: number[][]): { frames: Frame[]; result: number[][] } {
  const m = input.map((row) => [...row]);
  const rows = m.length;
  const cols = m[0].length;
  const frames: Frame[] = [];
  const firstRowZero = m[0].some((v) => v === 0);
  const firstColZero = m.some((row) => row[0] === 0);
  const zeros: Partial<Record<string, Tone>> = {};
  m.forEach((row, r) => row.forEach((v, c) => { if (v === 0) zeros[key(r, c)] = 'bad'; }));
  frames.push({ note: 'Every 0 must wipe out its whole row and column. Changing cells as you find zeros would create fake zeros, so first record which rows and columns to clear.', parts: [grid(m, 'matrix', zeros)] });
  frames.push({
    note: `Use the first row and first column as the notebook. First remember whether they themselves contain a 0: first row ${firstRowZero ? 'does' : 'does not'}, first column ${firstColZero ? 'does' : 'does not'}.`,
    parts: [grid(m, 'matrix', zeros), { kind: 'vars', items: [['firstRowZero', String(firstRowZero)], ['firstColZero', String(firstColZero)]] }],
  });
  const marks: Partial<Record<string, Tone>> = {};
  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      if (m[r][c] === 0) {
        m[r][0] = 0;
        m[0][c] = 0;
        marks[key(r, 0)] = 'warn';
        marks[key(0, c)] = 'warn';
        marks[key(r, c)] = 'bad';
      }
    }
  }
  frames.push({ note: 'Scan the inner cells. For each 0 at (r, c), write a 0 into the first cell of row r and the first cell of column c (amber).', parts: [grid(m, 'marks written', marks)] });
  const cleared: Partial<Record<string, Tone>> = {};
  for (let r = 1; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      if (m[r][0] === 0 || m[0][c] === 0) {
        if (m[r][c] !== 0) cleared[key(r, c)] = 'active';
        m[r][c] = 0;
      }
    }
  }
  frames.push({ note: 'Now clear inner cells whose row mark or column mark is 0. The marks are read, never confused with original values.', parts: [grid(m, 'inner cells cleared', cleared)] });
  const edge: Partial<Record<string, Tone>> = {};
  if (firstRowZero) for (let c = 0; c < cols; c++) { m[0][c] = 0; edge[key(0, c)] = 'active'; }
  if (firstColZero) for (let r = 0; r < rows; r++) { m[r][0] = 0; edge[key(r, 0)] = 'active'; }
  frames.push({
    note: firstRowZero || firstColZero ? 'Last, clear the first row and/or column if they had a 0 of their own, using the two flags.' : 'The first row and column had no 0 of their own. Their marks are zeros exactly where a column or row had to be cleared anyway, so they are already correct. Done.',
    parts: [grid(m, 'result', edge)],
  });
  return { frames, result: m };
}

/** A grid labelled with r − c (or r + c): every cell on one diagonal shares the label. */
export function diagonalKeys(rows: number, cols: number, kind: 'r-c' | 'r+c'): GridViz {
  const cells: Cell[][] = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (kind === 'r-c' ? r - c : r + c)));
  const tones: Partial<Record<string, Tone>> = {};
  const target = kind === 'r-c' ? 0 : Math.min(rows, cols) - 1;
  cells.forEach((row, r) => row.forEach((v, c) => { if (v === target) tones[key(r, c)] = 'active'; }));
  return { kind: 'grid', label: kind === 'r-c' ? 'r − c: same value along each ↘ diagonal' : 'r + c: same value along each ↙ anti-diagonal', cells, tones, rowHeaders: cells.map((_, r) => `r${r}`), colHeaders: cells[0].map((_, c) => `c${c}`) };
}
