import type { ReactNode } from 'react';
import { Code } from '../components/Code';
import { Box } from '../components/Content';

type Question = {
  q: ReactNode;
  code?: string; // a snippet to read before answering; every one was run on Node 24
  ch: string; // chapter(s) that teach it
  a: ReactNode;
};

const GROUPS: { title: string; items: Question[] }[] = [
  {
    title: 'Runtime and event loop',
    items: [
      {
        q: 'What is Node.js, and what is it built from?',
        ch: '02',
        a: <p>A JavaScript runtime for servers and tools. <strong>V8</strong> compiles and runs the JavaScript and collects garbage. <strong>libuv</strong> provides the event loop, asynchronous I/O through the operating system (epoll, kqueue, IOCP) and a thread pool. On top sits the standard library (<code>node:fs</code>, <code>node:http</code>…), written in JavaScript with C++ bindings, plus libraries such as OpenSSL, llhttp and zlib.</p>,
      },
      {
        q: 'Is Node.js single-threaded?',
        ch: '02, 07, 16',
        a: <p>Your JavaScript runs on one main thread with one call stack, so two of your callbacks never run at the same moment. The process has other threads, though: libuv's thread pool (4 by default) for file system work, <code>dns.lookup</code>, some crypto and zlib; V8's background threads for garbage collection and compilation; and any worker threads you start. "Single-threaded" describes the programming model, not the process.</p>,
      },
      {
        q: 'Walk through the phases of the event loop.',
        ch: '07',
        a: <p><strong>Timers</strong> (due <code>setTimeout</code>/<code>setInterval</code> callbacks) → <strong>pending callbacks</strong> (some deferred system callbacks) → idle/prepare (internal) → <strong>poll</strong> (wait for I/O and run its callbacks; the loop blocks here when there is nothing else to do) → <strong>check</strong> (<code>setImmediate</code>) → <strong>close callbacks</strong> (<code>'close'</code> events). After every callback, Node drains the <code>process.nextTick</code> queue, then the promise microtask queue. The loop ends, and the process exits, when no handles or requests are left.</p>,
      },
      {
        q: <>How do <code>process.nextTick</code>, <code>setImmediate</code> and <code>setTimeout(fn, 0)</code> differ?</>,
        ch: '07',
        a: <p><code>nextTick</code> runs as soon as the current operation finishes, before promise callbacks and before the loop moves on; calling it recursively starves I/O. <code>setImmediate</code> runs in the check phase, right after poll. <code>setTimeout(fn, 0)</code> runs in the timers phase after at least 1 ms. From the main module the order of a zero timeout and an immediate is not guaranteed; inside an I/O callback, the immediate always runs first.</p>,
      },
      {
        q: 'What does this print, and why?',
        code: `import { readFile } from 'node:fs';

readFile(import.meta.filename, () => {
  setTimeout(() => console.log('timeout'), 0);
  setImmediate(() => console.log('immediate'));
  process.nextTick(() => console.log('nextTick'));
  Promise.resolve().then(() => console.log('promise'));
  console.log('sync');
});`,
        ch: '07',
        a: <><p><code>sync</code>, <code>nextTick</code>, <code>promise</code>, <code>immediate</code>, <code>timeout</code>.</p><p>The callback's synchronous code runs first. Then the nextTick queue, then microtasks. The callback ran in the poll phase, so the next phase is check (<code>setImmediate</code>), and timers only come round on the next iteration.</p></>,
      },
      {
        q: <>The same five lines print in a different order when the file is <code>order.mjs</code> instead of <code>order.cjs</code>. What are the two orders, and why?</>,
        code: `console.log('A');
setTimeout(() => console.log('B'), 0);
Promise.resolve().then(() => console.log('C'));
process.nextTick(() => console.log('D'));
console.log('E');`,
        ch: '04, 07',
        a: <><p>CommonJS prints <code>A E D C B</code>; an ES module prints <code>A E C D B</code>.</p><p>A CommonJS script runs synchronously; when it finishes, Node drains the nextTick queue first, then the promise queue. An ES module's top-level code runs as part of promise-based module evaluation, inside V8's microtask processing, so the promise callback queued there runs in the same microtask drain, before Node gets to the nextTick queue. The lesson: never rely on the relative order of nextTick and promise callbacks.</p></>,
      },
      {
        q: "What runs on libuv's thread pool, and how do you size it?",
        ch: '07',
        a: <p>File system operations, <code>dns.lookup</code>, the async forms of <code>crypto.pbkdf2</code>, <code>scrypt</code>, <code>randomBytes</code> and <code>randomFill</code>, and async zlib. Network sockets do not use it: they use the OS's own async I/O. It has 4 threads by default; set <code>UV_THREADPOOL_SIZE</code> (up to 1024) before the pool is first used, ideally in the environment. The symptom of a too-small pool is many file reads or hashes queueing behind each other while the CPU is idle.</p>,
      },
      {
        q: 'What blocks the event loop, and how do you detect it?',
        ch: '07, 16, 17',
        a: <p>Long synchronous work: <code>*Sync</code> file, crypto and zlib calls, <code>JSON.parse</code>/<code>stringify</code> of huge payloads, CPU-heavy loops, sorting huge arrays, and regular expressions that backtrack catastrophically. Detect it with event-loop delay (<code>monitorEventLoopDelay</code>, alert on p99), the latency of a trivial endpoint under load, and a CPU profile. Fix it with async APIs, smaller chunks of work, streaming, or worker threads.</p>,
      },
    ],
  },
  {
    title: 'Asynchronous code',
    items: [
      {
        q: 'How do error-first callbacks, promises and async/await relate?',
        ch: '06',
        a: <p>The original Node convention is <code>callback(err, result)</code>. A promise represents a future value; errors propagate along the chain to <code>.catch</code>. <code>async</code>/<code>await</code> is syntax over promises: <code>await</code> suspends the async function, not the thread, and a rejected promise becomes a thrown error you can <code>try/catch</code>. <code>util.promisify</code> converts callback APIs, and most core modules have promise versions (<code>fs/promises</code>, <code>timers/promises</code>, <code>stream/promises</code>).</p>,
      },
      {
        q: <>Compare <code>Promise.all</code>, <code>allSettled</code>, <code>race</code> and <code>any</code>.</>,
        ch: '06',
        a: <p><code>all</code> fulfils with every result in input order, or rejects with the first rejection. <code>allSettled</code> always fulfils with a status for each. <code>race</code> settles like whichever settles first. <code>any</code> fulfils with the first success and rejects with an <code>AggregateError</code> only if all fail. None of them cancels the losers.</p>,
      },
      {
        q: 'What happens to a promise rejection nobody handles?',
        ch: '06, 14',
        a: <p>Since Node 15 the default mode is <code>throw</code>: the rejection is raised as an uncaught exception, the error is printed, and the process exits with code 1, unless an <code>'unhandledRejection'</code> listener exists. So every promise must be awaited or have a <code>.catch</code>, including "fire and forget" calls.</p>,
      },
      {
        q: 'What does this print?',
        code: `import { setTimeout as sleep } from 'node:timers/promises';

const ids = [1, 2, 3];
ids.forEach(async (id) => {
  await sleep(10 * (4 - id));
  console.log('done', id);
});
console.log('all done?');`,
        ch: '06',
        a: <><p><code>all done?</code>, then <code>done 3</code>, <code>done 2</code>, <code>done 1</code>.</p><p><code>forEach</code> ignores the promises its callback returns, so nothing waits. Use <code>for (const id of ids) await …</code> to run them in order, or <code>await Promise.all(ids.map(async (id) =&gt; …))</code> to run them in parallel and wait for all.</p></>,
      },
      {
        q: 'What does this print?',
        code: `import { setTimeout as sleep } from 'node:timers/promises';

await Promise.all([
  sleep(50).then(() => console.log('slow task finished')),
  Promise.reject(new Error('fast failure')),
]).catch((error) => console.log('caught:', error.message));
await sleep(100);`,
        ch: '06',
        a: <><p><code>caught: fast failure</code>, then <code>slow task finished</code>.</p><p><code>Promise.all</code> rejects as soon as one input rejects, but the other operations keep running: a promise is a result, not a handle you can stop. To actually stop them, pass an <code>AbortSignal</code> and abort it.</p></>,
      },
      {
        q: 'What is the cost of awaiting in a loop, and what is the risk of the obvious fix?',
        ch: '06',
        a: <p>Sequential <code>await</code>s take the sum of all durations; <code>Promise.all</code> takes roughly the longest one. But starting 10,000 requests at once can exhaust sockets, memory or a database's connection limit, or hit rate limits. Use a concurrency limit: a small pool of workers pulling from a queue (or a helper such as <code>p-limit</code>).</p>,
      },
      {
        q: 'How do you cancel an asynchronous operation?',
        ch: '06',
        a: <p>With an <code>AbortController</code>: pass its <code>signal</code> to <code>fetch</code>, <code>timers/promises</code>, <code>fs.readFile</code>, <code>events.once</code>, <code>stream.pipeline</code> or <code>child_process</code>, and call <code>abort()</code>. <code>AbortSignal.timeout(ms)</code> gives a deadline and <code>AbortSignal.any([...])</code> combines signals. Your own async functions should accept a signal and call <code>signal.throwIfAborted()</code> between steps.</p>,
      },
    ],
  },
  {
    title: 'Modules and npm',
    items: [
      {
        q: 'How do ES modules and CommonJS differ?',
        ch: '04',
        a: <p>ES modules use <code>import</code>/<code>export</code>, which are static (analysable before running), load asynchronously, allow top-level <code>await</code>, export live bindings, are always strict, need full file extensions, and use <code>import.meta.dirname</code> instead of <code>__dirname</code>. CommonJS uses <code>require()</code>, which is synchronous and can be called anywhere, and <code>module.exports</code>. Node picks the system from the extension (<code>.mjs</code>/<code>.cjs</code>, <code>.mts</code>/<code>.cts</code>) or the nearest <code>package.json</code> <code>"type"</code>.</p>,
      },
      {
        q: 'Can CommonJS code load an ES module?',
        ch: '04',
        a: <p>Always with dynamic <code>import()</code>, which returns a promise. Since Node 22.12, <code>require()</code> can load an ES module synchronously too, unless its module graph uses top-level <code>await</code>, which fails with <code>ERR_REQUIRE_ASYNC_MODULE: require() cannot be used on an ESM graph with top-level await. Use import() instead.</code></p>,
      },
      {
        q: <>What are <code>dependencies</code>, <code>devDependencies</code> and <code>peerDependencies</code>?</>,
        ch: '03, 04',
        a: <p>Packages the code needs at run time; tools needed only to build and test (skipped by <code>npm ci --omit=dev</code> in production images); and packages a plugin expects its host project to provide, such as <code>react</code> for a component library, so there is only one copy. npm 7 and later install peer dependencies automatically.</p>,
      },
      {
        q: <>What does <code>package-lock.json</code> do, and when do you use <code>npm ci</code>?</>,
        ch: '03, 04',
        a: <p>The lockfile records the exact version and integrity hash of every package in the tree, including transitive ones, so every install is identical. Commit it. <code>npm install</code> may update it; <code>npm ci</code> deletes <code>node_modules</code> and installs exactly what the lockfile says, failing if it disagrees with <code>package.json</code>. Use <code>npm ci</code> in CI and Docker builds.</p>,
      },
      {
        q: <>Explain semver, and <code>^</code> versus <code>~</code>.</>,
        ch: '04',
        a: <p>MAJOR.MINOR.PATCH: breaking change, new feature, bug fix. <code>^1.4.2</code> accepts any 1.x from 1.4.2; <code>~1.4.2</code> accepts any 1.4.x from 1.4.2. Below 1.0, <code>^0.4.2</code> only accepts 0.4.x, because 0.x minors may break. Ranges are why the lockfile matters.</p>,
      },
      {
        q: <>What is the <code>exports</code> field in <code>package.json</code>?</>,
        ch: '04',
        a: <p>It declares a package's public entry points, optionally with conditions (<code>import</code>, <code>require</code>, <code>types</code>, <code>default</code>). Files it does not list cannot be imported by consumers, which turns internal files into private implementation. The related <code>imports</code> field defines private <code>#aliases</code> inside a package.</p>,
      },
    ],
  },
  {
    title: 'Streams and buffers',
    items: [
      {
        q: 'What is a stream, and what are the four kinds?',
        ch: '09',
        a: <p>A way to process data piece by piece instead of loading it all into memory. <strong>Readable</strong> (a file being read, an HTTP request), <strong>Writable</strong> (a file being written, an HTTP response), <strong>Duplex</strong> (both, independently: a TCP socket) and <strong>Transform</strong> (a duplex whose output is computed from its input: gzip). Streams are event emitters and readables are async iterables.</p>,
      },
      {
        q: 'What is backpressure?',
        ch: '09',
        a: <p>What happens when a producer writes faster than the consumer can take. <code>writable.write()</code> returns <code>false</code> once the internal buffer passes its <code>highWaterMark</code>; the producer should pause until <code>'drain'</code>. <code>pipeline()</code> and <code>pipe()</code> do this for you. Ignoring the return value lets the buffer grow until the process runs out of memory.</p>,
      },
      {
        q: <>Why use <code>stream.pipeline</code> rather than <code>.pipe()</code>?</>,
        ch: '09',
        a: <p><code>.pipe()</code> does not forward errors and does not destroy the other streams when one fails, which leaks file descriptors and can hang a request. <code>pipeline</code> propagates the first error, destroys every stream in the chain, and, from <code>node:stream/promises</code>, returns a promise you can await.</p>,
      },
      {
        q: 'What does this print in an ES module?',
        code: `console.log('héllo'.length, Buffer.from('héllo').length, typeof require, typeof __dirname);`,
        ch: '04, 09',
        a: <><p><code>5 6 undefined undefined</code>.</p><p>A string's length counts UTF-16 code units; a Buffer holds bytes, and <code>é</code> takes two bytes in UTF-8. Always size and slice binary data by bytes. <code>require</code> and <code>__dirname</code> do not exist in ES modules; use <code>import</code>, <code>createRequire</code> and <code>import.meta.dirname</code>.</p></>,
      },
      {
        q: <>What is the difference between <code>Buffer.alloc</code> and <code>Buffer.allocUnsafe</code>?</>,
        ch: '09',
        a: <p><code>alloc(n)</code> returns zero-filled memory. <code>allocUnsafe(n)</code> skips the zeroing, so it is faster but may contain old data from the process, possibly secrets. Use it only when you overwrite every byte straight away. The old <code>new Buffer()</code> constructor is deprecated for this reason.</p>,
      },
    ],
  },
  {
    title: 'HTTP and Express',
    items: [
      {
        q: <>What does Express add on top of <code>node:http</code>?</>,
        ch: '10, 11',
        a: <p>Routing with path parameters, a middleware chain, sub-routers, request and response helpers (<code>req.query</code>, <code>res.status().json()</code>), body parsing, and central error handling. <code>node:http</code> gives you a raw request stream and a response; you parse URLs, read bodies and set headers yourself.</p>,
      },
      {
        q: 'How does middleware work, and why does order matter?',
        ch: '11',
        a: <p>Middleware are functions <code>(req, res, next)</code> run in the order they are registered. Each one either ends the response, or changes <code>req</code>/<code>res</code> and calls <code>next()</code>. <code>next(err)</code> skips to error middleware, which has four parameters. So the JSON body parser must come before routes that read <code>req.body</code>, the 404 handler after all routes, and the error handler last.</p>,
      },
      {
        q: 'How do errors in async route handlers reach the error handler, in Express 5 and in Express 4?',
        ch: '11',
        a: <p>In Express 5, if a handler returns a rejected promise (an <code>async</code> handler throws), Express calls <code>next(err)</code> for you. In Express 4 it did not: the request hung and the rejection went unhandled, so every async handler needed <code>try/catch</code> with <code>next(err)</code>, or a wrapper package.</p>,
      },
      {
        q: <>What causes <code>Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client</code>?</>,
        ch: '10, 11',
        a: <p>Responding twice to one request: a missing <code>return</code> after <code>res.json()</code> in an <code>if</code> branch, calling <code>next()</code> after sending, or both a callback and a promise path answering. Return immediately after sending a response, and make sure each code path sends exactly one.</p>,
      },
      {
        q: 'POST, PUT, PATCH and DELETE: what does each mean, and which are idempotent?',
        ch: '10, 11',
        a: <p>POST creates (or triggers an action) and is not idempotent: two calls create two things. PUT replaces the whole resource at a known URL and is idempotent. PATCH changes part of a resource and is not guaranteed idempotent. DELETE removes and is idempotent. GET is safe and idempotent. Idempotent requests can be retried safely after a timeout.</p>,
      },
      {
        q: 'Why validate request data at the boundary, and how?',
        ch: '03, 11',
        a: <p>TypeScript types disappear at run time, so a request body is really <code>unknown</code> whatever its annotation says. Validate it once, where it enters, with a schema library such as Zod; derive the TypeScript type from the schema with <code>z.infer</code>; answer 400 or 422 with the details when it fails. The code behind the boundary can then trust its types.</p>,
      },
    ],
  },
  {
    title: 'Databases',
    items: [
      {
        q: 'Why use parameterised queries?',
        ch: '12, 18',
        a: <p>They send values separately from the SQL text, so input can never change the query's structure: that prevents SQL injection. They also let the database reuse query plans. In <code>node:sqlite</code>: <code>db.prepare('SELECT * FROM tasks WHERE id = ?').get(id)</code>; in <code>pg</code>: <code>pool.query('… WHERE id = $1', [id])</code>. Never build SQL with template strings.</p>,
      },
      {
        q: 'What is a connection pool, and how big should it be?',
        ch: '18',
        a: <p>A fixed set of open database connections that queries borrow and return, because opening one costs a TCP handshake, TLS and authentication. Keep it small, often around 10 per process: the database does not get faster with more concurrent queries, and the total across all replicas must stay below its <code>max_connections</code>.</p>,
      },
      {
        q: 'How do you run a transaction with a pool?',
        ch: '12, 18',
        a: <p>Check out one client (<code>await pool.connect()</code>), run <code>BEGIN</code>, every query and <code>COMMIT</code> on that same client, <code>ROLLBACK</code> in the <code>catch</code>, and <code>release()</code> it in <code>finally</code>. Calling <code>pool.query()</code> for each statement may use a different connection each time, which is not a transaction at all.</p>,
      },
      {
        q: 'What is the N+1 query problem?',
        ch: '12, 18',
        a: <p>One query fetches a list, then one more query runs per item: 101 round trips for 100 rows. Fix it with a <code>JOIN</code>, or one query with <code>WHERE id = ANY($1)</code> / <code>IN (…)</code>, or batching (the DataLoader pattern).</p>,
      },
      {
        q: 'Why put data access behind a repository interface?',
        ch: '12, 13, 18',
        a: <p>Routes and services then depend on an interface (<code>findById</code>, <code>create</code>…) instead of a database. You can swap SQLite for PostgreSQL without touching them, use an in-memory fake in unit tests, and keep all SQL in one place.</p>,
      },
    ],
  },
  {
    title: 'Testing',
    items: [
      {
        q: 'Unit, integration and end-to-end tests: what is the difference?',
        ch: '13',
        a: <p>A unit test checks one function or class in isolation, with fakes for its dependencies, and runs in milliseconds. An integration test checks pieces together, such as the HTTP layer with a real database. An end-to-end test drives the whole deployed system as a user would. Have many unit tests, fewer integration tests and a handful of end-to-end tests.</p>,
      },
      {
        q: 'How do you test an HTTP API without hard-coding a port?',
        ch: '13',
        a: <p>Export the app separately from the code that starts it. In the test, call <code>listen(0)</code> so the OS picks a free port, read it from <code>server.address().port</code>, send requests with <code>fetch</code>, and close the server in an <code>after</code> hook. Tests can then run in parallel without clashing.</p>,
      },
      {
        q: 'How do you test code that depends on timers or the clock?',
        ch: '13',
        a: <p>With fake time: in <code>node:test</code>, <code>t.mock.timers.enable({'{ apis: [\'setTimeout\', \'Date\'] }'})</code> and <code>tick(ms)</code> move time instantly. Alternatively inject a clock function. Never <code>sleep</code> for real in a test: it is slow and flaky.</p>,
      },
      {
        q: 'What makes Node tests flaky?',
        ch: '13',
        a: <p>Shared state between tests (database rows, module-level singletons), real time, fixed ports, tests that depend on running order, real network calls, and promises that were not awaited, so the test finishes before the assertion runs. Give each test fresh state, use port 0 and fake timers, and await everything.</p>,
      },
    ],
  },
  {
    title: 'Security',
    items: [
      {
        q: 'How should passwords be stored?',
        ch: '15',
        a: <p>Never in plain text and never with a fast hash such as SHA-256. Use a deliberately slow, salted key-derivation function: <code>scrypt</code> (built into <code>node:crypto</code>), Argon2id or bcrypt, with a random salt per user. Compare hashes with <code>crypto.timingSafeEqual</code>, and use the async API so hashing does not block the event loop.</p>,
      },
      {
        q: 'JWTs or server-side sessions?',
        ch: '15',
        a: <p>A JWT is a signed token the server can verify without a lookup, which suits several services; but it cannot easily be revoked before it expires, so keep it short-lived and refresh it. Its payload is only base64-encoded, so never put secrets in it, and always verify the signature and algorithm. A session keeps state on the server (for example in Redis) and puts only an id in a cookie, which makes logout and revocation trivial. Either way, an <code>httpOnly</code>, <code>Secure</code>, <code>SameSite</code> cookie protects the credential from JavaScript better than <code>localStorage</code>.</p>,
      },
      {
        q: 'Name the injection attacks that affect Node services, with their defences.',
        ch: '12, 15, 16',
        a: <p>SQL injection: parameterised queries. Command injection: <code>execFile</code>/<code>spawn</code> with an argument array, never <code>exec</code> with input. NoSQL injection (objects such as <code>{'{ "$gt": "" }'}</code> in a query): schema validation. Path traversal (<code>../../etc/passwd</code>): resolve the path and check it stays inside the allowed folder. Prototype pollution (<code>__proto__</code> keys): validate input and avoid deep-merging untrusted objects. Cross-site scripting: escape output.</p>,
      },
      {
        q: 'What do helmet and CORS do?',
        ch: '15',
        a: <p>helmet sets protective response headers: <code>Content-Security-Policy</code>, <code>Strict-Transport-Security</code>, <code>X-Content-Type-Options: nosniff</code>, frame protection, and it removes <code>X-Powered-By</code>. CORS is a browser rule: the server lists which other origins may read its responses (<code>Access-Control-Allow-Origin</code>). CORS is not authentication, and <code>*</code> must not be combined with credentials.</p>,
      },
      {
        q: 'How do you reduce supply-chain risk from npm?',
        ch: '04, 15',
        a: <p>Depend on fewer, well-maintained packages; commit the lockfile and install with <code>npm ci</code>; run <code>npm audit</code> in CI; review dependency updates (Dependabot, Renovate) rather than taking them blindly; consider <code>--ignore-scripts</code> for installs; and keep production secrets out of build environments that run third-party install scripts.</p>,
      },
    ],
  },
  {
    title: 'Performance and scaling',
    items: [
      {
        q: 'Worker threads, child processes or cluster: when do you use each?',
        ch: '16',
        a: <p>Worker threads: CPU-heavy JavaScript that would block the event loop, run in a pool inside the same process. Child processes: running other programs, or isolating risky work in its own memory. Cluster: several copies of a whole server sharing a port to use all cores of one machine. In containers, usually one process per container with more replicas instead of cluster, plus a worker pool for CPU-heavy endpoints.</p>,
      },
      {
        q: 'How do you find a memory leak?',
        ch: '17',
        a: <p>Confirm it first: under steady load, <code>heapUsed</code> keeps rising and does not come back after the load stops. Then take a heap snapshot, apply the suspect load, take another, and compare (DevTools' Comparison view, or a diff script): the type that grew, and its retainers, lead to the code holding it. Common causes are unbounded caches and Maps, listeners never removed, intervals never cleared and arrays that only grow.</p>,
      },
      {
        q: 'An endpoint is slow. How do you find out why?',
        ch: '17',
        a: <p>Reproduce it with a load test and record latency percentiles. Check event-loop delay: if it is high, the process is computing, so take a CPU profile and look at self time. If it is low, the time is spent waiting, so time the database queries and outgoing calls (logs with durations, tracing). Fix the biggest cost first, then measure again against the baseline.</p>,
      },
      {
        q: 'Why must a horizontally scaled Node service be stateless?',
        ch: '16, 19',
        a: <p>Each request can land on any instance, and each instance has its own memory. Sessions, caches, rate-limit counters or uploaded files kept in a process would differ between instances and vanish when one restarts. Keep shared state in a database, Redis or object storage; sticky sessions only hide the problem.</p>,
      },
    ],
  },
  {
    title: 'TypeScript on Node',
    items: [
      {
        q: 'How does Node 24 run TypeScript files?',
        ch: '03',
        a: <p>By <strong>type stripping</strong>: the bundled Amaro library (based on SWC) replaces type annotations with whitespace and Node runs the JavaScript that remains, so line and column numbers stay the same. It does not check types, does not read <code>tsconfig.json</code>, only accepts erasable syntax, and does not strip files inside <code>node_modules</code>.</p>,
      },
      {
        q: <>Why do imports end in <code>.ts</code>, and what does <code>erasableSyntaxOnly</code> protect you from?</>,
        ch: '03',
        a: <p>Node's ES module loader looks for the exact file name and never adds an extension, so <code>'./db'</code> fails while <code>'./db.ts'</code> works (<code>allowImportingTsExtensions</code> lets tsc accept it). <code>erasableSyntaxOnly</code> makes tsc reject syntax that generates code (<code>enum</code>, <code>namespace</code>, constructor parameter properties, <code>export =</code>), which type stripping cannot run.</p>,
      },
      {
        q: 'Types disappear at run time. What follows from that?',
        ch: '03, 11',
        a: <p>Anything from outside (request bodies, <code>JSON.parse</code>, environment variables, database rows, messages) must be checked by code, not by annotations: treat it as <code>unknown</code> and validate it. An <code>as</code> cast is a promise to the compiler, not a check. Run <code>tsc</code> in CI, because Node will happily run code with type errors.</p>,
      },
      {
        q: 'Should you compile TypeScript to JavaScript for production?',
        ch: '19',
        a: <p>On Node 24 you can run <code>.ts</code> directly, which removes a build step. Compiling with <code>tsc</code> still makes sense when you want slightly faster start-up, need syntax that cannot be stripped, publish a library others import, or want source maps for compiled output. Either way, type-check in CI.</p>,
      },
    ],
  },
  {
    title: 'Production and operations',
    items: [
      {
        q: 'What does a graceful shutdown do?',
        ch: '19',
        a: <p>On <code>SIGTERM</code>: report not-ready, stop accepting connections (<code>server.close()</code>), let in-flight requests finish and close idle keep-alive connections, close the database pool and other clients, flush logs, then exit with code 0. Add a timeout (say 10 seconds) that forces the exit, so the orchestrator never has to kill the process mid-request.</p>,
      },
      {
        q: 'What is the difference between liveness and readiness checks?',
        ch: '19',
        a: <p>Liveness asks "is the process alive and not stuck?"; failing it gets the process restarted. Readiness asks "can it serve traffic right now?" (started up, dependencies reachable, not shutting down); failing it only takes the instance out of the load balancer. Do not check the database in liveness, or a database outage restarts every instance in a loop.</p>,
      },
      {
        q: 'Why structured logging, and why a request id on every line?',
        ch: '14',
        a: <p>JSON logs with levels can be searched, filtered and turned into metrics by log tools. A request id ties together every line written while handling one request, even across services. <code>AsyncLocalStorage</code> carries it through async calls without passing it as a parameter. Never log passwords, tokens or personal data.</p>,
      },
      {
        q: 'How should a Node service read its configuration?',
        ch: '14',
        a: <p>From environment variables (the twelve-factor approach), validated all at once at start-up against a schema, failing fast with a clear message, and exposed to the rest of the code as one typed, read-only object. Secrets come from a secret manager into the environment. A <code>.env</code> file is for local development only and is never committed.</p>,
      },
      {
        q: <>What should a process do after an <code>uncaughtException</code>?</>,
        ch: '14, 19',
        a: <p>Log it and exit with a non-zero code. After an unexpected exception the process is in an unknown state (half-finished operations, leaked resources), so continuing to serve is dangerous. Let the supervisor (Kubernetes, ECS, systemd) start a fresh process. Use the handler only for logging and best-effort cleanup.</p>,
      },
    ],
  },
];

function QuestionItem({ item, n }: { item: Question; n: number }) {
  return (
    <li value={n}>
      <p><strong>{item.q}</strong></p>
      {item.code && <Code title="Read the code first">{item.code}</Code>}
      <details className="answer">
        <summary>Show answer</summary>
        <div className="answer-body">
          {item.a}
          <p><em>Taught in chapter {item.ch}.</em></p>
        </div>
      </details>
    </li>
  );
}

export function Interview() {
  const total = GROUPS.reduce((sum, g) => sum + g.items.length, 0);
  let n = 0;
  return (
    <>
      <div className="prose">
        <p>
          {total} questions that Node.js interviews keep coming back to, grouped by topic. Each answer is the core of a
          good spoken answer, and points to the chapter that teaches it in depth. Every "what does this print?" snippet
          was run on Node 24 to confirm its output.
        </p>
      </div>
      <Box kind="key" label="How to use this page">
        <ol>
          <li>Answer each question out loud, in two or three sentences, before you open the answer.</li>
          <li>For code questions, write down the output line by line first.</li>
          <li>If your answer misses the main point, reread the chapter, then come back in a few days.</li>
          <li>In a real interview, add an example from your own projects: "In the tasks API I…" is worth more than a definition.</li>
        </ol>
      </Box>
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h2>{group.title}</h2>
          <ol className="prose">
            {group.items.map((item) => {
              n += 1;
              return <QuestionItem key={n} item={item} n={n} />;
            })}
          </ol>
        </section>
      ))}
    </>
  );
}
