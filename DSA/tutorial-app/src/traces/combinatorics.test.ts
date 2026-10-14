import { describe, expect, it } from 'vitest';
import { kthPermutation, pascal } from './combinatorics';

describe('combinatorics traces', () => {
  it("builds Pascal's triangle", () => {
    const { triangle } = pascal(6);
    expect(triangle[4]).toEqual([1, 4, 6, 4, 1]);
    expect(triangle[5]).toEqual([1, 5, 10, 10, 5, 1]);
  });

  it('finds the k-th permutation directly', () => {
    expect(kthPermutation(4, 9).result).toBe('2314');
    expect(kthPermutation(3, 3).result).toBe('213');
    expect(kthPermutation(3, 1).result).toBe('123');
    expect(kthPermutation(4, 24).result).toBe('4321');
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [pascal(6), kthPermutation(4, 9)]) {
      expect(frames.length).toBeGreaterThan(3);
      expect(frames.length).toBeLessThanOrEqual(20);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
