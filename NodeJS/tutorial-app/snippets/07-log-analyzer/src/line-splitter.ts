import { Transform, type TransformCallback } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';

/**
 * Bytes in, lines out. The writable side takes Buffers; the readable side
 * is in object mode and pushes one string per line, without the newline.
 */
export class LineSplitter extends Transform {
  #decoder = new StringDecoder('utf8'); // keeps split multi-byte characters intact
  #rest = ''; // a line that has started but not yet ended

  constructor() {
    super({ readableObjectMode: true });
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    const lines = (this.#rest + this.#decoder.write(chunk)).split('\n');
    this.#rest = lines.pop() ?? '';
    for (const line of lines) this.push(line);
    done();
  }

  _flush(done: TransformCallback): void {
    const last = this.#rest + this.#decoder.end();
    if (last) this.push(last);
    done();
  }
}
