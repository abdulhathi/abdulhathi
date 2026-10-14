import { describe, expect, it } from 'vitest';
import { binarySearchSteps, dynamicArray, fibCallTree } from './complexity';

describe('complexity traces', () => {
  it('binary search finds a value in about log2 n looks', () => {
    const nums = Array.from({ length: 15 }, (_, i) => i * 3 + 2);
    const r = binarySearchSteps(nums, 29);
    expect(nums[r.index]).toBe(29);
    expect(r.steps).toBeLessThanOrEqual(4);
    expect(binarySearchSteps(nums, 30).index).toBe(-1);
  });

  it('naive Fibonacci makes 15 calls for f(5)', () => {
    const r = fibCallTree(5);
    expect(r.calls).toBe(15);
    expect(r.distinct).toBe(6);
    expect(r.frames.length).toBe(16);
  });

  it('a doubling array copies fewer than 2 values per push', () => {
    const r = dynamicArray(9);
    expect(r.copies).toBe(15);
    expect(r.capacity).toBe(16);
    expect(r.copies / 9).toBeLessThan(2);
  });
});
