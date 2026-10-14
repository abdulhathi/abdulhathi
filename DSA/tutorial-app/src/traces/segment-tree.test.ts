import { describe, expect, it } from 'vitest';
import { segmentQuery, segmentRangeAdd, segmentUpdate } from './segment-tree';

const a = [5, 2, 6, 1, 3, 4, 7, 8];

describe('segment tree traces', () => {
  it('answers range sums', () => {
    const r = segmentQuery(a, 2, 6);
    expect(r.answer).toBe(6 + 1 + 3 + 4 + 7);
    expect(r.visited).toBeLessThanOrEqual(4 * Math.log2(a.length) + 1);
    for (let l = 0; l < a.length; l++)
      for (let rr = l; rr < a.length; rr++) expect(segmentQuery(a, l, rr).answer).toBe(a.slice(l, rr + 1).reduce((x, y) => x + y, 0));
  });

  it('updates one value', () => {
    expect(segmentUpdate(a, 3, 10).root).toBe(36 - 1 + 10);
  });

  it('adds to a range lazily and pushes the change down on demand', () => {
    const r = segmentRangeAdd(a, 1, 6, 2, 3);
    expect(r.root).toBe(36 + 2 * 6);
    expect(r.probeValue).toBe(a[3] + 2);
    expect(segmentRangeAdd(a, 0, 7, 1, 0).probeValue).toBe(6);
  });

  it('rejects arrays it cannot draw as a perfect tree', () => {
    expect(() => segmentQuery([1, 2, 3], 0, 1)).toThrow();
  });
});
