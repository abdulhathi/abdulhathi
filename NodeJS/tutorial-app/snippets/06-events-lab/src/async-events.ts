import { EventEmitter, on, once } from 'node:events';

const sensor = new EventEmitter<{ ready: []; reading: [celsius: number] }>();

// 1. once() turns the next occurrence of an event into a promise.
setTimeout(() => sensor.emit('ready'), 100);
await once(sensor, 'ready');
console.log('sensor ready');

// 2. Give up after 200 ms: aborting the signal rejects the promise with an AbortError.
const giveUp = new AbortController();
setTimeout(() => giveUp.abort(), 200);
try {
  await once(sensor, 'ready', { signal: giveUp.signal });
} catch (error) {
  console.log(`gave up waiting: ${(error as Error).name}`);
}

// 3. on() turns a stream of events into an async iterator.
const stop = new AbortController();
let celsius = 20;
const timer = setInterval(() => sensor.emit('reading', celsius++), 50);
setTimeout(() => stop.abort(), 280);

try {
  for await (const [value] of on(sensor, 'reading', { signal: stop.signal })) {
    console.log(`reading ${value} °C`);
  }
} catch (error) {
  if ((error as Error).name !== 'AbortError') throw error;
  console.log('stopped listening');
} finally {
  clearInterval(timer);
}
console.log(`listeners left: ${sensor.listenerCount('reading')}`);
