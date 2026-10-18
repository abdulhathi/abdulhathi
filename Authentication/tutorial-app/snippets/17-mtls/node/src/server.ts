import { readFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './app.ts';
import { createLabCertificates } from './pki.ts';
import { mutualTlsOptions } from './tls.ts';

// Certificates live in a temporary folder (made on first start), never in the project.
const dir = process.env.CERTS_DIR ?? join(tmpdir(), 'auth-lab-mtls');
createLabCertificates(dir);
const file = (name: string) => readFileSync(join(dir, name));

const server = createServer(mutualTlsOptions({ ca: file('ca.crt'), cert: file('server.crt'), key: file('server.key.pem') }), createApp());
const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Listening on https://localhost:${port} (certificates in ${dir})`));
