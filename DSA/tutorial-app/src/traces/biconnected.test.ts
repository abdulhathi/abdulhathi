import { describe, expect, it } from 'vitest';
import { bridgesAndCuts } from './biconnected';

const edges: [number, number][] = [[0, 1], [1, 2], [2, 0], [1, 3], [3, 4], [4, 5], [5, 3], [5, 6]];
const pos = Object.fromEntries(Array.from({ length: 7 }, (_, i) => [i, [i * 60, (i % 2) * 80]])) as Record<number, [number, number]>;

describe('bridges and articulation points trace', () => {
  it('finds both bridges and all three cut vertices', () => {
    const { bridges, cuts } = bridgesAndCuts(7, edges, pos);
    expect(bridges.map(([a, b]) => `${a}-${b}`).sort()).toEqual(['1-3', '5-6']);
    expect(cuts).toEqual([1, 3, 5]);
  });

  it('finds nothing in a cycle', () => {
    const { bridges, cuts } = bridgesAndCuts(4, [[0, 1], [1, 2], [2, 3], [3, 0]], pos);
    expect(bridges).toEqual([]);
    expect(cuts).toEqual([]);
  });
});
