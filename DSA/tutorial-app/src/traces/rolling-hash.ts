// Walkthrough frames for the rolling hash chapter, produced by running each algorithm.
import type { Cell, Frame, Tone } from '../viz/types';

const val = (ch: string) => ch.charCodeAt(0) - 96; // a = 1 ... z = 26

/** Polynomial hash of s: s[0]·B^(k−1) + ... + s[k−1]·B^0, mod M. */
export function polyHash(s: string, base: number, mod: number) {
  let h = 0;
  for (const ch of s) h = (h * base + val(ch)) % mod;
  return h;
}

/**
 * Rabin–Karp with a deliberately small modulus, so a false match (same hash, different text) can happen
 * and the character check is visible. Returns every true match.
 */
export function rabinKarp(text: string, pattern: string, base: number, mod: number): { frames: Frame[]; matches: number[]; falseHits: number[] } {
  const k = pattern.length;
  const target = polyHash(pattern, base, mod);
  let high = 1; // B^(k−1) mod M, the weight of the character that leaves the window
  for (let i = 1; i < k; i++) high = (high * base) % mod;
  const frames: Frame[] = [];
  const matches: number[] = [];
  const falseHits: number[] = [];
  const items = [...text];
  const view = (i: number, h: number, tone: Tone, note: string, extra: [string, Cell][] = []): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'text', items, window: [i, i + k - 1], tones: Object.fromEntries(Array.from({ length: k }, (_, j) => [i + j, tone])) as Partial<Record<number, Tone>> },
      { kind: 'array', label: 'pattern', items: [...pattern], offset: i, indices: false },
      { kind: 'vars', items: [['window hash', h], ['pattern hash', target], ...extra], tones: { 0: tone === 'match' ? 'match' : tone === 'bad' ? 'bad' : 'active' } },
    ],
  });
  frames.push({
    note: `Hash = letters as digits in base ${base} (a = 1 … z = 26), mod ${mod}. The pattern "${pattern}" hashes to ${target}. A tiny modulus like ${mod} makes collisions likely, which is good for seeing why we verify.`,
    parts: [
      { kind: 'array', label: 'text', items },
      { kind: 'array', label: 'pattern', items: [...pattern], indices: false },
      { kind: 'vars', items: [['pattern hash', target], [`${base}^${k - 1} mod ${mod}`, high]] },
    ],
  });
  let h = polyHash(text.slice(0, k), base, mod);
  for (let i = 0; i + k <= text.length; i++) {
    if (i > 0) {
      const out = text[i - 1];
      const inn = text[i + k - 1];
      const before = h;
      h = (((h - val(out) * high) % mod) + mod) % mod;
      h = (h * base + val(inn)) % mod;
      const same = h === target;
      const real = same && text.slice(i, i + k) === pattern;
      if (real) matches.push(i);
      else if (same) falseHits.push(i);
      frames.push(
        view(
          i,
          h,
          real ? 'match' : same ? 'bad' : 'active',
          `Slide: remove "${out}" (subtract ${val(out)}·${high}), shift (×${base}), add "${inn}" (+${val(inn)}). ${before} → ${h} in O(1). ` +
            (real ? 'Hashes match and the characters match: a real occurrence.' : same ? 'Hashes match but the characters differ: a collision. Checking the characters saved us.' : 'Different hash: certainly not a match, no character check needed.'),
        ),
      );
    } else {
      const same = h === target;
      const real = same && text.slice(0, k) === pattern;
      if (real) matches.push(0);
      else if (same) falseHits.push(0);
      frames.push(view(0, h, real ? 'match' : same ? 'bad' : 'active', `Hash the first window in O(k): ${h}. ${real ? 'It matches.' : same ? 'Same hash but different text: a collision.' : 'Not equal to the pattern hash.'}`));
    }
  }
  frames.push({
    note: `Done: ${matches.length} real match${matches.length === 1 ? '' : 'es'}${falseHits.length ? ` and ${falseHits.length} collision${falseHits.length === 1 ? '' : 's'} caught by the check` : ''}. Every slide cost O(1), so the scan is O(n + k) unless collisions force many checks.`,
    parts: [{ kind: 'array', label: 'text', items, tones: Object.fromEntries(matches.flatMap((m) => Array.from({ length: k }, (_, j) => [m + j, 'match' as Tone]))) as Partial<Record<number, Tone>> }],
  });
  return { frames, matches, falseHits };
}

/** Longest substring that occurs twice: binary search on the length, a set of window hashes for each length tried. */
export function longestDuplicate(s: string): { frames: Frame[]; answer: string } {
  const MOD = 94906249; // below √(2^53), so products of two residues stay exact
  const BASE = 29;
  const n = s.length;
  const frames: Frame[] = [];
  const items = [...s];
  const find = (len: number): [number, number] | null => {
    if (len === 0) return [0, 0];
    let high = 1;
    for (let i = 1; i < len; i++) high = (high * BASE) % MOD;
    const seen = new Map<number, number[]>();
    let h = 0;
    for (let i = 0; i < n; i++) {
      if (i >= len) h = (((h - val(s[i - len]) * high) % MOD) + MOD) % MOD;
      h = (h * BASE + val(s[i])) % MOD;
      if (i >= len - 1) {
        const start = i - len + 1;
        const bucket = seen.get(h) ?? [];
        // Verify against earlier windows with the same hash, so a collision can never give a wrong answer.
        const hit = bucket.find((j) => s.slice(j, j + len) === s.slice(start, start + len));
        if (hit !== undefined) return [hit, start];
        bucket.push(start);
        seen.set(h, bucket);
      }
    }
    return null;
  };
  let lo = 0;
  let hi = n - 1;
  let best: [number, number, number] = [0, 0, 0];
  frames.push({
    note: `If some substring of length L repeats, so does one of every shorter length (cut it down). So "a repeat of length L exists" is true up to some L and false after it: binary search L between 0 and ${n - 1}.`,
    parts: [{ kind: 'array', label: 's', items }, { kind: 'vars', items: [['lo', lo], ['hi', hi]] }],
  });
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const hit = find(mid);
    if (hit) {
      best = [hit[0], hit[1], mid];
      const tones: Partial<Record<number, Tone>> = {};
      for (let j = 0; j < mid; j++) {
        tones[hit[0] + j] = 'info';
        tones[hit[1] + j] = tones[hit[1] + j] ? 'match' : 'warn';
      }
      frames.push({
        note: `Try L = ${mid}: hash every window of length ${mid} into a set. "${s.slice(hit[0], hit[0] + mid)}" appears at ${hit[0]} and at ${hit[1]}. Repeats of length ${mid} exist, so search longer: lo = ${mid}.`,
        parts: [{ kind: 'array', label: 's', items, tones }, { kind: 'vars', items: [['lo', mid], ['hi', hi], ['mid', mid]], tones: { 2: 'match' } }],
      });
      lo = mid;
    } else {
      frames.push({
        note: `Try L = ${mid}: all ${n - mid + 1} windows have different hashes (and different text). No repeat this long, so hi = ${mid - 1}.`,
        parts: [{ kind: 'array', label: 's', items }, { kind: 'vars', items: [['lo', lo], ['hi', mid - 1], ['mid', mid]], tones: { 2: 'bad' } }],
      });
      hi = mid - 1;
    }
  }
  const answer = s.slice(best[0], best[0] + best[2]);
  frames.push({
    note: `lo = hi = ${lo}. The longest repeated substring is "${answer}". Each test is O(n), and there are O(log n) tests.`,
    parts: [{ kind: 'array', label: 's', items, tones: Object.fromEntries(Array.from({ length: best[2] }, (_, j) => [best[0] + j, 'match' as Tone])) as Partial<Record<number, Tone>> }],
  });
  return { frames, answer };
}
