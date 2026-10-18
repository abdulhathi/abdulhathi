import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test, type TestContext } from 'node:test';
import { createApp } from '../src/app.ts';
import { sha256 } from '../src/magic-links.ts';

const BAD_LINK = { error: 'This link is not valid or has expired. Ask for a new one.' };
const BAD_CODE = { error: 'That code is not valid or has expired.' };

/** A fresh app on a random port, with its own fake clock and outbox. Fetch keeps no cookies, so tests pass them. */
async function start(t: TestContext) {
  const clock = { now: Date.parse('2026-10-17T12:00:00Z') };
  const { app, links, outbox } = createApp({ users: ['ada@example.com'], now: () => clock.now });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const get = (path: string, cookie = '') => fetch(base + path, { headers: { Cookie: cookie } });
  const postJson = (path: string, body: unknown) =>
    fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const postForm = (path: string, form: Record<string, string>) => fetch(base + path, { method: 'POST', body: new URLSearchParams(form) });

  /** Asks for a sign-in email, and returns the response and this browser's cookie. */
  const ask = async (email: string) => {
    const res = await postJson('/auth/email', { email });
    return { res, browser: cookie(res, 'signin_browser') };
  };
  /** The link token and code from the newest email to this address. */
  const inbox = (email: string) => {
    const text = outbox.last(email)!.text;
    return { token: /token=([\w-]+)/.exec(text)![1], code: /code: (\d{6})/.exec(text)![1] };
  };
  /** POST /auth/email with a forged Host header (fetch always sends the real one, so this uses node:http). */
  const askWithHost = (email: string, host: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request(`${base}/auth/email`, { method: 'POST', headers: { Host: host, 'Content-Type': 'application/json' } }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on('error', reject);
      req.end(JSON.stringify({ email }));
    });
  return { clock, links, outbox, get, postJson, postForm, ask, askWithHost, inbox };
}

/** "name=value" from a response's Set-Cookie headers, ready to send back. */
function cookie(res: Response, name: string): string {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';
}

test('the emailed link signs you in once', async (t) => {
  const lab = await start(t);
  const { res, browser } = await lab.ask('ada@example.com');
  assert.equal(res.status, 202);
  const { token } = lab.inbox('ada@example.com');
  const signedIn = await lab.get(`/auth/verify?token=${token}`, browser);
  assert.equal(signedIn.status, 200);
  assert.deepEqual(await signedIn.json(), { email: 'ada@example.com', message: 'Signed in.' });
  const me = await lab.get('/me', cookie(signedIn, 'session'));
  assert.deepEqual(await me.json(), { email: 'ada@example.com' });
  const again = await lab.get(`/auth/verify?token=${token}`, browser);
  assert.equal(again.status, 400);
  assert.deepEqual(await again.json(), BAD_LINK);
});

test('an expired link or code fails', async (t) => {
  const lab = await start(t);
  const { browser } = await lab.ask('ada@example.com');
  const { token, code } = lab.inbox('ada@example.com');
  lab.clock.now += 15 * 60 * 1000;
  const res = await lab.get(`/auth/verify?token=${token}`, browser);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), BAD_LINK);
  assert.equal((await lab.postJson('/auth/code', { email: 'ada@example.com', code })).status, 401);
});

test('the same link used twice at once signs in only once', async (t) => {
  const lab = await start(t);
  await lab.ask('ada@example.com');
  const { token } = lab.inbox('ada@example.com');
  const results = await Promise.all(Array.from({ length: 10 }, () => lab.postForm('/auth/verify', { token })));
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400, 400, 400, 400, 400, 400, 400, 400, 400]);
});

test('the link starts with the configured base URL, whatever the Host header says', async (t) => {
  const lab = await start(t);
  assert.equal(await lab.askWithHost('ada@example.com', 'evil.example'), 202);
  const text = lab.outbox.last('ada@example.com')!.text;
  assert.match(text, /^http:\/\/localhost:3000\/auth\/verify\?token=/m);
  assert.ok(!text.includes('evil.example'));
});

test('an unknown email gets the same answer, and no email is sent', async (t) => {
  const lab = await start(t);
  const known = await lab.ask('ada@example.com');
  const unknown = await lab.ask('nobody@example.com');
  assert.equal(known.res.status, 202);
  assert.equal(unknown.res.status, 202);
  assert.deepEqual(await unknown.res.json(), await known.res.json());
  assert.ok(known.browser && unknown.browser, 'both set the browser cookie');
  assert.equal(lab.outbox.sent.length, 1);
  assert.equal(lab.outbox.last('nobody@example.com'), undefined);
});

test('only a SHA-256 hash of the link token is stored', async (t) => {
  const lab = await start(t);
  await lab.ask('ada@example.com');
  const { token, code } = lab.inbox('ada@example.com');
  const stored = lab.links.byToken.get(sha256(token))!;
  assert.equal(stored.email, 'ada@example.com');
  assert.ok(!JSON.stringify([...lab.links.byToken]).includes(token));
  assert.ok(!Object.values(stored).includes(code));
});

test('a link opened in another browser shows a confirmation page, and only the POST uses it', async (t) => {
  const lab = await start(t);
  await lab.ask('ada@example.com');
  const { token } = lab.inbox('ada@example.com');
  const page = await lab.get(`/auth/verify?token=${token}`); // no cookie: a link scanner, or another device
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type')!, /^text\/html/);
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(page.headers.get('content-security-policy'), "frame-ancestors 'none'");
  assert.match(await page.text(), /<form method="post" action="\/auth\/verify">/);
  const { browser: someoneElse } = await lab.ask('nobody@example.com'); // a browser cookie, but not the one that asked
  assert.match(await (await lab.get(`/auth/verify?token=${token}`, someoneElse)).text(), /Continue signing in/);
  const confirmed = await lab.postForm('/auth/verify', { token });
  assert.equal(confirmed.status, 200);
  assert.ok(cookie(confirmed, 'session'));
  assert.equal((await lab.postForm('/auth/verify', { token })).status, 400);
});

test('asking again replaces the previous link', async (t) => {
  const lab = await start(t);
  await lab.ask('ada@example.com');
  const old = lab.inbox('ada@example.com').token;
  const { browser } = await lab.ask('ada@example.com');
  const fresh = lab.inbox('ada@example.com').token;
  assert.equal((await lab.get(`/auth/verify?token=${old}`, browser)).status, 400);
  assert.equal((await lab.get(`/auth/verify?token=${fresh}`, browser)).status, 200);
});

test('the emailed code signs you in once', async (t) => {
  const lab = await start(t);
  await lab.ask('ada@example.com');
  const { code } = lab.inbox('ada@example.com');
  const res = await lab.postJson('/auth/code', { email: 'ada@example.com', code });
  assert.equal(res.status, 200);
  assert.ok(cookie(res, 'session'));
  assert.equal((await lab.postJson('/auth/code', { email: 'ada@example.com', code })).status, 401);
});

test('a code posted by an HTML form is refused, so another site cannot sign you in', async (t) => {
  const lab = await start(t);
  await lab.ask('ada@example.com');
  const { code } = lab.inbox('ada@example.com');
  const res = await lab.postForm('/auth/code', { email: 'ada@example.com', code }); // what a hostile page can send
  assert.notEqual(res.status, 200);
  assert.equal(cookie(res, 'session'), '');
  assert.equal((await lab.postJson('/auth/code', { email: 'ada@example.com', code })).status, 200);
});

test('five wrong codes use the code up', async (t) => {
  const lab = await start(t);
  await lab.ask('ada@example.com');
  const { code } = lab.inbox('ada@example.com');
  const wrong = code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) {
    const res = await lab.postJson('/auth/code', { email: 'ada@example.com', code: wrong });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), BAD_CODE);
  }
  assert.equal((await lab.postJson('/auth/code', { email: 'ada@example.com', code })).status, 401);
});

test('an email address can ask for 3 emails in 15 minutes', async (t) => {
  const lab = await start(t);
  for (let i = 0; i < 3; i++) assert.equal((await lab.ask('ada@example.com')).res.status, 202);
  const limited = (await lab.ask('ada@example.com')).res;
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('retry-after'), '900');
  assert.deepEqual(await limited.json(), { error: 'Too many requests. Try again later.' });
  assert.equal(lab.outbox.sent.length, 3);
  lab.clock.now += 15 * 60 * 1000;
  assert.equal((await lab.ask('ada@example.com')).res.status, 202);
});

test('an IP address can ask for 10 emails in 15 minutes', async (t) => {
  const lab = await start(t);
  for (let i = 0; i < 10; i++) assert.equal((await lab.ask(`user${i}@example.com`)).res.status, 202);
  assert.equal((await lab.ask('user10@example.com')).res.status, 429);
});
