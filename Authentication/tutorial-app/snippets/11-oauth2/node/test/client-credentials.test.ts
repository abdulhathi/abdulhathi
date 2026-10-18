import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { clientCredentials } from '../src/client.ts';
import { bearer, startApp } from './setup.ts';

const t = await startApp();
after(() => t.close());

const postToken = (form: Record<string, string>) => fetch(`${t.base}/token`, { method: 'POST', body: new URLSearchParams(form) });

test('client credentials: a service gets a token for its own scope', async () => {
  const tokens = await clientCredentials(t.base, 'report-job', 'report-job-secret', 'reports.read');
  assert.equal(tokens.scope, 'reports.read');
  const api = await fetch(`${t.base}/api/reports`, bearer(tokens.access_token));
  assert.equal(api.status, 200);
  assert.deepEqual(await api.json(), { client: 'report-job', reports: ['daily-sales.csv'] });
});

test('client credentials: a wrong secret, a broken Basic header, a scope it was not given, or a public client is refused', async () => {
  const wrong = await postToken({ grant_type: 'client_credentials', client_id: 'report-job', client_secret: 'wrong-secret' });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('www-authenticate'), 'Basic realm="token"');
  assert.deepEqual(await wrong.json(), { error: 'invalid_client', error_description: 'Client authentication failed.' });

  // "report-job:%zz" is not valid form encoding: an error answer, not a crash.
  const broken = await fetch(`${t.base}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from('report-job:%zz').toString('base64')}` },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });
  assert.equal(broken.status, 401);
  assert.equal((await broken.json()).error, 'invalid_client');

  await assert.rejects(clientCredentials(t.base, 'report-job', 'report-job-secret', 'photos.read'), { error: 'invalid_scope' });

  // photo-app is public: it has no secret, so it may not get tokens as itself.
  const pub = await postToken({ grant_type: 'client_credentials', client_id: 'photo-app' });
  assert.equal(pub.status, 400);
  assert.equal((await pub.json()).error, 'unauthorized_client');
});

test('the password grant is not supported', async () => {
  const res = await postToken({ grant_type: 'password', client_id: 'photo-app', username: 'ada@example.com', password: 'correct horse battery' });
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await res.json(), { error: 'unsupported_grant_type', error_description: 'Use authorization_code or client_credentials.' });
});
