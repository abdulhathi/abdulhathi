import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { ConflictError } from '../errors.ts';
import type { UserRepository } from './repository.ts';
import type { User } from './user.ts';

type UserRow = { id: string; email: string; password_hash: string; created_at: string };

const toUser = (row: UserRow): User => ({
  id: row.id,
  email: row.email,
  passwordHash: row.password_hash,
  createdAt: row.created_at,
});

const SQLITE_CONSTRAINT_UNIQUE = 2067;

export class SqliteUserRepository implements UserRepository {
  readonly #byEmail: StatementSync;
  readonly #byId: StatementSync;
  readonly #insert: StatementSync;

  constructor(db: DatabaseSync) {
    this.#byEmail = db.prepare('SELECT * FROM users WHERE email = ?'); // COLLATE NOCASE: case-insensitive
    this.#byId = db.prepare('SELECT * FROM users WHERE id = ?');
    this.#insert = db.prepare(
      'INSERT INTO users (id, email, password_hash, created_at) VALUES ($id, $email, $password_hash, $created_at)',
    );
  }

  async findByEmail(email: string) {
    const row = this.#byEmail.get(email) as UserRow | undefined;
    return row && toUser(row);
  }

  async get(id: string) {
    const row = this.#byId.get(id) as UserRow | undefined;
    return row && toUser(row);
  }

  async insert(user: User) {
    try {
      this.#insert.run({ id: user.id, email: user.email, password_hash: user.passwordHash, created_at: user.createdAt });
    } catch (error) {
      // The UNIQUE constraint is the real guard: two sign-ups racing each other cannot both win.
      if (error instanceof Error && 'errcode' in error && error.errcode === SQLITE_CONSTRAINT_UNIQUE) {
        throw new ConflictError('An account with this email already exists');
      }
      throw error;
    }
  }
}
