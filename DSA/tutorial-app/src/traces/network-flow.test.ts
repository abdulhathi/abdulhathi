import { describe, expect, it } from 'vitest';
import { bipartiteMatching, edmondsKarp, type CapEdge } from './network-flow';

const labels = ['s', 'a', 'b', 'c', 'd', 't'];
const edges: CapEdge[] = [[0, 1, 10], [0, 3, 10], [1, 2, 4], [1, 3, 2], [1, 4, 8], [3, 4, 9], [4, 2, 6], [2, 5, 10], [4, 5, 10]];
const pos = { 0: [0, 80], 1: [130, 0], 2: [260, 0], 3: [130, 160], 4: [260, 160], 5: [390, 80] } as Record<number, [number, number]>;

describe('network flow traces', () => {
  it('Edmonds-Karp finds the maximum flow and a cut of the same capacity', () => {
    const { maxFlow, cut, frames } = edmondsKarp(labels, edges, 0, 5, pos);
    expect(maxFlow).toBe(19);
    expect(cut).toContain(0);
    expect(cut).not.toContain(5);
    const cutCap = edges.filter(([a, b]) => cut.includes(a) && !cut.includes(b)).reduce((s, e) => s + e[2], 0);
    expect(cutCap).toBe(19);
    expect(frames.length).toBeGreaterThan(4);
  });

  it('augmenting paths find a perfect matching by moving earlier partners', () => {
    const { size, matchOfRight, frames } = bipartiteMatching(['L1', 'L2', 'L3'], ['R1', 'R2', 'R3'], [[0, 1], [0], [1, 2]]);
    expect(size).toBe(3);
    expect(matchOfRight).toEqual([1, 0, 2]);
    expect(frames.some((f) => f.note.includes('Ask L1 to move'))).toBe(true);
  });
});
