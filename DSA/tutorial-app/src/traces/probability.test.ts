import { describe, expect, it } from 'vitest';
import { knightProbability, new21 } from './probability';

// Exact answers by brute-force enumeration, to check the DPs against.
function new21Brute(n: number, k: number, maxPts: number): number {
  const go = (pts: number): number => {
    if (pts >= k) return pts <= n ? 1 : 0;
    let s = 0;
    for (let d = 1; d <= maxPts; d++) s += go(pts + d);
    return s / maxPts;
  };
  return go(0);
}

describe('probability traces', () => {
  it('matches the knight examples', () => {
    expect(knightProbability(3, 2, 0, 0).result).toBeCloseTo(0.0625, 10);
    expect(knightProbability(1, 0, 0, 0).result).toBe(1);
  });

  it('computes New 21 Game with a sliding window', () => {
    expect(new21(21, 17, 10).result).toBeCloseTo(0.73278, 5);
    expect(new21(6, 1, 10).result).toBeCloseTo(0.6, 10);
    expect(new21(6, 4, 3).result).toBeCloseTo(new21Brute(6, 4, 3), 10);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [knightProbability(4, 3, 0, 0), new21(6, 4, 3)]) {
      expect(frames.length).toBeGreaterThan(3);
      expect(frames.length).toBeLessThanOrEqual(20);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
