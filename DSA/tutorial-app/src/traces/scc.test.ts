import { describe, expect, it } from 'vitest';
import { kosaraju } from './scc';

const edges: [number, number][] = [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3], [6, 5], [6, 7], [7, 6]];
const pos = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i, [i * 60, (i % 2) * 80]])) as Record<number, [number, number]>;

describe('Kosaraju trace', () => {
  it('finds the three strongly connected components', () => {
    const { comp } = kosaraju(8, edges, pos);
    const groups = new Map<number, number[]>();
    comp.forEach((c, v) => groups.set(c, [...(groups.get(c) ?? []), v]));
    expect([...groups.values()].map((g) => g.join(',')).sort()).toEqual(['0,1,2', '3,4,5', '6,7']);
  });
});
