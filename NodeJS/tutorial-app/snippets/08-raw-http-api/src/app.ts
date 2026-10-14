import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { HttpError } from './http-error.ts';
import { readJson, sendJson } from './http-utils.ts';
import { BookmarkStore } from './store.ts';
import { parseNewBookmark } from './validate.ts';

type Params = Record<string, string>;
type Context = { req: IncomingMessage; res: ServerResponse; url: URL; params: Params; store: BookmarkStore };
type Route = { method: string; path: string; handler: (ctx: Context) => Promise<void> | void };

const routes: Route[] = [
  {
    method: 'GET',
    path: '/health',
    handler: ({ res }) => sendJson(res, 200, { status: 'ok' }),
  },
  {
    method: 'GET',
    path: '/bookmarks',
    handler: ({ res, url, store }) => sendJson(res, 200, store.list(url.searchParams.get('tag') ?? undefined)),
  },
  {
    method: 'POST',
    path: '/bookmarks',
    handler: async ({ req, res, store }) => {
      const bookmark = store.create(parseNewBookmark(await readJson(req)));
      sendJson(res, 201, bookmark, { Location: `/bookmarks/${bookmark.id}` });
    },
  },
  {
    method: 'GET',
    path: '/bookmarks/:id',
    handler: ({ res, params, store }) => {
      const bookmark = store.get(params.id!);
      if (!bookmark) throw new HttpError(404, `No bookmark with id ${params.id}`);
      sendJson(res, 200, bookmark);
    },
  },
  {
    method: 'DELETE',
    path: '/bookmarks/:id',
    handler: ({ res, params, store }) => {
      if (!store.delete(params.id!)) throw new HttpError(404, `No bookmark with id ${params.id}`);
      res.writeHead(204).end(); // success, and nothing to send back
    },
  },
];

/** Matches '/bookmarks/:id' against '/bookmarks/abc' and returns { id: 'abc' }, or undefined. */
function matchPath(pattern: string, pathname: string): Params | undefined {
  const want = pattern.split('/');
  const got = pathname.split('/');
  if (want.length !== got.length) return undefined;
  const params: Params = {};
  for (const [i, segment] of want.entries()) {
    const actual = got[i]!;
    if (segment.startsWith(':')) {
      try {
        params[segment.slice(1)] = decodeURIComponent(actual);
      } catch {
        throw new HttpError(400, 'Malformed URL'); // e.g. a stray % sign
      }
    } else if (segment !== actual) {
      return undefined;
    }
  }
  return params;
}

async function dispatch(req: IncomingMessage, res: ServerResponse, store: BookmarkStore): Promise<void> {
  // req.url holds only the path and query string, so give URL a base to parse against.
  const url = new URL(req.url ?? '/', 'http://localhost');
  const candidates = routes.flatMap((route) => {
    const params = matchPath(route.path, url.pathname);
    return params ? [{ route, params }] : [];
  });
  if (candidates.length === 0) throw new HttpError(404, `No route for ${url.pathname}`);

  const match = candidates.find(({ route }) => route.method === req.method);
  if (!match) {
    const allow = candidates.map(({ route }) => route.method).join(', ');
    throw new HttpError(405, `${req.method} is not allowed on ${url.pathname}`, { headers: { Allow: allow } });
  }
  await match.route.handler({ req, res, url, params: match.params, store });
}

/** The one place that turns any error into an HTTP response. */
function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message, details: error.details }, error.headers);
    return;
  }
  console.error(error); // a bug: log everything, tell the client nothing
  if (res.headersSent) {
    res.destroy(); // too late for a clean error response
    return;
  }
  sendJson(res, 500, { error: 'Internal server error' });
}

export function createApp(store = new BookmarkStore()): Server {
  return createServer((req, res) => {
    const started = performance.now();
    res.on('finish', () => {
      const ms = (performance.now() - started).toFixed(1);
      console.log(`${req.method} ${req.url} -> ${res.statusCode} in ${ms} ms`);
    });
    dispatch(req, res, store).catch((error: unknown) => sendError(res, error));
  });
}
