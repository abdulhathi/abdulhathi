import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, needsRehash, passwordProblem, verifyPassword } from '../src/passwords.ts';

// Tests use a cheap cost so they run fast; the app uses COST.
const FAST = { N: 2 ** 10, r: 8, p: 1 };

test('a hash verifies the right password and rejects a wrong one', async () => {
  const stored = await hashPassword('correct horse battery', FAST);
  assert.match(stored, /^scrypt\$1024\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  assert.equal(await verifyPassword('correct horse battery', stored), true);
  assert.equal(await verifyPassword('correct horse batterz', stored), false);
});

test('the same password hashes differently every time (a random salt)', async () => {
  const a = await hashPassword('correct horse battery', FAST);
  const b = await hashPassword('correct horse battery', FAST);
  assert.notEqual(a, b);
});

test('hashes made with weaker settings are flagged for rehashing', async () => {
  const old = await hashPassword('correct horse battery', FAST);
  assert.equal(needsRehash(old), true);
  assert.equal(needsRehash(old, FAST), false);
  assert.equal(needsRehash('md5$5f4dcc3b5aa765d61d8327deb882cf99'), true);
});

test('the password policy checks length and common passwords only', () => {
  assert.equal(passwordProblem('short'), 'Use at least 12 characters.');
  assert.equal(passwordProblem('Password1234'), 'That password is too common. Choose another.');
  assert.equal(passwordProblem('all lowercase words are fine'), null);
});
