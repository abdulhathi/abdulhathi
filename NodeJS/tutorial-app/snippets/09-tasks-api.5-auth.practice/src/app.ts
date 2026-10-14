import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { requireAuth } from './auth/middleware.ts';
import { authRouter } from './auth/routes.ts';
import type { AuthService } from './auth/service.ts';
import type { TokenService } from './auth/tokens.ts';
import type { Logger } from './logger.ts';
import { accessLog } from './middleware/access-log.ts';
import { errorHandler, notFound } from './middleware/errors.ts';
import { rateLimit, type RateLimitOptions } from './middleware/rate-limit.ts';
import { requestContext } from './request-context.ts';
import type { TaskService } from './tasks/service.ts';
import { tasksRouter } from './tasks/routes.ts';

export type AppDeps = {
  tasks: TaskService;
  auth: AuthService;
  tokens: TokenService;
  log: Logger;
  loginLimit?: RateLimitOptions;
  corsOrigins?: string[];
};

const FIVE_PER_15_MINUTES: RateLimitOptions = { windowMs: 15 * 60 * 1000, max: 5 };

/** Builds the app without starting it, so tests can create as many as they like. */
export function createApp({ tasks, auth, tokens, log, loginLimit = FIVE_PER_15_MINUTES, corsOrigins = [] }: AppDeps): Express {
  const app = express();

  // Middleware runs in the order it is added, for every request.
  app.use(requestContext); // first, so everything after it knows the request id
  app.use(helmet()); // security headers; also removes X-Powered-By
  // Before the routes, so browser preflight (OPTIONS) requests are answered without a token.
  if (corsOrigins.length > 0) app.use(cors({ origin: corsOrigins }));
  app.use(accessLog(log));
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/auth', authRouter(auth, tokens, rateLimit(loginLimit)));
  app.use('/tasks', requireAuth(tokens), tasksRouter(tasks));

  // Last: nothing matched, or something failed.
  app.use(notFound);
  app.use(errorHandler(log));
  return app;
}
