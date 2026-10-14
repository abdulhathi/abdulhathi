import { describe, expect, it } from 'vitest';
import { kmpSearch, manacherOdd, prefixTable, zFunction } from './string-matching';

const brutePi = (p: string) =>
  [...p].map((_, i) => {
    for (let len = i; len > 0; len--) if (p.slice(0, len) === p.slice(i + 1 - len, i + 1)) return len;
    return 0;
  });

describe('string matching traces', () => {
  it('builds the KMP prefix table', () => {
    expect(prefixTable('aabaaab').pi).toEqual([0, 1, 0, 1, 2, 2, 3]);
    for (const p of ['abab', 'aaaa', 'abcabd', 'abacabab']) expect(prefixTable(p).pi).toEqual(brutePi(p));
  });

  it('finds every occurrence, including overlapping ones', () => {
    expect(kmpSearch('abababcab', 'abab').matches).toEqual([0, 2]);
    expect(kmpSearch('aaaaa', 'aa').matches).toEqual([0, 1, 2, 3]);
    expect(kmpSearch('abc', 'd').matches).toEqual([]);
  });

  it('computes the Z-function', () => {
    expect(zFunction('aabxaab').z).toEqual([7, 1, 0, 0, 3, 1, 0]);
  });

  it('finds the longest odd palindrome with Manacher', () => {
    const r = manacherOdd('abacabadx');
    expect(r.longest).toBe('abacaba');
    expect(r.d).toEqual([1, 2, 1, 4, 1, 2, 1, 1, 1]);
  });
});
