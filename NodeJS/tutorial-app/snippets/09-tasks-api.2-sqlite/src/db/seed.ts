import { randomUUID } from 'node:crypto';
import { openDatabase } from './database.ts';
import { transaction } from './transaction.ts';

// Usage: npm run db:seed -- 500
const count = Number(process.argv[2] ?? 100);
const db = openDatabase(process.env.DB_FILE ?? 'data/tasks.db');
const insert = db.prepare(
  'INSERT INTO tasks (id, title, done, priority, due_date, created_at) VALUES (?, ?, ?, ?, NULL, ?)',
);
const priorities = ['low', 'medium', 'high'] as const;

const addTasks = (label: string) => {
  for (let i = 1; i <= count; i++) {
    insert.run(randomUUID(), `${label} task ${i}`, i % 4 === 0 ? 1 : 0, priorities[i % 3]!, new Date().toISOString());
  }
};

let start = performance.now();
addTasks('Autocommit');
console.log(`${count} inserts, each its own transaction: ${(performance.now() - start).toFixed(1)} ms`);

start = performance.now();
transaction(db, () => addTasks('Batched'));
console.log(`${count} inserts in one transaction:        ${(performance.now() - start).toFixed(1)} ms`);
db.close();
