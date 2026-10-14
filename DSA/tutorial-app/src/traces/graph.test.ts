import { describe, expect, it } from 'vitest';
import { bipartite, representations } from './graph';

const node = (id: string, i: number) => ({ id, x: (i % 4) * 70, y: Math.floor(i / 4) * 70 });

/** Brute force: try every colouring. */
function bruteBipartite(ids: string[], edges: [string, string][]) {
  for (let mask = 0; mask < 1 << ids.length; mask++) {
    const c = (id: string) => (mask >> ids.indexOf(id)) & 1;
    if (edges.every(([a, b]) => c(a) !== c(b))) return true;
  }
  return false;
}

describe('graph traces', () => {
  it('builds matching list, matrix and edge-list views', () => {
    const parts = representations(['A', 'B', 'C'].map(node), [['A', 'B'], ['B', 'C']]);
    expect(parts.map((p) => p.kind)).toEqual(['graph', 'map', 'grid', 'array']);
    const matrix = parts[2] as { cells: number[][] };
    expect(matrix.cells).toEqual([[0, 1, 0], [1, 0, 1], [0, 1, 0]]);
  });

  it('two-colours bipartite graphs and finds the conflict in odd cycles', () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const even: [string, string][] = [['A', 'B'], ['B', 'C'], ['C', 'D'], ['D', 'A'], ['B', 'E']];
    const odd: [string, string][] = [...even, ['F', 'G'], ['G', 'H'], ['H', 'F']];
    expect(bipartite(ids.map(node), even).bipartite).toBe(true);
    const r = bipartite(ids.map(node), odd);
    expect(r.bipartite).toBe(false);
    expect(r.frames.length).toBeLessThanOrEqual(20);
    let seed = 5;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let t = 0; t < 200; t++) {
      const n = 2 + Math.floor(rand() * 6);
      const vs = ids.slice(0, n);
      const es: [string, string][] = [];
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (rand() < 0.35) es.push([vs[i], vs[j]]);
      expect(bipartite(vs.map(node), es).bipartite).toBe(bruteBipartite(vs, es));
    }
  });
});
