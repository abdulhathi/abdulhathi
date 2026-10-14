import { describe, expect, it } from 'vitest';
import { nQueens, subsets } from './backtracking';

describe('backtracking traces', () => {
  it('lists every subset exactly once', () => {
    const r = subsets([1, 2, 3]);
    expect(r.results.length).toBe(8);
    expect(new Set(r.results.map((s) => s.join(','))).size).toBe(8);
    expect(r.frames.length).toBeLessThanOrEqual(20);
  });

  it('counts N-Queens solutions', () => {
    expect(nQueens(4).solutions).toBe(2);
    expect(nQueens(4).firstSolution).toEqual([1, 3, 0, 2]);
    expect(nQueens(5).solutions).toBe(10);
    expect(nQueens(6).solutions).toBe(4);
    expect(nQueens(8).solutions).toBe(92);
    expect(nQueens(4).frames.length).toBeLessThanOrEqual(20);
  });
});
