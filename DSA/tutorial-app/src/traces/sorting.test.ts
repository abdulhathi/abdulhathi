import { describe, expect, it } from 'vitest';
import { bubbleSort, insertionSort } from './sorting';

describe('sorting traces', () => {
  it('bubble sort sorts and stops early when a pass makes no swaps', () => {
    const r = bubbleSort([5, 1, 4, 2, 8]);
    expect(r.sorted).toEqual([1, 2, 4, 5, 8]);
    expect(r.swaps).toBe(4);
    expect(r.frames.at(-1)!.note).toMatch(/no swaps/);
  });

  it('insertion sort shifts once per inversion', () => {
    const r = insertionSort([5, 2, 4, 6, 1, 3]);
    expect(r.sorted).toEqual([1, 2, 3, 4, 5, 6]);
    expect(r.shifts).toBe(9);
  });

  it('writes a sentence for every frame and keeps walkthroughs a readable length', () => {
    for (const { frames } of [bubbleSort([5, 1, 4, 2, 8]), insertionSort([5, 2, 4, 6, 1, 3])]) {
      expect(frames.length).toBeGreaterThan(5);
      expect(frames.length).toBeLessThanOrEqual(20);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
