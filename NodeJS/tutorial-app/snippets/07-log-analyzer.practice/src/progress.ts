import { Transform, type TransformCallback } from 'node:stream';

/** Passes bytes through unchanged and reports progress every 25%. */
export class Progress extends Transform {
  #total: number;
  #seen = 0;
  #nextReport = 25;

  constructor(totalBytes: number) {
    super();
    this.#total = totalBytes;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.#seen += chunk.length;
    const percent = (this.#seen / this.#total) * 100;
    while (percent >= this.#nextReport) {
      console.log(`  ${this.#nextReport}% read`);
      this.#nextReport += 25;
    }
    done(null, chunk); // same as this.push(chunk); done()
  }
}
