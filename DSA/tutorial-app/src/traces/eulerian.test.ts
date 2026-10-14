import { describe, expect, it } from 'vitest';
import { hierholzer } from './eulerian';

const pos = { A: [0, 60], B: [140, 0], C: [140, 120], D: [280, 0] } as Record<string, [number, number]>;

describe('Hierholzer trace', () => {
  it('recovers from the dead end and uses every edge once', () => {
    const edges: [string, string][] = [['A', 'B'], ['A', 'C'], ['C', 'A'], ['B', 'D']];
    const { route } = hierholzer(edges, 'A', pos);
    expect(route).toEqual(['A', 'C', 'A', 'B', 'D']);
  });
});
