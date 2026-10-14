import http from 'node:http';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { makeOrders } from './data.ts';
import { LruCache } from './lru.ts';
import { buildReport } from './report.ts';

const PORT = 3160;
const orders = makeOrders(10_000);

// Product pages, cached by product id only, and never more than 500 of them.
const cache = new LruCache<string, string>(500, 60_000);

const loopDelay = monitorEventLoopDelay({ resolution: 10 });
loopDelay.enable();

function productPage(id: string): string {
  const sold = orders.filter((order) => order.product === `product-${id}`);
  return JSON.stringify({ id, orders: sold.length, recent: sold.slice(0, 20) });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');

  if (url.pathname === '/debug/metrics') {
    const ms = (ns: number) => Math.round(ns / 1e5) / 10;
    const { rss, heapUsed } = process.memoryUsage();
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        loopDelayMs: { p50: ms(loopDelay.percentile(50)), p99: ms(loopDelay.percentile(99)), max: ms(loopDelay.max) },
        memoryMb: { rss: Math.round(rss / 1048576), heapUsed: Math.round(heapUsed / 1048576) },
        cacheEntries: cache.size,
      }) + '\n',
    );
    loopDelay.reset(); // each call reports the period since the previous one
    return;
  }

  if (url.pathname === '/report') {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(buildReport(orders)));
    return;
  }

  if (url.pathname === '/product') {
    const id = url.searchParams.get('id') ?? '1';
    let body = cache.get(id); // other query parameters no longer create new entries
    if (body === undefined) {
      body = productPage(id);
      cache.set(id, body);
    }
    res.setHeader('content-type', 'application/json');
    res.end(body);
    return;
  }

  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`perf-lab on http://localhost:${PORT}, pid ${process.pid}`));

// Print memory every 5 seconds. unref() lets the process exit even though the timer is active.
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).padStart(6);
setInterval(() => {
  const { rss, heapUsed, heapTotal } = process.memoryUsage();
  console.log(`rss ${mb(rss)} MB · heapUsed ${mb(heapUsed)} MB · heapTotal ${mb(heapTotal)} MB · cache ${cache.size}`);
}, 5000).unref();

// --cpu-prof writes its file only when the process exits normally. Ctrl+C (SIGINT) would
// kill it without writing anything, so turn SIGINT into a normal exit.
process.once('SIGINT', () => process.exit(0));
