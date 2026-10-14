import { describe, expect, it } from 'vitest';
import { jumpGame, shortestAtLeastK, windowMax } from './monotonic-queue';

describe('monotonic queue traces', () => {
  it('finds every window maximum', () => {
    expect(windowMax([1, 3, -1, -3, 5, 3, 6, 7], 3).result).toEqual([3, 3, 5, 5, 6, 7]);
    expect(windowMax([1], 1).result).toEqual([1]);
    expect(windowMax([2, 7, 3, 1, 5, 4, 6, 2], 3).result).toEqual([7, 7, 5, 5, 6, 6]);
    expect(windowMax([4, 4, 4], 2).result).toEqual([4, 4]);
  });

  it('finds the shortest subarray with sum at least k', () => {
    expect(shortestAtLeastK([1], 1).best).toBe(1);
    expect(shortestAtLeastK([1, 2], 4).best).toBe(-1);
    expect(shortestAtLeastK([2, -1, 2], 3).best).toBe(3);
    expect(shortestAtLeastK([84, -37, 32, 40, 95], 167).best).toBe(3);
  });

  it('scores Jump Game VI', () => {
    expect(jumpGame([1, -1, -2, 4, -7, 3], 2).score).toBe(7);
    expect(jumpGame([10, -5, -2, 4, 0, 3], 3).score).toBe(17);
    expect(jumpGame([2, -3, 4, -5, -1, 3, -2, 1], 2).score).toBe(9);
    expect(jumpGame([1, -5, -20, 4, -1, 3, -6, -3], 2).score).toBe(0);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [windowMax([2, 1, 3], 2), shortestAtLeastK([1, 2, 3], 3), jumpGame([1, 2, 3], 1)]) {
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});

describe('chapter example', () => {
  it('drops a dominated start in the shortest-subarray example', () => {
    expect(shortestAtLeastK([1, -2, 3, 4, -1, 2], 7).best).toBe(2);
  });
});
