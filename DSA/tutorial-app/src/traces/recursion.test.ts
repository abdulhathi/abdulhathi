import { describe, expect, it } from 'vitest';
import { grammarRows, kthSymbol, powerCallStack, reverseListRecursive } from './recursion';

describe('recursion traces', () => {
  it('computes powers with a shallow call stack', () => {
    const r = powerCallStack(2, 10);
    expect(r.result).toBe(1024);
    expect(r.depth).toBe(5); // pow(2,10), (2,5), (2,2), (2,1), (2,0)
    expect(powerCallStack(3, 5).result).toBe(243);
    expect(powerCallStack(2, 13).result).toBe(8192);
    expect(powerCallStack(2, 13).depth).toBe(5);
  });

  it('reverses a list', () => {
    expect(reverseListRecursive([1, 2, 3, 4]).reversed).toEqual([4, 3, 2, 1]);
    expect(reverseListRecursive([7]).reversed).toEqual([7]);
  });
});

describe('grammar rows', () => {
  it('builds rows by the 0 → 01, 1 → 10 rule, and the parent rule agrees with them', () => {
    const rows = grammarRows(5);
    expect(rows[2]).toEqual([0, 1, 1, 0]);
    expect(rows[3]).toEqual([0, 1, 1, 0, 1, 0, 0, 1]);
    rows.forEach((row, i) => row.forEach((b, k) => expect(kthSymbol(i + 1, k + 1)).toBe(b)));
  });
});
