import { describe, expect, it } from 'vitest';
import { countAtMostK, fixedWindow, longestUnique, shortestAtLeast } from './sliding-window';

describe('sliding window traces', () => {
  it('finds the best fixed-size window', () => {
    const r = fixedWindow([4, -1, 7, 2, -3, 8, 5, -2], 3);
    expect(r.best).toBe(11);
    expect(r.bestStart).toBe(5);
  });

  it('finds the longest window without repeats', () => {
    expect(longestUnique('abcbdeaf').best).toBe(6);
    expect(longestUnique('aaaa').best).toBe(1);
  });

  it('finds the shortest window reaching a target', () => {
    expect(shortestAtLeast([3, 1, 4, 1, 5, 9, 2, 6], 12).best).toBe(2);
    expect(shortestAtLeast([1, 1, 1], 10).best).toBe(0);
  });

  it('counts subarrays with at most k distinct values, so exactly-k is a difference', () => {
    const exactly2 = countAtMostK([1, 2, 1, 2, 3], 2).count - countAtMostK([1, 2, 1, 2, 3], 1).count;
    expect(exactly2).toBe(7);
  });

  it('brute force agrees with the at-most-k count', () => {
    const nums = [1, 2, 1, 3, 3, 2, 4, 1];
    for (let k = 1; k <= 4; k++) {
      let brute = 0;
      for (let i = 0; i < nums.length; i++) for (let j = i; j < nums.length; j++) if (new Set(nums.slice(i, j + 1)).size <= k) brute++;
      expect(countAtMostK(nums, k).count).toBe(brute);
    }
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [fixedWindow([1, 2, 3], 2), longestUnique('abca'), shortestAtLeast([2, 3, 1], 4), countAtMostK([1, 2, 1], 1)]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
