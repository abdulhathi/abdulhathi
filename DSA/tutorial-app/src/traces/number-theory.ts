// Walkthrough frames for chapter 72, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Euclid's algorithm: gcd(a, b) = gcd(b, a mod b) until the remainder is 0. */
export function euclid(a0: number, b0: number): { frames: Frame[]; gcd: number } {
  const frames: Frame[] = [];
  const rows: Cell[][] = [];
  let a = a0;
  let b = b0;
  const table = (active: number, done = false): Frame['parts'][number] => ({
    kind: 'grid',
    label: 'each row replaces (a, b) by (b, a mod b)',
    colHeaders: ['a', 'b', 'a mod b'],
    cells: rows.map((r) => [...r]),
    tones: Object.fromEntries(
      rows.flatMap((_, r) =>
        r === active ? [[`${r},0`, 'active' as Tone], [`${r},1`, 'active' as Tone], [`${r},2`, (done ? 'match' : 'warn') as Tone]] : [[`${r},0`, 'done' as Tone], [`${r},1`, 'done' as Tone], [`${r},2`, 'done' as Tone]],
      ),
    ),
  });
  rows.push([a, b, null]);
  frames.push({
    note: `Start with a = ${a} and b = ${b}. Any number that divides both also divides a − b, a − 2b, … and so the remainder a mod b.`,
    parts: [table(0)],
  });
  while (b !== 0) {
    const r = a % b;
    rows[rows.length - 1][2] = r;
    frames.push({
      note: `${a} = ${Math.floor(a / b)} × ${b} + ${r}. The common divisors of (${a}, ${b}) are exactly the common divisors of (${b}, ${r}).`,
      parts: [table(rows.length - 1)],
    });
    a = b;
    b = r;
    if (b !== 0) rows.push([a, b, null]);
  }
  frames.push({
    note: `The remainder reached 0, so the last non-zero value, ${a}, divides everything above it: gcd(${a0}, ${b0}) = ${a}.`,
    parts: [table(rows.length - 1, true), { kind: 'vars', items: [['gcd', a]], tones: { 0: 'match' } }],
  });
  return { frames, gcd: a };
}

/** Sieve of Eratosthenes on 2..n: every prime p crosses out p², p² + p, p² + 2p, … */
export function sieve(n: number): { frames: Frame[]; primes: number[] } {
  const frames: Frame[] = [];
  const composite = new Array<boolean>(n + 1).fill(false);
  const items = Array.from({ length: n - 1 }, (_, i) => i + 2);
  const view = (note: string, active?: number, justCrossed: number[] = []): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: `numbers 2 to ${n}`,
        items,
        indices: false,
        tones: Object.fromEntries(
          items.map((v, i) => {
            if (v === active) return [i, 'active' as Tone];
            if (justCrossed.includes(v)) return [i, 'bad' as Tone];
            if (composite[v]) return [i, 'dim' as Tone];
            if (active !== undefined && v < active) return [i, 'match' as Tone];
            return [i, undefined];
          }).filter(([, t]) => t !== undefined),
        ),
      },
    ],
  });
  frames.push(view('Start with every number from 2 marked "maybe prime". The smallest unmarked number is always a prime.'));
  for (let p = 2; p * p <= n; p++) {
    if (composite[p]) continue;
    const crossed: number[] = [];
    for (let m = p * p; m <= n; m += p) {
      if (!composite[m]) crossed.push(m);
      composite[m] = true;
    }
    frames.push(
      view(
        `${p} is prime. Cross out its multiples, starting at ${p}² = ${p * p}${crossed.length ? `. Newly crossed: ${crossed.join(', ')}` : ''}.${
          p > 2 ? ` Any multiple of ${p} below ${p * p} has a smaller prime factor, so it is already crossed out.` : ''
        }`,
        p,
        crossed,
      ),
    );
  }
  const primes = items.filter((v) => !composite[v]);
  frames.push({
    note: `Once p² passes ${n}, stop: every number left unmarked is prime. There are ${primes.length} of them.`,
    parts: [
      {
        kind: 'array',
        label: `numbers 2 to ${n}`,
        items,
        indices: false,
        tones: Object.fromEntries(items.map((v, i) => [i, (composite[v] ? 'dim' : 'match') as Tone])),
      },
    ],
  });
  return { frames, primes };
}

/** Fast power by repeated squaring: walk the exponent's bits from the lowest. */
export function fastPow(base0: number, exp0: number, mod: number): { frames: Frame[]; result: number } {
  const frames: Frame[] = [];
  const bits = exp0.toString(2).split('').map(Number);
  let result = 1;
  let base = base0 % mod;
  let exp = exp0;
  let k = 0;
  const view = (note: string, active: number, used: boolean): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: `exponent ${exp0} in binary (lowest bit on the right)`,
        items: bits,
        indices: false,
        tones: Object.fromEntries(
          bits.map((_, i) => {
            const fromRight = bits.length - 1 - i;
            if (fromRight === active) return [i, (used ? 'match' : 'warn') as Tone];
            if (fromRight < active) return [i, 'done' as Tone];
            return [i, undefined];
          }).filter(([, t]) => t !== undefined),
        ),
      },
      { kind: 'vars', items: [['power of base', base], ['result', result]], tones: used ? { 1: 'match' } : {} },
    ],
  });
  frames.push({
    note: `Compute ${base0}^${exp0} mod ${mod}. Instead of ${exp0} multiplications, write ${exp0} in binary and multiply only the powers base¹, base², base⁴, … whose bit is 1.`,
    parts: [
      { kind: 'array', label: `exponent ${exp0} in binary (lowest bit on the right)`, items: bits, indices: false },
      { kind: 'vars', items: [['power of base', base], ['result', result]] },
    ],
  });
  while (exp > 0) {
    const bit = exp & 1;
    if (bit) result = (result * base) % mod;
    frames.push(
      view(
        bit
          ? `Bit ${k} is 1, so multiply the result by base^${2 ** k} (which is ${base} mod ${mod}): result = ${result}.`
          : `Bit ${k} is 0: skip base^${2 ** k}.`,
        k,
        bit === 1,
      ),
    );
    base = (base * base) % mod;
    exp = Math.floor(exp / 2);
    k++;
  }
  frames.push({
    note: `All ${bits.length} bits used: ${base0}^${exp0} mod ${mod} = ${result}, after about 2 × ${bits.length} multiplications instead of ${exp0}.`,
    parts: [{ kind: 'vars', items: [['result', result]], tones: { 0: 'match' } }],
  });
  return { frames, result };
}
