import { setTimeout as sleep } from 'node:timers/promises';

/** Pretends to be a database or HTTP call that takes `ms` milliseconds. */
export async function slowSquare(n: number, ms = 300): Promise<number> {
  await sleep(ms);
  return n * n;
}

/** Milliseconds since `start`, rounded to the nearest 10. */
export function since(start: number): string {
  return `${Math.round((performance.now() - start) / 10) * 10} ms`;
}
