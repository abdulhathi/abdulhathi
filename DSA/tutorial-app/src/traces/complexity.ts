// Walkthrough frames for chapter 03, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Binary search on a sorted array, counting how many elements it actually looks at. */
export function binarySearchSteps(nums: number[], target: number): { frames: Frame[]; index: number; steps: number } {
  const frames: Frame[] = [];
  let lo = 0;
  let hi = nums.length - 1;
  let steps = 0;
  const view = (note: string, mid: number | null, tone: Tone = 'active'): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: `sorted array of ${nums.length} values`,
        items: nums,
        window: lo <= hi ? [lo, hi] : undefined,
        tones: {
          ...Object.fromEntries(nums.map((_, i) => [i, (i < lo || i > hi ? 'dim' : undefined) as Tone])),
          ...(mid !== null ? { [mid]: tone } : {}),
        },
        pointers: mid !== null ? [{ name: 'mid', at: mid, tone }] : [],
      },
      { kind: 'vars', items: [['target', target], ['looked at', steps], ['still possible', Math.max(0, hi - lo + 1)]] },
    ],
  });
  frames.push(view(`Every one of the ${nums.length} values could be the target. A linear scan might have to look at all of them.`, null));
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    steps++;
    if (nums[mid] === target) {
      frames.push(view(`The middle value is ${nums[mid]}: found after looking at only ${steps} values.`, mid, 'match'));
      return { frames, index: mid, steps };
    }
    const smaller = nums[mid] < target;
    const before = hi - lo + 1;
    if (smaller) lo = mid + 1;
    else hi = mid - 1;
    frames.push(
      view(
        `${nums[mid]} is ${smaller ? 'smaller' : 'larger'} than ${target}, so the whole ${smaller ? 'left' : 'right'} half goes at once: ${before} candidates become ${Math.max(0, hi - lo + 1)}.`,
        mid,
        'bad',
      ),
    );
  }
  frames.push(view(`Nothing is left, so ${target} is not in the array. Even that took only ${steps} looks: about log₂ n.`, null));
  return { frames, index: -1, steps };
}

type CallNode = { k: number; label: string; left: CallNode | null; right: CallNode | null; order: number };

/** The call tree of the naive recursive Fibonacci: each call to f(k) with k ≥ 2 makes two more calls. */
export function fibCallTree(n: number): { frames: Frame[]; calls: number; distinct: number } {
  let order = 0;
  const build = (k: number): CallNode => {
    const node: CallNode = { k, label: `f(${k})`, left: null, right: null, order: order++ };
    if (k >= 2) {
      node.left = build(k - 1);
      node.right = build(k - 2);
    }
    return node;
  };
  const root = build(n);
  const calls = order;

  // LeetCode level order: list both children of every real node; null marks a missing child.
  const nodes: Cell[] = [root.label];
  const indexOf = new Map<CallNode, number>([[root, 0]]);
  const queue: CallNode[] = [root];
  for (let head = 0; head < queue.length; head++) {
    for (const child of [queue[head].left, queue[head].right]) {
      if (child) {
        indexOf.set(child, nodes.length);
        queue.push(child);
      }
      nodes.push(child ? child.label : null);
    }
  }
  while (nodes[nodes.length - 1] === null) nodes.pop();

  const preorder: CallNode[] = [];
  const walk = (c: CallNode | null) => {
    if (!c) return;
    preorder.push(c);
    walk(c.left);
    walk(c.right);
  };
  walk(root);

  const frames: Frame[] = [];
  const seen = new Set<number>();
  const tones: Partial<Record<number, Tone>> = {};
  let wasted = 0;
  for (const c of preorder) {
    const repeat = seen.has(c.k);
    if (repeat) wasted++;
    seen.add(c.k);
    const idx = indexOf.get(c)!;
    const shown = { ...tones, [idx]: repeat ? 'bad' : 'active' } as Partial<Record<number, Tone>>;
    frames.push({
      note: repeat
        ? `Call ${c.order + 1}: f(${c.k}) again. Its answer was already worked out once, so this whole branch is wasted work.`
        : `Call ${c.order + 1}: f(${c.k}) for the first time.${c.k < 2 ? ' It is a base case and returns at once.' : ` It must call f(${c.k - 1}) and f(${c.k - 2}).`}`,
      parts: [
        { kind: 'tree', label: `calls made by f(${n})`, nodes, tones: shown },
        { kind: 'vars', items: [['calls so far', c.order + 1], ['repeated calls', wasted]], tones: repeat ? { 1: 'bad' } : {} },
      ],
    });
    tones[idx] = repeat ? 'warn' : 'done';
  }
  frames.push({
    note: `${calls} calls for only ${n + 1} different questions, f(0) to f(${n}). The tree roughly doubles with each level, which is why naive Fibonacci is O(2ⁿ). Remembering each answer means each one is computed only once: ${n + 1} computations.`,
    parts: [
      { kind: 'tree', label: `calls made by f(${n})`, nodes, tones },
      { kind: 'vars', items: [['total calls', calls], ['different questions', n + 1]], tones: { 0: 'bad', 1: 'match' } },
    ],
  });
  return { frames, calls, distinct: n + 1 };
}

/** A dynamic array that doubles its capacity when full. Counts how many element copies the resizes cost. */
export function dynamicArray(pushes: number): { frames: Frame[]; copies: number; capacity: number } {
  const frames: Frame[] = [];
  let capacity = 1;
  let size = 0;
  let copies = 0;
  const slots: Cell[] = [null];
  for (let v = 1; v <= pushes; v++) {
    let grew = false;
    let moved = 0;
    if (size === capacity) {
      capacity *= 2;
      moved = size;
      copies += size;
      grew = true;
      while (slots.length < capacity) slots.push(null);
    }
    slots[size] = v;
    size++;
    const tones: Partial<Record<number, Tone>> = {};
    if (grew) for (let i = 0; i < size - 1; i++) tones[i] = 'warn';
    tones[size - 1] = 'match';
    frames.push({
      note: grew
        ? `Push ${v}: the array was full, so it grows to capacity ${capacity} and copies all ${moved} old values across. Expensive, but rare.`
        : `Push ${v}: there is a free slot, so it costs a single write.`,
      parts: [
        { kind: 'array', label: `capacity ${capacity}`, items: [...slots], tones },
        {
          kind: 'vars',
          items: [['pushes', size], ['copies so far', copies], ['copies per push', Number((copies / size).toFixed(2))]],
          tones: grew ? { 1: 'warn' } : {},
        },
      ],
    });
  }
  frames.push({
    note: `${pushes} pushes caused ${copies} copies in total, fewer than 2 per push. The rare expensive pushes are paid for by the many cheap ones: push is O(1) amortized.`,
    parts: [
      { kind: 'array', label: `capacity ${capacity}`, items: [...slots] },
      { kind: 'vars', items: [['pushes', pushes], ['total copies', copies]], tones: { 1: 'match' } },
    ],
  });
  return { frames, copies, capacity };
}
