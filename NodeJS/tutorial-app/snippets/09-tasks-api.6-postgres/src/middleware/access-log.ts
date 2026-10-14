import type { RequestHandler } from 'express';
import type { Logger } from '../logger.ts';

/** One structured line per request, at a level that matches the outcome. */
export function accessLog(log: Logger): RequestHandler {
  return (req, res, next) => {
    const start = performance.now();
    res.on('finish', () => {
      const status = res.statusCode;
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      const ms = Math.round((performance.now() - start) * 10) / 10;
      log[level]({ method: req.method, url: req.originalUrl, status, ms }, 'request finished');
    });
    next();
  };
}
