// Walkthrough frames for chapter 73, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Build Pascal's triangle row by row: every inner entry is the sum of the two above it. */
export function pascal(rows: number): { frames: Frame[]; triangle: number[][] } {
  const frames: Frame[] = [];
  const tri: number[][] = [];
  const grid = (activeR: number, activeC: number): Frame['parts'][number] => {
    const tones: Partial<Record<string, Tone>> = {};
    if (activeR >= 0) {
      tones[`${activeR},${activeC}`] = 'active';
      if (activeR > 0 && activeC > 0 && activeC < activeR) {
        tones[`${activeR - 1},${activeC - 1}`] = 'info';
        tones[`${activeR - 1},${activeC}`] = 'info';
      }
    }
    return {
      kind: 'grid',
      label: 'row n, column k holds C(n, k)',
      rowHeaders: tri.map((_, r) => `n=${r}`),
      colHeaders: Array.from({ length: rows }, (_, c) => `k=${c}`),
      cells: tri.map((row) => Array.from({ length: rows }, (_, c): Cell => (c < row.length ? row[c] : null))),
      tones,
    };
  };
  for (let r = 0; r < rows; r++) {
    tri.push([]);
    for (let c = 0; c <= r; c++) {
      const v = c === 0 || c === r ? 1 : tri[r - 1][c - 1] + tri[r - 1][c];
      tri[r].push(v);
      if (c === 0 && r > 0) continue; // the left end gets no frame of its own; the right end covers both
      frames.push({
        note:
          c === 0 || c === r
            ? `Row ${r}: the ends are always 1 (one way to choose nothing, one way to choose everything).`
            : `C(${r}, ${c}) = C(${r - 1}, ${c - 1}) + C(${r - 1}, ${c}) = ${tri[r - 1][c - 1]} + ${tri[r - 1][c]} = ${v}: either item ${r} is chosen (pick ${c - 1} more from the first ${r - 1}) or it is not (pick all ${c} from the first ${r - 1}).`,
        parts: [grid(r, c)],
      });
    }
  }
  frames.push({
    note: `Each row sums to a power of 2: row ${rows - 1} sums to ${2 ** (rows - 1)}, the number of subsets of ${rows - 1} items.`,
    parts: [grid(-1, -1)],
  });
  return { frames, triangle: tri };
}

/** Find the k-th permutation (1-based) of 1..n directly, one position at a time, using blocks of (n − 1)! permutations. */
export function kthPermutation(n: number, k: number): { frames: Frame[]; result: string } {
  const frames: Frame[] = [];
  const fact = [1];
  for (let i = 1; i <= n; i++) fact.push(fact[i - 1] * i);
  const left = Array.from({ length: n }, (_, i) => i + 1);
  const chosen: number[] = [];
  let rank = k - 1;
  const view = (note: string, pick?: number): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'digits still available', items: [...left], tones: pick !== undefined ? { [pick]: 'match' } : {} },
      { kind: 'array', label: 'answer so far', items: chosen.length ? [...chosen] : [null], indices: false },
      { kind: 'vars', items: [['remaining rank (0-based)', rank]] },
    ],
  });
  frames.push(
    view(`There are ${n}! = ${fact[n]} permutations in order. Count from 0: we want number ${k - 1}. Each choice of first digit owns a block of ${n - 1}! = ${fact[n - 1]} permutations.`),
  );
  for (let size = n; size >= 1; size--) {
    const block = fact[size - 1];
    const idx = Math.floor(rank / block);
    const digit = left[idx];
    frames.push(
      view(
        size > 1
          ? `Blocks of ${block}: rank ${rank} falls in block ${idx} (skipping ${idx} × ${block} = ${idx * block}), so the next digit is the available digit at index ${idx}, which is ${digit}.`
          : `One digit left: ${digit}.`,
        idx,
      ),
    );
    chosen.push(digit);
    left.splice(idx, 1);
    rank -= idx * block;
  }
  const result = chosen.join('');
  frames.push(view(`Done in ${n} steps, without listing a single other permutation: permutation number ${k} is ${result}.`));
  return { frames, result };
}
