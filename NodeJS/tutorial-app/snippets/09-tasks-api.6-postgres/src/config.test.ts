import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseConfig } from './config.ts';

const SECRET = 'x'.repeat(32);

describe('parseConfig', () => {
  it('uses defaults for everything that is not set', () => {
    assert.deepEqual(parseConfig({ JWT_SECRET: SECRET }), {
      env: 'development',
      port: 4000,
      dbFile: 'data/tasks.db',
      databaseUrl: undefined,
      dbPoolMax: 10,
      logLevel: 'info',
      jwtSecret: SECRET,
      tokenTtl: '1h',
    });
  });

  it('converts strings from the environment into the right types', () => {
    const config = parseConfig({ PORT: '8080', NODE_ENV: 'production', LOG_LEVEL: 'warn', JWT_SECRET: SECRET });
    assert.equal(config.port, 8080);
    assert.equal(config.env, 'production');
  });

  it('lists every invalid setting in one readable error', () => {
    assert.throws(() => parseConfig({ PORT: 'eighty', LOG_LEVEL: 'loud' }), {
      message: /Invalid configuration:[\s\S]*PORT[\s\S]*LOG_LEVEL/,
    });
  });

  it('refuses to start without a long enough JWT secret', () => {
    assert.throws(() => parseConfig({}), /JWT_SECRET/);
    assert.throws(() => parseConfig({ JWT_SECRET: 'short' }), /Use at least 32 random characters/);
  });

  it('accepts only postgres:// database URLs', () => {
    const url = 'postgres://tasks:tasks@localhost:5440/tasks';
    assert.equal(parseConfig({ JWT_SECRET: SECRET, DATABASE_URL: url }).databaseUrl, url);
    assert.throws(() => parseConfig({ JWT_SECRET: SECRET, DATABASE_URL: 'mysql://localhost/tasks' }), /Use a postgres:\/\/ URL/);
  });
});
