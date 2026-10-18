import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
let clock = Date.parse('2026-10-17T12:00:00Z');
const { app } = createApp({ now: () => clock });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

type Tokens = { status: number; access: string; refresh: string; setCookie: string; body: Record<string, unknown> };

// fetch keeps no cookie jar, so each call sends the refresh cookie by hand, the way a browser would.
async function call(path: string, refresh?: string, access?: string): Promise<Tokens> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (refresh !== undefined) headers.Cookie = `refresh_token=${refresh}`;
  if (access) headers.Authorization = `Bearer ${access}`;
  const body = path === '/auth/login' ? JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery' }) : undefined;
  const res = await fetch(base + path, { method: 'POST', headers, body });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const json = res.status === 204 ? {} : ((await res.json()) as Record<string, unknown>);
  return {
    status: res.status,
    access: String(json.access_token ?? ''),
    refresh: /refresh_token=([^;]*)/.exec(setCookie)?.[1] ?? '',
    setCookie,
    body: json,
  };
}
const login = () => call('/auth/login');
const refresh = (token: string) => call('/auth/refresh', token);
const me = (access: string) => fetch(base + '/me', { headers: { Authorization: `Bearer ${access}` } });

test('login returns a 10-minute access token and sets the refresh cookie', async () => {
  const res = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'ada@example.com', password: 'correct horse battery' }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json();
  assert.deepEqual(Object.keys(body), ['access_token', 'token_type', 'expires_in']); // no refresh token in the body
  assert.equal(body.expires_in, 600);
  const cookie = res.headers.get('set-cookie')!.toLowerCase();
  for (const part of ['httponly', 'secure', 'samesite=strict', 'path=/auth', 'max-age=604800']) {
    assert.ok(cookie.includes(part), `cookie has ${part}`);
  }
  assert.equal((await me(body.access_token)).status, 200);
});

test('refresh rotates: a new refresh token and a new access token every time', async () => {
  const first = await login();
  const second = await refresh(first.refresh);
  assert.equal(second.status, 200);
  assert.notEqual(second.refresh, first.refresh);
  assert.notEqual(second.access, first.access);
  const third = await refresh(second.refresh);
  assert.equal(third.status, 200);
  assert.notEqual(third.refresh, second.refresh);
  assert.deepEqual(await (await me(third.access)).json(), { sub: 'u_1001', email: 'ada@example.com' });
});

test('reusing a spent refresh token revokes the whole family', async () => {
  const first = await login();
  const second = await refresh(first.refresh); // the user refreshes; first is now spent
  const replay = await refresh(first.refresh); // someone presents first again
  assert.equal(replay.status, 401);
  assert.deepEqual(replay.body, { error: 'Refresh token reuse detected. Sign in again.' });
  assert.match(replay.setCookie, /refresh_token=;/); // the cookie is cleared
  const next = await refresh(second.refresh); // the newest token died with its family
  assert.equal(next.status, 401);
  assert.deepEqual(next.body, { error: 'Invalid refresh token.' });
});

test('parallel refreshes with one token: exactly one wins, and the rest count as reuse', async () => {
  const first = await login();
  const results = await Promise.all(Array.from({ length: 8 }, () => refresh(first.refresh)));
  const winners = results.filter((r) => r.status === 200);
  assert.equal(winners.length, 1);
  assert.ok(results.some((r) => r.body.error === 'Refresh token reuse detected. Sign in again.'));
  assert.equal((await refresh(winners[0].refresh)).status, 401); // the family was revoked
});

test('an expired access token is refused, and refresh gets a new one', async () => {
  const signedIn = await login();
  clock += 11 * MINUTE;
  const expired = await me(signedIn.access);
  assert.equal(expired.status, 401);
  assert.equal(expired.headers.get('www-authenticate'), 'Bearer error="invalid_token"');
  const renewed = await refresh(signedIn.refresh);
  assert.equal(renewed.status, 200);
  assert.equal((await me(renewed.access)).status, 200);
});

test('a refresh token unused for 7 days expires', async () => {
  const first = await login();
  clock += 7 * DAY - MINUTE;
  const second = await refresh(first.refresh); // still inside its 7 days
  assert.equal(second.status, 200);
  clock += 7 * DAY;
  const late = await refresh(second.refresh);
  assert.equal(late.status, 401);
  assert.deepEqual(late.body, { error: 'Refresh token expired. Sign in again.' });
});

test('the family ends 30 days after sign-in, however often it refreshes', async () => {
  let current = (await login()).refresh;
  for (let day = 6; day <= 24; day += 6) {
    clock += 6 * DAY;
    current = (await refresh(current)).refresh;
  }
  clock += 5 * DAY; // day 29
  const lastDay = await refresh(current);
  assert.equal(lastDay.status, 200);
  assert.match(lastDay.setCookie.toLowerCase(), /max-age=86400/); // one day left, not seven
  clock += DAY; // day 30
  const ended = await refresh(lastDay.refresh);
  assert.equal(ended.status, 401);
  assert.deepEqual(ended.body, { error: 'Refresh token expired. Sign in again.' });
});

test('logout revokes the family and clears the cookie', async () => {
  const signedIn = await login();
  const out = await call('/auth/logout', signedIn.refresh);
  assert.equal(out.status, 204);
  assert.match(out.setCookie, /refresh_token=;/);
  assert.match(out.setCookie, /max-age=0|1970/i); // Max-Age=0 or a past expiry deletes the cookie
  const after = await refresh(signedIn.refresh);
  assert.equal(after.status, 401);
  assert.deepEqual(after.body, { error: 'Invalid refresh token.' });
});

test('an access token outlives logout unless its jti is deny-listed', async () => {
  const a = await login();
  await call('/auth/logout', a.refresh); // cookie only
  assert.equal((await me(a.access)).status, 200, 'a JWT stays valid until it expires');

  const b = await login();
  await call('/auth/logout', b.refresh, b.access); // cookie and access token
  assert.equal((await me(b.access)).status, 401);
});

test('two sign-ins are separate families: signing out of one keeps the other', async () => {
  const laptop = await login();
  const phone = await login();
  await call('/auth/logout', laptop.refresh);
  assert.equal((await refresh(phone.refresh)).status, 200);
  assert.equal((await refresh(laptop.refresh)).status, 401);
});

test('a missing or made-up refresh token is rejected', async () => {
  const missing = await call('/auth/refresh');
  assert.equal(missing.status, 401);
  assert.deepEqual(missing.body, { error: 'Missing refresh token.' });
  const madeUp = await refresh('bm90LWEtcmVhbC10b2tlbi1qdXN0LXNvbWUtYnl0ZXM');
  assert.equal(madeUp.status, 401);
  assert.deepEqual(madeUp.body, { error: 'Invalid refresh token.' });
});
