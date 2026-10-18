import express from 'express';
import { COST, hashPassword, needsRehash, passwordProblem, verifyPassword } from './passwords.ts';
import { LoginLimiter } from './limiter.ts';

type User = { email: string; passwordHash: string };
type Options = { cost?: typeof COST; now?: () => number };

const INVALID = { error: 'Email or password is incorrect.' };

export async function createApp({ cost = COST, now = Date.now }: Options = {}) {
  const users = new Map<string, User>(); // a real app uses a database table
  const limiter = new LoginLimiter(now);
  // Hashed once at start-up, checked when the email is unknown, so both paths take the same time.
  const dummyHash = await hashPassword('not-a-real-password', cost);
  const app = express();
  app.use(express.json());

  app.post('/signup', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address.' });
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });
    if (users.has(email)) return res.status(409).json({ error: 'That email is already registered.' });
    users.set(email, { email, passwordHash: await hashPassword(password, cost) });
    res.status(201).json({ email });
  });

  app.post('/login', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const wait = limiter.retryAfter(email);
    if (wait > 0) {
      res.setHeader('Retry-After', String(Math.ceil(wait / 1000)));
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }
    const user = users.get(email);
    const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);
    if (!user || !ok) {
      limiter.fail(email);
      return res.status(401).json(INVALID); // the same answer for "no such user" and "wrong password"
    }
    limiter.succeed(email);
    if (needsRehash(user.passwordHash, cost)) user.passwordHash = await hashPassword(password, cost);
    res.json({ email, message: 'Signed in.' });
  });

  return { app, users };
}
