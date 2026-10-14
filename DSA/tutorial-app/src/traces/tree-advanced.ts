// Walkthrough frames for the LCA and binary lifting chapter, produced by running each algorithm.
import { levelOrder, parseLevelOrder, type TreeNode } from '../viz/tree';
import type { Cell, Frame, Tone, TreeViz } from '../viz/types';

/** A small tree whose node values are their ids 0..10, in LeetCode level order. */
export const SAMPLE_TREE: Cell[] = [0, 1, 2, 3, 4, 5, 6, 7, null, 8, 9, null, null, 10];

type Info = { node: TreeNode; parent: number; depth: number };

/** Parent, depth and level-order position of every node, keyed by node value (the values must be unique numbers). */
function index(nodes: Cell[]) {
  const root = parseLevelOrder(nodes);
  const info = new Map<number, Info>();
  const walk = (n: TreeNode | null, parent: number, depth: number) => {
    if (!n) return;
    info.set(n.value as number, { node: n, parent, depth });
    walk(n.left, n.value as number, depth + 1);
    walk(n.right, n.value as number, depth + 1);
  };
  walk(root, -1, 0);
  return { root, info };
}

/** The recursive LCA of a binary tree: each call reports p, q, the answer, or nothing. */
export function lcaRecursive(nodes: Cell[], p: number, q: number): { frames: Frame[]; lca: number } {
  const { root, info } = index(nodes);
  const frames: Frame[] = [];
  const tones: Partial<Record<number, Tone>> = {};
  const notes: Partial<Record<number, string>> = {};
  const pos = (v: number) => info.get(v)!.node.index;
  tones[pos(p)] = 'info';
  tones[pos(q)] = 'info';
  const tree = (): TreeViz => ({ kind: 'tree', label: `find the LCA of ${p} and ${q}`, nodes, tones: { ...tones }, notes: { ...notes } });
  frames.push({
    note: `Each call asks its subtree one question: "do you contain p (${p}) or q (${q})?" It returns p, q, the answer, or nothing. Children answer before their parent.`,
    parts: [tree()],
  });
  let lca = -1;
  const visit = (n: TreeNode | null): number | null => {
    if (!n) return null;
    const v = n.value as number;
    if (v === p || v === q) {
      notes[n.index] = `↑ ${v}`;
      tones[n.index] = 'warn';
      frames.push({ note: `Node ${v} is one of the targets. Return it at once: anything below it cannot change the answer.`, parts: [tree()] });
      return v;
    }
    const left = visit(n.left);
    const right = visit(n.right);
    if (left !== null && right !== null) {
      lca = v;
      notes[n.index] = `↑ ${v}`;
      tones[n.index] = 'match';
      frames.push({ note: `Node ${v} hears back from both sides (${left} on the left, ${right} on the right). The targets split here, so ${v} is the lowest common ancestor.`, parts: [tree()] });
      return v;
    }
    const up = left ?? right;
    notes[n.index] = up === null ? '↑ none' : `↑ ${up}`;
    tones[n.index] = up === null ? 'done' : 'active';
    frames.push({
      note: up === null ? `Nothing found under ${v}: it returns nothing.` : `Only one side of ${v} found something (${up}). Pass it up unchanged.`,
      parts: [tree()],
    });
    return up;
  };
  const top = visit(root);
  if (lca === -1 && top !== null) lca = top; // one target is an ancestor of the other
  frames.push({ note: `The root call returns ${lca}. Every node was visited at most once: O(n).`, parts: [tree()] });
  return { frames, lca };
}

/** Binary lifting: build up[j][v] (the 2^j-th ancestor), answer a k-th ancestor query and an LCA query. */
export function binaryLifting(
  nodes: Cell[],
  kth: [node: number, k: number],
  pair: [a: number, b: number],
): { frames: Frame[]; up: number[][]; kthAncestor: number; lca: number } {
  const { root, info } = index(nodes);
  const ids = levelOrder(root).map((n) => n.value as number).sort((x, y) => x - y);
  const n = ids.length;
  const LOG = 3;
  const up: number[][] = [ids.map((v) => info.get(v)!.parent)];
  const frames: Frame[] = [];
  const pos = (v: number) => info.get(v)!.node.index;
  const grid = (focus: Partial<Record<string, Tone>> = {}) => ({
    kind: 'grid' as const,
    label: 'up[j][v] = the 2^j-th ancestor of v (blank = above the root)',
    cells: up.map((row) => row.map((a): Cell => (a < 0 ? null : a))),
    rowHeaders: up.map((_, j) => `2^${j}`),
    colHeaders: ids.map(String),
    tones: focus,
  });
  const tree = (tones: Partial<Record<number, Tone>> = {}, notes: Partial<Record<number, string>> = {}): TreeViz => ({ kind: 'tree', nodes, tones, notes });

  frames.push({ note: 'Row 0 of the table is each node\'s parent: its 2⁰ = 1st ancestor. The root has none.', parts: [tree(), grid()] });
  for (let j = 1; j < LOG; j++) {
    const prev = up[j - 1];
    up.push(prev.map((a) => (a < 0 ? -1 : prev[a])));
    const v = ids[n - 1];
    const mid = prev[v];
    frames.push({
      note: `Row ${j}: jumping 2^${j} = jumping 2^${j - 1} twice. For node ${v}: up[${j - 1}][${v}] = ${mid < 0 ? 'none' : mid}, then up[${j - 1}][${mid < 0 ? '·' : mid}] = ${mid < 0 || prev[mid] < 0 ? 'none' : prev[mid]}.`,
      parts: [tree(), grid({ [`${j - 1},${v}`]: 'info', ...(mid >= 0 ? { [`${j - 1},${mid}`]: 'warn' } : {}), [`${j},${v}`]: 'active' })],
    });
  }

  // k-th ancestor: one jump per set bit of k.
  const [start, k] = kth;
  let cur = start;
  frames.push({
    note: `k-th ancestor of ${start} with k = ${k} = ${k.toString(2)} in binary. Jump once for every 1 bit: ${[...k.toString(2)].reverse().map((b, j) => (b === '1' ? `2^${j}` : '')).filter(Boolean).join(' + ')}.`,
    parts: [tree({ [pos(start)]: 'active' })],
  });
  for (let j = 0; j < LOG && cur >= 0; j++) {
    if ((k >> j) & 1) {
      const next = up[j][cur];
      frames.push({
        note: `Bit ${j} is set: jump 2^${j} from ${cur} to ${next < 0 ? 'nothing (past the root)' : next}.`,
        parts: [tree({ [pos(start)]: 'info', ...(next >= 0 ? { [pos(next)]: 'active' } : {}) }), grid({ [`${j},${cur}`]: 'active' })],
      });
      cur = next;
    }
  }
  const kthAncestor = cur;

  // LCA: lift the deeper node to the same depth, then jump both while their ancestors differ.
  let [a, b] = pair;
  const da = info.get(a)!.depth;
  const db = info.get(b)!.depth;
  if (da < db) [a, b] = [b, a];
  const target = Math.min(da, db);
  const diff = info.get(a)!.depth - target;
  const both = () => ({ [pos(pair[0])]: 'info' as Tone, [pos(pair[1])]: 'info' as Tone });
  frames.push({
    note: `LCA of ${pair[0]} and ${pair[1]}. Depths ${da} and ${db}. First lift the deeper one by ${diff}, using the same bit trick.`,
    parts: [tree(both(), { [pos(pair[0])]: `d=${da}`, [pos(pair[1])]: `d=${db}` })],
  });
  for (let j = 0; j < LOG; j++) if ((diff >> j) & 1) a = up[j][a];
  frames.push({ note: `Both pointers now sit at depth ${target}: ${a} and ${b}.`, parts: [tree({ ...both(), [pos(a)]: 'active', [pos(b)]: 'active' })] });
  let lca = a;
  if (a !== b) {
    for (let j = LOG - 1; j >= 0; j--) {
      const ua = up[j][a];
      const ub = up[j][b];
      if (ua !== ub) {
        frames.push({
          note: `Jump 2^${j}: the ancestors differ (${ua} vs ${ub}), so the LCA is higher still. Move both up.`,
          parts: [tree({ ...both(), [pos(ua)]: 'active', [pos(ub)]: 'active' }), grid({ [`${j},${a}`]: 'warn', [`${j},${b}`]: 'warn' })],
        });
        a = ua;
        b = ub;
      } else {
        frames.push({
          note: `Jump 2^${j} would land both on ${ua < 0 ? 'nothing' : ua}: that is a common ancestor, maybe too high. Do not jump.`,
          parts: [tree({ ...both(), [pos(a)]: 'active', [pos(b)]: 'active' }), grid({ [`${j},${a}`]: 'done', [`${j},${b}`]: 'done' })],
        });
      }
    }
    lca = up[0][a];
    frames.push({ note: `The pointers are now just below the meeting point. Their parent, ${lca}, is the LCA. Each query took O(log n) jumps.`, parts: [tree({ ...both(), [pos(lca)]: 'match' })] });
  } else {
    frames.push({ note: `After lifting, both pointers are the same node: ${lca} is an ancestor of the other node, so it is the LCA.`, parts: [tree({ ...both(), [pos(lca)]: 'match' })] });
  }
  return { frames, up, kthAncestor, lca };
}
