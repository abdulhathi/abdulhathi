import { once } from 'node:events';
import { Worker } from 'node:worker_threads';

const WORKERS = 4;
const TIMES = 1_000_000;

// Two 32-bit counters in memory shared by all threads. Nothing is copied when it is passed to a worker.
const shared = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT);
const counters = new Int32Array(shared);

const workers = Array.from(
  { length: WORKERS },
  () => new Worker(new URL('./counter-worker.ts', import.meta.url), { workerData: { shared, times: TIMES } }),
);
await Promise.all(workers.map((worker) => once(worker, 'exit')));

console.log(`expected      ${WORKERS * TIMES}`);
console.log(`plain + 1     ${counters[0]}`);
console.log(`Atomics.add   ${counters[1]}`);
