import { describe, expect, it } from 'vitest';
import { candy, intervalScheduling, jumpGame } from './greedy';

describe('greedy traces', () => {
  it('decides Jump Game with the furthest reach', () => {
    expect(jumpGame([2, 3, 1, 1, 4]).canReach).toBe(true);
    expect(jumpGame([3, 2, 1, 0, 4]).canReach).toBe(false);
    expect(jumpGame([0]).canReach).toBe(true);
  });

  it('keeps the most non-overlapping intervals by sorting on end', () => {
    expect(intervalScheduling([[1, 2], [2, 3], [3, 4], [1, 3]]).removed).toBe(1);
    expect(intervalScheduling([[1, 2], [1, 2], [1, 2]]).removed).toBe(2);
    const r = intervalScheduling([[1, 10], [2, 3], [3, 5], [4, 7], [6, 8], [8, 9]]);
    expect(r.kept).toBe(4);
    expect(r.removed).toBe(2);
  });

  it('hands out the fewest candies with two passes', () => {
    expect(candy([1, 0, 2]).total).toBe(5);
    expect(candy([1, 2, 2]).total).toBe(4);
    expect(candy([1, 3, 4, 5, 2, 1, 2]).candies).toEqual([1, 2, 3, 4, 2, 1, 2]);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [jumpGame([2, 3, 1, 1, 4]), intervalScheduling([[1, 3], [2, 4]]), candy([1, 2, 1])]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
