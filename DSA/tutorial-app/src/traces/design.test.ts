import { describe, expect, it } from 'vitest';
import { lruCache, randomizedSet } from './design';

describe('design traces', () => {
  it('evicts the least recently used key', () => {
    const r = lruCache(3, [['put', 1, 10], ['put', 2, 20], ['put', 3, 30], ['get', 1], ['put', 4, 40], ['get', 2], ['get', 3], ['put', 3, 33]]);
    expect(r.results.filter((x) => x !== null)).toEqual([10, -1, 30]);
    expect(r.order).toEqual([3, 4, 1]);
  });

  it('removes from the middle by swapping with the last value', () => {
    const r = randomizedSet([['insert', 5], ['insert', 8], ['insert', 2], ['insert', 8], ['remove', 5], ['insert', 7], ['remove', 7], ['remove', 9]]);
    expect(r.values).toEqual([2, 8]);
    expect(r.results).toEqual([true, true, true, false, true, true, true, false]);
  });
});
