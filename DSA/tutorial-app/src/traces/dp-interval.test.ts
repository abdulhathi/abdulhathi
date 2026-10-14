import { describe, expect, it } from 'vitest';
import { burstBalloons, longestPalSubseq } from './dp-interval';

const brutePal = (s: string) => {
  let best = 0;
  for (let m = 1; m < 1 << s.length; m++) {
    const t = [...s].filter((_, i) => m & (1 << i)).join('');
    if (t === [...t].reverse().join('')) best = Math.max(best, t.length);
  }
  return best;
};

describe('interval DP traces', () => {
  it('finds the longest palindromic subsequence', () => {
    expect(longestPalSubseq('agbdba').answer).toBe(5);
    for (const s of ['bbbab', 'cbbd', 'abcde', 'a']) expect(longestPalSubseq(s).answer).toBe(brutePal(s));
  });

  it('bursts balloons for the most coins, choosing the last balloon', () => {
    const r = burstBalloons([3, 1, 5, 8]);
    expect(r.answer).toBe(167);
    expect(r.lastChoice).toBe(3); // the 8
    expect(burstBalloons([1, 5]).answer).toBe(10);
    expect(burstBalloons([4, 2, 7, 3]).answer).toBe(156); // the walkthrough, checked by brute force over all 24 orders
    expect(burstBalloons([2, 6, 3]).answer).toBe(45); // the on-paper exercise
  });

  it('explains every frame', () => {
    for (const { frames } of [longestPalSubseq('agbdba'), burstBalloons([3, 1, 5, 8])]) {
      expect(frames.length).toBeGreaterThan(4);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(20);
    }
  });
});
