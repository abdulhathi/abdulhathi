import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const sessionFlow: DiagramSpec = {
  width: 900, height: 300,
  title: 'Signing in: the browser posts an email and password; the server checks them, creates a session in its session store under a brand-new random id, and sends only that id back in an HttpOnly, Secure, SameSite=Lax cookie. Later requests: the browser sends the cookie, plus a CSRF token in a header for anything that changes state; the server looks the id up, checks the idle and absolute timeouts and the token, and serves the request. Signing out: the server deletes the session from the store, so a copy of the old cookie opens nothing.',
  legend: { os: 'Browser', app: 'Your server', store: 'Session store' },
  nodes: [
    n('browser', 'os', 100, 150, 'browser', { sub: 'COOKIE: sid', shape: 'pill' }),
    n('login', 'app', 410, 50, 'POST /login', { sub: 'CHECK PASSWORD · NEW ID' }),
    n('use', 'app', 410, 150, 'GET /me · POST /notes', { sub: 'LOOK UP ID · CHECK TOKEN' }),
    n('logout', 'app', 410, 250, 'POST /logout', { sub: 'DESTROY THE SESSION' }),
    n('store', 'store', 770, 150, 'session store', { sub: 'ID → USER · TOKEN · TIMES' }),
  ],
  edges: [
    e('browser', 'login', { sa: 't', sb: 'l', label: '1 · sign in' }),
    e('login', 'store', { label: 'create' }),
    e('browser', 'use', { label: '2 · cookie + token' }),
    e('use', 'store', { label: 'look up' }),
    e('browser', 'logout', { sa: 'b', sb: 'l', label: '3 · sign out' }),
    e('logout', 'store', { label: 'delete' }),
  ],
};
