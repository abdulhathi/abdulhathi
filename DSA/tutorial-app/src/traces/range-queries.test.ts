import { describe, expect, it } from 'vitest';
import { sparseTable, sqrtBlocks } from './range-queries';

describe('range query traces', () => {
  it('builds a sparse table and answers range minimum in two lookups', () => {
    const nums = [5, 2, 8, 6, 3, 7, 4, 1, 9];
    const r = sparseTable(nums, [2, 7]);
    expect(r.answer).toBe(1);
    expect(r.table[1]).toEqual([2, 2, 6, 3, 3, 4, 1, 1]);
    expect(r.table.length).toBe(4); // lengths 1, 2, 4, 8
    // Every query agrees with a direct scan.
    for (let l = 0; l < nums.length; l++) {
      for (let rr = l; rr < nums.length; rr++) {
        expect(sparseTable(nums, [l, rr]).answer).toBe(Math.min(...nums.slice(l, rr + 1)));
      }
    }
  });

  it('answers range sums with blocks before and after an update', () => {
    const nums = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3];
    const r = sqrtBlocks(nums, [1, 8], [5, 0]);
    expect(r.before).toBe(1 + 4 + 1 + 5 + 9 + 2 + 6 + 5);
    expect(r.after).toBe(r.before - 9);
    expect(r.frames.every((f) => f.note.length > 10)).toBe(true);
  });
});
