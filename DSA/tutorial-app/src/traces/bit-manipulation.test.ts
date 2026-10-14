import { describe, expect, it } from 'vitest';
import { bitsOf, countingBits, kernighan, xorSingle } from './bit-manipulation';

describe('bit manipulation traces', () => {
  it('pads bits to a width', () => {
    expect(bitsOf(5, 4)).toEqual([0, 1, 0, 1]);
  });

  it("counts set bits with Kernighan's trick, one round per bit", () => {
    const r = kernighan(44);
    expect(r.count).toBe(3);
    expect(r.frames.length).toBe(5);
    expect(kernighan(255).count).toBe(8);
  });

  it('finds the single value with XOR', () => {
    expect(xorSingle([4, 1, 2, 1, 2]).single).toBe(4);
    expect(xorSingle([7]).single).toBe(7);
    expect(xorSingle([6, 3, 5, 3, 6], 3).single).toBe(5);
  });

  it('counts bits for 0..n from earlier answers', () => {
    expect(countingBits(8).ans).toEqual([0, 1, 1, 2, 1, 2, 2, 3, 1]);
  });
});
