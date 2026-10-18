// A sliding-window limit: at most `limit` requests per key in any `windowMs`. Used twice, keyed by email address
// and by IP address. In production keep the counts in Redis so every server instance shares them.
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
  }

  /** Records a request and returns 0, or, when the key is over its limit, the milliseconds until it may try again. */
  take(key: string): number {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => t > now - this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return recent[0] + this.windowMs - now;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return 0;
  }
}
