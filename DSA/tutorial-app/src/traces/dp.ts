// Walkthrough frames for chapter 51 (Dynamic programming foundations), produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** House Robber: best[i] = max(skip house i, rob it on top of best[i − 2]). */
export function houseRobber(nums: number[]): { frames: Frame[]; best: number; table: number[] } {
  const n = nums.length;
  // best[k] = most money from the first k houses; best[0] = 0.
  const best: (number | null)[] = new Array(n + 1).fill(null);
  best[0] = 0;
  const frames: Frame[] = [];
  const view = (note: string, k: number | null, tones: Partial<Record<number, Tone>> = {}, houseTone?: Tone): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'money in each house', items: nums, tones: k !== null && k >= 1 ? { [k - 1]: houseTone ?? 'active' } : {} },
      { kind: 'array', label: 'best[k] = most money from the first k houses', items: [...best] as Cell[], tones },
    ],
  });
  frames.push(view('State: best[k] is the most money you can take from the first k houses. With no houses, best[0] = 0.', null, { 0: 'match' }));
  best[1] = nums[0];
  frames.push(view(`With one house, rob it: best[1] = ${nums[0]}.`, 1, { 1: 'match' }, 'match'));
  for (let k = 2; k <= n; k++) {
    const skip = best[k - 1]!;
    const rob = best[k - 2]! + nums[k - 1];
    best[k] = Math.max(skip, rob);
    const robWins = rob > skip;
    frames.push(
      view(
        `House ${k - 1} holds ${nums[k - 1]}. Skip it: best[${k - 1}] = ${skip}. Rob it: best[${k - 2}] + ${nums[k - 1]} = ${rob}. ${robWins ? 'Robbing' : 'Skipping'} is better, so best[${k}] = ${best[k]}.`,
        k,
        { [k - 1]: robWins ? 'dim' : 'info', [k - 2]: robWins ? 'info' : 'dim', [k]: 'match' },
        robWins ? 'match' : 'dim',
      ),
    );
  }
  frames.push(view(`The table is full. The answer is the last entry: best[${n}] = ${best[n]}.`, null, { [n]: 'match' }));
  return { frames, best: best[n]!, table: best as number[] };
}

/** Word Break: ok[i] is true when the first i characters split into dictionary words. */
export function wordBreak(s: string, words: string[]): { frames: Frame[]; ok: boolean } {
  const dict = new Set(words);
  const maxLen = Math.max(...words.map((w) => w.length));
  const n = s.length;
  const ok: (string | null)[] = new Array(n + 1).fill(null);
  ok[0] = 'T';
  const chars = s.split('');
  const frames: Frame[] = [];
  const view = (note: string, win?: [number, number], focus?: number, okTones: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'array', label: `s (dictionary: ${words.join(', ')})`, items: chars, window: win },
      { kind: 'array', label: 'ok[i]: can the first i characters be split? (T / F)', items: [...ok], tones: { ...okTones, ...(focus !== undefined ? { [focus]: okTones[focus] ?? 'active' } : {}) } },
    ],
  });
  frames.push(view('ok[0] is true: the empty prefix needs no words. Now decide ok[1], ok[2], … in order, each from smaller answers.', undefined, 0, { 0: 'match' }));
  for (let i = 1; i <= n; i++) {
    let found = -1;
    for (let j = i - 1; j >= Math.max(0, i - maxLen); j--) {
      if (ok[j] === 'T' && dict.has(s.slice(j, i))) {
        found = j;
        break;
      }
    }
    ok[i] = found >= 0 ? 'T' : 'F';
    if (found >= 0) {
      frames.push(view(`ok[${i}]: "${s.slice(found, i)}" is a word and ok[${found}] is true, so the first ${i} characters split. ok[${i}] = T.`, [found, i - 1], i, { [found]: 'info', [i]: 'match' }));
    } else {
      frames.push(view(`ok[${i}]: no word ends here on top of a splittable prefix ("${s.slice(0, i)}" cannot be split). ok[${i}] = F.`, undefined, i, { [i]: 'bad' }));
    }
  }
  frames.push(view(`ok[${n}] = ${ok[n]}: the whole string ${ok[n] === 'T' ? 'can' : 'cannot'} be split into dictionary words.`, undefined, n, { [n]: ok[n] === 'T' ? 'match' : 'bad' }));
  return { frames, ok: ok[n] === 'T' };
}

/** Kadane: the best subarray ending at i either extends the one ending at i − 1 or starts fresh. */
export function kadane(nums: number[]): { frames: Frame[]; best: number; range: [number, number] } {
  const frames: Frame[] = [];
  let current = nums[0];
  let start = 0;
  let best = nums[0];
  let bestRange: [number, number] = [0, 0];
  const view = (note: string, i: number, extra: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'nums (bracket: best subarray ending here)',
        items: nums,
        window: [start, i],
        tones: { ...Object.fromEntries(Array.from({ length: bestRange[1] - bestRange[0] + 1 }, (_, k) => [bestRange[0] + k, 'match' as Tone])), ...extra },
        pointers: [{ name: 'i', at: i }],
      },
      { kind: 'vars', items: [['ending here', current], ['best so far', best]], tones: { 1: 'match' } },
    ],
  });
  frames.push(view(`Start with the first value: the best subarray ending at index 0 is just ${nums[0]}. Green marks the best subarray found so far.`, 0));
  for (let i = 1; i < nums.length; i++) {
    const v = nums[i];
    const extend = current + v;
    if (v > extend) {
      current = v;
      start = i;
    } else {
      current = extend;
    }
    const improved = current > best;
    if (improved) {
      best = current;
      bestRange = [start, i];
    }
    frames.push(
      view(
        start === i
          ? `${v} on its own (${v}) beats extending (${extend}): the old run was a drag, so start fresh here.${improved ? ` New best: ${best}.` : ''}`
          : `Extending gives ${extend}, more than ${v} alone, so keep the run going.${improved ? ` New best: ${best}.` : ''}`,
        i,
        { [i]: 'active' },
      ),
    );
  }
  frames.push(view(`Done. The largest subarray sum is ${best}, from index ${bestRange[0]} to ${bestRange[1]}.`, nums.length - 1));
  return { frames, best, range: bestRange };
}
