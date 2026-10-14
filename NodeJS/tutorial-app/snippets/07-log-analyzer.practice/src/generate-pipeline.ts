import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { seededRandom } from './random.ts';

const lineCount = Number(process.argv[2] ?? 1_000_000);
const file = 'logs/access.log';
const random = seededRandom(42);
const ROUTES = [
  { method: 'GET', path: '/api/tasks', weight: 40, ms: 25 },
  { method: 'GET', path: '/api/tasks/42', weight: 20, ms: 15 },
  { method: 'GET', path: '/health', weight: 15, ms: 2 },
  { method: 'POST', path: '/api/tasks', weight: 10, ms: 40 },
  { method: 'POST', path: '/api/login', weight: 8, ms: 120 },
  { method: 'GET', path: '/static/app.js', weight: 5, ms: 5 },
  { method: 'GET', path: '/api/reports/export', weight: 2, ms: 900 },
];
const totalWeight = ROUTES.reduce((sum, route) => sum + route.weight, 0);

function pickRoute() {
  let ticket = random() * totalWeight;
  for (const route of ROUTES) {
    ticket -= route.weight;
    if (ticket < 0) return route;
  }
  return ROUTES[0]!;
}

// A generator produces lines only when asked. Readable.from() asks only as fast
// as the file can absorb them, so there is no write()/drain code at all.
function* logLines(): Generator<string> {
  let time = Date.UTC(2026, 9, 11, 9, 0, 0);
  for (let i = 0; i < lineCount; i++) {
    time += Math.floor(random() * 200);
    const route = pickRoute();
    const roll = random();
    const status = roll < 0.004 ? 500 : roll < 0.03 ? 404 : route.method === 'POST' ? 201 : 200;
    const slowTail = random() < 0.02 ? random() * 2000 : 0;
    const ms = Math.round(route.ms * (0.5 + random()) + slowTail);
    yield `${new Date(time).toISOString()} ${route.method} ${route.path} ${status} ${ms}\n`;
  }
}

await mkdir('logs', { recursive: true });
const started = performance.now();
await pipeline(Readable.from(logLines()), createWriteStream(file));

const { size } = await stat(file);
const seconds = ((performance.now() - started) / 1000).toFixed(2);
console.log(`wrote ${lineCount.toLocaleString('en-GB')} lines (${(size / 1024 / 1024).toFixed(1)} MB) in ${seconds} s`);
console.log(`peak memory: ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
