import { describe, expect, it } from 'vitest';
import { chainingSet, groupByKey } from './hash-function';

describe('hash function traces', () => {
  it('stores keys in chained buckets and answers membership', () => {
    const r = chainingSet(7, [['add', 10], ['add', 3], ['add', 17], ['add', 24], ['add', 3], ['contains', 17], ['contains', 31], ['remove', 10], ['contains', 10]]);
    expect(r.buckets[3]).toEqual([3, 17, 24]);
    expect(r.results.filter((x) => x !== null)).toEqual([true, false, false]);
  });

  it('groups anagrams by sorted letters', () => {
    const r = groupByKey(['stop', 'race', 'pots', 'care', 'dog', 'tops']);
    expect(r.groups).toEqual([['stop', 'pots', 'tops'], ['race', 'care'], ['dog']]);
    expect(r.frames.length).toBe(8);
  });
});
