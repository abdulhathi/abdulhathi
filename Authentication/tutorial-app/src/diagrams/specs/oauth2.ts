import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const codeFlow: DiagramSpec = {
  width: 900, height: 300,
  title: 'The authorization code flow with PKCE. 1: the client app makes a random state and a random code_verifier, and redirects the browser to the authorization server’s /authorize with its client_id, the exact redirect_uri, the scope, the state and the code_challenge (the SHA-256 of the verifier). 2: the user signs in at the authorization server and consents. 3: the authorization server redirects the browser back to the registered redirect_uri with a short-lived, single-use code, the same state and its issuer identifier (iss); the client checks the state and the iss. 4: the client posts the code and the code_verifier to /token, over a direct back-channel connection; the server checks that the code is unused, unexpired, issued to this client and redirect_uri, and that the verifier hashes to the challenge, then returns an access token (a code presented a second time is refused and the token it gave is revoked). 5: the client calls the resource server with Authorization: Bearer and the token. The resource server verifies the token with the authorization server’s public key and checks its issuer, audience, type, expiry, that it is not revoked, and its scope.',
  legend: { os: 'User and browser', app: 'Client app', core: 'Authorization server', engine: 'Resource server (API)' },
  nodes: [
    n('browser', 'os', 450, 55, 'browser', { sub: 'THE USER SIGNS IN HERE', shape: 'pill' }),
    n('client', 'app', 120, 165, 'photo-app (client)', { sub: 'KEEPS STATE + VERIFIER' }),
    n('as', 'core', 780, 165, 'authorization server', { sub: '/AUTHORIZE · /TOKEN' }),
    n('rs', 'engine', 450, 265, 'resource server', { sub: 'CHECKS TOKEN + SCOPE' }),
  ],
  edges: [
    e('client', 'browser', { sa: 't', sb: 'l', label: '1 · challenge + state' }),
    e('browser', 'as', { sa: 'r', sb: 't', label: '2 · sign in + consent' }),
    e('as', 'client', { sa: 'l', sb: 'r', oa: -14, ob: -14, kind: 'reply', label: '3 · code + state + iss (via browser)' }),
    e('client', 'as', { sa: 'r', sb: 'l', oa: 14, ob: 14, label: '4 · code + verifier → token' }),
    e('client', 'rs', { sa: 'b', sb: 'l', label: '5 · Bearer token' }),
    e('as', 'rs', { sa: 'b', sb: 'r', kind: 'reply', label: 'public key' }),
  ],
};

export const clientCredentialsFlow: DiagramSpec = {
  width: 900, height: 210,
  title: 'The client credentials grant. 1: a back-end service posts grant_type=client_credentials and the scope it needs to /token, authenticating with its client_id and client_secret in an HTTP Basic header. The authorization server checks the secret and that the scope is allowed for this client, and returns an access token whose subject is the client itself; no user and no browser are involved. 2: the service calls the API with the token as a Bearer token, and the API checks it exactly as it checks a user’s token.',
  legend: { app: 'Service (client)', core: 'Authorization server', engine: 'Resource server (API)' },
  nodes: [
    n('job', 'app', 130, 150, 'report-job (client)', { sub: 'ID + SECRET, NO USER' }),
    n('as', 'core', 470, 50, 'authorization server', { sub: 'POST /TOKEN' }),
    n('rs', 'engine', 790, 150, 'resource server', { sub: 'CHECKS TOKEN + SCOPE' }),
  ],
  edges: [
    e('job', 'as', { sa: 't', sb: 'l', label: '1 · id + secret + scope → token' }),
    e('job', 'rs', { label: '2 · Bearer token' }),
    e('as', 'rs', { sa: 'r', sb: 't', kind: 'reply', label: 'public key' }),
  ],
};
