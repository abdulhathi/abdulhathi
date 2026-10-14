// Walkthrough frames for the Intervals chapter, produced by running each algorithm for real.
import type { Frame, Interval, Tone } from '../viz/types';

type Pair = [number, number];

const ivs = (list: Pair[], tones: Partial<Record<number, Tone>> = {}): Interval[] =>
  list.map(([start, end], i) => ({ start, end, tone: tones[i] }));

/** Merge overlapping intervals: sort by start, then extend the last merged interval or start a new one. */
export function mergeIntervals(input: Pair[]): { frames: Frame[]; merged: Pair[] } {
  const frames: Frame[] = [];
  const lo = Math.min(...input.map((p) => p[0]));
  const hi = Math.max(...input.map((p) => p[1]));
  frames.push({
    note: 'In the given order, overlapping intervals can be far apart in the list, so a single pass cannot see them.',
    parts: [{ kind: 'intervals', label: 'input (unsorted)', items: ivs(input), min: lo, max: hi }],
  });
  const sorted = [...input].sort((a, b) => a[0] - b[0]);
  frames.push({
    note: 'Sort by start. Now any interval that overlaps the merged block so far must start before that block ends, and it can only be the next one in the list.',
    parts: [{ kind: 'intervals', label: 'sorted by start', items: ivs(sorted), min: lo, max: hi }],
  });
  const merged: Pair[] = [];
  sorted.forEach(([s, e], i) => {
    const last = merged[merged.length - 1];
    let note: string;
    if (!last || s > last[1]) {
      merged.push([s, e]);
      note = last
        ? `[${s}, ${e}] starts after the current block ends at ${last[1]}: no overlap, so it starts a new block.`
        : `The first interval [${s}, ${e}] starts the first block.`;
    } else if (e > last[1]) {
      note = `[${s}, ${e}] starts at ${s}, inside the block that ends at ${last[1]}. Overlap: stretch the block to end at ${e}.`;
      last[1] = e;
    } else {
      note = `[${s}, ${e}] lies completely inside the current block [${last[0]}, ${last[1]}]. Nothing changes.`;
    }
    frames.push({
      note,
      parts: [
        { kind: 'intervals', label: 'sorted by start', items: ivs(sorted, { ...Object.fromEntries(Array.from({ length: i }, (_, k) => [k, 'done' as Tone])), [i]: 'active' }), min: lo, max: hi },
        { kind: 'intervals', label: 'merged so far', items: ivs(merged, { [merged.length - 1]: 'match' }), min: lo, max: hi },
      ],
    });
  });
  frames.push({
    note: `Done: ${input.length} intervals became ${merged.length}. Sorting costs O(n log n); the merge pass is O(n).`,
    parts: [{ kind: 'intervals', label: 'merged', items: ivs(merged, Object.fromEntries(merged.map((_, i) => [i, 'match' as Tone]))), min: lo, max: hi }],
  });
  return { frames, merged };
}

/** Keep the most non-overlapping intervals (fewest removals): sort by end, keep each interval that starts after the last kept one ends. */
export function keepMostByEnd(input: Pair[]): { frames: Frame[]; kept: Pair[]; removed: number } {
  const frames: Frame[] = [];
  const lo = Math.min(...input.map((p) => p[0]));
  const hi = Math.max(...input.map((p) => p[1]));
  const sorted = [...input].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const tones: Partial<Record<number, Tone>> = {};
  frames.push({
    note: 'Sort by END time. The interval that finishes first leaves the most room for everything after it, so it is always safe to keep.',
    parts: [{ kind: 'intervals', label: 'sorted by end', items: ivs(sorted), min: lo, max: hi }, { kind: 'vars', items: [['kept', 0], ['removed', 0]] }],
  });
  const kept: Pair[] = [];
  let lastEnd = -Infinity;
  let removed = 0;
  sorted.forEach(([s, e], i) => {
    let note: string;
    if (s >= lastEnd) {
      kept.push([s, e]);
      tones[i] = 'match';
      note = lastEnd === -Infinity
        ? `[${s}, ${e}] ends first of all: keep it.`
        : `[${s}, ${e}] starts at ${s}, not before the last kept end ${lastEnd}: no clash, keep it. It ends earliest among what is left.`;
      lastEnd = e;
    } else {
      removed++;
      tones[i] = 'bad';
      note = `[${s}, ${e}] starts at ${s}, before the last kept interval ends at ${lastEnd}: they clash. Remove it; the kept one ends no later, so it is the better one to keep.`;
    }
    frames.push({
      note,
      parts: [
        { kind: 'intervals', label: 'sorted by end', items: ivs(sorted, { ...tones, [i]: tones[i] === 'bad' ? 'bad' : 'active' }), min: lo, max: hi, marker: lastEnd === -Infinity ? undefined : lastEnd },
        { kind: 'vars', items: [['kept', kept.length], ['removed', removed], ['last kept end', lastEnd]] },
      ],
    });
  });
  frames.push({
    note: `Kept ${kept.length}, removed ${removed}. Greedy by end time is optimal: swapping any optimal choice for the earliest-ending interval never makes things worse.`,
    parts: [{ kind: 'intervals', label: 'result', items: ivs(sorted, tones), min: lo, max: hi }],
  });
  return { frames, kept, removed };
}
