import { describe, expect, it } from 'vitest';
import { bstIterator, flattenNested } from './iterator';

describe('iterator traces', () => {
  it('returns BST values in sorted order', () => {
    expect(bstIterator([8, 3, 10, 1, 6, null, 14, null, null, 4, 7]).output).toEqual([1, 3, 4, 6, 7, 8, 10, 14]);
  });

  it('flattens nested lists lazily, skipping empty lists', () => {
    expect(flattenNested([[5, [2]], 9, [], [[3]]]).output).toEqual([5, 2, 9, 3]);
    expect(flattenNested([[], [[]]]).output).toEqual([]);
  });
});
