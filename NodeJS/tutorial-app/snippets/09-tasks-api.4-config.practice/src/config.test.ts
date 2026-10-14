import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseConfig } from './config.ts';

describe('parseConfig', () => {
  it('uses defaults for everything that is not set', () => {
    assert.deepEqual(parseConfig({}), {
      env: 'development',
      port: 4000,
      dbFile: 'data/tasks.db',
      logLevel: 'info',
      bodyLimit: '10kb',
    });
  });

  it('converts strings from the environment into the right types', () => {
    const config = parseConfig({ PORT: '8080', NODE_ENV: 'production', LOG_LEVEL: 'warn' });
    assert.equal(config.port, 8080);
    assert.equal(config.env, 'production');
  });

  it('lists every invalid setting in one readable error', () => {
    assert.throws(() => parseConfig({ PORT: 'eighty', LOG_LEVEL: 'loud' }), {
      message: /Invalid configuration:[\s\S]*PORT[\s\S]*LOG_LEVEL/,
    });
  });

  it('accepts body limits like 1mb and rejects nonsense', () => {
    assert.equal(parseConfig({ BODY_LIMIT: '1mb' }).bodyLimit, '1mb');
    assert.throws(() => parseConfig({ BODY_LIMIT: 'huge' }), /Use a size such as 500b, 10kb or 1mb/);
  });
});
