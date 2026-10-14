// Walkthrough frames for chapter 31, produced by running each algorithm for real.
import { levelOrder, parseLevelOrder, type TreeNode } from '../viz/tree';
import type { Cell, Frame, GraphViz, Tone } from '../viz/types';

/** Maximum depth by recursion: each node asks its children for their heights, then adds one. */
export function maxDepth(nodes: Cell[]): { frames: Frame[]; depth: number } {
  const root = parseLevelOrder(nodes);
  const frames: Frame[] = [];
  const tones: Partial<Record<number, Tone>> = {};
  const notes: Partial<Record<number, string>> = {};
  const callStack: string[] = [];
  const picture = (note: string): Frame => ({
    note,
    parts: [
      { kind: 'tree', label: 'tree', nodes, tones: { ...tones }, notes: { ...notes } },
      { kind: 'stack', label: 'call stack', items: [...callStack] },
    ],
  });
  const depth = (n: TreeNode | null): number => {
    if (!n) return 0;
    callStack.push(`depth(${n.value})`);
    tones[n.index] = 'active';
    frames.push(picture(`Call depth(${n.value}). Before it can answer, it needs the depth of its left and right subtrees.`));
    tones[n.index] = 'warn';
    const l = depth(n.left);
    const r = depth(n.right);
    const h = 1 + Math.max(l, r);
    notes[n.index] = `↑${h}`;
    tones[n.index] = 'match';
    frames.push(
      picture(
        n.left || n.right
          ? `Both children answered (left ${l}, right ${r}), so depth(${n.value}) = 1 + max(${l}, ${r}) = ${h}. The call returns and leaves the stack.`
          : `${n.value} is a leaf: both children are empty (depth 0), so its depth is 1.`,
      ),
    );
    callStack.pop();
    tones[n.index] = 'done';
    return h;
  };
  frames.push(picture('The answer for a node depends on the answers for its children, so the work happens on the way back up (post-order).'));
  const d = depth(root);
  if (root) tones[root.index] = 'match';
  frames.push(picture(`The root returns ${d}: the tree is ${d} levels deep. Each node was visited once, so this is O(n) time and O(h) stack space.`));
  return { frames, depth: d };
}

/** All nodes at distance k from a target: add parent links, then breadth-first search outward. */
export function distanceK(nodes: Cell[], target: number, k: number): { frames: Frame[]; result: number[] } {
  const root = parseLevelOrder(nodes);
  const all = levelOrder(root);
  const parent = new Map<TreeNode, TreeNode | null>();
  for (const n of all) {
    if (n.left) parent.set(n.left, n);
    if (n.right) parent.set(n.right, n);
  }
  if (root) parent.set(root, null);
  const start = all.find((n) => n.value === target);
  if (!start) throw new Error(`target ${target} is not in the tree`);
  const frames: Frame[] = [];
  const dist = new Map<TreeNode, number>([[start, 0]]);
  const picture = (note: string, frontier: TreeNode[], hit: TreeNode[] = []): Frame => {
    const tones: Partial<Record<number, Tone>> = {};
    const notes: Partial<Record<number, string>> = {};
    for (const [n, d] of dist) {
      tones[n.index] = 'done';
      notes[n.index] = `d=${d}`;
    }
    for (const n of frontier) tones[n.index] = 'active';
    for (const n of hit) tones[n.index] = 'match';
    return { note, parts: [{ kind: 'tree', label: `tree (target ${target}, k = ${k})`, nodes, tones, notes }] };
  };
  frames.push(picture(`Distance can go up through a parent as well as down. First record every node's parent, so the tree becomes an undirected graph. Then start a breadth-first search at ${target}.`, [start]));
  let frontier = [start];
  for (let d = 1; d <= k && frontier.length; d++) {
    const next: TreeNode[] = [];
    for (const n of frontier) {
      const found: TreeNode[] = [];
      for (const m of [n.left, n.right, parent.get(n) ?? null]) {
        if (m && !dist.has(m)) {
          dist.set(m, d);
          next.push(m);
          found.push(m);
        }
      }
      frames.push(
        picture(
          found.length
            ? `From ${n.value}, step to its children and its parent that are not reached yet: ${found.map((m) => m.value).join(', ')} ${found.length > 1 ? 'are' : 'is'} at distance ${d}.`
            : `From ${n.value}, every neighbour (children and parent) is already reached or missing: nothing new.`,
          [n],
          found,
        ),
      );
    }
    frontier = next;
  }
  frames.push(
    picture(
      frontier.length
        ? `The search has gone ${k} steps out. The nodes reached at distance ${k} are the answer: ${frontier.map((n) => n.value).join(', ')}.`
        : `Nothing is ${k} steps away: the answer is empty.`,
      [],
      frontier,
    ),
  );
  const result = frontier.map((n) => Number(n.value)).sort((a, b) => a - b);
  return { frames, result };
}

/** A tree given as a parent array (Time Needed to Inform All Employees): build children lists, then walk down. */
export function informTime(manager: number[], informTime: number[], headID: number, layout: [number, number][]): { figure: GraphViz; total: number } {
  const children = manager.map(() => [] as number[]);
  manager.forEach((m, i) => {
    if (m !== -1) children[m].push(i);
  });
  const time = new Map<number, number>();
  const visit = (u: number, t: number) => {
    time.set(u, t);
    for (const c of children[u]) visit(c, t + informTime[u]);
  };
  visit(headID, 0);
  const total = Math.max(...time.values());
  const figure: GraphViz = {
    kind: 'graph',
    label: 'employees (edge label = minutes the manager needs)',
    directed: true,
    nodes: manager.map((_, i) => ({ id: String(i), x: layout[i][0], y: layout[i][1] })),
    edges: manager.flatMap((m, i) => (m === -1 ? [] : [{ from: String(m), to: String(i), label: String(informTime[m]) }])),
    notes: Object.fromEntries([...time].map(([u, t]) => [String(u), `t=${t}`])),
    tones: Object.fromEntries([...time].filter(([, t]) => t === total).map(([u]) => [String(u), 'match' as Tone])),
  };
  return { figure, total };
}
