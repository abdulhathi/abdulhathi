// Walkthrough frames and pictures for chapter 40 (Graph theory), produced by running the algorithms for real.
import type { Cell, Frame, GraphNode, GraphViz, Tone, Viz } from '../viz/types';

/** One undirected graph drawn three ways: adjacency list, adjacency matrix and edge list. */
export function representations(nodes: GraphNode[], edges: [string, string][]): Viz[] {
  const ids = nodes.map((n) => n.id);
  const adj = new Map(ids.map((id) => [id, [] as string[]]));
  for (const [a, b] of edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const matrix: Cell[][] = ids.map((a) => ids.map((b) => (adj.get(a)!.includes(b) ? 1 : 0)));
  return [
    { kind: 'graph', label: 'the graph', nodes, edges: edges.map(([from, to]) => ({ from, to })) },
    { kind: 'map', label: 'adjacency list', keyTitle: 'node', valueTitle: 'neighbours', entries: ids.map((id) => [id, adj.get(id)!.sort().join(', ')] as [Cell, Cell]) },
    { kind: 'grid', label: 'adjacency matrix', cells: matrix, rowHeaders: ids, colHeaders: ids, tones: Object.fromEntries(matrix.flatMap((row, r) => row.map((v, c) => [`${r},${c}`, v ? ('active' as Tone) : undefined]))) },
    { kind: 'array', label: 'edge list', items: edges.map(([a, b]) => `${a}–${b}`), indices: false },
  ];
}

/**
 * Bipartite check by BFS two-colouring, component by component. Colour A is blue, colour B amber;
 * an edge whose ends get the same colour is a conflict (an odd cycle).
 */
export function bipartite(nodes: GraphNode[], edges: [string, string][]) {
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const [a, b] of edges) {
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  }
  const colour = new Map<string, 0 | 1>();
  const frames: Frame[] = [];
  let conflict: [string, string] | null = null;
  let queue: string[] = [];

  const draw = (current?: string, bad?: [string, string]): Viz[] => {
    const g: GraphViz = {
      kind: 'graph',
      label: 'undirected graph',
      nodes,
      edges: edges.map(([from, to]) => ({
        from,
        to,
        tone: bad && ((bad[0] === from && bad[1] === to) || (bad[0] === to && bad[1] === from)) ? 'bad' : undefined,
      })),
      tones: Object.fromEntries(nodes.map((n) => [n.id, colour.has(n.id) ? (colour.get(n.id) === 0 ? 'info' : 'warn') : undefined])) as Partial<Record<string, Tone>>,
      notes: Object.fromEntries([...colour].map(([id, c]) => [id, c === 0 ? 'A' : 'B'])),
    };
    if (current) g.tones = { ...g.tones, [current]: 'active' };
    return [g, { kind: 'queue', label: 'queue', items: [...queue] }];
  };

  frames.push({ note: 'Try to give every node colour A or B so that every edge joins two different colours. No node has a colour yet.', parts: draw() });
  outer: for (const start of nodes.map((n) => n.id)) {
    if (colour.has(start)) continue;
    colour.set(start, 0);
    queue = [start];
    frames.push({ note: `${start} has no colour yet, so it starts a new component. Give it colour A. (Any choice is fine: swapping A and B in a whole component changes nothing.)`, parts: draw(start) });
    while (queue.length) {
      const u = queue.shift()!;
      const coloured: string[] = [];
      for (const v of adj.get(u)!) {
        if (!colour.has(v)) {
          colour.set(v, colour.get(u) === 0 ? 1 : 0);
          queue.push(v);
          coloured.push(v);
        } else if (colour.get(v) === colour.get(u)) {
          conflict = [u, v];
          frames.push({
            note: `${u} and ${v} are neighbours but both have colour ${colour.get(u) === 0 ? 'A' : 'B'}. They are forced by an odd cycle, so the graph is not bipartite.`,
            parts: draw(u, [u, v]),
          });
          break outer;
        }
      }
      const other = colour.get(u) === 0 ? 'B' : 'A';
      frames.push({
        note: coloured.length
          ? `Take ${u} from the queue. Its uncoloured neighbours ${coloured.join(', ')} must get the other colour, ${other}.`
          : `Take ${u} from the queue. All its neighbours already have colour ${other}: no conflict.`,
        parts: draw(u),
      });
    }
  }
  if (!conflict) frames.push({ note: 'Every node is coloured and every edge joins A to B: the graph is bipartite.', parts: draw() });
  return { frames, bipartite: conflict === null, conflict: conflict as [string, string] | null };
}
