import { describe, expect, it } from 'vitest';
import { parseLevelOrder, levelOrder } from '../viz/tree';
import { fibCallTree, fibMemo, longestIncreasingPath } from './memoization';

describe('memoization traces', () => {
  it('counts the calls of plain recursive Fibonacci and marks the repeats', () => {
    const t = fibCallTree(5);
    expect(t.calls).toBe(15);
    expect(t.distinct).toBe(6);
    // The level-order list must describe exactly 15 nodes.
    expect(levelOrder(parseLevelOrder(t.tree.nodes)).length).toBe(15);
    expect(Object.values(t.tree.tones ?? {}).filter((x) => x === 'warn').length).toBe(9);
  });

  it('computes Fibonacci with a cache in 2n − 1 calls', () => {
    const r = fibMemo(5);
    expect(r.value).toBe(5);
    expect(r.calls).toBe(9);
    expect(fibMemo(10).value).toBe(55);
  });

  it('finds the longest increasing path with a memoised DFS', () => {
    expect(longestIncreasingPath([[7, 8, 9], [6, 1, 2], [5, 4, 3]]).best).toBe(9);
    expect(longestIncreasingPath([[9, 9, 4], [6, 6, 8], [2, 1, 1]]).best).toBe(4);
    expect(longestIncreasingPath([[1]]).best).toBe(1);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [fibMemo(4), longestIncreasingPath([[1, 2], [4, 3]])]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
