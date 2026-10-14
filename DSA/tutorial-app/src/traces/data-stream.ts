// Walkthrough frames for the data streams chapter, produced by running each structure.
import type { Cell, Frame, Tone } from '../viz/types';

/** Running median with two halves: low (a max-heap) and high (a min-heap), sizes equal or low one bigger. */
export function runningMedian(stream: number[]): { frames: Frame[]; medians: number[] } {
  const low: number[] = []; // kept sorted here only for display; a real solution uses a max-heap
  const high: number[] = []; // a min-heap in a real solution
  const medians: number[] = [];
  const frames: Frame[] = [];
  const insertSorted = (arr: number[], v: number) => {
    let i = arr.length;
    while (i > 0 && arr[i - 1] > v) i--;
    arr.splice(i, 0, v);
  };
  const view = (note: string, tones: { low?: Partial<Record<number, Tone>>; high?: Partial<Record<number, Tone>> }, median: number | null): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'low half: max-heap (shown sorted, top = largest)', items: low.slice(), tones: tones.low, indices: false },
      { kind: 'array', label: 'high half: min-heap (shown sorted, top = smallest)', items: high.slice(), tones: tones.high, indices: false },
      { kind: 'vars', items: [['median', median]] as [string, Cell][], tones: median === null ? {} : { 0: 'match' } },
    ],
  });
  frames.push(view('Keep the smaller half in a max-heap and the larger half in a min-heap. The median sits at the tops, so it is always one or two lookups away.', {}, null));
  for (const x of stream) {
    let note: string;
    if (low.length === 0 || x <= low[low.length - 1]) {
      insertSorted(low, x);
      note = `Add ${x}: it is not above the top of the low half, so it joins the low half.`;
    } else {
      insertSorted(high, x);
      note = `Add ${x}: it is above the top of the low half, so it joins the high half.`;
    }
    if (low.length > high.length + 1) {
      const moved = low.pop()!;
      insertSorted(high, moved);
      note += ` The low half now has 2 more items: move its top (${moved}) across.`;
    } else if (high.length > low.length) {
      const moved = high.shift()!;
      insertSorted(low, moved);
      note += ` The high half is now bigger: move its top (${moved}) across.`;
    }
    const median = low.length > high.length ? low[low.length - 1] : (low[low.length - 1] + high[0]) / 2;
    medians.push(median);
    note +=
      low.length > high.length
        ? ` Odd count: the median is the top of the low half, ${median}.`
        : ` Even count: the median is the average of both tops, (${low[low.length - 1]} + ${high[0]}) / 2 = ${median}.`;
    frames.push(view(note, { low: { [low.length - 1]: 'active' }, high: high.length ? { 0: 'info' } : {} }, median));
  }
  frames.push(view(`Each add is two or three heap operations, O(log n); reading the median is O(1).`, {}, medians[medians.length - 1] ?? null));
  return { frames, medians };
}

/** Requests in the last `span` milliseconds: a queue of times, dropping old ones from the front. */
export function recentCounter(times: number[], span: number): { frames: Frame[]; counts: number[] } {
  const queue: number[] = [];
  const counts: number[] = [];
  const frames: Frame[] = [];
  frames.push({
    note: `Times arrive in increasing order. Keep them in a queue; anything older than t − ${span} can never count again, so it leaves from the front.`,
    parts: [{ kind: 'queue', label: 'request times', items: [] }],
  });
  for (const t of times) {
    queue.push(t);
    const dropped: number[] = [];
    while (queue[0] < t - span) dropped.push(queue.shift()!);
    counts.push(queue.length);
    frames.push({
      note: `ping(${t}): add it at the back. The window is [${t - span}, ${t}]. ${dropped.length ? `Drop ${dropped.join(', ')} from the front.` : 'Nothing is too old.'} Count = ${queue.length}.`,
      parts: [
        { kind: 'queue', label: 'request times', items: queue.slice(), tones: { [queue.length - 1]: 'match' } },
        { kind: 'vars', items: [['window starts at', t - span], ['count', queue.length]] },
      ],
    });
  }
  frames.push({ note: 'Every time enters the queue once and leaves once, so each ping is O(1) amortised and memory holds only the current window.', parts: [{ kind: 'queue', label: 'request times', items: queue.slice() }] });
  return { frames, counts };
}
