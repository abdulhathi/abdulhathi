import { describe, expect, it } from 'vitest';
import { lcpArray, suffixArray } from './suffix-array';

const bruteSa = (s: string) => Array.from({ length: s.length }, (_, i) => i).sort((a, b) => (s.slice(a) < s.slice(b) ? -1 : 1));
const bruteDistinct = (s: string) => {
  const set = new Set<string>();
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j <= s.length; j++) set.add(s.slice(i, j));
  return set.size;
};

describe('suffix array traces', () => {
  it('sorts suffixes by prefix doubling', () => {
    expect(suffixArray('banana').sa).toEqual([5, 3, 1, 0, 4, 2]);
    for (const s of ['mississippi', 'aaaa', 'abcab', 'z']) expect(suffixArray(s).sa).toEqual(bruteSa(s));
  });

  it('computes the LCP array and counts distinct substrings', () => {
    const { sa } = suffixArray('banana');
    const r = lcpArray('banana', sa);
    expect(r.lcp).toEqual([0, 1, 3, 0, 0, 2]);
    expect(r.distinct).toBe(15);
    const c = lcpArray('cocoa', suffixArray('cocoa').sa);
    expect(suffixArray('cocoa').sa).toEqual([4, 2, 0, 3, 1]);
    expect(c.lcp).toEqual([0, 0, 2, 0, 1]);
    expect(c.distinct).toBe(12);
    for (const s of ['mississippi', 'aaaa', 'abcab']) expect(lcpArray(s, suffixArray(s).sa).distinct).toBe(bruteDistinct(s));
  });
});
