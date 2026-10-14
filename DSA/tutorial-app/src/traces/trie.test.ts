import { describe, expect, it } from 'vitest';
import { maxXor, trieBuildAndSearch } from './trie';

describe('trie traces', () => {
  it('answers search and prefix questions like a set of words would', () => {
    const words = ['cat', 'car', 'cart', 'do', 'dog'];
    const queries = [
      { kind: 'search' as const, text: 'car' },
      { kind: 'search' as const, text: 'ca' },
      { kind: 'prefix' as const, text: 'ca' },
      { kind: 'search' as const, text: 'cow' },
      { kind: 'prefix' as const, text: 'dog' },
    ];
    const r = trieBuildAndSearch(words, queries);
    const expected = queries.map((q) => (q.kind === 'search' ? words.includes(q.text) : words.some((w) => w.startsWith(q.text))));
    expect(r.answers).toEqual(expected);
    expect(r.frames.length).toBe(1 + words.length + queries.length);
  });

  it('finds the maximum XOR of two numbers, matching brute force', () => {
    const cases: [number[], number][] = [
      [[4, 9, 6, 12, 3], 4],
      [[3, 10, 5, 25, 2, 8], 5],
      [[7], 3],
      [[1, 2, 4, 8, 15], 4],
    ];
    for (const [nums, bits] of cases) {
      let brute = 0;
      for (const a of nums) for (const b of nums) brute = Math.max(brute, a ^ b);
      expect(maxXor(nums, bits).best).toBe(brute);
    }
  });

  it('writes a sentence for every frame', () => {
    for (const f of maxXor([4, 9, 6, 12, 3], 4).frames) expect(f.note.length).toBeGreaterThan(20);
  });
});
