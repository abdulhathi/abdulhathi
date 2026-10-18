import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createClientSideApp } from '../src/client-side.ts';

const { app } = await createClientSideApp({ cost: { N: 2 ** 10, r: 8, p: 1 } });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

const send = (method: string, path: string, cookie?: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { ...(cookie ? { Cookie: `session=${cookie}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
async function signIn() {
  const res = await send('POST', '/login', undefined, { email: 'ada@example.com', password: 'correct horse battery' });
  return res.headers.getSetCookie()[0].split(';')[0].slice('session='.length);
}

test('a client-side cookie can be read by anyone, but not changed without the key', async () => {
  const cookie = await signIn();
  const value = decodeURIComponent(cookie);
  assert.match(value, /^s:j:\{"email":"ada@example\.com"\}\./); // the session, in plain text, then the signature
  assert.equal((await send('GET', '/me', cookie)).status, 200);
  const forged = encodeURIComponent(value.replace('ada@', 'bo@'));
  assert.equal((await send('GET', '/me', forged)).status, 401);
});

test('a client-side session cookie still works after sign-out', async () => {
  const cookie = await signIn();
  assert.equal((await send('POST', '/logout', cookie)).status, 200);
  const replay = await send('GET', '/me', cookie); // a copy taken before sign-out
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { email: 'ada@example.com' });
});
