import { describe, expect, it } from 'vitest';
import { anagramCounts, goodPairs, vowelContributions } from './counting';

describe('counting traces', () => {
  it('checks anagrams with one table', () => {
    expect(anagramCounts('anagram', 'nagaram').isAnagram).toBe(true);
    expect(anagramCounts('rat', 'car').isAnagram).toBe(false);
    expect(anagramCounts('ab', 'abc').isAnagram).toBe(false);
  });

  it('counts good pairs in one pass', () => {
    expect(goodPairs([1, 2, 3, 1, 1, 3]).pairs).toBe(4);
    expect(goodPairs([1, 1, 1, 1]).pairs).toBe(6);
    expect(goodPairs([1, 2, 3]).pairs).toBe(0);
  });

  it('sums vowel contributions', () => {
    expect(vowelContributions('aba').total).toBe(6);
    expect(vowelContributions('abc').total).toBe(3);
    expect(vowelContributions('ltcd').total).toBe(0);
    // Brute force over all substrings of "nature".
    const w = 'nature';
    let brute = 0;
    for (let i = 0; i < w.length; i++) for (let j = i; j < w.length; j++) brute += [...w.slice(i, j + 1)].filter((c) => 'aeiou'.includes(c)).length;
    expect(vowelContributions(w).total).toBe(brute);
  });

  it('explains every frame', () => {
    for (const { frames } of [anagramCounts('ab', 'ba'), goodPairs([1, 1]), vowelContributions('ab')]) {
      expect(frames.length).toBeGreaterThan(1);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
