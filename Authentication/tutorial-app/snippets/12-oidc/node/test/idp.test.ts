import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { startLab } from './lab.ts';

const lab = await startLab();
after(() => lab.close());

test('discovery and JWKS describe the provider and publish only public keys', async () => {
  const discovery = await (await fetch(`${lab.base}/idp/.well-known/openid-configuration`)).json();
  assert.equal(discovery.issuer, `${lab.base}/idp`);
  assert.equal(discovery.jwks_uri, `${lab.base}/idp/jwks`);
  assert.equal(discovery.end_session_endpoint, `${lab.base}/idp/logout`);
  assert.deepEqual(discovery.code_challenge_methods_supported, ['S256']);

  const { keys } = await (await fetch(`${lab.base}/idp/jwks`)).json();
  assert.equal(keys[0].kty, 'RSA');
  assert.equal(keys[0].alg, 'RS256');
  assert.equal(keys[0].use, 'sig');
  assert.equal(keys[0].kid.length, 43); // an RFC 7638 thumbprint
  for (const part of ['d', 'p', 'q', 'dp', 'dq', 'qi']) assert.equal(keys[0][part], undefined, part);
});

test('UserInfo needs a valid access token', async () => {
  assert.equal((await fetch(`${lab.base}/idp/userinfo`)).status, 401);
  const res = await fetch(`${lab.base}/idp/userinfo`, { headers: { Authorization: 'Bearer not-a-real-token' } });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
});

test('the provider redirects only to registered addresses', async () => {
  const authorize = await fetch(
    `${lab.base}/idp/authorize?response_type=code&client_id=web-app&redirect_uri=https%3A%2F%2Fevil.example.com%2Fcallback&scope=openid&state=s&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256`,
    { redirect: 'manual' },
  );
  assert.equal(authorize.status, 400);
  assert.equal(authorize.headers.get('location'), null);

  const logout = await fetch(`${lab.base}/idp/logout?client_id=web-app&post_logout_redirect_uri=https%3A%2F%2Fevil.example.com%2F`, { redirect: 'manual' });
  assert.equal(logout.status, 400);
  assert.deepEqual(await logout.json(), { error: 'invalid_request', error_description: 'post_logout_redirect_uri is not registered.' });
});
