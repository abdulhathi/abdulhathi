import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const passwordLogin: DiagramSpec = {
  width: 900, height: 250,
  title: 'Signing up: the server makes a random salt, runs a slow hash (Argon2id, scrypt or PBKDF2) over the password and salt, and stores only the result. Signing in: it reads the stored hash, hashes the typed password the same way, and compares the two in constant time. A failed attempt counts toward a lockout or slowdown.',
  legend: { os: 'Browser', app: 'Your server', store: 'Database' },
  nodes: [
    n('user', 'os', 90, 125, 'browser', { sub: 'EMAIL + PASSWORD', shape: 'pill' }),
    n('signup', 'app', 330, 55, 'POST /signup', { sub: 'SALT + SLOW HASH' }),
    n('login', 'app', 330, 195, 'POST /login', { sub: 'HASH + CONSTANT-TIME COMPARE' }),
    n('users', 'store', 640, 125, 'users', { sub: 'EMAIL · HASH (NEVER THE PASSWORD)' }),
    n('limit', 'error', 640, 215, 'attempt counter', { sub: 'LOCKOUT / SLOWDOWN' }),
  ],
  edges: [
    e('user', 'signup', { sa: 't', sb: 'l', label: '1 · sign up' }),
    e('signup', 'users', { label: 'store hash' }),
    e('user', 'login', { sa: 'b', sb: 'l', label: '2 · sign in' }),
    e('login', 'users', { label: 'read hash' }),
    e('login', 'limit', { label: 'on failure' }),
  ],
};
