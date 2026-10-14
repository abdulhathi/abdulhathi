import { describe, expect, it } from 'vitest';
import { deleteKey, validateBounds } from './bst';

describe('binary search tree traces', () => {
  it('deletes a node with two children using its successor', () => {
    expect(deleteKey([5, 3, 6, 2, 4, null, 7], 3).result).toEqual([5, 4, 6, 2, null, null, 7]);
    expect(deleteKey([5, 3, 6, 2, 4, null, 7], 0).result).toEqual([5, 3, 6, 2, 4, null, 7]);
    expect(deleteKey([5, 3, 6, 2, 4, null, 7], 7).result).toEqual([5, 3, 6, 2, 4]);
    expect(deleteKey([5, 3, 8, null, null, 6, 9, null, 7], 5).result).toEqual([6, 3, 8, null, null, 7, 9]);
  });

  it('validates with ranges, not just parent comparisons', () => {
    expect(validateBounds([2, 1, 3]).valid).toBe(true);
    expect(validateBounds([5, 1, 7, null, null, 4, 8]).valid).toBe(false);
    expect(validateBounds([5, 4, 6, null, null, 3, 7]).valid).toBe(false);
  });
});
