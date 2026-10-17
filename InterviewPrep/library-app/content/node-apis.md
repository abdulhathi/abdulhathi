---
title: HTTP APIs with Node.js
goal: Build a JSON API with node:http and with Express 5, validate input and handle errors in one place, add authentication middleware, structure and log the service properly, and test it with node:test.
minutes: 60
---

Most Node.js jobs are API jobs, so this is where the hands-on questions land: what happens when a request hits a Node server, what a framework adds over `node:http`, how **Express middleware** works and in what order, how you **validate input** and return consistent errors, where **authentication** and **CORS** fit, how you **structure** a service so it stays testable, and how you **test** it. Interviewers also like the operational edges: body size limits, request ids in logs, and server timeouts that fight with a load balancer's.

Every `ts` block runs on Node 25 against real servers on port 0. The runtime basics are in [Node.js runtime, event loop and async](#/node-core); REST design itself (resources, status codes, pagination, idempotency) is in [API design](#/api-design), and the security details in [Identity and access](#/auth-identity) and [Web security](#/web-security).

## HTTP is text with a shape

An HTTP/1.1 request is a start line, headers, a blank line and an optional body; so is the response. Everything a framework does is built on reading and writing this.

```text
POST /v1/tasks HTTP/1.1                HTTP/1.1 201 Created
Host: api.example.com                  Content-Type: application/json
Content-Type: application/json         Location: /v1/tasks/42
Authorization: Bearer eyJhbGci...      Content-Length: 39
Content-Length: 24
                                       {"id":42,"title":"Ship it","done":false}
{"title":"Ship it"}
```

In `node:http`, the request is a **Readable stream** (the body arrives in chunks) and the response is a **Writable stream**. Nothing parses the body, routes the path or formats errors for you.

## A JSON API with node:http

Writing one small API without a framework shows exactly what Express and Fastify add: routing, body parsing with a size limit, JSON responses and error handling.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson(req: IncomingMessage, limit = 10_000): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Payload too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Malformed JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(json) });
  res.end(json);
}

const tasks = new Map<number, { id: number; title: string; done: boolean }>();
let nextId = 1;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const match = /^\/v1\/tasks(?:\/(\d+))?$/.exec(url.pathname);
    if (!match) throw new HttpError(404, 'Not found');
    const id = match[1] ? Number(match[1]) : undefined;

    if (req.method === 'POST' && id === undefined) {
      const body = (await readJson(req)) as { title?: unknown };
      if (typeof body.title !== 'string' || body.title.trim() === '') throw new HttpError(422, 'title is required');
      const task = { id: nextId++, title: body.title.trim(), done: false };
      tasks.set(task.id, task);
      res.setHeader('location', `/v1/tasks/${task.id}`);
      return send(res, 201, task);
    }
    if (req.method === 'GET' && id !== undefined) {
      const task = tasks.get(id);
      if (!task) throw new HttpError(404, 'Task not found');
      return send(res, 200, task);
    }
    if (req.method === 'GET') return send(res, 200, [...tasks.values()]);
    res.setHeader('allow', id === undefined ? 'GET, POST' : 'GET');
    throw new HttpError(405, 'Method not allowed');
  } catch (err) {
    const e = err instanceof HttpError ? err : new HttpError(500, 'Internal Server Error');
    if (e.status === 500) console.error(err);
    send(res, e.status, { error: e.message });
  }
});

server.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/tasks`;
const post = (body: string) => fetch(base, { method: 'POST', headers: { 'content-type': 'application/json' }, body });

const created = await post(JSON.stringify({ title: '  Ship it ' }));
assert.equal(created.status, 201);
assert.equal(created.headers.get('location'), '/v1/tasks/1');
assert.deepEqual(await created.json(), { id: 1, title: 'Ship it', done: false });
assert.equal((await fetch(`${base}/1`)).status, 200);
assert.equal((await fetch(`${base}/99`)).status, 404);
assert.equal((await post('{not json')).status, 400);
assert.equal((await post(JSON.stringify({ title: '' }))).status, 422);
assert.equal((await post(JSON.stringify({ title: 'x'.repeat(20_000) }))).status, 413);
const del = await fetch(`${base}/1`, { method: 'DELETE' });
assert.deepEqual([del.status, del.headers.get('allow')], [405, 'GET']);
server.close();
console.log('node:http API ok');
```

## Express 5: middleware is the one idea

An Express app is a **chain of middleware**. Each middleware gets `(req, res, next)` and either ends the response or calls `next()` to pass control on; **order matters**, because they run in the order you register them. Routers group routes and their middleware. Error-handling middleware has **four** parameters, `(err, req, res, next)`, and runs when anything earlier throws or calls `next(err)`.

```text
request ─► json parser ─► request id ─► auth ─► router: POST /v1/runs ─► handler ─► response
                                                  │ throws or next(err)
                                                  └──────────────► error middleware ─► problem+json response
```

**What changed in Express 5** (5.0 released in September 2024; the npm default since 5.1 in March 2025): rejected promises from `async` handlers now reach your error middleware automatically (no more `express-async-errors`); route paths use path-to-regexp 8, so wildcards must be named (`/*splat`, or `/{*splat}` to also match the root) and optional parts use braces (`/runs{/:id}`); `req.body` is `undefined` unless a body parser ran; `req.query` is a read-only getter; `express.urlencoded` defaults to `extended: false`; Node 18+ is required.

| | Express 5 | Fastify | NestJS |
|---|---|---|---|
| Style | Minimal, middleware chain | Plugins with encapsulation, lifecycle hooks | Opinionated: modules, controllers, providers, dependency injection, decorators |
| Validation | Bring your own (zod, express-validator) | Built in: JSON Schema per route (Ajv) | Pipes with class-validator, or zod |
| Serialisation | `res.json` (JSON.stringify) | Schema-based, faster | Depends on the adapter |
| Logging | Bring your own (pino) | pino built in | Built-in logger, pino via a module |
| Performance | Fine for most services | Noticeably higher throughput | Runs on Express or Fastify underneath |
| Choose when | Small service, team knows it, huge ecosystem | High-throughput, schema-first APIs | Large teams wanting consistent structure |

## A service done right: validation, errors, request ids

The edge of the service is where untrusted JSON becomes typed data. With **zod** the schema is both the runtime validator and the TypeScript type, so they cannot drift apart. Errors go out in one consistent format (RFC 9457 problem details), decided in one place.

```ts
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

const StartRun = z.object({
  agentId: z.string().min(1),
  input: z.string().min(1).max(10_000),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});
type StartRun = z.infer<typeof StartRun>;

class HttpError extends Error {
  readonly status: number;
  readonly title: string;
  readonly extra: Record<string, unknown>;
  constructor(status: number, title: string, extra: Record<string, unknown> = {}) {
    super(title);
    this.status = status;
    this.title = title;
    this.extra = extra;
  }
}

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  const id = req.get('x-request-id') ?? randomUUID();
  res.locals.requestId = id;
  res.set('x-request-id', id);
  next();
});

app.post('/v1/runs', async (req, res) => {
  const parsed = StartRun.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(422, 'Invalid request body', {
      errors: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  const run: StartRun & { id: string; status: string } = { ...parsed.data, id: randomUUID(), status: 'queued' };
  res.status(202).location(`/v1/runs/${run.id}`).json(run);
});

app.get('/v1/runs/:id', async (req) => {
  // Express 5 forwards this rejection to the error middleware below.
  throw new HttpError(404, 'Run not found', { runId: req.params.id });
});

// Error middleware has four parameters. One place decides the error format.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const parseError = (err as { type?: string }).type === 'entity.parse.failed';
  const e = err instanceof HttpError ? err : parseError ? new HttpError(400, 'Malformed JSON') : new HttpError(500, 'Internal Server Error');
  if (e.status >= 500) console.error({ requestId: res.locals.requestId, err });
  res
    .status(e.status)
    .type('application/problem+json')
    .json({ type: 'about:blank', title: e.title, status: e.status, instance: req.originalUrl, requestId: res.locals.requestId, ...e.extra });
});

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const json = { 'content-type': 'application/json' };

const ok = await fetch(`${base}/v1/runs`, { method: 'POST', headers: json, body: JSON.stringify({ agentId: 'a1', input: 'hi' }) });
assert.equal(ok.status, 202);
const body = (await ok.json()) as { priority: string; id: string };
assert.equal(body.priority, 'normal');
assert.equal(ok.headers.get('location'), `/v1/runs/${body.id}`);

const bad = await fetch(`${base}/v1/runs`, { method: 'POST', headers: json, body: JSON.stringify({ agentId: '' }) });
assert.equal(bad.status, 422);
assert.equal(bad.headers.get('content-type'), 'application/problem+json; charset=utf-8');
const problem = (await bad.json()) as { errors: { path: string }[] };
assert.deepEqual(problem.errors.map((x) => x.path).sort(), ['agentId', 'input']);

const malformed = await fetch(`${base}/v1/runs`, { method: 'POST', headers: json, body: '{oops' });
assert.equal(malformed.status, 400);

const missing = await fetch(`${base}/v1/runs/r9`, { headers: { 'x-request-id': 'req-1' } });
assert.equal(missing.status, 404);
assert.equal(((await missing.json()) as { requestId: string }).requestId, 'req-1');

server.close();
console.log('express service ok');
```

## Structure: thin routes, plain services

A service stays testable when HTTP concerns stay at the edge:

| Layer | Knows about | Example |
|---|---|---|
| **Routes / controllers** | HTTP: parse and validate input, call a service, map the result or error to a status code | `POST /v1/tasks` handler |
| **Services** | Business rules, no HTTP and no SQL | "a user may have at most 100 open tasks" |
| **Repositories** | Storage: SQL or an API client | `tasksRepo.insert(task)` |

Build the app in a function, `createApp({ tasksRepo, clock, logger })`, and pass dependencies in. Production wires the real database; tests pass an in-memory repository and a fake clock, and start the app on port 0. That is dependency injection without a framework.

## Authentication, authorisation and CORS

- **Authentication middleware** reads the `Authorization: Bearer <token>` header, verifies the token (signature, expiry, audience, issuer), and attaches the user to `res.locals` or `req`. Missing or invalid credentials: **401**. How JWTs and OAuth work is in [Identity and access](#/auth-identity).
- **Authorisation** checks what that user may do: a role check (`requireRole('admin')`) and, for each resource, ownership (a user can only read their own tasks). Authenticated but not allowed: **403**, or **404** to avoid revealing that someone else's resource exists.
- **CORS** is the browser asking your API whether a page from another origin may read the response. Configure the `cors` middleware with an explicit allow-list of origins (never `*` together with credentials), the methods and headers you accept, and remember the browser sends an `OPTIONS` preflight for non-simple requests. CORS protects users' browsers; it is not authentication. Details in [Web security](#/web-security).
- Add **rate limiting** at the gateway or with middleware backed by Redis, and security headers (for example with `helmet`).

## Testing an API with node:test

Node ships a test runner, `node:test`, with `describe`/`test`, hooks, `mock.fn`/`mock.method`, fake timers (`mock.timers`) and snapshots; run it with `node --test`. Start the app on port 0 in a `before` hook, call it with `fetch`, and close it in `after`. Jest, Vitest and Supertest work too; the principle is the same.

```ts
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { after, before, describe, test } from 'node:test';
import express from 'express';

type Task = { id: number; title: string; ownerId: string };
type TasksRepo = { listFor(ownerId: string): Promise<Task[]> };

// The app takes its dependencies, so a test can pass fakes.
function createApp(repo: TasksRepo) {
  const app = express();
  app.use((req, res, next) => {
    const user = req.get('x-test-user'); // in production, real authentication middleware sets this
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });
    res.locals.userId = user;
    next();
  });
  app.get('/v1/tasks', async (_req, res) => {
    res.json(await repo.listFor(res.locals.userId as string));
  });
  return app;
}

describe('GET /v1/tasks', () => {
  let server: Server;
  let base = '';
  const calls: string[] = [];
  const fakeRepo: TasksRepo = {
    async listFor(ownerId) {
      calls.push(ownerId);
      return [{ id: 1, title: 'Write tests', ownerId }];
    },
  };

  before(async () => {
    server = createApp(fakeRepo).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  after(() => server.close());

  test('returns only the caller\'s tasks', async () => {
    const res = await fetch(`${base}/v1/tasks`, { headers: { 'x-test-user': 'u7' } });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [{ id: 1, title: 'Write tests', ownerId: 'u7' }]);
    assert.deepEqual(calls, ['u7']);
  });

  test('rejects anonymous callers with 401', async () => {
    const res = await fetch(`${base}/v1/tasks`);
    assert.equal(res.status, 401);
  });
});
```

What to test: the happy path and the important failures per endpoint (validation 422, 401/403, 404, conflicts), through HTTP; business rules in services with plain unit tests; the database layer against a real database in integration tests. More on the test pyramid in [Testing](#/testing).

## Logs, request ids and context

Log **JSON to stdout**, one line per event, with a level, a message and the **request id**; a platform such as Cloud Logging, Datadog or Loki indexes the fields. **pino** is the usual logger: fast, JSON by default, with child loggers per request. **`AsyncLocalStorage`** (from `node:async_hooks`) carries request context through every `await` without passing it as an argument, and OpenTelemetry uses the same mechanism for the active trace span.

```ts
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

type Ctx = { requestId: string; tenant: string };
const context = new AsyncLocalStorage<Ctx>();
const lines: string[] = [];

function log(severity: 'INFO' | 'ERROR', message: string, fields: Record<string, unknown> = {}) {
  const ctx = context.getStore();
  lines.push(JSON.stringify({ severity, message, ...ctx, ...fields }));
}

async function loadRun(id: string) {
  await new Promise((r) => setTimeout(r, Math.random() * 10));
  log('INFO', 'run loaded', { runId: id }); // no request id passed in, yet it appears
}

// Two concurrent "requests" interleave, but each keeps its own context.
await Promise.all([
  context.run({ requestId: 'req-a', tenant: 't1' }, () => loadRun('r1')),
  context.run({ requestId: 'req-b', tenant: 't2' }, () => loadRun('r2')),
]);
const parsed = lines.map((l) => JSON.parse(l) as { requestId: string; runId: string; severity: string });
assert.equal(parsed.find((p) => p.runId === 'r1')?.requestId, 'req-a');
assert.equal(parsed.find((p) => p.runId === 'r2')?.requestId, 'req-b');
console.log(lines.join('\n'));
```

Never log secrets, tokens, passwords or personal data; redact them in the logger configuration.

## Server limits and timeouts

| Setting | Default | Why it matters |
|---|---|---|
| Body size limit | Express `json()`: 100 kb | Stops a huge body from exhausting memory; return 413 |
| `server.requestTimeout` | 300 s | Whole-request receive time; guards against slow-loris uploads |
| `server.headersTimeout` | 60 s | Time allowed to receive the headers |
| `server.keepAliveTimeout` | 5 s | How long an idle keep-alive socket stays open |

The classic production bug: if Node closes idle keep-alive sockets **sooner** than the load balancer in front of it, the balancer reuses a socket Node just closed and returns a 502. Set `keepAliveTimeout` longer than the balancer's idle timeout (and `headersTimeout` above that). Outbound calls need deadlines too; see [Node.js in production](#/node-production).

## Contracts and versioning

Describe the API in **OpenAPI**, either written first or generated from the code (zod schemas with a generator, or Fastify's JSON schemas), and publish it so front ends and partners can generate clients. Version in the URL (`/v1/`) for public APIs, add fields compatibly, and never change the meaning of an existing field. The design rules are in [API design](#/api-design).

## Interview questions

### What happens when an HTTP request reaches a Node.js server?

The operating system accepts the TCP connection and libuv notices data on the socket. Node's HTTP parser reads the request line and headers and emits a `request` event with a request object (a Readable stream for the body) and a response object (a Writable stream). My handler, or the framework's middleware chain, routes on method and path, reads and parses the body, does the work, mostly awaiting I/O, and writes the status, headers and body. Because everything is non-blocking, the same thread handles other requests while this one waits.

### What does a framework like Express add over `node:http`? {core}

`node:http` gives me a request stream and a response stream and nothing else. A framework adds routing with path parameters, a middleware chain for cross-cutting concerns (body parsing, authentication, logging, CORS), helpers such as `res.json` and `res.status`, centralised error handling, and an ecosystem of middleware. Writing a small API on `node:http` once is the best way to understand what those pieces do, and why body size limits and error formatting matter.

### How does Express middleware work, and why does order matter? {core}

Middleware are functions `(req, res, next)` run in the order they are registered. Each one either sends a response, which ends the chain, or calls `next()` to pass control to the next one; calling `next(err)` skips to the error-handling middleware, which has four parameters. Order matters because each step depends on earlier ones: the JSON parser must run before handlers read `req.body`, authentication before routes that need a user, and the error handler must come last.

### What changed in Express 5? {deep}

The headline is that errors thrown or rejected inside `async` handlers now reach the error-handling middleware automatically, so the `express-async-errors` workaround is gone. Route matching moved to path-to-regexp 8: wildcards must be named (`/*splat`, or `/{*splat}` to include the root) and optional segments use braces. `req.body` is `undefined` unless a body parser ran, `req.query` is read-only, `express.urlencoded` defaults to `extended: false`, some deprecated signatures were removed, and Node 18+ is required.

### Express, Fastify or NestJS: how do you choose? {core}

Express is minimal with the biggest ecosystem; Express 5 finally forwards async errors to the error middleware. Fastify gives higher throughput, JSON-schema validation and serialisation per route, built-in pino logging and plugin encapsulation, which suits a high-throughput, contract-first API. NestJS adds structure (modules, dependency injection, decorators) on top of either, which helps large teams stay consistent.

For a new high-throughput service I would lean towards Fastify, or NestJS on the Fastify adapter if several teams share the codebase. I would not rewrite a working Express service just for speed: the database and upstream APIs usually dominate latency.

### How do you handle errors in an Express API? {core}

I separate operational errors, such as bad input, a missing resource or a dependency timing out, from programmer errors, which are bugs. Handlers throw typed errors (`new HttpError(404, …)`), and one error middleware at the end maps them to a consistent response, such as RFC 9457 problem details with a request id, logging 5xx with the stack. Unknown errors become a 500 with no internal details in the body. In Express 5, async handlers' rejections reach that middleware automatically.

### How do you validate input and keep the API contract in TypeScript? {core}

Validate at the edge with a runtime schema, because TypeScript types disappear at runtime. With zod the schema is the validator and `z.infer` gives the type, so they cannot drift; Fastify does the same with JSON Schema. The same schemas can generate OpenAPI, and the front end can share them or a generated client. I return 422 (or 400, by team convention) with a field-level list of errors, and I validate responses from upstream services too, because a third-party API can return anything.

### Which status codes do you use for common API failures? {core}

400 for a request I cannot parse (malformed JSON), 422 for well-formed input that fails validation (many teams use 400 for both), 401 when the caller is not authenticated, 403 when they are authenticated but not allowed, 404 when the resource does not exist (or must not be revealed), 409 for a conflict such as a duplicate or a version mismatch, 413 for a body over the limit, 429 when rate-limited, and 500 for unexpected server errors, with 502, 503 and 504 for upstream problems. Successful creates return 201 with a `Location` header, and accepted async work returns 202.

### How would you add authentication to an Express API? {core}

As middleware: read the `Authorization: Bearer` header, verify the token's signature, expiry, issuer and audience (for example against the identity provider's JWKS), and attach the user and their roles to the request; reject with 401 if anything is missing or invalid. Authorisation comes next: a role check middleware for whole routes, and an ownership check inside handlers so a user can only touch their own resources, returning 403 or 404. For browser apps, an httpOnly session cookie through a backend-for-frontend avoids keeping tokens in JavaScript.

**Your angle:** at Quantiphi you implemented SAML-based authentication with Passport.js on Node.js for the Document AI platform.

### What is CORS, and how do you configure it?

CORS lets a server tell the browser which other origins may read its responses. For non-simple requests the browser first sends an `OPTIONS` preflight asking whether the method and headers are allowed. I configure it with the `cors` middleware and an explicit allow-list of origins, the methods and headers the front end uses, and `credentials: true` only with specific origins, never with `*`. It is a browser protection, not authentication: curl ignores it, so the API still checks every request.

### How do you structure a Node.js API so it stays maintainable and testable? {core}

Three layers: thin routes or controllers that handle HTTP and validation, services with the business rules and no HTTP or SQL, and repositories that talk to storage. I build the app in a function that receives its dependencies (repositories, clock, logger, config), so tests can pass fakes and production passes real implementations. Feature folders (`tasks/`, `users/`) scale better than folders per layer once the service grows.

### How do you test an Express or Fastify API? {core}

Most tests go through HTTP: start the app on port 0 in a `before` hook, call it with `fetch` or Supertest, and assert status, headers and body for the happy path and the important failures. Dependencies are injected, so tests use in-memory repositories or a real database in a container for integration tests. Business rules get fast unit tests on the services. With `node:test` I get `describe`/`test`, hooks, `mock.method`, fake timers and coverage without extra packages.

### How do you mock dependencies in Node tests?

Prefer dependency injection: pass a fake object into the code under test, which needs no mocking library and keeps tests honest. When I must replace something on an existing object, `mock.method(obj, 'name', impl)` from `node:test` (or `vi.spyOn` in Vitest) replaces and restores it. For time, fake timers (`mock.timers`) make retries and timeouts instant and deterministic. Mocking whole modules is a last resort, because it couples tests to the file structure.

### How do you carry a request id through async code? {deep}

With `AsyncLocalStorage` from `node:async_hooks`. Middleware calls `storage.run({ requestId }, next)`, and anything awaited inside it, however deep, can read `storage.getStore()`. The logger adds it to every line, and outbound calls forward it as a header such as `x-request-id`. OpenTelemetry uses the same mechanism to keep the active span, so logs and traces correlate.

### What should a production API log?

One structured JSON line per request with method, route, status, duration and request id, plus warnings and errors with context and stack traces, through a fast logger such as pino. Never secrets, tokens, passwords or personal data: redact them in the logger configuration. Log levels let me turn detail up without redeploying. Metrics (request rate, error rate, latency percentiles) and traces complement logs; logs answer "what happened to this request".

### How do you protect an API from very large or slow requests? {deep}

Limit the body size in the parser (Express `json({ limit })`) and return 413, cap headers and the time to receive a request (`headersTimeout`, `requestTimeout`), and stream large uploads straight to storage instead of buffering them. Put rate limiting in front of the service, and set timeouts on every outbound call so a slow dependency cannot tie up connections. A reverse proxy or API gateway usually adds limits too.

### Why can a Node service behind a load balancer return intermittent 502s? {deep}

A common cause is a keep-alive timeout mismatch. Node closes idle keep-alive sockets after `keepAliveTimeout` (5 seconds by default); if the load balancer keeps idle connections longer, it can send a request on a socket Node has just closed, and the balancer reports a 502. The fix is to set Node's `keepAliveTimeout` longer than the balancer's idle timeout, with `headersTimeout` a little longer still. Other causes are crashes, slow startup, and shutdowns that do not drain connections.

### How do you handle file uploads in Node?

Stream them. Use a multipart parser such as Busboy (or Multer, built on it, with care around memory storage), enforce size and type limits while streaming, and pipe the file straight to object storage or a temporary file instead of holding it in memory. Even better for large files: issue a signed upload URL so the browser uploads directly to Cloud Storage or S3, and the API only records metadata.

### How do you version and document a REST API in Node? {deep}

Document it with OpenAPI, generated from the code's schemas (zod with a generator, or Fastify's JSON schemas) or written first and used to generate types, and publish it with a UI such as Swagger UI. For versioning, a `/v1/` path prefix for breaking changes in public APIs, and compatible evolution otherwise: add fields, never remove or repurpose them, and deprecate with a header and a timeline.

### How do you add rate limiting to a Node API?

At the edge if possible (API gateway, load balancer or CDN), and in the app with middleware such as `express-rate-limit` backed by a shared store like Redis, so the limit holds across instances. Limit per user or API key, not just per IP. Return 429 with a `Retry-After` header. The token-bucket and sliding-window algorithms are in [Redis](#/redis) and [Practical Python tasks](#/code-python).

## Coding problems

### Read a JSON body with a size limit {medium core}

Write `readJson(req, limitBytes)` for a `node:http` request: it reads the body stream, rejects with a 413-style error as soon as the size passes the limit (without reading the rest into memory), rejects with a 400-style error for malformed JSON, and resolves with the parsed value. Also reject when `Content-Type` is not JSON.

#### Hints

1. The request is an async iterable of Buffer chunks.
2. Keep a running byte count and throw as soon as it passes the limit; do not wait for the end.
3. Parse once at the end, inside `try`/`catch`, and turn a `SyntaxError` into your 400 error.

#### Solution

Counting bytes as chunks arrive bounds memory by the limit. The content-type check happens before reading anything. Errors carry a status, so the server's catch block can map them directly.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readJson(req: IncomingMessage, limitBytes: number): Promise<unknown> {
  const type = req.headers['content-type'] ?? '';
  if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(type)) throw new HttpError(415, 'Expected application/json');
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limitBytes) throw new HttpError(413, 'Payload too large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limitBytes) throw new HttpError(413, 'Payload too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Malformed JSON');
  }
}

const server = createServer(async (req, res) => {
  try {
    const body = await readJson(req, 64);
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ received: body }));
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    res.writeHead(status, { connection: 'close' }).end(); // close: we may not have read the whole body
  }
});
server.listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const send = (body: string, type = 'application/json') => fetch(url, { method: 'POST', headers: { 'content-type': type }, body });

const ok = await send('{"a":1}');
assert.deepEqual([ok.status, await ok.json()], [200, { received: { a: 1 } }]);
assert.equal((await send('{"a":')).status, 400);
assert.equal((await send(JSON.stringify({ big: 'x'.repeat(500) }))).status, 413);
assert.equal((await send('{"a":1}', 'text/plain')).status, 415);
assert.equal((await send('{"ok":true}', 'application/merge-patch+json')).status, 200);
server.close();
console.log('readJson ok');
```

Complexity: O(n) in body size, with memory capped at the limit.

#### Follow-ups

- **Why also check `Content-Length`?** To reject early without reading anything; but it can be absent (chunked encoding) or wrong, so the running count is the real guard.
- **What does Express do here?** `express.json({ limit })` does the same: it checks the type, enforces the limit and passes a 413 or 400 error to your error middleware.

### Validation middleware with zod and problem details {medium core}

Write `validateBody(schema)`, an Express middleware factory that parses `req.body` with a zod schema. On success it replaces `req.body` with the parsed (defaulted, typed) data and calls `next()`. On failure it responds 422 with `application/problem+json` and a list of `{ path, message }` errors. Show it working on a `POST /v1/approvals` route.

#### Hints

1. The factory returns `(req, res, next) => { ... }`.
2. Use `schema.safeParse(req.body)` so you never throw for bad input.
3. Map `error.issues` to `{ path: issue.path.join('.'), message: issue.message }`.

#### Solution

The middleware is generic over the schema, so the handler sees clean data. Responding in the middleware keeps every route's error format identical.

```ts
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';

function validateBody(schema: z.ZodType): RequestHandler {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (result.success) {
      req.body = result.data;
      return next();
    }
    res
      .status(422)
      .type('application/problem+json')
      .json({
        type: 'about:blank',
        title: 'Invalid request body',
        status: 422,
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
  };
}

const Approval = z.object({
  runId: z.string().min(1),
  decision: z.enum(['approve', 'reject']),
  comment: z.string().max(500).optional(),
});

const app = express();
app.use(express.json());
app.post('/v1/approvals', validateBody(Approval), (req, res) => {
  const body = req.body as z.infer<typeof Approval>;
  res.status(201).json({ ...body, recordedBy: 'u1' });
});

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/approvals`;
const post = (body: unknown) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

const ok = await post({ runId: 'r1', decision: 'approve' });
assert.equal(ok.status, 201);
assert.equal(((await ok.json()) as { decision: string }).decision, 'approve');

const bad = await post({ runId: 'r1', decision: 'maybe' });
assert.equal(bad.status, 422);
const problem = (await bad.json()) as { errors: { path: string }[] };
assert.deepEqual(problem.errors.map((e) => e.path), ['decision']);

server.close();
console.log('validateBody ok');
```

Complexity: linear in the size of the body for parsing.

#### Follow-ups

- **How would you validate query strings and params?** The same factory for `req.query` and `req.params`, with `z.coerce.number()` for numeric strings. In Express 5 `req.query` is read-only, so store the parsed result in `res.locals` instead of overwriting it.
- **How do you share the schema with the front end?** Put schemas in a shared package (or generate OpenAPI from them), so the client's types and the server's validation come from one source.

### Authentication and role middleware {medium}

Write two Express middleware: `requireAuth(verify)`, which reads `Authorization: Bearer <token>`, calls an async `verify(token)` that returns `{ userId, roles }` or throws, stores the user in `res.locals.user`, and responds 401 (with a `WWW-Authenticate: Bearer` header) when the header is missing or the token is invalid; and `requireRole(role)`, which responds 403 unless the authenticated user has that role. Show both on an admin route.

#### Hints

1. Parse the header with a regular expression such as `/^Bearer (.+)$/i`; anything else is a 401.
2. `verify` is async: `await` it inside a `try`/`catch` and turn any failure into a 401.
3. `requireRole` runs after `requireAuth`, so it can read `res.locals.user`; it must not re-verify the token.

#### Solution

Keeping verification behind an injected function means the middleware works with any token scheme (JWT with JWKS, opaque tokens, a test stub), and tests need no real keys. The 401/403 split tells the client whether to re-authenticate or give up.

```ts
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { RequestHandler } from 'express';

type User = { userId: string; roles: string[] };

function requireAuth(verify: (token: string) => Promise<User>): RequestHandler {
  return async (req, res, next) => {
    const match = /^Bearer (.+)$/i.exec(req.get('authorization') ?? '');
    if (!match) {
      res.set('www-authenticate', 'Bearer').status(401).json({ error: 'Missing bearer token' });
      return;
    }
    try {
      res.locals.user = await verify(match[1]);
      next();
    } catch {
      res.set('www-authenticate', 'Bearer error="invalid_token"').status(401).json({ error: 'Invalid token' });
    }
  };
}

function requireRole(role: string): RequestHandler {
  return (_req, res, next) => {
    const user = res.locals.user as User | undefined;
    if (!user) return void res.status(401).json({ error: 'Unauthenticated' });
    if (!user.roles.includes(role)) return void res.status(403).json({ error: `Requires role ${role}` });
    next();
  };
}

// A stub verifier; production would check a JWT's signature, expiry, issuer and audience.
const tokens: Record<string, User> = { 'admin-token': { userId: 'u1', roles: ['admin'] }, 'user-token': { userId: 'u2', roles: [] } };
const verify = async (token: string) => {
  const user = tokens[token];
  if (!user) throw new Error('unknown token');
  return user;
};

const app = express();
app.get('/v1/admin/carriers', requireAuth(verify), requireRole('admin'), (_req, res) => {
  res.json({ carriers: ['FedEx', 'UPS'], by: (res.locals.user as User).userId });
});

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/admin/carriers`;
const call = (auth?: string) => fetch(url, auth ? { headers: { authorization: auth } } : {});

const anonymous = await call();
assert.deepEqual([anonymous.status, anonymous.headers.get('www-authenticate')], [401, 'Bearer']);
assert.equal((await call('Basic abc')).status, 401);
assert.equal((await call('Bearer forged')).status, 401);
assert.equal((await call('Bearer user-token')).status, 403);
const admin = await call('Bearer admin-token');
assert.deepEqual([admin.status, await admin.json()], [200, { carriers: ['FedEx', 'UPS'], by: 'u1' }]);
server.close();
console.log('auth middleware ok');
```

Complexity: O(1) per request, plus the cost of `verify`.

#### Follow-ups

- **Where do per-resource checks go?** In the handler or service: after loading the resource, check `resource.ownerId === user.userId` (or a permission), returning 403 or 404.
- **How do you verify a JWT properly?** Check the signature with the issuer's public key from its JWKS (allowing only the expected algorithm), then `exp`, `nbf`, `iss` and `aud`. See [Identity and access](#/auth-identity).

### Request-scoped context for logs {medium}

Build a tiny `withRequestContext(requestId, fn)` and a `logger.info(message, fields)` that automatically includes the request id of whichever request is running, even across `await`s and when requests interleave. Outside any request, the log line has no request id.

#### Hints

1. `AsyncLocalStorage` keeps a value per asynchronous call chain.
2. `storage.run(value, fn)` sets it for `fn` and everything it awaits.
3. `storage.getStore()` returns `undefined` outside a `run`.

#### Solution

The store follows the async chain, so concurrent requests never see each other's ids, and no function needs an extra parameter.

```ts
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage<{ requestId: string }>();
const sink: Record<string, unknown>[] = [];

const logger = {
  info(message: string, fields: Record<string, unknown> = {}) {
    sink.push({ severity: 'INFO', message, ...storage.getStore(), ...fields });
  },
};

function withRequestContext<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ requestId }, fn);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function handle(step: string, delay: number) {
  await sleep(delay);
  logger.info('step done', { step });
}

await Promise.all([withRequestContext('a', () => handle('one', 15)), withRequestContext('b', () => handle('two', 5))]);
logger.info('background tick');

assert.deepEqual(sink, [
  { severity: 'INFO', message: 'step done', requestId: 'b', step: 'two' },
  { severity: 'INFO', message: 'step done', requestId: 'a', step: 'one' },
  { severity: 'INFO', message: 'background tick' },
]);
console.log('context ok');
```

Complexity: O(1) per log call.

#### Follow-ups

- **How does this connect to tracing?** OpenTelemetry's context manager in Node is built on `AsyncLocalStorage`; put the trace id in the store (or read it from the active span) and add it to logs for correlation.
- **Any cost?** A small overhead per async operation; acceptable for request context, but do not store large objects in it.
