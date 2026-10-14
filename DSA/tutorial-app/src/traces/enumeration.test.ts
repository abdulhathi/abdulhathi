import { describe, expect, it } from 'vitest';
import { arithmeticTriplets, consecutiveSums, sequentialDigits } from './enumeration';

describe('enumeration traces', () => {
  it('lists sequential digits in range, in order', () => {
    expect(sequentialDigits(1000, 13000).found).toEqual([1234, 2345, 3456, 4567, 5678, 6789, 12345]);
    expect(sequentialDigits(100, 300).found).toEqual([123, 234]);
    expect(sequentialDigits(10, 1000000000).found.length).toBe(36);
  });

  it('counts arithmetic triplets by fixing the middle', () => {
    expect(arithmeticTriplets([0, 1, 4, 6, 7, 10], 3).count).toBe(2);
    expect(arithmeticTriplets([4, 5, 6, 7, 8, 9], 2).count).toBe(2);
  });

  it('counts consecutive sums by enumerating the length', () => {
    expect(consecutiveSums(5).ways).toBe(2);
    expect(consecutiveSums(9).ways).toBe(3);
    expect(consecutiveSums(15).ways).toBe(4);
    expect(consecutiveSums(1).ways).toBe(1);
  });

  it('explains every frame', () => {
    for (const { frames } of [sequentialDigits(10, 30), arithmeticTriplets([1, 2, 3], 1), consecutiveSums(3)]) {
      expect(frames.length).toBeGreaterThan(1);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
