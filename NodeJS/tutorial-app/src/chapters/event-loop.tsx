import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { eventLoopPhases } from '../diagrams/specs/runtime';

export function EventLoop() {
  return (
    <>
      <ChapterIntro
        time="2 hours"
        project="05-event-loop-lab"
        learn={[
          'The call stack, and why synchronous code always runs to completion',
          'The six steps of the event loop, and which callbacks run in each',
          'Microtasks: the nextTick queue and the promise queue, and the ES module exception',
          'When setTimeout(0) and setImmediate run in a predictable order, and when they do not',
          'How recursive nextTick starves everything else',
          'What blocking looks like in a real server, and how to measure it',
          'libuv’s thread pool: what uses it, and why a fifth password hash can take twice as long',
        ]}
        tools={[
          { name: 'console.trace()', what: 'Prints the current call stack.' },
          { name: 'process.nextTick, queueMicrotask', what: 'Queue work before the loop continues.' },
          { name: 'setImmediate', what: 'Run a callback in the check phase.' },
          { name: 'node:perf_hooks', what: 'monitorEventLoopDelay(), eventLoopUtilization().' },
          { name: 'UV_THREADPOOL_SIZE', what: 'Environment variable that sizes libuv’s thread pool.' },
        ]}
      />

      <h2>The call stack and run-to-completion</h2>
      <div className="prose">
        <p>
          The <strong>call stack</strong> records which function is running and who called it. Calling a function
          pushes a frame; returning pops it. When the stack is empty, your code has finished its current piece of work,
          and only then can Node pick the next callback from a queue.
        </p>
        <p>
          That gives JavaScript its most important guarantee: <strong>run-to-completion</strong>. Once a function
          starts, nothing else in your program runs until the stack is empty again: no timer, no network callback, no
          other request. Async functions are no exception: each stretch between two <code>await</code>s runs to
          completion. That is why chapter 06's <code>mapLimit</code> needed no locks, and also why a slow loop freezes
          everything.
        </p>
      </div>

      <h2>The loop, phase by phase</h2>
      <div className="prose">
        <p>
          After your script's top-level code has run, Node enters the <strong>event loop</strong>, implemented by
          libuv. Each turn of the loop visits the same phases in order. Each phase has its own queue of callbacks; the
          loop runs the callbacks that are ready, then moves on.
        </p>
      </div>
      <Diagram
        spec={eventLoopPhases}
        caption="One turn of the loop. The microtask queues are not a phase: they are emptied after every individual callback, in every phase."
      />
      <TableWrap>
        <thead>
          <tr><th>Phase</th><th>Runs</th><th>Examples</th></tr>
        </thead>
        <tbody>
          <tr><td>timers</td><td>Callbacks of timers whose time has come</td><td><code>setTimeout</code>, <code>setInterval</code></td></tr>
          <tr><td>pending callbacks</td><td>A few system callbacks deferred from the previous turn</td><td>Some TCP errors such as <code>ECONNREFUSED</code></td></tr>
          <tr><td>idle, prepare</td><td>Internal to Node; you never use them</td><td>—</td></tr>
          <tr><td>poll</td><td>Completed I/O callbacks. If nothing else is waiting, the loop <em>blocks here</em> until I/O arrives or the next timer is due</td><td><code>fs.readFile</code> callbacks, incoming HTTP requests, socket data</td></tr>
          <tr><td>check</td><td>Callbacks queued with <code>setImmediate</code>, always right after poll</td><td><code>setImmediate</code></td></tr>
          <tr><td>close callbacks</td><td><code>'close'</code> events of handles closed abruptly</td><td><code>socket.on('close')</code> after <code>socket.destroy()</code></td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The loop keeps turning while anything could still produce a callback: a pending timer, an open server or
          socket, an unfinished file read. When nothing is left, the process exits. That is why a script with a{' '}
          <code>setInterval</code> never ends, and why <code>timer.unref()</code> exists: it tells the loop not to stay
          alive just for that timer.
        </p>
      </div>

      <h2>Microtasks</h2>
      <div className="prose">
        <p>
          Two queues sit outside the phases. Node empties both after <em>every</em> callback, before the loop is allowed
          to continue:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Queue</th><th>Filled by</th><th>Order</th></tr>
        </thead>
        <tbody>
          <tr><td>nextTick queue</td><td><code>process.nextTick(fn)</code></td><td>Emptied first, completely, including ticks added while emptying it</td></tr>
          <tr><td>Microtask (promise) queue</td><td><code>.then</code>/<code>.catch</code>/<code>.finally</code> callbacks, code after <code>await</code>, <code>queueMicrotask(fn)</code></td><td>Emptied next, completely. Then Node checks the nextTick queue again, and repeats until both are empty</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Set up the lab</Step>
      <Terminal>{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS/projects
mkdir -p 05-event-loop-lab/src && cd 05-event-loop-lab
cp ../01-hello-node/{tsconfig.json,.gitignore,.node-version} .
npm init -y && npm pkg set type=module
npm install --save-dev typescript @types/node@24`}</Terminal>

      <Step n={2}>Run to completion</Step>
      <CodeFile path="05-event-loop-lab/src/01-run-to-completion.ts" />
      <Terminal>{`node src/01-run-to-completion.ts`}</Terminal>
      <Output>{`
Trace: the call stack right now
    at inner (file://~/…/projects/05-event-loop-lab/src/01-run-to-completion.ts:2:11)
    at outer (file://~/…/projects/05-event-loop-lab/src/01-run-to-completion.ts:5:3)
    at file://~/…/projects/05-event-loop-lab/src/01-run-to-completion.ts:7:1
    at ModuleJob.run (node:internal/modules/esm/module_job:561:25)
    …
busy loop finished; only now can the timer run
timer asked for 0 ms, ran after 200 ms`}</Output>
      <div className="prose">
        <p>
          The trace reads innermost first: <code>inner</code>, called by <code>outer</code>, called by the module's top
          level, called by Node's module loader. Every stack trace you will ever debug has this shape. The timer then
          proves the guarantee: it was due after 0 ms (really 1 ms; Node rounds 0 up), but it could only run once the
          busy loop had finished and the stack was empty. A timer's delay is a <em>minimum</em>, never a promise.
        </p>
      </div>

      <Step n={3}>The ordering puzzle</Step>
      <div className="prose">
        <p>Read this file and write down the order of the eight lines it prints before you run it.</p>
      </div>
      <CodeFile path="05-event-loop-lab/src/02-order-puzzle.ts" />
      <Terminal>{`node src/02-order-puzzle.ts`}</Terminal>
      <Output>{`
sync: start of the I/O callback
sync: end of the I/O callback
nextTick
promise.then
queueMicrotask
nextTick queued by promise.then
setImmediate
nextTick queued by setImmediate
setTimeout 0`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Lines</th><th>Why they come there</th></tr>
        </thead>
        <tbody>
          <tr><td>Both <code>sync</code> lines</td><td>The callback runs to completion; everything else was only queued.</td></tr>
          <tr><td><code>nextTick</code></td><td>The callback finished, so Node empties the nextTick queue first.</td></tr>
          <tr><td><code>promise.then</code>, <code>queueMicrotask</code></td><td>Then the promise queue, in the order they were queued.</td></tr>
          <tr><td><code>nextTick queued by promise.then</code></td><td>It was added while the promise queue was being emptied, so it runs when Node checks the nextTick queue again, before the loop moves on.</td></tr>
          <tr><td><code>setImmediate</code></td><td>The loop was in the poll phase (an I/O callback); check comes next.</td></tr>
          <tr><td><code>nextTick queued by setImmediate</code></td><td>Microtasks run after each callback, so it runs before anything else in the loop.</td></tr>
          <tr><td><code>setTimeout 0</code></td><td>Timers only run when the loop comes round to the timers phase again.</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="The exception: the top level of an ES module">
        <p>Run the same three lines at the top level of an ES module, then in a CommonJS file:</p>
        <CodeFile path="05-event-loop-lab/src/08-esm-top-level.ts" />
        <Terminal>{`
node src/08-esm-top-level.ts
node src/08-esm-top-level.cts      # same code, CommonJS`}</Terminal>
        <Output panes={[
          { tag: '.ts (ES module)', text: 'sync\npromise.then\nnextTick' },
          { tag: '.cts (CommonJS)', text: 'sync\nnextTick\npromise.then' },
        ]} />
        <p>
          Node evaluates an ES module as part of a promise job, so the promise queue is already being emptied when the
          module body finishes, and <code>promise.then</code> slips in before the nextTick queue is checked. Inside any
          callback, and in CommonJS, the usual rule holds. That is why the puzzle runs inside an I/O callback. The
          practical lesson: never write code whose correctness depends on the order of <code>nextTick</code> versus
          promises.
        </p>
      </Box>

      <Step n={4}>setTimeout(0) versus setImmediate</Step>
      <CodeFile path="05-event-loop-lab/src/03-timeout-vs-immediate.ts" />
      <Terminal>{`
node src/03-timeout-vs-immediate.ts
node src/03-timeout-vs-immediate.ts --busy
node src/03-timeout-vs-immediate.ts --io
node src/03-timeout-vs-immediate.ts --io --busy`}</Terminal>
      <Output>{`
main module: immediate first
main module: timeout first
in an I/O callback: immediate first
in an I/O callback: immediate first`}</Output>
      <div className="prose">
        <p>
          From the main module the order depends on timing. A "0 ms" timer is due after 1 ms. If that millisecond has
          passed when the loop first reaches the timers phase, the timeout runs first; if not, the loop moves on through
          poll to check and the immediate wins. On a fast machine the immediate usually wins, which is why the{' '}
          <code>--busy</code> flag spends 2 ms to tip the balance. Run the first command several times: on a slower or
          busier machine you will see both orders. Inside an I/O callback the answer is fixed: the loop is in poll, and
          check always comes before the next timers phase.
        </p>
      </div>

      <Step n={5}>Starvation</Step>
      <CodeFile path="05-event-loop-lab/src/04-starvation.ts" />
      <Terminal>{`node src/04-starvation.ts`}</Terminal>
      <Output>{`
recursive nextTick  : the 0 ms timer ran after 100,000 of 100,000 calls
recursive setImmediate: the 0 ms timer ran after 60 of 100,000 calls`}</Output>
      <div className="prose">
        <p>
          A nextTick callback that schedules another nextTick keeps the queue from ever emptying, so the loop cannot
          reach timers or I/O until the recursion stops. <code>setImmediate</code> adds to the <em>next</em> check
          phase, so the loop turns between calls and the timer gets in almost at once (your exact number will differ).
          The same starvation happens with an endless chain of promise callbacks.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>You want to…</th><th>Use</th></tr>
        </thead>
        <tbody>
          <tr><td>Run something after the current code but before any I/O, such as emitting an event after a constructor returns</td><td><code>queueMicrotask</code> or <code>process.nextTick</code></td></tr>
          <tr><td>Defer work so I/O and timers can run first; split a long job into slices</td><td><code>setImmediate</code></td></tr>
          <tr><td>Wait a real amount of time</td><td><code>setTimeout</code> (or <code>timers/promises</code>)</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <code>queueMicrotask</code> is the web-standard choice and works in browsers too; Node's own documentation
          suggests it over <code>nextTick</code> for most new code.
        </p>
      </div>

      <Step n={6}>See blocking in a real server</Step>
      <div className="prose">
        <p>
          Theory is one thing; watching one user's request delay another's is what makes it stick. This server has
          three routes: <code>/wait</code> waits one second asynchronously, <code>/block</code> computes for one second
          on the main thread, and anything else answers immediately.
        </p>
      </div>
      <CodeFile path="05-event-loop-lab/src/05-server.ts" />
      <CodeFile path="05-event-loop-lab/src/05-client.ts" />
      <Terminal title="Terminal 1">{`node src/05-server.ts`}</Terminal>
      <Terminal title="Terminal 2">{`node src/05-client.ts`}</Terminal>
      <Output>{`
while /wait is running: /fast  answered after 7 ms
                         /wait  answered after 1025 ms
while /block is running: /fast  answered after 950 ms
                         /block answered after 1002 ms`}</Output>
      <div className="prose">
        <p>
          Both slow routes take a second, but they are completely different for everyone else. While{' '}
          <code>/wait</code> waits, the thread is free and <code>/fast</code> answers in a few milliseconds. While{' '}
          <code>/block</code> computes, <code>/fast</code> sits in the operating system's queue for the remaining 950 ms.
          Multiply by real traffic and one expensive endpoint degrades the whole service. Typical culprits: synchronous
          file or crypto calls (<code>readFileSync</code>, <code>pbkdf2Sync</code>), huge <code>JSON.parse</code> or{' '}
          <code>JSON.stringify</code>, sorting or looping over very large arrays, and badly written regular expressions.
        </p>
      </div>

      <Step n={7}>Measure the loop</Step>
      <div className="prose">
        <p>
          In production you cannot watch requests by hand, so measure the loop itself. <strong>Event-loop
          delay</strong> is how late the loop is compared with when it should have run; <strong>event-loop
          utilisation</strong> (ELU) is the share of time it spent busy rather than waiting.
        </p>
      </div>
      <CodeFile path="05-event-loop-lab/src/06-loop-delay.ts" />
      <Terminal>{`node src/06-loop-delay.ts`}</Terminal>
      <Output>{`
idle for 1 s:          delay p50 1.0 ms  p99 1.1 ms  max 1.1 ms
5 x 150 ms blocking:   delay p50 1.0 ms  p99 148.1 ms  max 148.1 ms
event loop busy 38% of the time since start`}</Output>
      <div className="prose">
        <p>
          The median barely moves; the 99th percentile and maximum jump to the length of the longest blocking chunk.
          That is the signature of blocking, and why you should always look at tail latency (p99) rather than averages.
          A healthy server keeps loop delay in single-digit milliseconds. Many teams alert when p99 passes 50–100 ms, and
          load balancers can take an instance out of rotation when it does (exercise 3).
        </p>
      </div>

      <Step n={8}>The thread pool</Step>
      <div className="prose">
        <p>
          Your JavaScript has one thread, but Node does not. Work that the operating system cannot do asynchronously
          runs on libuv's <strong>thread pool</strong>: four threads by default, shared by the whole process.
        </p>
      </div>
      <CodeFile path="05-event-loop-lab/src/07-thread-pool.ts" />
      <Terminal>{`
node src/07-thread-pool.ts
UV_THREADPOOL_SIZE=8 node src/07-thread-pool.ts`}</Terminal>
      <Output panes={[
        { tag: 'default: 4 threads', text: 'UV_THREADPOOL_SIZE = 4 (default)\nhash 1 done after 59 ms\nhash 2 done after 60 ms\nhash 3 done after 60 ms\nhash 4 done after 60 ms\nhash 6 done after 121 ms\nhash 8 done after 122 ms\nhash 5 done after 122 ms\nhash 7 done after 127 ms' },
        { tag: 'UV_THREADPOOL_SIZE=8', text: 'UV_THREADPOOL_SIZE = 8\nhash 1 done after 80 ms\nhash 3 done after 86 ms\nhash 7 done after 90 ms\nhash 4 done after 92 ms\nhash 5 done after 93 ms\nhash 2 done after 94 ms\nhash 6 done after 95 ms\nhash 8 done after 97 ms' },
      ]} />
      <div className="prose">
        <p>
          With four threads the eight hashes finish in two waves: hashes 5–8 wait for a free thread. With eight threads
          they run together (each is a little slower because they share CPU cores; the test machine had ten). The
          completion order varies from run to run. Set the variable in the environment when you start Node: the pool is
          created the first time something uses it and is never resized afterwards. Its maximum is 1024.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Work</th><th>Handled by</th></tr>
        </thead>
        <tbody>
          <tr><td>TCP and UDP sockets, HTTP servers and clients, pipes, child-process I/O</td><td>The OS's own async notification (kqueue, epoll, IOCP). No thread pool, which is why one Node process can hold thousands of connections</td></tr>
          <tr><td>Timers</td><td>The event loop itself</td></tr>
          <tr><td>File system calls (<code>fs.*</code>)</td><td>Thread pool</td></tr>
          <tr><td><code>dns.lookup()</code>, used by default whenever you connect to a host name</td><td>Thread pool</td></tr>
          <tr><td><code>crypto.pbkdf2</code>, <code>scrypt</code>, <code>randomBytes</code>, <code>generateKeyPair</code> (async versions)</td><td>Thread pool</td></tr>
          <tr><td>Async <code>zlib</code> compression</td><td>Thread pool</td></tr>
          <tr><td><code>dns.resolve*()</code></td><td>Network queries via c-ares; no thread pool</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="One pool, shared by everything">
        <p>
          Because file reads, DNS lookups, hashing and compression share four threads, a burst of slow work in one of
          them delays the others. A login endpoint hashing passwords can make unrelated file reads slow. If profiling
          points there, raising <code>UV_THREADPOOL_SIZE</code> is a legitimate fix. CPU-heavy work in JavaScript is a
          different problem, solved with worker threads in chapter 16.
        </p>
      </Box>

      <Box kind="key" label="Rules for loop-friendly code">
        <ol>
          <li><strong>Never use <code>*Sync</code> APIs in code that serves requests.</strong> They are fine at start-up and in scripts.</li>
          <li><strong>Bound your work.</strong> Validate input sizes; paginate; stream large data (chapter 09) instead of loading it whole.</li>
          <li><strong>Split long computations</strong> into slices with <code>setImmediate</code>, or move them to a worker thread.</li>
          <li><strong>Do not recurse with <code>nextTick</code></strong> or endless promise chains; they starve I/O.</li>
          <li><strong>Measure</strong> event-loop delay and utilisation in production, and alert on the tail, not the average.</li>
        </ol>
      </Box>

      <Exercises
        items={[
          {
            task: <>Predict the order of the letters this script prints, then run it to check. Explain every position.</>,
            hint: <>It runs inside an I/O callback. List the synchronous lines first, then the nextTick queue, then the promise queue (remember chained <code>then</code>s and ticks queued from inside a promise), then check, then timers.</>,
            solution: (
              <>
                <CodeFile path="05-event-loop-lab.practice/src/09-puzzle.ts" />
                <Output>{`H D E G F B C A   (one letter per line)`}</Output>
                <p>
                  H is synchronous. D is the nextTick queue. E runs from the promise queue; its <code>then</code>{' '}
                  queues G, which runs in the same pass because Node keeps emptying the promise queue. F was queued with
                  nextTick inside E, so it runs when Node checks the nextTick queue again. B is the check phase, C its
                  microtask, and A waits for the next timers phase.
                </p>
              </>
            ),
          },
          {
            task: <>Rewrite <code>/block</code> so it still does one second of CPU work, but <code>/fast</code> stays fast while it runs. Test with <code>05-client.ts</code>.</>,
            hint: <>Work in 10 ms slices, and between slices <code>await new Promise((resolve) =&gt; setImmediate(resolve))</code>. That gives the loop a turn to accept other requests.</>,
            solution: (
              <>
                <CodeFile path="05-event-loop-lab.practice/src/10-cooperative-server.ts" />
                <Output caption="node src/05-client.ts (the /block lines)">{`
while /block is running: /fast  answered after 11 ms
                         /block answered after 1002 ms`}</Output>
              </>
            ),
          },
          {
            task: <>Add a <code>/health</code> route that reports the event loop's p99 delay since the last check, and answers <code>503</code> when it is above 100 ms. A load balancer can use this to stop sending traffic to a struggling instance.</>,
            hint: <>Create one <code>monitorEventLoopDelay</code> histogram at start-up, read <code>percentile(99)</code> in the handler, then <code>reset()</code>. Add a <code>/hard</code> route with the old blocking loop to test it.</>,
            solution: (
              <Output caption="curl after /block, then after /hard">{`
$ curl -i localhost:3050/health
{"loopDelayP99Ms":1.3}
HTTP 200
$ curl localhost:3050/hard
/hard took 1000 ms inside the server
$ curl -i localhost:3050/health
{"loopDelayP99Ms":993.5}
HTTP 503`}</Output>
            ),
          },
        ]}
      />

      <Checkpoint question="Inside a readFile callback you call setTimeout(fn, 0) and setImmediate(fn2). Which runs first, and would the answer be the same at the top of your main script?">
        <p>
          <code>fn2</code>, the immediate, always runs first inside an I/O callback: the loop is in the poll phase and
          the check phase comes next, before the loop returns to timers. At the top of the main script the order depends
          on whether 1 ms has passed by the time the loop first checks timers, so it can go either way.
        </p>
      </Checkpoint>
      <Checkpoint question="Your API's average latency is fine, but p99 latency jumps to 800 ms a few times an hour, for every endpoint at once. What is the most likely cause, and how would you confirm it?">
        <p>
          Something occasionally blocks the event loop for most of a second, so every request in flight waits, whatever
          its endpoint. Confirm it by recording event-loop delay (<code>monitorEventLoopDelay</code>) and checking that
          its spikes line up with the latency spikes, then find the code with a CPU profile (chapter 17). Typical causes
          are a synchronous call, a huge JSON operation or an unbounded loop over user-supplied data.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Code runs to completion; the loop only picks the next callback when the call stack is empty.</li>
          <li>Each turn visits timers → pending → poll → check → close. Poll is where the loop waits for I/O.</li>
          <li>After every callback, Node empties the nextTick queue, then the promise queue, repeating until both are empty. At an ES module's top level, promises come first.</li>
          <li><code>setImmediate</code> beats <code>setTimeout(0)</code> inside I/O callbacks; elsewhere the order is not guaranteed.</li>
          <li>Blocking the loop delays every user. Measure it with event-loop delay (watch p99) and utilisation.</li>
          <li>Files, <code>dns.lookup</code>, crypto and zlib share libuv's four-thread pool; sockets do not use it.</li>
        </ul>
      </Recap>
    </>
  );
}
