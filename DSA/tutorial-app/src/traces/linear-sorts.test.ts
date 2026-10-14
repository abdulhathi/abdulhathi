import { describe, expect, it } from 'vitest';
import { countingSort, radixSort } from './linear-sorts';

describe('linear sort traces', () => {
  it('counting sort sorts small values', () => {
    const r = countingSort([4, 1, 3, 4, 0, 2, 1], 4);
    expect(r.sorted).toEqual([0, 1, 1, 2, 3, 4, 4]);
    expect(r.frames.length).toBeLessThanOrEqual(20);
  });

  it('radix sort sorts by digits, last digit first', () => {
    const a = [170, 45, 75, 90, 802, 24, 2, 66];
    const r = radixSort(a);
    expect(r.sorted).toEqual([...a].sort((x, y) => x - y));
    expect(r.frames.length).toBe(7); // intro + two frames for each of the 3 digits
  });
});
