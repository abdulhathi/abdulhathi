import { describe, expect, it } from 'vitest';
import { maxOverlap, rangeAddDifference } from './sweep-line';

describe('sweep line traces', () => {
  it('counts the maximum overlap, with ends before starts at equal times', () => {
    const r = maxOverlap([[1, 5], [2, 6], [5, 8], [7, 9], [3, 4]]);
    expect(r.best).toBe(3);
    // [1,5) and [5,8) touch at 5 but do not overlap
    expect(maxOverlap([[1, 5], [5, 8]]).best).toBe(1);
  });

  it('applies range additions with a difference array', () => {
    const r = rangeAddDifference(6, [[0, 2, 10], [1, 4, 5], [3, 5, 2]]);
    expect(r.values).toEqual([10, 15, 15, 7, 7, 2]);
  });
});
