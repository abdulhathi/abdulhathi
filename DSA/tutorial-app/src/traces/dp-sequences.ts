// Walkthrough frames for chapter 54 (Sequence and string DP), produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

const key = (r: number, c: number) => `${r},${c}`;

/** Patience sorting: tails[k] = smallest last value of an increasing subsequence of length k + 1. */
export function lisPatience(nums: number[]): { frames: Frame[]; length: number } {
  const tails: number[] = [];
  const frames: Frame[] = [];
  const view = (note: string, i: number | null, slot: number | null, slotTone: Tone = 'active'): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums', items: nums, tones: i === null ? {} : { [i]: 'active' }, pointers: i === null ? [] : [{ name: 'x', at: i }] },
      { kind: 'array', label: 'tails[k]: smallest possible end of an increasing subsequence of length k + 1', items: tails.length ? [...tails] : [null], tones: slot === null ? {} : { [slot]: slotTone } },
      { kind: 'vars', items: [['longest so far', tails.length]] },
    ],
  });
  frames.push(view('tails starts empty. For each value, binary search tails for the first entry ≥ the value.', null, null));
  nums.forEach((x, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    if (lo === tails.length) {
      tails.push(x);
      frames.push(view(`${x} is larger than every tail, so it extends the longest subsequence: append it. Length ${tails.length}.`, i, lo, 'match'));
    } else {
      const old = tails[lo];
      tails[lo] = x;
      frames.push(
        view(
          old === x
            ? `${x} equals tails[${lo}]. A strictly increasing subsequence cannot repeat it, so nothing improves.`
            : `${x} replaces ${old} at tails[${lo}]: a subsequence of length ${lo + 1} can now end with the smaller ${x}, which leaves more room to grow.`,
          i,
          lo,
          'warn',
        ),
      );
    }
  });
  frames.push(view(`Done. The longest increasing subsequence has length ${tails.length}. (tails itself need not be a real subsequence; only its length counts.)`, null, null));
  return { frames, length: tails.length };
}

/** LCS table: match → diagonal + 1, otherwise the better of up and left. Ends with the traceback. */
export function lcsTable(a: string, b: string): { frames: Frame[]; length: number; lcs: string } {
  const n = a.length;
  const m = b.length;
  const t: Cell[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : null)));
  const frames: Frame[] = [];
  const rowHeaders = ['', ...a.split('')];
  const colHeaders = ['', ...b.split('')];
  const view = (note: string, tones: Partial<Record<string, Tone>> = {}): Frame => ({
    note,
    parts: [{ kind: 'grid', label: `lcs[i][j] for "${a}" (rows) and "${b}" (columns)`, cells: t.map((row) => [...row]), rowHeaders, colHeaders, tones }],
  });
  frames.push(view('Row 0 and column 0 stand for empty prefixes: their LCS is 0. Each other cell compares the last characters of its two prefixes.'));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const up = t[i - 1][j] as number;
      const left = t[i][j - 1] as number;
      if (a[i - 1] === b[j - 1]) {
        t[i][j] = (t[i - 1][j - 1] as number) + 1;
        frames.push(view(`"${a[i - 1]}" = "${b[j - 1]}": they can end the common subsequence. Diagonal ${t[i - 1][j - 1]} + 1 = ${t[i][j]}.`, { [key(i, j)]: 'match', [key(i - 1, j - 1)]: 'info' }));
      } else {
        t[i][j] = Math.max(up, left);
        frames.push(view(`"${a[i - 1]}" ≠ "${b[j - 1]}": one of them is unused. Best of up (${up}) and left (${left}) = ${t[i][j]}.`, { [key(i, j)]: 'active', [key(i - 1, j)]: 'info', [key(i, j - 1)]: 'info' }));
      }
    }
  }
  // Trace back from the bottom-right corner to read one longest common subsequence.
  const path: Partial<Record<string, Tone>> = {};
  const chars: string[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      path[key(i, j)] = 'match';
      chars.push(a[i - 1]);
      i--;
      j--;
    } else if ((t[i - 1][j] as number) >= (t[i][j - 1] as number)) {
      path[key(i, j)] = 'info';
      i--;
    } else {
      path[key(i, j)] = 'info';
      j--;
    }
  }
  const lcs = chars.reverse().join('');
  frames.push(view(`The answer is the corner: ${t[n][m]}. Walking back (diagonal on a match, otherwise towards the larger neighbour) spells one LCS: "${lcs}".`, path));
  return { frames, length: t[n][m] as number, lcs };
}

/** Edit distance: match → diagonal; otherwise 1 + min(replace, delete, insert). */
export function editDistance(a: string, b: string): { frames: Frame[]; distance: number } {
  const n = a.length;
  const m = b.length;
  const t: Cell[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : null)));
  const frames: Frame[] = [];
  const view = (note: string, tones: Partial<Record<string, Tone>> = {}): Frame => ({
    note,
    parts: [{ kind: 'grid', label: `edit[i][j]: turn the first i letters of "${a}" into the first j of "${b}"`, cells: t.map((row) => [...row]), rowHeaders: ['', ...a.split('')], colHeaders: ['', ...b.split('')], tones }],
  });
  frames.push(view('Turning a prefix into the empty string takes one delete per letter (column 0); building a prefix from nothing takes one insert per letter (row 0).'));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = t[i - 1][j - 1] as number;
      const up = t[i - 1][j] as number;
      const left = t[i][j - 1] as number;
      if (a[i - 1] === b[j - 1]) {
        t[i][j] = diag;
        frames.push(view(`"${a[i - 1]}" = "${b[j - 1]}": no operation needed for these letters. Copy the diagonal: ${diag}.`, { [key(i, j)]: 'match', [key(i - 1, j - 1)]: 'info' }));
      } else {
        const best = Math.min(diag, up, left);
        t[i][j] = 1 + best;
        const how = best === diag ? `replace "${a[i - 1]}" with "${b[j - 1]}"` : best === up ? `delete "${a[i - 1]}"` : `insert "${b[j - 1]}"`;
        frames.push(
          view(`"${a[i - 1]}" ≠ "${b[j - 1]}": replace (diagonal ${diag}), delete (up ${up}) or insert (left ${left}). Cheapest: ${how}, so 1 + ${best} = ${t[i][j]}.`, {
            [key(i, j)]: 'active',
            [key(i - 1, j - 1)]: best === diag ? 'match' : 'dim',
            [key(i - 1, j)]: best === up && best !== diag ? 'match' : 'dim',
            [key(i, j - 1)]: best === left && best !== diag && best !== up ? 'match' : 'dim',
          }),
        );
      }
    }
  }
  frames.push(view(`Turning "${a}" into "${b}" takes ${t[n][m]} operation${t[n][m] === 1 ? '' : 's'}.`, { [key(n, m)]: 'match' }));
  return { frames, distance: t[n][m] as number };
}
