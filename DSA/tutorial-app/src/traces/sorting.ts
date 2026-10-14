// Walkthrough frames for the Sorting chapter, produced by running each algorithm for real.
import type { Frame, Tone } from '../viz/types';

const fill = (from: number, to: number, tone: Tone) =>
  Object.fromEntries(Array.from({ length: Math.max(0, to - from) }, (_, k) => [from + k, tone])) as Partial<Record<number, Tone>>;

/** Bubble sort: neighbours swap until the largest value has bubbled to the end of the unsorted part. */
export function bubbleSort(input: number[]): { frames: Frame[]; sorted: number[]; swaps: number } {
  const a = [...input];
  const n = a.length;
  const frames: Frame[] = [];
  let swaps = 0;
  frames.push({
    note: 'Bubble sort walks left to right comparing neighbours. Whenever a pair is out of order, it swaps them, so the largest value drifts to the end.',
    parts: [{ kind: 'array', label: 'nums', items: [...a] }, { kind: 'vars', items: [['swaps', 0]] }],
  });
  for (let end = n - 1; end > 0; end--) {
    let swapped = false;
    for (let i = 0; i < end; i++) {
      const out = a[i] > a[i + 1];
      if (out) {
        [a[i], a[i + 1]] = [a[i + 1], a[i]];
        swaps++;
        swapped = true;
      }
      frames.push({
        note: out
          ? `${a[i + 1]} > ${a[i]}: out of order, so swap them.`
          : `${a[i]} ≤ ${a[i + 1]}: already in order, leave them.`,
        parts: [
          { kind: 'array', label: 'nums', items: [...a], tones: { ...fill(end + 1, n, 'done'), [i]: out ? 'warn' : 'active', [i + 1]: out ? 'warn' : 'active' } },
          { kind: 'vars', items: [['pass', n - end], ['swaps', swaps]] },
        ],
      });
    }
    frames.push({
      note: swapped
        ? `End of pass ${n - end}: ${a[end]} is the largest of the unsorted part and is now in its final place.`
        : `Pass ${n - end} made no swaps, so the array is already sorted. Stop early.`,
      parts: [{ kind: 'array', label: 'nums', items: [...a], tones: fill(swapped ? end : 0, n, 'match') }, { kind: 'vars', items: [['pass', n - end], ['swaps', swaps]] }],
    });
    if (!swapped) break;
  }
  return { frames, sorted: a, swaps };
}

/** Insertion sort: take the next value and slide it left into the sorted prefix. */
export function insertionSort(input: number[]): { frames: Frame[]; sorted: number[]; shifts: number } {
  const a = [...input];
  const frames: Frame[] = [];
  let shifts = 0;
  frames.push({
    note: 'The first value on its own is a sorted prefix (green). Each step takes the next value and slides it left until the value before it is not bigger.',
    parts: [{ kind: 'array', label: 'nums', items: [...a], tones: { 0: 'match' } }],
  });
  for (let i = 1; i < a.length; i++) {
    const key = a[i];
    let j = i - 1;
    let moved = 0;
    while (j >= 0 && a[j] > key) {
      a[j + 1] = a[j];
      j--;
      moved++;
    }
    a[j + 1] = key;
    shifts += moved;
    frames.push({
      note:
        moved === 0
          ? `Take ${key}. The value before it is not bigger, so ${key} stays where it is.`
          : `Take ${key}. ${moved} bigger value${moved > 1 ? 's' : ''} shift one step right, and ${key} drops into index ${j + 1}.`,
      parts: [
        { kind: 'array', label: 'nums', items: [...a], tones: { ...fill(0, i + 1, 'match'), [j + 1]: 'active' }, pointers: [{ name: 'key', at: j + 1 }] },
        { kind: 'vars', items: [['sorted prefix', `0..${i}`], ['shifts so far', shifts]] },
      ],
    });
  }
  frames.push({ note: `Done. Every value has been inserted; ${shifts} shifts in total, one per out-of-order pair.`, parts: [{ kind: 'array', label: 'nums', items: [...a], tones: fill(0, a.length, 'match') }] });
  return { frames, sorted: a, shifts };
}
