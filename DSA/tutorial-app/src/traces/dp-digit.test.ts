import { describe, expect, it } from 'vitest';
import { atMostNGivenDigitSet, digitSumCount } from './dp-digit';

const bruteSet = (digits: number[], n: number) => {
  let c = 0;
  for (let x = 1; x <= n; x++) if ([...String(x)].every((ch) => digits.includes(Number(ch)))) c++;
  return c;
};
const bruteSum = (n: number, t: number) => {
  let c = 0;
  for (let x = 0; x <= n; x++) if ([...String(x)].reduce((s, ch) => s + Number(ch), 0) === t) c++;
  return c;
};

describe('digit DP traces', () => {
  it('counts numbers made of allowed digits', () => {
    expect(atMostNGivenDigitSet([1, 3, 6, 7], 6371).answer).toBe(bruteSet([1, 3, 6, 7], 6371));
    expect(atMostNGivenDigitSet([1, 3, 5, 7], 100).answer).toBe(20);
    expect(atMostNGivenDigitSet([1, 4, 9], 1000000000).answer).toBe(29523);
    for (const n of [7, 54, 999, 4519]) expect(atMostNGivenDigitSet([1, 4, 9], n).answer).toBe(bruteSet([1, 4, 9], n));
  });

  it('counts numbers with a given digit sum', () => {
    expect(digitSumCount(325, 5).answer).toBe(18);
    for (const [n, t] of [[999, 9], [1000, 1], [87, 15], [5, 5], [40, 12]]) expect(digitSumCount(n, t).answer).toBe(bruteSum(n, t));
  });

  it('explains every frame', () => {
    for (const { frames } of [atMostNGivenDigitSet([1, 3, 6, 7], 6371), digitSumCount(325, 5)]) {
      expect(frames.length).toBeGreaterThan(3);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(5);
    }
  });
});
