import type { DatabaseSync } from 'node:sqlite';

/**
 * Runs fn inside one transaction: everything is saved, or nothing is.
 * fn must be synchronous. With one shared connection, an await inside a
 * transaction would let other requests' statements slip into it.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
