import express, { type Express } from 'express';
import type { Logger } from './logger.ts';
import { accessLog } from './middleware/access-log.ts';
import { errorHandler, notFound } from './middleware/errors.ts';
import { requestContext } from './request-context.ts';
import type { TaskService } from './tasks/service.ts';
import { tasksRouter } from './tasks/routes.ts';

export type AppDeps = { tasks: TaskService; log: Logger };

/** Builds the app without starting it, so tests can create as many as they like. */
export function createApp({ tasks, log }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');

  // Middleware runs in the order it is added, for every request.
  app.use(requestContext); // first, so everything after it knows the request id
  app.use(accessLog(log));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/tasks', tasksRouter(tasks));

  // Last: nothing matched, or something failed.
  app.use(notFound);
  app.use(errorHandler(log));
  return app;
}
