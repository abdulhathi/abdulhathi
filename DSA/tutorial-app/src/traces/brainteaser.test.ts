import { describe, expect, it } from 'vitest';
import { bulbs } from './brainteaser';

describe('brainteaser traces', () => {
  it('leaves exactly the perfect squares on', () => {
    expect(bulbs(12).on).toEqual([1, 4, 9]);
    expect(bulbs(3).on).toEqual([1]);
    expect(bulbs(16).on).toEqual([1, 4, 9, 16]);
  });

  it('writes a sentence for every frame', () => {
    const { frames } = bulbs(12);
    expect(frames.length).toBe(14);
    for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
  });
});
