import { describe, expect, it } from 'vitest';
import { diagonalKeys, rotate, setZeroes, spiral } from './matrix';

const square = () => [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
];

describe('matrix traces', () => {
  it('walks a spiral, including single leftover rows and columns', () => {
    expect(spiral(square()).order).toEqual([1, 2, 3, 4, 8, 12, 16, 15, 14, 13, 9, 5, 6, 7, 11, 10]);
    expect(spiral([[1, 2, 3], [4, 5, 6], [7, 8, 9]]).order).toEqual([1, 2, 3, 6, 9, 8, 7, 4, 5]);
    expect(spiral([[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12]]).order).toEqual([1, 2, 3, 4, 8, 12, 11, 10, 9, 5, 6, 7]);
    expect(spiral([[1], [2], [3]]).order).toEqual([1, 2, 3]);
    expect(spiral([[1, 2, 3]]).order).toEqual([1, 2, 3]);
  });

  it('rotates clockwise by transposing and reversing rows', () => {
    const m = square();
    const n = m.length;
    const expected = m.map((_, r) => m.map((__, c) => m[n - 1 - c][r]));
    expect(rotate(m).result).toEqual(expected);
    expect(rotate([[1, 2], [3, 4]]).result).toEqual([[3, 1], [4, 2]]);
  });

  it('sets zeroes using the first row and column as marks', () => {
    expect(setZeroes([[1, 2, 3, 4], [5, 0, 7, 8], [9, 10, 11, 0], [13, 14, 15, 16]]).result).toEqual([
      [1, 0, 3, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [13, 0, 15, 0],
    ]);
    expect(setZeroes([[0, 1, 2, 0], [3, 4, 5, 2], [1, 3, 1, 5]]).result).toEqual([[0, 0, 0, 0], [0, 4, 5, 0], [0, 3, 1, 0]]);
    expect(setZeroes([[1, 1, 1], [1, 0, 1], [1, 1, 1]]).result).toEqual([[1, 0, 1], [0, 0, 0], [1, 0, 1]]);
  });

  it('labels diagonals', () => {
    const g = diagonalKeys(3, 3, 'r-c');
    expect(g.cells[2][1]).toBe(1);
    expect(diagonalKeys(3, 3, 'r+c').cells[1][2]).toBe(3);
  });

  it('explains every frame', () => {
    for (const { frames } of [spiral(square()), rotate(square()), setZeroes([[0, 1], [1, 1]])]) {
      expect(frames.length).toBeGreaterThan(1);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
