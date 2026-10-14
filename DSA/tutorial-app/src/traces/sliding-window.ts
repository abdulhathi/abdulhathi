// Walkthrough frames for chapter 19 (Sliding window), produced by running each algorithm for real.
import type { Frame, Tone, Viz } from '../viz/types';

/** Fixed window of size k: slide by adding the entering value and subtracting the leaving one. */
export function fixedWindow(nums: number[], k: number): { frames: Frame[]; best: number; bestStart: number } {
  const frames: Frame[] = [];
  const view = (l: number, r: number, sum: number, best: number, tones: Partial<Record<number, Tone>>, improved = false): Viz[] => [
    { kind: 'array', label: 'nums', items: nums, window: [l, r], tones, pointers: [{ name: 'L', at: l }, { name: 'R', at: r, tone: 'info' }] },
    { kind: 'vars', items: [['window sum', sum], ['best', best]], tones: improved ? { 1: 'match' } : {} },
  ];
  let sum = 0;
  for (let i = 0; i < k; i++) sum += nums[i];
  let best = sum;
  let bestStart = 0;
  frames.push({ note: `Add up the first ${k} values once: the first window's sum is ${sum}. This is the only time we add k numbers.`, parts: view(0, k - 1, sum, best, {}, true) });
  for (let r = k; r < nums.length; r++) {
    const l = r - k + 1;
    const out = nums[l - 1];
    sum += nums[r] - out;
    const improved = sum > best;
    if (improved) {
      best = sum;
      bestStart = l;
    }
    frames.push({
      note: `Slide right: ${nums[r]} enters and ${out} leaves, so the sum becomes ${sum - nums[r] + out} + ${nums[r]} − ${out} = ${sum}.${improved ? ' A new best.' : ''} Two operations, not ${k}.`,
      parts: view(l, r, sum, best, { [r]: 'match', [l - 1]: 'bad' }, improved),
    });
  }
  frames.push({
    note: `Every window of size ${k} was checked with O(1) work each. The best sum is ${best}, starting at index ${bestStart}.`,
    parts: view(bestStart, bestStart + k - 1, best, best, Object.fromEntries(Array.from({ length: k }, (_, i) => [bestStart + i, 'match' as Tone])), true),
  });
  return { frames, best, bestStart };
}

/** Longest window with no repeated character: grow on the right, shrink on the left while there is a repeat. */
export function longestUnique(s: string): { frames: Frame[]; best: number; start: number } {
  const chars = [...s];
  const frames: Frame[] = [];
  const inWindow = new Set<string>();
  let l = 0;
  let best = 0;
  let start = 0;
  const view = (r: number, tones: Partial<Record<number, Tone>>, improved = false): Viz[] => [
    { kind: 'array', label: 's', items: chars, window: r >= l ? [l, r] : undefined, tones, pointers: [{ name: 'L', at: l }, { name: 'R', at: Math.max(r, 0), tone: 'info' }] },
    { kind: 'set', label: 'letters in the window', items: [...inWindow] },
    { kind: 'vars', items: [['window length', Math.max(0, r - l + 1)], ['best', best]], tones: improved ? { 1: 'match' } : {} },
  ];
  for (let r = 0; r < chars.length; r++) {
    const c = chars[r];
    while (inWindow.has(c)) {
      frames.push({
        note: `"${c}" is already in the window, so adding it would create a repeat. Shrink from the left: drop "${chars[l]}" at index ${l}.`,
        parts: view(r, { [r]: 'bad', [l]: 'warn' }),
      });
      inWindow.delete(chars[l]);
      l++;
    }
    inWindow.add(c);
    const improved = r - l + 1 > best;
    if (improved) {
      best = r - l + 1;
      start = l;
    }
    frames.push({
      note: `Add "${c}". The window [${l}, ${r}] has no repeats and length ${r - l + 1}.${improved ? ' A new best.' : ''}`,
      parts: view(r, { [r]: 'match' }, improved),
    });
  }
  frames.push({ note: `R reached the end. The longest window without a repeat has length ${best}: "${chars.slice(start, start + best).join('')}". Each letter entered once and left at most once.`, parts: view(chars.length - 1, {}) });
  return { frames, best, start };
}

/** Shortest window whose sum reaches the target (all values positive): grow until valid, then shrink while still valid. */
export function shortestAtLeast(nums: number[], target: number): { frames: Frame[]; best: number } {
  const frames: Frame[] = [];
  let l = 0;
  let sum = 0;
  let best = Infinity;
  const view = (r: number, tones: Partial<Record<number, Tone>>, improved = false): Viz[] => [
    { kind: 'array', label: 'nums (all positive)', items: nums, window: [l, r], tones, pointers: [{ name: 'L', at: l }, { name: 'R', at: r, tone: 'info' }] },
    { kind: 'vars', items: [['target', target], ['window sum', sum], ['shortest', best]], tones: improved ? { 2: 'match' } : sum >= target ? { 1: 'match' } : {} },
  ];
  for (let r = 0; r < nums.length; r++) {
    sum += nums[r];
    if (sum < target) {
      frames.push({ note: `Add ${nums[r]}: the sum is ${sum}, still below ${target}. Keep growing.`, parts: view(r, { [r]: 'active' }) });
      continue;
    }
    while (sum >= target) {
      const improved = r - l + 1 < best;
      best = Math.min(best, r - l + 1);
      frames.push({
        note: `The sum ${sum} reaches ${target} with length ${r - l + 1}.${improved ? ' A new shortest.' : ''} Try to shrink: drop ${nums[l]} from the left.`,
        parts: view(r, { [l]: 'warn', [r]: 'active' }, improved),
      });
      sum -= nums[l];
      l++;
    }
    frames.push({ note: `Now the sum is ${sum}, below ${target} again, so the window [${l}, ${r}] is too short. Grow on the right.`, parts: view(r, { [r]: 'active' }) });
  }
  frames.push({ note: best === Infinity ? 'No window reaches the target.' : `Done. The shortest window with a sum of at least ${target} has length ${best}.`, parts: view(nums.length - 1, {}) });
  return { frames, best: best === Infinity ? 0 : best };
}

/** Count subarrays with at most k distinct values: every valid window [l, r] adds r − l + 1 subarrays that end at r. */
export function countAtMostK(nums: number[], k: number): { frames: Frame[]; count: number } {
  const frames: Frame[] = [];
  const counts = new Map<number, number>();
  let l = 0;
  let total = 0;
  const view = (r: number, tones: Partial<Record<number, Tone>>, added?: number): Viz[] => [
    { kind: 'array', label: 'nums', items: nums, window: [l, r], tones, pointers: [{ name: 'L', at: l }, { name: 'R', at: r, tone: 'info' }] },
    { kind: 'map', label: 'counts in the window', keyTitle: 'value', valueTitle: 'count', entries: [...counts.entries()] },
    { kind: 'vars', items: [['distinct', counts.size], ['added', added ?? 0], ['total', total]], tones: added ? { 2: 'match' } : {} },
  ];
  for (let r = 0; r < nums.length; r++) {
    counts.set(nums[r], (counts.get(nums[r]) ?? 0) + 1);
    while (counts.size > k) {
      frames.push({ note: `Adding ${nums[r]} makes ${counts.size} distinct values, more than ${k}. Drop ${nums[l]} from the left.`, parts: view(r, { [r]: 'active', [l]: 'bad' }) });
      const c = counts.get(nums[l])! - 1;
      if (c === 0) counts.delete(nums[l]);
      else counts.set(nums[l], c);
      l++;
    }
    const added = r - l + 1;
    total += added;
    frames.push({
      note: `The window [${l}, ${r}] has at most ${k} distinct values, and so does every subarray that ends at ${r} and starts inside it: that is ${added} new subarray${added > 1 ? 's' : ''}.`,
      parts: view(r, { [r]: 'match' }, added),
    });
  }
  frames.push({ note: `Total subarrays with at most ${k} distinct values: ${total}. For "exactly k", subtract the count for at most k − 1.`, parts: view(nums.length - 1, {}) });
  return { frames, count: total };
}
