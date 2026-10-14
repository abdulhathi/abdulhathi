import { describe, expect, it } from 'vitest';
import { dutchFlag, floydCycle, maxArea, pairSum, removeDuplicates } from './two-pointers';

describe('two-pointer traces', () => {
  it('finds the pair with the target sum, or reports none', () => {
    expect(pairSum([1, 3, 4, 6, 8, 11, 14], 14).result).toEqual([1, 5]); // 3 + 11
    expect(pairSum([1, 2, 3], 100).result).toBeNull();
  });

  it('keeps one copy of each value', () => {
    const r = removeDuplicates([1, 1, 2, 3, 3, 3, 5, 7, 7]);
    expect(r.length).toBe(5);
    expect(r.kept).toEqual([1, 2, 3, 5, 7]);
  });

  it("finds Floyd's meeting point and the cycle entry", () => {
    const r = floydCycle([3, 1, 4, 7, 5, 9, 2, 6], 3);
    expect(r.entry).toBe(3);
    // Brute force: the meeting point is a node inside the cycle.
    expect(r.meet).toBeGreaterThanOrEqual(3);
  });

  it('finds the largest container', () => {
    expect(maxArea([3, 9, 4, 2, 7, 5, 8, 1, 6]).best).toBe(42);
    expect(maxArea([1, 1]).best).toBe(1);
  });

  it('sorts 0s, 1s and 2s', () => {
    expect(dutchFlag([1, 2, 0, 2, 1, 0, 0, 2, 1]).sorted).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2]);
    expect(dutchFlag([2, 2, 2]).sorted).toEqual([2, 2, 2]);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [pairSum([1, 2, 5], 7), removeDuplicates([1, 1, 2]), maxArea([3, 1, 3]), dutchFlag([1, 0, 2])]) {
      expect(frames.length).toBeGreaterThan(1);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
