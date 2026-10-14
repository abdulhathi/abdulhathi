import { once } from 'node:events';
import http from 'node:http';

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/echo') {
    let body = '';
    for await (const chunk of req) body += chunk; // the request is a readable stream
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ received: JSON.parse(body) }));
    return;
  }
  res.writeHead(404).end();
});
server.listen(0); // 0 = any free port: ideal for tests
await once(server, 'listening');
const { port } = server.address() as { port: number };

// fetch is built in. It rejects only on network errors: check res.ok for HTTP errors.
const res = await fetch(`http://localhost:${port}/echo`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ hello: 'world' }),
  signal: AbortSignal.timeout(5000), // always set a timeout on outgoing calls
});
console.log(res.status, res.ok, await res.json());

const missing = await fetch(`http://localhost:${port}/nope`);
console.log(missing.status, missing.ok);
server.close();
