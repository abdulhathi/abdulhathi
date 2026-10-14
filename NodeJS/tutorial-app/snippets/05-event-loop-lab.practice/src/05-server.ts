import http from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';

function busyFor(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until); // CPU work: the thread can do nothing else
}

const server = http.createServer(async (req, res) => {
  const started = performance.now();
  if (req.url === '/block') busyFor(1000); // computing on the main thread
  if (req.url === '/wait') await sleep(1000); // waiting, which costs the thread nothing
  res.end(`${req.url} took ${Math.round(performance.now() - started)} ms inside the server\n`);
});

server.listen(3050, () => console.log('Listening on http://localhost:3050 (Ctrl+C to stop)'));
