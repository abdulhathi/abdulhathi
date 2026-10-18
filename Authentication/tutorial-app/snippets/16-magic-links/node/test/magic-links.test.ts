import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { MAX_FAILED_CODES, MagicLinks } from '../src/magic-links.ts';

test('the code is stored only as an HMAC with the server key', () => {
  const key = randomBytes(32);
  const links = new MagicLinks(() => 0, key);
  const { code } = links.issue('ada@example.com', 'browser-1');
  const stored = links.byEmail.get('ada@example.com')!;
  assert.deepEqual(stored.codeHash, createHmac('sha256', key).update(`ada@example.com:${code}`).digest());
  assert.notDeepEqual(stored.codeHash, createHash('sha256').update(`ada@example.com:${code}`).digest()); // not a plain hash
});

test(`after ${MAX_FAILED_CODES} wrong codes in a row, codes stop working until a link is used`, () => {
  const links = new MagicLinks(() => 0);
  const wrongFor = (code: string) => (code === '000000' ? '111111' : '000000');
  for (let i = 0; i < MAX_FAILED_CODES / 5; i++) {
    const { code } = links.issue('ada@example.com', 'browser-1'); // a new email: 5 more tries each time
    for (let j = 0; j < 5; j++) assert.equal(links.checkCode('ada@example.com', wrongFor(code)), false);
  }
  const { token, code } = links.issue('ada@example.com', 'browser-1');
  assert.equal(links.checkCode('ada@example.com', code), false, 'even the right code is refused now');
  assert.equal(links.consume(token), 'ada@example.com', 'the link still works');
  const next = links.issue('ada@example.com', 'browser-1');
  assert.equal(links.checkCode('ada@example.com', next.code), true, 'and codes work again');
});
