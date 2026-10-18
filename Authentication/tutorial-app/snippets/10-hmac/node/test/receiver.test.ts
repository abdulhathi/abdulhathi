import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, test } from 'node:test';
import { createApp } from '../src/app.ts';
import { deliver, newSecret, sign, signatureHeader } from '../src/sender.ts';

const clock = Date.parse('2026-10-17T12:00:00Z');
const now = () => clock;
const t = Math.floor(clock / 1000);
const secret = newSecret();

/** Starts a receiver on a free port, with its own replay cache. */
function start(secrets: string[], clock: () => number = now) {
  const { app, received } = createApp({ secrets, now: clock });
  const server = app.listen(0);
  after(() => server.close());
  const url = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhooks/orders`;
  const post = (body: string, header?: string) =>
    fetch(url(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(header !== undefined && { 'Webhook-Signature': header }) },
      body,
    });
  return { url, post, received };
}

const { url, post, received } = start([secret]);
const event = (id: string) => JSON.stringify({ id, type: 'order.paid', data: { orderId: 'ord_1001', amount: 4200 } });

test('a correctly signed webhook is accepted', async () => {
  const body = event('evt_1');
  const res = await post(body, signatureHeader([secret], t, body));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true, type: 'order.paid' });
  assert.deepEqual(received.at(-1), JSON.parse(body));
});

test('deliver() sends a webhook the receiver accepts', async () => {
  const res = await deliver(url(), { id: 'evt_2', type: 'order.refunded' }, [secret], now);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { received: true, type: 'order.refunded' });
});

test('a tampered body is rejected', async () => {
  const header = signatureHeader([secret], t, event('evt_3'));
  const res = await post(event('evt_3').replace('4200', '1'), header);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Signature does not match.' });
});

test('a signature made with the wrong secret is rejected', async () => {
  const body = event('evt_4');
  const res = await post(body, signatureHeader([newSecret()], t, body));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Signature does not match.' });
});

test('the raw bytes are checked, so re-serialized JSON fails', async () => {
  const body = event('evt_5');
  const pretty = JSON.stringify(JSON.parse(body), null, 2); // the same data, different bytes
  assert.equal((await post(pretty, signatureHeader([secret], t, body))).status, 400);
});

test('a timestamp more than 5 minutes off is rejected, even with a valid signature', async () => {
  for (const offset of [-301, 301]) {
    const body = event(`evt_6${offset}`);
    const res = await post(body, signatureHeader([secret], t + offset, body));
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: 'Timestamp outside the tolerance window.' });
  }
  const body = event('evt_6');
  assert.equal((await post(body, signatureHeader([secret], t - 300, body))).status, 200, '5 minutes exactly is still fine');
});

test('moving t to a fresh time breaks the signature', async () => {
  const body = event('evt_6b');
  const old = signatureHeader([secret], t - 600, body); // recorded 10 minutes ago
  const res = await post(body, old.replace(`t=${t - 600}`, `t=${t}`));
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: 'Signature does not match.' });
});

test('a replayed delivery is rejected, even with its header rewritten', async () => {
  const body = event('evt_7');
  const header = signatureHeader([secret], t, body);
  assert.equal((await post(body, header)).status, 200);
  const replay = await post(body, header);
  assert.equal(replay.status, 409);
  assert.deepEqual(await replay.json(), { error: 'This delivery was already received.' });
  const [ts, v1] = header.split(',');
  for (const rewritten of [`${ts}, ${v1}`, `${v1},${ts}`, `${ts},${v1},${v1}`, `${ts},${v1},v0=${'0'.repeat(64)}`])
    assert.equal((await post(body, rewritten)).status, 409, rewritten);
});

test('after the 5 minutes, a replay is stopped by the timestamp check instead', async () => {
  let clockMs = clock;
  const receiver = start([secret], () => clockMs);
  const body = event('evt_7b');
  const header = signatureHeader([secret], t, body);
  assert.equal((await receiver.post(body, header)).status, 200);
  clockMs += 301_000;
  const late = await receiver.post(body, header);
  assert.equal(late.status, 400);
  assert.deepEqual(await late.json(), { error: 'Timestamp outside the tolerance window.' });
});

test('a missing or malformed header, or a body that is not JSON, is rejected', async () => {
  const missing = await post(event('evt_8'));
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), { error: 'Missing Webhook-Signature header.' });
  const good = sign(secret, t, event('evt_8'));
  for (const header of [
    't=yesterday,v1=abc',
    `v1=${good}`, // no t
    `t=${t}`, // no v1
    `t=${t},v1=${good.slice(0, 40)}`, // the wrong length
    `t=${t},v0=${good}`, // only a scheme this receiver does not know
    `t=${t}=0,v1=${good}`, // junk after the timestamp
    `t=${'9'.repeat(5000)},v1=${good}`, // a timestamp far too long
  ]) {
    const malformed = await post(event('evt_8'), header);
    assert.equal(malformed.status, 400, header.slice(0, 40));
    assert.deepEqual(await malformed.json(), { error: 'Malformed Webhook-Signature header.' });
  }
  // The signature is checked before the body is parsed.
  const forged = await post('not json', signatureHeader([newSecret()], t, 'not json'));
  assert.deepEqual(await forged.json(), { error: 'Signature does not match.' });
  for (const body of ['not json', '[1,2]', '{"amount":NaN}']) {
    const notJson = await post(body, signatureHeader([secret], t, body));
    assert.equal(notJson.status, 400, body);
    assert.deepEqual(await notJson.json(), { error: 'Body is not a JSON object.' });
  }
});

test('during rotation either secret is accepted, and a replay with one v1 removed is still caught', async () => {
  const [oldSecret, newer] = [newSecret(), newSecret()];
  const rotating = start([newer, oldSecret]);
  const fromOld = event('evt_9a');
  assert.equal((await rotating.post(fromOld, signatureHeader([oldSecret], t, fromOld))).status, 200);
  const fromNew = event('evt_9b');
  assert.equal((await rotating.post(fromNew, signatureHeader([newer], t, fromNew))).status, 200);
  const fromOther = event('evt_9c');
  assert.equal((await rotating.post(fromOther, signatureHeader([newSecret()], t, fromOther))).status, 400);

  const both = event('evt_9d');
  const header = signatureHeader([newer, oldSecret], t, both); // t=...,v1=<new>,v1=<old>
  assert.equal((await rotating.post(both, header)).status, 200);
  const trimmed = header.split(',').filter((_, i) => i !== 1).join(','); // drop the first v1
  assert.equal((await rotating.post(both, trimmed)).status, 409);
});

test('the body is read whatever the Content-Type, even none', async () => {
  const body = event('evt_10');
  const res = await fetch(url(), {
    method: 'POST',
    headers: { 'Webhook-Signature': signatureHeader([secret], t, body) },
    body: Buffer.from(body), // fetch adds no Content-Type for bytes
  });
  assert.equal(res.status, 200);
});
