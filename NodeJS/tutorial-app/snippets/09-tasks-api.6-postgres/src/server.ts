import { createApp } from './app.ts';
import { AuthService } from './auth/service.ts';
import { TokenService } from './auth/tokens.ts';
import { loadConfig } from './config.ts';
import { openStore } from './db/store.ts';
import { createLogger } from './logger.ts';
import { TaskService } from './tasks/service.ts';

const config = loadConfig();
const log = createLogger(config.logLevel);

// After an unexpected error the process may be in a broken state. Log it,
// exit, and let whatever started the process start a fresh one.
process.on('uncaughtException', (err) => {
  log.fatal({ err }, 'uncaught exception, exiting');
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log.fatal({ err: reason }, 'unhandled promise rejection, exiting');
  process.exit(1);
});

const store = await openStore(config, log); // top-level await: ES modules may wait before serving
const tokens = new TokenService(config.jwtSecret, config.tokenTtl);
const auth = new AuthService(store.users, tokens, log);
const tasks = new TaskService(store.tasks, log);
const app = createApp({ tasks, auth, tokens, log });

app.listen(config.port, (error) => {
  if (error) throw error;
  log.info({ port: config.port, env: config.env, store: store.kind }, 'tasks API listening');
});
