import cookieParser from 'cookie-parser';
import express, { type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { MagicLinks, TTL_MS } from './magic-links.ts';
import { Outbox } from './outbox.ts';
import { RateLimiter } from './rate-limit.ts';

const WINDOW_MS = 15 * 60 * 1000;
export const EMAILS_PER_ADDRESS = 3; // in any 15 minutes
export const EMAILS_PER_IP = 10;
const BROWSER_COOKIE = 'signin_browser';
const SESSION_COOKIE = 'session';

const CHECK_EMAIL = { message: 'Check your email. If an account exists, a sign-in link and code are on the way.' };
const BAD_LINK = { error: 'This link is not valid or has expired. Ask for a new one.' };
const BAD_CODE = { error: 'That code is not valid or has expired.' };
const TOO_MANY = { error: 'Too many requests. Try again later.' };

const emailText = (link: string, code: string) =>
  `Sign in to Auth Lab:\n${link}\n\nOr enter this code: ${code}\n\n` +
  'The link and the code work once and expire in 15 minutes. If you did not ask for this, ignore this email.';

// Shown when a link is opened without the cookie of the browser that asked. Scanners and prefetchers fetch links
// but rarely submit forms; never submit it with a script, since some scanners run scripts. The token is one this
// server issued (peek found it), so it is plain base64url and safe to put in the HTML.
const confirmPage = (token: string) => `<!doctype html>
<meta charset="utf-8">
<title>Sign in</title>
<form method="post" action="/auth/verify">
  <input type="hidden" name="token" value="${token}">
  <button type="submit">Continue signing in</button>
</form>
`;

type Options = { users?: string[]; outbox?: Outbox; baseUrl?: string; now?: () => number };

export function createApp({ users = ['ada@example.com'], outbox = new Outbox(), baseUrl = 'http://localhost:3000', now = Date.now }: Options = {}) {
  const accounts = new Set(users); // a real app uses a database table
  const links = new MagicLinks(now);
  const perEmail = new RateLimiter(EMAILS_PER_ADDRESS, WINDOW_MS, now);
  const perIp = new RateLimiter(EMAILS_PER_IP, WINDOW_MS, now);
  const sessions = new Map<string, string>(); // session id -> email (chapter 05 does sessions properly)
  const app = express();
  app.use(cookieParser());
  // Each route reads only its own kind of body. POST /auth/code must not accept a form: an HTML form on another site
  // can post one, and would sign the visitor into the attacker's account. Forms cannot send application/json.
  const json = express.json();
  const form = express.urlencoded({ extended: false }); // the confirmation page posts a form

  function signIn(res: Response, email: string) {
    const id = randomBytes(32).toString('base64url');
    sessions.set(id, email);
    // Add `secure: true` when the site is served over HTTPS (always, in production). Chapter 05 covers the flags.
    res.cookie(SESSION_COOKIE, id, { httpOnly: true, sameSite: 'lax', path: '/' });
    res.clearCookie(BROWSER_COOKIE, { path: '/auth' });
    res.json({ email, message: 'Signed in.' });
  }

  app.post('/auth/email', json, (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!email.includes('@')) return res.status(400).json({ error: 'Enter a valid email address.' });
    // Limits for unknown emails too, so a 429 says nothing about which accounts exist. Behind a proxy, configure
    // app.set('trust proxy', ...) so req.ip is the client's address rather than the proxy's.
    const wait = perIp.take(req.ip ?? 'unknown') || perEmail.take(email);
    if (wait > 0) {
      res.setHeader('Retry-After', String(Math.ceil(wait / 1000)));
      return res.status(429).json(TOO_MANY);
    }
    // Marks this browser as the one that asked. Set for unknown emails too, so the two answers look the same.
    const browser = randomBytes(32).toString('base64url');
    res.cookie(BROWSER_COOKIE, browser, { httpOnly: true, sameSite: 'lax', path: '/auth', maxAge: TTL_MS });
    if (accounts.has(email)) {
      const { token, code } = links.issue(email, browser);
      // The configured base URL, never the request's Host header: an attacker could point the link at their site.
      outbox.send({ to: email, subject: 'Your sign-in link', text: emailText(`${baseUrl}/auth/verify?token=${token}`, code) });
    }
    res.status(202).json(CHECK_EMAIL); // the same answer whether or not the account exists
  });

  app.get('/auth/verify', (req, res) => {
    const token = String(req.query.token ?? '');
    const pending = links.peek(token);
    if (!pending) return res.status(400).json(BAD_LINK);
    if (!links.sameBrowser(pending, req.cookies[BROWSER_COOKIE])) {
      // Another device, a link scanner or an email prefetcher: show a button, and sign in only on the POST.
      // No caching, no Referer with the token in it, and no framing (a framed button can be clicked by trickery).
      res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "frame-ancestors 'none'" });
      return res.type('html').send(confirmPage(token));
    }
    const email = links.consume(token);
    if (!email) return res.status(400).json(BAD_LINK);
    signIn(res, email); // a real app would redirect to its home page here
  });

  app.post('/auth/verify', form, (req, res) => {
    const email = links.consume(String(req.body?.token ?? ''));
    if (!email) return res.status(400).json(BAD_LINK);
    signIn(res, email);
  });

  app.post('/auth/code', json, (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    if (!links.checkCode(email, String(req.body?.code ?? ''))) return res.status(401).json(BAD_CODE);
    signIn(res, email);
  });

  app.get('/me', (req, res) => {
    const email = sessions.get(req.cookies[SESSION_COOKIE] ?? '');
    if (!email) return res.status(401).json({ error: 'Sign in first.' });
    res.json({ email });
  });

  return { app, links, outbox };
}
