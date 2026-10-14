import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Output, Recap, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { nodeArchitecture } from '../diagrams/specs/foundations';

export function WhatIsNode() {
  return (
    <>
      <ChapterIntro
        time="40 minutes"
        learn={[
          'What a JavaScript runtime is, and the parts Node.js is built from',
          'Why a single thread can serve thousands of connections at once',
          'How Node differs from JavaScript in the browser',
          'What Node is good at, and where it struggles',
          'Release lines, LTS, and which version to use',
          'The REPL and one-line scripts for quick experiments',
        ]}
        tools={[
          { name: 'node', what: 'The runtime. Runs files, one-liners and an interactive prompt.' },
          { name: 'REPL', what: 'Read–eval–print loop: type JavaScript, see the result immediately.' },
        ]}
      />

      <h2>A runtime, not a language</h2>
      <div className="prose">
        <p>
          JavaScript is a language. On its own it cannot read a file, open a network socket or even print a line: those
          abilities come from whatever program runs it. A browser gives JavaScript a page to draw on. <strong>Node.js</strong>{' '}
          gives it the operating system instead: files, processes, the network, timers and cryptography.
        </p>
        <p>
          Ryan Dahl released Node in 2009 to make network servers that handle many slow connections without one thread
          per connection. Today it also runs most JavaScript tooling (npm, Vite, ESLint, the TypeScript compiler itself
          until recently) and a large share of the world's APIs. It is open source and governed by the OpenJS Foundation.
        </p>
      </div>

      <h2>The parts inside</h2>
      <Diagram
        spec={nodeArchitecture}
        caption="Your code only ever talks to the top two layers. V8 runs the JavaScript; libuv does the waiting, so your code does not have to."
      />
      <TableWrap>
        <thead>
          <tr><th>Part</th><th>What it does</th><th>Written in</th></tr>
        </thead>
        <tbody>
          <tr><td>V8</td><td>Google's JavaScript engine, the same one inside Chrome. Compiles your JavaScript to machine code and runs it, and manages memory with a garbage collector.</td><td>C++</td></tr>
          <tr><td>libuv</td><td>Runs the <strong>event loop</strong> and talks to the operating system's asynchronous I/O (kqueue, epoll, IOCP). Has a small <strong>thread pool</strong> for work the OS cannot do asynchronously, such as file reads, DNS lookups and some crypto.</td><td>C</td></tr>
          <tr><td>Standard library</td><td>The modules you import: <code>node:fs</code>, <code>node:http</code>, <code>node:crypto</code>, <code>node:stream</code> and about forty more. JavaScript on top, C++ bindings underneath.</td><td>JS + C++</td></tr>
          <tr><td>Other dependencies</td><td>OpenSSL for TLS and crypto, llhttp for parsing HTTP, zlib for compression, SQLite for <code>node:sqlite</code>, and more.</td><td>C / C++</td></tr>
        </tbody>
      </TableWrap>

      <h2>The big idea: never wait</h2>
      <div className="prose">
        <p>
          Your JavaScript runs on <strong>one thread</strong>. It sounds like a weakness, so consider what a web server
          actually does: it waits. It waits for the database, for a file, for another API, for the client to send the
          rest of a request. Computing the answer usually takes microseconds; waiting takes milliseconds.
        </p>
        <p>
          A traditional server parks one thread per request while it waits, and threads cost memory. Node instead hands
          every wait to libuv and moves on to the next piece of work. When the database answers, libuv puts your
          callback in a queue and the <strong>event loop</strong> runs it as soon as the thread is free. One thread stays
          busy doing useful work while thousands of requests are waiting at the same time.
        </p>
        <p>Here is the difference in eight lines. Save this file anywhere and run it.</p>
      </div>
      <CodeFile path="00-first-look/first-look.ts" />
      <Terminal>{`node first-look.ts`}</Terminal>
      <Output>{`
1. start
2. readFileSync returned 528 characters. Nothing else could run while it waited.
3. readFile has started. This line runs while the disk does the work.
4. readFile finished with 528 characters, after the rest of the script.`}</Output>
      <div className="prose">
        <p>
          <code>readFileSync</code> stops the whole program until the disk answers. <code>readFile</code> from{' '}
          <code>node:fs/promises</code> starts the read and returns a promise immediately, so line 3 prints first.
          The result arrives later, once the script has finished its current work. That ordering, and the queue behind
          it, is what chapters 06 and 07 explain in depth.
        </p>
      </div>
      <Box kind="warn" label="The catch">
        <p>
          One thread means one slow calculation blocks everyone. If a request handler spends two seconds resizing an
          image in JavaScript, every other user waits two seconds too. Node is brilliant at waiting for many things and
          poor at heavy computation on the main thread. Chapter 16 shows the fix: worker threads.
        </p>
      </Box>

      <h2>Node versus the browser</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>Browser</th><th>Node.js</th></tr>
        </thead>
        <tbody>
          <tr><td>Global object</td><td><code>window</code> (and <code>globalThis</code>)</td><td><code>globalThis</code>; there is no <code>window</code> or <code>document</code></td></tr>
          <tr><td>Main job</td><td>Draw a page, react to clicks</td><td>Talk to files, processes and the network</td></tr>
          <tr><td>Process info</td><td>None</td><td><code>process</code>: arguments, environment variables, exit codes, memory</td></tr>
          <tr><td>Files</td><td>Only what the user picks</td><td>Anything your user account can read and write</td></tr>
          <tr><td>Shared APIs</td><td colSpan={2}><code>fetch</code>, <code>URL</code>, <code>setTimeout</code>, <code>AbortController</code>, <code>TextEncoder</code>, <code>crypto.randomUUID()</code>, <code>structuredClone</code>, Web Streams</td></tr>
          <tr><td>Security</td><td>Sandboxed: a page cannot touch your disk</td><td>Full access. Code you install from npm runs with your permissions</td></tr>
          <tr><td>Version</td><td>Whatever the visitor has</td><td>You choose it, so you can use the newest features safely</td></tr>
        </tbody>
      </TableWrap>

      <h2>What Node is good at</h2>
      <TableWrap>
        <thead>
          <tr><th>Great fit</th><th>Think twice</th></tr>
        </thead>
        <tbody>
          <tr><td>REST and GraphQL APIs, backends for frontends</td><td>Video encoding, machine learning training, heavy number crunching on the main thread</td></tr>
          <tr><td>Real-time apps: chat, live dashboards, WebSockets</td><td>Work that needs many CPU cores sharing memory closely</td></tr>
          <tr><td>Streaming: uploads, proxies, log processing</td><td>Tiny embedded devices with very little memory</td></tr>
          <tr><td>Command-line tools and build tooling</td><td></td></tr>
          <tr><td>Glue between services: queues, webhooks, scheduled jobs</td><td></td></tr>
        </tbody>
      </TableWrap>

      <h2>Versions: Current and LTS</h2>
      <div className="prose">
        <p>
          Node ships major versions on a published schedule. <strong>Even</strong>-numbered lines become{' '}
          <strong>LTS</strong> (long-term support) the October after their release and get fixes for two and a half
          years. <strong>Odd</strong>-numbered lines up to Node 25 were short-lived previews that never became LTS.
          Production systems run an LTS line. The official dates are at{' '}
          <a href="https://nodejs.org/en/about/previous-releases">nodejs.org/en/about/previous-releases</a>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Line</th><th>Status in October 2026</th><th>Supported until</th></tr>
        </thead>
        <tbody>
          <tr><td>Node 22 "Jod"</td><td>Maintenance LTS (security fixes only)</td><td>30 April 2027</td></tr>
          <tr><td><strong>Node 24 "Krypton"</strong></td><td><strong>LTS, used by this course</strong></td><td>30 April 2028</td></tr>
          <tr><td>Node 25</td><td>End of life since 1 June 2026. Do not use it</td><td>—</td></tr>
          <tr><td>Node 26</td><td>Current; becomes LTS on 28 October 2026</td><td>30 April 2029</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="Which one?">
        <p>
          Use Node 24 for this course: every example was tested on 24.21.0. Moving a project to Node 26 after it becomes
          LTS is a one-line change in the next chapter's version file.
        </p>
      </Box>

      <h2>Your first commands</h2>
      <div className="prose">
        <p>
          The next chapter installs Node properly. If you already have any version installed, try these now. Running{' '}
          <code>node</code> with no file opens the <strong>REPL</strong>, a prompt where each line runs as you press Enter.
          Built-in modules like <code>os</code> are available there without importing them.
        </p>
      </div>
      <Terminal title="Terminal: the REPL">{`
node
> 2 ** 10
> process.version
> [1, 2, 3].map((x) => x * 2)
> .exit`}</Terminal>
      <Output>{`
Welcome to Node.js v24.21.0.
Type ".help" for more information.
> 2 ** 10
1024
> process.version
'v24.21.0'
> [1, 2, 3].map((x) => x * 2)
[ 2, 4, 6 ]
> .exit`}</Output>
      <Terminal title="Terminal: one-liners">{`
node -p "os.cpus().length"                                    # -p prints the result
node -p "process.versions.v8 + ' / libuv ' + process.versions.uv"
node -e "console.log(typeof window, typeof process)"          # -e only runs it`}</Terminal>
      <Output>{`
10
13.6.233.17-node.53 / libuv 1.52.1
undefined object`}</Output>
      <div className="prose">
        <p>
          Your CPU count will differ. The last line proves the point of the table above: there is no <code>window</code>{' '}
          in Node, but there is a <code>process</code>.
        </p>
      </div>

      <Checkpoint question="A request handler reads a user from the database (20 ms of waiting), then formats the reply (0.1 ms of computing). While it waits, 500 other requests arrive. Why does a single Node thread cope, and what one change to the handler would ruin that?">
        <p>
          During the 20 ms the thread is not busy: libuv is waiting for the database socket, so the event loop keeps
          starting the other requests and running their callbacks. The thread only works for the short computing parts.
          Ruin it by doing slow synchronous work in the handler, such as <code>readFileSync</code> on a big file or a
          CPU-heavy loop: while that runs, no other callback can.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Node.js is a runtime: V8 runs JavaScript, libuv runs the event loop and the I/O, and the standard library connects your code to both.</li>
          <li>Your JavaScript runs on one thread. Waiting is delegated, so one thread serves many connections.</li>
          <li>Blocking that thread with slow synchronous work blocks every user.</li>
          <li>Run an even-numbered LTS line in production. This course uses Node 24.</li>
        </ul>
      </Recap>
    </>
  );
}
