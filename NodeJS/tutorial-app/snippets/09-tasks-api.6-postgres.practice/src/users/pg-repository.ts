import type pg from 'pg';
import { ConflictError } from '../errors.ts';
import type { UserRepository } from './repository.ts';
import type { User } from './user.ts';

type UserRow = { id: string; email: string; password_hash: string; created_at: Date };

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  createdAt: row.created_at.toISOString(),
});

const UNIQUE_VIOLATION = '23505'; // Postgres error codes are five-character strings

export class PgUserRepository implements UserRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async findByEmail(email: string) {
    // lower() on both sides matches the unique index users_email_unique.
    const { rows } = await this.#pool.query<UserRow>('SELECT * FROM users WHERE lower(email) = lower($1)', [email]);
    return rows[0] && toUser(rows[0]);
  }

  async get(id: string) {
    const { rows } = await this.#pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] && toUser(rows[0]);
  }

  async insert(user: User) {
    try {
      await this.#pool.query('INSERT INTO users (id, email, password_hash, created_at) VALUES ($1, $2, $3, $4)', [
        user.id,
        user.email,
        user.passwordHash,
        user.createdAt,
      ]);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === UNIQUE_VIOLATION) {
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }
  }
}
