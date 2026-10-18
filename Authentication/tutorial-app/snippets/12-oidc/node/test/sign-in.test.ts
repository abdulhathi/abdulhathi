import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { query, startLab } from './lab.ts';

const lab = await startLab();
after(() => lab.close());

test('a full sign-in: code flow with PKCE, state and nonce creates a session', async () => {
  const browser = lab.browser();
  assert.equal((await browser.open('/me')).status, 401);

  const { status, location: authorize } = await browser.visit('/login');
  assert.equal(status, 302);
  assert.ok(authorize.startsWith(`${lab.base}/idp/authorize?`));
  const request = query(authorize);
  assert.equal(request.response_type, 'code');
  assert.equal(request.client_id, 'web-app');
  assert.equal(request.redirect_uri, `${lab.base}/callback`);
  assert.equal(request.scope, 'openid profile email');
  assert.equal(request.code_challenge_method, 'S256');
  for (const p of ['state', 'nonce', 'code_challenge']) assert.ok(request[p], p);

  const { location: callback } = await browser.visit(authorize);
  assert.ok(callback.startsWith(`${lab.base}/callback?code=`));
  assert.deepEqual(await browser.visit(callback), { status: 302, location: '/me' });

  const me = await browser.open('/me');
  assert.equal(me.status, 200);
  assert.deepEqual(await me.json(), { sub: 'u-1001', name: 'Ada Example', email: 'ada@example.com' });
});

test('the relying party refuses a callback with the wrong state', async () => {
  const browser = lab.browser();
  const callback = await browser.startSignIn();
  const forged = `${lab.base}/callback?code=${query(callback).code}&state=made-by-an-attacker`;
  const res = await browser.open(forged);
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Sign-in failed.' });
  assert.equal((await browser.open('/me')).status, 401);
});

test('sign-out ends the local session and returns from the provider', async () => {
  const browser = lab.browser();
  await browser.visit(await browser.startSignIn());
  assert.equal((await browser.open('/me')).status, 200);

  const { status, location: endSession } = await browser.visit('/logout', 'POST');
  assert.equal(status, 302);
  assert.ok(endSession.startsWith(`${lab.base}/idp/logout?`));
  const request = query(endSession);
  assert.equal(request.post_logout_redirect_uri, `${lab.base}/logged-out`);
  assert.ok(request.id_token_hint);

  const { location: back } = await browser.visit(endSession);
  assert.ok(back.startsWith(`${lab.base}/logged-out?state=`));
  assert.equal((await browser.visit(back)).location, '/');
  assert.equal((await browser.open('/me')).status, 401);
  assert.deepEqual(await (await browser.open('/')).json(), { signedIn: false });
});

test('a sign-out callback with the wrong state does not redirect', async () => {
  const browser = lab.browser();
  await browser.visit(await browser.startSignIn());
  await browser.visit('/logout', 'POST'); // the local session ends here
  const res = await browser.open('/logged-out?state=made-by-an-attacker');
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('location'), null);
  assert.deepEqual(await res.json(), { error: 'Sign-out state does not match.' });
  assert.equal((await browser.open('/me')).status, 401);
});
