import { EventEmitter } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

// A typed emitter: event name → argument list.
const bus = new EventEmitter<{ saved: [id: number]; error: [Error] }>();
bus.on('saved', (id) => console.log('saved', id));
bus.on('error', (err) => console.log('handled:', err.message)); // without this, an 'error' event throws
bus.emit('saved', 7);
bus.emit('error', new Error('disk full'));

// Stream: source → transform → destination, with backpressure and error handling done for you.
const upper = new Transform({
  transform(chunk: Buffer, _encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  },
});
const out = path.join(os.tmpdir(), 'cheat-sheet.txt.gz');
await pipeline(Readable.from(['hello ', 'streams\n']), upper, createGzip(), createWriteStream(out));

// Read a stream with for await.
let bytes = 0;
for await (const chunk of createReadStream(out)) bytes += (chunk as Buffer).length;
console.log(`gzipped file: ${bytes} bytes`);
await unlink(out);

console.log(Buffer.from('héllo').length, Buffer.from('hi').toString('base64'), Buffer.from('aGk=', 'base64').toString());
