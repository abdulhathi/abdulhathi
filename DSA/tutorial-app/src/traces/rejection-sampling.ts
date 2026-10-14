// Walkthrough frames for chapter 80. The rand7 results are passed in, so the story is the same every time.
import type { Cell, Frame, Tone, Viz } from '../viz/types';

/** The 7 × 7 table of rand7 pairs: cells 1..40 map to 1..10, cells 41..49 are rejected. */
function table(highlight?: [number, number], verdict?: Tone): Viz {
  const cells: Cell[][] = [];
  const tones: Partial<Record<string, Tone>> = {};
  for (let r = 0; r < 7; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < 7; c++) {
      const idx = r * 7 + c + 1;
      row.push(idx <= 40 ? ((idx - 1) % 10) + 1 : '✗');
      if (idx > 40) tones[`${r},${c}`] = 'dim';
    }
    cells.push(row);
  }
  if (highlight) tones[`${highlight[0] - 1},${highlight[1] - 1}`] = verdict ?? 'active';
  return {
    kind: 'grid',
    label: 'first rand7 (row) × second rand7 (column) → result; ✗ = try again',
    rowHeaders: ['1', '2', '3', '4', '5', '6', '7'],
    colHeaders: ['1', '2', '3', '4', '5', '6', '7'],
    cells,
    tones,
  };
}

export function rand10Table(): Viz {
  return table();
}

/** rand10 from rand7: idx = (a − 1) × 7 + b is uniform on 1..49; accept 1..40 and return (idx − 1) mod 10 + 1. */
export function rand10Walkthrough(rolls: number[]): { frames: Frame[]; results: number[]; calls: number } {
  const frames: Frame[] = [];
  const results: number[] = [];
  let calls = 0;
  frames.push({
    note: 'Two rand7 calls pick one of 49 equally likely cells. 40 cells are split evenly among 1…10 (four cells each); the other 9 cells mean "roll again".',
    parts: [table()],
  });
  for (let p = 0; p + 1 < rolls.length; p += 2) {
    const a = rolls[p];
    const b = rolls[p + 1];
    calls += 2;
    const idx = (a - 1) * 7 + b;
    const ok = idx <= 40;
    const value = ok ? ((idx - 1) % 10) + 1 : null;
    if (value !== null) results.push(value);
    frames.push({
      note: ok
        ? `rand7 gave ${a} then ${b}: cell ${idx}, which maps to ${value}. Accept and return ${value}.`
        : `rand7 gave ${a} then ${b}: cell ${idx} is one of the 9 leftovers. Reject it and roll both again; keeping it would make some results more likely than others.`,
      parts: [table([a, b], ok ? 'match' : 'bad'), { kind: 'vars', items: [['rand7 calls so far', calls], ['results', results.join(', ') || '—']] }],
    });
  }
  frames.push({
    note: `Each attempt succeeds with probability 40/49, so on average it takes 49/40 attempts: 2 × 49/40 = 2.45 rand7 calls per rand10.`,
    parts: [table(), { kind: 'vars', items: [['expected calls', 2.45]], tones: { 0: 'match' } }],
  });
  return { frames, results, calls };
}
