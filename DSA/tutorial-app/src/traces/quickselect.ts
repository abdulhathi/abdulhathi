// Walkthrough frames for the Quickselect chapter, produced by running the algorithm for real.
import type { Frame, Tone } from '../viz/types';

const fill = (from: number, to: number, tone: Tone) =>
  Object.fromEntries(Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => [from + k, tone])) as Partial<Record<number, Tone>>;

/**
 * Quickselect for the k-th largest value with a Lomuto partition. The pivot is the last value of
 * the range so the walkthrough is repeatable; real code should pick a random pivot.
 */
export function kthLargest(input: number[], k: number): { frames: Frame[]; value: number; partitions: number } {
  const a = [...input];
  const n = a.length;
  const target = n - k; // the k-th largest sits at this index once the array is sorted ascending
  const frames: Frame[] = [];
  let partitions = 0;
  frames.push({
    note: `The ${k}${k === 1 ? 'st' : k === 2 ? 'nd' : k === 3 ? 'rd' : 'th'} largest value is the one that would sit at index ${target} if the array were sorted. Quickselect finds it without sorting everything.`,
    parts: [{ kind: 'array', label: 'nums', items: [...a], pointers: [{ name: 'target', at: target, tone: 'match' }] }],
  });

  let lo = 0;
  let hi = n - 1;
  for (;;) {
    const pivot = a[hi];
    partitions++;
    let i = lo; // everything in lo..i-1 is smaller than the pivot
    const view = (note: string, j: number | null, swapped: boolean) =>
      frames.push({
        note,
        parts: [
          {
            kind: 'array',
            label: 'nums',
            items: [...a],
            window: [lo, hi],
            tones: { ...fill(lo, i - 1, 'info'), [hi]: 'warn', ...(j !== null ? { [j]: swapped ? 'info' : 'active' } : {}) },
            pointers: [{ name: 'i', at: i, tone: 'info' }, ...(j !== null ? [{ name: 'j', at: j }] : [])],
          },
          { kind: 'vars', items: [['pivot', pivot], ['target index', target]] },
        ],
      });
    view(`Partition ${lo}..${hi} around the last value, ${pivot}. Blue cells (before i) will hold the values smaller than the pivot.`, null, false);
    for (let j = lo; j < hi; j++) {
      if (a[j] < pivot) {
        [a[i], a[j]] = [a[j], a[i]];
        i++;
        view(`${a[i - 1]} < ${pivot}: swap it into the blue zone and move i right.`, j, true);
      } else {
        view(`${a[j]} ≥ ${pivot}: it stays on the right side. Only j moves.`, j, false);
      }
    }
    [a[i], a[hi]] = [a[hi], a[i]];
    const p = i;
    if (p === target) {
      frames.push({
        note: `Swap the pivot into index ${p}. Everything left of it is smaller and everything right is bigger, so ${a[p]} is exactly where sorting would put it: index ${target}. Answer: ${a[p]}.`,
        parts: [{ kind: 'array', label: 'nums', items: [...a], tones: { ...fill(lo, p - 1, 'dim'), ...fill(p + 1, hi, 'dim'), [p]: 'match' }, pointers: [{ name: 'target', at: target, tone: 'match' }] }],
      });
      return { frames, value: a[p], partitions };
    }
    const goRight = p < target;
    frames.push({
      note: `Swap the pivot into index ${p}; it is now in its final place. The target index ${target} is to the ${goRight ? 'right' : 'left'}, so throw away the ${goRight ? 'left' : 'right'} side and repeat on ${goRight ? `${p + 1}..${hi}` : `${lo}..${p - 1}`} only.`,
      parts: [
        {
          kind: 'array',
          label: 'nums',
          items: [...a],
          tones: { ...(goRight ? fill(lo, p - 1, 'dim') : fill(p + 1, hi, 'dim')), [p]: 'done' },
          pointers: [{ name: 'pivot', at: p, tone: 'done' }, { name: 'target', at: target, tone: 'match' }],
        },
      ],
    });
    if (goRight) lo = p + 1;
    else hi = p - 1;
    if (lo === hi) {
      frames.push({
        note: `Only index ${lo} is left, so it must hold the answer: ${a[lo]}.`,
        parts: [{ kind: 'array', label: 'nums', items: [...a], tones: { [lo]: 'match' }, pointers: [{ name: 'target', at: target, tone: 'match' }] }],
      });
      return { frames, value: a[lo], partitions };
    }
  }
}
