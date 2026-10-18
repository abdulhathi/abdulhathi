import express from 'express';
import { basicAuth } from './basic.ts';
import { COST } from './passwords.ts';
import { DEMO_USERS, UserTable } from './users.ts';

type Options = { users?: Record<string, string>; cost?: typeof COST };

export async function createApp({ users = DEMO_USERS, cost = COST }: Options = {}) {
  const table = await UserTable.create(users, cost);
  const requireUser = basicAuth((username, password) => table.check(username, password));
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' }); // public: no credentials needed
  });

  app.get('/me', requireUser, (_req, res) => {
    res.json({ username: res.locals.username });
  });

  return { app };
}
