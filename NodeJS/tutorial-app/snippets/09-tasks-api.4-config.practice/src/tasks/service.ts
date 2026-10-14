import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, RuleViolationError } from '../errors.ts';
import { createLogger, type Logger } from '../logger.ts';
import type { TaskRepository } from './repository.ts';
import type { CreateTaskInput, ListTasksQuery, Task, TaskPage, UpdateTaskInput } from './task.ts';

const today = () => new Date().toISOString().slice(0, 10); // UTC date, YYYY-MM-DD

/** The rules of the task list. Knows nothing about HTTP or storage details. */
export class TaskService {
  readonly #repo: TaskRepository;
  readonly #log: Logger;

  constructor(repo: TaskRepository, log: Logger = createLogger('silent')) {
    this.#repo = repo;
    this.#log = log;
  }

  async list(query: ListTasksQuery): Promise<TaskPage> {
    const { items, total } = await this.#repo.list(query);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  async get(id: string): Promise<Task> {
    const task = await this.#repo.get(id);
    if (!task) throw new NotFoundError('Task');
    return task;
  }

  async create(input: CreateTaskInput): Promise<Task> {
    this.#checkDueDate(input.dueDate);
    await this.#checkTitleIsFree(input.title);
    const task: Task = {
      id: randomUUID(),
      title: input.title,
      done: false,
      priority: input.priority,
      dueDate: input.dueDate ?? null,
      createdAt: new Date().toISOString(),
    };
    await this.#repo.insert(task);
    this.#log.info({ taskId: task.id }, 'task created'); // the request id is added automatically
    return task;
  }

  async update(id: string, changes: UpdateTaskInput): Promise<Task> {
    const task = await this.get(id);
    if (changes.dueDate !== undefined) this.#checkDueDate(changes.dueDate);
    if (changes.title !== undefined && changes.title.toLowerCase() !== task.title.toLowerCase()) {
      await this.#checkTitleIsFree(changes.title);
    }
    const updated: Task = { ...task, ...changes };
    await this.#repo.update(updated);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.#repo.delete(id);
    if (!deleted) throw new NotFoundError('Task');
    this.#log.info({ taskId: id }, 'task deleted');
  }

  #checkDueDate(dueDate: string | null | undefined) {
    if (dueDate && dueDate < today()) throw new RuleViolationError('Due date cannot be in the past');
  }

  async #checkTitleIsFree(title: string) {
    if (await this.#repo.findOpenByTitle(title)) {
      throw new ConflictError(`An open task called "${title}" already exists`);
    }
  }
}
