import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { openDatabase } from './db/database.ts';
import { createLogger } from './logger.ts';
import { SqliteTaskRepository } from './tasks/sqlite-repository.ts';
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

const db = openDatabase(config.dbFile);
const tasks = new TaskService(new SqliteTaskRepository(db), log);
const app = createApp({ tasks, log });

app.listen(config.port, (error) => {
  if (error) throw error;
  log.info({ port: config.port, env: config.env, dbFile: config.dbFile }, 'tasks API listening');
});
