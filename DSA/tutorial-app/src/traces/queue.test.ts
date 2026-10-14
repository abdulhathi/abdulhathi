import { describe, expect, it } from 'vitest';
import { recentCalls, ringBuffer, twoStackQueue } from './queue';

describe('queue traces', () => {
  it('runs a ring buffer that wraps around', () => {
    const r = ringBuffer(4, [['enqueue', 1], ['enqueue', 2], ['enqueue', 3], ['dequeue'], ['dequeue'], ['enqueue', 4], ['enqueue', 5], ['enqueue', 6], ['enqueue', 7]]);
    expect(r.contents).toEqual([3, 4, 5, 6]);
    expect(r.results).toEqual([true, true, true, 1, 2, true, true, true, false]);
  });

  it('pops two-stack queue items in arrival order', () => {
    const r = twoStackQueue([['push', 1], ['push', 2], ['push', 3], ['pop'], ['push', 4], ['pop'], ['pop'], ['pop']]);
    expect(r.popped).toEqual([1, 2, 3, 4]);
  });

  it('counts recent calls in a 3000 ms window', () => {
    expect(recentCalls([1, 100, 3001, 3002]).counts).toEqual([1, 2, 3, 3]);
    expect(recentCalls([500, 2000, 3600, 4100, 7200]).counts).toEqual([1, 2, 2, 3, 1]);
  });

  it('writes a sentence for every frame', () => {
    for (const { frames } of [ringBuffer(2, [['enqueue', 1], ['dequeue']]), twoStackQueue([['push', 1], ['pop']]), recentCalls([1, 5000])]) {
      expect(frames.length).toBeGreaterThan(2);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
    }
  });
});
