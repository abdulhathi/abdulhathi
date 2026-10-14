import { describe, expect, it } from 'vitest';
import { dfsColours, kahn } from './topological-sort';

const pos = { 0: [0, 0], 1: [0, 100], 2: [120, 0], 3: [120, 100], 4: [240, 50], 5: [360, 50] } as Record<number, [number, number]>;
const dag: [number, number][] = [[0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [4, 5]];

describe('topological sort traces', () => {
  it("Kahn's algorithm orders a DAG so every edge points forward", () => {
    const { order, hasCycle, frames } = kahn(6, dag, pos);
    expect(hasCycle).toBe(false);
    expect(order).toEqual([0, 1, 2, 3, 4, 5]);
    const at = new Map(order.map((v, i) => [v, i]));
    for (const [a, b] of dag) expect(at.get(a)!).toBeLessThan(at.get(b)!);
    expect(frames.length).toBeGreaterThan(5);
  });

  it("Kahn's algorithm reports a cycle when nodes are left over", () => {
    const { hasCycle, order } = kahn(4, [[0, 1], [1, 2], [2, 1], [2, 3]], pos);
    expect(hasCycle).toBe(true);
    expect(order).toEqual([0]);
  });

  it('DFS colouring finds the cycle through a grey node', () => {
    const { cycle } = dfsColours(5, [[0, 1], [1, 4], [1, 2], [2, 3], [3, 4], [3, 1]], pos);
    expect(cycle).toEqual([1, 2, 3]);
  });

  it('DFS colouring gives a topological order on a DAG', () => {
    const { cycle, postOrder } = dfsColours(6, dag, pos);
    expect(cycle).toBeNull();
    const order = [...postOrder].reverse();
    const at = new Map(order.map((v, i) => [v, i]));
    for (const [a, b] of dag) expect(at.get(a)!).toBeLessThan(at.get(b)!);
  });
});
