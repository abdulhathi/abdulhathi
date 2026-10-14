import { describe, expect, it } from 'vitest';
import { recentCounter, runningMedian } from './data-stream';

const bruteMedian = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

describe('data stream traces', () => {
  it('keeps the running median with two halves', () => {
    const stream = [5, 15, 1, 3, 8, 7, 9, 10];
    const r = runningMedian(stream);
    expect(r.medians).toEqual(stream.map((_, i) => bruteMedian(stream.slice(0, i + 1))));
  });

  it('counts requests in a sliding time window', () => {
    expect(recentCounter([100, 900, 2500, 3200, 4100, 6200], 3000).counts).toEqual([1, 2, 3, 3, 3, 3]);
  });
});
