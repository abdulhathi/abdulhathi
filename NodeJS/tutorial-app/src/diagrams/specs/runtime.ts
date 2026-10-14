import { e, n } from './helpers';
import type { DiagramSpec } from '../geometry';

export const eventLoopPhases: DiagramSpec = {
  width: 980, height: 330,
  title: 'The event loop: after your script runs, Node cycles through the timers, pending callbacks, poll, check and close phases. Between every single callback in any phase, it empties the nextTick queue and then the promise microtask queue.',
  legend: { app: 'Your code', engine: 'Event loop phase', core: 'Runs between every callback' },
  nodes: [
    n('main', 'app', 95, 70, 'your script', { sub: 'RUNS FIRST' }),
    n('timers', 'engine', 340, 70, 'timers', { sub: 'setTimeout · setInterval' }),
    n('pending', 'engine', 600, 70, 'pending callbacks', { sub: 'SOME SYSTEM ERRORS' }),
    n('poll', 'engine', 860, 70, 'poll', { sub: 'I/O CALLBACKS · MAY WAIT' }),
    n('check', 'engine', 860, 270, 'check', { sub: 'setImmediate' }),
    n('close', 'engine', 340, 270, 'close callbacks', { sub: "socket.on('close')" }),
    n('micro', 'core', 600, 170, 'microtasks', { sub: 'nextTick QUEUE, THEN PROMISES', w: 230, shape: 'hex' }),
  ],
  edges: [
    e('main', 'timers', { label: 'then' }),
    e('timers', 'pending'),
    e('pending', 'poll'),
    e('poll', 'check', { sa: 'b', sb: 't' }),
    e('check', 'close', { sa: 'l', sb: 'r' }),
    e('close', 'timers', { kind: 'loop', sa: 't', sb: 'b', label: 'next turn' }),
  ],
};
