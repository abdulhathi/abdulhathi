import type { Server } from 'node:http';
import type { Lifecycle } from './health.ts';
import type { Logger } from './logger.ts';

type ShutdownOptions = {
  server: Server;
  lifecycle: Lifecycle;
  log: Logger;
  timeoutMs: number; // how long in-flight requests get before their connections are cut
  onClose: () => Promise<void>; // release resources, such as the database pool
};

/**
 * Returns a function that stops the server gracefully: no new connections,
 * let running requests finish, then close the database. Calling it again
 * returns the same promise, so a second signal cannot start a second shutdown.
 */
export function gracefulShutdown({ server, lifecycle, log, timeoutMs, onClose }: ShutdownOptions) {
  let shutdown: Promise<void> | undefined;

  return (reason: string): Promise<void> => {
    shutdown ??= (async () => {
      lifecycle.shuttingDown = true; // /ready answers 503 from now on
      log.info({ reason, timeoutMs }, 'shutting down');

      const force = setTimeout(() => {
        log.warn('requests still running at the deadline, closing their connections');
        server.closeAllConnections();
      }, timeoutMs).unref();

      // Stop accepting connections. The callback runs once every open connection has ended.
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      // close() only ends keep-alive connections that are idle right now. A connection
      // whose request finishes later would stay open until its keep-alive timeout,
      // so keep closing idle connections until the server has stopped.
      const sweep = setInterval(() => server.closeIdleConnections(), 100);
      await closed;
      clearInterval(sweep);
      clearTimeout(force);

      await onClose(); // last: the requests that just finished needed the database
      log.info('shutdown complete');
    })();
    return shutdown;
  };
}
