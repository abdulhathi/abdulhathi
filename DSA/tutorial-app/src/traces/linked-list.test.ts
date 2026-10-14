import { describe, expect, it } from 'vitest';
import { build, mergeTwo, removeNthFromEnd, reverseList, toArray } from './linked-list';

describe('linked list traces', () => {
  it('builds and reads lists', () => {
    expect(toArray(build([1, 2, 3]))).toEqual([1, 2, 3]);
    expect(toArray(build([]))).toEqual([]);
  });

  it('reverses a list', () => {
    expect(reverseList([1, 2, 3, 4, 5]).result).toEqual([5, 4, 3, 2, 1]);
    expect(reverseList([7]).result).toEqual([7]);
  });

  it('merges two sorted lists', () => {
    expect(mergeTwo([1, 3, 6, 9], [2, 3, 4]).result).toEqual([1, 2, 3, 3, 4, 6, 9]);
    expect(mergeTwo([], [0]).result).toEqual([0]);
    expect(mergeTwo([1, 2, 4], [1, 3, 4]).result).toEqual([1, 1, 2, 3, 4, 4]);
  });

  it('removes the n-th node from the end', () => {
    expect(removeNthFromEnd([10, 20, 30, 40, 50], 2).result).toEqual([10, 20, 30, 50]);
    expect(removeNthFromEnd([1, 2, 3, 4, 5], 5).result).toEqual([2, 3, 4, 5]);
    expect(removeNthFromEnd([1], 1).result).toEqual([]);
    expect(removeNthFromEnd([1, 2], 1).result).toEqual([1]);
  });

  it('explains every frame', () => {
    for (const { frames } of [reverseList([1, 2]), mergeTwo([1], [2]), removeNthFromEnd([1, 2, 3], 1)]) {
      expect(frames.length).toBeGreaterThan(1);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
