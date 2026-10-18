import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { SoftAuthenticator } from './authenticator.ts';

let clock = Date.parse('2026-10-17T12:00:00Z');
const { app, store } = createApp({ rpId: 'localhost', origin: 'http://localhost:3000', now: () => clock });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

const post = (path: string, body: unknown = {}) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const json = async (path: string, body: unknown = {}) => (await post(path, body)).json();

/** Registers a new account with a passkey made by `auth`. */
async function register(username: string, auth = new SoftAuthenticator()) {
  const options = await json('/webauthn/register/options', { username });
  return { auth, res: await post('/webauthn/register/verify', auth.register(options)) };
}

test('registration options ask for a discoverable passkey with user verification', async () => {
  const res = await post('/webauthn/register/options', { username: 'Ada@Example.com' });
  assert.equal(res.status, 200);
  const options = await res.json();
  assert.equal(options.rp.id, 'localhost');
  assert.equal(options.user.name, 'ada@example.com');
  assert.match(options.challenge, /^[A-Za-z0-9_-]{43}$/); // 32 random bytes, base64url
  assert.equal(options.authenticatorSelection.residentKey, 'required');
  assert.equal(options.authenticatorSelection.userVerification, 'required');
  assert.ok(options.pubKeyCredParams.some((p: { alg: number }) => p.alg === -7), 'offers ES256');
  assert.notEqual((await json('/webauthn/register/options', { username: 'x@example.com' })).challenge, options.challenge);
});

test('register a passkey, then sign in with it', async () => {
  const { auth, res } = await register('ada@example.com');
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.deepEqual(body, { username: 'ada@example.com', credentialId: auth.credentialId.toString('base64url'), deviceType: 'singleDevice', backedUp: false });
  const stored = store.credentials.get(body.credentialId)!;
  assert.equal(stored.counter, 0);
  assert.deepEqual(stored.transports, ['hybrid', 'internal']);
  assert.equal(stored.publicKey[0], 0xa5, 'a COSE key: a CBOR map of five entries');

  const login = await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options')));
  assert.equal(login.status, 200);
  assert.deepEqual(await login.json(), { username: 'ada@example.com', message: 'Signed in.' });
  assert.equal(stored.counter, 1, 'the new sign count is saved');
});

test('a username can be registered only once', async () => {
  await register('bo@example.com');
  const again = await post('/webauthn/register/options', { username: 'bo@example.com' });
  assert.equal(again.status, 409);
  assert.deepEqual(await again.json(), { error: 'That username is already registered.' });
});

test('a synced passkey reports its backup state and a sign count of zero', async () => {
  const { auth, res } = await register('cy@example.com', new SoftAuthenticator({ synced: true }));
  const body = await res.json();
  assert.equal(body.deviceType, 'multiDevice');
  assert.equal(body.backedUp, true);
  for (let i = 0; i < 2; i++) {
    const login = await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options')));
    assert.equal(login.status, 200, 'a counter that stays at 0 is allowed');
  }
  assert.equal(store.credentials.get(body.credentialId)!.counter, 0);
});

test('a credential can be registered only once', async () => {
  const { auth, res } = await register('lu@example.com');
  assert.equal(res.status, 201);
  const again = await post('/webauthn/register/verify', auth.register(await json('/webauthn/register/options', { username: 'mo@example.com' })));
  assert.equal(again.status, 400);
  assert.deepEqual(await again.json(), { error: 'Registration failed.' });
  assert.equal(store.findUserByName('mo@example.com'), undefined, 'no account was made');
});

test('a response from another origin is rejected (phishing)', async () => {
  const options = await json('/webauthn/register/options', { username: 'di@example.com' });
  const phished = new SoftAuthenticator().register(options, { origin: 'https://login.example.com.evil.example' });
  assert.equal((await post('/webauthn/register/verify', phished)).status, 400);

  const { auth } = await register('di@example.com');
  const login = await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options'), { origin: 'https://evil.example' }));
  assert.equal(login.status, 401);
  assert.deepEqual(await login.json(), { error: 'Passkey sign-in failed.' });
});

test('a response for another RP ID is rejected', async () => {
  const { auth } = await register('ed@example.com');
  const login = await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options'), { rpId: 'evil.example' }));
  assert.equal(login.status, 401);
});

test('a challenge the server never issued is rejected', async () => {
  const { auth } = await register('fay@example.com');
  const forged = auth.login(await json('/webauthn/login/options'), { challenge: Buffer.alloc(32, 7).toString('base64url') });
  const res = await post('/webauthn/login/verify', forged);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Unknown or expired challenge.' });
});

test('a challenge can be used only once', async () => {
  const options = await json('/webauthn/register/options', { username: 'gus@example.com' });
  const auth = new SoftAuthenticator();
  const registration = auth.register(options);
  assert.equal((await post('/webauthn/register/verify', registration)).status, 201);
  assert.equal((await post('/webauthn/register/verify', registration)).status, 400);

  const assertion = auth.login(await json('/webauthn/login/options'));
  assert.equal((await post('/webauthn/login/verify', assertion)).status, 200);
  const replay = await post('/webauthn/login/verify', assertion);
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { error: 'Unknown or expired challenge.' });
});

test('a challenge works only for the ceremony it was issued for', async () => {
  const { auth } = await register('pat@example.com');
  const registration = await json('/webauthn/register/options', { username: 'quin@example.com' });
  const login = await post('/webauthn/login/verify', auth.login({ challenge: registration.challenge, rpId: 'localhost' }));
  assert.equal(login.status, 400);
  assert.deepEqual(await login.json(), { error: 'Unknown or expired challenge.' });

  const { challenge } = await json('/webauthn/login/options');
  const res = await post('/webauthn/register/verify', new SoftAuthenticator().register({ ...registration, challenge }));
  assert.equal(res.status, 400);
});

test('a challenge expires after five minutes', async () => {
  const { auth } = await register('hal@example.com');
  const options = await json('/webauthn/login/options');
  clock += 5 * 60 * 1000;
  assert.equal((await post('/webauthn/login/verify', auth.login(options))).status, 400);
});

test('a sign count that does not increase is rejected (a cloned authenticator)', async () => {
  const { auth } = await register('ivy@example.com');
  assert.equal((await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options')))).status, 200); // count 1
  for (const signCount of [1, 0]) {
    const clone = await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options'), { signCount }));
    assert.equal(clone.status, 401, `count ${signCount} after 1`);
  }
});

test('user presence and user verification are required', async () => {
  for (const tamper of [{ up: false }, { uv: false }]) {
    const options = await json('/webauthn/register/options', { username: 'jo@example.com' });
    assert.equal((await post('/webauthn/register/verify', new SoftAuthenticator().register(options, tamper))).status, 400);
  }
  const { auth } = await register('jo@example.com');
  for (const tamper of [{ up: false }, { uv: false }]) {
    assert.equal((await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options'), tamper))).status, 401);
  }
});

test("the user handle must be the credential owner's", async () => {
  const { auth } = await register('nia@example.com');
  await register('oz@example.com');
  const oz = store.findUserByName('oz@example.com')!;
  const res = await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options'), { userHandle: oz.id }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Passkey sign-in failed.' });
});

test('a device-bound passkey cannot turn into a synced one', async () => {
  const { auth } = await register('rex@example.com');
  const res = await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options'), { synced: true }));
  assert.equal(res.status, 401);
  assert.equal((await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options')))).status, 200, 'the real flags still work');
});

test('a signature from another key is rejected', async () => {
  const { auth } = await register('kim@example.com');
  const otherKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  assert.equal((await post('/webauthn/login/verify', auth.login(await json('/webauthn/login/options'), { signWith: otherKey }))).status, 401);
});

test('the demo page is served at /', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/html/);
  const html = await res.text();
  assert.match(html, /navigator\.credentials\.create/);
  assert.match(html, /navigator\.credentials\.get/);
});
