import { describe, expect, it } from 'vitest';
import { editDistance, lcsTable, lisPatience } from './dp-sequences';

describe('sequence DP traces', () => {
  it('finds the LIS length with patience sorting', () => {
    expect(lisPatience([10, 9, 2, 5, 3, 7, 101, 18]).length).toBe(4);
    expect(lisPatience([0, 1, 0, 3, 2, 3]).length).toBe(4);
    expect(lisPatience([7, 7, 7]).length).toBe(1);
  });

  it('fills the LCS table and traces one answer back', () => {
    const r = lcsTable('acbde', 'abce');
    expect(r.length).toBe(3);
    expect(r.lcs.length).toBe(3);
    expect(lcsTable('abc', 'def').length).toBe(0);
    expect(lcsTable('abcde', 'ace').lcs).toBe('ace');
  });

  it('computes edit distance', () => {
    expect(editDistance('horse', 'ros').distance).toBe(3);
    expect(editDistance('intention', 'execution').distance).toBe(5);
    expect(editDistance('lead', 'deal').distance).toBe(2);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [lisPatience([3, 1, 2]), lcsTable('ab', 'ba'), editDistance('ab', 'b')]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
