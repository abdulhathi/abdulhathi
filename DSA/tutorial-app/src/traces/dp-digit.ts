// Walkthrough frames for the digit DP chapter, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Count positive numbers ≤ n that use only the given digits, by walking along n's digits. */
export function atMostNGivenDigitSet(digits: number[], n: number): { frames: Frame[]; answer: number } {
  const s = String(n).split('').map(Number);
  const L = s.length;
  const D = digits.length;
  const frames: Frame[] = [];
  let count = 0;
  const view = (pos: number, note: string, smaller: number[] = [], stopped = false): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: `n = ${n}`,
        items: s,
        tones: Object.fromEntries(s.map((_, i) => [i, (i < pos ? 'done' : i === pos ? (stopped ? 'bad' : 'active') : undefined) as Tone])),
        pointers: pos >= 0 && pos < L ? [{ name: 'pos', at: pos }] : [],
      },
      {
        kind: 'set',
        label: 'allowed digits',
        items: digits,
        tones: smaller.length ? Object.fromEntries(digits.map((d, i) => [i, (smaller.includes(d) ? 'match' : 'dim') as Tone])) : {},
      },
      { kind: 'vars', items: [['count', count]] },
    ],
  });
  frames.push(view(-1, `Count the numbers from 1 to ${n} written only with the digits {${digits.join(', ')}}. Two kinds: numbers with fewer digits than n, and numbers with exactly ${L} digits.`));
  let shorter = 0;
  for (let len = 1; len < L; len++) shorter += D ** len;
  count += shorter;
  frames.push(
    view(
      -1,
      `Fewer digits are always smaller than n, so every choice is free: ${Array.from({ length: L - 1 }, (_, i) => `${D}^${i + 1}`).join(' + ') || 'none'} = ${shorter}.`,
    ),
  );
  for (let pos = 0; pos < L; pos++) {
    const smaller = digits.filter((d) => d < s[pos]);
    const free = L - pos - 1;
    const add = smaller.length * D ** free;
    count += add;
    const canMatch = digits.includes(s[pos]);
    frames.push(
      view(
        pos,
        `Still tight: every digit so far equals n's. At position ${pos} n has ${s[pos]}. Choosing a smaller allowed digit (${smaller.join(', ') || 'none'}) frees the remaining ${free} position${free === 1 ? '' : 's'}: ${smaller.length} × ${D}^${free} = ${add}. ${
          canMatch ? `${s[pos]} is allowed, so stay tight and move on.` : `${s[pos]} is not allowed, so no number can stay tight past here: stop.`
        }`,
        smaller,
        !canMatch,
      ),
    );
    if (!canMatch) return finish(frames, view, count, n, L);
  }
  count += 1;
  frames.push(view(L, `We matched every digit of n, so n itself counts: +1.`));
  return finish(frames, view, count, n, L);
}

function finish(frames: Frame[], view: (pos: number, note: string) => Frame, count: number, n: number, L: number) {
  frames.push(view(L, `Total: ${count} numbers up to ${n}. The walk took one step per digit, so it costs O(digits × allowed digits), not O(n).`));
  return { frames, answer: count };
}

/** Count numbers in [0, n] whose digits add up to target: a table of free counts, then a tight walk. */
export function digitSumCount(n: number, target: number): { frames: Frame[]; answer: number } {
  const s = String(n).split('').map(Number);
  const L = s.length;
  // free[r][t] = ways to fill r free positions (each 0..9) with digit sum t.
  const free: number[][] = Array.from({ length: L }, () => Array(target + 1).fill(0));
  free[0][0] = 1;
  for (let r = 1; r < L; r++) for (let t = 0; t <= target; t++) for (let d = 0; d <= 9 && d <= t; d++) free[r][t] += free[r - 1][t - d];
  const frames: Frame[] = [];
  let count = 0;
  const table = (used: [number, number][]): Frame['parts'][number] => ({
    kind: 'grid',
    label: 'free[r][t]: ways to fill r free positions so the digits add up to t',
    cells: free.map((row) => row.map((v) => v as Cell)),
    rowHeaders: free.map((_, r) => `r=${r}`),
    colHeaders: Array.from({ length: target + 1 }, (_, t) => `t=${t}`),
    tones: Object.fromEntries(used.map(([r, t]) => [`${r},${t}`, 'match' as Tone])),
  });
  const digitsView = (pos: number, stopped = false): Frame['parts'][number] => ({
    kind: 'array',
    label: `n = ${n}`,
    items: s,
    tones: Object.fromEntries(s.map((_, i) => [i, (i < pos ? 'done' : i === pos ? (stopped ? 'bad' : 'active') : undefined) as Tone])),
    pointers: pos < L ? [{ name: 'pos', at: pos }] : [],
  });
  frames.push({
    note: `Count numbers from 0 to ${n} whose digits add up to ${target}. First build the free table: once a number is already below n, its remaining digits are unrestricted, and only how many remain and what sum they need matter.`,
    parts: [table([]), { kind: 'vars', items: [['count', 0]] }],
  });
  let need = target;
  for (let pos = 0; pos < L; pos++) {
    const rest = L - pos - 1;
    const used: [number, number][] = [];
    let add = 0;
    for (let d = 0; d < s[pos]; d++) {
      if (need - d < 0) break;
      add += free[rest][need - d];
      used.push([rest, need - d]);
    }
    count += add;
    const stays = need - s[pos] >= 0;
    frames.push({
      note: `Position ${pos}: n has ${s[pos]} and we still need a sum of ${need}. Each smaller digit d leaves ${rest} free position${rest === 1 ? '' : 's'} needing ${need} − d: read those cells, ${add} numbers. ${
        stays ? `Then take ${s[pos]} itself and stay tight, needing ${need - s[pos]} more.` : `Taking ${s[pos]} would overshoot the sum, so the tight path ends here.`
      }`,
      parts: [digitsView(pos, !stays), table(used), { kind: 'vars', items: [['need', need], ['count', count]], tones: { 1: add ? 'match' : undefined } }],
    });
    if (!stays) {
      frames.push({ note: `Total: ${count}.`, parts: [digitsView(L), table([]), { kind: 'vars', items: [['count', count]], tones: { 0: 'match' } }] });
      return { frames, answer: count };
    }
    need -= s[pos];
  }
  if (need === 0) count += 1;
  frames.push({
    note: `${need === 0 ? `n itself has digit sum ${target}, so it counts too. ` : ''}Total: ${count}. Every count came from a table cell, and the table is reused for every position: that reuse is the whole point of digit DP.`,
    parts: [digitsView(L), table([]), { kind: 'vars', items: [['count', count]], tones: { 0: 'match' } }],
  });
  return { frames, answer: count };
}
