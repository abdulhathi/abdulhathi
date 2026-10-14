// Walkthrough frames for the enumeration chapter, produced by running each search for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Sequential Digits: every answer is a window of "123456789", so enumerate the windows instead of the range. */
export function sequentialDigits(low: number, high: number): { frames: Frame[]; found: number[] } {
  const digits = [...'123456789'];
  const found: number[] = [];
  const frames: Frame[] = [];
  const view = (start: number, len: number, note: string, tone: Tone): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: '"123456789"',
        items: digits,
        window: len > 0 ? [start, start + len - 1] : undefined,
        tones: len > 0 ? Object.fromEntries(Array.from({ length: len }, (_, k) => [start + k, tone])) : {},
        indices: false,
      },
      { kind: 'vars', items: [['low', low], ['high', high]] },
      { kind: 'array', label: 'found', items: [...found], indices: false },
    ],
  });
  frames.push(
    view(0, 0, `Checking every number from ${low} to ${high} is up to 10⁹ checks. But each digit is one more than the last, so every answer is a slice of "123456789": only 36 candidates exist.`, 'active'),
  );
  const minLen = String(low).length;
  const maxLen = String(high).length;
  for (let len = minLen; len <= maxLen; len++) {
    for (let start = 0; start + len <= 9; start++) {
      const value = Number(digits.slice(start, start + len).join(''));
      if (value < low) {
        frames.push(view(start, len, `${value} is below ${low}: skip it.`, 'dim'));
        continue;
      }
      if (value > high) {
        frames.push(view(start, len, `${value} is above ${high}. Every later candidate is bigger still, so stop.`, 'bad'));
        frames.push(view(0, 0, `Done, already in increasing order: ${found.join(', ') || 'none'}. At most 36 candidates were ever looked at.`, 'match'));
        return { frames, found };
      }
      found.push(value);
      frames.push(view(start, len, `${value} is in range: keep it.`, 'match'));
    }
  }
  frames.push(view(0, 0, `Every candidate of the right lengths was checked: ${found.join(', ') || 'none'}.`, 'match'));
  return { frames, found };
}

/** Number of Arithmetic Triplets: enumerate the middle element and look its neighbours up in a set. */
export function arithmeticTriplets(nums: number[], diff: number): { frames: Frame[]; count: number } {
  const set = new Set(nums);
  let count = 0;
  const frames: Frame[] = [];
  const view = (j: number, note: string, tones: Partial<Record<number, Tone>>): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums (strictly increasing)', items: nums, tones, pointers: j >= 0 ? [{ name: 'middle', at: j }] : [] },
      { kind: 'vars', items: [['diff', diff], ['triplets', count]] as [string, Cell][] },
    ],
  });
  frames.push(view(-1, `Three nested loops would try every triple. Instead, fix the middle value v: a triplet needs v − ${diff} and v + ${diff}, and a set tells you whether both exist.`, {}));
  for (let j = 0; j < nums.length; j++) {
    const v = nums[j];
    const lo = set.has(v - diff);
    const hi = set.has(v + diff);
    const tones: Partial<Record<number, Tone>> = { [j]: 'active' };
    if (lo) tones[nums.indexOf(v - diff)] = 'match';
    if (hi) tones[nums.indexOf(v + diff)] = 'match';
    if (lo && hi) count++;
    frames.push(
      view(
        j,
        lo && hi
          ? `Middle ${v}: both ${v - diff} and ${v + diff} are present. One triplet.`
          : `Middle ${v}: ${!lo ? `${v - diff} is missing` : `${v + diff} is missing`}, so no triplet has ${v} in the middle.`,
        tones,
      ),
    );
  }
  frames.push(view(-1, `One loop instead of three: ${count} triplets.`, {}));
  return { frames, count };
}

/** Consecutive Numbers Sum: enumerate the number of terms k, and solve for the first term. */
export function consecutiveSums(n: number): { frames: Frame[]; ways: number } {
  const frames: Frame[] = [];
  let ways = 0;
  const found: string[] = [];
  const view = (note: string, k: number, x: string, tone: Tone): Frame => ({
    note,
    parts: [
      { kind: 'vars', items: [['n', n], ['k terms', k], ['first term x', x], ['ways', ways]], tones: { 2: tone } },
      { kind: 'array', label: 'ways found', items: [...found], indices: false },
    ],
  });
  frames.push(view(`k consecutive numbers starting at x add up to k·x + k(k − 1)/2. Instead of trying every start x (up to ${n}), try every length k: x is then fixed.`, 0, '–', 'active'));
  for (let k = 1; k * (k - 1) / 2 < n; k++) {
    const rest = n - (k * (k - 1)) / 2;
    if (rest % k === 0) {
      const x = rest / k;
      ways++;
      found.push(k === 1 ? `${x}` : `${x}+…+${x + k - 1}`);
      frames.push(view(`k = ${k}: x = (${n} − ${(k * (k - 1)) / 2}) / ${k} = ${x}, a whole positive number. One way: ${Array.from({ length: k }, (_, i) => x + i).join(' + ')}.`, k, String(x), 'match'));
    } else {
      frames.push(view(`k = ${k}: (${n} − ${(k * (k - 1)) / 2}) / ${k} = ${(rest / k).toFixed(2)} is not a whole number, so no run of ${k} numbers works.`, k, (rest / k).toFixed(2), 'bad'));
    }
  }
  const stop = Math.ceil((1 + Math.sqrt(1 + 8 * n)) / 2);
  frames.push(view(`For k = ${stop}, k(k − 1)/2 already reaches ${n}, which would make x ≤ 0. So k never exceeds about √(2n): O(√n) work. Answer: ${ways}.`, stop, '≤ 0', 'dim'));
  return { frames, ways };
}
