// Walkthrough frames for chapter 49 (Greedy), produced by running each algorithm for real.
import type { Frame, Interval, Tone } from '../viz/types';

/** Jump Game: one scan that keeps the furthest reachable index. */
export function jumpGame(nums: number[]): { frames: Frame[]; canReach: boolean } {
  const frames: Frame[] = [];
  const last = nums.length - 1;
  let reach = 0;
  const view = (i: number, note: string, tone: Tone = 'active'): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'nums (max jump from each index)',
        items: nums,
        window: [0, Math.min(reach, last)],
        tones: i <= last ? { [i]: tone } : {},
        pointers: i <= last ? [{ name: 'i', at: i }] : [],
      },
      { kind: 'vars', items: [['reach', reach], ['last index', last]], tones: reach >= last ? { 0: 'match' } : {} },
    ],
  });
  frames.push(view(0, 'The shaded window is every index you can reach so far. At the start that is only index 0.'));
  for (let i = 0; i <= last; i++) {
    if (i > reach) {
      frames.push(view(i, `Index ${i} lies beyond the furthest reach (${reach}). No jump can land here, so the last index is out of reach.`, 'bad'));
      return { frames, canReach: false };
    }
    const before = reach;
    reach = Math.max(reach, i + nums[i]);
    frames.push(
      view(
        i,
        reach > before
          ? `From index ${i} you can jump up to ${nums[i]}, so you can reach index ${i + nums[i]}. The furthest reach grows to ${reach}.`
          : `From index ${i} you reach at most index ${i + nums[i]}, which is not further than ${before}. Nothing changes.`,
      ),
    );
    if (reach >= last) {
      frames.push(view(i, `The furthest reach (${reach}) covers the last index (${last}). You can get there, and you never had to choose specific jumps.`, 'match'));
      return { frames, canReach: true };
    }
  }
  return { frames, canReach: true };
}

/** Non-overlapping Intervals: sort by end, keep whatever starts after the last kept end. */
export function intervalScheduling(input: [number, number][]): { frames: Frame[]; kept: number; removed: number } {
  const sorted = [...input].sort((a, b) => a[1] - b[1]);
  const frames: Frame[] = [];
  const state: (Tone | undefined)[] = sorted.map(() => undefined);
  let lastEnd = -Infinity;
  let kept = 0;
  const items = (focus?: number): Interval[] =>
    sorted.map(([start, end], i) => ({ start, end, tone: i === focus ? (state[i] ?? 'active') : state[i] }));
  const view = (note: string, focus?: number): Frame => ({
    note,
    parts: [
      { kind: 'intervals', label: 'intervals, sorted by end', items: items(focus), marker: Number.isFinite(lastEnd) ? lastEnd : undefined },
      { kind: 'vars', items: [['last kept end', Number.isFinite(lastEnd) ? lastEnd : -Infinity], ['kept', kept], ['removed', state.filter((s) => s === 'bad').length]] },
    ],
  });
  frames.push(view('Sort the intervals by where they end. The interval that ends first leaves the most room for everything after it.'));
  sorted.forEach(([start, end], i) => {
    if (start >= lastEnd) {
      state[i] = 'match';
      kept++;
      const prev = lastEnd;
      lastEnd = end;
      frames.push(
        view(
          Number.isFinite(prev)
            ? `[${start}, ${end}] starts at ${start}, not before the last kept end (${prev}). Keep it; the red line moves to ${end}.`
            : `[${start}, ${end}] ends first of all. Keeping it is always safe. The red line marks its end, ${end}.`,
          i,
        ),
      );
    } else {
      state[i] = 'bad';
      frames.push(view(`[${start}, ${end}] starts at ${start}, before ${lastEnd}, so it overlaps a kept interval. Remove it: it also ends later, so it could only block more.`, i));
    }
  });
  const removed = sorted.length - kept;
  frames.push(view(`Done: ${kept} intervals kept, so the fewest you must remove is ${removed}.`));
  return { frames, kept, removed };
}

/** Candy: satisfy the left-neighbour rule, then the right-neighbour rule. */
export function candy(ratings: number[]): { frames: Frame[]; candies: number[]; total: number } {
  const n = ratings.length;
  const c = new Array<number>(n).fill(1);
  const frames: Frame[] = [];
  const view = (note: string, i: number | null, pass: string, changed = false): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'ratings', items: ratings, tones: i === null ? {} : { [i]: 'active', ...(pass === 'left' && i > 0 ? { [i - 1]: 'info' } : {}), ...(pass === 'right' && i < n - 1 ? { [i + 1]: 'info' } : {}) } },
      { kind: 'array', label: 'candies', items: [...c], tones: i === null ? {} : { [i]: changed ? 'match' : 'active' } },
      { kind: 'vars', items: [['pass', pass], ['total', c.reduce((a, b) => a + b, 0)]] },
    ],
  });
  frames.push(view('Everyone starts with one candy, the minimum the rules allow.', null, 'start'));
  for (let i = 1; i < n; i++) {
    if (ratings[i] > ratings[i - 1]) {
      c[i] = c[i - 1] + 1;
      frames.push(view(`Rating ${ratings[i]} beats the left neighbour's ${ratings[i - 1]}, so this child needs one more than them: ${c[i]}.`, i, 'left', true));
    } else {
      frames.push(view(`Rating ${ratings[i]} does not beat the left neighbour's ${ratings[i - 1]}, so the left rule asks nothing. Keep ${c[i]}.`, i, 'left'));
    }
  }
  for (let i = n - 2; i >= 0; i--) {
    if (ratings[i] > ratings[i + 1] && c[i] <= c[i + 1]) {
      c[i] = c[i + 1] + 1;
      frames.push(view(`Right to left: ${ratings[i]} beats the right neighbour's ${ratings[i + 1]}, so this child needs more than ${c[i + 1]}. Raise it to ${c[i]}.`, i, 'right', true));
    } else if (ratings[i] > ratings[i + 1]) {
      frames.push(view(`${ratings[i]} beats ${ratings[i + 1]}, but ${c[i]} is already more than ${c[i + 1]}. Keeping the larger amount satisfies both rules.`, i, 'right'));
    } else {
      frames.push(view(`Right to left: ${ratings[i]} does not beat ${ratings[i + 1]}. Nothing to fix.`, i, 'right'));
    }
  }
  const total = c.reduce((a, b) => a + b, 0);
  frames.push(view(`Both rules hold everywhere. The minimum total is ${total}.`, null, 'done'));
  return { frames, candies: c, total };
}
