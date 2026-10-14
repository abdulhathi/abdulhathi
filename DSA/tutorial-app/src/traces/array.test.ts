import { describe, expect, it } from 'vitest';
import { cyclicSort, kadane, majorityVote, rotateByReversal } from './array';

describe('array traces', () => {
  it("finds the maximum subarray with Kadane's algorithm", () => {
    const r = kadane([-2, 1, -3, 4, -1, 2, 1, -5, 4]);
    expect(r.best).toBe(6);
    expect(r.range).toEqual([3, 6]);
    expect(kadane([-3, -1, -2]).best).toBe(-1);
    const r2 = kadane([3, -4, 2, -1, 2, 1, -5, 4]);
    expect(r2.best).toBe(4);
    expect(r2.range).toEqual([2, 5]);
  });

  it('rotates with three reversals', () => {
    expect(rotateByReversal([1, 2, 3, 4, 5, 6, 7], 3).result).toEqual([5, 6, 7, 1, 2, 3, 4]);
    expect(rotateByReversal([1, 2, 3], 4).result).toEqual([3, 1, 2]);
    expect(rotateByReversal([1, 2, 3], 3).result).toEqual([1, 2, 3]);
    expect(rotateByReversal([10, 20, 30, 40, 50, 60], 2).result).toEqual([50, 60, 10, 20, 30, 40]);
  });

  it('finds the majority element', () => {
    expect(majorityVote([2, 2, 1, 1, 1, 2, 2]).candidate).toBe(2);
    expect(majorityVote([3, 3, 4]).candidate).toBe(3);
    expect(majorityVote([5, 1, 5, 3, 5, 5, 2]).candidate).toBe(5);
  });

  it('finds the first missing positive by cyclic sort', () => {
    expect(cyclicSort([3, 4, -1, 1]).missing).toBe(2);
    expect(cyclicSort([1, 2, 0]).missing).toBe(3);
    expect(cyclicSort([7, 8, 9]).missing).toBe(1);
    expect(cyclicSort([1, 1]).missing).toBe(2);
    expect(cyclicSort([4, -2, 1, 6, 2]).missing).toBe(3);
  });
});
