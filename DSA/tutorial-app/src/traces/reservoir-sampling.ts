// Walkthrough frames for chapter 79, produced by running the algorithm's probabilities exactly.
import type { Frame, Tone } from '../viz/types';

/** Exact probabilities in algorithm R with a reservoir of size k: after item i, every item seen so far is kept with probability k / i. */
export function reservoirProbabilities(stream: (number | string)[], k = 1): { frames: Frame[]; finalChance: number[] } {
  const frames: Frame[] = [];
  const chance: number[] = [];
  const frac = (num: number, den: number) => {
    const g = (a: number, b: number): number => (b ? g(b, a % b) : a);
    const d = g(num, den);
    return num === den ? '1' : `${num / d}/${den / d}`;
  };
  const view = (i: number, note: string): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'stream (arrives left to right)',
        items: stream.map((v, j) => (j < i ? v : null)),
        tones: Object.fromEntries(stream.map((_, j): [number, Tone | undefined] => [j, j === i - 1 ? 'active' : j < i ? 'info' : undefined]).filter(([, t]) => t)),
      },
      {
        kind: 'array',
        label: `chance each item is in the reservoir (size ${k})`,
        items: stream.map((_, j) => (j < i ? frac(Math.min(k, i), i) : null)),
        indices: false,
        tones: Object.fromEntries(stream.map((_, j): [number, Tone | undefined] => [j, j < i ? 'match' : undefined]).filter(([, t]) => t)),
      },
    ],
  });
  for (let i = 1; i <= stream.length; i++) {
    for (let j = 0; j < i; j++) chance[j] = Math.min(k, i) / i;
    if (i <= k) {
      frames.push(view(i, `Item ${i} (${stream[i - 1]}) arrives and the reservoir has room, so it goes straight in: chance 1.`));
    } else {
      frames.push(
        view(
          i,
          `Item ${i} (${stream[i - 1]}) is kept with probability ${frac(k, i)}${k > 1 ? `, replacing a random one of the ${k} kept items` : ', replacing the current pick'}. An earlier item survives with (${frac(Math.min(k, i - 1), i - 1)}) × (1 − ${frac(1, i)}) = ${frac(k, i)}: everyone is still equal.`,
        ),
      );
    }
  }
  return { frames, finalChance: chance };
}
