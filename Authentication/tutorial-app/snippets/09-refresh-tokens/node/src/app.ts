import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { ACCESS_TTL_S, DenyList, issueAccessToken, newSecret, verifyAccessToken, type User } from './access.ts';
import { RefreshStore, type Failure, type Issued } from './refresh.ts';

type Options = { now?: () => number; secret?: Uint8Array };

// A stand-in for chapter 04, to keep this chapter about tokens: a real app checks a slow, salted hash.
const USERS = [{ id: 'u_1001', email: 'ada@example.com', password: 'correct horse battery' }];

// The refresh token lives in a cookie that page scripts cannot read (HttpOnly), that travels only over HTTPS
// (Secure), that other sites cannot make the browser send (SameSite=Strict), and that is sent only to /auth/*.
const COOKIE = 'refresh_token';
const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' } as const;

const REFRESH_ERRORS: Record<Failure, string> = {
  invalid: 'Invalid refresh token.',
  reused: 'Refresh token reuse detected. Sign in again.',
  expired: 'Refresh token expired. Sign in again.',
};

export function createApp({ now = Date.now, secret = newSecret() }: Options = {}) {
  const store = new RefreshStore(now);
  const denied = new DenyList(now);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  async function sendTokens(res: Response, user: User, refresh: Issued) {
    res.cookie(COOKIE, refresh.token, { ...COOKIE_OPTIONS, maxAge: refresh.expiresAt - now() });
    res.set('Cache-Control', 'no-store'); // token responses must never be cached (RFC 6749, section 5.1)
    res.json({ access_token: await issueAccessToken(secret, user, now), token_type: 'Bearer', expires_in: ACCESS_TTL_S });
  }

  app.post('/auth/login', async (req, res) => {
    const user = USERS.find((u) => u.email === String(req.body?.email ?? '').trim().toLowerCase());
    if (!user || user.password !== String(req.body?.password ?? '')) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    await sendTokens(res, user, store.issue(user.id));
  });

  app.post('/auth/refresh', async (req, res) => {
    const presented = req.cookies?.[COOKIE];
    if (!presented) return res.status(401).json({ error: 'Missing refresh token.' });
    const result = store.rotate(presented);
    if (!result.ok) {
      res.clearCookie(COOKIE, COOKIE_OPTIONS);
      return res.status(401).json({ error: REFRESH_ERRORS[result.reason] });
    }
    await sendTokens(res, USERS.find((u) => u.id === result.userId)!, result.refresh);
  });

  app.post('/auth/logout', async (req, res) => {
    const presented = req.cookies?.[COOKIE];
    if (presented) store.revoke(presented);
    // A JWT cannot be recalled. If the client sent its access token, deny-list it until it expires.
    const claims = await bearerClaims(req).catch(() => null);
    if (claims?.jti && claims.exp) denied.add(claims.jti, claims.exp);
    res.clearCookie(COOKIE, COOKIE_OPTIONS);
    res.status(204).end();
  });

  async function bearerClaims(req: Request) {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;
    const claims = await verifyAccessToken(secret, token, now);
    if (denied.has(String(claims.jti))) throw new Error('Token revoked');
    return claims;
  }

  async function requireToken(req: Request, res: Response, next: NextFunction) {
    try {
      const claims = await bearerClaims(req);
      if (!claims) {
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).json({ error: 'Missing bearer token.' });
      }
      res.locals.claims = claims;
      next();
    } catch {
      res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
      res.status(401).json({ error: 'Invalid or expired token.' });
    }
  }

  app.get('/me', requireToken, (_req, res) => {
    const { sub, email } = res.locals.claims;
    res.json({ sub, email });
  });

  return { app, store };
}
