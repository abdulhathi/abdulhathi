import { describe, expect, it } from 'vitest';
import { fitView, MAX_SCALE, minScaleFor, zoomAt } from '../diagrams/zoom';

describe('diagram zoom maths', () => {
  it('fits the whole diagram, centred inside the padding', () => {
    expect(fitView({ w: 1000, h: 400 }, { w: 1048, h: 448 })).toEqual({ scale: 1, x: 24, y: 24 });
    const tall = fitView({ w: 1000, h: 400 }, { w: 2048, h: 448 });
    expect(tall.scale).toBe(1);
    expect(tall.x).toBe(524);
  });

  it('falls back to actual size when the viewport has no size yet', () => {
    expect(fitView({ w: 1000, h: 400 }, { w: 0, h: 0 })).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const before = { scale: 1, x: 10, y: 20 };
    const after = zoomAt(before, 2, 110, 70, 0.1);
    const diagramPoint = (v: typeof before) => [(110 - v.x) / v.scale, (70 - v.y) / v.scale];
    expect(after.scale).toBe(2);
    expect(diagramPoint(after)).toEqual(diagramPoint(before));
  });

  it('clamps between half the fitted size and the maximum', () => {
    const fit = { scale: 0.8, x: 0, y: 0 };
    expect(zoomAt(fit, 100, 0, 0, minScaleFor(fit)).scale).toBe(MAX_SCALE);
    expect(zoomAt(fit, 0.01, 0, 0, minScaleFor(fit)).scale).toBe(0.4);
  });
});
