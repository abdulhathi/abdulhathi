import express from 'express';
import session from 'express-session';
import { COST } from './passwords.ts';
import { COOKIE, cookieFlags, destroy, regenerate, requireCsrf, requireSession, sessions } from './session.ts';
import { randomToken } from './tokens.ts';
import { DEMO_USERS, UserTable } from './users.ts';

type Options = {
  users?: typeof DEMO_USERS;
  cost?: typeof COST;
  now?: () => number;
  secure?: boolean; // the cookie's Secure flag: leave it on except for plain-HTTP development
  trustProxy?: boolean | number | string; // set it when a proxy in front of the app terminates TLS
  secret?: string; // signs the cookie; load it from a secret store in production
  store?: session.Store;
};

export async function createApp({
  users = DEMO_USERS, cost = COST, now = Date.now, secure = true, trustProxy = false,
  secret = randomToken(), store = new session.MemoryStore(),
}: Options = {}) {
  const table = await UserTable.create(users, cost);
  const notes = new Map<string, string[]>(); // email -> notes
  const signedIn = requireSession(now);
  const app = express();
  app.set('trust proxy', trustProxy); // so req.secure is true behind a TLS-terminating proxy
  app.use(express.json());
  app.use(sessions({ secure, secret, store }));

  app.post('/login', async (req, res) => {
    const email = await table.check(String(req.body?.email ?? ''), String(req.body?.password ?? ''));
    if (!email) return res.status(401).json({ error: 'Email or password is incorrect.' });
    // A brand-new session id at sign-in, so an id someone planted or saw earlier is worthless (session fixation).
    await regenerate(req);
    const t = now();
    req.session.email = email;
    req.session.csrfToken = randomToken();
    req.session.createdAt = t;
    req.session.lastSeenAt = t;
    res.json({ email, message: 'Signed in.' });
  });

  app.get('/me', signedIn, (req, res) => {
    res.json({ email: req.session.email });
  });

  app.get('/csrf', signedIn, (req, res) => {
    res.json({ csrfToken: req.session.csrfToken });
  });

  app.post('/notes', signedIn, requireCsrf, (req, res) => {
    const email = req.session.email!;
    const list = [...(notes.get(email) ?? []), String(req.body?.text ?? '')];
    notes.set(email, list);
    res.status(201).json({ notes: list });
  });

  app.post('/logout', signedIn, requireCsrf, async (req, res) => {
    await destroy(req); // gone from the store: the old cookie now opens nothing
    res.clearCookie(COOKIE, cookieFlags(secure)); // and ask the browser to forget it
    res.json({ message: 'Signed out.' });
  });

  return { app };
}
