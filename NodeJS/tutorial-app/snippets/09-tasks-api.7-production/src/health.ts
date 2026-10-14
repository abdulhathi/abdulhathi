import { Router } from 'express';

/** Shared, mutable state: set shuttingDown when the process starts to stop. */
export type Lifecycle = { shuttingDown: boolean };

const timeout = (ms: number) =>
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms).unref());

/** Probes for load balancers and orchestrators. */
export function healthRouter(lifecycle: Lifecycle, ping: () => Promise<void>): Router {
  const router = Router();

  // Liveness: the process is running and its event loop answers. It checks no
  // dependencies, so a database outage does not get every instance restarted.
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Readiness: should traffic be sent here right now?
  router.get('/ready', async (_req, res) => {
    if (lifecycle.shuttingDown) {
      res.status(503).json({ status: 'shutting_down' });
      return;
    }
    try {
      await Promise.race([ping(), timeout(1000)]);
      res.json({ status: 'ready' });
    } catch {
      res.status(503).json({ status: 'unavailable', reason: 'database' });
    }
  });

  return router;
}
