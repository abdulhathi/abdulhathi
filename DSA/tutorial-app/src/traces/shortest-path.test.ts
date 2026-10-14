import { describe, expect, it } from 'vitest';
import { bellmanFordRounds, dijkstra, floydWarshall, type WEdge } from './shortest-path';

const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
const edges: WEdge[] = [[0, 1, 4], [0, 2, 1], [2, 1, 2], [1, 3, 5], [2, 3, 8], [2, 4, 10], [3, 4, 2], [3, 5, 6], [4, 5, 3]];
const pos = { 0: [0, 60], 1: [120, 0], 2: [120, 120], 3: [240, 0], 4: [240, 120], 5: [360, 60] } as Record<number, [number, number]>;

describe('shortest path traces', () => {
  it('Dijkstra finds the shortest distances and skips stale entries', () => {
    const { dist, frames } = dijkstra(labels, edges, 0, pos);
    expect(dist).toEqual([0, 3, 1, 8, 10, 13]);
    expect(frames.some((f) => f.note.includes('stale'))).toBe(true);
  });

  it('Bellman-Ford with a round limit respects the stop limit', () => {
    const flights: WEdge[] = [[0, 1, 100], [1, 2, 100], [2, 3, 100], [0, 2, 500], [1, 3, 600]];
    const p = { 0: [0, 0], 1: [150, 0], 2: [150, 120], 3: [300, 60] } as Record<number, [number, number]>;
    expect(bellmanFordRounds(4, flights, 0, 3, 1, p).answer).toBe(600);
    expect(bellmanFordRounds(4, flights, 0, 3, 2, p).answer).toBe(300);
    expect(bellmanFordRounds(4, flights, 0, 3, 0, p).answer).toBe(-1);
  });

  it('Floyd-Warshall matches Dijkstra from every source', () => {
    const { dist } = floydWarshall(labels, edges);
    for (let s = 0; s < labels.length; s++) expect(dist[s]).toEqual(dijkstra(labels, edges, s, pos).dist);
  });
});
