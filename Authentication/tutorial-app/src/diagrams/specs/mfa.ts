import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const mfaSignIn: DiagramSpec = {
  width: 900, height: 310,
  title: 'Two-step sign-in with TOTP. Step 1: the browser posts the email and password to POST /login. The server checks the password hash and, because MFA is on, returns only a short-lived pending token. Step 2: the user reads the current 6-digit code from the authenticator app, which computes it from the shared secret and the current 30-second step. The browser posts the pending token and the code to POST /login/mfa. The server decrypts the stored secret, accepts the step before, the current step or the step after, refuses any step at or before the last one used, locks code entry after five wrong codes, and only then issues a session token. A single-use recovery code can stand in for the TOTP code.',
  legend: { os: 'The user', app: 'Your server', store: 'Database', core: 'Result' },
  nodes: [
    n('user', 'os', 110, 150, 'browser', { sub: 'PASSWORD, THEN CODE', shape: 'pill' }),
    n('phone', 'os', 115, 265, 'authenticator app', { sub: 'SAME SECRET · OWN CLOCK' }),
    n('login', 'app', 400, 65, 'POST /login', { sub: 'PASSWORD → PENDING TOKEN' }),
    n('mfa', 'app', 400, 205, 'POST /login/mfa', { sub: '±1 STEP · NO REPLAY · 5 TRIES' }),
    n('users', 'store', 730, 120, 'users', { sub: 'ENCRYPTED SECRET · LAST STEP · HASHED CODES' }),
    n('session', 'core', 730, 255, 'session token', { sub: 'ONLY AFTER BOTH FACTORS' }),
  ],
  edges: [
    e('user', 'login', { sa: 't', sb: 'l', label: '1 · password' }),
    e('login', 'users', { ob: -12, label: 'check hash' }),
    e('phone', 'user', { sa: 't', sb: 'b', label: 'shows code' }),
    e('user', 'mfa', { label: '2 · code' }),
    e('mfa', 'users', { ob: 12, label: 'decrypt + check' }),
    e('mfa', 'session', { label: 'both passed' }),
  ],
};
