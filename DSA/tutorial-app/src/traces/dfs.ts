// Walkthrough frames for chapter 37 (Depth-first search), produced by running each algorithm for real.
import type { Cell, Frame, GraphViz, Tone } from '../viz/types';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIRS: [number, number][] = [[-1, 0], [0, 1], [1, 0], [0, -1]];

/** Count islands with an explicit stack (no recursion), marking land as it is pushed. */
export function islands(grid: number[][]) {
  const rows = grid.length;
  const cols = grid[0].length;
  const label: (string | null)[][] = grid.map((r) => r.map(() => null));
  const frames: Frame[] = [];
  let count = 0;
  let stack: [number, number][] = [];

  const picture = (current?: [number, number]) => {
    const cells: Cell[][] = grid.map((r, i) => r.map((v, j) => label[i][j] ?? (v === 1 ? 1 : 0)));
    const tones: Partial<Record<string, Tone>> = {};
    const onStack = new Set(stack.map(([r, c]) => `${r},${c}`));
    grid.forEach((r, i) =>
      r.forEach((v, j) => {
        const key = `${i},${j}`;
        if (v === 0) tones[key] = 'dim';
        else if (onStack.has(key)) tones[key] = 'warn';
        else if (label[i][j] === LETTERS[count - 1]) tones[key] = 'match';
        else if (label[i][j] !== null) tones[key] = 'done';
      }),
    );
    if (current) tones[`${current[0]},${current[1]}`] = 'active';
    return [
      { kind: 'grid' as const, label: 'grid (1 = land, 0 = water)', cells, tones },
      { kind: 'stack' as const, label: 'stack', items: stack.map(([r, c]) => `${r},${c}`) },
      { kind: 'vars' as const, items: [['islands', count]] as [string, Cell][] },
    ];
  };

  frames.push({ note: 'Scan the grid row by row. Each unvisited land cell starts a new island; DFS then claims every land cell connected to it.', parts: picture() });
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== 1 || label[r][c] !== null) continue;
      count++;
      const id = LETTERS[count - 1];
      label[r][c] = id;
      stack = [[r, c]];
      frames.push({ note: `Cell (${r}, ${c}) is land nobody has claimed: island ${id} starts here. Mark it and push it on the stack.`, parts: picture([r, c]) });
      while (stack.length) {
        const [cr, cc] = stack.pop()!;
        const pushed: string[] = [];
        for (const [dr, dc] of DIRS) {
          const nr = cr + dr;
          const nc = cc + dc;
          if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          if (grid[nr][nc] !== 1 || label[nr][nc] !== null) continue;
          label[nr][nc] = id;
          stack.push([nr, nc]);
          pushed.push(`(${nr}, ${nc})`);
        }
        frames.push({
          note: pushed.length
            ? `Pop (${cr}, ${cc}). Its unclaimed land neighbours ${pushed.join(' and ')} join island ${id}: mark them now and push them.`
            : `Pop (${cr}, ${cc}). No unclaimed land around it.${stack.length ? '' : ` The stack is empty, so island ${id} is complete.`}`,
          parts: picture([cr, cc]),
        });
      }
    }
  }
  frames.push({ note: `The scan is finished: ${count} islands. Every cell was pushed at most once, so the work is O(rows × columns).`, parts: picture() });
  return { frames, count };
}

/**
 * Cycle detection in a directed graph with three colours. White = not visited, grey = on the
 * current DFS path, black = finished. An edge into a grey node closes a cycle.
 */
export function colourCycle(nodes: { id: string; x: number; y: number }[], edges: [string, string][], start: string[]) {
  const adj = new Map(nodes.map((n) => [n.id, [] as string[]]));
  for (const [a, b] of edges) adj.get(a)!.push(b);
  const colour = new Map<string, 'white' | 'grey' | 'black'>(nodes.map((n) => [n.id, 'white']));
  const times = new Map<string, string>();
  const frames: Frame[] = [];
  let clock = 0;
  let cycle: string[] | null = null;
  const path: string[] = [];

  const draw = (edge?: [string, string], edgeTone?: Tone): GraphViz => ({
    kind: 'graph',
    label: 'directed graph',
    directed: true,
    nodes,
    edges: edges.map(([a, b]) => ({ from: a, to: b, tone: edge && edge[0] === a && edge[1] === b ? edgeTone : undefined })),
    tones: Object.fromEntries(nodes.map((n) => [n.id, colour.get(n.id) === 'grey' ? 'warn' : colour.get(n.id) === 'black' ? 'done' : undefined])) as Partial<Record<string, Tone>>,
    notes: Object.fromEntries(times),
  });
  const parts = (edge?: [string, string], edgeTone?: Tone) => [draw(edge, edgeTone), { kind: 'stack' as const, label: 'current path (grey)', items: [...path] }];

  const visit = (u: string): boolean => {
    colour.set(u, 'grey');
    clock++;
    times.set(u, `in ${clock}`);
    path.push(u);
    frames.push({ note: `Enter ${u} and colour it grey: it is on the current path. Discovery time ${clock}.`, parts: parts() });
    for (const v of adj.get(u)!) {
      const c = colour.get(v);
      if (c === 'grey') {
        cycle = [...path.slice(path.indexOf(v)), v];
        frames.push({ note: `Edge ${u} → ${v}, and ${v} is grey: it is still on the current path, so this edge closes a cycle ${cycle.join(' → ')}.`, parts: parts([u, v], 'bad') });
        return true;
      }
      if (c === 'black') {
        frames.push({ note: `Edge ${u} → ${v}: ${v} is black, fully explored with no cycle through it. Nothing to do. (A plain visited flag could not tell this apart from grey.)`, parts: parts([u, v], 'info') });
        continue;
      }
      frames.push({ note: `Edge ${u} → ${v}: ${v} is white, never visited. Go deeper.`, parts: parts([u, v], 'active') });
      if (visit(v)) return true;
    }
    colour.set(u, 'black');
    clock++;
    times.set(u, `${times.get(u)}, out ${clock}`);
    path.pop();
    frames.push({ note: `Every edge out of ${u} is done. Colour it black and leave it (finish time ${clock}).`, parts: parts() });
    return false;
  };

  frames.push({ note: 'All nodes start white. DFS keeps the nodes of the current path grey; finished nodes turn black.', parts: parts() });
  for (const s of start) {
    if (colour.get(s) === 'white' && visit(s)) break;
  }
  if (!cycle) frames.push({ note: 'Every node is black and no edge ever reached a grey node: the graph has no cycle.', parts: parts() });
  return { frames, cycle: cycle as string[] | null };
}
