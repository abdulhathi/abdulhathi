// Walkthrough frames for the suffix array chapter, produced by running each algorithm.
import type { Cell, Frame, GridViz, Tone } from '../viz/types';

/** Suffix array by prefix doubling: sort suffixes by their first 1, 2, 4, … characters. */
export function suffixArray(s: string): { frames: Frame[]; sa: number[]; rank: number[] } {
  const n = s.length;
  let rank = [...s].map((ch) => ch.charCodeAt(0) - 96); // a = 1, so "past the end" (0) sorts first
  let sa = Array.from({ length: n }, (_, i) => i).sort((a, b) => rank[a] - rank[b] || a - b);
  const frames: Frame[] = [];
  const table = (k: number, order: number[], key: (i: number) => string, newRank: number[] | null, changed: Set<number>): GridViz => ({
    kind: 'grid',
    label: k === 0 ? 'suffixes sorted by their first letter' : `sorted by the first ${2 * k} letters`,
    colHeaders: ['start', 'suffix', 'sort key', 'rank'],
    cells: order.map((i): Cell[] => [i, s.slice(i), key(i), newRank ? newRank[i] : rank[i]]),
    tones: Object.fromEntries(order.flatMap((i, row) => (changed.has(i) ? [[`${row},3`, 'warn' as Tone]] : []))),
  });
  frames.push({
    note: `Goal: list all ${n} suffixes of "${s}" in dictionary order. Start by ranking each suffix by its first letter only (a = 1, b = 2, …). Equal letters share a rank.`,
    parts: [table(0, sa, (i) => s[i], null, new Set())],
  });
  for (let k = 1; ; k *= 2) {
    const second = (i: number) => (i + k < n ? rank[i + k] : 0);
    const key = (i: number) => `(${rank[i]}, ${second(i)})`;
    sa = Array.from({ length: n }, (_, i) => i).sort((a, b) => rank[a] - rank[b] || second(a) - second(b) || a - b);
    const next = new Array<number>(n);
    next[sa[0]] = 1;
    for (let j = 1; j < n; j++) {
      const a = sa[j - 1];
      const b = sa[j];
      next[b] = next[a] + (rank[a] !== rank[b] || second(a) !== second(b) ? 1 : 0);
    }
    const changed = new Set(sa.filter((i) => next[i] !== rank[i]));
    frames.push({
      note: `Round with k = ${k}: the first ${2 * k} letters of suffix i are its first ${k} letters (rank[i]) followed by the first ${k} letters of suffix i + ${k} (rank[i + ${k}], or 0 past the end). Sort by that pair, then renumber.`,
      parts: [table(k, sa, key, next, changed)],
    });
    rank = next;
    if (rank[sa[n - 1]] === n) {
      frames.push({
        note: `All ${n} ranks are now different, so the order is final. Suffix array = [${sa.join(', ')}]. There are O(log n) rounds, each a sort.`,
        parts: [{ kind: 'array', label: 'suffix array (starts in sorted order)', items: sa }, { kind: 'array', label: 'rank (position of each start in that order)', items: rank.map((r) => r - 1) }],
      });
      break;
    }
  }
  return { frames, sa, rank: rank.map((r) => r - 1) };
}

/** Kasai's LCP array: lcp[r] = longest common prefix of the suffixes at sa[r − 1] and sa[r]. */
export function lcpArray(s: string, sa: number[]): { frames: Frame[]; lcp: number[]; distinct: number } {
  const n = s.length;
  const rank = new Array<number>(n);
  sa.forEach((start, r) => (rank[start] = r));
  const lcp = new Array<number>(n).fill(0);
  const known = new Array<boolean>(n).fill(false);
  const frames: Frame[] = [];
  const grid = (focus: number, tone: Tone): GridViz => ({
    kind: 'grid',
    label: 'suffixes in sorted order, with the LCP to the one above',
    colHeaders: ['start', 'suffix', 'lcp'],
    cells: sa.map((i, r): Cell[] => [i, s.slice(i), r === 0 ? '–' : known[r] ? lcp[r] : '·']),
    tones: focus >= 0 ? { [`${focus},2`]: tone, [`${focus},1`]: tone, ...(focus > 0 ? { [`${focus - 1},1`]: 'info' as Tone } : {}) } : {},
  });
  frames.push({
    note: 'Kasai visits suffixes in text order (start 0, 1, 2, …), not sorted order. h is the current match length, and it can only drop by one per step.',
    parts: [grid(-1, 'active')],
  });
  let h = 0;
  for (let i = 0; i < n; i++) {
    const r = rank[i];
    if (r === 0) {
      h = 0;
      frames.push({ note: `Suffix ${i} ("${s.slice(i)}") is first in sorted order: nothing above it. Reset h to 0.`, parts: [grid(0, 'done')] });
      continue;
    }
    const j = sa[r - 1];
    const startH = h;
    while (i + h < n && j + h < n && s[i + h] === s[j + h]) h++;
    lcp[r] = h;
    known[r] = true;
    frames.push({
      note: `Suffix ${i} ("${s.slice(i)}") vs the one above it, suffix ${j} ("${s.slice(j)}"): start comparing at ${startH} (known from the previous step), match length ${h}.`,
      parts: [grid(r, h > 0 ? 'match' : 'active'), { kind: 'vars', items: [['h', h]] }],
    });
    if (h > 0) h--;
  }
  const total = (n * (n + 1)) / 2;
  const shared = lcp.reduce((a, b) => a + b, 0);
  frames.push({
    note: `LCP array = [${lcp.slice(1).join(', ')}]. Each suffix adds (its length − its LCP) new substrings, so distinct substrings = ${total} − ${shared} = ${total - shared}. Longest repeated substring = largest LCP.`,
    parts: [grid(-1, 'active'), { kind: 'vars', items: [['all substrings', total], ['sum of LCP', shared], ['distinct', total - shared]], tones: { 2: 'match' } }],
  });
  return { frames, lcp, distinct: total - shared };
}
