import { describe, expect, it } from 'vitest';
import { unionFind, type UfOp } from './union-find';

const ops: UfOp[] = [
  ['union', 0, 1], ['union', 2, 3], ['union', 0, 2], ['union', 4, 5], ['union', 6, 4], ['union', 1, 3], ['union', 4, 0], ['find', 3], ['find', 5],
];

describe('union-find trace', () => {
  it('merges sets by size, skips redundant unions and compresses paths', () => {
    const { parent, components, frames } = unionFind(8, ops);
    expect(components).toBe(2);
    // After compression, 3 and 5 point straight at the root 0.
    expect(parent[3]).toBe(0);
    expect(parent[5]).toBe(0);
    expect(parent[7]).toBe(7);
    expect(frames.some((f) => f.note.includes('already in the same set'))).toBe(true);
    expect(frames.some((f) => f.note.startsWith('Path compression'))).toBe(true);
  });
});
