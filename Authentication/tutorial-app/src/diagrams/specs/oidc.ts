import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const oidcSignIn: DiagramSpec = {
  width: 900, height: 330,
  title: 'Signing in with OpenID Connect. Before the first sign-in, your app (the relying party) reads the provider’s discovery document at /.well-known/openid-configuration to learn its endpoints and its JWKS URL. 1: on /login your app makes a state, a nonce and a PKCE verifier, keeps them in the browser’s session, and redirects the browser to the provider’s authorization endpoint with scope openid profile email. 2: the user signs in at the provider. 3: the provider redirects the browser back to your registered redirect URI with a code and the state. 4: your app checks the state, posts the code with the verifier and its client secret to the token endpoint, and receives an ID token and an access token; it then calls the UserInfo endpoint with the access token for the name and email. 5: your app validates the ID token: it finds the key by the kid in the JWKS and checks the signature, then the issuer, audience, expiry, issued-at time and nonce. Only then does it start its own session with a new session ID.',
  legend: { os: 'User and browser', app: 'Your app (relying party)', core: 'Identity provider', store: 'Published keys' },
  nodes: [
    n('browser', 'os', 450, 55, 'browser', { sub: 'THE USER SIGNS IN HERE', shape: 'pill' }),
    n('rp', 'app', 130, 165, 'your app', { sub: 'STATE · NONCE · PKCE → SESSION' }),
    n('idp', 'core', 770, 165, 'identity provider', { sub: 'AUTHORIZE · TOKEN · USERINFO' }),
    n('jwks', 'store', 770, 280, 'discovery + JWKS', { sub: 'ENDPOINTS · PUBLIC KEYS BY KID' }),
  ],
  edges: [
    e('rp', 'browser', { sa: 't', sb: 'l', label: '1 · state, nonce, challenge' }),
    e('browser', 'idp', { sa: 'r', sb: 't', label: '2 · user signs in' }),
    e('idp', 'rp', { sa: 'l', sb: 'r', oa: -14, ob: -14, kind: 'reply', label: '3 · code + state (via browser)' }),
    e('rp', 'idp', { sa: 'r', sb: 'l', oa: 14, ob: 14, label: '4 · code + verifier → ID token' }),
    e('rp', 'jwks', { sa: 'b', sb: 'l', pts: [[130, 280]], label: '5 · validate the ID token: key by kid' }),
    e('idp', 'jwks', { sa: 'b', sb: 't', kind: 'reply', label: 'publishes' }),
  ],
};
