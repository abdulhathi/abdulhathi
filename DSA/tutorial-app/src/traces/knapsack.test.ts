import { describe, expect, it } from 'vitest';
import { coinChange, oneItemBothWays, subsetSum } from './knapsack';

describe('knapsack traces', () => {
  it('finds subset sums with a downward 0/1 sweep', () => {
    expect(subsetSum([3, 1, 4, 2], 5).can).toEqual([true, true, true, true, true, true]);
    expect(subsetSum([1, 5, 11, 5], 11).can[11]).toBe(true);
    expect(subsetSum([1, 2, 3, 5], 5).can[5]).toBe(true);
    expect(subsetSum([2, 4], 3).can[3]).toBe(false);
  });

  it('shows that an upward sweep reuses one item', () => {
    const r = oneItemBothWays(3, 9);
    expect(r.down).toEqual(['T', 'F', 'F', 'T', 'F', 'F', 'F', 'F', 'F', 'F']);
    expect(r.up).toEqual(['T', 'F', 'F', 'T', 'F', 'F', 'T', 'F', 'F', 'T']);
  });

  it('finds the fewest coins, or −1', () => {
    expect(coinChange([1, 2, 5], 11).fewest).toBe(3);
    expect(coinChange([2], 3).fewest).toBe(-1);
    expect(coinChange([1, 3, 4], 6).fewest).toBe(2);
    expect(coinChange([1], 0).fewest).toBe(0);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [subsetSum([2, 3], 5), coinChange([1, 3, 4], 6)]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
