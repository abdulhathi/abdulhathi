import { Code, Terminal } from '../components/Code';
import { Box, ChapterIntro, Recap, Step, TableWrap } from '../components/Content';

type Option = {
  name: string;
  repo: string;
  pitch: string;
  must: string[];
  stretch: string[];
  hard: string;
};

const OPTIONS: Option[] = [
  {
    name: 'A. Link shortener with analytics',
    repo: 'node-link-shortener',
    pitch: 'Turn long URLs into short codes, redirect visitors, and report who clicked what.',
    must: [
      'POST /links creates a short code for a URL (validated, per-user, optional custom alias)',
      'GET /:code redirects with 302 and records the click without slowing the redirect',
      'GET /links/:code/stats returns clicks per day and top referrers',
      'GET /links/:code/clicks.csv streams every click as CSV, however many there are',
      'Sign-up, login and ownership: users only see their own links',
    ],
    stretch: [
      'An in-memory LRU cache for hot codes, with hit-rate metrics',
      'Expiring links and a scheduled clean-up job',
      'QR code generation in a worker thread',
    ],
    hard: 'Recording clicks fast under load without losing them: batch inserts, and what happens on shutdown.',
  },
  {
    name: 'B. Background job runner',
    repo: 'node-job-runner',
    pitch: 'Accept slow jobs over HTTP, run them in the background, and report progress live.',
    must: [
      'POST /jobs queues a job (for example: hash a large file, resize an image, generate a report)',
      'Jobs run in a worker-thread pool sized to the machine; the API stays responsive',
      'GET /jobs/:id shows status, and GET /jobs/:id/events streams progress with Server-Sent Events',
      'Failed jobs retry with exponential backoff, then move to a failed state with the error',
      'Jobs survive a restart: they are stored in PostgreSQL and picked up again',
    ],
    stretch: [
      'Several runner processes sharing one queue with SELECT … FOR UPDATE SKIP LOCKED',
      'Cancelling a running job with AbortController',
      'Hand the queue to RabbitMQ, using your ShopFlow lab',
    ],
    hard: 'Exactly what happens to a job that is half done when the process is killed.',
  },
  {
    name: 'C. Event ticketing API',
    repo: 'node-ticketing-api',
    pitch: 'Sell a limited number of seats for events without ever overselling.',
    must: [
      'Organisers create events with a seat count; customers list and search events',
      'POST /events/:id/reservations holds seats for 10 minutes; confirming turns them into tickets',
      'Two customers racing for the last seat: exactly one wins (prove it with a test)',
      'Idempotency-Key header on reservation and confirmation, so retries never double-book',
      'Expired holds are released automatically',
    ],
    stretch: [
      'A waiting list that is offered released seats in order',
      'Email confirmations sent from a background job, with a fake mail transport in tests',
      'An admin report streamed as CSV',
    ],
    hard: 'Concurrency in the database: transactions, row locks, and a test that fires 50 requests at once.',
  },
];

const RUBRIC: [string, string, string, string][] = [
  ['Structure', 'Everything in a few big files', 'Routes, service and repository are separate', 'Dependencies are injected; any layer can be tested alone'],
  ['Validation', 'Trusts the request body', 'Every input checked with Zod', 'Typed end to end; clear 400 errors with field details'],
  ['Errors', 'Stack traces reach the client', 'One error middleware, sensible status codes', 'Operational vs programmer errors; crashes restart cleanly'],
  ['Data', 'In memory', 'PostgreSQL with migrations', 'Transactions where needed; indexes justified by queries'],
  ['Tests', 'A few manual curl calls', 'Unit and HTTP tests in CI', 'Coverage above 80%, race conditions tested'],
  ['Security', 'Plain-text secrets', 'Hashed passwords, JWT, helmet, rate limits', 'Threat list in the README, dependency audit in CI'],
  ['Operations', 'Runs on my machine', 'Docker, health checks, graceful shutdown', 'Structured logs with request ids, documented load-test numbers'],
  ['Communication', 'No README', 'README with setup and API examples', 'Architecture diagram, decision log, what you would do next'],
];

export function Capstone() {
  return (
    <>
      <ChapterIntro
        time="20–40 hours, over two to four weeks"
        learn={[
          'Turn a vague idea into requirements and a design you can defend',
          'Plan the work as milestones that each end in something runnable',
          'Apply every chapter without step-by-step instructions',
          'Present the result so a reviewer understands it in five minutes',
        ]}
        tools={[
          { name: 'Everything so far', what: 'Express 5, Zod, PostgreSQL, node:test, pino, jose, worker threads, streams, Docker, GitHub Actions.' },
          { name: 'GitHub', what: 'A public repository, issues for milestones, Actions for CI.' },
        ]}
      />

      <div className="prose">
        <p>
          Until now every chapter told you what to type. This one does not. You get a brief, a list of requirements and
          a way to check your work, and you make every decision yourself. That is the skill employers are actually
          hiring for, and it is the project you will talk about in interviews.
        </p>
      </div>

      <h2>Pick one brief</h2>
      <div className="prose">
        <p>
          All three use the same foundations. Pick the one you would most enjoy explaining. Each has one{' '}
          <strong>hard part</strong>: that is the section of your README and the story you tell in an interview.
        </p>
      </div>
      {OPTIONS.map((o) => (
        <section key={o.repo} className="box tip capstone-option" aria-label={o.name}>
          <h3>{o.name}</h3>
          <p>{o.pitch} Suggested repository name: <code>{o.repo}</code>.</p>
          <p><strong>Must have</strong></p>
          <ul>{o.must.map((m) => <li key={m}>{m}</li>)}</ul>
          <p><strong>Stretch goals</strong></p>
          <ul>{o.stretch.map((s) => <li key={s}>{s}</li>)}</ul>
          <p><strong>The hard part:</strong> {o.hard}</p>
        </section>
      ))}
      <Box kind="tip" label="Your own idea">
        <p>
          You can bring your own idea instead, as long as it needs persistence, authentication, at least one streaming or
          background-work feature, and something that can go wrong under concurrency. Something from your day job,
          rebuilt without confidential details, makes an especially good story.
        </p>
      </Box>

      <h2>Milestones</h2>
      <div className="prose">
        <p>
          Create one GitHub issue per milestone and close it with a pull request, even though you work alone. The
          history shows a reviewer how you work, not just what you made.
        </p>
      </div>
      <Step n={1}>Write a one-page design (chapters 11, 12)</Step>
      <div className="prose">
        <p>
          Before any code, write <code>docs/design.md</code>: the endpoints with example requests and responses, the
          database tables, and the hard part with two ways to solve it and why you chose one. Keep it to a page. You
          will change it, and that is fine: update it as you go.
        </p>
      </div>
      <Step n={2}>Skeleton, CI and Docker from day one (chapters 03, 13, 19)</Step>
      <div className="prose">
        <p>
          Start from your tasks API layout: <code>createApp(deps)</code>, a health check, one test, the{' '}
          <code>typecheck</code> and <code>test</code> scripts, the GitHub Actions workflow and the Docker Compose file
          with PostgreSQL. Push it. From now on every push is checked automatically, so problems surface the day you
          cause them.
        </p>
      </div>
      <Step n={3}>The core feature, end to end (chapters 11, 12, 18)</Step>
      <div className="prose">
        <p>
          Build the main flow (create a link, queue a job, reserve a seat) through every layer, with validation,
          migrations and HTTP tests. Resist adding a second feature until the first one is tested.
        </p>
      </div>
      <Step n={4}>Users and security (chapter 15)</Step>
      <div className="prose">
        <p>
          Add sign-up, login, JWTs and ownership checks. Write the test that proves user B cannot see user A's data.
          Add helmet, rate limiting and an <code>npm audit</code> step in CI.
        </p>
      </div>
      <Step n={5}>The hard part (chapters 06, 07, 09, 16)</Step>
      <div className="prose">
        <p>
          Streaming CSV, the worker pool, or the race for the last seat. Write the failing test first: a test that
          fires many requests at once and checks the invariant (no lost clicks, no stuck jobs, no oversold seats).
          Then make it pass.
        </p>
      </div>
      <Step n={6}>Observability and performance (chapters 14, 17)</Step>
      <div className="prose">
        <p>
          Structured logs with request ids everywhere. Then run a load test against the Docker setup, record requests
          per second and p95 latency in the README, find the slowest part with a CPU profile, improve it, and record
          the new numbers. Before-and-after numbers are far more convincing than "optimised for performance".
        </p>
      </div>
      <Step n={7}>Ship and present (chapter 19)</Step>
      <div className="prose">
        <p>
          Graceful shutdown, readiness checks, and a production Docker image. Deploy it somewhere free if you can (a
          container platform's free tier is enough), and finish the README.
        </p>
      </div>

      <h2>Definition of done</h2>
      <Code title="docs/checklist.md" lang="markdown">{`
- [ ] \`npm run typecheck\` and \`npm test\` pass locally and in GitHub Actions
- [ ] \`docker compose up\` starts the API and PostgreSQL with no other setup
- [ ] Every input is validated; invalid requests get a 400 with field-level details
- [ ] Passwords are hashed; secrets come from the environment; nothing secret is logged
- [ ] A test proves one user cannot read or change another user's data
- [ ] A test proves the hard part's invariant under concurrent requests
- [ ] Logs are JSON with a request id on every line
- [ ] SIGTERM drains in-flight requests and closes the database pool
- [ ] Coverage is above 80% (\`npm run test:coverage\`)
- [ ] README: what it does, how to run it, API examples, architecture, the hard part, load-test numbers`}</Code>

      <h2>Score yourself</h2>
      <div className="prose">
        <p>Aim for the middle column everywhere and the right-hand column in two or three rows you care about.</p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Area</th><th>Getting there</th><th>Solid</th><th>Excellent</th></tr>
        </thead>
        <tbody>
          {RUBRIC.map(([area, a, b, c]) => (
            <tr key={area}><td>{area}</td><td>{a}</td><td>{b}</td><td>{c}</td></tr>
          ))}
        </tbody>
      </TableWrap>

      <h2>A README that sells the work</h2>
      <div className="prose">
        <p>
          Reviewers give a repository about five minutes. Put the answer to "what is this and is it any good?" at the
          top, and the detail underneath. Adapt this outline:
        </p>
      </div>
      <Code title="README.md (outline)" lang="markdown">{`
# node-ticketing-api

Sells a fixed number of seats per event without overselling, even when hundreds
of customers try to book the last seat at the same moment.

![CI](https://github.com/<you>/node-ticketing-api/actions/workflows/ci.yml/badge.svg)

## Run it
    docker compose up
    curl http://localhost:4000/health

## API
| Method | Path | What it does |
|---|---|---|
| POST | /events/:id/reservations | Hold seats for 10 minutes (Idempotency-Key supported) |
| ... | ... | ... |

## Architecture
Diagram: routes -> service -> repository -> PostgreSQL. Why each layer exists.

## The hard part: never oversell
The race, the two designs I considered, the one I chose, and the test that proves it.

## Numbers
Load test: <req/s>, p95 <ms> on <machine> (method and script in docs/load-test.md).

## What I would do next
Honest limitations and the next three improvements.`}</Code>

      <h2>Tell the story</h2>
      <div className="prose">
        <p>
          In an interview you will be asked to walk through the project. Practise answering these out loud, with your
          own code open:
        </p>
        <ul>
          <li>Walk me through a request from the moment it reaches Node to the moment the response leaves.</li>
          <li>What was the hardest bug, and how did you find it?</li>
          <li>What happens if the database is slow? If it is down? If the process is killed mid-request?</li>
          <li>How would you run three copies of this service? What breaks?</li>
          <li>What would you change if you started again?</li>
        </ul>
        <p>Appendix C has more questions on every topic, with model answers.</p>
      </div>

      <h2>Where to go next</h2>
      <TableWrap>
        <thead>
          <tr><th>Direction</th><th>Why</th></tr>
        </thead>
        <tbody>
          <tr><td>Fastify or NestJS</td><td>Fastify for raw speed and schema-first routes; NestJS for large teams that want structure and dependency injection built in.</td></tr>
          <tr><td>Messaging</td><td>Your RabbitMQ ShopFlow lab in this portfolio pairs naturally with option B.</td></tr>
          <tr><td>Kubernetes</td><td>Deploy the capstone's Docker image to AKS, using the AKS material in this portfolio.</td></tr>
          <tr><td>OpenTelemetry</td><td>Traces and metrics across services, the next step after structured logs.</td></tr>
          <tr><td>GraphQL or tRPC</td><td>Alternative API styles, useful when the frontend team needs flexible queries or shared types.</td></tr>
        </tbody>
      </TableWrap>

      <Terminal title="Start">{`
mkdir ~/Developer/node-ticketing-api && cd ~/Developer/node-ticketing-api
git init
# copy package.json, tsconfig.json, .gitignore, .node-version from projects/09-tasks-api
# then write docs/design.md before anything else`}</Terminal>

      <Recap>
        <ul>
          <li>Pick a brief with one genuinely hard part, and make that part the centre of your README and your interview story.</li>
          <li>Work in milestones that each end in something tested and runnable, with CI from the first push.</li>
          <li>Prove claims with tests and numbers: an invariant test for the hard part, coverage, and before-and-after load-test results.</li>
          <li>A short design document and an honest "what I would do next" section show judgement, which matters more than feature count.</li>
        </ul>
      </Recap>
    </>
  );
}
