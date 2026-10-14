import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLogger } from '../logger.ts';
import { createTestApp, request, startServer } from '../test-helpers.ts';

describe('access log', () => {
  it('logs successful health probes at debug, everything else as before', async (t) => {
    const lines: { level: number; url?: string; msg: string }[] = [];
    const log = createLogger('info', { write: (line: string) => void lines.push(JSON.parse(line)) });
    const server = await startServer(createTestApp({ log }).app);
    t.after(() => server.close());

    await request(`${server.url}/health`);
    await request(`${server.url}/ready`);
    await request(`${server.url}/tasks`); // 401

    const access = lines.filter((l) => l.msg === 'request finished');
    assert.deepEqual(access.map((l) => [l.level, l.url]), [[40, '/tasks']]);
  });
});
