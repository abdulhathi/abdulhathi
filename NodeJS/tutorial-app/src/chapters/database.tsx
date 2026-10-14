import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';

const P = '09-tasks-api.2-sqlite';
const X = '09-tasks-api.2-sqlite.practice';

export function Database() {
  return (
    <>
      <ChapterIntro
        time="2–2.5 hours"
        project="09-tasks-api"
        learn={[
          'Why SQLite is a real database, and where its limits are',
          'The node:sqlite API: open, prepare, run, get, all',
          'Designing a schema with constraints that protect your data',
          'Versioned migrations with PRAGMA user_version',
          'Prepared statements, and exactly how they stop SQL injection',
          'Transactions for all-or-nothing changes, and why they make bulk writes fast',
          'What a synchronous database API means for the event loop',
        ]}
        tools={[
          { name: 'node:sqlite', what: 'SQLite built into Node. No package to install, nothing to compile.' },
          { name: 'sqlite3', what: 'SQLite’s command-line shell, for looking inside the database file.' },
          { name: 'SQL', what: 'The language every relational database speaks, with small dialect differences.' },
        ]}
      />

      <div className="prose">
        <p>
          Restart the chapter 11 server and every task is gone: they lived in a <code>Map</code> in memory. This chapter
          stores them in a database instead, and because the app was built in layers, the change is one new class and
          one changed line in <code>server.ts</code>. The routes, the service and the error handling stay exactly as
          they are.
        </p>
      </div>

      <h2>Why SQLite</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>JSON file</th><th>SQLite</th><th>PostgreSQL (chapter 18)</th></tr>
        </thead>
        <tbody>
          <tr><td>Runs as</td><td>Your code reads and rewrites the file</td><td>A library inside your process; data in one file</td><td>A separate server you connect to over the network</td></tr>
          <tr><td>Safe if the process crashes mid-write</td><td>Only with care (chapter 05's atomic writes)</td><td>Yes: ACID transactions</td><td>Yes</td></tr>
          <tr><td>Queries</td><td>Load everything, filter in JavaScript</td><td>SQL with indexes</td><td>SQL with indexes, plus much more</td></tr>
          <tr><td>Concurrent writers</td><td>One, and you must enforce it</td><td>One at a time; readers never wait with WAL</td><td>Many</td></tr>
          <tr><td>Several app servers</td><td>No</td><td>No: the file lives on one machine</td><td>Yes</td></tr>
          <tr><td>Setup</td><td>None</td><td>None</td><td>Install or run a container</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          SQLite is not a toy. It is in every phone, browser and Mac, and it is the most widely deployed database in the
          world. ACID means each transaction is <strong>a</strong>tomic (all or nothing), keeps the data{' '}
          <strong>c</strong>onsistent with its constraints, runs <strong>i</strong>solated from others, and is{' '}
          <strong>d</strong>urable once committed. For a service on one machine with modest write traffic, it is often
          all you need. Its real limit is that the file belongs to one machine, which is why chapter 18 moves to
          PostgreSQL when the API needs to scale out.
        </p>
      </div>

      <h2>node:sqlite in five calls</h2>
      <TableWrap>
        <thead>
          <tr><th>Call</th><th>Returns</th><th>Use it for</th></tr>
        </thead>
        <tbody>
          <tr><td><code>new DatabaseSync(file)</code></td><td>A connection</td><td>Opening or creating a database file, or <code>':memory:'</code></td></tr>
          <tr><td><code>db.exec(sql)</code></td><td>Nothing</td><td>Running SQL with no parameters, even several statements: schema changes, <code>BEGIN</code>, <code>PRAGMA</code></td></tr>
          <tr><td><code>db.prepare(sql)</code></td><td>A <code>StatementSync</code></td><td>Compiling one statement once, to run many times with different values</td></tr>
          <tr><td><code>stmt.run(...params)</code></td><td><code>{'{ changes, lastInsertRowid }'}</code></td><td><code>INSERT</code>, <code>UPDATE</code>, <code>DELETE</code></td></tr>
          <tr><td><code>stmt.get(...params)</code> / <code>stmt.all(...params)</code></td><td>The first row or <code>undefined</code> / an array of rows</td><td><code>SELECT</code></td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Parameters are positional (<code>?</code>, passed as arguments) or named (<code>$title</code>, passed as an
          object <code>{'{ title: … }'}</code>). Values convert between JavaScript and SQLite like this:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>JavaScript</th><th>Stored as</th><th>Read back as</th></tr>
        </thead>
        <tbody>
          <tr><td><code>string</code></td><td>TEXT</td><td><code>string</code></td></tr>
          <tr><td><code>number</code>, <code>bigint</code></td><td>INTEGER or REAL</td><td><code>number</code> (or <code>bigint</code> if you ask for it)</td></tr>
          <tr><td><code>null</code></td><td>NULL</td><td><code>null</code></td></tr>
          <tr><td><code>true</code> / <code>false</code></td><td>INTEGER 1 / 0</td><td><code>1</code> / <code>0</code>, not booleans: SQLite has no boolean type</td></tr>
          <tr><td><code>Uint8Array</code></td><td>BLOB</td><td><code>Uint8Array</code></td></tr>
          <tr><td><code>undefined</code></td><td colSpan={2}>Throws <code>ERR_INVALID_ARG_TYPE: Provided value cannot be bound to SQLite parameter 1.</code> Convert to <code>null</code> first.</td></tr>
        </tbody>
      </TableWrap>

      <h2>A synchronous API on an asynchronous server</h2>
      <div className="prose">
        <p>
          <code>DatabaseSync</code> does what its name says: every call blocks the event loop until SQLite finishes.
          Chapter 07 warned you about exactly this, so why is it acceptable? Because SQLite runs inside your process.
          There is no network round trip to wait for, only work, and a query on an indexed table of a few thousand rows
          takes microseconds. The request log in step 6 shows whole requests, SQL included, finishing in about a
          millisecond.
        </p>
        <p>
          It stops being acceptable when queries get slow (big scans, huge results) or when the database is on another
          machine. Then you want an asynchronous driver and a connection pool, which is what chapter 18 brings with
          PostgreSQL. The repository interface already returns promises, so that switch will not touch any caller.
        </p>
      </div>

      <h2>Migrations</h2>
      <div className="prose">
        <p>
          Your schema will change: chapter 15 adds users and gives every task an owner. Every copy of the database (yours,
          a teammate's, production) must go through the same changes in the same order. A <strong>migration</strong> is
          one such change, written as SQL and numbered. The app records which number each database has reached and
          applies only the missing ones at startup.
        </p>
        <p>
          SQLite reserves a spare integer in the file header, readable and writable with <code>PRAGMA user_version</code>.
          It starts at 0. That is all the bookkeeping a small project needs; larger ones use a migrations table and a
          tool, but the idea is identical.
        </p>
      </div>
      <Box kind="key" label="The migration rules">
        <ol>
          <li><strong>Append only.</strong> Never edit a migration that has run anywhere. Fix mistakes with a new one.</li>
          <li><strong>One transaction per migration.</strong> A crash halfway leaves the database at the previous version, not somewhere in between.</li>
          <li><strong>Run them automatically</strong> at startup or in the deploy step, never by hand.</li>
        </ol>
      </Box>

      <h2>SQL injection, demonstrated</h2>
      <div className="prose">
        <p>
          The most famous security bug in web development happens when user input is pasted into SQL text. This small
          script, included in the project, shows it against a throwaway in-memory database.
        </p>
      </div>
      <CodeFile path={`${P}/src/db/injection-demo.ts`} />
      <Terminal>{`node src/db/injection-demo.ts`}</Terminal>
      <Output>{`
SQL built with a template string:
  SELECT owner, title FROM tasks WHERE owner = 'nobody' OR '1'='1'
  → [
  [Object: null prototype] { owner: 'ada', title: 'Buy milk' },
  [Object: null prototype] { owner: 'bob', title: 'Secret plan' },
  [Object: null prototype] { owner: 'bob', title: 'Payroll' }
]
With a ? placeholder, the input is only ever a value:
  → []`}</Output>
      <div className="prose">
        <p>
          The quote in the input closed the string early, and <code>OR '1'='1'</code> became part of the query, which
          then matched every row, including Bob's. With a placeholder, SQLite compiles the statement first and only then
          receives the value. The value is never parsed as SQL, so no input can change the query's meaning. The rule has
          no exceptions: <strong>values always go in parameters</strong>. (Table and column names cannot be parameters;
          if they ever come from input, pick them from a fixed list.) The <code>[Object: null prototype]</code> means
          rows are plain objects without the usual <code>Object.prototype</code>, so a column called{' '}
          <code>constructor</code> cannot clash with anything.
        </p>
      </div>

      <Step n={1}>A transaction helper</Step>
      <CodeFile path={`${P}/src/db/transaction.ts`} change="new" />
      <div className="prose">
        <p>
          <code>BEGIN</code> starts a transaction, <code>COMMIT</code> makes its changes permanent, and{' '}
          <code>ROLLBACK</code> throws them all away. The helper guarantees one of the last two happens, and re-throws
          the error so the caller still sees it. The generic <code>T</code> passes the callback's return value through.
        </p>
      </div>
      <Box kind="warn" label="Never await inside a transaction on a shared connection">
        <p>
          The server has one connection. If a transaction function did <code>await</code>, the event loop would run other
          requests in the gap, and their statements would execute inside your transaction: committed with it, or rolled
          back with it. That is why <code>fn</code> is synchronous. PostgreSQL in chapter 18 solves this differently, by
          giving each transaction its own connection from a pool.
        </p>
      </Box>

      <Step n={2}>The schema, as migration 1</Step>
      <CodeFile path={`${P}/src/db/migrations.ts`} change="new" />
      <TableWrap>
        <thead>
          <tr><th>Choice</th><th>Reason</th></tr>
        </thead>
        <tbody>
          <tr><td><code>id TEXT PRIMARY KEY</code></td><td>The service generates UUIDs, so ids are text. The primary key also makes lookups by id fast.</td></tr>
          <tr><td><code>NOT NULL</code></td><td>The database refuses rows without a title, even if a bug in your code tries to insert one.</td></tr>
          <tr><td><code>CHECK (done IN (0, 1))</code></td><td>SQLite has no boolean type, so store 0 or 1 and forbid anything else.</td></tr>
          <tr><td><code>CHECK (priority IN (...))</code></td><td>The same rule as the Zod enum, enforced a second time where the data lives.</td></tr>
          <tr><td>Dates as <code>TEXT</code></td><td>ISO strings like <code>2026-10-12T07:00:19.928Z</code> sort correctly as text, and SQLite's date functions read them.</td></tr>
          <tr><td><code>CREATE INDEX ... (created_at, id)</code></td><td>The list query orders by these two columns, so an index lets SQLite read rows in order instead of sorting them all.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          <code>migrate</code> reads the current version, slices off the migrations already applied, and runs each
          remaining one together with its version bump inside a transaction. SQLite, unlike some databases, can roll back
          schema changes such as <code>CREATE TABLE</code>, so a failed migration leaves no half-built table behind.
        </p>
      </div>

      <Step n={3}>Open the database</Step>
      <CodeFile path={`${P}/src/db/database.ts`} change="new" />
      <TableWrap>
        <thead>
          <tr><th>PRAGMA</th><th>What it changes</th></tr>
        </thead>
        <tbody>
          <tr><td><code>journal_mode = WAL</code></td><td>Write-ahead logging: changes go to a separate <code>-wal</code> file first, so readers keep reading while one writer writes. The setting is stored in the file.</td></tr>
          <tr><td><code>synchronous = NORMAL</code></td><td>In WAL mode, this skips a disk flush on every commit. A power cut can lose the last few commits, but never corrupts the file.</td></tr>
          <tr><td><code>foreign_keys = ON</code></td><td>SQLite ignores <code>REFERENCES</code> constraints unless you turn this on, for every connection. Chapter 15 needs it.</td></tr>
          <tr><td><code>busy_timeout = 5000</code></td><td>If another process holds the write lock, wait up to 5 seconds instead of failing at once with <code>SQLITE_BUSY</code>.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={4}>The SQLite repository</Step>
      <CodeFile path={`${P}/src/tasks/sqlite-repository.ts`} change="new" />
      <div className="prose">
        <p>The parts worth studying:</p>
        <ul>
          <li>
            <strong>Statements are prepared once</strong>, in the constructor. Preparing parses and plans the SQL;
            running a prepared statement skips that work.
          </li>
          <li>
            <strong>Two shapes, two mapping functions.</strong> The database speaks <code>snake_case</code> and 0/1; the
            rest of the app speaks <code>camelCase</code> and booleans. <code>toTask</code> and <code>toRow</code> are the
            only places that know both.
          </li>
          <li>
            <strong>The <code>FILTER</code> trick.</strong> <code>($done IS NULL OR done = $done)</code> turns a
            condition off when its parameter is <code>null</code>. One fixed statement covers every combination of
            filters, so you never build SQL by joining strings.
          </li>
          <li>
            <strong><code>update</code> removes <code>created_at</code></strong> before running. node:sqlite rejects keys
            that match no parameter, with <code>Unknown named parameter 'created_at'</code>, which catches typos too.
            The opposite mistake, a parameter you forget to pass, silently binds <code>NULL</code>.
          </li>
          <li>
            <strong>Casting rows</strong> with <code>as TaskRow</code> tells TypeScript what the query returns. It is a
            promise you make, not a check, so the column list and the type must agree. Validating every row with Zod
            would be safer and slower; at this boundary, which you fully control, a cast is the usual trade-off.
          </li>
          <li>
            <code>changes</code> may be a <code>number</code> or a <code>bigint</code>, so <code>Number()</code> makes the
            comparison safe either way.
          </li>
        </ul>
      </div>

      <Step n={5}>Swap the store</Step>
      <div className="prose">
        <p>
          This is the moment the layers pay off. Two imports and two lines change; nothing else in the app knows. Add{' '}
          <code>data/</code> to <code>.gitignore</code>: a database file is data, not source code.
        </p>
      </div>
      <CodeFile path={`${P}/src/server.ts`} change="updated" />
      <CodeFile path={`${P}/.gitignore`} change="updated" />

      <Step n={6}>Run it, restart it, look inside</Step>
      <Terminal title="Terminal 1">{`npm run dev`}</Terminal>
      <Terminal title="Terminal 2">{`
curl -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"title":"Survive a restart","priority":"high"}'
curl -X POST localhost:4000/tasks -H 'content-type: application/json' -d '{"title":"Learn SQLite"}'
curl -X PATCH localhost:4000/tasks/<id> -H 'content-type: application/json' -d '{"done":true,"dueDate":"2026-12-24"}'`}</Terminal>
      <div className="prose">
        <p>Now stop the server with <kbd>Ctrl</kbd>+<kbd>C</kbd>, start it again, and list the tasks:</p>
      </div>
      <Terminal title="Terminal 2">{`
curl 'localhost:4000/tasks?done=true'
ls data`}</Terminal>
      <Output>{`
{"items":[{"id":"b5f4f282-e448-4b01-bb9f-e5ffc4034e93","title":"Survive a restart","done":true,"priority":"high","dueDate":"2026-12-24","createdAt":"2026-10-12T07:00:19.928Z"}],"total":1,"limit":20,"offset":0}

tasks.db
tasks.db-shm
tasks.db-wal`}</Output>
      <Output caption="Terminal 1, after the restart and a few more requests">{`
Tasks API listening on http://localhost:4000 (database: data/tasks.db)
GET /tasks?done=true → 200 in 5.2 ms
GET /tasks?done=false&priority=medium → 200 in 0.6 ms
DELETE /tasks/b5f4f282-e448-4b01-bb9f-e5ffc4034e93 → 204 in 0.9 ms
GET /tasks → 200 in 0.4 ms`}</Output>
      <div className="prose">
        <p>
          The task survived, and <code>done</code> came back as <code>true</code>, not <code>1</code>, thanks to{' '}
          <code>toTask</code>. The three files are the database, the write-ahead log, and a shared-memory index for the
          log. SQLite folds the log back into the main file from time to time. Copy all three, or none, if you back up
          by copying files. Now look at the data the way SQLite sees it:
        </p>
      </div>
      <Terminal>{`sqlite3 data/tasks.db 'PRAGMA user_version;' 'SELECT title, done, priority FROM tasks;'`}</Terminal>
      <Output>{`
1
Survive a restart|1|high
Learn SQLite|0|medium`}</Output>
      <div className="prose">
        <p>Schema version 1, and <code>done</code> stored as 0 and 1. Try <code>sqlite3 data/tasks.db</code> on its own for an interactive shell; <code>.tables</code>, <code>.schema</code> and <code>.quit</code> are the commands you will use most.</p>
      </div>

      <Step n={7}>Transactions make bulk writes fast</Step>
      <div className="prose">
        <p>
          A transaction is about correctness first, but it also changes performance dramatically. Outside a transaction,
          every <code>INSERT</code> is its own transaction, with its own commit. This seed script inserts the same number
          of rows both ways.
        </p>
      </div>
      <CodeFile path={`${P}/src/db/seed.ts`} change="new" />
      <CodeFile path={`${P}/package.json`} change="updated" />
      <Terminal>{`npm run db:seed -- 1000`}</Terminal>
      <Output>{`
1000 inserts, each its own transaction: 21.9 ms
1000 inserts in one transaction:        2.9 ms`}</Output>
      <div className="prose">
        <p>
          About seven times faster, and that is with <code>synchronous = NORMAL</code> already making each commit cheap.
          With SQLite's default setting, where every commit waits for the disk, the same test took 92 ms against 0.3 ms
          on the test machine: three hundred times. Your numbers will differ; the gap will not. Restart the server and
          list tasks to see the seeded rows.
        </p>
      </div>

      <Box kind="try" label="Try it: let the database say no">
        <ol>
          <li>
            <p>Bypass your API and insert a bad row directly:</p>
            <Terminal>{`sqlite3 data/tasks.db "INSERT INTO tasks VALUES ('x', 'Bad', 0, 'urgent', NULL, '2026-10-12');"`}</Terminal>
            <Output caption="sqlite3 says">{`Error in 2nd command line argument: CHECK constraint failed: priority IN ('low', 'medium', 'high')`}</Output>
            <p>From Node the same insert throws an error with <code>code: 'ERR_SQLITE_ERROR'</code> and the same message. Zod guards the front door; constraints guard the data itself, against bugs, scripts and future code.</p>
          </li>
          <li>
            <p>
              In <code>sqlite-repository.ts</code>, change <code>priority ?? null</code> to just <code>priority</code> and
              list tasks without a priority filter. The value is <code>undefined</code>, so the request fails with a 500,
              and the server terminal shows <code>TypeError: Provided value cannot be bound to SQLite parameter 2.</code>{' '}
              (<code>$priority</code> is the second parameter in the statement). Undo it.
            </p>
          </li>
          <li>
            <p>
              Add a broken migration 2 that creates a table and then misspells a keyword:{' '}
              <code>`CREATE TABLE tags (id TEXT PRIMARY KEY); CREAT INDEX oops ON tags (id);`</code>. Restart:
            </p>
            <Output caption="The server refuses to start">{`
file://…/src/db/migrations.ts:27
      db.exec(sql);
         ^

Error: near "CREAT": syntax error
    at file://…/src/db/migrations.ts:27:10
    at transaction (file://…/src/db/transaction.ts:11:20)
    …`}</Output>
            <p>
              <code>sqlite3 data/tasks.db 'PRAGMA user_version;' '.tables'</code> prints <code>1</code> and only{' '}
              <code>tasks</code>: the <code>tags</code> table that was created before the error was rolled back with
              everything else. Remove the broken migration afterwards.
            </p>
          </li>
        </ol>
      </Box>

      <Exercises
        items={[
          {
            task: <>Write migration 2: an index on <code>(done, priority)</code> to speed up filtered lists. Restart and confirm <code>PRAGMA user_version</code> is 2.</>,
            hint: <>Append one string to <code>MIGRATIONS</code>. Do not touch migration 1. Run <code>sqlite3 data/tasks.db '.indexes tasks'</code> to see it.</>,
            solution: <CodeFile path={`${X}/src/db/migrations.ts`} />,
          },
          {
            task: <>Add the <code>search</code> filter from chapter 11's exercise to the SQLite repository, so <code>?search=read</code> works against the database. A search for <code>%</code> must find only titles containing a percent sign.</>,
            hint: <><code>LIKE '%' || $search || '%'</code> treats <code>%</code> and <code>_</code> in the input as wildcards. <code>instr(lower(title), lower($search)) &gt; 0</code> finds plain text. Remember to pass <code>search ?? null</code>.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/tasks/task.ts`} />
                <CodeFile path={`${X}/src/tasks/sqlite-repository.ts`} />
              </>
            ),
          },
          {
            task: <>Add an <code>npm run db:stats</code> script that prints, for each priority, the total number of tasks, how many are done and how many are open, as a table.</>,
            hint: <><code>GROUP BY priority</code> with <code>count(*)</code> and <code>sum(done)</code> (done is 0 or 1, so the sum counts finished tasks). <code>console.table()</code> draws the table.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/db/stats.ts`} />
                <Output caption="npm run db:stats after seeding 12 tasks">{`
┌─────────┬──────────┬───────┬──────┬──────┐
│ (index) │ priority │ total │ done │ open │
├─────────┼──────────┼───────┼──────┼──────┤
│ 0       │ 'high'   │ 8     │ 2    │ 6    │
│ 1       │ 'medium' │ 8     │ 2    │ 6    │
│ 2       │ 'low'    │ 8     │ 2    │ 6    │
└─────────┴──────────┴───────┴──────┴──────┘`}</Output>
              </>
            ),
          },
        ]}
      />

      <Checkpoint question="The server crashes while applying migration 2, right after its CREATE TABLE ran. What state is the database in when it restarts, and what happens next?">
        <p>
          Exactly as it was before migration 2 started: <code>user_version</code> is still 1 and the new table does not
          exist, because both changes were inside one transaction that never committed. SQLite rolls back the unfinished
          transaction when the file is next opened. On restart, <code>migrate</code> sees version 1 and runs migration 2
          again from the beginning.
        </p>
      </Checkpoint>
      <Checkpoint question={<>A colleague writes <code>db.prepare(`SELECT * FROM tasks ORDER BY ${'${'}req.query.sort{'}'}`)</code> and argues it is fine because sort is not a value. Is it?</>}>
        <p>
          No. Anything pasted into SQL text can change the query; <code>sort</code> could be{' '}
          <code>title; DROP TABLE tasks</code> or a subquery that leaks data. Column names cannot be parameters, so
          validate against a fixed list instead, for example <code>z.enum(['createdAt', 'dueDate'])</code>, and map each
          allowed value to a column name written in your code.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>SQLite is a full ACID database running inside your process; its limit is one machine and one writer at a time.</li>
          <li>Never put values into SQL text. Prepared statements with parameters make injection impossible.</li>
          <li>Map between rows and domain objects in one place; convert <code>undefined</code> to <code>null</code> and booleans to 0/1 and back.</li>
          <li>Migrations are numbered, append-only, and each runs in a transaction. <code>PRAGMA user_version</code> stores the number.</li>
          <li>Transactions make related changes all-or-nothing and make bulk writes many times faster. Keep them synchronous on a shared connection.</li>
          <li><code>DatabaseSync</code> blocks the event loop, which is fine for fast local queries and wrong for slow or remote ones.</li>
        </ul>
      </Recap>
    </>
  );
}
