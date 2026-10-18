import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const mutualTls: DiagramSpec = {
  width: 900, height: 330,
  title:
    'Mutual TLS. Your private certificate authority issues the client its certificate, and the API trusts only that CA ' +
    'for client certificates. 1: in the TLS handshake the server sends its own certificate and asks for one. 2: the ' +
    'client sends its certificate and signs the handshake with its private key. If the client sends none, or one from ' +
    'another CA, the server ends the handshake and no HTTP request is ever read. 3: otherwise the API maps the ' +
    'certificate’s subject to a registered client and its scopes, and answers 403 for a genuine certificate it does ' +
    'not know.',
  legend: { core: 'Certificate authority', os: 'Client service', app: 'Your API', store: 'Registry', error: 'Refused' },
  nodes: [
    n('ca', 'core', 450, 50, 'your private CA', { sub: 'ISSUES EVERY CERTIFICATE' }),
    n('client', 'os', 135, 180, 'billing-service', { sub: 'CLIENT.CRT + KEY', shape: 'pill' }),
    n('api', 'app', 560, 180, 'your API', { sub: 'REQUIRES A CLIENT CERT' }),
    n('refused', 'error', 812, 180, 'handshake ends', { sub: 'NO CERT · OTHER CA' }),
    n('clients', 'store', 560, 285, 'known clients', { sub: 'CN → SCOPES · ELSE 403' }),
  ],
  edges: [
    e('ca', 'client', { sa: 'l', sb: 't', label: 'issues client.crt' }),
    e('ca', 'api', { sa: 'b', sb: 't', oa: 40, label: 'the only CA trusted' }),
    e('api', 'client', { sa: 'l', sb: 'r', oa: -12, ob: -12, kind: 'reply', label: '1 · server cert, asks for one', lpos: [345, 144] }),
    e('client', 'api', { sa: 'r', sb: 'l', oa: 12, ob: 12, label: '2 · client cert + signature', lpos: [345, 216] }),
    e('api', 'refused', { kind: 'error', label: 'refused' }),
    e('api', 'clients', { sa: 'b', sb: 't', label: '3 · map CN to a client' }),
  ],
};
