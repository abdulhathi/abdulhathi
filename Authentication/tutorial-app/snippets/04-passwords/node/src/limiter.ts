// Locks an account for 15 minutes after 5 failed sign-ins in a row. A success clears the count.
// In production keep this in Redis or the database, so every server instance sees the same counts.
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;

type Entry = { failures: number; lockedUntil: number };

export class LoginLimiter {
  private entries = new Map<string, Entry>();
  private now: () => number;
  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** Milliseconds until this account may try again, or 0 if it may try now. */
  retryAfter(key: string): number {
    const e = this.entries.get(key);
    return e && e.lockedUntil > this.now() ? e.lockedUntil - this.now() : 0;
  }

  fail(key: string): void {
    const e = this.entries.get(key) ?? { failures: 0, lockedUntil: 0 };
    e.failures += 1;
    if (e.failures >= MAX_FAILURES) {
      e.lockedUntil = this.now() + LOCK_MS;
      e.failures = 0;
    }
    this.entries.set(key, e);
  }

  succeed(key: string): void {
    this.entries.delete(key);
  }
}
