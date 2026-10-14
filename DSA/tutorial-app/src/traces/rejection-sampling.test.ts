import { describe, expect, it } from 'vitest';
import { rand10Walkthrough } from './rejection-sampling';

describe('rejection sampling trace', () => {
  it('maps accepted cells to 1..10 and rejects 41..49', () => {
    const r = rand10Walkthrough([7, 3, 2, 5, 6, 6, 1, 1]);
    // (7,3) → 45 rejected; (2,5) → 12 → 2; (6,6) → 41 rejected; (1,1) → 1 → 1
    expect(r.results).toEqual([2, 1]);
    expect(r.calls).toBe(8);
  });

  it('gives every result exactly four of the 49 cells', () => {
    const count = new Array<number>(11).fill(0);
    for (let a = 1; a <= 7; a++) for (let b = 1; b <= 7; b++) {
      const idx = (a - 1) * 7 + b;
      if (idx <= 40) count[((idx - 1) % 10) + 1]++;
    }
    expect(count.slice(1)).toEqual(new Array(10).fill(4));
  });
});
