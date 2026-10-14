import type { ListTasksQuery, Task } from './task.ts';

/**
 * Where tasks are stored. Every read and delete is scoped to one user, so
 * one user's tasks cannot leak into another's results. Every method returns
 * a promise, so a database on the network can replace any implementation.
 */
export interface TaskRepository {
  list(userId: string, query: ListTasksQuery): Promise<{ items: Task[]; total: number }>;
  get(userId: string, id: string): Promise<Task | undefined>;
  findOpenByTitle(userId: string, title: string): Promise<Task | undefined>;
  insert(task: Task): Promise<void>;
  update(task: Task): Promise<void>;
  delete(userId: string, id: string): Promise<boolean>;
}
