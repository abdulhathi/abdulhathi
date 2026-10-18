import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newSecret, sign, signatureHeader } from '../src/sender.ts';

const T = 1792238400; // 2026-10-17 12:00:00 UTC

test('the signature is HMAC-SHA256 of "<timestamp>.<body>", in hex', () => {
  // The same value as: printf '%s' '1792238400.{"id":"evt_1","type":"order.paid"}' | openssl dgst -sha256 -hmac whsec_test_vector
  assert.equal(
    sign('whsec_test_vector', T, '{"id":"evt_1","type":"order.paid"}'),
    'c0ed66f2141a653db1d8b65b667377f0673d6c075b3b5b95d4b08bf33b568407',
  );
});

test('the header has the timestamp and one v1 signature per active secret', () => {
  const [a, b] = [newSecret(), newSecret()];
  assert.match(a, /^whsec_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  const body = '{"id":"evt_2"}';
  assert.equal(signatureHeader([a, b], T, body), `t=${T},v1=${sign(a, T, body)},v1=${sign(b, T, body)}`);
});
