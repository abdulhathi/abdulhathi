import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { parseLine } from './parse.ts';

const file = process.argv[2] ?? 'logs/access.log';
const started = performance.now();

const statuses = new Map<number, number>();
const paths = new Map<string, number>();
const latencies: number[] = [];
let lines = 0;
let unreadable = 0;

// .gz files are decompressed on the fly: pipe() returns the gunzip stream.
const raw = createReadStream(file);
const input: Readable = file.endsWith('.gz') ? raw.pipe(createGunzip()) : raw;
raw.on('error', (error) => input.destroy(error)); // pipe() does not forward errors
const rl = createInterface({ input, crlfDelay: Infinity });

for await (const line of rl) {
  lines++;
  const entry = parseLine(line);
  if (!entry) {
    unreadable++;
    continue;
  }
  statuses.set(entry.status, (statuses.get(entry.status) ?? 0) + 1);
  paths.set(entry.path, (paths.get(entry.path) ?? 0) + 1);
  latencies.push(entry.ms);
}

latencies.sort((a, b) => a - b);
const percentile = (p: number) => latencies[Math.ceil((p / 100) * latencies.length) - 1] ?? 0;
const share = (count: number) => `${((count / lines) * 100).toFixed(1)}%`.padStart(6);
const fmt = (n: number) => n.toLocaleString('en-GB').padStart(9);

console.log(`${file}: ${lines.toLocaleString('en-GB')} lines, ${unreadable} unreadable\n`);

console.log('status     count  share');
for (const [status, count] of [...statuses].sort((a, b) => a[0] - b[0])) {
  console.log(`${status}    ${fmt(count)} ${share(count)}`);
}

console.log('\ntop paths');
const top = [...paths].sort((a, b) => b[1] - a[1]).slice(0, 5);
for (const [path, count] of top) console.log(`${path.padEnd(22)}${fmt(count)} ${share(count)}`);

console.log(`\nlatency  p50 ${percentile(50)} ms · p95 ${percentile(95)} ms · p99 ${percentile(99)} ms · max ${latencies.at(-1)} ms`);
const seconds = ((performance.now() - started) / 1000).toFixed(2);
console.log(`took ${seconds} s, peak memory ${Math.round(process.resourceUsage().maxRSS / 1024)} MB`);
