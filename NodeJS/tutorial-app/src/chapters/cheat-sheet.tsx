import { CodeFile, Terminal } from '../components/Code';
import { Box, TableWrap } from '../components/Content';

export function CheatSheet() {
  return (
    <>
      <div className="prose">
        <p>
          One page to keep open while you work. Every code box below is a file from a small project that was run and
          type-checked on Node 24. Copy the <code>cheat-sheet</code> folder and run any file with{' '}
          <code>node &lt;file&gt;.ts</code>, or the tests with <code>npm test</code>.
        </p>
      </div>

      <h2>The node command</h2>
      <TableWrap>
        <thead>
          <tr><th>Command or flag</th><th>Does</th><th>Ch.</th></tr>
        </thead>
        <tbody>
          <tr><td><code>node file.ts</code></td><td>Runs a file. TypeScript types are stripped, not checked.</td><td>03</td></tr>
          <tr><td><code>node</code></td><td>Opens the REPL. <code>.help</code>, <code>.exit</code>, <code>_</code> is the last result.</td><td>02</td></tr>
          <tr><td><code>node -e "code"</code> / <code>-p "expr"</code></td><td>Runs a snippet; <code>-p</code> also prints the result.</td><td>02</td></tr>
          <tr><td><code>--watch</code></td><td>Restarts when an imported file changes. Add <code>--watch-path=dir</code> to watch more, <code>--watch-preserve-output</code> to keep old output.</td><td>03</td></tr>
          <tr><td><code>--env-file=.env</code></td><td>Loads environment variables from a file. <code>--env-file-if-exists</code> does not fail when it is missing.</td><td>14</td></tr>
          <tr><td><code>--run &lt;script&gt;</code></td><td>Runs a <code>package.json</code> script, faster than <code>npm run</code>.</td><td>—</td></tr>
          <tr><td><code>--test</code></td><td>Runs test files (<code>*.test.ts</code> and similar). Combine with <code>--watch</code>, <code>--test-name-pattern="text"</code>, <code>--test-only</code>.</td><td>13</td></tr>
          <tr><td><code>--experimental-test-coverage</code></td><td>Prints line, branch and function coverage after the tests.</td><td>13</td></tr>
          <tr><td><code>--inspect</code> / <code>--inspect-brk</code></td><td>Lets DevTools or VS Code attach on 127.0.0.1:9229; <code>-brk</code> pauses on the first line.</td><td>17</td></tr>
          <tr><td><code>--cpu-prof --cpu-prof-dir=profiles</code></td><td>Writes a <code>.cpuprofile</code> when the process exits normally.</td><td>17</td></tr>
          <tr><td><code>--heap-prof</code></td><td>Writes a sampling heap profile (allocations over time) on exit.</td><td>17</td></tr>
          <tr><td><code>--heapsnapshot-signal=SIGUSR2</code></td><td>Writes a heap snapshot each time the process gets that signal.</td><td>17</td></tr>
          <tr><td><code>--max-old-space-size=384</code></td><td>Caps V8's old space at 384 MB. <code>--max-old-space-size-percentage=75</code> sizes it from available memory.</td><td>17</td></tr>
          <tr><td><code>--enable-source-maps</code></td><td>Stack traces point at original sources, for compiled code.</td><td>—</td></tr>
          <tr><td><code>--trace-warnings</code></td><td>Shows where a warning (such as a deprecation) came from.</td><td>—</td></tr>
          <tr><td><code>--disable-warning=ExperimentalWarning</code></td><td>Silences one kind of warning.</td><td>—</td></tr>
          <tr><td><code>NODE_OPTIONS="--max-old-space-size=384"</code></td><td>Passes flags through the environment, for when you cannot edit the command.</td><td>17</td></tr>
        </tbody>
      </TableWrap>

      <h2>npm</h2>
      <TableWrap>
        <thead>
          <tr><th>Command</th><th>Does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>npm init -y</code></td><td>Creates <code>package.json</code> (then <code>npm pkg set type=module</code>).</td></tr>
          <tr><td><code>npm install</code> / <code>npm i</code></td><td>Installs everything in <code>package.json</code>, updating the lockfile if needed.</td></tr>
          <tr><td><code>npm ci</code></td><td>Clean install exactly from <code>package-lock.json</code>; fails if they disagree. Use in CI and Docker.</td></tr>
          <tr><td><code>npm i zod</code> / <code>npm i -D typescript</code></td><td>Adds a runtime dependency / a development-only dependency.</td></tr>
          <tr><td><code>npm uninstall zod</code></td><td>Removes a package and its entry.</td></tr>
          <tr><td><code>npm run &lt;name&gt;</code>, <code>npm start</code>, <code>npm test</code></td><td>Runs a script. Arguments after <code>--</code> go to the script.</td></tr>
          <tr><td><code>npm outdated</code> / <code>npm update</code></td><td>Lists newer versions / updates within your semver ranges.</td></tr>
          <tr><td><code>npm ls zod</code> / <code>npm explain zod</code></td><td>Shows which installed packages depend on a package, and why it is there.</td></tr>
          <tr><td><code>npm view express version</code></td><td>The latest published version, without installing.</td></tr>
          <tr><td><code>npm audit</code> / <code>npm audit fix</code></td><td>Known vulnerabilities in your dependency tree / safe upgrades.</td></tr>
          <tr><td><code>npx tsc</code></td><td>Runs a tool from <code>node_modules/.bin</code> (or downloads it).</td></tr>
          <tr><td><code>^1.4.2</code> / <code>~1.4.2</code> / <code>1.4.2</code></td><td>Any 1.x from 1.4.2 / any 1.4.x from 1.4.2 / exactly that version.</td></tr>
        </tbody>
      </TableWrap>

      <h2>Modules</h2>
      <CodeFile path="cheat-sheet/modules.ts" />
      <CodeFile path="cheat-sheet/lib/math.ts" />
      <CodeFile path="cheat-sheet/legacy.cjs" />
      <CodeFile path="cheat-sheet/legacy.d.cts" />
      <TableWrap>
        <thead>
          <tr><th></th><th>ES modules</th><th>CommonJS</th></tr>
        </thead>
        <tbody>
          <tr><td>Files</td><td><code>.ts</code>/<code>.js</code> with <code>"type": "module"</code>, or <code>.mts</code>/<code>.mjs</code></td><td><code>.cts</code>/<code>.cjs</code>, or <code>.js</code> without <code>"type": "module"</code></td></tr>
          <tr><td>Syntax</td><td><code>import</code> / <code>export</code></td><td><code>require()</code> / <code>module.exports</code></td></tr>
          <tr><td>Own path</td><td><code>import.meta.filename</code>, <code>import.meta.dirname</code></td><td><code>__filename</code>, <code>__dirname</code></td></tr>
          <tr><td>Top-level <code>await</code></td><td>Yes</td><td>No</td></tr>
          <tr><td>Loading the other kind</td><td><code>import</code> works on CommonJS</td><td><code>require()</code> works on ES modules without top-level await (Node 22.12+)</td></tr>
        </tbody>
      </TableWrap>

      <h2>Files, paths, process and os</h2>
      <CodeFile path="cheat-sheet/files.ts" />
      <TableWrap>
        <thead>
          <tr><th>Need</th><th>Use</th></tr>
        </thead>
        <tbody>
          <tr><td>Arguments</td><td><code>process.argv.slice(2)</code>, or <code>util.parseArgs</code> for flags</td></tr>
          <tr><td>Environment</td><td><code>process.env.NAME</code> (always a string or <code>undefined</code>)</td></tr>
          <tr><td>Exit status</td><td><code>process.exitCode = 1</code> and return; <code>process.exit(1)</code> only when you must stop now</td></tr>
          <tr><td>Output</td><td><code>console.log</code> → stdout, <code>console.error</code> → stderr</td></tr>
          <tr><td>Working folder vs file folder</td><td><code>process.cwd()</code> (where the command ran) vs <code>import.meta.dirname</code> (where the file is)</td></tr>
          <tr><td>Signals</td><td><code>process.once('SIGTERM', shutdown)</code></td></tr>
          <tr><td>Machine</td><td><code>os.availableParallelism()</code>, <code>os.totalmem()</code>, <code>os.tmpdir()</code>, <code>os.homedir()</code>, <code>os.EOL</code></td></tr>
          <tr><td>Common error codes</td><td><code>ENOENT</code> no such file · <code>EEXIST</code> already exists · <code>EACCES</code>/<code>EPERM</code> permission · <code>EADDRINUSE</code> port taken · <code>ECONNREFUSED</code> nothing listening</td></tr>
        </tbody>
      </TableWrap>

      <h2>Async patterns</h2>
      <CodeFile path="cheat-sheet/async.ts" />
      <TableWrap>
        <thead>
          <tr><th>Combinator</th><th>Settles when</th><th>Rejects when</th></tr>
        </thead>
        <tbody>
          <tr><td><code>Promise.all</code></td><td>All fulfil (results in input order)</td><td>Any rejects (the others keep running)</td></tr>
          <tr><td><code>Promise.allSettled</code></td><td>All settle</td><td>Never</td></tr>
          <tr><td><code>Promise.race</code></td><td>The first settles, either way</td><td>The first to settle rejects</td></tr>
          <tr><td><code>Promise.any</code></td><td>The first fulfils</td><td>All reject (<code>AggregateError</code>)</td></tr>
        </tbody>
      </TableWrap>
      <TableWrap>
        <thead>
          <tr><th>Callback order in one turn of the loop</th></tr>
        </thead>
        <tbody>
          <tr><td>Synchronous code → <code>process.nextTick</code> queue → promise microtasks → timers (<code>setTimeout</code>) → I/O callbacks → <code>setImmediate</code> → close callbacks. Microtasks also run after every single callback. (In an ES module's top-level code, promise callbacks run before nextTick callbacks; see chapter 07.)</td></tr>
        </tbody>
      </TableWrap>

      <h2>Events, streams and buffers</h2>
      <CodeFile path="cheat-sheet/events-streams.ts" />
      <TableWrap>
        <thead>
          <tr><th>Stream type</th><th>Examples</th><th>Key API</th></tr>
        </thead>
        <tbody>
          <tr><td>Readable</td><td><code>fs.createReadStream</code>, an HTTP request, <code>process.stdin</code></td><td><code>for await</code>, <code>'data'</code>/<code>'end'</code>, <code>Readable.from(iterable)</code></td></tr>
          <tr><td>Writable</td><td><code>fs.createWriteStream</code>, an HTTP response, <code>process.stdout</code></td><td><code>write()</code> returns <code>false</code> when full → wait for <code>'drain'</code>; <code>end()</code></td></tr>
          <tr><td>Transform</td><td><code>zlib.createGzip()</code>, a CSV parser</td><td><code>transform(chunk, encoding, callback)</code></td></tr>
          <tr><td>Duplex</td><td>A TCP socket</td><td>Readable and writable sides</td></tr>
          <tr><td>Connect them</td><td colSpan={2}><code>await pipeline(a, b, c)</code> from <code>node:stream/promises</code>: handles backpressure, errors and cleanup. Avoid bare <code>.pipe()</code>.</td></tr>
        </tbody>
      </TableWrap>

      <h2>HTTP and fetch</h2>
      <CodeFile path="cheat-sheet/http-fetch.ts" />
      <TableWrap>
        <thead>
          <tr><th>Status</th><th>Use for</th></tr>
        </thead>
        <tbody>
          <tr><td>200 OK · 201 Created · 204 No Content</td><td>Success; 201 with a <code>Location</code> header after creating; 204 after a delete</td></tr>
          <tr><td>400 Bad Request · 422 Unprocessable</td><td>Malformed input / input that fails validation (pick one convention)</td></tr>
          <tr><td>401 Unauthorized · 403 Forbidden</td><td>Not logged in / logged in but not allowed</td></tr>
          <tr><td>404 Not Found · 409 Conflict</td><td>No such resource / clashes with current state (duplicate email)</td></tr>
          <tr><td>429 Too Many Requests</td><td>Rate limit hit</td></tr>
          <tr><td>500 · 502 · 503</td><td>Your bug / bad upstream response / temporarily unavailable</td></tr>
        </tbody>
      </TableWrap>

      <h2>Testing with node:test</h2>
      <CodeFile path="cheat-sheet/example.test.ts" />
      <Terminal>{`
node --test                                  # every *.test.ts under the current folder
node --test --watch                          # rerun on change
node --test --test-name-pattern="area"       # only matching tests
node --test --experimental-test-coverage     # with a coverage report`}</Terminal>

      <h2>Debugging and diagnostics</h2>
      <TableWrap>
        <thead>
          <tr><th>Question</th><th>Tool</th></tr>
        </thead>
        <tbody>
          <tr><td>Step through code</td><td><code>node --inspect-brk file.ts</code>, then <code>chrome://inspect</code>; or VS Code's <em>JavaScript Debug Terminal</em></td></tr>
          <tr><td>Where is the CPU time?</td><td><code>--cpu-prof</code>, then DevTools Performance panel or a self-time script</td></tr>
          <tr><td>Is the event loop blocked?</td><td><code>monitorEventLoopDelay()</code> from <code>node:perf_hooks</code></td></tr>
          <tr><td>Is memory leaking?</td><td><code>process.memoryUsage().heapUsed</code> over time, then two heap snapshots compared</td></tr>
          <tr><td>What is keeping the process alive?</td><td>Active handles: unclosed servers, sockets, intervals. <code>timer.unref()</code> lets a timer not count</td></tr>
          <tr><td>Who printed this warning?</td><td><code>--trace-warnings</code></td></tr>
          <tr><td>Time a block</td><td><code>performance.now()</code> before and after; <code>console.time('x')</code> / <code>console.timeEnd('x')</code> for quick checks</td></tr>
        </tbody>
      </TableWrap>

      <h2>The course tsconfig</h2>
      <CodeFile path="01-hello-node/tsconfig.json" />
      <Box kind="key" label="TypeScript on Node 24, in four rules">
        <ol>
          <li>Relative imports end in <code>.ts</code>.</li>
          <li>Type-only imports use <code>import type</code> (or <code>type</code> inside the braces).</li>
          <li>No <code>enum</code>, <code>namespace</code> or constructor parameter properties: use unions, objects and plain fields.</li>
          <li>Run <code>tsc</code> (it checks; Node does not), and validate untrusted data at run time.</li>
        </ol>
      </Box>
    </>
  );
}
