import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RateLimiter } from '../src/rate-limit.ts';

test('allows the limit, then refuses until the oldest request leaves the window', () => {
  let now = 0;
  const limiter = new RateLimiter(3, 60_000, () => now);
  for (const t of [0, 10_000, 20_000]) {
    now = t;
    assert.equal(limiter.take('ada@example.com'), 0);
  }
  now = 30_000;
  assert.equal(limiter.take('ada@example.com'), 30_000); // the request at 0 leaves the window at 60,000
  now = 60_000;
  assert.equal(limiter.take('ada@example.com'), 0);
  assert.equal(limiter.take('ada@example.com'), 10_000);
});

test('each key has its own count', () => {
  const limiter = new RateLimiter(1, 60_000, () => 0);
  assert.equal(limiter.take('ada@example.com'), 0);
  assert.equal(limiter.take('bo@example.com'), 0);
  assert.equal(limiter.take('ada@example.com'), 60_000);
});
