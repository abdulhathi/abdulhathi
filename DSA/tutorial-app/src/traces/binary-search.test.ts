import { describe, expect, it } from 'vitest';
import { exactSearch, lowerBound, minSpeed, rotatedSearch } from './binary-search';

describe('binary search traces', () => {
  const sorted = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];

  it('finds exact values in O(log n) steps, or reports them missing', () => {
    expect(exactSearch(sorted, 23).index).toBe(5);
    expect(exactSearch(sorted, 23).steps).toBeLessThanOrEqual(4);
    expect(exactSearch(sorted, 13).index).toBe(-1);
    for (const [i, v] of sorted.entries()) expect(exactSearch(sorted, v).index).toBe(i);
  });

  it('finds the lower bound, including past the end', () => {
    const nums = [1, 3, 3, 3, 7, 9];
    expect(lowerBound(nums, 3).index).toBe(1);
    expect(lowerBound(nums, 4).index).toBe(4);
    expect(lowerBound(nums, 0).index).toBe(0);
    expect(lowerBound(nums, 10).index).toBe(6);
  });

  it('searches a rotated array', () => {
    const rot = [15, 18, 22, 3, 6, 9, 11];
    for (const [i, v] of rot.entries()) expect(rotatedSearch(rot, v).index).toBe(i);
    expect(rotatedSearch(rot, 10).index).toBe(-1);
  });

  it('finds the minimum eating speed, matching a linear scan', () => {
    const piles = [9, 4, 13, 7];
    for (const h of [4, 5, 6, 8, 12, 33]) {
      let k = 1;
      while (piles.reduce((s, p) => s + Math.ceil(p / k), 0) > h) k++;
      expect(minSpeed(piles, h).speed).toBe(k);
    }
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [exactSearch(sorted, 72), lowerBound([1, 2, 3], 2), rotatedSearch([4, 5, 1, 2], 2), minSpeed([3, 6], 4)]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
