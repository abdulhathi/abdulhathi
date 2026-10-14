import { describe, expect, it } from 'vitest';
import { anagramCount, expandAroundCentre, zigzagByFormula, zigzagLayout } from './string';

describe('string traces', () => {
  it('finds the longest palindrome by expanding around centres', () => {
    expect(expandAroundCentre('cabbad').best).toBe('abba');
    expect(expandAroundCentre('racecarx').best).toBe('racecar');
    expect(expandAroundCentre('a').best).toBe('a');
    expect(expandAroundCentre('cabbad').frames.length).toBe(12);
  });

  it('checks anagrams with letter counts', () => {
    expect(anagramCount('care', 'race').isAnagram).toBe(true);
    expect(anagramCount('care', 'cars').isAnagram).toBe(false);
    expect(anagramCount('ab', 'abc').isAnagram).toBe(false);
  });

  it('lays out a zigzag that reads back like the row formula', () => {
    for (const [s, rows] of [['DATASTRUCTURES', 4], ['ABCDEFG', 3], ['AB', 1], ['ABCDE', 5], ['HELLOWORLD', 2]] as const) {
      expect(zigzagLayout(s, rows).result).toBe(zigzagByFormula(s, rows));
    }
  });
});
