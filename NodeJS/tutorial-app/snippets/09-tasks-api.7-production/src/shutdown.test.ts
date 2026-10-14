import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Lifecycle } from './health.ts';
import { createLogger } from './logger.ts';
import { gracefulShutdown } from './shutdown.ts';
import { createTestApp, request, signUp, startServer } from './test-helpers.ts';

/** A real server whose task list takes `delayMs` to answer, plus a token to call it with. */
async function slowServer(delayMs: number) {
  const lifecycle: Lifecycle = { shuttingDown: false };
  const { app, tasks } = createTestApp();
  const running = await startServer(app);
  const token = await signUp(running.url);
  const realList = tasks.list.bind(tasks);
  tasks.list = async (...args) => {
    await sleep(delayMs);
    return realList(...args);
  };
  return { ...running, token, lifecycle };
}

describe('graceful shutdown', () => {
  it('lets in-flight requests finish, refuses new ones, then closes the database', async () => {
    const { url, server, token, lifecycle } = await slowServer(300);
    const events: string[] = [];
    const shutdown = gracefulShutdown({
      server,
      lifecycle,
      log: createLogger('silent'),
      timeoutMs: 5_000,
      onClose: async () => void events.push('database closed'),
    });

    const inFlight = request(`${url}/tasks`, { token }).then((res) => {
      events.push('request finished');
      return res;
    });
    await sleep(50); // the request is now inside the slow handler
    const done = shutdown('test');

    assert.equal(lifecycle.shuttingDown, true);
    await assert.rejects(fetch(`${url}/health`), /fetch failed/); // no new connections
    assert.equal((await inFlight).status, 200);
    await done;
    assert.deepEqual(events, ['request finished', 'database closed']);
  });

  it('cuts connections that are still busy at the deadline', async () => {
    const { url, server, token, lifecycle } = await slowServer(2_000);
    const shutdown = gracefulShutdown({
      server,
      lifecycle,
      log: createLogger('silent'),
      timeoutMs: 100,
      onClose: async () => {},
    });

    const inFlight = request(`${url}/tasks`, { token });
    await sleep(50);
    const started = performance.now();
    await shutdown('test');

    assert.ok(performance.now() - started < 1_000, 'shutdown should not wait for the slow request');
    await assert.rejects(inFlight, /fetch failed/);
  });

  it('runs only once, however many signals arrive', async () => {
    const { server, lifecycle } = await slowServer(0);
    let closes = 0;
    const shutdown = gracefulShutdown({
      server,
      lifecycle,
      log: createLogger('silent'),
      timeoutMs: 1_000,
      onClose: async () => void closes++,
    });

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT'), shutdown('SIGTERM')]);
    assert.equal(closes, 1);
  });
});
