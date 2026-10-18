import assert from 'node:assert/strict';
import { test } from 'node:test';
import { challengeFor, newVerifier, VERIFIER_FORMAT } from '../src/pkce.ts';

test('the S256 challenge matches the RFC 7636 example', () => {
  // RFC 7636 Appendix B.
  assert.equal(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('each verifier is new: 43 URL-safe characters', () => {
  const a = newVerifier();
  assert.equal(a.length, 43);
  assert.match(a, VERIFIER_FORMAT);
  assert.notEqual(a, newVerifier());
});
