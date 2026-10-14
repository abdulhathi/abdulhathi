import { CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { shutdownSequence } from '../diagrams/specs/api';

const P = '09-tasks-api.7-production';
const X = '09-tasks-api.7-production.practice';

export function Production() {
  return (
    <>
      <ChapterIntro
        time="3–3.5 hours"
        project="09-tasks-api"
        learn={[
          'What happens to your process during a deploy, and how to shut down without dropping requests',
          'Liveness versus readiness probes, and why they must check different things',
          'Running TypeScript in production: type stripping directly, or compiling to JavaScript',
          'Production-only installs, a multi-stage Dockerfile, and a non-root container that handles signals',
          'Running the API and Postgres together with Docker Compose',
          'A GitHub Actions pipeline that type-checks, tests against Postgres and builds on every push',
          'Dependency audits, the basics of logs, metrics and alerts, and a production checklist',
        ]}
        tools={[
          { name: 'server.close()', what: 'Stops accepting connections and reports when the open ones have finished.' },
          { name: 'tsc', what: 'Compiles src/ to dist/ with a second tsconfig.' },
          { name: 'npm ci', what: 'Exact, reproducible installs from package-lock.json; --omit=dev for production.' },
          { name: 'Docker', what: 'Packages the app and its runtime into one image.' },
          { name: 'GitHub Actions', what: 'Runs your checks on GitHub’s machines for every push and pull request.' },
          { name: 'npm audit', what: 'Reports known vulnerabilities in your dependency tree.' },
        ]}
      />

      <div className="prose">
        <p>
          Production is not a different program; it is the same program under harsher conditions. Instances are
          stopped and started several times a day by deploys and autoscaling, networks fail, dependencies get security
          advisories, and nobody is watching the terminal. This chapter makes the tasks API behave well under those
          conditions, then packages it and sets up the pipeline that checks every change.
        </p>
      </div>

      <h2>What happens to your process during a deploy</h2>
      <div className="prose">
        <p>
          A deploy starts new instances, waits until they are ready, moves traffic to them, then stops the old ones.
          "Stop" means a <strong>signal</strong>: the platform sends <code>SIGTERM</code>, waits for a grace period, and
          if the process is still alive, sends <code>SIGKILL</code>, which cannot be caught. Without a handler, Node exits
          immediately on <code>SIGTERM</code>, and every request in progress fails with a dropped connection. Do that on
          every deploy and users see errors several times a day.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Signal</th><th>Sent by</th><th>Can you handle it?</th></tr>
        </thead>
        <tbody>
          <tr><td><code>SIGTERM</code></td><td>Docker (<code>docker stop</code>), Kubernetes, systemd, most platforms</td><td>Yes: shut down gracefully</td></tr>
          <tr><td><code>SIGINT</code></td><td><kbd>Ctrl</kbd>+<kbd>C</kbd> in a terminal</td><td>Yes: treat it like SIGTERM</td></tr>
          <tr><td><code>SIGKILL</code></td><td>The platform, after the grace period (Docker 10 s, Kubernetes 30 s by default)</td><td>No: the process vanishes</td></tr>
        </tbody>
      </TableWrap>
      <Diagram spec={shutdownSequence} caption="The order matters: stop new work first, let current work finish, close the database last, and never take longer than the grace period." />

      <h2>Liveness and readiness</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>Liveness: <code>/health</code></th><th>Readiness: <code>/ready</code></th></tr>
        </thead>
        <tbody>
          <tr><td>Question</td><td>Is the process alive and responsive?</td><td>Should traffic be sent here right now?</td></tr>
          <tr><td>Checks</td><td>Nothing but itself</td><td>The database answers within a second; not shutting down</td></tr>
          <tr><td>When it fails, the platform…</td><td>Restarts the instance</td><td>Stops routing requests to it, without restarting it</td></tr>
          <tr><td>Fails when</td><td>The event loop is stuck or the process is wedged</td><td>The database is down, or shutdown has started</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="Never check dependencies in liveness">
        <p>
          If <code>/health</code> checked the database, a short database outage would make every instance fail its
          liveness probe at once, and the platform would restart them all, turning a blip into a full outage with cold
          starts. Readiness is where dependency checks belong: the instances stay up, stop taking traffic, and come back
          as soon as the database does.
        </p>
      </Box>

      <Step n={1}>Health probes</Step>
      <CodeFile path={`${P}/src/health.ts`} change="new" />
      <div className="prose">
        <p>
          <code>Lifecycle</code> is a tiny shared object: <code>server.ts</code> flips <code>shuttingDown</code>, and the
          readiness handler reads it. The database ping races a one-second timer, because a hung database is as bad as a
          down one and a probe that never answers helps nobody. The timer is <code>unref()</code>'d so it cannot keep the
          process alive.
        </p>
      </div>
      <CodeFile path={`${P}/src/app.ts`} change="updated" />
      <div className="prose">
        <p>
          Both new dependencies have defaults (never shutting down, a ping that always succeeds), so every existing test
          that calls <code>createApp</code> keeps working unchanged.
        </p>
      </div>
      <CodeFile path={`${P}/src/health.test.ts`} change="new" />

      <Step n={2}>Graceful shutdown</Step>
      <CodeFile path={`${P}/src/shutdown.ts`} change="new" />
      <div className="prose">
        <p>Line by line:</p>
        <ul>
          <li><strong><code>shutdown ??= …</code></strong> makes a second call return the first call's promise. Pressing <kbd>Ctrl</kbd>+<kbd>C</kbd> twice, or a platform repeating SIGTERM, must not start two shutdowns.</li>
          <li><strong><code>lifecycle.shuttingDown = true</code></strong> first, so <code>/ready</code> fails and load balancers stop sending new requests.</li>
          <li><strong>The deadline</strong> calls <code>closeAllConnections()</code>, cutting requests that are still running. It must fire before the platform's SIGKILL, so that the database is still closed cleanly.</li>
          <li><strong><code>server.close()</code></strong> stops accepting connections. Its callback runs when every open connection has ended.</li>
          <li>
            <strong>The sweep.</strong> HTTP keep-alive leaves connections open between requests. <code>close()</code>{' '}
            ends the ones idle at that moment, but a connection whose request finishes a moment later stays open until
            its keep-alive timeout. Testing this chapter measured the difference: without the sweep,{' '}
            <code>close()</code> took 3,259 ms to finish after a 300 ms request; closing idle connections every 100 ms
            brought it to 301 ms.
          </li>
          <li><strong><code>onClose</code></strong> runs last: the requests that just finished were still using the database.</li>
        </ul>
      </div>

      <Step n={3}>Wire it to the signals</Step>
      <CodeFile path={`${P}/src/server.ts`} change="updated" />
      <div className="prose">
        <p>
          The server object returned by <code>app.listen</code> is now kept, because shutdown needs it. The deadline is
          10 seconds, which fits inside Docker's default grace period only just; the third exercise makes it
          configurable. On success the process exits with code 0, which platforms read as a clean stop.
        </p>
      </div>

      <Step n={4}>Test it</Step>
      <CodeFile path={`${P}/src/test-helpers.ts`} change="updated" />
      <CodeFile path={`${P}/src/shutdown.test.ts`} change="new" />
      <div className="prose">
        <p>
          The first test is the important one: a request is inside a slow handler when shutdown starts. It must still get
          its 200, a new connection must be refused, and the database must close after the request, not before.
        </p>
      </div>
      <Terminal>{`node --test src/shutdown.test.ts src/health.test.ts`}</Terminal>
      <Output>{`
▶ health probes
  ✔ is live and ready when the database answers (31.112958ms)
  ✔ stays live but is not ready when the database is down (5.692375ms)
  ✔ is not ready once shutdown has started (3.634542ms)
  ✔ treats a database that hangs as not ready, within about a second (1006.275834ms)
✔ health probes (1047.762417ms)
▶ graceful shutdown
  ✔ lets in-flight requests finish, refuses new ones, then closes the database (425.766834ms)
  ✔ cuts connections that are still busy at the deadline (216.581125ms)
  ✔ runs only once, however many signals arrive (58.571583ms)
✔ graceful shutdown (701.895542ms)`}</Output>

      <Step n={5}>Prove it on the real server</Step>
      <div className="prose">
        <p>
          Sign-ups are slow on purpose (about 45 ms of scrypt each, four at a time on the thread pool), which makes them
          perfect for this. Start the server on Postgres, fire 20 sign-ups at once, and send SIGTERM while they are
          running:
        </p>
      </div>
      <Terminal>{`
node src/server.ts &          # with DATABASE_URL and JWT_SECRET set
PID=$!
for i in $(seq 1 20); do
  curl -s -o /dev/null -w '%{http_code}\\n' -X POST localhost:4000/auth/signup \\
    -H 'content-type: application/json' \\
    -d "{\\"email\\":\\"load$RANDOM$i@example.com\\",\\"password\\":\\"correct horse battery staple\\"}" >> codes.txt &
done
sleep 0.1 && kill -TERM $PID
wait $PID; echo "server exit code: $?"
wait; sort codes.txt | uniq -c
curl -s -o /dev/null -w 'after shutdown: %{http_code}\\n' localhost:4000/health`}</Terminal>
      <Output>{`
server exit code: 0
  20 201
after shutdown: 000

{"level":30,"time":"2026-10-12T07:37:30.253Z","service":"tasks-api","port":4000,"env":"development","store":"postgres","msg":"tasks API listening"}
{"level":30,"time":"2026-10-12T07:37:31.741Z","service":"tasks-api","reason":"SIGTERM","timeoutMs":10000,"msg":"shutting down"}
… 20 "request finished" lines, all with status 201 …
{"level":30,"time":"2026-10-12T07:37:31.944Z","service":"tasks-api","msg":"shutdown complete"}`}</Output>
      <div className="prose">
        <p>
          SIGTERM arrived while the sign-ups were being hashed. All 20 still got 201, the log shows every one of them
          finishing after <code>shutting down</code> and before <code>shutdown complete</code> (203 ms later), the
          process exited with 0, and the next connection was refused (curl reports <code>000</code>). With the signal
          handlers removed, the same test gave <code>20 000</code>: every request failed with a dropped connection, and
          the exit code was 143 (128 plus SIGTERM's number, 15), which platforms treat as killed.
        </p>
      </div>

      <h2>Running TypeScript in production</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>Run <code>.ts</code> directly (type stripping)</th><th>Compile to <code>dist/</code> with tsc</th></tr>
        </thead>
        <tbody>
          <tr><td>Build step</td><td>None</td><td><code>npm run build</code></td></tr>
          <tr><td>Startup on the test machine</td><td>136 ms to "listening" (median of 7)</td><td>95 ms</td></tr>
          <tr><td>Stack traces</td><td>Point at your <code>.ts</code> lines</td><td>Need <code>--enable-source-maps</code> and <code>.map</code> files</td></tr>
          <tr><td>Syntax</td><td>Erasable TypeScript only, Node 22.18 or later</td><td>Any TypeScript, any Node version you target</td></tr>
          <tr><td>Image contents</td><td>Source files</td><td>Compiled JavaScript only</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Both are legitimate on Node 24. Running the source is simpler and is what you have done all course. Compiling
          is still the default in most companies, gives slightly faster cold starts (useful when autoscaling), and keeps
          working if a dependency or teammate needs non-erasable syntax. This project compiles for its container and
          keeps <code>npm start</code> for running the source.
        </p>
      </div>

      <Step n={6}>A production build</Step>
      <CodeFile path={`${P}/tsconfig.build.json`} change="new" />
      <CodeFile path={`${P}/package.json`} change="updated" />
      <div className="prose">
        <p>
          The build config extends the normal one and changes only output: emit files into <code>dist/</code>, leave the
          tests out, and rewrite <code>'./app.ts'</code> imports to <code>'./app.js'</code> (TypeScript 5.7 added{' '}
          <code>rewriteRelativeImportExtensions</code> for exactly this style of project).
        </p>
      </div>
      <Terminal>{`
npm run build
head -3 dist/server.js
npm run start:prod`}</Terminal>
      <Output>{`
import { createApp } from './app.js';
import { AuthService } from './auth/service.js';
import { TokenService } from './auth/tokens.js';`}</Output>
      <div className="prose">
        <p>
          The imports now end in <code>.js</code>, and <code>import type</code> lines have disappeared entirely.{' '}
          <code>start:prod</code> runs the result with <code>--enable-source-maps</code>, so an error's stack trace
          still names <code>src/…ts</code> lines. Add <code>dist/</code> to <code>.gitignore</code> if it is not there
          already (it is in the chapter 03 template).
        </p>
      </div>

      <Step n={7}>Production installs</Step>
      <div className="prose">
        <p>
          <code>NODE_ENV=production</code> tells libraries to skip development conveniences (Express, for example,
          stops adding stack traces to its default error page), and this project's config reports it in the startup
          log. <code>npm ci</code> installs exactly what <code>package-lock.json</code> lists, deleting any existing{' '}
          <code>node_modules</code> first; <code>--omit=dev</code> leaves out TypeScript, type packages and{' '}
          <code>pino-pretty</code>. Here is the Dockerfile's runtime stage done by hand in an empty folder containing
          only <code>package.json</code>, <code>package-lock.json</code> and <code>dist/</code>:
        </p>
      </div>
      <Terminal>{`
npm ci --omit=dev
npm ls --omit=dev --depth=0
NODE_ENV=production node --enable-source-maps dist/server.js`}</Terminal>
      <Output>{`
added 94 packages, and audited 95 packages in 323ms

found 0 vulnerabilities
09-tasks-api@1.0.0
├── express@5.3.0
├── helmet@8.3.0
├── jose@6.2.12
├── pg@8.23.1
├── pino@10.4.0
└── zod@4.6.6

{"level":30,"time":"2026-10-12T07:38:11.394Z","service":"tasks-api","port":4013,"env":"production","store":"postgres","msg":"tasks API listening"}`}</Output>
      <div className="prose">
        <p>
          <code>node_modules</code> shrank from 50 MB to 15 MB, and the server answered <code>/ready</code> and a login
          from that folder. Fewer packages in production also means fewer packages that can carry a vulnerability.
        </p>
      </div>

      <Step n={8}>The Dockerfile</Step>
      <Box kind="warn" label="Built from the steps above, not by Docker">
        <p>
          This is the recommended Dockerfile for the project, written with care, but it was not built while this course
          was being tested: the test machine could not pull the <code>node:24-alpine</code> base image. Every command
          inside it was run by hand instead (<code>npm ci</code>, <code>npm run build</code>,{' '}
          <code>npm ci --omit=dev</code>, and starting <code>dist/server.js</code>, in steps 6 and 7), and the
          healthcheck's one-liner was run against a live server. Build it yourself with{' '}
          <code>docker build -t tasks-api .</code> and fix anything your Docker version reports.
        </p>
      </Box>
      <CodeFile path={`${P}/Dockerfile`} change="new" />
      <CodeFile path={`${P}/.dockerignore`} change="new" />
      <TableWrap>
        <thead>
          <tr><th>Choice</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td>Two stages</td><td>The build stage has TypeScript and every dev dependency; the final image gets only <code>dist/</code> and production packages. Smaller, faster to pull, less to attack.</td></tr>
          <tr><td>Package files copied first</td><td>Docker caches each step. Dependencies are reinstalled only when <code>package.json</code> or the lockfile change, not on every code edit.</td></tr>
          <tr><td><code>node:24-alpine</code></td><td>Node 24 on a minimal Linux. Pin the major version, the same one as <code>.node-version</code>.</td></tr>
          <tr><td><code>USER node</code></td><td>The official image ships an unprivileged user. A compromised process should not be root inside the container. (It also cannot write to <code>/app</code>, so the container needs <code>DATABASE_URL</code>; the SQLite fallback would fail to create <code>data/</code>.)</td></tr>
          <tr><td><code>HEALTHCHECK</code> on <code>/ready</code></td><td>Docker and Compose mark the container unhealthy when it stops being ready. Node's built-in <code>fetch</code> replaces curl, which the image does not include.</td></tr>
          <tr><td>Exec-form <code>CMD</code></td><td>Node becomes PID 1 and receives SIGTERM itself. Wrapping it in <code>npm start</code> or <code>sh -c</code> can swallow the signal, and the graceful shutdown never runs.</td></tr>
          <tr><td><code>.dockerignore</code></td><td>Keeps <code>node_modules</code>, <code>.env</code> secrets, local data and git history out of the build context and the image.</td></tr>
        </tbody>
      </TableWrap>

      <Step n={9}>The whole stack in Compose</Step>
      <CodeFile path={`${P}/compose.yaml`} change="updated" />
      <div className="prose">
        <p>
          The <code>app</code> service has a <strong>profile</strong>, so <code>npm run db:up</code> still starts only
          the database. Inside the Compose network, the app reaches Postgres by its service name, <code>db</code>, on
          port 5432; port 5440 is only for your laptop. <code>depends_on</code> with{' '}
          <code>condition: service_healthy</code> waits for <code>pg_isready</code>, and <code>restart: unless-stopped</code>{' '}
          brings the API back after a crash. Compose reads <code>JWT_SECRET</code> from your shell or from{' '}
          <code>.env</code>.
        </p>
      </div>
      <Terminal>{`
docker compose --profile app config --services   # check the file without starting anything
docker compose --profile app up --build`}</Terminal>
      <Output caption="docker compose --profile app config --services">{`
db
app`}</Output>
      <div className="prose">
        <p>The configuration was validated this way; running the stack needs the image from step 8.</p>
      </div>

      <Step n={10}>Continuous integration with GitHub Actions</Step>
      <CodeFile path="09-tasks-api.7-production/.github/workflows/ci.yml" change="new" />
      <div className="prose">
        <p>
          A <strong>workflow</strong> runs on GitHub's machines whenever its trigger fires: here, pushes to{' '}
          <code>main</code> and every pull request. The <code>services</code> block starts a Postgres container next to
          the job, with the same healthcheck as Compose, and <code>TEST_DATABASE_URL</code> switches the Postgres tests
          on. <code>setup-node</code> reads the Node version from <code>.node-version</code>, so CI, your laptop and the
          Dockerfile cannot drift apart, and caches npm's download cache between runs.
        </p>
        <p>
          The workflow assumes the project is the root of its repository. If it lives in a subfolder of a bigger repo,
          add <code>defaults: {'{ run: { working-directory: … } }'}</code> to the job and point{' '}
          <code>node-version-file</code> and <code>cache-dependency-path</code> at the subfolder.
        </p>
      </div>
      <Box kind="tip" label="How it was checked">
        <p>
          The YAML was parsed with the <code>yaml</code> package, and every step was run locally in a fresh copy of the
          project, with <code>TEST_DATABASE_URL</code> pointing at the Compose database as CI's service would be. The
          workflow itself has not run on GitHub; push the project and open the <em>Actions</em> tab to see it.
        </p>
      </Box>
      <Output caption="The workflow's steps, run locally">{`
$ npm ci
found 0 vulnerabilities
$ npm run typecheck
$ npm test
ℹ tests 84
ℹ pass 84
ℹ fail 0
ℹ skipped 0
$ npm run build
> tsc -p tsconfig.build.json`}</Output>

      <Step n={11}>Audit your dependencies</Step>
      <Terminal>{`
npm audit
npm audit --omit=dev`}</Terminal>
      <Output>{`
found 0 vulnerabilities
found 0 vulnerabilities`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Command or tool</th><th>Use</th></tr>
        </thead>
        <tbody>
          <tr><td><code>npm audit</code></td><td>Lists known vulnerabilities in the installed tree, with severity and the fixed version</td></tr>
          <tr><td><code>npm audit --omit=dev --audit-level=high</code></td><td>Only what ships, and only exits non-zero for high or critical: suitable for CI</td></tr>
          <tr><td><code>npm audit fix</code></td><td>Applies updates that stay within your semver ranges. Review the lockfile diff and run the tests</td></tr>
          <tr><td><code>npm outdated</code></td><td>Shows packages with newer versions, including major ones audit will not touch</td></tr>
          <tr><td>Dependabot or Renovate</td><td>Bots that open pull requests for updates; your CI then tells you whether each one is safe</td></tr>
        </tbody>
      </TableWrap>

      <h2>Logs, metrics and alerts</h2>
      <div className="prose">
        <p>
          Chapter 14 gave you structured logs on stdout; the platform collects them. Logs answer "what happened to this
          request". <strong>Metrics</strong> answer "how is the service doing overall", as numbers over time, and{' '}
          <strong>alerts</strong> wake someone up when those numbers go wrong. For a request-driven service, start with
          the RED method:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Signal</th><th>Measure</th><th>A sensible first alert</th></tr>
        </thead>
        <tbody>
          <tr><td><strong>R</strong>ate</td><td>Requests per second, per route</td><td>Traffic drops to near zero (something upstream broke)</td></tr>
          <tr><td><strong>E</strong>rrors</td><td>Share of 5xx responses</td><td>Above 1% for 5 minutes</td></tr>
          <tr><td><strong>D</strong>uration</td><td>Latency percentiles: p50, p95, p99</td><td>p95 above your target (say 300 ms) for 10 minutes</td></tr>
          <tr><td>Saturation</td><td>Event-loop delay (chapter 17), memory, pool usage, CPU</td><td>Event-loop p99 delay above 100 ms; memory climbing steadily</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Alert on symptoms users feel (errors, latency), not on every cause, or the alerts become noise. Common tools:
          OpenTelemetry to emit metrics and traces from Node, Prometheus and Grafana, or a hosted service such as
          Datadog, New Relic or your cloud's monitoring. Your access log already has the data for RED; the first step is
          often a dashboard built from it.
        </p>
      </div>

      <h2>Who restarts your process?</h2>
      <TableWrap>
        <thead>
          <tr><th>Option</th><th>Restarts on crash</th><th>Many instances</th><th>Typical use</th></tr>
        </thead>
        <tbody>
          <tr><td>PM2</td><td>Yes</td><td>Cluster mode on one machine</td><td>A single VM without containers</td></tr>
          <tr><td>systemd</td><td>Yes (<code>Restart=on-failure</code>)</td><td>One unit per instance</td><td>Linux servers you manage yourself</td></tr>
          <tr><td>Docker / Compose</td><td>Yes (<code>restart: unless-stopped</code>)</td><td>Several containers on one host</td><td>Small deployments, local stacks</td></tr>
          <tr><td>Kubernetes</td><td>Yes, plus liveness probes</td><td>Across many machines, with readiness-aware rollouts</td><td>Larger platforms</td></tr>
          <tr><td>Managed (Cloud Run, ECS/Fargate, App Runner, Fly.io, Render, Railway)</td><td>Yes</td><td>Autoscaling</td><td>Most teams that do not want to run Kubernetes</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          With containers, run <strong>one Node process per container</strong> and let the platform run more containers
          for more CPU. Node's <code>cluster</code> module and PM2's cluster mode solve the same problem on a single
          machine; doing both at once just makes failures harder to understand.
        </p>
      </div>

      <h2>A production readiness checklist</h2>
      <TableWrap>
        <thead>
          <tr><th>Item</th><th>Where you did it</th></tr>
        </thead>
        <tbody>
          <tr><td>Configuration from the environment, validated at startup</td><td>Chapter 14</td></tr>
          <tr><td>No secrets in code, git or images</td><td>Chapters 14, 15; <code>.dockerignore</code></td></tr>
          <tr><td>Structured logs to stdout with request ids; secrets redacted</td><td>Chapter 14</td></tr>
          <tr><td>Crash on programmer errors; a supervisor restarts the process</td><td>Chapter 14; Compose <code>restart</code></td></tr>
          <tr><td>Graceful shutdown within the platform's grace period</td><td>This chapter</td></tr>
          <tr><td>Liveness and readiness probes</td><td>This chapter</td></tr>
          <tr><td>Migrations run automatically and safely from several instances</td><td>Chapter 18</td></tr>
          <tr><td>A connection pool sized for the number of instances</td><td>Chapter 18</td></tr>
          <tr><td>Authentication, ownership checks, rate limits, security headers</td><td>Chapter 15</td></tr>
          <tr><td>Tests, including against the real database, on every push</td><td>Chapters 13, 18; this chapter's CI</td></tr>
          <tr><td>Reproducible builds: lockfile, <code>npm ci</code>, pinned Node and base image</td><td>This chapter</td></tr>
          <tr><td>Non-root container, production-only dependencies, audited</td><td>This chapter</td></tr>
          <tr><td>Metrics and alerts on errors, latency and saturation</td><td>This chapter (concepts); chapter 17 (event-loop delay)</td></tr>
          <tr><td>HTTPS in front, backups of the database</td><td>Your platform: a load balancer or proxy terminates TLS; managed databases back up for you</td></tr>
        </tbody>
      </TableWrap>

      <h2>The twelve factors, checked</h2>
      <div className="prose">
        <p>The twelve-factor app is a short, widely quoted list of habits for services that deploy cleanly. Here is how this project measures up:</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Factor</th><th>In this project</th></tr>
        </thead>
        <tbody>
          <tr><td>1. One codebase, many deploys</td><td>One repository; the same image runs everywhere</td></tr>
          <tr><td>2. Declare dependencies</td><td><code>package.json</code> and <code>package-lock.json</code></td></tr>
          <tr><td>3. Config in the environment</td><td><code>config.ts</code> reads <code>process.env</code> only</td></tr>
          <tr><td>4. Backing services as attached resources</td><td>The database is a URL; swapping it needs no code change</td></tr>
          <tr><td>5. Build, release, run</td><td>CI builds; the image plus its environment is a release; the platform runs it</td></tr>
          <tr><td>6. Stateless processes</td><td>No sessions in memory (JWTs); data lives in Postgres. The in-memory rate limiter is the one exception, noted in chapter 15</td></tr>
          <tr><td>7. Port binding</td><td>The app serves HTTP itself on <code>PORT</code></td></tr>
          <tr><td>8. Concurrency</td><td>Scale by running more instances</td></tr>
          <tr><td>9. Disposability</td><td>Fast startup, graceful shutdown</td></tr>
          <tr><td>10. Dev/prod parity</td><td>Same Node version, Postgres in Compose and in CI</td></tr>
          <tr><td>11. Logs as event streams</td><td>JSON lines on stdout</td></tr>
          <tr><td>12. Admin processes</td><td>Migrations run by the app itself; <code>db:seed</code> as a one-off script</td></tr>
        </tbody>
      </TableWrap>

      <Exercises
        items={[
          {
            task: <>Load balancers call <code>/health</code> and <code>/ready</code> every few seconds, which floods the access log. Log successful probe requests at <code>debug</code>, and keep everything else as it is. Prove it with a test.</>,
            hint: <>In <code>access-log.ts</code>, check <code>req.path</code> against a small <code>Set</code> when choosing the level. A failing probe should still log at <code>warn</code> or <code>error</code>. Capture lines with a logger destination, as chapter 14's tests do.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/middleware/access-log.ts`} />
                <CodeFile path={`${X}/src/middleware/access-log.test.ts`} />
              </>
            ),
          },
          {
            task: <>Make CI fail when a production dependency has a known high or critical vulnerability.</>,
            hint: <>One more <code>run</code> step after <code>npm ci</code>. Use <code>--omit=dev</code> so a vulnerable test tool does not block a release, and <code>--audit-level=high</code> so low-severity advisories do not either.</>,
            solution: (
              <CodeFile path="09-tasks-api.7-production.practice/.github/workflows/ci.yml" />
            ),
          },
          {
            task: <>Make the shutdown deadline configurable with <code>SHUTDOWN_TIMEOUT_MS</code>, defaulting to 8 seconds so it fits comfortably inside Docker's 10-second grace period.</>,
            hint: <>Add it to the config schema with <code>z.coerce.number()</code>, expose it as <code>shutdownTimeoutMs</code>, and pass it to <code>gracefulShutdown</code> in <code>server.ts</code>. Check the startup log: the <code>shutting down</code> line prints <code>timeoutMs</code>.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/config.ts`} />
                <Output caption="SHUTDOWN_TIMEOUT_MS=2500, then Ctrl+C">{`{"level":30,"time":"2026-10-12T07:40:19.906Z","service":"tasks-api","reason":"SIGTERM","timeoutMs":2500,"msg":"shutting down"}`}</Output>
              </>
            ),
          },
        ]}
      />

      <Checkpoint question="Your readiness probe checks the database. A teammate suggests making /health check it too, 'to be safe'. What goes wrong during a two-minute database outage?">
        <p>
          Every instance fails liveness at the same moment, so the platform restarts all of them, repeatedly, for as long
          as the database is down. Restarted instances run their migrations and warm up from cold, and in-flight requests
          are cut each time. When the database returns, you have a fleet of instances still in restart back-off instead
          of a fleet ready to serve. With readiness only, the instances stay up, stop receiving traffic, and resume the
          moment the database answers.
        </p>
      </Checkpoint>
      <Checkpoint question="The Dockerfile ends with CMD [&quot;npm&quot;, &quot;start&quot;] instead of CMD [&quot;node&quot;, &quot;--enable-source-maps&quot;, &quot;dist/server.js&quot;]. Deploys now show dropped requests and take 10 seconds per instance. Why?">
        <p>
          npm becomes PID 1 and runs node as its child. <code>docker stop</code> sends SIGTERM to PID 1, npm, which does
          not reliably pass it to node. The app never starts its graceful shutdown, so after the 10-second grace period
          Docker sends SIGKILL and everything in flight is cut. Exec-form <code>CMD</code> running <code>node</code>{' '}
          directly makes node PID 1, so it receives the signal itself.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Handle SIGTERM and SIGINT: fail readiness, stop accepting connections, let in-flight requests finish, close the database, exit 0, all before the grace period ends.</li>
          <li>Close idle keep-alive connections throughout shutdown, not just once, or <code>close()</code> waits for their timeouts.</li>
          <li>Liveness checks only the process; readiness checks dependencies and shutdown state.</li>
          <li>Run TypeScript directly or compile with <code>rewriteRelativeImportExtensions</code>; ship only production dependencies with <code>npm ci --omit=dev</code>.</li>
          <li>Build images in two stages, run as a non-root user, use exec-form <code>CMD</code>, and keep secrets out with <code>.dockerignore</code>.</li>
          <li>Let CI type-check, test against a real database, build and audit every change; watch rate, errors, duration and saturation.</li>
        </ul>
      </Recap>
    </>
  );
}
