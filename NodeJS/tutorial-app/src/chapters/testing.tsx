import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { testPyramid } from '../diagrams/specs/api';

const P = '09-tasks-api.3-tests';
const X = '09-tasks-api.3-tests.practice';

export function Testing() {
  return (
    <>
      <ChapterIntro
        time="2.5–3 hours"
        project="09-tasks-api"
        learn={[
          'The built-in test runner: describe, it, hooks, and how files are found and run',
          'Strict assertions, including errors thrown by async code',
          'Unit tests for business rules, with no server and no database',
          'Spies, stubs and fake clocks with mock.method and mock.timers',
          'Contract tests that hold every repository implementation to the same rules',
          'HTTP tests against a real server on a random port, using fetch',
          'Watch mode, coverage, and reading a failure report',
        ]}
        tools={[
          { name: 'node:test', what: 'Node’s built-in test runner. No package, no config file.' },
          { name: 'node:assert/strict', what: 'Assertions that compare with ===, and deeply for objects.' },
          { name: 'mock', what: 'Spies, stubs and fake timers, part of node:test.' },
          { name: 'fetch', what: 'Built into Node since version 18; the HTTP tests use it as their client.' },
        ]}
      />

      <div className="prose">
        <p>
          You have been testing by hand with curl. It works until the API has thirty behaviours and you change one line:
          nobody re-runs thirty curl commands. Automated tests re-check everything in a fraction of a second, every time,
          and they let you change code without fear. Chapter 18 will lean on this hard: you will replace the whole
          storage layer and prove nothing broke by running the tests from this chapter.
        </p>
      </div>

      <h2>What to test, and how much</h2>
      <Diagram spec={testPyramid} caption="Many fast tests at the bottom, fewer slow ones at the top. Each layer catches mistakes the others cannot." />
      <TableWrap>
        <thead>
          <tr><th>Layer</th><th>Tests</th><th>Catches</th><th>Misses</th></tr>
        </thead>
        <tbody>
          <tr><td>Unit</td><td>One class or function, with fakes for what it uses</td><td>Wrong rules: the due-date check, the duplicate check</td><td>Wiring, SQL, HTTP details</td></tr>
          <tr><td>Integration</td><td>Your code with a real dependency: the SQLite repository with a real database</td><td>Wrong SQL, wrong row mapping, missing migrations</td><td>Routing and status codes</td></tr>
          <tr><td>HTTP (API)</td><td>The whole app through real HTTP requests</td><td>Wrong status codes, headers, middleware order, JSON shape</td><td>Little, but they are slower and point less precisely at the cause</td></tr>
        </tbody>
      </TableWrap>

      <h2>node:test in one page</h2>
      <TableWrap>
        <thead>
          <tr><th>API</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          <tr><td><code>describe(name, fn)</code> / <code>it(name, fn)</code></td><td>Group tests / define one test. <code>suite</code> and <code>test</code> are aliases.</td></tr>
          <tr><td><code>beforeEach</code>, <code>afterEach</code>, <code>before</code>, <code>after</code></td><td>Set up and tear down around each test, or once per <code>describe</code>.</td></tr>
          <tr><td><code>async</code> tests</td><td>Return a promise; the test fails if it rejects or an assertion inside throws.</td></tr>
          <tr><td><code>(t) =&gt; …</code></td><td>The test context: <code>t.mock</code> (undone automatically after the test), <code>t.after(fn)</code> for clean-up, <code>t.skip()</code>, <code>t.diagnostic()</code>.</td></tr>
          <tr><td><code>it.skip</code>, <code>it.todo</code>, <code>it.only</code></td><td>Skip, mark as not written yet, or focus on one test. <code>only</code> needs the <code>--test-only</code> flag; <code>--test-name-pattern="due date"</code> also picks tests by name.</td></tr>
        </tbody>
      </TableWrap>
      <TableWrap>
        <thead>
          <tr><th>Assertion</th><th>Passes when</th></tr>
        </thead>
        <tbody>
          <tr><td><code>assert.equal(a, b)</code></td><td><code>a === b</code> (with <code>node:assert/strict</code>)</td></tr>
          <tr><td><code>assert.deepEqual(a, b)</code></td><td>Same structure and values, all the way down, compared strictly</td></tr>
          <tr><td><code>assert.ok(value)</code></td><td><code>value</code> is truthy</td></tr>
          <tr><td><code>assert.match(text, /re/)</code></td><td>The string matches the regular expression</td></tr>
          <tr><td><code>assert.throws(fn, expected)</code></td><td><code>fn()</code> throws an error matching <code>expected</code></td></tr>
          <tr><td><code>await assert.rejects(promise, expected)</code></td><td>The promise rejects with a matching error. Forgetting <code>await</code> makes the test pass no matter what.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <code>expected</code> can be an error class (<code>ConflictError</code>), a regular expression tested against
          the message, or an object whose properties must all match (<code>{'{ name, message }'}</code>). Always import{' '}
          <code>node:assert/strict</code>: the legacy non-strict <code>assert.equal</code> uses <code>==</code>, so{' '}
          <code>assert.equal(1, '1')</code> passes.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>node:test</th><th>Vitest</th><th>Jest</th></tr>
        </thead>
        <tbody>
          <tr><td>Install</td><td>Nothing</td><td>One package</td><td>Several packages, plus TypeScript setup</td></tr>
          <tr><td>Runs TypeScript</td><td>Yes, through Node's type stripping</td><td>Yes, through Vite</td><td>Needs a transformer</td></tr>
          <tr><td>Mocks, fake timers, coverage, watch</td><td>Built in</td><td>Built in</td><td>Built in</td></tr>
          <tr><td>Module mocking</td><td>Experimental flag</td><td>Mature</td><td>Mature</td></tr>
          <tr><td>Best for</td><td>Node services and libraries</td><td>Frontend and Vite projects (this tutorial app uses it)</td><td>Existing Jest codebases</td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Test scripts</Step>
      <CodeFile path={`${P}/package.json`} change="updated" />
      <div className="prose">
        <p>
          <code>node --test</code> runs each matching file in its own child process, several at once, and prints a
          combined report. A module-level variable in one test file can never leak into another. Inside a file, tests
          run one after another in the order written.
        </p>
        <p>
          The glob is in double quotes so the shell passes it to Node untouched; Node expands it itself, the same way on
          macOS, Linux and Windows.
        </p>
      </div>
      <Box kind="warn" label="Why not plain node --test?">
        <p>
          With no arguments, Node looks for files named like <code>*.test.ts</code>, <code>*-test.ts</code>,{' '}
          <code>test-*.ts</code>, <code>test.ts</code>, or anything inside a <code>test</code> folder. The{' '}
          <code>test-*</code> pattern bit this project during testing: the helper file below is called <code>test-helpers.ts</code>, so
          plain <code>node --test</code> ran it as a test file and reported <code>✔ src/test-helpers.ts</code>. It also
          ignores <code>*.spec.ts</code>. An explicit glob says exactly what a test is.
        </p>
      </Box>

      <Step n={2}>Unit tests for the rules</Step>
      <div className="prose">
        <p>
          The service is the most valuable thing to test: it holds the rules, and it has no HTTP and no SQL, so its tests
          need no server and no database. Give it the in-memory repository and call its methods directly.
        </p>
      </div>
      <CodeFile path={`${P}/src/tasks/service.test.ts`} change="new" />
      <div className="prose">
        <p>The techniques in this file, in order of appearance:</p>
        <ul>
          <li><strong>A fresh world per test.</strong> <code>beforeEach</code> builds a new repository and service, so tests can run in any order and a failure never cascades.</li>
          <li><strong>Arrange, act, assert.</strong> Most tests set something up, do one thing, and check the outcome, separated by blank lines.</li>
          <li><strong>Asserting errors three ways:</strong> by class (<code>ConflictError</code>), by properties (<code>{'{ name, message }'}</code>) and by message pattern (<code>/disk full/</code>).</li>
          <li>
            <strong>A frozen clock.</strong> The due-date rule depends on today's date, so a test that used the real clock
            would mean something different every day. <code>t.mock.timers.enable({'{ apis: [\'Date\'], now }'})</code>{' '}
            makes <code>new Date()</code> return a fixed moment for this test only. It can also fake{' '}
            <code>setTimeout</code> and friends, with <code>t.mock.timers.tick(ms)</code> to move time forward.
          </li>
          <li><strong>A spy.</strong> <code>t.mock.method(repo, 'insert')</code> wraps the real method and records every call, so you can check that the service saved exactly once, with the task it returned.</li>
          <li><strong>A stub.</strong> Passing an implementation replaces the method: here, one that fails like a full disk, to prove the service does not swallow storage errors.</li>
        </ul>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Test double</th><th>What it is</th><th>In this chapter</th></tr>
        </thead>
        <tbody>
          <tr><td>Fake</td><td>A working, simplified implementation</td><td><code>InMemoryTaskRepository</code></td></tr>
          <tr><td>Stub</td><td>Returns or throws what the test decides</td><td>The <code>insert</code> that throws <code>disk full</code></td></tr>
          <tr><td>Spy</td><td>Records calls, optionally keeping the real behaviour</td><td><code>t.mock.method(repo, 'insert')</code></td></tr>
          <tr><td>Mock</td><td>A double with expectations about how it is called; often used loosely for all of the above</td><td><code>insert.mock.callCount()</code></td></tr>
        </tbody>
      </TableWrap>

      <Step n={3}>Contract tests for every repository</Step>
      <div className="prose">
        <p>
          You now have two repositories, and chapter 18 adds a third. They must behave identically, or a test that
          passes against the in-memory fake proves nothing about production. Write the expected behaviour once, as a
          function that defines a suite for any implementation:
        </p>
      </div>
      <CodeFile path={`${P}/src/tasks/repository-contract.ts`} change="new" />
      <CodeFile path={`${P}/src/tasks/memory-repository.test.ts`} change="new" />
      <CodeFile path={`${P}/src/tasks/sqlite-repository.test.ts`} change="new" />
      <div className="prose">
        <p>
          <code>makeTask</code> builds valid tasks with predictable ids and timestamps one second apart, so ordering
          assertions are exact. Inserting in reverse with <code>toReversed()</code> proves the repository sorts by{' '}
          <code>createdAt</code> rather than returning rows in insertion order. Every SQLite test opens{' '}
          <code>:memory:</code>, which creates an empty, fully migrated database in about a millisecond and throws it away
          afterwards: perfect isolation for free.
        </p>
        <p>
          The last test, about copies, encodes the subtle bug from chapter 11. SQLite passes it naturally; the in-memory
          store passes only because it copies objects. Contract tests are where such differences get caught.
        </p>
      </div>

      <Step n={4}>HTTP tests with a real server</Step>
      <CodeFile path={`${P}/src/test-helpers.ts`} change="new" />
      <div className="prose">
        <p>
          Listening on <strong>port 0</strong> asks the operating system for any free port. Test files run in parallel, so
          a fixed port like 4000 would make them collide, and would fail if your dev server were running.{' '}
          <code>once(server, 'listening')</code> turns the event into a promise you can await; chapter 08 covered{' '}
          <code>events.once</code>. <code>server.address()</code> then reports which port was chosen.
        </p>
      </div>
      <CodeFile path={`${P}/src/app.test.ts`} change="new" />
      <div className="prose">
        <p>
          Each test gets a new app on a new <code>:memory:</code> database: real Express, real middleware, real SQL. Only
          the network hop is local. That is why <code>createApp</code> takes its dependencies as an argument: here the
          test chooses them.
        </p>
        <ul>
          <li>
            <strong>Silencing the request log.</strong> <code>mock.method(console, 'log', () =&gt; {'{}'})</code> replaces{' '}
            <code>console.log</code> for the test, and <code>mock.restoreAll()</code> puts it back. Hooks use the{' '}
            <code>mock</code> imported from <code>node:test</code> because the context a hook receives may be a suite
            context, which has no <code>t.mock</code>.
          </li>
          <li>
            <strong>Testing the 500 path</strong> needs something to fail. The test stubs <code>list</code> on a real
            service, checks the client sees only the generic message, and spies on <code>console.error</code> to prove
            the real error was still logged. <code>t.after</code> closes the extra server even if an assertion fails.
          </li>
        </ul>
      </div>
      <Box kind="tip" label="What about supertest?">
        <p>
          Many Express projects use the <code>supertest</code> package, which wraps an app and offers{' '}
          <code>request(app).post('/tasks').expect(201)</code>. It is a fine choice. This project uses{' '}
          <code>fetch</code> because it is built in, it is the same API you use in browsers and in chapter 10, and a
          twenty-line helper covers everything supertest would do here.
        </p>
      </Box>

      <Step n={5}>Run the suite</Step>
      <Terminal>{`npm test`}</Terminal>
      <Output>{`
▶ Tasks API over HTTP
  ✔ creates a task: 201, a Location header, and the task (28.552542ms)
  ✔ explains validation errors field by field (4.030083ms)
  ✔ maps service errors to 404, 409 and 422 (4.039042ms)
  ✔ filters by query string, converting text to booleans (4.210958ms)
  ✔ deletes with 204, then answers 404 (2.271042ms)
  ✔ rejects malformed JSON with 400 (1.600167ms)
  ✔ hides the details of unexpected errors (1.717ms)
✔ Tasks API over HTTP (47.086834ms)
▶ InMemoryTaskRepository (repository contract)
  ✔ returns what was inserted (1.331084ms)
  …
▶ TaskService
  ▶ create
    ✔ fills in the fields the client does not send (1.801583ms)
    ✔ rejects a second open task with the same title, ignoring case (0.3065ms)
    ✔ allows the title again once the first task is done (0.187666ms)
    ✔ rejects a due date before today and accepts today (0.357916ms)
    …
▶ SqliteTaskRepository (repository contract)
  ✔ returns what was inserted (3.10275ms)
  …
ℹ tests 32
ℹ suites 6
ℹ pass 32
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 224.859833`}</Output>
      <div className="prose">
        <p>
          Thirty-two tests in under a quarter of a second, most of it process start-up. Files finish in parallel, so the
          order of the groups varies from run to run.
        </p>
      </div>

      <Step n={6}>Watch mode</Step>
      <Terminal>{`npm run test:watch`}</Terminal>
      <div className="prose">
        <p>
          The runner stays open. Save a source or test file and it reruns the test files affected, printing{' '}
          <code>Restarted at …</code> above the new results. Keep it running in a terminal beside your editor while you
          work: the shortest possible feedback loop.
        </p>
      </div>

      <Step n={7}>Coverage</Step>
      <Terminal>{`npm run test:coverage`}</Terminal>
      <Output>{`
ℹ start of coverage report
ℹ -------------------------------------------------------------------------
ℹ file                     | line % | branch % | funcs % | uncovered lines
ℹ -------------------------------------------------------------------------
ℹ src                      |        |          |         |
ℹ  app.ts                  |  96.30 |   100.00 |   50.00 | 19
ℹ  db                      |        |          |         |
ℹ   database.ts            | 100.00 |    66.67 |  100.00 |
ℹ   migrations.ts          | 100.00 |   100.00 |  100.00 |
ℹ   transaction.ts         |  83.33 |    66.67 |  100.00 | 15-17
ℹ  errors.ts               | 100.00 |   100.00 |  100.00 |
ℹ  middleware              |        |          |         |
ℹ   errors.ts              |  95.24 |    92.86 |   75.00 | 9-10
ℹ   request-log.ts         | 100.00 |   100.00 |  100.00 |
ℹ  tasks                   |        |          |         |
ℹ   memory-repository.ts   | 100.00 |   100.00 |  100.00 |
ℹ   repository-contract.ts | 100.00 |   100.00 |  100.00 |
ℹ   routes.ts              | 100.00 |   100.00 |  100.00 |
ℹ   service.ts             |  97.01 |    92.59 |  100.00 | 46-47
ℹ   sqlite-repository.ts   | 100.00 |   100.00 |  100.00 |
ℹ   task.ts                | 100.00 |   100.00 |  100.00 |
ℹ -------------------------------------------------------------------------
ℹ all files                |  98.57 |    96.06 |   97.14 |
ℹ -------------------------------------------------------------------------
ℹ end of coverage report`}</Output>
      <div className="prose">
        <p>
          Coverage records which lines, branches and functions ran during the tests. Test files are left out of the
          report automatically (the contract file is listed because its name does not look like a test). The uncovered
          lines are a to-do list: line 19 of <code>app.ts</code> is <code>/health</code>, lines 9–10 of{' '}
          <code>middleware/errors.ts</code> are the 404 handler, 46–47 of <code>service.ts</code> are the conflict check
          on rename, and 15–17 of <code>transaction.ts</code> are the rollback. The exercises close every gap.
        </p>
      </div>
      <Box kind="warn" label="Coverage is a torch, not a target">
        <p>
          100% coverage means every line ran, not that every behaviour was checked: a test with no assertions covers
          lines too. Use the report to find code no test touches, then ask what could go wrong there. Many teams set a
          floor with <code>--test-coverage-lines=90</code>, which fails the run below that number, to stop coverage
          quietly sliding.
        </p>
      </Box>

      <Box kind="try" label="Try it: read two failure reports">
        <ol>
          <li>
            <p>In <code>service.ts</code>, change <code>dueDate &lt; today()</code> to <code>dueDate &lt;= today()</code> and run <code>node --test src/tasks/service.test.ts</code>:</p>
            <Output caption="Test report">{`
✖ failing tests:

test at src/tasks/service.test.ts:43:5
✖ rejects a due date before today and accepts today (0.434917ms)
  Error [RuleViolationError]: Due date cannot be in the past
      at #checkDueDate (file://…/src/tasks/service.ts:59:46)
      at TaskService.create (file://…/src/tasks/service.ts:28:23)
      at TestContext.<anonymous> (file://…/src/tasks/service.test.ts:51:34)
      …
    status: 422,
    code: 'rule_violation'
  }`}</Output>
            <p>The off-by-one now rejects today's date. The report names the test, the file and line of the test, and the stack trace through your code.</p>
          </li>
          <li>
            <p>Undo that. In <code>sqlite-repository.ts</code>, replace <code>done: row.done === 1</code> with <code>done: row.done as unknown as boolean</code> and run the repository tests:</p>
            <Output caption="Test report">{`
test at src/tasks/repository-contract.ts:34:5
✖ returns what was inserted (2.496958ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal:
  + actual - expected

    {
      createdAt: '2026-01-01T00:00:01.000Z',
  +   done: 0,
  -   done: false,
      dueDate: '2026-12-24',
      …`}</Output>
            <p>Only the SQLite suite fails, and the diff points at the exact field. The cast silenced TypeScript; the contract test did not stay silent. Undo it.</p>
          </li>
        </ol>
      </Box>

      <Exercises
        items={[
          {
            task: <>Cover <code>app.ts</code> and the 404 handler: one HTTP test that checks <code>GET /health</code> and that an unknown path returns 404 in the standard error shape.</>,
            hint: <>Add an <code>it</code> to <code>app.test.ts</code> using the same <code>request</code> helper. Compare the whole body with <code>assert.deepEqual</code>.</>,
            solution: <CodeFile path={`${X}/src/app.test.ts`} />,
          },
          {
            task: <>Cover the rename check in <code>service.ts</code>: renaming a task to another open task's title is a <code>ConflictError</code>, but changing only the case of its own title is allowed.</>,
            hint: <>Create two tasks, then call <code>update</code> with the other one's title in different case.</>,
            solution: <CodeFile path={`${X}/src/tasks/service.test.ts`} />,
          },
          {
            task: <>Test <code>transaction()</code> directly: it commits and returns the callback's value; when the callback throws, nothing is saved and the error is re-thrown.</>,
            hint: <>Use a tiny table with a <code>NOT NULL</code> column and a <code>:memory:</code> database. Inserting <code>null</code> after a good row forces a failure halfway through. Use <code>assert.throws</code>, since <code>transaction</code> is synchronous.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/db/transaction.test.ts`} />
                <Output caption="npm run test:coverage, with all three exercises">{`
ℹ tests 36
ℹ pass 36
…
ℹ all files                | 100.00 |    98.45 |  100.00 |`}</Output>
              </>
            ),
          },
        ]}
      />

      <Checkpoint question="The due-date tests freeze the clock with mock.timers. What would go wrong if they used the real date and a hard-coded date such as '2026-11-01' as the valid future date?">
        <p>
          The test would pass until 1 November 2026 and fail every day after it, with no code change: a time bomb. Tests
          must give the same result whenever they run. Freezing the clock makes "today" part of the test's input, so
          you can also test the edges precisely: yesterday is rejected, today is accepted.
        </p>
      </Checkpoint>
      <Checkpoint question={<>A teammate wrote <code>assert.rejects(service.remove(id), NotFoundError);</code> without <code>await</code>, and the test passes even when <code>remove</code> is broken. Why?</>}>
        <p>
          <code>assert.rejects</code> returns a promise that rejects when the assertion fails. Without{' '}
          <code>await</code>, the test function returns before that promise settles, the test is marked as passed, and
          the failure happens afterwards with nobody listening. Always <code>await</code> <code>assert.rejects</code>, and
          make test functions <code>async</code>.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li><code>node --test</code> runs each test file in its own process, in parallel; pass an explicit glob so only real test files run.</li>
          <li>Use <code>node:assert/strict</code>, and <code>await assert.rejects</code> for async errors.</li>
          <li>Put most tests on pure logic with fakes; freeze time with <code>mock.timers</code> and observe calls with <code>mock.method</code>.</li>
          <li>Contract tests run one suite against every implementation of an interface, so swapping storage is safe.</li>
          <li>HTTP tests: build the app with test dependencies, listen on port 0, use <code>fetch</code>, close the server afterwards.</li>
          <li>Coverage shows what no test touches; it does not prove behaviour is checked.</li>
        </ul>
      </Recap>
    </>
  );
}
