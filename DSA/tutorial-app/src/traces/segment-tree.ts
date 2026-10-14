// Walkthrough frames for the segment tree chapter, produced by running each operation for real.
// The tree is stored in level order (node p has children 2p + 1 and 2p + 2), which is exactly
// the order the tree picture expects, so node p is drawn at position p.
import type { Frame, Tone } from '../viz/types';

type Seg = { sum: number[]; lazy: number[]; lo: number[]; hi: number[]; size: number };

function build(a: number[]): Seg {
  const size = 2 * a.length - 1; // a.length must be a power of two for this picture
  const seg: Seg = { sum: Array(size).fill(0), lazy: Array(size).fill(0), lo: Array(size).fill(0), hi: Array(size).fill(0), size };
  const rec = (p: number, l: number, r: number) => {
    seg.lo[p] = l;
    seg.hi[p] = r;
    if (l === r) {
      seg.sum[p] = a[l];
      return;
    }
    const m = (l + r) >> 1;
    rec(2 * p + 1, l, m);
    rec(2 * p + 2, m + 1, r);
    seg.sum[p] = seg.sum[2 * p + 1] + seg.sum[2 * p + 2];
  };
  rec(0, 0, a.length - 1);
  return seg;
}

function picture(seg: Seg, tones: Partial<Record<number, Tone>>, label: string, a: number[]): Frame['parts'] {
  const notes: Partial<Record<number, string>> = {};
  for (let p = 0; p < seg.size; p++) {
    const range = seg.lo[p] === seg.hi[p] ? `[${seg.lo[p]}]` : `[${seg.lo[p]},${seg.hi[p]}]`;
    notes[p] = seg.lazy[p] ? `${range} +${seg.lazy[p]}` : range;
  }
  return [
    { kind: 'tree', label, nodes: seg.sum, tones, notes },
    { kind: 'array', label: 'the array underneath', items: a },
  ];
}

function assertPowerOfTwo(n: number) {
  if (n & (n - 1)) throw new Error('These walkthroughs draw a perfect tree: use an array whose length is a power of two');
}

/** Range sum query: covered nodes answer at once, disjoint nodes are skipped, partial nodes split. */
export function segmentQuery(a: number[], l: number, r: number): { frames: Frame[]; answer: number; visited: number } {
  assertPowerOfTwo(a.length);
  const seg = build(a);
  const frames: Frame[] = [];
  const tones: Partial<Record<number, Tone>> = {};
  let visited = 0;
  const label = `sum of [${l}, ${r}]: each node shows its sum, its range below`;
  frames.push({
    note: `Each node stores the sum of a range: the root covers everything, each child covers half of its parent. To add up [${l}, ${r}], start at the root.`,
    parts: picture(seg, {}, label, a),
  });
  let total = 0;
  const rec = (p: number) => {
    visited++;
    const lo = seg.lo[p];
    const hi = seg.hi[p];
    if (hi < l || lo > r) {
      tones[p] = 'dim';
      frames.push({ note: `Node [${lo},${hi}] lies outside [${l}, ${r}]: skip it without looking inside.`, parts: picture(seg, { ...tones }, label, a) });
      return;
    }
    if (l <= lo && hi <= r) {
      tones[p] = 'match';
      total += seg.sum[p];
      frames.push({ note: `Node [${lo},${hi}] lies completely inside: take its sum ${seg.sum[p]} at once. Running total ${total}.`, parts: picture(seg, { ...tones }, label, a) });
      return;
    }
    tones[p] = 'active';
    frames.push({ note: `Node [${lo},${hi}] overlaps only partly: ask both children.`, parts: picture(seg, { ...tones }, label, a) });
    tones[p] = 'info';
    rec(2 * p + 1);
    rec(2 * p + 2);
  };
  rec(0);
  frames.push({
    note: `Sum of [${l}, ${r}] = ${total}, from ${visited} node visits. At most two partial nodes per level are ever split, so a query costs O(log n).`,
    parts: picture(seg, { ...tones }, label, a),
  });
  return { frames, answer: total, visited };
}

/** Point update: walk down to the leaf, change it, and fix every sum on the way back up. */
export function segmentUpdate(a: number[], index: number, value: number): { frames: Frame[]; root: number } {
  assertPowerOfTwo(a.length);
  const arr = [...a];
  const seg = build(arr);
  const frames: Frame[] = [];
  const label = `set index ${index} to ${value}`;
  const path: number[] = [];
  let p = 0;
  while (seg.lo[p] !== seg.hi[p]) {
    path.push(p);
    const m = (seg.lo[p] + seg.hi[p]) >> 1;
    p = index <= m ? 2 * p + 1 : 2 * p + 2;
  }
  path.push(p);
  const tones = Object.fromEntries(path.map((q) => [q, 'active' as Tone]));
  frames.push({
    note: `Only the nodes whose range contains index ${index} change: one per level, ${path.length} in all. Walk down to the leaf.`,
    parts: picture(seg, tones, label, arr),
  });
  arr[index] = value;
  seg.sum[p] = value;
  const done: Partial<Record<number, Tone>> = { ...tones, [p]: 'match' };
  frames.push({ note: `Set the leaf [${index}] to ${value}.`, parts: picture(seg, { ...done }, label, arr) });
  for (let k = path.length - 2; k >= 0; k--) {
    const q = path[k];
    seg.sum[q] = seg.sum[2 * q + 1] + seg.sum[2 * q + 2];
    done[q] = 'match';
    frames.push({
      note: `Recompute [${seg.lo[q]},${seg.hi[q]}] from its two children: ${seg.sum[2 * q + 1]} + ${seg.sum[2 * q + 2]} = ${seg.sum[q]}.`,
      parts: picture(seg, { ...done }, label, arr),
    });
  }
  frames.push({ note: `Done: ${path.length} nodes touched, O(log n). The rest of the tree was already correct.`, parts: picture(seg, done, label, arr) });
  return { frames, root: seg.sum[0] };
}

/** Range add with lazy propagation: covered nodes take the change and leave a note for their children. */
export function segmentRangeAdd(a: number[], l: number, r: number, delta: number, probe: number): { frames: Frame[]; root: number; probeValue: number } {
  assertPowerOfTwo(a.length);
  const arr = [...a];
  const seg = build(arr);
  const frames: Frame[] = [];
  const tones: Partial<Record<number, Tone>> = {};
  const label = `add ${delta} to every value in [${l}, ${r}]`;
  frames.push({
    note: `Adding ${delta} to each of ${r - l + 1} values one at a time would cost ${r - l + 1} updates. Lazy propagation stops at the first nodes that fit completely inside the range.`,
    parts: picture(seg, {}, label, arr),
  });
  const len = (p: number) => seg.hi[p] - seg.lo[p] + 1;
  const apply = (p: number, d: number) => {
    seg.sum[p] += d * len(p);
    if (seg.lo[p] !== seg.hi[p]) seg.lazy[p] += d;
  };
  const push = (p: number) => {
    if (!seg.lazy[p]) return;
    apply(2 * p + 1, seg.lazy[p]);
    apply(2 * p + 2, seg.lazy[p]);
    seg.lazy[p] = 0;
  };
  const add = (p: number) => {
    if (seg.hi[p] < l || seg.lo[p] > r) return;
    if (l <= seg.lo[p] && seg.hi[p] <= r) {
      apply(p, delta);
      tones[p] = 'warn';
      frames.push({
        note: `[${seg.lo[p]},${seg.hi[p]}] fits inside: its sum grows by ${delta} × ${len(p)} = ${delta * len(p)}.${seg.lo[p] !== seg.hi[p] ? ` Its children are NOT updated now; the node remembers "+${delta}" for them.` : ''}`,
        parts: picture(seg, { ...tones }, label, arr),
      });
      return;
    }
    push(p);
    add(2 * p + 1);
    add(2 * p + 2);
    seg.sum[p] = seg.sum[2 * p + 1] + seg.sum[2 * p + 2];
    tones[p] = 'info';
    frames.push({ note: `[${seg.lo[p]},${seg.hi[p]}] overlaps partly: after its children are done, recompute its sum = ${seg.sum[p]}.`, parts: picture(seg, { ...tones }, label, arr) });
  };
  add(0);
  for (let i = l; i <= r; i++) arr[i] += delta;
  // A later query on one index pushes the pending notes down along its path.
  const qTones: Partial<Record<number, Tone>> = {};
  let p = 0;
  while (seg.lo[p] !== seg.hi[p]) {
    const pending = seg.lazy[p];
    push(p);
    qTones[p] = pending ? 'warn' : 'active';
    if (pending) {
      frames.push({
        note: `Later, a query for index ${probe} passes [${seg.lo[p]},${seg.hi[p]}], which still holds "+${pending}". Push it down: both children take the change now, and the note moves to them.`,
        parts: picture(seg, { ...qTones }, `query index ${probe}`, arr),
      });
    }
    const m = (seg.lo[p] + seg.hi[p]) >> 1;
    p = probe <= m ? 2 * p + 1 : 2 * p + 2;
  }
  qTones[p] = 'match';
  frames.push({
    note: `The leaf for index ${probe} now holds ${seg.sum[p]}, which is correct. Work was only done where a query needed it: range updates and queries both stay O(log n).`,
    parts: picture(seg, qTones, `query index ${probe}`, arr),
  });
  return { frames, root: seg.sum[0], probeValue: seg.sum[p] };
}
