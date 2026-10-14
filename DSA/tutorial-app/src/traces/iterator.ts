// Walkthrough frames for the iterators chapter, produced by running each iterator.
import { parseLevelOrder, type TreeNode } from '../viz/tree';
import type { Cell, Frame, Tone } from '../viz/types';

/** BST iterator: a stack holds the path of nodes whose left side is done but who are not yet returned. */
export function bstIterator(nodes: Cell[]): { frames: Frame[]; output: number[] } {
  const root = parseLevelOrder(nodes);
  const stack: TreeNode[] = [];
  const output: number[] = [];
  const done = new Set<number>();
  const frames: Frame[] = [];
  const view = (note: string, focus?: TreeNode): Frame => {
    const tones: Partial<Record<number, Tone>> = {};
    for (const i of done) tones[i] = 'done';
    for (const n of stack) tones[n.index] = 'info';
    if (focus) tones[focus.index] = 'match';
    return {
      note,
      parts: [
        { kind: 'tree', label: 'binary search tree', nodes, tones },
        { kind: 'stack', label: 'stack', items: stack.map((n) => n.value) },
        { kind: 'array', label: 'returned so far', items: output.slice(), indices: false },
      ],
    };
  };
  const pushLeft = (n: TreeNode | null) => {
    const pushed: Cell[] = [];
    for (let cur = n; cur; cur = cur.left) {
      stack.push(cur);
      pushed.push(cur.value);
    }
    return pushed;
  };
  const first = pushLeft(root);
  frames.push(view(`Start: push the root and keep going left (${first.join(' → ')}). The top of the stack is the smallest value. Nothing else is visited yet.`));
  while (stack.length) {
    const node = stack.pop()!;
    output.push(node.value as number);
    done.add(node.index);
    const pushed = pushLeft(node.right);
    frames.push(
      view(
        `next() pops ${node.value} and returns it. ` +
          (pushed.length ? `It has a right subtree, so push its left spine (${pushed.join(' → ')}): the next smallest values.` : 'It has no right child, so nothing is pushed. The new top is the next value.'),
        node,
      ),
    );
  }
  frames.push(view(`hasNext() is false: the stack is empty. Each node was pushed and popped once, so next() is O(1) on average, and the stack never holds more than the height of the tree.`));
  return { frames, output };
}

export type Nested = number | Nested[];
const show = (x: Nested): string => (typeof x === 'number' ? String(x) : `[${x.map(show).join(',')}]`);

/** Flatten a nested list lazily: a stack holds the items still to visit, first item on top. Lists are opened only when they reach the top. */
export function flattenNested(list: Nested[]): { frames: Frame[]; output: number[] } {
  const stack: Nested[] = [...list].reverse();
  const output: number[] = [];
  const frames: Frame[] = [];
  const view = (note: string, tone?: Tone): Frame => ({
    note,
    parts: [
      { kind: 'stack', label: 'items still to visit (next on top)', items: stack.map(show), tones: tone && stack.length ? { [stack.length - 1]: tone } : {} },
      { kind: 'array', label: 'returned so far', items: output.slice(), indices: false },
    ],
  });
  frames.push(view(`Push the top-level items in reverse, so the first one is on top: ${show(list)}.`));
  for (;;) {
    // hasNext: open lists until an integer is on top (or nothing is left).
    while (stack.length && typeof stack[stack.length - 1] !== 'number') {
      const top = stack.pop() as Nested[];
      stack.push(...[...top].reverse());
      frames.push(view(`hasNext(): the top is a list, ${show(top)}. Replace it by its items, in reverse, and look again.`, 'warn'));
    }
    if (!stack.length) break;
    const v = stack.pop() as number;
    output.push(v);
    frames.push(view(`The top was the integer ${v}: next() popped it and returned it.`));
  }
  frames.push(view('The stack is empty, so hasNext() is false. Each list was opened once, exactly when it was needed: lazy evaluation.'));
  return { frames, output };
}
