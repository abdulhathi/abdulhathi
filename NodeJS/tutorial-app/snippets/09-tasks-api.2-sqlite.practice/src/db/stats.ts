import { openDatabase } from './database.ts';

// Usage: npm run db:stats
const db = openDatabase(process.env.DB_FILE ?? 'data/tasks.db');
const rows = db
  .prepare(
    `SELECT priority, count(*) AS total, sum(done) AS done
       FROM tasks
      GROUP BY priority
      ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END`,
  )
  .all() as { priority: string; total: number; done: number }[];

console.table(rows.map((r) => ({ priority: r.priority, total: r.total, done: r.done, open: r.total - r.done })));
db.close();
