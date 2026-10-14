// Walkthrough frames for the Merge sort chapter, produced by running the algorithm for real.
import type { Frame, Tone } from '../viz/types';

const fill = (from: number, to: number, tone: Tone) =>
  Object.fromEntries(Array.from({ length: Math.max(0, to - from + 1) }, (_, k) => [from + k, tone])) as Partial<Record<number, Tone>>;

/**
 * Top-down merge sort that also counts inversions (pairs i < j with a[i] > a[j]).
 * One frame per merge: the merged range is sorted, and every time a value is taken
 * from the right half, each value still waiting in the left half forms an inversion with it.
 */
export function mergeSortInversions(input: number[]): { frames: Frame[]; sorted: number[]; inversions: number } {
  const a = [...input];
  const frames: Frame[] = [];
  let inversions = 0;
  frames.push({
    note: 'Split the array in halves until every piece has one value. A single value is already sorted. Then merge pieces back together, two sorted halves at a time.',
    parts: [{ kind: 'array', label: 'nums', items: [...a] }, { kind: 'vars', items: [['inversions', 0]] }],
  });

  const sort = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const mid = Math.floor((lo + hi) / 2);
    sort(lo, mid);
    sort(mid + 1, hi);
    const left = a.slice(lo, mid + 1);
    const right = a.slice(mid + 1, hi + 1);
    let i = 0;
    let j = 0;
    let k = lo;
    let added = 0;
    while (i < left.length || j < right.length) {
      if (j >= right.length || (i < left.length && left[i] <= right[j])) {
        a[k++] = left[i++];
      } else {
        // right[j] is smaller than every value still waiting in the left half.
        added += left.length - i;
        a[k++] = right[j++];
      }
    }
    inversions += added;
    frames.push({
      note: `Merge [${left.join(', ')}] with [${right.join(', ')}] by repeatedly taking the smaller front value. ${
        added === 0
          ? 'No value from the right had to jump ahead of a left value, so no inversions here.'
          : `Values from the right jumped ahead of ${added} left value${added > 1 ? 's' : ''} in total: ${added} inversion${added > 1 ? 's' : ''} counted.`
      }`,
      parts: [
        { kind: 'array', label: 'nums', items: [...a], window: [lo, hi], tones: fill(lo, hi, 'match'), pointers: [{ name: 'mid', at: mid, tone: 'info' }] },
        { kind: 'vars', items: [['added', added], ['inversions', inversions]], tones: added > 0 ? { 1: 'warn' } : {} },
      ],
    });
  };

  sort(0, a.length - 1);
  frames.push({
    note: `Sorted. Each of the log₂ n levels of merging touches every value once, so the sort costs O(n log n), and the ${inversions} inversions came for free.`,
    parts: [{ kind: 'array', label: 'nums', items: [...a], tones: fill(0, a.length - 1, 'match') }, { kind: 'vars', items: [['inversions', inversions]], tones: { 0: 'match' } }],
  });
  return { frames, sorted: a, inversions };
}
