import { setTimeout as sleep } from 'node:timers/promises';
import { since } from './lib/timing.ts';

const succeed = (value: string, ms: number) => sleep(ms, value);
const fail = async (message: string, ms: number): Promise<string> => {
  await sleep(ms);
  throw new Error(message);
};

let start = performance.now();
console.log('all:       ', await Promise.all([succeed('a', 100), succeed('b', 200)]), since(start));

start = performance.now();
try {
  await Promise.all([succeed('a', 100), fail('b broke', 150), succeed('c', 400)]);
} catch (err) {
  // Rejects as soon as one input rejects; it does not wait for 'c'.
  console.log('all (one fails):', (err as Error).message, since(start));
}

start = performance.now();
const settled = await Promise.allSettled([succeed('a', 100), fail('b broke', 150)]);
console.log('allSettled:', settled.map((r) => (r.status === 'fulfilled' ? `ok ${r.value}` : `failed ${r.reason.message}`)), since(start));

start = performance.now();
console.log('race:      ', await Promise.race([succeed('slow', 300), succeed('fast', 100)]), since(start));

start = performance.now();
console.log('any:       ', await Promise.any([fail('x', 50), succeed('first success', 200)]), since(start));

try {
  await Promise.any([fail('x', 50), fail('y', 100)]);
} catch (err) {
  // When every input rejects, any() rejects with an AggregateError holding all the reasons.
  const agg = err as AggregateError;
  console.log('any (all fail):', agg.name, agg.errors.map((e: Error) => e.message));
}
