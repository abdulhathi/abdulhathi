import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const magicLinkFlow: DiagramSpec = {
  width: 900, height: 320,
  title: 'Signing in with a magic link. 1: the browser posts an email address to POST /auth/email. The server checks the per-address and per-IP rate limits, sets a cookie that marks this browser, and gives the same answer whether or not the account exists. For a real account it stores only the SHA-256 hash of a new 256-bit token and an HMAC of a 6-digit code, with a 15-minute expiry, and emails the link and the code. 2: the user opens the link, which calls GET /auth/verify. If the request carries the cookie of the browser that asked, the server deletes the stored token in one step and signs the user in; otherwise, as for a link scanner or another device, it shows a confirmation page whose form posts the token. 3: on success the browser gets a session cookie.',
  legend: { os: 'The user', app: 'Your server', store: 'Database' },
  nodes: [
    n('browser', 'os', 110, 70, 'browser', { sub: 'ASKS, KEEPS A COOKIE', shape: 'pill' }),
    n('ask', 'app', 400, 70, 'POST /auth/email', { sub: 'RATE-LIMITED · SAME ANSWER' }),
    n('links', 'store', 750, 70, 'magic_links', { sub: 'SHA-256(TOKEN) · HMAC(CODE) · 15 MIN' }),
    n('inbox', 'os', 400, 175, 'email inbox', { sub: 'LINK + 6-DIGIT CODE' }),
    n('verify', 'app', 400, 280, 'GET /auth/verify', { sub: 'SAME BROWSER: SIGN IN · ELSE: CONFIRM' }),
  ],
  edges: [
    e('browser', 'ask', { label: '1 · email' }),
    e('ask', 'links', { label: 'hash only' }),
    e('ask', 'inbox', { sa: 'b', sb: 't', label: 'send' }),
    e('inbox', 'verify', { sa: 'b', sb: 't', label: '2 · open link' }),
    e('verify', 'links', { sa: 'r', sb: 'b', label: 'delete once' }),
    e('verify', 'browser', { sa: 'l', sb: 'b', kind: 'reply', label: '3 · session cookie' }),
  ],
};
