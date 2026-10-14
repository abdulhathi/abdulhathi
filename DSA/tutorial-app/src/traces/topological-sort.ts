// Walkthrough frames for the topological sort chapter, produced by running each algorithm for real.
import type { Frame, GraphEdge, GraphNode, GraphViz, Tone } from '../viz/types';

export type Pos = Record<number, [number, number]>;

function graph(n: number, edges: [number, number][], pos: Pos, tones: Partial<Record<string, Tone>>, notes: Partial<Record<string, string>>, edgeTone: (e: [number, number]) => Tone | undefined = () => undefined): GraphViz {
  const nodes: GraphNode[] = Array.from({ length: n }, (_, i) => ({ id: String(i), x: pos[i][0], y: pos[i][1] }));
  const gEdges: GraphEdge[] = edges.map((e) => ({ from: String(e[0]), to: String(e[1]), tone: edgeTone(e) }));
  return { kind: 'graph', label: 'prerequisite graph (arrow = "comes before")', directed: true, nodes, edges: gEdges, tones, notes };
}

/** Kahn's algorithm: repeatedly take a node with no remaining prerequisites. */
export function kahn(n: number, edges: [number, number][], pos: Pos): { frames: Frame[]; order: number[]; hasCycle: boolean } {
  const out: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Array<number>(n).fill(0);
  for (const [a, b] of edges) {
    out[a].push(b);
    indeg[b]++;
  }
  const frames: Frame[] = [];
  const order: number[] = [];
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) queue.push(i);
  const removed = new Set<number>();

  const snap = (note: string, current?: number, touched: number[] = []) => {
    const tones: Partial<Record<string, Tone>> = {};
    for (const v of removed) tones[String(v)] = 'done';
    for (const v of queue) tones[String(v)] = 'info';
    for (const v of touched) tones[String(v)] = 'warn';
    if (current !== undefined) tones[String(current)] = 'active';
    const notes: Partial<Record<string, string>> = {};
    for (let i = 0; i < n; i++) if (!removed.has(i) && i !== current) notes[String(i)] = `in ${indeg[i]}`;
    frames.push({
      note,
      parts: [
        graph(n, edges, pos, tones, notes, ([a]) => (removed.has(a) ? 'done' : current === a ? 'active' : undefined)),
        { kind: 'queue', label: 'queue (in-degree 0)', items: [...queue] },
        { kind: 'array', label: 'order so far', items: [...order], indices: false },
      ],
    });
  };

  snap(`Count each node's in-degree (how many prerequisites point at it). Nodes ${queue.join(' and ')} have none, so they go in the queue.`);
  while (queue.length) {
    const v = queue.shift()!;
    order.push(v);
    const touched: number[] = [];
    const freed: number[] = [];
    for (const w of out[v]) {
      indeg[w]--;
      touched.push(w);
      if (indeg[w] === 0) {
        queue.push(w);
        freed.push(w);
      }
    }
    removed.add(v);
    snap(
      out[v].length === 0
        ? `Take ${v} from the queue and append it to the order. It points at nothing, so no counts change.`
        : `Take ${v} and append it. Remove its outgoing edges: ${out[v].map((w) => `${w}'s in-degree drops to ${indeg[w]}`).join(', ')}.${freed.length ? ` ${freed.join(' and ')} ${freed.length > 1 ? 'are' : 'is'} now free, so ${freed.length > 1 ? 'they join' : 'it joins'} the queue.` : ''}`,
      undefined,
      touched,
    );
  }
  const hasCycle = order.length < n;
  frames.push({
    note: hasCycle
      ? `The queue is empty but only ${order.length} of ${n} nodes were placed. The rest wait on each other forever: there is a cycle, so no order exists.`
      : `The queue is empty and all ${n} nodes are placed: ${order.join(' → ')} is a valid topological order.`,
    parts: [
      graph(n, edges, pos, Object.fromEntries(order.map((v) => [String(v), 'match' as Tone])), {}, () => 'done'),
      { kind: 'array', label: 'topological order', items: order, indices: false, tones: Object.fromEntries(order.map((_, i) => [i, 'match' as Tone])) },
    ],
  });
  return { frames, order, hasCycle };
}

/** DFS with three colours: white = unvisited, grey = on the current path, black = finished. */
export function dfsColours(n: number, edges: [number, number][], pos: Pos): { frames: Frame[]; cycle: number[] | null; postOrder: number[] } {
  const out: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) out[a].push(b);
  const colour = new Array<0 | 1 | 2>(n).fill(0);
  const path: number[] = [];
  const postOrder: number[] = [];
  const frames: Frame[] = [];
  let cycle: number[] | null = null;
  let badEdge: [number, number] | null = null;

  const snap = (note: string, current?: number) => {
    const tones: Partial<Record<string, Tone>> = {};
    for (let i = 0; i < n; i++) if (colour[i] === 1) tones[String(i)] = 'warn';
    else if (colour[i] === 2) tones[String(i)] = 'done';
    if (current !== undefined) tones[String(current)] = 'active';
    if (cycle) for (const v of cycle) tones[String(v)] = 'bad';
    const notes = Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), ['white', 'grey', 'black'][colour[i]]]));
    frames.push({
      note,
      parts: [
        {
          ...graph(n, edges, pos, tones, notes, ([a, b]) => (badEdge && badEdge[0] === a && badEdge[1] === b ? 'bad' : colour[a] === 1 && colour[b] === 1 && path.indexOf(b) === path.indexOf(a) + 1 ? 'active' : undefined)),
          label: 'directed graph',
        },
        { kind: 'stack', label: 'current path (grey nodes)', items: [...path] },
        { kind: 'array', label: 'finished (post-order)', items: [...postOrder], indices: false },
      ],
    });
  };

  let first = true;
  const visit = (v: number): boolean => {
    colour[v] = 1;
    path.push(v);
    snap(first ? `Enter ${v}: colour it grey. Grey means "on the path we are exploring right now".` : `Enter ${v}: grey, and push it on the path.`, v);
    first = false;
    for (const w of out[v]) {
      if (colour[w] === 2) {
        snap(`Edge ${v} → ${w} reaches a black node. ${w} is finished, and everything it reaches is finished, so it cannot lead back to the path. Ignore it.`, v);
        continue;
      }
      if (colour[w] === 1) {
        badEdge = [v, w];
        cycle = path.slice(path.indexOf(w));
        snap(`Edge ${v} → ${w} reaches a grey node, one that is still on the current path. That edge closes a loop: ${[...cycle, w].join(' → ')}. Cycle found.`);
        return true;
      }
      if (colour[w] === 0 && visit(w)) return true;
    }
    colour[v] = 2;
    path.pop();
    postOrder.push(v);
    snap(`All of ${v}'s edges are explored without meeting a grey node. Colour it black and record it as finished.`);
    return false;
  };

  snap('Every node starts white (unvisited). Run a DFS from each white node.');
  for (let i = 0; i < n && !cycle; i++) if (colour[i] === 0) visit(i);
  if (!cycle) {
    frames.push({
      note: `No edge ever reached a grey node, so the graph has no cycle. Reversing the finish order gives a topological order: ${[...postOrder].reverse().join(' → ')}.`,
      parts: [
        { ...graph(n, edges, pos, Object.fromEntries(postOrder.map((v) => [String(v), 'match' as Tone])), {}), label: 'directed graph' },
        { kind: 'array', label: 'reverse post-order', items: [...postOrder].reverse(), indices: false },
      ],
    });
  }
  return { frames, cycle, postOrder };
}
