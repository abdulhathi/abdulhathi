// Walkthrough frames for the state machine DP chapter, produced by running each algorithm for real.
import type { Cell, Frame, Tone } from '../viz/types';

/** Stock with cooldown: three states per day (hold, sold today, rest), filled one day at a time. */
export function stockCooldown(prices: number[]): { frames: Frame[]; answer: number; table: number[][] } {
  const n = prices.length;
  const hold: number[] = [];
  const sold: number[] = [];
  const rest: number[] = [];
  const frames: Frame[] = [];
  const grid = (upTo: number, focus: number): Frame['parts'][number] => {
    const cells: Cell[][] = [hold, sold, rest].map((row) => Array.from({ length: n }, (_, d) => (d <= upTo ? row[d] : null)));
    const tones: Partial<Record<string, Tone>> = {};
    if (focus >= 0) for (let r = 0; r < 3; r++) tones[`${r},${focus}`] = 'active';
    return {
      kind: 'grid',
      label: 'best profit at the end of each day, by state',
      cells,
      rowHeaders: ['hold', 'sold', 'rest'],
      colHeaders: prices.map((p, d) => `d${d}: ${p}`),
      tones,
    };
  };
  hold[0] = -prices[0];
  sold[0] = -Infinity;
  rest[0] = 0;
  frames.push({
    note: `Day 0. To hold a share you must have bought it today: −${prices[0]}. Selling today is impossible (−∞). Resting with no share: 0.`,
    parts: [grid(0, 0)],
  });
  for (let d = 1; d < n; d++) {
    const p = prices[d];
    hold[d] = Math.max(hold[d - 1], rest[d - 1] - p);
    sold[d] = hold[d - 1] + p;
    rest[d] = Math.max(rest[d - 1], sold[d - 1]);
    frames.push({
      note: `Day ${d}, price ${p}. hold = max(keep holding ${hold[d - 1]}, buy from rest ${rest[d - 1]} − ${p}) = ${hold[d]}. sold = hold yesterday + ${p} = ${sold[d]}. rest = max(rest ${rest[d - 1]}, cool down after selling ${Number.isFinite(sold[d - 1]) ? sold[d - 1] : '−∞'}) = ${rest[d]}.`,
      parts: [grid(d, d)],
    });
  }
  const answer = Math.max(sold[n - 1], rest[n - 1], 0);
  const final = grid(n - 1, -1) as Extract<Frame['parts'][number], { kind: 'grid' }>;
  final.tones = { [`1,${n - 1}`]: sold[n - 1] >= rest[n - 1] ? 'match' : 'dim', [`2,${n - 1}`]: rest[n - 1] >= sold[n - 1] ? 'match' : 'dim' };
  frames.push({ note: `Finish without a share: the answer is max(sold, rest) on the last day = ${answer}. Ending in hold would mean a share you never sold.`, parts: [final] });
  return { frames, answer, table: [hold, sold, rest] };
}

/** At most two transactions: four running states, updated in order each day. */
export function stockTwoTransactions(prices: number[]): { frames: Frame[]; answer: number } {
  let buy1 = -Infinity;
  let sell1 = 0;
  let buy2 = -Infinity;
  let sell2 = 0;
  const frames: Frame[] = [];
  const view = (d: number, changed: number[]): Frame['parts'] => [
    { kind: 'array', label: 'prices', items: prices, pointers: d >= 0 ? [{ name: 'day', at: d }] : [], tones: d >= 0 ? { [d]: 'active' } : {} },
    {
      kind: 'vars',
      label: 'best profit so far in each state',
      items: [['buy1', buy1], ['sell1', sell1], ['buy2', buy2], ['sell2', sell2]],
      tones: Object.fromEntries(changed.map((i) => [i, 'match' as Tone])),
    },
  ];
  frames.push({
    note: 'Four states, in the order they can happen: bought once, sold once, bought twice, sold twice. Nothing is bought yet, so the buy states start at −∞.',
    parts: view(-1, []),
  });
  prices.forEach((p, d) => {
    const before = [buy1, sell1, buy2, sell2];
    buy1 = Math.max(buy1, -p);
    sell1 = Math.max(sell1, buy1 + p);
    buy2 = Math.max(buy2, sell1 - p);
    sell2 = Math.max(sell2, buy2 + p);
    const after = [buy1, sell1, buy2, sell2];
    const changed = after.map((v, i) => (v !== before[i] ? i : -1)).filter((i) => i >= 0);
    const names = ['buy1', 'sell1', 'buy2', 'sell2'];
    frames.push({
      note: `Price ${p}. ${
        changed.length ? `Improved: ${changed.map((i) => `${names[i]} → ${after[i]}`).join(', ')}.` : 'No state improves today.'
      } Each state only looks at the one before it: buy2 builds on sell1, so the second purchase is paid for out of the first profit.`,
      parts: view(d, changed),
    });
  });
  frames.push({ note: `After the last day, sell2 = ${sell2} is the best profit with at most two transactions (it also covers using only one).`, parts: view(-1, [3]) });
  return { frames, answer: sell2 };
}
