import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { TaskRepository } from './repository.ts';
import type { ListTasksQuery, Priority, Task } from './task.ts';

// What a row looks like in SQLite: snake_case columns, and 0/1 for booleans.
type TaskRow = {
  id: string;
  title: string;
  done: number;
  priority: Priority;
  due_date: string | null;
  created_at: string;
};

const COLUMNS = 'id, title, done, priority, due_date, created_at';

const toTask = (row: TaskRow): Task => ({
  id: row.id,
  title: row.title,
  done: row.done === 1,
  priority: row.priority,
  dueDate: row.due_date,
  createdAt: row.created_at,
});

const toRow = (task: Task): TaskRow => ({
  id: task.id,
  title: task.title,
  done: task.done ? 1 : 0,
  priority: task.priority,
  due_date: task.dueDate,
  created_at: task.createdAt,
});

// A NULL parameter switches its filter off, so one fixed statement serves every combination.
const FILTER = 'WHERE ($done IS NULL OR done = $done) AND ($priority IS NULL OR priority = $priority)';

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
    this.#byId = db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = ?`);
    this.#openByTitle = db.prepare(`SELECT ${COLUMNS} FROM tasks WHERE done = 0 AND lower(title) = lower(?) LIMIT 1`);
    this.#insert = db.prepare(
      `INSERT INTO tasks (${COLUMNS}) VALUES ($id, $title, $done, $priority, $due_date, $created_at)`,
    );
    this.#update = db.prepare(
      'UPDATE tasks SET title = $title, done = $done, priority = $priority, due_date = $due_date WHERE id = $id',
    );
    this.#delete = db.prepare('DELETE FROM tasks WHERE id = ?');
  }

  async list({ done, priority, limit, offset }: ListTasksQuery) {
    const filter = { done: done === undefined ? null : Number(done), priority: priority ?? null };
    const { total } = this.#count.get(filter) as { total: number };
    const rows = this.#page.all({ ...filter, limit, offset }) as TaskRow[];
    return { items: rows.map(toTask), total };
  }

  async get(id: string) {
    const row = this.#byId.get(id) as TaskRow | undefined;
    return row && toTask(row);
  }

  async findOpenByTitle(title: string) {
    const row = this.#openByTitle.get(title) as TaskRow | undefined;
    return row && toTask(row);
  }

  async insert(task: Task) {
    this.#insert.run(toRow(task));
  }

  async update(task: Task) {
    const { created_at: _unchanged, ...row } = toRow(task);
    this.#update.run(row);
  }

  async delete(id: string) {
    return Number(this.#delete.run(id).changes) > 0;
  }
}
