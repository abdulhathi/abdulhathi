// Walkthrough frames for chapter 05, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Exponentiation by squaring: read the exponent's bits from the right, squaring the base each step. */
export function fastPower(x: number, n: number): { frames: Frame[]; result: number; multiplications: number } {
  const bits = n.toString(2).split('').map(Number); // most significant first
  const frames: Frame[] = [];
  let result = 1;
  let base = x;
  let e = n;
  let mults = 0;
  let pos = bits.length - 1; // index in `bits` of the bit being read
  // Bits to the right of `pos` have been read already.
  const view = (note: string, tone: Tone): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: `${n} in binary`,
        items: bits,
        indices: false,
        tones: {
          ...Object.fromEntries(bits.map((_, i) => [i, 'done' as Tone]).filter(([i]) => (i as number) > pos)),
          ...(pos >= 0 ? { [pos]: tone } : {}),
        },
        pointers: pos >= 0 ? [{ name: 'bit', at: pos, tone }] : [],
      },
      { kind: 'vars', items: [['base', base], ['result', result], ['multiplications', mults]], tones: tone === 'match' ? { 1: 'match' } : {} },
    ],
  });
  frames.push(view(`Write ${n} in binary. ${x}^${n} is the product of ${x}^(2ᵏ) for every bit k that is 1. Start with result = 1 and base = ${x} = ${x}^1.`, 'active'));
  let k = 0;
  while (e > 0) {
    const bit = e % 2;
    const power = 2 ** k;
    if (bit === 1) {
      result *= base;
      mults++;
    }
    const usedBase = base;
    e = Math.floor(e / 2);
    const note =
      bit === 1
        ? `Bit ${k} is 1, so multiply the result by base = ${x}^${power} = ${usedBase}. Result is now ${result}.`
        : `Bit ${k} is 0, so ${x}^${power} is not part of the answer. The result stays ${result}.`;
    frames.push(view(e > 0 ? `${note} Then square the base for the next bit.` : note, bit === 1 ? 'match' : 'dim'));
    if (e > 0) {
      base *= base;
      mults++;
    }
    pos--;
    k++;
  }
  frames.push(view(`All ${bits.length} bits read: ${x}^${n} = ${result}, using ${mults} multiplications instead of ${n - 1}.`, 'match'));
  return { frames, result, multiplications: mults };
}

/** Newton's method for the integer square root: guess ← (guess + x / guess) / 2, rounded down. */
export function newtonSqrt(x: number): { frames: Frame[]; root: number } {
  const frames: Frame[] = [];
  const guesses: Cell[] = [];
  let r = x;
  const view = (note: string, tone: Tone): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'guesses so far', items: [...guesses], tones: { [guesses.length - 1]: tone } },
      { kind: 'vars', items: [['x', x], ['guess', r], ['guess²', r * r]], tones: { 2: r * r > x ? 'bad' : 'match' } },
    ],
  });
  guesses.push(r);
  frames.push(view(`Start with the guess ${x} itself. It is far too big: ${r}² = ${r * r}.`, 'active'));
  while (r * r > x) {
    const q = Math.floor(x / r);
    const next = Math.floor((r + q) / 2);
    r = next;
    guesses.push(r);
    frames.push(
      view(
        r * r > x
          ? `x ÷ guess = ${q}. The true root lies between ${q} and the old guess, so average them: ${r}. Still ${r}² = ${r * r} > ${x}.`
          : `Average the guess with x ÷ guess (${q}): ${r}. Now ${r}² = ${r * r} ≤ ${x}, so stop.`,
        r * r > x ? 'active' : 'match',
      ),
    );
  }
  frames.push(view(`The integer square root of ${x} is ${r}. Each step roughly doubles the number of correct digits once the guess is close.`, 'match'));
  return { frames, root: r };
}

/** Grade-school multiplication of two digit strings into a position array: digit i × digit j lands at i + j + 1. */
export function multiplyStrings(a: string, b: string): { frames: Frame[]; product: string } {
  const frames: Frame[] = [];
  const res: number[] = Array(a.length + b.length).fill(0);
  const A = a.split('');
  const B = b.split('');
  const view = (note: string, i: number | null, j: number | null, hi: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'array', label: 'num1', items: A, tones: i !== null ? { [i]: 'active' } : {}, pointers: i !== null ? [{ name: 'i', at: i }] : [] },
      { kind: 'array', label: 'num2', items: B, tones: j !== null ? { [j]: 'info' } : {}, pointers: j !== null ? [{ name: 'j', at: j, tone: 'info' }] : [] },
      { kind: 'array', label: 'result positions', items: [...res], tones: hi },
    ],
  });
  frames.push(view(`A product of an m-digit and an n-digit number has at most m + n digits, so make ${res.length} slots of 0.`, null, null));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      const mul = Number(A[i]) * Number(B[j]);
      const sum = mul + res[i + j + 1];
      res[i + j + 1] = sum % 10;
      res[i + j] += Math.floor(sum / 10);
      frames.push(
        view(
          `${A[i]} × ${B[j]} = ${mul}. Add it to slot ${i + j + 1}: keep ${sum % 10} there and carry ${Math.floor(sum / 10)} into slot ${i + j}.`,
          i,
          j,
          { [i + j + 1]: 'match', [i + j]: 'warn' },
        ),
      );
    }
  }
  let start = 0;
  while (start < res.length - 1 && res[start] === 0) start++;
  const product = res.slice(start).join('');
  frames.push(view(`Every pair of digits has been used. Drop leading zeros: the product is ${product}.`, null, null, Object.fromEntries(res.map((_, k) => [k, (k < start ? 'dim' : 'match') as Tone]))));
  return { frames, product };
}
