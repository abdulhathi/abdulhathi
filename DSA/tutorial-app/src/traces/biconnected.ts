// Walkthrough frames for the bridges and articulation points chapter (one DFS with discovery times and low-links).
import type { Frame, GraphViz, Tone } from '../viz/types';

export type Pos = Record<number, [number, number]>;

export function bridgesAndCuts(n: number, edges: [number, number][], pos: Pos): { frames: Frame[]; bridges: [number, number][]; cuts: number[] } {
  const adj: [number, number][][] = Array.from({ length: n }, () => []); // [neighbour, edge index]
  edges.forEach(([a, b], i) => {
    adj[a].push([b, i]);
    adj[b].push([a, i]);
  });
  const disc = new Array<number>(n).fill(-1);
  const low = new Array<number>(n).fill(-1);
  const treeEdges = new Set<number>();
  const bridgeIdx = new Set<number>();
  const cutSet = new Set<number>();
  const frames: Frame[] = [];
  let time = 0;

  const snap = (note: string, current?: number, edgeFocus?: number, focusTone: Tone = 'active') => {
    const tones: Partial<Record<string, Tone>> = {};
    for (let i = 0; i < n; i++) if (disc[i] >= 0) tones[String(i)] = 'done';
    for (const v of cutSet) tones[String(v)] = 'bad';
    if (current !== undefined) tones[String(current)] = 'active';
    const notes = Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), disc[i] >= 0 ? `d${disc[i]} low${low[i]}` : '']).filter(([, t]) => t));
    const g: GraphViz = {
      kind: 'graph',
      label: 'undirected graph (d = discovery time, low = lowest time reachable)',
      nodes: Array.from({ length: n }, (_, i) => ({ id: String(i), x: pos[i][0], y: pos[i][1] })),
      edges: edges.map(([a, b], i) => ({
        from: String(a),
        to: String(b),
        tone: i === edgeFocus ? focusTone : bridgeIdx.has(i) ? 'bad' : treeEdges.has(i) ? 'match' : undefined,
      })),
      tones,
      notes,
    };
    frames.push({ note, parts: [g] });
  };

  const dfs = (v: number, parentEdge: number) => {
    disc[v] = low[v] = time++;
    snap(`Visit ${v}: give it discovery time ${disc[v]}, and start its low-link at the same value.`, v);
    let children = 0;
    for (const [w, ei] of adj[v]) {
      if (ei === parentEdge) continue;
      if (disc[w] >= 0) {
        if (disc[w] < low[v]) {
          low[v] = disc[w];
          snap(`Edge ${v}–${w} leads back to an ancestor discovered at time ${disc[w]}: a back edge. ${v} can reach that early, so low(${v}) = ${low[v]}.`, v, ei, 'warn');
        }
        continue;
      }
      treeEdges.add(ei);
      children++;
      dfs(w, ei);
      low[v] = Math.min(low[v], low[w]);
      if (low[w] > disc[v]) {
        bridgeIdx.add(ei);
        snap(`Back at ${v}. low(${w}) = ${low[w]} is greater than d(${v}) = ${disc[v]}: nothing below ${w} reaches ${v} or above except through this edge. ${v}–${w} is a bridge.`, v, ei, 'bad');
      } else {
        snap(`Back at ${v}. ${w}'s subtree reaches time ${low[w]}, so low(${v}) = ${low[v]}. Edge ${v}–${w} lies on a cycle: not a bridge.`, v, ei, 'match');
      }
      if (parentEdge !== -1 && low[w] >= disc[v] && !cutSet.has(v)) {
        cutSet.add(v);
        snap(`low(${w}) ≥ d(${v}): removing ${v} would cut ${w}'s subtree off from the rest. ${v} is an articulation point.`, v);
      }
    }
    if (parentEdge === -1 && children > 1) {
      cutSet.add(v);
      snap(`${v} is the DFS root with ${children} separate subtrees, so removing it disconnects them: articulation point.`, v);
    }
  };

  snap('Run one DFS. For each node keep its discovery time and its low-link: the earliest discovery time it can reach using tree edges down and at most one back edge up.');
  for (let i = 0; i < n; i++) if (disc[i] < 0) dfs(i, -1);
  const bridges = [...bridgeIdx].map((i) => edges[i]);
  const cuts = [...cutSet].sort((a, b) => a - b);
  snap(`Done. Bridges (red edges): ${bridges.map(([a, b]) => `${a}–${b}`).join(', ') || 'none'}. Articulation points (red nodes): ${cuts.join(', ') || 'none'}.`);
  return { frames, bridges, cuts };
}
