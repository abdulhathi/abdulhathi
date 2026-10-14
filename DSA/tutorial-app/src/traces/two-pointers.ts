// Walkthrough frames for chapter 18, produced by running each algorithm for real.
import type { ArrayViz, Frame, Tone } from '../viz/types';

const tones = (pairs: [number, Tone][]) => Object.fromEntries(pairs) as Partial<Record<number, Tone>>;

/** Opposite ends on a sorted array: find two values that add up to `target`. */
export function pairSum(nums: number[], target: number): { frames: Frame[]; result: [number, number] | null } {
  const frames: Frame[] = [];
  const view = (l: number, r: number, extra: Partial<ArrayViz> = {}): ArrayViz => ({
    kind: 'array',
    label: 'nums (sorted)',
    items: nums,
    pointers: [{ name: 'L', at: l }, { name: 'R', at: r, tone: 'info' }],
    window: [l, r],
    ...extra,
  });
  frames.push({
    note: `The array is sorted. Put L on the smallest value and R on the largest. Every pair that can still be the answer lies between them.`,
    parts: [view(0, nums.length - 1), { kind: 'vars', items: [['target', target]] }],
  });
  let l = 0;
  let r = nums.length - 1;
  while (l < r) {
    const sum = nums[l] + nums[r];
    if (sum === target) {
      frames.push({
        note: `${nums[l]} + ${nums[r]} = ${sum}, exactly the target. Answer: indices ${l} and ${r}.`,
        parts: [view(l, r, { tones: tones([[l, 'match'], [r, 'match']]) }), { kind: 'vars', items: [['sum', sum], ['target', target]], tones: { 0: 'match' } }],
      });
      return { frames, result: [l, r] };
    }
    if (sum < target) {
      frames.push({
        note: `${nums[l]} + ${nums[r]} = ${sum} is too small. Pairing ${nums[l]} with anything left of R gives a smaller sum still, so ${nums[l]} can never be in the answer: move L right.`,
        parts: [view(l, r, { tones: tones([[l, 'bad'], [r, 'active']]) }), { kind: 'vars', items: [['sum', sum], ['target', target]], tones: { 0: 'warn' } }],
      });
      l++;
    } else {
      frames.push({
        note: `${nums[l]} + ${nums[r]} = ${sum} is too big. Pairing ${nums[r]} with anything right of L gives a bigger sum still, so ${nums[r]} is out: move R left.`,
        parts: [view(l, r, { tones: tones([[l, 'active'], [r, 'bad']]) }), { kind: 'vars', items: [['sum', sum], ['target', target]], tones: { 0: 'warn' } }],
      });
      r--;
    }
  }
  frames.push({ note: `L met R. Every pair has been ruled out, so no two values add up to ${target}.`, parts: [view(l, r)] });
  return { frames, result: null };
}

/** Read and write pointers: keep one copy of each value in a sorted array, in place. */
export function removeDuplicates(input: number[]): { frames: Frame[]; length: number; kept: number[] } {
  const nums = [...input];
  const frames: Frame[] = [];
  const view = (w: number, r: number, note: string, tone: Tone): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'nums',
        items: [...nums],
        tones: { ...Object.fromEntries(Array.from({ length: w }, (_, i) => [i, 'match' as Tone])), ...(r < nums.length ? { [r]: tone } : {}) },
        pointers: [{ name: 'write', at: w, tone: 'match' }, { name: 'read', at: r }],
      },
      { kind: 'vars', items: [['kept so far', w]] },
    ],
  });
  if (nums.length === 0) return { frames: [{ note: 'Empty array: nothing to keep.', parts: [] }], length: 0, kept: [] };
  let w = 1;
  frames.push(view(w, 1, `The first value is always kept, so the write pointer starts at 1. The green part is the finished answer.`, 'active'));
  for (let r = 1; r < nums.length; r++) {
    if (nums[r] !== nums[w - 1]) {
      const v = nums[r];
      nums[w] = v;
      w++;
      frames.push(view(w, r, `${v} differs from the last kept value, so copy it to the write position and move write forward.`, 'match'));
    } else {
      frames.push(view(w, r, `${nums[r]} equals the last kept value: a duplicate. Skip it; only read moves.`, 'bad'));
    }
  }
  frames.push(view(w, nums.length, `Read reached the end. The first ${w} cells hold each value once; whatever lies after them does not matter.`, 'done'));
  return { frames, length: w, kept: nums.slice(0, w) };
}

/** Fast and slow pointers on a linked list: detect the cycle, then find where it starts. */
export function floydCycle(values: number[], cycleTo: number): { frames: Frame[]; meet: number; entry: number } {
  const n = values.length;
  const next = (i: number) => (i === n - 1 ? cycleTo : i + 1);
  const frames: Frame[] = [];
  const view = (slow: number, fast: number, note: string, extra: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      {
        kind: 'list',
        label: 'linked list with a cycle',
        items: values,
        cycleTo,
        tones: extra,
        pointers: slow === fast ? [{ name: 'slow+fast', at: slow, tone: 'match' }] : [{ name: 'slow', at: slow }, { name: 'fast', at: fast, tone: 'warn' }],
      },
    ],
  });
  let slow = 0;
  let fast = 0;
  frames.push(view(slow, fast, 'Phase 1. Both pointers start at the head. Each round, slow moves one node and fast moves two.'));
  do {
    slow = next(slow);
    fast = next(next(fast));
    frames.push(
      view(
        slow,
        fast,
        slow === fast
          ? `They meet at ${values[slow]}. Fast can only catch slow if the list loops, so there is a cycle.`
          : `slow → ${values[slow]}, fast → ${values[fast]}. Inside a loop, fast gains one node per round, so it must catch up.`,
        slow === fast ? { [slow]: 'match' } : {},
      ),
    );
  } while (slow !== fast);
  const meet = slow;
  let a = 0;
  let b = meet;
  frames.push(view(a, b, `Phase 2. Put one pointer back at the head and leave the other at the meeting point. Now both move one node at a time.`, { [meet]: 'info' }));
  while (a !== b) {
    a = next(a);
    b = next(b);
    frames.push(
      view(a, b, a === b ? `They meet at ${values[a]}: that is where the cycle starts.` : `Both step once: ${values[a]} and ${values[b]}.`, a === b ? { [a]: 'match' } : {}),
    );
  }
  return { frames, meet, entry: a };
}

/** Container with most water: always move the shorter wall. */
export function maxArea(heights: number[]): { frames: Frame[]; best: number } {
  const frames: Frame[] = [];
  let l = 0;
  let r = heights.length - 1;
  let best = 0;
  while (l < r) {
    const h = Math.min(heights[l], heights[r]);
    const area = h * (r - l);
    const improved = area > best;
    best = Math.max(best, area);
    const moveLeft = heights[l] <= heights[r];
    frames.push({
      note: `Width ${r - l} × height ${h} (the shorter wall) = ${area}.${improved ? ' A new best.' : ''} ${
        heights[l] === heights[r]
          ? `Both walls are ${heights[l]} high. Any narrower container that keeps either of them is capped at ${heights[l]} and is narrower, so either can go: move L.`
          : moveLeft
            ? `The left wall (${heights[l]}) is the shorter one. Any narrower container that keeps it is capped at height ${heights[l]} and is narrower, so it cannot do better: move L.`
            : `The right wall (${heights[r]}) is shorter. Keeping it can only make things worse, so move R.`
      }`,
      parts: [
        {
          kind: 'bars',
          label: 'height',
          values: heights,
          tones: { [l]: moveLeft ? 'bad' : 'active', [r]: moveLeft ? 'active' : 'bad' },
          pointers: [{ name: 'L', at: l }, { name: 'R', at: r, tone: 'info' }],
          water: heights.map((_, i) => (i > l && i < r ? h : 0)),
        },
        { kind: 'vars', items: [['area', area], ['best', best]], tones: improved ? { 1: 'match' } : {} },
      ],
    });
    if (moveLeft) l++;
    else r--;
  }
  frames.push({ note: `The pointers met. The largest container holds ${best}.`, parts: [{ kind: 'bars', label: 'height', values: heights }, { kind: 'vars', items: [['best', best]], tones: { 0: 'match' } }] });
  return { frames, best };
}

/** Dutch national flag: sort 0s, 1s and 2s in one pass with three pointers. */
export function dutchFlag(input: number[]): { frames: Frame[]; sorted: number[] } {
  const nums = [...input];
  const frames: Frame[] = [];
  let low = 0;
  let mid = 0;
  let high = nums.length - 1;
  const view = (note: string, focus?: number, tone: Tone = 'active'): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'nums',
        items: [...nums],
        tones: {
          ...Object.fromEntries(Array.from({ length: low }, (_, i) => [i, 'info' as Tone])),
          ...Object.fromEntries(Array.from({ length: Math.max(0, nums.length - 1 - high) }, (_, k) => [high + 1 + k, 'warn' as Tone])),
          ...(focus !== undefined ? { [focus]: tone } : {}),
        },
        pointers: [{ name: 'low', at: low, tone: 'info' }, { name: 'mid', at: mid }, { name: 'high', at: Math.max(high, 0), tone: 'warn' }],
      },
    ],
  });
  frames.push(view('Three zones: everything before low is 0, everything after high is 2, and mid scans the unknown middle.', mid));
  while (mid <= high) {
    const v = nums[mid];
    if (v === 0) {
      [nums[low], nums[mid]] = [nums[mid], nums[low]];
      low++;
      mid++;
      frames.push(view('Saw a 0: swap it to the low zone, then move low and mid forward.'));
    } else if (v === 1) {
      mid++;
      frames.push(view('Saw a 1: it already belongs in the middle. Move mid on.'));
    } else {
      [nums[mid], nums[high]] = [nums[high], nums[mid]];
      high--;
      frames.push(view('Saw a 2: swap it to the high zone and move high back. Do not move mid: the value just swapped in is still unchecked.', mid, 'warn'));
    }
  }
  frames.push(view('mid passed high: the unknown zone is empty and the array is sorted.'));
  return { frames, sorted: nums };
}
