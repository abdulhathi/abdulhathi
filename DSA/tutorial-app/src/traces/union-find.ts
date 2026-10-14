// Walkthrough frames for the union-find chapter, produced by running the real structure.
import type { Frame, GraphViz, Tone } from '../viz/types';

export type UfOp = ['union', number, number] | ['find', number];

/** Lay the forest out from the parent array: leaves side by side, each parent centred over its children. */
function forest(parent: number[], tones: Partial<Record<string, Tone>>, edgeTones: Map<number, Tone>): GraphViz {
  const n = parent.length;
  const kids: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) if (parent[i] !== i) kids[parent[i]].push(i);
  const x = new Array<number>(n).fill(0);
  const y = new Array<number>(n).fill(0);
  let next = 0;
  const place = (v: number, depth: number) => {
    y[v] = depth * 64;
    if (kids[v].length === 0) {
      x[v] = next++ * 54;
      return;
    }
    for (const c of kids[v]) place(c, depth + 1);
    x[v] = (x[kids[v][0]] + x[kids[v][kids[v].length - 1]]) / 2;
  };
  for (let i = 0; i < n; i++) if (parent[i] === i) place(i, 0);
  return {
    kind: 'graph',
    label: 'forest (each arrow points to the parent)',
    directed: true,
    nodes: Array.from({ length: n }, (_, i) => ({ id: String(i), x: x[i], y: y[i] })),
    edges: Array.from({ length: n }, (_, i) => i)
      .filter((i) => parent[i] !== i)
      .map((i) => ({ from: String(i), to: String(parent[i]), tone: edgeTones.get(i) })),
    tones,
  };
}

/** Union by size with path compression, one frame per operation (and one per compression). */
export function unionFind(n: number, ops: UfOp[]): { frames: Frame[]; parent: number[]; components: number } {
  const parent = Array.from({ length: n }, (_, i) => i);
  const size = new Array<number>(n).fill(1);
  let components = n;
  const frames: Frame[] = [];

  const snap = (note: string, tones: Partial<Record<string, Tone>> = {}, edgeTones = new Map<number, Tone>(), arrTones: Partial<Record<number, Tone>> = {}) => {
    frames.push({
      note,
      parts: [
        forest(parent, tones, edgeTones),
        { kind: 'array', label: 'parent', items: [...parent], tones: arrTones },
        { kind: 'vars', items: [['components', components]] },
      ],
    });
  };

  const pathTo = (v: number) => {
    const path = [v];
    while (parent[path[path.length - 1]] !== path[path.length - 1]) path.push(parent[path[path.length - 1]]);
    return path;
  };

  snap(`Start with ${n} single-node sets. Every node is its own parent, so every node is a root.`);
  for (const op of ops) {
    if (op[0] === 'find') {
      const v = op[1];
      const path = pathTo(v);
      const root = path[path.length - 1];
      const tones = Object.fromEntries(path.map((p) => [String(p), 'warn' as Tone]));
      tones[String(root)] = 'match';
      snap(`find(${v}) follows parent links ${path.join(' → ')} and reaches root ${root}.`, tones, new Map(path.slice(0, -1).map((p) => [p, 'active' as Tone])));
      const moved = path.slice(0, -2);
      if (moved.length) {
        for (const p of moved) parent[p] = root;
        snap(
          `Path compression: point ${moved.join(' and ')} straight at root ${root}. The next find on ${moved.length > 1 ? 'them' : 'it'} takes one step.`,
          { ...Object.fromEntries(moved.map((p) => [String(p), 'info' as Tone])), [String(root)]: 'match' },
          new Map(moved.map((p) => [p, 'match' as Tone])),
          Object.fromEntries(moved.map((p) => [p, 'info' as Tone])),
        );
      }
      continue;
    }
    const [, a, b] = op;
    let ra = pathTo(a).pop()!;
    let rb = pathTo(b).pop()!;
    if (ra === rb) {
      snap(
        `union(${a}, ${b}): both finds reach root ${ra}. They are already in the same set, so this link would close a cycle. Nothing changes.`,
        { [String(a)]: 'bad', [String(b)]: 'bad', [String(ra)]: 'warn' },
      );
      continue;
    }
    if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    size[ra] += size[rb];
    components--;
    snap(
      `union(${a}, ${b}): the roots are ${ra} and ${rb}. Hang the smaller tree (root ${rb}) under the larger one (root ${ra}${size[ra] - size[rb] === size[rb] ? ', a tie, so either way' : ''}). New size: ${size[ra]}.`,
      { [String(a)]: 'info', [String(b)]: 'info', [String(ra)]: 'match', [String(rb)]: 'active' },
      new Map([[rb, 'active' as Tone]]),
      { [rb]: 'active' },
    );
  }
  frames.push({
    note: `Done: ${components} sets remain. Each root names one set, and every find now takes at most a step or two.`,
    parts: [forest(parent, {}, new Map()), { kind: 'array', label: 'parent', items: [...parent] }, { kind: 'vars', items: [['components', components]], tones: { 0: 'match' } }],
  });
  return { frames, parent, components };
}
