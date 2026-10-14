import type { TaskRepository } from './repository.ts';
import type { ListTasksQuery, Task } from './task.ts';

const byCreation = (a: Task, b: Task) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export class InMemoryTaskRepository implements TaskRepository {
  readonly #tasks = new Map<string, Task>();

  async list({ done, priority, limit, offset }: ListTasksQuery) {
    const matching = [...this.#tasks.values()]
      .filter((t) => (done === undefined || t.done === done) && (priority === undefined || t.priority === priority))
      .sort(byCreation);
    // Copies, so callers cannot change stored tasks by accident.
    return { items: matching.slice(offset, offset + limit).map((t) => ({ ...t })), total: matching.length };
  }

  async get(id: string) {
    const task = this.#tasks.get(id);
    return task && { ...task };
  }

  async findOpenByTitle(title: string) {
    const wanted = title.toLowerCase();
    const task = [...this.#tasks.values()].find((t) => !t.done && t.title.toLowerCase() === wanted);
    return task && { ...task };
  }

  async insert(task: Task) {
    this.#tasks.set(task.id, { ...task });
  }

  async update(task: Task) {
    this.#tasks.set(task.id, { ...task });
  }

  async delete(id: string) {
    return this.#tasks.delete(id);
  }
}
