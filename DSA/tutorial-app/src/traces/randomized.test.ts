import { describe, expect, it } from 'vitest';
import { fisherYates, shuffleCounts } from './randomized';

describe('randomized traces', () => {
  it('runs Fisher–Yates with the given picks', () => {
    expect(fisherYates(['A', 'B', 'C', 'D', 'E'], [1, 0, 2, 0]).result).toEqual(['E', 'D', 'C', 'A', 'B']);
    expect(fisherYates([1, 2, 3], [2, 1]).result).toEqual([1, 2, 3]);
    expect(() => fisherYates([1, 2, 3], [5, 0])).toThrow();
  });

  it('shows the naive shuffle is biased and Fisher–Yates is not', () => {
    const c = shuffleCounts(3);
    expect(c.naive.reduce((a, b) => a + b, 0)).toBe(27);
    expect([...c.naive].sort()).toEqual([4, 4, 4, 5, 5, 5]);
    expect(c.fisherYates).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('writes a sentence for every frame', () => {
    const { frames } = fisherYates(['A', 'B', 'C', 'D', 'E'], [1, 0, 2, 0]);
    expect(frames.length).toBe(6);
    for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
  });
});
