import { describe, expect, it } from 'vitest';
import { colourCycle, islands } from './dfs';

const NODES = ['0', '1', '2', '3', '4', '5'].map((id, i) => ({ id, x: i * 60, y: (i % 2) * 60 }));

describe('dfs traces', () => {
  it('counts islands', () => {
    const grid = [
      [1, 1, 0, 0, 1],
      [1, 0, 0, 1, 1],
      [0, 0, 1, 0, 0],
      [1, 0, 1, 1, 0],
    ];
    const r = islands(grid);
    expect(r.count).toBe(4);
    expect(r.frames.length).toBeLessThanOrEqual(20);
    expect(islands([[0, 0], [0, 0]]).count).toBe(0);
    expect(islands([[1, 1], [1, 1]]).count).toBe(1);
  });

  it('finds the cycle through grey nodes and ignores edges into black nodes', () => {
    const edges: [string, string][] = [['0', '1'], ['0', '2'], ['1', '3'], ['2', '3'], ['3', '4'], ['2', '5'], ['5', '2']];
    const r = colourCycle(NODES, edges, ['0']);
    expect(r.cycle).toEqual(['2', '5', '2']);
  });

  it('reports no cycle in a DAG with shared descendants', () => {
    const edges: [string, string][] = [['0', '1'], ['0', '2'], ['1', '3'], ['2', '3'], ['3', '4']];
    expect(colourCycle(NODES, edges, ['0', '5']).cycle).toBeNull();
  });
});
