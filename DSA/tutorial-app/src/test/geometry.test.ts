import { describe, expect, it } from 'vitest';
import { anchor, HEX_INSET, legendFor, placeNode, routeEdge } from '../diagrams/geometry';

describe('diagram geometry', () => {
  const hub = placeNode({ id: 'x', kind: 'engine', shape: 'hex', x: 100, y: 100, label: 'libuv' });

  it('sizes nodes to fit their longest text, unless given a width', () => {
    const short = placeNode({ id: 'a', kind: 'store', x: 0, y: 0, label: 'db' });
    const long = placeNode({ id: 'b', kind: 'store', x: 0, y: 0, label: 'migrations/001-create-tasks.sql' });
    const fixed = placeNode({ id: 'c', kind: 'app', x: 0, y: 0, label: 'x', w: 400 });
    expect(short.w).toBe(112);
    expect(long.w).toBeGreaterThan(200);
    expect(fixed.w).toBe(400);
  });

  it('pulls offset anchors onto the slanted hexagon outline', () => {
    expect(anchor(hub, 'r')).toEqual([100 + hub.w / 2, 100]);
    const [x, y] = anchor(hub, 'r', 25);
    expect(y).toBe(125);
    expect(x).toBeCloseTo(100 + hub.w / 2 - HEX_INSET);
  });

  it('rejects edges to unknown nodes', () => {
    expect(() => routeEdge(new Map([['x', hub]]), { a: 'x', b: 'missing' })).toThrow(/unknown node/);
  });

  it('builds the legend from the kinds a diagram uses, with per-diagram labels', () => {
    const spec = {
      width: 10, height: 10, title: 't', edges: [],
      nodes: [
        { id: 'a', kind: 'store' as const, x: 0, y: 0, label: 'a' },
        { id: 'b', kind: 'app' as const, x: 0, y: 0, label: 'b' },
      ],
      legend: { store: 'Database' },
    };
    expect(legendFor(spec)).toEqual([['app', 'Question'], ['store', 'Database']]);
  });
});
