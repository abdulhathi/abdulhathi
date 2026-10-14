// Walkthrough frames for the network flow chapter: Edmonds-Karp max flow and augmenting-path matching.
import type { Frame, GraphViz, Tone } from '../viz/types';

export type CapEdge = [number, number, number]; // from, to, capacity
export type Pos = Record<number, [number, number]>;

/** Edmonds-Karp: repeatedly push flow along the shortest augmenting path in the residual graph. */
export function edmondsKarp(labels: string[], edges: CapEdge[], s: number, t: number, pos: Pos): { frames: Frame[]; maxFlow: number; cut: number[] } {
  const n = labels.length;
  const flow = new Array<number>(edges.length).fill(0);
  const frames: Frame[] = [];
  let total = 0;

  const view = (note: string, pathEdges: Map<number, Tone>, tones: Partial<Record<string, Tone>>, extra: [string, string | number][] = []): Frame => ({
    note,
    parts: [
      {
        kind: 'graph',
        label: 'network (each edge shows flow / capacity)',
        directed: true,
        nodes: labels.map((l, i) => ({ id: String(i), x: pos[i][0], y: pos[i][1], label: l })),
        edges: edges.map(([a, b, c], i) => ({ from: String(a), to: String(b), label: `${flow[i]}/${c}`, tone: pathEdges.get(i) ?? (flow[i] === c ? 'done' : undefined) })),
        tones,
      } satisfies GraphViz,
      { kind: 'vars', items: [['total flow', total], ...extra] },
    ],
  });

  // Residual moves: along an edge with spare capacity, or backwards along an edge that carries flow.
  const moves = (v: number) => {
    const list: { to: number; edge: number; forward: boolean; room: number }[] = [];
    edges.forEach(([a, b, c], i) => {
      if (a === v && flow[i] < c) list.push({ to: b, edge: i, forward: true, room: c - flow[i] });
      if (b === v && flow[i] > 0) list.push({ to: a, edge: i, forward: false, room: flow[i] });
    });
    return list;
  };

  frames.push(view(`All flows start at 0. Find a path from ${labels[s]} to ${labels[t]} with room on every edge, using BFS so the path has the fewest edges.`, new Map(), { [String(s)]: 'info', [String(t)]: 'info' }));
  for (;;) {
    const prev = new Array<{ from: number; edge: number; forward: boolean; room: number } | null>(n).fill(null);
    const seen = new Set([s]);
    const queue = [s];
    while (queue.length && !seen.has(t)) {
      const v = queue.shift()!;
      for (const m of moves(v)) {
        if (seen.has(m.to)) continue;
        seen.add(m.to);
        prev[m.to] = { from: v, edge: m.edge, forward: m.forward, room: m.room };
        queue.push(m.to);
      }
    }
    if (!seen.has(t)) {
      const cutEdges = edges.map((_, i) => i).filter((i) => seen.has(edges[i][0]) && !seen.has(edges[i][1]));
      frames.push(
        view(
          `No augmenting path is left, so the flow is maximum: ${total}. The nodes BFS could still reach (blue) form one side of a minimum cut; the red edges cross it, and their capacities add up to exactly ${total}.`,
          new Map(cutEdges.map((i) => [i, 'bad' as Tone])),
          Object.fromEntries(labels.map((_, i) => [String(i), (seen.has(i) ? 'info' : 'done') as Tone])),
          [['cut capacity', cutEdges.reduce((sum, i) => sum + edges[i][2], 0)]],
        ),
      );
      return { frames, maxFlow: total, cut: [...seen].sort((a, b) => a - b) };
    }
    const steps: { edge: number; forward: boolean; room: number; from: number; to: number }[] = [];
    for (let v = t; v !== s; v = prev[v]!.from) steps.unshift({ ...prev[v]!, to: v });
    const push = Math.min(...steps.map((x) => x.room));
    const pathNodes = [s, ...steps.map((x) => x.to)];
    const backward = steps.filter((x) => !x.forward);
    frames.push(
      view(
        `BFS finds ${pathNodes.map((v) => labels[v]).join(' → ')}. The smallest room along it is ${push}, so that is how much this path can carry.${
          backward.length ? ` It goes backwards along ${backward.map((x) => `${labels[edges[x.edge][0]]}→${labels[edges[x.edge][1]]}`).join(', ')}: that cancels flow sent there earlier and reroutes it.` : ''
        }`,
        new Map(steps.map((x) => [x.edge, (x.forward ? 'active' : 'warn') as Tone])),
        Object.fromEntries(pathNodes.map((v) => [String(v), 'active' as Tone])),
        [['this path', push]],
      ),
    );
    for (const x of steps) flow[x.edge] += x.forward ? push : -push;
    total += push;
    frames.push(view(`Push ${push} units along the path. Total flow is now ${total}. Edges that are full (grey) can only be used backwards from now on.`, new Map(steps.map((x) => [x.edge, 'match' as Tone])), {}));
  }
}

/** Bipartite matching with augmenting paths (Kuhn's algorithm), one frame per decision. */
export function bipartiteMatching(left: string[], right: string[], likes: number[][]): { frames: Frame[]; size: number; matchOfRight: number[] } {
  const matchOfRight = new Array<number>(right.length).fill(-1);
  const frames: Frame[] = [];
  const pos = (side: 'L' | 'R', i: number) => [side === 'L' ? 0 : 220, i * 70] as const;
  const view = (note: string, tried: Map<string, Tone>, tones: Partial<Record<string, Tone>>): Frame => ({
    note,
    parts: [
      {
        kind: 'graph',
        label: 'who can be paired with whom (green = matched)',
        nodes: [...left.map((l, i) => ({ id: `L${i}`, x: pos('L', i)[0], y: pos('L', i)[1], label: l })), ...right.map((r, j) => ({ id: `R${j}`, x: pos('R', j)[0], y: pos('R', j)[1], label: r }))],
        edges: likes.flatMap((list, i) => list.map((j) => ({ from: `L${i}`, to: `R${j}`, tone: tried.get(`${i}-${j}`) ?? (matchOfRight[j] === i ? 'match' : undefined) }))),
        tones,
      } satisfies GraphViz,
      { kind: 'vars', items: [['matched pairs', matchOfRight.filter((m) => m >= 0).length]] },
    ],
  });

  frames.push(view('Process the left side one at a time. Each tries to find a partner, possibly by asking someone already matched to move.', new Map(), {}));
  for (let i = 0; i < left.length; i++) {
    const seen = new Set<number>();
    const tried = new Map<string, Tone>();
    const tryKuhn = (u: number): boolean => {
      for (const j of likes[u]) {
        if (seen.has(j)) continue;
        seen.add(j);
        if (matchOfRight[j] === -1) {
          tried.set(`${u}-${j}`, 'active');
          frames.push(view(`${left[u]} tries ${right[j]}: free.`, new Map(tried), { [`L${u}`]: 'active', [`R${j}`]: 'match' }));
          matchOfRight[j] = u;
          return true;
        }
        const holder = matchOfRight[j];
        tried.set(`${u}-${j}`, 'warn');
        frames.push(view(`${left[u]} tries ${right[j]}: taken by ${left[holder]}. Ask ${left[holder]} to move to someone else.`, new Map(tried), { [`L${u}`]: 'active', [`R${j}`]: 'warn', [`L${holder}`]: 'warn' }));
        if (tryKuhn(holder)) {
          tried.set(`${u}-${j}`, 'active');
          matchOfRight[j] = u;
          return true;
        }
        frames.push(view(`${left[holder]} has nobody else to move to, so ${right[j]} stays with ${left[holder]}.`, new Map(tried), { [`L${holder}`]: 'bad' }));
      }
      return false;
    };
    const ok = tryKuhn(i);
    frames.push(
      view(
        ok
          ? `Augmenting path found for ${left[i]}: everyone on it shifts to the new partner, and the matching grows by one.`
          : `No augmenting path for ${left[i]}; it stays unmatched.`,
        new Map(),
        { [`L${i}`]: ok ? 'match' : 'bad' },
      ),
    );
  }
  const size = matchOfRight.filter((m) => m >= 0).length;
  frames.push(view(`Every left node has had its turn. Maximum matching size: ${size}.`, new Map(), {}));
  return { frames, size, matchOfRight };
}
