import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { KeyStore } from '../src/keys.ts';
import { FixedWindowLimiter } from '../src/limiter.ts';

let clock = Date.parse('2026-10-17T12:00:00Z');
const now = () => clock;

test('a new key has the prefix, its id and a long random secret', () => {
  const store = new KeyStore(now);
  const { record, key } = store.issue('nightly-export', ['reports:read']);
  assert.match(key, /^ak_live_[0-9a-f]{12}_[A-Za-z0-9_-]{43}$/);
  assert.ok(key.startsWith(`ak_live_${record.id}_`));
  assert.notEqual(store.issue('nightly-export', ['reports:read']).key, key);
});

test('only a SHA-256 hash of the key is stored', () => {
  const { record, key } = new KeyStore(now).issue('nightly-export', ['reports:read']);
  assert.equal(record.hash, createHash('sha256').update(key).digest('hex'));
  assert.ok(!JSON.stringify(record).includes(key.slice(-43)), 'never store the secret');
});

test('verify gives one answer for a wrong secret or an unknown id', () => {
  const store = new KeyStore(now);
  const { record, key } = store.issue('nightly-export', ['reports:read']);
  const result = store.verify(key);
  assert.equal(result.ok && result.key.id, record.id);
  assert.equal(record.lastUsedAt, clock);
  const wrongSecret = key.slice(0, -1) + (key.endsWith('A') ? 'B' : 'A');
  const unknownId = key.replace(record.id, '000000000000');
  for (const bad of [wrongSecret, unknownId, 'not-a-key']) {
    assert.deepEqual(store.verify(bad), { ok: false, error: 'Invalid API key.' });
  }
});

test('the fixed window allows the limit, then waits for the next window', () => {
  const limiter = new FixedWindowLimiter(2, 60_000, now);
  assert.equal(limiter.hit('k1'), 0);
  assert.equal(limiter.hit('k1'), 0);
  clock += 15_000;
  assert.equal(limiter.hit('k1'), 45_000, 'the time left in this window');
  assert.equal(limiter.hit('k2'), 0, 'each key has its own count');
  clock += 45_000;
  assert.equal(limiter.hit('k1'), 0);
});
