import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { createApp } from './app.ts';
import { openDatabase } from './db/database.ts';
import { SqliteTaskRepository } from './tasks/sqlite-repository.ts';
import { TaskService } from './tasks/service.ts';
import { request, startServer, type TestServer } from './test-helpers.ts';

describe('Tasks API over HTTP', () => {
  let server: TestServer;

  beforeEach(async () => {
    mock.method(console, 'log', () => {}); // keep the request log out of the test report
    const tasks = new TaskService(new SqliteTaskRepository(openDatabase(':memory:')));
    server = await startServer(createApp({ tasks }));
  });
  afterEach(async () => {
    mock.restoreAll();
    await server.close();
  });

  it('creates a task: 201, a Location header, and the task', async () => {
    const res = await request(`${server.url}/tasks`, { method: 'POST', body: { title: '  Ship it  ' } });

    assert.equal(res.status, 201);
    assert.equal(res.headers.get('location'), `/tasks/${res.body.id}`);
    assert.equal(res.body.title, 'Ship it');
    assert.equal(res.body.priority, 'medium');

    const fetched = await request(`${server.url}${res.headers.get('location')}`);
    assert.deepEqual(fetched.body, res.body);
  });

  it('explains validation errors field by field', async () => {
    const res = await request(`${server.url}/tasks`, { method: 'POST', body: { title: '', priority: 'urgent' } });

    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'validation_failed');
    assert.deepEqual(res.body.error.details.map((d: { path: string }) => d.path), ['title', 'priority']);
  });

  it('maps service errors to 404, 409 and 422', async () => {
    await request(`${server.url}/tasks`, { method: 'POST', body: { title: 'Once' } });

    const duplicate = await request(`${server.url}/tasks`, { method: 'POST', body: { title: 'once' } });
    const past = await request(`${server.url}/tasks`, { method: 'POST', body: { title: 'Late', dueDate: '2001-01-01' } });
    const missing = await request(`${server.url}/tasks/00000000-0000-4000-8000-000000000000`);

    assert.deepEqual([duplicate.status, past.status, missing.status], [409, 422, 404]);
  });

  it('filters by query string, converting text to booleans', async () => {
    const { body: a } = await request(`${server.url}/tasks`, { method: 'POST', body: { title: 'A' } });
    await request(`${server.url}/tasks`, { method: 'POST', body: { title: 'B' } });
    await request(`${server.url}/tasks/${a.id}`, { method: 'PATCH', body: { done: true } });

    const open = await request(`${server.url}/tasks?done=false`);

    assert.deepEqual(open.body.items.map((t: { title: string }) => t.title), ['B']);
  });

  it('deletes with 204, then answers 404', async () => {
    const { body: task } = await request(`${server.url}/tasks`, { method: 'POST', body: { title: 'Temporary' } });

    assert.equal((await request(`${server.url}/tasks/${task.id}`, { method: 'DELETE' })).status, 204);
    assert.equal((await request(`${server.url}/tasks/${task.id}`, { method: 'DELETE' })).status, 404);
  });

  it('answers /health and 404s unknown routes in the standard error shape', async () => {
    assert.deepEqual((await request(`${server.url}/health`)).body, { status: 'ok' });

    const res = await request(`${server.url}/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: { code: 'not_found', message: 'No route for GET /nope' } });
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await fetch(`${server.url}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"title":',
    });
    assert.equal(res.status, 400);
  });

  it('hides the details of unexpected errors', async (t) => {
    const consoleError = t.mock.method(console, 'error', () => {});
    const failing = new TaskService(new SqliteTaskRepository(openDatabase(':memory:')));
    t.mock.method(failing, 'list', async () => {
      throw new Error('connection to the database lost');
    });
    const broken = await startServer(createApp({ tasks: failing }));
    t.after(() => broken.close());

    const res = await request(`${broken.url}/tasks`);

    assert.equal(res.status, 500);
    assert.deepEqual(res.body, { error: { code: 'internal_error', message: 'Something went wrong' } });
    assert.equal(consoleError.mock.callCount(), 1); // but we logged it for ourselves
  });
});
