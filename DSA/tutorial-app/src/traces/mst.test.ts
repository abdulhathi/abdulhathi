import { describe, expect, it } from 'vitest';
import { kruskal, prim, type WEdge } from './mst';

const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
const edges: WEdge[] = [[0, 1, 4], [0, 2, 3], [1, 2, 1], [1, 3, 2], [2, 3, 4], [2, 4, 5], [3, 4, 7], [3, 5, 6], [4, 5, 3]];
const pos = { 0: [0, 60], 1: [120, 0], 2: [120, 120], 3: [240, 0], 4: [240, 120], 5: [360, 60] } as Record<number, [number, number]>;

describe('minimum spanning tree traces', () => {
  it('Kruskal and Prim agree on the total weight', () => {
    const k = kruskal(labels, edges, pos);
    expect(k.total).toBe(14);
    expect(k.chosen.length).toBe(5);
    expect(prim(labels, edges, pos).total).toBe(14);
    expect(k.frames.some((f) => f.note.includes('cycle'))).toBe(true);
  });
});
