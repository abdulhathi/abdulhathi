import { createReadStream, createWriteStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

const source = process.argv[2] ?? 'logs/access.log';
const target = `${source}.gz`;
const started = performance.now();

try {
  // pipeline() connects the streams, handles backpressure, and on any error
  // destroys every stream in the chain and rejects.
  await pipeline(createReadStream(source), createGzip(), createWriteStream(target));

  const before = (await stat(source)).size;
  const after = (await stat(target)).size;
  const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  const ms = Math.round(performance.now() - started);
  console.log(`${source} ${mb(before)} -> ${target} ${mb(after)} (${((after / before) * 100).toFixed(1)}%) in ${ms} ms`);
} catch (error) {
  await rm(target, { force: true }); // do not leave a half-written file behind
  console.error(`compression failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
