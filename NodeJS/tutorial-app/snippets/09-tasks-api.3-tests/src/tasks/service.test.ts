import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { ConflictError, NotFoundError, RuleViolationError } from '../errors.ts';
import { InMemoryTaskRepository } from './memory-repository.ts';
import { TaskService } from './service.ts';

const MISSING = '00000000-0000-4000-8000-000000000000';

describe('TaskService', () => {
  let repo: InMemoryTaskRepository;
  let service: TaskService;

  // A fresh repository and service for every test, so no test depends on another.
  beforeEach(() => {
    repo = new InMemoryTaskRepository();
    service = new TaskService(repo);
  });

  describe('create', () => {
    it('fills in the fields the client does not send', async () => {
      const task = await service.create({ title: 'Write tests', priority: 'medium' });

      assert.match(task.id, /^[0-9a-f-]{36}$/);
      assert.equal(task.done, false);
      assert.equal(task.dueDate, null);
      assert.deepEqual(await repo.get(task.id), task);
    });

    it('rejects a second open task with the same title, ignoring case', async () => {
      await service.create({ title: 'Write tests', priority: 'medium' });

      await assert.rejects(service.create({ title: 'WRITE TESTS', priority: 'low' }), ConflictError);
    });

    it('allows the title again once the first task is done', async () => {
      const first = await service.create({ title: 'Water plants', priority: 'low' });
      await service.update(first.id, { done: true });

      const second = await service.create({ title: 'Water plants', priority: 'low' });
      assert.notEqual(second.id, first.id);
    });

    it('rejects a due date before today and accepts today', async (t) => {
      // Freeze the clock so the test means the same thing on every day it runs.
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-15T12:00:00Z') });

      await assert.rejects(
        service.create({ title: 'Too late', priority: 'high', dueDate: '2026-06-14' }),
        { name: 'RuleViolationError', message: 'Due date cannot be in the past' },
      );
      const task = await service.create({ title: 'Just in time', priority: 'high', dueDate: '2026-06-15' });
      assert.equal(task.dueDate, '2026-06-15');
    });

    it('stamps createdAt from the clock', async (t) => {
      t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-06-15T12:00:00Z') });
      const task = await service.create({ title: 'Timestamped', priority: 'low' });
      assert.equal(task.createdAt, '2026-06-15T12:00:00.000Z');
    });

    it('saves through the repository exactly once', async (t) => {
      const insert = t.mock.method(repo, 'insert'); // a spy: records calls, keeps the real behaviour

      const task = await service.create({ title: 'Spied on', priority: 'low' });

      assert.equal(insert.mock.callCount(), 1);
      assert.deepEqual(insert.mock.calls[0]?.arguments, [task]);
    });

    it('passes storage failures through unchanged', async (t) => {
      t.mock.method(repo, 'insert', async () => {
        throw new Error('disk full');
      });

      await assert.rejects(service.create({ title: 'Doomed', priority: 'low' }), /disk full/);
    });
  });

  describe('update and remove', () => {
    it('changes only the fields it is given', async () => {
      const task = await service.create({ title: 'Original', priority: 'low', dueDate: null });

      const updated = await service.update(task.id, { priority: 'high' });

      assert.deepEqual(updated, { ...task, priority: 'high' });
    });

    it('throws NotFoundError for unknown ids', async () => {
      await assert.rejects(service.update(MISSING, { done: true }), NotFoundError);
      await assert.rejects(service.remove(MISSING), NotFoundError);
    });

    it('checks the due-date rule on updates too', async () => {
      const task = await service.create({ title: 'Movable', priority: 'low' });
      await assert.rejects(service.update(task.id, { dueDate: '2000-01-01' }), RuleViolationError);
    });
  });

  it('lists a page and reports the total', async () => {
    for (const title of ['one', 'two', 'three']) await service.create({ title, priority: 'low' });

    const page = await service.list({ limit: 2, offset: 0 });

    assert.equal(page.items.length, 2);
    assert.equal(page.total, 3);
  });
});
