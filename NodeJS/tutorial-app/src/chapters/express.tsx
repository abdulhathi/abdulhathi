import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { apiLayers, middlewarePipeline } from '../diagrams/specs/api';

const P = '09-tasks-api.1-express';

export function Express() {
  return (
    <>
      <ChapterIntro
        time="2.5–3 hours"
        project="09-tasks-api"
        learn={[
          'How Express turns every request into a chain of middleware',
          'A layered structure: routes for HTTP, a service for rules, a repository for storage',
          'Validating bodies, route params and query strings with Zod, and getting TypeScript types from the same schemas',
          'Picking the right status code for every outcome: 200, 201, 204, 400, 404, 409, 413, 422, 500',
          'Handling every error in one place, including errors in async handlers',
          'Exercising an API by hand with curl',
        ]}
        tools={[
          { name: 'express', what: 'The most widely used Node web framework. Version 5 handles async errors for you.' },
          { name: 'zod', what: 'Schema validation. Checks data at run time and infers TypeScript types.' },
          { name: '@types/express', what: 'Types for Express, which is written in JavaScript.' },
          { name: 'curl', what: 'Command-line HTTP client, preinstalled on macOS, Linux and Windows 10+.' },
        ]}
      />

      <div className="prose">
        <p>
          In chapter 10 you routed requests with <code>if</code> statements and read request bodies chunk by chunk. That
          works, and now you know what it costs. From here to chapter 19 you build one project, a tasks API, and grow it
          the way real services grow: storage, tests, logging, authentication, a production database and deployment.
          This chapter lays the foundation, so it is worth getting the structure right.
        </p>
      </div>

      <h2>What a framework gives you</h2>
      <TableWrap>
        <thead>
          <tr><th>Job</th><th>With node:http (chapter 10)</th><th>With Express</th></tr>
        </thead>
        <tbody>
          <tr><td>Routing</td><td>Compare <code>req.method</code> and split <code>req.url</code> yourself</td><td><code>router.get('/:id', handler)</code>, with <code>req.params.id</code> filled in</td></tr>
          <tr><td>Query strings</td><td><code>new URL(req.url, base).searchParams</code></td><td><code>req.query</code></td></tr>
          <tr><td>JSON bodies</td><td>Collect chunks, enforce a size limit, <code>JSON.parse</code>, handle bad JSON</td><td><code>express.json({'{ limit }'})</code>, then <code>req.body</code></td></tr>
          <tr><td>Responses</td><td><code>writeHead</code>, headers, <code>JSON.stringify</code>, <code>end</code></td><td><code>res.status(201).json(task)</code></td></tr>
          <tr><td>Cross-cutting code</td><td>Call helpers at the top of every handler</td><td>Middleware, added once with <code>app.use()</code></td></tr>
          <tr><td>Errors</td><td>try/catch in every handler</td><td>One error middleware for the whole app</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>Express is not the only choice. Knowing the landscape helps in interviews and when you join a team.</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Framework</th><th>In one line</th><th>Pick it when</th></tr>
        </thead>
        <tbody>
          <tr><td>Express</td><td>Minimal, unopinionated, the largest ecosystem of middleware and answers online</td><td>You want the industry default and full control of structure</td></tr>
          <tr><td>Fastify</td><td>Faster, schema-first, a plugin system with encapsulation</td><td>Throughput matters, or you like JSON Schema validation built in</td></tr>
          <tr><td>NestJS</td><td>Angular-style modules, decorators and dependency injection, usually on top of Express</td><td>Large teams that want one enforced architecture</td></tr>
          <tr><td>Hono</td><td>Tiny, built on Web standard Request and Response, runs on Node, Bun, Deno and edge platforms</td><td>You deploy to edge runtimes or want one codebase for several runtimes</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          This course uses <strong>Express 5</strong>. It became the default version on npm in 2025 after a decade on
          version 4, and its headline change matters a great deal: a rejected promise in a handler now reaches your error
          handler instead of crashing the process. You will see both behaviours below.
        </p>
      </div>

      <h2>Middleware: the one idea in Express</h2>
      <div className="prose">
        <p>
          An Express app is a list of functions. Each request walks down the list in the order the functions were added.
          Every function receives <code>(req, res, next)</code> and does one of three things: sends a response, which
          ends the walk; calls <code>next()</code> to pass the request on; or calls <code>next(err)</code> (or throws) to
          jump straight to the error-handling middleware. Route handlers are just middleware attached to a method and a
          path.
        </p>
      </div>
      <Diagram
        spec={middlewarePipeline}
        caption="The middleware chain you build in this chapter. Order matters: express.json() must run before the router, or req.body is undefined when the handler reads it."
      />
      <TableWrap>
        <thead>
          <tr><th>Kind</th><th>Signature</th><th>Example</th></tr>
        </thead>
        <tbody>
          <tr><td>Application middleware</td><td><code>(req, res, next)</code> via <code>app.use(fn)</code></td><td>Request logging, parsing bodies</td></tr>
          <tr><td>Router</td><td><code>express.Router()</code>, mounted with <code>app.use('/tasks', router)</code></td><td>All routes under <code>/tasks</code>; inside, paths are relative</td></tr>
          <tr><td>Route handler</td><td><code>router.get(path, fn)</code></td><td>The code for <code>GET /tasks/:id</code></td></tr>
          <tr><td>Error middleware</td><td><code>(err, req, res, next)</code>: exactly <strong>four</strong> parameters</td><td>Turning errors into JSON responses</td></tr>
          <tr><td>Built-in</td><td><code>express.json()</code>, <code>express.urlencoded()</code>, <code>express.static()</code></td><td>Parsing JSON or form bodies, serving files</td></tr>
          <tr><td>Third-party</td><td>Packages from npm</td><td><code>helmet</code> (chapter 15), <code>cors</code></td></tr>
        </tbody>
      </TableWrap>

      <h2>REST and status codes</h2>
      <div className="prose">
        <p>
          REST is a convention for HTTP APIs: URLs name <strong>resources</strong> (<code>/tasks</code>,{' '}
          <code>/tasks/42</code>) and HTTP methods say what to do with them. Following the convention means clients,
          proxies and other developers can guess how your API behaves.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Request</th><th>Meaning</th><th>Success</th></tr>
        </thead>
        <tbody>
          <tr><td><code>GET /tasks?done=false&amp;limit=20</code></td><td>List, filtered and paginated</td><td>200 with a page of tasks</td></tr>
          <tr><td><code>POST /tasks</code></td><td>Create</td><td>201, a <code>Location</code> header with the new URL, and the task</td></tr>
          <tr><td><code>GET /tasks/:id</code></td><td>Read one</td><td>200</td></tr>
          <tr><td><code>PATCH /tasks/:id</code></td><td>Change some fields</td><td>200 with the updated task</td></tr>
          <tr><td><code>DELETE /tasks/:id</code></td><td>Delete</td><td>204 No Content, an empty body</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <code>PUT</code> replaces a whole resource; <code>PATCH</code> changes part of it. Most APIs that let clients
          tick a task done use <code>PATCH</code>, as this one does. <code>GET</code>, <code>PUT</code> and{' '}
          <code>DELETE</code> are <strong>idempotent</strong>: sending them twice leaves the server in the same state as
          sending them once. <code>POST</code> is not, which is why retrying a failed <code>POST</code> can create a
          duplicate.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Status</th><th>When this API sends it</th></tr>
        </thead>
        <tbody>
          <tr><td>400 Bad Request</td><td>The request is malformed: invalid JSON, a missing title, <code>limit=500</code>, an id that is not a UUID</td></tr>
          <tr><td>404 Not Found</td><td>No task with that id, or no route for that URL</td></tr>
          <tr><td>409 Conflict</td><td>The request clashes with the current state: an open task with the same title exists</td></tr>
          <tr><td>413 Content Too Large</td><td>The body is over the 10 kB limit</td></tr>
          <tr><td>422 Unprocessable Content</td><td>Well formed, but breaks a business rule: a due date in the past</td></tr>
          <tr><td>500 Internal Server Error</td><td>A bug or an outage. The client learns nothing about the cause</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="tip" label="400 or 422?">
        <p>
          Teams disagree, and both are defensible. The rule used here: 400 when the request does not match the schema
          (the client sent the wrong shape), 422 when the shape is right but the values break a rule only the server
          knows about. Whatever you choose, be consistent and document it.
        </p>
      </Box>

      <h2>The structure: three layers</h2>
      <Diagram
        spec={apiLayers}
        caption="Each layer only talks to the one below it. The routes never touch storage, and the service never sees a request object."
      />
      <TableWrap>
        <thead>
          <tr><th>Layer</th><th>Knows about</th><th>Does not know about</th></tr>
        </thead>
        <tbody>
          <tr><td><code>routes.ts</code></td><td>HTTP: paths, params, status codes, headers</td><td>Business rules, storage</td></tr>
          <tr><td><code>service.ts</code></td><td>Rules: what makes a task valid, what counts as a duplicate</td><td>HTTP, SQL</td></tr>
          <tr><td>Repository</td><td>How to store and find tasks</td><td>Rules, HTTP</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The payoff comes later. In chapter 12 you swap the in-memory store for SQLite by writing one new class and
          changing one line in <code>server.ts</code>. In chapter 13 you test the rules without starting a server. In
          chapter 18 you move to PostgreSQL and the routes and service do not change at all.
        </p>
        <p>
          That last move is why the repository interface is <strong>async from day one</strong>. An in-memory map could
          answer instantly, but a database on the network cannot. If the interface returned plain values now, every
          caller would have to change to <code>await</code> later. Returning promises costs nothing today and keeps the
          door open.
        </p>
      </div>

      <Step n={1}>Create the project</Step>
      <div className="prose">
        <p>Set up the project as in chapter 03, then install Express and Zod, plus the Express types.</p>
      </div>
      <Terminal>{`
cd ~/Developer/StudyGuide/github-portfolio/NodeJS/projects
mkdir 09-tasks-api && cd 09-tasks-api
npm init -y && npm pkg set type=module
cp ../01-hello-node/{tsconfig.json,.gitignore,.node-version} .
npm install express zod
npm install --save-dev @types/express @types/node@24 typescript
mkdir -p src/tasks src/middleware`}</Terminal>
      <CodeFile path={`${P}/package.json`} />
      <div className="prose">
        <p>
          Express and Zod are <code>dependencies</code>: the running server imports them. The types and compiler are{' '}
          <code>devDependencies</code>. The <code>start</code> script now points at <code>src/server.ts</code>.
        </p>
      </div>

      <Step n={2}>Errors the API expects</Step>
      <div className="prose">
        <p>
          Some failures are part of normal operation: a client asks for a task that does not exist. Model those as
          classes, each carrying its HTTP status and a stable <code>code</code> string. Clients should branch on{' '}
          <code>code</code>, never on the wording of <code>message</code>, so you can improve messages without breaking
          anyone.
        </p>
      </div>
      <CodeFile path={`${P}/src/errors.ts`} />
      <div className="prose">
        <p>
          <code>new.target.name</code> is the name of the class actually being constructed, so a{' '}
          <code>NotFoundError</code> reports itself as <code>NotFoundError</code> in stack traces rather than{' '}
          <code>AppError</code>. Fields are declared and assigned explicitly because the shorthand{' '}
          <code>constructor(readonly status: number)</code> is one of the TypeScript features Node cannot strip.
        </p>
      </div>

      <Step n={3}>The task model and its schemas</Step>
      <div className="prose">
        <p>
          TypeScript types disappear when Node runs your code, so they cannot protect you from what a client sends. A{' '}
          <strong>schema</strong> can: it is an object that checks data at run time. Zod builds the schema and infers the
          TypeScript type from it, so the check and the type can never disagree.
        </p>
      </div>
      <CodeFile path={`${P}/src/tasks/task.ts`} />
      <TableWrap>
        <thead>
          <tr><th>Zod piece</th><th>What it does here</th></tr>
        </thead>
        <tbody>
          <tr><td><code>z.string().trim().min(1)</code></td><td>Trims spaces first, then rejects an empty title. Schemas can transform as well as check.</td></tr>
          <tr><td><code>z.enum(PRIORITIES).default('medium')</code></td><td>Only the three priorities; fills in <code>medium</code> when missing.</td></tr>
          <tr><td><code>z.iso.date().nullable()</code></td><td>A <code>YYYY-MM-DD</code> date that exists (no 31 February), or <code>null</code> to clear it.</td></tr>
          <tr><td><code>z.strictObject(...)</code></td><td>Rejects unknown keys, so a typo like <code>titel</code> is an error, not silently ignored.</td></tr>
          <tr><td><code>.refine(fn, message)</code></td><td>A custom rule over the whole object: a PATCH must change something.</td></tr>
          <tr><td><code>z.coerce.number()</code></td><td>Query strings are text; this converts <code>"20"</code> to <code>20</code> before checking.</td></tr>
          <tr><td><code>z.stringbool()</code></td><td>Turns <code>"true"</code>/<code>"false"</code> (and <code>1</code>/<code>0</code>, <code>yes</code>/<code>no</code>) into a boolean.</td></tr>
          <tr><td><code>z.uuid()</code></td><td>Route ids must be UUIDs, so <code>/tasks/42</code> is a 400, not a pointless lookup.</td></tr>
          <tr><td><code>z.infer&lt;typeof Schema&gt;</code></td><td>The TypeScript type of the schema's <em>output</em>, after defaults and transforms.</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="The coerce.boolean trap">
        <p>
          <code>z.coerce.boolean()</code> uses JavaScript's <code>Boolean(value)</code>, and every non-empty string is
          truthy, so <code>z.coerce.boolean().parse('false')</code> returns <code>true</code>. A filter written that
          way returns finished tasks when the client asked for unfinished ones. Use <code>z.stringbool()</code> for
          query strings.
        </p>
      </Box>
      <div className="prose">
        <p>
          Notice that a schema and its type share a name, such as <code>CreateTaskInput</code>. That is legal because
          TypeScript keeps values and types in separate namespaces, and it reads well:{' '}
          <code>CreateTaskInput.parse(body)</code> returns a <code>CreateTaskInput</code>.
        </p>
      </div>

      <Step n={4}>The repository</Step>
      <div className="prose">
        <p>First the contract, then the simplest thing that fulfils it.</p>
      </div>
      <CodeFile path={`${P}/src/tasks/repository.ts`} />
      <CodeFile path={`${P}/src/tasks/memory-repository.ts`} />
      <div className="prose">
        <p>
          <code>#tasks</code> is a JavaScript private field: unlike TypeScript's <code>private</code>, it is enforced at
          run time too. The methods are <code>async</code>, so they return promises even though a <code>Map</code>{' '}
          answers instantly. Every task goes in and comes out as a copy. Without that, a caller that changed a returned
          object would change the stored one without calling <code>update</code>, a bug that only an in-memory store
          has and that hides until you switch to a real database.
        </p>
        <p>
          Sorting by <code>createdAt</code> and then <code>id</code> gives a stable order even when two tasks are created
          in the same millisecond. Pagination over an unstable order shows some items twice and others never.
        </p>
      </div>

      <Step n={5}>The service: the rules</Step>
      <CodeFile path={`${P}/src/tasks/service.ts`} />
      <div className="prose">
        <p>
          The service generates ids with <code>randomUUID()</code> from <code>node:crypto</code> rather than leaving it
          to the database. Ids then look the same in every store, and the service knows the id before anything is saved.
          The repository is passed into the constructor: this is <strong>dependency injection</strong> without a
          framework. Tests can pass a fake; production passes the real thing.
        </p>
        <p>
          The rules throw the error classes from step 2. The service has no idea that a <code>ConflictError</code> will
          become a 409; it just says what went wrong.
        </p>
      </div>

      <Step n={6}>The routes: HTTP in, HTTP out</Step>
      <CodeFile path={`${P}/src/tasks/routes.ts`} />
      <div className="prose">
        <p>
          Each handler does three things: parse the input with a schema, call the service, choose the status code.{' '}
          <code>parse()</code> throws a <code>ZodError</code> when the input is wrong, and Express 5 forwards that, like
          any thrown error or rejected promise, to the error middleware. There is no try/catch anywhere.
        </p>
        <p>
          <code>req.baseUrl</code> is the path the router is mounted on (<code>/tasks</code>), so the{' '}
          <code>Location</code> header stays correct if you mount the router somewhere else.{' '}
          <code>res.status(204).end()</code> sends no body at all, as a 204 requires.
        </p>
      </div>
      <Box kind="tip" label="Why parse in the handler, not in a validation middleware?">
        <p>
          A common pattern is a <code>validate(schema)</code> middleware that replaces <code>req.body</code> or{' '}
          <code>req.query</code> with the parsed result. Two problems: in Express 5, <code>req.query</code> is a getter,
          and assigning to it throws{' '}
          <code>TypeError: Cannot set property query of #&lt;IncomingMessage&gt; which has only a getter</code>. And
          TypeScript cannot carry the parsed type from one middleware into the next handler, so <code>req.body</code>{' '}
          stays <code>any</code>. Calling <code>Schema.parse()</code> at the top of the handler is one line, and the
          result is fully typed.
        </p>
      </Box>

      <Step n={7}>Middleware: logging and errors</Step>
      <CodeFile path={`${P}/src/middleware/request-log.ts`} />
      <div className="prose">
        <p>
          The logger cannot print the status code straight away, because the handler has not run yet. It listens for the
          response's <code>finish</code> event, which fires once the last byte is handed to the operating system, then
          calls <code>next()</code> so the request continues. Chapter 14 replaces this with structured logging.
        </p>
      </div>
      <CodeFile path={`${P}/src/middleware/errors.ts`} />
      <div className="prose">
        <p>The error handler sorts every error into one of four groups:</p>
        <ul>
          <li><strong>ZodError</strong>: 400, with one entry per problem so a client can highlight each bad field.</li>
          <li><strong>AppError</strong>: the status and code the error carries.</li>
          <li><strong>Errors from express.json()</strong>: they have a <code>status</code> (400 for bad JSON, 413 for too large) and <code>expose: true</code>, meaning their message is safe to show.</li>
          <li><strong>Anything else</strong>: a bug or an outage. Log the full error for yourself, send a generic 500 to the client. Stack traces and SQL in a response help attackers, not users.</li>
        </ul>
      </div>
      <Box kind="warn" label="Four parameters, always">
        <p>
          Express decides whether a function is error middleware by counting its declared parameters. Remove the unused{' '}
          <code>_next</code> and your handler becomes ordinary middleware that errors skip. The underscore tells readers
          (and linters) it is unused on purpose.
        </p>
      </Box>

      <Step n={8}>Assemble the app and start the server</Step>
      <CodeFile path={`${P}/src/app.ts`} />
      <CodeFile path={`${P}/src/server.ts`} />
      <div className="prose">
        <p>
          Splitting <code>createApp()</code> from <code>server.ts</code> is the most useful structural habit in this
          chapter. <code>createApp</code> builds an app from the dependencies it is given and returns it without
          listening. <code>server.ts</code> chooses the real dependencies and opens the port. Tests in chapter 13 call{' '}
          <code>createApp</code> with test dependencies and listen on a random port.
        </p>
        <p>
          <code>app.disable('x-powered-by')</code> stops Express advertising itself in every response header. In Express
          5, <code>app.listen</code> passes startup errors such as <code>EADDRINUSE</code> (port already in use) to the
          callback, so throwing there stops the process with a clear message.
        </p>
      </div>

      <Step n={9}>Run it and create tasks</Step>
      <Terminal title="Terminal 1">{`npm run dev`}</Terminal>
      <Terminal title="Terminal 2">{`
curl -i -X POST localhost:4000/tasks \\
  -H 'content-type: application/json' \\
  -d '{"title":"Write the README","priority":"high","dueDate":"2026-12-01"}'`}</Terminal>
      <Output>{`
HTTP/1.1 201 Created
Location: /tasks/3017abe9-4dde-444e-9b43-0bc5941b519e
Content-Type: application/json; charset=utf-8
Content-Length: 165
ETag: W/"a5-0cD8g84+BixjmCkqtsgVGhi9efM"
…

{"id":"3017abe9-4dde-444e-9b43-0bc5941b519e","title":"Write the README","done":false,"priority":"high","dueDate":"2026-12-01","createdAt":"2026-10-12T06:54:39.609Z"}`}</Output>
      <div className="prose">
        <p>
          <code>-i</code> shows the response headers. Your ids and timestamps will differ. Note the{' '}
          <code>Location</code> header, and the <code>ETag</code>, which Express adds so clients can cache responses.
          Pick a due date in the future, or the rule from step 5 rejects it. Now create a second task and try the other
          routes, using the id from your own output:
        </p>
      </div>
      <Terminal title="Terminal 2">{`
curl -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"title":"Learn Express 5"}'
curl localhost:4000/tasks
curl 'localhost:4000/tasks?priority=high&limit=5'
curl -X PATCH localhost:4000/tasks/<id> -H 'content-type: application/json' -d '{"done":true}'
curl -i -X DELETE localhost:4000/tasks/<id>`}</Terminal>
      <Output>{`
{"items":[{"id":"3017abe9-…","title":"Write the README","done":false,"priority":"high","dueDate":"2026-12-01","createdAt":"2026-10-12T06:54:39.609Z"},{"id":"25319ec5-…","title":"Learn Express 5","done":false,"priority":"medium","dueDate":null,"createdAt":"2026-10-12T06:54:39.618Z"}],"total":2,"limit":20,"offset":0}

{"items":[{"id":"3017abe9-…","title":"Write the README",…}],"total":1,"limit":5,"offset":0}

{"id":"3017abe9-…","title":"Write the README","done":true,"priority":"high","dueDate":"2026-12-01","createdAt":"2026-10-12T06:54:39.609Z"}

HTTP/1.1 204 No Content`}</Output>
      <div className="prose">
        <p>
          The second task got <code>priority: "medium"</code> from the schema default and <code>dueDate: null</code> from
          the service. A list response carries <code>total</code>, <code>limit</code> and <code>offset</code>, so a client
          can draw page numbers without fetching everything.
        </p>
      </div>

      <Step n={10}>Tour the errors</Step>
      <div className="prose">
        <p>An API is judged by its errors as much as its successes. Send each of these and read the replies.</p>
      </div>
      <Terminal>{`
curl -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"titel":"Typo","priority":"urgent"}'
curl -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"title":"learn express 5"}'
curl -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"title":"Time travel","dueDate":"2020-01-01"}'
curl 'localhost:4000/tasks?limit=500&done=maybe'
curl localhost:4000/tasks/42
curl localhost:4000/tasks/7d0f6c8e-1b2a-4c3d-9e4f-5a6b7c8d9e0f
curl -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"title":'
curl localhost:4000/users`}</Terminal>
      <Output>{`
{"error":{"code":"validation_failed","message":"The request is not valid","details":[{"path":"title","message":"Invalid input: expected string, received undefined"},{"path":"priority","message":"Invalid option: expected one of \\"low\\"|\\"medium\\"|\\"high\\""},{"path":"","message":"Unrecognized key: \\"titel\\""}]}}
{"error":{"code":"conflict","message":"An open task called \\"learn express 5\\" already exists"}}
{"error":{"code":"rule_violation","message":"Due date cannot be in the past"}}
{"error":{"code":"validation_failed","message":"The request is not valid","details":[{"path":"done","message":"Invalid option: expected one of \\"true\\"|\\"1\\"|\\"yes\\"|\\"on\\"|\\"y\\"|\\"enabled\\"|\\"false\\"|\\"0\\"|\\"no\\"|\\"off\\"|\\"n\\"|\\"disabled\\""},{"path":"limit","message":"Too big: expected number to be <=100"}]}}
{"error":{"code":"validation_failed","message":"The request is not valid","details":[{"path":"id","message":"Invalid UUID"}]}}
{"error":{"code":"not_found","message":"Task not found"}}
{"error":{"code":"entity.parse.failed","message":"Unexpected end of JSON input"}}
{"error":{"code":"not_found","message":"No route for GET /users"}}`}</Output>
      <div className="prose">
        <p>
          Every error has the same shape, <code>{'{ error: { code, message, details? } }'}</code>, so a client needs one
          piece of error-handling code. The duplicate check ignores case. The bad-JSON code is the{' '}
          <code>type</code> that <code>express.json()</code> attached to its error. Meanwhile, terminal 1 logged one
          line per request:
        </p>
      </div>
      <Output caption="Terminal 1">{`
Tasks API listening on http://localhost:4000
POST /tasks → 201 in 8.3 ms
POST /tasks → 201 in 0.7 ms
GET /tasks → 200 in 5.6 ms
…
POST /tasks → 400 in 0.6 ms
POST /tasks → 409 in 0.4 ms
POST /tasks → 422 in 0.4 ms
GET /tasks?limit=500&done=maybe → 400 in 0.4 ms
GET /tasks/42 → 400 in 0.2 ms
GET /tasks/7d0f6c8e-1b2a-4c3d-9e4f-5a6b7c8d9e0f → 404 in 0.2 ms
POST /tasks → 400 in 0.5 ms
GET /users → 404 in 0.2 ms`}</Output>
      <div className="prose">
        <p>The first request after starting is slower while V8 compiles the code paths; after that, requests take well under a millisecond.</p>
      </div>

      <h2>Async errors: Express 4 versus Express 5</h2>
      <div className="prose">
        <p>
          Your handlers are <code>async</code> and contain no try/catch. Here is the same idea on Express 4, where a
          handler throws inside an <code>async</code> function:
        </p>
      </div>
      <Output caption="Express 4.22: curl gets no response, and the server dies">{`
Express 4 listening on 4091
file://…/e4.ts:5
  throw new Error(\`Database is down while loading \${req.params.id}\`);
        ^

Error: Database is down while loading 42
    at file://…/e4.ts:5:9
    at Layer.handle [as handle_request] (…/node_modules/express/lib/router/layer.js:95:5)
    …

Node.js v24.21.0`}</Output>
      <div className="prose">
        <p>
          Express 4 called your handler, ignored the promise it returned, and never saw the rejection. Node treats an
          unhandled rejection as fatal (since Node 15), so one bad request killed the server for everyone. Express 4 code
          therefore wraps every async handler in try/catch or in a helper such as <code>express-async-handler</code>.
          Express 5 awaits the promise and calls <code>next(err)</code> for you, which is why your handlers can stay this
          short. You will still meet the wrapper pattern in older codebases.
        </p>
      </div>

      <Box kind="try" label="Try it: break the pipeline">
        <ol>
          <li>
            <p>
              In <code>middleware/errors.ts</code>, delete the <code>_next</code> parameter of <code>errorHandler</code>{' '}
              (you will need to type the other parameters yourself), restart and send an empty title:
            </p>
            <Output caption="Response (HTML, shortened)">{`
HTTP/1.1 500 Internal Server Error
Content-Type: text/html; charset=utf-8

<pre>ZodError: [ … "message": "Title is required" … ]
    at file://…/src/tasks/routes.ts:17:35
    at Layer.handleRequest (…/node_modules/router/lib/layer.js:152:17)
    …</pre>`}</Output>
            <p>
              Express skipped your three-parameter function and used its built-in handler: an HTML page with your stack
              trace. With <code>NODE_ENV=production</code> it shows only <code>Internal Server Error</code>, but your
              JSON format is gone either way. Put <code>_next</code> back.
            </p>
          </li>
          <li>
            <p>
              In <code>app.ts</code>, move <code>app.use(express.json(...))</code> below the <code>/tasks</code> router and
              create a task. The router runs before the body is parsed, so <code>req.body</code> is{' '}
              <code>undefined</code>:
            </p>
            <Output caption="Response">{`{"error":{"code":"validation_failed","message":"The request is not valid","details":[{"path":"","message":"Invalid input: expected object, received undefined"}]}}`}</Output>
          </li>
          <li>
            <p>
              Send a body over 10 kB. The output below came from a 20,000-character title:
            </p>
            <Terminal>{`node -e 'process.stdout.write(JSON.stringify({title:"x".repeat(20000)}))' | curl -X POST localhost:4000/tasks -H 'content-type: application/json' --data-binary @-`}</Terminal>
            <Output caption="Response">{`{"error":{"code":"entity.too.large","message":"request entity too large"}}`}</Output>
            <p>The limit protects your memory: without it, a client could send a gigabyte of JSON and Node would try to parse it.</p>
          </li>
        </ol>
      </Box>

      <Exercises
        items={[
          {
            task: <>Add a <code>search</code> query parameter: <code>GET /tasks?search=read</code> returns tasks whose title contains the text, ignoring case.</>,
            hint: <>Add <code>search</code> to <code>ListTasksQuery</code> (trimmed, 1–100 characters, optional). The route and service already pass the whole query through, so only the repository's filter changes.</>,
            solution: (
              <>
                <CodeFile path="09-tasks-api.1-express.practice/src/tasks/task.ts" />
                <CodeFile path="09-tasks-api.1-express.practice/src/tasks/memory-repository.ts" />
              </>
            ),
          },
          {
            task: <>Add <code>POST /tasks/:id/complete</code>, which marks a task done and returns it. Completing a task that is already done is a 409.</>,
            hint: <>Add a <code>complete(id)</code> method to the service that reuses <code>get()</code> and throws <code>ConflictError</code>, then a route that calls it. Register the route before <code>DELETE /:id</code> or after, it does not matter: the paths differ.</>,
            solution: (
              <>
                <CodeFile path="09-tasks-api.1-express.practice/src/tasks/service.ts" />
                <CodeFile path="09-tasks-api.1-express.practice/src/tasks/routes.ts" />
              </>
            ),
          },
        ]}
      />

      <Checkpoint question={<>A client sends <code>PATCH /tasks/&lt;id&gt;</code> with <code>{'{"done":"yes"}'}</code>. What status does it get, and which line of code decides that?</>}>
        <p>
          400 <code>validation_failed</code>. <code>UpdateTaskInput</code> declares <code>done: z.boolean()</code>, which
          accepts only real JSON booleans; it does not coerce strings. <code>UpdateTaskInput.parse(req.body)</code> in the
          route throws a <code>ZodError</code>, Express 5 passes it to <code>errorHandler</code>, and the{' '}
          <code>instanceof ZodError</code> branch picks 400. Query strings need <code>z.stringbool()</code> because they
          are always text; JSON bodies have real booleans.
        </p>
      </Checkpoint>
      <Checkpoint question="Why does the service throw NotFoundError instead of returning null and letting the route send a 404?">
        <p>
          Not finding a task is a rule of the domain, and several service methods need it (<code>get</code>,{' '}
          <code>update</code>, <code>remove</code>). Throwing keeps every route a straight line with no checks, and the
          translation to 404 happens in one place. If a second interface appears later, such as a command-line tool or a
          job queue, it can catch the same error and present it its own way.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Express is an ordered chain of middleware. Each one responds, calls <code>next()</code>, or passes an error on.</li>
          <li>Error middleware has exactly four parameters and is registered last, after a catch-all 404 handler.</li>
          <li>Express 5 sends thrown errors and rejected promises from async handlers to the error middleware; Express 4 did not.</li>
          <li>Validate every input with a schema at the edge of the system; <code>z.infer</code> gives you the type for free.</li>
          <li>Keep HTTP in routes, rules in a service, storage behind an async repository interface, and build the app in a function so tests can create it.</li>
        </ul>
      </Recap>
    </>
  );
}
