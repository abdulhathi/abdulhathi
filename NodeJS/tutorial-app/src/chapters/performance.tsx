import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { perfLoop, v8Heap } from '../diagrams/specs/advanced';

export function Performance() {
  return (
    <>
      <ChapterIntro
        time="2.5–3 hours"
        project="11-perf-lab"
        learn={[
          'Why you measure before you optimise, and which numbers matter (percentiles, not averages)',
          'The timing tools in node:perf_hooks, and the traps that make benchmarks lie',
          'Event-loop delay: the one metric that shows a blocked Node process',
          'Recording a CPU profile and reading it, with and without a GUI',
          'How V8 manages memory, what a leak really is, and how to find one with heap snapshots',
          'Fixing leaks with bounded caches, and when WeakMap or WeakRef help',
          'Heap limits, what an out-of-memory crash looks like, and how to size memory in containers',
          'A tiny load tester to prove each fix with before and after numbers',
        ]}
        tools={[
          { name: 'node:perf_hooks', what: 'performance.now, marks and measures, timerify, histograms, event-loop delay.' },
          { name: '--cpu-prof', what: 'Writes a CPU profile of the whole run to a .cpuprofile file.' },
          { name: '--inspect', what: 'Lets Chrome DevTools attach to a running Node process.' },
          { name: '--heapsnapshot-signal', what: 'Writes a heap snapshot when the process receives a signal.' },
          { name: 'process.memoryUsage()', what: 'How much memory the process and the V8 heap use right now.' },
          { name: '--max-old-space-size', what: 'Sets the size limit of V8’s main heap, in megabytes.' },
        ]}
      />

      <h2>Measure first</h2>
      <div className="prose">
        <p>
          Programmers are famously bad at guessing where time goes. The code that looks slow is usually fine, and the
          real cost hides in a library call, a <code>JSON.stringify</code> or an innocent-looking loop. So performance
          work is a loop: measure under realistic load, profile to see where the time or memory goes, change one thing,
          and measure again against the same baseline.
        </p>
      </div>
      <Diagram spec={perfLoop} caption="Never skip the last arrow. A change that was not measured is a guess, and some 'optimisations' make things slower." />
      <TableWrap>
        <thead>
          <tr><th>Metric</th><th>What it tells you</th><th>Tool in this chapter</th></tr>
        </thead>
        <tbody>
          <tr><td>Latency percentiles (p50, p99)</td><td>How long requests take for the typical user and for the unlucky 1%. Averages hide the slow tail that users complain about.</td><td><code>load.ts</code>, <code>createHistogram</code></td></tr>
          <tr><td>Throughput (requests per second)</td><td>How much work the process completes. Only meaningful alongside latency.</td><td><code>load.ts</code></td></tr>
          <tr><td>Event-loop delay</td><td>How late callbacks run. High delay means something is blocking the thread.</td><td><code>monitorEventLoopDelay</code></td></tr>
          <tr><td>CPU profile</td><td>Which functions the CPU was running, and for how long.</td><td><code>--cpu-prof</code>, DevTools</td></tr>
          <tr><td>Memory (rss, heapUsed)</td><td>Whether memory stays flat under steady load or keeps climbing.</td><td><code>process.memoryUsage()</code>, heap snapshots</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Set up the project</Step>
      <div className="prose">
        <p>
          Create <code>projects/11-perf-lab</code> as in chapter 03, with this <code>package.json</code>. Add two lines
          to <code>.gitignore</code>, because profiles and snapshots are large generated files.
        </p>
      </div>
      <CodeFile path="11-perf-lab/package.json" />
      <CodeFile path="11-perf-lab/.gitignore" />
      <div className="prose">
        <p>
          The lab works on generated shop orders. A seeded random generator makes every run produce the same data, so
          measurements are comparable between runs.
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/data.ts" />
      <div className="prose">
        <p>
          And here is the patient: a report with two performance bugs that look perfectly reasonable. Type it as it is;
          you will find and fix the problems with a profiler, not by reading.
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/report.ts" />

      <Step n={2}>The timing tools</Step>
      <CodeFile path="11-perf-lab/src/bench.ts" />
      <Terminal>{`node src/bench.ts`}</Terminal>
      <Output>{`
1. performance.now: first call took 6.65 ms
2. measure "revenue": 51.02 ms
3. eight calls in a row: 0.213, 0.075, 0.070, 0.046, 0.030, 0.030, 0.030, 0.030 ms
4. 50 timed calls: min 5.37 · mean 5.65 · p99 7.88 · max 7.88 ms`}</Output>
      <TableWrap>
        <thead>
          <tr><th>API</th><th>Use it for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>performance.now()</code></td><td>Elapsed time with sub-millisecond precision. Never use <code>Date.now()</code> for this: it has millisecond resolution and jumps when the system clock is adjusted.</td></tr>
          <tr><td><code>performance.mark()</code> / <code>measure()</code></td><td>Named points and spans on a timeline. Read them back with <code>performance.getEntriesByName()</code> or watch them with a <code>PerformanceObserver</code>.</td></tr>
          <tr><td><code>performance.timerify(fn)</code></td><td>Wraps a function so every call is timed, without editing the function.</td></tr>
          <tr><td><code>createHistogram()</code></td><td>Records many values and gives min, max, mean and any percentile. Values are integers; timerify records nanoseconds.</td></tr>
          <tr><td><code>process.hrtime.bigint()</code></td><td>Nanoseconds as a <code>bigint</code>, when you need integer arithmetic.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Line 3 is the most important. The same function took 0.213 ms on its first call and 0.030 ms from the fifth
          call on, seven times faster. V8 starts by interpreting a function, watches which types flow through it, and
          compiles hot functions to optimised machine code. Your numbers will differ; the shape will not.
        </p>
      </div>
      <Box kind="warn" label="Why benchmarks lie">
        <ul>
          <li><strong>Cold code.</strong> The first calls run unoptimised. Warm up before you start timing, or report cold and warm numbers separately.</li>
          <li><strong>Garbage collection.</strong> A GC pause can land inside any measurement. Run many iterations and look at percentiles, not one value.</li>
          <li><strong>Dead code.</strong> If a result is never used, V8 may skip computing it, and you measure nothing. Use the result.</li>
          <li><strong>Unrealistic data.</strong> Five items fit in the CPU cache; five million do not. Benchmark with production-sized inputs.</li>
          <li><strong>Micro versus macro.</strong> Making one function 10× faster does nothing if it is 1% of the request. Profile the whole request first.</li>
        </ul>
      </Box>

      <Step n={3}>Event-loop delay</Step>
      <div className="prose">
        <p>
          <code>monitorEventLoopDelay</code> runs a timer inside Node at a fixed resolution and records how late it fires.
          If the thread is free, the timer is on time. If a callback hogs the thread, the timer waits, and the histogram
          records the delay. It is the most direct measurement of "is my event loop blocked?".
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/loop-delay.ts" />
      <Terminal>{`node src/loop-delay.ts`}</Terminal>
      <Output>{`
idle                         p50  11.0 · p99  12.1 · max  13.1 ms
5 ms of work every 100 ms    p50  11.0 · p99  15.2 · max  20.0 ms
80 ms of work every 100 ms   p50  11.0 · p99  90.2 · max  90.2 ms`}</Output>
      <div className="prose">
        <p>
          The idle line is the baseline: with a 10 ms resolution, an unblocked loop reads about 11 ms. Five
          milliseconds of work barely moves the tail. Eighty milliseconds pushes p99 to 90 ms: one in a hundred
          callbacks in that process waited about 80 ms extra, and so would a user's request. In production, export p99
          event-loop delay as a metric and alert when it stays far above the baseline.
        </p>
      </div>

      <Step n={4}>Load-test the server</Step>
      <div className="prose">
        <p>
          The server has two endpoints: <code>/report</code>, which runs the slow report, and <code>/product</code>,
          which caches product pages. It prints its memory every five seconds. Leave the cache alone for now; it has
          its own bug, which you will meet in step 8.
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/server.ts" />
      <div className="prose">
        <p>
          Real load tools such as <code>autocannon</code>, <code>k6</code> or <code>wrk</code> are better, but a
          30-line script shows exactly what they do: several "connections" each send one request at a time, as fast
          as the server answers, while a histogram records every latency.
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/load.ts" />
      <Terminal>{`
npm start                                              # terminal 1
npm run load -- http://localhost:3160/report 5 10      # terminal 2: 5 seconds, 10 connections`}</Terminal>
      <Output>{`
36 requests in 5 s = 7 req/s, 0 failed
latency p50 940.0 ms · p99 6488.1 ms · max 6488.1 ms`}</Output>
      <div className="prose">
        <p>
          Seven requests per second, and the slowest request took six and a half seconds. Each report needs well over 100
          ms of pure CPU, and with ten clients asking at once, each request waits for the ones queued in front of it.
          This is the baseline to beat. Stop the server for now.
        </p>
      </div>

      <Step n={5}>Record and read a CPU profile</Step>
      <div className="prose">
        <p>
          A <strong>sampling profiler</strong> interrupts the program at a fixed interval (about once a millisecond) and
          writes down the call stack. Functions that appear in many samples are where the time goes. The{' '}
          <code>--cpu-prof</code> flag profiles a whole run and writes a <code>.cpuprofile</code> file when the process
          exits. <code>profile-report.ts</code> is a small workload to profile:
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/profile-report.ts" />
      <div className="prose">
        <p>
          The usual way to read a profile is to open it in Chrome DevTools. To see results right in the terminal, this
          script reads the file (it is JSON) and adds up each function's <strong>self time</strong>: the samples where
          that function itself was running, not one of the functions it called.
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/top-functions.ts" />
      <Terminal>{`
npm run profile     # node --cpu-prof --cpu-prof-dir=profiles src/profile-report.ts
npm run top`}</Terminal>
      <Output>{`
10 reports in 1835 ms

CPU.20261011.235758.21522.0.001.cpuprofile: 1888 ms sampled

  self ms      %  function
     837   44.3  (anonymous) report.ts:15
     566   30.0  uniqueCustomers report.ts:5
     358   18.9  buildReport report.ts:23
      46    2.5  (garbage collector)
      29    1.5  (program)
      18    0.9  __require index:8
      10    0.5  revenueByProduct report.ts:13
       3    0.1  compileForInternalLoader realm:383`}</Output>
      <div className="prose">
        <p>Reading it from the top:</p>
        <ul>
          <li>
            <strong>(anonymous) report.ts:15</strong>, 44%: the arrow function passed to <code>reduce</code> in{' '}
            <code>revenueByProduct</code>. <code>{'{ ...totals, [key]: … }'}</code> copies every key of the object for every
            order: 10,000 orders × up to 300 keys. Copying grows with the object, so the total cost is quadratic.
          </li>
          <li>
            <strong>uniqueCustomers</strong>, 30%: <code>seen.includes()</code> scans the whole array for every order. That
            is quadratic too. The time of the built-in <code>includes</code> is counted inside the function that calls it.
          </li>
          <li>
            <strong>buildReport</strong>, 19%: it only sorts 300 numbers, which costs almost nothing. V8's optimising
            compiler <em>inlined</em> the two slow functions into <code>buildReport</code>, so some of their samples are
            labelled with the caller. Treat self time as pointing to a neighbourhood, then read the code there.
          </li>
          <li>
            <strong>Parenthesised entries</strong> are not your functions: <code>(garbage collector)</code> is GC time,{' '}
            <code>(program)</code> is native code outside JavaScript, and <code>(idle)</code>, when present, means the
            thread was waiting.
          </li>
        </ul>
      </div>
      <Box kind="tip" label="Seeing the same profile in a GUI">
        <p>
          Open Chrome, open DevTools (any page), go to the <strong>Performance</strong> panel and drag the{' '}
          <code>.cpuprofile</code> file onto it. You get a <strong>flame chart</strong>: time runs left to right, callers
          sit above callees, and a wide bar is a function that ran for a long time. The <em>Bottom-Up</em> tab is the same
          self-time ranking as the script above. VS Code also opens <code>.cpuprofile</code> files.
        </p>
      </Box>

      <Step n={6}>Attach DevTools to a running process</Step>
      <div className="prose">
        <p>
          <code>--cpu-prof</code> profiles a whole run. To look inside a server while it is under load, start it with
          the inspector enabled:
        </p>
      </div>
      <Terminal>{`
node --inspect src/server.ts        # listens for a debugger on 127.0.0.1:9229
node --inspect-brk src/server.ts    # same, but pauses before the first line`}</Terminal>
      <div className="prose">
        <ol>
          <li>In Chrome, open <code>chrome://inspect</code> and click <strong>Open dedicated DevTools for Node</strong>.</li>
          <li>In the <strong>Performance</strong> (or <strong>Profiler</strong>) tab, start recording, run the load test in another terminal, then stop.</li>
          <li>The <strong>Memory</strong> tab takes heap snapshots and compares them, which is the GUI version of steps 8 and 9.</li>
          <li>The <strong>Sources</strong> tab sets breakpoints like any debugger. Your files appear as Node ran them: the same lines, with the type annotations blanked out.</li>
        </ol>
      </div>
      <Box kind="warn" label="Never expose the inspector">
        <p>
          Anyone who can connect to the inspector port can run any code inside your process. Keep the default{' '}
          <code>127.0.0.1</code>, never use <code>--inspect=0.0.0.0</code> on a server, and reach a remote process
          through an SSH tunnel instead.
        </p>
      </Box>

      <Step n={7}>Fix the CPU hot spots and measure again</Step>
      <div className="prose">
        <p>
          Both fixes replace a quadratic pattern with a linear one: a <code>Set</code> answers "have I seen this?" in
          constant time, and updating one object in place avoids copying it 10,000 times.
        </p>
      </div>
      <CodeFile path="11-perf-lab.2-fixed/src/report.ts" change="updated" />
      <Terminal>{`
npm run profile
npm start                                              # terminal 1
npm run load -- http://localhost:3160/report 5 10      # terminal 2`}</Terminal>
      <Output panes={[
        { tag: 'npm run profile', text: '10 reports in 8 ms' },
        { tag: 'npm run load', text: '9919 requests in 5 s = 1984 req/s, 0 failed\nlatency p50 3.9 ms · p99 12.3 ms · max 41.2 ms' },
      ]} />
      <TableWrap>
        <thead>
          <tr><th>/report, 10 connections</th><th>Before</th><th>After</th></tr>
        </thead>
        <tbody>
          <tr><td>Throughput</td><td>7 req/s</td><td>1,984 req/s</td></tr>
          <tr><td>p50 latency</td><td>940 ms</td><td>3.9 ms</td></tr>
          <tr><td>p99 latency</td><td>6,488 ms</td><td>12.3 ms</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          A 280× improvement from changing six lines, found in two minutes with a profiler. That ratio is typical:
          the big wins come from algorithms and accidental quadratic work, not from clever micro-optimisations.
        </p>
      </div>

      <h2>How Node uses memory</h2>
      <div className="prose">
        <p>
          JavaScript objects live in the <strong>V8 heap</strong>. You never free memory yourself: the{' '}
          <strong>garbage collector</strong> (GC) finds objects that can no longer be reached from the roots (global
          variables, the current call stack, active closures, timers and handles) and reuses their space. V8 splits the
          heap into generations, because most objects die young.
        </p>
      </div>
      <Diagram spec={v8Heap} caption="New space is small and collected often and cheaply. Objects that keep surviving are promoted to old space, which is collected less often by a slower mark-compact GC. --max-old-space-size limits old space." />
      <TableWrap>
        <thead>
          <tr><th><code>process.memoryUsage()</code> field</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          <tr><td><code>rss</code></td><td>Resident set size: all memory the OS has given the process (heap, code, stacks, native allocations). What a container limit counts.</td></tr>
          <tr><td><code>heapTotal</code></td><td>Memory V8 has reserved for the JavaScript heap.</td></tr>
          <tr><td><code>heapUsed</code></td><td>The part of the heap holding objects right now. Watch this one for leaks.</td></tr>
          <tr><td><code>external</code></td><td>Memory owned by C++ objects tied to JavaScript objects.</td></tr>
          <tr><td><code>arrayBuffers</code></td><td>Memory for <code>ArrayBuffer</code>s and <code>Buffer</code>s (part of <code>external</code>). File and network data lands here.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          A <strong>memory leak</strong> in a garbage-collected language is not forgotten <code>free()</code> calls. It is
          objects that are still <em>reachable</em>, so the GC must keep them, although your program will never use them
          again. The usual suspects:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Leak</th><th>Why it stays reachable</th><th>Fix</th></tr>
        </thead>
        <tbody>
          <tr><td>Unbounded cache or Map</td><td>Every key ever added is held by a module-level variable</td><td>Bound the size (LRU) and/or add a TTL</td></tr>
          <tr><td>Event listeners never removed</td><td>The emitter holds the listener, and the listener's closure holds its data</td><td><code>off()</code>, <code>once()</code>, or an <code>AbortSignal</code> (chapter 08)</td></tr>
          <tr><td>Timers never cleared</td><td>An active <code>setInterval</code> is a root, and so is everything its callback uses</td><td><code>clearInterval</code>, <code>unref()</code></td></tr>
          <tr><td>Arrays that only grow</td><td>A "recent requests" log nobody trims</td><td>A ring buffer or a fixed maximum</td></tr>
          <tr><td>Closures capturing big objects</td><td>A small callback kept alive keeps the whole object it mentions</td><td>Copy out only the fields you need</td></tr>
        </tbody>
      </TableWrap>

      <Step n={8}>Watch a leak happen</Step>
      <div className="prose">
        <p>
          Back to the original server (with the slow report or the fixed one, it does not matter here). Its product
          cache is keyed by the whole URL. Clients that add a unique parameter, such as analytics tags or{' '}
          <code>?t=timestamp</code> cache-busters, create a new entry with every request, and nothing is ever removed.
          The <code>--unique</code> flag of the load tester does exactly that.
        </p>
      </div>
      <Terminal>{`
npm start                                                            # terminal 1
npm run load -- "http://localhost:3160/product?id=7" 10 20 --unique  # terminal 2, run it twice`}</Terminal>
      <Output panes={[
        { tag: 'terminal 2', text: `103748 requests in 10 s = 10375 req/s, 0 failed
latency p50 1.5 ms · p99 5.6 ms · max 34.0 ms
106161 requests in 10 s = 10616 req/s, 0 failed
latency p50 1.6 ms · p99 5.7 ms · max 30.6 ms` },
        { tag: 'terminal 1, every 5 s', text: `rss  228.4 MB · heapUsed   54.3 MB · … · cache 10548
rss  390.8 MB · heapUsed  135.8 MB · … · cache 64303
rss  491.9 MB · heapUsed  256.0 MB · … · cache 118747
rss  599.9 MB · heapUsed  326.1 MB · … · cache 174238
rss 1042.7 MB · heapUsed  384.7 MB · … · cache 209909` },
      ]} />
      <div className="prose">
        <p>
          Memory climbs in step with the cache, about 1.9 KB per request, and would keep climbing until the process
          crashed. (The last <code>rss</code> jump also includes the heap snapshot from the next step.) In real life you
          would not see the cache size printed. You would see a memory graph that only goes up, then a restart.
        </p>
      </div>

      <Step n={9}>Find it with heap snapshots</Step>
      <div className="prose">
        <p>
          A <strong>heap snapshot</strong> is a file listing every object on the heap and who references it. The
          technique is to take one snapshot, apply the load that seems to leak, take another, and compare: whatever
          grew is your suspect. Start the server so that a signal writes a snapshot, without stopping it:
        </p>
      </div>
      <Terminal>{`
node --heapsnapshot-signal=SIGUSR2 src/server.ts      # terminal 1: note the pid it prints
kill -USR2 <pid>                                      # terminal 2: snapshot 1
npm run load -- "http://localhost:3160/product?id=7" 10 20 --unique   # twice
kill -USR2 <pid>                                      # snapshot 2
ls *.heapsnapshot`}</Terminal>
      <Output>{`
Heap.20261012.000202.28678.0.001.heapsnapshot
Heap.20261012.000224.28678.0.002.heapsnapshot`}</Output>
      <div className="prose">
        <p>
          You can load both files in DevTools (Memory tab → Load) and pick the <em>Comparison</em> view. This script does
          the same comparison in the terminal: it groups objects by constructor name, or by kind for strings and
          arrays, and prints what grew most.
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/heap-diff.ts" />
      <Terminal>{`node src/heap-diff.ts Heap.*.001.heapsnapshot Heap.*.002.heapsnapshot`}</Terminal>
      <Output>{`
   +objects       +MB  what
    419,876     369.9  (string)
       -142       7.0  (array)
          2       0.1  (native)
        254       0.0  (hidden)
         41       0.0  HTTPParser
         48       0.0  Array`}</Output>
      <div className="prose">
        <p>
          Almost 420,000 new strings, 370 MB: two per request, which matches a cache key plus a cached body. In DevTools,
          clicking one of those strings shows its <strong>retainers</strong>, the chain of references that keeps it
          alive, ending at the <code>cache</code> Map in <code>server.ts</code>. The <code>(array)</code> growth is the
          Map's internal hash table.
        </p>
      </div>
      <Box kind="warn" label="Snapshots in production">
        <p>
          Writing a snapshot pauses the process (seconds for a big heap) and can need as much extra memory as the heap
          itself, so a process near its memory limit may crash while writing one. Take them on one instance taken out of
          the load balancer. On Windows there is no <code>SIGUSR2</code>; call <code>v8.writeHeapSnapshot()</code> from
          code instead, for example behind a protected admin endpoint.
        </p>
      </Box>

      <Step n={10}>Fix the leak</Step>
      <div className="prose">
        <p>
          Two separate fixes. First, key the cache by what actually determines the response (the product id), so
          irrelevant parameters cannot create entries. Second, <strong>bound</strong> the cache, so even a correct key
          cannot grow forever. An <strong>LRU</strong> (least recently used) cache keeps the entries that are used and
          evicts the one untouched for longest. A <code>Map</code> remembers insertion order, which makes it a few lines.
        </p>
      </div>
      <CodeFile path="11-perf-lab.2-fixed/src/lru.ts" change="new" />
      <CodeFile path="11-perf-lab.2-fixed/src/server.ts" change="updated" />
      <Terminal>{`
npm start
npm run load -- "http://localhost:3160/product?id=7" 10 20 --unique   # twice`}</Terminal>
      <Output panes={[
        { tag: 'terminal 2', text: `317472 requests in 10 s = 31747 req/s, 0 failed
latency p50 0.5 ms · p99 4.4 ms · max 27.0 ms
277976 requests in 10 s = 27798 req/s, 0 failed
latency p50 0.5 ms · p99 5.0 ms · max 67.6 ms` },
        { tag: 'terminal 1, every 5 s', text: `rss  188.3 MB · heapUsed   34.3 MB · … · cache 1
rss  184.4 MB · heapUsed   28.6 MB · … · cache 1
rss  184.4 MB · heapUsed   22.1 MB · … · cache 1
rss  184.4 MB · heapUsed   27.8 MB · … · cache 1
rss  184.4 MB · heapUsed   15.8 MB · … · cache 1` },
      ]} />
      <div className="prose">
        <p>
          Nearly 600,000 requests later, the cache holds one entry and memory is flat. Throughput also tripled, from
          about 10,500 to about 30,000 requests per second: the leaking version was spending its time garbage-collecting
          an ever-larger heap and building pages it never reused.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Structure</th><th>Holds its contents…</th><th>Use it for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>Map</code></td><td>Strongly, until you delete them</td><td>Caches with an explicit bound or TTL</td></tr>
          <tr><td><code>WeakMap</code></td><td>Each value only as long as its <em>key object</em> is reachable elsewhere. Keys must be objects; no size, no iteration</td><td>Extra data attached to objects you do not own, such as metadata per request or per socket</td></tr>
          <tr><td><code>WeakRef</code> + <code>FinalizationRegistry</code></td><td>Not at all: the GC may clear the target at any time, and cleanup callbacks run late or never</td><td>Rare, advanced caches of expensive objects. Never for program logic</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          A <code>WeakMap</code> would not have fixed this leak: the keys are strings, and a string cache needs a bound,
          not weak references. In real projects the <code>lru-cache</code> package from npm offers size limits, TTLs and
          memory-based limits.
        </p>
      </div>

      <Step n={11}>Heap limits and out-of-memory crashes</Step>
      <div className="prose">
        <p>
          V8 limits the size of its heap. When a full garbage collection cannot free enough space, the process dies. You
          should recognise that crash on sight, so cause one safely with a 64 MB limit:
        </p>
      </div>
      <CodeFile path="11-perf-lab/src/oom.ts" />
      <Terminal>{`
node --max-old-space-size=64 src/oom.ts
echo $?`}</Terminal>
      <Output>{`
25 arrays kept, heapUsed 26 MB
50 arrays kept, heapUsed 46 MB

<--- Last few GCs --->

[23699:0x74ef40c000]       51 ms: Mark-Compact 51.3 (84.3) -> 51.3 (116.3) MB, … allocation failure; scavenge might not succeed

FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
----- Native stack trace -----

 1: 0x100543f44 node::(anonymous namespace)::DefaultAbortHandler(char const*, char const*) […]
 2: 0x1005441a8 node::OOMErrorHandler(char const*, v8::OOMDetails const&) […]
 …
134`}</Output>
      <div className="prose">
        <p>
          The last GCs freed nothing (51.3 → 51.3 MB), so V8 gave up. This is a <strong>fatal error</strong>, not an
          exception: no <code>try/catch</code> or <code>uncaughtException</code> handler runs, and the process aborts with
          exit code 134. The fix is never "catch it"; it is finding what holds the memory.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Question</th><th>Answer</th></tr>
        </thead>
        <tbody>
          <tr><td>What is the default limit?</td><td>Node chooses it from the machine's memory. Check with <code>node -p "v8.getHeapStatistics().heap_size_limit / 1048576"</code>: 4,288 MB on this 32 GB machine.</td></tr>
          <tr><td>What does the flag set?</td><td>The <em>old space</em> only. <code>--max-old-space-size=512</code> gave a total limit of 704 MB here, because new space and code space come on top.</td></tr>
          <tr><td>In a container?</td><td>Set the flag explicitly, a good margin below the container's memory limit (for example 384 for a 512 MB container), so V8 collects harder before the container is killed from outside, and leave room for buffers and native memory.</td></tr>
          <tr><td>Without changing the command?</td><td><code>NODE_OPTIONS="--max-old-space-size=384" npm start</code> passes flags through an environment variable.</td></tr>
        </tbody>
      </TableWrap>

      <Exercises
        items={[
          {
            task: <>Give <code>LruCache</code> an optional time-to-live: <code>new LruCache(500, 60_000)</code> treats entries older than a minute as missing. Prove it with a short script.</>,
            hint: <>Store <code>{'{ value, expires }'}</code> instead of the bare value. In <code>get</code>, delete and return <code>undefined</code> when <code>expires</code> is in the past.</>,
            solution: (
              <>
                <CodeFile path="11-perf-lab.practice/src/lru.ts" />
                <CodeFile path="11-perf-lab.practice/src/lru-demo.ts" />
                <Output>{`
after eviction: 1 undefined 3
after 150 ms: undefined undefined size 0`}</Output>
              </>
            ),
          },
          {
            task: <>Add <code>GET /debug/metrics</code> to the server: event-loop delay (p50, p99, max in ms), <code>rss</code> and <code>heapUsed</code> in MB, and the cache size, as JSON. Each call should report the period since the previous call. Compare it idle and during a <code>/report</code> load test.</>,
            hint: <>Create one <code>monitorEventLoopDelay</code> histogram at startup, <code>enable()</code> it, and <code>reset()</code> it after each response.</>,
            solution: (
              <>
                <CodeFile path="11-perf-lab.practice/src/server.ts" />
                <Output caption="Idle, then after a 3-second /report load test">{`
{"loopDelayMs":{"p50":11.1,"p99":11.1,"max":11.3},"memoryMb":{"rss":89,"heapUsed":13},"cacheEntries":0}
{"loopDelayMs":{"p50":12.1,"p99":14.6,"max":16.8},"memoryMb":{"rss":173,"heapUsed":34},"cacheEntries":0}`}</Output>
              </>
            ),
          },
          {
            task: <>Profile the running server while the load test hits it: start it with <code>node --cpu-prof --cpu-prof-dir=profiles src/server.ts</code>, run a load test, press <kbd>Ctrl</kbd>+<kbd>C</kbd>, then <code>npm run top</code>. Why is there no profile, and what one line fixes it?</>,
            hint: <><code>--cpu-prof</code> writes its file when the process exits normally. What does the default <code>SIGINT</code> behaviour do?</>,
            solution: (
              <p>
                By default <kbd>Ctrl</kbd>+<kbd>C</kbd> (SIGINT) kills the process immediately, so Node never reaches the
                point where it writes the profile, and <code>profiles/</code> is never created. Turn the signal into a
                normal exit with <code>process.once('SIGINT', () =&gt; process.exit(0));</code> (last lines of the server in
                the previous solution). With it, the profile appears and <code>(idle)</code> shows up at the top,
                because a server under moderate load spends much of its time waiting.
              </p>
            ),
          },
        ]}
      />

      <Checkpoint question="A dashboard shows an average latency of 20 ms for your API, yet users report that some pages take seconds. How can both be true, and what should the dashboard show instead?">
        <p>
          An average blends many fast requests with a few very slow ones: 98 requests at 5 ms and 2 at 750 ms average 20
          ms. The users hitting the slow tail are the ones complaining. Show percentiles, at least p50, p95 and p99, and
          event-loop delay, which reveals whether the slow ones are waiting behind blocking work.
        </p>
      </Checkpoint>
      <Checkpoint question="During a load test, heapUsed rises from 80 MB to 400 MB. When the test stops, it falls back to 90 MB within a minute. Is that a leak?">
        <p>
          No. The GC is lazy: under load it lets garbage pile up and collects in batches, so heap usage rises and falls.
          A leak is memory that stays reachable, so it does <em>not</em> come back after the load stops and a full GC
          runs, and it grows run after run. Compare heap snapshots taken after the load has stopped.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Measure, profile, change one thing, measure again. Report percentiles and throughput together, never one average.</li>
          <li>Warm up before benchmarking and run many iterations: JIT compilation and GC pauses distort single measurements.</li>
          <li>Event-loop delay is the direct signal of a blocked thread; export its p99 as a metric.</li>
          <li><code>--cpu-prof</code> plus a self-time ranking finds hot spots in minutes. The big wins are usually accidental quadratic work.</li>
          <li>A leak is reachable memory you will never use. Find it by diffing heap snapshots taken before and after load; fix it by bounding what you keep.</li>
          <li>Running out of heap is a fatal abort (exit 134). Set <code>--max-old-space-size</code> below a container's memory limit.</li>
        </ul>
      </Recap>
    </>
  );
}
