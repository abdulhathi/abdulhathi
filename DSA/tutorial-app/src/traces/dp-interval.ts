// Walkthrough frames for the interval DP chapter, produced by running each algorithm for real.
import type { Cell, Frame, GridViz, Tone } from '../viz/types';

/** Longest palindromic subsequence: fill dp[i][j] one diagonal (one length) at a time. */
export function longestPalSubseq(s: string): { frames: Frame[]; answer: number; table: number[][] } {
  const n = s.length;
  const dp: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const frames: Frame[] = [];
  const chars = s.split('');
  const view = (filledUpTo: number, focusLen: number, label = 'dp[i][j] = longest palindromic subsequence of s[i..j]'): GridViz => {
    const cells: Cell[][] = dp.map((row, i) => row.map((v, j) => (j >= i && j - i + 1 <= filledUpTo ? v : null)));
    const tones: Partial<Record<string, Tone>> = {};
    for (let i = 0; i + focusLen - 1 < n; i++) {
      const j = i + focusLen - 1;
      if (focusLen > 0) tones[`${i},${j}`] = focusLen > 1 && s[i] === s[j] ? 'match' : 'active';
    }
    return { kind: 'grid', label, cells, rowHeaders: chars.map((c, i) => `${i} ${c}`), colHeaders: chars.map((c, j) => `${j} ${c}`), tones };
  };

  frames.push({
    note: `Row i is where the range starts, column j where it ends. Only cells with i ≤ j mean anything. We fill them by length, shortest first, because every cell depends only on shorter ranges.`,
    parts: [view(0, 0)],
  });
  for (let i = 0; i < n; i++) dp[i][i] = 1;
  frames.push({ note: 'Length 1: a single character is a palindrome of length 1. That fills the main diagonal.', parts: [view(1, 1)] });

  for (let len = 2; len <= n; len++) {
    const matched: string[] = [];
    for (let i = 0; i + len - 1 < n; i++) {
      const j = i + len - 1;
      if (s[i] === s[j]) {
        dp[i][j] = (len === 2 ? 0 : dp[i + 1][j - 1]) + 2;
        matched.push(`s[${i}] = s[${j}] = "${s[i]}" gives 2 + inside = ${dp[i][j]}`);
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j - 1]);
      }
    }
    frames.push({
      note:
        `Length ${len}: ` +
        (matched.length
          ? `${matched.join('; ')}. Every other cell takes the better of dropping the left end (the cell below) or the right end (the cell to the left).`
          : 'no range has equal end characters, so each cell takes the better of dropping the left end (below) or the right end (left).'),
      parts: [view(len, len)],
    });
  }
  const answer = n ? dp[0][n - 1] : 0;
  const final = view(n, 0);
  final.tones = { [`0,${n - 1}`]: 'match' };
  frames.push({ note: `The top-right cell covers the whole string: the longest palindromic subsequence has length ${answer}.`, parts: [final] });
  return { frames, answer, table: dp };
}

/** Burst Balloons: dp over open windows (i, j), choosing which balloon inside bursts last. */
export function burstBalloons(nums: number[]): { frames: Frame[]; answer: number; lastChoice: number } {
  const vals = [1, ...nums, 1];
  const m = vals.length;
  const dp: number[][] = Array.from({ length: m }, () => Array(m).fill(0));
  const best: number[][] = Array.from({ length: m }, () => Array(m).fill(-1));
  const frames: Frame[] = [];
  const view = (gapDone: number, focusGap: number): GridViz => ({
    kind: 'grid',
    label: 'dp[i][j] = most coins from bursting everything strictly between i and j',
    cells: dp.map((row, i) => row.map((v, j) => (j - i >= 2 && j - i <= gapDone ? v : null))),
    rowHeaders: vals.map((v, i) => `${i}: ${v}`),
    colHeaders: vals.map((v, j) => `${j}: ${v}`),
    tones: Object.fromEntries(
      Array.from({ length: Math.max(0, m - focusGap) }, (_, i) => [`${i},${i + focusGap}`, 'active' as Tone]).filter(() => focusGap >= 2),
    ),
  });
  frames.push({
    note: `Pad the row with a 1 at each end: [${vals.join(', ')}]. dp[i][j] is the best score for the balloons strictly between positions i and j, with i and j still standing.`,
    parts: [view(1, 0)],
  });
  for (let gap = 2; gap < m; gap++) {
    const notes: string[] = [];
    for (let i = 0; i + gap < m; i++) {
      const j = i + gap;
      for (let k = i + 1; k < j; k++) {
        const v = dp[i][k] + vals[i] * vals[k] * vals[j] + dp[k][j];
        if (v > dp[i][j]) {
          dp[i][j] = v;
          best[i][j] = k;
        }
      }
      const k = best[i][j];
      notes.push(`dp[${i}][${j}] = ${dp[i][j]} (last balloon ${vals[k]}: ${dp[i][k]} + ${vals[i]}·${vals[k]}·${vals[j]} + ${dp[k][j]})`);
    }
    frames.push({
      note:
        gap === 2
          ? `Windows holding one balloon: it must burst last, between its two neighbours. ${notes.join('; ')}.`
          : `Windows holding ${gap - 1} balloons: try each one as the LAST to burst. Its neighbours at that moment are i and j, and the two sides were solved earlier. ${notes.slice(0, 3).join('; ')}${notes.length > 3 ? '; …' : ''}.`,
      parts: [view(gap, gap)],
    });
  }
  const answer = dp[0][m - 1];
  const lastChoice = best[0][m - 1];
  const final = view(m - 1, 0);
  final.tones = { [`0,${m - 1}`]: 'match' };
  frames.push({
    note: `The full window (0, ${m - 1}) is the whole row: ${answer} coins, with balloon ${vals[lastChoice]} burst last. Choosing the last balloon, not the first, is what keeps the two sides independent.`,
    parts: [final],
  });
  return { frames, answer, lastChoice: lastChoice - 1 };
}
