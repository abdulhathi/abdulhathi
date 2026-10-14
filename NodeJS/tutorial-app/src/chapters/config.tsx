import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { requestContextFlow } from '../diagrams/specs/api';

const P = '09-tasks-api.4-config';
const X = '09-tasks-api.4-config.practice';

export function Config() {
  return (
    <>
      <ChapterIntro
        time="2–2.5 hours"
        project="09-tasks-api"
        learn={[
          'Where configuration belongs, and why it comes from environment variables',
          'Validating configuration at startup so a bad setting stops the process immediately',
          'Loading .env files with Node’s built-in flag, and which value wins',
          'Structured JSON logging with pino: levels, fields, child loggers and redaction',
          'Request ids that follow a request through every await, with AsyncLocalStorage',
          'Operational errors versus programmer errors, and why a server should crash on the second kind',
        ]}
        tools={[
          { name: 'zod', what: 'Validates process.env just like a request body.' },
          { name: '--env-file-if-exists', what: 'Node flag that loads KEY=value lines into process.env.' },
          { name: 'pino', what: 'A fast logger that writes one JSON object per line.' },
          { name: 'pino-pretty', what: 'Development tool that turns JSON log lines into readable text.' },
          { name: 'AsyncLocalStorage', what: 'From node:async_hooks. Per-request storage that survives await.' },
        ]}
      />

      <div className="prose">
        <p>
          The API works on your laptop. Before it can run anywhere else, it needs three things that have nothing to do
          with tasks: settings that change per environment without changing code, logs a machine can search, and a clear
          policy for errors nobody planned for. These are the parts of a service that operations teams notice first.
        </p>
      </div>

      <h2>Configuration lives in the environment</h2>
      <div className="prose">
        <p>
          The same code runs on your laptop, in CI and in production, with different ports, database locations and log
          levels. The widely followed <strong>twelve-factor</strong> guideline says: keep that configuration out of the
          code, in <strong>environment variables</strong>. Every platform (Docker, Kubernetes, Heroku, systemd, GitHub
          Actions) can set them, they never end up in git by accident, and changing one needs no rebuild.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Approach</th><th>Problem</th></tr>
        </thead>
        <tbody>
          <tr><td>Hard-coded values</td><td>Changing the port means changing code. Secrets end up in git history forever.</td></tr>
          <tr><td>A config file per environment</td><td>Files must be shipped with each deployment; easy to deploy the wrong one.</td></tr>
          <tr><td><code>process.env.PORT</code> scattered through the code</td><td>No single list of settings; typos give <code>undefined</code>; <code>"abc"</code> becomes <code>NaN</code> deep inside a request.</td></tr>
          <tr><td><strong>One config module, validated at startup</strong></td><td>None of the above: one typed object, checked once, before anything runs.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <strong>Fail fast</strong> is the principle: if <code>PORT</code> is <code>eighty</code>, the process should
          refuse to start with a message naming <code>PORT</code>, not boot happily and crash at 3 a.m. when the first
          request reaches the broken code path.
        </p>
      </div>

      <h2>.env files, built in</h2>
      <div className="prose">
        <p>
          Typing five variables before every <code>npm run dev</code> gets old. A <code>.env</code> file holds them as{' '}
          <code>KEY=value</code> lines, and Node can load it before your code runs. The <code>dotenv</code> package used
          to be required for this; Node now does it itself.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Option</th><th>When the file is missing</th></tr>
        </thead>
        <tbody>
          <tr><td><code>node --env-file=.env app.ts</code></td><td>Stops with <code>node: .env: not found</code></td></tr>
          <tr><td><code>node --env-file-if-exists=.env app.ts</code></td><td>Prints <code>.env not found. Continuing without it.</code> and runs</td></tr>
          <tr><td><code>process.loadEnvFile('.env')</code></td><td>Throws; call it from code when you need to decide at run time</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          A variable already set in the real environment <strong>wins</strong> over the file:{' '}
          <code>PORT=4005 node --env-file-if-exists=.env …</code> uses 4005 even if <code>.env</code> says 4000. That
          is what you want: the file holds local defaults, the platform overrides them. Commit a{' '}
          <code>.env.example</code> listing every variable with safe values; never commit <code>.env</code>, which will
          soon hold secrets.
        </p>
      </div>

      <h2>Structured logging</h2>
      <div className="prose">
        <p>
          <code>console.log('POST /tasks → 201 in 8.3 ms')</code> is pleasant to read and painful to search. In
          production, logs from many instances flow into a system such as CloudWatch, Datadog, Loki or Elasticsearch,
          and you want to ask questions like "every 5xx in the last hour for request id X". That needs{' '}
          <strong>structured logs</strong>: one JSON object per line, with named fields.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>console.log</th><th>pino</th></tr>
        </thead>
        <tbody>
          <tr><td>Format</td><td>Free text</td><td>One JSON object per line</td></tr>
          <tr><td>Levels</td><td>log, warn, error</td><td>trace, debug, info, warn, error, fatal; filter by <code>LOG_LEVEL</code></td></tr>
          <tr><td>Context</td><td>Build it into the string yourself</td><td>Fields: <code>log.info({'{ taskId }'}, 'task created')</code>; child loggers add fields to every line</td></tr>
          <tr><td>Secrets</td><td>Printed if you print the object</td><td><code>redact</code> replaces chosen paths with <code>[redacted]</code></td></tr>
          <tr><td>Speed</td><td>Fine for a CLI</td><td>Built to be cheap on a hot request path</td></tr>
        </tbody>
      </TableWrap>
      <TableWrap>
        <thead>
          <tr><th>Level</th><th>Number</th><th>Use it for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>fatal</code></td><td>60</td><td>The process is about to exit</td></tr>
          <tr><td><code>error</code></td><td>50</td><td>Something failed and needs a human: a 500, a lost connection</td></tr>
          <tr><td><code>warn</code></td><td>40</td><td>Unusual but handled: a 4xx, a retry, a slow query</td></tr>
          <tr><td><code>info</code></td><td>30</td><td>Normal events worth keeping: startup, a task created, each request</td></tr>
          <tr><td><code>debug</code></td><td>20</td><td>Detail for developers, off in production</td></tr>
          <tr><td><code>trace</code></td><td>10</td><td>Very fine detail, rarely enabled</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="Never log">
        <p>
          Passwords, tokens, API keys, session cookies, full card numbers, or more personal data than you need. Logs are
          copied to many systems and kept for months, often with weaker access control than the database. Redaction is
          a safety net, not a licence to log whole request bodies.
        </p>
      </Box>

      <h2>Request ids and AsyncLocalStorage</h2>
      <div className="prose">
        <p>
          The server handles many requests at once, so their log lines interleave. To follow one request you need an id
          on every line it produces: in the access log, in the service, in the error handler. Passing the id down as a
          parameter through every function is noisy and easy to forget.
        </p>
        <p>
          <code>AsyncLocalStorage</code> solves this. <code>storage.run(value, fn)</code> runs <code>fn</code> with{' '}
          <code>value</code> attached, and Node keeps it attached to everything <code>fn</code> starts: promises, awaits,
          timers, I/O callbacks and events. Anywhere in that chain, <code>storage.getStore()</code> returns the value. Two
          requests running at the same time each see their own. It is the Node equivalent of thread-local storage, but
          for asynchronous chains instead of threads.
        </p>
      </div>
      <Diagram
        spec={requestContextFlow}
        caption="The service never receives the request, yet its log lines carry the request id: the logger asks AsyncLocalStorage on every line."
      />

      <h2>Two kinds of error</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>Operational error</th><th>Programmer error</th></tr>
        </thead>
        <tbody>
          <tr><td>What it is</td><td>An expected failure of a correct program</td><td>A bug</td></tr>
          <tr><td>Examples</td><td>Invalid input, task not found, duplicate title, database briefly unreachable</td><td><code>TypeError: Cannot read properties of undefined</code>, a forgotten <code>await</code>, a wrong SQL column</td></tr>
          <tr><td>Handling</td><td>Answer with the right 4xx (or retry); log at <code>warn</code> or not at all</td><td>Answer 500 with no details; log at <code>error</code> with the stack; fix the code</td></tr>
          <tr><td>In this API</td><td><code>ZodError</code>, <code>AppError</code> subclasses, body-parser errors</td><td>Everything else reaching the error handler</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Errors that escape everything are a different matter. An exception thrown in a timer callback, or a promise
          that rejects with nobody awaiting it, never reaches Express. Node raises <code>uncaughtException</code> or{' '}
          <code>unhandledRejection</code> on <code>process</code>, and by default prints the error and exits.
        </p>
        <p>
          It is tempting to add a handler that logs and carries on. Do not. After an unexpected error you no longer know
          the state of the process: a transaction may be half done, a lock held, a connection broken. The safe policy is
          to log what happened at <code>fatal</code>, exit with a non-zero code, and let a supervisor (Docker, Kubernetes,
          systemd, PM2) start a clean process. Chapter 19 sets that up. Run more than one instance and users barely
          notice.
        </p>
      </div>

      <Step n={1}>Install the logger</Step>
      <Terminal>{`
npm install pino
npm install --save-dev pino-pretty
rm src/middleware/request-log.ts`}</Terminal>
      <CodeFile path={`${P}/package.json`} change="updated" />
      <div className="prose">
        <p>
          <code>pino-pretty</code> is a development dependency: in production the JSON goes to the log system as it is.
          The <code>dev</code> script now loads <code>.env</code> if there is one and pipes the output through{' '}
          <code>pino-pretty</code>. The <code>start</code> script does neither, because production sets real
          environment variables and wants raw JSON.
        </p>
      </div>

      <Step n={2}>The config module</Step>
      <CodeFile path={`${P}/src/config.ts`} change="new" />
      <div className="prose">
        <p>
          The schema is the single list of every setting, with types and defaults. <code>parseConfig</code> is pure: give
          it an object, get a typed <code>Config</code> or an error. That makes it trivial to test.{' '}
          <code>loadConfig</code> is the thin startup wrapper that reads <code>process.env</code> and exits with code 1
          on failure. <code>z.prettifyError</code> formats every problem, not just the first, so one restart fixes all of
          them. The rest of the app uses camelCase names (<code>config.port</code>) and never touches{' '}
          <code>process.env</code> again.
        </p>
      </div>
      <CodeFile path={`${P}/src/config.test.ts`} change="new" />
      <Code title=".env.example" lang="ini">{`
# Copy this file to .env for local settings. .env is in .gitignore; never commit it.
# Real environment variables win over values in .env.
NODE_ENV=development
PORT=4000
DB_FILE=data/tasks.db
LOG_LEVEL=debug`}</Code>
      <Terminal>{`cp .env.example .env`}</Terminal>

      <Step n={3}>Request context</Step>
      <CodeFile path={`${P}/src/request-context.ts`} change="new" />
      <div className="prose">
        <p>
          A load balancer or another service may already have assigned the request an id and sent it in{' '}
          <code>X-Request-Id</code>. Reusing it lets you follow one user action across several services. But it is input
          from outside, and it will be written into every log line, so it is accepted only if it is short and made of
          safe characters; otherwise a fresh UUID replaces it. The id goes back to the client in the response header,
          so a user reporting a problem can quote it.
        </p>
        <p>
          <code>storage.run({'{ requestId }'}, next)</code> calls <code>next</code> inside the context. Every middleware and
          handler after this one, and everything they await, runs inside it.
        </p>
      </div>

      <Step n={4}>The logger</Step>
      <CodeFile path={`${P}/src/logger.ts`} change="new" />
      <TableWrap>
        <thead>
          <tr><th>Option</th><th>Effect</th></tr>
        </thead>
        <tbody>
          <tr><td><code>level</code></td><td>Lines below this level are skipped, at almost no cost.</td></tr>
          <tr><td><code>base</code></td><td>Fields on every line. Pino's default adds <code>pid</code> and <code>hostname</code>; this replaces them with the service name, which is what you filter on when many services share a log system.</td></tr>
          <tr><td><code>timestamp</code></td><td>ISO time strings instead of milliseconds since 1970: readable, and still sortable.</td></tr>
          <tr><td><code>redact</code></td><td>Paths whose values become <code>[redacted]</code>. <code>*.password</code> matches a <code>password</code> one level down, such as <code>user.password</code>.</td></tr>
          <tr><td><code>mixin</code></td><td>A function whose result is merged into every line. Here it adds the request id when there is one.</td></tr>
          <tr><td><code>destination</code></td><td>Where lines go. Omitted means stdout; tests pass an object with a <code>write</code> method to capture lines.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Log to stdout and nothing else. Writing files, rotating them and shipping them away is the platform's job:
          Docker, systemd and every cloud collect stdout already.
        </p>
      </div>

      <Step n={5}>Access log and error handler</Step>
      <CodeFile path={`${P}/src/middleware/access-log.ts`} change="new" />
      <div className="prose">
        <p>
          The level follows the outcome, so <code>LOG_LEVEL=warn</code> shows only failing requests. The request id is
          not mentioned here at all; the mixin adds it, because the <code>finish</code> event fires inside the request's
          async context.
        </p>
      </div>
      <CodeFile path={`${P}/src/middleware/errors.ts`} change="updated" />
      <div className="prose">
        <p>Three changes from chapter 11:</p>
        <ul>
          <li>It is now a factory, <code>errorHandler(log)</code>, so it can log through pino instead of <code>console.error</code>.</li>
          <li>A 500 response includes the <code>requestId</code>. The client learns nothing about the cause, but support can find the exact log line.</li>
          <li>If the response has already started (<code>res.headersSent</code>), it cannot be replaced with JSON. Passing the error to <code>next</code> lets Express's built-in handler close the connection.</li>
        </ul>
      </div>

      <Step n={6}>Wire it in</Step>
      <CodeFile path={`${P}/src/app.ts`} change="updated" />
      <CodeFile path={`${P}/src/tasks/service.ts`} change="updated" />
      <div className="prose">
        <p>
          The service takes a logger as an optional second argument and defaults to a silent one, so the unit tests from
          chapter 13 still construct it with just a repository. Its log line says only <code>taskId</code>; the request
          id arrives through the mixin.
        </p>
      </div>
      <CodeFile path={`${P}/src/server.ts`} change="updated" />
      <div className="prose">
        <p>
          The order matters: configuration first (nothing else can start without it), then the logger, then the crash
          handlers, then everything that might fail. Throwing inside the <code>listen</code> callback, for example on{' '}
          <code>EADDRINUSE</code>, now ends up as a <code>fatal</code> log line too.
        </p>
      </div>

      <Step n={7}>Update the HTTP tests</Step>
      <CodeFile path={`${P}/src/app.test.ts`} change="updated" />
      <div className="prose">
        <p>
          Most tests pass <code>createLogger('silent')</code>. The 500 test passes a logger that writes into an array,
          then checks the response and the log line carry the same request id, and that the real error message reached
          the log and not the client. That one test proves the error handler, the request context and the logger work
          together.
        </p>
      </div>
      <Terminal>{`npm test`}</Terminal>
      <Output>{`
…
ℹ tests 36
ℹ suites 7
ℹ pass 36
ℹ fail 0`}</Output>

      <Step n={8}>Run it</Step>
      <div className="prose">
        <p>First, prove the config check works:</p>
      </div>
      <Terminal>{`PORT=eighty LOG_LEVEL=loud npm start`}</Terminal>
      <Output>{`
Invalid configuration:
✖ Invalid input: expected number, received NaN
  → at PORT
✖ Invalid option: expected one of "fatal"|"error"|"warn"|"info"|"debug"|"trace"|"silent"
  → at LOG_LEVEL`}</Output>
      <div className="prose">
        <p>Both problems at once, and exit code 1. Now start it normally and send three requests, the last with an id of your own:</p>
      </div>
      <Terminal title="Terminal 1">{`npm start`}</Terminal>
      <Terminal title="Terminal 2">{`
curl -i -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"title":"Structured logging"}'
curl localhost:4000/tasks/42
curl -H 'x-request-id: trace-from-proxy-7' localhost:4000/tasks`}</Terminal>
      <Output caption="Terminal 1">{`
{"level":30,"time":"2026-10-12T07:10:08.227Z","service":"tasks-api","port":4000,"env":"development","dbFile":"data/tasks.db","msg":"tasks API listening"}
{"level":30,"time":"2026-10-12T07:10:09.259Z","service":"tasks-api","requestId":"5c09905c-c746-4664-8d38-d57cff69d16d","taskId":"bb84229e-cdeb-4d38-b340-bb12c92e567c","msg":"task created"}
{"level":30,"time":"2026-10-12T07:10:09.261Z","service":"tasks-api","requestId":"5c09905c-c746-4664-8d38-d57cff69d16d","method":"POST","url":"/tasks","status":201,"ms":10.7,"msg":"request finished"}
{"level":40,"time":"2026-10-12T07:10:09.275Z","service":"tasks-api","requestId":"6e165f02-7644-44c2-af66-b9c8c4ac8826","method":"GET","url":"/tasks/42","status":400,"ms":2.3,"msg":"request finished"}
{"level":30,"time":"2026-10-12T07:10:09.286Z","service":"tasks-api","requestId":"trace-from-proxy-7","method":"GET","url":"/tasks","status":200,"ms":1.2,"msg":"request finished"}`}</Output>
      <div className="prose">
        <p>
          The service's <code>task created</code> line and the access log share a request id, which also came back in
          the <code>x-request-id</code> response header of the first curl. The 400 is logged at level 40 (warn). The
          third request kept the caller's id. Now the developer view:
        </p>
      </div>
      <Terminal title="Terminal 1">{`npm run dev`}</Terminal>
      <Output caption="Terminal 1, after one POST">{`
[00:10:09.884] INFO: tasks API listening
    service: "tasks-api"
    port: 4000
    env: "development"
    dbFile: "data/tasks.db"
[00:10:11.167] INFO: task created
    service: "tasks-api"
    requestId: "5cfdae32-48a5-467d-be65-114e6ebe6246"
    taskId: "ad8f911c-4c21-495f-b14e-14ba09ba3809"
[00:10:11.170] INFO: request finished
    service: "tasks-api"
    requestId: "5cfdae32-48a5-467d-be65-114e6ebe6246"
    method: "POST"
    url: "/tasks"
    status: 201
    ms: 10.4`}</Output>
      <div className="prose">
        <p>Same data, formatted for humans, with times in your local zone. Try <code>LOG_LEVEL=warn npm start</code>: only the 400 line appears.</p>
      </div>

      <Box kind="try" label="Try it: a promise nobody awaited">
        <p>Add this function to <code>tasks/routes.ts</code> and call it, without <code>await</code>, right after <code>tasks.create(input)</code>:</p>
        <Output caption="The change">{`
async function sendWelcomeEmail(_title: string) {
  throw new Error('SMTP server refused the connection');
}
…
    sendWelcomeEmail(task.title); // forgot await, and nothing catches it`}</Output>
        <p>Create a task. The client gets its 201, and then the server logs this and exits:</p>
        <Output caption="Terminal 1">{`{"level":60,"time":"2026-10-12T07:10:29.889Z","service":"tasks-api","requestId":"20cf4a14-ffa9-477f-a1fa-3b73d7298dc7","err":{"type":"Error","message":"SMTP server refused the connection","stack":"Error: SMTP server refused the connection\\n    at sendWelcomeEmail (file://…/src/tasks/routes.ts:9:9)\\n    at file://…/src/tasks/routes.ts:23:5\\n    at process.processTicksAndRejections (node:internal/process/task_queues:104:5)"},"msg":"unhandled promise rejection, exiting"}`}</Output>
        <p>
          Express 5 catches the promise a handler returns, not promises a handler starts and forgets. Even this fatal
          line carries the request id, because the rejected promise was created inside the request's context. The fix
          is to <code>await</code> it, or to attach a <code>.catch()</code> that logs the failure if the email is
          genuinely fire-and-forget. Remove the change afterwards.
        </p>
      </Box>

      <Exercises
        items={[
          {
            task: <>Make the JSON body limit configurable with a <code>BODY_LIMIT</code> variable (default <code>10kb</code>). Values such as <code>500b</code>, <code>10kb</code> or <code>1mb</code> are valid; anything else must stop startup with a clear message.</>,
            hint: <>Add the variable to the schema with <code>.regex()</code> and a custom message, add <code>bodyLimit</code> to <code>Config</code>, give <code>AppDeps</code> an optional <code>bodyLimit</code>, and pass it from <code>server.ts</code>. Add a test to <code>config.test.ts</code>.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/config.ts`} />
                <CodeFile path={`${X}/src/app.ts`} />
                <Output caption="BODY_LIMIT=huge npm start">{`
Invalid configuration:
✖ Use a size such as 500b, 10kb or 1mb
  → at BODY_LIMIT`}</Output>
              </>
            ),
          },
          {
            task: <>Write <code>src/logger.test.ts</code> proving the redaction works: a password, a token and an authorization header logged through <code>createLogger</code> never appear in the output. Also check that lines below the level are skipped.</>,
            hint: <>Pass <code>{'{ write: (line) => lines.push(JSON.parse(line)) }'}</code> as the destination, log a few objects, then search <code>JSON.stringify(lines)</code> for each secret.</>,
            solution: <CodeFile path={`${X}/src/logger.test.ts`} />,
          },
        ]}
      />

      <Checkpoint question="Why validate configuration once at startup, rather than checking each setting where it is first used?">
        <p>
          A setting may be first used long after startup, for example on the first request that touches a rarely used
          feature, so a mistake would surface hours later, in production, in front of a user. Validating everything at
          startup turns that into an immediate, obvious failure during deployment, when someone is watching and the old
          version is still running. It also gives the rest of the code one typed object instead of strings and{' '}
          <code>undefined</code>.
        </p>
      </Checkpoint>
      <Checkpoint question="Two requests are being handled at the same moment, and both reach the service's log line. How does each line get the right request id when the service never receives the request?">
        <p>
          <code>requestContext</code> ran each request's middleware chain inside <code>storage.run()</code> with that
          request's id. Node tracks which asynchronous context every callback and promise continuation belongs to, so
          when either request resumes after an <code>await</code> and logs, <code>storage.getStore()</code> inside pino's
          mixin returns the store for that request. The two chains interleave on one thread but never share a store.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Read configuration from environment variables, validate it with a schema in one module, and fail fast at startup.</li>
          <li>Use <code>--env-file-if-exists=.env</code> in development; real environment variables override the file. Commit <code>.env.example</code>, never <code>.env</code>.</li>
          <li>Log JSON to stdout with levels and fields; redact secrets; pretty-print only in development.</li>
          <li><code>AsyncLocalStorage</code> carries per-request data such as a request id through every await without passing it around.</li>
          <li>Answer operational errors with the right status; log programmer errors in full and return a generic 500 with a request id.</li>
          <li>On <code>uncaughtException</code> or <code>unhandledRejection</code>, log at fatal and exit; a supervisor restarts a clean process.</li>
        </ul>
      </Recap>
    </>
  );
}
