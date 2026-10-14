import { describe, expect, it } from 'vitest';
import { gridBfs, rottingOranges, zeroOneBfs } from './bfs';

/** Reference: Bellman-Ford style relaxation until nothing changes. */
function slowCost(grid: number[][]) {
  const R = grid.length;
  const C = grid[0].length;
  const d = grid.map((r) => r.map(() => Infinity));
  d[0][0] = 0;
  for (let changed = true; changed; ) {
    changed = false;
    for (let r = 0; r < R; r++)
      for (let c = 0; c < C; c++)
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr;
          const nc = c + dc;
          if (nr < 0 || nc < 0 || nr >= R || nc >= C) continue;
          if (d[r][c] + grid[nr][nc] < d[nr][nc]) {
            d[nr][nc] = d[r][c] + grid[nr][nc];
            changed = true;
          }
        }
  }
  return d[R - 1][C - 1];
}

describe('bfs traces', () => {
  it('finds the shortest grid path, or -1', () => {
    const grid = ['..#...', '..#.#.', '....#.', '.##...', '......'];
    expect(gridBfs(grid, [0, 0], [0, 5]).distance).toBe(9);
    expect(gridBfs(grid, [0, 0], [4, 5]).distance).toBe(9);
    expect(gridBfs(['.#.', '.#.', '.#.'], [0, 0], [0, 2]).distance).toBe(-1);
  });

  it('counts minutes for rotting oranges', () => {
    expect(rottingOranges([[2, 1, 1], [1, 1, 0], [0, 1, 1]]).minutes).toBe(4);
    expect(rottingOranges([[2, 1, 1], [0, 1, 1], [1, 0, 1]]).minutes).toBe(-1);
    expect(rottingOranges([[0, 2]]).minutes).toBe(0);
  });

  it('0-1 BFS matches a slow reference on random grids', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let t = 0; t < 200; t++) {
      const R = 1 + Math.floor(rand() * 5);
      const C = 2 + Math.floor(rand() * 5);
      const g = Array.from({ length: R }, () => Array.from({ length: C }, () => (rand() < 0.45 ? 1 : 0)));
      g[0][0] = 0;
      g[R - 1][C - 1] = 0;
      expect(zeroOneBfs(g).cost).toBe(slowCost(g));
    }
  });
});
