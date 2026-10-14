import { parentPort } from 'node:worker_threads';
import { fib } from './fib.ts';
import type { Reply } from './pool.ts';

if (!parentPort) throw new Error('pool-worker.ts must run as a worker thread');
const port = parentPort;

// Stay alive and handle one task per message. Report task errors instead of throwing,
// so one bad input does not kill the thread.
port.on('message', (n: number) => {
  let reply: Reply<number>;
  try {
    if (!Number.isInteger(n) || n < 0) throw new RangeError(`n must be a whole number from 0, got ${n}`);
    reply = { ok: true, value: fib(n) };
  } catch (error) {
    reply = { ok: false, message: (error as Error).message };
  }
  port.postMessage(reply);
});
