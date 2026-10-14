// PostgreSQL has its own migration history. It starts from the schema the
// SQLite database reached after its migration 2, written with Postgres types.
// As with SQLite: append only, never edit a migration that has run.
export const PG_MIGRATIONS: string[] = [
  `CREATE TABLE users (
     id            uuid PRIMARY KEY,
     email         text NOT NULL,
     password_hash text NOT NULL,
     created_at    timestamptz NOT NULL
   );
   CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

   CREATE TABLE tasks (
     id         uuid PRIMARY KEY,
     user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
     title      text NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
     done       boolean NOT NULL DEFAULT false,
     priority   text NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
     due_date   date,
     created_at timestamptz NOT NULL
   );
   CREATE INDEX tasks_by_owner ON tasks (user_id, created_at, id);`,
];
