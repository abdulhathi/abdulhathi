import { describe, expect, it } from 'vitest';
import { binaryLifting, lcaRecursive, SAMPLE_TREE } from './tree-advanced';

// Parents in SAMPLE_TREE, by node id.
const parent = [-1, 0, 0, 1, 1, 2, 2, 3, 4, 4, 6];
const ancestors = (v: number) => {
  const out = [v];
  while (parent[out[out.length - 1]] >= 0) out.push(parent[out[out.length - 1]]);
  return out;
};
const bruteLca = (a: number, b: number) => ancestors(a).find((x) => ancestors(b).includes(x))!;

describe('LCA and binary lifting traces', () => {
  it('finds the LCA recursively, including when one node is the ancestor of the other', () => {
    expect(lcaRecursive(SAMPLE_TREE, 7, 9).lca).toBe(1);
    expect(lcaRecursive(SAMPLE_TREE, 10, 8).lca).toBe(0);
    expect(lcaRecursive(SAMPLE_TREE, 3, 7).lca).toBe(3);
  });

  it('builds the lifting table and answers k-th ancestor and LCA queries', () => {
    const r = binaryLifting(SAMPLE_TREE, [10, 3], [10, 4]);
    expect(r.up[0]).toEqual(parent);
    expect(r.up[1][10]).toBe(2);
    expect(r.kthAncestor).toBe(0);
    expect(r.lca).toBe(0);
    expect(binaryLifting(SAMPLE_TREE, [9, 4], [7, 4]).kthAncestor).toBe(-1);
    for (let a = 0; a < parent.length; a++) {
      for (let b = 0; b < parent.length; b++) {
        expect(binaryLifting(SAMPLE_TREE, [a, 1], [a, b]).lca).toBe(bruteLca(a, b));
        expect(lcaRecursive(SAMPLE_TREE, a, b).lca).toBe(a === b ? a : bruteLca(a, b));
      }
    }
  });
});
