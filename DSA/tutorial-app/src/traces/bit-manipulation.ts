// Walkthrough frames for chapter 06, produced by running each bit trick for real.
import type { ArrayViz, Frame, Tone } from '../viz/types';

/** The bits of n as an array, most significant first, padded to `width`. */
export function bitsOf(n: number, width: number): number[] {
  return n.toString(2).padStart(width, '0').split('').map(Number);
}

const bitRow = (label: string, n: number, width: number, tones: Partial<Record<number, Tone>> = {}): ArrayViz => ({
  kind: 'array',
  label: `${label} = ${n}`,
  items: bitsOf(n, width),
  indices: false,
  tones,
});

/** Brian Kernighan's trick: n & (n − 1) clears the lowest set bit, so the loop runs once per 1-bit. */
export function kernighan(n: number, width = 8): { frames: Frame[]; count: number } {
  const frames: Frame[] = [];
  let count = 0;
  let x = n;
  const lowest = (v: number) => width - 1 - Math.log2(v & -v);
  frames.push({
    note: `Count the 1-bits of ${n} without looking at every position. Each round removes exactly one 1-bit.`,
    parts: [bitRow('n', x, width), { kind: 'vars', items: [['count', count]] }],
  });
  while (x !== 0) {
    const pos = lowest(x);
    const next = x & (x - 1);
    count++;
    frames.push({
      note: `Subtracting 1 flips the lowest 1-bit to 0 and every 0 below it to 1. ANDing with n keeps everything above and clears that lowest 1-bit. Count = ${count}.`,
      parts: [
        bitRow('n', x, width, { [pos]: 'bad' }),
        bitRow('n − 1', x - 1, width, Object.fromEntries(Array.from({ length: width - pos }, (_, k) => [pos + k, 'warn' as Tone]))),
        bitRow('n & (n − 1)', next, width, { [pos]: 'match' }),
        { kind: 'vars', items: [['count', count]], tones: { 0: 'match' } },
      ],
    });
    x = next;
  }
  frames.push({
    note: `n is 0, so every 1-bit is gone. ${n} has ${count} set bits, found in ${count} rounds rather than ${width}.`,
    parts: [bitRow('n', 0, width), { kind: 'vars', items: [['count', count]], tones: { 0: 'match' } }],
  });
  return { frames, count };
}

/** XOR every value together: pairs cancel (a ^ a = 0) and the single value survives (a ^ 0 = a). */
export function xorSingle(nums: number[], width = 4): { frames: Frame[]; single: number } {
  const frames: Frame[] = [];
  let acc = 0;
  frames.push({
    note: 'Start with 0. XOR is like a light switch per bit: applying the same value twice switches every bit back.',
    parts: [{ kind: 'array', label: 'nums', items: nums }, bitRow('running XOR', acc, width)],
  });
  nums.forEach((v, i) => {
    const before = acc;
    acc ^= v;
    const changed = Object.fromEntries(
      bitsOf(before ^ acc, width).map((b, k) => [k, b ? 'active' : undefined]).filter(([, t]) => t),
    ) as Partial<Record<number, Tone>>;
    const seenBefore = nums.slice(0, i).includes(v);
    frames.push({
      note: `XOR in ${v} (${bitsOf(v, width).join('')}): running value ${before} becomes ${acc}.${seenBefore ? ` This is the second ${v}, so its bits switch back off.` : ''}`,
      parts: [
        { kind: 'array', label: 'nums', items: nums, tones: { [i]: seenBefore ? 'done' : 'active' }, pointers: [{ name: 'i', at: i }] },
        bitRow('running XOR', acc, width, changed),
      ],
    });
  });
  frames.push({
    note: `Every value that appears twice has cancelled itself out. What is left, ${acc}, is the value that appears once.`,
    parts: [{ kind: 'array', label: 'nums', items: nums, tones: Object.fromEntries(nums.map((v, i) => [i, v === acc ? 'match' : 'dim'])) }, bitRow('running XOR', acc, width, Object.fromEntries(bitsOf(acc, width).map((_, k) => [k, 'match' as Tone])))],
  });
  return { frames, single: acc };
}

/** Counting bits for 0..n with one rule: bits(i) = bits(i >> 1) + (i & 1). */
export function countingBits(n: number): { frames: Frame[]; ans: number[] } {
  const ans: number[] = Array(n + 1).fill(0);
  const frames: Frame[] = [];
  const width = Math.max(1, n.toString(2).length);
  const table = (upTo: number, i?: number) => ({
    kind: 'array' as const,
    label: 'ones in i',
    items: ans.map((v, k) => (k <= upTo ? v : null)),
    tones: i === undefined ? {} : ({ [i]: 'match', [i >> 1]: 'info' } as Partial<Record<number, Tone>>),
    pointers: i === undefined ? [] : i >> 1 === i ? [{ name: 'i', at: i }] : [{ name: 'i', at: i }, { name: 'i >> 1', at: i >> 1, tone: 'info' as Tone }],
  });
  frames.push({ note: '0 has no 1-bits. Every larger number reuses an answer you already have.', parts: [table(0)] });
  for (let i = 1; i <= n; i++) {
    ans[i] = ans[i >> 1] + (i & 1);
    frames.push({
      note: `${i} is ${i.toString(2)}. Shifting right drops its last bit and gives ${i >> 1} (${(i >> 1).toString(2) || '0'}), which has ${ans[i >> 1]} ones. The dropped bit is ${i & 1}, so ${i} has ${ans[i]}.`,
      parts: [table(i, i), bitRow('i', i, width, { [width - 1]: 'warn' })],
    });
  }
  frames.push({ note: `All ${n + 1} answers, each from one earlier answer in O(1): O(n) in total.`, parts: [table(n)] });
  return { frames, ans };
}
