import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const basicFlow: DiagramSpec = {
  width: 900, height: 300,
  title: 'A client asks for a protected route without credentials. The server answers 401 Unauthorized with a WWW-Authenticate: Basic realm challenge. The client repeats the request with an Authorization header holding Basic and the base64 of username colon password, over TLS. The server decodes the header, looks the user up, and verifies the password against the stored hash on every single request; nothing is remembered between requests.',
  legend: { os: 'Client', app: 'Your server', store: 'Database' },
  nodes: [
    n('client', 'os', 110, 150, 'client', { sub: 'CURL · CI JOB · SCRIPT', shape: 'pill' }),
    n('api', 'app', 450, 150, 'GET /me', { sub: 'DECODE · VERIFY HASH' }),
    n('users', 'store', 770, 150, 'users', { sub: 'USERNAME · PASSWORD HASH' }),
  ],
  edges: [
    e('client', 'api', { sa: 't', sb: 't', label: '1 · no credentials' }),
    e('api', 'client', { kind: 'reply', label: '2 · 401 challenge' }),
    e('client', 'api', { sa: 'b', sb: 'b', label: '3 · Authorization: Basic …' }),
    e('api', 'users', { label: 'look up hash' }),
  ],
};
