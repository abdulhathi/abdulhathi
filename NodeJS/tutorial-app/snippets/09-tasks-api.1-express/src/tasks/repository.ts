import type { ListTasksQuery, Task } from './task.ts';

/**
 * Where tasks are stored. Every method returns a promise, even when an
 * implementation could answer immediately, so a database on the network can
 * replace the in-memory store without changing a single caller.
 */
export interface TaskRepository {
  list(query: ListTasksQuery): Promise<{ items: Task[]; total: number }>;
  get(id: string): Promise<Task | undefined>;
  findOpenByTitle(title: string): Promise<Task | undefined>;
  insert(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
  delete(id: string): Promise<boolean>;
}
