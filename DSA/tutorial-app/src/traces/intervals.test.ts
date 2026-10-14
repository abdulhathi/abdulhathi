import { describe, expect, it } from 'vitest';
import { keepMostByEnd, mergeIntervals } from './intervals';

describe('interval traces', () => {
  it('merges overlapping intervals', () => {
    const r = mergeIntervals([[8, 10], [1, 3], [15, 18], [2, 6], [9, 12], [4, 5]]);
    expect(r.merged).toEqual([[1, 6], [8, 12], [15, 18]]);
    expect(mergeIntervals([[7, 9], [1, 4], [13, 16], [2, 5], [8, 11], [3, 4]]).merged).toEqual([[1, 5], [7, 11], [13, 16]]);
  });

  it('keeps the most non-overlapping intervals by sorting on end', () => {
    const r = keepMostByEnd([[1, 4], [2, 3], [3, 6], [5, 7], [6, 9], [8, 10]]);
    expect(r.kept).toEqual([[2, 3], [3, 6], [6, 9]]);
    expect(r.removed).toBe(3);
  });
});
