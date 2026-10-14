// Walkthrough frames for the Sweep line chapter, produced by running each algorithm for real.
import type { Frame, Interval, Tone } from '../viz/types';

type Pair = [number, number];

/**
 * Maximum overlap of half-open intervals [start, end): turn each interval into a +1 event at its
 * start and a −1 event at its end, sort the events, and sweep. At equal times, ends go first.
 */
export function maxOverlap(input: Pair[]): { frames: Frame[]; best: number; bestAt: number } {
  const frames: Frame[] = [];
  const events: { t: number; d: 1 | -1; i: number }[] = [];
  input.forEach(([s, e], i) => {
    events.push({ t: s, d: 1, i });
    events.push({ t: e, d: -1, i });
  });
  events.sort((a, b) => a.t - b.t || a.d - b.d); // at the same time, −1 (an end) comes before +1 (a start)
  const lo = Math.min(...input.map((p) => p[0]));
  const hi = Math.max(...input.map((p) => p[1]));
  const active = new Set<number>();
  const view = (extra: Partial<Record<number, Tone>> = {}): Interval[] =>
    input.map(([start, end], i) => ({ start, end, tone: extra[i] ?? (active.has(i) ? 'active' : undefined) }));
  frames.push({
    note: `Each meeting becomes two events: +1 when it starts and −1 when it ends. ${events.length} events in all. Sort them by time; when an end and a start share a time, process the end first, because a meeting that ends at 10 frees its room for one that starts at 10.`,
    parts: [{ kind: 'intervals', label: 'meetings', items: view(), min: lo, max: hi }, { kind: 'vars', items: [['active', 0], ['best', 0]] }],
  });
  let cur = 0;
  let best = 0;
  let bestAt = lo;
  for (const ev of events) {
    cur += ev.d;
    if (ev.d === 1) active.add(ev.i);
    else active.delete(ev.i);
    const improved = cur > best;
    if (improved) {
      best = cur;
      bestAt = ev.t;
    }
    const [s, e] = input[ev.i];
    frames.push({
      note:
        ev.d === 1
          ? `Time ${ev.t}: [${s}, ${e}) starts. Active becomes ${cur}.${improved ? ` That is a new maximum: ${best} rooms are needed at once.` : ''}`
          : `Time ${ev.t}: [${s}, ${e}) ends. Active drops to ${cur}.`,
      parts: [
        { kind: 'intervals', label: 'meetings', items: view({ [ev.i]: ev.d === 1 ? 'match' : 'done' }), min: lo, max: hi, marker: ev.t },
        { kind: 'vars', items: [['time', ev.t], ['active', cur], ['best', best]], tones: improved ? { 2: 'match' } : {} },
      ],
    });
  }
  frames.push({
    note: `The sweep is over. At most ${best} meetings overlap (first reached at time ${bestAt}), so ${best} rooms are enough and necessary. Sorting the 2n events costs O(n log n); the sweep is O(n).`,
    parts: [{ kind: 'intervals', label: 'meetings', items: input.map(([start, end]) => ({ start, end })), min: lo, max: hi }, { kind: 'vars', items: [['best', best]], tones: { 0: 'match' } }],
  });
  return { frames, best, bestAt };
}

/** Difference array: add v to every index in [l, r] by touching only two cells, then recover the values with a running sum. */
export function rangeAddDifference(n: number, updates: [number, number, number][]): { frames: Frame[]; values: number[] } {
  const diff = new Array<number>(n + 1).fill(0);
  const frames: Frame[] = [];
  frames.push({
    note: `Many range updates on ${n} positions. Instead of adding to every cell of every range, record only where each change starts and where it stops, in a difference array one cell longer than the input.`,
    parts: [{ kind: 'array', label: 'diff', items: [...diff] }],
  });
  for (const [l, r, v] of updates) {
    diff[l] += v;
    diff[r + 1] -= v;
    frames.push({
      note: `Add ${v} to positions ${l}..${r}: put +${v} at index ${l} (the change starts) and −${v} at index ${r + 1} (it stops). Two writes, whatever the length of the range.`,
      parts: [{ kind: 'array', label: 'diff', items: [...diff], window: [l, r], tones: { [l]: 'match', [r + 1]: 'bad' } }],
    });
  }
  const values: number[] = [];
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += diff[i];
    values.push(run);
    frames.push({
      note: `Sweep left to right keeping a running sum of diff. At index ${i} the running sum is ${run}: that is the final value there.`,
      parts: [
        { kind: 'array', label: 'diff', items: [...diff], tones: { [i]: 'active' }, pointers: [{ name: 'i', at: i }] },
        { kind: 'array', label: 'values', items: [...values, ...new Array(n - values.length).fill(null)], tones: { [i]: 'match' } },
      ],
    });
  }
  frames.push({
    note: `All ${updates.length} updates applied in O(n + number of updates), instead of O(n × number of updates).`,
    parts: [{ kind: 'array', label: 'values', items: values }],
  });
  return { frames, values };
}
