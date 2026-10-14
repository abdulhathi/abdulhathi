// Walkthrough frames for the sparse table and sqrt decomposition chapter, produced by running each algorithm.
import type { Cell, Frame, Tone } from '../viz/types';

/** floor(log2(n)) for n ≥ 1. */
const log2 = (n: number) => 31 - Math.clz32(n);

/** Build a sparse table for range minimum, then answer one query with two overlapping blocks. */
export function sparseTable(nums: number[], query: [number, number]): { frames: Frame[]; table: number[][]; answer: number } {
  const n = nums.length;
  const table: number[][] = [nums.slice()];
  const frames: Frame[] = [];
  const grid = (focus: Partial<Record<string, Tone>> = {}) => {
    const rows: Cell[][] = table.map((row) => Array.from({ length: n }, (_, i) => (i < row.length ? row[i] : null)));
    return {
      kind: 'grid' as const,
      label: 'table[k][i] = min of the 2^k values starting at i',
      cells: rows,
      rowHeaders: table.map((_, k) => `len ${1 << k}`),
      colHeaders: nums.map((_, i) => String(i)),
      tones: focus,
    };
  };
  frames.push({
    note: 'Row 0 is the array itself: the minimum of a block of length 1 is the value.',
    parts: [{ kind: 'array', label: 'nums', items: nums }, grid(Object.fromEntries(nums.map((_, i) => [`0,${i}`, 'match' as Tone])))],
  });
  for (let k = 1; 1 << k <= n; k++) {
    const prev = table[k - 1];
    const half = 1 << (k - 1);
    const row: number[] = [];
    for (let i = 0; i + (1 << k) <= n; i++) row.push(Math.min(prev[i], prev[i + half]));
    table.push(row);
    const i = 0;
    frames.push({
      note: `Row ${k} (blocks of ${1 << k}): each entry is the min of two blocks of ${half} from row ${k - 1}. For example table[${k}][${i}] = min(${prev[i]}, ${prev[i + half]}) = ${row[i]}.`,
      parts: [grid({ [`${k - 1},${i}`]: 'info', [`${k - 1},${i + half}`]: 'warn', [`${k},${i}`]: 'active' })],
    });
  }
  const [l, r] = query;
  const k = log2(r - l + 1);
  const a = table[k][l];
  const b = table[k][r - (1 << k) + 1];
  const answer = Math.min(a, b);
  const tones: Partial<Record<number, Tone>> = {};
  for (let i = l; i < l + (1 << k); i++) tones[i] = 'info';
  for (let i = r - (1 << k) + 1; i <= r; i++) tones[i] = tones[i] ? 'active' : 'warn';
  frames.push({
    note: `Query min of [${l}, ${r}]: the length is ${r - l + 1}, and the largest power of two that fits is ${1 << k}. Cover the range with two blocks of ${1 << k}: one starting at ${l}, one ending at ${r}. They overlap, which is fine for min.`,
    parts: [
      { kind: 'array', label: 'nums', items: nums, tones, window: [l, r] },
      grid({ [`${k},${l}`]: 'info', [`${k},${r - (1 << k) + 1}`]: 'warn' }),
    ],
  });
  frames.push({
    note: `Answer = min(table[${k}][${l}], table[${k}][${r - (1 << k) + 1}]) = min(${a}, ${b}) = ${answer}. Two lookups, whatever the length: O(1) per query.`,
    parts: [
      { kind: 'array', label: 'nums', items: nums, tones, window: [l, r] },
      { kind: 'vars', items: [['left block', a], ['right block', b], ['min', answer]], tones: { 2: 'match' } },
    ],
  });
  return { frames, table, answer };
}

/** Sqrt decomposition for range sums: block sums, one query, one update, the same query again. */
export function sqrtBlocks(input: number[], query: [number, number], update: [number, number]): { frames: Frame[]; before: number; after: number } {
  const nums = input.slice();
  const n = nums.length;
  const size = Math.ceil(Math.sqrt(n));
  const blocks = Array.from({ length: Math.ceil(n / size) }, (_, b) => nums.slice(b * size, (b + 1) * size).reduce((s, v) => s + v, 0));
  const frames: Frame[] = [];
  // Even-numbered blocks are shaded so the block edges are visible.
  const shade = (extra: Partial<Record<number, Tone>> = {}): Partial<Record<number, Tone>> => {
    const t: Partial<Record<number, Tone>> = {};
    for (let i = 0; i < n; i++) if (Math.floor(i / size) % 2 === 0) t[i] = 'done';
    return { ...t, ...extra };
  };
  const view = (note: string, cellTones: Partial<Record<number, Tone>>, blockTones: Partial<Record<number, Tone>>, vars: [string, Cell][]): Frame => ({
    note,
    parts: [
      { kind: 'array', label: `nums (blocks of ${size}, shaded alternately)`, items: nums.slice(), tones: cellTones },
      { kind: 'array', label: 'block sums', items: blocks.slice(), tones: blockTones },
      ...(vars.length ? [{ kind: 'vars' as const, items: vars }] : []),
    ],
  });
  frames.push(view(`Cut the ${n} values into blocks of about √${n} ≈ ${size}, and store the sum of each block.`, shade(), {}, []));

  const sumRange = (l: number, r: number, label: string) => {
    let total = 0;
    const cellTones = shade();
    const blockTones: Partial<Record<number, Tone>> = {};
    const bl = Math.floor(l / size);
    const br = Math.floor(r / size);
    if (bl === br) {
      for (let i = l; i <= r; i++) {
        total += nums[i];
        cellTones[i] = 'active';
      }
      frames.push(view(`${label}: [${l}, ${r}] sits inside one block, so add its ${r - l + 1} values one by one.`, cellTones, blockTones, [['sum', total]]));
      return total;
    }
    for (let i = l; i < (bl + 1) * size; i++) {
      total += nums[i];
      cellTones[i] = 'active';
    }
    frames.push(view(`${label}: the left edge is partway into block ${bl}, so add those values one at a time.`, { ...cellTones }, {}, [['sum', total]]));
    for (let b = bl + 1; b < br; b++) {
      total += blocks[b];
      blockTones[b] = 'info';
    }
    if (br - bl > 1) {
      frames.push(view(`Blocks ${bl + 1} to ${br - 1} lie completely inside the range: add their stored sums, one step per block.`, { ...cellTones }, { ...blockTones }, [['sum', total]]));
    }
    for (let i = br * size; i <= r; i++) {
      total += nums[i];
      cellTones[i] = 'active';
    }
    frames.push(view(`Finally the part of block ${br} up to ${r}. Total = ${total}. At most about 3√n steps, instead of n.`, cellTones, blockTones, [['sum', total]]));
    return total;
  };

  const before = sumRange(query[0], query[1], 'Query');
  const [idx, val] = update;
  const b = Math.floor(idx / size);
  blocks[b] += val - nums[idx];
  const old = nums[idx];
  nums[idx] = val;
  frames.push(
    view(`Update nums[${idx}] from ${old} to ${val}: change the value and add the difference (${val - old}) to block ${b}'s sum. O(1).`, shade({ [idx]: 'warn' }), { [b]: 'warn' }, []),
  );
  const after = sumRange(query[0], query[1], 'Same query again');
  return { frames, before, after };
}
