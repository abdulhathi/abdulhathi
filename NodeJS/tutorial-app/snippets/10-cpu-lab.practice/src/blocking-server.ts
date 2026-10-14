import http from 'node:http';
import { fib } from './fib.ts';
import { readN } from './params.ts';

const PORT = 3150;

const server = http.createServer((req, res) => {
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
    const value = fib(n); // runs on the main thread: nothing else can happen until it returns
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ n, value, ms: Math.round(performance.now() - started) }) + '\n');
    return;
  }

  res.writeHead(404).end('not found\n');
});

server.listen(PORT, () => console.log(`Blocking server on http://localhost:${PORT}`));
