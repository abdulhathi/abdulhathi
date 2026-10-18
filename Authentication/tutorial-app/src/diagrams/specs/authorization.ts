import type { DiagramSpec } from '../geometry';
import { e, n } from './helpers';

export const authorizationChecks: DiagramSpec = {
  width: 960, height: 330,
  title: 'Every request to the documents API passes the same checks in order. Authenticate: without a valid bearer token the answer is 401. Scope check: a token without the scope this route needs gets 403 insufficient_scope. Role check: creating needs the editor or admin role and deleting needs admin, else 403. Load by id and tenant: the query only searches the caller’s own tenant, and a document the caller may not even read is 404. Document policy: ownership for updates and the department rule for publishing, else 403. Only then does the handler run.',
  legend: { os: 'Caller', app: 'Your API', store: 'Database' },
  nodes: [
    n('client', 'os', 80, 60, 'client', { sub: 'BEARER TOKEN', shape: 'pill' }),
    n('authn', 'app', 320, 60, 'authenticate', { sub: 'VALID TOKEN · ELSE 401' }),
    n('scope', 'app', 580, 60, 'scope check', { sub: 'TOKEN SCOPE · ELSE 403' }),
    n('role', 'app', 840, 60, 'role check', { sub: 'RBAC · ELSE 403' }),
    n('load', 'app', 840, 180, 'load by id + tenant', { sub: 'CAN READ · ELSE 404' }),
    n('policy', 'app', 530, 180, 'document policy', { sub: 'OWNER · DEPARTMENT · ELSE 403' }),
    n('handler', 'app', 210, 180, 'route handler', { sub: 'DO THE WORK' }),
    n('docs', 'store', 840, 290, 'documents', { sub: 'TENANT ON EVERY ROW' }),
  ],
  edges: [
    e('client', 'authn', { label: 'request' }),
    e('authn', 'scope', { label: 'user' }),
    e('scope', 'role'),
    e('role', 'load', { sa: 'b', sb: 't' }),
    e('load', 'docs', { sa: 'b', sb: 't', label: 'WHERE tenant = yours' }),
    e('load', 'policy', { label: 'document' }),
    e('policy', 'handler', { label: 'allowed' }),
  ],
};
