import express, { type Express } from 'express';
import { errorHandler, notFound } from './middleware/errors.ts';
import { requestLog } from './middleware/request-log.ts';
import type { TaskService } from './tasks/service.ts';
import { tasksRouter } from './tasks/routes.ts';

export type AppDeps = { tasks: TaskService };

/** Builds the app without starting it, so tests can create as many as they like. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Middleware runs in the order it is added, for every request.
  app.use(requestLog);
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/tasks', tasksRouter(deps.tasks));

  // Last: nothing matched, or something failed.
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
