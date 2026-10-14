import { describe, expect, it } from 'vitest';
import { diameter, iterativeInorder, levelOrderTrace } from './binary-tree';

describe('binary tree traces', () => {
  it('walks inorder with a stack', () => {
    expect(iterativeInorder([4, 2, 6, 1, 3, 5, 7]).order).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(iterativeInorder([1, null, 2, 3]).order).toEqual([1, 3, 2]);
  });

  it('groups nodes by level', () => {
    expect(levelOrderTrace([3, 9, 20, null, null, 15, 7]).levels).toEqual([[3], [9, 20], [15, 7]]);
    expect(levelOrderTrace([]).levels).toEqual([]);
    expect(levelOrderTrace([6, 4, 9, 2, null, 7, 11]).levels).toEqual([[6], [4, 9], [2, 7, 11]]);
  });

  it('measures the diameter in edges', () => {
    expect(diameter([1, 2, 3, 4, 5]).best).toBe(3);
    expect(diameter([1, 2]).best).toBe(1);
    expect(diameter([1]).best).toBe(0);
  });
});

describe('chapter example', () => {
  it('finds a diameter that does not pass through the root', () => {
    expect(diameter([1, 2, null, 3, 4, 5, null, null, 6]).best).toBe(4);
  });
});
