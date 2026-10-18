import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const jwtFlow: DiagramSpec = {
  width: 940, height: 290,
  title: 'Signing in and calling an API with a JWT. 1: the client sends an email and password to POST /login. The server signs a short-lived access token with the current private key from its key ring and puts that key’s ID (kid) in the token header. 2: the client calls GET /me with Authorization: Bearer and the token. The API picks the public key named by the kid from its JSON Web Key Set, verifies the signature with an allowlisted algorithm, then checks the issuer, audience, expiry and not-before. The key ring publishes only public keys at /.well-known/jwks.json, so another API can fetch and cache them and verify the same tokens without ever holding a private key.',
  legend: { os: 'Client', app: 'Your servers', store: 'Private keys', core: 'Public keys' },
  nodes: [
    n('client', 'os', 95, 145, 'client', { sub: 'BROWSER OR APP', shape: 'pill' }),
    n('login', 'app', 330, 55, 'POST /login', { sub: 'SIGN WITH THE CURRENT KEY' }),
    n('ring', 'store', 680, 55, 'key ring', { sub: 'PRIVATE KEYS · KID' }),
    n('me', 'app', 330, 235, 'GET /me', { sub: 'ALG · KID · ISS · AUD · EXP' }),
    n('jwks', 'core', 660, 235, '/.well-known/jwks.json', { sub: 'PUBLIC KEYS ONLY' }),
    n('other', 'app', 855, 155, 'another API', { sub: 'VERIFIES TOO', w: 140 }),
  ],
  edges: [
    e('client', 'login', { sa: 't', sb: 'l', label: '1 · sign in → JWT' }),
    e('login', 'ring', { label: 'sign (kid)' }),
    e('client', 'me', { sa: 'b', sb: 'l', label: '2 · Bearer JWT' }),
    e('me', 'jwks', { label: 'key by kid' }),
    e('ring', 'jwks', { sa: 'b', sb: 't', oa: -40, ob: 40, label: 'publish' }),
    e('other', 'jwks', { sa: 'b', sb: 'r', label: 'fetch + cache', kind: 'reply' }),
  ],
};
