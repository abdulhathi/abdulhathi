import { Router } from 'express';
import { userIdOf } from '../auth/middleware.ts';
import type { TaskService } from './service.ts';
import { CreateTaskInput, ListTasksQuery, TaskParams, UpdateTaskInput } from './task.ts';

// Mounted behind requireAuth, so every handler knows who is asking.
// parse() throws a ZodError for bad input, and Express 5 passes thrown errors
// and rejected promises to the error handler, so there is no try/catch here.
export function tasksRouter(tasks: TaskService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = ListTasksQuery.parse(req.query);
    res.json(await tasks.list(userIdOf(res), query));
  });

  router.post('/', async (req, res) => {
    const input = CreateTaskInput.parse(req.body);
    const task = await tasks.create(userIdOf(res), input);
    res.status(201).location(`${req.baseUrl}/${task.id}`).json(task);
  });

  router.get('/:id', async (req, res) => {
    const { id } = TaskParams.parse(req.params);
    res.json(await tasks.get(userIdOf(res), id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = TaskParams.parse(req.params);
    const changes = UpdateTaskInput.parse(req.body);
    res.json(await tasks.update(userIdOf(res), id, changes));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = TaskParams.parse(req.params);
    await tasks.remove(userIdOf(res), id);
    res.status(204).end();
  });

  return router;
}
