// Walkthrough frames for the strongly connected components chapter (Kosaraju's two passes).
import type { Frame, GraphViz, Tone } from '../viz/types';

export type Pos = Record<number, [number, number]>;

const COMPONENT_TONES: Tone[] = ['info', 'match', 'warn', 'active', 'bad'];

function dgraph(n: number, edges: [number, number][], pos: Pos, reversed: boolean, tones: Partial<Record<string, Tone>>, notes: Partial<Record<string, string>>, label: string): GraphViz {
  return {
    kind: 'graph',
    label,
    directed: true,
    nodes: Array.from({ length: n }, (_, i) => ({ id: String(i), x: pos[i][0], y: pos[i][1] })),
    edges: edges.map(([a, b]) => (reversed ? { from: String(b), to: String(a) } : { from: String(a), to: String(b) })),
    tones,
    notes,
  };
}

export function kosaraju(n: number, edges: [number, number][], pos: Pos): { frames: Frame[]; comp: number[]; finish: number[] } {
  const out: number[][] = Array.from({ length: n }, () => []);
  const rev: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    out[a].push(b);
    rev[b].push(a);
  }
  const frames: Frame[] = [];
  const seen = new Array<boolean>(n).fill(false);
  const finish: number[] = [];

  // Pass 1: record nodes in the order their DFS finishes.
  const dfs1 = (v: number) => {
    seen[v] = true;
    for (const w of out[v]) if (!seen[w]) dfs1(w);
    finish.push(v);
  };
  frames.push({
    note: 'Pass 1: run DFS on the original graph and write each node down when it finishes (after all its descendants).',
    parts: [dgraph(n, edges, pos, false, {}, {}, 'original graph'), { kind: 'stack', label: 'finish order (last finished on top)', items: [] }],
  });
  for (let i = 0; i < n; i++) {
    if (seen[i]) continue;
    const before = finish.length;
    dfs1(i);
    const added = finish.slice(before);
    frames.push({
      note: `DFS from ${i} finishes ${added.join(', ')} in that order. ${added.length > 1 ? 'A node finishes only after everything it can still reach.' : ''}`.trim(),
      parts: [
        dgraph(n, edges, pos, false, Object.fromEntries(finish.map((v) => [String(v), (added.includes(v) ? 'warn' : 'done') as Tone])), {}, 'original graph'),
        { kind: 'stack', label: 'finish order (last finished on top)', items: [...finish] },
      ],
    });
  }

  // Pass 2: on the reversed graph, start from the latest finisher; each DFS collects one component.
  const comp = new Array<number>(n).fill(-1);
  let c = 0;
  const dfs2 = (v: number, members: number[]) => {
    comp[v] = c;
    members.push(v);
    for (const w of rev[v]) if (comp[w] === -1) dfs2(w, members);
  };
  const tonesNow = () => Object.fromEntries(comp.map((k, i) => [String(i), k >= 0 ? COMPONENT_TONES[k % COMPONENT_TONES.length] : undefined]).filter(([, t]) => t));
  const notesNow = () => Object.fromEntries(comp.map((k, i) => [String(i), k >= 0 ? `C${k + 1}` : '']).filter(([, t]) => t));
  frames.push({
    note: 'Pass 2: reverse every edge. Take nodes from the top of the finish stack; each DFS on the reversed graph that starts at an unassigned node collects exactly one component.',
    parts: [dgraph(n, edges, pos, true, {}, {}, 'reversed graph'), { kind: 'stack', label: 'finish order', items: [...finish] }],
  });
  for (let k = finish.length - 1; k >= 0; k--) {
    const v = finish[k];
    if (comp[v] !== -1) continue;
    const members: number[] = [];
    dfs2(v, members);
    frames.push({
      note: `Start at ${v}, the latest finisher not yet assigned. In the reversed graph it reaches ${members.sort((a, b) => a - b).join(', ')}: component C${c + 1}. Edges into already-coloured components are ignored.`,
      parts: [dgraph(n, edges, pos, true, tonesNow(), notesNow(), 'reversed graph'), { kind: 'stack', label: 'finish order', items: finish.slice(0, k) }],
    });
    c++;
  }
  frames.push({
    note: `${c} strongly connected components. Shrink each one to a single node and the graph that remains has no cycles (the condensation).`,
    parts: [dgraph(n, edges, pos, false, tonesNow(), notesNow(), 'original graph, coloured by component')],
  });
  return { frames, comp, finish };
}
