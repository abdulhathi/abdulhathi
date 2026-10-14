import { setTimeout as sleep } from 'node:timers/promises';
import { mapLimit } from './lib/map-limit.ts';
import { since } from './lib/timing.ts';

let active = 0;
let peak = 0;

async function download(file: string): Promise<string> {
  active += 1;
  peak = Math.max(peak, active);
  await sleep(200);
  active -= 1;
  return `${file}.done`;
}

const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}`);

let start = performance.now();
await Promise.all(files.map(download));
console.log(`no limit: peak ${peak} at once, ${since(start)}`);

peak = 0;
start = performance.now();
const results = await mapLimit(files, 3, download);
console.log(`limit 3:  peak ${peak} at once, ${since(start)}`);
console.log('results in input order:', results.slice(0, 4).join(', '), '…');
