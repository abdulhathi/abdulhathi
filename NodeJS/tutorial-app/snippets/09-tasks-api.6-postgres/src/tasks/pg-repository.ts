import type pg from 'pg';
import type { TaskRepository } from './repository.ts';
import type { ListTasksQuery, Priority, Task } from './task.ts';

// Postgres has real booleans, dates and timestamps; pg converts them for us.
type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  done: boolean;
  priority: Priority;
  due_date: string | null; // kept as text by the DATE parser in db/postgres.ts
  created_at: Date; // timestamptz arrives as a Date
};

const COLUMNS = 'id, user_id, title, done, priority, due_date, created_at';

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  done: row.done,
  priority: row.priority,
  dueDate: row.due_date,
  createdAt: row.created_at.toISOString(),
});

// $1, $2… are parameters, sent separately from the SQL text. The casts tell
// Postgres the type of a parameter that may be NULL.
const FILTER = `WHERE user_id = $1
                  AND ($2::boolean IS NULL OR done = $2)
                  AND ($3::text IS NULL OR priority = $3)`;

export class PgTaskRepository implements TaskRepository {
  readonly #pool: pg.Pool;

  constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  async list(userId: string, { done, priority, limit, offset }: ListTasksQuery) {
    const filter = [userId, done ?? null, priority ?? null];
    // Two queries at once, on two pooled connections: the I/O overlaps.
    const [count, page] = await Promise.all([
      this.#pool.query<{ total: number }>(`SELECT count(*)::int AS total FROM tasks ${FILTER}`, filter),
      this.#pool.query<TaskRow>(
        `SELECT ${COLUMNS} FROM tasks ${FILTER} ORDER BY created_at, id LIMIT $4 OFFSET $5`,
        [...filter, limit, offset],
      ),
    ]);
    return { items: page.rows.map(toTask), total: count.rows[0]?.total ?? 0 };
  }

  async get(userId: string, id: string) {
    const { rows } = await this.#pool.query<TaskRow>(`SELECT ${COLUMNS} FROM tasks WHERE id = $1 AND user_id = $2`, [
      id,
      userId,
    ]);
    return rows[0] && toTask(rows[0]);
  }

  async findOpenByTitle(userId: string, title: string) {
    const { rows } = await this.#pool.query<TaskRow>(
      `SELECT ${COLUMNS} FROM tasks WHERE user_id = $1 AND NOT done AND lower(title) = lower($2) LIMIT 1`,
      [userId, title],
    );
    return rows[0] && toTask(rows[0]);
  }

  async insert(task: Task) {
    await this.#pool.query(`INSERT INTO tasks (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [
      task.id,
      task.userId,
      task.title,
      task.done,
      task.priority,
      task.dueDate,
      task.createdAt,
    ]);
  }

  async update(task: Task) {
    await this.#pool.query(
      'UPDATE tasks SET title = $3, done = $4, priority = $5, due_date = $6 WHERE id = $1 AND user_id = $2',
      [task.id, task.userId, task.title, task.done, task.priority, task.dueDate],
    );
  }

  async delete(userId: string, id: string) {
    const result = await this.#pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, userId]);
    return (result.rowCount ?? 0) > 0;
  }
}
