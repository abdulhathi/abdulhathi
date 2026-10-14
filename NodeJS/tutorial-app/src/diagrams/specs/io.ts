import { e, n } from './helpers';
import type { DiagramSpec } from '../geometry';

export const emitterFanout: DiagramSpec = {
  width: 860, height: 250,
  title: "job-queue.ts calls emit('done', job, ms). The EventEmitter calls the three done listeners one after another, in the order they were added, and emit returns only after the last one has finished.",
  legend: { app: 'Your code', core: 'EventEmitter' },
  nodes: [
    n('caller', 'app', 110, 125, 'job-queue.ts', { sub: 'CALLS this.emit()' }),
    n('emitter', 'core', 380, 125, "emit('done', job, ms)", { sub: 'EVENTEMITTER', shape: 'hex' }),
    n('l1', 'app', 705, 45, 'log line', { sub: 'LISTENER 1' }),
    n('l2', 'app', 705, 125, 'totals.done++', { sub: 'LISTENER 2' }),
    n('l3', 'app', 705, 205, 'waitForJob()', { sub: 'LISTENER 3' }),
  ],
  edges: [
    e('caller', 'emitter', { oa: -16, ob: -16, label: 'call' }),
    e('emitter', 'caller', { kind: 'reply', sa: 'l', sb: 'r', oa: 16, ob: 16, label: 'returns true' }),
    e('emitter', 'l1', { label: '1st' }),
    e('emitter', 'l2', { label: '2nd' }),
    e('emitter', 'l3', { label: '3rd' }),
  ],
};

export const backpressure: DiagramSpec = {
  width: 720, height: 225,
  title: 'A gzip pipeline: createReadStream reads access.log in chunks, createGzip compresses them, createWriteStream writes access.log.gz. When the writable side is full, the pipeline pauses the readable side until the buffer drains.',
  legend: { core: 'Stream', store: 'File' },
  nodes: [
    n('src', 'store', 90, 55, 'access.log', { sub: 'FILE ON DISK' }),
    n('read', 'core', 320, 55, 'createReadStream', { sub: 'READABLE' }),
    n('gzip', 'core', 590, 55, 'createGzip()', { sub: 'TRANSFORM' }),
    n('write', 'core', 590, 170, 'createWriteStream', { sub: 'WRITABLE' }),
    n('dst', 'store', 320, 170, 'access.log.gz', { sub: 'FILE ON DISK' }),
  ],
  edges: [
    e('src', 'read', { label: 'bytes' }),
    e('read', 'gzip', { label: '64 KiB chunks' }),
    e('gzip', 'write', { sa: 'b', sb: 't', label: 'compressed' }),
    e('write', 'dst'),
    e('write', 'read', { kind: 'reply', sa: 't', sb: 'b', oa: -40, pts: [[550, 112], [320, 112]], label: 'buffer full: pause until drain' }),
  ],
};

export const httpFlow: DiagramSpec = {
  width: 1000, height: 270,
  title: "A request to the raw HTTP API: the client sends a request; http.Server emits 'request' with req and res; the router matches method and path; the handler reads or writes the bookmarks Map and ends the response. Anything thrown goes to sendError, which turns it into a JSON error response.",
  legend: { os: 'Client', core: 'node:http', app: 'Your code', store: 'Data', error: 'Error handling' },
  nodes: [
    n('client', 'os', 90, 110, 'curl / fetch', { sub: 'CLIENT', shape: 'pill' }),
    n('server', 'core', 300, 110, 'http.Server', { sub: "'request' EVENT" }),
    n('router', 'app', 545, 110, 'route(method, path)', { sub: 'ROUTER', shape: 'hex' }),
    n('handler', 'app', 815, 110, 'createBookmark()', { sub: 'HANDLER' }),
    n('store', 'store', 870, 225, 'bookmarks Map', { sub: 'IN MEMORY' }),
    n('err', 'error', 545, 225, 'sendError()', { sub: 'ONE PLACE FOR ERRORS' }),
  ],
  edges: [
    e('client', 'server', { label: 'request' }),
    e('server', 'router', { label: 'req, res' }),
    e('router', 'handler', { label: 'match' }),
    e('handler', 'store', { sa: 'b', sb: 't', label: 'read / write' }),
    e('router', 'err', { kind: 'error', sa: 'b', sb: 't', label: '404 / 405' }),
    e('handler', 'err', { kind: 'error', sa: 'b', sb: 'r', oa: -55, label: 'throw' }),
    e('handler', 'client', { kind: 'reply', sa: 't', sb: 't', pts: [[815, 35], [90, 35]], label: 'res.end(JSON)' }),
    e('err', 'client', { kind: 'reply', sa: 'l', sb: 'b', pts: [[90, 225]], label: 'JSON error' }),
  ],
};
