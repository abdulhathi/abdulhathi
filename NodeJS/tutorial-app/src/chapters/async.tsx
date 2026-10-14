import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';

export function Async() {
  return (
    <>
      <ChapterIntro
        time="2 hours"
        project="04-async-lab"
        learn={[
          'Why so much Node code is asynchronous, and the three styles it has been written in',
          'Error-first callbacks: how to read them, and why they were replaced',
          'Promises: states, chaining, error propagation, and turning callbacks into promises',
          'async/await, including the rules that trip people up',
          'Sequential versus parallel work, measured, and the four Promise combinators',
          'Unhandled rejections: why they crash your process, and how to avoid them',
          'Cancellation with AbortController, AbortSignal.timeout() and AbortSignal.any()',
          'Limiting concurrency, and consuming data lazily with async generators',
        ]}
        tools={[
          { name: 'node:timers/promises', what: 'setTimeout() that returns a promise and accepts a signal.' },
          { name: 'node:util', what: 'promisify(): callback function in, promise function out.' },
          { name: 'Promise.*', what: 'all, allSettled, race, any.' },
          { name: 'AbortController', what: 'Cancels work that accepts an AbortSignal.' },
          { name: 'performance.now()', what: 'A precise clock for measuring how long things take.' },
        ]}
      />

      <h2>Why asynchronous?</h2>
      <div className="prose">
        <p>
          Chapter 02 showed the rule: your JavaScript runs on one thread, so a function that has to wait (for a disk, a
          database, a network) must not block it. Instead it returns immediately and delivers the result later. The
          question this chapter answers is how your code gets hold of "later". Node has answered it three ways over the
          years, and you will meet all three in real code.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Style</th><th>Looks like</th><th>Where you meet it</th></tr>
        </thead>
        <tbody>
          <tr><td>Callbacks (2009)</td><td><code>readFile(f, (err, data) =&gt; {'{ … }'})</code></td><td>Older code and libraries, event listeners, some core APIs</td></tr>
          <tr><td>Promises (2015)</td><td><code>readFile(f).then(…).catch(…)</code></td><td>Everywhere; the foundation of the next row</td></tr>
          <tr><td>async/await (2017)</td><td><code>const data = await readFile(f)</code></td><td>All new code. Still promises underneath</td></tr>
        </tbody>
      </TableWrap>

      <h2>The promise model</h2>
      <div className="prose">
        <p>A <strong>promise</strong> is an object standing in for a value that is not ready yet. It is always in one of three states:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>State</th><th>Meaning</th><th>Moves to</th></tr>
        </thead>
        <tbody>
          <tr><td>pending</td><td>The work is still going</td><td>fulfilled or rejected, exactly once</td></tr>
          <tr><td>fulfilled</td><td>Finished with a value</td><td>Nothing: settled promises never change</td></tr>
          <tr><td>rejected</td><td>Failed with a reason (normally an <code>Error</code>)</td><td>Nothing</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <code>then(onFulfilled)</code> and <code>catch(onRejected)</code> register what to do on settlement and{' '}
          <strong>return a new promise</strong> for the callback's result. Return a value and the next step gets it;
          return a promise and the next step waits for it; throw and every following <code>then</code> is skipped until a{' '}
          <code>catch</code>. That propagation is what makes one <code>catch</code> enough for a whole chain. Callbacks
          registered with <code>then</code> never run synchronously, even on an already-settled promise; chapter 07
          shows exactly when they do run.
        </p>
      </div>

      <Step n={1}>Set up the lab</Step>
      <div className="prose">
        <p>
          This project is a set of numbered scripts, each run on its own. Three small JSON files stand in for a
          database: an order, its customer, and the customer's country with its VAT rate.
        </p>
      </div>
      <Terminal>{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS/projects
mkdir -p 04-async-lab/src/lib 04-async-lab/fixtures && cd 04-async-lab
cp ../01-hello-node/{tsconfig.json,.gitignore,.node-version} .
npm init -y && npm pkg set type=module
npm install --save-dev typescript @types/node@24`}</Terminal>
      <CodeFile path="04-async-lab/package.json" />
      <CodeFile path="04-async-lab/fixtures/order.json" />
      <CodeFile path="04-async-lab/fixtures/customer-7.json" />
      <CodeFile path="04-async-lab/fixtures/country-NL.json" />
      <CodeFile path="04-async-lab/src/lib/shop.ts" />
      <CodeFile path="04-async-lab/src/lib/timing.ts" />
      <div className="prose">
        <p>
          <code>slowSquare</code> fakes a 300 ms database call with <code>setTimeout</code> from{' '}
          <code>node:timers/promises</code>, which returns a promise instead of taking a callback. Every timing below is
          measured, so your numbers may differ by 10 ms or so.
        </p>
      </div>

      <Step n={2}>Callbacks</Step>
      <div className="prose">
        <p>
          The task: read the order, then its customer, then the customer's country, then print a receipt. Each step
          needs the previous result, so with callbacks each step nests inside the one before.
        </p>
      </div>
      <CodeFile path="04-async-lab/src/01-callbacks.ts" />
      <Terminal>{`node src/01-callbacks.ts`}</Terminal>
      <Output>{`
1. asked for order.json; the callbacks run later
2. read the order
3. read the customer
4. Order 42 for Ada Lovelace: €121.00 incl. VAT`}</Output>
      <div className="prose">
        <p>
          The <strong>error-first</strong> convention: the callback's first parameter is an error or <code>null</code>,
          the second is the result. Line 1 prints first because <code>readFile</code> returns at once. The problems show
          even in this small example:
        </p>
        <ul>
          <li><strong>Nesting</strong>: every dependent step adds a level of indentation ("callback hell").</li>
          <li><strong>Repeated error handling</strong>: each level checks <code>err</code>; forget one and the error vanishes.</li>
          <li><strong>No try/catch</strong>: by the time a callback runs, the surrounding <code>try</code> block has long finished.</li>
          <li><strong>No guarantees</strong>: a buggy library can call your callback twice, or never. Promises settle exactly once.</li>
        </ul>
      </div>

      <Step n={3}>Promises</Step>
      <CodeFile path="04-async-lab/src/02-promises.ts" />
      <Terminal>{`node src/02-promises.ts`}</Terminal>
      <Output>{`
right away: Promise { <pending> }
after await: Promise { 'ready' }
promisified: Ada Lovelace
chained: Order 42 for Ada Lovelace: €121.00 incl. VAT
finally runs either way
rejected: No customer 99`}</Output>
      <div className="prose">
        <ul>
          <li><code>new Promise((resolve, reject) =&gt; …)</code> wraps anything callback-based. You rarely need it: most APIs already return promises.</li>
          <li><code>promisify</code> does the wrapping for any function that follows the error-first convention. Node's own callback APIs also have promise versions (<code>node:fs/promises</code>, <code>node:timers/promises</code>, <code>node:dns/promises</code>, <code>node:stream/promises</code>), so prefer those.</li>
          <li>The chain is flat and has one <code>catch</code>, but passing <code>order</code> and <code>customer</code> to later steps needs outer variables. async/await fixes that.</li>
          <li><code>finally</code> runs whether the chain succeeded or failed, and passes the result through unchanged. Use it for clean-up.</li>
        </ul>
      </div>

      <Step n={4}>async/await</Step>
      <CodeFile path="04-async-lab/src/03-async-await.ts" />
      <Terminal>{`node src/03-async-await.ts`}</Terminal>
      <Output>{`
buildReceipt returned Promise { <pending> }
Order 42 for Ada Lovelace: €121.00 incl. VAT
Failed: ENOENT ENOENT: no such file or directory, open '~/…/projects/04-async-lab/fixtures/missing.json'`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Rule</th><th>Consequence</th></tr>
        </thead>
        <tbody>
          <tr><td>An <code>async</code> function always returns a promise</td><td><code>return 5</code> gives <code>Promise&lt;number&gt;</code>; a <code>throw</code> gives a rejected promise. Callers must await it.</td></tr>
          <tr><td><code>await</code> pauses only this function</td><td>The thread goes off to run other callbacks; nothing else is blocked.</td></tr>
          <tr><td><code>await</code> works in async functions and at the top level of ES modules</td><td>That is why the lab scripts can await outside any function.</td></tr>
          <tr><td>A rejected promise makes <code>await</code> throw</td><td>Ordinary <code>try/catch/finally</code> handles async errors.</td></tr>
          <tr><td>Awaiting a non-promise is allowed</td><td>It just continues on the next microtask. Harmless, but usually a sign of confusion.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={5}>Sequential versus parallel</Step>
      <div className="prose">
        <p>
          <code>await</code> makes code read top to bottom, which also makes it easy to wait for things one at a time
          when they could happen together. This is the most common performance mistake in Node code.
        </p>
      </div>
      <CodeFile path="04-async-lab/src/04-sequential-vs-parallel.ts" />
      <Terminal>{`node src/04-sequential-vs-parallel.ts`}</Terminal>
      <Output>{`
sequential: [ 1, 4, 9 ] 900 ms
parallel:   [ 1, 4, 9 ] 300 ms
eight at once: 1 4 9 16 25 36 49 64 300 ms
overlapped: 100 400 300 ms`}</Output>
      <Code title="What the clock sees" lang="plaintext">{`
sequential   |--- 1 ---|--- 2 ---|--- 3 ---|          900 ms
parallel     |--- 1 ---|
             |--- 2 ---|
             |--- 3 ---|                              300 ms`}</Code>
      <div className="prose">
        <p>
          A promise starts its work when it is <em>created</em>, not when it is awaited. <code>Promise.all</code> is just
          a convenient way to wait for several promises that are already running. The "overlapped" case shows the same
          idea without it: start a call, do something else, await the first call later.
        </p>
      </div>
      <Box kind="tip" label="When sequential is right">
        <p>
          When a step needs the previous result (the receipt chain), or when order matters (database migrations), or
          when running everything at once would overload something. Step 9 handles that last case.
        </p>
      </Box>

      <Step n={6}>The four combinators</Step>
      <CodeFile path="04-async-lab/src/05-combinators.ts" />
      <Terminal>{`node src/05-combinators.ts`}</Terminal>
      <Output>{`
all:        [ 'a', 'b' ] 200 ms
all (one fails): b broke 150 ms
allSettled: [ 'ok a', 'failed b broke' ] 150 ms
race:       fast 100 ms
any:        first success 200 ms
any (all fail): AggregateError [ 'x', 'y' ]`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Method</th><th>Fulfils when</th><th>Rejects when</th><th>Use it for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>Promise.all</code></td><td>Every input fulfils (array of values, in input order)</td><td>The first input rejects</td><td>Work that only makes sense if every part succeeds</td></tr>
          <tr><td><code>Promise.allSettled</code></td><td>Every input settles (array of status objects)</td><td>Never</td><td>Batches where some failures are acceptable: send 100 emails, report which failed</td></tr>
          <tr><td><code>Promise.race</code></td><td>The first input fulfils</td><td>The first input rejects</td><td>"Whichever settles first", such as a value versus a timeout</td></tr>
          <tr><td><code>Promise.any</code></td><td>The first input fulfils</td><td>Every input rejects (<code>AggregateError</code>)</td><td>Redundant sources: ask three mirrors, use the first answer</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="Rejecting is not cancelling">
        <p>
          When <code>Promise.all</code> rejects at 150 ms, the call for <code>'c'</code> keeps running until it finishes
          at 400 ms; its result is simply ignored. Promises cannot be cancelled. If the other work should stop, pass it an{' '}
          <code>AbortSignal</code> (step 8).
        </p>
      </Box>

      <Step n={7}>Pitfalls and unhandled rejections</Step>
      <CodeFile path="04-async-lab/src/06-pitfalls.ts" />
      <Terminal>{`node src/06-pitfalls.ts`}</Terminal>
      <Output>{`
after forEach: []
for...of:      [ 3, 1, 2 ]
Promise.all:   [ 3, 1, 2 ]
return await:   caught
return promise: escaped: failed later`}</Output>
      <div className="prose">
        <ul>
          <li>
            <strong><code>forEach</code>, <code>map</code> without <code>Promise.all</code>, <code>filter</code> and{' '}
            <code>reduce</code></strong> do not wait for async callbacks. Use <code>for...of</code> with{' '}
            <code>await</code> for one at a time, or <code>Promise.all(items.map(…))</code> for all at once.
          </li>
          <li>
            <strong><code>return await</code> inside <code>try</code></strong>: without the <code>await</code>, the
            function returns the promise and leaves the <code>try</code> block before the promise rejects. Outside a{' '}
            <code>try</code>, <code>return promise</code> and <code>return await promise</code> behave the same.
          </li>
        </ul>
        <p>The worst pitfall is a promise nobody awaits. Its rejection has nowhere to go:</p>
      </div>
      <CodeFile path="04-async-lab/src/07-unhandled.ts" />
      <Terminal>{`
node src/07-unhandled.ts
echo $?`}</Terminal>
      <Output>{`
request finished
file://~/…/projects/04-async-lab/src/07-unhandled.ts:5
  throw new Error('audit service is down');
        ^

Error: audit service is down
    at saveAuditLog (file://~/…/projects/04-async-lab/src/07-unhandled.ts:5:9)

Node.js v24.21.0
1`}</Output>
      <div className="prose">
        <p>
          The <code>try/catch</code> was useless: <code>saveAuditLog()</code> returned a pending promise without
          throwing, and the rejection happened 50 ms later. Since Node 15, an <strong>unhandled rejection</strong> crashes
          the process with exit code 1, exactly like an uncaught exception. In a server, that takes every user's
          request down with it. The fix is one word: <code>await saveAuditLog()</code>. If you deliberately do not wait
          ("fire and forget"), attach a handler: <code>saveAuditLog().catch(logError)</code>.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th><code>--unhandled-rejections=</code></th><th>Behaviour</th></tr>
        </thead>
        <tbody>
          <tr><td><code>throw</code> (default)</td><td>Emit <code>unhandledRejection</code>; if no listener handles it, throw it as an uncaught exception and crash</td></tr>
          <tr><td><code>strict</code></td><td>Always raise it as an uncaught exception</td></tr>
          <tr><td><code>warn</code></td><td>Print <code>UnhandledPromiseRejectionWarning</code> and keep running with exit code 0. Hides bugs; avoid</td></tr>
          <tr><td><code>warn-with-error-code</code>, <code>none</code></td><td>Warn and set exit code 1 / stay silent</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="Let tools find floating promises">
        <p>
          TypeScript catches some mistakes, such as <code>if (promise)</code> (always true) or doing arithmetic on a{' '}
          <code>Promise&lt;number&gt;</code>, but not a forgotten <code>await</code> on a call whose result you ignore.
          The ESLint rule <code>@typescript-eslint/no-floating-promises</code> catches exactly that. A process-wide{' '}
          <code>process.on('unhandledRejection', …)</code> listener is for logging before exiting, not for carrying on.
        </p>
      </Box>

      <Step n={8}>Cancellation</Step>
      <div className="prose">
        <p>
          A user closes the page, a deadline passes, the server is shutting down: work that nobody wants any more should
          stop. Node uses the web-standard pair <strong><code>AbortController</code></strong> (the remote control) and{' '}
          <strong><code>AbortSignal</code></strong> (the wire you pass into functions).
        </p>
      </div>
      <CodeFile path="04-async-lab/src/08-cancel.ts" />
      <Terminal>{`node src/08-cancel.ts`}</Terminal>
      <Output>{`
  page 1 done
  page 2 done
manual abort -> AbortError (cause: AbortError: This operation was aborted) 250 ms
  page 1 done
timeout -> AbortError (cause: TimeoutError: The operation was aborted due to timeout) 150 ms
  page 1 done
any -> AbortError (cause: Error: user pressed cancel) 120 ms
abort listener ran, reason: shutting down
throwIfAborted threw the reason: shutting down`}</Output>
      <TableWrap>
        <thead>
          <tr><th>API</th><th>Does</th></tr>
        </thead>
        <tbody>
          <tr><td><code>new AbortController()</code></td><td>Creates a controller with a fresh <code>.signal</code></td></tr>
          <tr><td><code>controller.abort(reason?)</code></td><td>Aborts the signal; <code>reason</code> defaults to an <code>AbortError</code></td></tr>
          <tr><td><code>AbortSignal.timeout(ms)</code></td><td>A signal that aborts itself after <code>ms</code> with a <code>TimeoutError</code></td></tr>
          <tr><td><code>AbortSignal.any([a, b])</code></td><td>Aborts as soon as any of the given signals does</td></tr>
          <tr><td><code>signal.aborted</code>, <code>signal.reason</code></td><td>Whether it has aborted, and why</td></tr>
          <tr><td><code>signal.throwIfAborted()</code></td><td>Throws the reason if aborted; call it between steps of long work</td></tr>
          <tr><td><code>signal.addEventListener('abort', fn, {'{ once: true }'})</code></td><td>Runs clean-up when aborted</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Many built-in APIs accept <code>{'{ signal }'}</code>: <code>fetch</code>, <code>timers/promises</code>,{' '}
          <code>fs.readFile</code>, <code>events.once</code>, <code>stream.pipeline</code>, <code>child_process</code>,{' '}
          <code>readline</code>'s <code>question</code> and HTTP requests. The pattern for your own functions is
          always the same: accept a signal and pass it to everything you await.
        </p>
      </div>

      <Step n={9}>Limit how much runs at once</Step>
      <div className="prose">
        <p>
          <code>Promise.all(items.map(fn))</code> starts <em>every</em> call immediately. With ten items that is fine.
          With ten thousand files you hit the operating system's open-file limit (<code>EMFILE</code>); with an API you
          hit its rate limit; with a database you queue behind its connection pool. A <strong>concurrency
          limit</strong> keeps a fixed number of calls in flight.
        </p>
      </div>
      <CodeFile path="04-async-lab/src/lib/map-limit.ts" />
      <CodeFile path="04-async-lab/src/09-limit.ts" />
      <Terminal>{`node src/09-limit.ts`}</Terminal>
      <Output>{`
no limit: peak 10 at once, 200 ms
limit 3:  peak 3 at once, 810 ms
results in input order: file1.done, file2.done, file3.done, file4.done …`}</Output>
      <div className="prose">
        <p>
          Ten 200 ms jobs, three at a time, take four rounds: about 800 ms. The comment in <code>mapLimit</code> is the
          key to async JavaScript: there are no threads racing here. A function only gives up control at an{' '}
          <code>await</code>, so code between two awaits can never be interrupted. In real projects the{' '}
          <code>p-limit</code> package does the same job.
        </p>
      </div>

      <Step n={10}>Async iteration</Step>
      <div className="prose">
        <p>
          Some data arrives over time: pages from an API, lines from a file, messages from a queue. An{' '}
          <strong>async generator</strong> (<code>async function*</code>) produces values one at a time, awaiting
          whatever it needs in between; <code>for await...of</code> consumes them.
        </p>
      </div>
      <CodeFile path="04-async-lab/src/10-for-await.ts" />
      <Terminal>{`node src/10-for-await.ts`}</Terminal>
      <Output>{`
  (fetched page 1)
item 1
item 2
item 3
  (fetched page 2)
item 4
item 5
item 6
  (fetched page 3)
item 7
item 8
item 9
  (generator cleaned up)
--- stop early: only the pages you need are fetched
  (fetched page 1)
item 1
item 2
item 3
  (fetched page 2)
item 4
  (generator cleaned up)`}</Output>
      <div className="prose">
        <p>
          The generator is <strong>lazy</strong>: page 2 is fetched only when the loop asks for item 4, and page 3 is
          never fetched in the second loop. <code>break</code> tells the generator to finish, which runs its{' '}
          <code>finally</code> block, the place to close connections or files. Readable streams, <code>readline</code>{' '}
          interfaces and <code>events.on()</code> are all async iterables too, so the same loop works on them in
          chapters 08 and 09.
        </p>
      </div>

      <Exercises
        items={[
          {
            task: <>Write <code>retry(fn, attempts, baseDelayMs)</code> in <code>src/lib/retry.ts</code>. It calls <code>fn</code> until it succeeds, waiting 100, 200, 400 ms … between attempts (exponential backoff), and rethrows the last error when attempts run out.</>,
            hint: <>A <code>for</code> loop with <code>try {'{ return await fn(); }'} catch</code> inside. The delay is <code>baseDelayMs * 2 ** (attempt - 1)</code>. Remember <code>return await</code>.</>,
            solution: (
              <>
                <CodeFile path="04-async-lab.practice/src/lib/retry.ts" />
                <CodeFile path="04-async-lab.practice/src/11-practice.ts" />
                <Output>{`
  attempt 1 failed (503 on call 1), retrying in 100 ms
  attempt 2 failed (503 on call 2), retrying in 200 ms
retry -> payment accepted
fast enough -> rows
too slow -> AbortError - TimeoutError
country-NL.json: 34 bytes
customer-7.json: 53 bytes
order.json: 47 bytes`}</Output>
              </>
            ),
          },
          {
            task: <>Write <code>withTimeout(task, ms)</code>, where <code>task</code> receives an <code>AbortSignal</code>, so that a slow task is really stopped rather than left running in the background.</>,
            hint: <>The whole implementation is one line with <code>AbortSignal.timeout(ms)</code>. Compare it with a <code>Promise.race</code> against a timer, which gives up waiting but never stops the work.</>,
            solution: <CodeFile path="04-async-lab.practice/src/lib/with-timeout.ts" />,
          },
          {
            task: <>Print the size of every <code>.json</code> file in <code>fixtures/</code>, reading at most two at a time with <code>mapLimit</code>.</>,
            hint: <><code>readdir(FIXTURES)</code> lists the names; <code>stat(path).size</code> gives bytes. Sort the names so the output is stable.</>,
            solution: <>See part 3 of <code>11-practice.ts</code> above.</>,
          },
        ]}
      />

      <Checkpoint question={<>A handler runs <code>const user = await getUser(id); const orders = await getOrders(id); const prefs = await getPrefs(id);</code>, each call taking about 100 ms and none depending on another. How long does it take, and how would you rewrite it?</>}>
        <p>
          About 300 ms, because each await waits for the previous call. None depends on another, so start them together:{' '}
          <code>const [user, orders, prefs] = await Promise.all([getUser(id), getOrders(id), getPrefs(id)])</code>, which
          takes about 100 ms. Use <code>allSettled</code> instead if the page can render without, say, the preferences.
        </p>
      </Checkpoint>
      <Checkpoint question="Inside a try block you call an async function without await, and it rejects 10 ms later. What happens, on Node 24, and why does the catch block not help?">
        <p>
          The call returns a pending promise and nothing throws, so the <code>try</code> block completes. When the
          promise rejects there is no handler attached, so Node raises an unhandled rejection and, by default, crashes the
          process with exit code 1. Adding <code>await</code> makes the rejection throw inside the <code>try</code>.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Callbacks, promises and async/await are three syntaxes for "the result arrives later"; async/await is promises underneath.</li>
          <li>A promise settles once. <code>then</code>/<code>catch</code> return new promises, so errors propagate down a chain to one handler.</li>
          <li>Promises start work when created. Await independent work together with <code>Promise.all</code>, and choose <code>allSettled</code>, <code>race</code> or <code>any</code> when you need their semantics.</li>
          <li>Every promise must be awaited or have a <code>.catch</code>. Unhandled rejections crash Node.</li>
          <li><code>forEach</code> does not await. Use <code>for...of</code> or <code>Promise.all(map)</code>, and <code>return await</code> inside <code>try</code>.</li>
          <li>Rejection is not cancellation: pass an <code>AbortSignal</code> to stop work, and limit concurrency when inputs are large.</li>
        </ul>
      </Recap>
    </>
  );
}
