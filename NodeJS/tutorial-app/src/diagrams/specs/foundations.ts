import { e, n } from './helpers';
import type { DiagramSpec } from '../geometry';

export const nodeArchitecture: DiagramSpec = {
  width: 900, height: 410,
  title: 'Node.js layers: your code calls the Node.js standard library; JavaScript runs on V8; I/O requests go to libuv, which asks the operating system and, when the work is done, has V8 run your callback.',
  legend: { app: 'Your code', core: 'Node.js standard library', engine: 'Runtime (C++)', os: 'Operating system' },
  nodes: [
    n('app', 'app', 450, 50, 'server.ts · cli.ts · worker.ts', { sub: 'YOUR CODE', w: 380 }),
    n('lib', 'core', 450, 145, 'node:fs  node:http  node:crypto  node:stream  …', { sub: 'STANDARD LIBRARY (JS + C++ BINDINGS)', w: 560 }),
    n('v8', 'engine', 235, 255, 'V8', { sub: 'COMPILES AND RUNS JAVASCRIPT', w: 270 }),
    n('uv', 'engine', 665, 255, 'libuv', { sub: 'EVENT LOOP + THREAD POOL', w: 270, shape: 'hex' }),
    n('os', 'os', 450, 365, 'kqueue (macOS) · epoll (Linux) · IOCP (Windows)', { sub: 'FILES · SOCKETS · TIMERS · DNS', w: 560 }),
  ],
  edges: [
    e('app', 'lib', { sa: 'b', sb: 't', label: 'import + call' }),
    e('lib', 'v8', { sa: 'b', sb: 't', oa: -150, label: 'all JS runs here' }),
    e('lib', 'uv', { sa: 'b', sb: 't', oa: 150, label: 'start I/O' }),
    e('uv', 'os', { sa: 'b', sb: 't', oa: -40, ob: 170, label: 'ask the OS' }),
    e('os', 'uv', { kind: 'reply', sa: 't', sb: 'b', oa: 250, ob: 40, label: 'done' }),
    e('uv', 'v8', { kind: 'loop', sa: 'l', sb: 'r', label: 'run your callback' }),
  ],
};

export const typescriptFlow: DiagramSpec = {
  width: 900, height: 215,
  title: 'Two separate jobs: node runs index.ts by stripping the types and executing the JavaScript on V8; tsc --noEmit only reads the same file and reports type errors.',
  legend: { app: 'Your code', core: 'Node.js', engine: 'Runtime', os: 'Developer tools' },
  nodes: [
    n('src', 'app', 110, 105, 'src/index.ts', { sub: 'TYPESCRIPT' }),
    n('node', 'core', 400, 50, 'node src/index.ts', { sub: 'STRIPS TYPES, NO CHECKING' }),
    n('v8', 'engine', 735, 50, 'V8', { sub: 'RUNS THE JAVASCRIPT' }),
    n('tsc', 'os', 400, 165, 'tsc --noEmit', { sub: 'CHECKS TYPES, WRITES NOTHING' }),
    n('report', 'os', 735, 165, 'type errors', { sub: 'IN YOUR TERMINAL AND EDITOR' }),
  ],
  edges: [
    e('src', 'node', { label: 'run' }),
    e('node', 'v8'),
    e('src', 'tsc', { label: 'check' }),
    e('tsc', 'report'),
  ],
};
