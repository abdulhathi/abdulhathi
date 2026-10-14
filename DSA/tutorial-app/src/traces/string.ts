// Walkthrough frames for chapter 08, produced by running each algorithm for real.
import type { Cell, Frame, GridViz, Tone } from '../viz/types';

/** Longest palindromic substring by expanding around every centre (a character, or a gap between two). */
export function expandAroundCentre(s: string): { frames: Frame[]; best: string } {
  const chars = s.split('');
  const frames: Frame[] = [];
  let bestL = 0;
  let bestR = 0; // inclusive
  const view = (note: string, l: number, r: number, centre: number[], improved: boolean): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 's',
        items: chars,
        window: r >= l ? [l, r] : undefined,
        tones: {
          ...Object.fromEntries(chars.map((_, k) => [k, (k >= bestL && k <= bestR ? 'info' : undefined) as Tone]).filter(([, t]) => t)),
          ...Object.fromEntries(centre.map((c) => [c, (improved ? 'match' : 'active') as Tone])),
        },
        pointers:
          centre.length === 1
            ? [{ name: 'centre', at: centre[0] }]
            : centre.length === 2
              ? [{ name: 'left of gap', at: centre[0] }, { name: 'right of gap', at: centre[1], tone: 'info' }]
              : [],
      },
      { kind: 'vars', items: [['best so far', s.slice(bestL, bestR + 1)]], tones: improved ? { 0: 'match' } : {} },
    ],
  });
  for (let c = 0; c < 2 * s.length - 1; c++) {
    let l = Math.floor(c / 2);
    let r = l + (c % 2);
    const centre = c % 2 === 0 ? [l] : [l, r];
    while (l >= 0 && r < s.length && s[l] === s[r]) {
      l--;
      r++;
    }
    // The palindrome found is s[l+1 .. r-1].
    const len = r - l - 1;
    const improved = len > bestR - bestL + 1;
    if (improved) {
      bestL = l + 1;
      bestR = r - 1;
    }
    const where = c % 2 === 0 ? `centre "${s[centre[0]]}" (index ${centre[0]})` : `the gap between indices ${centre[0]} and ${centre[1]}`;
    frames.push(
      view(
        len > 0
          ? `Expand from ${where} while both ends match: "${s.slice(l + 1, r)}", length ${len}.${improved ? ' New best.' : ''}`
          : `${where[0].toUpperCase()}${where.slice(1)}: "${s[centre[0]]}" and "${s[centre[1]]}" differ, so no even palindrome here.`,
        l + 1,
        r - 1,
        centre,
        improved,
      ),
    );
  }
  const best = s.slice(bestL, bestR + 1);
  frames.push(view(`All ${2 * s.length - 1} centres tried, each expansion O(n): O(n²) time, O(1) space. Longest palindrome: "${best}".`, bestL, bestR, [], true));
  return { frames, best };
}

/** Anagram check with one count per letter: +1 for each letter of s, −1 for each letter of t. */
export function anagramCount(s: string, t: string): { frames: Frame[]; isAnagram: boolean } {
  const frames: Frame[] = [];
  const counts = new Map<string, number>();
  const table = (focus?: string): Frame['parts'][number] => {
    const entries = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    return {
      kind: 'map',
      label: 'count per letter',
      keyTitle: 'letter',
      valueTitle: 'count',
      entries: entries as [Cell, Cell][],
      tones: Object.fromEntries(entries.map(([k, v], i) => [i, (k === focus ? 'active' : v !== 0 ? 'warn' : undefined) as Tone]).filter(([, x]) => x)),
    };
  };
  if (s.length !== t.length) {
    frames.push({ note: 'Different lengths can never be anagrams. Stop before counting anything.', parts: [{ kind: 'vars', items: [['s', s], ['t', t]] }] });
    return { frames, isAnagram: false };
  }
  [...s].forEach((ch, i) => {
    counts.set(ch, (counts.get(ch) ?? 0) + 1);
    frames.push({
      note: `Letter ${i + 1} of s is "${ch}": add one to its count.`,
      parts: [{ kind: 'array', label: 's', items: s.split(''), tones: { [i]: 'active' }, pointers: [{ name: 'i', at: i }] }, table(ch)],
    });
  });
  [...t].forEach((ch, i) => {
    counts.set(ch, (counts.get(ch) ?? 0) - 1);
    frames.push({
      note: `Letter ${i + 1} of t is "${ch}": take one away.${(counts.get(ch) ?? 0) < 0 ? ` "${ch}" is now negative: t has more of it than s.` : ''}`,
      parts: [{ kind: 'array', label: 't', items: t.split(''), tones: { [i]: 'info' }, pointers: [{ name: 'j', at: i, tone: 'info' }] }, table(ch)],
    });
  });
  const isAnagram = [...counts.values()].every((v) => v === 0);
  frames.push({
    note: isAnagram ? 'Every count is back to 0: both strings use exactly the same letters. They are anagrams.' : 'Some count is not 0, so the strings use different letters. Not anagrams.',
    parts: [table()],
  });
  return { frames, isAnagram };
}

/** Where each character lands when a string is written in a zigzag over `rows` rows, and the rows read back in order. */
export function zigzagLayout(s: string, rows: number): { grid: GridViz; result: string } {
  if (rows === 1) return { grid: { kind: 'grid', label: '1 row', cells: [s.split('')] }, result: s };
  const cycle = 2 * rows - 2;
  const cols = Math.ceil(s.length / cycle) * (rows - 1);
  const cells: Cell[][] = Array.from({ length: rows }, () => Array(cols).fill(null));
  const tones: Partial<Record<string, Tone>> = {};
  let r = 0;
  let c = 0;
  let down = true;
  for (let i = 0; i < s.length; i++) {
    cells[r][c] = s[i];
    tones[`${r},${c}`] = r === 0 || r === rows - 1 ? 'info' : 'active';
    if (down && r === rows - 1) down = false;
    else if (!down && r === 0) down = true;
    if (down) r++;
    else {
      r--;
      c++;
    }
  }
  // Trim empty columns at the end.
  let used = 0;
  cells.forEach((row) => row.forEach((v, k) => v !== null && (used = Math.max(used, k + 1))));
  const trimmed = cells.map((row) => row.slice(0, used));
  const result = trimmed.map((row) => row.filter((v) => v !== null).join('')).join('');
  return { grid: { kind: 'grid', label: `"${s}" on ${rows} rows`, cells: trimmed, tones, rowHeaders: trimmed.map((_, k) => `row ${k}`) }, result };
}

/** The zigzag result computed row by row with the cycle formula, for checking the layout. */
export function zigzagByFormula(s: string, rows: number): string {
  if (rows === 1) return s;
  const cycle = 2 * rows - 2;
  let out = '';
  for (let r = 0; r < rows; r++) {
    for (let start = 0; start < s.length; start += cycle) {
      if (start + r < s.length) out += s[start + r];
      if (r > 0 && r < rows - 1 && start + cycle - r < s.length) out += s[start + cycle - r];
    }
  }
  return out;
}
