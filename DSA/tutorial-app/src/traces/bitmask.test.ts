import { describe, expect, it } from 'vitest';
import { assignJobs, closestSubsetSum, submasks } from './bitmask';

describe('bitmask traces', () => {
  it('assigns jobs at the lowest total cost', () => {
    expect(assignJobs([[9, 2, 7], [6, 4, 3], [5, 8, 1]]).answer).toBe(9);
    expect(assignJobs([[1, 2], [2, 1]]).answer).toBe(2);
  });

  it('finds the closest subset sum by meeting in the middle', () => {
    const r = closestSubsetSum([5, -7, 3, 5], 7);
    expect(r.diff).toBe(1);
    expect(closestSubsetSum([5, -7, 3, 5], 6).diff).toBe(0);
    expect(closestSubsetSum([7, -9, 15, -2], -5).diff).toBe(1);
    expect(closestSubsetSum([1, 2, 3], -7).diff).toBe(7);
    const w = closestSubsetSum([6, -9, 4, 11], 14); // the walkthrough: 4 + 11 = 15 is the only sum at distance 1
    expect(w.best).toBe(15);
    expect(w.diff).toBe(1);
  });

  it('lists every submask', () => {
    expect(submasks(0b1011, 4)).toEqual(['1011', '1010', '1001', '1000', '0011', '0010', '0001', '0000']);
  });
});
