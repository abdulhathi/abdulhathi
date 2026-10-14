import { parentPort, threadId, workerData } from 'node:worker_threads';
import { fib } from './fib.ts';

// This file runs on its own thread, with its own event loop and its own copy of every module.
const { n } = workerData as { n: number };
if (n < 0) throw new RangeError(`n must be 0 or more, got ${n}`);

parentPort?.postMessage({ threadId, n, value: fib(n) });
