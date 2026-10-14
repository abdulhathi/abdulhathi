import { describe, expect, it } from 'vitest';
import { heapOps, kthLargest, twoHeapMedian } from './heap';

describe('heap traces', () => {
  it('pushes with sift-up and pops the minimum with sift-down', () => {
    const r = heapOps([5, 3, 8, 1, 9, 2], 2);
    expect(r.popped).toEqual([1, 2]);
    // The rest is still a valid min-heap.
    for (let i = 1; i < r.heap.length; i++) expect(r.heap[(i - 1) >> 1]).toBeLessThanOrEqual(r.heap[i]);
    expect([...r.heap].sort((a, b) => a - b)).toEqual([3, 5, 8, 9]);
  });

  it('finds the kth largest with a size-k min-heap', () => {
    expect(kthLargest([3, 2, 1, 5, 6, 4], 2).answer).toBe(5);
    expect(kthLargest([7, 4, 9, 1, 6, 3], 2).answer).toBe(7);
    expect(kthLargest([3, 2, 3, 1, 2, 4, 5, 5, 6], 4).answer).toBe(4);
  });

  it('keeps a running median with two heaps', () => {
    expect(twoHeapMedian([5, 15, 1, 3, 8]).medians).toEqual([5, 10, 5, 4, 5]);
    expect(twoHeapMedian([1, 2, 3]).medians).toEqual([1, 1.5, 2]);
  });
});
