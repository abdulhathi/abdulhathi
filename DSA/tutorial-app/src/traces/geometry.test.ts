import { describe, expect, it } from 'vitest';
import { convexHull, cross, rectangleProjections, type Point } from './geometry';

describe('geometry traces', () => {
  it('tells left turns from right turns', () => {
    expect(cross([0, 0], [1, 0], [1, 1])).toBeGreaterThan(0);
    expect(cross([0, 0], [1, 0], [1, -1])).toBeLessThan(0);
    expect(cross([0, 0], [1, 1], [2, 2])).toBe(0);
  });

  it('finds the convex hull with the monotone chain', () => {
    const pts: Point[] = [[0, 1], [1, 0], [2, 2], [3, 0], [4, 1], [2, 4], [1, 2], [3, 3]];
    const { hull, frames } = convexHull(pts);
    const key = (p: Point) => p.join(',');
    expect(new Set(hull.map(key))).toEqual(new Set(['0,1', '1,0', '3,0', '4,1', '3,3', '2,4']));
    expect(frames.length).toBeLessThanOrEqual(20);
    for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
  });

  it('checks rectangle overlap through the two axis shadows', () => {
    expect(rectangleProjections([0, 0, 4, 3], [2, 1, 6, 5]).area).toBe(4);
    expect(rectangleProjections([0, 0, 1, 1], [1, 0, 2, 1]).overlap).toBe(false);
  });
});
