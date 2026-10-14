// Walkthrough frames for the DP optimisations chapter, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Jump Game VI: dp[i] = nums[i] + max of the last k dp values, kept in a monotonic deque. */
export function jumpGameDeque(nums: number[], k: number): { frames: Frame[]; answer: number; dp: number[] } {
  const n = nums.length;
  const dp: Cell[] = Array(n).fill(null);
  const deque: number[] = [];
  const frames: Frame[] = [];
  const view = (i: number, note: string, tones: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums', items: nums, pointers: i < n ? [{ name: 'i', at: i }] : [], window: i > 0 && i < n ? [Math.max(0, i - k), i - 1] : undefined },
      { kind: 'array', label: 'dp: best score on arriving at each index', items: [...dp], tones },
      { kind: 'queue', label: 'deque of indices (dp values decreasing from the front)', items: deque.map((d) => `${d}: ${dp[d]}`), tones: deque.length ? { 0: 'match' } : {} },
    ],
  });
  dp[0] = nums[0];
  deque.push(0);
  frames.push(view(0, `dp[i] = nums[i] + the best dp among the previous ${k} indices. Scanning all k each time is O(n·k). Instead keep a deque whose front is always the best index in the window.`, { 0: 'match' }));
  for (let i = 1; i < n; i++) {
    const dropped: number[] = [];
    while (deque.length && deque[0] < i - k) dropped.push(deque.shift()!);
    const from = deque[0];
    dp[i] = nums[i] + (dp[from] as number);
    const popped: number[] = [];
    while (deque.length && (dp[deque[deque.length - 1]] as number) <= (dp[i] as number)) popped.push(deque.pop()!);
    deque.push(i);
    frames.push(
      view(
        i,
        `${dropped.length ? `Index ${dropped.join(', ')} left the window, drop it from the front. ` : ''}The front, index ${from}, holds the best reachable score ${dp[from]}, so dp[${i}] = ${nums[i]} + ${dp[from]} = ${dp[i]}. ${
          popped.length ? `Pop ${popped.join(', ')} from the back: dp[${i}] is at least as good and stays longer, so they can never be the best again. ` : ''
        }Push ${i}.`,
        { [i]: 'active', [from]: 'match' },
      ),
    );
  }
  frames.push(view(n, `The answer is dp[${n - 1}] = ${dp[n - 1]}. Every index enters and leaves the deque once: O(n) in total.`, { [n - 1]: 'match' }));
  return { frames, answer: dp[n - 1] as number, dp: dp as number[] };
}

/** Weighted job scheduling: sort by end time, and binary search for the last job that ends before each start. */
export function jobScheduling(start: number[], end: number[], profit: number[]): { frames: Frame[]; answer: number } {
  const jobs = start.map((s, i) => ({ s, e: end[i], p: profit[i] })).sort((a, b) => a.e - b.e);
  const n = jobs.length;
  const dp: Cell[] = [0, ...Array(n).fill(null)]; // dp[i] = best using the first i jobs (by end time)
  const frames: Frame[] = [];
  const view = (i: number, compat: number, note: string, take?: boolean): Frame => ({
    note,
    parts: [
      {
        kind: 'intervals',
        label: 'jobs sorted by end time (label = profit)',
        items: jobs.map((j, k) => ({
          start: j.s,
          end: j.e,
          label: `job ${k + 1}: ${j.p}`,
          tone: k === i - 1 ? 'active' : k < compat ? 'info' : k < i - 1 ? 'done' : 'dim',
        })),
      },
      {
        kind: 'array',
        label: 'dp[i]: best profit using the first i jobs',
        items: [...dp],
        tones: i > 0 ? { [i]: take === undefined ? 'active' : 'match', ...(compat >= 0 ? { [compat]: 'info' as Tone } : {}) } : {},
      },
    ],
  });
  frames.push(view(0, -1, 'Sort the jobs by end time. dp[i] is the best profit using only the first i jobs, and dp[0] = 0.'));
  for (let i = 1; i <= n; i++) {
    const job = jobs[i - 1];
    // Binary search: how many jobs end at or before this job starts.
    let lo = 0;
    let hi = i - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (jobs[mid - 1].e <= job.s) lo = mid;
      else hi = mid - 1;
    }
    const compat = lo;
    const skip = dp[i - 1] as number;
    const take = job.p + (dp[compat] as number);
    dp[i] = Math.max(skip, take);
    frames.push(
      view(
        i,
        compat,
        `Job ${i} runs ${job.s}–${job.e} for ${job.p}. Binary search finds that the first ${compat} job${compat === 1 ? '' : 's'} end by time ${job.s}. Take it: ${job.p} + dp[${compat}] = ${take}. Skip it: dp[${i - 1}] = ${skip}. dp[${i}] = ${dp[i]}.`,
        take >= skip,
      ),
    );
  }
  frames.push(view(n, -1, `The answer is dp[${n}] = ${dp[n]}. Sorting plus one binary search per job: O(n log n) instead of checking every earlier job.`, true));
  return { frames, answer: dp[n] as number };
}
