// Pure layout maths for the diagrams: node sizes, edge anchors, curve paths
// and label positions. Rendering lives in DiagramSvg.tsx.

/** What a box stands for. Each kind has its own colour, shared by the legend. */
export type NodeKind = 'app' | 'core' | 'engine' | 'os' | 'store' | 'error';
/** hex suits a dispatcher (router, event loop); pill suits an actor (client, user). */
export type Shape = 'rect' | 'hex' | 'pill';
export type EdgeKind = 'flow' | 'error' | 'reply' | 'loop';
export type Side = 'r' | 'l' | 't' | 'b';
export type Point = [number, number];

export type NodeSpec = {
  id: string;
  kind: NodeKind;
  x: number; // centre
  y: number;
  label: string;
  sub?: string; // small caps caption under the label
  shape?: Shape;
  w?: number; // fixed width, for wide layer boxes
};
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
export type DiagramSpec = {
  width: number;
  height: number;
  title: string; // read by screen readers
  nodes: NodeSpec[];
  edges: EdgeSpec[];
  legend?: Partial<Record<NodeKind, string>>; // relabel kinds for this diagram
};
export type PlacedNode = NodeSpec & { sub: string; shape: Shape; w: number; h: number };

export const EDGE_KINDS: EdgeKind[] = ['flow', 'error', 'reply', 'loop'];
export const NODE_KINDS: NodeKind[] = ['app', 'core', 'engine', 'os', 'store', 'error'];
const NODE_H = 50;
export const HEX_INSET = 16;

export const KIND_LABEL: Record<NodeKind, string> = {
  app: 'Your code',
  core: 'Node.js API',
  engine: 'Runtime internals',
  os: 'Outside world',
  store: 'Data',
  error: 'Errors',
};
const SUBS: Record<NodeKind, string> = {
  app: 'YOUR CODE',
  core: 'NODE.JS',
  engine: 'RUNTIME',
  os: 'OUTSIDE',
  store: 'DATA',
  error: 'ERRORS',
};
const DIRS: Record<Side, Point> = { r: [1, 0], l: [-1, 0], t: [0, -1], b: [0, 1] };

export const hasSlots = (kind: NodeKind) => kind === 'store';

/** The kinds a diagram uses, with their labels, in a stable order. */
export function legendFor(spec: DiagramSpec): [NodeKind, string][] {
  const used = new Set(spec.nodes.map((n) => n.kind));
  return NODE_KINDS.filter((k) => used.has(k)).map((k) => [k, spec.legend?.[k] ?? KIND_LABEL[k]]);
}

// Width follows the longest text: 12px mono label or 9.5px spaced caps caption.
export function placeNode(n: NodeSpec): PlacedNode {
  const sub = n.sub ?? SUBS[n.kind];
  const shape = n.shape ?? 'rect';
  const extra = 32 + (hasSlots(n.kind) ? 16 : 0) + (shape === 'hex' ? 20 : 0);
  const w = n.w ?? Math.max(112, 7.3 * n.label.length + extra, 6.2 * sub.length + extra);
  return { ...n, sub, shape, w, h: NODE_H };
}

export function anchor(n: PlacedNode, side: Side, off = 0): Point {
  if (n.shape === 'hex' && (side === 'r' || side === 'l') && off) {
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
    const len = (p: Point, q: Point) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
    let best: [Point, Point] = [seq[0], seq[1]];
    for (let i = 1; i < seq.length - 1; i++) {
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
