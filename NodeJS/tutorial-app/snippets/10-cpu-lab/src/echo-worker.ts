import { parentPort } from 'node:worker_threads';

// Replies with the size of whatever buffer it receives.
parentPort?.on('message', (buffer: ArrayBuffer) => parentPort?.postMessage(buffer.byteLength));
