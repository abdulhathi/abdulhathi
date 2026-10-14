import { describe, expect, it } from 'vitest';
import { fastPower, multiplyStrings, newtonSqrt } from './math';

describe('math traces', () => {
  it('raises to a power by squaring', () => {
    const r = fastPower(3, 13);
    expect(r.result).toBe(1594323);
    expect(r.multiplications).toBeLessThan(12);
    expect(fastPower(2, 1).result).toBe(2);
  });

  it("finds integer square roots with Newton's method", () => {
    expect(newtonSqrt(150).root).toBe(12);
    expect(newtonSqrt(144).root).toBe(12);
    expect(newtonSqrt(1).root).toBe(1);
    for (let x = 1; x < 2000; x++) {
      const r = newtonSqrt(x).root;
      expect(r * r <= x && (r + 1) * (r + 1) > x).toBe(true);
    }
  });

  it('multiplies digit strings', () => {
    expect(multiplyStrings('123', '45').product).toBe('5535');
    expect(multiplyStrings('99', '99').product).toBe('9801');
    expect(multiplyStrings('0', '52').product).toBe('0');
  });
});
