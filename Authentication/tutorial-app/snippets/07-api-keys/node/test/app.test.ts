import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { createApp } from '../src/app.ts';

const DAY = 24 * 60 * 60 * 1000;
let clock = Date.parse('2026-10-17T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
/** The same key with its last character changed: the right id, the wrong secret. */
const withWrongSecret = (key: string) => key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');

/** Starts an app on a free port, with a first admin key made straight in the store. */
function start(perMinute?: number) {
  const { app, store } = createApp({ now: () => clock, perMinute });
  const server = app.listen(0);
  after(() => server.close());
  const call = (method: string, path: string, headers: Record<string, string> = {}, body?: unknown) =>
    fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`, {
      method,
      headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
  const admin = store.issue('admin', ['keys:manage']).key;
  const createKey = async (body: object = { name: 'nightly-export', scopes: ['reports:read'] }) =>
    (await (await call('POST', '/keys', bearer(admin), body)).json()) as { id: string; key: string };
  return { call, bearer, admin, createKey, store };
}

const { call, bearer, admin, createKey, store } = start();

test('an admin creates a key, shown once, that reads reports', async () => {
  const res = await call('POST', '/keys', bearer(admin), { name: 'nightly-export', scopes: ['reports:read'], expiresInDays: 30 });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.key, /^ak_live_[0-9a-f]{12}_/);
  assert.equal(body.expiresAt, '2026-11-16T12:00:00Z');
  assert.equal(body.note, 'Copy this key now: it is shown only once.');
  assert.ok(!JSON.stringify(store.get(body.id)).includes(body.key), 'the store holds only a hash');

  const reports = await call('GET', '/reports', bearer(body.key));
  assert.equal(reports.status, 200);
  assert.deepEqual(await reports.json(), {
    client: 'nightly-export',
    reports: [{ month: '2026-09', orders: 1520 }, { month: '2026-10', orders: 1710 }],
  });
  assert.equal((await call('GET', '/reports', { 'X-API-Key': body.key })).status, 200, 'X-API-Key works too');
});

test('no key, a wrong key, and a key in the URL are refused', async () => {
  const { key } = await createKey();
  const none = await call('GET', '/reports');
  assert.equal(none.status, 401);
  assert.equal(none.headers.get('www-authenticate'), 'Bearer');
  assert.deepEqual(await none.json(), { error: 'Send an API key in the Authorization or X-API-Key header.' });
  const wrong = await call('GET', '/reports', bearer(withWrongSecret(key)));
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
  assert.deepEqual(await wrong.json(), { error: 'Invalid API key.' });
  const inUrl = await call('GET', `/reports?api_key=${key}`);
  assert.equal(inUrl.status, 400);
  assert.deepEqual(await inUrl.json(), { error: 'Send the API key in a header, never in the URL.' });
});

test('a key without the needed scope gets 403', async () => {
  const { key } = await createKey();
  const create = await call('POST', '/keys', bearer(key), { name: 'sneaky', scopes: ['keys:manage'] });
  assert.equal(create.status, 403);
  assert.equal(create.headers.get('www-authenticate'), 'Bearer error="insufficient_scope", scope="keys:manage"');
  assert.deepEqual(await create.json(), { error: 'This key lacks the keys:manage scope.' });
  const read = await call('GET', '/reports', bearer(admin));
  assert.equal(read.status, 403);
  assert.deepEqual(await read.json(), { error: 'This key lacks the reports:read scope.' });
});

test('creating a key checks the name, scopes and lifetime', async () => {
  const unknown = await call('POST', '/keys', bearer(admin), { name: 'x', scopes: ['reports:write'] });
  assert.equal(unknown.status, 400);
  assert.deepEqual(await unknown.json(), { error: 'Scopes must be a non-empty list from: reports:read, keys:manage.' });
  assert.equal((await call('POST', '/keys', bearer(admin), { name: ' ', scopes: ['reports:read'] })).status, 400);
  assert.equal((await call('POST', '/keys', bearer(admin), { name: 'x', scopes: ['reports:read'], expiresInDays: 0 })).status, 400);
  const wrongType = await call('POST', '/keys', bearer(admin), { name: 'x', scopes: ['reports:read'], expiresInDays: true });
  assert.equal(wrongType.status, 400, 'a wrong type is refused, not turned into a number');
});

test('a key stops working when it expires', async () => {
  const { key } = await createKey({ name: 'short-lived', scopes: ['reports:read'], expiresInDays: 1 });
  assert.equal((await call('GET', '/reports', bearer(key))).status, 200);
  clock += DAY;
  const res = await call('GET', '/reports', bearer(key));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'This API key has expired.' });
  const guess = await call('GET', '/reports', bearer(withWrongSecret(key)));
  assert.deepEqual(await guess.json(), { error: 'Invalid API key.' }, 'only the real key learns that it expired');
});

test('a revoked key stops working at once', async () => {
  const { id, key } = await createKey();
  const revoke = await call('POST', `/keys/${id}/revoke`, bearer(admin));
  assert.equal(revoke.status, 200);
  assert.deepEqual(await revoke.json(), { id, revoked: true });
  const res = await call('GET', '/reports', bearer(key));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'This API key has been revoked.' });
  const guess = await call('GET', '/reports', bearer(withWrongSecret(key)));
  assert.deepEqual(await guess.json(), { error: 'Invalid API key.' }, 'only the real key learns that it was revoked');
  assert.equal((await call('POST', '/keys/000000000000/revoke', bearer(admin))).status, 404);
});

test('rotation keeps both keys working until the old one expires', async () => {
  const old = await createKey();
  const res = await call('POST', `/keys/${old.id}/rotate`, bearer(admin));
  assert.equal(res.status, 201);
  const fresh = await res.json();
  assert.notEqual(fresh.key, old.key);
  assert.equal(fresh.expiresAt, iso(clock + 90 * DAY), 'the new key gets the full lifetime');
  assert.equal(fresh.oldKeyExpiresAt, iso(clock + DAY));
  const again = await (await call('POST', `/keys/${old.id}/rotate`, bearer(admin))).json();
  assert.equal(again.expiresAt, iso(clock + 90 * DAY), 'rotating the old key again does not shorten the new one');
  assert.equal((await call('GET', '/reports', bearer(old.key))).status, 200, 'both work during the overlap');
  assert.equal((await call('GET', '/reports', bearer(fresh.key))).status, 200);
  clock += DAY;
  assert.equal((await call('GET', '/reports', bearer(old.key))).status, 401);
  assert.equal((await call('GET', '/reports', bearer(fresh.key))).status, 200);
  await call('POST', `/keys/${fresh.id}/revoke`, bearer(admin));
  assert.equal((await call('POST', `/keys/${fresh.id}/rotate`, bearer(admin))).status, 409);
});

test('each key has its own rate limit', async () => {
  const limited = start(3);
  const a = await limited.createKey();
  const b = await limited.createKey();
  for (let i = 0; i < 3; i++) assert.equal((await limited.call('GET', '/reports', bearer(a.key))).status, 200);
  clock += 15_000;
  const blocked = await limited.call('GET', '/reports', bearer(a.key));
  assert.equal(blocked.status, 429);
  assert.equal(blocked.headers.get('retry-after'), '45', 'seconds until the next window');
  assert.deepEqual(await blocked.json(), { error: 'Rate limit exceeded. Try again later.' });
  assert.equal((await limited.call('GET', '/reports', bearer(b.key))).status, 200, 'another key is not affected');
  clock += 45_000;
  assert.equal((await limited.call('GET', '/reports', bearer(a.key))).status, 200, 'a new window starts');
});
