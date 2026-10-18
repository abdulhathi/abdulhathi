import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createLocalJWKSet, decodeProtectedHeader, exportSPKI, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { createApp } from '../src/app.ts';
import { newSigningKey, type SigningKey } from '../src/keys.ts';
import { AUDIENCE, ISSUER } from '../src/tokens.ts';

let clock = Date.parse('2026-10-17T12:00:00Z');
const { app, ring } = await createApp({ now: () => clock });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

const signIn = () =>
  fetch(base + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery' }),
  });
const login = async () => ((await (await signIn()).json()) as { access_token: string }).access_token;
const me = (token: string) => fetch(base + '/me', { headers: { Authorization: `Bearer ${token}` } });

// Claims that pass every check; each test changes one thing.
const seconds = () => Math.floor(clock / 1000);
const goodClaims = (): JWTPayload => ({
  iss: ISSUER, sub: 'u_1001', aud: AUDIENCE, email: 'ada@example.com',
  iat: seconds(), nbf: seconds(), exp: seconds() + 600, jti: randomUUID(),
});
const sign = (claims: JWTPayload, key: SigningKey = ring.current) =>
  new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: key.kid }).sign(key.privateKey);
// Builds a token by hand, the way an attacker would.
const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
const forge = (header: object, claims: object, signature: (input: string) => string = () => '') => {
  const input = `${b64(header)}.${b64(claims)}`;
  return `${input}.${signature(input)}`;
};

test('sign in, then call /me with the bearer token', async () => {
  const signedIn = await signIn();
  assert.equal(signedIn.headers.get('cache-control'), 'no-store');
  const body = (await signedIn.json()) as { access_token: string; token_type: string; expires_in: number };
  assert.equal(body.token_type, 'Bearer');
  assert.equal(body.expires_in, 600);
  const res = await me(body.access_token);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { sub: 'u_1001', email: 'ada@example.com' });
});

test('a wrong or missing password gets 401 and no token', async () => {
  for (const body of [{ email: 'ada@example.com', password: 'wrong horse battery' }, { email: 'ada@example.com' }, {}]) {
    const res = await fetch(base + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Email or password is incorrect.' });
  }
});

test('no token, or another scheme, gets 401 and WWW-Authenticate: Bearer', async () => {
  const cases: Record<string, string>[] = [{}, { Authorization: 'Basic YWRhOnNlY3JldA==' }];
  for (const headers of cases) {
    const res = await fetch(base + '/me', { headers });
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), 'Bearer');
    assert.deepEqual(await res.json(), { error: 'Missing bearer token.' });
  }
});

test('expiry and not-before are checked, with 30 seconds of clock skew', async () => {
  const token = await login();
  clock += 620_000; // 20 s past exp: inside the skew
  assert.equal((await me(token)).status, 200);
  clock += 20_000; // 40 s past exp
  const expired = await me(token);
  assert.equal(expired.status, 401);
  assert.equal(expired.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
  assert.deepEqual(await expired.json(), { error: 'Invalid or expired token.' });
  assert.equal((await me(await sign({ ...goodClaims(), nbf: seconds() + 20 }))).status, 200);
  assert.equal((await me(await sign({ ...goodClaims(), nbf: seconds() + 60 }))).status, 401);
});

test('a token for another audience is rejected', async () => {
  assert.equal((await me(await sign({ ...goodClaims(), aud: 'https://other-api.example.com' }))).status, 401);
});

test('a token from another issuer is rejected', async () => {
  assert.equal((await me(await sign({ ...goodClaims(), iss: 'https://evil.example.com' }))).status, 401);
});

test('a token missing a required claim is rejected', async () => {
  for (const name of ['exp', 'sub', 'jti']) {
    const claims = goodClaims();
    delete claims[name];
    assert.equal((await me(await sign(claims))).status, 401, `without ${name}`);
  }
});

test('changing the payload breaks the signature', async () => {
  const [header, , signature] = (await login()).split('.');
  const tampered = `${header}.${b64({ ...goodClaims(), sub: 'u_1002' })}.${signature}`;
  assert.equal((await me(tampered)).status, 401);
});

test('alg "none" is rejected', async () => {
  // It even names one of our keys; the algorithm allowlist refuses it before any key is used.
  assert.equal((await me(forge({ alg: 'none', typ: 'JWT', kid: ring.current.kid }, goodClaims()))).status, 401);
});

test('HS256 signed with the public key (algorithm confusion) is rejected', async () => {
  // The attacker knows the public key (it is published) and uses it as an HMAC secret.
  const publicPem = await exportSPKI(ring.current.publicKey);
  const token = forge({ alg: 'HS256', typ: 'JWT', kid: ring.current.kid }, goodClaims(), (input) =>
    createHmac('sha256', publicPem).update(input).digest('base64url'),
  );
  assert.equal((await me(token)).status, 401);
});

test('a token signed with an unknown key (kid) is rejected', async () => {
  const stranger = await newSigningKey(); // a valid RS256 key, but not one of ours
  assert.equal((await me(await sign(goodClaims(), stranger))).status, 401);
});

test('a token that points to its own key set (jku) is rejected', async () => {
  // The attacker signs with their own key, names our kid, and says where to fetch "their" keys. The verifier never
  // follows jku: it checks the signature with our key for that kid, and the signature does not match.
  const stranger = await newSigningKey();
  const token = await new SignJWT(goodClaims())
    .setProtectedHeader({ alg: 'RS256', kid: ring.current.kid, jku: 'https://evil.example.com/jwks.json' })
    .sign(stranger.privateKey);
  assert.equal((await me(token)).status, 401);
});

test('rotation: old tokens keep working until their key is retired', async () => {
  const oldToken = await login();
  const oldKid = ring.current.kid;
  await ring.rotate();
  const newToken = await login();
  assert.notEqual(decodeProtectedHeader(newToken).kid, oldKid);
  const jwks = (await (await fetch(base + '/.well-known/jwks.json')).json()) as { keys: { kid: string }[] };
  assert.deepEqual(jwks.keys.map((k) => k.kid), [oldKid, ring.current.kid]);
  assert.equal((await me(oldToken)).status, 200);
  assert.equal((await me(newToken)).status, 200);

  ring.retire(oldKid); // after the old key's last token has expired
  assert.equal((await me(oldToken)).status, 401);
  assert.equal((await me(newToken)).status, 200);
});

test('another API can verify a token with only the published JWKS', async () => {
  const token = await login();
  const jwks = await (await fetch(base + '/.well-known/jwks.json')).json();
  const { payload } = await jwtVerify(token, createLocalJWKSet(jwks), {
    algorithms: ['RS256'], issuer: ISSUER, audience: AUDIENCE, currentDate: new Date(clock),
  });
  assert.equal(payload.sub, 'u_1001');
});
