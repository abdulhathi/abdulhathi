import { describe, expect, it } from 'vitest';
import { mergeSortInversions } from './merge-sort';

describe('merge sort trace', () => {
  it('sorts and counts inversions', () => {
    const a = [5, 2, 8, 1, 9, 3, 7, 4];
    let brute = 0;
    for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) if (a[i] > a[j]) brute++;
    const r = mergeSortInversions(a);
    expect(r.sorted).toEqual([1, 2, 3, 4, 5, 7, 8, 9]);
    expect(r.inversions).toBe(brute);
    expect(r.frames.length).toBe(9); // intro, 7 merges, summary
  });
});
