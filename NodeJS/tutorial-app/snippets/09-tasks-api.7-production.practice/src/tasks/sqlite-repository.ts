import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { TaskRepository } from './repository.ts';
import type { ListTasksQuery, Priority, Task } from './task.ts';

// What a row looks like in SQLite: snake_case columns, and 0/1 for booleans.
type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  done: number;
  priority: Priority;
  due_date: string | null;
  created_at: string;
};

const COLUMNS = 'id, user_id, title, done, priority, due_date, created_at';

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  done: row.done === 1,
  priority: row.priority,
  dueDate: row.due_date,
  createdAt: row.created_at,
});

const toRow = (task: Task): TaskRow => ({
  id: task.id,
  user_id: task.userId,
  title: task.title,
  done: task.done ? 1 : 0,
  priority: task.priority,
  due_date: task.dueDate,
  created_at: task.createdAt,
});

// Always scoped to the owner. A NULL filter parameter switches that filter off.
const FILTER = `WHERE user_id = $user_id
                  AND ($done IS NULL OR done = $done)
                  AND ($priority IS NULL OR priority = $priority)`;

export class SqliteTaskRepository implements TaskRepository {
  // Prepared once, reused for every call: SQLite parses each statement a single time.
  readonly #count: StatementSync;
  readonly #page: StatementSync;
  readonly #byId: StatementSync;
  readonly #openByTitle: StatementSync;
  readonly #insert: StatementSync;
  readonly #update: StatementSync;
  readonly #delete: StatementSync;

  constructor(db: DatabaseSync) {
    this.#count = db.prepare(`SELECT count(*) AS total FROM tasks ${FILTER}`);
    this.#page = db.prepare(`SELECT ${COLUMNS} FROM tasks ${FILTER} ORDER BY created_at, id LIMIT $limit OFFSET $offset`);
    this.#byId = db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = $id AND user_id = $user_id`);
    this.#openByTitle = db.prepare(
      `SELECT ${COLUMNS} FROM tasks WHERE user_id = $user_id AND done = 0 AND lower(title) = lower($title) LIMIT 1`,
    );
    this.#insert = db.prepare(
      `INSERT INTO tasks (${COLUMNS}) VALUES ($id, $user_id, $title, $done, $priority, $due_date, $created_at)`,
    );
    this.#update = db.prepare(
      `UPDATE tasks SET title = $title, done = $done, priority = $priority, due_date = $due_date
        WHERE id = $id AND user_id = $user_id`,
    );
    this.#delete = db.prepare('DELETE FROM tasks WHERE id = $id AND user_id = $user_id');
  }

  async list(userId: string, { done, priority, limit, offset }: ListTasksQuery) {
    const filter = { user_id: userId, done: done === undefined ? null : Number(done), priority: priority ?? null };
    const { total } = this.#count.get(filter) as { total: number };
    const rows = this.#page.all({ ...filter, limit, offset }) as TaskRow[];
    return { items: rows.map(toTask), total };
  }

  async get(userId: string, id: string) {
    const row = this.#byId.get({ id, user_id: userId }) as TaskRow | undefined;
    return row && toTask(row);
  }

  async findOpenByTitle(userId: string, title: string) {
    const row = this.#openByTitle.get({ user_id: userId, title }) as TaskRow | undefined;
    return row && toTask(row);
  }

  async insert(task: Task) {
    this.#insert.run(toRow(task));
  }

  async update(task: Task) {
    const { created_at: _unchanged, ...row } = toRow(task);
    this.#update.run(row);
  }

  async delete(userId: string, id: string) {
    return Number(this.#delete.run({ id, user_id: userId }).changes) > 0;
  }
}
