import { describe, expect, it } from 'vitest';
import { kthLargest } from './quickselect';

describe('quickselect trace', () => {
  it('finds the k-th largest value', () => {
    const a = [7, 2, 9, 4, 1, 8, 5];
    for (let k = 1; k <= a.length; k++) {
      expect(kthLargest(a, k).value).toBe([...a].sort((x, y) => y - x)[k - 1]);
    }
  });

  it('needs two partitions for the walkthrough input', () => {
    const r = kthLargest([7, 2, 9, 4, 1, 8, 5], 3);
    expect(r.value).toBe(7);
    expect(r.partitions).toBe(2);
    expect(r.frames.length).toBeLessThanOrEqual(20);
  });
});
