// Walkthrough frames for chapter 75, produced by running each algorithm for real.
import type { Frame, Tone } from '../viz/types';

const round = (x: number, d = 4) => Number(x.toFixed(d));

/** Knight probability: spread the probability mass one move at a time, each of 8 moves with weight 1/8. */
export function knightProbability(n: number, k: number, row: number, col: number): { frames: Frame[]; result: number } {
  const moves = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
  let p = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  p[row][col] = 1;
  const frames: Frame[] = [];
  const total = () => p.flat().reduce((a, b) => a + b, 0);
  const view = (step: number, note: string): Frame => {
    const tones: Partial<Record<string, Tone>> = {};
    p.forEach((r, i) => r.forEach((v, j) => {
      if (v > 0) tones[`${i},${j}`] = 'active';
    }));
    return {
      note,
      parts: [
        {
          kind: 'grid',
          label: `probability of being on each cell after ${step} move${step === 1 ? '' : 's'}`,
          cells: p.map((r) => r.map((v) => (v > 0 ? round(v) : null))),
          rowHeaders: p.map((_, i) => String(i)),
          colHeaders: p.map((_, j) => String(j)),
          tones,
        },
        { kind: 'vars', items: [['still on the board', round(total())]], tones: { 0: 'match' } },
      ],
    };
  };
  frames.push(view(0, `The knight starts on (${row}, ${col}) with probability 1. Each move, every cell sends 1/8 of its probability along each of the 8 knight moves.`));
  for (let s = 1; s <= k; s++) {
    const next = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    let lost = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (p[i][j] === 0) continue;
        for (const [a, b] of moves) {
          const x = i + a;
          const y = j + b;
          if (x >= 0 && y >= 0 && x < n && y < n) next[x][y] += p[i][j] / 8;
          else lost += p[i][j] / 8;
        }
      }
    }
    p = next;
    frames.push(
      view(
        s,
        `After move ${s}: ${round(lost)} of the probability fell off the board this move and is gone for good. What remains on the board, ${round(total())}, is the chance the knight is still on it.`,
      ),
    );
  }
  const result = total();
  frames.push(view(k, `Add up the grid after ${k} moves: the knight stays on the board with probability ${round(result, 5)}. Each step costs O(n² × 8), so the whole DP is O(k × n²).`));
  return { frames, result };
}

/** New 21 Game: dp[i] = probability of ever holding exactly i points, using a sliding window sum of the last maxPts values. */
export function new21(n: number, k: number, maxPts: number): { frames: Frame[]; result: number } {
  const dp = new Array<number>(n + 1).fill(0);
  dp[0] = 1;
  const frames: Frame[] = [];
  let window = k > 0 ? 1 : 0;
  let result = k === 0 ? 1 : 0;
  let windowUsed = window;
  const view = (i: number, note: string, lo: number, hi: number): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'dp[i] = probability that the total is ever exactly i',
        items: dp.map((v, j) => (j <= i ? round(v, 3) : null)),
        window: lo <= hi ? [lo, hi] : undefined,
        tones: Object.fromEntries(
          dp.map((_, j): [number, Tone | undefined] => [j, j === i ? 'active' : j >= k && j <= i ? 'match' : undefined]).filter(([, t]) => t),
        ),
      },
      { kind: 'vars', items: [['window sum used', round(windowUsed, 3)], ['P(stop with ≤ n) so far', round(result, 3)]] },
    ],
  });
  frames.push(view(0, `Start at 0 points with probability 1. Alice keeps drawing (1 to ${maxPts} points, equally likely) while she has fewer than ${k} points.`, 0, 0));
  for (let i = 1; i <= n; i++) {
    dp[i] = window / maxPts;
    windowUsed = window;
    if (i >= k) result += dp[i];
    const lo = Math.max(0, i - maxPts);
    const hi = Math.min(i - 1, k - 1);
    frames.push(
      view(
        i,
        `To land on ${i}, the previous total was one of ${lo}…${hi} (still drawing) and the draw was exactly right: dp[${i}] = window sum / ${maxPts} = ${round(dp[i], 3)}.${i >= k ? ` ${i} ≥ ${k}, so she stops here; ${i} ≤ ${n} counts towards the answer.` : ''}`,
        lo,
        hi,
      ),
    );
    if (i < k) window += dp[i];
    if (i - maxPts >= 0 && i - maxPts < k) window -= dp[i - maxPts];
  }
  frames.push(view(n, `Totals from ${k} to ${n} are where she stops without going over, so the answer is their sum: ${round(result, 5)}. The window made each step O(1), so the DP is O(n).`, 1, 0));
  return { frames, result };
}
