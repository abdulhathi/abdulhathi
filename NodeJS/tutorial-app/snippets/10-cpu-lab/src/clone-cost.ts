import { once } from 'node:events';
import { Worker } from 'node:worker_threads';

const worker = new Worker(new URL('./echo-worker.ts', import.meta.url));
const buffer = new ArrayBuffer(256 * 1024 * 1024); // 256 MB

async function send(label: string, transfer: ArrayBuffer[]) {
  const started = performance.now();
  worker.postMessage(buffer, transfer);
  const [received] = await once(worker, 'message');
  const ms = (performance.now() - started).toFixed(1);
  console.log(`${label}: worker got ${received} bytes in ${ms} ms; main thread now has ${buffer.byteLength} bytes`);
}

await send('copy    ', []); // structured clone: every byte is copied
await send('transfer', [buffer]); // ownership moves: nothing is copied, the buffer is detached here
await worker.terminate();
