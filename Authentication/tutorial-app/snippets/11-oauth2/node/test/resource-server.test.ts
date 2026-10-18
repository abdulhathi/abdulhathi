import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { generateKeyPair, SignJWT } from 'jose';
import { clientCredentials } from '../src/client.ts';
import { bearer, ISSUER, startApp } from './setup.ts';

const t = await startApp();
after(() => t.close());

test('the resource server refuses a missing, forged or expired token', async () => {
  const missing = await fetch(`${t.base}/api/reports`);
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('www-authenticate'), 'Bearer');

  // Every claim is right, but it is signed with the attacker's own key.
  const { privateKey } = await generateKeyPair('RS256');
  const iat = Math.floor(t.now() / 1000);
  const forged = await new SignJWT({ client_id: 'report-job', scope: 'reports.read' })
    .setProtectedHeader({ alg: 'RS256', typ: 'at+jwt' })
    .setIssuer(ISSUER)
    .setAudience('photo-api')
    .setSubject('report-job')
    .setIssuedAt(iat)
    .setExpirationTime(iat + 600)
    .sign(privateKey);
  const bad = await fetch(`${t.base}/api/reports`, bearer(forged));
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
  assert.deepEqual(await bad.json(), { error: 'invalid_token', error_description: 'The access token is invalid or expired.' });

  const { access_token } = await clientCredentials(t.base, 'report-job', 'report-job-secret', 'reports.read');
  assert.equal((await fetch(`${t.base}/api/reports`, bearer(access_token))).status, 200);
  t.advance(601_000); // the token lives 600 seconds
  assert.equal((await fetch(`${t.base}/api/reports`, bearer(access_token))).status, 401);
});

test('the resource server refuses a token for another API, of another type, or from another issuer', async () => {
  // This time the test holds the authorization server's real key, so only the claim under test is wrong.
  const keys = await generateKeyPair('RS256');
  const own = await startApp(keys);
  try {
    const iat = Math.floor(own.now() / 1000);
    const sign = ({ aud = 'photo-api', typ = 'at+jwt', iss = ISSUER } = {}) =>
      new SignJWT({ client_id: 'report-job', scope: 'reports.read' })
        .setProtectedHeader({ alg: 'RS256', typ })
        .setIssuer(iss)
        .setAudience(aud)
        .setSubject('report-job')
        .setIssuedAt(iat)
        .setExpirationTime(iat + 600)
        .setJti('test-token')
        .sign(keys.privateKey);
    assert.equal((await fetch(`${own.base}/api/reports`, bearer(await sign()))).status, 200); // all claims right
    for (const wrong of [{ aud: 'billing-api' }, { typ: 'JWT' }, { iss: 'https://evil.example.com' }]) {
      const res = await fetch(`${own.base}/api/reports`, bearer(await sign(wrong)));
      assert.equal(res.status, 401, JSON.stringify(wrong));
      assert.equal(res.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
    }
  } finally {
    own.close();
  }
});

test('the resource server refuses a token without the needed scope', async () => {
  const { access_token } = await clientCredentials(t.base, 'report-job', 'report-job-secret', 'reports.read');
  const res = await fetch(`${t.base}/api/photos`, bearer(access_token));
  assert.equal(res.status, 403);
  assert.equal(res.headers.get('www-authenticate'), 'Bearer error="insufficient_scope", scope="photos.read"');
  assert.deepEqual(await res.json(), { error: 'insufficient_scope', error_description: 'This call needs the photos.read scope.' });
});
