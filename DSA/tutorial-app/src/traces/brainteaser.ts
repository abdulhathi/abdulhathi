// Walkthrough frames for chapter 77, produced by running each algorithm for real.
import type { Frame, Tone } from '../viz/types';

const ordinal = (k: number) => {
  const tail = k % 100 >= 11 && k % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[k % 10] ?? 'th';
  return `${k}${tail}`;
};

/** Bulb Switcher, simulated for a small n to expose the pattern: only perfect squares stay on. */
export function bulbs(n: number): { frames: Frame[]; on: number[] } {
  const state = new Array<boolean>(n).fill(false);
  const frames: Frame[] = [];
  const view = (note: string, toggled: number[] = [], final = false): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'bulb number (1-based) → ● on, ○ off',
        items: state.map((s) => (s ? '●' : '○')),
        indices: false,
        tones: Object.fromEntries(
          state
            .map((s, i): [number, Tone | undefined] => [i, toggled.includes(i) ? 'warn' : final && s ? 'match' : undefined])
            .filter(([, t]) => t),
        ),
      },
      { kind: 'array', label: 'bulb', items: state.map((_, i) => i + 1), indices: false },
    ],
  });
  frames.push(view(`Simulate small cases first. ${n} bulbs, all off.`));
  for (let round = 1; round <= n; round++) {
    const toggled: number[] = [];
    for (let b = round; b <= n; b += round) {
      state[b - 1] = !state[b - 1];
      toggled.push(b - 1);
    }
    frames.push(view(`Round ${round}: toggle every ${round === 1 ? '' : `${ordinal(round)} `}bulb (${toggled.map((i) => i + 1).join(', ')}).`, toggled));
  }
  const on = state.map((s, i) => (s ? i + 1 : 0)).filter(Boolean);
  frames.push(
    view(
      `Bulbs left on: ${on.join(', ')}. Pattern: perfect squares. Why: bulb k is toggled once per divisor of k, divisors come in pairs, and only squares have an unpaired divisor (√k), so only they are toggled an odd number of times.`,
      [],
      true,
    ),
  );
  return { frames, on };
}
