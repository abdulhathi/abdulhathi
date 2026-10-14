import { describe, expect, it } from 'vitest';
import { dungeon, maximalSquare, minPathSum, uniquePathsWithObstacles } from './dp-grid';

describe('grid DP traces', () => {
  it('counts paths around obstacles', () => {
    expect(uniquePathsWithObstacles([[0, 0, 0], [0, 1, 0], [0, 0, 0]]).paths).toBe(2);
    expect(uniquePathsWithObstacles([[0, 1], [0, 0]]).paths).toBe(1);
    expect(uniquePathsWithObstacles([[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]).paths).toBe(10);
  });

  it('finds the cheapest path', () => {
    expect(minPathSum([[1, 3, 1], [1, 5, 1], [4, 2, 1]]).best).toBe(7);
    expect(minPathSum([[1, 2, 3], [4, 5, 6]]).best).toBe(12);
    expect(minPathSum([[2, 1, 4, 3], [5, 2, 1, 8], [3, 6, 2, 1]]).best).toBe(9); // the walkthrough
  });

  it('fills the dungeon backwards', () => {
    expect(dungeon([[-2, -3, 3], [-5, -10, 1], [10, 30, -5]]).start).toBe(7);
    expect(dungeon([[0]]).start).toBe(1);
    expect(dungeon([[-3, 2, -4], [-6, -8, 3], [5, -2, -5]]).start).toBe(8); // the walkthrough
    expect(dungeon([[5, -10], [-1, 2]]).start).toBe(1);
  });

  it('finds the largest square of 1s', () => {
    expect(maximalSquare([[1, 0, 1, 0, 0], [1, 0, 1, 1, 1], [1, 1, 1, 1, 1], [1, 0, 0, 1, 0]]).side).toBe(2);
    expect(maximalSquare([[0, 1], [1, 0]]).side).toBe(1);
    expect(maximalSquare([[0]]).side).toBe(0);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [uniquePathsWithObstacles([[0, 0], [0, 0]]), minPathSum([[1, 2], [3, 4]]), dungeon([[1, -2], [3, -4]]), maximalSquare([[1, 1], [1, 1]])]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
