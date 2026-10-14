// Walkthrough frames for the Divide and conquer chapter, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

type Best = { sum: number; l: number; r: number };

const span = (b: Best, tone: Tone) =>
  Object.fromEntries(Array.from({ length: b.r - b.l + 1 }, (_, k) => [b.l + k, tone])) as Partial<Record<number, Tone>>;

/** Maximum subarray by divide and conquer: best of the left half, the right half, and the best range crossing the middle. */
export function maxSubarrayDC(nums: number[]): { frames: Frame[]; best: Best } {
  const frames: Frame[] = [];
  frames.push({
    note: 'Split the array in half again and again. For every range, the best subarray is either entirely in the left half, entirely in the right half, or it crosses the middle.',
    parts: [{ kind: 'array', label: 'nums', items: nums }],
  });

  const solve = (lo: number, hi: number): Best => {
    if (lo === hi) return { sum: nums[lo], l: lo, r: lo };
    const mid = Math.floor((lo + hi) / 2);
    const left = solve(lo, mid);
    const right = solve(mid + 1, hi);

    // The crossing range: the best suffix of the left half joined to the best prefix of the right half.
    let run = 0;
    let bestL = -Infinity;
    let from = mid;
    for (let i = mid; i >= lo; i--) {
      run += nums[i];
      if (run > bestL) {
        bestL = run;
        from = i;
      }
    }
    run = 0;
    let bestR = -Infinity;
    let to = mid + 1;
    for (let i = mid + 1; i <= hi; i++) {
      run += nums[i];
      if (run > bestR) {
        bestR = run;
        to = i;
      }
    }
    const cross: Best = { sum: bestL + bestR, l: from, r: to };
    const winner = [left, right, cross].reduce((a, b) => (b.sum > a.sum ? b : a));
    const which = winner === left ? 'the left half' : winner === right ? 'the right half' : 'the range crossing the middle';
    frames.push({
      note: `Range ${lo}..${hi}: left best ${left.sum}, right best ${right.sum}, crossing best ${cross.sum} (indices ${cross.l}..${cross.r}). The winner is ${which}, with sum ${winner.sum}.`,
      parts: [
        {
          kind: 'array',
          label: 'nums',
          items: nums,
          window: [lo, hi],
          tones: { ...span(cross, 'warn'), ...span(winner, 'match') },
          pointers: [{ name: 'mid', at: mid, tone: 'info' }],
        },
        { kind: 'vars', items: [['left', left.sum], ['right', right.sum], ['crossing', cross.sum], ['best', winner.sum]], tones: { 3: 'match' } },
      ],
    });
    return winner;
  };

  const best = solve(0, nums.length - 1);
  frames.push({
    note: `The whole array is solved: the best subarray is indices ${best.l}..${best.r} with sum ${best.sum}. There are log n levels and each level does O(n) work, so O(n log n) in total.`,
    parts: [{ kind: 'array', label: 'nums', items: nums, tones: span(best, 'match') }, { kind: 'vars', items: [['best', best.sum]], tones: { 0: 'match' } }],
  });
  return { frames, best };
}

type Node = { val: number; left: Node | null; right: Node | null };

/** LeetCode level order of a tree, plus the position of each node in that list. */
function serialize(root: Node | null): { nodes: Cell[]; index: Map<Node, number> } {
  const nodes: Cell[] = [];
  const index = new Map<Node, number>();
  const queue: (Node | null)[] = [root];
  for (let head = 0; head < queue.length; head++) {
    const n = queue[head];
    if (n === null) {
      nodes.push(null);
      continue;
    }
    index.set(n, nodes.length);
    nodes.push(n.val);
    queue.push(n.left, n.right);
  }
  while (nodes.length && nodes[nodes.length - 1] === null) nodes.pop();
  return { nodes, index };
}

/** Build a height-balanced BST from a sorted array: the middle value is the root, each half builds a subtree. */
export function sortedToBST(nums: number[]): { frames: Frame[]; levelOrder: Cell[] } {
  const frames: Frame[] = [];
  let root: Node | null = null;
  frames.push({
    note: 'The array is sorted. Its middle value becomes the root: half the values are smaller (left subtree) and half are bigger (right subtree).',
    parts: [{ kind: 'array', label: 'nums (sorted)', items: nums }],
  });
  const build = (lo: number, hi: number, attach: (n: Node) => void) => {
    if (lo > hi) return;
    const mid = Math.floor((lo + hi) / 2);
    const node: Node = { val: nums[mid], left: null, right: null };
    attach(node);
    const { nodes, index } = serialize(root);
    frames.push({
      note: `Range ${lo}..${hi}: its middle, index ${mid}, holds ${nums[mid]}. It becomes a node; the values left of it build its left subtree and the values right of it build its right subtree.`,
      parts: [
        { kind: 'array', label: 'nums (sorted)', items: nums, window: [lo, hi], tones: { [mid]: 'active' }, pointers: [{ name: 'mid', at: mid }] },
        { kind: 'tree', label: 'tree so far', nodes, tones: { [index.get(node)!]: 'active' } },
      ],
    });
    build(lo, mid - 1, (n) => (node.left = n));
    build(mid + 1, hi, (n) => (node.right = n));
  };
  build(0, nums.length - 1, (n) => (root = n));
  const { nodes } = serialize(root);
  frames.push({
    note: 'Every value is placed. Each split halves the range, so the tree has about log₂ n levels: it is height-balanced by construction.',
    parts: [{ kind: 'tree', label: 'balanced BST', nodes, tones: Object.fromEntries(nodes.flatMap((v, i) => (v === null ? [] : [[i, 'match' as Tone]]))) }],
  });
  return { frames, levelOrder: nodes };
}
