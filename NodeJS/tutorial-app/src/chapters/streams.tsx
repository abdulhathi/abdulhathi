import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { backpressure } from '../diagrams/specs/io';

export function Streams() {
  return (
    <>
      <ChapterIntro
        time="90–120 minutes"
        project="07-log-analyzer"
        learn={[
          'Bytes versus text: Buffers, encodings, and characters split across chunks',
          'Why streams keep memory flat no matter how big the data is',
          'The four kinds of stream and the events that drive them',
          'Backpressure: what write() returning false means, and what happens if you ignore it',
          'stream.pipeline for safe chaining, error handling and clean-up',
          'Writing your own Transform, and using async generators as pipeline steps',
        ]}
        tools={[
          { name: 'Buffer', what: 'Global class for raw bytes.' },
          { name: 'node:stream', what: 'Readable, Writable, Transform; pipeline in node:stream/promises.' },
          { name: 'node:readline', what: 'Splits a byte stream into lines.' },
          { name: 'node:zlib', what: 'gzip, deflate and brotli as streams.' },
          { name: 'node:string_decoder', what: 'Turns bytes into text without breaking characters.' },
        ]}
      />

      <h2>Bytes first: Buffers</h2>
      <div className="prose">
        <p>
          Files, sockets and processes deal in <strong>bytes</strong>, numbers from 0 to 255. Text is a separate idea:
          a string of characters. An <strong>encoding</strong> is the rule that turns characters into bytes and back.
          UTF-8, the default everywhere in Node, uses one byte for plain English letters and two to four bytes for
          everything else.
        </p>
        <p>
          A <code>Buffer</code> is Node's container for bytes: a fixed-length <code>Uint8Array</code> with extra
          methods for encodings and binary numbers. Every chunk a stream gives you is a Buffer unless you ask for text,
          so you need to be comfortable with them before streams make sense.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Encoding</th><th>Use it for</th><th><code>'café'</code> becomes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>utf8</code></td><td>Text. The default for almost every API</td><td>5 bytes: <code>63 61 66 c3 a9</code></td></tr>
          <tr><td><code>hex</code></td><td>Showing bytes to humans: hashes, ids</td><td><code>636166c3a9</code></td></tr>
          <tr><td><code>base64</code></td><td>Bytes inside text formats: JSON, email, data URLs</td><td><code>Y2Fmw6k=</code></td></tr>
          <tr><td><code>base64url</code></td><td>The same, safe in URLs and JWTs (chapter 15)</td><td><code>Y2Fmw6k</code></td></tr>
          <tr><td><code>latin1</code>, <code>ascii</code></td><td>Old protocols with one byte per character</td><td>Cannot represent é correctly in ascii</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Set up the project</Step>
      <div className="prose">
        <p>Create <code>projects/07-log-analyzer</code> from the chapter 03 template with this <code>package.json</code>, then run <code>npm install</code> and <code>mkdir src</code>. The generated log goes in <code>logs/</code>, which the template's <code>.gitignore</code> already keeps out of git through its <code>*.log</code> rule.</p>
      </div>
      <CodeFile path="07-log-analyzer/package.json" />

      <Step n={2}>Get to know Buffers</Step>
      <CodeFile path="07-log-analyzer/src/buffers.ts" />
      <Terminal>{`npm run buffers`}</Terminal>
      <Output>{`
<Buffer 63 61 66 c3 a9>
'café' has 4 characters but 5 bytes: é needs two
hex:    636166c3a9
base64: Y2Fmw6k=
decode: café
<Buffer 4e 4c 00 00 07 ea> -> NL 2026
original: Café, view: Caf, copy: Xafé
Node 24
naive:   Caf��
decoder: Café`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Method</th><th>What it does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>Buffer.from(string, encoding)</code></td><td>Encodes text into a new Buffer. <code>Buffer.from(buffer)</code> copies; <code>Buffer.from(array)</code> takes byte values.</td></tr>
          <tr><td><code>Buffer.alloc(size)</code></td><td>A new Buffer of <code>size</code> zero bytes.</td></tr>
          <tr><td><code>Buffer.allocUnsafe(size)</code></td><td>Faster, but not zeroed: it may contain old data from memory. Only use it if you overwrite every byte.</td></tr>
          <tr><td><code>buf.toString(encoding, start, end)</code></td><td>Decodes bytes into text.</td></tr>
          <tr><td><code>buf.subarray(start, end)</code></td><td>A view onto the same memory: no copy. Changing the view changes the original, as line 3 of the output shows.</td></tr>
          <tr><td><code>Buffer.concat([a, b])</code></td><td>Joins Buffers into a new one.</td></tr>
          <tr><td><code>buf.readUInt32BE(offset)</code>, <code>writeUInt32BE</code></td><td>Read and write binary numbers; BE/LE choose the byte order. Used for binary file formats and network protocols.</td></tr>
          <tr><td><code>buf.equals(other)</code>, <code>Buffer.compare</code></td><td>Compare contents, not identity.</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="key" label="The broken character">
        <p>
          The last two lines are the bug every stream user eventually meets. A stream cuts data into chunks wherever it
          likes, sometimes in the middle of a multi-byte character. Decoding each chunk on its own turns both halves of{' '}
          <code>é</code> into the replacement character <code>�</code>. A <code>StringDecoder</code> holds back an
          incomplete character until the next chunk completes it. <code>readable.setEncoding('utf8')</code> and{' '}
          <code>readline</code> use one internally, which is why you should prefer them over calling{' '}
          <code>chunk.toString()</code> yourself.
        </p>
      </Box>

      <h2>Why streams</h2>
      <div className="prose">
        <p>
          <code>readFile</code> loads a whole file into memory before you can touch the first byte. That is fine for a
          config file and a disaster for a 5 GB log or a video upload: memory grows with the size of the data, and
          everyone else waits while it loads. A <strong>stream</strong> hands you the data in chunks (64 KiB at a time for
          files) as it arrives, so memory stays flat and work starts immediately. Streams also compose: the output of
          one is the input of the next, like pipes in a Unix shell.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Kind</th><th>Data flows</th><th>Examples</th><th>Key methods and events</th></tr>
        </thead>
        <tbody>
          <tr><td>Readable</td><td>Out of it</td><td><code>fs.createReadStream</code>, an HTTP request on the server, <code>process.stdin</code></td><td><code>data</code>, <code>end</code>, <code>error</code>, <code>pause()</code>, <code>resume()</code>, <code>for await</code></td></tr>
          <tr><td>Writable</td><td>Into it</td><td><code>fs.createWriteStream</code>, an HTTP response, <code>process.stdout</code></td><td><code>write()</code>, <code>end()</code>, <code>drain</code>, <code>finish</code>, <code>error</code></td></tr>
          <tr><td>Duplex</td><td>Both ways, independently</td><td>A TCP socket</td><td>All of the above</td></tr>
          <tr><td>Transform</td><td>In, changed, out</td><td><code>zlib.createGzip()</code>, encryption, a CSV parser</td><td>You implement <code>_transform</code> and optionally <code>_flush</code></td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>Every stream is an <code>EventEmitter</code> (chapter 08), which is why <code>'error'</code> listeners matter so much here.</p>
      </div>

      <h2>Backpressure</h2>
      <div className="prose">
        <p>
          Producers and consumers rarely run at the same speed. Your loop can generate lines far faster than a disk can
          store them. Each Writable has a buffer, and a <strong>highWaterMark</strong> that says how full the buffer
          should get. <code>write()</code> always accepts your chunk, but returns <code>false</code> once the buffer is
          past that mark. That is the stream asking you to stop. When the buffer has emptied, it emits{' '}
          <code>'drain'</code>, and you may continue. This conversation is called <strong>backpressure</strong>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Stream</th><th>Default highWaterMark on Node 24</th></tr>
        </thead>
        <tbody>
          <tr><td>Byte streams, including <code>fs</code> read and write streams</td><td>65,536 bytes (64 KiB)</td></tr>
          <tr><td>Object mode streams</td><td>16 objects</td></tr>
        </tbody>
      </TableWrap>

      <Step n={3}>Generate a big log, respecting backpressure</Step>
      <div className="prose">
        <p>
          The analyzer needs data, so first write a script that produces a million lines of web-server log. It uses a
          seeded random generator so that your numbers match the ones on this page exactly.
        </p>
      </div>
      <CodeFile path="07-log-analyzer/src/random.ts" />
      <CodeFile path="07-log-analyzer/src/generate.ts" />
      <div className="prose">
        <p>
          The heart of it is four lines inside the loop: if <code>write()</code> returns <code>false</code>,{' '}
          <code>await once(out, 'drain')</code> pauses the loop until the file stream has caught up. At the end,{' '}
          <code>end()</code> says no more data is coming and <code>'finish'</code> fires once everything has been
          flushed to the operating system.
        </p>
      </div>
      <Terminal>{`
npm run generate
head -3 logs/access.log`}</Terminal>
      <Output>{`
wrote 1,000,000 lines (45.4 MB) to logs/access.log in 0.63 s
write() returned false 726 times; each time we waited for 'drain'
peak memory: 114 MB

2026-10-11T09:00:00.120Z GET /api/tasks/42 200 10
2026-10-11T09:00:00.225Z GET /api/tasks 200 24
2026-10-11T09:00:00.274Z POST /api/login 201 84`}</Output>
      <div className="prose">
        <p>
          The file and the line counts will match yours exactly; time and memory depend on your machine.{' '}
          <code>process.resourceUsage().maxRSS</code> is the most memory the process used at any moment, in kilobytes.
        </p>
      </div>
      <Box kind="try" label="Try it: ignore backpressure">
        <p>
          Replace the <code>if</code> block with a bare <code>out.write(makeLine(time));</code> and run it again, then
          with <code>node src/generate.ts 5000000</code>. Undo the change afterwards.
        </p>
        <TableWrap>
          <thead>
            <tr><th>Lines</th><th>Respecting backpressure</th><th>Ignoring it</th></tr>
          </thead>
          <tbody>
            <tr><td>1,000,000</td><td>114 MB</td><td>487 MB</td></tr>
            <tr><td>5,000,000</td><td>137 MB</td><td>1,496 MB</td></tr>
          </tbody>
        </TableWrap>
        <p>
          Peak memory measured on the author's machine. Ignoring the return value does not lose data; every line is
          queued in memory until the disk catches up, so memory grows with the size of the output. On a server this is
          how a slow client makes a process run out of memory.
        </p>
      </Box>

      <Step n={4}>Measure: whole file versus stream</Step>
      <CodeFile path="07-log-analyzer/src/memory.ts" />
      <Terminal>{`
node src/memory.ts readfile
node src/memory.ts stream`}</Terminal>
      <Output>{`
readfile 1,000,000 lines, peak memory 213 MB
stream   1,000,000 lines, peak memory 87 MB`}</Output>
      <div className="prose">
        <p>
          With a five-million-line log (238 MB) the gap widens to <strong>915 MB versus 109 MB</strong>: the streaming
          version barely notices the extra data. There is also a hard limit. V8 cannot create a string longer than{' '}
          <code>buffer.constants.MAX_STRING_LENGTH</code>, 536,870,888 characters, so{' '}
          <code>readFile(path, 'utf8')</code> fails outright on files larger than about 512 MB. A stream has no such
          limit.
        </p>
      </div>

      <Step n={5}>Analyse the log, one line at a time</Step>
      <div className="prose">
        <p>
          Now the real tool. A small parser turns a line into a typed object, and the analyzer reads the file through{' '}
          <code>readline</code>, which turns a stream of bytes into a stream of lines and is async-iterable.
        </p>
      </div>
      <CodeFile path="07-log-analyzer/src/parse.ts" />
      <CodeFile path="07-log-analyzer/src/analyze.ts" />
      <Terminal>{`npm run analyze`}</Terminal>
      <Output>{`
logs/access.log: 1,000,000 lines, 0 unreadable

status     count  share
200      795,351  79.5%
201      174,916  17.5%
404       25,644   2.6%
500        4,089   0.4%

top paths
/api/tasks              500,087  50.0%
/api/tasks/42           199,606  20.0%
/health                 149,907  15.0%
/api/login               80,160   8.0%
/static/app.js           49,766   5.0%

latency  p50 21 ms · p95 163 ms · p99 1255 ms · max 3340 ms
took 0.47 s, peak memory 175 MB`}</Output>
      <div className="prose">
        <p>
          The <strong>p95</strong> latency is the time 95% of requests beat: here, 163 ms. Averages hide slow
          outliers; percentiles are how real services set performance targets. This version keeps every latency in an
          array to sort it, which is 8 MB for a million numbers. A production tool would use a histogram instead so that
          memory stays fixed however many lines it reads.
        </p>
        <p>
          <code>crlfDelay: Infinity</code> makes readline treat Windows line endings (<code>\r\n</code>) as one line
          break. And errors flow into the loop: point the script at a missing file and the <code>for await</code>{' '}
          throws.
        </p>
      </div>
      <Output caption="node src/analyze.ts nope.log">{`
[Error: ENOENT: no such file or directory, open 'nope.log'] {
  errno: -2,
  code: 'ENOENT',
  syscall: 'open',
  path: 'nope.log'
}`}</Output>

      <h2>pipeline: chaining streams safely</h2>
      <Diagram spec={backpressure} caption="pipeline() wires each stream to the next and passes backpressure all the way back to the file reader." />
      <div className="prose">
        <p>
          The classic way to connect streams is <code>source.pipe(destination)</code>. It handles backpressure, but
          not errors: if the source fails, the destination is never told, nothing is cleaned up, and an error event
          with no listener crashes the process. <code>pipeline()</code> from <code>node:stream/promises</code> fixes all
          of that and gives you a promise to <code>await</code>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th><code>a.pipe(b).pipe(c)</code></th><th><code>await pipeline(a, b, c)</code></th></tr>
        </thead>
        <tbody>
          <tr><td>Backpressure</td><td>Yes</td><td>Yes</td></tr>
          <tr><td>Error in any stream</td><td>Not forwarded; each stream needs its own error listener or the process crashes</td><td>Every stream is destroyed and the promise rejects with the first error</td></tr>
          <tr><td>Clean-up</td><td>File handles can stay open</td><td>Always closes everything</td></tr>
          <tr><td>Knowing when it is finished</td><td>Listen for <code>finish</code> on the last stream</td><td>The promise resolves</td></tr>
          <tr><td>Async generators as steps</td><td>No</td><td>Yes</td></tr>
        </tbody>
      </TableWrap>

      <Step n={6}>Compress the log with a pipeline</Step>
      <CodeFile path="07-log-analyzer/src/compress.ts" />
      <Terminal>{`
npm run compress
node src/compress.ts nope.log; echo "exit code: $?"`}</Terminal>
      <Output>{`
logs/access.log 45.4 MB -> logs/access.log.gz 6.0 MB (13.2%) in 376 ms

compression failed: ENOENT: no such file or directory, open 'nope.log'
exit code: 1`}</Output>
      <div className="prose">
        <p>
          Log files compress very well because they repeat themselves. Notice the <code>rm</code> in the{' '}
          <code>catch</code>: by the time the read fails, <code>createWriteStream</code> has already created an empty{' '}
          <code>nope.log.gz</code>. <code>pipeline</code> closes it, but deleting it is your job. Setting{' '}
          <code>process.exitCode</code> instead of calling <code>process.exit()</code> lets Node finish any pending work
          and then exit with that code.
        </p>
      </div>
      <Box kind="try" label="Try it: the same failure with pipe()">
        <p>
          In a scratch file, chain <code>createReadStream('nope.log').pipe(createGzip()).pipe(createWriteStream('nope.log.gz'))</code>{' '}
          and run it. The process crashes on an unhandled <code>'error'</code> event (<code>Error: ENOENT: no such file or
          directory, open 'nope.log'</code>), and the empty <code>nope.log.gz</code> is left behind. That is why new code uses <code>pipeline</code>.
        </p>
      </Box>

      <Step n={7}>Write your own Transform</Step>
      <div className="prose">
        <p>
          A Transform receives chunks on its writable side and pushes results out of its readable side. This one turns
          bytes into lines. It must remember the unfinished last line of each chunk, because a chunk boundary can fall
          anywhere, and it uses a <code>StringDecoder</code> so that characters split across chunks survive.
        </p>
      </div>
      <CodeFile path="07-log-analyzer/src/line-splitter.ts" />
      <TableWrap>
        <thead>
          <tr><th>Part</th><th>Role</th></tr>
        </thead>
        <tbody>
          <tr><td><code>readableObjectMode: true</code></td><td>The output is JavaScript values (strings, one per line), not bytes. The input side stays a byte stream.</td></tr>
          <tr><td><code>_transform(chunk, encoding, done)</code></td><td>Called once per incoming chunk. Call <code>this.push()</code> for each output value, then <code>done()</code>, or <code>done(error)</code> to fail the stream.</td></tr>
          <tr><td><code>_flush(done)</code></td><td>Called after the last chunk, before the stream ends: the place to emit whatever is left over.</td></tr>
          <tr><td>Not calling <code>done</code></td><td>The stream waits for it for ever. A forgotten <code>done()</code> is the usual cause of a pipeline that silently stalls.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The next step needs no class at all. Inside <code>pipeline</code>, an async generator function works as a
          transform: it receives the previous step as an async iterable and whatever it <code>yield</code>s flows on,
          with backpressure handled for you.
        </p>
      </div>
      <CodeFile path="07-log-analyzer/src/errors-only.ts" />
      <Terminal>{`
npm run errors
head -3 logs/errors.log`}</Terminal>
      <Output>{`
kept 4,089 server errors in logs/errors.log

2026-10-11T09:00:09.347Z GET /health failed after 1 ms
2026-10-11T09:00:54.028Z POST /api/tasks failed after 45 ms
2026-10-11T09:01:57.688Z GET /api/tasks failed after 35 ms`}</Output>
      <div className="prose">
        <p>The 4,089 lines match the 500 count from the analyzer, which is a cheap way to check that the line splitter neither loses nor invents lines.</p>
      </div>

      <h2>Ways to make a stream</h2>
      <TableWrap>
        <thead>
          <tr><th>You have</th><th>Use</th></tr>
        </thead>
        <tbody>
          <tr><td>An array, a generator or an async generator</td><td><code>Readable.from(iterable)</code>: pulls values only as fast as the consumer wants them</td></tr>
          <tr><td>A step inside a pipeline</td><td>An async generator function, as in <code>errors-only.ts</code></td></tr>
          <tr><td>A reusable transformation with state</td><td><code>class X extends Transform</code>, as in <code>line-splitter.ts</code></td></tr>
          <tr><td>A custom source or sink</td><td><code>new Readable({'{ read() { … } }'})</code> or <code>new Writable({'{ write(chunk, enc, done) { … } }'})</code></td></tr>
          <tr><td>Several steps you want to treat as one stream</td><td><code>stream.compose(a, b, c)</code></td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="Web Streams">
        <p>
          Browsers have their own stream API, and Node implements it too: <code>fetch()</code> returns a response
          whose <code>body</code> is a web <code>ReadableStream</code>. Convert between the two worlds with{' '}
          <code>Readable.fromWeb(webStream)</code> and <code>Readable.toWeb(nodeStream)</code>, and note that{' '}
          <code>pipeline</code> accepts web streams directly. Both kinds support <code>for await</code>.
        </p>
      </Box>

      <Exercises
        items={[
          {
            task: <>Rewrite the generator without any <code>write()</code>, <code>drain</code> or <code>finish</code> code: produce the lines from a generator function and let <code>pipeline</code> and <code>Readable.from</code> do the rest. Check that the output file is byte-for-byte the same size.</>,
            hint: <>Turn the loop body into <code>function* logLines()</code> that <code>yield</code>s each line, then <code>await pipeline(Readable.from(logLines()), createWriteStream(file))</code>.</>,
            solution: <><CodeFile path="07-log-analyzer.practice/src/generate-pipeline.ts" /><Output>{`wrote 1,000,000 lines (45.4 MB) in 0.70 s
peak memory: 115 MB`}</Output></>,
          },
          {
            task: <>Let the analyzer read compressed logs: <code>node src/analyze.ts logs/access.log.gz</code> should print the same report as the plain file.</>,
            hint: <>When the name ends in <code>.gz</code>, put <code>createGunzip()</code> between the file stream and readline. If you use <code>pipe()</code>, remember it does not forward errors from the file stream.</>,
            solution: <CodeFile path="07-log-analyzer.practice/src/analyze.ts" />,
          },
          {
            task: <>Write a pass-through <code>Progress</code> Transform that prints "25% read", "50% read" and so on, and put it into the compression pipeline.</>,
            hint: <>Get the total size with <code>stat()</code> first. In <code>_transform</code>, add <code>chunk.length</code> to a counter and pass the chunk on unchanged with <code>done(null, chunk)</code>.</>,
            solution: <><CodeFile path="07-log-analyzer.practice/src/progress.ts" /><CodeFile path="07-log-analyzer.practice/src/compress.ts" /><Output>{`  25% read
  50% read
  75% read
  100% read
done: logs/access.log.gz`}</Output></>,
          },
        ]}
      />

      <Checkpoint question={<>An export endpoint loops over two million database rows calling <code>res.write(row)</code> for each. With a fast client it works; with a slow mobile client the server's memory climbs past 2 GB. What is wrong, and how do you fix it?</>}>
        <p>
          The loop ignores backpressure. <code>res</code> is a Writable, and when the client reads slowly{' '}
          <code>write()</code> returns <code>false</code>, but the loop keeps going, so every unsent row piles up in
          memory. Either check the return value and <code>await once(res, 'drain')</code>, or better, turn the rows
          into a Readable (for example <code>Readable.from(asyncGeneratorOfRows())</code>) and{' '}
          <code>await pipeline(rows, res)</code>.
        </p>
      </Checkpoint>
      <Checkpoint question={<>A script prints each chunk of a file with <code>chunk.toString()</code>. Most of the output is fine, but now and then a word has <code>��</code> in the middle. Why, and what is the fix?</>}>
        <p>
          A chunk boundary fell inside a multi-byte UTF-8 character, and each half was decoded separately. Let the
          stream decode for you with <code>stream.setEncoding('utf8')</code>, use <code>readline</code> for lines, or
          decode with a <code>StringDecoder</code>, which carries incomplete characters over to the next chunk.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>A Buffer is bytes; an encoding turns bytes into text. <code>subarray</code> shares memory, <code>Buffer.from(buf)</code> copies.</li>
          <li>Streams process data in chunks, so memory stays flat however big the input is.</li>
          <li>When <code>write()</code> returns <code>false</code>, stop and wait for <code>'drain'</code>. Ignoring it queues everything in memory.</li>
          <li>Use <code>await pipeline(...)</code>, not <code>.pipe()</code>: it forwards errors, destroys every stream and tells you when it is done.</li>
          <li>Write steps as async generators, or as a <code>Transform</code> with <code>_transform</code> and <code>_flush</code>, and always call <code>done</code>.</li>
        </ul>
      </Recap>
    </>
  );
}
