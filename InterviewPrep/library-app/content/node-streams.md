---
title: Buffers, streams and files
goal: Handle bytes and encodings correctly, process files far larger than memory with streams, pipeline and backpressure, and move CPU work or other programs off the event loop with worker threads and child processes.
minutes: 55
---

Streams are where Node's design pays off and where interviews separate people who have used Node in production from people who have read about it. The questions cover **Buffers and encodings** (why a split UTF-8 character turns into garbage), **reading big files** without loading them into memory, the **four stream types**, **backpressure** and **`pipeline`**, and the two ways off the main thread: **worker threads** for CPU work and **child processes** for other programs. Streaming also sits under real-time products: relaying an LLM's tokens to a browser is a stream with backpressure.

Every `ts` block runs on Node 25. Start with [Node.js runtime, event loop and async](#/node-core) if the event loop is new; the server side continues in [HTTP APIs with Node.js](#/node-apis).

## Bytes first: Buffers and encodings

A `Buffer` is a fixed-length sequence of bytes (a subclass of `Uint8Array`). Files, sockets and crypto all deal in bytes; text is bytes plus an **encoding**, almost always UTF-8. Three facts cause most bugs:

- **Characters are not bytes.** `'€'.length` is 1 (one UTF-16 code unit) but it is 3 bytes in UTF-8. Use `Buffer.byteLength(str)` for sizes, such as a `Content-Length` header.
- **A multi-byte character can be split across chunks.** Calling `chunk.toString()` on each network or file chunk corrupts a character that straddles two chunks. Decode with a streaming decoder (`new TextDecoder()` with `{ stream: true }`, or `readable.setEncoding('utf8')`), which holds the partial bytes until the rest arrives.
- **`Buffer.allocUnsafe(n)`** returns memory that may still hold old data; use `Buffer.alloc(n)` (zero-filled) unless you overwrite every byte immediately.

```ts
import assert from 'node:assert/strict';

const euro = Buffer.from('€');
assert.equal('€'.length, 1);
assert.equal(euro.length, 3); // bytes 0xE2 0x82 0xAC
assert.equal(Buffer.byteLength('héllo'), 6); // 'é' is two bytes

// Splitting a character across two chunks: naive toString() corrupts it, a streaming decoder does not.
const [a, b] = [euro.subarray(0, 2), euro.subarray(2)];
assert.equal(a.toString() + b.toString(), '\uFFFD\uFFFD'); // two replacement characters, data lost
const decoder = new TextDecoder();
assert.equal(decoder.decode(a, { stream: true }) + decoder.decode(b, { stream: true }), '€');

// Encodings for transport.
assert.equal(Buffer.from('hi').toString('base64'), 'aGk=');
assert.equal(Buffer.from('aGk=', 'base64').toString('utf8'), 'hi');
assert.equal(Buffer.from('ff00', 'hex').length, 2);
console.log('buffers ok');
```

## Files: three APIs, and when each fits

| API | Example | Use it when |
|---|---|---|
| Promise (`node:fs/promises`) | `await readFile(path, 'utf8')` | The default in application code |
| Callback (`node:fs`) | `readFile(path, cb)` | Older code; same work as the promise API |
| Sync (`readFileSync`) | `readFileSync(path)` | Only at startup or in CLI scripts: it blocks the event loop |

`readFile` loads the whole file into memory: fine for a config file, wrong for a 5 GB log. For large files use a **read stream** (`createReadStream`), which reads in chunks (64 KiB by default), or `readline` on top of it to go line by line. Build paths with `node:path` (`join`, `resolve`, `extname`) rather than string concatenation, so code works on Windows and POSIX. Never build a path from user input without checking the result stays inside an allowed directory (path traversal).

## Streams: four kinds

A stream moves data in chunks instead of buffering everything. Every stream is an `EventEmitter`.

| Kind | Reads or writes | Examples |
|---|---|---|
| `Readable` | Produces data | `fs.createReadStream`, an HTTP request on the server, `process.stdin` |
| `Writable` | Consumes data | `fs.createWriteStream`, an HTTP response on the server, `process.stdout` |
| `Duplex` | Both, independently | A TCP socket |
| `Transform` | A Duplex whose output is computed from its input | `zlib.createGzip()`, a CSV parser, an encryption stream |

Streams carry `Buffer`s or strings by default. In **object mode** they carry any JavaScript value, which is how you build pipelines of parsed records.

## Backpressure

**Backpressure** is how a slow consumer tells a fast producer to wait. Every stream has a buffer limit, `highWaterMark`: **64 KiB for byte streams** since Node 22 (16 KiB before), and **16 objects** in object mode. `writable.write(chunk)` returns `false` once the buffer is over the limit; a well-behaved producer stops and resumes on the `'drain'` event. `pipe()` and `pipeline()` do this for you. Ignoring that `false` is how a Node service runs out of memory when a client reads slowly, for example a browser on a bad network receiving an LLM stream.

```ts
import assert from 'node:assert/strict';
import { getDefaultHighWaterMark, Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

assert.equal(getDefaultHighWaterMark(false), 64 * 1024); // bytes
assert.equal(getDefaultHighWaterMark(true), 16); // objects

// write() returns false once the buffer passes highWaterMark: that is the backpressure signal.
const slow = new Writable({
  highWaterMark: 2,
  objectMode: true,
  write(_chunk, _enc, cb) {
    setTimeout(cb, 1);
  },
});
const accepted = [slow.write('a'), slow.write('b'), slow.write('c')];
assert.deepEqual(accepted, [true, false, false]);
await new Promise((r) => slow.once('drain', r));

// pipeline() wires backpressure, propagates errors and destroys every stream on failure.
const tokens = Readable.from(['Hel', 'lo', ' wor', 'ld']);
const upper = new Transform({
  objectMode: true,
  transform(chunk: string, _enc, cb) {
    cb(null, chunk.toUpperCase());
  },
});
const out: string[] = [];
await pipeline(
  tokens,
  upper,
  new Writable({
    objectMode: true,
    write(chunk: string, _enc, cb) {
      out.push(chunk);
      cb();
    },
  }),
);
assert.equal(out.join(''), 'HELLO WORLD');

// Readable streams are async iterables, which is often the simplest way to consume them.
let total = 0;
for await (const n of Readable.from([1, 2, 3])) total += n as number;
assert.equal(total, 6);
console.log('streams ok');
```

Prefer `pipeline` from `node:stream/promises` over `.pipe()`: `pipe` does not forward errors, so a failed upstream leaves the downstream open and leaks file descriptors or sockets. `pipeline` also accepts **async generator functions** as transforms, and a `signal` to cancel the whole chain.

## A real pipeline: gzip a file line by line

This is the shape of most stream code in production: read a file in chunks, transform it, compress it, write it, with constant memory whatever the file size.

```ts
import assert from 'node:assert/strict';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGunzip, createGzip, gunzipSync } from 'node:zlib';

const dir = await mkdtemp(join(tmpdir(), 'streams-'));
try {
  const input = join(dir, 'events.log');
  const output = join(dir, 'errors.log.gz');
  const lines = Array.from({ length: 5_000 }, (_, i) => `${i % 10 === 0 ? 'ERROR' : 'INFO'} event ${i}`);
  await writeFile(input, lines.join('\n') + '\n');

  // An async generator as a transform: split chunks into lines, keep only errors.
  async function* onlyErrors(source: AsyncIterable<Buffer>) {
    let tail = '';
    const decoder = new TextDecoder();
    for await (const chunk of source) {
      const parts = (tail + decoder.decode(chunk, { stream: true })).split('\n');
      tail = parts.pop() ?? '';
      for (const line of parts) if (line.startsWith('ERROR')) yield `${line}\n`;
    }
    if (tail.startsWith('ERROR')) yield `${tail}\n`;
  }

  await pipeline(createReadStream(input, { highWaterMark: 1024 }), onlyErrors, createGzip(), createWriteStream(output));

  const written = gunzipSync(await readFile(output)).toString().trimEnd().split('\n');
  assert.equal(written.length, 500);
  assert.equal(written[0], 'ERROR event 0');

  // The reverse direction streams too.
  const chunks: Buffer[] = [];
  await pipeline(createReadStream(output), createGunzip(), async function* (src: AsyncIterable<Buffer>) {
    for await (const c of src) chunks.push(c);
  });
  assert.equal(Buffer.concat(chunks).toString().split('\n')[1], 'ERROR event 10');
  console.log('gzip pipeline ok:', written.length, 'error lines');
} finally {
  await rm(dir, { recursive: true, force: true });
}
```

`node:zlib` streams gzip, deflate and Brotli, and Node 25 also has Zstandard (`zlib.createZstdCompress`). For line-by-line reading without writing the splitting yourself, `readline.createInterface({ input: stream, crlfDelay: Infinity })` is an async iterable of lines.

## Web streams

Node also implements the web-standard streams (`ReadableStream`, `WritableStream`, `TransformStream`), which is what `fetch` returns as `response.body`. Convert between the two worlds with `Readable.fromWeb(webStream)` and `Readable.toWeb(nodeStream)`. Use Node streams for Node APIs (files, sockets, zlib) and web streams when sharing code with browsers or edge runtimes.

## Off the main thread: workers and child processes

| Option | What it is | Use it for | Watch out for |
|---|---|---|---|
| **More instances** (containers, replicas) | Separate processes behind a load balancer | Scaling a stateless API: the default | Nothing shared in memory; state goes to Redis or a database |
| **`worker_threads`** | Threads with their own V8 isolate and event loop, in one process | CPU-heavy work that must stay in-process: parsing, image or PDF work, compression, hashing | Messages are copied (structured clone) unless you transfer `ArrayBuffer`s or use `SharedArrayBuffer`; use a pool (Piscina) |
| **`child_process`** | A separate OS process | Running another program (ffmpeg, git, a CLI) | Spawn cost; handle stdout, stderr, exit codes; never pass user input through a shell |
| **`cluster`** | One primary forks N Node workers sharing a port | Using all cores of one VM without an orchestrator | Mostly unnecessary in containers: one process per container, let the platform scale |

```ts
import assert from 'node:assert/strict';
import { MessageChannel, Worker } from 'node:worker_threads';

// CPU work on another thread: the main event loop stays responsive meanwhile.
const code = `
  const { parentPort, workerData } = require('node:worker_threads');
  const fib = (n) => (n < 2 ? n : fib(n - 1) + fib(n - 2));
  parentPort.postMessage(fib(workerData));
`;
let ticks = 0;
const ticker = setInterval(() => ticks++, 1);
const result = await new Promise<number>((resolve, reject) => {
  const worker = new Worker(code, { eval: true, workerData: 30 });
  worker.once('message', resolve);
  worker.once('error', reject);
});
clearInterval(ticker);
assert.equal(result, 832040);
assert.ok(ticks > 0, 'the main thread kept running timers while the worker computed');

// Transferring an ArrayBuffer moves it instead of copying: the sender's view becomes empty.
const bytes = new Uint8Array(1024).fill(7);
const { port1, port2 } = new MessageChannel();
const received = new Promise<Uint8Array>((resolve) => port2.once('message', resolve));
port1.postMessage(bytes, [bytes.buffer]);
assert.equal((await received).length, 1024);
assert.equal(bytes.byteLength, 0);
port1.close();
console.log('worker ok: fib(30) =', result, '| timer ticks meanwhile:', ticks);
```

For child processes:

| Function | Shell? | Output | Use it for |
|---|---|---|---|
| `spawn(cmd, args)` | No (unless `shell: true`) | Streams | Long-running programs, large output |
| `execFile(cmd, args)` | No | Buffered | Short commands with small output |
| `exec(commandString)` | **Yes** | Buffered | Avoid with any user input: shell injection |
| `fork(modulePath)` | No | IPC channel to a Node child | A Node child process you message with |

All of them accept `timeout`, `signal` and `env`; always check the exit code and stderr.

## Interview questions

### What is a Buffer, and how is it different from a string? {core}

A `Buffer` is raw bytes, a subclass of `Uint8Array`; a string is text. Files, sockets and crypto work in bytes, and converting between the two needs an encoding, almost always UTF-8. The difference matters for sizes and boundaries: `'€'` is one character but three bytes, so `Content-Length` must use `Buffer.byteLength`, and decoding chunk by chunk can split a character in half.

### Why can `chunk.toString()` corrupt text in a stream, and how do you fix it? {deep}

Chunks are cut at arbitrary byte positions, so a multi-byte UTF-8 character can start at the end of one chunk and finish in the next. Decoding each chunk on its own turns both halves into replacement characters. Use a streaming decoder that keeps the incomplete bytes for the next call: `new TextDecoder().decode(chunk, { stream: true })`, `string_decoder`, or `readable.setEncoding('utf8')`.

### `readFile` or `createReadStream`: how do you choose? {core}

`readFile` loads the whole file into memory and gives it to me at once: simple, fine for small files such as config or templates. `createReadStream` reads in chunks (64 KiB by default), so memory stays constant whatever the size, and I can start processing before the file is fully read. For anything that could be large, such as logs, exports or uploads, I stream; serving a large file over HTTP is `pipeline(createReadStream(path), res)`.

### How would you process a 10 GB log file in Node? {core}

Stream it. Open a read stream, split it into lines with `readline` (or my own splitter that keeps the partial last line), and process each line, aggregating counts as I go, so memory stays flat. I connect the pieces with `pipeline` so backpressure works and any error tears everything down. If the per-line work is CPU-heavy, I batch lines and send them to a worker pool, and if it must be faster still, split the file by byte ranges across workers.

### What are the four types of stream? {core}

`Readable` produces data (a file read stream, an incoming HTTP request), `Writable` consumes it (a file write stream, an HTTP response), `Duplex` does both independently (a TCP socket), and `Transform` is a Duplex whose output is computed from its input (gzip, a parser). All are EventEmitters; by default they carry Buffers or strings, and in object mode any value.

### What is backpressure, and how do Node streams handle it? {core}

Backpressure is the slow consumer telling the fast producer to wait, so data does not pile up in memory. In Node, `write()` returns `false` when the writable's buffer passes its `highWaterMark`; the producer should stop and resume on `'drain'`. `pipe()` and `stream.pipeline()` do this automatically, and `pipeline` also propagates errors and destroys every stream on failure.

It matters in streaming products: a service that relays tokens to a slow browser and ignores `res.write()` returning `false` buffers them in memory per connection, and thousands of such streams end in an out-of-memory crash.

### Why use `pipeline` instead of `.pipe()`? {core}

`.pipe()` handles backpressure but not errors: if the source fails, the destination is not closed, so file descriptors and sockets leak, and an `'error'` without a listener can crash the process. `pipeline` (from `node:stream/promises`) connects any number of streams with backpressure, forwards the first error, destroys every stream in the chain, returns a promise, accepts async generators as transforms, and takes a `signal` for cancellation.

### What is `highWaterMark`? {deep}

It is the buffer threshold at which a stream signals backpressure: for a Writable, `write()` returns `false` once that many bytes (or objects) are buffered; for a Readable, how much it reads ahead. The defaults are 64 KiB for byte streams since Node 22 (16 KiB before) and 16 objects in object mode. It is a threshold, not a hard cap: a producer that ignores `false` can still overfill the buffer.

### What is object mode? {deep}

In object mode a stream carries arbitrary JavaScript values instead of Buffers or strings, and `highWaterMark` counts objects instead of bytes. It is how you build record pipelines: a file read stream (bytes), a parser Transform (bytes in, objects out, so `readableObjectMode: true`), a validation Transform (objects), and a database-writing Writable (objects). Each stage gets backpressure for free.

### How do you write a custom Transform stream?

Either subclass `Transform`, or pass `transform(chunk, encoding, callback)` and optionally `flush(callback)` to its constructor. In `transform` I push zero or more outputs with `this.push(value)` and call `callback()` when done, or `callback(err)` to fail the stream; `flush` runs at the end of the input, for leftovers such as a final partial line. In modern code an async generator passed to `pipeline` is often simpler: `async function* (source) { for await (const chunk of source) yield transform(chunk); }`.

### How do streams handle errors and cleanup? {deep}

A stream reports failure by emitting `'error'`, and once destroyed it emits `'close'`; `stream.destroy(err)` tears it down. With `.pipe()` you have to listen for errors on every stream and destroy the others yourself; `pipeline` does it all and rejects with the first error. `stream.finished(stream)` (or its promise version) tells you when a stream has completely ended or failed, which is the safe point to release resources.

### What are web streams, and how do they relate to Node streams?

Web streams (`ReadableStream`, `WritableStream`, `TransformStream`) are the browser-standard API, implemented in Node, and they are what `fetch` gives you as `response.body`. Node streams remain the native API for files, sockets and zlib. `Readable.fromWeb` and `Readable.toWeb` convert between them, so a Node service can pipe an upstream `fetch` body into an HTTP response with `pipeline`.

### When would you use worker threads, cluster, or just more instances? {core}

For a stateless API in containers, scale with more instances: one Node process per container and let Cloud Run or a Kubernetes autoscaler add replicas. Use `worker_threads` when a request needs CPU-heavy work in-process, such as parsing a large document or generating a PDF, so the main loop stays responsive; use a pool such as Piscina and transfer buffers instead of copying. `cluster` mostly made sense on bare VMs before containers.

If the CPU work is long or bursty, I would rather put it on a queue with a separate worker deployment, so it scales and fails independently of the API.

### How do worker threads share data? {deep}

By message passing: `postMessage` copies values with the structured clone algorithm, which is safe but costs time for large data. An `ArrayBuffer` can be **transferred** instead, which moves it with no copy and leaves the sender's copy empty. For true shared memory there is `SharedArrayBuffer`, coordinated with `Atomics`. Each worker has its own heap and event loop, so workers start slowly and should be pooled and reused.

### `spawn`, `exec`, `execFile` or `fork`: when do you use each? {core}

`spawn` starts a program and gives me its stdout and stderr as streams, which suits long-running processes and large output. `execFile` runs a program with an argument array and buffers the output, for short commands. `exec` runs a command string through a shell and buffers the output; I avoid it with any user input because of shell injection. `fork` starts another Node script with an IPC channel for messages. With all of them I set a `timeout` or `signal`, check the exit code, and read stderr.

### How do you prevent command injection with child processes? {core}

Never build a shell command string from user input. Use `execFile` or `spawn` with the program and an **argument array**, without `shell: true`, so arguments go to the program directly and shell characters like `;`, `|` or `$()` mean nothing. Validate inputs against an allow-list where possible, run with the least privileges, and set a timeout. If a shell is unavoidable, escaping is error-prone; prefer restructuring the call.

### When are synchronous fs functions acceptable? {core}

At startup and in command-line scripts, where nothing else is waiting: reading configuration before the server starts listening, or a build script. Inside a request handler they block the event loop, delaying every other request, so a server should use the promise API or streams. The same rule applies to other `*Sync` APIs, such as `crypto.pbkdf2Sync` and `zlib.gzipSync`.

### How do you compress data in Node, and what are the trade-offs? {deep}

With `node:zlib`, as streams (`createGzip`, `createBrotliCompress`, and in recent versions Zstandard) or one-shot async functions. Gzip is universal and fast; Brotli compresses text better but is slower at high levels, so it suits pre-compressed static assets; Zstandard offers a good speed-to-ratio balance. Compression runs on the libuv thread pool for the async APIs, and the sync versions block the loop. For HTTP, compression is often better done at a reverse proxy or CDN.

### How do you stream a large file or query result to an HTTP response?

Pipe it instead of building it in memory: `pipeline(createReadStream(path), res)` for a file, with `Content-Type` and, if known, `Content-Length` set first; for a database result, a cursor or stream from the driver, a Transform that serialises each row (as NDJSON or CSV), and then the response. `pipeline` gives backpressure, so a slow client slows the database reads, and if the client disconnects every stream is destroyed and the cursor closed. Add compression with a gzip Transform when the client accepts it.

### How would you relay an upstream LLM stream to the browser through a Node service? {core}

Call the upstream with `fetch` and an `AbortSignal`, convert its body with `Readable.fromWeb`, and connect it to the response with `pipeline`, so backpressure runs all the way from the browser back to the upstream. Send `Content-Type: text/event-stream` and `Cache-Control: no-cache` and flush the headers straight away. If the response closes before it has ended, the client has gone, so abort the controller to stop the upstream from generating tokens nobody will read, and record the usage either way.

Add a keep-alive comment line every 15 seconds or so, so idle proxies do not cut the connection, and watch event loop delay and memory per instance, because every open stream holds a socket and some buffers. The last coding problem in this chapter builds exactly this relay; the protocol side is in [Server-Sent Events](#/sse).

### How do you read a file line by line?

With `readline`: `readline.createInterface({ input: createReadStream(path), crlfDelay: Infinity })` is an async iterable of lines, so `for await (const line of rl)` processes a file of any size with constant memory, handling both `\n` and `\r\n` endings. For full control (or inside a Transform), split the decoded chunks yourself and carry the last partial line into the next chunk, as the coding problems here do.

### How do you watch files for changes?

`fs.watch` uses the operating system's notifications and is efficient, but its events differ between platforms (it can fire twice, or report `rename` for a save). `fs.watchFile` polls and is reliable but costly. Tools such as `chokidar` smooth over the differences. For development servers Node has `node --watch`, which restarts on change. In production, watching files is rare: configuration comes from the environment and deployments replace the container.

## Coding problems

### Count lines and words in a huge file with constant memory {easy core}

Write `countFile(path)` that returns `{ lines, words }` for a text file of any size without loading it all into memory. A file that does not end with a newline still counts its last line. Words are separated by whitespace.

#### Hints

1. Use `createReadStream` and iterate it with `for await`.
2. Chunks do not end at line boundaries: keep the unfinished last part of each chunk and prepend it to the next.
3. Decode with a streaming `TextDecoder` so a character split across chunks is not corrupted.

#### Solution

Reading in small chunks keeps memory bounded by the chunk size plus the longest line. The trailing partial line is carried forward and counted at the end if it is not empty.

```ts
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function countFile(path: string): Promise<{ lines: number; words: number }> {
  let lines = 0;
  let words = 0;
  let tail = '';
  const decoder = new TextDecoder();
  const countWords = (line: string) => line.split(/\s+/).filter(Boolean).length;
  for await (const chunk of createReadStream(path, { highWaterMark: 16 })) {
    const parts = (tail + decoder.decode(chunk as Buffer, { stream: true })).split('\n');
    tail = parts.pop() ?? '';
    for (const line of parts) {
      lines++;
      words += countWords(line);
    }
  }
  tail += decoder.decode();
  if (tail.length > 0) {
    lines++;
    words += countWords(tail);
  }
  return { lines, words };
}

const dir = await mkdtemp(join(tmpdir(), 'count-'));
try {
  const file = (name: string, text: string) => writeFile(join(dir, name), text).then(() => join(dir, name));
  assert.deepEqual(await countFile(await file('a.txt', 'one two\nthree\n')), { lines: 2, words: 3 });
  assert.deepEqual(await countFile(await file('b.txt', 'no newline at end')), { lines: 1, words: 4 });
  assert.deepEqual(await countFile(await file('c.txt', '')), { lines: 0, words: 0 });
  assert.deepEqual(await countFile(await file('d.txt', '\n\n')), { lines: 2, words: 0 });
  // Multi-byte characters straddling the 16-byte chunks are decoded correctly.
  assert.deepEqual(await countFile(await file('e.txt', 'café crème brûlée\n€€€€€€ ok\n')), { lines: 2, words: 5 });
  console.log('countFile ok');
} finally {
  await rm(dir, { recursive: true, force: true });
}
```

Complexity: O(n) time over the file; O(chunk size + longest line) memory.

#### Follow-ups

- **How would you make it faster on a multi-core machine?** Split the file into byte ranges, adjust each range to start after a newline, count each range in a worker thread, and add the results.
- **Why the final `decoder.decode()`?** It flushes any incomplete bytes left at the very end of the file.

### Parse NDJSON from a stream whose chunks split lines {medium core}

An upstream service streams newline-delimited JSON (one event per line), but network chunks arrive at arbitrary boundaries: a line can be split across chunks, and one chunk can hold several lines. Write a `Transform` stream that takes strings and emits one parsed object per complete line. Ignore blank lines, handle a final line without a trailing newline, and fail the stream on invalid JSON.

Example: chunks `'{"a":1}\n{"b"'`, `':2}\n\n{"c":3}'` produce `{a:1}`, `{b:2}`, `{c:3}`.

#### Hints

1. Keep a buffer string across `transform` calls.
2. Split the buffer on `\n`; every piece except the last is a complete line. Keep the last piece as the new buffer.
3. Use `flush` for the leftover line when the input ends, and pass an error to the callback for bad JSON.

#### Solution

A naive `chunk.split('\n')` breaks when a line is split. Keep the unfinished tail between calls, only parse complete lines, and flush the tail at the end. Each line is handled once, so it is linear in the input size.

```ts
import assert from 'node:assert/strict';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function ndjson(): Transform {
  let buffer = '';
  const parse = (line: string, push: (v: unknown) => void) => {
    if (line.trim()) push(JSON.parse(line));
  };
  return new Transform({
    readableObjectMode: true,
    transform(chunk: Buffer | string, _enc, cb) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      try {
        for (const line of lines) parse(line, (v) => this.push(v));
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
    flush(cb) {
      try {
        parse(buffer, (v) => this.push(v));
        cb();
      } catch (err) {
        cb(err as Error);
      }
    },
  });
}

async function collect(chunks: string[]): Promise<unknown[]> {
  const out: unknown[] = [];
  await pipeline(
    Readable.from(chunks),
    ndjson(),
    new Writable({
      objectMode: true,
      write(v, _e, cb) {
        out.push(v);
        cb();
      },
    }),
  );
  return out;
}

assert.deepEqual(await collect(['{"a":1}\n{"b"', ':2}\n\n{"c":3}']), [{ a: 1 }, { b: 2 }, { c: 3 }]);
assert.deepEqual(await collect(['{"t":"x', 'y"}\n']), [{ t: 'xy' }]);
assert.deepEqual(await collect(['', '\n\n']), []);
await assert.rejects(collect(['{"ok":true}\n{bad json}\n']), SyntaxError);
console.log('ndjson ok');
```

Complexity: O(n) time over the total input, and memory bounded by the longest line.

#### Follow-ups

- **What about multi-byte characters split across byte chunks?** Decode with a `TextDecoder` in streaming mode or `setEncoding('utf8')` on the source; `chunk.toString()` on a raw `Buffer` can corrupt a split character.
- **How do you protect against a never-ending line?** Cap the buffer length and fail the stream when it is exceeded.

### Batch records into arrays of N {medium}

Write a `Transform` in object mode, `batch(size)`, that groups incoming records into arrays of `size` (for bulk database inserts), emits a final shorter batch for the leftovers, and emits nothing for empty input. Reject a size below 1.

Example: records 1–5 with `batch(2)` produce `[1,2]`, `[3,4]`, `[5]`.

#### Hints

1. Keep the current batch in an array inside the closure.
2. Push the array when it reaches `size`, then start a new one.
3. `flush` runs when the input ends: push the leftover array if it is not empty.

#### Solution

The transform keeps one partial batch. Because it is an object-mode stream inside a `pipeline`, a slow database writer downstream automatically slows the reading upstream.

```ts
import assert from 'node:assert/strict';
import { Readable, Transform, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

function batch<T>(size: number): Transform {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('size must be a positive integer');
  let current: T[] = [];
  return new Transform({
    objectMode: true,
    transform(record: T, _enc, cb) {
      current.push(record);
      if (current.length === size) {
        this.push(current);
        current = [];
      }
      cb();
    },
    flush(cb) {
      if (current.length > 0) this.push(current);
      cb();
    },
  });
}

async function run<T>(items: T[], size: number): Promise<T[][]> {
  const out: T[][] = [];
  await pipeline(
    Readable.from(items),
    batch<T>(size),
    new Writable({
      objectMode: true,
      write(group: T[], _e, cb) {
        out.push(group);
        setImmediate(cb); // pretend each bulk insert takes a moment
      },
    }),
  );
  return out;
}

assert.deepEqual(await run([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
assert.deepEqual(await run([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
assert.deepEqual(await run([], 3), []);
assert.deepEqual(await run(['a'], 10), [['a']]);
assert.throws(() => batch(0), RangeError);
console.log('batch ok');
```

Complexity: O(n) time; O(size) memory.

#### Follow-ups

- **What if records arrive slowly and a batch never fills?** Add a time limit: flush a partial batch after, say, 500 ms with a timer that resets on each push.
- **How do you handle a failed insert?** Fail the writable's callback with the error; `pipeline` stops the chain. Or retry inside the writer and send failures to a dead-letter store.

### Write to a slow destination without ignoring backpressure {medium}

Write `writeAll(writable, chunks)` that writes every chunk to a writable stream, waiting for `'drain'` whenever `write()` returns `false`, then ends the stream and resolves when it has finished. It must reject if the stream errors. Show that the writable's buffer never grows far past its `highWaterMark`.

#### Hints

1. `write()` returns a boolean; `false` means stop until `'drain'`.
2. `events.once(writable, 'drain')` gives a promise, and it rejects if `'error'` fires first.
3. After the loop, call `end()` and wait for `'finish'` (or use `stream.finished`).

#### Solution

The loop pauses at every `false`, so at most one chunk beyond the limit is ever buffered. `events.once` also turns an `'error'` during the wait into a rejection.

```ts
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';

async function writeAll(writable: Writable, chunks: Iterable<string>): Promise<void> {
  for (const chunk of chunks) {
    if (!writable.write(chunk)) await once(writable, 'drain');
  }
  writable.end();
  await finished(writable);
}

let maxBuffered = 0;
const received: string[] = [];
const slowSink = new Writable({
  highWaterMark: 8,
  write(chunk: Buffer, _enc, cb) {
    received.push(chunk.toString());
    setTimeout(cb, 1);
  },
});
const watch = setInterval(() => (maxBuffered = Math.max(maxBuffered, slowSink.writableLength)), 0);
const chunks = Array.from({ length: 50 }, (_, i) => `chunk-${i}|`);
await writeAll(slowSink, chunks);
clearInterval(watch);

assert.equal(received.join(''), chunks.join(''));
assert.ok(maxBuffered <= 8 + 'chunk-49|'.length, `buffer peaked at ${maxBuffered} bytes`);

// An error while writing rejects instead of hanging.
const broken = new Writable({
  highWaterMark: 1,
  write(_chunk, _enc, cb) {
    setTimeout(() => cb(new Error('disk full')), 1);
  },
});
await assert.rejects(writeAll(broken, ['a', 'b', 'c']), /disk full/);
console.log('writeAll ok, peak buffer', maxBuffered, 'bytes');
```

Complexity: O(n) time; buffered memory stays near `highWaterMark`.

#### Follow-ups

- **Is this what `pipeline` does internally?** Yes, in essence: `pipeline(Readable.from(chunks), writable)` gives the same behaviour plus cleanup on errors.
- **Where does this matter on a server?** Writing to an HTTP response: `res.write()` returns `false` when the client reads slowly.

### Run another program safely, with a timeout {medium}

Write `run(command, args, { timeoutMs })` that runs a program without a shell, returns `{ code, stdout, stderr }`, rejects with a clear error when it times out, and treats a non-zero exit code as a result, not a crash. Prove that shell syntax in an argument is not executed.

#### Hints

1. `execFile` (or `spawn`) with an argument array does not use a shell.
2. `execFile` accepts a `timeout` option and kills the child when it passes; its error then has `killed` set.
3. On a non-zero exit, the callback's error carries `code`; you can resolve with it instead of rejecting.

#### Solution

The argument array goes straight to the program, so `; echo hacked` is just text. The callback distinguishes three outcomes: success, a normal non-zero exit, and a timeout or spawn failure.

```ts
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';

type Result = { code: number; stdout: string; stderr: string };

function run(command: string, args: string[], { timeoutMs }: { timeoutMs: number }): Promise<Result> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve({ code: 0, stdout, stderr });
      const e = err as NodeJS.ErrnoException & { killed?: boolean; code?: number | string };
      if (e.killed) return reject(new Error(`${command} timed out after ${timeoutMs} ms`));
      if (typeof e.code === 'number') return resolve({ code: e.code, stdout, stderr });
      reject(err); // the program could not be started (ENOENT, EACCES, ...)
    });
  });
}

const node = process.execPath;
const ok = await run(node, ['-e', 'console.log(process.argv[1])', 'hello; echo hacked'], { timeoutMs: 5_000 });
assert.equal(ok.code, 0);
assert.equal(ok.stdout.trim(), 'hello; echo hacked'); // the shell syntax was passed as plain text

const failed = await run(node, ['-e', 'console.error("bad input"); process.exit(3)'], { timeoutMs: 5_000 });
assert.deepEqual([failed.code, failed.stderr.trim()], [3, 'bad input']);

await assert.rejects(run(node, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 100 }), /timed out after 100 ms/);
await assert.rejects(run('definitely-not-a-real-program', [], { timeoutMs: 1_000 }), /ENOENT/);
console.log('run ok');
```

Complexity: O(output size) memory, bounded by `maxBuffer`.

#### Follow-ups

- **What if the output is large?** Use `spawn` and stream stdout to its destination instead of buffering, or `maxBuffer` will be exceeded.
- **How do you cancel it from a request?** Pass `signal` (an `AbortSignal`) to `execFile`/`spawn`; aborting kills the child.

### Relay an upstream event stream and cancel it on disconnect {hard}

Write a Node `http` endpoint `GET /relay` that opens a streaming request to an upstream server, sets SSE headers, and pipes the upstream body to the client with backpressure. When the client disconnects early, abort the upstream request so it stops producing. Prove both: a full relay delivers every event, and an early disconnect aborts the upstream.

#### Hints

1. `fetch(upstreamUrl, { signal })` gives a web `ReadableStream` in `response.body`; `Readable.fromWeb` turns it into a Node stream.
2. `pipeline(source, res, { signal })` handles backpressure and errors.
3. Listen to `res.on('close')`: if `res.writableEnded` is false, the client left early, so call `controller.abort()`.

#### Solution

The relay owns one `AbortController` per client. Piping through `pipeline` means a slow client slows the reads from the upstream instead of buffering in memory. When the client goes away, `close` fires before the response has ended, and aborting the controller tears down the upstream fetch, which the upstream sees as its own `close` event.

```ts
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Upstream: emits one SSE event every 10 ms, up to `count`, and records whether its client went away.
let upstreamAborted = false;
const upstream = createServer((req, res) => {
  const count = Number(new URL(req.url ?? '/', 'http://x').searchParams.get('count'));
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  let i = 0;
  const timer = setInterval(() => {
    res.write(`data: token ${i}\n\n`);
    if (++i === count) {
      clearInterval(timer);
      res.end();
    }
  }, 10);
  res.on('close', () => {
    clearInterval(timer);
    if (!res.writableEnded) upstreamAborted = true;
  });
});
await new Promise<void>((r) => upstream.listen(0, r));
const upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

const relay = createServer(async (req, res) => {
  const count = new URL(req.url ?? '/', 'http://x').searchParams.get('count') ?? '3';
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const up = await fetch(`${upstreamUrl}/?count=${count}`, { signal: controller.signal });
    if (!up.ok || !up.body) throw new Error(`upstream ${up.status}`);
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
    await pipeline(Readable.fromWeb(up.body as import('node:stream/web').ReadableStream<Uint8Array>), res, { signal: controller.signal });
  } catch {
    if (!res.headersSent) res.writeHead(502).end();
    else res.destroy();
  }
});
await new Promise<void>((r) => relay.listen(0, r));
const relayUrl = `http://127.0.0.1:${(relay.address() as AddressInfo).port}/relay`;

// 1. Full relay: every event arrives.
const full = await (await fetch(`${relayUrl}?count=3`)).text();
assert.equal(full, 'data: token 0\n\ndata: token 1\n\ndata: token 2\n\n');
assert.equal(upstreamAborted, false);

// 2. The client stops after the first chunk: the upstream must be aborted.
const client = new AbortController();
const res = await fetch(`${relayUrl}?count=1000`, { signal: client.signal });
const reader = res.body!.getReader();
await reader.read();
client.abort();
for (let waited = 0; !upstreamAborted && waited < 2_000; waited += 20) await new Promise((r) => setTimeout(r, 20));
assert.equal(upstreamAborted, true);

relay.close();
upstream.close();
console.log('relay ok');
```

Complexity: O(n) in bytes relayed, O(1) extra memory per connection thanks to backpressure.

#### Follow-ups

- **How do you keep idle proxies from closing the stream?** Write a comment line (`: ping\n\n`) every 15 seconds or so while waiting for the upstream.
- **How do you record token usage if the client leaves?** Count events as they pass through and log usage in the `close` handler, whichever way the stream ended.
- **What about many concurrent streams per instance?** Each stream is a socket and some buffers; size the platform's concurrency and memory accordingly, and watch event loop delay. See [Server-Sent Events](#/sse) for the protocol side.
