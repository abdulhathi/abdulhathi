import { describe, expect, it } from 'vitest';
import { calendarBookings, slidingMedian } from './ordered-set';

function bruteMedians(nums: number[], k: number) {
  const out: number[] = [];
  for (let i = 0; i + k <= nums.length; i++) {
    const w = nums.slice(i, i + k).sort((a, b) => a - b);
    out.push(k % 2 ? w[(k - 1) / 2] : (w[k / 2 - 1] + w[k / 2]) / 2);
  }
  return out;
}

describe('ordered-set traces', () => {
  it('accepts exactly the bookings that do not overlap earlier accepted ones', () => {
    const reqs: [number, number][] = [[10, 20], [15, 25], [20, 30], [5, 10], [0, 6], [25, 28]];
    const accepted: [number, number][] = [];
    const brute = reqs.map(([s, e]) => {
      const ok = accepted.every(([a, b]) => e <= a || s >= b);
      if (ok) accepted.push([s, e]);
      return ok;
    });
    expect(calendarBookings(reqs).results).toEqual(brute);
  });

  it('computes sliding window medians that match sorting each window', () => {
    expect(slidingMedian([5, 2, 8, 1, 9, 3, 7], 3).medians).toEqual(bruteMedians([5, 2, 8, 1, 9, 3, 7], 3));
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rand() * 12);
      const nums = Array.from({ length: n }, () => Math.floor(rand() * 6) - 2);
      const k = 1 + Math.floor(rand() * n);
      expect(slidingMedian(nums, k).medians).toEqual(bruteMedians(nums, k));
    }
  });
});
