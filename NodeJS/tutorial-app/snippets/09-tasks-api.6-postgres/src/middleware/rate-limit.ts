import type { Request, RequestHandler } from 'express';
import { TooManyRequestsError } from '../errors.ts';

export type RateLimitOptions = { windowMs: number; max: number; key?: (req: Request) => string };

/**
 * Allows at most `max` requests per key in each window, then answers 429.
 * Counters live in this process's memory: fine for one instance; with
 * several instances each keeps its own count, so use a shared store such as Redis.
 */
export function rateLimit({ windowMs, max, key = (req) => req.ip ?? 'unknown' }: RateLimitOptions): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Forget expired windows now and then. unref() lets the process exit while this timer waits.
  setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.resetAt <= now) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const now = Date.now();
    const k = key(req);
    let entry = hits.get(k);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', Math.max(0, max - entry.count));
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      throw new TooManyRequestsError();
    }
    next();
  };
}
