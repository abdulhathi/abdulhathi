import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { apiLayers, connectionMaths } from '../diagrams/specs/api';

const P = '09-tasks-api.6-postgres';
const X = '09-tasks-api.6-postgres.practice';

export function Postgres() {
  return (
    <>
      <ChapterIntro
        time="3–3.5 hours"
        project="09-tasks-api"
        learn={[
          'When SQLite stops being enough, and what PostgreSQL adds',
          'Running Postgres locally with Docker Compose: a named volume, a healthcheck, a test database',
          'Connection pools: why they exist, how to size them, and the settings that matter',
          'pool.query() versus checking out a client for a transaction',
          'Parameters, type parsing and the classic date bug',
          'Migrations that several instances can run at once',
          'Proving the swap with the same contract tests, then reading query plans with EXPLAIN',
        ]}
        tools={[
          { name: 'PostgreSQL 18', what: 'The open-source relational database most new backends choose.' },
          { name: 'Docker Compose', what: 'Starts the database with one command and keeps its data in a volume.' },
          { name: 'pg', what: 'node-postgres, the standard Postgres driver for Node: a client and a pool.' },
          { name: 'psql', what: 'Postgres’s command-line client, run inside the container.' },
        ]}
      />

      <div className="prose">
        <p>
          In chapter 11 you made the repository interface asynchronous "so that a database on the network can drop in
          later". This is that chapter. You will add two classes, one config setting and a small module that picks the
          store. The routes and the service do not change at all, and the contract tests from chapter 13 prove that the
          new store behaves exactly like the old ones.
        </p>
      </div>

      <h2>Why move to PostgreSQL</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>SQLite (chapter 12)</th><th>PostgreSQL</th></tr>
        </thead>
        <tbody>
          <tr><td>Where it runs</td><td>Inside your process, one file</td><td>A separate server, reached over the network</td></tr>
          <tr><td>The Node API</td><td>Synchronous: every query blocks the event loop briefly</td><td>Asynchronous: the event loop serves other requests while a query runs</td></tr>
          <tr><td>Writers</td><td>One at a time, for the whole database</td><td>Many at once; rows are locked, not the database</td></tr>
          <tr><td>Several API instances</td><td>No: the file lives on one machine</td><td>Yes: every instance connects to the same server</td></tr>
          <tr><td>Hosting</td><td>Wherever your app's disk is</td><td>Managed everywhere: AWS RDS and Aurora, Google Cloud SQL, Azure Database, Neon, Supabase</td></tr>
          <tr><td>Extras</td><td>Small and focused</td><td>Real date and boolean types, JSONB, full-text search, roles and permissions, replication</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          The trigger is usually the third or fourth row: you want two instances behind a load balancer for uptime, or
          write traffic grows. Many teams start on Postgres from day one for exactly that reason.
        </p>
      </div>

      <h2>What changes, and what does not</h2>
      <Diagram spec={apiLayers} caption="PgTaskRepository slots in directly under the TaskRepository interface. Everything above the interface is untouched." />
      <TableWrap>
        <thead>
          <tr><th>File</th><th>Change</th></tr>
        </thead>
        <tbody>
          <tr><td><code>compose.yaml</code>, <code>db/init/…sql</code></td><td>New: the local database</td></tr>
          <tr><td><code>src/db/postgres.ts</code>, <code>pg-migrations.ts</code></td><td>New: pool, transactions, migrations</td></tr>
          <tr><td><code>src/tasks/pg-repository.ts</code>, <code>src/users/pg-repository.ts</code></td><td>New: the two Postgres repositories</td></tr>
          <tr><td><code>src/db/store.ts</code></td><td>New: picks Postgres or SQLite</td></tr>
          <tr><td><code>config.ts</code>, <code>server.ts</code></td><td>Updated: <code>DATABASE_URL</code>, and building from the store</td></tr>
          <tr><td>Tests</td><td>Contracts run against Postgres too; a new user-repository contract</td></tr>
          <tr><td><code>routes.ts</code>, <code>service.ts</code>, <code>app.ts</code>, middleware</td><td><strong>Unchanged</strong></td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <strong>How the server chooses:</strong> if <code>DATABASE_URL</code> is set, it uses PostgreSQL; otherwise it
          falls back to the SQLite file. Production always sets the variable. On a laptop you can run with or without
          Docker, and the fast HTTP tests keep using in-memory SQLite. The cost is maintaining two implementations, which
          the contract tests make cheap. A team that only ever runs Postgres would drop the SQLite code instead.
        </p>
      </div>

      <h2>Connection pools</h2>
      <div className="prose">
        <p>
          Opening a Postgres connection is expensive: a TCP handshake, often TLS, authentication, and on the server a
          whole new process with its own memory. Opening one per query would add milliseconds to every request and
          could exhaust the server. A <strong>pool</strong> keeps a few connections open and lends them out. Your code
          asks for a connection, uses it for one query or one transaction, and gives it back.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Pool option</th><th>pg default</th><th>This project</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>max</code></td><td>10</td><td>10 (<code>DB_POOL_MAX</code>)</td><td>The most connections this process will open. Requests beyond that wait in a queue.</td></tr>
          <tr><td><code>idleTimeoutMillis</code></td><td>10 000</td><td>30 000</td><td>Close connections nobody has used for a while.</td></tr>
          <tr><td><code>connectionTimeoutMillis</code></td><td>0 (wait forever)</td><td>5 000</td><td>If every connection is busy for 5 s, fail the request instead of hanging it indefinitely.</td></tr>
        </tbody>
      </TableWrap>
      <TableWrap>
        <thead>
          <tr><th>Call</th><th>Connection</th><th>Use for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>pool.query(sql, params)</code></td><td>Borrowed and returned automatically, for that one query</td><td>Almost everything</td></tr>
          <tr><td><code>const client = await pool.connect()</code></td><td>Yours until you call <code>client.release()</code></td><td>Transactions, and anything else that needs several statements on the same connection</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          A transaction belongs to a connection. If you ran <code>BEGIN</code>, an <code>INSERT</code> and{' '}
          <code>COMMIT</code> through <code>pool.query()</code>, each could go to a different connection, and the{' '}
          <code>INSERT</code> would not be in the transaction at all. This is the Postgres answer to chapter 12's
          warning about awaiting inside a SQLite transaction: each transaction gets a connection of its own.
        </p>
      </div>

      <h2>Parameters and types</h2>
      <div className="prose">
        <p>
          Postgres parameters are numbered: <code>$1</code>, <code>$2</code>, and the values travel separately from
          the SQL, so injection is impossible, exactly as with SQLite's <code>?</code>. When a parameter may be{' '}
          <code>NULL</code>, Postgres sometimes cannot work out its type and refuses the query, so the filters write{' '}
          <code>$2::boolean</code>.
        </p>
        <p>pg converts column values to JavaScript like this. The surprises are in bold:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Postgres type</th><th>Arrives as</th><th>Note</th></tr>
        </thead>
        <tbody>
          <tr><td><code>text</code>, <code>uuid</code></td><td><code>string</code></td><td></td></tr>
          <tr><td><code>integer</code>, <code>real</code></td><td><code>number</code></td><td></td></tr>
          <tr><td><code>boolean</code></td><td><code>boolean</code></td><td>No more 0 and 1</td></tr>
          <tr><td><strong><code>bigint</code> (int8), <code>numeric</code></strong></td><td><strong><code>string</code></strong></td><td>They can exceed what a JavaScript number holds exactly. <code>count(*)</code> is a bigint, hence <code>count(*)::int</code></td></tr>
          <tr><td><code>timestamptz</code></td><td><code>Date</code></td><td>An exact instant; <code>.toISOString()</code> gives the API's format</td></tr>
          <tr><td><strong><code>date</code></strong></td><td><strong><code>Date</code> at local midnight</strong></td><td>Shifts the day in some time zones. This project keeps it as text</td></tr>
          <tr><td><code>json</code>, <code>jsonb</code></td><td>Parsed object</td><td></td></tr>
        </tbody>
      </TableWrap>

      <Step n={1}>Run PostgreSQL with Docker Compose</Step>
      <CodeFile path={`${P}/compose.yaml`} change="new" />
      <CodeFile path={`${P}/db/init/01-create-test-database.sql`} change="new" />
      <TableWrap>
        <thead>
          <tr><th>Setting</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td><code>image: postgres:18-alpine</code></td><td>Postgres 18 on a small Alpine Linux base. Pin the major version so an image update never upgrades your data format by surprise.</td></tr>
          <tr><td><code>"5440:5432"</code></td><td>Host port 5440 forwards to Postgres's 5432 in the container. Many machines already run a Postgres on 5432 (the test machine did).</td></tr>
          <tr><td>Named volume <code>pgdata</code></td><td>Data survives <code>docker compose down</code> and container upgrades. Postgres 18 images keep data under <code>/var/lib/postgresql</code>; older guides mount <code>/var/lib/postgresql/data</code>.</td></tr>
          <tr><td><code>docker-entrypoint-initdb.d</code></td><td>SQL files here run once, when the volume is first created. This one adds a <code>tasks_test</code> database for the tests.</td></tr>
          <tr><td><code>healthcheck</code></td><td><code>pg_isready</code> reports when Postgres accepts connections, so <code>--wait</code> (and later the app container) can wait for it.</td></tr>
        </tbody>
      </TableWrap>
      <Terminal>{`
npm install pg
npm install --save-dev @types/pg
npm run db:up`}</Terminal>
      <Output>{`
 Container 09-tasks-api-db-1 Created
 Container 09-tasks-api-db-1 Starting
 Container 09-tasks-api-db-1 Started
 Container 09-tasks-api-db-1 Waiting
 Container 09-tasks-api-db-1 Healthy`}</Output>
      <CodeFile path={`${P}/package.json`} change="updated" />
      <div className="prose">
        <p>
          <code>db:up</code> starts the container in the background and waits until the healthcheck passes.{' '}
          <code>test:pg</code> runs the whole suite with a separate env file that points the Postgres tests at{' '}
          <code>tasks_test</code>.
        </p>
      </div>

      <Step n={2}>Configuration</Step>
      <CodeFile path={`${P}/src/config.ts`} change="updated" />
      <div className="prose">
        <p>
          <code>z.url({'{ protocol: /^postgres(ql)?$/ }'})</code> accepts <code>postgres://</code> and{' '}
          <code>postgresql://</code> URLs and nothing else, so a pasted MySQL URL fails at startup with a clear message.
          A connection URL holds everything: <code>postgres://user:password@host:port/database</code>. Add it to your{' '}
          <code>.env</code>:
        </p>
      </div>
      <Code title=".env.example" lang="ini">{`
# Copy this file to .env for local settings. .env is in .gitignore; never commit it.
# Real environment variables win over values in .env.
NODE_ENV=development
PORT=4000
LOG_LEVEL=debug
# Generate your own: node -p "crypto.randomBytes(32).toString('base64url')"
JWT_SECRET=replace-me-with-the-output-of-the-command-above
TOKEN_TTL=1h

# Storage: PostgreSQL when DATABASE_URL is set, otherwise the SQLite file.
# Start the database with: npm run db:up
DATABASE_URL=postgres://tasks:tasks@localhost:5440/tasks
DB_POOL_MAX=10
DB_FILE=data/tasks.db`}</Code>
      <Code title=".env.test (commit this one: it only names the local test database)" lang="ini">{`
# Used only by npm run test:pg. The tests empty this database's tables.
TEST_DATABASE_URL=postgres://tasks:tasks@localhost:5440/tasks_test`}</Code>
      <CodeFile path={`${P}/src/config.test.ts`} change="updated" />

      <Step n={3}>The pool, transactions and migrations</Step>
      <CodeFile path={`${P}/src/db/pg-migrations.ts`} change="new" />
      <div className="prose">
        <p>
          Postgres starts its own migration history at the schema SQLite reached, written with real types:{' '}
          <code>uuid</code>, <code>boolean</code>, <code>date</code>, <code>timestamptz</code> (a timestamp with time
          zone, always stored as an exact instant). Case-insensitive email uniqueness is a unique index on{' '}
          <code>lower(email)</code>. Every task now must have an owner.
        </p>
      </div>
      <CodeFile path={`${P}/src/db/postgres.ts`} change="new" />
      <div className="prose">
        <ul>
          <li><strong>The DATE parser</strong> is set once, for the whole process, when the module loads.</li>
          <li><strong><code>pool.on('error')</code></strong> is not optional. You will see why in the experiments.</li>
          <li><strong><code>withTransaction</code></strong> checks out one client, and <code>finally</code> guarantees <code>release()</code>, whether the callback succeeded, threw, or the <code>ROLLBACK</code> itself failed. A client that is never released is lost to the pool for good.</li>
          <li>
            <strong>Migrations take an advisory lock</strong>, a named lock Postgres holds for you with no table
            involved. When three instances start at once, one migrates and the others wait, then find nothing left to
            do. The <code>schema_migrations</code> table records each applied version with a timestamp.
          </li>
        </ul>
      </div>

      <Step n={4}>The repositories</Step>
      <CodeFile path={`${P}/src/tasks/pg-repository.ts`} change="new" />
      <div className="prose">
        <p>
          Compare it with <code>sqlite-repository.ts</code>: the same methods, the same SQL ideas, but no{' '}
          <code>toRow</code>, because Postgres booleans and timestamps map onto JavaScript directly. <code>list</code>{' '}
          sends its two queries at the same time with <code>Promise.all</code>, on two pooled connections. With SQLite
          that would have been pointless; here the waiting overlaps. (The two queries can see slightly different data if
          a write lands between them. For a page count that is acceptable.)
        </p>
      </div>
      <CodeFile path={`${P}/src/users/pg-repository.ts`} change="new" />
      <div className="prose">
        <p>
          Postgres reports errors with five-character <strong>SQLSTATE</strong> codes. <code>23505</code> is a unique
          violation, the Postgres version of SQLite's 2067, and becomes the same <code>ConflictError</code>, so the
          service and routes cannot tell which database they are talking to.
        </p>
      </div>

      <Step n={5}>Choose the store at startup</Step>
      <CodeFile path={`${P}/src/db/store.ts`} change="new" />
      <CodeFile path={`${P}/src/server.ts`} change="updated" />
      <div className="prose">
        <p>
          <code>Store</code> bundles what the rest of the app needs from storage: two repositories, plus{' '}
          <code>ping</code> and <code>close</code>, which chapter 19 uses for readiness checks and graceful shutdown.{' '}
          <code>server.ts</code> waits for the store (and its migrations) with a top-level <code>await</code> before it
          starts listening, so no request can arrive before the schema is ready.
        </p>
      </div>

      <Step n={6}>Prove it with the same tests</Step>
      <CodeFile path={`${P}/src/tasks/repository-contract.ts`} change="updated" />
      <div className="prose">
        <p>One line changed: the factory may now be <code>async</code>, so a Postgres factory can empty its tables first. Users get a contract of their own:</p>
      </div>
      <CodeFile path={`${P}/src/users/repository-contract.ts`} change="new" />
      <CodeFile path={`${P}/src/users/memory-repository.test.ts`} change="new" />
      <CodeFile path={`${P}/src/users/sqlite-repository.test.ts`} change="new" />
      <CodeFile path={`${P}/src/db/postgres.test.ts`} change="new" />
      <div className="prose">
        <p>Three decisions in that file deserve attention:</p>
        <ul>
          <li><strong>Its own variable, <code>TEST_DATABASE_URL</code>.</strong> The tests run <code>TRUNCATE</code>. Pointing them at <code>DATABASE_URL</code> would one day wipe someone's development data, or worse.</li>
          <li><strong>Skipped, not failed, without a database.</strong> <code>npm test</code> stays green on a laptop with no Docker, and the skip message says what to set.</li>
          <li><strong>One file for every Postgres test.</strong> Test files run in parallel processes; two files truncating the same tables at once would make each other fail at random.</li>
        </ul>
      </div>
      <Terminal>{`npm test`}</Terminal>
      <Output>{`
▶ PostgreSQL
  ﹣ contract tests (0.506958ms) # TEST_DATABASE_URL is not set (see chapter 18)
✔ PostgreSQL (1.42425ms)
…
ℹ tests 65
ℹ pass 64
ℹ fail 0
ℹ skipped 1`}</Output>
      <Terminal>{`npm run test:pg`}</Terminal>
      <Output>{`
▶ PgTaskRepository (repository contract)
  ✔ returns what was inserted (16.838166ms)
  ✔ returns undefined for an unknown id (10.312625ms)
  ✔ lists in creation order with filters, paging and a total (28.317875ms)
  ✔ finds open tasks by title, ignoring case and finished tasks (11.271875ms)
  ✔ updates every changeable field (6.7245ms)
  ✔ deletes, and says whether anything was deleted (5.454333ms)
  ✔ keeps each owner’s tasks invisible to everyone else (7.203667ms)
  ✔ hands out copies, not the stored objects (9.283417ms)
✔ PgTaskRepository (repository contract) (125.7055ms)
▶ PgUserRepository (user repository contract)
  ✔ finds a user by id, and by email ignoring case (5.645667ms)
  ✔ returns undefined for unknown users (3.144667ms)
  ✔ refuses a second account with the same email, in any case (3.713208ms)
✔ PgUserRepository (user repository contract) (12.772209ms)
▶ withTransaction
  ✔ commits everything when the callback succeeds (4.266542ms)
  ✔ rolls everything back when the callback throws (4.427542ms)
✔ withTransaction (8.847375ms)
…
ℹ tests 77
ℹ pass 77
ℹ fail 0
ℹ skipped 0`}</Output>
      <div className="prose">
        <p>
          The same eight task rules that the in-memory and SQLite stores pass, now passing against a real Postgres
          server. That is the payoff of the contract tests you wrote in chapter 13: the swap is proven, not hoped for.
          Each Postgres test takes milliseconds rather than microseconds, because every query crosses the network.
        </p>
      </div>

      <Step n={7}>Run the API on Postgres</Step>
      <div className="prose">
        <p>With <code>DATABASE_URL</code> in your <code>.env</code>, <code>npm run dev</code> now uses Postgres. Sign up, create a task, and try a duplicate account:</p>
      </div>
      <Output caption="curl responses">{`
{"id":"d8eff267-191d-4ebb-bccb-50303827a26d","userId":"567b958c-b9d7-4a1c-a3d2-42802ab1848d","title":"Stored in PostgreSQL","done":false,"priority":"medium","dueDate":"2026-12-24","createdAt":"2026-10-12T07:29:34.226Z"}
{"items":[{"id":"d8eff267-…","title":"Stored in PostgreSQL",…,"dueDate":"2026-12-24",…}],"total":1,"limit":20,"offset":0}
{"error":{"code":"conflict","message":"An account with this email already exists"}}`}</Output>
      <Output caption="Server log (first line)">{`{"level":30,"time":"2026-10-12T07:29:32.845Z","service":"tasks-api","port":4000,"env":"development","store":"postgres","msg":"tasks API listening"}`}</Output>
      <div className="prose">
        <p>The JSON is byte-for-byte the shape SQLite produced. Now look inside with <code>psql</code>, which runs in the container:</p>
      </div>
      <Terminal>{`docker compose exec db psql -U tasks -d tasks -c 'SELECT version, applied_at FROM schema_migrations;' -c 'SELECT title, done, due_date, created_at FROM tasks;'`}</Terminal>
      <Output>{`
 version |          applied_at
---------+-------------------------------
       1 | 2026-10-12 07:29:32.829756+00
(1 row)

        title         | done |  due_date  |         created_at
----------------------+------+------------+----------------------------
 Stored in PostgreSQL | f    | 2026-12-24 | 2026-10-12 07:29:34.226+00
(1 row)`}</Output>
      <div className="prose">
        <p>Run <code>docker compose exec db psql -U tasks -d tasks</code> for an interactive session; <code>\dt</code> lists tables, <code>\d tasks</code> describes one, <code>\q</code> quits.</p>
      </div>

      <h2>Indexes, EXPLAIN and the N+1 problem</h2>
      <div className="prose">
        <p>
          <code>EXPLAIN ANALYZE</code> runs a query and shows the plan Postgres chose, with real timings. To make it
          interesting, the test machine loaded 100 users with 1,000 tasks each and asked for one user's first page:
        </p>
      </div>
      <Output panes={[
        { tag: 'With the tasks_by_owner index', text: '->  Index Scan using tasks_by_owner on tasks\n      (actual time=0.016..0.020 rows=20.00 loops=1)\n      Index Cond: (user_id = (InitPlan 1).col1)\n…\nExecution Time: 0.032 ms' },
        { tag: 'After DROP INDEX tasks_by_owner', text: '->  Sort  (actual time=2.325..2.325 rows=20.00 loops=1)\n      Sort Key: tasks.created_at, tasks.id\n      ->  Seq Scan on tasks\n            Rows Removed by Filter: 100001\n…\nExecution Time: 2.336 ms' },
      ]} />
      <div className="prose">
        <p>
          Without the index, Postgres read all 101,001 rows, threw away all but one user's, and sorted them: 70 times
          slower, and it grows with the table. With the index on <code>(user_id, created_at, id)</code> it jumped
          straight to that user's rows, already in order, and stopped after 20. Index the columns your{' '}
          <code>WHERE</code> and <code>ORDER BY</code> use together, and check with <code>EXPLAIN</code> rather than
          guessing.
        </p>
        <p>
          The <strong>N+1 problem</strong> is the other classic. Suppose an admin page lists 50 tasks with their owners'
          emails, and the code fetches the tasks (1 query) and then each owner (50 queries). Each query is fast, but 51
          network round trips are slow, and the pool fills up. Ask for everything in one query instead:
        </p>
      </div>
      <Code title="One query instead of N+1" lang="sql">{`
SELECT t.title, u.email
  FROM tasks t
  JOIN users u ON u.id = t.user_id
 WHERE t.id = ANY($1);   -- $1 is an array of task ids`}</Code>
      <div className="prose">
        <p>ORMs make N+1 easy to write by accident, through "lazy loading" of related objects. Logging the number of queries per request is a cheap way to spot it.</p>
      </div>

      <h2>How many connections?</h2>
      <Diagram spec={connectionMaths} caption="Each instance's pool is separate. Their maximums add up on the database server." />
      <div className="prose">
        <p>
          Postgres has a hard <code>max_connections</code> limit; the default, which this container reported with{' '}
          <code>SHOW max_connections</code>, is <code>100</code>. A few are reserved for superusers. Your pools must fit
          under it together:
        </p>
      </div>
      <Code title="The budget" lang="plaintext">{`
instances × DB_POOL_MAX + headroom (migrations, psql, backups, monitoring) < max_connections
3 × 10 + 10 = 40 < 100      fine
4 × 30 + 10 = 130 > 100     new connections fail with "sorry, too many clients already"`}</Code>
      <div className="prose">
        <p>
          A bigger pool is not faster beyond a point: Postgres does its best work with a number of active connections
          near its CPU core count, and extra connections mostly wait. When you need hundreds of instances (serverless
          functions are the usual case), put a connection pooler such as <strong>PgBouncer</strong> or your cloud's
          proxy in between, so many clients share a few real connections.
        </p>
      </div>

      <Box kind="try" label="Try it: the bugs this chapter prevents">
        <ol>
          <li>
            <p>Remove the DATE parser line from <code>postgres.ts</code> and read a date in a time zone east of UTC. Here, <code>TZ=Asia/Kolkata</code> (UTC+5:30):</p>
            <Output>{`
default parsing: {
  due: 2026-12-23T18:30:00.000Z,
  at: 2026-10-12T07:29:56.136Z,
  n: '1',
  flag: true
} typeof n = string
due as JSON: "2026-12-23T18:30:00.000Z"`}</Output>
            <p>
              A due date of 24 December became the 23rd. West of UTC (the test machine's own zone) it came back as{' '}
              <code>2026-12-24T08:00:00.000Z</code>: the right day only by luck, and not the API's format. The same
              output shows <code>count(*)</code> arriving as the string <code>'1'</code>. The contract test{' '}
              <code>updates every changeable field</code> catches the date bug.
            </p>
          </li>
          <li>
            <p>Remove the <code>::boolean</code> cast from <code>FILTER</code> and list tasks:</p>
            <Output>{`error: could not determine data type of parameter $2  (code 42P08)`}</Output>
          </li>
          <li>
            <p>Borrow every connection and never give them back. With <code>max: 2</code> and a 1-second timeout, the third request for a connection fails:</p>
            <Output>{`third connect after 1002 ms: timeout exceeded when trying to connect`}</Output>
            <p>With the pg default of no timeout it would wait forever, and every request would hang. This is what a missing <code>client.release()</code> does to a server, slowly.</p>
          </li>
          <li>
            <p>With the server running, make one request, then restart the database with <code>docker compose restart db</code> and make another:</p>
            <Output caption="With pool.on('error') in place: two log lines, and the next request succeeds">{`
{"level":50,…,"err":{"type":"DatabaseError","message":"terminating connection due to administrator command","code":"57P01"},"msg":"idle database connection failed"}
{"level":50,…,"requestId":"4a24f93e-…","err":{…,"code":"57P01"},"msg":"idle database connection failed"}`}</Output>
            <Output caption="Without the listener: the whole server dies">{`{"level":60,…,"err":{"type":"DatabaseError","message":"terminating connection due to administrator command","code":"57P01"},"msg":"uncaught exception, exiting"}`}</Output>
            <p>
              The pool dropped its two idle connections and opened fresh ones on the next request. One line even carries a
              request id: that connection was opened during an earlier request, and <code>AsyncLocalStorage</code> followed
              the socket. Treat request ids on pool events as noise.
            </p>
          </li>
        </ol>
      </Box>
      <Box kind="warn" label="Two rules to never break">
        <ul>
          <li><strong>Every <code>pool.connect()</code> has a <code>release()</code> in a <code>finally</code>.</strong> Prefer a helper like <code>withTransaction</code> so you write it once.</li>
          <li><strong>Never point destructive tests at a real database.</strong> Use a dedicated test database, named in its own variable.</li>
        </ul>
      </Box>

      <Exercises
        items={[
          {
            task: <>Add a statement timeout so no query can run longer than 5 seconds by default, and test that a slow query is cancelled.</>,
            hint: <>pg passes a <code>statement_timeout</code> option (in milliseconds) to Postgres for each connection. Test with a pool whose limit is 200 ms and <code>SELECT pg_sleep(1)</code>; Postgres cancels it with code <code>57014</code>.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/db/postgres.ts`} />
                <CodeFile path={`${X}/src/db/postgres.test.ts`} />
              </>
            ),
          },
          {
            task: <><code>findOpenByTitle</code> runs on every task creation. Add Postgres migration 2 with an index that serves it, and confirm with <code>EXPLAIN</code> that Postgres uses it.</>,
            hint: <>A <strong>partial index</strong> only contains rows matching a <code>WHERE</code>: <code>CREATE INDEX … ON tasks (user_id, lower(title)) WHERE NOT done</code>. The expression <code>lower(title)</code> must match the query exactly. Run <code>ANALYZE tasks</code> before <code>EXPLAIN</code>.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/db/pg-migrations.ts`} />
                <Output panes={[
                  { tag: 'Before', text: '->  Bitmap Heap Scan on tasks\n      Recheck Cond: (user_id = (InitPlan 1).col1)\n      Filter: ((NOT done) AND (lower(title) = \'task 500\'::text))\n      ->  Bitmap Index Scan on tasks_by_owner' },
                  { tag: 'After migration 2', text: '->  Index Scan using tasks_open_by_title on tasks\n      Index Cond: ((user_id = (InitPlan 1).col1)\n        AND (lower(title) = \'task 500\'::text))' },
                ]} />
                <p>Before, Postgres fetched all of the user's 1,000 rows and filtered them; after, the index leads straight to the match.</p>
              </>
            ),
          },
        ]}
      />

      <Checkpoint question="Why does withTransaction call pool.connect() instead of running BEGIN, the statements and COMMIT through pool.query()?">
        <p>
          A transaction exists on one connection. <code>pool.query()</code> borrows whichever connection is free for each
          call, so <code>BEGIN</code> might run on connection A, the <code>INSERT</code> on connection B (outside any
          transaction, committed immediately) and <code>COMMIT</code> on A. Checking out a client pins every statement to
          the same connection until <code>release()</code>.
        </p>
      </Checkpoint>
      <Checkpoint question="You scale to 4 instances and set DB_POOL_MAX=30 to handle load. The database has max_connections = 100. What happens, and what would you do instead?">
        <p>
          Under load the pools try to open up to 120 connections. Once the server reaches its limit, new connections are
          refused with "sorry, too many clients already", and requests fail, including on instances that were fine
          before. Keep the total under the limit with headroom (for example 4 × 20), raise <code>max_connections</code>{' '}
          only if the server has memory for it, or add a pooler such as PgBouncer. Often the real fix is faster queries:
          connections are held for less time.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Move to Postgres for concurrent writes, asynchronous I/O and multiple instances; an async repository interface makes it a local change.</li>
          <li>Run Postgres in Compose with a pinned image, a named volume and a healthcheck; give tests their own database.</li>
          <li>Share one pool per process; set a connection timeout; always listen for the pool's <code>error</code> event.</li>
          <li>Use <code>pool.query</code> for single statements and a checked-out client, released in <code>finally</code>, for transactions.</li>
          <li>Parameters are <code>$1</code>, <code>$2</code>; cast nullable ones. Watch for bigint as string and the DATE time-zone bug.</li>
          <li>Run contract tests against every store; read plans with <code>EXPLAIN ANALYZE</code>; avoid N+1; budget connections across instances.</li>
        </ul>
      </Recap>
    </>
  );
}
