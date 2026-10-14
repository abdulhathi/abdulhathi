// Walkthrough frames for chapter 36 (Ordered sets and maps), produced by running each algorithm for real.
import type { Cell, Frame, Interval, Tone } from '../viz/types';

/** First index whose value is >= x in a sorted array (the "ceiling" position). */
function lowerBound(sorted: number[], x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * My Calendar with a sorted array standing in for an ordered map: binary search finds the
 * booking just after the new start (ceiling) and the one just before it (floor).
 */
export function calendarBookings(requests: [number, number][]) {
  const starts: number[] = [];
  const ends: number[] = [];
  const frames: Frame[] = [];
  const results: boolean[] = [];
  const max = Math.max(...requests.map(([, e]) => e));
  const picture = (extra?: Interval, tones: Partial<Record<number, Tone>> = {}, pointer?: number) => {
    const items: Interval[] = starts.map((s, i) => ({ start: s, end: ends[i], label: `[${s}, ${ends[i]})`, tone: tones[i] }));
    if (extra) items.push(extra);
    return [
      { kind: 'intervals' as const, label: 'bookings, sorted by start', items, min: 0, max },
      {
        kind: 'array' as const,
        label: 'sorted starts',
        items: [...starts] as Cell[],
        tones,
        pointers: pointer === undefined ? [] : [{ name: 'ceiling', at: pointer, tone: 'info' as Tone }],
      },
    ];
  };
  frames.push({ note: 'The calendar keeps its bookings sorted by start time. An ordered map would do this for us; here a sorted array plus binary search plays that role.', parts: picture() });

  for (const [s, e] of requests) {
    const i = lowerBound(starts, s); // first booking starting at or after s
    const after = i < starts.length ? i : -1;
    const before = i - 1 >= 0 ? i - 1 : -1;
    const clashAfter = after >= 0 && starts[after] < e;
    const clashBefore = before >= 0 && ends[before] > s;
    const ok = !clashAfter && !clashBefore;
    const tones: Partial<Record<number, Tone>> = {};
    if (after >= 0) tones[after] = clashAfter ? 'bad' : 'match';
    if (before >= 0) tones[before] = clashBefore ? 'bad' : 'match';
    const neighbours =
      before < 0 && after < 0
        ? 'There are no bookings yet, so nothing can clash.'
        : `Binary search puts the new start before index ${i}. Only two bookings can clash: the floor (the one just before${before >= 0 ? `, [${starts[before]}, ${ends[before]})` : ': none'}) and the ceiling (the one just after${after >= 0 ? `, [${starts[after]}, ${ends[after]})` : ': none'}).`;
    const verdict = ok
      ? ' Neither overlaps, so the booking is accepted and inserted at that position.'
      : clashBefore
        ? ` The floor ends at ${ends[before]}, after the new start ${s}: double booking, rejected.`
        : ` The ceiling starts at ${starts[after]}, before the new end ${e}: double booking, rejected.`;
    frames.push({
      note: `Request [${s}, ${e}). ${neighbours}${verdict}`,
      parts: picture({ start: s, end: e, label: `new [${s}, ${e})`, tone: ok ? 'active' : 'bad' }, tones, after >= 0 ? after : starts.length),
    });
    if (ok) {
      starts.splice(i, 0, s);
      ends.splice(i, 0, e);
    }
    results.push(ok);
  }
  frames.push({ note: `Done. Each request looked at just two neighbours, found by binary search, instead of every booking.`, parts: picture() });
  return { frames, results };
}

/** A binary heap ordered by `before(a, b)`: true when a should come out first. */
class Heap {
  items: number[] = [];
  constructor(private before: (a: number, b: number) => boolean) {}
  get size() {
    return this.items.length;
  }
  top() {
    return this.items[0];
  }
  push(x: number) {
    const a = this.items;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.before(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < a.length && this.before(a[l], a[best])) best = l;
        if (r < a.length && this.before(a[r], a[best])) best = r;
        if (best === i) break;
        [a[i], a[best]] = [a[best], a[i]];
        i = best;
      }
    }
    return top;
  }
}

/**
 * Sliding window median with two heaps and lazy deletion, the usual TypeScript stand-in for an
 * ordered multiset. Heaps hold indices; an index is stale once it has left the window, and it is
 * only thrown away when it reaches the top. `low` holds the smaller half, `high` the larger half.
 */
export function slidingMedian(nums: number[], k: number) {
  // Order by value, then by index, so equal values still have a strict order.
  const less = (a: number, b: number) => nums[a] < nums[b] || (nums[a] === nums[b] && a < b);
  const low = new Heap((a, b) => less(b, a)); // max-heap
  const high = new Heap((a, b) => less(a, b)); // min-heap
  let lowSize = 0; // live elements in low
  let highSize = 0;
  let start = 0; // first index inside the window
  const frames: Frame[] = [];
  const medians: number[] = [];

  const prune = (h: Heap) => {
    while (h.size && h.top() < start) h.pop();
  };
  const tidy = () => {
    prune(low);
    prune(high);
  };
  const rebalance = () => {
    tidy();
    if (lowSize > highSize + 1) {
      high.push(low.pop());
      lowSize--;
      highSize++;
    } else if (lowSize < highSize) {
      low.push(high.pop());
      lowSize++;
      highSize--;
    }
    tidy();
  };
  const add = (i: number) => {
    if (!low.size || less(i, low.top())) {
      low.push(i);
      lowSize++;
    } else {
      high.push(i);
      highSize++;
    }
  };
  // Every element of low is smaller than every element of high, so comparing with low's top tells where j lives.
  const remove = (j: number) => {
    if (low.size && !less(low.top(), j)) lowSize--;
    else highSize--;
  };
  const median = () => (k % 2 === 1 ? nums[low.top()] : (nums[low.top()] + nums[high.top()]) / 2);

  const heapView = (h: Heap, label: string, descending: boolean) => {
    const sorted = [...h.items].sort((a, b) => (descending ? (less(a, b) ? 1 : -1) : less(a, b) ? -1 : 1));
    const tones: Partial<Record<number, Tone>> = {};
    sorted.forEach((idx, pos) => {
      if (idx < start) tones[pos] = 'dim';
    });
    const topPos = sorted.indexOf(h.top());
    if (topPos >= 0 && tones[topPos] === undefined) tones[topPos] = 'active';
    return { kind: 'set' as const, label, items: sorted.map((idx) => nums[idx]) as Cell[], tones };
  };
  const view = (note: string): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'nums', items: nums, window: [start, start + k - 1], tones: { [start + k - 1]: 'active' } },
      heapView(low, `low half: max-heap, ${lowSize} live`, true),
      heapView(high, `high half: min-heap, ${highSize} live`, false),
      { kind: 'vars', items: [['median', medians[medians.length - 1]]], tones: { 0: 'match' } },
    ],
  });

  for (let i = 0; i < k; i++) {
    add(i);
    rebalance();
  }
  medians.push(median());
  frames.push(
    view(
      `Fill the first window. The smaller half goes in a max-heap, whose top is the largest small value; the larger half goes in a min-heap. When k is odd the low half holds one extra, so the median is its top: ${medians[0]}.`,
    ),
  );
  for (let i = k; i < nums.length; i++) {
    const j = i - k;
    start = j + 1;
    remove(j);
    add(i);
    rebalance();
    medians.push(median());
    const stale = [...low.items, ...high.items].filter((idx) => idx < start).length;
    frames.push(
      view(
        `Slide: ${nums[j]} leaves and ${nums[i]} enters. A heap cannot delete from its middle, so the leaving value only stops counting as live${
          stale ? ' and stays (dimmed) until it reaches a top' : ', and since it was at a top it is thrown away at once'
        }. Live sizes are rebalanced. Median: ${medians[medians.length - 1]}.`,
      ),
    );
  }
  return { frames, medians };
}
