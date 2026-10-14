import type { RequestHandler } from 'express';

/** Logs one line per request once the response has been sent. */
export const requestLog: RequestHandler = (req, res, next) => {
  const start = performance.now();
  res.on('finish', () => {
    const ms = (performance.now() - start).toFixed(1);
    console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} in ${ms} ms`);
  });
  next();
};
