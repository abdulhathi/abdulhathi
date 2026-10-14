import { describe, expect, it } from 'vitest';
import { longestDuplicate, polyHash, rabinKarp } from './rolling-hash';

describe('rolling hash traces', () => {
  it('slides the hash in O(1) and agrees with hashing each window from scratch', () => {
    const text = 'bacabdcabacd';
    const r = rabinKarp(text, 'cab', 31, 17);
    expect(r.matches).toEqual([2, 6]);
    expect(r.falseHits).toEqual([4]); // same hash as "cab", different letters
    expect(polyHash(text.slice(4, 7), 31, 17)).toBe(polyHash('cab', 31, 17));
  });

  it('finds every real occurrence with a large modulus', () => {
    const text = 'abababcab';
    expect(rabinKarp(text, 'ab', 31, 94906249).matches).toEqual([0, 2, 4, 7]);
  });

  it('binary searches the longest repeated substring', () => {
    expect(longestDuplicate('mississippi').answer).toBe('issi');
    expect(longestDuplicate('abcd').answer).toBe('');
    expect(longestDuplicate('aaaa').answer).toBe('aaa');
  });
});
