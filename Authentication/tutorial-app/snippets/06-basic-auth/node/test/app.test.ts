import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';

const CHALLENGE = 'Basic realm="Auth Lab", charset="UTF-8"';
const { app } = await createApp({ cost: { N: 2 ** 10, r: 8, p: 1 } }); // a cheap cost; the app uses COST
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

const basic = (username: string, password: string) => 'Basic ' + Buffer.from(`${username}:${password}`, 'utf8').toString('base64');
const get = (path: string, authorization?: string) => fetch(base + path, { headers: authorization ? { Authorization: authorization } : {} });

test('a request without credentials gets a 401 challenge', async () => {
  const res = await get('/me');
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('www-authenticate'), CHALLENGE);
  assert.deepEqual(await res.json(), { error: 'Authentication required.' });
});

test('the right username and password are let in, with no session cookie', async () => {
  const res = await get('/me', basic('ada', 'correct horse battery'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { username: 'ada' });
  assert.equal(res.headers.get('set-cookie'), null); // nothing is remembered: the next request sends the password again
});

test('a wrong password and an unknown user get the same answer', async () => {
  const wrong = await get('/me', basic('ada', 'wrong horse battery'));
  const unknown = await get('/me', basic('nobody', 'wrong horse battery'));
  for (const res of [wrong, unknown]) {
    assert.equal(res.status, 401);
    assert.equal(res.headers.get('www-authenticate'), CHALLENGE);
    assert.deepEqual(await res.json(), { error: 'Username or password is incorrect.' });
  }
});

test('a password may contain colons: only the first colon splits', async () => {
  const res = await get('/me', basic('ci-bot', 's3cret:with:colons'));
  assert.deepEqual(await res.json(), { username: 'ci-bot' });
});

test('names and passwords are read as UTF-8', async () => {
  const res = await get('/me', basic('zoë', 'grüße aus Köln'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { username: 'zoë' });
});

test('both Unicode spellings of a letter are accepted', async () => {
  // "ë" as one code point (what users.ts stores) or as "e" plus a combining mark: normalized to NFC, they match.
  const res = await get('/me', basic('zoe\u0308', 'gru\u0308\u00dfe aus Ko\u0308ln'));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { username: 'zoë' });
});

test('a malformed header is rejected, and another scheme counts as no credentials', async () => {
  const malformed = [
    'Basic !!!not-base64',
    'Basic ' + Buffer.from('no-colon').toString('base64'),
    'Basic ' + Buffer.from('zo\u00eb:gr\u00fc\u00dfe aus K\u00f6ln', 'latin1').toString('base64'), // not UTF-8
    'Basic YWRhOmNvcnJlY3QgaG9yc2UgYmF0dGVyeQ', // base64 without its padding
    'Basic YWRhOmNv cnJlY3QgaG9yc2UgYmF0dGVyeQ==', // a space inside the base64
  ];
  for (const header of malformed) {
    const res = await get('/me', header);
    assert.equal(res.status, 401, header);
    assert.equal(res.headers.get('www-authenticate'), CHALLENGE);
    assert.deepEqual(await res.json(), { error: 'Username or password is incorrect.' });
  }
  const bearer = await get('/me', 'Bearer abc');
  assert.equal(bearer.status, 401);
  assert.deepEqual(await bearer.json(), { error: 'Authentication required.' });
});

test('the scheme name is case-insensitive', async () => {
  const res = await get('/me', basic('ada', 'correct horse battery').replace('Basic', 'basic'));
  assert.equal(res.status, 200);
});

test('a public route needs no credentials', async () => {
  const res = await get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});
