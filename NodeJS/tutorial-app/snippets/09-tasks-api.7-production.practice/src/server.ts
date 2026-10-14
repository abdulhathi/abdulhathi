import { createApp } from './app.ts';
import { AuthService } from './auth/service.ts';
import { TokenService } from './auth/tokens.ts';
import { loadConfig } from './config.ts';
import { openStore } from './db/store.ts';
import type { Lifecycle } from './health.ts';
import { createLogger } from './logger.ts';
import { gracefulShutdown } from './shutdown.ts';
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
const lifecycle: Lifecycle = { shuttingDown: false };
const app = createApp({ tasks, auth, tokens, log, lifecycle, ping: store.ping });

const server = app.listen(config.port, (error) => {
  if (error) throw error;
  log.info({ port: config.port, env: config.env, store: store.kind }, 'tasks API listening');
});

const shutdown = gracefulShutdown({ server, lifecycle, log, timeoutMs: config.shutdownTimeoutMs, onClose: store.close });

// SIGTERM: what Docker, Kubernetes and systemd send to stop a process. SIGINT: Ctrl+C.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    shutdown(signal).then(
      () => process.exit(0),
      (err: unknown) => {
        log.fatal({ err }, 'shutdown failed');
        process.exit(1);
      },
    );
  });
}
