import http from 'node:http';
import { readN } from './params.ts';
import { WorkerPool } from './pool.ts';

const PORT = 3151;
const pool = new WorkerPool<number, number>(new URL('./pool-worker.ts', import.meta.url));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/ping') {
    res.end('pong\n');
    return;
  }

  if (url.pathname === '/fib') {
    const n = readN(url);
    if (n === null) {
      res.writeHead(400).end('n must be a whole number from 0 to 45\n');
      return;
    }
    const started = performance.now();
    try {
      const value = await pool.run(n); // the main thread is free while a worker computes
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ n, value, ms: Math.round(performance.now() - started) }) + '\n');
    } catch (error) {
      res.writeHead(500).end(`${(error as Error).message}\n`);
    }
    return;
  }

  res.writeHead(404).end('not found\n');
});

server.listen(PORT, () => console.log(`Pooled server on http://localhost:${PORT} with ${pool.size} workers`));

process.once('SIGINT', async () => {
  console.log(`\nShutting down after ${pool.running} running and ${pool.queued} queued task(s)`);
  server.close();
  await pool.close();
  console.log('All workers stopped');
});
