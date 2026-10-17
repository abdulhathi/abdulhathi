// The hub's small API, served by its own Vite dev server under /api:
//   GET  /api/status            which apps are up, and which the hub started
//   GET  /api/pages             every app's page list, read from the apps' source
//   GET  /api/apps/:id/logs     the tail of an app's output (apps the hub started)
//   POST /api/apps/:id/start    start one app (and anything it requires)
//   POST /api/apps/:id/stop     stop one app the hub started
//   POST /api/start-all | /api/stop-all
// POSTs must come from the hub's own page: they need the X-Study-Hub header and a matching Origin.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { APPS } from '../src/apps';
import { allPages } from './pages';
import { ProcessManager } from './processes';

type Options = { portfolio: string; stateDir: string };

function send(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function fromHubPage(req: IncomingMessage) {
  if (req.headers['x-study-hub'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches may omit it
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function createHandler({ portfolio, stateDir }: Options) {
  const pm = new ProcessManager(APPS, portfolio, stateDir);
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://hub');
    const path = url.pathname.replace(/\/+$/, '');
    try {
      if (req.method === 'GET' && path === '/status') return send(res, 200, await pm.status());
      if (req.method === 'GET' && path === '/pages') return send(res, 200, allPages(APPS, portfolio));
      const logs = path.match(/^\/apps\/([a-z0-9-]+)\/logs$/);
      if (req.method === 'GET' && logs) return send(res, 200, pm.logs(logs[1]));

      if (req.method === 'POST') {
        if (!fromHubPage(req)) return send(res, 403, { ok: false, message: 'Requests must come from the Study Hub page.' });
        const act = path.match(/^\/apps\/([a-z0-9-]+)\/(start|stop)$/);
        if (act) {
          const result = act[2] === 'start' ? await pm.start(act[1]) : await pm.stop(act[1]);
          return send(res, result.ok ? 200 : 409, result);
        }
        if (path === '/start-all') return send(res, 200, await pm.startAll());
        if (path === '/stop-all') return send(res, 200, await pm.stopAll());
      }
      next();
    } catch (e) {
      send(res, 500, { ok: false, message: e instanceof Error ? e.message : String(e) });
    }
  };
}

export function hubApi(options: Options): Plugin {
  const handler = createHandler(options);
  return {
    name: 'study-hub-api',
    configureServer(server) {
      server.middlewares.use('/api', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api', handler);
    },
  };
}
