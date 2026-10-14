// Walkthrough frames for the binary indexed tree chapter, produced by running each operation for real.
// The tree is 1-indexed, so the pictures show an unused cell at index 0.
import type { Cell, Frame, Tone } from '../viz/types';

const lowbit = (i: number) => i & -i;
const bits = (i: number, width: number) => i.toString(2).padStart(width, '0');

function buildTree(a: number[]): number[] {
  const t = Array(a.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    t[i] += a[i - 1];
    const parent = i + lowbit(i);
    if (parent <= a.length) t[parent] += t[i];
  }
  return t;
}

/** Prefix query (strip the lowest set bit) and point update (add the lowest set bit). */
export function fenwickWalk(a: number[], queryIndex: number, updateIndex: number, delta: number): { frames: Frame[]; prefix: number; tree: number[] } {
  const n = a.length;
  const width = n.toString(2).length;
  const tree = buildTree(a);
  const frames: Frame[] = [];
  const view = (tones: Partial<Record<number, Tone>>, ptr: number | null, vars: [string, Cell][], label = 'tree[i] (1-indexed)'): Frame['parts'] => [
    { kind: 'array', label: 'a (shown 1-indexed)', items: [null, ...a] },
    { kind: 'array', label, items: [null, ...tree], tones, pointers: ptr !== null && ptr >= 1 && ptr <= n ? [{ name: 'i', at: ptr }] : [] },
    { kind: 'vars', items: vars },
  ];
  const coverage = Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    return `tree[${i}] = a[${i - lowbit(i) + 1}..${i}]`;
  });
  frames.push({
    note: `tree[i] holds the sum of the last lowbit(i) values ending at i, where lowbit(i) is the value of i's lowest 1-bit. ${coverage.slice(0, 4).join(', ')}, and so on.`,
    parts: view({}, null, []),
  });
  // Prefix query.
  let i = queryIndex;
  let sum = 0;
  const visited: Partial<Record<number, Tone>> = {};
  while (i > 0) {
    sum += tree[i];
    visited[i] = 'match';
    frames.push({
      note: `prefix(${queryIndex}): i = ${i} = ${bits(i, width)} in binary. tree[${i}] covers a[${i - lowbit(i) + 1}..${i}], add ${tree[i]} (total ${sum}). Strip the lowest 1-bit: i becomes ${i - lowbit(i)}.`,
      parts: view({ ...visited, [i]: 'active' }, i, [['i', bits(i, width)], ['lowbit', lowbit(i)], ['sum', sum]]),
    });
    i -= lowbit(i);
  }
  const prefix = sum;
  frames.push({
    note: `i reached 0: prefix(${queryIndex}) = ${prefix}. Each step removes one 1-bit, so there are at most log₂(n) steps.`,
    parts: view(visited, null, [['sum', prefix]]),
  });
  // Point update.
  const touched: Partial<Record<number, Tone>> = {};
  i = updateIndex;
  while (i <= n) {
    tree[i] += delta;
    touched[i] = 'warn';
    frames.push({
      note: `add(${updateIndex}, ${delta}): i = ${i} = ${bits(i, width)}. tree[${i}] covers index ${updateIndex}, so it grows by ${delta} to ${tree[i]}. Add the lowest 1-bit: i becomes ${i + lowbit(i)}.`,
      parts: view({ ...touched, [i]: 'active' }, i, [['i', bits(i, width)], ['lowbit', lowbit(i)]]),
    });
    i += lowbit(i);
  }
  frames.push({
    note: `i passed n: done. Exactly the cells whose ranges contain index ${updateIndex} were changed, again at most log₂(n) of them.`,
    parts: view(touched, null, []),
  });
  return { frames, prefix, tree };
}

/** Count of smaller numbers after self: scan right to left, a BIT counts the values already seen. */
export function countSmallerAfterSelf(nums: number[]): { frames: Frame[]; counts: number[] } {
  const sorted = [...new Set(nums)].sort((x, y) => x - y);
  const rank = new Map(sorted.map((v, k) => [v, k + 1]));
  const m = sorted.length;
  const tree = Array(m + 1).fill(0);
  const counts: Cell[] = Array(nums.length).fill(null);
  const seen = Array(m + 1).fill(0);
  const frames: Frame[] = [];
  const view = (i: number, note: string, tone: Tone = 'active'): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums', items: nums, pointers: i >= 0 && i < nums.length ? [{ name: 'i', at: i }] : [], tones: i >= 0 && i < nums.length ? { [i]: tone } : {} },
      { kind: 'array', label: `how many of each value we have seen, by rank (values ${sorted.join(', ')} → ranks 1..${m})`, items: [null, ...seen.slice(1)] },
      { kind: 'array', label: 'answer', items: [...counts] },
    ],
  });
  frames.push(
    view(-1, `Replace each value by its rank among the distinct values, so the BIT needs only ${m} slots. Then scan from the right: everything already added sits to the right of the current index.`),
  );
  for (let i = nums.length - 1; i >= 0; i--) {
    const r = rank.get(nums[i])!;
    let c = 0;
    for (let j = r - 1; j > 0; j -= lowbit(j)) c += tree[j];
    counts[i] = c;
    for (let j = r; j <= m; j += lowbit(j)) tree[j] += 1;
    seen[r] += 1;
    frames.push(view(i, `nums[${i}] = ${nums[i]} has rank ${r}. A prefix query up to rank ${r - 1} counts the smaller values already seen on the right: ${c}. Then add 1 at rank ${r}.`));
  }
  frames.push(view(-1, `Done: [${counts.join(', ')}]. n queries and n updates of O(log n) each, so O(n log n) instead of comparing every pair.`, 'match'));
  return { frames, counts: counts as number[] };
}
