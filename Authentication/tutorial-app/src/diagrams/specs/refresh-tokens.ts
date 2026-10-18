import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const refreshRotation: DiagramSpec = {
  width: 880, height: 300,
  title: 'Refresh token rotation. 1: signing in starts a new family: the server stores the SHA-256 hash of a random refresh token with the user, its expiry and the family ID, returns a 10-minute access token in the body and sets the refresh token in an HttpOnly, Secure, SameSite=Strict cookie for the /auth path. The browser app keeps the access token in memory. 2: when the access token expires, the app calls POST /auth/refresh and the browser sends the cookie; the server marks that refresh token used, stores the hash of a new one in the same family and returns a new pair. If a token that was already used comes back, the server cannot tell the user from a thief, so it revokes the whole family. 3: signing out revokes the family and clears the cookie.',
  legend: { os: 'Browser', app: 'Your server', store: 'Database', error: 'Breach response' },
  nodes: [
    n('spa', 'os', 105, 150, 'browser app', { sub: 'ACCESS TOKEN IN MEMORY', shape: 'pill' }),
    n('login', 'app', 390, 50, 'POST /auth/login', { sub: 'NEW FAMILY' }),
    n('refresh', 'app', 390, 150, 'POST /auth/refresh', { sub: 'ROTATE ON EVERY USE' }),
    n('logout', 'app', 390, 250, 'POST /auth/logout', { sub: 'CLEAR THE COOKIE' }),
    n('store', 'store', 720, 150, 'refresh tokens', { sub: 'SHA-256 · FAMILY · EXPIRY · USED' }),
    n('reuse', 'error', 720, 262, 'reuse detected', { sub: 'REVOKE THE FAMILY' }),
  ],
  edges: [
    e('spa', 'login', { sa: 't', sb: 'l', label: '1 · sign in' }),
    e('spa', 'refresh', { label: '2 · cookie' }),
    e('spa', 'logout', { sa: 'b', sb: 'l', label: '3 · sign out' }),
    e('login', 'store', { ob: -14, label: 'new family' }),
    e('refresh', 'store', { label: 'rotate' }),
    e('logout', 'store', { ob: 14, label: 'revoke' }),
    e('store', 'reuse', { sa: 'b', sb: 't', kind: 'error', label: 'used twice' }),
  ],
};
