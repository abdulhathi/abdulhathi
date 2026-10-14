import http from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';

const RESOLUTION = 10;
const loopDelay = monitorEventLoopDelay({ resolution: RESOLUTION });
loopDelay.enable();

/** Lets the event loop run everything that is waiting, then continues. */
const yieldToLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

// The same 1000 ms of CPU work as /block in 05-server.ts, cut into 10 ms slices.
async function busyCooperatively(totalMs: number): Promise<void> {
  const end = performance.now() + totalMs;
  while (performance.now() < end) {
    const sliceEnd = Math.min(end, performance.now() + 10);
    while (performance.now() < sliceEnd);
    await yieldToLoop(); // other requests get their turn here
  }
}

const server = http.createServer(async (req, res) => {
  const started = performance.now();
  if (req.url === '/health') {
    const p99 = Math.max(0, loopDelay.percentile(99) / 1e6 - RESOLUTION);
    loopDelay.reset();
    res.writeHead(p99 > 100 ? 503 : 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ loopDelayP99Ms: Number(p99.toFixed(1)) }) + '\n');
    return;
  }
  if (req.url === '/block') await busyCooperatively(1000);
  if (req.url === '/hard') {
    const until = performance.now() + 1000; // the old, blocking way, for comparison
    while (performance.now() < until);
  }
  res.end(`${req.url} took ${Math.round(performance.now() - started)} ms inside the server\n`);
});

server.listen(3050, () => console.log('Listening on http://localhost:3050 (Ctrl+C to stop)'));
