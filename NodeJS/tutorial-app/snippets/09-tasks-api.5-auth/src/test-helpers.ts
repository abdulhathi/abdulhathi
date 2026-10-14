import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { createApp } from './app.ts';
import { AuthService } from './auth/service.ts';
import { TokenService } from './auth/tokens.ts';
import { openDatabase } from './db/database.ts';
import { createLogger, type Logger } from './logger.ts';
import type { RateLimitOptions } from './middleware/rate-limit.ts';
import { SqliteTaskRepository } from './tasks/sqlite-repository.ts';
import { TaskService } from './tasks/service.ts';
import { SqliteUserRepository } from './users/sqlite-repository.ts';

export const TEST_SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

/** The real app on a fresh in-memory database. Silent logs and a generous login limit unless overridden. */
export function createTestApp(options: { log?: Logger; loginLimit?: RateLimitOptions } = {}) {
  const db = openDatabase(':memory:');
  const log = options.log ?? createLogger('silent');
  const tokens = new TokenService(TEST_SECRET);
  const auth = new AuthService(new SqliteUserRepository(db), tokens, log);
  const tasks = new TaskService(new SqliteTaskRepository(db), log);
  const loginLimit = options.loginLimit ?? { windowMs: 60_000, max: 1000 };
  return { app: createApp({ tasks, auth, tokens, log, loginLimit }), tasks, auth, tokens };
}

export type TestServer = { url: string; close: () => Promise<void> };

/** Starts the app on a free port chosen by the OS (port 0), so tests never clash. */
export async function startServer(app: Express): Promise<TestServer> {
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}

/** fetch with JSON in and out, and an optional bearer token. Returns the status, headers and parsed body. */
export async function request(url: string, init: { method?: string; body?: unknown; token?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(url, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : undefined };
}

export const PASSWORD = 'correct horse battery staple';

/** Creates an account and returns its token. */
export async function signUp(baseUrl: string, email = `user-${randomUUID()}@example.com`): Promise<string> {
  const res = await request(`${baseUrl}/auth/signup`, { method: 'POST', body: { email, password: PASSWORD } });
  if (res.status !== 201) throw new Error(`sign-up failed: ${JSON.stringify(res.body)}`);
  return res.body.token;
}
