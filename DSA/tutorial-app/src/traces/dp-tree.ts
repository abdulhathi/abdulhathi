// Walkthrough frames for the tree DP chapter, produced by running each algorithm for real.
import { parseLevelOrder, type TreeNode } from '../viz/tree';
import type { Cell, Frame, GraphNode, Tone } from '../viz/types';

/** House Robber III: every node returns two numbers, best if robbed and best if skipped. */
export function robTree(nodes: Cell[]): { frames: Frame[]; answer: number } {
  const root = parseLevelOrder(nodes);
  const frames: Frame[] = [];
  const notes: Partial<Record<number, string>> = {};
  const tones: Partial<Record<number, Tone>> = {};
  const snap = (note: string, focus?: number) =>
    frames.push({
      note,
      parts: [{ kind: 'tree', label: 'under each node: rob / skip', nodes, notes: { ...notes }, tones: { ...tones, ...(focus !== undefined ? { [focus]: 'active' as Tone } : {}) } }],
    });
  snap('Work bottom-up (post-order). Each node will report two numbers: the best total if it is robbed, and the best total if it is skipped.');
  const visit = (n: TreeNode | null): [number, number] => {
    if (!n) return [0, 0];
    const [lr, ls] = visit(n.left);
    const [rr, rs] = visit(n.right);
    const v = Number(n.value);
    const rob = v + ls + rs;
    const skip = Math.max(lr, ls) + Math.max(rr, rs);
    notes[n.index] = `${rob} / ${skip}`;
    tones[n.index] = 'done';
    const leaf = !n.left && !n.right;
    snap(
      leaf
        ? `Leaf ${v}: robbed gives ${rob}, skipped gives 0.`
        : `Node ${v}: robbing it forbids robbing its children, so rob = ${v} + their skip values = ${rob}. Skipping it lets each child do its best: skip = ${skip}.`,
      n.index,
    );
    return [rob, skip];
  };
  const [rob, skip] = visit(root);
  const answer = Math.max(rob, skip);
  if (root) tones[root.index] = 'match';
  snap(`At the root take the better of the two: max(${rob}, ${skip}) = ${answer}. Each node was visited once, so this is O(n).`);
  return { frames, answer };
}

/** Sum of distances in a tree, for every node, by rerooting. */
export function sumOfDistances(
  n: number,
  edges: [number, number][],
  layout: GraphNode[],
): { frames: Frame[]; answer: number[] } {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    adj[a].push(b);
    adj[b].push(a);
  }
  const size = Array(n).fill(1);
  const down = Array(n).fill(0);
  const ans = Array(n).fill(0);
  const parent = Array(n).fill(-1);
  const frames: Frame[] = [];
  const notes: Partial<Record<string, string>> = {};
  const tones: Partial<Record<string, Tone>> = {};
  const graphEdges = edges.map(([a, b]) => ({ from: String(a), to: String(b) }));
  const snap = (note: string, label: string, focus?: number) =>
    frames.push({
      note,
      parts: [{ kind: 'graph', label, nodes: layout, edges: graphEdges, notes: { ...notes }, tones: { ...tones, ...(focus !== undefined ? { [String(focus)]: 'active' as Tone } : {}) } }],
    });

  // Iterative DFS order from root 0.
  const order: number[] = [];
  const stack = [0];
  const seen = Array(n).fill(false);
  seen[0] = true;
  while (stack.length) {
    const u = stack.pop()!;
    order.push(u);
    for (const v of adj[u]) if (!seen[v]) { seen[v] = true; parent[v] = u; stack.push(v); }
  }
  snap('Root the tree at node 0. Pass 1 goes bottom-up and records, for each node, its subtree size and the sum of distances to the nodes below it.', 'pass 1: size, sum below');
  for (const u of [...order].reverse()) {
    for (const v of adj[u]) if (v !== parent[u]) { size[u] += size[v]; down[u] += down[v] + size[v]; }
    notes[String(u)] = `size ${size[u]}, below ${down[u]}`;
    tones[String(u)] = 'done';
    snap(
      adj[u].length === 1 && u !== 0
        ? `Node ${u} is a leaf: size 1, nothing below.`
        : `Node ${u}: each child subtree is one step further away, so add (child's sum + child's size). Size ${size[u]}, sum below ${down[u]}.`,
      'pass 1: size, sum below',
      u,
    );
  }
  ans[0] = down[0];
  for (const k of Object.keys(notes)) delete notes[k];
  for (const k of Object.keys(tones)) delete tones[k];
  notes['0'] = `answer ${ans[0]}`;
  tones['0'] = 'match';
  snap(`For the root, "sum below" is the whole answer: ${ans[0]}. Pass 2 goes top-down and moves the root one edge at a time.`, 'pass 2: answers', 0);
  for (const u of order) {
    if (u === 0) continue;
    const p = parent[u];
    ans[u] = ans[p] - size[u] + (n - size[u]);
    notes[String(u)] = `answer ${ans[u]}`;
    tones[String(u)] = 'match';
    snap(
      `Move the root from ${p} to ${u}: the ${size[u]} nodes in ${u}'s subtree get one step closer, the other ${n - size[u]} get one step further. ${ans[p]} − ${size[u]} + ${n - size[u]} = ${ans[u]}.`,
      'pass 2: answers',
      u,
    );
  }
  snap(`Every node has its answer after two passes: O(n) instead of a separate search from each node.`, 'pass 2: answers');
  return { frames, answer: ans };
}
