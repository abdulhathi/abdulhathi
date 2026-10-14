import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';

// Run once per mode, so each measurement is a fresh process.
const mode = process.argv[2];
const file = 'logs/access.log';
let lines = 0;

if (mode === 'readfile') {
  const text = await readFile(file, 'utf8'); // the whole file as one string
  lines = text.split('\n').length - 1;
} else if (mode === 'stream') {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const _line of rl) lines++; // one line in memory at a time
} else {
  console.error('usage: node src/memory.ts readfile|stream');
  process.exit(1);
}

const peakMb = Math.round(process.resourceUsage().maxRSS / 1024);
console.log(`${mode.padEnd(8)} ${lines.toLocaleString('en-GB')} lines, peak memory ${peakMb} MB`);
