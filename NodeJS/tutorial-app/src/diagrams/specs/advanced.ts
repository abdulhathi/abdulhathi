import { e, n } from './helpers';
import type { DiagramSpec } from '../geometry';

export const workerPool: DiagramSpec = {
  width: 980, height: 320,
  title: 'A worker pool: the main thread accepts HTTP requests and puts CPU-heavy tasks in a queue; a fixed set of worker threads, each with its own V8 and event loop, takes tasks with postMessage and sends results back to the main thread, which answers the client.',
  legend: { os: 'Outside world', core: 'Main thread', store: 'Queue', engine: 'Worker threads' },
  nodes: [
    n('client', 'os', 80, 150, 'HTTP clients', { shape: 'pill' }),
    n('main', 'core', 320, 150, 'main thread', { sub: 'EVENT LOOP · ROUTING · I/O', shape: 'hex' }),
    n('queue', 'store', 590, 150, 'task queue', { sub: 'WAITING TASKS' }),
    n('w1', 'engine', 860, 60, 'worker 1', { sub: 'OWN V8 + EVENT LOOP' }),
    n('w2', 'engine', 860, 150, 'worker 2', { sub: 'OWN V8 + EVENT LOOP' }),
    n('w3', 'engine', 860, 240, 'worker 3', { sub: 'OWN V8 + EVENT LOOP' }),
  ],
  edges: [
    e('client', 'main', { oa: -10, ob: -10, label: 'request', lpos: [176, 126] }),
    e('main', 'client', { kind: 'reply', oa: 12, ob: 12, label: 'response', lpos: [176, 176] }),
    e('main', 'queue', { label: 'pool.run(n)' }),
    e('queue', 'w1', { label: 'postMessage' }),
    e('queue', 'w2'),
    e('queue', 'w3'),
    e('w3', 'main', { kind: 'reply', sa: 'b', sb: 'b', pts: [[860, 296], [320, 296]], label: 'result message' }),
  ],
};

export const perfLoop: DiagramSpec = {
  width: 940, height: 200,
  title: 'The performance loop: measure under load, profile to see where time or memory goes, find the cause, change one thing, then measure again.',
  legend: { os: 'Measuring tools', engine: 'Runtime diagnostics', app: 'You' },
  nodes: [
    n('measure', 'os', 105, 70, 'measure', { sub: 'LOAD TEST · HISTOGRAMS' }),
    n('profile', 'engine', 370, 70, 'profile', { sub: 'CPU PROFILE · HEAP SNAPSHOT' }),
    n('cause', 'app', 600, 70, 'find the cause', { sub: 'READ THE TOP ENTRIES' }),
    n('fix', 'app', 840, 70, 'change one thing', { sub: 'THE SMALLEST FIX' }),
  ],
  edges: [
    e('measure', 'profile', { label: 'too slow?' }),
    e('profile', 'cause'),
    e('cause', 'fix'),
    e('fix', 'measure', { kind: 'loop', sa: 'b', sb: 'b', pts: [[840, 160], [105, 160]], label: 'measure again, compare with the baseline' }),
  ],
};

export const v8Heap: DiagramSpec = {
  width: 820, height: 260,
  title: 'V8 heap generations: new objects go into new space; objects that survive two scavenges move to old space; the garbage collector frees objects that nothing references any more, in either space.',
  legend: { app: 'Your code', store: 'V8 heap', engine: 'Garbage collector' },
  nodes: [
    n('alloc', 'app', 80, 70, 'new object'),
    n('young', 'store', 330, 70, 'new space', { sub: 'YOUNG GENERATION' }),
    n('old', 'store', 620, 70, 'old space', { sub: 'OLD GENERATION' }),
    n('gc', 'engine', 475, 205, 'garbage collector', { sub: 'FREES UNREACHABLE OBJECTS' }),
  ],
  edges: [
    e('alloc', 'young', { label: 'allocate' }),
    e('young', 'old', { label: 'survives twice' }),
    e('young', 'gc', { kind: 'loop', sa: 'b', sb: 't', ob: -55, label: 'scavenge (fast, often)' }),
    e('old', 'gc', { kind: 'loop', sa: 'b', sb: 't', ob: 55, label: 'mark-compact (slower)' }),
  ],
};
