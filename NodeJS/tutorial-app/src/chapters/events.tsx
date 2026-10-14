import { CodeFile, Code, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { emitterFanout } from '../diagrams/specs/io';

export function Events() {
  return (
    <>
      <ChapterIntro
        time="60–75 minutes"
        project="06-events-lab"
        learn={[
          'The observer pattern, and why Node is built on it',
          'on, once, off, prependListener and emit, and the exact order listeners run in',
          'Typed events with EventEmitter<{ name: [args] }>',
          'Why an unhandled error event crashes the process, and how async listeners fail',
          'events.once() as a promise and events.on() as an async iterator, with cancellation',
          'Finding listener leaks from MaxListenersExceededWarning',
          'How EventTarget, the web standard, differs from EventEmitter',
        ]}
        tools={[
          { name: 'node:events', what: 'EventEmitter, once(), on() and errorMonitor.' },
          { name: 'EventTarget', what: 'The browser-style event API, built into Node as a global.' },
          { name: '--trace-warnings', what: 'Node flag that prints a stack trace for every warning.' },
        ]}
      />

      <h2>The observer pattern</h2>
      <div className="prose">
        <p>
          Some objects need to announce that something happened without knowing who cares. A server announces "a
          request arrived"; a file stream announces "here is another chunk"; a job queue announces "job 42 is done". The{' '}
          <strong>observer pattern</strong> solves this: the object that announces is the <strong>emitter</strong>, the
          functions that react are <strong>listeners</strong>, and each announcement is an <strong>event</strong> with a
          name and some arguments.
        </p>
        <p>
          The emitter keeps a list of listeners per event name and calls them when the event happens. It never imports
          them, so you can add a logger, a metrics counter or a test spy without touching the emitter's code. Node's
          version of this is the <code>EventEmitter</code> class, and once you know it you will see it everywhere.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Node object</th><th>Is an EventEmitter with events like</th></tr>
        </thead>
        <tbody>
          <tr><td><code>http.Server</code></td><td><code>request</code>, <code>listening</code>, <code>connection</code>, <code>close</code>, <code>error</code></td></tr>
          <tr><td>Streams (chapter 09)</td><td><code>data</code>, <code>end</code>, <code>finish</code>, <code>drain</code>, <code>close</code>, <code>error</code></td></tr>
          <tr><td><code>net.Socket</code></td><td><code>connect</code>, <code>data</code>, <code>end</code>, <code>timeout</code>, <code>error</code></td></tr>
          <tr><td><code>process</code></td><td><code>exit</code>, <code>SIGINT</code>, <code>SIGTERM</code>, <code>warning</code>, <code>uncaughtException</code>, <code>unhandledRejection</code></td></tr>
          <tr><td><code>ChildProcess</code> (chapter 16)</td><td><code>spawn</code>, <code>exit</code>, <code>close</code>, <code>message</code>, <code>error</code></td></tr>
          <tr><td><code>Worker</code> (chapter 16)</td><td><code>online</code>, <code>message</code>, <code>exit</code>, <code>error</code></td></tr>
        </tbody>
      </TableWrap>

      <h2>The API in one table</h2>
      <TableWrap>
        <thead>
          <tr><th>Method</th><th>What it does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>on(name, fn)</code></td><td>Adds a listener at the end of the list. <code>addListener</code> is the same method.</td></tr>
          <tr><td><code>once(name, fn)</code></td><td>Adds a listener that removes itself just before its first call.</td></tr>
          <tr><td><code>prependListener(name, fn)</code></td><td>Adds a listener at the <em>front</em> of the list. <code>prependOnceListener</code> also exists.</td></tr>
          <tr><td><code>off(name, fn)</code></td><td>Removes that exact function. <code>removeListener</code> is the same method.</td></tr>
          <tr><td><code>emit(name, ...args)</code></td><td>Calls every listener for <code>name</code>, in order, synchronously. Returns <code>true</code> if there was at least one.</td></tr>
          <tr><td><code>listenerCount(name)</code></td><td>How many listeners an event has. <code>listeners(name)</code> returns the functions.</td></tr>
          <tr><td><code>removeAllListeners(name?)</code></td><td>Removes every listener for one event, or for all events.</td></tr>
          <tr><td><code>eventNames()</code></td><td>The names that currently have listeners.</td></tr>
          <tr><td><code>setMaxListeners(n)</code></td><td>Changes the leak warning threshold (10 by default) for this emitter.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Set up the project</Step>
      <div className="prose">
        <p>
          Create <code>projects/06-events-lab</code> as in chapter 03: copy <code>tsconfig.json</code>,{' '}
          <code>.gitignore</code> and <code>.node-version</code> from <code>01-hello-node</code>, then add this{' '}
          <code>package.json</code> and install.
        </p>
      </div>
      <CodeFile path="06-events-lab/package.json" />
      <Terminal>{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS/projects/06-events-lab
npm install
mkdir src`}</Terminal>

      <Step n={2}>Prove the order listeners run in</Step>
      <div className="prose">
        <p>
          Most event bugs come from a wrong guess about <em>when</em> listeners run. Do not guess: this script registers
          four listeners in different ways and prints what happens.
        </p>
      </div>
      <CodeFile path="06-events-lab/src/order.ts" />
      <Terminal>{`node src/order.ts`}</Terminal>
      <Output>{`
before emit
C got 1 (prepended, so it runs first)
A got 1
B got 1
D got 1 (once, then removed)
after emit: returned true, 3 listeners left
--- second emit
C got 2 (prepended, so it runs first)
A got 2
B got 2
--- with audit
C got 3 (prepended, so it runs first)
A got 3
B got 3
audit saw 3
--- audit removed
C got 4 (prepended, so it runs first)
A got 4
B got 4
--- no listeners: emit returned false`}</Output>
      <div className="prose">
        <p>Read the output against the code. Every line of it follows from five rules:</p>
        <ul>
          <li><strong>emit is synchronous.</strong> "after emit" prints only after all four listeners have returned. Nothing goes through the event loop; emit is a loop over an array of functions.</li>
          <li><strong>Listeners run in the order they were added,</strong> except that <code>prependListener</code> puts one at the front.</li>
          <li><strong>once listeners are removed before they are called,</strong> so D never runs again.</li>
          <li><strong>off needs the same function object</strong> that <code>on</code> received. That is why <code>audit</code> is a named function: an inline arrow function can never be removed, because you have no reference to it.</li>
          <li><strong>emit returns whether anyone was listening.</strong> Useful for logging an event nobody handles.</li>
        </ul>
      </div>
      <Box kind="warn" label="A listener that throws">
        <p>
          Because emit is a plain synchronous loop, an exception in one listener stops the loop: the listeners after it
          do not run, and the exception comes out of the <code>emit()</code> call into whoever emitted. Keep listeners
          small, and catch errors inside a listener if the emitter must carry on.
        </p>
      </Box>

      <Step n={3}>Build a typed job queue</Step>
      <div className="prose">
        <p>
          Now a realistic emitter: a queue that runs jobs one at a time and reports progress through events. The type
          argument to <code>EventEmitter</code> is a map from each event name to the tuple of arguments its listeners
          receive. With it, TypeScript checks every <code>emit</code> and infers every listener's parameters.
        </p>
      </div>
      <CodeFile path="06-events-lab/src/job-queue.ts" />
      <TableWrap>
        <thead>
          <tr><th>Detail</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>type JobEvents = {'{ … }'}</code></td><td>Labelled tuples such as <code>[job: Job, percent: number]</code> name the arguments, and editors show those names. Use a <code>type</code>, not an <code>interface</code>: the generic expects a plain object type.</td></tr>
          <tr><td><code>extends EventEmitter&lt;JobEvents&gt;</code></td><td>The queue <em>is</em> an emitter, so callers use the familiar <code>on</code>/<code>once</code>/<code>off</code>.</td></tr>
          <tr><td><code>#pending</code>, <code>#runAll</code></td><td>JavaScript private fields and methods. Unlike TypeScript's <code>private</code>, they are private at run time too, and they are plain JavaScript, so Node runs them as is.</td></tr>
          <tr><td><code>process.nextTick(…)</code></td><td>Emits nothing during <code>add()</code>. If the first job started synchronously, its <code>start</code> event would fire before the caller had a chance to attach listeners. Chapter 07 explains <code>nextTick</code>.</td></tr>
          <tr><td><code>failed</code>, not <code>error</code></td><td>A job failing is normal business, and the queue carries on. The name <code>error</code> is special (step 5): it means the emitter itself is broken.</td></tr>
        </tbody>
      </TableWrap>
      <Diagram spec={emitterFanout} caption="One emit, three listeners, called one after another. The queue does not know the logger, the counter or waitForJob() exist." />

      <Step n={4}>Use the queue</Step>
      <CodeFile path="06-events-lab/src/index.ts" />
      <Terminal>{`npm start`}</Terminal>
      <Output>{`
start    resize-avatar
progress resize-avatar 50%
progress resize-avatar 100%
done     resize-avatar in 103 ms
start    send-invoice
progress send-invoice 33%
failed   send-invoice: step 2 of 3 failed
start    backup-db
progress backup-db 25%
progress backup-db 50%
progress backup-db 75%
progress backup-db 100%
done     backup-db in 206 ms
idle: 2 done, 1 failed`}</Output>
      <div className="prose">
        <p>
          Your millisecond figures will differ slightly. Two things to notice. First, two separate listeners react to{' '}
          <code>done</code>, and neither knows about the other. Second, <code>await once(queue, 'idle')</code> turns
          "wait for the next idle event" into a promise, so the script simply awaits it at the top level. Step 7 looks
          at <code>once()</code> properly.
        </p>
      </div>
      <Box kind="try" label="Try it: let the types catch you">
        <p>Create a scratch file with three mistakes and run <code>npx tsc</code>:</p>
        <Code title="src/typo.ts">{`
import { JobQueue } from './job-queue.ts';
const queue = new JobQueue();
queue.on('progres', (job) => console.log(job));
queue.on('done', (job, ms) => console.log(ms.toFixed(1), job.nme));
queue.emit('done', { id: '1', name: 'x', steps: 1 });`}</Code>
        <Output caption="npx tsc">{`
src/typo.ts(3,21): error TS2345: Argument of type '(job: any) => void' is not assignable to parameter of type 'never'.
src/typo.ts(3,22): error TS7006: Parameter 'job' implicitly has an 'any' type.
src/typo.ts(4,62): error TS2551: Property 'nme' does not exist on type 'Job'. Did you mean 'name'?
src/typo.ts(5,7): error TS2554: Expected 3 arguments, but got 2.`}</Output>
        <p>
          The first error is the cryptic one: <code>'progres'</code> is not a key of <code>JobEvents</code>, so the
          listener's type becomes <code>never</code>. With a plain, untyped emitter all three mistakes would run silently
          and do nothing. Delete the file afterwards.
        </p>
      </Box>

      <h2>Extend or compose?</h2>
      <div className="prose">
        <p>
          Extending <code>EventEmitter</code> is the classic Node style, and it is what <code>http.Server</code> and
          streams do. Its weakness is that <code>emit</code> is public: any code holding the queue can call{' '}
          <code>queue.emit('done', fakeJob, 0)</code>. The alternative is to keep a private emitter inside the class and
          expose only <code>on</code> and <code>off</code>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th><code>class Queue extends EventEmitter</code></th><th>Private emitter inside the class</th></tr>
        </thead>
        <tbody>
          <tr><td>Code needed</td><td>None: every method comes for free</td><td>A few one-line wrapper methods</td></tr>
          <tr><td>Who can emit</td><td>Anyone with a reference</td><td>Only the class itself</td></tr>
          <tr><td>Works with <code>events.once()</code> and <code>on()</code></td><td>Yes</td><td>Only if you expose the emitter or add your own helpers</td></tr>
          <tr><td>Name clashes</td><td>Your methods share a namespace with <code>on</code>, <code>emit</code>, <code>listeners</code>…</td><td>None</td></tr>
          <tr><td>Use it when</td><td>Building Node-style infrastructure, or the class is internal</td><td>Building a public library API</td></tr>
        </tbody>
      </TableWrap>

      <Step n={5}>The special error event</Step>
      <div className="prose">
        <p>
          One event name has a rule of its own. If an emitter emits <code>'error'</code> and <strong>no listener</strong>{' '}
          is attached, <code>emit</code> throws the error. In most programs nothing catches it, so the process crashes.
          This is deliberate: an error nobody handles should be loud, not silently dropped.
        </p>
      </div>
      <CodeFile path="06-events-lab/src/error-event.ts" />
      <Terminal>{`node src/error-event.ts; echo "exit code: $?"`}</Terminal>
      <Output>{`
handled: disk full
emitting error with no listener...
file://~/…/projects/06-events-lab/src/error-event.ts:11
careless.emit('error', new Error('network down'));
                       ^

Error: network down
    at file://~/…/projects/06-events-lab/src/error-event.ts:11:24
    …
Emitted 'error' event at:
    at file://~/…/projects/06-events-lab/src/error-event.ts:11:10
    …

Node.js v24.21.0
exit code: 1`}</Output>
      <div className="prose">
        <p>
          The trace shows where the error was created and where it was emitted, which are often different places. If
          you emit something that is not an <code>Error</code>, such as a string, Node wraps it:{' '}
          <code>Error [ERR_UNHANDLED_ERROR]: Unhandled error. ('just a string')</code>. Always emit real{' '}
          <code>Error</code> objects so the stack trace survives.
        </p>
        <p>
          To <em>watch</em> errors without handling them, for example to count them in metrics, listen to{' '}
          <code>events.errorMonitor</code>. Those listeners run before the normal error listeners and do not count as
          handling, so an emitter with only a monitor still crashes.
        </p>
      </div>
      <Box kind="warn" label="The rule this gives you">
        <p>
          Every stream, socket, server, child process and worker you create can emit <code>'error'</code>. Attach an
          error listener to each one, or use an API that does it for you (<code>stream.pipeline</code> in chapter 09,{' '}
          <code>events.once</code> below). A missing listener on a socket is a classic cause of servers that crash
          randomly in production.
        </p>
      </Box>

      <Step n={6}>Async listeners</Step>
      <div className="prose">
        <p>
          <code>emit</code> calls listeners and ignores what they return. An <code>async</code> listener returns a
          promise, so if it throws, the promise rejects and nobody is waiting for it. That is an{' '}
          <strong>unhandled rejection</strong>, which crashes Node by default, even if the emitter has an error listener.
          The <code>captureRejections</code> option fixes this by routing those rejections to the <code>'error'</code>{' '}
          event.
        </p>
      </div>
      <CodeFile path="06-events-lab/src/async-listener.ts" />
      <Terminal>{`
node src/async-listener.ts
node src/async-listener.ts capture`}</Terminal>
      <Output panes={[
        { tag: 'without captureRejections (exit code 1)', text: `emit returned; captureRejections is false
file://~/…/src/async-listener.ts:11
  throw new Error(\`could not save \${id}: …\`);
        ^

Error: could not save task-42: database unavailable
    at EventEmitter.<anonymous> (…/async-listener.ts:11:9)
    at EventEmitter.emit (node:events:514:28)
    …

Node.js v24.21.0` },
        { tag: 'with captureRejections', text: `emit returned; captureRejections is true
error listener got: could not save task-42: database unavailable` },
      ]} />
      <div className="prose">
        <p>
          Notice "emit returned" prints first in both runs. An async function never throws to its caller: it returns
          a rejected promise, and both the crash and the capture happen only after the current code has finished
          running, long after <code>emit</code> returned. You can also turn the option on
          for every emitter with <code>EventEmitter.captureRejections = true</code>, but setting it per emitter makes the
          behaviour visible where it matters.
        </p>
      </div>

      <h2>Events as promises and async iterators</h2>
      <div className="prose">
        <p>
          Callbacks are awkward when you want to <em>wait</em> for an event inside an async function. Two helpers from{' '}
          <code>node:events</code> bridge the gap.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Helper</th><th>Gives you</th><th>Settles when</th></tr>
        </thead>
        <tbody>
          <tr><td><code>once(emitter, name, {'{ signal }'})</code></td><td>A promise of the next event's arguments, as an array</td><td>Resolves on the event; rejects if <code>'error'</code> is emitted first or the signal aborts</td></tr>
          <tr><td><code>on(emitter, name, {'{ signal }'})</code></td><td>An async iterator: one array of arguments per event, buffered if you are slow</td><td>Runs until you <code>break</code>, the signal aborts, or <code>'error'</code> is emitted (then it throws)</td></tr>
        </tbody>
      </TableWrap>

      <Step n={7}>Wait, give up, and iterate</Step>
      <CodeFile path="06-events-lab/src/async-events.ts" />
      <Terminal>{`node src/async-events.ts`}</Terminal>
      <Output>{`
sensor ready
gave up waiting: AbortError
reading 20 °C
reading 21 °C
reading 22 °C
reading 23 °C
reading 24 °C
stopped listening
listeners left: 0`}</Output>
      <div className="prose">
        <p>
          A reading arrives every 50 ms and the loop is aborted after 280 ms, so you see about five readings. The last
          line matters most: both helpers remove their listeners when they finish, whichever way they finish. A{' '}
          <code>for await</code> loop over <code>on()</code> never ends by itself, so always give it a way out: a{' '}
          <code>break</code>, an abort signal, or an <code>'error'</code> event.
        </p>
        <p>
          <code>once()</code> also rejects if the emitter emits <code>'error'</code> while you wait. That makes{' '}
          <code>await once(server, 'listening')</code> a safe way to start a server: a "port already in use" error
          rejects the promise instead of crashing the process.
        </p>
      </div>
      <Box kind="warn" label="Pitfall: AbortSignal.timeout() does not keep Node alive">
        <p>
          The natural way to write step 2 is <code>once(sensor, 'ready', {'{ signal: AbortSignal.timeout(200) }'})</code>.
          In a server that works. In this script it does not, because the timer behind <code>AbortSignal.timeout</code>{' '}
          is <em>unref'd</em>: it does not keep the process running. With nothing else pending, Node exits before the
          timeout fires:
        </p>
        <Output caption="Output with AbortSignal.timeout(200), exit code 13">{`
sensor ready
Warning: Detected unsettled top-level await at file://…/src/async-events.ts:12
  await once(sensor, 'ready', { signal: AbortSignal.timeout(200) });
  ^`}</Output>
        <p>
          Exit code 13 means a top-level <code>await</code> was still waiting when the event loop ran out of work. The
          script uses its own <code>AbortController</code> and a normal <code>setTimeout</code>, which does keep the
          process alive.
        </p>
      </Box>

      <h2>Listener leaks</h2>
      <div className="prose">
        <p>
          A listener keeps everything it refers to alive, because the emitter holds a reference to it. Adding a listener
          to a long-lived emitter on every request, and never removing it, is a memory leak that grows with traffic.
          Node watches for the symptom: once an emitter has more than 10 listeners for one event, it prints a warning.
        </p>
      </div>
      <Step n={8}>Cause a leak, then find it</Step>
      <CodeFile path="06-events-lab/src/leak.ts" />
      <Terminal>{`
node src/leak.ts
node --trace-warnings src/leak.ts`}</Terminal>
      <Output caption="node src/leak.ts">{`
after 11 leaky requests: 11 listeners
after 11 fixed requests: 0 listeners
(node:13816) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 change listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit
(Use \`node --trace-warnings ...\` to show where the warning was created)`}</Output>
      <Output caption="node --trace-warnings src/leak.ts (the warning part)">{`
(node:13950) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. …
    at genericNodeError (node:internal/errors:986:15)
    at wrappedFn (node:internal/errors:540:14)
    at warnMaxListenersExceeded (node:events:602:13)
    at _addListener (node:events:593:7)
    at EventEmitter.addListener (node:events:616:10)
    at handleRequestLeaky (file://~/…/projects/06-events-lab/src/leak.ts:8:12)
    at file://~/…/projects/06-events-lab/src/leak.ts:18:34
    …`}</Output>
      <div className="prose">
        <p>
          The warning prints after the script's own output because Node emits warnings on the next tick. With{' '}
          <code>--trace-warnings</code>, the first frame that is your code, <code>handleRequestLeaky</code> at line 8,
          is where the eleventh listener was added. The fix is to remove the listener when the work it belongs to ends,
          or to use <code>once</code> when a single event is all you need.
        </p>
      </div>
      <Box kind="warn" label="Do not silence the warning">
        <p>
          <code>emitter.setMaxListeners(50)</code>, or <code>0</code> for unlimited, makes the warning go away. Only do
          that when many listeners are genuinely expected, for example one per open WebSocket on a broadcast emitter.
          If the count grows with every request, the warning was right.
        </p>
      </Box>

      <h2>EventTarget: the web's version</h2>
      <div className="prose">
        <p>
          Browsers have their own event API, <code>EventTarget</code>, and Node includes it as a global so that web
          APIs like <code>AbortSignal</code>, <code>MessagePort</code> and <code>WebSocket</code> behave the same on both
          platforms.
        </p>
      </div>
      <Step n={9}>Compare the two</Step>
      <CodeFile path="06-events-lab/src/event-target.ts" />
      <Terminal>{`node src/event-target.ts`}</Terminal>
      <Output>{`
first knock handler: knock
knock from Ada
knock from Grace
aborted: user pressed cancel`}</Output>
      <TableWrap>
        <thead>
          <tr><th></th><th>EventEmitter</th><th>EventTarget</th></tr>
        </thead>
        <tbody>
          <tr><td>Origin</td><td>Node.js</td><td>Web standard (DOM)</td></tr>
          <tr><td>Methods</td><td><code>on</code>, <code>once</code>, <code>off</code>, <code>emit</code></td><td><code>addEventListener</code>, <code>removeEventListener</code>, <code>dispatchEvent</code></td></tr>
          <tr><td>Listener receives</td><td>Any arguments you emit</td><td>One <code>Event</code> object; data goes in <code>CustomEvent</code>'s <code>detail</code></td></tr>
          <tr><td>Run once</td><td><code>once()</code></td><td><code>{'{ once: true }'}</code> option</td></tr>
          <tr><td>Same listener added twice</td><td>Called twice</td><td>Ignored the second time</td></tr>
          <tr><td>Listener throws</td><td>Exception leaves <code>emit()</code>; later listeners skipped</td><td>Other listeners still run; the error is rethrown later as an uncaught exception</td></tr>
          <tr><td>Special <code>error</code> event</td><td>Yes: throws if unhandled</td><td>No</td></tr>
          <tr><td>Typed with generics</td><td>Yes, in <code>@types/node</code></td><td>Only by casting the event</td></tr>
          <tr><td>Used by</td><td>Streams, <code>http</code>, <code>net</code>, <code>process</code>, child processes</td><td><code>AbortSignal</code>, <code>MessagePort</code>, <code>BroadcastChannel</code>, <code>WebSocket</code></td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="Which one should your code use?">
        <p>
          On the server, <code>EventEmitter</code>: it is what the rest of Node speaks, and it types better. Choose{' '}
          <code>EventTarget</code> for code that must also run in a browser.
        </p>
      </Box>

      <Exercises
        items={[
          {
            task: <>Add an <code>added</code> event that the queue emits inside <code>add()</code>. Then explain why a listener attached <em>after</em> the <code>add()</code> calls in <code>index.ts</code> never sees it, while <code>start</code> listeners attached in the same place do.</>,
            hint: <>Emit it before the <code>nextTick</code> line. Which code runs synchronously inside <code>add()</code>, and which runs later?</>,
            solution: <><p><code>added</code> is emitted synchronously inside <code>add()</code>, before the next line of <code>index.ts</code> has had a chance to attach anything. <code>start</code> is emitted from <code>#runAll</code>, which <code>nextTick</code> delays until the current script has finished, and by then the listeners exist. See the <code>add()</code> method below.</p><CodeFile path="06-events-lab.practice/src/job-queue.ts" /></>,
          },
          {
            task: <>Support retries. A job may set <code>retries: 2</code>; on failure the queue tries again up to that many times and emits <code>retry</code> with the job, the next attempt number and the error. Add the event to <code>JobEvents</code> so the listener is typed.</>,
            hint: <>Move the step loop into its own <code>#attempt()</code> method and call it in a loop inside <code>#run()</code>. Emit <code>failed</code> only after the last attempt.</>,
            solution: <>The <code>#run</code> and <code>#attempt</code> methods in the solution above.</>,
          },
          {
            task: <>Write <code>waitForJob(queue, id)</code>: a promise that resolves with the job's duration when that job is done, or rejects with its error when it fails. Prove that it leaves no listeners behind.</>,
            hint: <>Add a <code>done</code> and a <code>failed</code> listener that ignore other job ids. Whichever fires for your id must remove <em>both</em>. <code>events.once()</code> alone cannot filter by id.</>,
            solution: <><CodeFile path="06-events-lab.practice/src/wait-for-job.ts" /><CodeFile path="06-events-lab.practice/src/index.ts" /><Output>{`added    flaky-upload (queue start is deferred)
added    broken-export (queue start is deferred)
retry    flaky-upload attempt 2 after: step 1 of 2 failed
done     flaky-upload in 153 ms
waitForJob(a) resolved: 153 ms
retry    broken-export attempt 2 after: step 2 of 2 failed
failed   broken-export: step 2 of 2 failed
waitForJob(b) rejected: step 2 of 2 failed
done listeners left: 1, failed listeners left: 1`}</Output><p>The one listener left on each event is the logging listener from <code>index.ts</code>.</p></>,
          },
        ]}
      />

      <Checkpoint question={<>A database class emits <code>'ready'</code> at the end of its constructor. Code that does <code>const db = new Db(); db.on('ready', start)</code> never calls <code>start</code>, and nothing crashes. Why? Give two ways to fix the class.</>}>
        <p>
          <code>emit</code> is synchronous, so <code>'ready'</code> fired inside the constructor, before{' '}
          <code>db.on(...)</code> ran. With no listener, <code>emit</code> returned <code>false</code> and the event was
          lost. Fixes: defer the emit with <code>process.nextTick</code> or <code>queueMicrotask</code> so callers can
          attach listeners first, as the job queue does; or expose the state, such as an <code>isReady</code> flag or a{' '}
          <code>ready()</code> method returning a promise, so late callers can still find out.
        </p>
      </Checkpoint>
      <Checkpoint question={<>You added an <code>'error'</code> listener to an emitter, yet an <code>async</code> listener that throws still crashes the process. Why, and what one option fixes it?</>}>
        <p>
          <code>emit</code> ignores the promise that an async listener returns, so its rejection is unhandled, and an
          unhandled rejection crashes Node regardless of error listeners. Create the emitter with{' '}
          <code>{'{ captureRejections: true }'}</code> and the rejection is delivered to the <code>'error'</code> event.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li><code>emit</code> calls listeners synchronously, in the order they were added; <code>prependListener</code> jumps the queue and <code>once</code> removes itself first.</li>
          <li>Type your emitters with <code>EventEmitter&lt;{'{ name: [args] }'}&gt;</code> so wrong names and arguments fail <code>tsc</code>.</li>
          <li>An <code>'error'</code> event with no listener throws. Attach error listeners to everything that can emit one.</li>
          <li>Async listeners need <code>captureRejections</code>, or their errors become unhandled rejections.</li>
          <li><code>events.once()</code> and <code>events.on()</code> turn events into promises and async iterators, and clean up their listeners.</li>
          <li>MaxListenersExceededWarning usually means a real leak. Find it with <code>--trace-warnings</code>; do not just raise the limit.</li>
        </ul>
      </Recap>
    </>
  );
}
