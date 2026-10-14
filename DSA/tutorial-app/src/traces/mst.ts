// Walkthrough frames for the minimum spanning tree chapter, produced by running each algorithm for real.
import type { Frame, GraphViz, Tone } from '../viz/types';

export type WEdge = [number, number, number];
export type Pos = Record<number, [number, number]>;

function wgraph(labels: string[], edges: WEdge[], pos: Pos, tones: Partial<Record<string, Tone>>, edgeTone: (i: number) => Tone | undefined, label: string): GraphViz {
  return {
    kind: 'graph',
    label,
    nodes: labels.map((l, i) => ({ id: String(i), x: pos[i][0], y: pos[i][1], label: l })),
    edges: edges.map(([a, b, w], i) => ({ from: String(a), to: String(b), label: String(w), tone: edgeTone(i) })),
    tones,
  };
}

/** Kruskal: sort edges by weight, keep an edge unless it joins two nodes already connected. */
export function kruskal(labels: string[], edges: WEdge[], pos: Pos): { frames: Frame[]; total: number; chosen: number[] } {
  const n = labels.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (v: number): number => (parent[v] === v ? v : (parent[v] = find(parent[v])));
  const order = edges.map((_, i) => i).sort((a, b) => edges[a][2] - edges[b][2] || a - b);
  const chosen: number[] = [];
  const rejected: number[] = [];
  let total = 0;
  const frames: Frame[] = [];
  const name = (i: number) => `${labels[edges[i][0]]}–${labels[edges[i][1]]} ${edges[i][2]}`;
  const groups = () => {
    const by = new Map<number, string[]>();
    for (let v = 0; v < n; v++) by.set(find(v), [...(by.get(find(v)) ?? []), labels[v]]);
    return [...by.values()].map((g) => g.join(''));
  };
  const snap = (note: string, at: number, current?: number) => {
    frames.push({
      note,
      parts: [
        wgraph(labels, edges, pos, {}, (i) => (rejected.includes(i) ? 'bad' : i === current ? 'active' : chosen.includes(i) ? 'match' : undefined), 'weighted graph'),
        {
          kind: 'array',
          label: 'edges sorted by weight',
          items: order.map(name),
          indices: false,
          pointers: at < order.length ? [{ name: 'next', at }] : [],
          tones: Object.fromEntries(order.map((e, k) => [k, (rejected.includes(e) ? 'bad' : e === current ? 'active' : chosen.includes(e) ? 'match' : undefined) as Tone]).filter(([, t]) => t)),
        },
        { kind: 'set', label: 'components (union-find)', items: groups() },
        { kind: 'vars', items: [['total', total], ['edges kept', `${chosen.length} of ${n - 1}`]] },
      ],
    });
  };
  snap(`Sort all ${edges.length} edges by weight. Every node starts as its own component.`, 0);
  for (let k = 0; k < order.length && chosen.length < n - 1; k++) {
    const e = order[k];
    const [a, b, w] = edges[e];
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) {
      rejected.push(e);
      snap(`${name(e)}: ${labels[a]} and ${labels[b]} are already in the same component. Adding it would make a cycle, so skip it.`, k, e);
    } else {
      parent[ra] = rb;
      chosen.push(e);
      total += w;
      snap(
        chosen.length === 1
          ? `${name(e)}: it joins two different components, and no cheaper edge is left that could, so keep it. Merge the two components.`
          : `${name(e)}: connects two different components. Keep it and merge them.`,
        k,
        e,
      );
    }
  }
  frames.push({
    note: `${n - 1} edges kept, so every node is connected. The minimum spanning tree weighs ${total}.`,
    parts: [wgraph(labels, edges, pos, Object.fromEntries(labels.map((_, i) => [String(i), 'match' as Tone])), (i) => (chosen.includes(i) ? 'match' : 'dim'), 'minimum spanning tree'), { kind: 'vars', items: [['total', total]], tones: { 0: 'match' } }],
  });
  return { frames, total, chosen };
}

/** Prim: grow one tree from a start node, always adding the cheapest edge that leaves it. */
export function prim(labels: string[], edges: WEdge[], pos: Pos, start = 0): { frames: Frame[]; total: number } {
  const n = labels.length;
  const adj: [number, number, number][][] = Array.from({ length: n }, () => []);
  edges.forEach(([a, b, w], i) => {
    adj[a].push([b, w, i]);
    adj[b].push([a, w, i]);
  });
  const inTree = new Set<number>();
  const chosen: number[] = [];
  let heap: [number, number, number][] = []; // weight, node, edge index
  let total = 0;
  const frames: Frame[] = [];
  const snap = (note: string, current?: number, skip = false) => {
    frames.push({
      note,
      parts: [
        wgraph(labels, edges, pos, Object.fromEntries([...inTree].map((v) => [String(v), 'match' as Tone])), (i) => (i === current ? (skip ? 'bad' : 'active') : chosen.includes(i) ? 'match' : undefined), 'weighted graph (green = in the tree)'),
        { kind: 'array', label: 'priority queue of edges leaving the tree', items: heap.map(([w, v, e]) => `${w}: ${labels[edges[e][0] === v ? edges[e][1] : edges[e][0]]}→${labels[v]}`), indices: false, tones: skip ? { 0: 'bad' } : {} },
        { kind: 'vars', items: [['total', total]] },
      ],
    });
  };
  const add = (v: number) => {
    inTree.add(v);
    for (const [to, w, e] of adj[v]) if (!inTree.has(to)) heap.push([w, to, e]);
    heap.sort((x, y) => x[0] - y[0] || x[2] - y[2]);
  };
  add(start);
  snap(`Start the tree at ${labels[start]}. Push every edge that leaves it into a priority queue.`);
  while (heap.length && inTree.size < n) {
    const [w, v, e] = heap[0];
    if (inTree.has(v)) {
      snap(`Cheapest edge in the queue leads to ${labels[v]}, which is already in the tree. Discard it.`, e, true);
      heap = heap.slice(1);
      continue;
    }
    heap = heap.slice(1);
    chosen.push(e);
    total += w;
    add(v);
    snap(`Take the cheapest edge leaving the tree (weight ${w}) and add ${labels[v]}. Push ${labels[v]}'s edges to nodes outside the tree.`, e);
  }
  return { frames, total };
}
