// Walkthrough frames for chapter 30, produced by running each algorithm for real.
import type { Frame, Tone } from '../viz/types';

/** Sliding Window Maximum: a deque of indices whose values fall from front to back. */
export function windowMax(nums: number[], k: number): { frames: Frame[]; result: number[] } {
  const deque: number[] = [];
  let head = 0; // deque[head..] is the live part, the way you would do it in TypeScript
  const result: number[] = [];
  const frames: Frame[] = [];
  const live = () => deque.slice(head);
  const picture = (i: number, note: string, tones: Partial<Record<number, Tone>> = {}): Frame => {
    const lo = Math.max(0, i - k + 1);
    return {
      note,
      parts: [
        {
          kind: 'array',
          label: `nums (window size ${k})`,
          items: nums,
          window: i >= 0 ? [lo, i] : undefined,
          tones: { ...Object.fromEntries(live().map((d) => [d, 'warn' as Tone])), ...tones },
          pointers: i >= 0 ? [{ name: 'i', at: i }] : [],
        },
        { kind: 'queue', label: 'deque (index: value), front = window max', items: live().map((d) => `${d}: ${nums[d]}`), tones: live().length ? { 0: 'match' } : {} },
        { kind: 'array', label: 'maximums', items: result, indices: false },
      ],
    };
  };
  frames.push(picture(-1, 'The deque keeps candidate indices whose values decrease from front to back. The front is always the maximum of the current window.'));
  for (let i = 0; i < nums.length; i++) {
    let expired = false;
    if (head < deque.length && deque[head] <= i - k) {
      head++;
      expired = true;
    }
    const dropped: number[] = [];
    while (head < deque.length && nums[deque[deque.length - 1]] <= nums[i]) dropped.push(deque.pop()!);
    const wasEmpty = head >= deque.length;
    deque.push(i);
    const parts: string[] = [];
    if (expired) parts.push('The front index slid out of the window, so it leaves from the front.');
    if (dropped.length) parts.push(`${nums[i]} is at least as big as ${dropped.map((d) => nums[d]).join(', ')} at the back. Those can never be a maximum again while ${nums[i]} is in the window (it is bigger and stays longer), so they leave from the back.`);
    else if (wasEmpty) parts.push(`The deque is empty, so ${nums[i]} joins as the only candidate.`);
    else parts.push(`${nums[i]} is smaller than the value at the back, so it joins as a candidate for later windows.`);
    if (i >= k - 1) {
      result.push(nums[deque[head]]);
      parts.push(`The window is full: its maximum is the front, ${nums[deque[head]]}.`);
    }
    frames.push(picture(i, parts.join(' '), { [i]: 'active' }));
  }
  frames.push(picture(nums.length - 1, `Each index entered and left the deque at most once, so the whole scan is O(n). Maximums: ${result.join(', ')}.`));
  return { frames, result };
}

/** Shortest Subarray with Sum at Least K: prefix sums plus an increasing deque of start candidates. */
export function shortestAtLeastK(nums: number[], k: number): { frames: Frame[]; best: number } {
  const prefix = [0];
  for (const x of nums) prefix.push(prefix[prefix.length - 1] + x);
  const deque: number[] = [];
  let head = 0;
  let best = Infinity;
  const frames: Frame[] = [];
  const live = () => deque.slice(head);
  const picture = (j: number, note: string, tones: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums', items: nums },
      {
        kind: 'array',
        label: 'prefix (P[j] = sum of the first j values)',
        items: prefix,
        tones: { ...Object.fromEntries(live().map((d) => [d, 'warn' as Tone])), ...tones },
        pointers: j >= 0 ? [{ name: 'j', at: j }] : [],
      },
      { kind: 'queue', label: 'deque of start indices (prefix rising)', items: live().map((d) => `${d}: ${prefix[d]}`) },
      { kind: 'vars', items: [['k', k], ['shortest', best === Infinity ? '∞' : best]] },
    ],
  });
  frames.push(picture(-1, `A subarray from i to j − 1 has sum P[j] − P[i]. We want the smallest j − i with P[j] − P[i] ≥ ${k}. Negative numbers rule out a plain sliding window, so keep a deque of good start indices instead.`));
  for (let j = 0; j < prefix.length; j++) {
    const used: number[] = [];
    while (head < deque.length && prefix[j] - prefix[deque[head]] >= k) {
      const i = deque[head++];
      used.push(i);
      best = Math.min(best, j - i);
    }
    const dropped: number[] = [];
    while (head < deque.length && prefix[deque[deque.length - 1]] >= prefix[j]) dropped.push(deque.pop()!);
    deque.push(j);
    const parts: string[] = [];
    if (used.length)
      parts.push(
        `P[${j}] − P[${used[used.length - 1]}] = ${prefix[j] - prefix[used[used.length - 1]]} reaches ${k}: length ${j - used[used.length - 1]}. A later end could only be longer for these starts, so they leave the front.`,
      );
    if (dropped.length)
      parts.push(`P[${j}] = ${prefix[j]} is no bigger than ${dropped.map((d) => `P[${d}]`).join(', ')}. Starting at ${j} is shorter and gives at least as large a sum, so those starts are useless: drop them from the back.`);
    if (!used.length && !dropped.length) parts.push(`Nothing reaches ${k} yet. Start index ${j} joins the back.`);
    else parts.push(`Push start index ${j}.`);
    frames.push(picture(j, parts.join(' '), { [j]: 'active' }));
  }
  const answer = best === Infinity ? -1 : best;
  frames.push(picture(prefix.length - 1, `Done in O(n): each index enters and leaves the deque once. Shortest length: ${answer}.`));
  return { frames, best: answer };
}

/** Jump Game VI: dp[i] = nums[i] + max of the previous k dp values, kept in a decreasing deque. */
export function jumpGame(nums: number[], k: number): { frames: Frame[]; score: number } {
  const dp: (number | null)[] = nums.map(() => null);
  const deque: number[] = [];
  let head = 0;
  const frames: Frame[] = [];
  const live = () => deque.slice(head);
  const picture = (i: number, note: string): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums', items: nums, window: i > 0 ? [Math.max(0, i - k), i - 1] : undefined, pointers: [{ name: 'i', at: i }] },
      { kind: 'array', label: 'dp (best score to land here)', items: dp, tones: { ...Object.fromEntries(live().map((d) => [d, 'warn' as Tone])), [i]: 'match' } },
      { kind: 'queue', label: 'deque (index: dp), best first', items: live().map((d) => `${d}: ${dp[d]}`) },
    ],
  });
  dp[0] = nums[0];
  deque.push(0);
  frames.push(picture(0, `You must land on index 0, so dp[0] = ${nums[0]}. You can reach index i from any of the ${k} indices before it, so dp[i] = nums[i] + the largest dp among them: a sliding window maximum over dp.`));
  for (let i = 1; i < nums.length; i++) {
    if (deque[head] < i - k) head++;
    const from = deque[head];
    dp[i] = nums[i] + dp[from]!;
    while (head < deque.length && dp[deque[deque.length - 1]]! <= dp[i]!) deque.pop();
    deque.push(i);
    frames.push(picture(i, `The best index in the window is ${from} (dp ${dp[from]}), so dp[${i}] = ${nums[i]} + ${dp[from]} = ${dp[i]}. Then dp[${i}] enters the deque, removing smaller dp values behind it.`));
  }
  const score = dp[nums.length - 1]!;
  frames.push(picture(nums.length - 1, `The answer is dp at the last index: ${score}. The deque made each step O(1) on average, so the DP is O(n) instead of O(n·k).`));
  return { frames, score };
}
