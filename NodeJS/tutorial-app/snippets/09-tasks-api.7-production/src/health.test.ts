import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createApp } from './app.ts';
import type { Lifecycle } from './health.ts';
import { createTestApp, request, startServer } from './test-helpers.ts';

describe('health probes', () => {
  // The real app, with a lifecycle and ping that each test controls.
  async function serve(ping: () => Promise<void>) {
    const lifecycle: Lifecycle = { shuttingDown: false };
    const { tasks, auth, tokens } = createTestApp();
    const { createLogger } = await import('./logger.ts');
    const app = createApp({ tasks, auth, tokens, log: createLogger('silent'), lifecycle, ping });
    return { ...(await startServer(app)), lifecycle };
  }

  it('is live and ready when the database answers', async (t) => {
    const s = await serve(async () => {});
    t.after(() => s.close());
    assert.deepEqual((await request(`${s.url}/health`)).body, { status: 'ok' });
    assert.deepEqual(await request(`${s.url}/ready`).then((r) => [r.status, r.body]), [200, { status: 'ready' }]);
  });

  it('stays live but is not ready when the database is down', async (t) => {
    const s = await serve(async () => {
      throw new Error('connection refused');
    });
    t.after(() => s.close());
    assert.equal((await request(`${s.url}/health`)).status, 200);
    const ready = await request(`${s.url}/ready`);
    assert.deepEqual([ready.status, ready.body], [503, { status: 'unavailable', reason: 'database' }]);
  });

  it('is not ready once shutdown has started', async (t) => {
    const s = await serve(async () => {});
    t.after(() => s.close());
    s.lifecycle.shuttingDown = true;
    const ready = await request(`${s.url}/ready`);
    assert.deepEqual([ready.status, ready.body], [503, { status: 'shutting_down' }]);
  });

  it('treats a database that hangs as not ready, within about a second', async (t) => {
    const s = await serve(() => new Promise(() => {})); // never settles
    t.after(() => s.close());
    const started = performance.now();
    const ready = await request(`${s.url}/ready`);
    assert.equal(ready.status, 503);
    assert.ok(performance.now() - started < 1_500);
  });
});
