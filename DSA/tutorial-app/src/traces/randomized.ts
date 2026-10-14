// Walkthrough frames for chapter 78, produced by running each algorithm for real.
// Random choices are passed in, so every run of the walkthrough shows the same story.
import type { Frame, Tone, Viz } from '../viz/types';

/** Fisher–Yates: for i from the end down to 1, swap position i with a uniformly random j in [0, i]. */
export function fisherYates(input: (number | string)[], picks: number[]): { frames: Frame[]; result: (number | string)[] } {
  const a = [...input];
  const n = a.length;
  if (picks.length !== n - 1) throw new Error('fisherYates needs one pick per position from n − 1 down to 1');
  const frames: Frame[] = [];
  const view = (note: string, i: number, j?: number, settledFrom = n): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'array being shuffled (green = final)',
        items: [...a],
        window: i >= 0 ? [0, i] : undefined,
        tones: Object.fromEntries(
          a
            .map((_, k): [number, Tone | undefined] => [k, k >= settledFrom ? 'match' : k === j ? 'warn' : k === i ? 'active' : undefined])
            .filter(([, t]) => t),
        ),
        pointers: i >= 0 ? (j !== undefined && j !== i ? [{ name: 'i', at: i }, { name: 'j', at: j, tone: 'warn' }] : [{ name: j === i ? 'i = j' : 'i', at: i }]) : [],
      },
    ],
  });
  frames.push(view(`The bracket marks the part not yet decided. Each step picks one of its cells uniformly at random to fill the last undecided position.`, n - 1));
  for (let step = 0, i = n - 1; i >= 1; i--, step++) {
    const j = picks[step];
    if (j < 0 || j > i) throw new Error(`pick ${j} is outside [0, ${i}]`);
    const before = a[j];
    [a[i], a[j]] = [a[j], a[i]];
    frames.push(
      view(
        j === i
          ? `i = ${i}: the random index j is ${j}, the same cell, so ${a[i]} stays. Each of the ${i + 1} undecided values had chance 1/${i + 1} of landing here.`
          : `i = ${i}: random j = ${j} among 0…${i}. Swap ${before} into position ${i}; it is now final. Chance for each undecided value: 1/${i + 1}.`,
        i,
        j,
        i,
      ),
    );
  }
  frames.push(view(`Done after ${n - 1} picks. Every ordering had probability 1/${n} × 1/${n - 1} × … × 1/2 = 1/${n}!, so all ${n}! orders are equally likely.`, -1, undefined, 0));
  return { frames, result: a };
}

const perms = (items: number[]): number[][] =>
  items.length <= 1 ? [items] : items.flatMap((x, i) => perms([...items.slice(0, i), ...items.slice(i + 1)]).map((p) => [x, ...p]));

/** Count, over every possible sequence of random picks, how often each final order appears: naive "swap with any position" versus Fisher–Yates. */
export function shuffleCounts(n: number): { orders: string[]; naive: number[]; fisherYates: number[]; parts: Viz[] } {
  const base = Array.from({ length: n }, (_, i) => i + 1);
  const orders = perms(base).map((p) => p.join(''));
  const naive = new Array<number>(orders.length).fill(0);
  const fy = new Array<number>(orders.length).fill(0);
  // Naive: for each i, swap with any j in [0, n − 1]: nⁿ equally likely pick sequences.
  const total = n ** n;
  for (let code = 0; code < total; code++) {
    const a = [...base];
    let c = code;
    for (let i = 0; i < n; i++) {
      const j = c % n;
      c = Math.floor(c / n);
      [a[i], a[j]] = [a[j], a[i]];
    }
    naive[orders.indexOf(a.join(''))]++;
  }
  // Fisher–Yates: for i from n − 1 down, j in [0, i]: n! equally likely pick sequences.
  const go = (a: number[], i: number) => {
    if (i < 1) {
      fy[orders.indexOf(a.join(''))]++;
      return;
    }
    for (let j = 0; j <= i; j++) {
      const b = [...a];
      [b[i], b[j]] = [b[j], b[i]];
      go(b, i - 1);
    }
  };
  go(base, n - 1);
  return {
    orders,
    naive,
    fisherYates: fy,
    parts: [
      { kind: 'bars', label: `naive shuffle: how many of the ${total} pick sequences give each order`, values: naive, tones: Object.fromEntries(naive.map((v, i): [number, Tone] => [i, v > total / orders.length ? 'bad' : 'info'])) },
      { kind: 'bars', label: `Fisher–Yates: how many of the ${orders.length} pick sequences give each order`, values: fy, tones: Object.fromEntries(fy.map((_, i): [number, Tone] => [i, 'match'])) },
      { kind: 'array', label: 'order for each bar', items: orders },
    ],
  };
}
