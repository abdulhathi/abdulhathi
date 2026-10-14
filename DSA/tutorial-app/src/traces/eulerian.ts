// Walkthrough frames for the Eulerian paths chapter (Hierholzer's algorithm with a stack).
import type { Frame, GraphViz, Tone } from '../viz/types';

export type Pos = Record<string, [number, number]>;

/** Directed Hierholzer: always take the smallest unused edge; when stuck, pop the node onto the route. */
export function hierholzer(edges: [string, string][], start: string, pos: Pos): { frames: Frame[]; route: string[] } {
  const names = [...new Set(edges.flat())].sort();
  const out = new Map<string, number[]>(names.map((v) => [v, []]));
  edges.forEach(([a], i) => out.get(a)!.push(i));
  for (const list of out.values()) list.sort((x, y) => (edges[x][1] < edges[y][1] ? -1 : edges[x][1] > edges[y][1] ? 1 : x - y));
  const used = new Set<number>();
  const stack: string[] = [start];
  const done: string[] = []; // popped nodes; the route is this reversed
  const frames: Frame[] = [];

  const snap = (note: string, current?: number, top?: string, popped?: string) => {
    const tones: Partial<Record<string, Tone>> = {};
    if (top) tones[top] = 'active';
    if (popped) tones[popped] = 'match';
    const g: GraphViz = {
      kind: 'graph',
      label: 'directed graph (each edge must be used once)',
      directed: true,
      nodes: names.map((v) => ({ id: v, x: pos[v][0], y: pos[v][1] })),
      edges: edges.map(([a, b], i) => ({ from: a, to: b, tone: i === current ? 'active' : used.has(i) ? 'done' : undefined })),
      tones,
    };
    frames.push({
      note,
      parts: [
        g,
        { kind: 'stack', label: 'stack (path being walked)', items: [...stack] },
        { kind: 'array', label: 'finished nodes (route in reverse)', items: [...done], indices: false },
      ],
    });
  };

  snap(`Start at ${start} with it alone on the stack. Rule: look at the top of the stack. If it has an unused edge, walk it; if not, it is finished.`, undefined, start);
  while (stack.length) {
    const v = stack[stack.length - 1];
    const next = out.get(v)!.find((i) => !used.has(i));
    if (next !== undefined) {
      used.add(next);
      stack.push(edges[next][1]);
      snap(`${v} still has an unused edge. Take the smallest one, ${v} → ${edges[next][1]}, mark it used and push ${edges[next][1]}.`, next, edges[next][1]);
    } else {
      stack.pop();
      done.push(v);
      snap(
        `${v} has no unused edges left. Pop it and add it to the finished list. ${stack.length ? `Back on ${stack[stack.length - 1]}: maybe it has edges we skipped.` : 'The stack is empty.'}`,
        undefined,
        stack[stack.length - 1],
        v,
      );
    }
  }
  const route = [...done].reverse();
  frames.push({
    note: `Reverse the finished list to get the route: ${route.join(' → ')}. It uses all ${edges.length} edges exactly once. Notice the dead end was popped first and so lands at the very end.`,
    parts: [{ kind: 'array', label: 'Eulerian path', items: route, indices: false, tones: Object.fromEntries(route.map((_, i) => [i, 'match' as Tone])) }],
  });
  return { frames, route };
}
