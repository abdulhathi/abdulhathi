import { once } from 'node:events';
import { EventEmitter } from 'node:events';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

const wait = (ms: number, value: string) => sleep(ms, value);

console.log(await Promise.all([wait(30, 'a'), wait(10, 'b')])); // all, in order; rejects on first failure
console.log(await Promise.allSettled([wait(10, 'ok'), Promise.reject(new Error('no'))]).then((r) => r.map((x) => x.status)));
console.log(await Promise.race([wait(30, 'slow'), wait(10, 'fast')])); // first to settle
console.log(await Promise.any([Promise.reject(new Error('x')), wait(10, 'first success')])); // first to fulfil

// Give up after a deadline: many APIs accept an AbortSignal.
try {
  await sleep(1000, null, { signal: AbortSignal.timeout(50) });
} catch (error) {
  console.log((error as Error).name); // AbortError
}

// Turn an error-first callback API into a promise.
function legacy(n: number, cb: (err: Error | null, result?: number) => void) {
  setImmediate(() => cb(null, n * 2));
}
console.log(await promisify(legacy)(21));

// Wait for one event as a promise.
const emitter = new EventEmitter();
setTimeout(() => emitter.emit('ready', 42), 10);
const [value] = await once(emitter, 'ready');
console.log(value);

// Run in sequence when order matters; use Promise.all when it does not.
for (const ms of [10, 10]) await sleep(ms);
console.log('done');
