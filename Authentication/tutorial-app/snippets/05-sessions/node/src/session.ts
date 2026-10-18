// Server-side sessions with express-session. The browser holds only a signed, random id; the data stays in the store.
import type { NextFunction, Request, Response } from 'express';
import session from 'express-session';
import { randomToken, sameToken } from './tokens.ts';

// What this app keeps in each session.
declare module 'express-session' {
  interface SessionData {
    email: string;
    csrfToken: string;
    createdAt: number; // when the user signed in: for the absolute timeout
    lastSeenAt: number; // the latest request: for the idle timeout
  }
}

export const COOKIE = 'sid';
export const IDLE_MS = 30 * 60 * 1000; // signed out after 30 minutes without a request
export const ABSOLUTE_MS = 8 * 60 * 60 * 1000; // and 8 hours after sign-in, however active

/** The cookie's flags. Sign-out repeats them: a deletion only replaces a cookie with the same name, path and domain. */
export const cookieFlags = (secure: boolean) => ({ httpOnly: true, secure, sameSite: 'lax', path: '/' }) as const;

type Options = { secure: boolean; secret: string; store: session.Store };

export function sessions({ secure, secret, store }: Options) {
  return session({
    name: COOKIE,
    secret, // signs the id in the cookie: defense in depth; the 256 random bits are what protect it
    store, // MemoryStore here; in production a shared store such as Redis (connect-redis) or a database table
    genid: randomToken, // 256 random bits (the default is 192)
    resave: false,
    saveUninitialized: false, // no session, and no cookie, until someone signs in
    rolling: true, // send the cookie again on every response, so its expiry slides with the idle timeout
    cookie: { ...cookieFlags(secure), maxAge: IDLE_MS },
  });
}

export const regenerate = (req: Request) =>
  new Promise<void>((ok, fail) => req.session.regenerate((err) => (err ? fail(err) : ok())));
export const destroy = (req: Request) =>
  new Promise<void>((ok, fail) => req.session.destroy((err) => (err ? fail(err) : ok())));

/**
 * Lets a request through only with a live session. The server checks the times itself: the cookie's expiry is only
 * a hint to the browser, and a stolen cookie can be replayed whatever it says.
 */
export function requireSession(now: () => number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const s = req.session;
    if (!s.email) return res.status(401).json({ error: 'Sign in first.' });
    const t = now();
    if (t - (s.lastSeenAt ?? 0) > IDLE_MS || t - (s.createdAt ?? 0) > ABSOLUTE_MS) {
      await destroy(req); // expired: delete it on the server, not only in the browser
      return res.status(401).json({ error: 'Sign in first.' });
    }
    s.lastSeenAt = t;
    next();
  };
}

/**
 * The synchronizer token pattern: the token lives in the session, and every state-changing request must send it
 * back in a header. Another site can make the browser send the cookie, but it cannot read the token.
 */
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (!sameToken(req.get('X-CSRF-Token') ?? '', req.session.csrfToken ?? '')) {
    return res.status(403).json({ error: 'Missing or invalid CSRF token.' });
  }
  next();
}
