import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { createLogger } from './logger.ts';
import { createTestApp, request, signUp, startServer, type TestServer } from './test-helpers.ts';

describe('Tasks API over HTTP', () => {
  let server: TestServer;
  let token: string;
  const api = (path: string, init: { method?: string; body?: unknown } = {}) =>
    request(`${server.url}${path}`, { ...init, token });

  beforeEach(async () => {
    server = await startServer(createTestApp().app);
    token = await signUp(server.url);
  });
  afterEach(() => server.close());

  it('creates a task: 201, a Location header, and the task', async () => {
    const res = await api('/tasks', { method: 'POST', body: { title: '  Ship it  ' } });

    assert.equal(res.status, 201);
    assert.equal(res.headers.get('location'), `/tasks/${res.body.id}`);
    assert.equal(res.body.title, 'Ship it');
    assert.equal(res.body.priority, 'medium');

    const fetched = await api(res.headers.get('location') ?? '');
    assert.deepEqual(fetched.body, res.body);
  });

  it('explains validation errors field by field', async () => {
    const res = await api('/tasks', { method: 'POST', body: { title: '', priority: 'urgent' } });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_failed');
    assert.deepEqual(res.body.error.details.map((d: { path: string }) => d.path), ['title', 'priority']);
  });

  it('maps service errors to 404, 409 and 422', async () => {
    await api('/tasks', { method: 'POST', body: { title: 'Once' } });

    const duplicate = await api('/tasks', { method: 'POST', body: { title: 'once' } });
    const past = await api('/tasks', { method: 'POST', body: { title: 'Late', dueDate: '2001-01-01' } });
    const missing = await api('/tasks/00000000-0000-4000-8000-000000000000');

    assert.deepEqual([duplicate.status, past.status, missing.status], [409, 422, 404]);
  });

  it('filters by query string, converting text to booleans', async () => {
    const { body: a } = await api('/tasks', { method: 'POST', body: { title: 'A' } });
    await api('/tasks', { method: 'POST', body: { title: 'B' } });
    await api(`/tasks/${a.id}`, { method: 'PATCH', body: { done: true } });

    const open = await api('/tasks?done=false');

    assert.deepEqual(open.body.items.map((t: { title: string }) => t.title), ['B']);
  });

  it('deletes with 204, then answers 404', async () => {
    const { body: task } = await api('/tasks', { method: 'POST', body: { title: 'Temporary' } });

    assert.equal((await api(`/tasks/${task.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await api(`/tasks/${task.id}`, { method: 'DELETE' })).status, 404);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await fetch(`${server.url}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: '{"title":',
    });
    assert.equal(res.status, 400);
  });

  it('hides the details of unexpected errors, but logs them with the request id', async (t) => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger('info', { write: (line: string) => void lines.push(JSON.parse(line)) });
    const { app, tasks } = createTestApp({ log });
    t.mock.method(tasks, 'list', async () => {
      throw new Error('connection to the database lost');
    });
    const broken = await startServer(app);
    t.after(() => broken.close());

    const res = await request(`${broken.url}/tasks`, { token: await signUp(broken.url) });

    assert.equal(res.status, 500);
    const requestId = res.headers.get('x-request-id');
    assert.deepEqual(res.body, { error: { code: 'internal_error', message: 'Something went wrong', requestId } });

    const logged = lines.find((line) => line.msg === 'unhandled error');
    assert.equal(logged?.requestId, requestId);
    assert.match(JSON.stringify(logged?.err), /connection to the database lost/);
  });

  it('reuses a safe X-Request-Id from the caller and replaces an unsafe one', async () => {
    const ok = await fetch(`${server.url}/health`, { headers: { 'x-request-id': 'from-the-proxy-1' } });
    const bad = await fetch(`${server.url}/health`, { headers: { 'x-request-id': '<script>alert(1)</script>' } });

    assert.equal(ok.headers.get('x-request-id'), 'from-the-proxy-1');
    assert.match(bad.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  });
});
