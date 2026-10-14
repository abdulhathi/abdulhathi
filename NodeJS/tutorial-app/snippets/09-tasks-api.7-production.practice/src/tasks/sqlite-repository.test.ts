import { openDatabase } from '../db/database.ts';
import { OWNERS, testTaskRepository } from './repository-contract.ts';
import { SqliteTaskRepository } from './sqlite-repository.ts';

// ':memory:' gives every test its own empty, fully migrated database in about a millisecond.
testTaskRepository('SqliteTaskRepository', () => {
  const db = openDatabase(':memory:');
  // tasks.user_id references users.id and foreign keys are on, so the owners must exist.
  const addUser = db.prepare(`INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, 'x', '2026-01-01')`);
  for (const id of OWNERS) addUser.run(id, `${id}@example.com`);
  return new SqliteTaskRepository(db);
});
