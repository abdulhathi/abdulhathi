import type { RequestHandler } from 'express';
import type { Logger } from '../logger.ts';

// Load balancers call these every few seconds; at info level they would drown the real traffic.
const PROBES = new Set(['/health', '/ready']);

/** One structured line per request, at a level that matches the outcome. */
export function accessLog(log: Logger): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      const status = res.statusCode;
      const ok = status < 400;
      const level = status >= 500 ? 'error' : !ok ? 'warn' : PROBES.has(req.path) ? 'debug' : 'info';
      const ms = Math.round((performance.now() - start) * 10) / 10;
      log[level]({ method: req.method, url: req.originalUrl, status, ms }, 'request finished');
    });
    next();
  };
}
