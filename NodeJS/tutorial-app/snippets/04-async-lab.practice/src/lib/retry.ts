import { setTimeout as sleep } from 'node:timers/promises';

/** Calls fn until it succeeds, waiting longer after each failure (100, 200, 400 ms …). */
export async function retry<T>(fn: () => Promise<T>, attempts = 3, baseDelayMs = 100): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1);
      console.log(`  attempt ${attempt} failed (${(err as Error).message}), retrying in ${delay} ms`);
      await sleep(delay);
    }
  }
}
