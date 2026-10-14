// Walkthrough frames for chapter 34, produced by running each algorithm for real.
import type { Frame, Tone, Viz } from '../viz/types';

/** The same min-heap drawn two ways: as the array it really is, and as the tree it stands for. */
function views(heap: number[], tones: Partial<Record<number, Tone>>, label = 'min-heap'): Viz[] {
  return [
    { kind: 'tree', label: `${label} as a tree`, nodes: [...heap], tones },
    { kind: 'array', label: `${label} as an array (children of i at 2i+1, 2i+2)`, items: [...heap], tones },
  ];
}

/** Push values into a min-heap (sift up), then pop the minimum twice (sift down). */
export function heapOps(pushes: number[], pops: number): { frames: Frame[]; popped: number[]; heap: number[] } {
  const heap: number[] = [];
  const frames: Frame[] = [];
  const popped: number[] = [];
  const swap = (a: number, b: number) => ([heap[a], heap[b]] = [heap[b], heap[a]]);
  frames.push({ note: 'A binary heap is an array read as a complete tree: the parent of index i is at (i − 1) / 2 rounded down. Rule: every parent is no larger than its children, so the minimum sits at index 0.', parts: views(heap, {}) });
  for (const v of pushes) {
    heap.push(v);
    let i = heap.length - 1;
    frames.push({ note: `Push ${v}: put it in the next free slot (index ${i}), the bottom of the tree. The rule may now be broken between it and its parent.`, parts: views(heap, { [i]: 'active' }) });
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p] <= heap[i]) {
        frames.push({ note: `Parent ${heap[p]} ≤ ${heap[i]}: the rule holds, so ${heap[i]} stops here.`, parts: views(heap, { [i]: 'match', [p]: 'info' }) });
        break;
      }
      swap(i, p);
      frames.push({
        note: `${heap[p]} is smaller than its parent ${heap[i]}: swap them. ${heap[p]} moves up one level${p === 0 ? ' and reaches the top: it is the new minimum.' : '.'}`,
        parts: views(heap, { [p]: p === 0 ? 'match' : 'active', [i]: 'warn' }),
      });
      i = p;
    }
  }
  for (let k = 0; k < pops; k++) {
    const top = heap[0];
    popped.push(top);
    const last = heap.pop()!;
    if (heap.length === 0) break;
    heap[0] = last;
    frames.push({ note: `Pop: the minimum ${top} is at index 0. Move the last element (${last}) into its place, so the array stays a complete tree, then sift it down.`, parts: views(heap, { 0: 'active' }) });
    let i = 0;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < heap.length && heap[l] < heap[m]) m = l;
      if (r < heap.length && heap[r] < heap[m]) m = r;
      if (m === i) {
        frames.push({ note: `${heap[i]} is no larger than its children, so it stays. The heap is valid again, and the new minimum is ${heap[0]}.`, parts: views(heap, { [i]: 'match' }) });
        break;
      }
      swap(i, m);
      frames.push({ note: `Swap ${heap[m]} with its smaller child ${heap[i]}. Always pick the smaller child, so the new parent is no larger than either child.`, parts: views(heap, { [i]: 'warn', [m]: 'active' }) });
      i = m;
    }
  }
  return { frames, popped, heap: [...heap] };
}

const ordinal = (k: number) => {
  const last2 = k % 100;
  const suffix = last2 >= 11 && last2 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][k % 10] ?? 'th';
  return `${k}${suffix}`;
};

/** Kth largest: keep a min-heap of the k largest values seen; its top is the answer. */
export function kthLargest(nums: number[], k: number): { frames: Frame[]; answer: number } {
  const heap: number[] = [];
  const frames: Frame[] = [];
  const push = (v: number) => {
    heap.push(v);
    let i = heap.length - 1;
    while (i > 0 && heap[(i - 1) >> 1] > heap[i]) {
      const p = (i - 1) >> 1;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const popMin = () => {
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l] < heap[m]) m = l;
        if (r < heap.length && heap[r] < heap[m]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
  };
  const picture = (i: number, note: string): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums', items: nums, tones: { [i]: 'active' }, pointers: [{ name: 'i', at: i }] },
      { kind: 'array', label: `min-heap of the ${k} largest so far (top first)`, items: [...heap], tones: heap.length ? { 0: 'match' } : {} },
    ],
  });
  nums.forEach((v, i) => {
    if (heap.length < k) {
      push(v);
      frames.push(picture(i, `The heap has fewer than ${k} values, so ${v} goes in.`));
    } else if (v > heap[0]) {
      const out = heap[0];
      popMin();
      push(v);
      frames.push(picture(i, `${v} beats the smallest of the kept values (${out}), so ${out} is no longer among the ${k} largest: pop it and push ${v}.`));
    } else {
      frames.push(picture(i, `${v} is not bigger than the heap's top (${heap[0]}), so it cannot be among the ${k} largest. Skip it.`));
    }
  });
  frames.push(picture(nums.length - 1, `The heap holds the ${k} largest values, and its top, ${heap[0]}, is the smallest of them: the ${ordinal(k)} largest. Cost O(n log k), memory O(k).`));
  return { frames, answer: heap[0] };
}

/** Running median with two heaps: a max-heap for the lower half and a min-heap for the upper half. */
export function twoHeapMedian(stream: number[]): { frames: Frame[]; medians: number[] } {
  const low: number[] = []; // max-heap, stored sorted descending for display
  const high: number[] = []; // min-heap, stored sorted ascending for display
  const medians: number[] = [];
  const frames: Frame[] = [];
  const picture = (v: number, note: string): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'lower half: max-heap (top = largest)', items: [...low], tones: low.length ? { 0: 'info' } : {}, indices: false },
      { kind: 'array', label: 'upper half: min-heap (top = smallest)', items: [...high], tones: high.length ? { 0: 'warn' } : {}, indices: false },
      { kind: 'vars', items: [['new value', v], ['median', medians[medians.length - 1]]], tones: { 1: 'match' } },
    ],
  });
  // The display keeps each half sorted so the top is easy to see; the real structure is a heap with the same top.
  const insertSorted = (arr: number[], v: number, desc: boolean) => {
    let i = 0;
    while (i < arr.length && (desc ? arr[i] > v : arr[i] < v)) i++;
    arr.splice(i, 0, v);
  };
  for (const v of stream) {
    const steps: string[] = [];
    if (low.length === 0 || v <= low[0]) {
      const wasEmpty = low.length === 0;
      insertSorted(low, v, true);
      steps.push(wasEmpty ? `The lower half is empty, so ${v} joins it.` : `${v} ≤ the lower half's top, so it joins the lower half.`);
    } else {
      insertSorted(high, v, false);
      steps.push(`${v} is bigger than the lower half's top, so it joins the upper half.`);
    }
    if (low.length > high.length + 1) {
      const m = low.shift()!;
      insertSorted(high, m, false);
      steps.push(`The lower half is now two bigger, so its top (${m}) moves across.`);
    } else if (high.length > low.length) {
      const m = high.shift()!;
      insertSorted(low, m, true);
      steps.push(`The upper half is now bigger, so its top (${m}) moves across.`);
    }
    const median = low.length > high.length ? low[0] : (low[0] + high[0]) / 2;
    medians.push(median);
    steps.push(low.length > high.length ? `Odd count: the median is the lower top, ${median}.` : `Even count: the median is the average of the two tops, ${median}.`);
    frames.push(picture(v, steps.join(' ')));
  }
  return { frames, medians };
}
