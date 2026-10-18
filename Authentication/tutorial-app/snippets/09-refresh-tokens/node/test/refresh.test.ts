import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FAMILY_TTL_MS, hashToken, REFRESH_TTL_MS, RefreshStore } from '../src/refresh.ts';

const DAY = 24 * 60 * 60 * 1000;

test('refresh tokens are 256 random bits, and only their SHA-256 hash is stored', () => {
  const store = new RefreshStore(() => Date.parse('2026-10-17T12:00:00Z'));
  const { token } = store.issue('u_1001');
  assert.equal(Buffer.from(token, 'base64url').length, 32);
  assert.notEqual(store.issue('u_1001').token, token);
  assert.deepEqual([...store.tokens.keys()][0], hashToken(token));
  assert.ok(!JSON.stringify([...store.tokens]).includes(token), 'the token itself is never stored');
});

test('a rotated token stays in its family and never outlives it', () => {
  const start = Date.parse('2026-10-17T12:00:00Z');
  let clock = start;
  const store = new RefreshStore(() => clock);
  let current = store.issue('u_1001');
  assert.equal(current.expiresAt, start + REFRESH_TTL_MS);
  const [familyId] = store.families.keys();
  for (let day = 6; day <= 24; day += 6) {
    clock = start + day * DAY;
    const rotated = store.rotate(current.token);
    assert.ok(rotated.ok);
    assert.equal(store.tokens.get(hashToken(rotated.refresh.token))?.familyId, familyId);
    current = rotated.refresh;
  }
  // Day 24 + 7 days would pass the family's 30-day end, so the last token stops there.
  assert.equal(current.expiresAt, start + FAMILY_TTL_MS);
});
