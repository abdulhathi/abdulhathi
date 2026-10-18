import type { NextFunction, Request, Response } from 'express';
import type { KeyStore } from './keys.ts';
import type { FixedWindowLimiter } from './limiter.ts';

/** The key from "Authorization: Bearer <key>" or "X-API-Key: <key>". Never from the URL. */
export function readKey(req: Request): string | undefined {
  const bearer = req.get('authorization')?.match(/^Bearer\s+(.*)$/i)?.[1].trim();
  return bearer || req.get('x-api-key') || undefined;
}

// RFC 6750 challenges: a bare "Bearer" when no key was sent, error="invalid_token" when the key was refused.
const unauthorized = (res: Response, error: string, challenge = 'Bearer') =>
  res.status(401).set('WWW-Authenticate', challenge).json({ error });

/**
 * Returns requireScope(scope): middleware for one endpoint that lets a request through only with a valid key,
 * within its rate limit, that holds `scope`. The key's record is left in res.locals.apiKey for the handler.
 */
export function apiKeyAuth(store: KeyStore, limiter: FixedWindowLimiter) {
  return (scope: string) => (req: Request, res: Response, next: NextFunction) => {
    // A key in the URL ends up in access logs, browser history and Referer headers. Refuse it loudly.
    if ('api_key' in req.query) return res.status(400).json({ error: 'Send the API key in a header, never in the URL.' });
    const presented = readKey(req);
    if (!presented) return unauthorized(res, 'Send an API key in the Authorization or X-API-Key header.');
    const result = store.verify(presented);
    if (!result.ok) return unauthorized(res, result.error, 'Bearer error="invalid_token"');
    const wait = limiter.hit(result.key.id); // counted per key, not per IP address
    if (wait > 0) {
      res.set('Retry-After', String(Math.ceil(wait / 1000)));
      return res.status(429).json({ error: 'Rate limit exceeded. Try again later.' });
    }
    if (!result.key.scopes.includes(scope)) {
      res.set('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}"`);
      return res.status(403).json({ error: `This key lacks the ${scope} scope.` });
    }
    res.locals.apiKey = result.key;
    next();
  };
}
