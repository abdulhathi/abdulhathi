// Walkthrough frames for chapter 32, produced by running each algorithm for real.
import { parseLevelOrder, type TreeNode } from '../viz/tree';
import type { Cell, Frame, Tone } from '../viz/types';

/** Inorder traversal without recursion: an explicit stack remembers the nodes still to visit. */
export function iterativeInorder(nodes: Cell[]): { frames: Frame[]; order: Cell[] } {
  const root = parseLevelOrder(nodes);
  const frames: Frame[] = [];
  const stack: TreeNode[] = [];
  const order: Cell[] = [];
  const visited = new Set<number>();
  const picture = (note: string, current: TreeNode | null): Frame => {
    const tones: Partial<Record<number, Tone>> = {};
    for (const i of visited) tones[i] = 'done';
    for (const s of stack) tones[s.index] = 'warn';
    if (current) tones[current.index] = 'active';
    return {
      note,
      parts: [
        { kind: 'tree', label: 'tree', nodes, tones },
        { kind: 'stack', label: 'stack', items: stack.map((s) => s.value) },
        { kind: 'array', label: 'output', items: [...order], indices: false },
      ],
    };
  };
  let cur = root;
  frames.push(picture('Inorder means left subtree, then the node, then the right subtree. A stack replaces the recursion: it holds the nodes whose left side we are still exploring.', cur));
  while (cur || stack.length) {
    if (cur) {
      stack.push(cur);
      const pushed = cur;
      cur = cur.left;
      frames.push(picture(`Push ${pushed.value} and go left${cur ? ` to ${cur.value}` : ''}. ${cur ? '' : 'There is nothing further left.'}`.trim(), cur));
    } else {
      const top = stack.pop()!;
      order.push(top.value);
      visited.add(top.index);
      cur = top.right;
      frames.push(
        picture(`Nothing more to the left, so pop ${top.value} and output it. Then move to its right child${cur ? ` (${cur.value})` : ', which is empty'}.`, cur),
      );
    }
  }
  frames.push(picture(`The stack is empty and there is no current node: done. On a binary search tree, inorder gives the values sorted: ${order.join(', ')}.`, null));
  return { frames, order };
}

/** Level order: a queue processes the tree one level at a time. */
export function levelOrderTrace(nodes: Cell[]): { frames: Frame[]; levels: Cell[][] } {
  const root = parseLevelOrder(nodes);
  const frames: Frame[] = [];
  const levels: Cell[][] = [];
  const seen = new Set<number>();
  let queue: TreeNode[] = root ? [root] : [];
  const picture = (note: string, active: TreeNode[]): Frame => {
    const tones: Partial<Record<number, Tone>> = {};
    for (const i of seen) tones[i] = 'done';
    for (const q of queue) tones[q.index] = 'warn';
    for (const a of active) tones[a.index] = 'active';
    return {
      note,
      parts: [
        { kind: 'tree', label: 'tree', nodes, tones },
        { kind: 'queue', label: 'queue', items: queue.map((q) => q.value) },
        { kind: 'map', label: 'levels so far', keyTitle: 'level', valueTitle: 'values', entries: levels.map((l, i) => [i, l.join(', ')] as [Cell, Cell]) },
      ],
    };
  };
  frames.push(picture('Start with the root in the queue. The queue always holds exactly one level when a round begins.', []));
  while (queue.length) {
    const size = queue.length;
    const level = queue.slice(0, size);
    const next: TreeNode[] = [];
    for (const n of level) {
      seen.add(n.index);
      if (n.left) next.push(n.left);
      if (n.right) next.push(n.right);
    }
    levels.push(level.map((n) => n.value));
    queue = next;
    frames.push(
      picture(
        `Round ${levels.length}: the queue held ${size} node${size > 1 ? 's' : ''} (${level.map((n) => n.value).join(', ')}). Take exactly that many, record them as level ${levels.length - 1}, and add their children to the back${next.length ? ` (${next.map((n) => n.value).join(', ')})` : ''}.`,
        level,
      ),
    );
  }
  frames.push(picture(`The queue is empty: every level is recorded. Each node entered and left the queue once: O(n).`, []));
  return { frames, levels };
}

/** Diameter: each node returns its height; the longest path through it is left height + right height. */
export function diameter(nodes: Cell[]): { frames: Frame[]; best: number } {
  const root = parseLevelOrder(nodes);
  const frames: Frame[] = [];
  const tones: Partial<Record<number, Tone>> = {};
  const notes: Partial<Record<number, string>> = {};
  let best = 0;
  const picture = (note: string): Frame => ({
    note,
    parts: [
      { kind: 'tree', label: 'tree (note = height returned)', nodes, tones: { ...tones }, notes: { ...notes } },
      { kind: 'vars', items: [['best diameter (edges)', best]] },
    ],
  });
  const height = (n: TreeNode | null): number => {
    if (!n) return 0;
    const l = height(n.left);
    const r = height(n.right);
    const through = l + r;
    const improved = through > best;
    best = Math.max(best, through);
    const h = 1 + Math.max(l, r);
    notes[n.index] = `h=${h}`;
    tones[n.index] = improved ? 'match' : 'info';
    frames.push(
      picture(
        `At ${n.value}: left height ${l}, right height ${r}. The longest path that bends at ${n.value} has ${l} + ${r} = ${through} edges${improved ? ', a new best' : ''}. Return height ${h} to the parent, because a parent can extend only one side.`,
      ),
    );
    tones[n.index] = 'done';
    return h;
  };
  frames.push(picture('Two questions at every node: how tall am I (what my parent needs), and how long is the best path that bends here (what the answer needs).'));
  height(root);
  frames.push(picture(`Done: the diameter is ${best} edges. One post-order pass answered both questions at every node, O(n).`));
  return { frames, best };
}
