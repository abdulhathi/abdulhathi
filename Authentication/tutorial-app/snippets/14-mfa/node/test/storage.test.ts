import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { hashRecoveryCodes, newRecoveryCodes, useRecoveryCode } from '../src/recovery-codes.ts';
import { SecretBox } from '../src/secret-box.ts';

const FAST = { N: 2 ** 10, r: 8, p: 1 }; // cheap for tests; the app uses COST
const box = new SecretBox(randomBytes(32));
const secret = randomBytes(20);

test('a sealed secret opens with the same key and email, and looks different every time', () => {
  const a = box.seal(secret, 'ada@example.com');
  const b = box.seal(secret, 'ada@example.com');
  assert.match(a, /^v1\.[\w-]+$/);
  assert.notEqual(a, b); // a fresh nonce each time
  assert.deepEqual(box.open(a, 'ada@example.com'), secret);
});

test('a changed byte, another user\'s email, or another key fails to open', () => {
  const sealed = box.seal(secret, 'ada@example.com');
  const raw = Buffer.from(sealed.slice(3), 'base64url');
  raw[20] ^= 1;
  assert.throws(() => box.open(`v1.${raw.toString('base64url')}`, 'ada@example.com'));
  assert.throws(() => box.open(sealed, 'bo@example.com'));
  assert.throws(() => new SecretBox(randomBytes(32)).open(sealed, 'ada@example.com'));
});

test('ten recovery codes, each stored only as a hash with its own salt', async () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, /^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
  const stored = await hashRecoveryCodes(codes, FAST);
  assert.equal(stored.length, 10);
  assert.equal(new Set(stored.map((c) => c.salt)).size, 10, 'a different salt for every code');
  for (const { salt } of stored) assert.equal(Buffer.from(salt, 'base64').length, 16); // NIST asks for at least 32 bits
  const json = JSON.stringify(stored);
  for (const code of codes) assert.ok(!json.includes(code.replace('-', '')), 'never store a code as typed');
});

test('each recovery code works once, typed in any case, with or without the dash', async () => {
  const codes = newRecoveryCodes();
  const stored = await hashRecoveryCodes(codes, FAST);
  assert.equal(await useRecoveryCode(stored, ` ${codes[3].toUpperCase().replace('-', '')} `, FAST), true);
  assert.equal(await useRecoveryCode(stored, codes[3], FAST), false);
  assert.equal(await useRecoveryCode(stored, 'aaaaa-aaaaa', FAST), false);
  assert.equal(stored.length, 9);
  assert.equal(await useRecoveryCode(stored, codes[9], FAST), true); // the others still work
});
