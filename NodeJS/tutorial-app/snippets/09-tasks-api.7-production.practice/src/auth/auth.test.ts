import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createTestApp, PASSWORD, request, signUp, startServer, type TestServer } from '../test-helpers.ts';

describe('Authentication over HTTP', () => {
  let server: TestServer;
  beforeEach(async () => {
    server = await startServer(createTestApp().app);
  });
  afterEach(() => server.close());

  const post = (path: string, body: unknown) => request(`${server.url}${path}`, { method: 'POST', body });

  it('signs up: 201, a token, and a user without the password hash', async () => {
    const res = await post('/auth/signup', { email: '  Ada@Example.COM ', password: PASSWORD });

    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'ada@example.com');
    assert.equal(res.body.user.passwordHash, undefined);
    assert.equal(res.body.token.split('.').length, 3);
  });

  it('rejects a second account for the same email, in any case', async () => {
    await post('/auth/signup', { email: 'ada@example.com', password: PASSWORD });
    const res = await post('/auth/signup', { email: 'ADA@example.com', password: PASSWORD });
    assert.equal(res.status, 409);
  });

  it('enforces the password length on sign-up', async () => {
    const res = await post('/auth/signup', { email: 'ada@example.com', password: 'short' });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.details[0].message, 'Use at least 12 characters');
  });

  it('logs in, and the token works for /auth/me', async () => {
    await post('/auth/signup', { email: 'ada@example.com', password: PASSWORD });

    const login = await post('/auth/login', { email: 'ada@example.com', password: PASSWORD });
    const me = await request(`${server.url}/auth/me`, { token: login.body.token });

    assert.equal(login.status, 200);
    assert.equal(me.body.email, 'ada@example.com');
  });

  it('gives the same 401 for a wrong password and an unknown email', async () => {
    await post('/auth/signup', { email: 'ada@example.com', password: PASSWORD });

    const wrongPassword = await post('/auth/login', { email: 'ada@example.com', password: 'not the password' });
    const unknownEmail = await post('/auth/login', { email: 'nobody@example.com', password: PASSWORD });

    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(wrongPassword.body, unknownEmail.body);
  });

  it('requires a valid bearer token for /tasks', async () => {
    const none = await request(`${server.url}/tasks`);
    const garbage = await request(`${server.url}/tasks`, { token: 'not.a.token' });

    assert.equal(none.status, 401);
    assert.equal(none.headers.get('www-authenticate'), 'Bearer');
    assert.equal(garbage.status, 401);
    assert.equal(garbage.body.error.message, 'Invalid token');
  });

  it('keeps every user’s tasks private: other users get 404', async () => {
    const ada = await signUp(server.url);
    const bob = await signUp(server.url);
    const { body: task } = await request(`${server.url}/tasks`, { method: 'POST', body: { title: 'Ada only' }, token: ada });

    const url = `${server.url}/tasks/${task.id}`;
    assert.equal((await request(url, { token: bob })).status, 404);
    assert.equal((await request(url, { method: 'PATCH', body: { done: true }, token: bob })).status, 404);
    assert.equal((await request(url, { method: 'DELETE', token: bob })).status, 404);
    assert.equal((await request(`${server.url}/tasks`, { token: bob })).body.total, 0);
    assert.equal((await request(url, { token: ada })).body.done, false);
  });

  it('sends helmet’s security headers', async () => {
    const res = await fetch(`${server.url}/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-powered-by'), null);
  });
});

describe('Login rate limit', () => {
  it('answers 429 with Retry-After once the limit is used up', async (t) => {
    const server = await startServer(createTestApp({ loginLimit: { windowMs: 60_000, max: 3 } }).app);
    t.after(() => server.close());
    const attempt = () =>
      request(`${server.url}/auth/login`, { method: 'POST', body: { email: 'ada@example.com', password: 'guess' } });

    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await attempt()).status);
    const blocked = await attempt();

    assert.deepEqual(statuses, [401, 401, 401, 429]);
    assert.equal(blocked.body.error.code, 'too_many_requests');
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  });
});
