import { describe, expect, it } from 'vitest';
import { robTree, sumOfDistances } from './dp-tree';

const layout = [
  { id: '0', x: 150, y: 0 },
  { id: '1', x: 50, y: 80 },
  { id: '2', x: 250, y: 80 },
  { id: '3', x: 160, y: 160 },
  { id: '4', x: 250, y: 160 },
  { id: '5', x: 340, y: 160 },
];

describe('tree DP traces', () => {
  it('robs the tree for the most money', () => {
    expect(robTree([3, 4, 5, 1, 3, null, 1]).answer).toBe(9);
    expect(robTree([3, 2, 3, null, 3, null, 1]).answer).toBe(7);
    expect(robTree([4, 1, 6, 2, 3, null, 5]).answer).toBe(14); // the walkthrough
    expect(robTree([2, 5, 1, null, 4, 3]).answer).toBe(9); // the on-paper exercise
  });

  it('computes the sum of distances from every node', () => {
    const r = sumOfDistances(6, [[0, 1], [0, 2], [2, 3], [2, 4], [2, 5]], layout);
    expect(r.answer).toEqual([8, 12, 6, 10, 10, 10]);
    // The walkthrough's tree, checked against the distances counted by hand.
    expect(sumOfDistances(6, [[0, 1], [1, 2], [1, 3], [3, 4], [3, 5]], layout).answer).toEqual([11, 7, 11, 7, 11, 11]);
  });

  it('explains every frame', () => {
    for (const { frames } of [robTree([3, 4, 5, 1, 3, null, 1]), sumOfDistances(6, [[0, 1], [0, 2], [2, 3], [2, 4], [2, 5]], layout)]) {
      expect(frames.length).toBeGreaterThan(4);
      for (const f of frames) expect(f.note.length).toBeGreaterThan(20);
    }
  });
});
