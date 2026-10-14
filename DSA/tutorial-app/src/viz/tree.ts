import type { Cell } from './types';

/** A binary tree node built from LeetCode's level-order list. `index` is the node's position in that list. */
export type TreeNode = { index: number; value: Cell; depth: number; left: TreeNode | null; right: TreeNode | null };

/** Parse LeetCode's level-order format ([1, null, 2, 3]): children are listed for every
 *  non-null node in order, and the children of a missing node are not listed at all. */
export function parseLevelOrder(nodes: readonly Cell[]): TreeNode | null {
  if (nodes.length === 0 || nodes[0] === null) return null;
  const root: TreeNode = { index: 0, value: nodes[0], depth: 0, left: null, right: null };
  const queue: TreeNode[] = [root];
  let i = 1;
  for (let head = 0; head < queue.length && i < nodes.length; head++) {
    const parent = queue[head];
    for (const side of ['left', 'right'] as const) {
      if (i >= nodes.length) break;
      const value = nodes[i];
      if (value !== null) {
        const child: TreeNode = { index: i, value, depth: parent.depth + 1, left: null, right: null };
        parent[side] = child;
        queue.push(child);
      }
      i++;
    }
  }
  return root;
}

export type PlacedTreeNode = { node: TreeNode; col: number; row: number };

/** Columns follow in-order position and rows follow depth, so no two nodes overlap. */
export function layoutTree(root: TreeNode | null): PlacedTreeNode[] {
  const out: PlacedTreeNode[] = [];
  let col = 0;
  const walk = (n: TreeNode | null) => {
    if (!n) return;
    walk(n.left);
    out.push({ node: n, col: col++, row: n.depth });
    walk(n.right);
  };
  walk(root);
  return out;
}

/** All nodes in level order (breadth first), for tracers that visit a tree. */
export function levelOrder(root: TreeNode | null): TreeNode[] {
  const out: TreeNode[] = [];
  const queue = root ? [root] : [];
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    out.push(n);
    if (n.left) queue.push(n.left);
    if (n.right) queue.push(n.right);
  }
  return out;
}
