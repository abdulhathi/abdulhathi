import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const passkeyCeremony: DiagramSpec = {
  width: 900, height: 330,
  title: 'Both WebAuthn ceremonies have the same three steps. 1: the browser asks the server for options; the server makes a random challenge and remembers it, single-use, for five minutes. 2: the browser passes the options to the authenticator, adding its own origin; the user unlocks it with a fingerprint, face or PIN, and the authenticator either makes a new key pair (registration) or signs the challenge with the private key (sign-in), bound to the RP ID. 3: the browser sends the response to the server, which takes the challenge so it cannot be used again, checks the origin, the RP ID hash, the flags and the signature, and saves the public key and sign count (registration) or checks and updates them (sign-in).',
  legend: { os: 'Browser', engine: 'Authenticator', app: 'Your server', store: 'Server storage' },
  nodes: [
    n('browser', 'os', 110, 155, 'browser', { sub: 'ADDS THE ORIGIN', shape: 'pill' }),
    n('auth', 'engine', 110, 285, 'authenticator', { sub: 'PRIVATE KEY · BIOMETRIC' }),
    n('options', 'app', 420, 60, 'POST …/options', { sub: 'NEW CHALLENGE + OPTIONS' }),
    n('verify', 'app', 420, 250, 'POST …/verify', { sub: 'ORIGIN · RP ID · SIGNATURE' }),
    n('challenges', 'store', 760, 60, 'challenges', { sub: 'SINGLE-USE · 5 MINUTES' }),
    n('credentials', 'store', 760, 250, 'credentials', { sub: 'ID · PUBLIC KEY · COUNT' }),
  ],
  edges: [
    e('browser', 'options', { sa: 'r', sb: 'l', oa: -10, label: '1 · options' }),
    e('options', 'challenges', { label: 'remember' }),
    e('browser', 'auth', { sa: 'b', sb: 't', label: '2 · unlock + sign' }),
    e('browser', 'verify', { sa: 'r', sb: 'l', oa: 10, label: '3 · response' }),
    e('verify', 'challenges', { sa: 't', sb: 'b', oa: 60, ob: -60, label: 'take (single use)' }),
    e('verify', 'credentials', { label: 'key + count' }),
  ],
};
