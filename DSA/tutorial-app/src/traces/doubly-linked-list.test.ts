import { describe, expect, it } from 'vitest';
import { lruCache } from './doubly-linked-list';

describe('doubly linked list traces', () => {
  it('behaves like LeetCode\'s LRU cache example', () => {
    const { results } = lruCache(2, [
      ['put', 1, 1],
      ['put', 2, 2],
      ['get', 1],
      ['put', 3, 3],
      ['get', 2],
      ['put', 4, 4],
      ['get', 1],
      ['get', 3],
      ['get', 4],
    ]);
    expect(results).toEqual([null, null, 1, null, -1, null, -1, 3, 4]);
  });

  it('runs the chapter\'s sequence, with an update and two evictions', () => {
    const { results } = lruCache(2, [
      ['put', 5, 50], ['put', 7, 70], ['get', 5], ['put', 9, 90], ['get', 7],
      ['put', 5, 55], ['put', 3, 30], ['get', 9], ['get', 5], ['get', 3],
    ]);
    expect(results.filter((r) => r !== null)).toEqual([50, -1, -1, 55, 30]);
  });

  it('moves updated keys to the front', () => {
    const { results } = lruCache(2, [['put', 1, 1], ['put', 2, 2], ['put', 1, 10], ['put', 3, 3], ['get', 2], ['get', 1]]);
    expect(results).toEqual([null, null, null, null, -1, 10]);
  });

  it('explains every frame', () => {
    const { frames } = lruCache(1, [['put', 1, 1], ['put', 2, 2], ['get', 1]]);
    expect(frames.length).toBeGreaterThan(1);
    for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
  });
});
