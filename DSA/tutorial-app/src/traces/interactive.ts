// Walkthrough frames for chapter 81. A mock judge answers the queries, so every call is counted.
import type { Cell, Frame, Tone } from '../viz/types';

/** First Bad Version: binary search for the first index where the judge says "bad", counting API calls. */
export function firstBadVersion(n: number, firstBad: number): { frames: Frame[]; answer: number; calls: number } {
  let calls = 0;
  const known = new Map<number, boolean>(); // version → is bad, for the versions we asked about
  const isBad = (v: number) => {
    calls++;
    known.set(v, v >= firstBad);
    return v >= firstBad;
  };
  const frames: Frame[] = [];
  const view = (lo: number, hi: number, note: string, asked?: number): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'versions (the judge knows which are bad; you only see what you ask)',
        items: Array.from({ length: n }, (_, i): Cell => {
          const v = i + 1;
          return known.has(v) ? (known.get(v) ? 'bad' : 'ok') : v;
        }),
        window: [lo - 1, hi - 1],
        tones: Object.fromEntries(
          Array.from({ length: n }, (_, i): [number, Tone | undefined] => {
            const v = i + 1;
            if (v === asked) return [i, 'active'];
            if (known.has(v)) return [i, known.get(v) ? 'bad' : 'match'];
            if (v < lo || v > hi) return [i, 'dim'];
            return [i, undefined];
          }).filter(([, t]) => t),
        ),
        pointers: lo === hi ? [{ name: 'lo = hi', at: lo - 1, tone: 'match' }] : [{ name: 'lo', at: lo - 1 }, { name: 'hi', at: hi - 1, tone: 'info' }],
      },
      { kind: 'vars', items: [['API calls', calls]] },
    ],
  });
  let lo = 1;
  let hi = n;
  frames.push(view(lo, hi, `The first bad version is somewhere in 1…${n}, and version ${n} is known to be bad. Each question halves the range.`));
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const bad = isBad(mid);
    if (bad) hi = mid;
    else lo = mid + 1;
    frames.push(
      view(
        lo,
        hi,
        bad
          ? `Ask about ${mid}: bad. The first bad version is ${mid} or earlier, so hi = ${mid}.`
          : `Ask about ${mid}: good. Everything up to ${mid} is good, so lo = ${mid + 1}.`,
        mid,
      ),
    );
  }
  frames.push(view(lo, hi, `lo meets hi at ${lo}: the first bad version, found with ${calls} calls instead of up to ${n}. In general ⌈log₂ n⌉ ≈ 31 calls for n = 2³¹ − 1.`));
  return { frames, answer: lo, calls };
}

/** Find in Mountain Array: binary search for the peak, then search the rising and falling sides, counting get() calls. */
export function mountainSearch(arr: number[], target: number): { frames: Frame[]; answer: number; calls: number } {
  let calls = 0;
  const seen = new Map<number, number>();
  const get = (i: number) => {
    calls++;
    seen.set(i, arr[i]);
    return arr[i];
  };
  const frames: Frame[] = [];
  const view = (note: string, lo: number, hi: number, active: number[] = [], found?: number): Frame => ({
    note,
    parts: [
      {
        kind: 'bars',
        label: 'mountain array (bars you have read are coloured)',
        values: arr,
        tones: Object.fromEntries(
          arr.map((_, i): [number, Tone | undefined] => [i, i === found ? 'match' : active.includes(i) ? 'active' : seen.has(i) ? 'info' : i < lo || i > hi ? 'dim' : undefined]).filter(([, t]) => t),
        ),
        pointers: lo <= hi ? (lo === hi ? [{ name: 'lo=hi', at: lo }] : [{ name: 'lo', at: lo }, { name: 'hi', at: hi, tone: 'info' }]) : [],
      },
      { kind: 'vars', items: [['target', target], ['get() calls', calls]] },
    ],
  });
  const n = arr.length;
  let lo = 0;
  let hi = n - 1;
  frames.push(view(`Phase 1: find the peak. Compare arr[mid] with arr[mid + 1]: rising means the peak is to the right.`, lo, hi));
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const a = get(mid);
    const b = get(mid + 1);
    if (a < b) lo = mid + 1;
    else hi = mid;
    frames.push(view(a < b ? `arr[${mid}] = ${a} < arr[${mid + 1}] = ${b}: still climbing, so the peak is after ${mid}.` : `arr[${mid}] = ${a} > arr[${mid + 1}] = ${b}: going down, so the peak is at ${mid} or before.`, lo, hi, [mid, mid + 1]));
  }
  const peak = lo;
  const search = (l: number, h: number, ascending: boolean, phase: string): number => {
    frames.push(view(`${phase}: binary search the ${ascending ? 'rising' : 'falling'} side ${l}…${h} for ${target}.`, l, h));
    while (l <= h) {
      const mid = Math.floor((l + h) / 2);
      const v = get(mid);
      if (v === target) {
        frames.push(view(`arr[${mid}] = ${v}: found it.`, l, h, [mid], mid));
        return mid;
      }
      if (v < target === ascending) l = mid + 1;
      else h = mid - 1;
      frames.push(view(`arr[${mid}] = ${v} is ${v < target ? 'too small' : 'too big'}; on a ${ascending ? 'rising' : 'falling'} side that means look ${l > mid ? 'right' : 'left'}.`, l, h, [mid]));
    }
    return -1;
  };
  let answer = search(0, peak, true, `Phase 2 (peak at index ${peak})`);
  if (answer === -1) answer = search(peak + 1, n - 1, false, 'Phase 3, because the rising side does not contain it');
  frames.push(view(answer === -1 ? `Not found on either side: return −1 after ${calls} calls.` : `Answer ${answer}, the smallest index holding ${target} (the rising side is checked first). ${calls} calls, well under the limit of 100.`, 0, -1, [], answer === -1 ? undefined : answer));
  return { frames, answer, calls };
}
