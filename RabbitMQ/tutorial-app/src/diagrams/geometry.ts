// Pure layout maths for the message-flow diagrams: node sizes, edge anchors,
// curve paths and label positions. Rendering lives in Diagram.tsx.

export type NodeKind = 'producer' | 'consumer' | 'exchange' | 'queue' | 'dead';
export type EdgeKind = 'flow' | 'dead' | 'reply' | 'retry';
export type Side = 'r' | 'l' | 't' | 'b';
export type Point = [number, number];

export type NodeSpec = { id: string; kind: NodeKind; x: number; y: number; label: string; sub?: string };
export type EdgeSpec = {
  a: string;
  b: string;
  label?: string;
  kind?: EdgeKind;
  sa?: Side; // side of node a the edge leaves from
  sb?: Side; // side of node b the edge arrives at
  oa?: number; // offset along that side
  ob?: number;
  pts?: Point[]; // waypoints for a right-angled route instead of a curve
  lpos?: Point; // manual label position
};
export type DiagramSpec = { width: number; height: number; title: string; nodes: NodeSpec[]; edges: EdgeSpec[] };
export type PlacedNode = NodeSpec & { sub: string; w: number; h: number };

export const EDGE_KINDS: EdgeKind[] = ['flow', 'dead', 'reply', 'retry'];
const NODE_H = 50;
export const HEX_INSET = 16;
const SUBS: Record<NodeKind, string> = {
  producer: 'PRODUCER',
  consumer: 'CONSUMER',
  exchange: 'EXCHANGE',
  queue: 'QUEUE',
  dead: 'PARKING LOT',
};
const DIRS: Record<Side, Point> = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };

export const hasSlots = (kind: NodeKind) => kind === 'queue' || kind === 'dead';

// Width follows the longest text: 12px mono label or 9.5px spaced caps caption.
export function placeNode(n: NodeSpec): PlacedNode {
  const sub = n.sub ?? SUBS[n.kind];
  const extra = 32 + (hasSlots(n.kind) ? 16 : 0) + (n.kind === 'exchange' ? 20 : 0);
  const w = Math.max(112, 7.3 * n.label.length + extra, 6.2 * sub.length + extra);
  return { ...n, sub, w, h: NODE_H };
}

export function anchor(n: PlacedNode, side: Side, off = 0): Point {
  if (n.kind === 'exchange' && (side === 'r' || side === 'l') && off) {
    // The hexagon's sides slant inwards, so pull offset anchors onto the outline.
    const inset = HEX_INSET * Math.min(1, Math.abs(off) / (n.h / 2));
    const [x, y] = anchor(n, side);
    return [side === 'r' ? x - inset : x + inset, y + off];
  }
  switch (side) {
    case 'r':
      return [n.x + n.w / 2, n.y + off];
    case 'l':
      return [n.x - n.w / 2, n.y + off];
    case 't':
      return [n.x + off, n.y - n.h / 2];
    case 'b':
      return [n.x + off, n.y + n.h / 2];
  }
}

const f = (v: number) => v.toFixed(1);

export function routeEdge(nodes: Map<string, PlacedNode>, e: EdgeSpec): { d: string; labelAt: Point } {
  const A = nodes.get(e.a);
  const B = nodes.get(e.b);
  if (!A || !B) throw new Error(`Diagram edge refers to an unknown node: ${e.a} -> ${e.b}`);

  const [sa, sb]: [Side, Side] = e.sa && e.sb ? [e.sa, e.sb] : B.x > A.x ? ['r', 'l'] : ['l', 'r'];
  const [x1, y1] = anchor(A, sa, e.oa ?? 0);
  const [x2, y2] = anchor(B, sb, e.ob ?? 0);

  if (e.pts?.length) {
    const seq: Point[] = [[x1, y1], ...e.pts, [x2, y2]];
    const d = `M${f(x1)},${f(y1)} ` + seq.slice(1).map(([px, py]) => `L${f(px)},${f(py)}`).join(' ');
    if (e.lpos) return { d, labelAt: e.lpos };
    // Label the longest segment.
    let best: [Point, Point] = [seq[0], seq[1]];
    for (let i = 1; i < seq.length - 1; i++) {
      const len = (p: Point, q: Point) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
      if (len(seq[i], seq[i + 1]) > len(best[0], best[1])) best = [seq[i], seq[i + 1]];
    }
    return { d, labelAt: [(best[0][0] + best[1][0]) / 2, (best[0][1] + best[1][1]) / 2] };
  }

  const dist = Math.max(36, (Math.abs(x2 - x1) + Math.abs(y2 - y1)) * 0.42);
  const c1: Point = [x1 + DIRS[sa][0] * dist, y1 + DIRS[sa][1] * dist];
  const c2: Point = [x2 + DIRS[sb][0] * dist, y2 + DIRS[sb][1] * dist];
  const d = `M${f(x1)},${f(y1)} C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(x2)},${f(y2)}`;
  // Midpoint of the cubic Bezier at t = 0.5.
  const mid: Point = [(x1 + 3 * c1[0] + 3 * c2[0] + x2) / 8, (y1 + 3 * c1[1] + 3 * c2[1] + y2) / 8];
  return { d, labelAt: e.lpos ?? mid };
}

export const pillWidth = (text: string) => 6.6 * text.length + 14;
