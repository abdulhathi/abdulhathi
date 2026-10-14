import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import { ConflictError } from '../errors.ts';
import type { UserRepository } from './repository.ts';
import type { User } from './user.ts';

const makeUser = (overrides: Partial<User> = {}): User => ({
  id: randomUUID(),
  email: 'ada@example.com',
  passwordHash: 'scrypt$32768$8$1$salt$hash',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/** The behaviour every UserRepository must have. */
export function testUserRepository(name: string, create: () => UserRepository | Promise<UserRepository>) {
  describe(`${name} (user repository contract)`, () => {
    let repo: UserRepository;
    beforeEach(async () => {
      repo = await create();
    });

    it('finds a user by id, and by email ignoring case', async () => {
      const user = makeUser();
      await repo.insert(user);

      assert.deepEqual(await repo.get(user.id), user);
      assert.deepEqual(await repo.findByEmail('ADA@example.com'), user);
    });

    it('returns undefined for unknown users', async () => {
      assert.equal(await repo.get(randomUUID()), undefined);
      assert.equal(await repo.findByEmail('nobody@example.com'), undefined);
    });

    it('refuses a second account with the same email, in any case', async () => {
      await repo.insert(makeUser());
      await assert.rejects(repo.insert(makeUser({ email: 'Ada@Example.com' })), ConflictError);
    });
  });
}
