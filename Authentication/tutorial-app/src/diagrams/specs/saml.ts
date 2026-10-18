import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const samlSpInitiated: DiagramSpec = {
  width: 900, height: 320,
  title:
    'SP-initiated SAML sign-in. 1: the browser asks your app, the service provider, to sign in at GET /saml/login. ' +
    '2: the app remembers a new request ID and redirects the browser to the identity provider, with a deflated, Base64 ' +
    'AuthnRequest in the SAMLRequest query parameter (the HTTP-Redirect binding). 3: the browser carries the request to ' +
    'the identity provider, where the user signs in. 4: the identity provider answers with an HTML form holding a signed ' +
    'SAML Response. 5: the browser posts the form to the app’s Assertion Consumer Service, POST /saml/acs (the HTTP-POST ' +
    'binding). 6: the app verifies the signature with the identity provider’s certificate, checks issuer, audience, ' +
    'recipient and time, matches InResponseTo against its pending request IDs, and records the assertion ID in its ' +
    'replay cache.',
  legend: { os: 'Browser and identity provider', app: 'Your app (service provider)', store: 'Your app’s memory' },
  nodes: [
    n('sp', 'app', 170, 170, 'your app (SP)', { sub: 'SERVICE PROVIDER' }),
    n('browser', 'os', 450, 170, 'browser', { sub: 'THE USER', shape: 'pill' }),
    n('idp', 'os', 755, 170, 'identity provider', { sub: 'ENTRA ID · OKTA · KEYCLOAK' }),
    n('ids', 'store', 170, 280, 'request IDs', { sub: 'PENDING · REPLAY CACHE' }),
  ],
  edges: [
    e('browser', 'sp', { sa: 't', sb: 't', label: '1 · GET /saml/login' }),
    e('sp', 'browser', { sa: 'r', sb: 'l', oa: -12, ob: -12, kind: 'reply', label: '2 · 302 + SAMLRequest', lpos: [312, 132] }),
    e('browser', 'idp', { sa: 'r', sb: 'l', oa: -12, ob: -12, label: '3 · sign in', lpos: [584, 132] }),
    e('idp', 'browser', { sa: 'l', sb: 'r', oa: 12, ob: 12, kind: 'reply', label: '4 · signed Response', lpos: [584, 208] }),
    e('browser', 'sp', { sa: 'l', sb: 'r', oa: 12, ob: 12, label: '5 · POST /saml/acs', lpos: [312, 206] }),
    e('sp', 'ids', { sa: 'b', sb: 't', label: '6 · check, then remember', lpos: [170, 234] }),
  ],
};
