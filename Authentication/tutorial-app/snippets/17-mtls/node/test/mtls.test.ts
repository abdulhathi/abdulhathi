import assert from 'node:assert/strict';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { createLabCertificates, issue } from '../src/pki.ts';
import { mutualTlsOptions } from '../src/tls.ts';

// A fresh CA, server and client certificates for this run, in a temporary folder that is deleted afterwards.
const dir = mkdtempSync(join(tmpdir(), 'mtls-test-'));
createLabCertificates(dir);
issue(dir, 'ca', 'renewed', 'billing-service', 'client'); // the same client's next certificate
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);
issue(dir, 'ca', 'expired', 'billing-service', 'client', { notBefore: minutesAgo(3), notAfter: minutesAgo(1) });
issue(dir, 'ca', 'server-only', 'billing-service', 'server'); // our CA and a registered name, but made for servers
issue(dir, 'ca', 'no-cn', 'billing-service', 'client', { subject: '/O=billing-service' }); // the name, but not as a CN
const file = (name: string) => readFileSync(join(dir, name));

const server = createServer(mutualTlsOptions({ ca: file('ca.crt'), cert: file('server.crt'), key: file('server.key.pem') }), createApp());
before(() => new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve)));
after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

/** GET /whoami as a client that trusts our CA for the server, optionally presenting one of the lab's certificates. */
function whoami(identity?: string): Promise<{ status: number; body: unknown }> {
  const credentials = identity ? { cert: file(`${identity}.crt`), key: file(`${identity}.key.pem`) } : {};
  const { port } = server.address() as AddressInfo;
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/whoami', ca: file('ca.crt'), agent: false, ...credentials }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => resolve({ status: res.statusCode!, body: JSON.parse(text) }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** The server ends the handshake with a TLS alert (certificate required, unknown CA) or by closing the connection. */
const handshakeRefused = (err: NodeJS.ErrnoException) => /^(ERR_SSL_|ECONNRESET)/.test(err.code ?? '');
const fingerprint = (name: string) => new X509Certificate(file(`${name}.crt`)).fingerprint256.replaceAll(':', '').toLowerCase();

test('a client with a certificate from our CA is identified', async () => {
  const res = await whoami('client');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { client: 'billing-service', scopes: ['invoices:read'], fingerprint: fingerprint('client') });
});

test('a client without a certificate is refused during the handshake', async () => {
  await assert.rejects(whoami(), handshakeRefused);
});

test('a certificate from another CA is refused, even with a registered name', async () => {
  await assert.rejects(whoami('stranger'), handshakeRefused);
});

test('an expired certificate from our CA is refused', async () => {
  await assert.rejects(whoami('expired'), handshakeRefused);
});

test('a certificate made for servers, not clients, is refused', async () => {
  // Our CA and a registered name, but its extended key usage says serverAuth only.
  await assert.rejects(whoami('server-only'), handshakeRefused);
});

test('a valid certificate that is not registered gets 403', async () => {
  const res = await whoami('unknown');
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'Unknown client certificate.' });
});

test('a certificate without a common name gets 403', async () => {
  // O=billing-service is not CN=billing-service. Some APIs fall back to other fields when there is no CN; here no CN
  // (or more than one) means an unknown client.
  const res = await whoami('no-cn');
  assert.equal(res.status, 403);
  assert.deepEqual(res.body, { error: 'Unknown client certificate.' });
});

test('a renewed certificate for the same client is accepted', async () => {
  const res = await whoami('renewed');
  assert.equal(res.status, 200);
  assert.equal((res.body as { client: string }).client, 'billing-service');
  assert.notEqual(fingerprint('renewed'), fingerprint('client'));
  assert.equal((res.body as { fingerprint: string }).fingerprint, fingerprint('renewed'));
});
