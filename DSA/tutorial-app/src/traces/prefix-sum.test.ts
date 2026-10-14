import { describe, expect, it } from 'vitest';
import { countSumK, differenceArray, rangeSums } from './prefix-sum';

describe('prefix sum traces', () => {
  it('answers range sums from the prefix array', () => {
    const r = rangeSums([3, -1, 4, 1, -5, 9], [[1, 3], [0, 5], [4, 4]]);
    expect(r.prefix).toEqual([0, 3, 2, 6, 7, 2, 11]);
    expect(r.answers).toEqual([4, 11, -5]);
  });

  it('counts subarrays with sum k, negatives included, matching brute force', () => {
    const nums = [2, -1, 3, -2, 2, 1, -3, 3];
    for (const k of [0, 1, 2, 3, 4]) {
      let brute = 0;
      for (let i = 0; i < nums.length; i++) {
        let s = 0;
        for (let j = i; j < nums.length; j++) if ((s += nums[j]) === k) brute++;
      }
      expect(countSumK(nums, k).count).toBe(brute);
    }
  });

  it('applies range updates with a difference array', () => {
    expect(differenceArray(6, [[1, 3, 5], [2, 5, 2], [0, 1, -1]]).result).toEqual([-1, 4, 7, 7, 2, 2]);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [rangeSums([1, 2], [[0, 1]]), countSumK([1, 2, 3], 3), differenceArray(3, [[0, 1, 2]])]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});

describe('2D prefix sums', () => {
  it('matches brute-force rectangle sums', async () => {
    const { prefix2D } = await import('./prefix-sum');
    const grid = [[2, 0, 1, 3], [1, 4, 2, 0], [3, 1, 5, 2]];
    const { rect } = prefix2D(grid);
    for (let r1 = 0; r1 < 3; r1++) for (let r2 = r1; r2 < 3; r2++) for (let c1 = 0; c1 < 4; c1++) for (let c2 = c1; c2 < 4; c2++) {
      let s = 0;
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) s += grid[r][c];
      expect(rect(r1, c1, r2, c2)).toBe(s);
    }
  });
});
