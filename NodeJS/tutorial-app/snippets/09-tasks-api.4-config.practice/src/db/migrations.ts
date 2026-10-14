import type { DatabaseSync } from 'node:sqlite';
import { transaction } from './transaction.ts';

// Each entry upgrades the schema by one version. Only ever append: a
// migration that has run on any database must never change.
const MIGRATIONS: string[] = [
  `CREATE TABLE tasks (
     id         TEXT PRIMARY KEY,
     title      TEXT NOT NULL,
     done       INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
     priority   TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
     due_date   TEXT,
     created_at TEXT NOT NULL
   );
   CREATE INDEX tasks_by_creation ON tasks (created_at, id);`,
];

/** Applies the migrations this database has not seen yet. Returns the schema version. */
export function migrate(db: DatabaseSync): number {
  // SQLite keeps a spare integer in the file header; we use it as the schema version.
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number };

  MIGRATIONS.slice(current).forEach((sql, i) => {
    const version = current + i + 1;
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version}`);
    });
  });
  return MIGRATIONS.length;
}
