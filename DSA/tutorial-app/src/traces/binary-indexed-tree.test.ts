import { describe, expect, it } from 'vitest';
import { countSmallerAfterSelf, fenwickWalk } from './binary-indexed-tree';

describe('binary indexed tree traces', () => {
  it('builds the tree, answers a prefix query and applies an update', () => {
    const a = [3, 2, -1, 6, 5, 4, -3, 3];
    const r = fenwickWalk(a, 7, 3, 5);
    expect(r.prefix).toBe(16);
    expect(r.tree).toEqual([0, 3, 5, 4, 15, 5, 9, -3, 24]);
  });

  it('counts smaller numbers to the right', () => {
    expect(countSmallerAfterSelf([5, 2, 6, 1]).counts).toEqual([2, 1, 1, 0]);
    expect(countSmallerAfterSelf([-1, -1]).counts).toEqual([0, 0]);
    expect(countSmallerAfterSelf([4, 7, 1, 5, 2]).counts).toEqual([2, 3, 0, 1, 0]);
    expect(countSmallerAfterSelf([3, 1, 2, 3, 0]).counts).toEqual([3, 1, 1, 1, 0]);
  });
});
