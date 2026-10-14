import { createReadStream, createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';
import { Progress } from './progress.ts';

const source = process.argv[2] ?? 'logs/access.log';
const target = `${source}.gz`;

try {
  const { size } = await stat(source);
  await pipeline(createReadStream(source), new Progress(size), createGzip(), createWriteStream(target));
  console.log(`done: ${target}`);
} catch (error) {
  await rm(target, { force: true });
  console.error(`compression failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
