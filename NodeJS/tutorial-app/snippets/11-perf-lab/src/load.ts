import { createHistogram } from 'node:perf_hooks';

// Usage: node src/load.ts <url> [seconds=5] [connections=20] [--unique]
// --unique adds &t=<n> to every request, like clients that add cache-busting parameters.
const args = process.argv.slice(2);
const unique = args.includes('--unique');
const [targetArg, secondsArg = '5', connectionsArg = '20'] = args.filter((arg) => !arg.startsWith('--'));
if (!targetArg) {
  console.error('usage: node src/load.ts <url> [seconds] [connections] [--unique]');
  process.exit(1);
}
const target = targetArg; // a new const keeps the narrowed type (string) inside functions below
const seconds = Number(secondsArg);
const connections = Number(connectionsArg);

const latency = createHistogram(); // records whole numbers: we store microseconds
let ok = 0;
let failed = 0;
let counter = 0;
const run = Date.now().toString(36); // so a second run does not repeat the first run's URLs
const deadline = performance.now() + seconds * 1000;

// Each "connection" sends one request at a time, as fast as the server answers.
async function client() {
  while (performance.now() < deadline) {
    const url = unique ? `${target}${target.includes('?') ? '&' : '?'}t=${run}-${counter++}` : target;
    const started = performance.now();
    try {
      const res = await fetch(url);
      await res.arrayBuffer();
      if (res.ok) ok++;
      else failed++;
    } catch {
      failed++;
    }
    latency.record(Math.max(1, Math.round((performance.now() - started) * 1000)));
  }
}

await Promise.all(Array.from({ length: connections }, client));

const ms = (us: number) => (us / 1000).toFixed(1);
console.log(`${ok} requests in ${seconds} s = ${Math.round(ok / seconds)} req/s, ${failed} failed`);
console.log(`latency p50 ${ms(latency.percentile(50))} ms · p99 ${ms(latency.percentile(99))} ms · max ${ms(latency.max)} ms`);
