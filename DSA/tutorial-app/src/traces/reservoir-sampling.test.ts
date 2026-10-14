import { describe, expect, it } from 'vitest';
import { reservoirProbabilities } from './reservoir-sampling';

// Exact check by enumerating every outcome of algorithm R for k = 1: item i replaces the pick with probability 1/i.
function exactChances(n: number): number[] {
  const p = new Array<number>(n).fill(0);
  for (let pick = 0; pick < n; pick++) {
    // The final pick is item `pick` when it was chosen at its arrival and never replaced afterwards.
    let chance = 1 / (pick + 1);
    for (let later = pick + 1; later < n; later++) chance *= 1 - 1 / (later + 1);
    p[pick] = chance;
  }
  return p;
}

describe('reservoir sampling trace', () => {
  it('keeps every item with the same probability', () => {
    const { finalChance } = reservoirProbabilities([4, 8, 15, 16, 23, 42]);
    for (const c of finalChance) expect(c).toBeCloseTo(1 / 6, 12);
    for (const c of exactChances(6)) expect(c).toBeCloseTo(1 / 6, 12);
  });

  it('works with a reservoir of size k', () => {
    const { finalChance, frames } = reservoirProbabilities(['a', 'b', 'c', 'd', 'e'], 2);
    for (const c of finalChance) expect(c).toBeCloseTo(2 / 5, 12);
    for (const f of frames) expect(f.note.length).toBeGreaterThan(10);
  });
});
