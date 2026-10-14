import { isMainThread, threadId, Worker } from 'node:worker_threads';

type FibResult = { threadId: number; n: number; value: number };

function runFib(n: number): Promise<FibResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./fib-worker.ts', import.meta.url), { workerData: { n } });
    worker.once('message', resolve);
    worker.once('error', reject); // an exception thrown inside the worker
    worker.once('exit', (code) => {
      if (code !== 0) reject(new Error(`worker stopped with exit code ${code}`));
    });
  });
}

console.log(`main: isMainThread=${isMainThread}, threadId=${threadId}`);

// Count timer callbacks to prove the main thread stays free while the workers compute.
let ticks = 0;
const ticker = setInterval(() => ticks++, 10);

let started = performance.now();
const results = await Promise.all([40, 40, 40, 40].map(runFib));
console.log(results);
console.log(`4 × fib(40) in 4 workers: ${Math.round(performance.now() - started)} ms, main thread ticked ${ticks} times`);

ticks = 0;
started = performance.now();
const { fib } = await import('./fib.ts');
for (let i = 0; i < 4; i++) fib(40);
console.log(`4 × fib(40) on the main thread: ${Math.round(performance.now() - started)} ms, main thread ticked ${ticks} times`);
clearInterval(ticker);

try {
  await runFib(-1);
} catch (error) {
  console.log(`worker failed: ${(error as Error).name}: ${(error as Error).message}`);
}
