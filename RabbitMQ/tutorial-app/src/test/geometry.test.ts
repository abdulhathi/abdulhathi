import { describe, expect, it } from 'vitest';
import { anchor, HEX_INSET, placeNode, routeEdge } from '../diagrams/geometry';

describe('diagram geometry', () => {
  const exchange = placeNode({ id: 'x', kind: 'exchange', x: 100, y: 100, label: 'shop' });

  it('sizes nodes to fit their longest text', () => {
    const short = placeNode({ id: 'q', kind: 'queue', x: 0, y: 0, label: 'q' });
    const long = placeNode({ id: 'q', kind: 'queue', x: 0, y: 0, label: 'orders.placed.analytics' });
    expect(short.w).toBe(112);
    expect(long.w).toBeGreaterThan(200);
  });

  it('pulls offset anchors onto the slanted hexagon outline', () => {
    expect(anchor(exchange, 'r')).toEqual([100 + exchange.w / 2, 100]);
    const [x, y] = anchor(exchange, 'r', 25);
    expect(y).toBe(125);
    expect(x).toBeCloseTo(100 + exchange.w / 2 - HEX_INSET);
  });

  it('rejects edges to unknown nodes', () => {
    expect(() => routeEdge(new Map([['x', exchange]]), { a: 'x', b: 'missing' })).toThrow(/unknown node/);
  });
});
