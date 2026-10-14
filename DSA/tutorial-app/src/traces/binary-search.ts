// Walkthrough frames for chapter 21 (Binary search), produced by running each search for real.
import type { Cell, Frame, Tone, Viz } from '../viz/types';

const range = (lo: number, hi: number, tone: Tone) => Object.fromEntries(Array.from({ length: Math.max(0, hi - lo + 1) }, (_, k) => [lo + k, tone])) as Partial<Record<number, Tone>>;

/** Classic search for an exact value in a sorted array, with an inclusive range [lo, hi]. */
export function exactSearch(nums: number[], target: number): { frames: Frame[]; index: number; steps: number } {
  const frames: Frame[] = [];
  let lo = 0;
  let hi = nums.length - 1;
  let steps = 0;
  const dimOutside = () => {
    const t: Partial<Record<number, Tone>> = {};
    nums.forEach((_, i) => {
      if (i < lo || i > hi) t[i] = 'dim';
    });
    return t;
  };
  const view = (mid: number | null, tones: Partial<Record<number, Tone>>): Viz[] => [
    {
      kind: 'array',
      label: 'nums (sorted)',
      items: nums,
      tones,
      window: lo <= hi ? [lo, hi] : undefined,
      pointers: [{ name: 'lo', at: Math.min(lo, nums.length) }, ...(mid !== null ? [{ name: 'mid', at: mid, tone: 'warn' as Tone }] : []), { name: 'hi', at: Math.max(hi, 0), tone: 'info' as Tone }],
    },
    { kind: 'vars', items: [['target', target], ['candidates left', Math.max(0, hi - lo + 1)], ['steps', steps]] },
  ];
  frames.push({ note: `The target, if present, is somewhere in [lo, hi], which starts as the whole array: ${nums.length} candidates.`, parts: view(null, {}) });
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    steps++;
    if (nums[mid] === target) {
      frames.push({ note: `mid = ${mid} holds ${nums[mid]}, the target. Found it in ${steps} step${steps > 1 ? 's' : ''}.`, parts: view(mid, { ...dimOutside(), [mid]: 'match' }) });
      return { frames, index: mid, steps };
    }
    if (nums[mid] < target) {
      frames.push({
        note: `nums[${mid}] = ${nums[mid]} is less than ${target}. Since the array is sorted, everything from lo to mid is too small: discard that half, lo = ${mid + 1}.`,
        parts: view(mid, { ...dimOutside(), ...range(lo, mid, 'bad'), [mid]: 'bad' }),
      });
      lo = mid + 1;
    } else {
      frames.push({
        note: `nums[${mid}] = ${nums[mid]} is greater than ${target}, so everything from mid to hi is too big: discard that half, hi = ${mid - 1}.`,
        parts: view(mid, { ...dimOutside(), ...range(mid, hi, 'bad') }),
      });
      hi = mid - 1;
    }
  }
  frames.push({ note: `lo passed hi: no candidates are left, so ${target} is not in the array.`, parts: view(null, dimOutside()) });
  return { frames, index: -1, steps };
}

/** Find the first index whose value is at least target (the lower bound), with the half-open range [lo, hi). */
export function lowerBound(nums: number[], target: number): { frames: Frame[]; index: number } {
  const frames: Frame[] = [];
  const passes: Cell[] = nums.map((v) => (v >= target ? 'yes' : 'no'));
  let lo = 0;
  let hi = nums.length;
  const view = (mid: number | null, tones: Partial<Record<number, Tone>>): Viz[] => [
    {
      kind: 'array',
      label: `nums: is the value ≥ ${target}?`,
      items: nums,
      tones,
      pointers: [{ name: 'lo', at: lo }, ...(mid !== null ? [{ name: 'mid', at: mid, tone: 'warn' as Tone }] : []), { name: 'hi', at: hi, tone: 'info' as Tone }],
    },
    {
      kind: 'array',
      label: 'the yes/no question at each index',
      items: passes,
      indices: false,
      tones: Object.fromEntries(passes.map((p, i) => [i, i < lo ? 'bad' : i >= hi ? 'match' : p === 'yes' ? 'info' : undefined]).filter(([, t]) => t)),
    },
  ];
  frames.push({
    note: `Ask the same yes/no question at every index: "is the value at least ${target}?". The answers are all "no" and then all "yes". We want the first "yes". Invariant: everything left of lo is "no", everything from hi on is "yes".`,
    parts: view(null, {}),
  });
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] >= target) {
      frames.push({ note: `nums[${mid}] = ${nums[mid]} ≥ ${target}: "yes". The first "yes" is at mid or to its left, so hi = ${mid} (keep mid: it might be the answer).`, parts: view(mid, { [mid]: 'match' }) });
      hi = mid;
    } else {
      frames.push({ note: `nums[${mid}] = ${nums[mid]} < ${target}: "no". The first "yes" is strictly to the right, so lo = ${mid + 1}.`, parts: view(mid, { [mid]: 'bad' }) });
      lo = mid + 1;
    }
  }
  frames.push({
    note: lo < nums.length
      ? `lo = hi = ${lo}. Everything left of it is "no" and it is "yes": index ${lo} (value ${nums[lo]}) is the first value ≥ ${target}. ${nums[lo] === target ? 'It equals the target.' : `The target would be inserted here.`}`
      : `lo = hi = ${lo}, one past the end: no value is ≥ ${target}, so it would be inserted at the end.`,
    parts: view(null, lo < nums.length ? { [lo]: 'match' } : {}),
  });
  return { frames, index: lo };
}

/** Search a rotated sorted array: one half around mid is always sorted, so check whether the target lies inside it. */
export function rotatedSearch(nums: number[], target: number): { frames: Frame[]; index: number } {
  const frames: Frame[] = [];
  let lo = 0;
  let hi = nums.length - 1;
  const view = (mid: number | null, tones: Partial<Record<number, Tone>>): Viz[] => [
    {
      kind: 'array',
      label: 'nums (sorted, then rotated)',
      items: nums,
      tones,
      window: lo <= hi ? [lo, hi] : undefined,
      pointers: [{ name: 'lo', at: Math.min(lo, nums.length) }, ...(mid !== null ? [{ name: 'mid', at: mid, tone: 'warn' as Tone }] : []), { name: 'hi', at: Math.max(hi, 0), tone: 'info' as Tone }],
    },
    { kind: 'vars', items: [['target', target]] },
  ];
  frames.push({ note: 'The array was sorted and then rotated, so it is two sorted runs. Whatever mid is, at least one of the halves [lo, mid] and [mid, hi] is fully sorted.', parts: view(null, {}) });
  while (lo <= hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    if (nums[mid] === target) {
      frames.push({ note: `nums[${mid}] = ${target}. Found.`, parts: view(mid, { [mid]: 'match' }) });
      return { frames, index: mid };
    }
    if (nums[lo] <= nums[mid]) {
      const inside = nums[lo] <= target && target < nums[mid];
      frames.push({
        note: `nums[lo] = ${nums[lo]} ≤ nums[mid] = ${nums[mid]}, so the left half is sorted. Is ${target} between ${nums[lo]} and ${nums[mid]}? ${inside ? 'Yes: keep the left half.' : 'No: it must be in the right half.'}`,
        parts: view(mid, { ...range(lo, mid - 1, 'info'), [mid]: 'warn' }),
      });
      if (inside) hi = mid - 1;
      else lo = mid + 1;
    } else {
      const inside = nums[mid] < target && target <= nums[hi];
      frames.push({
        note: `nums[lo] = ${nums[lo]} > nums[mid] = ${nums[mid]}, so the rotation point is on the left and the right half is sorted. Is ${target} between ${nums[mid]} and ${nums[hi]}? ${inside ? 'Yes: keep the right half.' : 'No: go left.'}`,
        parts: view(mid, { ...range(mid + 1, hi, 'info'), [mid]: 'warn' }),
      });
      if (inside) lo = mid + 1;
      else hi = mid - 1;
    }
  }
  frames.push({ note: `No candidates left: ${target} is not in the array.`, parts: view(null, {}) });
  return { frames, index: -1 };
}

/** Binary search on the answer: the smallest eating speed that finishes every pile within h hours. */
export function minSpeed(piles: number[], h: number): { frames: Frame[]; speed: number } {
  const frames: Frame[] = [];
  const hours = (k: number) => piles.reduce((s, p) => s + Math.ceil(p / k), 0);
  let lo = 1;
  let hi = Math.max(...piles);
  const view = (k: number | null, ok?: boolean): Viz[] => [
    { kind: 'array', label: 'piles', items: piles, indices: false },
    { kind: 'vars', items: [['hours allowed', h], ['speed range', `[${lo}, ${hi}]`], ...(k !== null ? ([['try speed', k], ['hours needed', hours(k)]] as [string, Cell][]) : [])], tones: k === null ? {} : { 3: ok ? 'match' : 'bad' } },
  ];
  frames.push({
    note: `We are not searching the array: we are searching the answer. Speeds from 1 to ${hi} (the biggest pile) are possible, and the question "can I finish at this speed?" is "no" for small speeds and "yes" for large ones.`,
    parts: view(null),
  });
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const ok = hours(mid) <= h;
    frames.push({
      note: ok
        ? `At speed ${mid} the piles take ${piles.map((p) => Math.ceil(p / mid)).join(' + ')} = ${hours(mid)} hours, within ${h}. ${mid} works, so the answer is ${mid} or smaller: hi = ${mid}.`
        : `At speed ${mid} the piles take ${piles.map((p) => Math.ceil(p / mid)).join(' + ')} = ${hours(mid)} hours, more than ${h}. Too slow, and so is every slower speed: lo = ${mid + 1}.`,
      parts: view(mid, ok),
    });
    if (ok) hi = mid;
    else lo = mid + 1;
  }
  frames.push({ note: `lo = hi = ${lo}: the slowest speed that still finishes in time. Each check costs O(n), and there were only about log₂(${Math.max(...piles)}) checks.`, parts: view(lo, true) });
  return { frames, speed: lo };
}
