import { describe, expect, it } from 'vitest';
import { bucketInserts, groupAnagrams, longestConsecutive, twoSum } from './hash-table';

describe('hash table traces', () => {
  it('places keys by key mod size and chains collisions', () => {
    const r = bucketInserts([12, 7, 25, 3, 18, 32], 7);
    expect(r.buckets[4]).toEqual([25, 18, 32]);
    expect(r.buckets[0]).toEqual([7]);
    expect(r.buckets[5]).toEqual([12]);
  });

  it('finds the Two Sum pair with a map', () => {
    expect(twoSum([3, 8, 11, 4, 7], 15).result).toEqual([2, 3]);
    expect(twoSum([3, 3], 6).result).toEqual([0, 1]);
    expect(twoSum([1, 2], 10).result).toBeNull();
  });

  it('groups anagrams by sorted letters', () => {
    const { groups } = groupAnagrams(['eat', 'tea', 'tan', 'ate', 'nat', 'bat']);
    expect(groups).toEqual([['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']]);
  });

  it('finds the longest consecutive run', () => {
    expect(longestConsecutive([100, 4, 200, 1, 3, 2, 101]).best).toBe(4);
    expect(longestConsecutive([0, 3, 7, 2, 5, 8, 4, 6, 0, 1]).best).toBe(9);
    expect(longestConsecutive([]).best).toBe(0);
  });

  it('explains every frame', () => {
    for (const { frames } of [bucketInserts([1, 8], 7), twoSum([1, 2], 3), groupAnagrams(['ab', 'ba']), longestConsecutive([2, 1])]) {
      expect(frames.length).toBeGreaterThan(1);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
