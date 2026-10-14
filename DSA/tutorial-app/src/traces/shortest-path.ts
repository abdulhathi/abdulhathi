// Walkthrough frames for the shortest paths chapter, produced by running each algorithm for real.
import type { Cell, Frame, GraphViz, Tone } from '../viz/types';

export type WEdge = [number, number, number]; // from, to, weight
export type Pos = Record<number, [number, number]>;

const show = (d: number) => (d === Infinity ? '∞' : String(d));

function wgraph(
  labels: string[], edges: WEdge[], pos: Pos, directed: boolean,
  tones: Partial<Record<string, Tone>>, notes: Partial<Record<string, string>>, edgeTone: (i: number) => Tone | undefined, label: string,
): GraphViz {
  return {
    kind: 'graph',
    label,
    directed,
    nodes: labels.map((l, i) => ({ id: String(i), x: pos[i][0], y: pos[i][1], label: l })),
    edges: edges.map(([a, b, w], i) => ({ from: String(a), to: String(b), label: String(w), tone: edgeTone(i) })),
    tones,
    notes,
  };
}

/** Dijkstra with a binary-heap style priority queue and lazy deletion of stale entries. */
export function dijkstra(labels: string[], edges: WEdge[], src: number, pos: Pos): { frames: Frame[]; dist: number[] } {
  const n = labels.length;
  const adj: [number, number, number][][] = Array.from({ length: n }, () => []); // [to, weight, edge index]
  edges.forEach(([a, b, w], i) => {
    adj[a].push([b, w, i]);
    adj[b].push([a, w, i]);
  });
  const dist = new Array<number>(n).fill(Infinity);
  const via = new Array<number>(n).fill(-1); // edge index used to reach each node
  const settled = new Set<number>();
  let heap: [number, number][] = [];
  const frames: Frame[] = [];

  const snap = (note: string, current?: number, relaxed: number[] = [], stale?: [number, number]) => {
    const tones: Partial<Record<string, Tone>> = {};
    for (const v of settled) tones[String(v)] = 'done';
    for (const v of relaxed) tones[String(v)] = 'warn';
    if (current !== undefined) tones[String(current)] = 'active';
    const notes = Object.fromEntries(dist.map((d, i) => [String(i), `d=${show(d)}`]));
    const treeEdges = new Set(via.filter((e) => e >= 0));
    const relaxEdges = new Set(current === undefined ? [] : adj[current].filter(([to]) => relaxed.includes(to)).map(([, , i]) => i));
    frames.push({
      note,
      parts: [
        wgraph(labels, edges, pos, false, tones, notes, (i) => (relaxEdges.has(i) ? 'active' : treeEdges.has(i) ? 'match' : undefined), 'weighted graph (d = best distance found so far)'),
        {
          kind: 'array',
          label: 'priority queue (smallest distance first)',
          items: heap.map(([d, v]) => `${d}·${labels[v]}`),
          indices: false,
          tones: stale ? { 0: 'bad' } : {},
        },
      ],
    });
  };

  dist[src] = 0;
  heap.push([0, src]);
  snap(`Start: the distance to ${labels[src]} is 0, every other distance is unknown (∞). Put (0, ${labels[src]}) in the priority queue.`);
  while (heap.length) {
    heap.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    const [d, v] = heap[0];
    if (settled.has(v) || d > dist[v]) {
      snap(`The smallest entry is (${d}, ${labels[v]}), but ${labels[v]} is already settled at ${dist[v]}. This entry is stale: skip it.`, undefined, [], [d, v]);
      heap = heap.slice(1);
      continue;
    }
    heap = heap.slice(1);
    settled.add(v);
    const relaxed: number[] = [];
    const changes: string[] = [];
    for (const [to, w, ei] of adj[v]) {
      if (settled.has(to)) continue;
      if (d + w < dist[to]) {
        changes.push(`${labels[to]}: ${show(dist[to])} → ${d + w}`);
        dist[to] = d + w;
        via[to] = ei;
        heap.push([dist[to], to]);
        relaxed.push(to);
      }
    }
    heap.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
    snap(
      `${
        settled.size === 1
          ? `Pop (${d}, ${labels[v]}). It is the closest unsettled node, so ${d} is final: with non-negative weights, a detour through a farther node can never be shorter.`
          : `Pop (${d}, ${labels[v]}): the closest unsettled node, so ${labels[v]} is settled at ${d}.`
      }${
        changes.length ? ` Relax its edges: ${changes.join(', ')}.` : ' None of its edges improve anything.'
      }`,
      v,
      relaxed,
    );
  }
  frames.push({
    note: `The queue is empty. Final distances from ${labels[src]}: ${labels.map((l, i) => `${l} ${show(dist[i])}`).join(', ')}. The green edges form the shortest-path tree.`,
    parts: [
      wgraph(labels, edges, pos, false, Object.fromEntries(labels.map((_, i) => [String(i), 'match' as Tone])), Object.fromEntries(dist.map((d, i) => [String(i), `d=${show(d)}`])), (i) => (via.includes(i) ? 'match' : 'dim'), 'shortest-path tree'),
    ],
  });
  return { frames, dist };
}

/** Bellman-Ford limited to k + 1 rounds (at most k stops), relaxing from a copy of the previous round. */
export function bellmanFordRounds(n: number, flights: WEdge[], src: number, dst: number, k: number, pos: Pos): { frames: Frame[]; answer: number } {
  const labels = Array.from({ length: n }, (_, i) => String(i));
  let dist = new Array<number>(n).fill(Infinity);
  dist[src] = 0;
  const table: Cell[][] = [dist.map(show)];
  const frames: Frame[] = [];
  const rowHeaders = ['0 flights'];
  // `shown` is what the graph displays: the row being built in the current round.
  const snap = (note: string, shown: number[], edge: number | undefined, edgeTone: Tone, changed: number[]) => {
    frames.push({
      note,
      parts: [
        wgraph(
          labels, flights, pos, true,
          Object.fromEntries(changed.map((c) => [String(c), 'warn' as Tone])),
          Object.fromEntries(shown.map((d, i) => [String(i), show(d)])),
          (i) => (i === edge ? edgeTone : undefined),
          'flights (directed, price on each edge)',
        ),
        {
          kind: 'grid',
          label: 'cheapest price using at most r flights',
          cells: table.map((r) => [...r]),
          rowHeaders: [...rowHeaders],
          colHeaders: labels.map((l) => `city ${l}`),
          tones: Object.fromEntries(changed.map((c) => [`${table.length - 1},${c}`, 'match' as Tone])),
        },
      ],
    });
  };
  snap(`Row 0: only the source ${src} is reachable, at price 0. We may take at most k + 1 = ${k + 1} flights (k = ${k} stop${k === 1 ? '' : 's'}).`, dist, undefined, 'active', [src]);
  for (let round = 1; round <= k + 1; round++) {
    const prev = dist;
    const next = [...prev];
    table.push(next.map(show));
    rowHeaders.push(`${round} flight${round > 1 ? 's' : ''}`);
    const changed: number[] = [];
    flights.forEach(([a, b, w], i) => {
      if (prev[a] === Infinity) return;
      const cand = prev[a] + w;
      if (cand < next[b]) {
        const fresh = next[a] !== prev[a];
        const old = next[b];
        next[b] = cand;
        if (!changed.includes(b)) changed.push(b);
        table[table.length - 1] = next.map(show);
        snap(
          `Round ${round}, flight ${a} → ${b}: ${prev[a]} (city ${a} in the previous row) + ${w} = ${cand}, cheaper than ${show(old)}. City ${b} improves.${
            fresh ? ` Note that we used ${prev[a]}, not the ${next[a]} found this round: that price already needs ${round} flights.` : ''
          }`,
          next, i, 'active', [...changed],
        );
      } else {
        snap(`Round ${round}, flight ${a} → ${b}: ${prev[a]} + ${w} = ${cand} is not cheaper than ${show(next[b])}. No change.`, next, i, 'bad', [...changed]);
      }
    });
    dist = next;
  }
  const answer = dist[dst] === Infinity ? -1 : dist[dst];
  frames.push({
    note: `After ${k + 1} rounds the cheapest price to city ${dst} with at most ${k} stop${k === 1 ? '' : 's'} is ${answer}. Reading from the previous row is what enforces the limit: updating in place could chain several flights inside one round.`,
    parts: [{ kind: 'grid', label: 'cheapest price using at most r flights', cells: table, rowHeaders, colHeaders: labels.map((l) => `city ${l}`), tones: { [`${table.length - 1},${dst}`]: 'match' } }],
  });
  return { frames, answer };
}

/** Floyd-Warshall: allow one more intermediate node per round. */
export function floydWarshall(labels: string[], edges: WEdge[]): { frames: Frame[]; dist: number[][] } {
  const n = labels.length;
  const d = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)));
  for (const [a, b, w] of edges) {
    d[a][b] = Math.min(d[a][b], w);
    d[b][a] = Math.min(d[b][a], w);
  }
  const frames: Frame[] = [];
  const grid = (tones: Partial<Record<string, Tone>>, label: string) => ({
    kind: 'grid' as const,
    label,
    cells: d.map((r) => r.map(show)),
    rowHeaders: [...labels],
    colHeaders: [...labels],
    tones,
  });
  frames.push({ note: 'Start with direct edges only: d[i][j] is the edge weight, 0 on the diagonal, ∞ where there is no edge.', parts: [grid({}, 'distances using no intermediate nodes')] });
  for (let k = 0; k < n; k++) {
    const tones: Partial<Record<string, Tone>> = {};
    const better: string[] = [];
    for (let i = 0; i < n; i++) tones[`${i},${k}`] = 'info';
    for (let j = 0; j < n; j++) tones[`${k},${j}`] = 'info';
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (d[i][k] + d[k][j] < d[i][j]) {
          d[i][j] = d[i][k] + d[k][j];
          tones[`${i},${j}`] = 'match';
          if (i < j) better.push(`${labels[i]}–${labels[j]} = ${d[i][j]}`);
        }
      }
    }
    frames.push({
      note: `Round ${k + 1}: allow ${labels[k]} as a stop. For every pair, check whether going through ${labels[k]} (blue row and column) is shorter.${
        better.length ? ` Improved: ${better.join(', ')}.` : ' Nothing improves.'
      }`,
      parts: [grid(tones, `distances using intermediate nodes ${labels.slice(0, k + 1).join(', ')}`)],
    });
  }
  return { frames, dist: d };
}
