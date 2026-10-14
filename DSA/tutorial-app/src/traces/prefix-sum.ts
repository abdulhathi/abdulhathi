// Walkthrough frames for chapter 20 (Prefix sums), produced by running each algorithm for real.
import type { Cell, Frame, Tone, Viz } from '../viz/types';

/** Negative numbers in sentences: a real minus sign, in brackets after a plus. */
const num = (c: Cell) => (typeof c === 'number' && c < 0 ? `−${-c}` : String(c));
const paren = (n: number) => (n < 0 ? `(${num(n)})` : String(n));

/** Build prefix[i] = sum of the first i values, then answer range queries as prefix[r + 1] − prefix[l]. */
export function rangeSums(nums: number[], queries: [number, number][]): { frames: Frame[]; prefix: number[]; answers: number[] } {
  const prefix: Cell[] = Array(nums.length + 1).fill(null);
  prefix[0] = 0;
  const frames: Frame[] = [];
  const view = (numTones: Partial<Record<number, Tone>>, preTones: Partial<Record<number, Tone>>, extra: Viz[] = [], win?: [number, number]): Viz[] => [
    { kind: 'array', label: 'nums', items: nums, tones: numTones, window: win },
    { kind: 'array', label: 'prefix (prefix[i] = sum of the first i values)', items: [...prefix], tones: preTones },
    ...extra,
  ];
  frames.push({ note: 'prefix has one more cell than nums. prefix[0] = 0: the sum of no values at all.', parts: view({}, { 0: 'match' }) });
  for (let i = 0; i < nums.length; i++) {
    prefix[i + 1] = (prefix[i] as number) + nums[i];
    frames.push({
      note: `prefix[${i + 1}] = prefix[${i}] + nums[${i}] = ${num(prefix[i])} + ${paren(nums[i])} = ${num(prefix[i + 1])}.`,
      parts: view({ [i]: 'active' }, { [i]: 'info', [i + 1]: 'match' }),
    });
  }
  const answers: number[] = [];
  for (const [l, r] of queries) {
    const ans = (prefix[r + 1] as number) - (prefix[l] as number);
    answers.push(ans);
    frames.push({
      note: `Sum of nums[${l}..${r}] = prefix[${r + 1}] − prefix[${l}] = ${prefix[r + 1]} − ${prefix[l]} = ${ans}. One subtraction, however long the range.`,
      parts: view(
        Object.fromEntries(Array.from({ length: r - l + 1 }, (_, k) => [l + k, 'match' as Tone])),
        { [r + 1]: 'active', [l]: 'bad' },
        [{ kind: 'vars', items: [['range', `[${l}, ${r}]`], ['sum', ans]], tones: { 1: 'match' } }],
        [l, r],
      ),
    });
  }
  return { frames, prefix: prefix as number[], answers };
}

/** Count subarrays summing to k: a subarray ending here sums to k when an earlier prefix equals (running sum − k). */
export function countSumK(nums: number[], k: number): { frames: Frame[]; count: number } {
  const seen = new Map<number, number>([[0, 1]]);
  let sum = 0;
  let count = 0;
  const frames: Frame[] = [];
  const view = (i: number, want: number | null, found: number, tones: Partial<Record<number, Tone>>): Viz[] => {
    const entries = [...seen.entries()];
    return [
      { kind: 'array', label: 'nums', items: nums, tones, pointers: i >= 0 && i < nums.length ? [{ name: 'i', at: i }] : [] },
      {
        kind: 'map',
        label: 'earlier prefix sums',
        keyTitle: 'prefix',
        valueTitle: 'times seen',
        entries,
        tones: want !== null ? Object.fromEntries(entries.map(([key], idx) => [idx, key === want ? 'match' : undefined]).filter(([, t]) => t)) : {},
      },
      { kind: 'vars', items: [['running sum', sum], ['looking for', want ?? '—'], ['count', count]], tones: found ? { 2: 'match' } : {} },
    ];
  };
  frames.push({ note: `Start with prefix 0 seen once: it stands for "the empty start", so a subarray beginning at index 0 can be counted. Target k = ${k}.`, parts: view(-1, null, 0, {}) });
  nums.forEach((x, i) => {
    sum += x;
    const want = sum - k;
    const found = seen.get(want) ?? 0;
    count += found;
    frames.push({
      note: found
        ? `Running sum ${sum}. A subarray ending at ${i} sums to ${k} if it starts right after a prefix of ${sum} − ${k} = ${want}. That prefix was seen ${found} time${found > 1 ? 's' : ''}, so add ${found} to the count.`
        : `Running sum ${sum}. We need an earlier prefix of ${sum} − ${k} = ${want}; none exists, so no subarray ending at ${i} works.`,
      parts: view(i, want, found, { [i]: found ? 'match' : 'active' }),
    });
    seen.set(sum, (seen.get(sum) ?? 0) + 1);
  });
  frames.push({ note: `Done: ${count} subarrays sum to ${k}. Negative numbers are fine here, unlike in a sliding window.`, parts: view(nums.length, null, 0, {}) });
  return { frames, count };
}

/** Difference array: each range update touches two cells; one prefix-sum pass rebuilds the final values. */
export function differenceArray(n: number, updates: [number, number, number][]): { frames: Frame[]; result: number[] } {
  const diff = Array(n + 1).fill(0) as number[];
  const frames: Frame[] = [];
  const view = (tones: Partial<Record<number, Tone>>, extra: Viz[] = []): Viz[] => [
    { kind: 'array', label: `diff (n + 1 = ${n + 1} cells)`, items: [...diff], tones },
    ...extra,
  ];
  frames.push({ note: `All ${n} values start at 0. Instead of adding to every cell of a range, mark where the change starts and where it stops.`, parts: view({}) });
  for (const [l, r, v] of updates) {
    diff[l] += v;
    diff[r + 1] -= v;
    frames.push({
      note: `Add ${v} to positions ${l}..${r}: add ${v} to diff[${l}] (start adding here) and subtract ${v} from diff[${r + 1}] (stop after ${r}). Two writes, whatever the length.`,
      parts: view({ [l]: 'match', [r + 1]: 'bad' }),
    });
  }
  const result: Cell[] = Array(n).fill(null);
  let run = 0;
  for (let i = 0; i < n; i++) {
    run += diff[i];
    result[i] = run;
    frames.push({
      note: `Prefix sum of diff: value[${i}] = ${num(run - diff[i])} + ${paren(diff[i])} = ${num(run)}.`,
      parts: view({ [i]: 'active' }, [{ kind: 'array', label: 'final values', items: [...result], tones: { [i]: 'match' } }]),
    });
  }
  return { frames, result: result as number[] };
}

/** 2D prefix sums: P[r][c] = sum of the rectangle above and left of (r, c), with a zero border. */
export function prefix2D(matrix: number[][]): { P: number[][]; rect: (r1: number, c1: number, r2: number, c2: number) => number } {
  const m = matrix.length;
  const n = matrix[0]?.length ?? 0;
  const P = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let r = 0; r < m; r++) {
    for (let c = 0; c < n; c++) P[r + 1][c + 1] = matrix[r][c] + P[r][c + 1] + P[r + 1][c] - P[r][c];
  }
  const rect = (r1: number, c1: number, r2: number, c2: number) => P[r2 + 1][c2 + 1] - P[r1][c2 + 1] - P[r2 + 1][c1] + P[r1][c1];
  return { P, rect };
}
