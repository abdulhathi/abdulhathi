import type { Config } from '../config.ts';
import type { Logger } from '../logger.ts';
import { PgTaskRepository } from '../tasks/pg-repository.ts';
import type { TaskRepository } from '../tasks/repository.ts';
import { SqliteTaskRepository } from '../tasks/sqlite-repository.ts';
import { PgUserRepository } from '../users/pg-repository.ts';
import type { UserRepository } from '../users/repository.ts';
import { SqliteUserRepository } from '../users/sqlite-repository.ts';
import { openDatabase } from './database.ts';
import { createPool, migratePostgres } from './postgres.ts';

/** Everything the app needs from storage, whichever database is behind it. */
export type Store = {
  kind: 'postgres' | 'sqlite';
  tasks: TaskRepository;
  users: UserRepository;
  ping(): Promise<void>; // throws if the database cannot answer
  close(): Promise<void>;
};

/** PostgreSQL when DATABASE_URL is set; otherwise the SQLite file, so a laptop needs no Docker. */
export async function openStore(config: Pick<Config, 'databaseUrl' | 'dbPoolMax' | 'dbFile'>, log: Logger): Promise<Store> {
  if (config.databaseUrl) {
    const pool = createPool(config.databaseUrl, { max: config.dbPoolMax, log });
    await migratePostgres(pool);
    return {
      kind: 'postgres',
      tasks: new PgTaskRepository(pool),
      users: new PgUserRepository(pool),
      ping: async () => {
        await pool.query('SELECT 1');
      },
      close: () => pool.end(),
    };
  }

  const db = openDatabase(config.dbFile);
  return {
    kind: 'sqlite',
    tasks: new SqliteTaskRepository(db),
    users: new SqliteUserRepository(db),
    ping: async () => {
      db.prepare('SELECT 1').get();
    },
    close: async () => db.close(),
  };
}
