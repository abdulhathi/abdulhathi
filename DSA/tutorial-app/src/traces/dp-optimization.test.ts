import { describe, expect, it } from 'vitest';
import { jobScheduling, jumpGameDeque } from './dp-optimization';

describe('DP optimisation traces', () => {
  it('uses a monotonic deque for Jump Game VI', () => {
    expect(jumpGameDeque([1, -1, -2, 4, -7, 3], 2).answer).toBe(7);
    expect(jumpGameDeque([10, -5, -2, 4, 0, 3], 3).answer).toBe(17);
    expect(jumpGameDeque([2, -4, 3, -1, -6, 5, -2, 4], 2).answer).toBe(13);
    expect(jumpGameDeque([1, -5, -20, 4, -1, 3, -6, -3], 2).answer).toBe(0);
  });

  it('schedules jobs for the most profit', () => {
    expect(jobScheduling([1, 2, 3, 3], [3, 4, 5, 6], [50, 10, 40, 70]).answer).toBe(120);
    expect(jobScheduling([1, 2, 3, 4, 6], [3, 5, 10, 6, 9], [20, 20, 100, 70, 60]).answer).toBe(150);
    expect(jobScheduling([1, 1, 1], [2, 3, 4], [5, 6, 4]).answer).toBe(6);
    expect(jobScheduling([1, 2, 4, 5], [4, 5, 7, 8], [30, 50, 40, 25]).answer).toBe(75);
  });

  it('explains every frame', () => {
    for (const { frames } of [jumpGameDeque([2, -4, 3, -1, -6, 5, -2, 4], 2), jobScheduling([1, 2, 4, 5], [4, 5, 7, 8], [30, 50, 40, 25])]) {
      expect(frames.length).toBeGreaterThan(4);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(20);
    }
  });
});
