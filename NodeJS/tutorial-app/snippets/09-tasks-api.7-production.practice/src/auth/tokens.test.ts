import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { TokenService } from './tokens.ts';

const tokens = new TokenService('a-test-secret-that-is-at-least-32-characters-long', '1h');

describe('TokenService', () => {
  it('signs a token whose subject is the user id', async () => {
    const token = await tokens.sign('user-42');
    assert.equal(await tokens.verify(token), 'user-42');
  });

  it('rejects a token after it expires', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-15T12:00:00Z') });
    const token = await tokens.sign('user-42');

    t.mock.timers.setTime(Date.parse('2026-06-15T12:59:00Z'));
    assert.equal(await tokens.verify(token), 'user-42');

    t.mock.timers.setTime(Date.parse('2026-06-15T13:00:01Z'));
    await assert.rejects(tokens.verify(token), { status: 401, message: 'Token expired' });
  });

  it('rejects a tampered token and one signed with another secret', async () => {
    const token = await tokens.sign('user-42');
    const [header, , signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: 'admin', iss: 'tasks-api' })).toString('base64url');
    const otherSecret = new TokenService('another-secret-that-is-at-least-32-characters');

    await assert.rejects(tokens.verify(`${header}.${forgedPayload}.${signature}`), { message: 'Invalid token' });
    await assert.rejects(tokens.verify(await otherSecret.sign('user-42')), { message: 'Invalid token' });
  });
});
