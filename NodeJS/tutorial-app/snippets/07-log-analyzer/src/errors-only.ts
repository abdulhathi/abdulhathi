import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { LineSplitter } from './line-splitter.ts';
import { parseLine } from './parse.ts';

const source = process.argv[2] ?? 'logs/access.log';
const target = 'logs/errors.log';
let kept = 0;

// An async generator works as a transform step: it receives the previous
// step's output as an async iterable, and whatever it yields flows on.
async function* serverErrorsOnly(lines: AsyncIterable<string>): AsyncGenerator<string> {
  for await (const line of lines) {
    const entry = parseLine(line);
    if (entry && entry.status >= 500) {
      kept++;
      yield `${entry.time} ${entry.method} ${entry.path} failed after ${entry.ms} ms\n`;
    }
  }
}

await pipeline(createReadStream(source), new LineSplitter(), serverErrorsOnly, createWriteStream(target));
console.log(`kept ${kept.toLocaleString('en-GB')} server errors in ${target}`);
