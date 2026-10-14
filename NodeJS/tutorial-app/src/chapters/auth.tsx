import { Code, CodeFile, Terminal } from '../components/Code';
import { Box, ChapterIntro, Checkpoint, Exercises, Output, Recap, Step, TableWrap } from '../components/Content';
import { Diagram } from '../diagrams/Diagram';
import { jwtFlow } from '../diagrams/specs/api';

const P = '09-tasks-api.5-auth';
const X = '09-tasks-api.5-auth.practice';

export function Auth() {
  return (
    <>
      <ChapterIntro
        time="3–3.5 hours"
        project="09-tasks-api"
        learn={[
          'The difference between authentication and authorisation',
          'Storing passwords properly: salts, slow hashes, scrypt and constant-time comparison',
          'Sessions versus tokens, how a JWT is built, and the mistakes that make JWTs insecure',
          'An auth middleware that puts the user on res.locals, with types',
          'Giving every user their own data, enforced in every query',
          'Security headers with helmet, rate limiting, CORS, and a checklist of the common holes',
        ]}
        tools={[
          { name: 'node:crypto', what: 'scrypt for password hashing, randomBytes for salts, timingSafeEqual for comparison.' },
          { name: 'jose', what: 'Standards-compliant JSON Web Tokens, built on Web Crypto, no native code.' },
          { name: 'helmet', what: 'Sets a dozen security-related response headers in one line.' },
          { name: 'rate-limit.ts', what: 'A small rate limiter you write yourself, to see how they work.' },
        ]}
      />

      <div className="prose">
        <p>
          Right now anyone who can reach the API can read and delete every task. This chapter adds accounts, and makes
          each task belong to one user. Security is a field where small mistakes matter and plausible-looking code is
          often wrong, so the chapter explains <em>why</em> each choice is made, and the tests check the attacks, not
          just the happy path.
        </p>
      </div>

      <h2>Who are you, and what may you do?</h2>
      <TableWrap>
        <thead>
          <tr><th></th><th>Authentication</th><th>Authorisation</th></tr>
        </thead>
        <tbody>
          <tr><td>Question</td><td>Who is making this request?</td><td>Is this user allowed to do this?</td></tr>
          <tr><td>Failure status</td><td>401 Unauthorized (despite the name, it means "not authenticated")</td><td>403 Forbidden, or 404 to hide that the thing exists</td></tr>
          <tr><td>In this chapter</td><td>Sign-up, login, a token on every request</td><td>Only the owner of a task can see or change it</td></tr>
        </tbody>
      </TableWrap>

      <h2>Storing passwords</h2>
      <div className="prose">
        <p>
          Assume the database will leak one day: a backup left public, a SQL injection, a stolen laptop. Password storage
          is about what an attacker can do with the file. Users reuse passwords, so a leaked password often opens their
          email and bank too.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Stored as</th><th>What a thief does</th></tr>
        </thead>
        <tbody>
          <tr><td>Plain text</td><td>Reads them. Game over.</td></tr>
          <tr><td>Encrypted</td><td>Steals the key from the same server, then reads them.</td></tr>
          <tr><td><code>sha256(password)</code></td><td>Looks hashes up in precomputed tables, and computes billions of guesses per second on a GPU. Equal passwords have equal hashes, so one crack reveals everyone using it.</td></tr>
          <tr><td><code>sha256(salt + password)</code></td><td>Precomputed tables are useless and equal passwords look different, but guessing is still billions per second, per hash.</td></tr>
          <tr><td><strong>scrypt / Argon2id / bcrypt with a salt</strong></td><td>Each guess costs tens of milliseconds and, for scrypt and Argon2, megabytes of memory. GPUs lose most of their advantage. Weak passwords still fall; strong ones survive.</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          A <strong>salt</strong> is a random value stored next to each hash and mixed into it. A{' '}
          <strong>password hashing function</strong> (or key derivation function) is designed to be slow, with a cost
          you can raise as hardware gets faster. Fast hashes such as SHA-256 are excellent for checking file integrity
          and terrible for passwords, precisely because they are fast. Node ships <code>scrypt</code> in{' '}
          <code>node:crypto</code>; Argon2id, the current first choice, needs a native npm package. scrypt is a
          perfectly good option, and its cost is one number, <code>N</code>:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>N</th><th>Memory per hash</th><th>Time on the test machine</th></tr>
        </thead>
        <tbody>
          <tr><td>2<sup>14</sup></td><td>16 MiB</td><td>23 ms</td></tr>
          <tr><td><strong>2<sup>15</sup> (this project)</strong></td><td>32 MiB</td><td>44 ms</td></tr>
          <tr><td>2<sup>16</sup></td><td>64 MiB</td><td>93 ms</td></tr>
          <tr><td>2<sup>17</sup> (OWASP's recommended minimum)</td><td>128 MiB</td><td>221 ms</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Higher is safer, but every login pays the cost, and an attacker who floods your login endpoint makes you pay it
          many times over (the rate limiter below helps). This project uses 2<sup>15</sup> so the tests stay quick;
          a production service should measure on its own hardware and pick the highest cost it can afford, aiming
          for at least OWASP's figure. Because the parameters are stored inside each hash, you can raise them later and
          re-hash each user's password at their next login.
        </p>
      </div>

      <h2>Sessions or tokens</h2>
      <div className="prose">
        <p>
          HTTP is stateless: after login, every request must prove again who sent it. There are two families of
          solution.
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th></th><th>Server sessions</th><th>Signed tokens (JWT)</th></tr>
        </thead>
        <tbody>
          <tr><td>The client holds</td><td>A random session id, usually in a cookie</td><td>A token containing the user id, signed by the server</td></tr>
          <tr><td>The server checks</td><td>Looks the id up in a session store (database, Redis)</td><td>Verifies the signature with its key; no lookup</td></tr>
          <tr><td>Log out or ban now</td><td>Delete the session: instant</td><td>Hard: the token stays valid until it expires</td></tr>
          <tr><td>Several servers</td><td>All need the shared session store</td><td>All need only the key</td></tr>
          <tr><td>Typical use</td><td>Server-rendered websites</td><td>APIs used by mobile apps, SPAs and other services</td></tr>
        </tbody>
      </TableWrap>
      <div className="prose">
        <p>
          Both are respectable; the trade-off is revocation against statelessness. This API uses JWTs because they are
          what you will meet in most API job descriptions. A <strong>JSON Web Token</strong> is three base64url parts
          joined by dots: a header naming the algorithm, a payload of <strong>claims</strong>, and a signature over both.
          Here is a real one from this chapter, with its payload decoded:
        </p>
      </div>
      <Output caption="A token, and its middle part decoded">{`
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJiZGI2OWI2ZC04MWMxLTQ1MGUtYjVmZC1hYWRkYTAyZjMwZjUiLCJpc3MiOiJ0YXNrcy1hcGkiLCJpYXQiOjE3OTE3ODk1MzksImV4cCI6MTc5MTc5MzEzOX0.1X2RtJB7SckQMIt0ROHTA67aHl0_WYLTTFYg-WcvipM

{"sub":"bdb69b6d-81c1-450e-b5fd-aadda02f30f5","iss":"tasks-api","iat":1791789539,"exp":1791793139}`}</Output>
      <TableWrap>
        <thead>
          <tr><th>Claim</th><th>Meaning</th></tr>
        </thead>
        <tbody>
          <tr><td><code>sub</code></td><td>Subject: the user id</td></tr>
          <tr><td><code>iss</code></td><td>Issuer: who created the token</td></tr>
          <tr><td><code>iat</code>, <code>exp</code></td><td>Issued at, expires at, in seconds since 1970. One hour apart here.</td></tr>
        </tbody>
      </TableWrap>
      <Box kind="warn" label="JWT mistakes that become breaches">
        <ul>
          <li><strong>The payload is not encrypted.</strong> Anyone can decode it, as above. Never put secrets or personal data in it.</li>
          <li><strong>Pin the algorithm.</strong> Old libraries trusted the header's <code>alg</code>, including <code>none</code>. Always tell the verifier which algorithms are acceptable.</li>
          <li><strong>Use a long random secret.</strong> HS256 secrets can be brute-forced offline from any token. 32 random bytes, from config, never from code.</li>
          <li><strong>Keep lifetimes short.</strong> A stolen token works until <code>exp</code>. Real systems pair a short-lived access token with a revocable refresh token.</li>
          <li><strong>Mind where browsers keep it.</strong> <code>localStorage</code> is readable by any script that runs on your page (an XSS bug); an <code>httpOnly</code> cookie is not, but then you must defend against CSRF.</li>
        </ul>
      </Box>
      <Diagram spec={jwtFlow} caption="Login once, then send the token with every request. Any failure in requireAuth (no token, bad signature, expired) is a 401 before your route code runs." />

      <h2>Authorisation by ownership</h2>
      <div className="prose">
        <p>
          The rule is simple, "users see only their own tasks", but where you enforce it matters. Checking ownership in
          each route is one forgotten <code>if</code> away from a breach (OWASP's number one risk, broken access control,
          is exactly this). Instead, every repository method takes the user id and puts it in the <code>WHERE</code>{' '}
          clause. A query that does not mention the owner cannot be written by accident, and the contract tests check
          every implementation obeys.
        </p>
        <p>
          When Bob asks for Ada's task, the answer is <strong>404, not 403</strong>. A 403 would confirm the id exists,
          which leaks information (and lets an attacker enumerate ids). From Bob's point of view, a task he cannot see
          does not exist.
        </p>
      </div>

      <Step n={1}>Install the packages</Step>
      <Terminal>{`npm install jose helmet`}</Terminal>
      <CodeFile path={`${P}/package.json`} change="updated" />

      <Step n={2}>Configuration: the signing secret</Step>
      <CodeFile path={`${P}/src/config.ts`} change="updated" />
      <div className="prose">
        <p>
          <code>JWT_SECRET</code> has no default on purpose: a default would end up in production. Generate one and add
          both new variables to your <code>.env</code>:
        </p>
      </div>
      <Terminal>{`node -p "crypto.randomBytes(32).toString('base64url')"`}</Terminal>
      <Code title=".env.example" lang="ini">{`
# Copy this file to .env for local settings. .env is in .gitignore; never commit it.
# Real environment variables win over values in .env.
NODE_ENV=development
PORT=4000
DB_FILE=data/tasks.db
LOG_LEVEL=debug
# Generate your own: node -p "crypto.randomBytes(32).toString('base64url')"
JWT_SECRET=replace-me-with-the-output-of-the-command-above
TOKEN_TTL=1h`}</Code>
      <CodeFile path={`${P}/src/config.test.ts`} change="updated" />
      <div className="prose">
        <p>Without the secret, the server now refuses to start:</p>
      </div>
      <Output caption="npm start with no JWT_SECRET">{`
Invalid configuration:
✖ Invalid input: expected string, received undefined
  → at JWT_SECRET`}</Output>

      <Step n={3}>Migration 2: users and owners</Step>
      <CodeFile path={`${P}/src/db/migrations.ts`} change="updated" />
      <div className="prose">
        <p>
          Migration 1 is untouched; migration 2 is appended. <code>COLLATE NOCASE</code> makes the <code>UNIQUE</code>{' '}
          check and lookups ignore case, so <code>Ada@example.com</code> and <code>ada@example.com</code> are one account.{' '}
          <code>REFERENCES users (id)</code> is a foreign key: SQLite refuses a task whose owner does not exist (because
          <code> foreign_keys = ON</code> from chapter 12), and <code>ON DELETE CASCADE</code> deletes a user's tasks with
          the user. Tasks from earlier chapters get <code>user_id = NULL</code> and become invisible; delete{' '}
          <code>data/</code> if you prefer a clean start. The chapter 12 seed script still runs, but its rows have no
          owner either, so they never appear in anyone's list.
        </p>
      </div>

      <Step n={4}>Two new errors</Step>
      <CodeFile path={`${P}/src/errors.ts`} change="updated" />

      <Step n={5}>Users</Step>
      <CodeFile path={`${P}/src/users/user.ts`} change="new" />
      <div className="prose">
        <p>
          <code>PublicUser</code> and <code>toPublicUser</code> exist so the hash can never be sent by accident: every
          response goes through them. Emails are trimmed and lower-cased before validation, which is why the schema is{' '}
          <code>z.string().trim().toLowerCase().pipe(z.email())</code>: <code>z.email().trim()</code> would validate the
          untrimmed text first and reject <code>" ada@example.com"</code>. Passwords need 12 characters and no other rules;
          NIST's guidance favours length over forced symbols. Login uses a looser schema, so tightening the sign-up rule
          later cannot lock anyone out.
        </p>
      </div>
      <CodeFile path={`${P}/src/users/repository.ts`} change="new" />
      <CodeFile path={`${P}/src/users/memory-repository.ts`} change="new" />
      <CodeFile path={`${P}/src/users/sqlite-repository.ts`} change="new" />
      <div className="prose">
        <p>
          Checking "does this email exist?" before inserting has a race: two sign-ups for the same email at the same
          moment can both pass the check. The database's <code>UNIQUE</code> constraint cannot be raced, so the
          repository just inserts and translates SQLite's unique-violation code (2067) into a{' '}
          <code>ConflictError</code>.
        </p>
      </div>

      <Step n={6}>Hashing passwords</Step>
      <CodeFile path={`${P}/src/auth/password.ts`} change="new" />
      <div className="prose">
        <p>The details that matter:</p>
        <ul>
          <li><strong>Callback scrypt, not scryptSync.</strong> The async version runs on libuv's thread pool (chapter 07), so 44 ms of hashing does not freeze every other request. The pool has four threads by default, which also caps how many hashes run at once.</li>
          <li><strong><code>maxmem</code>.</strong> Node refuses scrypt jobs over 32 MiB by default; at N = 2<sup>15</sup> and r = 8 the job needs 128 × N × r = 32 MiB plus a little working space, just over the limit, so the limit is raised explicitly.</li>
          <li><strong>A self-describing format.</strong> <code>scrypt$32768$8$1$salt$hash</code> keeps the parameters with each hash, so changing them later does not break old accounts.</li>
          <li><strong><code>timingSafeEqual</code>.</strong> A normal comparison stops at the first different byte, so how long it takes leaks how many bytes matched. This one always compares every byte.</li>
        </ul>
      </div>
      <CodeFile path={`${P}/src/auth/password.test.ts`} change="new" />

      <Step n={7}>Signing and verifying tokens</Step>
      <CodeFile path={`${P}/src/auth/tokens.ts`} change="new" />
      <div className="prose">
        <p>
          <code>jwtVerify</code> checks the signature, the expiry and the issuer, and only accepts <code>HS256</code>.
          Every jose error becomes a 401; anything else is rethrown, because it is a bug, not a bad token. The test file
          uses <code>mock.timers</code> to jump past the expiry instead of waiting an hour, and builds a forged token to
          prove the signature check works:
        </p>
      </div>
      <CodeFile path={`${P}/src/auth/tokens.test.ts`} change="new" />

      <Step n={8}>The auth service</Step>
      <CodeFile path={`${P}/src/auth/service.ts`} change="new" />
      <div className="prose">
        <p>
          Look at <code>logIn</code>. If the email is unknown, it still verifies the password against a dummy hash before
          failing. Without that, unknown emails would be answered in 1 ms and known ones in 44 ms, and an attacker could
          use the timing to discover who has an account. For the same reason both failures share one message. (Sign-up
          still reveals that an email is taken; most products accept that, and the rate limiter slows abuse.)
        </p>
      </div>

      <Step n={9}>The middleware and the auth routes</Step>
      <CodeFile path={`${P}/src/auth/middleware.ts`} change="new" />
      <div className="prose">
        <p>
          <code>declare global {'{ namespace Express { interface Locals { … } } }'}</code> merges a field into Express's own
          type for <code>res.locals</code>, so <code>res.locals.userId</code> is typed everywhere. It is a{' '}
          <code>declare</code> block, pure type information, so Node's type stripping removes it like any other type.
        </p>
        <p>
          <code>userIdOf</code> turns "maybe a string" into "definitely a string" for handlers. If it is ever called on a
          route without <code>requireAuth</code>, that is a routing bug, so it throws a plain <code>Error</code>, which
          becomes a 500 and an <code>error</code> log line, rather than a misleading 401.
        </p>
      </div>
      <CodeFile path={`${P}/src/auth/routes.ts`} change="new" />

      <Step n={10}>Ownership through every layer</Step>
      <div className="prose">
        <p>
          Each task gains a <code>userId</code>, and the user id becomes the first argument of every repository and
          service method. The changes are mechanical but touch six files; each is shown in full.
        </p>
      </div>
      <CodeFile path={`${P}/src/tasks/task.ts`} change="updated" />
      <CodeFile path={`${P}/src/tasks/repository.ts`} change="updated" />
      <CodeFile path={`${P}/src/tasks/memory-repository.ts`} change="updated" />
      <CodeFile path={`${P}/src/tasks/sqlite-repository.ts`} change="updated" />
      <CodeFile path={`${P}/src/tasks/service.ts`} change="updated" />
      <CodeFile path={`${P}/src/tasks/routes.ts`} change="updated" />
      <div className="prose">
        <p>
          Notice that <code>update</code> and <code>delete</code> include <code>user_id</code> in their{' '}
          <code>WHERE</code> clause too, even though the service already fetched the task as that user. Defence in depth:
          if a future code path forgets the check, the database still refuses.
        </p>
      </div>

      <Step n={11}>A rate limiter</Step>
      <CodeFile path={`${P}/src/middleware/rate-limit.ts`} change="new" />
      <div className="prose">
        <p>
          A fixed-window limiter: count requests per key (the client's IP) in windows of <code>windowMs</code>, reject
          once the count passes <code>max</code>, and tell the client when to come back with <code>Retry-After</code>.
          The cleanup timer is <code>unref()</code>'d: a referenced timer would keep Node alive forever, so tests and
          shutdown would hang.
        </p>
      </div>
      <Box kind="warn" label="Limits of an in-memory limiter">
        <ul>
          <li><strong>Several instances</strong> each count separately, so the real limit is <code>max</code> times the number of instances. Production limiters keep counters in Redis or at the load balancer.</li>
          <li><strong>Behind a proxy</strong>, every request appears to come from the proxy's IP, so one user can lock out everyone. Set <code>app.set('trust proxy', 1)</code> when exactly one trusted proxy sits in front, so <code>req.ip</code> comes from <code>X-Forwarded-For</code>.</li>
          <li><strong>Restarting</strong> resets every counter.</li>
        </ul>
        <p>Libraries such as <code>express-rate-limit</code> handle these cases; writing one first shows what they do.</p>
      </Box>

      <Step n={12}>Wire it together</Step>
      <CodeFile path={`${P}/src/app.ts`} change="updated" />
      <CodeFile path={`${P}/src/server.ts`} change="updated" />
      <div className="prose">
        <p>
          <code>requireAuth(tokens)</code> sits in front of the whole tasks router, so no task route can be reached
          without a valid token. <code>helmet()</code> replaces <code>app.disable('x-powered-by')</code>: it removes that
          header and adds a set of protective ones. For a JSON API, the headers that matter most are:
        </p>
      </div>
      <TableWrap>
        <thead>
          <tr><th>Header</th><th>Protects against</th></tr>
        </thead>
        <tbody>
          <tr><td><code>Strict-Transport-Security</code></td><td>Browsers downgrading to plain HTTP after their first HTTPS visit</td></tr>
          <tr><td><code>X-Content-Type-Options: nosniff</code></td><td>Browsers guessing a response is HTML or script when it is JSON</td></tr>
          <tr><td><code>Content-Security-Policy</code></td><td>Injected scripts running if a response is ever rendered as a page</td></tr>
          <tr><td><code>X-Frame-Options</code>, <code>Cross-Origin-*-Policy</code></td><td>Embedding your responses in other sites' pages</td></tr>
          <tr><td>No <code>X-Powered-By</code></td><td>Advertising your framework to people scanning for known holes</td></tr>
        </tbody>
      </TableWrap>

      <Step n={13}>Tests for the attacks, not just the happy path</Step>
      <CodeFile path={`${P}/src/test-helpers.ts`} change="updated" />
      <div className="prose">
        <p>
          <code>createTestApp</code> builds the real app on a fresh in-memory database, with a generous login limit so
          ordinary tests never trip it. <code>signUp</code> creates an account with a random email and returns its
          token.
        </p>
      </div>
      <CodeFile path={`${P}/src/tasks/repository-contract.ts`} change="updated" />
      <CodeFile path={`${P}/src/tasks/sqlite-repository.test.ts`} change="updated" />
      <div className="prose">
        <p>
          The contract gains an isolation test, including an <code>update</code> that tries to hijack Ada's task by
          claiming it for Bob. The SQLite factory must create the two owners first: with foreign keys on, inserting a
          task for a user who does not exist fails.
        </p>
      </div>
      <CodeFile path={`${P}/src/tasks/service.test.ts`} change="updated" />
      <CodeFile path={`${P}/src/app.test.ts`} change="updated" />
      <CodeFile path={`${P}/src/auth/auth.test.ts`} change="new" />
      <Terminal>{`npm test`}</Terminal>
      <Output>{`
…
ℹ tests 57
ℹ pass 57
ℹ fail 0`}</Output>

      <Step n={14}>Use it</Step>
      <Terminal title="Terminal 1">{`npm run dev`}</Terminal>
      <Terminal title="Terminal 2">{`
curl -X POST localhost:4000/auth/signup -H 'content-type: application/json' \\
  -d '{"email":"ada@example.com","password":"correct horse battery staple"}'
TOKEN=<paste the token from the response>
curl -i localhost:4000/tasks
curl -X POST localhost:4000/tasks -H "authorization: Bearer $TOKEN" \\
  -H 'content-type: application/json' -d '{"title":"Ship chapter 15"}'
curl localhost:4000/auth/me -H "authorization: Bearer $TOKEN"`}</Terminal>
      <Output>{`
{"user":{"id":"bdb69b6d-81c1-450e-b5fd-aadda02f30f5","email":"ada@example.com","createdAt":"2026-10-12T07:18:59.096Z"},"token":"eyJhbGciOiJIUzI1NiJ9.eyJzdWIi…"}

HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer
…
{"error":{"code":"unauthorized","message":"Authentication required"}}

{"id":"2372eda4-aca2-4c60-8f7c-3dc03ac81961","userId":"bdb69b6d-81c1-450e-b5fd-aadda02f30f5","title":"Ship chapter 15","done":false,"priority":"medium","dueDate":null,"createdAt":"2026-10-12T07:18:59.173Z"}

{"id":"bdb69b6d-81c1-450e-b5fd-aadda02f30f5","email":"ada@example.com","createdAt":"2026-10-12T07:18:59.096Z"}`}</Output>
      <div className="prose">
        <p>Now sign up as Bob, and ask for Ada's task with Bob's token:</p>
      </div>
      <Output>{`
{"error":{"code":"not_found","message":"Task not found"}}
{"items":[],"total":0,"limit":20,"offset":0}`}</Output>
      <div className="prose">
        <p>Look at what the database holds. Only hashes, each with its own salt:</p>
      </div>
      <Terminal>{`sqlite3 data/tasks.db 'PRAGMA user_version;' "SELECT email, substr(password_hash, 1, 40) || '…' FROM users;"`}</Terminal>
      <Output>{`
2
ada@example.com|scrypt$32768$8$1$O_AF-aff6KPMnYWNYmaptw$…
bob@example.com|scrypt$32768$8$1$31fKEPbtbr3SLzYjnrLcaw$…`}</Output>

      <Box kind="try" label="Try it: attack your own API">
        <ol>
          <li>
            <p>Guess Ada's password six times in a row:</p>
            <Output>{`
{"error":{"code":"unauthorized","message":"Email or password is incorrect"}} 401
… (four more 401s)
{"error":{"code":"too_many_requests","message":"Too many attempts, try again later"}} 429

HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 5
RateLimit-Remaining: 0
Retry-After: 900`}</Output>
            <p>
              The server log shows each failed login took about 42 ms (the scrypt cost), and the blocked ones 0.4 ms.
              Restart the server to reset the counter.
            </p>
          </li>
          <li>
            <p>
              Change the last character of your token and call <code>/tasks</code>: <code>{'{"error":{"code":"unauthorized","message":"Invalid token"}}'}</code>.
              Then decode the payload yourself to see that anyone can read it:
            </p>
            <Terminal>{`echo $TOKEN | cut -d. -f2 | node -e "process.stdin.on('data', d => console.log(Buffer.from(String(d).trim(), 'base64url').toString()))"`}</Terminal>
          </li>
          <li>
            <p>Run <code>curl -i localhost:4000/health</code> and read the headers helmet added. Then try a weak password and a duplicate email on <code>/auth/signup</code>:</p>
            <Output>{`
{"error":{"code":"validation_failed","message":"The request is not valid","details":[{"path":"password","message":"Use at least 12 characters"}]}}
{"error":{"code":"conflict","message":"An account with this email already exists"}}`}</Output>
          </li>
        </ol>
      </Box>

      <h2>CORS, briefly</h2>
      <div className="prose">
        <p>
          Browsers apply the <strong>same-origin policy</strong>: JavaScript on <code>http://localhost:5173</code> may
          send a request to <code>http://localhost:4000</code>, but may not read the response unless the API says it is
          allowed, with an <code>Access-Control-Allow-Origin</code> header. For requests with an{' '}
          <code>Authorization</code> header or a JSON body, the browser first sends a <strong>preflight</strong>{' '}
          <code>OPTIONS</code> request to ask permission. CORS (Cross-Origin Resource Sharing) is how the server answers.
        </p>
        <p>
          Two things surprise people. CORS only matters to browsers: curl, mobile apps and other servers ignore it. And it
          is not access control: a disallowed origin still gets a response; the browser just hides it from the page. Your
          authentication protects the data; CORS only decides which websites' scripts may read it. The first exercise adds
          it, configured per environment.
        </p>
      </div>

      <h2>A security checklist</h2>
      <TableWrap>
        <thead>
          <tr><th>Risk (OWASP Top 10 style)</th><th>What this API does</th></tr>
        </thead>
        <tbody>
          <tr><td>Broken access control</td><td>Every query is scoped by owner; others' tasks are 404; contract tests check it</td></tr>
          <tr><td>Cryptographic failures</td><td>scrypt with per-user salts; constant-time comparison; HS256 with a 32-byte random secret; HTTPS expected in front (HSTS header)</td></tr>
          <tr><td>Injection</td><td>Parameters in every SQL statement; strict Zod schemas at every entry point</td></tr>
          <tr><td>Insecure design</td><td>Rules live in the service; secrets have no defaults; config fails fast</td></tr>
          <tr><td>Security misconfiguration</td><td>helmet headers; no <code>X-Powered-By</code>; no stack traces in responses</td></tr>
          <tr><td>Vulnerable components</td><td>Few dependencies; run <code>npm audit</code> and update regularly (chapter 19 automates it)</td></tr>
          <tr><td>Identification and authentication failures</td><td>Length-based password rule; uniform login errors and timing; rate-limited login; expiring tokens</td></tr>
          <tr><td>Logging and monitoring failures</td><td>Structured logs with request ids; failed logins visible as 401 warnings; secrets redacted</td></tr>
          <tr><td>Server-side request forgery</td><td>The API never fetches URLs supplied by users</td></tr>
        </tbody>
      </TableWrap>

      <Exercises
        items={[
          {
            task: <>Allow a frontend at <code>http://localhost:5173</code> to call the API from a browser, using the <code>cors</code> package and a <code>CORS_ORIGINS</code> setting (comma-separated, empty by default, each entry must be a URL).</>,
            hint: <>Install <code>cors</code> and <code>@types/cors</code>. In the config schema, <code>.transform()</code> the string into an array and <code>.pipe(z.array(z.url()))</code>. Register <code>cors(...)</code> before the routers, so preflight requests are answered before <code>requireAuth</code> can reject them.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/config.ts`} />
                <CodeFile path={`${X}/src/app.ts`} />
                <Output caption="A preflight from the allowed origin, and a request from another one">{`
$ curl -i -X OPTIONS localhost:4000/tasks -H 'Origin: http://localhost:5173' \\
    -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: authorization,content-type'
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: http://localhost:5173
Vary: Origin, Access-Control-Request-Headers
Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE
Access-Control-Allow-Headers: authorization,content-type

$ curl -i localhost:4000/health -H 'Origin: https://evil.example'
HTTP/1.1 200 OK
(no Access-Control-Allow-Origin header: a browser would hide this response)`}</Output>
              </>
            ),
          },
          {
            task: <>Add <code>POST /auth/password</code> with <code>{'{ currentPassword, newPassword }'}</code>. It requires a token, answers 401 if the current password is wrong, and 204 on success. Prove with a test that the old password stops working.</>,
            hint: <>Add <code>updatePasswordHash(id, hash)</code> to <code>UserRepository</code> and both implementations, a <code>changePassword</code> method to <code>AuthService</code> that reuses <code>verifyPassword</code> and <code>hashPassword</code>, and a route behind <code>requireAuth(tokens)</code>. Think about what happens to tokens issued before the change.</>,
            solution: (
              <>
                <CodeFile path={`${X}/src/auth/service.ts`} />
                <CodeFile path={`${X}/src/auth/routes.ts`} />
                <CodeFile path={`${X}/src/users/sqlite-repository.ts`} />
                <CodeFile path={`${X}/src/auth/auth.test.ts`} />
                <p>Existing tokens keep working until they expire. Ending them immediately needs state: for example a <code>token_version</code> column copied into each token and compared on every request.</p>
              </>
            ),
          },
        ]}
      />

      <Checkpoint question="Why does logIn spend 44 ms hashing a password even when the email does not belong to any account?">
        <p>
          So that every failed login looks the same from outside. If unknown emails failed instantly while known ones
          took 44 ms, an attacker could time responses to build a list of registered emails, then target those accounts
          with password guesses or phishing. Verifying against a dummy hash makes both paths cost the same, and the
          identical error message closes the other half of the leak.
        </p>
      </Checkpoint>
      <Checkpoint question="An attacker copies your users table. With these hashes, why can they not simply look the passwords up, and what is still at risk?">
        <p>
          Each hash has its own random salt, so precomputed tables do not apply and identical passwords produce
          different hashes; every guess must be computed separately for each user, at 44 ms and 32 MiB per guess. Users
          with very common or short passwords can still be cracked eventually, which is why the sign-up rule demands
          length, and why a breach should still trigger password resets.
        </p>
      </Checkpoint>

      <Recap>
        <ul>
          <li>Authentication says who; authorisation says what they may do. Enforce authorisation in the data layer, in every query.</li>
          <li>Store passwords with a slow, salted password hash (scrypt, Argon2id, bcrypt) and compare with <code>timingSafeEqual</code>.</li>
          <li>A JWT is signed, not encrypted. Pin the algorithm, use a long random secret from config, and keep lifetimes short.</li>
          <li>Return 404 for other users' resources; give identical errors and timing for every failed login.</li>
          <li>helmet adds protective headers; rate limits slow guessing, but in-memory counters do not span instances.</li>
          <li>CORS tells browsers which origins may read responses; it is not a substitute for authentication.</li>
        </ul>
      </Recap>
    </>
  );
}
