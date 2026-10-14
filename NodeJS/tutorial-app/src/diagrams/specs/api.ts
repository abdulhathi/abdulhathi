import { e, n } from './helpers';
import type { DiagramSpec } from '../geometry';

export const middlewarePipeline: DiagramSpec = {
  width: 960, height: 265,
  title: 'An Express request passes through requestLog, express.json() and the /tasks router to a route handler, which sends the response. No matching route goes to notFound; a thrown error or rejected promise, including invalid JSON from express.json(), skips ahead to errorHandler.',
  legend: { os: 'Client', core: 'Express built-ins', app: 'Your code', error: 'Error path' },
  nodes: [
    n('client', 'os', 72, 70, 'client', { sub: 'CURL · BROWSER', shape: 'pill' }),
    n('log', 'app', 258, 70, 'requestLog', { sub: 'MIDDLEWARE' }),
    n('json', 'core', 451, 70, 'express.json()', { sub: 'BUILT-IN' }),
    n('router', 'core', 662, 70, '/tasks router', { sub: 'EXPRESS ROUTER', shape: 'hex' }),
    n('handler', 'app', 869, 70, 'route handler', { sub: 'ASYNC · ZOD' }),
    n('notfound', 'error', 662, 180, 'notFound', { sub: 'NO ROUTE MATCHED' }),
    n('errors', 'error', 869, 180, 'errorHandler', { sub: 'ONE PLACE FOR ERRORS' }),
  ],
  edges: [
    e('client', 'log', { label: 'request' }),
    e('log', 'json', { label: 'next()' }),
    e('json', 'router', { label: 'next()' }),
    e('router', 'handler', { label: 'match' }),
    e('router', 'notfound', { sa: 'b', sb: 't', label: 'no match' }),
    e('handler', 'errors', { kind: 'error', sa: 'b', sb: 't', label: 'throw · reject' }),
    e('json', 'errors', { kind: 'error', sa: 'b', sb: 'b', pts: [[451, 240], [869, 240]], label: 'invalid JSON → next(err)' }),
    e('handler', 'client', { kind: 'reply', sa: 't', sb: 't', pts: [[869, 18], [72, 18]], label: 'res.status(201).json(task)' }),
  ],
};

export const apiLayers: DiagramSpec = {
  width: 920, height: 280,
  title: 'routes.ts calls service.ts, which awaits the TaskRepository interface. Three classes implement it: InMemoryTaskRepository in chapter 11, SqliteTaskRepository in chapter 12 and PgTaskRepository in chapter 18.',
  legend: { app: 'Your code', store: 'Storage implementations' },
  nodes: [
    n('routes', 'app', 130, 60, 'routes.ts', { sub: 'HTTP: PARSE INPUT, STATUS CODES' }),
    n('service', 'app', 450, 60, 'service.ts', { sub: 'RULES: 404 · 409 · 422' }),
    n('repo', 'app', 790, 60, 'TaskRepository', { sub: 'INTERFACE, EVERY METHOD ASYNC' }),
    n('memory', 'store', 150, 215, 'InMemoryTaskRepository', { sub: 'CHAPTER 11 · TESTS' }),
    n('sqlite', 'store', 460, 215, 'SqliteTaskRepository', { sub: 'CHAPTER 12' }),
    n('pg', 'store', 790, 215, 'PgTaskRepository', { sub: 'CHAPTER 18' }),
  ],
  edges: [
    e('routes', 'service', { label: 'calls' }),
    e('service', 'repo', { label: 'awaits' }),
    // One shared "bus" below the interface, branching down to each implementation.
    e('repo', 'memory', { kind: 'reply', sa: 'b', sb: 't', pts: [[790, 140], [150, 140]] }),
    // Labelled on the later edge, so no path is drawn over the pill.
    e('repo', 'sqlite', { kind: 'reply', sa: 'b', sb: 't', pts: [[790, 140], [460, 140]], label: 'implements', lpos: [625, 140] }),
    e('repo', 'pg', { kind: 'reply', sa: 'b', sb: 't' }),
  ],
};

export const testPyramid: DiagramSpec = {
  width: 760, height: 215,
  title: 'The test pyramid for the tasks API: a few HTTP tests against a real server at the top, repository contract tests against real storage in the middle, and many fast service unit tests at the base.',
  legend: { os: 'Whole app over HTTP', store: 'Real storage', app: 'Pure logic, no I/O' },
  nodes: [
    n('http', 'os', 380, 40, 'app.test.ts', { sub: 'FEWER · REAL SERVER ON PORT 0 · ~5 MS EACH', w: 330 }),
    n('contract', 'store', 380, 107, 'repository-contract.ts', { sub: 'SAME RULES FOR EVERY STORE · :MEMORY: SQLITE', w: 500 }),
    n('unit', 'app', 380, 174, 'service.test.ts', { sub: 'MANY · NO I/O · WELL UNDER 1 MS EACH', w: 680 }),
  ],
  edges: [],
};

export const requestContextFlow: DiagramSpec = {
  width: 940, height: 215,
  title: 'requestContext stores a request id with AsyncLocalStorage and calls next(). The route and service await their work; whenever they log, pino’s mixin reads the id back with storage.getStore() and adds it to the JSON line written to stdout. The response carries the same id in an x-request-id header.',
  legend: { os: 'Outside the process', app: 'Your code', core: 'Logger' },
  nodes: [
    n('client', 'os', 70, 70, 'client', { sub: 'X-REQUEST-ID?', shape: 'pill' }),
    n('ctx', 'app', 303, 70, 'requestContext', { sub: 'STORAGE.RUN({ REQUESTID })' }),
    n('route', 'app', 556, 70, 'route → service', { sub: 'AWAIT · AWAIT · AWAIT' }),
    n('log', 'core', 556, 170, 'pino mixin()', { sub: 'ADDS REQUESTID TO EVERY LINE' }),
    n('out', 'os', 820, 170, 'stdout', { sub: 'ONE JSON LINE PER EVENT' }),
  ],
  edges: [
    e('client', 'ctx', { label: 'request' }),
    e('ctx', 'route', { label: 'next()' }),
    e('route', 'log', { sa: 'b', sb: 't', label: 'log.info(…)' }),
    e('log', 'out'),
    e('log', 'ctx', { kind: 'loop', sa: 'l', sb: 'b', label: 'storage.getStore()' }),
    e('route', 'client', { kind: 'reply', sa: 't', sb: 't', pts: [[556, 18], [70, 18]], label: '201 + x-request-id' }),
  ],
};

export const jwtFlow: DiagramSpec = {
  width: 940, height: 260,
  title: 'Logging in: the client sends email and password to POST /auth/login, which checks the scrypt hash in the users table and returns a signed JWT. Using the API: the client sends the token as a Bearer header; requireAuth verifies the signature and expiry, puts the user id in res.locals, and the tasks routes query only that user’s rows.',
  legend: { os: 'Client', app: 'Your code', store: 'Database tables' },
  nodes: [
    n('client', 'os', 80, 130, 'client', { sub: 'KEEPS THE TOKEN', shape: 'pill' }),
    n('login', 'app', 310, 60, 'POST /auth/login', { sub: 'CHECK PASSWORD, SIGN JWT' }),
    n('users', 'store', 600, 60, 'users', { sub: 'EMAIL + SCRYPT HASH' }),
    n('guard', 'app', 310, 205, 'requireAuth', { sub: 'VERIFY SIGNATURE + EXP' }),
    n('routes', 'app', 570, 205, 'tasks routes', { sub: 'RES.LOCALS.USERID' }),
    n('tasks', 'store', 830, 205, 'tasks', { sub: 'WHERE USER_ID = ?' }),
  ],
  edges: [
    e('client', 'login', { sa: 't', sb: 'l', label: '1 · email + password' }),
    e('login', 'users', { label: 'find + verify' }),
    e('login', 'client', { kind: 'reply', sa: 'b', sb: 'r', oa: -50, label: '2 · signed JWT' }),
    e('client', 'guard', { sa: 'b', sb: 'l', label: '3 · Bearer token' }),
    e('guard', 'routes', { label: 'next()' }),
    e('routes', 'tasks', { label: 'scoped query' }),
  ],
};

export const connectionMaths: DiagramSpec = {
  width: 860, height: 270,
  title: 'Three instances of the API each keep a pool of up to 10 connections to one PostgreSQL server whose max_connections is 100. Tools such as psql and migrations need connections too, so the pools together must stay well below the limit.',
  legend: { app: 'API instances', store: 'Database server', os: 'Other clients' },
  nodes: [
    n('i1', 'app', 150, 50, 'instance 1', { sub: 'POOL: MAX 10' }),
    n('i2', 'app', 150, 135, 'instance 2', { sub: 'POOL: MAX 10' }),
    n('i3', 'app', 150, 220, 'instance 3', { sub: 'POOL: MAX 10' }),
    n('pg', 'store', 650, 150, 'PostgreSQL', { sub: 'MAX_CONNECTIONS = 100' }),
    n('ops', 'os', 650, 45, 'psql · migrations · backups', { sub: 'LEAVE HEADROOM' }),
  ],
  edges: [
    e('i1', 'pg', { ob: -16, label: '≤ 10' }),
    e('i2', 'pg', { label: '≤ 10' }),
    e('i3', 'pg', { ob: 16, label: '≤ 10' }),
    e('ops', 'pg', { sa: 'b', sb: 't', label: 'a few' }),
  ],
};

export const shutdownSequence: DiagramSpec = {
  width: 970, height: 245,
  title: 'Graceful shutdown: SIGTERM arrives; /ready starts answering 503 so the load balancer stops sending traffic; server.close() refuses new connections; in-flight requests finish normally; then the database pool closes and the process exits with code 0. If requests are still running at the deadline, their connections are closed and shutdown continues.',
  legend: { os: 'Outside the process', app: 'Request handling', core: 'HTTP server', store: 'Database', error: 'Deadline path' },
  nodes: [
    n('signal', 'os', 85, 60, 'SIGTERM', { sub: 'FROM DOCKER OR K8S', shape: 'pill' }),
    n('ready', 'app', 290, 60, '/ready → 503', { sub: 'LOAD BALANCER STOPS SENDING' }),
    n('close', 'core', 500, 60, 'server.close()', { sub: 'NO NEW CONNECTIONS' }),
    n('drain', 'app', 720, 60, 'in-flight requests', { sub: 'FINISH NORMALLY' }),
    n('force', 'error', 500, 185, 'deadline reached', { sub: 'CLOSEALLCONNECTIONS()' }),
    n('db', 'store', 720, 185, 'store.close()', { sub: 'POOL.END()' }),
    n('exit', 'os', 890, 185, 'exit 0', { sub: 'CONTAINER STOPS', shape: 'pill' }),
  ],
  edges: [
    e('signal', 'ready'),
    e('ready', 'close'),
    e('close', 'drain', { label: 'wait' }),
    e('drain', 'db', { sa: 'b', sb: 't', label: 'all finished' }),
    e('close', 'force', { kind: 'error', sa: 'b', sb: 't', label: 'still busy?' }),
    e('force', 'db', { kind: 'error' }),
    e('db', 'exit'),
  ],
};
