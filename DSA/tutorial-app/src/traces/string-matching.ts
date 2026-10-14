// Walkthrough frames for the string matching chapter, produced by running each algorithm.
import type { Cell, Frame, Tone } from '../viz/types';

const range = (a: number, b: number, tone: Tone): Partial<Record<number, Tone>> =>
  Object.fromEntries(Array.from({ length: Math.max(0, b - a) }, (_, k) => [a + k, tone])) as Partial<Record<number, Tone>>;

/** The KMP prefix table: pi[i] = length of the longest proper prefix of p[0..i] that is also a suffix of it. */
export function prefixTable(p: string): { frames: Frame[]; pi: number[] } {
  const n = p.length;
  const pi = new Array<number>(n).fill(0);
  const frames: Frame[] = [];
  const view = (i: number, j: number, note: string, tones: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'pattern', items: [...p], tones, pointers: [{ name: 'i', at: i }, ...(j < n ? [{ name: 'j', at: j, tone: 'info' as Tone }] : [])] },
      { kind: 'array', label: 'pi (border length)', items: pi.map((v, k): Cell => (k < i ? v : k === i ? v : null)), tones: { [i]: 'active' } },
    ],
  });
  frames.push({
    note: `pi[i] is the length of the longest border of p[0..i]: a proper prefix that is also a suffix. pi[0] is always 0. j is the length of the border we are trying to extend.`,
    parts: [{ kind: 'array', label: 'pattern', items: [...p] }, { kind: 'array', label: 'pi (border length)', items: pi.map((v, k): Cell => (k === 0 ? v : null)) }],
  });
  for (let i = 1; i < n; i++) {
    let j = pi[i - 1];
    while (j > 0 && p[i] !== p[j]) {
      const fallback = pi[j - 1];
      frames.push(view(i, j, `p[${i}] = "${p[i]}" does not extend the border of length ${j} (next letter would be "${p[j]}"). Fall back to the next shorter border: pi[${j - 1}] = ${fallback}.`, { ...range(0, j, 'info'), [i]: 'bad' }));
      j = fallback;
    }
    if (p[i] === p[j]) {
      j++;
      pi[i] = j;
      frames.push(view(i, j - 1, `p[${i}] = "${p[i]}" matches p[${j - 1}], so the border grows to ${j}: pi[${i}] = ${j}.`, { ...range(0, j, 'match'), ...range(i - j + 1, i + 1, 'match') }));
    } else {
      pi[i] = 0;
      frames.push(view(i, 0, `No border of p[0..${i}] can be extended by "${p[i]}": pi[${i}] = 0.`, { [i]: 'done' }));
    }
  }
  frames.push({
    note: `Done in O(m): j goes up by at most one per step and every fall-back makes it shorter, so the total work is linear.`,
    parts: [{ kind: 'array', label: 'pattern', items: [...p] }, { kind: 'array', label: 'pi (border length)', items: pi }],
  });
  return { frames, pi };
}

/** KMP search: the text pointer never moves back; on a mismatch the pattern slides by its border. */
export function kmpSearch(text: string, p: string): { frames: Frame[]; matches: number[] } {
  const { pi } = prefixTable(p);
  const frames: Frame[] = [];
  const matches: number[] = [];
  const m = p.length;
  const view = (i: number, j: number, note: string, textTone: Tone, patTone: Tone): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'text', items: [...text], tones: { ...range(i - j, i, 'match'), ...(i < text.length ? { [i]: textTone } : {}) }, pointers: [{ name: 'i', at: i }] },
      { kind: 'array', label: 'pattern (shifted under the text)', items: [...p], offset: i - j, indices: false, tones: { ...range(0, j, 'match'), ...(j < m ? { [j]: patTone } : {}) } },
      { kind: 'vars', items: [['matched so far', j]] },
    ],
  });
  frames.push({
    note: `The prefix table of "${p}" is [${pi.join(', ')}]. Now scan the text once. j counts how many pattern letters currently match.`,
    parts: [{ kind: 'array', label: 'text', items: [...text] }, { kind: 'array', label: 'pi', items: pi }],
  });
  let j = 0;
  for (let i = 0; i < text.length; i++) {
    while (j > 0 && text[i] !== p[j]) {
      frames.push(view(i, j, `Mismatch: text "${text[i]}" vs pattern "${p[j]}". Keep the ${pi[j - 1]} letters that are still known to match (pi[${j - 1}]) and slide the pattern. i does not move back.`, 'bad', 'bad'));
      j = pi[j - 1];
    }
    if (text[i] === p[j]) {
      j++;
      if (j === m) {
        matches.push(i - m + 1);
        frames.push(view(i + 1, m, `All ${m} letters match: an occurrence starts at ${i - m + 1}. Continue from the border pi[${m - 1}] = ${pi[m - 1]} so overlapping matches are found too.`, 'match', 'match'));
        j = pi[m - 1];
      } else {
        frames.push(view(i + 1, j, `text[${i}] = "${text[i]}" matches pattern[${j - 1}]. ${j} letters matched.`, 'active', 'active'));
      }
    } else {
      frames.push(view(i + 1, 0, `text[${i}] = "${text[i]}" does not match the first pattern letter. Move on.`, 'active', 'active'));
    }
  }
  frames.push({ note: `Found ${matches.length} occurrence${matches.length === 1 ? '' : 's'} at ${matches.join(', ') || 'no position'}. Each text letter was read once: O(n + m).`, parts: [{ kind: 'array', label: 'text', items: [...text], tones: Object.assign({}, ...matches.map((s) => range(s, s + m, 'match'))) }] });
  return { frames, matches };
}

/** The Z-function: z[i] = length of the longest common prefix of s and s[i..]. */
export function zFunction(s: string): { frames: Frame[]; z: number[] } {
  const n = s.length;
  const z = new Array<number>(n).fill(0);
  z[0] = n;
  const frames: Frame[] = [];
  let l = 0;
  let r = 0; // s[l..r) is the rightmost segment known to match a prefix
  const view = (i: number, note: string, tones: Partial<Record<number, Tone>>): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 's', items: [...s], tones, window: r > l ? [l, r - 1] : undefined, pointers: [{ name: 'i', at: i }] },
      { kind: 'array', label: 'z', items: z.map((v, k): Cell => (k <= i ? v : null)), tones: { [i]: 'active' } },
      { kind: 'vars', items: [['box [l, r)', `[${l}, ${r})`]] },
    ],
  });
  frames.push({
    note: 'z[i] = how far s matches its own start when you begin reading at i. The bracket is the "Z-box": the rightmost stretch already known to equal a prefix.',
    parts: [{ kind: 'array', label: 's', items: [...s] }, { kind: 'array', label: 'z', items: z.map((v, k): Cell => (k === 0 ? v : null)) }],
  });
  for (let i = 1; i < n; i++) {
    let reused = 0;
    if (i < r) {
      reused = Math.min(r - i, z[i - l]);
      z[i] = reused;
    }
    const start = z[i];
    while (i + z[i] < n && s[z[i]] === s[i + z[i]]) z[i]++;
    const extra = z[i] - start;
    const note =
      (i < r
        ? `i = ${i} is inside the box, which mirrors the prefix: start from min(r − i, z[${i - l}]) = ${reused} for free.`
        : `i = ${i} is outside the box: start from 0.`) +
      (extra > 0 ? ` Then compare letter by letter: ${extra} more match${extra === 1 ? 'es' : ''}.` : ' No further letters match.') +
      ` z[${i}] = ${z[i]}.`;
    if (i + z[i] > r) {
      l = i;
      r = i + z[i];
    }
    frames.push(view(i, note, { ...range(i, i + z[i], 'match'), ...range(0, z[i], 'info') }));
  }
  frames.push({ note: 'Every successful comparison pushes r to the right, and r never moves back, so the whole array takes O(n).', parts: [{ kind: 'array', label: 's', items: [...s] }, { kind: 'array', label: 'z', items: z }] });
  return { frames, z };
}

/** Manacher (odd lengths): d[i] = number of odd palindromes centred at i, i.e. the radius including the centre. */
export function manacherOdd(s: string): { frames: Frame[]; d: number[]; longest: string } {
  const n = s.length;
  const d = new Array<number>(n).fill(0);
  const frames: Frame[] = [];
  let l = 0;
  let r = -1; // s[l..r] is the rightmost palindrome found so far
  let best = 0;
  frames.push({
    note: 'Manacher\'s idea: inside a palindrome, the right half mirrors the left half. So a centre inside the rightmost known palindrome can start from its mirror\'s radius.',
    parts: [{ kind: 'array', label: 's', items: [...s] }],
  });
  for (let i = 0; i < n; i++) {
    let k = i > r ? 1 : Math.min(d[l + r - i], r - i + 1);
    const free = k;
    while (i - k >= 0 && i + k < n && s[i - k] === s[i + k]) k++;
    d[i] = k;
    if (d[i] > d[best]) best = i;
    const inside = i <= r;
    const mirror = l + r - i;
    const box = `[${l}, ${r}]`;
    if (i + k - 1 > r) {
      l = i - k + 1;
      r = i + k - 1;
    }
    frames.push({
      note:
        (inside ? `Centre ${i} lies inside the palindrome ${box}; its mirror ${mirror} has radius ${d[mirror]}, so start at ${free} for free. ` : `Centre ${i} is beyond the known palindromes: start at radius 1. `) +
        `Expanded to radius ${k}: "${s.slice(i - k + 1, i + k)}".`,
      parts: [
        { kind: 'array', label: 's', items: [...s], window: [i - k + 1, i + k - 1], tones: { [i]: 'active', ...(inside && mirror !== i ? { [mirror]: 'info' } : {}) } },
        { kind: 'array', label: 'radius d', items: d.map((v, x): Cell => (x <= i ? v : null)), tones: { [i]: 'active' } },
      ],
    });
  }
  const longest = s.slice(best - d[best] + 1, best + d[best]);
  frames.push({ note: `Longest odd palindrome: "${longest}". The right edge r only moves right, so the total work is O(n).`, parts: [{ kind: 'array', label: 's', items: [...s], tones: range(best - d[best] + 1, best + d[best], 'match') }, { kind: 'array', label: 'radius d', items: d }] });
  return { frames, d, longest };
}
