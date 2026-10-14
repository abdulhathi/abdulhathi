import { readFile } from 'node:fs';

// Everything runs inside an I/O callback, where the order is fully deterministic.
// Predict the output before you run it.
readFile(import.meta.filename, () => {
  console.log('sync: start of the I/O callback');

  setTimeout(() => console.log('setTimeout 0'), 0);

  setImmediate(() => {
    console.log('setImmediate');
    process.nextTick(() => console.log('nextTick queued by setImmediate'));
  });

  Promise.resolve().then(() => {
    console.log('promise.then');
    process.nextTick(() => console.log('nextTick queued by promise.then'));
  });

  queueMicrotask(() => console.log('queueMicrotask'));

  process.nextTick(() => console.log('nextTick'));

  console.log('sync: end of the I/O callback');
});
