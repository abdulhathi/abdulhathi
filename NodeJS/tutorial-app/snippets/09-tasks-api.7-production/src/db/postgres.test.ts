import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { OWNERS, testTaskRepository } from '../tasks/repository-contract.ts';
import { PgTaskRepository } from '../tasks/pg-repository.ts';
import { PgUserRepository } from '../users/pg-repository.ts';
import { testUserRepository } from '../users/repository-contract.ts';
import { createPool, migratePostgres, withTransaction } from './postgres.ts';

// These tests empty tables, so they use their own database, never DATABASE_URL.
// All Postgres tests live in this one file: files run in parallel processes,
// and two files truncating the same tables at once would break each other.
const url = process.env.TEST_DATABASE_URL;

if (!url) {
  describe('PostgreSQL', () => {
    it('contract tests', { skip: 'TEST_DATABASE_URL is not set (see chapter 18)' }, () => {});
  });
} else {
  const pool = createPool(url, { max: 4 });
  before(() => migratePostgres(pool));
  after(() => pool.end()); // otherwise open connections keep the test process alive

  const emptyTables = () => pool.query('TRUNCATE tasks, users CASCADE');

  testTaskRepository('PgTaskRepository', async () => {
    await emptyTables();
    for (const id of OWNERS) {
      await pool.query(`INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, 'x', now())`, [
        id,
        `${id}@example.com`,
      ]);
    }
    return new PgTaskRepository(pool);
  });

  testUserRepository('PgUserRepository', async () => {
    await emptyTables();
    return new PgUserRepository(pool);
  });

  describe('withTransaction', () => {
    const countUsers = async () => (await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM users')).rows[0]?.n;
    const insertUser = (client: { query: typeof pool.query }, email: string) =>
      client.query(`INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, 'x', now())`, [
        randomUUID(),
        email,
      ]);

    it('commits everything when the callback succeeds', async () => {
      await emptyTables();
      await withTransaction(pool, async (client) => {
        await insertUser(client, 'a@example.com');
        await insertUser(client, 'b@example.com');
      });
      assert.equal(await countUsers(), 2);
    });

    it('rolls everything back when the callback throws', async () => {
      await emptyTables();
      await assert.rejects(
        withTransaction(pool, async (client) => {
          await insertUser(client, 'a@example.com');
          await insertUser(client, 'A@example.com'); // violates the unique index on lower(email)
        }),
        { code: '23505' },
      );
      assert.equal(await countUsers(), 0);
    });
  });
}
