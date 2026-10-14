// Walkthrough frames for chapter 76, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Winning and losing positions for "remove a non-zero square number of stones": a position wins if some move reaches a losing one. */
export function squareGame(n: number): { frames: Frame[]; win: boolean[] } {
  const win = new Array<boolean>(n + 1).fill(false);
  const frames: Frame[] = [];
  const view = (upTo: number, note: string, active?: number, targets: number[] = [], chosen?: number): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'stones left → W (player to move wins) or L (loses)',
        items: win.map((w, i): Cell => (i <= upTo ? (w ? 'W' : 'L') : null)),
        tones: Object.fromEntries(
          win
            .map((w, i): [number, Tone | undefined] => {
              if (i === active) return [i, 'active'];
              if (i === chosen) return [i, 'match'];
              if (targets.includes(i)) return [i, 'bad'];
              if (i <= upTo) return [i, w ? 'info' : 'warn'];
              return [i, undefined];
            })
            .filter(([, t]) => t),
        ),
      },
    ],
  });
  frames.push(view(0, '0 stones: the player to move has no move and loses, so position 0 is L.', 0));
  for (let i = 1; i <= n; i++) {
    const targets: number[] = [];
    let chosen: number | undefined;
    for (let k = 1; k * k <= i; k++) {
      targets.push(i - k * k);
      if (!win[i - k * k] && chosen === undefined) chosen = i - k * k;
    }
    win[i] = chosen !== undefined;
    frames.push(
      view(
        i,
        chosen !== undefined
          ? `${i} stones: removing ${i - chosen} leaves ${chosen}, an L position for the opponent, so ${i} is W.`
          : `${i} stones: every move (to ${targets.join(', ')}) hands the opponent a W position, so ${i} is L.`,
        i,
        targets.filter((t) => t !== chosen),
        chosen,
      ),
    );
  }
  return { frames, win };
}

const neg = (x: number) => (x < 0 ? `(−${-x})` : String(x));
const num = (x: number) => (x < 0 ? `−${-x}` : String(x));
const lead = (x: number) => (x < 0 ? `behind by ${-x}` : `ahead by ${x}`);

/** Minimax on a row of numbers: best[i][j] = the most the player to move can finish ahead by on nums[i..j]. */
export function predictTheWinner(nums: number[]): { frames: Frame[]; diff: number } {
  const n = nums.length;
  const d: (number | null)[][] = Array.from({ length: n }, () => new Array<number | null>(n).fill(null));
  const frames: Frame[] = [];
  const view = (note: string, ci?: number, cj?: number, from: [number, number][] = []): Frame => {
    const tones: Partial<Record<string, Tone>> = {};
    for (const [a, b] of from) tones[`${a},${b}`] = 'info';
    if (ci !== undefined && cj !== undefined) tones[`${ci},${cj}`] = 'active';
    return {
      note,
      parts: [
        { kind: 'array', label: 'nums', items: nums, window: ci !== undefined && cj !== undefined ? [ci, cj] : undefined },
        {
          kind: 'grid',
          label: 'best[i][j]: how far ahead the player to move ends on nums[i..j]',
          rowHeaders: nums.map((_, i) => `i=${i}`),
          colHeaders: nums.map((_, j) => `j=${j}`),
          cells: d.map((row) => row.map((v) => v)),
          tones,
        },
      ],
    };
  };
  frames.push(view('Score difference makes the game symmetric: whoever moves wants to maximise (my total − opponent\'s total) on the numbers left.'));
  for (let i = n - 1; i >= 0; i--) {
    d[i][i] = nums[i];
    frames.push(view(`One number left (${nums[i]}): the player to move takes it, so best[${i}][${i}] = ${nums[i]}.`, i, i));
    for (let j = i + 1; j < n; j++) {
      const down = d[i + 1][j] as number;
      const across = d[i][j - 1] as number;
      const left = nums[i] - down;
      const right = nums[j] - across;
      const best = Math.max(left, right);
      d[i][j] = best;
      frames.push(
        view(
          `Take ${nums[i]} (left) and the opponent then finishes ${lead(down)} on the rest: ${nums[i]} − ${neg(down)} = ${num(left)}. Take ${nums[j]} (right): ${nums[j]} − ${neg(across)} = ${num(right)}. best[${i}][${j}] = ${num(best)}.`,
          i,
          j,
          [[i + 1, j], [i, j - 1]],
        ),
      );
    }
  }
  const diff = d[0][n - 1] as number;
  frames.push(view(`best[0][${n - 1}] = ${diff}: player 1 ${diff >= 0 ? 'finishes at least level, so player 1 wins (ties count for player 1)' : 'falls behind whatever they do, so player 2 wins'}.`, 0, n - 1));
  return { frames, diff };
}

/** Grundy numbers for Flip Game segments: a run of L '+' signs where a move turns "++" into "--". */
export function flipGrundy(maxLen: number): { frames: Frame[]; g: number[] } {
  const g: number[] = [];
  const frames: Frame[] = [];
  const view = (note: string, active?: number, options: number[] = []): Frame => ({
    note,
    parts: [
      {
        kind: 'array',
        label: 'run length L → Grundy number g(L)',
        items: Array.from({ length: maxLen + 1 }, (_, L): Cell => (L < g.length ? g[L] : null)),
        tones: active !== undefined ? { [active]: 'active' } : {},
      },
      { kind: 'set', label: 'values reachable in one move', items: [...new Set(options)].sort((a, b) => a - b) },
    ],
  });
  for (let L = 0; L <= maxLen; L++) {
    if (L < 2) {
      g.push(0);
      frames.push(view(`A run of ${L} plus sign${L === 1 ? '' : 's'} allows no move: g(${L}) = 0, a losing position on its own.`, L));
      continue;
    }
    const options: number[] = [];
    for (let i = 0; i + 2 <= L; i++) options.push(g[i] ^ g[L - 2 - i]);
    let mex = 0;
    while (options.includes(mex)) mex++;
    g.push(mex);
    frames.push(
      view(
        `Flipping two neighbours in a run of ${L} splits it into runs of i and ${L} − 2 − i, worth g(i) XOR g(${L - 2} − i). The smallest value missing from the set is g(${L}) = ${mex}.`,
        L,
        options,
      ),
    );
  }
  frames.push(view(`A whole board is a sum of independent runs: XOR their Grundy numbers. Non-zero means the player to move wins.`));
  return { frames, g };
}
