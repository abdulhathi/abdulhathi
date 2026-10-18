import express, { type NextFunction, type Request, type Response } from 'express';
import { randomBytes } from 'node:crypto';
import { COST, hashPassword, verifyPassword, type Cost } from './passwords.ts';
import { hashRecoveryCodes, newRecoveryCodes, useRecoveryCode, type RecoveryCode } from './recovery-codes.ts';
import { SecretBox } from './secret-box.ts';
import { base32Encode, newTotpSecret, otpauthUri, verifyTotp } from './totp.ts';

export const ISSUER = 'Auth Lab'; // the name the authenticator app shows above the code
const PENDING_MS = 5 * 60 * 1000; // time allowed between the password and the code
const MAX_CODE_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

export type User = {
  email: string;
  passwordHash: string;
  totpSecret?: string; // encrypted; set once enrolment is confirmed
  pendingTotpSecret?: string; // encrypted; between /mfa/setup and /mfa/confirm
  lastTotpStep: number; // the last 30-second step used, so a code works once
  recoveryCodes?: RecoveryCode[]; // one salted hash per unused code
  codeFailures: number;
  lockedUntil: number;
};
type Options = { encryptionKey: Buffer; now?: () => number; cost?: Cost };

const INVALID = { error: 'Email or password is incorrect.' };
const BAD_CODE = { error: 'That code is not valid.' };
const SIGN_IN_AGAIN = { error: 'Sign in again.' };
const newToken = () => randomBytes(32).toString('base64url');

// Runs the requests for one user one at a time, like a lock. Node.js runs one piece of JavaScript at a time, but a
// request that awaits (a slow hash) lets other requests run in between, and each check-then-update must not be split.
const queues = new WeakMap<User, Promise<unknown>>();
function oneAtATime<T>(user: User, work: () => T | Promise<T>): Promise<T> {
  const run = (queues.get(user) ?? Promise.resolve()).then(work);
  queues.set(user, run.catch(() => undefined)); // the next request waits for this one, even if it fails
  return run;
}

export async function createApp({ encryptionKey, now = Date.now, cost = COST }: Options) {
  const box = new SecretBox(encryptionKey);
  const users = new Map<string, User>(); // a real app uses a database table
  const sessions = new Map<string, string>(); // session token -> email (chapter 05 does sessions properly)
  const pending = new Map<string, { email: string; expiresAt: number }>(); // password checked, code not yet
  const dummyHash = await hashPassword('not-a-real-password', cost);
  const app = express();
  app.use(express.json());

  const startSession = (email: string) => {
    const token = newToken();
    sessions.set(token, email);
    return token;
  };

  // Routes that need "Authorization: Bearer <session token>".
  const signedIn = (req: Request, res: Response, next: NextFunction) => {
    const email = sessions.get(req.get('authorization')?.replace(/^Bearer /, '') ?? '');
    if (!email) return res.status(401).json({ error: 'Sign in first.' });
    res.locals.user = users.get(email);
    next();
  };

  app.post('/signup', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    if (!email.includes('@') || password.length < 12) {
      return res.status(400).json({ error: 'Enter an email and a password of at least 12 characters.' });
    }
    if (users.has(email)) return res.status(409).json({ error: 'That email is already registered.' });
    const passwordHash = await hashPassword(password, cost);
    users.set(email, { email, passwordHash, lastTotpStep: -1, codeFailures: 0, lockedUntil: 0 });
    res.status(201).json({ email });
  });

  // Step 1 of sign-in: the password. With MFA on, this proves only the first factor, so it returns a short-lived
  // pending token that is good for nothing except step 2.
  app.post('/login', async (req, res) => {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const user = users.get(email);
    const ok = await verifyPassword(String(req.body?.password ?? ''), user?.passwordHash ?? dummyHash, cost);
    if (!user || !ok) return res.status(401).json(INVALID);
    if (!user.totpSecret) return res.json({ token: startSession(email) });
    const pendingToken = newToken();
    pending.set(pendingToken, { email, expiresAt: now() + PENDING_MS });
    res.json({ mfaRequired: true, pendingToken });
  });

  // Step 2: a code from the authenticator app, or a recovery code.
  app.post('/login/mfa', async (req, res) => {
    const pendingToken = String(req.body?.pendingToken ?? '');
    const email = pending.get(pendingToken)?.email;
    const user = email === undefined ? undefined : users.get(email);
    if (!user) return res.status(401).json(SIGN_IN_AGAIN);

    await oneAtATime(user, async () => {
      // Checked inside: a request for the same user that ran just before may have used this token.
      const signIn = pending.get(pendingToken);
      if (!signIn || signIn.expiresAt <= now()) {
        pending.delete(pendingToken);
        return res.status(401).json(SIGN_IN_AGAIN);
      }
      if (user.lockedUntil > now()) {
        res.setHeader('Retry-After', String(Math.ceil((user.lockedUntil - now()) / 1000)));
        return res.status(429).json({ error: 'Too many wrong codes. Try again later.' });
      }

      const code = String(req.body?.code ?? '').replace(/\s/g, '');
      let ok = false;
      let recoveryCodesLeft: number | undefined;
      if (/^[0-9]{6}$/.test(code)) {
        const step = verifyTotp(box.open(user.totpSecret!, user.email), code, now(), user.lastTotpStep);
        if (step !== null) {
          user.lastTotpStep = step; // this code, and every older one, is now used up
          ok = true;
        }
      } else if (await useRecoveryCode(user.recoveryCodes!, code, cost)) {
        ok = true;
        recoveryCodesLeft = user.recoveryCodes!.length;
      }

      if (!ok) {
        user.codeFailures += 1;
        if (user.codeFailures >= MAX_CODE_FAILURES) {
          user.lockedUntil = now() + LOCK_MS; // a 6-digit code must not be guessable by brute force
          user.codeFailures = 0;
        }
        return res.status(401).json(BAD_CODE);
      }
      user.codeFailures = 0;
      pending.delete(pendingToken); // a pending token works once
      const token = startSession(user.email);
      res.json(recoveryCodesLeft === undefined ? { token } : { token, recoveryCodesLeft });
    });
  });

  // Enrolment, part 1: make a secret and show it as a QR code (the otpauth URI) and as text to type in.
  app.post('/mfa/setup', signedIn, async (_req, res) => {
    const user: User = res.locals.user;
    await oneAtATime(user, () => {
      if (user.totpSecret) return res.status(409).json({ error: 'Two-factor sign-in is already on.' });
      const secret = newTotpSecret();
      user.pendingTotpSecret = box.seal(secret, user.email); // not active until confirmed
      const secretBase32 = base32Encode(secret);
      res.json({ secret: secretBase32, otpauthUri: otpauthUri(secretBase32, user.email, ISSUER) });
    });
  });

  // Enrolment, part 2: a first valid code proves the app holds the secret. Only then is MFA turned on.
  app.post('/mfa/confirm', signedIn, async (req, res) => {
    const user: User = res.locals.user;
    await oneAtATime(user, async () => {
      if (!user.pendingTotpSecret) return res.status(400).json({ error: 'Start set-up first.' });
      const step = verifyTotp(box.open(user.pendingTotpSecret, user.email), String(req.body?.code ?? ''), now(), user.lastTotpStep);
      if (step === null) return res.status(400).json(BAD_CODE);
      const codes = newRecoveryCodes();
      const recoveryCodes = await hashRecoveryCodes(codes, cost);
      user.lastTotpStep = step; // the confirming code cannot be used again
      Object.assign(user, { totpSecret: user.pendingTotpSecret, pendingTotpSecret: undefined, recoveryCodes });
      res.json({ recoveryCodes: codes }); // shown once; only hashes are kept
    });
  });

  app.get('/me', signedIn, (_req, res) => {
    const user: User = res.locals.user;
    res.json({ email: user.email, mfa: Boolean(user.totpSecret) });
  });

  return { app, users };
}
