import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrate } from './migrations.ts';

/** Opens (or creates) a database and brings its schema up to date. Pass ':memory:' for a throwaway one. */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL'); // readers and the writer stop blocking each other
  db.exec('PRAGMA synchronous = NORMAL'); // safe with WAL, and much faster
  db.exec('PRAGMA foreign_keys = ON'); // off by default in SQLite
  db.exec('PRAGMA busy_timeout = 5000'); // wait up to 5 s for a lock instead of failing
  migrate(db);
  return db;
}
