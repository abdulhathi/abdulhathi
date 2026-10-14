import { describe, expect, it } from 'vitest';
import { houseRobber, kadane, wordBreak } from './dp';

describe('dp traces', () => {
  it('robs the most money without touching neighbours', () => {
    expect(houseRobber([1, 2, 3, 1]).best).toBe(4);
    expect(houseRobber([2, 7, 9, 3, 1]).best).toBe(12);
    expect(houseRobber([2, 1, 1, 2]).best).toBe(4);
    expect(houseRobber([5]).best).toBe(5);
    expect(houseRobber([6, 2, 8, 9, 3, 4]).best).toBe(19); // the walkthrough
  });

  it('decides Word Break with a prefix table', () => {
    expect(wordBreak('leetcode', ['leet', 'code']).ok).toBe(true);
    expect(wordBreak('catsandog', ['cats', 'dog', 'sand', 'and', 'cat']).ok).toBe(false);
    expect(wordBreak('goalspecial', ['go', 'goal', 'goals', 'special']).ok).toBe(true);
  });

  it('finds the maximum subarray with Kadane', () => {
    const r = kadane([-2, 1, -3, 4, -1, 2, 1, -5, 4]);
    expect(r.best).toBe(6);
    expect(r.range).toEqual([3, 6]);
    expect(kadane([-3, -1, -2]).best).toBe(-1);
    const w = kadane([-3, 4, -1, 2, -6, 1, 5, -2, 3]); // the walkthrough
    expect(w.best).toBe(7);
    expect(w.range).toEqual([5, 8]);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [houseRobber([2, 7, 9]), wordBreak('ab', ['a', 'b']), kadane([1, -2, 3])]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
