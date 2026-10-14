// Walkthrough frames for the Counting, bucket and radix sort chapter, produced by running each algorithm for real.
import type { Cell, Frame } from '../viz/types';

/** Counting sort: tally how often each small value occurs, then write each value out that many times. */
export function countingSort(input: number[], maxValue: number): { frames: Frame[]; sorted: number[] } {
  const count = new Array<number>(maxValue + 1).fill(0);
  const frames: Frame[] = [];
  frames.push({
    note: `Every value is between 0 and ${maxValue}, so make a count array with one slot per possible value. Its index is the value; its content is how many times the value appears.`,
    parts: [
      { kind: 'array', label: 'input', items: input },
      { kind: 'array', label: 'count (index = value)', items: [...count] },
    ],
  });
  input.forEach((v, i) => {
    count[v]++;
    frames.push({
      note: `Read ${v}: add one to count[${v}]. No comparisons with other values are needed.`,
      parts: [
        { kind: 'array', label: 'input', items: input, tones: { [i]: 'active' }, pointers: [{ name: 'read', at: i }] },
        { kind: 'array', label: 'count (index = value)', items: [...count], tones: { [v]: 'active' } },
      ],
    });
  });
  const out: Cell[] = new Array(input.length).fill(null);
  let w = 0;
  for (let v = 0; v <= maxValue; v++) {
    if (count[v] === 0) continue;
    for (let c = 0; c < count[v]; c++) out[w++] = v;
    frames.push({
      note: `count[${v}] is ${count[v]}: write ${v} into the output ${count[v] === 1 ? 'once' : `${count[v]} times`}. Walking the counts from small to large gives sorted order.`,
      parts: [
        { kind: 'array', label: 'count (index = value)', items: [...count], tones: { [v]: 'match' } },
        { kind: 'array', label: 'output', items: [...out], tones: Object.fromEntries(Array.from({ length: count[v] }, (_, k) => [w - 1 - k, 'match' as const])) },
      ],
    });
  }
  const sorted = out as number[];
  frames.push({
    note: `Sorted in O(n + k): one pass over the ${input.length} values and one pass over the ${maxValue + 1} counts.`,
    parts: [{ kind: 'array', label: 'output', items: sorted }],
  });
  return { frames, sorted };
}

/** LSD radix sort: stable bucket passes by the ones digit, then the tens, then the hundreds. */
export function radixSort(input: number[]): { frames: Frame[]; sorted: number[] } {
  let a = [...input];
  const frames: Frame[] = [];
  const digits = String(Math.max(...a)).length;
  frames.push({
    note: `Sort by one digit at a time, starting from the last digit. Each pass drops every number into one of 10 buckets by that digit, keeping their current order inside each bucket.`,
    parts: [{ kind: 'array', label: 'numbers', items: a }],
  });
  const names = ['ones', 'tens', 'hundreds', 'thousands', 'ten-thousands'];
  for (let d = 0, place = 1; d < digits; d++, place *= 10) {
    const buckets: number[][] = Array.from({ length: 10 }, () => []);
    for (const x of a) buckets[Math.floor(x / place) % 10].push(x);
    frames.push({
      note: `Pass ${d + 1}: drop each number into the bucket of its ${names[d]} digit, reading left to right. Numbers that share a digit keep their order.`,
      parts: [
        { kind: 'array', label: 'before this pass', items: a },
        {
          kind: 'map',
          label: `buckets by ${names[d]} digit`,
          keyTitle: 'digit',
          valueTitle: 'numbers',
          entries: buckets.map((b, i) => [i, b.join(', ')] as [Cell, Cell]).filter(([, v]) => v !== ''),
        },
      ],
    });
    a = buckets.flat();
    frames.push({
      note: `Read the buckets back in order 0 to 9. The list is now sorted by the last ${d + 1} digit${d ? 's' : ''}${d + 1 === digits ? ', which means fully sorted' : ''}.`,
      parts: [{ kind: 'array', label: `after pass ${d + 1}`, items: a, tones: d + 1 === digits ? Object.fromEntries(a.map((_, i) => [i, 'match' as const])) : {} }],
    });
  }
  return { frames, sorted: a };
}
