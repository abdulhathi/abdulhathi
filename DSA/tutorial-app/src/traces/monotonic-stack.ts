// Walkthrough frames for chapter 29, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

const toneMap = (pairs: [number, Tone][]) => Object.fromEntries(pairs) as Partial<Record<number, Tone>>;

/** Daily Temperatures: a decreasing stack of indices still waiting for a warmer day. */
export function nextWarmer(temps: number[]): { frames: Frame[]; answer: number[] } {
  const answer: number[] = temps.map(() => 0);
  const settled = new Set<number>();
  const stack: number[] = [];
  const frames: Frame[] = [];
  const picture = (i: number, note: string, extra: [number, Tone][] = []): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'temperatures',
        items: temps,
        tones: toneMap([
          ...temps.map((_, k) => [k, settled.has(k) ? 'done' : stack.includes(k) ? 'warn' : 'dim'] as [number, Tone]).filter(([k]) => k < i || stack.includes(k)),
          ...(i < temps.length ? [[i, 'active'] as [number, Tone]] : []),
          ...extra,
        ]),
        pointers: i < temps.length ? [{ name: 'i', at: i }] : [],
      },
      { kind: 'stack', label: 'stack (indices waiting)', items: stack.map((k) => `${k}: ${temps[k]}`) },
      { kind: 'array', label: 'answer (days to wait)', items: answer.map((a, k) => (settled.has(k) ? a : null)), tones: toneMap([...settled].map((k) => [k, 'match'])) },
    ],
  });
  frames.push(picture(0, 'Scan left to right. The stack holds days that have not yet seen a warmer day; their temperatures only go down from bottom to top.'));
  for (let i = 0; i < temps.length; i++) {
    const popped: number[] = [];
    while (stack.length > 0 && temps[stack[stack.length - 1]] < temps[i]) {
      const j = stack.pop()!;
      answer[j] = i - j;
      settled.add(j);
      popped.push(j);
    }
    const what = popped.length
      ? `${temps[i]} is warmer than ${popped.map((j) => temps[j]).join(', ')} on top of the stack. Each of those days has found its answer: pop it and record the wait (${popped.map((j) => `day ${j}: ${i - j}`).join(', ')}).`
      : stack.length
        ? `${temps[i]} is not warmer than ${temps[stack[stack.length - 1]]} on top, so nobody is answered. Day ${i} joins the waiting stack.`
        : `The stack is empty, so day ${i} (${temps[i]}) simply starts waiting.`;
    stack.push(i);
    frames.push(picture(i, `${what}${popped.length ? ` Then push day ${i}.` : ''}`, popped.map((j) => [j, 'match'] as [number, Tone])));
  }
  frames.push(
    picture(
      temps.length,
      `The scan is over. Days still on the stack (${stack.join(', ') || 'none'}) never see a warmer day, so their answer stays 0. Every index was pushed once and popped at most once: O(n).`,
    ),
  );
  stack.forEach((k) => settled.add(k));
  frames[frames.length - 1] = picture(temps.length, frames[frames.length - 1].note);
  return { frames, answer };
}

/** Largest Rectangle in Histogram: an increasing stack; a bar's rectangle is decided when it is popped. */
export function largestRectangle(heights: number[]): { frames: Frame[]; best: number } {
  const stack: number[] = [];
  const frames: Frame[] = [];
  let best = 0;
  const n = heights.length;
  const picture = (i: number, note: string, tones: [number, Tone][], area?: number): Frame => ({
    note,
    parts: [
      {
        kind: 'bars',
        label: 'heights',
        values: heights,
        tones: toneMap([...stack.map((k) => [k, 'warn'] as [number, Tone]), ...tones]),
        pointers: i < n ? [{ name: 'i', at: i }] : [],
      },
      { kind: 'stack', label: 'stack (indices, heights rising)', items: stack.map((k) => `${k}: ${heights[k]}`) },
      { kind: 'vars', items: [['area', area ?? null], ['best', best]], tones: area !== undefined && area === best && area > 0 ? { 1: 'match' } : {} },
    ],
  });
  frames.push(picture(0, 'Keep a stack of bar indices whose heights rise from bottom to top. A bar stays on the stack while its rectangle can still stretch to the right.', []));
  for (let i = 0; i <= n; i++) {
    const h = i === n ? 0 : heights[i];
    while (stack.length > 0 && heights[stack[stack.length - 1]] >= h) {
      const top = stack.pop()!;
      const left = stack.length ? stack[stack.length - 1] : -1;
      const width = i - left - 1;
      const area = heights[top] * width;
      best = Math.max(best, area);
      const range: [number, Tone][] = [];
      for (let k = left + 1; k < i; k++) range.push([k, k === top ? 'active' : 'info']);
      frames.push(
        picture(
          i,
          `${i === n ? 'The end acts as a bar of height 0' : `Bar ${i} (height ${h}) is not taller`}, so bar ${top} (height ${heights[top]}) can stretch no further right. Its left limit is the bar now below it on the stack (${left === -1 ? 'none: it reaches the start' : `index ${left}`}). Width ${width} × height ${heights[top]} = ${area}.`,
          range,
          area,
        ),
      );
    }
    if (i < n) {
      stack.push(i);
      frames.push(picture(i, `Push bar ${i} (height ${h}). Every bar below it on the stack is shorter, so they can all still grow.`, [[i, 'active']]));
    }
  }
  frames.push(picture(n, `Every bar was pushed once and popped once, and each pop measured that bar's widest rectangle. The largest area is ${best}.`, []));
  return { frames, best };
}

/** Remove K Digits: drop a digit when a smaller one arrives after it, while removals remain. */
export function removeKDigits(num: string, k: number): { frames: Frame[]; result: string } {
  const digits = num.split('');
  const stack: string[] = [];
  const frames: Frame[] = [];
  let left = k;
  const picture = (i: number, note: string, tones: [number, Tone][] = []): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'num', items: digits, tones: toneMap(tones), pointers: i < digits.length ? [{ name: 'i', at: i }] : [] },
      { kind: 'stack', label: 'kept digits', items: [...stack] },
      { kind: 'vars', items: [['removals left', left]] },
    ],
  });
  frames.push(picture(0, `To make the number small, its leading digits must be small. Keep digits on a stack; whenever a smaller digit arrives, a bigger digit just before it is worth removing.`));
  digits.forEach((d, i) => {
    const removed: string[] = [];
    while (left > 0 && stack.length > 0 && stack[stack.length - 1] > d) {
      removed.push(stack.pop()!);
      left--;
    }
    stack.push(d);
    frames.push(
      picture(
        i,
        removed.length
          ? `${d} is smaller than ${removed.join(' and ')} before it. Removing ${removed.length > 1 ? 'them' : 'it'} makes an earlier position smaller, which beats anything later. Then keep ${d}.`
          : left === 0
            ? `No removals left: keep ${d}.`
            : `${d} is not smaller than the digit before it, so keep it.`,
        [[i, removed.length ? 'match' : 'active']],
      ),
    );
  });
  while (left > 0) {
    stack.pop();
    left--;
  }
  const raw = stack.join('').replace(/^0+/, '');
  const result = raw === '' ? '0' : raw;
  frames.push(picture(digits.length, `Any removals still left come off the end, where digits matter least. Strip leading zeros. Result: ${result}.`));
  return { frames, result };
}

/** Sum of Subarray Minimums: how far each value reaches as the minimum, found with two stacks. */
export function minContributions(arr: number[]): { left: number[]; right: number[]; contribution: number[]; total: number } {
  const n = arr.length;
  const left = new Array<number>(n);
  const right = new Array<number>(n);
  const stack: number[] = [];
  // left[i]: how many start positions make arr[i] the minimum (stop at the previous strictly smaller value).
  for (let i = 0; i < n; i++) {
    while (stack.length && arr[stack[stack.length - 1]] >= arr[i]) stack.pop();
    left[i] = stack.length ? i - stack[stack.length - 1] : i + 1;
    stack.push(i);
  }
  stack.length = 0;
  // right[i]: how many end positions (stop at the next smaller-or-equal value, so ties are counted once).
  for (let i = n - 1; i >= 0; i--) {
    while (stack.length && arr[stack[stack.length - 1]] > arr[i]) stack.pop();
    right[i] = stack.length ? stack[stack.length - 1] - i : n - i;
    stack.push(i);
  }
  const contribution = arr.map((v, i) => v * left[i] * right[i]);
  return { left, right, contribution, total: contribution.reduce((a, b) => a + b, 0) };
}

/* ---------- Cartesian tree ---------- */

type TNode = { value: number; left: TNode | null; right: TNode | null };

/** LeetCode level order for a tree, plus each node's position in that list. */
export function toLevelOrder(root: TNode | null): { nodes: Cell[]; index: Map<TNode, number> } {
  const nodes: Cell[] = [];
  const index = new Map<TNode, number>();
  if (!root) return { nodes, index };
  const queue: (TNode | null)[] = [root];
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    if (n) {
      index.set(n, nodes.length);
      nodes.push(n.value);
      queue.push(n.left, n.right);
    } else {
      nodes.push(null);
    }
  }
  while (nodes.length && nodes[nodes.length - 1] === null) nodes.pop();
  return { nodes, index };
}

/** Maximum Binary Tree (a max Cartesian tree) built in one pass with a decreasing stack. */
export function cartesianTree(nums: number[]): { frames: Frame[]; levelOrder: Cell[] } {
  const stack: TNode[] = [];
  const frames: Frame[] = [];
  const rootOf = () => stack[0] ?? null;
  const picture = (i: number, note: string, current?: TNode): Frame => {
    const { nodes, index } = toLevelOrder(rootOf());
    const tones: Partial<Record<number, Tone>> = {};
    for (const s of stack) if (index.has(s)) tones[index.get(s)!] = 'warn';
    if (current && index.has(current)) tones[index.get(current)!] = 'active';
    return {
      note,
      parts: [
        { kind: 'array', label: 'nums', items: nums, tones: i < nums.length ? { [i]: 'active' } : {}, pointers: i < nums.length ? [{ name: 'i', at: i }] : [] },
        { kind: 'stack', label: 'right spine (stack)', items: stack.map((s) => s.value) },
        ...(nodes.length ? [{ kind: 'tree' as const, label: 'tree so far', nodes, tones }] : []),
      ],
    };
  };
  frames.push(picture(0, 'The stack holds the right spine of the tree built so far, largest at the bottom. Amber nodes are on that spine.'));
  nums.forEach((v, i) => {
    const node: TNode = { value: v, left: null, right: null };
    let last: TNode | null = null;
    while (stack.length && stack[stack.length - 1].value < v) last = stack.pop()!;
    node.left = last;
    if (stack.length) stack[stack.length - 1].right = node;
    stack.push(node);
    frames.push(
      picture(
        i,
        last
          ? `${v} is bigger than the spine values it popped, so the last one popped (${last.value}) and everything under it becomes ${v}'s left subtree.${stack.length > 1 ? ` ${v} hangs as the right child of ${stack[stack.length - 2].value}.` : ` ${v} is the new root.`}`
          : stack.length > 1
            ? `${v} is smaller than ${stack[stack.length - 2].value}, so it becomes ${stack[stack.length - 2].value}'s right child and joins the spine.`
            : `${v} starts the tree.`,
        node,
      ),
    );
  });
  const { nodes } = toLevelOrder(rootOf());
  frames.push(picture(nums.length, 'Done. Every value was pushed and popped at most once, so building the whole tree took O(n) instead of the O(n²) worst case of "find the maximum, then recurse".'));
  return { frames, levelOrder: nodes };
}
