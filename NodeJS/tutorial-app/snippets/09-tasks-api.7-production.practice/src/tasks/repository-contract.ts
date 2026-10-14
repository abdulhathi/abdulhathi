import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { TaskRepository } from './repository.ts';
import type { Task } from './task.ts';

// Two owners. Implementations that enforce foreign keys must create these users first.
export const ADA = '00000000-0000-4000-8000-0000000000ad';
export const BOB = '00000000-0000-4000-8000-0000000000b0';
export const OWNERS = [ADA, BOB];

let counter = 0;
/** A valid task owned by Ada, with a predictable id and creation time; override any field. */
export function makeTask(overrides: Partial<Task> = {}): Task {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    userId: ADA,
    title: `Task ${counter}`,
    done: false,
    priority: 'medium',
    dueDate: null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, counter)).toISOString(),
    ...overrides,
  };
}

const page = { limit: 20, offset: 0 };

/**
 * The behaviour every TaskRepository must have. Each implementation's test
 * file calls this with a factory, so they are all held to the same rules.
 */
export function testTaskRepository(name: string, create: () => TaskRepository | Promise<TaskRepository>) {
  describe(`${name} (repository contract)`, () => {
    let repo: TaskRepository;
    beforeEach(async () => {
      repo = await create(); // async, so a factory can reset a real database first
    });

    it('returns what was inserted', async () => {
      const task = makeTask({ dueDate: '2026-12-24', priority: 'high' });
      await repo.insert(task);
      assert.deepEqual(await repo.get(ADA, task.id), task);
    });

    it('returns undefined for an unknown id', async () => {
      assert.equal(await repo.get(ADA, makeTask().id), undefined);
    });

    it('lists in creation order with filters, paging and a total', async () => {
      const tasks = [makeTask(), makeTask({ done: true }), makeTask({ priority: 'high' }), makeTask()];
      for (const task of tasks.toReversed()) await repo.insert(task); // insertion order must not matter

      const all = await repo.list(ADA, page);
      assert.deepEqual(all.items.map((t) => t.id), tasks.map((t) => t.id));
      assert.equal(all.total, 4);

      const open = await repo.list(ADA, { ...page, done: false });
      assert.equal(open.total, 3);
      const high = await repo.list(ADA, { ...page, priority: 'high' });
      assert.deepEqual(high.items, [tasks[2]]);

      const second = await repo.list(ADA, { limit: 2, offset: 2 });
      assert.deepEqual(second.items.map((t) => t.id), [tasks[2]?.id, tasks[3]?.id]);
      assert.equal(second.total, 4);
    });

    it('finds open tasks by title, ignoring case and finished tasks', async () => {
      const finished = makeTask({ title: 'Report', done: true });
      const open = makeTask({ title: 'Report' });
      await repo.insert(finished);
      await repo.insert(open);

      assert.deepEqual(await repo.findOpenByTitle(ADA, 'REPORT'), open);
      assert.equal(await repo.findOpenByTitle(ADA, 'Nothing'), undefined);
    });

    it('updates every changeable field', async () => {
      const task = makeTask();
      await repo.insert(task);
      const changed = { ...task, title: 'Renamed', done: true, priority: 'low' as const, dueDate: '2027-01-01' };

      await repo.update(changed);

      assert.deepEqual(await repo.get(ADA, task.id), changed);
    });

    it('deletes, and says whether anything was deleted', async () => {
      const task = makeTask();
      await repo.insert(task);

      assert.equal(await repo.delete(ADA, task.id), true);
      assert.equal(await repo.delete(ADA, task.id), false);
      assert.equal(await repo.get(ADA, task.id), undefined);
    });

    it('keeps each owner’s tasks invisible to everyone else', async () => {
      const task = makeTask({ title: 'Private' });
      await repo.insert(task);

      assert.equal(await repo.get(BOB, task.id), undefined);
      assert.equal((await repo.list(BOB, page)).total, 0);
      assert.equal(await repo.findOpenByTitle(BOB, 'Private'), undefined);
      assert.equal(await repo.delete(BOB, task.id), false);
      await repo.update({ ...task, userId: BOB, title: 'Hijacked' });
      assert.equal((await repo.get(ADA, task.id))?.title, 'Private');
    });

    it('hands out copies, not the stored objects', async () => {
      const task = makeTask();
      await repo.insert(task);
      const copy = await repo.get(ADA, task.id);
      if (copy) copy.title = 'Changed behind its back';
      assert.equal((await repo.get(ADA, task.id))?.title, task.title);
    });
  });
}
