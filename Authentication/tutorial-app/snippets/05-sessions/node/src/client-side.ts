// For contrast: a client-side session. The whole session travels in the cookie, signed with HMAC-SHA256 by
// cookie-parser so it cannot be changed. But anyone holding the cookie can read it, and the server keeps nothing,
// so it cannot tell a signed-out cookie from a live one.
import cookieParser from 'cookie-parser';
import express from 'express';
import { COST } from './passwords.ts';
import { randomToken } from './tokens.ts';
import { DEMO_USERS, UserTable } from './users.ts';

export async function createClientSideApp({ users = DEMO_USERS, cost = COST, secret = randomToken() } = {}) {
  const table = await UserTable.create(users, cost);
  const cookie = { httpOnly: true, secure: true, sameSite: 'lax', path: '/', signed: true } as const;
  const app = express();
  app.use(express.json(), cookieParser(secret));

  app.post('/login', async (req, res) => {
    const email = await table.check(String(req.body?.email ?? ''), String(req.body?.password ?? ''));
    if (!email) return res.status(401).json({ error: 'Email or password is incorrect.' });
    res.cookie('session', { email }, { ...cookie, maxAge: 30 * 60 * 1000 });
    res.json({ email, message: 'Signed in.' });
  });

  app.get('/me', (req, res) => {
    const data = req.signedCookies.session; // false when the signature does not match
    if (!data?.email) return res.status(401).json({ error: 'Sign in first.' });
    res.json({ email: data.email });
  });

  app.post('/logout', (_req, res) => {
    res.clearCookie('session', cookie); // asks the browser to forget it; any copy still works
    res.json({ message: 'Signed out.' });
  });

  return { app };
}
