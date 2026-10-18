import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateJwkThumbprint } from 'jose';
import { KeyRing } from '../src/keys.ts';
import { newSecret, signHs256, verifyHs256 } from '../src/shared-secret.ts';
import { AUDIENCE, issueAccessToken, ISSUER } from '../src/tokens.ts';

const decodePart = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

test('a JWT is three base64url parts, and anyone can read the payload', async () => {
  const ring = await KeyRing.create();
  const now = Date.parse('2026-10-17T12:00:00Z');
  const token = await issueAccessToken(ring, { id: 'u_1001', email: 'ada@example.com' }, () => now);
  const parts = token.split('.');
  assert.equal(parts.length, 3);
  // No key needed to read it: the payload is encoded, not encrypted.
  assert.deepEqual(decodePart(parts[0]), { alg: 'RS256', typ: 'JWT', kid: ring.current.kid });
  const claims = decodePart(parts[1]);
  assert.equal(claims.iss, ISSUER);
  assert.equal(claims.sub, 'u_1001');
  assert.equal(claims.aud, AUDIENCE);
  assert.equal(claims.email, 'ada@example.com');
  assert.equal(claims.iat, now / 1000);
  assert.equal(claims.nbf, claims.iat);
  assert.equal(claims.exp - claims.iat, 600);
  assert.match(claims.jti, /^[0-9a-f-]{36}$/);
});

test('HS256: the same secret signs and verifies; any other secret fails', async () => {
  const secret = newSecret();
  assert.equal(secret.length, 32);
  const token = await signHs256('u_1001', secret);
  assert.equal((await verifyHs256(token, secret)).sub, 'u_1001');
  await assert.rejects(verifyHs256(token, newSecret()));
});

// The example RSA key from RFC 7638, section 3.1, and the thumbprint the RFC gives for it.
const RFC7638_N =
  '0vx7agoebGcQSuuPiLJXZptN9nndrQmbXEps2aiAFbWhM78LhWx4cbbfAAtVT86zwu1RK7aPFFxuhDR1L6tSoc_BJECPebWKRXjBZCiFV4n3oknjhM' +
  'stn64tZ_2W-5JsGY4Hc5n9yBXArwl93lqt7_RN5w6Cf0h4QyQ5v-65YGjQR0_FDW2QvzqY368QQMicAtaSqzs8KJZgnYb9c7d0zgdAZHzu6qMQvRL5h' +
  'ajrn1n91CbOpbISD08qNLyrdkt-bFTWhAI4vMQFh6WeZu0fM4lFd2NcRwr3XPksINHaQ-G_xBniIqbw0Ls1jF44-csFCur-kEgU8awapJzKnqDKgw';

test('the JWKS holds public keys only, each with its kid', async () => {
  const ring = await KeyRing.create();
  const [jwk] = ring.jwks().keys;
  assert.deepEqual(Object.keys(jwk), ['kty', 'use', 'alg', 'kid', 'n', 'e']); // no d, p, q: nothing private
  assert.equal(jwk.kid, await calculateJwkThumbprint({ kty: jwk.kty, n: jwk.n, e: jwk.e }));
  assert.equal(await calculateJwkThumbprint({ kty: 'RSA', n: RFC7638_N, e: 'AQAB' }), 'NzbLsXh8uDCcd-6MNwXF4W_7noWXFZAfHkxZsRGC9Xs');
});
