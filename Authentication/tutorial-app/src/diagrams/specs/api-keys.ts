import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const apiKeyFlow: DiagramSpec = {
  width: 900, height: 290,
  title: 'Issuing a key: an admin calls POST /keys. The server makes a random key from a CSPRNG, stores only its SHA-256 hash with its id, scopes and expiry in the api_keys table, and shows the key once; the admin puts it in the client application’s secrets. Using a key: the client sends it in the Authorization or X-API-Key header (a key in the URL is refused with 400). The server reads the id from the key, finds the record, compares SHA-256 hashes in constant time and checks revocation and expiry (else 401), counts the request against that key’s rate limit (else 429), and checks the scope this endpoint needs (else 403). Only then does GET /reports run.',
  legend: { os: 'Callers', app: 'Your API', store: 'Database' },
  nodes: [
    n('admin', 'os', 90, 50, 'admin', { sub: 'KEY WITH KEYS:MANAGE', shape: 'pill' }),
    n('client', 'os', 90, 250, 'client app', { sub: 'KEY IN ITS SECRETS', shape: 'pill' }),
    n('issue', 'app', 400, 50, 'POST /keys', { sub: 'CSPRNG KEY · SHOWN ONCE' }),
    n('keys', 'store', 400, 150, 'api_keys', { sub: 'ID · SHA-256 · SCOPES · EXPIRY' }),
    n('verify', 'app', 400, 250, 'verify key', { sub: 'FIND BY ID · HASH · ELSE 401' }),
    n('limit', 'app', 622, 250, 'rate limit', { sub: 'PER KEY · ELSE 429' }),
    n('scope', 'app', 810, 250, 'scope check', { sub: 'PER ROUTE · ELSE 403' }),
    n('handler', 'app', 810, 150, 'GET /reports', { sub: 'DO THE WORK' }),
  ],
  edges: [
    e('admin', 'issue', { label: '1 · create key' }),
    e('issue', 'keys', { sa: 'b', sb: 't', label: 'store hash' }),
    e('admin', 'client', { sa: 'b', sb: 't', label: 'key, shown once' }),
    e('client', 'verify', { label: '2 · Bearer key' }),
    e('verify', 'keys', { sa: 't', sb: 'b', label: 'find by id' }),
    e('verify', 'limit'),
    e('limit', 'scope'),
    e('scope', 'handler', { sa: 't', sb: 'b', label: 'allowed' }),
  ],
};
