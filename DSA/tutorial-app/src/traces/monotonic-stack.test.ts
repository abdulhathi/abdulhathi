import { describe, expect, it } from 'vitest';
import { cartesianTree, largestRectangle, minContributions, nextWarmer, removeKDigits } from './monotonic-stack';

describe('monotonic stack traces', () => {
  it('finds the wait for a warmer day', () => {
    expect(nextWarmer([73, 74, 75, 71, 69, 72, 76, 73]).answer).toEqual([1, 1, 4, 2, 1, 1, 0, 0]);
    expect(nextWarmer([30, 60, 90]).answer).toEqual([1, 1, 0]);
    expect(nextWarmer([71, 69, 72, 70, 68, 73, 75, 70]).answer).toEqual([2, 1, 3, 2, 1, 1, 0, 0]);
  });

  it('finds the largest rectangle in a histogram', () => {
    expect(largestRectangle([2, 1, 5, 6, 2, 3]).best).toBe(10);
    expect(largestRectangle([2, 4]).best).toBe(4);
    expect(largestRectangle([2, 4, 5, 3, 1, 3]).best).toBe(9);
    expect(largestRectangle([3, 3, 3]).best).toBe(9);
  });

  it('removes k digits to make the smallest number', () => {
    expect(removeKDigits('1432219', 3).result).toBe('1219');
    expect(removeKDigits('10200', 1).result).toBe('200');
    expect(removeKDigits('10', 2).result).toBe('0');
    expect(removeKDigits('5381274', 3).result).toBe('1274');
    expect(removeKDigits('12345', 2).result).toBe('123');
  });

  it('counts each value as the minimum of the right subarrays', () => {
    expect(minContributions([3, 1, 2, 4]).total).toBe(17);
    expect(minContributions([4, 2, 3, 5]).total).toBe(27);
    expect(minContributions([11, 81, 94, 43, 3]).total).toBe(444);
    // Ties are counted once: brute force agrees.
    const arr = [2, 2, 1, 2];
    let brute = 0;
    for (let i = 0; i < arr.length; i++) for (let j = i; j < arr.length; j++) brute += Math.min(...arr.slice(i, j + 1));
    expect(minContributions(arr).total).toBe(brute);
  });

  it('builds the maximum binary tree with a stack', () => {
    expect(cartesianTree([3, 2, 1, 6, 0, 5]).levelOrder).toEqual([6, 3, 5, null, 2, 0, null, null, 1]);
    expect(cartesianTree([3, 2, 1]).levelOrder).toEqual([3, null, 2, null, 1]);
    expect(cartesianTree([4, 1, 6, 2, 5, 3]).levelOrder).toEqual([6, 4, 5, null, 1, 2, 3]);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [nextWarmer([3, 1, 4]), largestRectangle([1, 3, 2]), removeKDigits('321', 1), cartesianTree([1, 3, 2])]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
