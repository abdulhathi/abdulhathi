// Walkthrough frames for chapter 07, produced by running each algorithm for real.
import type { Frame, Tone } from '../viz/types';

/** Kadane's algorithm: the best subarray ending here either extends the previous one or starts fresh. */
export function kadane(nums: number[]): { frames: Frame[]; best: number; range: [number, number] } {
  const frames: Frame[] = [];
  let cur = 0;
  let start = 0;
  let best = -Infinity;
  let range: [number, number] = [0, 0];
  nums.forEach((v, i) => {
    const restart = cur + v < v;
    if (restart) {
      cur = v;
      start = i;
    } else cur += v;
    const improved = cur > best;
    if (improved) {
      best = cur;
      range = [start, i];
    }
    const tones: Partial<Record<number, Tone>> = {};
    for (let k = range[0]; k <= range[1]; k++) tones[k] = 'match';
    tones[i] = 'active';
    frames.push({
      note: i === 0
        ? `Start with the first value: the best run ending at index 0 is just ${v}.`
        : restart
        ? `The run so far summed to less than 0, so it can only drag ${v} down. Start a new run at index ${i}: current = ${cur}.${improved ? ' New best.' : ''}`
        : `Extend the run with ${v}: current = ${cur}.${improved ? ' That beats the best so far.' : ` Best stays ${best}.`}`,
      parts: [
        { kind: 'array', label: 'nums', items: nums, window: [start, i], tones, pointers: [{ name: 'i', at: i }] },
        { kind: 'vars', items: [['current run', cur], ['best', best], ['best range', `${range[0]}..${range[1]}`]], tones: improved ? { 1: 'match' } : {} },
      ],
    });
  });
  frames.push({
    note: `One pass, O(n) time, O(1) space. The largest sum is ${best}, from index ${range[0]} to ${range[1]}.`,
    parts: [
      { kind: 'array', label: 'nums', items: nums, window: range, tones: Object.fromEntries(nums.map((_, k) => [k, (k >= range[0] && k <= range[1] ? 'match' : 'dim') as Tone])) },
      { kind: 'vars', items: [['best', best]], tones: { 0: 'match' } },
    ],
  });
  return { frames, best, range };
}

/** Rotate right by k with three reversals: the whole array, then the first k, then the rest. */
export function rotateByReversal(input: number[], k: number): { frames: Frame[]; result: number[] } {
  const nums = [...input];
  const n = nums.length;
  const shift = k % n;
  const frames: Frame[] = [];
  const view = (note: string, seg: [number, number] | undefined, l?: number, r?: number): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'nums',
        items: [...nums],
        window: seg,
        tones: l !== undefined && r !== undefined ? { [l]: 'warn', [r]: 'warn' } : {},
        pointers: l !== undefined && r !== undefined && l !== r ? [{ name: 'L', at: l }, { name: 'R', at: r, tone: 'info' }] : [],
      },
      { kind: 'vars', items: [['k', k], ['k mod n', shift]] },
    ],
  });
  const reverse = (a: number, b: number, phase: string) => {
    frames.push(view(`${phase}: reverse indices ${a} to ${b}.`, [a, b]));
    let l = a;
    let r = b;
    while (l < r) {
      [nums[l], nums[r]] = [nums[r], nums[l]];
      frames.push(view(`Swap the two ends of the segment: ${nums[r]} and ${nums[l]} trade places.`, [a, b], l, r));
      l++;
      r--;
    }
  };
  frames.push(view(`Rotating right by ${k} moves the last ${shift} values to the front. Doing it one step at a time would cost O(n·k).`, undefined));
  reverse(0, n - 1, 'Step 1');
  if (shift > 0) reverse(0, shift - 1, 'Step 2');
  if (shift < n) reverse(shift, n - 1, 'Step 3');
  frames.push(view(`Done in O(n) time and O(1) extra space: every value moved exactly where it belongs.`, undefined));
  return { frames, result: nums };
}

/** Boyer–Moore majority vote: a candidate and a counter; different values cancel each other out. */
export function majorityVote(nums: number[]): { frames: Frame[]; candidate: number } {
  const frames: Frame[] = [];
  let cand = nums[0];
  let count = 0;
  nums.forEach((v, i) => {
    let note: string;
    let tone: Tone;
    if (count === 0) {
      cand = v;
      count = 1;
      note = `The counter is 0, so nothing is in the lead. ${v} becomes the candidate with count 1.`;
      tone = 'info';
    } else if (v === cand) {
      count++;
      note = `${v} matches the candidate: count goes up to ${count}.`;
      tone = 'match';
    } else {
      count--;
      note = `${v} differs from the candidate ${cand}: they cancel each other, count drops to ${count}.`;
      tone = 'bad';
    }
    frames.push({
      note,
      parts: [
        { kind: 'array', label: 'nums', items: nums, tones: { [i]: tone }, pointers: [{ name: 'i', at: i }] },
        { kind: 'vars', items: [['candidate', cand], ['count', count]], tones: { 1: tone } },
      ],
    });
  });
  frames.push({
    note: `The majority value appears more than half the time, so it cannot be cancelled out completely. The candidate left standing, ${cand}, is the answer.`,
    parts: [
      { kind: 'array', label: 'nums', items: nums, tones: Object.fromEntries(nums.map((v, i) => [i, (v === cand ? 'match' : 'dim') as Tone])) },
      { kind: 'vars', items: [['candidate', cand], ['count', count]], tones: { 0: 'match' } },
    ],
  });
  return { frames, candidate: cand };
}

/** Cyclic sort for First Missing Positive: put each value v in 1..n at index v − 1, then scan. */
export function cyclicSort(input: number[]): { frames: Frame[]; missing: number } {
  const nums = [...input];
  const n = nums.length;
  const frames: Frame[] = [];
  const settled = () =>
    Object.fromEntries(nums.map((v, k) => [k, v === k + 1 ? 'match' : undefined]).filter(([, t]) => t)) as Partial<Record<number, Tone>>;
  frames.push({
    note: `The answer is at most ${n + 1}, so only values 1 to ${n} matter. Use the array itself as the table: value v belongs at index v − 1.`,
    parts: [{ kind: 'array', label: 'nums', items: [...nums], tones: settled() }],
  });
  for (let i = 0; i < n; i++) {
    while (nums[i] > 0 && nums[i] <= n && nums[nums[i] - 1] !== nums[i]) {
      const v = nums[i];
      const j = v - 1;
      [nums[i], nums[j]] = [nums[j], nums[i]];
      frames.push({
        note: `${v} belongs at index ${j}. Swap it there. Index ${i} now holds ${nums[i]}, which still has to be checked.`,
        parts: [{ kind: 'array', label: 'nums', items: [...nums], tones: { ...settled(), [i]: 'active' }, pointers: [{ name: 'i', at: i }] }],
      });
    }
    const v = nums[i];
    if (!(v === i + 1)) {
      frames.push({
        note:
          v <= 0 || v > n
            ? `${v} is outside 1..${n}, so it can never be the answer. Leave it and move on.`
            : `${v} already has a copy in its home at index ${v - 1}. Leave this duplicate and move on.`,
        parts: [{ kind: 'array', label: 'nums', items: [...nums], tones: { ...settled(), [i]: 'dim' }, pointers: [{ name: 'i', at: i }] }],
      });
    }
  }
  let missing = n + 1;
  for (let i = 0; i < n; i++) {
    if (nums[i] !== i + 1) {
      missing = i + 1;
      break;
    }
  }
  frames.push({
    note: missing <= n ? `Scan from the left: index ${missing - 1} does not hold ${missing}, so ${missing} is the smallest missing positive.` : `Every index i holds i + 1, so the answer is ${n + 1}.`,
    parts: [{ kind: 'array', label: 'nums', items: [...nums], tones: { ...settled(), ...(missing <= n ? { [missing - 1]: 'bad' } : {}) } }],
  });
  return { frames, missing };
}
