import { workerData } from 'node:worker_threads';

const { shared, times } = workerData as { shared: SharedArrayBuffer; times: number };
const counters = new Int32Array(shared); // a view onto memory every thread can see

for (let i = 0; i < times; i++) {
  counters[0] = (counters[0] ?? 0) + 1; // read, add, write: another thread can sneak in between
  Atomics.add(counters, 1, 1); // one indivisible step
}
