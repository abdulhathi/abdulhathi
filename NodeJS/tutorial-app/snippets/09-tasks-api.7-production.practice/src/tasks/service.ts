import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, RuleViolationError } from '../errors.ts';
import { createLogger, type Logger } from '../logger.ts';
import type { TaskRepository } from './repository.ts';
import type { CreateTaskInput, ListTasksQuery, Task, TaskPage, UpdateTaskInput } from './task.ts';

const today = () => new Date().toISOString().slice(0, 10); // UTC date, YYYY-MM-DD

/** The rules of the task list. Every method acts on behalf of one user. */
export class TaskService {
  readonly #repo: TaskRepository;
  readonly #log: Logger;

  constructor(repo: TaskRepository, log: Logger = createLogger('silent')) {
    this.#repo = repo;
    this.#log = log;
  }

  async list(userId: string, query: ListTasksQuery): Promise<TaskPage> {
    const { items, total } = await this.#repo.list(userId, query);
    return { items, total, limit: query.limit, offset: query.offset };
  }

  async get(userId: string, id: string): Promise<Task> {
    const task = await this.#repo.get(userId, id);
    // Someone else's task is "not found", not "forbidden": we do not even admit it exists.
    if (!task) throw new NotFoundError('Task');
    return task;
  }

  async create(userId: string, input: CreateTaskInput): Promise<Task> {
    this.#checkDueDate(input.dueDate);
    await this.#checkTitleIsFree(userId, input.title);
    const task: Task = {
      id: randomUUID(),
      userId,
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

  async update(userId: string, id: string, changes: UpdateTaskInput): Promise<Task> {
    const task = await this.get(userId, id);
    if (changes.dueDate !== undefined) this.#checkDueDate(changes.dueDate);
    if (changes.title !== undefined && changes.title.toLowerCase() !== task.title.toLowerCase()) {
      await this.#checkTitleIsFree(userId, changes.title);
    }
    const updated: Task = { ...task, ...changes };
    await this.#repo.update(updated);
    return updated;
  }

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await this.#repo.delete(userId, id);
    if (!deleted) throw new NotFoundError('Task');
    this.#log.info({ taskId: id }, 'task deleted');
  }

  #checkDueDate(dueDate: string | null | undefined) {
    if (dueDate && dueDate < today()) throw new RuleViolationError('Due date cannot be in the past');
  }

  async #checkTitleIsFree(userId: string, title: string) {
    if (await this.#repo.findOpenByTitle(userId, title)) {
      throw new ConflictError(`An open task called "${title}" already exists`);
    }
  }
}
