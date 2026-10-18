import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import { Secret, TOTP } from 'otpauth';
import { createApp } from '../src/app.ts';
import { SecretBox } from '../src/secret-box.ts';

const FAST = { N: 2 ** 10, r: 8, p: 1 };
const KEY = randomBytes(32);
const PASSWORD = 'correct horse battery';
let clock = Date.parse('2026-10-17T12:00:00Z'); // a fake clock the tests move forward
const { app, users } = await createApp({ encryptionKey: KEY, now: () => clock, cost: FAST });
const server = app.listen(0);
let base = '';
before(() => (base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`));
after(() => server.close());

const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

// The library plays the authenticator app on the user's phone.
const phone = (secret: string) => new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: clock });

async function signUpAndIn(email: string): Promise<string> {
  await post('/signup', { email, password: PASSWORD });
  return (await (await post('/login', { email, password: PASSWORD })).json()).token;
}

/** Signs up, turns MFA on, and returns the secret and recovery codes. */
async function enrol(email: string) {
  const token = await signUpAndIn(email);
  const { secret } = await (await post('/mfa/setup', {}, token)).json();
  const { recoveryCodes } = await (await post('/mfa/confirm', { code: phone(secret) }, token)).json();
  return { secret: secret as string, recoveryCodes: recoveryCodes as string[] };
}

async function pendingFor(email: string): Promise<string> {
  return (await (await post('/login', { email, password: PASSWORD })).json()).pendingToken;
}

test('without MFA, the password alone signs you in', async () => {
  const token = await signUpAndIn('ada@example.com');
  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual(await me.json(), { email: 'ada@example.com', mfa: false });
  assert.equal((await post('/login', { email: 'ada@example.com', password: 'wrong horse battery' })).status, 401);
});

test('MFA set-up needs a session', async () => {
  const res = await post('/mfa/setup', {});
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Sign in first.' });
});

test('set-up returns a secret and its otpauth URI; a wrong first code does not turn MFA on', async () => {
  const token = await signUpAndIn('bo@example.com');
  const setup = await (await post('/mfa/setup', {}, token)).json();
  assert.match(setup.secret, /^[A-Z2-7]{32}$/);
  assert.equal(setup.otpauthUri, `otpauth://totp/Auth%20Lab:bo%40example.com?secret=${setup.secret}&issuer=Auth%20Lab&algorithm=SHA1&digits=6&period=30`);
  const wrong = await post('/mfa/confirm', { code: '000000' }, token);
  assert.equal(wrong.status, 400);
  assert.deepEqual(await wrong.json(), { error: 'That code is not valid.' });
  assert.ok(!(await (await post('/login', { email: 'bo@example.com', password: PASSWORD })).json()).mfaRequired);
});

test('confirming with a valid code turns MFA on and returns 10 recovery codes', async () => {
  const { recoveryCodes } = await enrol('cy@example.com');
  assert.equal(recoveryCodes.length, 10);
  const res = await post('/login', { email: 'cy@example.com', password: PASSWORD });
  const body = await res.json();
  assert.equal(body.mfaRequired, true);
  assert.equal(body.token, undefined, 'the password alone no longer gives a session');
});

test('with MFA on, sign-in needs the password and then a code', async () => {
  const { secret } = await enrol('di@example.com');
  clock += 30_000; // the next 30-second step: the confirming code is used up
  const res = await post('/login/mfa', { pendingToken: await pendingFor('di@example.com'), code: phone(secret) });
  assert.equal(res.status, 200);
  const { token } = await res.json();
  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.deepEqual(await me.json(), { email: 'di@example.com', mfa: true });
});

test('a code cannot be used twice: not the confirming code, not a sign-in code', async () => {
  const { secret } = await enrol('ed@example.com');
  const replay = await post('/login/mfa', { pendingToken: await pendingFor('ed@example.com'), code: phone(secret) });
  assert.equal(replay.status, 401);
  clock += 30_000;
  const code = phone(secret);
  assert.equal((await post('/login/mfa', { pendingToken: await pendingFor('ed@example.com'), code })).status, 200);
  assert.equal((await post('/login/mfa', { pendingToken: await pendingFor('ed@example.com'), code })).status, 401);
});

test('a recovery code works once', async () => {
  const { recoveryCodes } = await enrol('fay@example.com');
  const first = await post('/login/mfa', { pendingToken: await pendingFor('fay@example.com'), code: recoveryCodes[0] });
  assert.equal(first.status, 200);
  assert.equal((await first.json()).recoveryCodesLeft, 9);
  const again = await post('/login/mfa', { pendingToken: await pendingFor('fay@example.com'), code: recoveryCodes[0] });
  assert.equal(again.status, 401);
});

test('the pending sign-in expires after 5 minutes', async () => {
  const { secret } = await enrol('gus@example.com');
  const pendingToken = await pendingFor('gus@example.com');
  clock += 5 * 60 * 1000;
  const res = await post('/login/mfa', { pendingToken, code: phone(secret) });
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: 'Sign in again.' });
});

test('five wrong codes lock code entry for 15 minutes', async () => {
  const { secret } = await enrol('hal@example.com');
  const pendingToken = await pendingFor('hal@example.com');
  for (let i = 0; i < 5; i++) assert.equal((await post('/login/mfa', { pendingToken, code: '000000' })).status, 401);
  clock += 30_000;
  const locked = await post('/login/mfa', { pendingToken, code: phone(secret) });
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get('retry-after'), '870');
  clock += 15 * 60 * 1000;
  const res = await post('/login/mfa', { pendingToken: await pendingFor('hal@example.com'), code: phone(secret) });
  assert.equal(res.status, 200);
});

test('a pending token is not a session, and it works only once', async () => {
  const { secret } = await enrol('jo@example.com');
  const pendingToken = await pendingFor('jo@example.com');
  const me = await fetch(`${base}/me`, { headers: { Authorization: `Bearer ${pendingToken}` } });
  assert.equal(me.status, 401);
  clock += 30_000;
  assert.equal((await post('/login/mfa', { pendingToken, code: phone(secret) })).status, 200);
  clock += 30_000;
  const again = await post('/login/mfa', { pendingToken, code: phone(secret) }); // a fresh, valid code
  assert.equal(again.status, 401);
  assert.deepEqual(await again.json(), { error: 'Sign in again.' });
});

test('wrong recovery codes count too, and signing in again does not reset the count', async () => {
  const { secret } = await enrol('kim@example.com');
  for (let i = 0; i < 3; i++) {
    assert.equal((await post('/login/mfa', { pendingToken: await pendingFor('kim@example.com'), code: '000000' })).status, 401);
  }
  const pendingToken = await pendingFor('kim@example.com');
  for (let i = 0; i < 2; i++) assert.equal((await post('/login/mfa', { pendingToken, code: 'aaaaa-aaaaa' })).status, 401);
  clock += 30_000;
  const res = await post('/login/mfa', { pendingToken: await pendingFor('kim@example.com'), code: phone(secret) });
  assert.equal(res.status, 429);
});

// Requests sent at the same moment: each check-then-update must run as one, or a code could be spent twice.
const statuses = (responses: Response[]) => responses.map((r) => r.status).sort();

test('the same code sent several times at once works only once', async () => {
  const { secret, recoveryCodes } = await enrol('lu@example.com');
  clock += 30_000;
  const code = phone(secret);
  const tokens = await Promise.all([1, 2, 3].map(() => pendingFor('lu@example.com')));
  const totp = await Promise.all(tokens.map((pendingToken) => post('/login/mfa', { pendingToken, code })));
  assert.deepEqual(statuses(totp), [200, 401, 401]);
  const more = await Promise.all([1, 2, 3].map(() => pendingFor('lu@example.com')));
  const recovery = await Promise.all(more.map((pendingToken) => post('/login/mfa', { pendingToken, code: recoveryCodes[0] })));
  assert.deepEqual(statuses(recovery), [200, 401, 401]);
});

test('a pending token works once, even for two requests at once', async () => {
  const { secret, recoveryCodes } = await enrol('max@example.com');
  clock += 30_000;
  const pendingToken = await pendingFor('max@example.com');
  const both = await Promise.all([
    post('/login/mfa', { pendingToken, code: recoveryCodes[0] }),
    post('/login/mfa', { pendingToken, code: phone(secret) }),
  ]);
  assert.deepEqual(statuses(both), [200, 401]);
});

test('wrong codes sent at once still lock code entry after five', async () => {
  await enrol('ned@example.com');
  const pendingToken = await pendingFor('ned@example.com');
  const guesses = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(() => post('/login/mfa', { pendingToken, code: 'aaaaa-aaaaa' })));
  assert.deepEqual(statuses(guesses), [401, 401, 401, 401, 401, 429, 429, 429]);
});

test('the TOTP secret is stored encrypted', async () => {
  const { secret } = await enrol('ivy@example.com');
  const stored = users.get('ivy@example.com')!;
  assert.match(stored.totpSecret!, /^v1\./);
  assert.ok(!JSON.stringify(stored).includes(secret));
  const opened = new SecretBox(KEY).open(stored.totpSecret!, 'ivy@example.com'); // only with the key
  assert.deepEqual(opened, Buffer.from(Secret.fromBase32(secret).bytes));
});
