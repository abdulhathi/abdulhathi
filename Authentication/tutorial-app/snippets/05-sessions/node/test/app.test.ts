import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.ts';

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const MINUTE = 60 * 1000;
let clock = Date.parse('2026-10-17T12:00:00Z');
// The tests play the part of a proxy that terminates TLS: they send X-Forwarded-Proto: https, and the app trusts
// the loopback address, so express-session sends its Secure cookie.
const { app } = await createApp({ cost: FAST, now: () => clock, trustProxy: 'loopback' });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

type Call = { sid?: string; body?: unknown; csrf?: string };
function call(method: string, path: string, { sid, body, csrf }: Call = {}) {
  const headers: Record<string, string> = { 'X-Forwarded-Proto': 'https' };
  if (sid) headers.Cookie = `sid=${sid}`;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const sidCookie = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith('sid='));
const sidFrom = (res: Response) => sidCookie(res)?.split(';')[0].slice('sid='.length);

async function signIn(email = 'ada@example.com', password = 'correct horse battery', sid?: string) {
  const res = await call('POST', '/login', { body: { email, password }, sid });
  assert.equal(res.status, 200);
  return sidFrom(res)!;
}
const csrfFor = async (sid: string) => ((await (await call('GET', '/csrf', { sid })).json()) as { csrfToken: string }).csrfToken;

test('signing in sets an HttpOnly, Secure, SameSite=Lax session cookie', async () => {
  const res = await call('POST', '/login', { body: { email: 'ada@example.com', password: 'correct horse battery' } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { email: 'ada@example.com', message: 'Signed in.' });
  const cookie = sidCookie(res)!;
  for (const flag of [/; path=\//i, /; httponly/i, /; secure/i, /; samesite=lax/i, /; (expires|max-age)=/i]) assert.match(cookie, flag);
  const me = await call('GET', '/me', { sid: sidFrom(res) });
  assert.deepEqual(await me.json(), { email: 'ada@example.com' });
});

test('a wrong password gets 401, no session cookie, and leaves the current session alone', async () => {
  const wrong = { email: 'ada@example.com', password: 'wrong horse battery' };
  const res = await call('POST', '/login', { body: wrong });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Email or password is incorrect.' });
  assert.equal(sidCookie(res), undefined);
  const sid = await signIn();
  await call('POST', '/login', { sid, body: wrong }); // a failed sign-in does not sign anyone out
  assert.equal((await call('GET', '/me', { sid })).status, 200);
});

test('without a valid session, /me and /notes answer 401', async () => {
  const none = await call('GET', '/me');
  assert.equal(none.status, 401);
  assert.deepEqual(await none.json(), { error: 'Sign in first.' });
  assert.equal((await call('GET', '/me', { sid: 'made-up-session-id' })).status, 401);
  // No session is 401 even when the CSRF token is missing too: the session is checked first.
  assert.equal((await call('POST', '/notes', { body: { text: 'buy milk' } })).status, 401);
});

test('signing in issues a new session id, so a planted one is worthless (fixation)', async () => {
  const planted = await signIn('bo@example.com', 'purple monkey dishwasher'); // the attacker's own session
  const fresh = await signIn('ada@example.com', 'correct horse battery', planted); // the victim signs in with it
  assert.notEqual(fresh, planted);
  assert.equal((await call('GET', '/me', { sid: planted })).status, 401);
  assert.deepEqual(await (await call('GET', '/me', { sid: fresh })).json(), { email: 'ada@example.com' });
});

test('a state-changing request needs the CSRF token from /csrf', async () => {
  const sid = await signIn();
  const missing = await call('POST', '/notes', { sid, body: { text: 'buy milk' } });
  assert.equal(missing.status, 403);
  assert.deepEqual(await missing.json(), { error: 'Missing or invalid CSRF token.' });
  assert.equal((await call('POST', '/notes', { sid, body: { text: 'buy milk' }, csrf: 'guess' })).status, 403);
  const ok = await call('POST', '/notes', { sid, body: { text: 'buy milk' }, csrf: await csrfFor(sid) });
  assert.equal(ok.status, 201);
  assert.deepEqual(await ok.json(), { notes: ['buy milk'] });
  // Signing out changes state too: a forged sign-out without the token is refused.
  assert.equal((await call('POST', '/logout', { sid })).status, 403);
  assert.equal((await call('GET', '/me', { sid })).status, 200);
});

test('a CSRF token from another session is rejected', async () => {
  const ada = await signIn();
  const bo = await signIn('bo@example.com', 'purple monkey dishwasher');
  const res = await call('POST', '/notes', { sid: ada, body: { text: 'hi' }, csrf: await csrfFor(bo) });
  assert.equal(res.status, 403);
});

test('signing out destroys the session on the server, so the old cookie stops working', async () => {
  const sid = await signIn();
  const out = await call('POST', '/logout', { sid, csrf: await csrfFor(sid) });
  assert.equal(out.status, 200);
  assert.deepEqual(await out.json(), { message: 'Signed out.' });
  assert.match(sidCookie(out)!, /^sid=("")?;.*(max-age=0|expires=Thu, 01 Jan 1970)/i); // "delete it"
  assert.equal((await call('GET', '/me', { sid })).status, 401); // replaying the copied cookie
});

test('an idle session expires after 30 minutes', async () => {
  const sid = await signIn();
  clock += 31 * MINUTE;
  assert.equal((await call('GET', '/me', { sid })).status, 401);
});

test('activity keeps a session alive, but never past 8 hours', async () => {
  const sid = await signIn();
  for (let i = 0; i < 23; i++) {
    clock += 20 * MINUTE; // 7 h 40 min in total
    assert.equal((await call('GET', '/me', { sid })).status, 200);
  }
  clock += 25 * MINUTE; // 8 h 5 min after sign-in
  assert.equal((await call('GET', '/me', { sid })).status, 401);
});
