// Walkthrough frames for chapter 50 (Memoization), produced by running each algorithm for real.
import type { Cell, Frame, Tone, TreeViz } from '../viz/types';

type CallNode = { arg: number; left: CallNode | null; right: CallNode | null; value: number; order: number };

/** LeetCode level-order list for a binary tree of calls, plus each node's position in that list. */
function toLevelOrder(root: CallNode): { nodes: Cell[]; index: Map<CallNode, number> } {
  const nodes: Cell[] = [root.arg];
  const index = new Map<CallNode, number>([[root, 0]]);
  const queue: CallNode[] = [root];
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    for (const child of [n.left, n.right]) {
      if (child) {
        index.set(child, nodes.length);
        nodes.push(child.arg);
        queue.push(child);
      } else {
        nodes.push(null);
      }
    }
  }
  while (nodes.length && nodes[nodes.length - 1] === null) nodes.pop();
  return { nodes, index };
}

/** The full call tree of plain recursive Fibonacci, with repeated calls marked. */
export function fibCallTree(n: number): { tree: TreeViz; calls: number; distinct: number } {
  let order = 0;
  const seen = new Set<number>();
  const repeated = new Set<CallNode>();
  const build = (k: number): CallNode => {
    const node: CallNode = { arg: k, left: null, right: null, value: 0, order: order++ };
    if (seen.has(k)) repeated.add(node);
    if (k <= 1) {
      node.value = k;
    } else {
      node.left = build(k - 1);
      node.right = build(k - 2);
      node.value = node.left.value + node.right.value;
    }
    seen.add(k);
    return node;
  };
  const root = build(n);
  const { nodes, index } = toLevelOrder(root);
  const tones: Partial<Record<number, Tone>> = {};
  const notes: Partial<Record<number, string>> = {};
  for (const [node, i] of index) {
    if (repeated.has(node)) tones[i] = 'warn';
    notes[i] = `=${node.value}`;
  }
  return { tree: { kind: 'tree', label: `calls made by plain recursion for f(${n})`, nodes, tones, notes }, calls: order, distinct: seen.size };
}

/** Memoised Fibonacci: every call after the first for a given argument is a cache hit. */
export function fibMemo(n: number): { frames: Frame[]; value: number; calls: number } {
  const cache = new Map<number, number>();
  let order = 0;
  type Event = { node: CallNode; hit: boolean };
  const events: Event[] = [];
  const call = (k: number): CallNode => {
    const node: CallNode = { arg: k, left: null, right: null, value: 0, order: order++ };
    if (cache.has(k)) {
      node.value = cache.get(k)!;
      events.push({ node, hit: true });
      return node;
    }
    if (k <= 1) {
      node.value = k;
    } else {
      node.left = call(k - 1);
      node.right = call(k - 2);
      node.value = node.left.value + node.right.value;
    }
    cache.set(k, node.value);
    events.push({ node, hit: false });
    return node;
  };
  const root = call(n);
  const { nodes, index } = toLevelOrder(root);
  const frames: Frame[] = [];
  const settled = new Map<CallNode, boolean>();
  const entries: [Cell, Cell][] = [];
  const view = (note: string, focus?: Event): Frame => {
    const tones: Partial<Record<number, Tone>> = {};
    const notes: Partial<Record<number, string>> = {};
    for (const [node, hit] of settled) {
      const i = index.get(node)!;
      tones[i] = hit ? 'match' : 'done';
      notes[i] = `=${node.value}`;
    }
    if (focus) tones[index.get(focus.node)!] = focus.hit ? 'match' : 'active';
    return {
      note,
      parts: [
        { kind: 'tree', label: `calls made with a cache for f(${n})`, nodes, tones, notes },
        { kind: 'map', label: 'cache', keyTitle: 'k', valueTitle: 'f(k)', entries: [...entries], tones: focus && !focus.hit ? { [entries.length - 1]: 'active' } : {} },
      ],
    };
  };
  frames.push(view(`Calling f(${n}) starts a chain of calls down the left side: f(${n}) needs f(${n - 1}), which needs f(${n - 2}), and so on.`));
  for (const ev of events) {
    settled.set(ev.node, ev.hit);
    if (!ev.hit) entries.push([ev.node.arg, ev.node.value]);
    const k = ev.node.arg;
    frames.push(
      view(
        ev.hit
          ? `f(${k}) is already in the cache (${ev.node.value}). Return it at once: this whole subtree is never explored again.`
          : k <= 1
            ? `f(${k}) is a base case: ${k}. Store it in the cache.`
            : `f(${k}) = f(${k - 1}) + f(${k - 2}) = ${ev.node.value}. Store it before returning.`,
        ev,
      ),
    );
  }
  frames.push(view(`Done: f(${n}) = ${root.value} with ${order} calls. Plain recursion needs ${fibCallTree(n).calls}, and the gap grows exponentially with n.`));
  return { frames, value: root.value, calls: order };
}

/** Longest Increasing Path in a Matrix: memoised DFS, one frame each time a cell's answer is stored. */
export function longestIncreasingPath(matrix: number[][]): { frames: Frame[]; best: number } {
  const m = matrix.length;
  const n = matrix[0].length;
  const memo: number[][] = matrix.map((row) => row.map(() => 0));
  const frames: Frame[] = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const view = (note: string, focus?: [number, number], reused: [number, number][] = []): Frame => {
    const tones: Partial<Record<string, Tone>> = {};
    for (const [r, c] of reused) tones[`${r},${c}`] = 'match';
    if (focus) tones[`${focus[0]},${focus[1]}`] = 'active';
    return {
      note,
      parts: [
        { kind: 'grid', label: 'matrix', cells: matrix, tones },
        { kind: 'grid', label: 'cache: longest path starting here (empty = not computed)', cells: memo.map((row) => row.map((v) => (v === 0 ? null : v))), tones },
      ],
    };
  };
  frames.push(view('Paths only climb to strictly larger values, so they can never loop. longest(cell) = 1 + the best longest(larger neighbour), cached once computed.'));
  const dfs = (r: number, c: number): number => {
    if (memo[r][c]) return memo[r][c];
    let best = 1;
    const reused: [number, number][] = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= m || nc >= n || matrix[nr][nc] <= matrix[r][c]) continue;
      const wasCached = memo[nr][nc] !== 0;
      const len = dfs(nr, nc);
      if (wasCached) reused.push([nr, nc]);
      best = Math.max(best, 1 + len);
    }
    memo[r][c] = best;
    const larger = dirs.filter(([dr, dc]) => {
      const nr = r + dr;
      const nc = c + dc;
      return nr >= 0 && nc >= 0 && nr < m && nc < n && matrix[nr][nc] > matrix[r][c];
    }).length;
    frames.push(
      view(
        larger === 0
          ? `${matrix[r][c]} has no larger neighbour, so the longest path from it is just itself: 1.`
          : `${matrix[r][c]}: the best larger neighbour gives ${best - 1}, so longest = ${best}.${reused.length ? ' The green neighbours came straight from the cache.' : ''}`,
        [r, c],
        reused,
      ),
    );
    return best;
  };
  let best = 0;
  for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) best = Math.max(best, dfs(r, c));
  frames.push(view(`Every cell was computed exactly once. The longest increasing path has length ${best}.`));
  return { frames, best };
}
