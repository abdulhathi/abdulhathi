import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomToken } from '../src/tokens.ts';

test('session ids and CSRF tokens are 256 random bits', () => {
  const a = randomToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(a, 'base64url').length, 32);
  assert.notEqual(randomToken(), a);
});
