import pg from 'pg';
import { createLogger, type Logger } from '../logger.ts';
import { PG_MIGRATIONS } from './pg-migrations.ts';

// DATE columns hold calendar days such as 2026-12-24. By default pg turns them
// into a Date at local midnight, which can shift the day; keep the text instead.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

type PoolOptions = { max?: number; log?: Logger };

/** A pool of reusable connections. Create one per process and share it. */
export function createPool(connectionString: string, { max = 10, log = createLogger('silent') }: PoolOptions = {}) {
  const pool = new pg.Pool({
    connectionString,
    max, // at most this many connections from this process
    idleTimeoutMillis: 30_000, // close a connection after 30 s unused
    connectionTimeoutMillis: 5_000, // the default, 0, waits for a free connection forever
  });
  // A connection sitting idle in the pool can still fail, for example when the
  // database restarts. That arrives as an 'error' event, and an EventEmitter
  // with no 'error' listener crashes the process. The pool replaces the connection.
  pool.on('error', (err) => log.error({ err }, 'idle database connection failed'));
  return pool;
}

/**
 * Runs fn on one connection inside a transaction. A transaction must use a
 * single connection: pool.query() may pick a different one for every call.
 */
export async function withTransaction<T>(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release(); // always give the connection back, or the pool runs dry
  }
}

const MIGRATION_LOCK = 9_241_017; // any number, as long as every instance uses the same one

/** Applies pending migrations. Returns the schema version. Safe to run from several instances at once. */
export async function migratePostgres(pool: pg.Pool): Promise<number> {
  const client = await pool.connect();
  try {
    // Instances starting together take turns here instead of migrating twice.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
                          version    integer PRIMARY KEY,
                          applied_at timestamptz NOT NULL DEFAULT now()
                        )`);
    const { rows } = await client.query<{ version: number }>('SELECT version FROM schema_migrations');
    const applied = new Set(rows.map((row) => row.version));

    for (const [index, sql] of PG_MIGRATIONS.entries()) {
      const version = index + 1;
      if (applied.has(version)) continue;
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
    return PG_MIGRATIONS.length;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]);
    client.release();
  }
}
