// Exponential backoff with "full jitter": a random wait between 0 and min(max, base * 2^attempt).
// The randomness stops thousands of clients from reconnecting in lockstep after a server restart.

export type BackoffOptions = { baseMs?: number; maxMs?: number; random?: () => number };

export function backoffDelay(attempt: number, { baseMs = 500, maxMs = 10_000, random = Math.random }: BackoffOptions = {}): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(random() * ceiling);
}

/** setTimeout as a promise that rejects with an AbortError as soon as the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
