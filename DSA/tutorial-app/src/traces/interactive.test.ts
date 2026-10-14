import { describe, expect, it } from 'vitest';
import { firstBadVersion, mountainSearch } from './interactive';

describe('interactive traces', () => {
  it('finds the first bad version with about log2(n) calls', () => {
    for (let bad = 1; bad <= 16; bad++) {
      const r = firstBadVersion(16, bad);
      expect(r.answer).toBe(bad);
      expect(r.calls).toBeLessThanOrEqual(4);
    }
  });

  it('searches a mountain array within the call limit', () => {
    expect(mountainSearch([1, 2, 3, 4, 5, 3, 1], 3).answer).toBe(2);
    expect(mountainSearch([0, 1, 2, 4, 2, 1], 3).answer).toBe(-1);
    expect(mountainSearch([1, 3, 5, 8, 12, 9, 7, 4, 2], 7).answer).toBe(6);
    const big = Array.from({ length: 10000 }, (_, i) => (i < 7000 ? i : 20000 - i));
    const r = mountainSearch(big, 12000);
    expect(r.answer).toBe(8000);
    expect(r.calls).toBeLessThanOrEqual(100);
  });

  it('keeps the walkthroughs short and explained', () => {
    for (const { frames } of [firstBadVersion(12, 8), mountainSearch([1, 3, 5, 8, 12, 9, 7, 4, 2], 7)]) {
      expect(frames.length).toBeLessThanOrEqual(20);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
