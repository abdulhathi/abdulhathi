// Walkthrough frames for chapter 33, produced by running each algorithm for real.
import { parseLevelOrder, type TreeNode } from '../viz/tree';
import type { Cell, Frame, Tone } from '../viz/types';

type Node = { value: number; left: Node | null; right: Node | null };

function build(t: TreeNode | null): Node | null {
  return t ? { value: Number(t.value), left: build(t.left), right: build(t.right) } : null;
}

function serialise(root: Node | null): { nodes: Cell[]; index: Map<Node, number> } {
  const nodes: Cell[] = [];
  const index = new Map<Node, number>();
  const queue: (Node | null)[] = root ? [root] : [];
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    if (n) {
      index.set(n, nodes.length);
      nodes.push(n.value);
      queue.push(n.left, n.right);
    } else nodes.push(null);
  }
  while (nodes.length && nodes[nodes.length - 1] === null) nodes.pop();
  return { nodes, index };
}

/** Delete a key: walk down by comparing, then handle zero, one or two children (two: copy the successor in). */
export function deleteKey(levelOrder: Cell[], key: number): { frames: Frame[]; result: Cell[] } {
  let root = build(parseLevelOrder(levelOrder));
  const frames: Frame[] = [];
  const picture = (note: string, marks: [Node | null, Tone][]): Frame => {
    const { nodes, index } = serialise(root);
    const tones: Partial<Record<number, Tone>> = {};
    for (const [n, t] of marks) if (n && index.has(n)) tones[index.get(n)!] = t;
    return { note, parts: [{ kind: 'tree', label: `binary search tree (delete ${key})`, nodes, tones }] };
  };
  // Walk down to the key, remembering the parent so it can be re-linked.
  let parent: Node | null = null;
  let cur = root;
  while (cur && cur.value !== key) {
    const dir = key < cur.value ? 'left' : 'right';
    frames.push(picture(`${key} ${key < cur.value ? '<' : '>'} ${cur.value}, so ${key} can only be in the ${dir} subtree. The whole other subtree is skipped with one comparison.`, [[cur, 'active']]));
    parent = cur;
    cur = cur[dir];
  }
  if (!cur) {
    frames.push(picture(`Reached an empty spot: ${key} is not in the tree, so nothing changes.`, []));
    return { frames, result: serialise(root).nodes };
  }
  const target = cur;
  const relink = (from: Node, to: Node | null) => {
    if (!parent) root = to;
    else if (parent.left === from) parent.left = to;
    else parent.right = to;
  };
  if (target.left && target.right) {
    frames.push(picture(`Found ${key}. It has two children, so it cannot simply be cut out. Replace it with its successor: the smallest value in its right subtree, which keeps every left value smaller and every right value larger.`, [[target, 'bad']]));
    let sParent = target;
    let s = target.right;
    frames.push(picture(`Go right once, to ${s.value}, then as far left as possible.`, [[target, 'bad'], [s, 'active']]));
    while (s.left) {
      sParent = s;
      s = s.left;
      frames.push(picture(`Keep going left: ${s.value}.`, [[target, 'bad'], [s, 'active']]));
    }
    frames.push(picture(`${s.value} has no left child, so it is the successor. Copy ${s.value} into the node that held ${key}.`, [[target, 'bad'], [s, 'warn']]));
    target.value = s.value;
    // The successor has at most a right child: splice it out.
    if (sParent === target) sParent.right = s.right;
    else sParent.left = s.right;
    frames.push(picture(`Now remove the old ${s.value} node. It has no left child, so its right child (${s.right ? s.right.value : 'empty'}) takes its place. The tree is still a valid BST.`, [[target, 'match']]));
  } else {
    const child = target.left ?? target.right;
    frames.push(picture(`Found ${key}. It has ${child ? 'one child' : 'no children'}, so ${child ? `its child ${child.value} takes its place` : 'it is simply removed'}.`, [[target, 'bad']]));
    relink(target, child);
    frames.push(picture(`Done. The ordering rule still holds everywhere.`, [[child, 'match']]));
  }
  return { frames, result: serialise(root).nodes };
}

/** Validate a BST by passing down the range each node must fall in. */
export function validateBounds(levelOrder: Cell[]): { frames: Frame[]; valid: boolean } {
  const root = parseLevelOrder(levelOrder);
  const frames: Frame[] = [];
  const tones: Partial<Record<number, Tone>> = {};
  const notes: Partial<Record<number, string>> = {};
  const show = (b: number) => (b === -Infinity ? '−∞' : b === Infinity ? '∞' : String(b));
  const picture = (note: string): Frame => ({ note, parts: [{ kind: 'tree', label: 'tree (note = allowed range)', nodes: levelOrder, tones: { ...tones }, notes: { ...notes } }] });
  let valid = true;
  const check = (n: TreeNode | null, lo: number, hi: number, parent?: { v: number; left: boolean }): boolean => {
    if (!n) return true;
    const v = Number(n.value);
    notes[n.index] = `(${show(lo)}, ${show(hi)})`;
    if (v <= lo || v >= hi) {
      tones[n.index] = 'bad';
      const passesParent = parent !== undefined && (parent.left ? v < parent.v : v > parent.v);
      frames.push(
        picture(
          `${v} must lie strictly between ${show(lo)} and ${show(hi)}, but it does not. ${
            passesParent
              ? `Comparing ${v} with its parent alone would pass; the range check catches that ${v} sits on the wrong side of an ancestor.`
              : `It is already on the wrong side of its own parent.`
          } Not a valid BST.`,
        ),
      );
      return false;
    }
    tones[n.index] = 'match';
    frames.push(picture(`${v} is inside (${show(lo)}, ${show(hi)}). Its left child must be below ${v} and its right child above ${v}, on top of the limits it inherited.`));
    return check(n.left, lo, v, { v, left: true }) && check(n.right, v, hi, { v, left: false });
  };
  frames.push(picture('Each node inherits a range from its ancestors: going left lowers the upper limit, going right raises the lower limit.'));
  valid = check(root, -Infinity, Infinity);
  if (valid) frames.push(picture('Every node is inside its range: this is a valid binary search tree.'));
  return { frames, valid };
}
