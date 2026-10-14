// Walkthrough frames for chapter 74, produced by running each algorithm for real.
import type { Frame, GraphEdge, GraphViz, Interval, Tone, Viz } from '../viz/types';

export type Point = [number, number];

/** Cross product of OA and OB: positive for a left (counter-clockwise) turn O → A → B, negative for a right turn, 0 if collinear. */
export const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

const name = (p: Point) => `(${p[0]},${p[1]})`;

/** Andrew's monotone chain: sort the points, then build the lower and upper hulls keeping only left turns. */
export function convexHull(input: Point[]): { frames: Frame[]; hull: Point[] } {
  const pts = [...input].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const frames: Frame[] = [];
  const id = (p: Point) => `${p[0]}_${p[1]}`;
  const SCALE = 52;

  const picture = (lower: Point[], upper: Point[], current?: Point, popped: Point[] = []): GraphViz => {
    const edges: GraphEdge[] = [];
    const chain = (c: Point[], tone: Tone) => {
      for (let i = 0; i + 1 < c.length; i++) edges.push({ from: id(c[i]), to: id(c[i + 1]), tone });
    };
    chain(lower, 'active');
    chain(upper, 'info');
    const tones: Partial<Record<string, Tone>> = {};
    for (const p of [...lower, ...upper]) tones[id(p)] = 'match';
    for (const p of popped) tones[id(p)] = 'bad';
    if (current) tones[id(current)] = 'warn';
    return {
      kind: 'graph',
      label: 'points (x, y); lower hull in purple, upper hull in blue',
      directed: true,
      nodes: pts.map((p) => ({ id: id(p), x: p[0] * SCALE, y: -p[1] * SCALE, label: '•' })),
      edges,
      tones,
      notes: Object.fromEntries(pts.map((p) => [id(p), name(p)])),
    };
  };

  frames.push({
    note: 'Sort the points by x (then y). The leftmost and rightmost points are always on the hull. Build the bottom half from left to right, then the top half from right to left.',
    parts: [picture([], [])],
  });

  const build = (order: Point[], half: 'lower' | 'upper', done: Point[]) => {
    const chain: Point[] = [];
    for (const p of order) {
      const popped: Point[] = [];
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], p) <= 0) {
        popped.push(chain.pop()!);
      }
      chain.push(p);
      const lower = half === 'lower' ? chain : done;
      const upper = half === 'upper' ? chain : [];
      frames.push({
        note: popped.length
          ? `Going on to ${name(p)} would turn right (or run straight) at ${popped.map(name).join(', then at ')}, so ${popped.length > 1 ? 'those points cannot be' : 'that point cannot be'} on the ${half} hull: pop, then attach ${name(p)}.`
          : chain.length === 1
            ? `Start the ${half} hull at ${name(p)}.`
            : chain.length === 2
              ? `Attach ${name(p)}. Two points make a single segment, so there is no turn to check yet.`
              : `The path turns left (counter-clockwise) at ${name(chain[chain.length - 2])}, so keep it and attach ${name(p)}.`,
        parts: [picture(lower, upper, p, popped)],
      });
    }
    return chain;
  };

  const lower = build(pts, 'lower', []);
  const upper = build([...pts].reverse(), 'upper', lower);
  const hull = [...lower.slice(0, -1), ...upper.slice(0, -1)];
  frames.push({
    note: `Join the halves, dropping the repeated end points: the hull has ${hull.length} corners. Each point was pushed and popped at most once per half, so after sorting this is O(n).`,
    parts: [picture(lower, upper)],
  });
  return { frames, hull };
}

/** Two axis-aligned rectangles overlap exactly when their x-ranges overlap and their y-ranges overlap. */
export function rectangleProjections(a: [number, number, number, number], b: [number, number, number, number]): { parts: Viz[]; overlap: boolean; area: number } {
  const ox = Math.min(a[2], b[2]) - Math.max(a[0], b[0]);
  const oy = Math.min(a[3], b[3]) - Math.max(a[1], b[1]);
  const xs: Interval[] = [
    { start: a[0], end: a[2], label: `A: x ${a[0]}..${a[2]}`, tone: 'active' },
    { start: b[0], end: b[2], label: `B: x ${b[0]}..${b[2]}`, tone: 'info' },
  ];
  const ys: Interval[] = [
    { start: a[1], end: a[3], label: `A: y ${a[1]}..${a[3]}`, tone: 'active' },
    { start: b[1], end: b[3], label: `B: y ${b[1]}..${b[3]}`, tone: 'info' },
  ];
  if (ox > 0) xs.push({ start: Math.max(a[0], b[0]), end: Math.min(a[2], b[2]), label: `overlap width ${ox}`, tone: 'match' });
  if (oy > 0) ys.push({ start: Math.max(a[1], b[1]), end: Math.min(a[3], b[3]), label: `overlap height ${oy}`, tone: 'match' });
  const lo = Math.min(a[0], b[0], a[1], b[1]);
  const hi = Math.max(a[2], b[2], a[3], b[3]);
  return {
    parts: [
      { kind: 'intervals', label: 'shadows on the x-axis', items: xs, min: lo, max: hi },
      { kind: 'intervals', label: 'shadows on the y-axis', items: ys, min: lo, max: hi },
      { kind: 'vars', items: [['overlap area', Math.max(0, ox) * Math.max(0, oy)]], tones: { 0: ox > 0 && oy > 0 ? 'match' : 'bad' } },
    ],
    overlap: ox > 0 && oy > 0,
    area: Math.max(0, ox) * Math.max(0, oy),
  };
}
