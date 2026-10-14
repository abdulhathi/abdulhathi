import type { RequestHandler, Response } from 'express';
import { UnauthorizedError } from '../errors.ts';
import type { TokenService } from './tokens.ts';

// Teach TypeScript about the field this middleware adds to res.locals.
declare global {
  namespace Express {
    interface Locals {
      userId?: string;
    }
  }
}

/** Accepts "Authorization: Bearer <token>" and records who is asking in res.locals.userId. */
export function requireAuth(tokens: TokenService): RequestHandler {
  return async (req, res, next) => {
    res.setHeader('WWW-Authenticate', 'Bearer'); // tells clients how to authenticate if we answer 401
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedError();
    res.locals.userId = await tokens.verify(token);
    next();
  };
}

/** The current user's id. Only valid in handlers behind requireAuth. */
export function userIdOf(res: Response): string {
  const userId = res.locals.userId;
  // Reaching here without requireAuth is a bug in our routing, so it is a 500, not a 401.
  if (!userId) throw new Error('userIdOf() used on a route without requireAuth');
  return userId;
}
