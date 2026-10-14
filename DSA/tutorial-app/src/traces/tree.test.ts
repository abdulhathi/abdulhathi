import { describe, expect, it } from 'vitest';
import { distanceK, informTime, maxDepth } from './tree';

describe('tree traces', () => {
  it('computes the maximum depth', () => {
    expect(maxDepth([3, 9, 20, null, null, 15, 7]).depth).toBe(3);
    expect(maxDepth([1, null, 2]).depth).toBe(2);
    expect(maxDepth([5, 2, 8, null, 4, 7]).depth).toBe(3);
    expect(maxDepth([]).depth).toBe(0);
  });

  it('finds all nodes at distance k', () => {
    expect(distanceK([3, 5, 1, 6, 2, 0, 8, null, null, 7, 4], 5, 2).result).toEqual([1, 4, 7]);
    expect(distanceK([1], 1, 3).result).toEqual([]);
    expect(distanceK([7, 2, 9, 1, 4, 8, 11, null, null, 3, 6], 2, 2).result).toEqual([3, 6, 9]);
  });

  it('computes the time to inform everyone', () => {
    const layout: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]];
    expect(informTime([2, 2, -1, 2, 2, 2, 2].slice(0, 6), [0, 0, 1, 0, 0, 0], 2, layout.slice(0, 6)).total).toBe(1);
    expect(informTime([-1, 0, 0, 1, 1, 2, 2], [1, 2, 3, 0, 0, 0, 0], 0, layout).total).toBe(4);
  });
});
