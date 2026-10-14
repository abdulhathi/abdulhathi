import { describe, expect, it } from 'vitest';
import { maxSubarrayDC, sortedToBST } from './divide-and-conquer';

const brute = (a: number[]) => {
  let best = -Infinity;
  for (let i = 0; i < a.length; i++) {
    let s = 0;
    for (let j = i; j < a.length; j++) best = Math.max(best, (s += a[j]));
  }
  return best;
};

describe('divide and conquer traces', () => {
  it('finds the maximum subarray', () => {
    const a = [3, -4, 5, -1, 2, -6, 4, 1];
    const r = maxSubarrayDC(a);
    expect(r.best.sum).toBe(brute(a));
    expect(r.best).toEqual({ sum: 6, l: 2, r: 4 });
    expect(maxSubarrayDC([-3, -1, -2]).best.sum).toBe(-1);
  });

  it('builds a height-balanced BST from a sorted array', () => {
    const r = sortedToBST([1, 2, 3, 4, 5, 6, 7]);
    expect(r.levelOrder).toEqual([4, 2, 6, 1, 3, 5, 7]);
    expect(r.frames.length).toBe(9);
  });
});
