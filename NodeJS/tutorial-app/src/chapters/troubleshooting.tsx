import type { MouseEvent, ReactNode } from 'react';
import { Box } from '../components/Content';
import { hrefFor } from '../lib/route';
import { findChapter } from './index';

type Problem = {
  title: string;
  message: string; // what you see, copied from a real run on Node 24.21
  cause: ReactNode;
  fix: ReactNode;
  chapter: string; // chapter id that explains it
};

type Group = { name: string; problems: Problem[] };

const GROUPS: Group[] = [
  {
    name: 'Installing and running',
    problems: [
      {
        title: 'node -v shows the wrong version',
        message: `$ node -v
v25.2.1`,
        cause: <>Another Node (from Homebrew or an installer) comes before fnm's on your <code>PATH</code>.</>,
        fix: <>Make the <code>eval "$(fnm env --use-on-cd --shell zsh)"</code> line the last line of <code>~/.zshrc</code> and open a new terminal, or remove the other copy with <code>brew uninstall node</code>. <code>which node</code> should print a path containing <code>fnm</code>.</>,
        chapter: 'setup',
      },
      {
        title: 'EBADENGINE warning on npm install',
        message: `npm warn EBADENGINE Unsupported engine {
npm warn EBADENGINE   package: '01-hello-node@1.0.0',
npm warn EBADENGINE   required: { node: '>=30' },
npm warn EBADENGINE   current: { node: 'v24.21.0', npm: '11.19.0' }
npm warn EBADENGINE }`,
        cause: <>The Node version in use does not satisfy the <code>engines</code> field of the project or of a package it installs.</>,
        fix: <>Switch Node with <code>fnm use</code>, or correct the range in <code>engines</code> if it is wrong.</>,
        chapter: 'setup',
      },
      {
        title: 'Port already in use',
        message: `Error: listen EADDRINUSE: address already in use :::3000
…
  code: 'EADDRINUSE',
  syscall: 'listen',
  port: 3000`,
        cause: <>Another process, often an earlier copy of the same server still running in another terminal, is listening on that port.</>,
        fix: <>Find it with <code>lsof -i :3000</code> (macOS, Linux) or <code>netstat -ano | findstr :3000</code> (Windows) and stop it, or start yours with another <code>PORT</code>. Handle <code>server.on('error')</code> to print a friendly message instead of a stack trace.</>,
        chapter: 'http',
      },
      {
        title: 'write EPIPE when piping output',
        message: `Error: write EPIPE`,
        cause: <>You piped a script into a command such as <code>head</code> that exits early and closes the pipe while Node is still writing.</>,
        fix: <>Harmless for a one-off command. In a CLI meant for pipes, listen for <code>process.stdout.on('error', …)</code> and exit quietly when <code>err.code === 'EPIPE'</code>.</>,
        chapter: 'async',
      },
    ],
  },
  {
    name: 'TypeScript in Node',
    problems: [
      {
        title: 'Cannot find module …/greet',
        message: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/greet' imported from …/src/index.ts`,
        cause: <>A relative import without a file extension. Node's ES module loader never guesses extensions.</>,
        fix: <>Write the real file name: <code>import {'{ greet }'} from './greet.ts'</code>.</>,
        chapter: 'setup',
      },
      {
        title: 'TS2835: needs explicit file extensions',
        message: `error TS2835: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './greet.js'?`,
        cause: <>The same missing extension, caught by <code>tsc</code>.</>,
        fix: <>Use <code>'./greet.ts'</code>. The <code>.js</code> suggestion is for projects that compile first; <code>allowImportingTsExtensions</code> makes <code>.ts</code> valid here.</>,
        chapter: 'setup',
      },
      {
        title: 'enum is not supported in strip-only mode',
        message: `SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]: TypeScript enum is not supported in strip-only mode`,
        cause: <>Node runs TypeScript by deleting types. <code>enum</code>, <code>namespace</code> and constructor parameter properties generate code, so they cannot be deleted.</>,
        fix: <>Use a union type (<code>'low' | 'high'</code>) or an <code>as const</code> object, and assign constructor fields explicitly.</>,
        chapter: 'setup',
      },
      {
        title: 'TS1294: not allowed with erasableSyntaxOnly',
        message: `error TS1294: This syntax is not allowed when 'erasableSyntaxOnly' is enabled.`,
        cause: <><code>tsc</code> catching the same code-generating syntax before Node does.</>,
        fix: <>As above. Keep <code>erasableSyntaxOnly</code> on: it is what makes <code>tsc</code> warn you in advance. It also rejects <code>export =</code> in a <code>.cts</code> file: write that module as plain <code>.cjs</code> with a <code>.d.cts</code> declaration beside it.</>,
        chapter: 'setup',
      },
      {
        title: "TS2591: Cannot find name 'process'",
        message: `error TS2591: Cannot find name 'process'. Do you need to install type definitions for node? Try \`npm i --save-dev @types/node\` and then add 'node' to the types field in your tsconfig.`,
        cause: <>Node's types are missing or not listed. Since TypeScript 6, no global types load unless <code>types</code> names them.</>,
        fix: <><code>npm install --save-dev @types/node@24</code> and set <code>"types": ["node"]</code> in <code>tsconfig.json</code>.</>,
        chapter: 'setup',
      },
      {
        title: 'Event name not assignable to never',
        message: `error TS2345: Argument of type '(job: any) => void' is not assignable to parameter of type 'never'.`,
        cause: <>A misspelled event name on a typed <code>EventEmitter</code>: the name is not in its event map, so no listener type fits.</>,
        fix: <>Check the spelling against the event map, or add the event to it.</>,
        chapter: 'events',
      },
      {
        title: 'Could not find a declaration file for a .cjs module',
        message: `error TS7016: Could not find a declaration file for module './legacy.cjs'.`,
        cause: <>You imported a plain JavaScript file from TypeScript, and nothing describes its types.</>,
        fix: <>Add a declaration file with the matching name next to it (<code>legacy.d.cts</code> for <code>legacy.cjs</code>), containing only types.</>,
        chapter: 'modules',
      },
      {
        title: "'x' is possibly 'undefined' after a guard",
        message: `error TS18048: 'target' is possibly 'undefined'.`,
        cause: <>You checked the value at the top level (for example, exited when an argument was missing), but TypeScript does not carry that narrowing into functions declared later, which could run at any time.</>,
        fix: <>After the guard, copy the value into a new <code>const</code> whose type is no longer optional, and use that inside the functions.</>,
        chapter: 'concurrency',
      },
      {
        title: "Property 'eventLoopUtilization' does not exist on type 'Performance'",
        message: `error TS2339: Property 'eventLoopUtilization' does not exist on type 'Performance'.`,
        cause: <>The global <code>performance</code> is typed as the web version, which lacks Node-only methods.</>,
        fix: <><code>import {'{ performance }'} from 'node:perf_hooks'</code>.</>,
        chapter: 'event-loop',
      },
    ],
  },
  {
    name: 'Modules and packages',
    problems: [
      {
        title: 'Assignment to constant variable (an import)',
        message: `TypeError: Assignment to constant variable.
error TS2632: Cannot assign to 'count' because it is an import.`,
        cause: <>Imports are read-only live views of the exporting module's variables.</>,
        fix: <>Export a function from the owning module that changes the value, and call it.</>,
        chapter: 'modules',
      },
      {
        title: 'JSON import needs an import attribute',
        message: `TypeError [ERR_IMPORT_ATTRIBUTE_MISSING]: Module "file://…/config.json" needs an import attribute of "type: json"
error TS1543: Importing a JSON file into an ECMAScript module requires a 'type: "json"' import attribute when 'module' is set to 'NodeNext'.`,
        cause: <>ES modules must say how to load a non-JavaScript file.</>,
        fix: <><code>import config from './config.json' with {'{ type: \'json\' }'}</code>.</>,
        chapter: 'modules',
      },
      {
        title: '__dirname is not defined',
        message: `ReferenceError: __dirname is not defined in ES module scope`,
        cause: <><code>__dirname</code> and <code>__filename</code> exist only in CommonJS. <code>tsc</code> does not catch this.</>,
        fix: <>Use <code>import.meta.dirname</code> and <code>import.meta.filename</code>.</>,
        chapter: 'modules',
      },
      {
        title: 'require is not defined',
        message: `ReferenceError: require is not defined in ES module scope, you can use import instead`,
        cause: <>Using CommonJS <code>require</code> inside an ES module.</>,
        fix: <>Use <code>import</code>. If you truly need <code>require</code>, create one with <code>createRequire(import.meta.url)</code> from <code>node:module</code>.</>,
        chapter: 'modules',
      },
      {
        title: 'MODULE_TYPELESS_PACKAGE_JSON warning',
        message: `[MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file://…/c.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to …/package.json.`,
        cause: <><code>package.json</code> has no <code>"type"</code>, so Node had to guess.</>,
        fix: <><code>npm pkg set type=module</code>.</>,
        chapter: 'modules',
      },
      {
        title: 'Package subpath is not exported',
        message: `Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './src/lib/counter.ts' is not defined by "exports" in …/package.json`,
        cause: <>The package's <code>"exports"</code> field lists its public entry points, and this path is not one of them. <code>tsc</code> reports it as <code>TS2307</code>.</>,
        fix: <>Import a path the package exports, or add the path to <code>"exports"</code> if it is your package.</>,
        chapter: 'modules',
      },
      {
        title: 'require() of an async module',
        message: `Error [ERR_REQUIRE_ASYNC_MODULE]: require() cannot be used on an ESM graph with top-level await. Use import() instead. To see where the top-level await comes from, use --experimental-print-required-tla.`,
        cause: <>Node 24 lets CommonJS <code>require()</code> an ES module, but not one that uses top-level <code>await</code>.</>,
        fix: <>Load it with <code>await import()</code>, or remove the top-level <code>await</code> from that module.</>,
        chapter: 'modules',
      },
      {
        title: 'Unknown option in parseArgs',
        message: `TypeError [ERR_PARSE_ARGS_UNKNOWN_OPTION]: Unknown option '--colour'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--colour"`,
        cause: <><code>util.parseArgs</code> is strict by default and rejects options you did not declare.</>,
        fix: <>Declare the option, catch the error to print your usage text and exit with code 2, or pass the value after <code>--</code>.</>,
        chapter: 'cli',
      },
    ],
  },
  {
    name: 'Async code and crashes',
    problems: [
      {
        title: 'The process exits on an unhandled rejection',
        message: `still running…
file://…/rej.ts:2
  throw new Error('database is down');
        ^

Error: database is down
    at save (file://…/rej.ts:2:9)
    …

Node.js v24.21.0`,
        cause: <>A promise rejected and nothing handled it, here <code>save()</code> called without <code>await</code> or <code>.catch()</code>. Since Node 15 this ends the process with exit code 1, once the current synchronous code has finished, which is why "still running…" printed first.</>,
        fix: <><code>await</code> the call inside <code>try/catch</code>, or attach <code>.catch()</code>. Do not hide it with <code>--unhandled-rejections=warn</code>.</>,
        chapter: 'async',
      },
      {
        title: 'AbortError … due to timeout',
        message: `AbortError: The operation was aborted
    at Timeout.cancelListenerHandler (node:timers/promises:49:12)
    … {
  code: 'ABORT_ERR',
  [cause]: DOMException [TimeoutError]: The operation was aborted due to timeout`,
        cause: <>An <code>AbortSignal.timeout()</code> fired, so the operation was cancelled as designed.</>,
        fix: <>Expected behaviour. Catch it and check <code>err.name === 'AbortError'</code> (or the <code>cause</code>) to report a timeout.</>,
        chapter: 'async',
      },
      {
        title: 'Detected unsettled top-level await',
        message: `Warning: Detected unsettled top-level await at file://…
(exit code 13)`,
        cause: <>The script awaited something that can never settle, because nothing else keeps the process alive. A timeout signal's timer does not hold the process open on its own.</>,
        fix: <>Make sure something will resolve the promise (an emitter that will fire, a server that is listening), or do not await it at the top level.</>,
        chapter: 'events',
      },
      {
        title: 'curl: (52) Empty reply from server',
        message: `curl: (52) Empty reply from server`,
        cause: <>The server process crashed mid-request, typically an async route handler whose rejection nobody caught.</>,
        fix: <>Catch errors from async handlers and send a 500. Express 5 does this for you; with plain <code>node:http</code> add <code>.catch()</code> to the async dispatch.</>,
        chapter: 'http',
      },
    ],
  },
  {
    name: 'Events and streams',
    problems: [
      {
        title: "Unhandled 'error' event",
        message: `node:events:505
    throw er; // Unhandled 'error' event
    ^

Error: network down
…
Emitted 'error' event at: …`,
        cause: <>An emitter emitted <code>'error'</code> and nothing was listening. Node treats that as a crash, on purpose.</>,
        fix: <>Attach an <code>'error'</code> listener to every emitter and stream you create, or use <code>pipeline</code> / <code>events.once</code>, which handle it for you.</>,
        chapter: 'events',
      },
      {
        title: 'ERR_UNHANDLED_ERROR with a string',
        message: `Error [ERR_UNHANDLED_ERROR]: Unhandled error. ('just a string')`,
        cause: <>Something other than an <code>Error</code> was emitted as <code>'error'</code>, so there is no stack trace to show.</>,
        fix: <>Always emit real <code>Error</code> objects.</>,
        chapter: 'events',
      },
      {
        title: 'MaxListenersExceededWarning',
        message: `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 change listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit`,
        cause: <>Listeners are added repeatedly (for example on every request) and never removed.</>,
        fix: <>Run with <code>--trace-warnings</code> to see where they are added, and remove them with <code>off()</code> or use <code>once()</code>. Raise the limit only when many listeners are genuinely intended.</>,
        chapter: 'events',
      },
      {
        title: 'ENOENT from a stream',
        message: `node:events:505
    throw er; // Unhandled 'error' event

Error: ENOENT: no such file or directory, open 'nope.log'`,
        cause: <>A stream connected with <code>.pipe()</code> failed and had no error listener.</>,
        fix: <>Use <code>await pipeline(...)</code> from <code>node:stream/promises</code> inside <code>try/catch</code>, and delete the partial output file in the <code>catch</code>.</>,
        chapter: 'streams',
      },
      {
        title: 'Garbled characters: Caf��',
        message: `Caf��`,
        cause: <>A multi-byte UTF-8 character was split across two chunks and each half was decoded separately.</>,
        fix: <>Call <code>stream.setEncoding('utf8')</code>, read lines with <code>readline</code>, or decode with <code>StringDecoder</code>, all of which keep incomplete characters for the next chunk.</>,
        chapter: 'streams',
      },
    ],
  },
  {
    name: 'Express',
    problems: [
      {
        title: 'req.body is undefined',
        message: `{"error":{"code":"validation_failed","message":"The request is not valid",
  "details":[{"path":"","message":"Invalid input: expected object, received undefined"}]}}`,
        cause: <><code>express.json()</code> was registered after the router, so the body had not been parsed when the route's validation ran.</>,
        fix: <>Register <code>app.use(express.json())</code> before any router that reads <code>req.body</code>. Middleware runs in the order you add it.</>,
        chapter: 'express',
      },
      {
        title: 'Cannot set property query',
        message: `TypeError: Cannot set property query of #<IncomingMessage> which has only a getter`,
        cause: <>In Express 5, <code>req.query</code> is a getter. Code written for Express 4 that replaces it (for example with validated values) now throws.</>,
        fix: <>Parse into a local variable (<code>const query = schema.parse(req.query)</code>) or store the result on <code>res.locals</code>.</>,
        chapter: 'express',
      },
      {
        title: 'An HTML error page with a stack trace instead of your JSON error',
        message: `<pre>ZodError: [
  …
    at …/src/tasks/routes.ts:…</pre>`,
        cause: <>Your error middleware was skipped. Express recognises error handlers only by their four parameters, <code>(err, req, res, next)</code>; with three, it is an ordinary middleware.</>,
        fix: <>Keep all four parameters even if you do not use <code>next</code> (prefix it with an underscore to satisfy the linter).</>,
        chapter: 'express',
      },
      {
        title: '400 entity.parse.failed or 413 entity.too.large',
        message: `400 {"error":{"code":"entity.parse.failed","message":"Unexpected end of JSON input"}}
413 {"error":{"code":"entity.too.large","message":"request entity too large"}}`,
        cause: <><code>express.json()</code> rejected the body: malformed JSON, or larger than its <code>limit</code>. The error reaches your error middleware with <code>type</code> and <code>status</code> set, which the tasks API turns into these responses.</>,
        fix: <>Map these to a clear JSON error in the error middleware, and set <code>limit</code> deliberately (the tasks API uses <code>10kb</code>).</>,
        chapter: 'express',
      },
      {
        title: '?done=false returns finished tasks',
        message: `z.coerce.boolean().parse('false') -> true
z.stringbool().parse('false') -> false`,
        cause: <><code>z.coerce.boolean()</code> uses JavaScript truthiness, and every non-empty string, including <code>'false'</code>, is truthy. No error is raised, which is what makes it a trap.</>,
        fix: <>Use <code>z.stringbool()</code> for booleans in query strings: it accepts <code>true</code>/<code>false</code>, <code>1</code>/<code>0</code>, <code>yes</code>/<code>no</code>.</>,
        chapter: 'express',
      },
    ],
  },
  {
    name: 'SQLite',
    problems: [
      {
        title: 'Value cannot be bound to a SQLite parameter',
        message: `TypeError: Provided value cannot be bound to SQLite parameter 2.
  code: 'ERR_INVALID_ARG_TYPE'`,
        cause: <>A parameter was <code>undefined</code>, which SQLite has no type for. Usually an optional field such as <code>dueDate</code>.</>,
        fix: <>Convert with <code>?? null</code> before binding.</>,
        chapter: 'database',
      },
      {
        title: 'Unknown named parameter',
        message: `Error: Unknown named parameter 'created_at'
  code: 'ERR_INVALID_STATE'`,
        cause: <>The object passed to a statement has a key the SQL does not use. The opposite mistake, a missing key, raises nothing and silently binds <code>NULL</code>.</>,
        fix: <>Pass exactly the named parameters the statement declares, and test the repository against a real database.</>,
        chapter: 'database',
      },
      {
        title: 'CHECK or UNIQUE constraint failed',
        message: `Error: CHECK constraint failed: priority IN ('low', 'medium', 'high')
Error: UNIQUE constraint failed: users.email
  code: 'ERR_SQLITE_ERROR'`,
        cause: <>The database rejected a row that breaks a rule in the schema. That is the schema doing its job as the last line of defence.</>,
        fix: <>Validate input before it reaches the database, and translate expected violations into HTTP errors: the tasks API maps <code>errcode</code> 2067 (unique) to a 409 Conflict.</>,
        chapter: 'database',
      },
      {
        title: 'Syntax error in a migration at startup',
        message: `Error: near "CREAT": syntax error`,
        cause: <>A typo in migration SQL. The migration runs inside a transaction, so it is rolled back and <code>PRAGMA user_version</code> is unchanged.</>,
        fix: <>Fix the SQL and restart; the runner applies the migration again. Never edit a migration that has already run in production; add a new one.</>,
        chapter: 'database',
      },
    ],
  },
  {
    name: 'Testing',
    problems: [
      {
        title: "'only' requires --test-only",
        message: `'only' and 'runOnly' require the --test-only command-line option.`,
        cause: <>A test is marked <code>{'{ only: true }'}</code> or <code>it.only</code>, but the runner was not started in only-mode.</>,
        fix: <>Run <code>node --test --test-only …</code> while focusing, and remove <code>only</code> before committing.</>,
        chapter: 'testing',
      },
      {
        title: "Property 'mock' does not exist in a hook",
        message: `error TS2339: Property 'mock' does not exist on type 'SuiteContext | TestContext'.`,
        cause: <>Hooks such as <code>beforeEach</code> receive a context that may be a suite's, which has no <code>mock</code>.</>,
        fix: <><code>import {'{ mock }'} from 'node:test'</code> and call <code>mock.restoreAll()</code> in <code>afterEach</code>.</>,
        chapter: 'testing',
      },
    ],
  },
  {
    name: 'Config and authentication',
    problems: [
      {
        title: 'Invalid configuration at startup',
        message: `Invalid configuration:
✖ Invalid input: expected number, received NaN
  → at PORT
✖ Invalid input: expected string, received undefined
  → at JWT_SECRET`,
        cause: <>The config module validated <code>process.env</code> and refused to start: <code>PORT</code> is not a number and <code>JWT_SECRET</code> is missing. Failing here is the point: better than failing on the first request.</>,
        fix: <>Copy <code>.env.example</code> to <code>.env</code> and fill it in, or export the variables in your shell or deployment.</>,
        chapter: 'config',
      },
      {
        title: '.env: not found',
        message: `node: .env: not found`,
        cause: <><code>--env-file=.env</code> requires the file to exist.</>,
        fix: <>Create it, or use <code>--env-file-if-exists=.env</code>, which carries on without it (handy when production sets real environment variables).</>,
        chapter: 'config',
      },
      {
        title: 'Invalid scrypt params: memory limit exceeded',
        message: `Invalid scrypt params: error:030000AC:digital envelope routines::memory limit exceeded`,
        cause: <>A higher scrypt cost (N = 2<sup>15</sup>) needs more memory than the default <code>maxmem</code> of 32 MiB allows.</>,
        fix: <>Pass a larger <code>maxmem</code> with the cost, for example <code>{'{ N: 2 ** 15, maxmem: 64 * 1024 * 1024 }'}</code>.</>,
        chapter: 'auth',
      },
      {
        title: 'JWT verification failed',
        message: `JWSSignatureVerificationFailed: signature verification failed   code: ERR_JWS_SIGNATURE_VERIFICATION_FAILED
JWSInvalid: Invalid Compact JWS                                  code: ERR_JWS_INVALID`,
        cause: <>The token was signed with a different secret (often a changed <code>JWT_SECRET</code> after a restart), was altered, or is not a JWT at all.</>,
        fix: <>Expected for bad tokens: answer 401. If valid users see it, check that every instance uses the same secret.</>,
        chapter: 'auth',
      },
    ],
  },
  {
    name: 'PostgreSQL',
    problems: [
      {
        title: 'Could not determine data type of parameter',
        message: `error: could not determine data type of parameter $2   (code 42P08)`,
        cause: <>PostgreSQL could not infer a parameter's type from the query, typically a nullable filter such as <code>($2 IS NULL OR done = $2)</code>.</>,
        fix: <>Cast the parameter in SQL: <code>$2::boolean</code>.</>,
        chapter: 'postgres',
      },
      {
        title: 'Invalid input syntax for type uuid',
        message: `error: invalid input syntax for type uuid: "42"   (code 22P02)`,
        cause: <>A value that is not a UUID reached a <code>uuid</code> column, usually an id straight from the URL.</>,
        fix: <>Validate ids with <code>z.uuid()</code> before querying, so the client gets a 400 or 404 instead of a 500.</>,
        chapter: 'postgres',
      },
      {
        title: 'Timeout exceeded when trying to connect',
        message: `Error: timeout exceeded when trying to connect`,
        cause: <>Every connection in the pool is checked out and none comes back, almost always a <code>pool.connect()</code> without <code>client.release()</code> on some code path. With pg's default <code>connectionTimeoutMillis: 0</code>, requests hang forever instead of failing.</>,
        fix: <>Release in <code>finally</code>, and set <code>connectionTimeoutMillis</code> so exhaustion shows up as an error.</>,
        chapter: 'postgres',
      },
      {
        title: 'Sorry, too many clients already',
        message: `error: sorry, too many clients already   (code 53300)`,
        cause: <>Instances × pool size exceeded the server's <code>max_connections</code> (100 by default).</>,
        fix: <>Do the connection maths: lower each pool's <code>max</code>, or put a pooler such as PgBouncer in front.</>,
        chapter: 'postgres',
      },
      {
        title: 'Terminating connection due to administrator command',
        message: `error: terminating connection due to administrator command   (code 57P01)`,
        cause: <>PostgreSQL restarted or killed the connection. An idle pooled client emits <code>'error'</code>, and with no listener the process crashes.</>,
        fix: <>Add <code>pool.on('error', …)</code> to log it; the pool replaces the client on the next query.</>,
        chapter: 'postgres',
      },
      {
        title: 'A count arrives as a string, a date shifts by a day',
        message: `count: '1'
dueDate: 2026-12-23T18:30:00.000Z`,
        cause: <>pg returns <code>bigint</code> (what <code>count(*)</code> produces) as a string, because it may not fit a JavaScript number, and parses <code>DATE</code> into a <code>Date</code> at local midnight, which prints as the previous day in UTC for zones ahead of it.</>,
        fix: <>Cast counts with <code>count(*)::int</code>, and register a type parser that keeps <code>DATE</code> as a plain string.</>,
        chapter: 'postgres',
      },
      {
        title: 'role "tasks" does not exist, though the container is running',
        message: `error: role "tasks" does not exist   (code 28000)`,
        cause: <>Another PostgreSQL, often one installed with Homebrew, listens on <code>localhost:5432</code>. Docker still starts the container on <code>0.0.0.0:5432</code> without complaint, but connections to <code>localhost</code> reach the other server, which has never heard of your user.</>,
        fix: <>Check with <code>lsof -i :5432</code>. Map another host port in <code>docker-compose.yml</code>, as the course does with <code>5440:5432</code>, and use it in <code>DATABASE_URL</code>.</>,
        chapter: 'postgres',
      },
    ],
  },
  {
    name: 'Production and Docker',
    problems: [
      {
        title: 'Requests fail during a deploy, exit code 143',
        message: `server exit code: 143
  20 000          (20 requests in flight, all dropped: curl reports 000)`,
        cause: <>The process received SIGTERM with no handler, so it died immediately and dropped in-flight requests. 143 is 128 + 15, the signal number of SIGTERM.</>,
        fix: <>Handle SIGTERM and SIGINT: stop accepting connections, let in-flight requests finish, close idle keep-alive connections, close the pool, then exit 0.</>,
        chapter: 'production',
      },
      {
        title: 'Compose: required variable is missing a value',
        message: `error while interpolating services.app.environment.JWT_SECRET: required variable JWT_SECRET is missing a value`,
        cause: <><code>{'${JWT_SECRET:?}'}</code> makes Compose refuse to start without the variable, and Compose checks it even for services whose profile is not enabled.</>,
        fix: <>Export the variable or put it in a <code>.env</code> file next to <code>docker-compose.yml</code>; the course uses <code>{'${JWT_SECRET:-}'}</code> and lets the app's own config validation fail fast instead.</>,
        chapter: 'production',
      },
      {
        title: 'Docker cannot pull an image: 401 Unauthorized',
        message: `failed to fetch oauth token: … 401 Unauthorized: incorrect username or password`,
        cause: <>Docker is sending stale or wrong registry credentials, even for public images.</>,
        fix: <><code>docker logout</code>, then retry (public images need no login), or <code>docker login</code> with a current access token.</>,
        chapter: 'production',
      },
    ],
  },
  {
    name: 'Workers, memory and profiling',
    problems: [
      {
        title: 'DataCloneError when posting to a worker',
        message: `DataCloneError: () => 1 could not be cloned.`,
        cause: <>Messages to and from workers are copied with the structured clone algorithm, which cannot copy functions, class instances with methods, sockets or similar.</>,
        fix: <>Send plain data (objects, arrays, strings, numbers, typed arrays) and keep the behaviour in the worker's own code.</>,
        chapter: 'concurrency',
      },
      {
        title: 'JavaScript heap out of memory',
        message: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
(exit code 134)`,
        cause: <>The V8 heap reached its limit, usually because of a leak such as an unbounded cache or listeners that are never removed. It cannot be caught.</>,
        fix: <>Find what keeps growing with heap snapshots, and bound it (an LRU or TTL cache). Raise <code>--max-old-space-size</code> only when the program genuinely needs more memory.</>,
        chapter: 'performance',
      },
      {
        title: '--cpu-prof wrote no profile',
        message: `$ node --cpu-prof server.ts
^C
$ ls *.cpuprofile
zsh: no matches found: *.cpuprofile`,
        cause: <>The profile is written when the process exits normally. Ctrl+C kills it with a signal before that happens.</>,
        fix: <>Exit normally on the signal: <code>process.once('SIGINT', () =&gt; process.exit(0))</code>, then press Ctrl+C.</>,
        chapter: 'performance',
      },
    ],
  },
  {
    name: 'HTTP',
    problems: [
      {
        title: 'Cannot set headers after they are sent',
        message: `Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client
    at ServerResponse.setHeader (node:_http_outgoing:684:11)`,
        cause: <>The response was already sent (<code>res.end()</code>, <code>res.json()</code>), and later code tried to write to it, often a missing <code>return</code> after sending an error.</>,
        fix: <>Write <code>return res.status(400).json(…)</code>, and make sure each code path sends exactly one response.</>,
        chapter: 'http',
      },
      {
        title: 'TypeError: fetch failed',
        message: `[TypeError: fetch failed] {
  [cause]: AggregateError [ECONNREFUSED]:
    code: 'ECONNREFUSED',
    [errors]: [ [Error], [Error] ]
  }
}`,
        cause: <>Nothing is listening at that address. The useful detail is in <code>error.cause</code>.</>,
        fix: <>Start the server, check the port, and log <code>error.cause</code> when a fetch fails.</>,
        chapter: 'http',
      },
      {
        title: 'The request hangs until curl times out',
        message: `$ curl -m 2 http://localhost:3000/
curl: (28) Operation timed out after 2003 milliseconds with 7 bytes received`,
        cause: <>A code path never called <code>res.end()</code>, so the client waits for the rest of the response.</>,
        fix: <>Every path must end the response, including error paths. A central error handler makes that easy to guarantee.</>,
        chapter: 'http',
      },
    ],
  },
];

export function Troubleshooting() {
  return (
    <>
      <div className="prose">
        <p>
          The errors you are most likely to meet in this course, grouped by topic. Every message was copied from a real
          run on Node 24.21, shortened with <code>…</code> where a stack trace adds nothing. Search the page for a few
          words of your error (<kbd>Cmd</kbd>+<kbd>F</kbd> or <kbd>Ctrl</kbd>+<kbd>F</kbd>).
        </p>
      </div>
      <Box kind="key" label="Read errors from the top">
        <ol>
          <li><strong>The first line names the problem</strong>, often with a code such as <code>ERR_MODULE_NOT_FOUND</code> or <code>EADDRINUSE</code>. Search for the code.</li>
          <li><strong>The first stack frame in your own file</strong> (not <code>node:internal</code>) is where to look.</li>
          <li><strong>For <code>tsc</code> errors</strong>, the format is <code>file(line,column): error TSxxxx: message</code>.</li>
          <li><strong>System error codes</strong> (<code>ENOENT</code>, <code>EACCES</code>, <code>ECONNREFUSED</code>) come from the operating system and mean the same in every language.</li>
        </ol>
      </Box>
      <nav className="toc-inline" aria-label="Error groups">
        {GROUPS.map((g) => (
          <a key={g.name} href={`#trouble-${slug(g.name)}`} onClick={(e) => jump(e, g.name)}>{g.name}</a>
        ))}
      </nav>
      {GROUPS.map((g) => (
        <section key={g.name} id={`trouble-${slug(g.name)}`}>
          <h2>{g.name}</h2>
          {g.problems.map((p) => (
            <article key={p.title} className="trouble">
              <h3>{p.title}</h3>
              <pre className="trouble-msg">{p.message}</pre>
              <dl>
                <div><dt>Cause</dt><dd>{p.cause}</dd></div>
                <div><dt>Fix</dt><dd>{p.fix}</dd></div>
              </dl>
              <p className="trouble-ref"><a href={hrefFor(p.chapter)}>Explained in chapter {chapterLabel(p.chapter)}</a></p>
            </article>
          ))}
        </section>
      ))}
    </>
  );
}

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// The app routes on the hash, so in-page links scroll instead of navigating.
function jump(event: MouseEvent, name: string) {
  event.preventDefault();
  document.getElementById(`trouble-${slug(name)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Looked up at render time, so the import cycle with index.ts is harmless.
const chapterLabel = (id: string) => findChapter(id).num;
