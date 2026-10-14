// Walkthrough frames for the bitmask chapter, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

const bin = (mask: number, width: number) => mask.toString(2).padStart(width, '0');
const popcount = (m: number) => {
  let c = 0;
  for (let x = m; x; x &= x - 1) c++;
  return c;
};

/** Assignment by DP over subsets: dp[mask] = cheapest way to give the first popcount(mask) workers the jobs in mask. */
export function assignJobs(cost: number[][]): { frames: Frame[]; answer: number } {
  const n = cost.length;
  const full = (1 << n) - 1;
  const dp: number[] = Array(1 << n).fill(Infinity);
  dp[0] = 0;
  const frames: Frame[] = [];
  const masks = Array.from({ length: 1 << n }, (_, m) => m);
  const view = (focus: number, targets: number[], cells: [number, number][]): Frame['parts'] => [
    {
      kind: 'grid',
      label: 'cost[worker][job]',
      cells: cost.map((row) => row.map((v) => v as Cell)),
      rowHeaders: cost.map((_, w) => `worker ${w}`),
      colHeaders: cost[0].map((_, j) => `job ${j}`),
      tones: Object.fromEntries(cells.map(([w, j]) => [`${w},${j}`, 'active' as Tone])),
    },
    {
      kind: 'map',
      label: 'dp[mask]: jobs already taken (bit j = job j, read right to left)',
      keyTitle: 'mask',
      valueTitle: 'min cost',
      entries: masks.map((m) => [bin(m, n), dp[m]]),
      tones: Object.fromEntries([[focus, 'info' as Tone], ...targets.map((t) => [t, 'match' as Tone])].filter(([m]) => (m as number) >= 0)),
    },
  ];
  frames.push({
    note: `${n} workers, ${n} jobs, each worker gets one job. Instead of trying all ${[...Array(n)].reduce((f, _, i) => f * (i + 1), 1)} orders, keep one number per SET of used jobs. A mask's popcount tells you which worker is next.`,
    parts: view(0, [], []),
  });
  for (const mask of masks) {
    if (mask === full || dp[mask] === Infinity) continue;
    const w = popcount(mask);
    const targets: number[] = [];
    const cells: [number, number][] = [];
    const changes: string[] = [];
    for (let j = 0; j < n; j++) {
      if (mask & (1 << j)) continue;
      const next = mask | (1 << j);
      const v = dp[mask] + cost[w][j];
      cells.push([w, j]);
      if (v < dp[next]) {
        dp[next] = v;
        targets.push(next);
        changes.push(`${bin(next, n)} → ${v}`);
      }
    }
    frames.push({
      note: `From mask ${bin(mask, n)} (cost ${dp[mask]}), worker ${w} is next and tries every free job. ${changes.length ? `Improved: ${changes.join(', ')}.` : 'No improvement.'}`,
      parts: view(mask, targets, cells),
    });
  }
  frames.push({
    note: `The full mask ${bin(full, n)} holds the answer: ${dp[full]}. There are 2^${n} masks and each tries ${n} jobs, so the cost is O(2^n · n) instead of O(n!).`,
    parts: view(full, [], []),
  });
  return { frames, answer: dp[full] };
}

/** Meet in the middle: subset sums of each half, sorted, then two pointers for the sum closest to goal. */
export function closestSubsetSum(nums: number[], goal: number): { frames: Frame[]; best: number; diff: number } {
  const half = nums.length >> 1;
  const sums = (arr: number[]) => {
    const out: number[] = [];
    for (let m = 0; m < 1 << arr.length; m++) {
      let s = 0;
      for (let i = 0; i < arr.length; i++) if (m & (1 << i)) s += arr[i];
      out.push(s);
    }
    return out.sort((a, b) => a - b);
  };
  const A = sums(nums.slice(0, half));
  const B = sums(nums.slice(half));
  const frames: Frame[] = [];
  let i = 0;
  let j = B.length - 1;
  let best = A[0] + B[j];
  let diff = Math.abs(best - goal);
  const view = (note: string, tone: Tone = 'active'): Frame => ({
    note,
    parts: [
      { kind: 'array', label: `sums of left half [${nums.slice(0, half).join(', ')}], sorted`, items: A, pointers: i < A.length ? [{ name: 'i', at: i }] : [], tones: i < A.length ? { [i]: tone } : {} },
      { kind: 'array', label: `sums of right half [${nums.slice(half).join(', ')}], sorted`, items: B, pointers: j >= 0 ? [{ name: 'j', at: j, tone: 'info' }] : [], tones: j >= 0 ? { [j]: tone } : {} },
      { kind: 'vars', items: [['goal', goal], ['best sum', best], ['distance', diff]] },
    ],
  });
  frames.push(
    view(
      `${nums.length} numbers have 2^${nums.length} subsets: too many when n is 40. Split them in half: each half has only 2^${nums.length - half} subset sums. Any subset is one left sum plus one right sum.`,
      'info',
    ),
  );
  while (i < A.length && j >= 0) {
    const s = A[i] + B[j];
    if (Math.abs(s - goal) < diff) {
      diff = Math.abs(s - goal);
      best = s;
    }
    if (s === goal) {
      frames.push(view(`${A[i]} + ${B[j]} = ${s} hits the goal exactly. Distance 0: stop.`, 'match'));
      break;
    }
    if (s < goal) {
      frames.push(view(`${A[i]} + ${B[j]} = ${s} is below ${goal}. A bigger total needs a bigger left sum: move i right.`));
      i++;
    } else {
      frames.push(view(`${A[i]} + ${B[j]} = ${s} is above ${goal}. A smaller total needs a smaller right sum: move j left.`));
      j--;
    }
  }
  frames.push(view(`Done. The closest subset sum is ${best}, at distance ${diff}. Cost: O(2^(n/2) · n) instead of O(2^n).`, 'match'));
  return { frames, best, diff };
}

/** Every submask of a mask, largest first, by the step "sub = (sub − 1) AND mask". */
export function submasks(mask: number, width: number): string[] {
  const out: string[] = [];
  for (let sub = mask; ; sub = (sub - 1) & mask) {
    out.push(bin(sub, width));
    if (sub === 0) break;
  }
  return out;
}
