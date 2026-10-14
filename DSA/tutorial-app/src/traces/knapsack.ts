// Walkthrough frames for chapter 53 (Knapsack DP), produced by running each algorithm for real.
import type { ArrayViz, Cell, Frame, Tone } from '../viz/types';

const tf = (b: boolean): Cell => (b ? 'T' : 'F');

/** 0/1 subset sum: for each item, sweep the sums from high to low so the item is used at most once. */
export function subsetSum(nums: number[], target: number): { frames: Frame[]; can: boolean[] } {
  const can = new Array<boolean>(target + 1).fill(false);
  can[0] = true;
  const frames: Frame[] = [];
  const table = (tones: Partial<Record<number, Tone>>, pointers: ArrayViz['pointers'] = []): ArrayViz => ({
    kind: 'array',
    label: 'can[s]: some chosen items add up to s',
    items: can.map(tf),
    tones,
    pointers,
  });
  frames.push({
    note: `can[s] says whether some of the items seen so far add up to exactly s. Before any item, only the empty choice exists: can[0] = T.`,
    parts: [{ kind: 'array', label: 'items', items: nums }, table({ 0: 'match' })],
  });
  nums.forEach((x, k) => {
    for (let s = target; s >= x; s--) {
      const was = can[s];
      const from = can[s - x];
      if (!was && from) can[s] = true;
      const changed = !was && from;
      frames.push({
        note: was
          ? `Item ${x}, sum ${s}: already reachable without it. Nothing to do.`
          : changed
            ? `Item ${x}, sum ${s}: can[${s - x}] is T, so adding ${x} reaches ${s}. Set can[${s}] = T.`
            : `Item ${x}, sum ${s}: can[${s - x}] is F, so ${x} cannot complete ${s} yet.`,
        parts: [
          { kind: 'array', label: 'items', items: nums, tones: { [k]: 'active' } },
          table({ [s]: changed ? 'match' : 'active', [s - x]: from ? 'info' : 'dim' }, [{ name: 's', at: s }, { name: 's − x', at: s - x, tone: 'info' }]),
        ],
      });
    }
  });
  frames.push({
    note: `All items done. can[${target}] = ${tf(can[target])}. Going from high sums to low meant every read of can[s − x] still saw the table before this item: no item was used twice.`,
    parts: [{ kind: 'array', label: 'items', items: nums }, table({ [target]: can[target] ? 'match' : 'bad' })],
  });
  return { frames, can };
}

/** What one item does to the table in each loop direction, for the "why downwards" figure. */
export function oneItemBothWays(x: number, target: number): { down: Cell[]; up: Cell[] } {
  const down = new Array<boolean>(target + 1).fill(false);
  const up = new Array<boolean>(target + 1).fill(false);
  down[0] = up[0] = true;
  for (let s = target; s >= x; s--) if (down[s - x]) down[s] = true;
  for (let s = x; s <= target; s++) if (up[s - x]) up[s] = true;
  return { down: down.map(tf), up: up.map(tf) };
}

/** Coin Change (fewest coins): unbounded, so amounts go upwards and a coin may be reused. */
export function coinChange(coins: number[], amount: number): { frames: Frame[]; fewest: number } {
  const best: (number | null)[] = new Array(amount + 1).fill(null);
  best[0] = 0;
  const frames: Frame[] = [];
  const view = (note: string, a: number | null, tones: Partial<Record<number, Tone>> = {}): Frame => ({
    note,
    parts: [
      { kind: 'set', label: 'coins (unlimited copies)', items: coins },
      { kind: 'array', label: 'fewest[a]: fewest coins that make amount a (empty = impossible)', items: best.map((v) => (v === null ? null : v === Infinity ? '∞' : v)), tones, pointers: a === null ? [] : [{ name: 'a', at: a }] },
    ],
  });
  frames.push(view('fewest[0] = 0: no coins make 0. Every other amount is filled from smaller amounts, in increasing order.', 0, { 0: 'match' }));
  for (let a = 1; a <= amount; a++) {
    let bestVal = Infinity;
    let bestCoin = -1;
    for (const c of coins) {
      if (c <= a && best[a - c] !== null && best[a - c] !== Infinity && (best[a - c] as number) + 1 < bestVal) {
        bestVal = (best[a - c] as number) + 1;
        bestCoin = c;
      }
    }
    best[a] = bestVal;
    const tones: Partial<Record<number, Tone>> = {};
    for (const c of coins) if (c <= a) tones[a - c] = c === bestCoin ? 'info' : 'dim';
    tones[a] = bestCoin >= 0 ? 'match' : 'bad';
    const options = coins.filter((c) => c <= a).map((c) => `${c} → fewest[${a - c}] + 1 = ${best[a - c] === Infinity ? '∞' : (best[a - c] as number) + 1}`);
    frames.push(
      view(
        bestCoin >= 0
          ? `Amount ${a}: the last coin is one of ${options.join('; ')}. Best: ${bestVal}.`
          : `Amount ${a}: no coin leads back to a reachable amount, so ${a} cannot be made.`,
        a,
        tones,
      ),
    );
  }
  const fewest = best[amount] === Infinity ? -1 : (best[amount] as number);
  frames.push(view(fewest >= 0 ? `fewest[${amount}] = ${fewest}. Reading amounts upwards let the same coin be used again and again.` : `${amount} cannot be made: the answer is −1.`, amount, { [amount]: fewest >= 0 ? 'match' : 'bad' }));
  return { frames, fewest };
}
