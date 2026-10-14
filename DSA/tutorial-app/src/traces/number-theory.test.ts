import { describe, expect, it } from 'vitest';
import { euclid, fastPow, sieve } from './number-theory';

describe('number theory traces', () => {
  it("runs Euclid's algorithm", () => {
    expect(euclid(252, 105).gcd).toBe(21);
    expect(euclid(17, 5).gcd).toBe(1);
    expect(euclid(9, 3).gcd).toBe(3);
  });

  it('sieves the primes up to n', () => {
    expect(sieve(30).primes).toEqual([2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
    expect(sieve(10).primes).toEqual([2, 3, 5, 7]);
  });

  it('raises to a power by squaring', () => {
    expect(fastPow(3, 13, 1000).result).toBe(1594323 % 1000);
    expect(fastPow(2, 10, 1337).result).toBe(1024);
    expect(fastPow(7, 1, 5).result).toBe(2);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [euclid(48, 18), sieve(20), fastPow(5, 6, 13)]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
