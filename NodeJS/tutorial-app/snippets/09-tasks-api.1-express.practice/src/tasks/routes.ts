import { Router } from 'express';
import type { TaskService } from './service.ts';
import { CreateTaskInput, ListTasksQuery, TaskParams, UpdateTaskInput } from './task.ts';

// Handlers translate HTTP into service calls and back. parse() throws a
// ZodError for bad input, and Express 5 passes thrown errors and rejected
// promises to the error handler, so there is no try/catch here.
export function tasksRouter(tasks: TaskService): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const query = ListTasksQuery.parse(req.query);
    res.json(await tasks.list(query));
  });

  router.post('/', async (req, res) => {
    const input = CreateTaskInput.parse(req.body);
    const task = await tasks.create(input);
    res.status(201).location(`${req.baseUrl}/${task.id}`).json(task);
  });

  router.get('/:id', async (req, res) => {
    const { id } = TaskParams.parse(req.params);
    res.json(await tasks.get(id));
  });

  router.patch('/:id', async (req, res) => {
    const { id } = TaskParams.parse(req.params);
    const changes = UpdateTaskInput.parse(req.body);
    res.json(await tasks.update(id, changes));
  });

  router.post('/:id/complete', async (req, res) => {
    const { id } = TaskParams.parse(req.params);
    res.json(await tasks.complete(id));
  });

  router.delete('/:id', async (req, res) => {
    const { id } = TaskParams.parse(req.params);
    await tasks.remove(id);
    res.status(204).end();
  });

  return router;
}
