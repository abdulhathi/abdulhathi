import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLogger } from './logger.ts';

describe('createLogger', () => {
  const capture = () => {
    const lines: Record<string, unknown>[] = [];
    const log = createLogger('debug', { write: (line: string) => void lines.push(JSON.parse(line)) });
    return { log, lines };
  };

  it('redacts passwords, tokens and authorization headers', () => {
    const { log, lines } = capture();
    log.info({ user: { email: 'ada@example.com', password: 'hunter2' } }, 'signup');
    log.info({ req: { headers: { authorization: 'Bearer abc' } }, session: { token: 'xyz' } }, 'request');

    const text = JSON.stringify(lines);
    for (const secret of ['hunter2', 'Bearer abc', 'xyz']) assert.ok(!text.includes(secret), `${secret} leaked`);
    assert.equal((lines[0]?.user as { password: string }).password, '[redacted]');
    assert.equal((lines[0]?.user as { email: string }).email, 'ada@example.com');
  });

  it('skips lines below the configured level', () => {
    const { log, lines } = capture();
    log.trace('too detailed');
    log.debug('just right');
    assert.deepEqual(lines.map((l) => l.msg), ['just right']);
  });
});
