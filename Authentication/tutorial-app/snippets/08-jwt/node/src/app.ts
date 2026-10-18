import express, { type NextFunction, type Request, type Response } from 'express';
import { KeyRing } from './keys.ts';
import { issueAccessToken, LIFETIME_S, verifyAccessToken } from './tokens.ts';

type Options = { ring?: KeyRing; now?: () => number };

// A stand-in for chapter 04, to keep this chapter about tokens: a real app checks a slow, salted hash.
const USERS = new Map([['ada@example.com', { id: 'u_1001', email: 'ada@example.com', password: 'correct horse battery' }]]);

export async function createApp({ ring, now = Date.now }: Options = {}) {
  const keys = ring ?? (await KeyRing.create());
  const app = express();
  app.use(express.json());

  app.post('/login', async (req, res) => {
    const user = USERS.get(String(req.body?.email ?? '').trim().toLowerCase());
    if (!user || user.password !== String(req.body?.password ?? '')) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    const accessToken = await issueAccessToken(keys, user, now);
    res.set('Cache-Control', 'no-store'); // a response holding a token must never be cached (RFC 6749, section 5.1)
    res.json({ access_token: accessToken, token_type: 'Bearer', expires_in: LIFETIME_S });
  });

  // Public keys only: anyone may fetch them, and they can verify tokens but never sign one.
  app.get('/.well-known/jwks.json', (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json(keys.jwks());
  });

  // Authorization: Bearer <token> (RFC 6750). Any failure gets the same 401; the reason stays on the server.
  async function requireToken(req: Request, res: Response, next: NextFunction) {
    const [scheme, token] = (req.get('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      res.set('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ error: 'Missing bearer token.' });
    }
    try {
      res.locals.claims = await verifyAccessToken(keys, token, now);
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

  return { app, ring: keys };
}
