import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword } from './password.ts';

describe('password hashing', () => {
  it('stores the algorithm, cost parameters, salt and hash together', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.match(stored, /^scrypt\$32768\$8\$1\$[\w-]{22}\$[\w-]{86}$/);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', stored), true);
    assert.equal(await verifyPassword('Correct horse battery staple', stored), false);
  });

  it('salts: the same password never hashes the same way twice', async () => {
    const [a, b] = await Promise.all([hashPassword('same password'), hashPassword('same password')]);
    assert.notEqual(a, b);
  });

  it('rejects stored values it does not understand', async () => {
    assert.equal(await verifyPassword('anything', 'md5$5f4dcc3b5aa765d61d8327deb882cf99'), false);
    assert.equal(await verifyPassword('anything', ''), false);
  });
});
