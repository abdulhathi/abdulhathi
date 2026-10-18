// A fixed-window rate limit: at most `limit` requests per key in each window (one minute by default).
// Simple and cheap. Its weakness: a client can send up to 2 x limit around a window boundary.
// In production keep the counts in Redis (INCR plus EXPIRE), so every server instance shares them.
export class FixedWindowLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private limit: number;
  private windowMs: number;
  private now: () => number;
  constructor(limit: number, windowMs = 60_000, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Counts one request. Returns 0 if it may go ahead, or the milliseconds until the next window. */
  hit(key: string): number {
    const now = this.now();
    const start = now - (now % this.windowMs);
    let w = this.windows.get(key);
    if (!w || w.start !== start) {
      w = { start, count: 0 };
      this.windows.set(key, w);
    }
    if (w.count >= this.limit) return start + this.windowMs - now;
    w.count += 1;
    return 0;
  }
}
