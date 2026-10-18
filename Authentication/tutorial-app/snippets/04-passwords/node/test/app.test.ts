import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { hashPassword } from '../src/passwords.ts';

const FAST = { N: 2 ** 10, r: 8, p: 1 };
let clock = Date.parse('2026-10-17T12:00:00Z');
const { app, users } = await createApp({ cost: FAST, now: () => clock });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

const post = (path: string, body: unknown) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('sign up, then sign in with the same password', async () => {
  assert.equal((await post('/signup', { email: 'Ada@Example.com', password: 'correct horse battery' })).status, 201);
  const res = await post('/login', { email: 'ada@example.com', password: 'correct horse battery' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { email: 'ada@example.com', message: 'Signed in.' });
  assert.ok(!users.get('ada@example.com')!.passwordHash.includes('correct horse'), 'never store the password');
});

test('a wrong password and an unknown email get the same answer', async () => {
  const wrong = await post('/login', { email: 'ada@example.com', password: 'wrong horse battery' });
  const unknown = await post('/login', { email: 'nobody@example.com', password: 'wrong horse battery' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
});

test('missing fields get the normal answers, not a server error', async () => {
  assert.equal((await post('/signup', {})).status, 400);
  assert.equal((await post('/login', {})).status, 401);
});

test('sign-up rejects weak passwords and duplicate emails', async () => {
  assert.equal((await post('/signup', { email: 'bo@example.com', password: 'short' })).status, 400);
  assert.equal((await post('/signup', { email: 'ada@example.com', password: 'another long password' })).status, 409);
});

test('five failures lock the account for 15 minutes', async () => {
  await post('/signup', { email: 'cy@example.com', password: 'correct horse battery' });
  for (let i = 0; i < 5; i++) await post('/login', { email: 'cy@example.com', password: 'nope nope nope' });
  const locked = await post('/login', { email: 'cy@example.com', password: 'correct horse battery' });
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('retry-after'), '900');
  clock += 15 * 60 * 1000;
  assert.equal((await post('/login', { email: 'cy@example.com', password: 'correct horse battery' })).status, 200);
});

test('an old, weaker hash is upgraded at the next successful sign-in', async () => {
  const weak = await hashPassword('correct horse battery', { N: 2 ** 9, r: 8, p: 1 });
  users.set('di@example.com', { email: 'di@example.com', passwordHash: weak });
  assert.equal((await post('/login', { email: 'di@example.com', password: 'correct horse battery' })).status, 200);
  assert.match(users.get('di@example.com')!.passwordHash, /^scrypt\$1024\$/);
});
